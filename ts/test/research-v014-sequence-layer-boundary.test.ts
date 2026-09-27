// mts-version-evidence: candidate-from=0.14
// research-owner: #1669

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
].join(" "));
