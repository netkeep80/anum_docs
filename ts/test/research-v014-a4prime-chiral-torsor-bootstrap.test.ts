// mts-version-evidence: candidate-from=0.14
// research-owner: #1662
// Historical N17b one-Context bootstrap retained for DIRECT/MIRROR covariance.
// N20b/#1673 supersedes Foundation-global selected-W authority.

import {
  decomposeV013SemanticLink,
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
    throw new Error("v0.14 N17b A4' chiral torsor bootstrap: " + message);
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
    assert(actual.includes(value), message + " missing expected member");
  }
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

interface DerivedFoundation {
  readonly R: LinkHandle;
  readonly O: LinkHandle;
  readonly C: LinkHandle;
  readonly L: LinkHandle;
  readonly U: LinkHandle;
}

function buildDerivedFoundation(view: SemanticOrientationView): DerivedFoundation {
  // START/END semantic roles first appear here for this historical one-Context
  // gauge after one chiral representative is selected. N20b generalizes this
  // to Context-local markers; before this point the bootstrap receives no O/C.
  const R = view.root;
  const O = view.ensureStartSelfClosed(R);
  const C = view.ensureEndSelfClosed(R);
  const L = view.ensure(O, C);
  const U = view.ensure(C, O);
  return Object.freeze({ R, O, C, L, U });
}

/**
 * Discover the two root-neighbour self-incidence states as one orbit.
 *
 * The returned array is used extensionally as a set. Its iteration order and
 * technical Memory coordinate names carry no semantic authority.
 *
 * Critically, this function receives no RootBasis and therefore cannot use
 * the semantic names O/C or START/END.
 */
function discoverRootNeighbourOrbit(
  memory: Memory,
  R: LinkHandle,
): readonly LinkHandle[] {
  const result: LinkHandle[] = [];
  for (const link of memory.allLinks()) {
    if (link === R) continue;
    const p = memory.poles(link);
    const firstShape = p.start === link && p.end === R;
    const secondShape = p.start === R && p.end === link;
    if (firstShape || secondShape) result.push(link);
  }
  assert(result.length === 2, "root-neighbour orbit must contain exactly two states");
  return Object.freeze([...new Set(result)]);
}

/**
 * For one root-neighbour self-incidence state, construct its complementary
 * root adjacency. This uses technical carrier coordinates only. It does not
 * assign either coordinate an absolute semantic role.
 */
function complementaryRootAdjacency(
  memory: Memory,
  R: LinkHandle,
  neighbour: LinkHandle,
): LinkHandle {
  const p = memory.poles(neighbour);
  if (p.start === neighbour && p.end === R) {
    return memory.ensure(R, neighbour);
  }
  if (p.start === R && p.end === neighbour) {
    return memory.ensure(neighbour, R);
  }
  throw new Error("v0.14 N17b A4' chiral torsor bootstrap: invalid root neighbour");
}

/**
 * The chiral witness exists before START/END naming.
 *
 * The result is the two-element orbit {W, J(W)} with no selected member and
 * no InR/OutR names yet.
 */
function discoverChiralWitnessOrbit(
  memory: Memory,
  R: LinkHandle,
): readonly LinkHandle[] {
  const neighbours = discoverRootNeighbourOrbit(memory, R);
  const result = neighbours.map((neighbour) =>
    complementaryRootAdjacency(memory, R, neighbour)
  );
  assert(new Set(result).size === 2, "chiral witness orbit must have two members");
  return Object.freeze(result);
}

function deriveFrameFromSelectedWitness(
  memory: Memory,
  R: LinkHandle,
  witnessOrbit: readonly LinkHandle[],
  selected: readonly LinkHandle[],
): Frame | "UNRESOLVED" {
  const unique = [...new Set(selected)];
  if (unique.length !== 1) return "UNRESOLVED";
  const W = unique[0]!;
  if (!witnessOrbit.includes(W)) return "UNRESOLVED";

  // These are technical carrier coordinates, not pre-existing semantic
  // START/END. Selecting W chooses which global coordinate convention is
  // interpreted as the oriented semantic frame.
  const p = memory.poles(W);
  if (p.end === R && p.start !== R) return "DIRECT";
  if (p.start === R && p.end !== R) return "MIRROR";
  return "UNRESOLVED";
}

