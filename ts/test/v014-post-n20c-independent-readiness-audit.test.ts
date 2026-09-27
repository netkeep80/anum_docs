// mts-version-evidence: candidate-from=0.14
// research-owner: #1679
//
// N21: fresh independent post-N20c readiness audit.
// This gate certifies readiness only. It MUST NOT accept or cut over v0.14.

import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { materializeExactSequence } from "../src/exact-sequence.js";
import { Memory, ensureRootBasis } from "../src/memory.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error("v0.14 N21 readiness audit: " + message);
}
function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), message + ": values differ");
}
function sameSet(actual: readonly string[], expected: readonly string[], message: string): void {
  const a=[...new Set(actual)].sort();
  const e=[...new Set(expected)].sort();
  assert(a.length===actual.length, message + ": duplicate actual values");
  assert(e.length===expected.length, message + ": duplicate expected values");
  assert(JSON.stringify(a)===JSON.stringify(e), message);
}

const repoRoot=resolve(process.cwd(),"..");
const readJson=(path:string):any=>JSON.parse(readFileSync(join(repoRoot,path),"utf8"));
const contract=readJson("contracts/mts-contract-v0.14.json");
const conformance=readJson("contracts/mts-conformance-v0.14.json");
const traceability=readJson("traceability/mts-v0.14.json");
const requirements=readJson("requirements/mts-v0.14.json");
const policy=readJson("repo-policy.json");
const acceptance13=readJson("cutover/typescript-c1-acceptance-v0.6.json");

// Live-kernel anchor: this is not a JSON-only readiness declaration.
const memory=new Memory();
const basis=ensureRootBasis(memory);
assert(basis.R!==basis.O && basis.O!==basis.C, "live root basis remains proper");
same(memory.ensure(basis.O,basis.C),basis.L,"L remains canonical");
same(memory.ensure(basis.C,basis.O),basis.U,"U remains canonical");

// ExactSequence remains an executable positional carrier distinct from a fold.
const empty=materializeExactSequence(memory,[]);
const explicitRoot=materializeExactSequence(memory,[basis.R]);
same(empty,basis.R,"empty ExactSequence is rooted at R");
assert(explicitRoot!==empty,"one explicit R position is distinct from empty sequence");
same(memory.ensure(basis.R,basis.R),basis.R,"ordinary fold of R over R collapses to R");

// Candidate lifecycle.
same(contract.status,"candidate","contract status");
same(conformance.status,"candidate","conformance status");
same(traceability.status,"candidate","traceability status");
same(contract.accepted,false,"contract remains nonaccepted");
same(conformance.accepted,false,"conformance remains nonaccepted");
same(traceability.accepted,false,"traceability remains nonaccepted");
same(contract.acceptanceReady,true,"contract readiness");
same(conformance.acceptanceReady,true,"conformance readiness");
same(traceability.acceptanceReady,true,"traceability readiness");
same(traceability.acceptance,null,"candidate has no acceptance manifest");
same(contract.candidateState.readinessAuditComplete,true,"N21 readiness complete");
same(contract.candidateState.explicitAuthorAcceptanceRecorded,false,"author acceptance absent");
same(contract.implementation.acceptedRuntime,"mts-contract/v0.13","accepted runtime remains v0.13");
same(contract.implementation.candidateRuntimeSelectable,false,"candidate runtime not selectable");
same(contract.implementation.productionBehaviorChanged,false,"no production behavior change");
same(contract.implementation.singleLiveSemanticRuntime,true,"single live runtime");
assert(!existsSync(join(repoRoot,"cutover/typescript-c1-acceptance-v0.7.json")),"no v0.14 cutover exists");

// Exact semantic graph.
const laws=Object.keys(contract.requiredSemanticLaws).sort();
const invariants=Object.keys(traceability.invariants).sort();
const requirementIds=(requirements.requirements as any[]).map((x:any)=>String(x.id)).sort();
same(laws.length,14,"law count");
sameSet(invariants,laws,"traceability invariant identity");
sameSet(requirementIds,laws,"requirement projection identity");

const positives=new Set<string>(conformance.requiredPositiveVectors);
const negatives=new Set<string>(conformance.requiredNegativeVectors);
const mandatoryGates=conformance.requiredExecutableGates as string[];
const gateAuthority=new Set<string>(mandatoryGates);

same(mandatoryGates.length,70,"mandatory gate count");
same(conformance.plannedExecutableGates.length,0,"no planned gates remain");
assert(gateAuthority.has("ts/test/v014-post-n20c-independent-readiness-audit.test.ts"),"N21 audit is mandatory");

