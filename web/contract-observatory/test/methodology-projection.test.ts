import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildMethodologyProjection,
  serializeMethodologyProjection,
  type MethodologyProjection,
} from "../src/methodology-projection.js";
import {
  buildContractObservatoryIndex,
  type ContractObservatoryIndex,
  type ContractVersionSummary,
} from "../src/contract-index.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Contract Observatory V4b: ${message}`);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}

function throws(action: () => unknown, expected: RegExp, message: string): void {
  let thrown: unknown;
  try {
    action();
  } catch (error) {
    thrown = error;
  }
  assert(thrown instanceof Error, `${message}: expected Error`);
  assert(expected.test(thrown.message), `${message}: ${thrown.message}`);
}

const repositoryRoot = process.cwd();
const index = buildContractObservatoryIndex(repositoryRoot);
const projection: MethodologyProjection = buildMethodologyProjection(repositoryRoot, index);

same(projection.schema, "mts-contract-methodology-projection/v0.1", "projection schema");
same(projection.versions.length, 2, "live v0.10/v0.11 pair projected exactly once");
same(
  projection.versions.map((version) => version.contractId).join(","),
  "mts-contract/v0.10,mts-contract/v0.11",
  "projection preserves V3 deterministic version order",
);

const current = projection.versions.find((version) => version.isCurrent);
assert(current !== undefined, "current contract version exists");
same(current.contractId, "mts-contract/v0.11", "current comes from V3 evidence, not file recency");
same(current.accepted, true, "explicit accepted state preserved");
assert(current.positiveVectors.length > 0, "positive conformance vectors are first-class");
assert(current.negativeVectors.length > 0, "negative/veto vectors are first-class");
assert(current.executableGates.length > 0, "challenge/gate evidence is first-class");
assert(current.acceptanceReferences.length > 0, "explicit acceptance evidence is represented");
assert(
  current.negativeVectors.every((vector) => vector.polarity === "negative"),
  "negative vectors cannot collapse into positive evidence",
);

same(current.theoryReferences.length, 0, "semanticBase is not projected as normative TheoryReference");
assert(
  current.unresolvedRelations.includes("theory-reference"),
  "missing machine-addressable theory authority remains explicit",
);
assert(
  !current.lifecycle.some((entry) => ["research", "problem", "candidate", "challenged", "modeled"].includes(entry.stage)),
  "accepted contract does not reconstruct unsupported historical lifecycle stages from nearby fields",
);
assert(current.lifecycle.some((entry) => entry.stage === "accepted"), "explicit accepted flag supports accepted stage");
assert(current.lifecycle.some((entry) => entry.stage === "released"), "exact acceptance pointer supports released stage");

const serialized = serializeMethodologyProjection(projection);
same(
  serialized,
  serializeMethodologyProjection(buildMethodologyProjection(repositoryRoot, buildContractObservatoryIndex(repositoryRoot))),
  "same repository evidence serializes byte-identically",
);
assert(!serialized.includes("semanticLink"), "methodology projection does not claim MTS semantic Link identity");

withSyntheticRepository(({ repoRoot, syntheticIndex }) => {
  const candidate = buildMethodologyProjection(repoRoot, syntheticIndex({
    status: "candidate",
    accepted: false,
    acceptanceReady: false,
    isCurrent: false,
    isPrevious: false,
  }));
  const version = candidate.versions[0]!;
  same(version.acceptanceReferences.length, 0, "candidate without acceptance pointer has no acceptance authority");
  assert(version.lifecycle.some((entry) => entry.stage === "candidate"), "explicit candidate status supports candidate stage");
  assert(!version.lifecycle.some((entry) => entry.stage === "accepted"), "candidate is not inferred accepted");
  assert(!version.lifecycle.some((entry) => entry.stage === "released"), "candidate is not inferred released");
  assert(version.unresolvedRelations.includes("acceptance-reference"), "candidate missing acceptance remains unresolved");
});