function invertLink(
  memory: Memory,
  technicalBasis: RootBasis,
  source: LinkHandle,
  memo = new Map<LinkHandle, LinkHandle>(),
): LinkHandle {
  const known = memo.get(source);
  if (known !== undefined) return known;

  const d = decomposeV013SemanticLink(memory, technicalBasis, source);
  let result: LinkHandle;
  if (d.aspect === "ROOT") {
    result = technicalBasis.R;
  } else if (d.aspect === "START") {
    result = memory.ensureEndSelfClosed(
      invertLink(memory, technicalBasis, d.children[0]!, memo),
    );
  } else if (d.aspect === "END") {
    result = memory.ensureStartSelfClosed(
      invertLink(memory, technicalBasis, d.children[0]!, memo),
    );
  } else {
    result = memory.ensure(
      invertLink(memory, technicalBasis, d.children[1]!, memo),
      invertLink(memory, technicalBasis, d.children[0]!, memo),
    );
  }
  memo.set(source, result);
  return result;
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
    return "1" +
      semanticWire(view, p.start, active) +
      semanticWire(view, p.end, active);
  } finally {
    active.delete(link);
  }
}

function exercise(reverseTechnicalBootstrapOrder: boolean): void {
  const memory = new Memory();
  const R = memory.root;

  // Establish only the technical two-position carrier around R. Deliberately
  // vary creation order: issuance order must not select semantic orientation.
  if (reverseTechnicalBootstrapOrder) {
    memory.ensureEndSelfClosed(R);
    memory.ensureStartSelfClosed(R);
  } else {
    memory.ensureStartSelfClosed(R);
    memory.ensureEndSelfClosed(R);
  }

  // No semantic RootBasis names are available to these discovery functions.
  const neighbourOrbit = discoverRootNeighbourOrbit(memory, R);
  const witnessOrbit = discoverChiralWitnessOrbit(memory, R);

  same(neighbourOrbit.length, 2, "two root-neighbour states");
  same(witnessOrbit.length, 2, "two chiral witnesses");

  // Only after the pre-oriented orbit has been discovered do we materialize a
  // technical RootBasis for the already-established J implementation. Its
  // O/C field names are implementation coordinates for this audit, not input
  // to witness discovery or frame selection.
  const technicalBasis = ensureRootBasis(memory);

  const jWitnessOrbit = witnessOrbit.map((W) =>
    invertLink(memory, technicalBasis, W)
  );
  setSame(jWitnessOrbit, witnessOrbit, "J preserves the witness orbit as a set");
  same(
    invertLink(
      memory,
      technicalBasis,
      invertLink(memory, technicalBasis, witnessOrbit[0]!),
    ),
    witnessOrbit[0]!,
    "J is involutive on witness orbit",
  );

  // Before selection there is no absolute orientation.
  same(
    deriveFrameFromSelectedWitness(memory, R, witnessOrbit, []),
    "UNRESOLVED",
    "zero selected W leaves orientation unresolved",
  );
  same(
    deriveFrameFromSelectedWitness(memory, R, witnessOrbit, witnessOrbit),
    "UNRESOLVED",
    "selecting both W and J(W) leaves orientation unresolved",
  );

  const unrelated = memory.ensure(technicalBasis.L, R);
  same(
    deriveFrameFromSelectedWitness(memory, R, witnessOrbit, [unrelated]),
    "UNRESOLVED",
    "unrelated Link cannot select frame",
  );

  const semanticFingerprints: string[] = [];

  // Exercise both members without ever naming one InR or OutR beforehand.
  for (const selectedW of witnessOrbit) {
    const frame = deriveFrameFromSelectedWitness(
      memory,
      R,
      witnessOrbit,
      [selectedW],
    );
    assert(frame !== "UNRESOLVED", "one orbit member must resolve one frame");

    const view = new SemanticOrientationView(memory, frame);
    const f = buildDerivedFoundation(view);

    // START/END and therefore O/C now exist semantically. Only at this point
    // may selected W receive the familiar derived name InR = C -> R.
    same(
      selectedW,
      view.ensure(f.C, f.R),
      "selected pre-oriented W becomes derived InR after orientation",
    );

    const mirrorW = invertLink(memory, technicalBasis, selectedW);
    assert(
      witnessOrbit.includes(mirrorW) && mirrorW !== selectedW,
      "J(W) is the other chiral witness",
    );

    const selectedPoles = view.poles(selectedW);
    same(selectedPoles.start, f.C, "derived InR semantic START pole is C");
    same(selectedPoles.end, f.R, "derived InR semantic END pole is R");

    same(semanticWire(view, f.R), "8", "derived R wire");
    same(semanticWire(view, f.O), "98", "derived O wire");
    same(semanticWire(view, f.C), "68", "derived C wire");
    same(semanticWire(view, f.L), "19868", "derived L wire");
    same(semanticWire(view, f.U), "16898", "derived U wire");
    same(semanticWire(view, selectedW), "1688", "derived InR wire");

    semanticFingerprints.push(
      [
        semanticWire(view, f.R),
        semanticWire(view, f.O),
        semanticWire(view, f.C),
        semanticWire(view, f.L),
        semanticWire(view, f.U),
        semanticWire(view, selectedW),
      ].join("|"),
    );
  }

  same(
    semanticFingerprints[0],
    semanticFingerprints[1],
    "both chiral selections expose the same oriented semantic equations",
  );
}

