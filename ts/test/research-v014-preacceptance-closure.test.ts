// mts-version-evidence: candidate-from=0.14
// research-owner: #1677
//
// Final pre-acceptance closure witness for N20c.
// This gate remains kernel-backed and does not accept v0.14.

import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { materializeExactSequence, readExactSequence } from "../src/exact-sequence.js";
import { Memory, ensureRootBasis, type LinkHandle } from "../src/memory.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error("v0.14 N20c closure: " + message);
}
function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), message + ": values differ");
}
function fold(memory: Memory, values: readonly LinkHandle[]): LinkHandle {
  let current = memory.root;
  for (const value of values) current = memory.ensure(current, value);
  return current;
}

const repoRoot = resolve(process.cwd(), "..");
const readJson = (path: string): any =>
  JSON.parse(readFileSync(join(repoRoot, path), "utf8"));

const contract = readJson("contracts/mts-contract-v0.14.json");
const conformance = readJson("contracts/mts-conformance-v0.14.json");
const traceability = readJson("traceability/mts-v0.14.json");
const registry = readJson("requirements/mts-v0.14.json");

// ---------------------------------------------------------------------------
// Live kernel: sequence semantics must be structural, not paper-only.

const memory = new Memory();
const basis = ensureRootBasis(memory);

const empty = materializeExactSequence(memory, []);
const oneRoot = materializeExactSequence(memory, [basis.R]);
same(empty, basis.R, "empty ExactSequence is rooted at R");
assert(oneRoot !== empty, "ExactSequence([R]) preserves one explicit position");

same(
  fold(memory, []),
  fold(memory, [basis.R]),
  "fold denotation may collapse [] and [R] to the same R",
);
assert(
  empty !== oneRoot,
  "ExactSequence identity is therefore distinct from fold denotation",
);

const two = materializeExactSequence(memory, [basis.L, basis.U]);
const read = readExactSequence(memory, two);
same(read.values.length, 2, "ExactSequence preserves position count");
same(read.values[0], basis.L, "ExactSequence position 0");
same(read.values[1], basis.U, "ExactSequence position 1");
assert(
  two !== memory.ensure(basis.L, basis.U),
  "ExactSequence carrier is not ordinary Pair/fold denotation",
);

same(contract.sequenceSemantics.rootOrigin, "R", "Anum sequence origin");
same(
  contract.sequenceSemantics.exactSequenceDistinctFromFoldDenotation,
  true,
  "ExactSequence != fold denotation",
);
same(
  contract.sequenceSemantics.recursiveLinkCodecDistinct,
  true,
  "recursive Link codec != Anum",
);

// ---------------------------------------------------------------------------
// One Link primitive -> four emergent cases; orientation is Context-relative.

same(contract.recursiveAlphabet.abstractLinkFormingPrimitiveCount, 1, "one abstract Link-forming primitive");
same(contract.recursiveAlphabet.emergentStructuralCaseCount, 4, "four emergent self-incidence cases");
same(contract.recursiveAlphabet.preOrientedJOrbitClassCount, 3, "three pre-oriented J-orbit classes");
same(contract.recursiveAlphabet.orientedRolesRelativeToContext, true, "START/END are Context-relative roles");
same(contract.recursiveAlphabet.primitivePhysicalOpcodes, false, "recursive forms are not four primitive physical opcodes");

same(contract.foundationOrientation.preOrientationPoleModel, "OBJECTIVE_GLOBAL_Z2_TORSOR", "objective pre-oriented torsor");
same(contract.foundationOrientation.objectiveChiralityExistsBeforeObserver, true, "chirality predates observer");
same(contract.foundationOrientation.observerCreatesChirality, false, "observer does not create chirality");
same(contract.foundationOrientation.globalSelectedWitnessRequired, false, "no Foundation-global selected W required");
same(contract.foundationOrientation.contextRelativeFrame, true, "frame is Context-relative");
same(
  contract.foundationOrientation.contextOrientationCarrier,
  "ONE_SIDED_SELF_INCIDENCE_LINK",
  "orientation carrier is Link-native one-sided self-incidence",
);
same(contract.foundationOrientation.contextFrameStates, 2, "Context has exactly two frame states");
same(contract.foundationOrientation.exactSequenceOrientationAuthority, false, "ExactSequence is not orientation authority");

same(contract.foundationOrientation.relativeTransport.group, "Z2", "relative transport group");
same(
  JSON.stringify(contract.foundationOrientation.relativeTransport.elements),
  JSON.stringify(["Id", "J"]),
  "relative transport elements",
);
same(contract.foundationOrientation.semanticCovariance.sameFrameContextsSameSemantics, true, "same-frame semantics");
same(contract.foundationOrientation.semanticCovariance.mirrorFrameContextsCovariant, true, "mirror-frame covariance");

// ---------------------------------------------------------------------------
// Explicit semantic/representation layer boundary.

const layers = contract.representationLayers;
same(layers.status, "GREEN_RESEARCH", "layer registry status");
same(layers.ontology.level, 0, "ontology level");
same(JSON.stringify(layers.ontology.members), JSON.stringify(["Link"]), "Link-only ontology");
same(layers.ontology.introducesOntologyEntity, true, "L0 introduces Link");

