// mts-version-evidence: candidate-from=0.14

import {
  decomposeV013SemanticLink,
} from "../src/v013-hierarchical-carrier.js";
import {
  defineV013GroundedExecutionScope,
  readV013GroundedExecutionScope,
} from "../src/v013-grounded-execution.js";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
  type LinkPoles,
  type RootBasis,
} from "../src/memory.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error("v0.14 R1 immutable Link/chiral rewrite: " + message);
  }
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: values differ`);
}

function sameMembers(
  actual: readonly LinkHandle[],
  expected: readonly LinkHandle[],
  message: string,
): void {
  same(actual.length, expected.length, message + " length");
  for (const value of expected) {
    assert(actual.includes(value), message + " missing member");
  }
}

function invertLink(
  memory: Memory,
  basis: RootBasis,
  source: LinkHandle,
  memo = new Map<LinkHandle, LinkHandle>(),
): LinkHandle {
  const known = memo.get(source);
  if (known !== undefined) return known;

  const d = decomposeV013SemanticLink(memory, basis, source);
  let result: LinkHandle;

  if (d.aspect === "ROOT") {
    result = basis.R;
  } else if (d.aspect === "START") {
    result = memory.ensureEndSelfClosed(
      invertLink(memory, basis, d.children[0]!, memo),
    );
  } else if (d.aspect === "END") {
    result = memory.ensureStartSelfClosed(
      invertLink(memory, basis, d.children[0]!, memo),
    );
  } else {
    const left = invertLink(memory, basis, d.children[0]!, memo);
    const right = invertLink(memory, basis, d.children[1]!, memo);
    result = memory.ensure(right, left);
  }

  memo.set(source, result);
  return result;
}

function poleSupport(
  memory: Memory,
  roots: readonly LinkHandle[],
): ReadonlySet<LinkHandle> {
  const support = new Set<LinkHandle>();
  const pending = [...roots];

  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined || support.has(current)) continue;
    support.add(current);
    const poles = memory.poles(current);
    pending.push(poles.start, poles.end);
  }

  return support;
}

type Frame = "DIRECT" | "MIRROR";

function deriveFrame(
  selected: readonly LinkHandle[],
  inR: LinkHandle,
  outR: LinkHandle,
): Frame | "UNRESOLVED" {
  const unique = [...new Set(selected)];
  if (unique.length !== 1) return "UNRESOLVED";
  if (unique[0] === inR) return "DIRECT";
  if (unique[0] === outR) return "MIRROR";
  return "UNRESOLVED";
}

function semanticPoles(
  memory: Memory,
  frame: Frame,
  link: LinkHandle,
): LinkPoles {
  const technical = memory.poles(link);
  return frame === "DIRECT"
    ? technical
    : Object.freeze({
        start: technical.end,
        end: technical.start,
      });
}

function sameSemanticSource(
  memory: Memory,
  frame: Frame,
  left: LinkHandle,
  right: LinkHandle,
): boolean {
  return (
    semanticPoles(memory, frame, left).start ===
    semanticPoles(memory, frame, right).start
  );
}

function main(): void {
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  const { R, O, C, L, U } = basis;

  // -----------------------------------------------------------------------
  // R1 — exact structural identity makes semantic in-place pole mutation
  // impossible without introducing a second temporal/instance identity.
  // -----------------------------------------------------------------------

  const a = memory.ensure(U, L);
  const b = memory.ensure(L, C);
  const e = memory.ensure(O, U);
  const c = memory.ensure(C, L);
  const d = memory.ensure(L, O);

  assert(b !== e, "rewrite targets b/e must be distinct");

  const X = memory.ensure(a, b);
  const Y = memory.ensure(a, e);

  assert(X !== Y, "changing end pole produces a different semantic Link");
  same(memory.poles(X).start, a, "X start remains a");
  same(memory.poles(X).end, b, "X end remains b");
  same(memory.poles(Y).start, a, "Y start is preserved source a");
  same(memory.poles(Y).end, e, "Y end is redirected to e");

  // Pre-existing replacement target converges canonically.
  same(
    memory.ensure(a, e),
    Y,
    "existing replacement target is reused canonically",
  );

  const P = memory.ensure(X, c);
  const Q = memory.ensure(d, X);

  const pBefore = memory.poles(P);
  const qBefore = memory.poles(Q);

  // Resolving/using Y must not mutate X or its dependents.
  memory.ensure(a, e);
  same(memory.poles(X).start, a, "X start unchanged after Y exists");
  same(memory.poles(X).end, b, "X end unchanged after Y exists");
  same(memory.poles(P).start, pBefore.start, "P start unchanged");
  same(memory.poles(P).end, pBefore.end, "P end unchanged");
  same(memory.poles(Q).start, qBefore.start, "Q start unchanged");
  same(memory.poles(Q).end, qBefore.end, "Q end unchanged");

  // -----------------------------------------------------------------------
  // R2/R3 — explicit state membership is not structural support closure.
  // Removal/replacement is therefore meaningful only relative to selected state.
  // -----------------------------------------------------------------------

  const theory = memory.ensure(C, U);
  const seed0 = memory.ensure(a, R);
  const seed1 = memory.ensure(e, R);
  const seed2 = memory.ensure(c, R);
  const seedP = memory.ensure(d, R);

  const onlyP = defineV013GroundedExecutionScope(
    memory,
    seedP,
    theory,
    [P],
  );
  sameMembers(
    readV013GroundedExecutionScope(memory, onlyP),
    [P],
    "explicit Scope can contain only P",
  );

  const supportP = poleSupport(memory, [P]);
  assert(supportP.has(P), "support includes P");
  assert(supportP.has(X), "support recursively includes P start X");
  assert(supportP.has(c), "support recursively includes P end c");
  assert(
    !readV013GroundedExecutionScope(memory, onlyP).includes(X),
    "recursive support does not imply explicit top-level membership X",
  );
  assert(
    !readV013GroundedExecutionScope(memory, onlyP).includes(c),
    "recursive support does not imply explicit top-level membership c",
  );

  const state0 = defineV013GroundedExecutionScope(
    memory,
    seed0,
    theory,
    [X, P, Q],
  );
  const state1 = defineV013GroundedExecutionScope(
    memory,
    seed1,
    theory,
    [Y, P, Q],
  );

  sameMembers(
    readV013GroundedExecutionScope(memory, state0),
    [X, P, Q],
    "state0 explicit membership",
  );
  sameMembers(
    readV013GroundedExecutionScope(memory, state1),
    [Y, P, Q],
    "local membership replacement X->Y leaves P/Q present",
  );

  // Historical/current-state replacement does not physically delete old Links.
  same(memory.poles(X).end, b, "old X remains structurally readable");
  same(memory.poles(P).start, X, "old P still references X");
  same(memory.poles(Q).end, X, "old Q still references X");

  // -----------------------------------------------------------------------
  // R4/R5 — structural substitution is a separate explicit graph rewrite.
  // -----------------------------------------------------------------------

  const P2 = memory.ensure(Y, c);
  const Q2 = memory.ensure(d, Y);

  assert(P2 !== P, "P' is a new semantic Link after X->Y substitution");
  assert(Q2 !== Q, "Q' is a new semantic Link after X->Y substitution");

  same(memory.poles(P2).start, Y, "P' references Y");
  same(memory.poles(P2).end, c, "P' preserves c");
  same(memory.poles(Q2).start, d, "Q' preserves d");
  same(memory.poles(Q2).end, Y, "Q' references Y");

  const state2 = defineV013GroundedExecutionScope(
    memory,
    seed2,
    theory,
    [Y, P2, Q2],
  );
  sameMembers(
    readV013GroundedExecutionScope(memory, state2),
    [Y, P2, Q2],
    "explicit structural substitution state",
  );

  // Original dependents remain immutable and distinct.
  same(memory.poles(P).start, X, "P was not auto-rewritten");
  same(memory.poles(Q).end, X, "Q was not auto-rewritten");

  // -----------------------------------------------------------------------
  // R7-R9 — source-preserving rewrite is gauge-covariant.
  // -----------------------------------------------------------------------

  const inR = memory.ensure(C, R);
  const outR = memory.ensure(R, O);

  same(
    deriveFrame([inR], inR, outR),
    "DIRECT",
    "InR selects DIRECT orientation",
  );
  same(
    deriveFrame([outR], inR, outR),
    "MIRROR",
    "OutR selects MIRROR orientation",
  );

  assert(
    sameSemanticSource(memory, "DIRECT", X, Y),
    "DIRECT rewrite preserves semantic source",
  );

  const jX = invertLink(memory, basis, X);
  const jY = invertLink(memory, basis, Y);

  // In raw technical coordinates J turns equal start into equal end.
  same(
    memory.poles(jX).end,
    memory.poles(jY).end,
    "J-images share technical end",
  );
  assert(
    memory.poles(jX).start !== memory.poles(jY).start,
    "J-images need not share technical start",
  );

  // MIRROR semantic reading swaps technical poles, recovering exact source law.
  assert(
    sameSemanticSource(memory, "MIRROR", jX, jY),
    "J maps DIRECT source-preserving rewrite to MIRROR source-preserving rewrite",
  );

  const directSource = semanticPoles(memory, "DIRECT", X).start;
  const mirrorSource = semanticPoles(memory, "MIRROR", jX).start;
  same(directSource, a, "DIRECT semantic source is a");
  same(
    mirrorSource,
    invertLink(memory, basis, a),
    "MIRROR semantic source is J(a)",
  );

  // The semantic law therefore depends on selected orientation gauge, not on
  // a privileged host field named "start".
  assert(
    memory.poles(jX).start !== mirrorSource,
    "technical start is not absolute semantic SOURCE authority",
  );

  console.log([
    "MTS v0.14 R1: IMMUTABLE_LINK_CHIRAL_REWRITE=GREEN_RESEARCH",
    "SEMANTIC_LINK_IN_PLACE_MUTATION=FALSIFIED",
    "STRUCTURAL_IDENTITY_IMPLIES_IMMUTABLE_LINK=SUPPORTED",
    "CANONICAL_EXISTING_TARGET_CONVERGENCE=TRUE",
    "EXPLICIT_ASET_MEMBERSHIP_POLE_CLOSED=FALSE",
    "RECURSIVE_POLE_SUPPORT_CLOSURE=TRUE",
    "REMOVE_WITHOUT_SELECTED_STATE=UNDERSPECIFIED",
    "MEMBERSHIP_REPLACEMENT_NOT_STRUCTURAL_SUBSTITUTION=TRUE",
    "DEPENDENT_LINK_AUTO_REWRITE=FALSE",
    "EXPLICIT_SUBSTITUTION_CREATES_NEW_IMMUTABLE_DEPENDENTS=TRUE",
    "DIRECT_REWRITE_PRESERVES_SEMANTIC_SOURCE=TRUE",
    "J_DIRECT_REWRITE_TO_MIRROR_REWRITE=GREEN",
    "TECHNICAL_START_ABSOLUTE_SOURCE_AUTHORITY=FALSE",
    "DOUBLETS_OCCURRENCE_SEMANTICS=DOWNSTREAM_OBLIGATION",
    "ACCEPTED_V013_MUTATED=FALSE",
  ].join(" "));
}

main();