withSyntheticRepository(({ repoRoot, syntheticIndex, writeAcceptance }) => {
  writeAcceptance({});
  const acceptedWithoutPointer = buildMethodologyProjection(repoRoot, syntheticIndex({
    status: "accepted",
    accepted: true,
    acceptanceReady: true,
    isCurrent: true,
    isPrevious: false,
  }));
  const version = acceptedWithoutPointer.versions[0]!;
  assert(version.lifecycle.some((entry) => entry.stage === "accepted"), "accepted flag is represented");
  assert(!version.lifecycle.some((entry) => entry.stage === "released"), "current classification alone cannot invent release evidence");
  assert(version.unresolvedRelations.includes("acceptance-reference"), "missing acceptance pointer stays explicit");
});

withSyntheticRepository(({ repoRoot, syntheticIndex, writeContract, writeConformance, writeTraceability }) => {
  writeContract({ requiredSemanticLaws: { law: "synthetic law" } });
  writeConformance({ requiredAlphaVectors: [] });
  writeTraceability({
    schema: "mts-traceability/v9.9",
    contract: "contracts/mts-contract-v9.1.json",
    conformance: "contracts/mts-conformance-v9.1.json",
    acceptance: "cutover/acceptance.json",
    invariants: {
      law: {
        contractPointer: "/requiredSemanticLaws/law",
        positive: {
          requiredGenesisVectors: [],
          requiredMeaningVectors: [],
          requiredC2ClassificationVectors: [],
          requiredCompatibilityVectors: [],
        },
        negative: { requiredNegativeVectors: [] },
        requiredExecutableGates: [],
      },
    },
  });
  const version = buildMethodologyProjection(repoRoot, syntheticIndex()).versions[0]!;
  same(version.semanticInvariants.length, 0, "unsupported future traceability schema is not interpreted as v0.1");
  same(version.traceabilityManifestPath, null, "unsupported future traceability schema is not selected");
  assert(version.unresolvedRelations.includes("traceability-manifest"), "unsupported future schema remains explicitly unresolved");
});

withSyntheticRepository(({ repoRoot, syntheticIndex, writeConformance }) => {
  writeConformance({
    requiredAlphaVectors: ["duplicate", "duplicate"],
  });
  throws(
    () => buildMethodologyProjection(repoRoot, syntheticIndex()),
    /duplicate vector id: duplicate/,
    "duplicate vector IDs fail closed",
  );
});

withSyntheticRepository(({ repoRoot, syntheticIndex, writeConformance }) => {
  writeConformance({
    requiredAlphaVectors: ["same-id"],
    requiredNegativeVectors: ["same-id"],
  });
  throws(
    () => buildMethodologyProjection(repoRoot, syntheticIndex()),
    /duplicate vector id: same-id/,
    "positive/negative identity ambiguity fails closed",
  );
});

withSyntheticRepository(({ repoRoot, syntheticIndex, writeConformance }) => {
  writeConformance({
    requiredAlphaVectors: ["known"],
    vectorEvidence: {
      c1: {
        "ts/test/evidence.test.ts": ["unknown"],
      },
    },
  });
  throws(
    () => buildMethodologyProjection(repoRoot, syntheticIndex()),
    /evidence references unknown vector: unknown/,
    "dangling vector-evidence binding fails closed",
  );
});

withSyntheticRepository(({ repoRoot, syntheticIndex, writeConformance }) => {
  writeConformance({
    requiredAlphaVectors: ["v2", "v1"],
    requiredNegativeVectors: ["n2", "n1"],
    requiredExecutableGates: ["z.test.ts", "a.test.ts"],
    vectorEvidence: {
      c2: { "z.test.ts": ["v2", "n2"] },
      c1: { "a.test.ts": ["n1", "v1"] },
    },
  });
  const first = serializeMethodologyProjection(buildMethodologyProjection(repoRoot, syntheticIndex()));
  writeConformance({
    vectorEvidence: {
      c1: { "a.test.ts": ["v1", "n1"] },
      c2: { "z.test.ts": ["n2", "v2"] },
    },
    requiredExecutableGates: ["a.test.ts", "z.test.ts"],
    requiredNegativeVectors: ["n1", "n2"],
    requiredAlphaVectors: ["v1", "v2"],
  });
  const second = serializeMethodologyProjection(buildMethodologyProjection(repoRoot, syntheticIndex()));
  same(second, first, "non-semantic source ordering does not change normalized projection bytes");
});

