import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loadMtsSemanticIr } from "./mts-compiler.js";

export type TestTier = "current" | "full";

type JsonObject = Record<string, unknown>;

export interface TestTierPlan {
  readonly allSourceTests: readonly string[];
  readonly currentSourceTests: readonly string[];
  readonly historicalResearchSourceTests: readonly string[];
  readonly historicalAcceptedEvidenceSourceTests: readonly string[];
  readonly machineReferencedSourceTests: readonly string[];
  readonly transitionalCurrentResearchSourceTests: readonly string[];
  readonly authoritySources: readonly string[];
}

const HISTORICAL_ACCEPTED_EVIDENCE_SOURCE_TESTS = Object.freeze([
  "ts/test/v015-semantic-metamodel-evidence-verifier.test.ts",
] as const);

// G11-S1 transitional execution set: these 30 accepted F3B research witnesses
// keep exact pre-S1 CURRENT membership while evidence coordinates lose execution authority.
// G11-S2 owns their final execution-role disposition.
const TRANSITIONAL_CURRENT_RESEARCH_SOURCE_TESTS = Object.freeze([
  "ts/test/research-v012-interpreter-delta-c2.test.ts",
  "ts/test/research-v013-application-closed-frontier-a17.test.ts",
  "ts/test/research-v013-contextual-truth-dynamic-duality-a16.test.ts",
  "ts/test/research-v013-explicit-zero-image-a72y.test.ts",
  "ts/test/research-v013-flat-generalized-modus-ponens-a72w.test.ts",
  "ts/test/research-v013-recursive-link-inversion-a75a.test.ts",
  "ts/test/research-v013-root-asymmetry-chirality-a14.test.ts",
  "ts/test/research-v014-a4-operational-equivalence.test.ts",
  "ts/test/research-v014-a4prime-chiral-torsor-bootstrap.test.ts",
  "ts/test/research-v014-add-constructor-authority-boundary.test.ts",
  "ts/test/research-v014-add-dependent-witness-boundary.test.ts",
  "ts/test/research-v014-add-general-functionality.test.ts",
  "ts/test/research-v014-add-general-proof-boundary.test.ts",
  "ts/test/research-v014-constructor-inversion.test.ts",
  "ts/test/research-v014-constructor-scoped-proof.test.ts",
  "ts/test/research-v014-context-relative-a4prime.test.ts",
  "ts/test/research-v014-count-nat-degree-separation.test.ts",
  "ts/test/research-v014-dependent-witness-closure.test.ts",
  "ts/test/research-v014-foundation-orientation-witness.test.ts",
  "ts/test/research-v014-immutable-link-chiral-rewrite.test.ts",
  "ts/test/research-v014-minimal-chiral-foundation-extension.test.ts",
  "ts/test/research-v014-nat-add-bounded-closure.test.ts",
  "ts/test/research-v014-nat-add-left-zero-closure.test.ts",
  "ts/test/research-v014-nat-least-closed-authority.test.ts",
  "ts/test/research-v014-order-replay-mul-scope.test.ts",
  "ts/test/research-v014-orientation-gauge-view.test.ts",
  "ts/test/research-v014-ostensive-formal-grammar.test.ts",
  "ts/test/research-v014-parametric-closure.test.ts",
  "ts/test/research-v014-preacceptance-closure.test.ts",
  "ts/test/research-v014-reaction-result-basis.test.ts",
] as const);

function fail(message: string): never {
  throw new Error(`test-tier: ${message}`);
}

function object(value: unknown, label: string): JsonObject {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail(`${label} must be an object`);
  }
  return value as JsonObject;
}

function string(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    fail(`${label} must be a non-empty string`);
  }
  return value;
}

function readJson(root: string, path: string): unknown {
  return JSON.parse(readFileSync(join(root, path), "utf8")) as unknown;
}

