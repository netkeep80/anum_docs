import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ContractIndexError,
  buildContractObservatoryIndex,
  serializeContractObservatoryIndex,
  type ContractIndexErrorCode,
} from "../src/contract-index.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Contract Observatory V3a: ${message}`);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}

function expectCode(effect: () => unknown, code: ContractIndexErrorCode, message: string): void {
  try {
    effect();
  } catch (error) {
    assert(error instanceof ContractIndexError, `${message}: wrong error type`);
    same(error.code, code, `${message}: wrong error code`);
    return;
  }
  throw new Error(`Contract Observatory V3a: ${message}: expected rejection`);
}

const repositoryRoot = process.cwd();
const realIndex = buildContractObservatoryIndex(repositoryRoot);
same(realIndex.schema, "mts-contract-observatory-index/v0.1", "index schema");
same(realIndex.versions.length, 2, "current repository has two live pairs");
same(
  realIndex.versions.map((version) => version.contractId).join(","),
  "mts-contract/v0.10,mts-contract/v0.11",
  "real repository uses natural version order",
);
same(realIndex.currentContractPath, "contracts/mts-contract-v0.11.json", "policy current contract");
same(realIndex.currentConformancePath, "contracts/mts-conformance-v0.11.json", "policy current conformance");
same(realIndex.previousContractPath, "contracts/mts-contract-v0.10.json", "policy previous contract");
same(realIndex.previousConformancePath, "contracts/mts-conformance-v0.10.json", "policy previous conformance");
same(realIndex.acceptancePath, "cutover/typescript-c1-acceptance-v0.4.json", "acceptance path comes from policy");

const current = realIndex.versions.find((version) => version.isCurrent);
const previous = realIndex.versions.find((version) => version.isPrevious);
assert(current !== undefined && previous !== undefined, "current and previous summaries exist");
same(current.contractId, "mts-contract/v0.11", "current classification comes from evidence");
same(previous.contractId, "mts-contract/v0.10", "previous classification comes from evidence");
same(current.status, "accepted", "current status projected");
same(current.accepted, true, "current accepted flag projected");
same(current.acceptanceReady, true, "current readiness projected");
same(current.coverageState, "complete", "current coverage projected");
same(current.requiredExecutableGateCount, 5, "current executable gate count projected");
assert(current.requiredNegativeVectorCount > 0, "current negative-vector coverage projected");

const serialized = serializeContractObservatoryIndex(realIndex);
same(serialized, serializeContractObservatoryIndex(buildContractObservatoryIndex(repositoryRoot)), "serialization is deterministic");
assert(!serialized.includes("rootBasisTarget"), "index does not copy raw contract bodies");
assert(!serialized.includes("TopBind(R,S)"), "index does not copy semantic equations");
const livePaths = new Set(realIndex.versions.flatMap((version) => [version.contractPath, version.conformancePath]));
same(livePaths.size, 4, "all four live evidence files accounted for exactly once");

interface Fixture {
  readonly root: string;
  readonly acceptancePath: string;
}

function createFixture(versions = ["0.9", "0.10", "1.2", "1.10"]): Fixture {
  const root = mkdtempSync(join(tmpdir(), "mts-contract-index-"));
  mkdirSync(join(root, "contracts"));
  mkdirSync(join(root, "cutover"));
  for (const version of versions) {
    writeJson(root, `contracts/mts-contract-v${version}.json`, {
      schema: `mts-contract/v${version}`,
      status: "accepted",
      accepted: true,
      acceptanceReady: true,
      semanticBase: "mts-contract/v0.1",
      observableSemanticDelta: true,
      conformanceCorpus: `contracts/mts-conformance-v${version}.json`,
      issue: 1,
      candidateLifecycleIssue: 2,
    });
    writeJson(root, `contracts/mts-conformance-v${version}.json`, {
      schema: `mts-conformance/v${version}`,
      status: "accepted",
      accepted: true,
      contract: `mts-contract/v${version}`,
      coverageState: "complete",
      requiredExecutableGates: [`test-${version}`],
      requiredNegativeVectors: [`negative-${version}`],
    });
  }
  const current = versions.at(-1)!;
  const previous = versions.at(-2)!;
  const acceptancePath = "cutover/acceptance.json";
  writeJson(root, "repo-policy.json", {
    contract_conformance: {
      current: {
        contract: { path: `contracts/mts-contract-v${current}.json` },
        conformance: { path: `contracts/mts-conformance-v${current}.json` },
      },
      previous: {
        contract: { path: `contracts/mts-contract-v${previous}.json` },
        conformance: { path: `contracts/mts-conformance-v${previous}.json` },
      },
      acceptance: { document: { path: acceptancePath } },
    },
  });
  writeJson(root, acceptancePath, {
    current: {
      contract: `contracts/mts-contract-v${current}.json`,
      conformance: `contracts/mts-conformance-v${current}.json`,
    },
  });
  return { root, acceptancePath };
}

