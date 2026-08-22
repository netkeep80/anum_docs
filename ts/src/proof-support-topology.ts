import {
  CanonicalTopologyError,
  exportCanonicalTopology,
} from "./canonical-topology.js";
import type { StructuralDerivationEvidence } from "./derivation.js";
import {
  MemoryError,
  type EnumerableReadMemory,
  type LinkHandle,
  type LinkPoles,
  type ReadMemory,
} from "./memory.js";
import type { StorageTopologyImage } from "./persistence-topology.js";

export interface StructuralDerivationSupportTopologyExport {
  readonly topology: StorageTopologyImage;
  readonly coordinates: ReadonlyMap<LinkHandle, number>;
  /** Support Links ordered by canonical coordinate, never source allocation order. */
  readonly links: readonly LinkHandle[];
}

export class StructuralDerivationSupportTopologyError extends Error {
  override readonly name = "StructuralDerivationSupportTopologyError";
}

function explicitEvidenceHandles(
  evidence: StructuralDerivationEvidence,
): readonly LinkHandle[] {
  const result: LinkHandle[] = [evidence.theory, evidence.targetOccurrence];
  for (const node of evidence.nodes) {
    const application = node.judgment.application;
    result.push(
      node.occurrence,
      application.act,
      application.rule,
      application.ruleAdmission,
      application.claimedBody,
      application.expectedInterpreter.dictionary,
      application.expectedInterpreter.grammar,
      application.expectedInterpreter.theory,
      application.expectedAfterContext,
      node.judgment.judgment.theory,
      node.judgment.judgment.context,
      node.judgment.judgment.claim,
      node.derivationRule,
      node.derivationRuleAdmission,
      node.premiseOccurrenceSequence,
    );
  }
  return result;
}

class ReplaySupportView implements EnumerableReadMemory {
  readonly root: LinkHandle;
  private readonly support: ReadonlySet<LinkHandle>;
  private readonly ordered: readonly LinkHandle[];

  constructor(
    private readonly source: ReadMemory,
    links: ReadonlySet<LinkHandle>,
  ) {
    this.root = source.root;
    this.support = links;
    this.ordered = Object.freeze([...links]);
  }

  get linkCount(): number {
    return this.ordered.length;
  }

  private require(link: LinkHandle): void {
    if (!this.support.has(link)) {
      throw new MemoryError("Link is outside structural derivation replay support");
    }
  }

  poles(link: LinkHandle): LinkPoles {
    this.require(link);
    const poles = this.source.poles(link);
    if (!this.support.has(poles.start) || !this.support.has(poles.end)) {
      throw new MemoryError("structural derivation replay support is not pole-closed");
    }
    return poles;
  }

  find(start: LinkHandle, end: LinkHandle): LinkHandle | undefined {
    this.require(start);
    this.require(end);
    const found = this.source.find(start, end);
    return found !== undefined && this.support.has(found) ? found : undefined;
  }

  outgoing(start: LinkHandle): readonly LinkHandle[] {
    this.require(start);
    return Object.freeze(this.source.outgoing(start).filter((link) => this.support.has(link)));
  }

  incoming(end: LinkHandle): readonly LinkHandle[] {
    this.require(end);
    return Object.freeze(this.source.incoming(end).filter((link) => this.support.has(link)));
  }

  allLinks(): readonly LinkHandle[] {
    return this.ordered;
  }
}

function collectReplaySupport(
  memory: ReadMemory,
  evidence: StructuralDerivationEvidence,
): ReadonlySet<LinkHandle> {
  const support = new Set<LinkHandle>();
  const pending: LinkHandle[] = [];

  const include = (link: LinkHandle): void => {
    if (support.has(link)) return;
    // Validate owner/existence before the Link can enter builder bookkeeping.
    memory.poles(link);
    support.add(link);
    pending.push(link);
  };

  const closePoles = (): void => {
    while (pending.length > 0) {
      const link = pending.pop();
      if (link === undefined) continue;
      const poles = memory.poles(link);
      include(poles.start);
      include(poles.end);
    }
  };

  include(memory.root);
  for (const link of explicitEvidenceHandles(evidence)) include(link);
  closePoles();

  // Base derivation replay globally enumerates exactly these namespaces through
  // readExactActBindings(memory, act, ...). Preserve the complete outgoing set:
  // unexpected/duplicate attachments are negative evidence and must not vanish.
  const acts = new Set(evidence.nodes.map((node) => node.judgment.application.act));
  for (const act of acts) {
    include(act);
    for (const attachment of memory.outgoing(act)) include(attachment);
  }
  closePoles();

  return support;
}

/**
 * Canonicalizes only the graph surface observed by base StructuralDerivation
 * replay. This is transport-support construction, not proof validation or truth.
 */
export function exportStructuralDerivationSupportTopology(
  memory: ReadMemory,
  evidence: StructuralDerivationEvidence,
): StructuralDerivationSupportTopologyExport {
  const before = memory.linkCount;
  try {
    const support = collectReplaySupport(memory, evidence);
    const view = new ReplaySupportView(memory, support);
    const canonical = exportCanonicalTopology(view);
    const links = Object.freeze(
      [...canonical.coordinates.entries()]
        .sort((left, right) => left[1] - right[1])
        .map(([link]) => link),
    );

    if (links.length !== support.size || canonical.coordinates.size !== support.size) {
      throw new StructuralDerivationSupportTopologyError("support topology cardinality mismatch");
    }
    if (memory.linkCount !== before) {
      throw new StructuralDerivationSupportTopologyError("support topology export mutated Memory");
    }

    return Object.freeze({
      topology: canonical.topology,
      coordinates: canonical.coordinates,
      links,
    });
  } catch (error) {
    if (error instanceof StructuralDerivationSupportTopologyError) throw error;
    if (error instanceof MemoryError || error instanceof CanonicalTopologyError) {
      throw new StructuralDerivationSupportTopologyError("invalid structural derivation replay support");
    }
    throw error;
  } finally {
    if (memory.linkCount !== before) {
      throw new StructuralDerivationSupportTopologyError("support topology export mutated Memory");
    }
  }
}