const ownerKeys=new Set<string>();
for(const id of laws){
  const invariant=traceability.invariants[id];
  assert(invariant!==undefined,id+" invariant exists");
  same(invariant.contractPointer,"/requiredSemanticLaws/"+id,id+" exact contract pointer");

  const pv=invariant.positive.requiredPositiveVectors as string[];
  assert(Array.isArray(pv)&&pv.length>0,id+" has positive evidence");
  for(const v of pv) assert(positives.has(v),id+" positive vector outside authority: "+v);

  const nv=invariant.negative.requiredNegativeVectors as string[];
  assert(Array.isArray(nv),id+" negative vectors array");
  for(const v of nv) assert(negatives.has(v),id+" negative vector outside authority: "+v);

  const gates=invariant.requiredExecutableGates as string[];
  assert(Array.isArray(gates)&&gates.length>0,id+" has executable gates");
  for(const gate of gates){
    assert(gateAuthority.has(gate),id+" gate outside authority: "+gate);
    assert(existsSync(join(repoRoot,gate)),id+" gate missing: "+gate);
  }

  const owner=invariant.documentationOwner;
  assert(owner?.registry==="requirements/mts-v0.14.json",id+" documentation registry");
  assert(typeof owner.path==="string"&&existsSync(join(repoRoot,owner.path)),id+" future owner document exists");
  assert(typeof owner.anchor==="string"&&owner.anchor.length>0,id+" future owner anchor exists");
  const key=owner.path+"#"+owner.anchor;
  assert(!ownerKeys.has(key),id+" future owner must be unique");
  ownerKeys.add(key);
}
for(const gate of mandatoryGates) assert(existsSync(join(repoRoot,gate)),"mandatory gate exists: "+gate);

// A4′ exact post-N20c semantics.
const a4=contract.foundationOrientation;
same(a4.preOrientationPoleModel,"OBJECTIVE_GLOBAL_Z2_TORSOR","objective torsor");
same(a4.objectiveChiralityExistsBeforeObserver,true,"chirality exists before observer");
same(a4.observerCreatesChirality,false,"observer does not create chirality");
same(JSON.stringify(a4.chiralOrbit),JSON.stringify(["W","J(W)"]),"chiral orbit");
same(a4.globalSelectedWitnessRequired,false,"global selected W rejected");
same(a4.foundationGlobalFrameRequired,false,"global frame not required");
same(a4.contextRelativeFrame,true,"Context-relative frame");
same(a4.contextOrientationCarrier,"ONE_SIDED_SELF_INCIDENCE_LINK","Link-native Context marker");
same(a4.contextFrameStates,2,"two Context frame states");
same(a4.exactSequenceOrientationAuthority,false,"ExactSequence not orientation authority");
same(a4.relativeTransport.group,"Z2","transport group");
same(JSON.stringify(a4.relativeTransport.elements),JSON.stringify(["Id","J"]),"transport elements");
assert(a4.relativeTransport.laws.includes("g_AA = Id"),"g_AA law");
assert(a4.relativeTransport.laws.includes("g_AB = g_BA"),"g_AB symmetry law");
assert(a4.relativeTransport.laws.includes("g_AB ∘ g_BC = g_AC"),"transport composition law");
assert(a4.relativeTransport.laws.includes("J ∘ J = Id"),"J involution");
same(a4.semanticCovariance.sameFrameContextsSameSemantics,true,"same-frame covariance");
same(a4.semanticCovariance.mirrorFrameContextsCovariant,true,"mirror covariance");
same(a4.finalNormativeChoice,"A4_PRIME_CONTEXT_RELATIVE_Z2_GAUGE","A4 normative choice");

same(contract.recursiveAlphabet.abstractLinkFormingPrimitiveCount,1,"one abstract Link-forming primitive");
same(contract.recursiveAlphabet.emergentStructuralCaseCount,4,"four emergent cases");
same(contract.recursiveAlphabet.preOrientedJOrbitClassCount,3,"three pre-oriented J classes");
same(contract.recursiveAlphabet.orientedRolesRelativeToContext,true,"recursive roles are Context-relative");
same(contract.recursiveAlphabet.primitivePhysicalOpcodes,false,"four forms are not primitive opcodes");

// Representation boundary.
const layers=contract.representationLayers;
same(layers.ontology.level,0,"ontology level");
same(JSON.stringify(layers.ontology.members),JSON.stringify(["Link"]),"Link-only ontology");
same(layers.ontology.introducesOntologyEntity,true,"L0 ontology entity");
for(const key of ["recursiveStructure","representationsAndCodecs","byteText","symbolicMetanotation"]){
  same(layers[key].introducesOntologyEntity,false,key+" introduces no ontology entity");
}
assert(layers.representationsAndCodecs.members.includes("Anum"),"Anum is representation");
assert(layers.representationsAndCodecs.members.includes("ExactSequence"),"ExactSequence is representation");
assert(layers.representationsAndCodecs.members.includes("Q"),"Q is representation/interpreter");
assert(layers.byteText.members.includes("STRING")&&layers.byteText.members.includes("UTF-8"),"byte/text boundary");
assert(layers.symbolicMetanotation.members.includes("FORMAL"),"FORMAL is metanotation");

