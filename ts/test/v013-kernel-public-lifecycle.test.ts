import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.13 kernel/public lifecycle: ${message}`);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: values differ`);
}

const repoRoot = resolve(process.cwd(), "..");
const contract = JSON.parse(
  readFileSync(join(repoRoot, "contracts/mts-contract-v0.13.json"), "utf8"),
);
const conformance = JSON.parse(
  readFileSync(join(repoRoot, "contracts/mts-conformance-v0.13.json"), "utf8"),
);

same(contract.status, "candidate", "v0.13 remains candidate");
same(contract.accepted, false, "v0.13 remains unaccepted");
same(contract.acceptanceReady, false, "kernel completion does not imply readiness");
same(
  contract.implementation.acceptedRuntime,
  "mts-contract/v0.12",
  "accepted runtime remains v0.12",
);
same(
  contract.implementation.candidateRuntimeSelectable,
  false,
  "candidate runtime remains non-selectable",
);
same(
  contract.implementation.implementationComplete,
  true,
  "declared candidate kernel scope is complete",
);
same(
  contract.implementation.candidateKernelBehaviorImplemented,
  true,
  "candidate kernel behavior is implemented",
);
same(
  contract.candidateState.publicFacadeComplete,
  true,
  "public consumer facade is complete",
);
same(
  contract.candidateState.readinessAuditComplete,
  false,
  "readiness audit remains pending",
);
same(
  contract.candidateState.explicitAuthorAcceptanceRecorded,
  false,
  "explicit author acceptance remains pending",
);

const kernelFiles = contract.implementation.candidateKernelFiles ?? [];
for (const path of [
  "ts/src/v013-hierarchical-carrier.ts",
  "ts/src/v013-relative-form-materialization.ts",
  "ts/src/v013-relative-pole-context.ts",
  "ts/src/v013-relative-pole-execution.ts",
  "ts/src/v013-formal-aspect-evaluator.ts",
]) {
  assert(kernelFiles.includes(path), `candidate kernel file projected: ${path}`);
}
same(
  (contract.implementation.researchRuntimeFiles ?? []).length,
  0,
  "implemented candidate files are no longer classified as research runtime files",
);

for (const gate of [
  "ts/test/v013-public-facade.test.ts",
  "ts/test/v013-kernel-public-lifecycle.test.ts",
]) {
  assert(
    conformance.requiredExecutableGates.includes(gate),
    `mandatory v0.13 kernel/public gate projected: ${gate}`,
  );
}
same(
  (conformance.plannedExecutableGates ?? []).length,
  0,
  "no planned executable gate remains",
);
same(
  conformance.evidenceState.publicFacade,
  "green-complete-public-consumer-boundary",
  "public facade evidence is green",
);
same(
  conformance.evidenceState.candidateKernelImplementation,
  "green-complete-declared-scope",
  "candidate implementation evidence is green",
);
same(
  conformance.candidateKernelImplementation.status,
  "green-complete",
  "candidate kernel implementation slice is green",
);
same(
  conformance.candidateKernelImplementation.publicFacadeMerge,
  "d5df98791973711d054cdcf5dc3f9c25c0a8f4ae",
  "public facade evidence binds exact merge",
);
same(
  conformance.candidateKernelImplementation.candidateRuntimeSelectable,
  false,
  "implementation slice does not select candidate runtime",
);
same(
  conformance.candidateKernelImplementation.readinessAuditComplete,
  false,
  "implementation slice does not complete readiness",
);
same(
  conformance.candidateKernelImplementation.explicitAuthorAcceptanceRecorded,
  false,
  "implementation slice does not record author acceptance",
);

same(conformance.acceptanceReady, false, "conformance remains not ready");
same(conformance.accepted, false, "conformance remains unaccepted");
assert(
  conformance.acceptanceBlockers.includes(
    "independent readiness audit has not yet been recorded",
  ),
  "readiness remains an explicit blocker",
);
assert(
  conformance.acceptanceBlockers.includes(
    "explicit author acceptance of the exact candidate artifacts has not yet been recorded",
  ),
  "author acceptance remains an explicit blocker",
);
assert(
  !conformance.acceptanceBlockers.some((entry: string) =>
    /implementation|public facade|kernel/i.test(entry)
  ),
  "completed kernel/public projection is not an acceptance blocker",
);

console.log(
  "MTS v0.13 declared candidate kernel + public consumer boundary: GREEN; readiness, runtime selection and explicit author acceptance remain separate.",
);
