import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { exportCanonicalTopology } from "../src/canonical-topology.js";
import {
  DictionaryError,
  defineDictionaryEffect,
  defineDictionaryScope,
  lookupScopedDictionary,
} from "../src/dictionary.js";
import {
  Memory,
  ensureRootBasis,
  type EnumerableReadMemory,
  type LinkHandle,
  type LinkPoles,
  type ReadMemory,
} from "../src/memory.js";
import {
  restoreTopology,
  type StorageTopologyImage,
} from "../src/persistence-topology.js";
import { materializeV012SourceContent } from "../src/v012-source.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.13 FORMAL F2b: ${message}`);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: values differ`);
}

function exactJson(actual: unknown, expected: unknown, message: string): void {
  same(JSON.stringify(actual), JSON.stringify(expected), message);
}

function bytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

interface PortableNameAuthority {
  readonly schema: "mts-v013-formal-name-authority/research-v0.1";
  readonly topology: StorageTopologyImage;
  readonly dictionaryCoordinate: number;
}

class SupportView implements EnumerableReadMemory {
  readonly root: LinkHandle;
  private readonly support: ReadonlySet<LinkHandle>;
  private readonly ordered: readonly LinkHandle[];

  constructor(
    private readonly source: ReadMemory,
    support: ReadonlySet<LinkHandle>,
  ) {
    this.root = source.root;
    this.support = support;
    this.ordered = Object.freeze([...support]);
  }

  get linkCount(): number {
    return this.ordered.length;
  }

  private require(link: LinkHandle): void {
    assert(this.support.has(link), "portable name authority access stays inside selected support");
  }

