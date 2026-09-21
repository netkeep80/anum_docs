import {
  MemoryError,
  verifyRootBasis,
  type LinkHandle,
  type RootBasis,
  type WriteMemory,
} from "./memory.js";
import type { SourceFrontEndEvidence } from "./source.js";
import {
  readV012SourceContent,
  replayV012SourceResultEvidence,
  type V012SourceAuthority,
  type V012SourceResultEvidence,
} from "./v012-source.js";
import {
  V013HierarchicalCarrierError,
  decomposeV013SemanticLink,
  type V013StructuralAspect,
} from "./v013-hierarchical-carrier.js";

export type V013FormalAspectEvaluationErrorCode =
  | "invalid-basis"
  | "source-evidence-mismatch"
  | "operator-count-mismatch"
  | "operator-order-mismatch"
  | "operator-meaning-mismatch"
  | "noncanonical-spelling"
  | "malformed-prefix"
  | "trailing-source"
  | "noncanonical-pair-alias";

export class V013FormalAspectEvaluationError extends Error {
  override readonly name = "V013FormalAspectEvaluationError";

  constructor(readonly code: V013FormalAspectEvaluationErrorCode) {
    super(code);
  }
}

export interface V013FormalAspectProgramEvidence {
  readonly source: SourceFrontEndEvidence;
  /** One fixed-Theory meaning replay for every exact source segment. */
  readonly operators: readonly V012SourceResultEvidence[];
}

type Plan =
  | Readonly<{ kind: "ROOT" }>
  | Readonly<{ kind: "START"; child: Plan }>
  | Readonly<{ kind: "END"; child: Plan }>
  | Readonly<{ kind: "PAIR"; left: Plan; right: Plan }>;

function fail(code: V013FormalAspectEvaluationErrorCode): never {
  throw new V013FormalAspectEvaluationError(code);
}

function sameSourceBoundary(
  left: SourceFrontEndEvidence,
  right: SourceFrontEndEvidence,
): boolean {
  if (
    left.basis.R !== right.basis.R ||
    left.basis.O !== right.basis.O ||
    left.basis.C !== right.basis.C ||
    left.basis.L !== right.basis.L ||
    left.basis.U !== right.basis.U ||
    left.content !== right.content ||
    left.source !== right.source ||
    left.dictionary !== right.dictionary ||
    left.grammar !== right.grammar ||
    left.theory !== right.theory ||
    left.selectionSequence !== right.selectionSequence ||
    left.formSequence !== right.formSequence ||
    left.grammarMembership !== right.grammarMembership ||
    left.theoryMembership !== right.theoryMembership ||
    left.segments.length !== right.segments.length
  ) {
    return false;
  }

  return left.segments.every((segment, index) => {
    const other = right.segments[index];
    return other !== undefined &&
      segment.start === other.start &&
      segment.end === other.end &&
      segment.form === other.form &&
      segment.dictionaryOccurrence === other.dictionaryOccurrence &&
      segment.sliceContent === other.sliceContent &&
      segment.span === other.span &&
      segment.sliceEvidence === other.sliceEvidence &&
      segment.lexeme === other.lexeme &&
      segment.resolution === other.resolution &&
      segment.selection === other.selection;
  });
}

function canonicalByte(aspect: V013StructuralAspect): number {
  switch (aspect) {
    case "ROOT": return 0x38;
    case "START": return 0x39;
    case "END": return 0x36;
    case "PAIR": return 0x31;
  }
}

function operatorAspect(
  memory: WriteMemory,
  basis: RootBasis,
  evidence: V012SourceResultEvidence,
  expectedSourceAuthority: V012SourceAuthority,
  expectedTheoryArtifact: unknown,
): V013StructuralAspect {
  const replay = replayV012SourceResultEvidence(
    memory,
    basis,
    evidence,
    expectedSourceAuthority,
    expectedTheoryArtifact,
  );

  try {
    const owner = memory.poles(replay.structural.claimedBody);
    if (owner.start !== replay.selectedUse) return fail("operator-meaning-mismatch");

    const grounded = memory.poles(owner.end);
    if (grounded.start !== replay.selectedUse) return fail("operator-meaning-mismatch");

    const tag = grounded.end;
    const decomposition = decomposeV013SemanticLink(memory, basis, tag);

    // Only the four root representatives R/O/C/L may denote the four
    // operators. An arbitrary Link of the same local class is not a fifth sign.
    if (decomposition.sign !== tag) return fail("operator-meaning-mismatch");
    return decomposition.aspect;
  } catch (error) {
    if (error instanceof V013FormalAspectEvaluationError) throw error;
    if (
      error instanceof MemoryError ||
      error instanceof V013HierarchicalCarrierError
    ) {
      return fail("operator-meaning-mismatch");
    }
    throw error;
  }
}

