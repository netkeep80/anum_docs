import { existsSync, readFileSync, readdirSync } from "node:fs";
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

interface KernelEvidenceGate {
  readonly path: string;
  readonly requiredFrom: readonly [number, number];
}

const repoRoot = resolve(process.cwd(), "..");
const packageJson = JSON.parse(readFileSync(join(repoRoot, "ts/package.json"), "utf8")) as {
  readonly name?: string;
};
assert(packageJson.name === "@mts/core", "working semantic kernel package must be @mts/core");

function parseVersion(version: string): readonly [number, number] {
  const match = /^(\d+)\.(\d+)$/.exec(version);
  assert(match !== null, `unsupported version syntax: ${version}`);
  return [Number(match[1]), Number(match[2])];
}

function versionAtLeast(actual: readonly [number, number], required: readonly [number, number]): boolean {
  return actual[0] > required[0] || (actual[0] === required[0] && actual[1] >= required[1]);
}

function kernelEvidenceGates(): readonly KernelEvidenceGate[] {
  const directory = join(repoRoot, "ts/test");
  const marker = /\/\/ mts-version-evidence: required-from=(\d+\.\d+)/;
  const result: KernelEvidenceGate[] = [];
  for (const name of readdirSync(directory).sort()) {
    if (!name.endsWith(".test.ts")) continue;
    const source = readFileSync(join(directory, name), "utf8");
    const match = marker.exec(source);
    if (match === null) continue;
    result.push(Object.freeze({
      path: `ts/test/${name}`,
      requiredFrom: parseVersion(match[1]),
    }));
  }
  return Object.freeze(result);
}

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

function verifyDeclaredGateRunsOnKernel(version: string, gate: string): void {
  assert(gate.startsWith("ts/test/"), `${version}: executable gate must be a real kernel test: ${gate}`);
  const absolute = join(repoRoot, gate);
  assert(existsSync(absolute), `${version}: declared executable gate does not exist: ${gate}`);
  const source = readFileSync(absolute, "utf8");
  assert(
    source.includes("../src/") || source.includes("@mts/core"),
    `${version}: declared gate must execute the real MTS kernel rather than paper-only assertions: ${gate}`,
  );
}

function verifyKernelBackedVersion(version: string): void {
  const { contract, conformance } = loadVersion(version);
  const parsedVersion = parseVersion(version);
  const contractId = `mts-contract/v${version}`;
  const conformanceId = `mts-conformance/v${version}`;

  assert(contract.schema === contractId, `${version}: contract schema mismatch`);
  assert(conformance.schema === conformanceId, `${version}: conformance schema mismatch`);
  assert(conformance.contract === contractId, `${version}: conformance must point to its contract`);
  assert(contract.implementation?.package === "@mts/core", `${version}: contract must bind the real @mts/core kernel`);
  assert(contract.implementation?.singleLiveSemanticRuntime === true, `${version}: version must have one live semantic kernel`);

  const gates = conformance.requiredExecutableGates ?? [];
  assert(gates.length > 0, `${version}: paper conformance cannot exist without executable kernel gates`);
  for (const gate of gates) verifyDeclaredGateRunsOnKernel(version, gate);

  const requiredKernelEvidence = kernelEvidenceGates()
    .filter((gate) => versionAtLeast(parsedVersion, gate.requiredFrom))
    .map((gate) => gate.path);
  const missingKernelEvidence = requiredKernelEvidence.filter((gate) => !gates.includes(gate));

  if (missingKernelEvidence.length > 0) {
    assert(contract.acceptanceReady !== true, `${version}: paper contract cannot become ready before kernel evidence is projected: ${missingKernelEvidence.join(", ")}`);
    assert(contract.accepted !== true, `${version}: paper contract cannot become accepted before kernel evidence is projected: ${missingKernelEvidence.join(", ")}`);
    assert(conformance.acceptanceReady !== true, `${version}: conformance cannot become ready while kernel evidence is missing: ${missingKernelEvidence.join(", ")}`);
    assert(conformance.accepted !== true, `${version}: conformance cannot become accepted while kernel evidence is missing: ${missingKernelEvidence.join(", ")}`);
    assert(conformance.coverageState !== "complete", `${version}: conformance cannot claim complete coverage while kernel evidence is missing`);
  }

  if (contract.acceptanceReady === true || contract.accepted === true) {
    assert(missingKernelEvidence.length === 0, `${version}: ready/accepted version must include every required kernel evidence gate`);
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
