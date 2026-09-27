// mts-version-evidence: candidate-from=0.14
// historical research-owner: #1666
// superseding adversarial-closure owner: #1669

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

// Historical N18 remains an executable kernel-backed guard even though its
// readiness verdict was superseded by N20. This prevents lifecycle evidence
// from degrading into paper-only JSON assertions.
const memory = new Memory();
const basis = ensureRootBasis(memory);
assert(basis.R !== basis.O && basis.O !== basis.C, "live kernel root basis remains proper");
same(memory.ensure(basis.O, basis.C), basis.L, "live kernel L remains canonical");
same(memory.ensure(basis.C, basis.O), basis.U, "live kernel U remains canonical");

same(contract.accepted,false,"candidate remains nonaccepted");
same(conformance.accepted,false,"conformance remains nonaccepted");
same(traceability.accepted,false,"traceability remains nonaccepted");

same(contract.acceptanceReady,false,"N18 readiness no longer applies to live N20 candidate");
same(conformance.acceptanceReady,false,"conformance awaits post-N20 re-audit");
same(traceability.acceptanceReady,false,"traceability awaits post-N20 re-audit");
same(contract.candidateState.readinessAuditComplete,false,"live readiness audit is pending");

same(contract.readinessAudit.status,"BLOCKING_PENDING_POST_N20_REAUDIT","contract readiness state");
same(contract.readinessAudit.previousAudit.status,"HISTORICAL_SUPERSEDED_BY_N20","N18 is preserved as historical evidence");
same(contract.readinessAudit.previousAudit.issue,1666,"historical N18 issue");
same(contract.readinessAudit.previousAudit.frozenDossier,1668,"historical frozen dossier");
same(conformance.readinessAudit.invalidatedFrozenDossier,1668,"conformance invalidates old freeze");
same(conformance.lifecycle.preN20Freeze1668ValidForAcceptance,false,"#1668 cannot be accepted");

same(Object.keys(contract.requiredSemanticLaws).length,14,"N20 law set");
same(conformance.requiredExecutableGates.length,68,"N20 mandatory executable gates");
same(conformance.plannedExecutableGates.length,1,"one new independent audit remains planned");
same(
  conformance.plannedExecutableGates[0],
  "pending:v014-post-n20-independent-readiness-audit",
  "post-N20 independent audit token",
);
assert(existsSync(join(repoRoot,"requirements/mts-v0.14.json")),"v0.14 documentation owner registry exists");
same(contract.candidateState.adversarialClosureComplete,true,"N20 semantic closure implemented");
same(contract.candidateState.documentationOwnershipMapComplete,true,"documentation ownership map implemented");
same(contract.acceptanceBoundary.documentationReconstructionUnblocked,false,"prose reconstruction remains post-acceptance");
same(contract.implementation.candidateRuntimeSelectable,false,"candidate still not selectable");
same(contract.implementation.productionBehaviorChanged,false,"N20 changes no production runtime");

console.log([
  "MTS v0.14 N18: HISTORICAL_READINESS_SUPERSEDED=GREEN",
  "SUPERSEDED_BY=N20_1669",
  "OLD_FREEZE_1668_ACCEPTABLE=FALSE",
  "LAW_COUNT=14",
  "REQUIRED_GATE_COUNT=68",
  "N20_ADVERSARIAL_CLOSURE=GREEN",
  "POST_N20_INDEPENDENT_READINESS=PENDING",
  "ACCEPTANCE_READY=FALSE",
  "V014_ACCEPTED=FALSE",
].join(" "));