function writeJson(root: string, path: string, value: unknown): void {
  writeFileSync(join(root, path), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function overwrite(root: string, path: string, value: unknown): void {
  writeJson(root, path, value);
}

function fixtureCase(effect: (fixture: Fixture) => void): void {
  const fixture = createFixture();
  try {
    effect(fixture);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
}

const natural = createFixture();
try {
  same(
    buildContractObservatoryIndex(natural.root).versions.map((version) => version.contractId).join(","),
    "mts-contract/v0.9,mts-contract/v0.10,mts-contract/v1.2,mts-contract/v1.10",
    "numeric version ordering is not lexical ordering",
  );
} finally {
  rmSync(natural.root, { recursive: true, force: true });
}

fixtureCase(({ root }) => {
  writeFileSync(join(root, "contracts/mts-contract-v0.9.json"), "{broken", "utf8");
  expectCode(() => buildContractObservatoryIndex(root), "malformed-json", "malformed contract JSON");
});
fixtureCase(({ root }) => {
  overwrite(root, "contracts/mts-contract-v0.9.json", {
    status: "accepted", accepted: true, acceptanceReady: true,
    semanticBase: "mts-contract/v0.1", observableSemanticDelta: true,
    conformanceCorpus: "contracts/mts-conformance-v0.9.json",
  });
  expectCode(() => buildContractObservatoryIndex(root), "invalid-document", "missing contract schema");
});
fixtureCase(({ root }) => {
  overwrite(root, "contracts/mts-contract-v0.9.json", {
    schema: "mts-contract/v0.9", status: "accepted", accepted: true, acceptanceReady: true,
    semanticBase: "mts-contract/v0.1", observableSemanticDelta: true,
    conformanceCorpus: "contracts/not-present.json",
  });
  expectCode(() => buildContractObservatoryIndex(root), "missing-conformance", "missing declared conformance");
});
fixtureCase(({ root }) => {
  writeJson(root, "contracts/mts-conformance-v9.9.json", {
    schema: "mts-conformance/v9.9", status: "accepted", accepted: true,
    contract: "mts-contract/v9.9", coverageState: "complete",
    requiredExecutableGates: [], requiredNegativeVectors: [],
  });
  expectCode(() => buildContractObservatoryIndex(root), "orphan-conformance", "orphan conformance");
});
fixtureCase(({ root }) => {
  writeJson(root, "contracts/mts-contract-v9.9.json", {
    schema: "mts-contract/v0.9", status: "accepted", accepted: true, acceptanceReady: true,
    semanticBase: "mts-contract/v0.1", observableSemanticDelta: true,
    conformanceCorpus: "contracts/mts-conformance-v0.9.json",
  });
  expectCode(() => buildContractObservatoryIndex(root), "duplicate-contract-id", "duplicate contract ID");
});
fixtureCase(({ root }) => {
  writeJson(root, "contracts/mts-conformance-v9.9.json", {
    schema: "mts-conformance/v0.9", status: "accepted", accepted: true,
    contract: "mts-contract/v0.9", coverageState: "complete",
    requiredExecutableGates: [], requiredNegativeVectors: [],
  });
  expectCode(() => buildContractObservatoryIndex(root), "duplicate-conformance-id", "duplicate conformance ID");
});
fixtureCase(({ root }) => {
  overwrite(root, "contracts/mts-conformance-v0.9.json", {
    schema: "mts-conformance/v0.9", status: "accepted", accepted: true,
    contract: "mts-contract/v0.10", coverageState: "complete",
    requiredExecutableGates: [], requiredNegativeVectors: [],
  });
  expectCode(() => buildContractObservatoryIndex(root), "pair-mismatch", "declared pair mismatch");
});
fixtureCase(({ root }) => {
  overwrite(root, "repo-policy.json", {
    contract_conformance: {
      current: { contract: { path: "contracts/missing.json" }, conformance: { path: "contracts/mts-conformance-v1.10.json" } },
      previous: { contract: { path: "contracts/mts-contract-v1.2.json" }, conformance: { path: "contracts/mts-conformance-v1.2.json" } },
      acceptance: { document: { path: "cutover/acceptance.json" } },
    },
  });
  expectCode(() => buildContractObservatoryIndex(root), "policy-path-missing", "policy points outside discovered pairs");
});
fixtureCase(({ root, acceptancePath }) => {
  rmSync(join(root, acceptancePath));
  expectCode(() => buildContractObservatoryIndex(root), "acceptance-missing", "missing acceptance manifest");
});
fixtureCase(({ root, acceptancePath }) => {
  overwrite(root, acceptancePath, {
    current: { contract: "contracts/mts-contract-v1.2.json", conformance: "contracts/mts-conformance-v1.2.json" },
  });
  expectCode(() => buildContractObservatoryIndex(root), "acceptance-mismatch", "acceptance disagrees with policy");
});
fixtureCase(({ root }) => {
  writeJson(root, "contracts/mts-contract-v1.x.json", {
    schema: "mts-contract/v1.x", status: "accepted", accepted: true, acceptanceReady: true,
    semanticBase: "mts-contract/v0.1", observableSemanticDelta: true,
    conformanceCorpus: "contracts/mts-conformance-v1.x.json",
  });
  writeJson(root, "contracts/mts-conformance-v1.x.json", {
    schema: "mts-conformance/v1.x", status: "accepted", accepted: true,
    contract: "mts-contract/v1.x", coverageState: "complete",
    requiredExecutableGates: [], requiredNegativeVectors: [],
  });
  expectCode(() => buildContractObservatoryIndex(root), "invalid-schema-version", "ambiguous schema version");
});