function parsePlan(
  aspects: readonly V013StructuralAspect[],
  offset: number,
): readonly [Plan, number] {
  const kind = aspects[offset];
  if (kind === undefined) return fail("malformed-prefix");

  if (kind === "ROOT") {
    return Object.freeze([Object.freeze({ kind: "ROOT" }), offset + 1]);
  }

  if (kind === "START" || kind === "END") {
    const [child, next] = parsePlan(aspects, offset + 1);
    return Object.freeze([
      Object.freeze({ kind, child }) as Plan,
      next,
    ]);
  }

  const [left, afterLeft] = parsePlan(aspects, offset + 1);
  const [right, afterRight] = parsePlan(aspects, afterLeft);
  return Object.freeze([
    Object.freeze({ kind: "PAIR", left, right }),
    afterRight,
  ]);
}

function samePlan(left: Plan, right: Plan): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === "ROOT" && right.kind === "ROOT") return true;
  if (left.kind === "START" && right.kind === "START") {
    return samePlan(left.child, right.child);
  }
  if (left.kind === "END" && right.kind === "END") {
    return samePlan(left.child, right.child);
  }
  if (left.kind === "PAIR" && right.kind === "PAIR") {
    return samePlan(left.left, right.left) && samePlan(left.right, right.right);
  }
  return false;
}

/**
 * Reject PAIR spellings that would canonicalize to another aspect.
 *
 * This preflight is deliberately completed before any semantic write. For a
 * canonical child plan, Pair(A,B) can collapse to an operand only when:
 *
 *   A=B=ROOT, A=START(B), or B=END(A).
 */
function verifyCanonicalPlan(plan: Plan): void {
  if (plan.kind === "ROOT") return;
  if (plan.kind === "START" || plan.kind === "END") {
    verifyCanonicalPlan(plan.child);
    return;
  }

  verifyCanonicalPlan(plan.left);
  verifyCanonicalPlan(plan.right);

  const rootAlias =
    plan.left.kind === "ROOT" && plan.right.kind === "ROOT";
  const startAlias =
    plan.left.kind === "START" && samePlan(plan.left.child, plan.right);
  const endAlias =
    plan.right.kind === "END" && samePlan(plan.right.child, plan.left);

  if (rootAlias || startAlias || endAlias) {
    return fail("noncanonical-pair-alias");
  }
}

function materializePlan(
  memory: WriteMemory,
  basis: RootBasis,
  plan: Plan,
): LinkHandle {
  if (plan.kind === "ROOT") return basis.R;
  if (plan.kind === "START") {
    return memory.ensureStartSelfClosed(materializePlan(memory, basis, plan.child));
  }
  if (plan.kind === "END") {
    return memory.ensureEndSelfClosed(materializePlan(memory, basis, plan.child));
  }
  return memory.ensure(
    materializePlan(memory, basis, plan.left),
    materializePlan(memory, basis, plan.right),
  );
}

/**
 * Generic v0.13 FORMAL evaluator for the root-aspect prefix grammar.
 *
 * Semantic meaning is obtained first from exact source -> Dictionary ->
 * Grammar -> fixed Theory -> admitted StructuralRule replay. Physical bytes
 * are checked only afterwards as canonical spellings of the already-grounded
 * aspect; they never select ROOT/START/END/PAIR.
 *
 * The whole source is replayed, parsed and canonicality-checked before the
 * first semantic target write. Therefore failed authority, malformed prefix
 * and noncanonical PAIR aliases cannot leave partially materialized targets.
 */
export function evaluateV013FormalAspectProgram(
  memory: WriteMemory,
  basis: RootBasis,
  program: V013FormalAspectProgramEvidence,
  expectedSourceAuthority: V012SourceAuthority,
  expectedTheoryArtifact: unknown,
): LinkHandle {
  let verified: RootBasis;
  try {
    verified = verifyRootBasis(memory, basis);
  } catch {
    return fail("invalid-basis");
  }

  if (program.operators.length !== program.source.segments.length) {
    return fail("operator-count-mismatch");
  }
  if (program.operators.length === 0) return fail("malformed-prefix");

  const content = readV012SourceContent(memory, verified, program.source.content);
  const aspects: V013StructuralAspect[] = [];

  for (let index = 0; index < program.operators.length; index += 1) {
    const evidence = program.operators[index];
    const segment = program.source.segments[index];
    if (evidence === undefined || segment === undefined) {
      return fail("operator-count-mismatch");
    }
    if (!sameSourceBoundary(evidence.source, program.source)) {
      return fail("source-evidence-mismatch");
    }
    if (evidence.sourceUseIndex !== index) {
      return fail("operator-order-mismatch");
    }

    const aspect = operatorAspect(
      memory,
      verified,
      evidence,
      expectedSourceAuthority,
      expectedTheoryArtifact,
    );

    // Canonical spelling is a post-meaning representation constraint. It
    // cannot grant operator authority because the aspect is already fixed by
    // the Rule replay above.
    if (
      segment.end !== segment.start + 1 ||
      content.bytes[segment.start] !== canonicalByte(aspect)
    ) {
      return fail("noncanonical-spelling");
    }
    aspects.push(aspect);
  }

  const [plan, next] = parsePlan(Object.freeze(aspects), 0);
  if (next !== aspects.length) return fail("trailing-source");
  verifyCanonicalPlan(plan);

  return materializePlan(memory, verified, plan);
}
