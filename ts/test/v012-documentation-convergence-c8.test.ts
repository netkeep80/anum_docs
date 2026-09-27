import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.12 C8 normative convergence: ${message}`);
}

const repoRoot = resolve(process.cwd(), "..");
const read = (path: string): string => readFileSync(join(repoRoot, path), "utf8");
const contract = JSON.parse(read("contracts/mts-contract-v0.12.json")) as any;
const conformance = JSON.parse(read("contracts/mts-conformance-v0.12.json")) as any;
const traceabilityPath = join(repoRoot, "traceability/mts-v0.12.json");

const candidateLifecycle = contract.status === "candidate" && contract.accepted === false;
const acceptedLifecycle = contract.status === "accepted" && contract.accepted === true;
assert(candidateLifecycle || acceptedLifecycle, "v0.12 is the documented candidate or accepted release");
assert(contract.implementation?.candidateRuntimeSelectable === false, "no alternate candidate runtime is selectable");
assert(contract.candidateState?.documentationComplete === true, "canonical documentation is complete");
assert(contract.candidateState?.traceabilityComplete === true, "traceability projection is complete");

assert(
  conformance.status === contract.status && conformance.accepted === contract.accepted,
  "contract and conformance lifecycle stay aligned",
);
assert(conformance.evidenceState?.documentationC8 === "green-confirmed", "C8 is green-confirmed");

assert(existsSync(traceabilityPath), "v0.12 traceability manifest exists");
const traceability = JSON.parse(readFileSync(traceabilityPath, "utf8")) as any;
assert(traceability.schema === "mts-traceability/v0.2", "v0.12 uses traceability schema v0.2");
assert(
  Object.keys(traceability.invariants ?? {}).sort().join("|") ===
    Object.keys(contract.requiredSemanticLaws ?? {}).sort().join("|"),
  "traceability invariant IDs exactly match contract semantic laws",
);

assert(
  contract.candidateState?.documentationComplete === true,
  "immutable v0.12 contract records documentation completion",
);
assert(
  conformance.evidenceState?.documentationC8 === "green-confirmed",
  "immutable v0.12 conformance records C8 documentation convergence",
);

console.log("MTS v0.12 C8 historical documentation and traceability convergence: GREEN from immutable v0.12 artifacts; current v0.14 Markdown is not historical authority.");