  poles(link: LinkHandle): LinkPoles {
    this.require(link);
    const poles = this.source.poles(link);
    assert(
      this.support.has(poles.start) && this.support.has(poles.end),
      "portable name authority support is pole-closed",
    );
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

function poleClosure(memory: ReadMemory, roots: readonly LinkHandle[]): ReadonlySet<LinkHandle> {
  const support = new Set<LinkHandle>();
  const pending = [memory.root, ...roots];
  while (pending.length > 0) {
    const link = pending.pop();
    if (link === undefined || support.has(link)) continue;
    const poles = memory.poles(link);
    support.add(link);
    pending.push(poles.start, poles.end);
  }
  return support;
}

function exportNameAuthority(
  memory: Memory,
  dictionary: LinkHandle,
): PortableNameAuthority {
  const support = poleClosure(memory, [dictionary]);
  const canonical = exportCanonicalTopology(new SupportView(memory, support));
  const dictionaryCoordinate = canonical.coordinates.get(dictionary);
  assert(dictionaryCoordinate !== undefined, "selected Dictionary has portable coordinate");
  return Object.freeze({
    schema: "mts-v013-formal-name-authority/research-v0.1" as const,
    topology: canonical.topology,
    dictionaryCoordinate,
  });
}

function replayNameAuthority(
  artifact: PortableNameAuthority,
): { readonly memory: Memory; readonly dictionary: LinkHandle } {
  same(
    artifact.schema,
    "mts-v013-formal-name-authority/research-v0.1",
    "portable name authority schema",
  );
  const memory = restoreTopology(artifact.topology);
  const dictionary = memory.allLinks()[artifact.dictionaryCoordinate];
  assert(dictionary !== undefined, "portable Dictionary coordinate resolves");

  const canonical = exportCanonicalTopology(memory);
  exactJson(canonical.topology, artifact.topology, "portable name authority canonical replay");
  same(
    canonical.coordinates.get(dictionary),
    artifact.dictionaryCoordinate,
    "portable Dictionary coordinate remains canonical",
  );
  return Object.freeze({ memory, dictionary });
}

interface AuthorityFixture {
  readonly memory: Memory;
  readonly dictionary: LinkHandle;
  readonly use: LinkHandle;
  readonly artifact: PortableNameAuthority;
}

type FixtureMode = "exact" | "conflict";

function buildAuthority(noise: boolean, mode: FixtureMode = "exact"): AuthorityFixture {
  const memory = new Memory();
  const basis = ensureRootBasis(memory);

  if (noise) {
    const n0 = memory.ensure(basis.C, basis.U);
    const n1 = memory.ensureEndSelfClosed(n0);
    memory.ensure(basis.L, n1);
  }

  const use = memory.ensure(basis.U, basis.L);
  const alternateUse = memory.ensure(basis.L, basis.U);
  const initial = defineDictionaryScope(memory, memory.root, memory.root);

  const xContent = materializeV012SourceContent(memory, basis, bytes("x"));
  const first = defineDictionaryEffect(
    memory,
    initial,
    memory.root,
    memory.root,
    xContent,
    use,
  );

  let dictionary = first.afterScope;
  let history = first.historyAfter;

  if (mode === "conflict") {
    const conflict = defineDictionaryEffect(
      memory,
      dictionary,
      memory.root,
      history,
      xContent,
      alternateUse,
    );
    dictionary = conflict.afterScope;
  } else {
    const aliasContent = materializeV012SourceContent(memory, basis, bytes("dup"));
    const alias = defineDictionaryEffect(
      memory,
      dictionary,
      memory.root,
      history,
      aliasContent,
      use,
    );
    dictionary = alias.afterScope;
    history = alias.historyAfter;
    assert(history !== memory.root, "alias history is materialized");
  }

  return Object.freeze({
    memory,
    dictionary,
    use,
    artifact: exportNameAuthority(memory, dictionary),
  });
}

/**
 * Generic physical-name resolver.
 *
 * There is no glyph/name table here. Exact source bytes create/reuse their
 * canonical STRING carrier; the selected frozen Dictionary topology decides
 * whether that carrier has a semantic Use.
 */
function resolvePhysicalName(
  memory: Memory,
  dictionary: LinkHandle,
  physicalName: string,
): LinkHandle | undefined {
  const basis = ensureRootBasis(memory);
  const content = materializeV012SourceContent(memory, basis, bytes(physicalName));
  return lookupScopedDictionary(memory, dictionary, content)?.form;
}

function executeCorpus(artifact: PortableNameAuthority): void {
  const replay = replayNameAuthority(artifact);
  const { memory, dictionary } = replay;

  const beforeKnown = memory.linkCount;
  const x = resolvePhysicalName(memory, dictionary, "x");
  same(memory.linkCount, beforeKnown, "known x carrier already belongs to frozen authority");
  assert(x !== undefined, "x resolves");

  const beforeAlias = memory.linkCount;
  const alias = resolvePhysicalName(memory, dictionary, "dup");
  same(memory.linkCount, beforeAlias, "known alias carrier already belongs to frozen authority");
  same(alias, x, "two physical names resolve to one exact semantic Use");

  // Unknown physical carrier may be constructed, but the frozen Dictionary
  // grants it no semantic Use.
  const unknown = resolvePhysicalName(memory, dictionary, "unknown");
  same(unknown, undefined, "unknown physical name has no semantic authority");

  // A later child scope can deliberately shadow the name for that child, but
  // cannot mutate the already selected frozen parent Dictionary.
  const basis = ensureRootBasis(memory);
  const alternativeUse = memory.ensure(basis.C, basis.L);
  const childInitial = defineDictionaryScope(memory, dictionary, memory.root);
  const xContent = materializeV012SourceContent(memory, basis, bytes("x"));
  const child = defineDictionaryEffect(
    memory,
    childInitial,
    dictionary,
    memory.root,
    xContent,
    alternativeUse,
  );

  same(
    resolvePhysicalName(memory, dictionary, "x"),
    x,
    "frozen parent Dictionary remains unchanged after child-scope definition",
  );
  same(
    resolvePhysicalName(memory, child.afterScope, "x"),
    alternativeUse,
    "child scope may select its own local semantic Use",
  );
}

function main(): void {
  const a = buildAuthority(false);
  const b = buildAuthority(true);
  assert(a.dictionary !== b.dictionary, "source Memories use unrelated local Dictionary handles");
  exactJson(a.artifact, b.artifact, "portable name authority ignores unrelated local noise");

  // Same portable authority works in two independent replay Memories.
  executeCorpus(a.artifact);
  executeCorpus(b.artifact);

  // Same exact local name mapped to two different Uses fails closed.
  {
    const replay = replayNameAuthority(buildAuthority(false, "conflict").artifact);
    let rejected = false;
    try {
      resolvePhysicalName(replay.memory, replay.dictionary, "x");
    } catch (error) {
      assert(error instanceof DictionaryError, "conflicting name uses DictionaryError");
      same(error.code, "local-form-conflict", "conflicting local definitions fail closed");
      rejected = true;
    }
    assert(rejected, "conflicting local name authority is rejected");
  }

  // Anti-special-case guard: the resolver itself contains no physical-name or
  // canonical spelling branch.
  {
    const repoRoot = resolve(process.cwd(), "..");
    const source = readFileSync(
      join(repoRoot, "ts/test/research-v013-formal-portable-name-authority-f2b.test.ts"),
      "utf8",
    );
    const start = source.indexOf("function resolvePhysicalName(");
    const end = source.indexOf("\nfunction executeCorpus(", start);
    assert(start >= 0 && end > start, "generic name resolver source slice exists");
    const resolver = source.slice(start, end);
    for (const forbidden of [
      "\"x\"",
      "\"dup\"",
      "canonicalByte",
      "switch",
      "ROOT",
      "START",
      "END",
      "PAIR",
    ]) {
      assert(!resolver.includes(forbidden), `generic resolver has no name-specific authority: ${forbidden}`);
    }
  }

  console.log([
    "MTS v0.13 FORMAL F2b:",
    "PORTABLE_NAME_AUTHORITY=GREEN_SCOPED_RESEARCH",
    "ALIASES=2_TO_1_USE",
    "INDEPENDENT_MEMORIES=2",
    "HOST_NAME_SPECIFIC_BRANCHES=0",
    "NEGATIVE_CONTROLS=3",
    "CANONICAL_BYTE_SWITCH=NOT_USED",
    "DICTIONARY_LOOKUP_HOST_RESIDUAL=OPEN",
    "END_TO_END_F2_INTEGRATION=OPEN",
    "PRODUCTION_UNCHANGED",
    "FULL_SELF_HOSTED=NOT_CLAIMED",
  ].join(" "));
}

main();
