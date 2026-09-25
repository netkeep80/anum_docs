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
  type LinkPoles,
  type RootBasis,
} from "../src/memory.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error("v0.14 Y3 orientation gauge view: " + message);
  }
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: values differ`);
}

type Frame = "DIRECT" | "MIRROR";

class SemanticOrientationView {
  constructor(
    readonly memory: Memory,
    readonly frame: Frame,
  ) {}

  get root(): LinkHandle {
    return this.memory.root;
  }

  poles(link: LinkHandle): LinkPoles {
    const technical = this.memory.poles(link);
    return this.frame === "DIRECT"
      ? technical
      : Object.freeze({
          start: technical.end,
          end: technical.start,
        });
  }

  ensure(start: LinkHandle, end: LinkHandle): LinkHandle {
    return this.frame === "DIRECT"
      ? this.memory.ensure(start, end)
      : this.memory.ensure(end, start);
  }

  ensureStartSelfClosed(end: LinkHandle): LinkHandle {
    return this.frame === "DIRECT"
      ? this.memory.ensureStartSelfClosed(end)
      : this.memory.ensureEndSelfClosed(end);
  }

  ensureEndSelfClosed(start: LinkHandle): LinkHandle {
    return this.frame === "DIRECT"
      ? this.memory.ensureEndSelfClosed(start)
      : this.memory.ensureStartSelfClosed(start);
  }
}

interface SemanticFoundation {
  readonly R: LinkHandle;
  readonly O: LinkHandle;
  readonly C: LinkHandle;
  readonly L: LinkHandle;
  readonly U: LinkHandle;
  readonly W: LinkHandle;
}

function buildSemanticFoundation(
  view: SemanticOrientationView,
): SemanticFoundation {
  const R = view.root;
  const O = view.ensureStartSelfClosed(R);
  const C = view.ensureEndSelfClosed(R);
  const L = view.ensure(O, C);
  const U = view.ensure(C, O);
  const W = view.ensure(C, R);
  return Object.freeze({ R, O, C, L, U, W });
}

function semanticWire(
  view: SemanticOrientationView,
  link: LinkHandle,
  active = new Set<LinkHandle>(),
): string {
  assert(!active.has(link), "unexpected non-self semantic cycle");
  const p = view.poles(link);

  if (p.start === link && p.end === link) return "8";
  if (p.start === link) {
    active.add(link);
    try {
      return "9" + semanticWire(view, p.end, active);
    } finally {
      active.delete(link);
    }
  }
  if (p.end === link) {
    active.add(link);
    try {
      return "6" + semanticWire(view, p.start, active);
    } finally {
      active.delete(link);
    }
  }

  active.add(link);
  try {
    return (
      "1" +
      semanticWire(view, p.start, active) +
      semanticWire(view, p.end, active)
    );
  } finally {
    active.delete(link);
  }
}

function technicalWire(
  memory: Memory,
  basis: RootBasis,
  link: LinkHandle,
): string {
  const carrier = materializeV013HierarchicalCarrierFromSemanticLink(
    memory,
    basis,
    link,
  );
  return String.fromCharCode(
    ...serializeV013HierarchicalCarrier(memory, basis, carrier),
  );
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

function deriveFrame(
  foundationMembers: readonly LinkHandle[],
  inR: LinkHandle,
  outR: LinkHandle,
): Frame | "UNRESOLVED" {
  const hasIn = foundationMembers.includes(inR);
  const hasOut = foundationMembers.includes(outR);
  if (hasIn === hasOut) return "UNRESOLVED";
  return hasIn ? "DIRECT" : "MIRROR";
}

interface MpWitness {
  readonly K: LinkHandle;
  readonly A: LinkHandle;
  readonly B: LinkHandle;
  readonly truth: LinkHandle;
  readonly rule: LinkHandle;
  readonly result: LinkHandle;
}

function buildMpWitness(
  view: SemanticOrientationView,
  f: SemanticFoundation,
): MpWitness {
  const K = view.ensure(f.U, f.L);
  const A = view.ensure(f.L, f.C);
  const B = view.ensure(f.O, f.U);

  return Object.freeze({
    K,
    A,
    B,
    truth: view.ensure(K, A),
    rule: view.ensure(A, B),
    result: view.ensure(K, B),
  });
}

function main(): void {
  const memory = new Memory();
  const technicalBasis = ensureRootBasis(memory);
  const { R, O, C, L, U } = technicalBasis;

  const inR = memory.ensure(C, R);
  const outR = memory.ensure(R, O);
  const F0 = Object.freeze([R, O, C, L, U]);

  const directFoundationMembers = Object.freeze([...F0, inR]);
  const mirrorFoundationMembers = Object.freeze([...F0, outR]);

  same(
    deriveFrame(directFoundationMembers, inR, outR),
    "DIRECT",
    "InR foundation selects DIRECT gauge",
  );
  same(
    deriveFrame(mirrorFoundationMembers, inR, outR),
    "MIRROR",
    "OutR mirror foundation selects MIRROR gauge",
  );

  const direct = new SemanticOrientationView(memory, "DIRECT");
  const mirror = new SemanticOrientationView(memory, "MIRROR");

  const fd = buildSemanticFoundation(direct);
  const fm = buildSemanticFoundation(mirror);

  // DIRECT semantic names coincide with the current technical v0.13 basis.
  same(fd.R, R, "direct semantic R");
  same(fd.O, O, "direct semantic O");
  same(fd.C, C, "direct semantic C");
  same(fd.L, L, "direct semantic L");
  same(fd.U, U, "direct semantic U");
  same(fd.W, inR, "direct semantic orientation witness");

  // MIRROR uses the opposite technical coordinates while preserving the same
  // semantic names and equations.
  same(fm.R, R, "mirror semantic R");
  same(fm.O, C, "mirror semantic O is technical C");
  same(fm.C, O, "mirror semantic C is technical O");
  same(fm.L, L, "mirror semantic L remains technical L");
  same(fm.U, U, "mirror semantic U remains technical U");
  same(fm.W, outR, "mirror semantic InR is technical OutR");

  // Recursive alphabet semantics are gauge-invariant once pole orientation is
  // read through the foundation-selected semantic view.
  const expected = Object.freeze({
    R: "8",
    O: "98",
    C: "68",
    L: "19868",
    U: "16898",
    W: "1688",
  });

  for (const name of Object.keys(expected) as readonly (keyof typeof expected)[]) {
    same(
      semanticWire(direct, fd[name]),
      expected[name],
      `direct semantic wire ${name}`,
    );
    same(
      semanticWire(mirror, fm[name]),
      expected[name],
      `mirror semantic wire ${name}`,
    );
  }

  // Technical v0.13 serialization observes technical coordinates, so the
  // mirror representatives intentionally have mirror spellings.
  same(technicalWire(memory, technicalBasis, fm.O), "68", "mirror O technical wire");
  same(technicalWire(memory, technicalBasis, fm.C), "98", "mirror C technical wire");
  same(technicalWire(memory, technicalBasis, fm.W), "1898", "mirror InR technical wire");
  assert(
    technicalWire(memory, technicalBasis, fm.W) !==
      semanticWire(mirror, fm.W),
    "technical coordinates are not semantic orientation authority",
  );

  // J maps every DIRECT named semantic foundation member to the same semantic
  // name in MIRROR view.
  for (const name of ["R", "O", "C", "L", "U", "W"] as const) {
    same(
      invertLink(memory, technicalBasis, fd[name]),
      fm[name],
      `J maps direct ${name} to mirror semantic ${name}`,
    );
  }

  // Generic Link construction commutes with J when MIRROR swaps the technical
  // pole coordinates. This is the structural core needed by generalized MP.
  const mpDirect = buildMpWitness(direct, fd);
  const mpMirror = buildMpWitness(mirror, fm);

  for (const name of ["K", "A", "B", "truth", "rule", "result"] as const) {
    same(
      invertLink(memory, technicalBasis, mpDirect[name]),
      mpMirror[name],
      `J commutes with semantic MP component ${name}`,
    );
  }

  const directTruthPoles = direct.poles(mpDirect.truth);
  const directRulePoles = direct.poles(mpDirect.rule);
  const directResultPoles = direct.poles(mpDirect.result);
  same(directTruthPoles.start, mpDirect.K, "direct truth is K->A");
  same(directTruthPoles.end, mpDirect.A, "direct truth ends at A");
  same(directRulePoles.start, mpDirect.A, "direct rule starts at A");
  same(directRulePoles.end, mpDirect.B, "direct rule ends at B");
  same(directResultPoles.start, mpDirect.K, "direct result is K->B");
  same(directResultPoles.end, mpDirect.B, "direct result ends at B");

  const mirrorTruthPoles = mirror.poles(mpMirror.truth);
  const mirrorRulePoles = mirror.poles(mpMirror.rule);
  const mirrorResultPoles = mirror.poles(mpMirror.result);
  same(mirrorTruthPoles.start, mpMirror.K, "mirror truth is semantic K->A");
  same(mirrorTruthPoles.end, mpMirror.A, "mirror truth ends at semantic A");
  same(mirrorRulePoles.start, mpMirror.A, "mirror rule starts at semantic A");
  same(mirrorRulePoles.end, mpMirror.B, "mirror rule ends at semantic B");
  same(mirrorResultPoles.start, mpMirror.K, "mirror result is semantic K->B");
  same(mirrorResultPoles.end, mpMirror.B, "mirror result ends at semantic B");

  console.log([
    "MTS v0.14 Y3: ORIENTATION_GAUGE_VIEW=GREEN_RESEARCH",
    "TECHNICAL_POLE_POSITIONS=COORDINATES_NOT_SEMANTIC_AUTHORITY",
    "DIRECT_WITNESS=INR",
    "MIRROR_WITNESS=OUTR",
    "SEMANTIC_START_END=FOUNDATION_GAUGE_DERIVED",
    "SEMANTIC_RECURSIVE_ALPHABET=GAUGE_INVARIANT",
    "R=8",
    "O=98",
    "C=68",
    "L=19868",
    "U=16898",
    "INR=1688",
    "J_DIRECT_TO_MIRROR_NAMED_FOUNDATION=GREEN",
    "GENERIC_LINK_COMPOSITION_COMMUTES_WITH_J=GREEN",
    "GENERALIZED_MP_STRUCTURAL_SKELETON_COMMUTES_WITH_J=GREEN",
    "PRODUCTION_RUNTIME_MUTATED=FALSE",
    "MIRROR_PRODUCTION_MODE_CLAIMED=FALSE",
  ].join(" "));
}

main();
