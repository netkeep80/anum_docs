import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import {
  decomposeV013SemanticLink,
} from "../src/v013-hierarchical-carrier.js";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
  type RootBasis,
} from "../src/memory.js";
import {
  StateError,
  defineContext,
  readContext,
} from "../src/state.js";
import {
  RelativePoleContextError,
  materializeRelativePoleContext,
  readRelativeUnaryForm,
  type RelativeUnaryForm,
} from "../src/v013-relative-pole-context.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.13 A75b context dualization: ${message}`);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: values differ`);
}

function invertLink(
  memory: Memory,
  basis: RootBasis,
  source: LinkHandle,
  memo = new Map<LinkHandle, LinkHandle>(),
): LinkHandle {
  const known = memo.get(source);
  if (known !== undefined) return known;

  const decomposition = decomposeV013SemanticLink(memory, basis, source);
  let result: LinkHandle;

  if (decomposition.aspect === "ROOT") {
    result = basis.R;
  } else if (decomposition.aspect === "START") {
    result = memory.ensureEndSelfClosed(
      invertLink(memory, basis, decomposition.children[0]!, memo),
    );
  } else if (decomposition.aspect === "END") {
    result = memory.ensureStartSelfClosed(
      invertLink(memory, basis, decomposition.children[0]!, memo),
    );
  } else {
    const left = invertLink(memory, basis, decomposition.children[0]!, memo);
    const right = invertLink(memory, basis, decomposition.children[1]!, memo);
    result = memory.ensure(right, left);
  }

  memo.set(source, result);
  return result;
}

interface DualContextState {
  readonly parent: LinkHandle;
  readonly current: LinkHandle;
}

/**
 * Exact recursive image of accepted
 *
 *   Context(parent,current) = START(parent -> current)
 *
 * under J:
 *
 *   J(Context(parent,current))
 *     = END(J(current) -> J(parent)).
 */
function defineDualContext(
  memory: Memory,
  parent: LinkHandle,
  current: LinkHandle,
): LinkHandle {
  const payload = memory.ensure(current, parent);
  return memory.ensureEndSelfClosed(payload);
}

function readDualContext(
  memory: Memory,
  context: LinkHandle,
): DualContextState {
  const outer = memory.poles(context);
  assert(
    outer.end === context && outer.start !== context,
    "dual Context is proper END(payload)",
  );
  const payload = memory.poles(outer.start);
  return Object.freeze({
    parent: payload.end,
    current: payload.start,
  });
}

function selectedFromUnary(memory: Memory, unary: RelativeUnaryForm): LinkHandle {
  const whole = memory.poles(unary.whole);
  return unary.side === "start" ? whole.start : whole.end;
}

function expectCurrentContextRejects(memory: Memory, context: LinkHandle): void {
  try {
    readContext(memory, context);
  } catch (error) {
    assert(error instanceof StateError, "rejected dual Context with StateError");
    same(error.code, "invalid-context", "dual Context rejection code");
    return;
  }
  throw new Error("v0.13 A75b context dualization: current Context reader accepted J(Context)");
}

function expectRelativeMaterializerRejects(
  memory: Memory,
  parent: LinkHandle,
  form: LinkHandle,
): void {
  try {
    materializeRelativePoleContext(memory, parent, form);
  } catch (error) {
    assert(
      error instanceof RelativePoleContextError,
      "relative materializer rejects dual parent structurally",
    );
    same(error.code, "invalid-context", "relative dual-parent rejection code");
    return;
  }
  throw new Error(
    "v0.13 A75b context dualization: current relative materializer accepted dual parent",
  );
}

