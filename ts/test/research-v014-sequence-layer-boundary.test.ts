// mts-version-evidence: candidate-from=0.14
// research-owner: #1669
// context-relative A4-prime research-owner: #1673

import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { materializeExactSequence, readExactSequence } from "../src/exact-sequence.js";
import { Memory, ensureRootBasis, type LinkHandle } from "../src/memory.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error("v0.14 N20 sequence/layer boundary: " + message);
}
function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), message + ": values differ");
}
function fold(memory: Memory, values: readonly LinkHandle[]): LinkHandle {
  let current = memory.root;
  for (const value of values) current = memory.ensure(current, value);
  return current;
}

const memory = new Memory();
const basis = ensureRootBasis(memory);

const empty = materializeExactSequence(memory, []);
const oneRoot = materializeExactSequence(memory, [basis.R]);
same(empty, basis.R, "empty ExactSequence is R");
assert(oneRoot !== empty, "ExactSequence([R]) remains a distinct one-position carrier");
same(fold(memory, []), fold(memory, [basis.R]), "[] and [R] may share fold denotation R");
assert(
  materializeExactSequence(memory, [basis.L, basis.U]) !== memory.ensure(basis.L, basis.U),
  "sequence carrier is not the ordinary Pair/fold denotation",
);

const read = readExactSequence(memory, materializeExactSequence(memory, [basis.L, basis.U]));
same(read.values.length, 2, "ExactSequence preserves two positions");
same(read.values[0], basis.L, "position 0 preserved");
same(read.values[1], basis.U, "position 1 preserved");

const repoRoot = resolve(process.cwd(), "..");
const contract = JSON.parse(
  readFileSync(join(repoRoot, "contracts/mts-contract-v0.14.json"), "utf8"),
);
const layers = contract.representationLayers;
same(layers.status, "GREEN_RESEARCH", "layer registry status");
same(layers.ontology.level, 0, "ontology level");
same(JSON.stringify(layers.ontology.members), JSON.stringify(["Link"]), "Link-only ontology");
same(layers.ontology.introducesOntologyEntity, true, "ontology layer introduces Link");
for (const key of ["recursiveAlphabet", "representationsAndCodecs", "byteText", "symbolicMetanotation"]) {
  same(layers[key].introducesOntologyEntity, false, key + " introduces no ontology entity");
}
same(
  JSON.stringify(layers.recursiveAlphabet.members),
  JSON.stringify(["8", "9", "6", "1"]),
  "recursive alphabet registry",
);
assert(layers.representationsAndCodecs.members.includes("Anum"), "Anum is a representation/codec-layer concept");
assert(layers.representationsAndCodecs.members.includes("ExactSequence"), "ExactSequence is representation-layer");
assert(layers.representationsAndCodecs.members.includes("Q"), "Q is representation-layer");
assert(layers.byteText.members.includes("STRING") && layers.byteText.members.includes("UTF-8"), "byte/text boundary explicit");
assert(layers.symbolicMetanotation.members.includes("FORMAL"), "FORMAL is metanotation, not ontology");

same(contract.sequenceSemantics.rootOrigin, "R", "Anum root origin");
same(contract.sequenceSemantics.exactSequenceDistinctFromFoldDenotation, true, "ExactSequence != fold denotation");
same(contract.sequenceSemantics.recursiveLinkCodecDistinct, true, "recursive Link codec != Anum");


type Frame = "DIRECT" | "MIRROR" | "UNRESOLVED";

function discoverRootNeighbourOrbit(localMemory: Memory, R: LinkHandle): readonly LinkHandle[] {
  const out: LinkHandle[] = [];
  for (const link of localMemory.allLinks()) {
    if (link === R) continue;
    const p = localMemory.poles(link);
    if ((p.start === link && p.end === R) || (p.start === R && p.end === link)) out.push(link);
  }
  assert(new Set(out).size === 2, "root-neighbour orbit has two members");
  return Object.freeze([...new Set(out)]);
}

function complementaryRootAdjacency(localMemory: Memory, R: LinkHandle, neighbour: LinkHandle): LinkHandle {
  const p = localMemory.poles(neighbour);
  if (p.start === neighbour && p.end === R) return localMemory.ensure(R, neighbour);
  if (p.start === R && p.end === neighbour) return localMemory.ensure(neighbour, R);
  throw new Error("v0.14 N20 sequence/layer boundary: invalid root neighbour");
}