// Anum sequence semantics.
same(contract.sequenceSemantics.anum,"rooted compact representation/coding of a sequence of Links","Anum sequence meaning");
same(contract.sequenceSemantics.exactSequenceDistinctFromFoldDenotation,true,"ExactSequence != fold");
same(contract.sequenceSemantics.recursiveLinkCodecDistinct,true,"recursive Link codec != Anum");
same(contract.sequenceSemantics.rootOrigin,"R","sequence root origin");
same(contract.recursiveAlphabet.isAnumAlphabet,false,"recursive alphabet is not Anum alphabet");

// Generalized-MP inherited theorem chain.
same(
  JSON.stringify(contract.generalizedMpNonRegression.theoremChain),
  JSON.stringify([
    "A14 root asymmetry/chirality",
    "A16 contextual detachment",
    "A17 recursive application-closed frontier",
    "A72w flat generalized modus ponens"
  ]),
  "generalized-MP theorem chain"
);
same(
  JSON.stringify(contract.generalizedMpNonRegression.coveredProfiles),
  JSON.stringify(["1->0","1->1","1->N","N->1","N->M"]),
  "generalized-MP profiles"
);
same(contract.generalizedMpNonRegression.fullInheritedWitnessChainRequired,true,"full inherited MP chain required");
for(const gate of [
  "ts/test/research-v013-root-asymmetry-chirality-a14.test.ts",
  "ts/test/research-v013-contextual-truth-dynamic-duality-a16.test.ts",
  "ts/test/research-v013-application-closed-frontier-a17.test.ts",
  "ts/test/research-v013-flat-generalized-modus-ponens-a72w.test.ts"
]) assert(gateAuthority.has(gate),"MP chain gate mandatory: "+gate);

// Documentation remains projection-only before acceptance.
same(contract.candidateState.documentationOwnershipMapComplete,true,"doc owner map complete");
same(contract.candidateState.documentationComplete,false,"human prose remains post-acceptance");
same(contract.acceptanceBoundary.documentationReconstructionUnblocked,false,"#1585 remains blocked");
same(requirements.projectionState,"PREDECLARED_OWNER_ONLY_PROSE_DEFERRED_TO_1585","projection state");

// Readiness provenance and old-freeze invalidation.
same(contract.readinessAudit.status,"GREEN_INDEPENDENT_POST_N20C_AUDIT","contract readiness status");
same(contract.readinessAudit.issue,1679,"current readiness issue");
same(contract.readinessAudit.previousAudit.issue,1666,"historical audit issue");
same(contract.readinessAudit.previousAudit.frozenDossier,1668,"historical freeze");
same(contract.readinessAudit.previousAudit.validForAcceptance,false,"old freeze invalid");
same(contract.readinessAudit.newFreezeRequired,true,"fresh freeze required");
same(contract.readinessAudit.onlyRemainingBlocker,"explicit author acceptance","only blocker");
same(conformance.readinessAudit.requiredExecutableGateCount,70,"conformance gate count");
same(conformance.readinessAudit.plannedExecutableGateCount,0,"conformance planned gates");
same(conformance.readinessAudit.candidateSemanticReady,true,"semantic readiness");
same(conformance.readinessAudit.accepted,false,"readiness does not accept");
same(traceability.readinessAudit.issue,1679,"traceability readiness issue");

// Current accepted release remains immutable/current.
same(policy.packs["contract-conformance"].current.contract.path,"contracts/mts-contract-v0.13.json","policy current contract");
same(policy.packs["contract-conformance"].current.conformance.path,"contracts/mts-conformance-v0.13.json","policy current conformance");
same(acceptance13.current.contract,"contracts/mts-contract-v0.13.json","accepted current contract");
same(acceptance13.current.conformance,"contracts/mts-conformance-v0.13.json","accepted current conformance");

console.log([
  "MTS v0.14 N21: POST_N20C_INDEPENDENT_READINESS=GREEN",
  "LAW_COUNT=14",
  "REQUIRED_GATE_COUNT=70",
  "PLANNED_GATE_COUNT=0",
  "CONTEXT_RELATIVE_A4_PRIME=TRUE",
  "ONE_LINK_PRIMITIVE_FOUR_EMERGENT_CASES=TRUE",
  "ANUM_SEQUENCE_SEMANTICS=GREEN",
  "REPRESENTATION_LAYER_BOUNDARY=GREEN",
  "GENERALIZED_MP_FULL_CHAIN=GREEN",
  "DOCUMENTATION_OWNER_MAP=GREEN",
  "OLD_FREEZE_1668_VALID=FALSE",
  "NEW_FREEZE_REQUIRED=TRUE",
  "ACCEPTANCE_READY=TRUE",
  "MTS_V014_ACCEPTED=FALSE",
  "ONLY_REMAINING_BLOCKER=EXPLICIT_AUTHOR_ACCEPTANCE",
].join(" "));