function exercise(noise: boolean): readonly string[] {
  const memory = new Memory();
  const basis = ensureRootBasis(memory);

  if (noise) {
    const n1 = memory.ensure(basis.U, basis.C);
    const n2 = memory.ensure(basis.L, n1);
    memory.ensure(n2, basis.O);
  }

  const a = memory.ensure(basis.L, basis.U);
  const b = memory.ensure(basis.C, basis.L);
  const whole = memory.ensure(a, b);

  // Relative unary forms over S.
  const P = memory.ensureStartSelfClosed(whole);
  const Q = memory.ensureEndSelfClosed(whole);
  const D = memory.ensure(P, Q);
  const I = memory.ensure(Q, P);

  const jWhole = invertLink(memory, basis, whole);
  const Pprime = memory.ensureStartSelfClosed(jWhole);
  const Qprime = memory.ensureEndSelfClosed(jWhole);
  const Dprime = memory.ensure(Pprime, Qprime);
  const Iprime = memory.ensure(Qprime, Pprime);

  // J swaps relative START/END forms, while D/I roles survive relative to J(S).
  same(invertLink(memory, basis, P), Qprime, "J(P)=Q' over J(S)");
  same(invertLink(memory, basis, Q), Pprime, "J(Q)=P' over J(S)");
  same(invertLink(memory, basis, D), Dprime, "J(D)=D' over J(S)");
  same(invertLink(memory, basis, I), Iprime, "J(I)=I' over J(S)");

  const unaryP = readRelativeUnaryForm(memory, P);
  const unaryQ = readRelativeUnaryForm(memory, Q);
  const unaryJP = readRelativeUnaryForm(memory, invertLink(memory, basis, P));
  const unaryJQ = readRelativeUnaryForm(memory, invertLink(memory, basis, Q));

  same(unaryP.side, "start", "P is START form");
  same(unaryQ.side, "end", "Q is END form");
  same(unaryJP.side, "end", "J(P) is END form");
  same(unaryJQ.side, "start", "J(Q) is START form");
  same(unaryJP.whole, jWhole, "J(P) whole is J(S)");
  same(unaryJQ.whole, jWhole, "J(Q) whole is J(S)");
  same(
    selectedFromUnary(memory, unaryJP),
    invertLink(memory, basis, a),
    "selected START pole maps to selected END pole of J(S)",
  );
  same(
    selectedFromUnary(memory, unaryJQ),
    invertLink(memory, basis, b),
    "selected END pole maps to selected START pole of J(S)",
  );

  // Accepted Context is START(parent -> current).
  const parent = defineContext(memory, basis.R, whole);
  const originalParentState = readContext(memory, parent);
  same(originalParentState.parent, basis.R, "accepted parent Context parent");
  same(originalParentState.current, whole, "accepted parent Context current");

  const jParent = invertLink(memory, basis, parent);
  const expectedDualParent = defineDualContext(
    memory,
    invertLink(memory, basis, basis.R),
    jWhole,
  );
  same(
    jParent,
    expectedDualParent,
    "J(Context(parent,current)) is exact END-dual Context",
  );

  const dualParentState = readDualContext(memory, jParent);
  same(dualParentState.parent, basis.R, "dual Context recovers J(parent)");
  same(dualParentState.current, jWhole, "dual Context recovers J(current)");

  // This is the first exact obstruction to FULL_AUTOMORPHISM with the current
  // distinguished Context law: the same reader rejects the recursive image.
  expectCurrentContextRejects(memory, jParent);

  // Relative position over P uses two nested accepted START Contexts.
  const positionP = materializeRelativePoleContext(memory, parent, P);
  same(positionP.side, "start", "relative P position side");
  same(positionP.whole, whole, "relative P position whole");
  same(positionP.selected, a, "relative P selects original START pole");

  const evidenceContext = readContext(memory, positionP.context).parent;
  const jEvidenceContext = invertLink(memory, basis, evidenceContext);
  const expectedDualEvidence = defineDualContext(
    memory,
    jParent,
    invertLink(memory, basis, P),
  );
  same(
    jEvidenceContext,
    expectedDualEvidence,
    "relative evidence Context commutes with J modulo dual Context constructor",
  );

  const jPositionContext = invertLink(memory, basis, positionP.context);
  const expectedDualPosition = defineDualContext(
    memory,
    expectedDualEvidence,
    invertLink(memory, basis, positionP.selected),
  );
  same(
    jPositionContext,
    expectedDualPosition,
    "relative position Context commutes with J modulo dual Context constructor",
  );
  expectCurrentContextRejects(memory, jPositionContext);

  // The current relative materializer is therefore not invariant either:
  // it requires the accepted START-shaped Context parent.
  expectRelativeMaterializerRejects(
    memory,
    jParent,
    invertLink(memory, basis, P),
  );

  // Open/return control itself is self-dual: equality of unary side survives
  // simultaneous inversion of the stored position and the next operation.
  const originalPositionSide = unaryP.side;
  const invertedPositionSide = unaryJP.side;
  same(
    originalPositionSide === readRelativeUnaryForm(memory, P).side,
    invertedPositionSide === readRelativeUnaryForm(memory, invertLink(memory, basis, P)).side,
    "same-side/open relation survives inversion",
  );
  same(
    originalPositionSide === readRelativeUnaryForm(memory, Q).side,
    invertedPositionSide === readRelativeUnaryForm(memory, invertLink(memory, basis, Q)).side,
    "opposite-side/return relation survives inversion",
  );

  return Object.freeze([
    `P:${unaryP.side}->${unaryJP.side}`,
    `Q:${unaryQ.side}->${unaryJQ.side}`,
    `D:${D===invertLink(memory,basis,D)?"fixed":"mapped"}`,
    `I:${I===invertLink(memory,basis,I)?"fixed":"mapped"}`,
    "CONTEXT:START->END_DUAL",
    "CURRENT_READER:REJECTS_DUAL",
    "OPEN_RETURN:EQUALITY_INVARIANT",
  ]);
}