function discoverWitnessOrbit(localMemory: Memory, R: LinkHandle): readonly LinkHandle[] {
  const orbit = discoverRootNeighbourOrbit(localMemory, R)
    .map((n) => complementaryRootAdjacency(localMemory, R, n));
  assert(new Set(orbit).size === 2, "witness orbit has two members");
  return Object.freeze(orbit);
}

function deriveFrameFromFoundationCarrier(
  localMemory: Memory,
  R: LinkHandle,
  witnessOrbit: readonly LinkHandle[],
  foundationSelectionCarrier: LinkHandle,
): Frame {
  const selected = readExactSequence(localMemory, foundationSelectionCarrier).values;
  const unique = [...new Set(selected)];
  if (unique.length !== 1) return "UNRESOLVED";
  const W = unique[0]!;
  if (!witnessOrbit.includes(W)) return "UNRESOLVED";
  const p = localMemory.poles(W);
  if (p.end === R && p.start !== R) return "DIRECT";
  if (p.start === R && p.end !== R) return "MIRROR";
  return "UNRESOLVED";
}

function exerciseLinkCarriedOrientation(reverseBootstrap: boolean): void {
  const localMemory = new Memory();
  const R = localMemory.root;
  if (reverseBootstrap) {
    localMemory.ensureEndSelfClosed(R);
    localMemory.ensureStartSelfClosed(R);
  } else {
    localMemory.ensureStartSelfClosed(R);
    localMemory.ensureEndSelfClosed(R);
  }

  const orbit = discoverWitnessOrbit(localMemory, R);
  const none = materializeExactSequence(localMemory, []);
  same(deriveFrameFromFoundationCarrier(localMemory, R, orbit, none), "UNRESOLVED", "zero selected witnesses");

  const both = materializeExactSequence(localMemory, orbit);
  same(deriveFrameFromFoundationCarrier(localMemory, R, orbit, both), "UNRESOLVED", "two selected witnesses");

  const unrelated = localMemory.ensure(orbit[0]!, orbit[1]!);
  same(
    deriveFrameFromFoundationCarrier(
      localMemory,
      R,
      orbit,
      materializeExactSequence(localMemory, [unrelated]),
    ),
    "UNRESOLVED",
    "unrelated selected Link",
  );

  const first = deriveFrameFromFoundationCarrier(
    localMemory,
    R,
    orbit,
    materializeExactSequence(localMemory, [orbit[0]!]),
  );
  const second = deriveFrameFromFoundationCarrier(
    localMemory,
    R,
    orbit,
    materializeExactSequence(localMemory, [orbit[1]!]),
  );
  assert(first !== "UNRESOLVED" && second !== "UNRESOLVED", "one orbit member resolves a frame");
  assert(first !== second, "two witness orbit members resolve opposite frames");

  same(
    deriveFrameFromFoundationCarrier(
      localMemory,
      R,
      orbit,
      materializeExactSequence(localMemory, [orbit[0]!, orbit[0]!]),
    ),
    first,
    "duplicate occurrence of the same semantic W remains one selection",
  );
}

exerciseLinkCarriedOrientation(false);
exerciseLinkCarriedOrientation(true);


// ---------------------------------------------------------------------------
// N20b / #1673: context-relative A4' gauge orientation.
//
// The carrier below is intentionally BELOW ExactSequence/Anum/Q/FORMAL.
// It uses only Links and raw incidence. Pole order is never interpreted as
// semantic START/END; whenever an edge is inspected, its poles are treated
// extensionally as an unordered incidence pair.
//
// Key construction:
//
//   context orbit  {K, J(K)}
//   witness orbit  {W, J(W)}
//
// There are exactly two J-equivariant perfect matchings between the two
// two-point torsors. A matching is materialized as two mirror incidence
// edges e and J(e), then packed into one J-fixed Link:
//
//   M(e) = Link(e, J(e))
//
// because:
//   J(M(e)) = Link(J(J(e)), J(e)) = Link(e, J(e)) = M(e)
//
// Thus the MATCHING carrier is objective/J-invariant even though it relates
// chiral states. No global choice of W is required.

type GaugeTransport = "ID" | "J";

