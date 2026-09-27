// mts-version-evidence: candidate-from=0.14
// historical research-owner: #1666
// superseding convergence owner: #1677
// current readiness owner: #1679
//
// N18 remains executable historical evidence. Its own readiness verdict and
// freeze #1668 are invalid for acceptance even after N21 establishes a fresh
// readiness result.

import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { Memory, ensureRootBasis } from "../src/memory.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error("v0.14 historical N18 readiness guard: " + message);
}
function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), message + ": values differ");
}

const repoRoot=resolve(process.cwd(),"..");
const readJson=(path:string):any=>JSON.parse(readFileSync(join(repoRoot,path),"utf8"));
const contract=readJson("contracts/mts-contract-v0.14.json");
const conformance=readJson("contracts/mts-conformance-v0.14.json");
const traceability=readJson("traceability/mts-v0.14.json");
const policy=readJson("repo-policy.json");
const acceptance13=readJson("cutover/typescript-c1-acceptance-v0.6.json");

const memory=new Memory();
const basis=ensureRootBasis(memory);
assert(basis.R!==basis.O&&basis.O!==basis.C,"live kernel RootBasis remains proper");
same(memory.ensure(basis.O,basis.C),basis.L,"L remains canonical");
same(memory.ensure(basis.C,basis.O),basis.U,"U remains canonical");

same(contract.accepted,false,"v0.14 remains nonaccepted");
same(conformance.accepted,false,"conformance remains nonaccepted");
same(traceability.accepted,false,"traceability remains nonaccepted");
same(contract.acceptanceReady,true,"fresh N21 readiness may be green");
same(conformance.acceptanceReady,true,"fresh conformance readiness");
same(traceability.acceptanceReady,true,"fresh traceability readiness");

same(contract.readinessAudit.issue,1679,"current readiness belongs to N21");
same(contract.readinessAudit.status,"GREEN_INDEPENDENT_POST_N20C_AUDIT","current readiness status");
same(contract.readinessAudit.previousAudit.issue,1666,"N18 is historical");
same(contract.readinessAudit.previousAudit.status,"HISTORICAL_SUPERSEDED_BY_N20C","N18 superseded");
same(contract.readinessAudit.previousAudit.frozenDossier,1668,"old freeze identity");
same(contract.readinessAudit.previousAudit.validForAcceptance,false,"old freeze remains invalid");
same(contract.readinessAudit.newFreezeRequired,true,"new freeze remains required");

same(contract.foundationOrientation.finalNormativeChoice,"A4_PRIME_CONTEXT_RELATIVE_Z2_GAUGE","current A4 model");
same(contract.foundationOrientation.globalSelectedWitnessRequired,false,"global selected W rejected");
same(contract.foundationOrientation.contextRelativeFrame,true,"Context-relative frame");
same(contract.recursiveAlphabet.abstractLinkFormingPrimitiveCount,1,"one abstract Link primitive");
same(contract.recursiveAlphabet.emergentStructuralCaseCount,4,"four emergent cases");
same(contract.recursiveAlphabet.primitivePhysicalOpcodes,false,"not four primitive opcodes");

same(Object.keys(contract.requiredSemanticLaws).length,14,"current law count");
same(Object.keys(traceability.invariants).length,14,"current traceability law count");
same(conformance.requiredExecutableGates.length,70,"current required gate count");
same(conformance.plannedExecutableGates.length,0,"no planned gates remain");
assert(conformance.requiredExecutableGates.includes("ts/test/v014-post-n20c-independent-readiness-audit.test.ts"),"N21 audit is mandatory");

same(contract.candidateState.documentationComplete,false,"prose remains post-acceptance");
same(contract.acceptanceBoundary.documentationReconstructionUnblocked,false,"#1585 still blocked");
same(contract.implementation.acceptedRuntime,"mts-contract/v0.13","accepted runtime remains v0.13");
same(contract.implementation.candidateRuntimeSelectable,false,"candidate not selectable");
same(contract.implementation.productionBehaviorChanged,false,"no production behavior delta");
same(policy.packs["contract-conformance"].current.contract.path,"contracts/mts-contract-v0.13.json","policy current remains v0.13");
same(acceptance13.current.contract,"contracts/mts-contract-v0.13.json","cutover current remains v0.13");
assert(!existsSync(join(repoRoot,"cutover/typescript-c1-acceptance-v0.7.json")),"no v0.14 cutover");

console.log([
  "MTS v0.14 N18: HISTORICAL_READINESS_SUPERSEDED=GREEN",
  "CURRENT_READINESS=N21_1679",
  "OLD_FREEZE_1668_ACCEPTABLE=FALSE",
  "LAW_COUNT=14",
  "REQUIRED_GATE_COUNT=70",
  "CONTEXT_RELATIVE_A4_PRIME=TRUE",
  "ACCEPTANCE_READY=TRUE",
  "V014_ACCEPTED=FALSE",
].join(" "));