function staticGuards(): void {
  const root = resolve(process.cwd(), "..");
  const own = readFileSync(
    join(root, "ts/test/research-v013-context-dualization-a75b.test.ts"),
    "utf8",
  );
  const state = readFileSync(join(root, "ts/src/state.ts"), "utf8");

  assert(
    state.includes("return memory.ensureStartSelfClosed(payload);"),
    "accepted Context constructor remains START(payload)",
  );
  assert(
    state.includes("contextLink.start !== context || contextLink.end === context"),
    "accepted Context reader remains proper-START-only",
  );

  const semantic = own.slice(
    own.indexOf("function invertLink("),
    own.indexOf("\ninterface DualContextState"),
  );
  for (const forbidden of [".poles(", ".outgoing(", ".incoming(", "graph"]) {
    assert(
      !semantic.includes(forbidden),
      `semantic inversion excludes adjacency/model shortcut: ${forbidden}`,
    );
  }
}

function main(): void {
  const clean = exercise(false);
  const renamed = exercise(true);

  same(
    JSON.stringify(renamed),
    JSON.stringify(clean),
    "relative/context dualization survives independent allocation noise",
  );
  staticGuards();

  console.log([
    "MTS v0.13 A75b: CONTEXT_DUALIZATION=GREEN_SCOPED_RESEARCH",
    "INV_09_RELATIVE_UNARY=P_Q_EXCHANGED_D_I_ROLES_PRESERVED",
    "CTX_01_CONTEXT=START_LAW_MAPS_TO_EXPLICIT_END_DUAL",
    "CURRENT_READ_CONTEXT_ON_J_CONTEXT=REJECTS_INVALID_CONTEXT",
    "DUAL_CONTEXT_READER=RECOVERS_J_PARENT_J_CURRENT",
    "CTX_02_RELATIVE_POSITION=COMMUTES_MODULO_DUAL_CONTEXT",
    "OPEN_RETURN_GEOMETRY=SIDE_EQUALITY_INVARIANT",
    "FULL_AUTOMORPHISM_WITH_FIXED_CONTEXT_LAW=FALSIFIED",
    "THEORY_DUALIZATION=SUPPORTED_NOT_YET_FULLY_PROVEN",
    "ADDRESS_RENAMING=INVARIANT",
  ].join(" "));
}

main();
