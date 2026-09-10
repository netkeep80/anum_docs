import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`version-kernel-consistency: ${message}`);
}

interface ContractBoundary {
  readonly schema?: string;
  readonly status?: string;
  readonly accepted?: boolean;
  readonly acceptanceReady?: boolean;
  readonly implementation?: {
    readonly package?: string;
    readonly singleLiveSemanticRuntime?: boolean;
    readonly implementationComplete?: boolean;
  };
}

interface ConformanceBoundary {
  readonly schema?: string;
  readonly contract?: string;
  readonly status?: string;
  readonly accepted?: boolean;
  readonly acceptanceReady?: boolean;
  readonly coverageState?: string;
  readonly requiredExecutableGates?: readonly string[];
  readonly plannedExecutableGates?: readonly string[];
}

const repoRoot = resolve(process.cwd(), "..");
const packageJson = JSON.parse(readFileSync(join(repoRoot, "ts/package.json"), "utf8")) as {
  readonly name?: string;
};
assert(packageJson.name === "@mts/core", "working semantic kernel package must be @mts/core");

function loadVersion(version: string): {
  readonly contract: ContractBoundary;
  readonly conformance: ConformanceBoundary;
} {
  const contract = JSON.parse(
    readFileSync(join(repoRoot, `contracts/mts-contract-v${version}.json`), "utf8"),
  ) as ContractBoundary;
  const conformance = JSON.parse(
    readFileSync(join(repoRoot, `contracts/mts-conformance-v${version}.json`), "utf8"),
  ) as ConformanceBoundary;
  return { contract, conformance };
}

function verifyKernelBackedVersion(version: string): void {
  const { contract, conformance } = loadVersion(version);
  const contractId = `mts-contract/v${version}`;
  const conformanceId = `mts-conformance/v${version}`;

  assert(contract.schema === contractId, `${version}: contract schema mismatch`);
  assert(conformance.schema === conformanceId, `${version}: conformance schema mismatch`);
  assert(conformance.contract === contractId, `${version}: conformance must point to its contract`);
  assert(contract.implementation?.package === "@mts/core", `${version}: contract must bind the real @mts/core kernel`);
  assert(contract.implementation?.singleLiveSemanticRuntime === true, `${version}: version must have one live semantic kernel`);

  const gates = conformance.requiredExecutableGates ?? [];
  assert(gates.length > 0, `${version}: paper conformance cannot exist without executable kernel gates`);
  for (const gate of gates) {
    assert(gate.startsWith("ts/test/"), `${version}: executable gate must be a real kernel test: ${gate}`);
    assert(existsSync(join(repoRoot, gate)), `${version}: declared executable gate does not exist: ${gate}`);
  }

  if (contract.acceptanceReady === true || contract.accepted === true) {
    assert(contract.implementation?.implementationComplete === true, `${version}: ready/accepted contract requires a complete kernel implementation`);
    assert(conformance.acceptanceReady === true, `${version}: ready/accepted contract requires ready conformance`);
    assert(conformance.coverageState === "complete", `${version}: ready/accepted contract requires complete executable coverage`);
    assert((conformance.plannedExecutableGates ?? []).length === 0, `${version}: ready/accepted version cannot retain planned executable gates`);
  }

  if (contract.accepted === true) {
    assert(contract.status === "accepted", `${version}: accepted contract status mismatch`);
    assert(conformance.accepted === true && conformance.status === "accepted", `${version}: accepted contract requires accepted conformance`);
  }
}

verifyKernelBackedVersion("0.11");
verifyKernelBackedVersion("0.12");

// The first fixture-first transport capability was merged into the real kernel
// before the paper candidate is updated. From now on the paper projection must
// follow that executable evidence rather than predeclare behavior ahead of it.
const qTransportGate = "ts/test/anum-two-memory-conformance.test.ts";
const candidate = loadVersion("0.12");
assert(
  candidate.conformance.requiredExecutableGates?.includes(qTransportGate) === true,
  "v0.12 conformance must derive the already-GREEN two-memory Q kernel evidence",
);