function collectExactTestReferences(value: unknown, result: Set<string>): void {
  if (typeof value === "string") {
    if (/^ts\/test\/[^/]+\.test\.ts$/.test(value)) result.add(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectExactTestReferences(item, result);
    return;
  }
  if (typeof value === "object" && value !== null) {
    for (const item of Object.values(value as JsonObject)) {
      collectExactTestReferences(item, result);
    }
  }
}

function isResearchTest(path: string): boolean {
  const name = path.slice("ts/test/".length);
  return name.startsWith("research-");
}

export function classifyTestPaths(
  allSourceTests: readonly string[],
  evidenceReferencedSourceTests: readonly string[],
  explicitCurrentResearchSourceTests: readonly string[],
): Omit<TestTierPlan, "authoritySources"> {
  const all = [...new Set(allSourceTests)].sort();
  const allSet = new Set(all);
  const referenced = [...new Set(evidenceReferencedSourceTests)].sort();

  for (const path of referenced) {
    if (!allSet.has(path)) {
      fail(`machine-readable evidence references missing test: ${path}`);
    }
  }

  const referencedSet = new Set(referenced);
  const historicalAcceptedEvidence = all.filter((path) =>
    HISTORICAL_ACCEPTED_EVIDENCE_SOURCE_TESTS.includes(
      path as (typeof HISTORICAL_ACCEPTED_EVIDENCE_SOURCE_TESTS)[number],
    )
  );
  const historicalAcceptedEvidenceSet = new Set(historicalAcceptedEvidence);
  const transitionalCurrentResearch = [...new Set(explicitCurrentResearchSourceTests)].sort();
  const transitionalCurrentResearchSet = new Set(transitionalCurrentResearch);

  for (const path of transitionalCurrentResearch) {
    if (!allSet.has(path)) fail(`explicit current research test is missing: ${path}`);
    if (!isResearchTest(path)) fail(`explicit current research test must be research-prefixed: ${path}`);
    if (historicalAcceptedEvidenceSet.has(path)) {
      fail(`historical accepted evidence cannot be explicit current research: ${path}`);
    }
  }

  const current = all.filter((path) =>
    !historicalAcceptedEvidenceSet.has(path) &&
    (!isResearchTest(path) || transitionalCurrentResearchSet.has(path))
  );
  const historicalResearch = all.filter((path) =>
    !historicalAcceptedEvidenceSet.has(path) &&
    isResearchTest(path) &&
    !transitionalCurrentResearchSet.has(path)
  );

  if (current.length === 0) fail("current tier is empty");
  if (current.length + historicalResearch.length + historicalAcceptedEvidence.length !== all.length) {
    fail("current + historical research + historical accepted evidence partition does not cover full test set");
  }
  for (const path of historicalResearch) {
    if (!isResearchTest(path)) fail(`non-research test excluded as historical research: ${path}`);
    if (transitionalCurrentResearchSet.has(path)) fail(`explicit current research test excluded from current tier: ${path}`);
  }
  for (const path of historicalAcceptedEvidence) {
    if (isResearchTest(path)) fail(`historical accepted evidence test must not be research-prefixed: ${path}`);
    if (referencedSet.has(path)) fail(`machine-referenced historical accepted evidence test excluded from current tier: ${path}`);
  }

  return Object.freeze({
    allSourceTests: Object.freeze(all),
    currentSourceTests: Object.freeze(current),
    historicalResearchSourceTests: Object.freeze(historicalResearch),
    historicalAcceptedEvidenceSourceTests: Object.freeze(historicalAcceptedEvidence),
    machineReferencedSourceTests: Object.freeze(referenced),
    transitionalCurrentResearchSourceTests: Object.freeze(transitionalCurrentResearch),
  });
}

export function buildTestTierPlan(repositoryRoot: string): TestTierPlan {
  const sourceTestDirectory = join(repositoryRoot, "ts", "test");
  const allSourceTests = readdirSync(sourceTestDirectory)
    .filter((name) => name.endsWith(".test.ts"))
    .map((name) => `ts/test/${name}`)
    .sort();

  const semanticIr = loadMtsSemanticIr(repositoryRoot);
  const contractPath = semanticIr.contractPath;
  const traceabilityPath = semanticIr.traceabilityPath;
  const conformancePath = semanticIr.conformancePath;
  const contract = object(readJson(repositoryRoot, contractPath), contractPath);
  const traceability = object(readJson(repositoryRoot, traceabilityPath), traceabilityPath);
  const acceptancePath = string(traceability.acceptance, `${traceabilityPath}.acceptance`);
  const conformance = object(readJson(repositoryRoot, conformancePath), conformancePath);

  const proofInfrastructurePath = "proofs/provers.json";
  const proofInfrastructure = object(
    readJson(repositoryRoot, proofInfrastructurePath),
    proofInfrastructurePath,
  );
  const currentTheoremIndexPath = string(
    proofInfrastructure.currentTheoremIndex,
    `${proofInfrastructurePath}.currentTheoremIndex`,
  );
  const historicalTheoremRegistryPath = string(
    proofInfrastructure.historicalTheoremRegistry,
    `${proofInfrastructurePath}.historicalTheoremRegistry`,
  );
  if (currentTheoremIndexPath === historicalTheoremRegistryPath) {
    fail("current theorem index must differ from historical theorem registry");
  }

  const currentTheoremIndex = object(
    readJson(repositoryRoot, currentTheoremIndexPath),
    currentTheoremIndexPath,
  );
  if (
    string(currentTheoremIndex.schema, `${currentTheoremIndexPath}.schema`) !==
    "mts-current-theorem-index/v0.1"
  ) {
    fail("unexpected current theorem index schema");
  }
  if (
    string(currentTheoremIndex.authority, `${currentTheoremIndexPath}.authority`) !==
    "generated-index-only"
  ) {
    fail("current theorem index must remain a generated projection");
  }

  const references = new Set<string>();
  for (const surface of [contract, conformance, traceability, currentTheoremIndex]) {
    collectExactTestReferences(surface, references);
  }

  const classified = classifyTestPaths(
    allSourceTests,
    [...references],
    TRANSITIONAL_CURRENT_RESEARCH_SOURCE_TESTS,
  );
  if (
    JSON.stringify(classified.historicalAcceptedEvidenceSourceTests) !==
    JSON.stringify(HISTORICAL_ACCEPTED_EVIDENCE_SOURCE_TESTS)
  ) {
    fail("historical accepted evidence test set differs from the exact immutable allowlist");
  }
  return Object.freeze({
    ...classified,
    authoritySources: Object.freeze([
      acceptancePath,
      contractPath,
      conformancePath,
      traceabilityPath,
      currentTheoremIndexPath,
    ]),
  });
}

export function selectTestTier(plan: TestTierPlan, tier: TestTier): readonly string[] {
  return tier === "current" ? plan.currentSourceTests : plan.allSourceTests;
}