function rawInvertLink(
  m: Memory,
  R: LinkHandle,
  source: LinkHandle,
  memo = new Map<LinkHandle, LinkHandle>(),
): LinkHandle {
  const known = memo.get(source);
  if (known !== undefined) return known;

  const p = m.poles(source);
  let result: LinkHandle;

  if (p.start === source && p.end === source) {
    same(source, R, "only R is the raw self-self fixed root in this witness");
    result = R;
  } else if (p.start === source) {
    result = m.ensureEndSelfClosed(rawInvertLink(m, R, p.end, memo));
  } else if (p.end === source) {
    result = m.ensureStartSelfClosed(rawInvertLink(m, R, p.start, memo));
  } else {
    result = m.ensure(
      rawInvertLink(m, R, p.end, memo),
      rawInvertLink(m, R, p.start, memo),
    );
  }

  memo.set(source, result);
  return result;
}

function unorderedIncident(
  m: Memory,
  edge: LinkHandle,
  a: LinkHandle,
  b: LinkHandle,
): boolean {
  const p = m.poles(edge);
  return (p.start === a && p.end === b) || (p.start === b && p.end === a);
}

function jFixedMatchingCarrier(
  m: Memory,
  R: LinkHandle,
  contextState: LinkHandle,
  witnessState: LinkHandle,
): LinkHandle {
  const edge = m.ensure(contextState, witnessState);
  const mirrorEdge = rawInvertLink(m, R, edge);
  const carrier = m.ensure(edge, mirrorEdge);
  same(rawInvertLink(m, R, carrier), carrier, "matching carrier is J-fixed");
  return carrier;
}

function matchingEdges(m: Memory, carrier: LinkHandle): readonly [LinkHandle, LinkHandle] {
  const p = m.poles(carrier);
  assert(p.start !== carrier && p.end !== carrier, "matching carrier is an ordinary pair Link");
  return Object.freeze([p.start, p.end]);
}

function selectedWitnessForContext(
  m: Memory,
  contextState: LinkHandle,
  witnessOrbit: readonly LinkHandle[],
  carrier: LinkHandle,
): LinkHandle | "UNRESOLVED" {
  const matches = new Set<LinkHandle>();
  for (const edge of matchingEdges(m, carrier)) {
    for (const witness of witnessOrbit) {
      if (unorderedIncident(m, edge, contextState, witness)) matches.add(witness);
    }
  }
  return matches.size === 1 ? [...matches][0]! : "UNRESOLVED";
}

function transportBetweenSelections(
  m: Memory,
  R: LinkHandle,
  fromWitness: LinkHandle,
  toWitness: LinkHandle,
): GaugeTransport | "UNRESOLVED" {
  if (fromWitness === toWitness) return "ID";
  if (rawInvertLink(m, R, fromWitness) === toWitness) return "J";
  return "UNRESOLVED";
}

function composeTransport(
  left: GaugeTransport,
  right: GaugeTransport,
): GaugeTransport {
  return left === right ? "ID" : "J";
}

function makeChiralContextOrbit(
  m: Memory,
  R: LinkHandle,
  witnessOrbit: readonly LinkHandle[],
  seed: LinkHandle,
): readonly [LinkHandle, LinkHandle] {
  // This creates one arbitrary chiral Context state and then takes its J-image.
  // The semantic object is the orbit as a set; the technical construction order
  // carries no authority.
  const K = m.ensure(seed, witnessOrbit[0]!);
  const JK = rawInvertLink(m, R, K);
  assert(K !== JK, "Context state must itself be chiral");
  same(rawInvertLink(m, R, JK), K, "Context orbit is a two-point J-torsor");
  return Object.freeze([K, JK]);
}