function main(): void {
  exercise(false);
  exercise(true);

  console.log([
    "MTS v0.14 N17b: A4_PRIME_CHIRAL_TORSOR_BOOTSTRAP=GREEN_RESEARCH",
    "PREORIENTATION_POLE_MODEL=GLOBAL_Z2_TORSOR",
    "LITERAL_UNORDERED_QUOTIENT_USED=FALSE",
    "ABSOLUTE_POLE_NAMES_BEFORE_W=FALSE",
    "ROOT_NEIGHBOUR_DISCOVERY_USES_O_C_NAMES=FALSE",
    "CHIRAL_WITNESS_ORBIT_DEFINED_BEFORE_START_END=TRUE",
    "CHIRAL_WITNESS_ORBIT_SIZE=2",
    "ZERO_OR_TWO_SELECTED_W=UNRESOLVED",
    "UNRELATED_W=UNRESOLVED",
    "HISTORICAL_SELECTED_W_DERIVES_ONE_CONTEXT_FRAME=TRUE",
    "GLOBAL_SELECTED_W_NORMATIVE_AUTHORITY=FALSE",
    "START_END_DERIVED_AFTER_LOCAL_GAUGE=TRUE",
    "FINAL_A4_MODEL=CONTEXT_RELATIVE_N20B",
    "W_POST_ORIENTATION_NAME=INR",
    "J_W_POST_ORIENTATION_NAME=OUTR",
    "TECHNICAL_START_END_COORDINATES_SEMANTIC_AUTHORITY=FALSE",
    "ISSUANCE_ORDER_SEMANTIC_AUTHORITY=FALSE",
    "BOTH_CHIRAL_SELECTIONS_SAME_SEMANTIC_EQUATIONS=TRUE",
    "PRODUCTION_DELTA=NONE",
    "ACCEPTED_V013_MUTATED=FALSE",
    "MTS_V014_ACCEPTED=FALSE",
  ].join(" "));
}

main();