for (const key of [
  "recursiveStructure",
  "representationsAndCodecs",
  "byteText",
  "symbolicMetanotation",
]) {
  same(layers[key].introducesOntologyEntity, false, key + " introduces no second ontology entity");
}

assert(layers.representationsAndCodecs.members.includes("Anum"), "Anum belongs to representation layer");
assert(layers.representationsAndCodecs.members.includes("ExactSequence"), "ExactSequence belongs to representation layer");
assert(layers.representationsAndCodecs.members.includes("Q"), "Q belongs to representation layer");
assert(layers.byteText.members.includes("STRING") && layers.byteText.members.includes("UTF-8"), "byte/text layer explicit");
assert(layers.symbolicMetanotation.members.includes("FORMAL"), "FORMAL belongs to metanotation layer");

// ---------------------------------------------------------------------------
// Generalized MP non-regression owns the inherited theorem chain explicitly.

same(
  JSON.stringify(contract.generalizedMpNonRegression.theoremChain),
  JSON.stringify([
    "A14 root asymmetry/chirality",
    "A16 contextual detachment",
    "A17 recursive application-closed frontier",
    "A72w flat generalized modus ponens",
  ]),
  "generalized MP theorem chain",
);
same(
  JSON.stringify(contract.generalizedMpNonRegression.coveredProfiles),
  JSON.stringify(["1->0", "1->1", "1->N", "N->1", "N->M"]),
  "generalized MP cardinality profiles",
);
same(contract.generalizedMpNonRegression.fullInheritedWitnessChainRequired, true, "full MP chain is mandatory");

// ---------------------------------------------------------------------------
// Requirement/documentation projection exists before prose reconstruction.

same(registry.schema, "mts-requirement-registry/v0.2", "registry schema");
same(registry.status, "candidate", "registry stays pre-acceptance");
same(registry.issue, 1677, "registry owner issue");
same(contract.documentationProjectionRegistry, "requirements/mts-v0.14.json", "contract points to registry");
same(traceability.documentationProjectionRegistry, "requirements/mts-v0.14.json", "traceability points to registry");

const lawIds = Object.keys(contract.requiredSemanticLaws).sort();
const reqIds = registry.requirements.map((item: any) => String(item.id)).sort();
same(lawIds.length, 14, "v0.14 law count");
same(JSON.stringify(reqIds), JSON.stringify(lawIds), "one requirement projection per law");

const ownerKeys = new Set<string>();
for (const requirement of registry.requirements as any[]) {
  same(requirement.status, "candidate", requirement.id + " remains candidate");
  same(
    requirement.authority.pointer,
    "/requiredSemanticLaws/" + requirement.id,
    requirement.id + " exact authority pointer",
  );
  assert(
    existsSync(join(repoRoot, requirement.docProjection.path)),
    requirement.id + " canonical owner document exists",
  );
  const ownerKey = requirement.docProjection.path + "#" + requirement.docProjection.anchor;
  assert(!ownerKeys.has(ownerKey), requirement.id + " canonical doc owner is unique");
  ownerKeys.add(ownerKey);

  const invariant = traceability.invariants[requirement.id];
  assert(invariant !== undefined, requirement.id + " traceability invariant exists");
  same(invariant.documentationOwner.registry, "requirements/mts-v0.14.json", requirement.id + " owner registry");
  same(invariant.documentationOwner.path, requirement.docProjection.path, requirement.id + " owner path");
  same(invariant.documentationOwner.anchor, requirement.docProjection.anchor, requirement.id + " owner anchor");
}

same(contract.candidateState.documentationOwnershipMapComplete, true, "documentation owner map complete");
same(contract.candidateState.documentationComplete, false, "human prose reconstruction remains deferred");
same(contract.acceptanceBoundary.documentationReconstructionUnblocked, false, "#1585 remains blocked before acceptance");

same(contract.acceptanceReady, true, "N20c semantic closure is now independently readiness-audited");
same(conformance.acceptanceReady, true, "conformance readiness is now independently audited");
same(traceability.acceptanceReady, true, "traceability readiness is now independently audited");
same(contract.accepted, false, "v0.14 remains nonaccepted");

console.log([
  "MTS v0.14 N20c: PREACCEPTANCE_CLOSURE=GREEN",
  "LAW_COUNT=14",
  "ONTOLOGY_PRIMITIVE_LINK=ONE",
  "ABSTRACT_LINK_FORMING_PRIMITIVE=ONE",
  "EMERGENT_SELF_INCIDENCE_CASES=FOUR",
  "PREORIENTED_J_ORBIT_CLASSES=THREE",
  "CONTEXT_RELATIVE_A4_PRIME=TRUE",
  "EXACT_SEQUENCE_NE_FOLD_DENOTATION=TRUE",
  "RECURSIVE_CODEC_NE_ANUM=TRUE",
  "REPRESENTATION_LAYERS_EXPLICIT=TRUE",
  "GENERALIZED_MP_FULL_CHAIN_REQUIRED=TRUE",
  "ONE_CANONICAL_DOC_OWNER_PER_LAW=TRUE",
  "POST_N20C_READINESS_AUDIT=GREEN_N21",
  "MTS_V014_ACCEPTED=FALSE",
].join(" "));
