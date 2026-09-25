// mts-version-evidence: candidate-from=0.14

import {
  decomposeV013SemanticLink,
  materializeV013HierarchicalCarrierFromSemanticLink,
  serializeV013HierarchicalCarrier,
} from "../src/v013-hierarchical-carrier.js";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
  type RootBasis,
} from "../src/memory.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error("v0.14 Y2 minimal chiral extension: " + message);
  }
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: values differ`);
}

function setSame(
  actual: readonly LinkHandle[],
  expected: readonly LinkHandle[],
  message: string,
): void {
  same(new Set(actual).size, new Set(expected).size, message + " cardinality");
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

function wire(
  memory: Memory,
  basis: RootBasis,
  semantic: LinkHandle,
): string {
  const carrier = materializeV013HierarchicalCarrierFromSemanticLink(
    memory,
    basis,
    semantic,
  );
  return String.fromCharCode(
    ...serializeV013HierarchicalCarrier(memory, basis, carrier),
  );
}

function main(): void {
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  const { R, O, C, L, U } = basis;

  const F0 = Object.freeze([R, O, C, L, U]);

  // Exhaust the bounded class:
  // one ordinary Link whose poles are R and one unary root neighbour O/C.
  const oToR = memory.ensure(O, R);
  const cToR = memory.ensure(C, R);
  const rToO = memory.ensure(R, O);
  const rToC = memory.ensure(R, C);

  // Two candidates are not extensions at all: structural identity returns the
  // already-existing self-incidence basis Links.
  same(oToR, O, "O->R is exactly O");
  same(rToC, C, "R->C is exactly C");

  // The opposite two constructions are genuinely new Links.
  const inR = cToR;
  const outR = rToO;
  assert(!F0.includes(inR), "C->R is new outside F0");
  assert(!F0.includes(outR), "R->O is new outside F0");
  assert(inR !== outR, "new root-adjacent extensions are distinct");

  const candidates = Object.freeze([oToR, cToR, rToO, rToC]);
  const newCandidates = Object.freeze(
    [...new Set(candidates)].filter((value) => !F0.includes(value)),
  );
  setSame(
    newCandidates,
    [inR, outR],
    "exactly two new Links in bounded extension class",
  );

  same(wire(memory, basis, O), "98", "O wire");
  same(wire(memory, basis, C), "68", "C wire");
  same(wire(memory, basis, inR), "1688", "InR wire");
  same(wire(memory, basis, outR), "1898", "OutR wire");

  // Existing accepted canonicality semantics explain the collapse:
  // PAIR(O,R) cannot be a second semantic Link with the same ordered poles as O;
  // likewise PAIR(R,C) cannot duplicate C.
  same(memory.find(O, R), O, "ordered-pole identity prevents Pair(O,R) alias");
  same(memory.find(R, C), C, "ordered-pole identity prevents Pair(R,C) alias");

  // J preserves the symmetric root basis as a set and exchanges the sole new
  // orbit in this bounded one-Link extension class.
  const jF0 = Object.freeze(F0.map((x) => invertLink(memory, basis, x)));
  setSame(jF0, F0, "F0 is set-invariant under J");
  same(invertLink(memory, basis, inR), outR, "J(InR)=OutR");
  same(invertLink(memory, basis, outR), inR, "J(OutR)=InR");

  const Fplus = Object.freeze([...F0, inR]);
  const jFplus = Object.freeze(Fplus.map((x) => invertLink(memory, basis, x)));
  const Fminus = Object.freeze([...F0, outR]);

  setSame(jFplus, Fminus, "J(F0+InR)=F0+OutR");
  assert(!Fplus.includes(outR), "direct foundation excludes mirror witness");
  assert(!Fminus.includes(inR), "mirror foundation excludes direct witness");
  assert(
    !Fplus.every((x) => jFplus.includes(x)),
    "pointed/chiral extension is not J-invariant",
  );

  // Physical Memory is allowed to contain both links. Orientation authority is
  // the chosen finite foundation structure Fplus/Fminus, not all issued Links.
  assert(memory.find(C, R) === inR, "physical InR remains present");
  assert(memory.find(R, O) === outR, "physical OutR remains present");
  assert(
    Fplus.includes(inR) && !Fplus.includes(outR),
    "Fplus membership selects the direct chiral extension",
  );

  console.log([
    "MTS v0.14 Y2: MINIMAL_CHIRAL_FOUNDATION_EXTENSION=GREEN_RESEARCH",
    "BOUNDED_CLASS=ONE_NEW_ROOT_ADJACENT_LINK_OVER_COMPLETE_F0",
    "O_TO_R=O",
    "R_TO_C=C",
    "C_TO_R=INR_NEW",
    "R_TO_O=OUTR_NEW",
    "NEW_CANDIDATE_COUNT=2",
    "INR_WIRE=1688",
    "OUTR_WIRE=1898",
    "J_NEW_ORBIT=INR_OUTR",
    "F0_J_INVARIANT=TRUE",
    "F0_PLUS_INR_J_INVARIANT=FALSE",
    "J_F0_PLUS_INR=F0_PLUS_OUTR",
    "FOUNDATION_MEMBERSHIP_NOT_RAW_MEMORY_PRESENCE=AUTHORITY",
    "GLOBAL_MINIMUM_OVER_ALL_POSSIBLE_WITNESSES=NOT_CLAIMED",
    "ACCEPTED_V013_MUTATED=FALSE",
  ].join(" "));
}

main();
