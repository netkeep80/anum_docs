import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.12 C9 readiness audit: ${message}`);
}

const repoRoot = resolve(process.cwd(), "..");
const read = (path: string): string => readFileSync(join(repoRoot, path), "utf8");
const contract = JSON.parse(read("contracts/mts-contract-v0.12.json")) as any;
const conformance = JSON.parse(read("contracts/mts-conformance-v0.12.json")) as any;
const traceability = JSON.parse(read("traceability/mts-v0.12.json")) as any;
const acceptedContract = JSON.parse(read("contracts/mts-contract-v0.11.json")) as any;
const acceptedConformance = JSON.parse(read("contracts/mts-conformance-v0.11.json")) as any;
const policy = JSON.parse(read("repo-policy.json")) as any;

assert(contract.status === "candidate", "v0.12 remains candidate");
assert(contract.accepted === false, "v0.12 remains not accepted");
assert(contract.acceptanceReady === true, "v0.12 contract is acceptance-ready after C9");
assert(contract.implementation?.candidateRuntimeSelectable === false, "candidate remains non-selectable");
assert(contract.implementation?.implementationComplete === true, "declared candidate kernel scope remains complete");
assert(contract.candidateState?.publicFacadeComplete === true, "C7 public facade remains complete");
assert(contract.candidateState?.documentationComplete === true, "C8 documentation remains complete");
assert(contract.candidateState?.traceabilityComplete === true, "C8 traceability remains complete");

assert(conformance.status === "candidate", "v0.12 conformance remains candidate");
assert(conformance.accepted === false, "v0.12 conformance remains not accepted");
assert(conformance.acceptanceReady === true, "v0.12 conformance is acceptance-ready after C9");
assert(conformance.coverageState === "complete", "C9 establishes complete declared-scope coverage");
assert((conformance.plannedExecutableGates ?? []).length === 0, "no planned executable gates remain");
assert(conformance.evidenceState?.readinessC9 === "green-confirmed", "C9 is green-confirmed");
assert(conformance.evidenceState?.acceptanceC10 === "next", "C10 is the next lifecycle stage");
assert(conformance.implementationSlices?.readinessAudit?.status === "green-confirmed", "readiness audit slice is complete");

const blockers = conformance.acceptanceBlockers ?? [];
assert(
  blockers.length === 1 && blockers[0] === "v0.12 has not passed explicit acceptance cutover",
  "only explicit C10 acceptance remains an acceptance blocker",
);
assert(!blockers.some((entry: string) => entry.includes("6/2")), "temporary contract budget debt is not a readiness/acceptance blocker");

assert(acceptedContract.schema === "mts-contract/v0.11", "accepted contract identity remains v0.11");
assert(acceptedContract.status === "accepted" && acceptedContract.accepted === true, "v0.11 contract remains accepted");
assert(acceptedConformance.schema === "mts-conformance/v0.11", "accepted conformance identity remains v0.11");
assert(acceptedConformance.status === "accepted" && acceptedConformance.accepted === true, "v0.11 conformance remains accepted");
assert(contract.acceptedCurrent === "mts-contract/v0.11", "candidate still points to accepted v0.11");
assert(conformance.acceptedCurrent?.contract === "mts-contract/v0.11", "conformance current contract remains v0.11");
assert(conformance.acceptedCurrent?.conformance === "mts-conformance/v0.11", "conformance current corpus remains v0.11");

const marker = /\/\/ mts-version-evidence: required-from=(\d+)\.(\d+)/;
const mandatory = readdirSync(join(repoRoot, "ts/test"))
  .filter((name) => name.endsWith(".test.ts"))
  .filter((name) => {
    const source = readFileSync(join(repoRoot, "ts/test", name), "utf8");
    const match = marker.exec(source);
    if (match === null) return false;
    const major = Number(match[1]);
    const minor = Number(match[2]);
    return major < 0 || (major === 0 && minor <= 12);
  })
  .map((name) => `ts/test/${name}`)
  .sort();

const declaredGates = [...(conformance.requiredExecutableGates ?? [])].sort();
for (const gate of mandatory) {
  assert(declaredGates.includes(gate), `required-from=0.12 kernel evidence is projected: ${gate}`);
}
for (const gate of declaredGates) {
  assert(existsSync(join(repoRoot, gate)), `declared executable gate exists: ${gate}`);
}

assert(traceability.schema === "mts-traceability/v0.2", "v0.12 traceability schema remains v0.2");
assert(traceability.contract === "contracts/mts-contract-v0.12.json", "traceability contract target is exact");
assert(traceability.conformance === "contracts/mts-conformance-v0.12.json", "traceability conformance target is exact");
assert(
  Object.keys(traceability.invariants ?? {}).sort().join("|") ===
    Object.keys(contract.requiredSemanticLaws ?? {}).sort().join("|"),
  "traceability invariant identity exactly matches required semantic laws",
);

const rules = new Map<string, any>((policy.document_relations?.rules ?? []).map((rule: any) => [rule.id, rule]));
assert(rules.get("v012-contract-ready")?.value === true, "policy positively pins contract readiness");
assert(rules.get("v012-conformance-ready")?.value === true, "policy positively pins conformance readiness");
assert(rules.get("v012-conformance-complete")?.value === "complete", "policy positively pins complete coverage");
assert(!rules.has("v012-contract-status-candidate"), "B0 removes temporary contract candidate-status pin after author ACCEPT");
assert(!rules.has("v012-conformance-status-candidate"), "B0 removes temporary conformance candidate-status pin after author ACCEPT");
assert(!rules.has("v012-contract-not-accepted"), "B0 removes temporary contract not-accepted pin after author ACCEPT");
assert(!rules.has("v012-conformance-not-accepted"), "B0 removes temporary conformance not-accepted pin after author ACCEPT");

const contributing = read("docs/CONTRIBUTING.md");
assert(contributing.includes("C9 = завершён"), "contributing lifecycle records completed C9");
assert(contributing.includes("C10 = следующий этап"), "contributing lifecycle points to C10");

console.log("MTS v0.12 C9 independent readiness audit: GREEN.");