function exerciseContextRelativeGauge(): void {
  const m = new Memory();
  const R = m.root;

  // Materialize only the raw two-position root neighbourhood.
  m.ensureStartSelfClosed(R);
  m.ensureEndSelfClosed(R);
  const omega = discoverWitnessOrbit(m, R);
  same(omega.length, 2, "objective witness orbit has two members before any Context orientation");
  assert(omega[0] !== omega[1], "W differs from J(W)");
  same(rawInvertLink(m, R, omega[0]!), omega[1]!, "J exchanges the witness orbit");
  same(rawInvertLink(m, R, omega[1]!), omega[0]!, "J returns the witness orbit");

  // Build three independent chiral Context orbits.
  const seedA = m.ensure(omega[0]!, omega[0]!);
  const seedB = m.ensure(omega[1]!, omega[1]!);
  const seedC = m.ensure(seedA, seedB);
  const A = makeChiralContextOrbit(m, R, omega, seedA);
  const B = makeChiralContextOrbit(m, R, omega, seedB);
  const C = makeChiralContextOrbit(m, R, omega, seedC);

  // Same orientation: A0 and B0 are both matched to omega[0].
  const selA = jFixedMatchingCarrier(m, R, A[0], omega[0]!);
  const selB = jFixedMatchingCarrier(m, R, B[0], omega[0]!);

  // Opposite orientation: C0 is matched to J(omega[0]).
  const selC = jFixedMatchingCarrier(m, R, C[0], omega[1]!);

  const chiA = selectedWitnessForContext(m, A[0], omega, selA);
  const chiB = selectedWitnessForContext(m, B[0], omega, selB);
  const chiC = selectedWitnessForContext(m, C[0], omega, selC);
  assert(chiA !== "UNRESOLVED" && chiB !== "UNRESOLVED" && chiC !== "UNRESOLVED", "all oriented Contexts resolve χ(K)");
  same(chiA, omega[0], "χ(A)=W");
  same(chiB, omega[0], "χ(B)=W");
  same(chiC, omega[1], "χ(C)=J(W)");

  // The SAME objective matching also orients the mirror Context state
  // covariantly: J(K) is matched to J(χ(K)).
  same(
    selectedWitnessForContext(m, A[1], omega, selA),
    omega[1],
    "same J-fixed carrier gives χ(J(A))=J(χ(A))",
  );
  same(
    selectedWitnessForContext(m, C[1], omega, selC),
    omega[0],
    "opposite carrier remains J-covariant on mirror Context",
  );

  const gAB = transportBetweenSelections(m, R, chiA, chiB);
  const gBC = transportBetweenSelections(m, R, chiB, chiC);
  const gAC = transportBetweenSelections(m, R, chiA, chiC);
  same(gAB, "ID", "same-chirality Contexts have Id transport");
  same(gBC, "J", "opposite-chirality Contexts have J transport");
  same(gAC, "J", "A to C transport is J");
  same(composeTransport(gAB, gBC), gAC, "g_AB o g_BC = g_AC");

  const gCA = transportBetweenSelections(m, R, chiC, chiA);
  same(gCA, "J", "g_AB = g_BA for Z2 transport");
  same(composeTransport(gAC, gCA), "ID", "J o J = Id");
  same(
    transportBetweenSelections(m, R, chiA, chiA),
    "ID",
    "g_AA = Id",
  );

  // No-go theorem for an achiral Context:
  //
  // If K = J(K), a J-equivariant selection relation cannot choose only W.
  // The mirror of any K--W incidence is another K--J(W) incidence.
  // We demonstrate this with R, which is J-fixed.
  const achiralSelection = jFixedMatchingCarrier(m, R, R, omega[0]!);
  same(
    selectedWitnessForContext(m, R, omega, achiralSelection),
    "UNRESOLVED",
    "J-fixed Context cannot select exactly one member of a nontrivial witness torsor",
  );

  // There are exactly two equivariant matchings between two two-point torsors:
  // parallel and crossed. They are distinct objective J-fixed carriers.
  const parallel = jFixedMatchingCarrier(m, R, A[0], omega[0]!);
  const crossed = jFixedMatchingCarrier(m, R, A[0], omega[1]!);
  assert(parallel !== crossed, "parallel and crossed J-equivariant matchings are distinct");
  same(rawInvertLink(m, R, parallel), parallel, "parallel matching is objective/J-fixed");
  same(rawInvertLink(m, R, crossed), crossed, "crossed matching is objective/J-fixed");

  // Each context-oriented semantic view derives the same local equations.
  function frameFor(w: LinkHandle): "DIRECT" | "MIRROR" {
    const p = m.poles(w);
    if (p.end === R && p.start !== R) return "DIRECT";
    if (p.start === R && p.end !== R) return "MIRROR";
    throw new Error("v0.14 N20b: witness does not resolve a local frame");
  }

  const viewA = new SemanticOrientationView(m, frameFor(chiA));
  const viewC = new SemanticOrientationView(m, frameFor(chiC));
  const fA = buildDerivedFoundation(viewA);
  const fC = buildDerivedFoundation(viewC);
  const fingerprintA = [
    semanticWire(viewA, fA.R),
    semanticWire(viewA, fA.O),
    semanticWire(viewA, fA.C),
    semanticWire(viewA, fA.L),
    semanticWire(viewA, fA.U),
    semanticWire(viewA, chiA),
  ].join("|");
  const fingerprintC = [
    semanticWire(viewC, fC.R),
    semanticWire(viewC, fC.O),
    semanticWire(viewC, fC.C),
    semanticWire(viewC, fC.L),
    semanticWire(viewC, fC.U),
    semanticWire(viewC, chiC),
  ].join("|");
  same(fingerprintA, fingerprintC, "mirror Context frames preserve local semantic equations");
}