withSyntheticRepository(({ repoRoot, syntheticIndex, writeConformance }) => {
  writeConformance({
    requiredAlphaVectors: ["v1", "v2"],
    vectorEvidence: {
      c1: {
        "ts/test/shared-evidence.test.ts": ["v1", "v2"],
      },
    },
  });
  const version = buildMethodologyProjection(repoRoot, syntheticIndex()).versions[0]!;
  same(version.traceability.length, 2, "one explicit evidence reference may support multiple vectors");
  assert(
    version.traceability.every((relation) => relation.to === "evidence:ts/test/shared-evidence.test.ts"),
    "shared evidence identity is preserved exactly",
  );
});

interface SyntheticRepository {
  readonly repoRoot: string;
  readonly syntheticIndex: (overrides?: Partial<ContractVersionSummary>) => ContractObservatoryIndex;
  readonly writeContract: (overrides?: Record<string, unknown>) => void;
  readonly writeConformance: (overrides?: Record<string, unknown>) => void;
  readonly writeAcceptance: (value: Record<string, unknown>) => void;
  readonly writeTraceability: (value: Record<string, unknown>) => void;
}

function withSyntheticRepository(action: (repository: SyntheticRepository) => void): void {
  const repoRoot = mkdtempSync(join(tmpdir(), "mts-observatory-v4b-"));
  const contractPath = "contracts/mts-contract-v9.1.json";
  const conformancePath = "contracts/mts-conformance-v9.1.json";
  const acceptancePath = "cutover/acceptance.json";
  mkdirSync(join(repoRoot, "contracts"), { recursive: true });
  mkdirSync(join(repoRoot, "cutover"), { recursive: true });
  mkdirSync(join(repoRoot, "traceability"), { recursive: true });

  const baseContract: Record<string, unknown> = {
    schema: "mts-contract/v9.1",
    status: "candidate",
    accepted: false,
    acceptanceReady: false,
    semanticBase: "mts-contract/v9.0",
    conformanceCorpus: conformancePath,
  };
  const baseConformance: Record<string, unknown> = {
    schema: "mts-conformance/v9.1",
    contract: "mts-contract/v9.1",
    status: "candidate",
    accepted: false,
    coverageState: "partial",
    requiredExecutableGates: [],
    requiredNegativeVectors: [],
  };

  const writeContract = (overrides: Record<string, unknown> = {}): void => {
    writeFileSync(join(repoRoot, contractPath), `${JSON.stringify({ ...baseContract, ...overrides }, null, 2)}\n`, "utf8");
  };
  const writeConformance = (overrides: Record<string, unknown> = {}): void => {
    writeFileSync(join(repoRoot, conformancePath), `${JSON.stringify({ ...baseConformance, ...overrides }, null, 2)}\n`, "utf8");
  };
  const writeAcceptance = (value: Record<string, unknown>): void => {
    writeFileSync(join(repoRoot, acceptancePath), `${JSON.stringify(value, null, 2)}\n`, "utf8");
  };
  const writeTraceability = (value: Record<string, unknown>): void => {
    writeFileSync(join(repoRoot, "traceability", "synthetic.json"), `${JSON.stringify(value, null, 2)}\n`, "utf8");
  };

  writeContract();
  writeConformance();
  writeAcceptance({});

  const summary: ContractVersionSummary = Object.freeze({
    contractId: "mts-contract/v9.1",
    conformanceId: "mts-conformance/v9.1",
    contractPath,
    conformancePath,
    status: "candidate",
    accepted: false,
    acceptanceReady: false,
    semanticBase: "mts-contract/v9.0",
    observableSemanticDelta: true,
    coverageState: "partial",
    requiredExecutableGateCount: 0,
    requiredNegativeVectorCount: 0,
    isCurrent: false,
    isPrevious: false,
  });

  const syntheticIndex = (overrides: Partial<ContractVersionSummary> = {}): ContractObservatoryIndex => Object.freeze({
    schema: "mts-contract-observatory-index/v0.1",
    acceptancePath,
    currentContractPath: "contracts/none-current.json",
    currentConformancePath: "contracts/none-current-conformance.json",
    previousContractPath: "contracts/none-previous.json",
    previousConformancePath: "contracts/none-previous-conformance.json",
    versions: Object.freeze([Object.freeze({ ...summary, ...overrides })]),
  });

  try {
    action({ repoRoot, syntheticIndex, writeContract, writeConformance, writeAcceptance, writeTraceability });
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
  }
}
