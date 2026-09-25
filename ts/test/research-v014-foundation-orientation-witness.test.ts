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
    throw new Error("v0.14 Y1 foundation orientation witness: " + message);
  }
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: values differ`);
}

function distinct(
  left: LinkHandle,
  right: LinkHandle,
  message: string,
): void {
  assert(left !== right, message);
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

function canonicalWire(
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

/**
 * Deliberately destructive projection used only as a falsifier.
 *
 * It removes local pole orientation:
 * - START and END become the same unary shape;
 * - PAIR children are treated as an unordered pair.
 *
 * If a proposed foundation quotients Link identity this way, any distinction
 * absent from this fingerprint has already been discarded and cannot later be
 * recovered by an InR/OutR witness built from the same quotient.
 */
function locallyUnorderedFingerprint(
  memory: Memory,
  basis: RootBasis,
  source: LinkHandle,
  memo = new Map<LinkHandle, string>(),
): string {
  const known = memo.get(source);
  if (known !== undefined) return known;

  const decomposition = decomposeV013SemanticLink(memory, basis, source);
  let result: string;

  if (decomposition.aspect === "ROOT") {
    result = "R";
  } else if (
    decomposition.aspect === "START" ||
    decomposition.aspect === "END"
  ) {
    result = `S(${locallyUnorderedFingerprint(
      memory,
      basis,
      decomposition.children[0]!,
      memo,
    )})`;
  } else {
    const left = locallyUnorderedFingerprint(
      memory,
      basis,
      decomposition.children[0]!,
      memo,
    );
    const right = locallyUnorderedFingerprint(
      memory,
      basis,
      decomposition.children[1]!,
      memo,
    );
    const [a, b] = [left, right].sort();
    result = `P(${a},${b})`;
  }

  memo.set(source, result);
  return result;
}

type OrientationAuthority =
  | "DIRECT"
  | "MIRROR"
  | "UNRESOLVED";

function classifyOrientationAuthority(
  selected: readonly LinkHandle[],
  inR: LinkHandle,
  outR: LinkHandle,
): OrientationAuthority {
  const unique = [...new Set(selected)];

  if (
    unique.length === 1 &&
    unique[0] === inR
  ) {
    return "DIRECT";
  }

  if (
    unique.length === 1 &&
    unique[0] === outR
  ) {
    return "MIRROR";
  }

  return "UNRESOLVED";
}

function setSame(
  actual: readonly LinkHandle[],
  expected: readonly LinkHandle[],
  message: string,
): void {
  same(actual.length, expected.length, message + " length");
  for (const value of expected) {
    assert(actual.includes(value), message + " missing expected member");
  }
}

function exercise(): void {
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  const { R, O, C, L, U } = basis;

  const inR = memory.ensure(C, R);
  const outR = memory.ensure(R, O);

  // -----------------------------------------------------------------------
  // Y1.1 — the existing oriented carrier keeps the chiral pair distinct.
  // -----------------------------------------------------------------------

  distinct(inR, outR, "InR and OutR are distinct oriented Links");
  same(canonicalWire(memory, basis, inR), "1688", "InR recursive wire");
  same(canonicalWire(memory, basis, outR), "1898", "OutR recursive wire");

  // -----------------------------------------------------------------------
  // Y1.2 — recursive inversion exchanges the exact pair.
  // -----------------------------------------------------------------------

  same(invertLink(memory, basis, inR), outR, "J(InR)=OutR");
  same(invertLink(memory, basis, outR), inR, "J(OutR)=InR");

  // The accepted root basis is invariant as a set, not pointwise.
  const f0 = Object.freeze([R, O, C, L, U]);
  const jf0 = Object.freeze(
    f0.map((link) => invertLink(memory, basis, link)),
  );
  setSame(jf0, f0, "J(F0)=F0");

  same(invertLink(memory, basis, R), R, "J(R)=R");
  same(invertLink(memory, basis, O), C, "J(O)=C");
  same(invertLink(memory, basis, C), O, "J(C)=O");
  same(invertLink(memory, basis, L), L, "J(L)=L");
  same(invertLink(memory, basis, U), U, "J(U)=U");

  // A pointed/direct foundation maps to the exact mirror pointed foundation.
  const directWitness = inR;
  const mirrorWitness = invertLink(memory, basis, directWitness);
  same(mirrorWitness, outR, "J(F0,InR) has witness OutR");
  same(
    invertLink(memory, basis, mirrorWitness),
    directWitness,
    "pointed foundation mirror is involutive",
  );

  // -----------------------------------------------------------------------
  // Y1.3 — literal locally-unordered poles destroy the necessary bit.
  // -----------------------------------------------------------------------

  same(
    locallyUnorderedFingerprint(memory, basis, O),
    locallyUnorderedFingerprint(memory, basis, C),
    "unordered projection collapses O/C",
  );
  same(
    locallyUnorderedFingerprint(memory, basis, L),
    locallyUnorderedFingerprint(memory, basis, U),
    "unordered projection collapses L/U",
  );
  same(
    locallyUnorderedFingerprint(memory, basis, inR),
    locallyUnorderedFingerprint(memory, basis, outR),
    "unordered projection collapses InR/OutR",
  );

  // The oriented carrier explicitly keeps every one of those pairs distinct.
  distinct(O, C, "oriented carrier keeps O/C distinct");
  distinct(L, U, "oriented carrier keeps L/U distinct");
  distinct(inR, outR, "oriented carrier keeps InR/OutR distinct");

  // -----------------------------------------------------------------------
  // Y1.4 — orientation is foundation-role authority, not raw Link presence.
  // -----------------------------------------------------------------------

  // Both witnesses physically exist in Memory for every case below.
  assert(memory.poles(inR).start === C, "InR physically present");
  assert(memory.poles(outR).end === O, "OutR physically present");

  same(
    classifyOrientationAuthority([inR], inR, outR),
    "DIRECT",
    "exactly selected InR chooses direct frame",
  );
  same(
    classifyOrientationAuthority([outR], inR, outR),
    "MIRROR",
    "exactly selected OutR chooses mirror frame",
  );
  same(
    classifyOrientationAuthority([], inR, outR),
    "UNRESOLVED",
    "no selected witness leaves polarity unresolved",
  );
  same(
    classifyOrientationAuthority([inR, outR], inR, outR),
    "UNRESOLVED",
    "two selected mirror witnesses restore ambiguity",
  );

  // Duplicate admission of the same semantic witness is still one canonical
  // selection, because semantic Link identity collapses duplicates.
  same(
    classifyOrientationAuthority([inR, inR], inR, outR),
    "DIRECT",
    "duplicate same witness does not create ambiguity",
  );

  // -----------------------------------------------------------------------
  // Y1.5 — the same distinction lifts to START/END continuation around A.
  // -----------------------------------------------------------------------

  const A = memory.ensure(L, U);
  const startA = memory.ensureStartSelfClosed(A);
  const endA = memory.ensureEndSelfClosed(A);

  distinct(
    startA,
    endA,
    "proper START(A) and END(A) continuations are distinct",
  );
  same(
    invertLink(memory, basis, startA),
    memory.ensureEndSelfClosed(invertLink(memory, basis, A)),
    "J(START(A))=END(J(A))",
  );
  same(
    invertLink(memory, basis, endA),
    memory.ensureStartSelfClosed(invertLink(memory, basis, A)),
    "J(END(A))=START(J(A))",
  );

  same(
    locallyUnorderedFingerprint(memory, basis, startA),
    locallyUnorderedFingerprint(memory, basis, endA),
    "local-unordered quotient also erases START(A)/END(A) chirality",
  );
}

function main(): void {
  exercise();

  console.log([
    "MTS v0.14 Y1: FOUNDATION_ORIENTATION_WITNESS=GREEN_RESEARCH",
    "LITERAL_LOCAL_UNORDERED_POLES=FALSIFIED",
    "GLOBAL_POLARITY_MODEL=VIABLE",
    "INR_WIRE=1688",
    "OUTR_WIRE=1898",
    "J_INR_OUTR=EXCHANGED",
    "ROOT_BASIS_SET_UNDER_J=INVARIANT",
    "UNORDERED_COLLAPSE_O_C=CONFIRMED",
    "UNORDERED_COLLAPSE_L_U=CONFIRMED",
    "UNORDERED_COLLAPSE_INR_OUTR=CONFIRMED",
    "RAW_LINK_PRESENCE_AUTHORITY=FALSE",
    "EXACTLY_ONE_DISTINGUISHED_WITNESS=REQUIRED",
    "ZERO_OR_TWO_WITNESSES=UNRESOLVED",
    "START_END_CONTINUATION_CHIRALITY=PRESERVED",
    "ACCEPTED_V013_MUTATED=FALSE",
  ].join(" "));
}

main();