exerciseContextRelativeGauge();

// Pre-acceptance documentation ownership is metadata over the real kernel,
// never a replacement for executable semantics.
const trace = JSON.parse(readFileSync(join(repoRoot, "traceability/mts-v0.14.json"), "utf8"));
const registry = JSON.parse(readFileSync(join(repoRoot, "requirements/mts-v0.14.json"), "utf8"));
const lawIds = Object.keys(contract.requiredSemanticLaws).sort();
const requirementIds = registry.requirements.map((item: any) => String(item.id)).sort();
same(JSON.stringify(requirementIds), JSON.stringify(lawIds), "every v0.14 law has one projection record");
same(lawIds.length, 14, "v0.14 law count after N20");

const ownerKeys = new Set<string>();
for (const requirement of registry.requirements as any[]) {
  same(requirement.status, "candidate", requirement.id + " remains pre-acceptance");
  same(
    requirement.authority.pointer,
    "/requiredSemanticLaws/" + requirement.id,
    requirement.id + " contract authority pointer",
  );
  assert(existsSync(join(repoRoot, requirement.docProjection.path)), requirement.id + " owner document exists");
  const ownerKey = requirement.docProjection.path + "#" + requirement.docProjection.anchor;
  assert(!ownerKeys.has(ownerKey), requirement.id + " canonical owner is unique");
  ownerKeys.add(ownerKey);

  const invariant = trace.invariants[requirement.id];
  assert(invariant !== undefined, requirement.id + " traceability exists");
  same(invariant.documentationOwner.path, requirement.docProjection.path, requirement.id + " owner path");
  same(invariant.documentationOwner.anchor, requirement.docProjection.anchor, requirement.id + " owner anchor");
}
same(contract.candidateState.documentationOwnershipMapComplete, true, "documentation owner map complete");
same(contract.candidateState.documentationComplete, false, "human prose reconstruction remains post-acceptance");
same(contract.acceptanceBoundary.documentationReconstructionUnblocked, false, "#1585 remains blocked");

console.log([
  "MTS v0.14 N20: SEQUENCE_LAYER_BOUNDARY=GREEN",
  "ANUM=ROOTED_SEQUENCE_REPRESENTATION",
  "EXACT_SEQUENCE_POSITIONAL_IDENTITY=TRUE",
  "EXACT_SEQUENCE_NE_FOLD_DENOTATION=TRUE",
  "RECURSIVE_LINK_CODEC_NE_ANUM=TRUE",
  "ONTOLOGY=LINK_ONLY",
  "REPRESENTATION_LAYERS_EXPLICIT=TRUE",
  "NON_ONTOLOGY_LAYERS_INTRODUCE_ENTITY=FALSE",
  "FOUNDATION_SELECTION_AUTHORITY=EXACT_SEQUENCE_OF_LINKS",
  "HOST_SELECTED_WITNESS_ARGUMENT_AUTHORITY=FALSE",
  "ONE_CANONICAL_DOC_OWNER_PER_LAW=TRUE",
  "PROSE_RECONSTRUCTION=DEFERRED_TO_1585",
  "A4_CONTEXT_RELATIVE_GAUGE=GREEN_RESEARCH",
  "OBJECTIVE_CHIRAL_ORBIT_BEFORE_OBSERVER=TRUE",
  "PREORIENTED_SELECTION_CARRIER=J_FIXED_LINK_MATCHING",
  "ACHIRAL_CONTEXT_SINGLE_SELECTION=IMPOSSIBLE",
  "SAME_FRAME_CONTEXTS_SAME_SEMANTICS=TRUE",
  "MIRROR_FRAME_CONTEXTS_COVARIANT=TRUE",
  "TRANSPORT_ID_J_COMPOSITION=TRUE",
  "GLOBAL_SELECTED_W_REQUIRED=FALSE",
].join(" "));
