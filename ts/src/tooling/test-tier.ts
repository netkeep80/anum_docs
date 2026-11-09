import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  loadCurrentNativeVerificationProjection,
  loadMtsSemanticIr,
} from "./mts-compiler.js";

export type TestTier = "current" | "full";

type JsonObject = Record<string, unknown>;

export interface BoundedCurrentizationTest {
  readonly path: string;
  readonly sunset:
    | "UNTIL_G14_PORTABLE_COMPATIBILITY_WITNESS_ACCEPTED"
    | "UNTIL_G14_THEOREM_PROOF_INFRASTRUCTURE_WITNESS_ACCEPTED";
}

export interface TestTierPlan {
  readonly allSourceTests: readonly string[];
  readonly currentSourceTests: readonly string[];
  readonly fullReplaySourceTests: readonly string[];
  readonly historicalResearchSourceTests: readonly string[];
  readonly historicalAcceptedEvidenceSourceTests: readonly string[];
  readonly machineReferencedSourceTests: readonly string[];
  readonly nativeVerifiedByCurrentSourceTests: readonly string[];
  readonly currentAssuranceSourceTests: readonly string[];
  readonly boundedCurrentizationSourceTests: readonly string[];
  readonly boundedCurrentizationTests: readonly BoundedCurrentizationTest[];
  readonly evidenceRoutingSources: readonly string[];
}

const EXACT_SOURCE_TEST_PATH = /^ts\/test\/[^/]+\.test\.ts$/;

const HISTORICAL_ACCEPTED_EVIDENCE_SOURCE_TESTS = Object.freeze([
  "ts/test/v015-semantic-metamodel-evidence-verifier.test.ts",
] as const);

// Current assurance is explicit execution ownership, not filename,
// evidence-coordinate or residency inference. G14 Author acceptance retired
// the temporary bounded-currentization lifecycle for the three terminal witness
// functions while preserving their independently justified PR-blocking role.
const CURRENT_ASSURANCE_SOURCE_TESTS = Object.freeze([
  "ts/test/historical-images-protection.test.ts",
  "ts/test/portable-derivation-digest.test.ts",
  "ts/test/portable-derivation.test.ts",
  "ts/test/proof-infrastructure.test.ts",
  "ts/test/public-api.test.ts",
  "ts/test/test-tier.test.ts",
  "ts/test/v015-documentation-acceptance.test.ts",
  "ts/test/v015-semantic-metamodel-evidence-verifier-v02.test.ts",
] as const);

// Keep the metadata-bearing bounded-currentization owner class explicit even
// though G14 closes its current membership. Future bounded obligations require
// a new explicit architecture decision and an inspectable sunset.
const BOUNDED_CURRENTIZATION_TESTS: readonly BoundedCurrentizationTest[] =
  Object.freeze([]);

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
    if (EXACT_SOURCE_TEST_PATH.test(value)) result.add(value);
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
  return path.slice("ts/test/".length).startsWith("research-");
}

function sortedUnique(paths: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(paths)].sort());
}

function validateExecutionOwnerSet(
  allSet: ReadonlySet<string>,
  name: string,
  paths: readonly string[],
): void {
  if (new Set(paths).size !== paths.length) {
    fail(`${name} contains duplicate current execution test paths`);
  }
  for (const path of paths) {
    if (!EXACT_SOURCE_TEST_PATH.test(path)) {
      fail(`${name} has invalid current execution test path: ${path}`);
    }
    if (!allSet.has(path)) {
      fail(`${name} current execution test is missing: ${path}`);
    }
    if (
      HISTORICAL_ACCEPTED_EVIDENCE_SOURCE_TESTS.includes(
        path as (typeof HISTORICAL_ACCEPTED_EVIDENCE_SOURCE_TESTS)[number],
      )
    ) {
      fail(`${name} cannot select historical accepted evidence as current: ${path}`);
    }
  }
}

function combineExecutionOwnerSets(
  allSet: ReadonlySet<string>,
  sets: readonly {
    readonly name: string;
    readonly paths: readonly string[];
  }[],
): readonly string[] {
  const ownerByPath = new Map<string, string>();
  for (const ownerSet of sets) {
    validateExecutionOwnerSet(allSet, ownerSet.name, ownerSet.paths);
    for (const path of ownerSet.paths) {
      const previous = ownerByPath.get(path);
      if (previous !== undefined) {
        fail(`current execution owner overlap for ${path}: ${previous} and ${ownerSet.name}`);
      }
      ownerByPath.set(path, ownerSet.name);
    }
  }
  return Object.freeze([...ownerByPath.keys()].sort());
}

export function classifyTestPaths(
  allSourceTests: readonly string[],
  evidenceReferencedSourceTests: readonly string[],
  explicitCurrentSourceTests: readonly string[],
): Pick<
  TestTierPlan,
  | "allSourceTests"
  | "currentSourceTests"
  | "fullReplaySourceTests"
  | "historicalResearchSourceTests"
  | "historicalAcceptedEvidenceSourceTests"
  | "machineReferencedSourceTests"
> {
  const all = sortedUnique(allSourceTests);
  const allSet = new Set(all);
  for (const path of all) {
    if (!EXACT_SOURCE_TEST_PATH.test(path)) {
      fail(`physical test path is invalid: ${path}`);
    }
  }

  const referenced = sortedUnique(evidenceReferencedSourceTests);
  for (const path of referenced) {
    if (!allSet.has(path)) {
      fail(`machine-readable evidence references missing test: ${path}`);
    }
  }

  validateExecutionOwnerSet(allSet, "explicit", explicitCurrentSourceTests);
  const current = Object.freeze([...explicitCurrentSourceTests].sort());
  const currentSet = new Set(current);
  if (current.length === 0) fail("current tier is empty");

  const fullReplay = Object.freeze(all.filter((path) => !currentSet.has(path)));
  const historicalResearch = Object.freeze(
    all.filter((path) => isResearchTest(path) && !currentSet.has(path)),
  );
  const historicalAcceptedEvidence = Object.freeze(
    all.filter((path) =>
      HISTORICAL_ACCEPTED_EVIDENCE_SOURCE_TESTS.includes(
        path as (typeof HISTORICAL_ACCEPTED_EVIDENCE_SOURCE_TESTS)[number],
      ),
    ),
  );

  return Object.freeze({
    allSourceTests: all,
    currentSourceTests: current,
    fullReplaySourceTests: fullReplay,
    historicalResearchSourceTests: historicalResearch,
    historicalAcceptedEvidenceSourceTests: historicalAcceptedEvidence,
    machineReferencedSourceTests: referenced,
  });
}

export function buildTestTierPlan(repositoryRoot: string): TestTierPlan {
  const sourceTestDirectory = join(repositoryRoot, "ts", "test");
  const allSourceTests = readdirSync(sourceTestDirectory)
    .filter((name) => name.endsWith(".test.ts"))
    .map((name) => `ts/test/${name}`)
    .sort();
  const allSet = new Set(allSourceTests);

  const semanticIr = loadMtsSemanticIr(repositoryRoot);
  const nativeVerification = loadCurrentNativeVerificationProjection(repositoryRoot);
  const nativeVerifiedByCurrentSourceTests = sortedUnique(nativeVerification.verifiedByTestPaths);
  const currentAssuranceSourceTests = sortedUnique(CURRENT_ASSURANCE_SOURCE_TESTS);

  const boundedCurrentizationTests = Object.freeze(
    BOUNDED_CURRENTIZATION_TESTS.map((item) => Object.freeze({ ...item })),
  );
  const boundedPathList = boundedCurrentizationTests.map((item) => item.path);
  if (new Set(boundedPathList).size !== boundedPathList.length) {
    fail("bounded currentization metadata contains duplicate test paths");
  }
  const boundedCurrentizationSourceTests = sortedUnique(boundedPathList);

  const explicitCurrentSourceTests = combineExecutionOwnerSets(allSet, [
    Object.freeze({
      name: "native verified_by",
      paths: nativeVerifiedByCurrentSourceTests,
    }),
    Object.freeze({
      name: "current assurance",
      paths: currentAssuranceSourceTests,
    }),
    Object.freeze({
      name: "bounded currentization",
      paths: boundedCurrentizationSourceTests,
    }),
  ]);

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
    explicitCurrentSourceTests,
  );
  // Retired historical evidence is retained in Git history; it does not
  // impose a physical FULL-tier residency requirement on present HEAD.
  // classifyTestPaths still forbids selecting such paths as CURRENT.

  return Object.freeze({
    ...classified,
    nativeVerifiedByCurrentSourceTests,
    currentAssuranceSourceTests,
    boundedCurrentizationSourceTests,
    boundedCurrentizationTests,
    evidenceRoutingSources: Object.freeze([
      acceptancePath,
      contractPath,
      conformancePath,
      traceabilityPath,
      currentTheoremIndexPath,
    ]),
  });
}

// S18: a passing process exit is insufficient unless the five FULL consumers
// physically read their owned fixtures and complete without process.exit().
export function runS18FixtureWitness(
  executableTest: string,
  expectedPaths: readonly string[],
  repositoryRoot: string,
): void {
  const preload = [
    'import fs from "node:fs";',
    'import { syncBuiltinESMExports } from "node:module";',
    'import { relative, resolve } from "node:path";',
    'const observed = [];',
    'let explicitExit = false;',
    'const originalRead = fs.readFileSync;',
    'fs.readFileSync = (...args) => {',
    '  const bytes = Reflect.apply(originalRead, fs, args);',
    '  if (typeof args[0] === "string") {',
    '    const path = relative(process.env.MTS_S18_REPO_ROOT, resolve(args[0]))',
    '      .split(String.fromCharCode(92)).join("/");',
    '    if (path.startsWith("examples/anum/conformance/")) observed.push(path);',
    '  }',
    '  return bytes;',
    '};',
    'syncBuiltinESMExports();',
    'const originalExit = process.exit;',
    'process.exit = (...args) => {',
    '  explicitExit = true;',
    '  return Reflect.apply(originalExit, process, args);',
    '};',
    'process.on("exit", () => {',
    '  fs.writeFileSync(process.env.MTS_S18_TRACE, JSON.stringify({ observed, explicitExit }));',
    '});',
  ].join("\n");
  const temporary = mkdtempSync(join(tmpdir(), "mts-s18-reads-"));
  const traceFile = join(temporary, "reads.json");
  try {
    const child = spawnSync(process.execPath, [
      "--import", "data:text/javascript;base64," + Buffer.from(preload).toString("base64"),
      executableTest,
    ], {
      stdio: "inherit",
      env: {
        ...process.env,
        MTS_S18_REPO_ROOT: repositoryRoot,
        MTS_S18_TRACE: traceFile,
      },
    });
    if (child.error !== undefined) throw child.error;
    if (child.signal !== null || child.status !== 0)
      fail("S18 conformance consumer terminated abnormally: " + executableTest +
        " status=" + child.status + " signal=" + child.signal);
    let trace: { observed?: unknown; explicitExit?: unknown };
    try {
      trace = JSON.parse(readFileSync(traceFile, "utf8")) as typeof trace;
    } catch {
      fail("S18 conformance consumer did not produce a physical read trace: " +
        executableTest);
    }
    if (!Array.isArray(trace.observed) ||
        !trace.observed.every((path: unknown) => typeof path === "string") ||
        typeof trace.explicitExit !== "boolean")
      fail("S18 conformance consumer produced an invalid physical read trace");
    const actual = [...trace.observed].sort();
    const expected = [...expectedPaths].sort();
    if (JSON.stringify(actual) !== JSON.stringify(expected))
      fail("S18 physical fixture read mismatch for " + executableTest +
        "\nexpected: " + expected.join(", ") +
        "\nobserved: " + actual.join(", "));
    if (trace.explicitExit)
      fail("S18 explicit process.exit is not normal completion: " + executableTest);
    console.log("S18 physical reads PASS: " + actual.length + " / " + executableTest);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

export function selectTestTier(plan: TestTierPlan, tier: TestTier): readonly string[] {
  return tier === "current" ? plan.currentSourceTests : plan.allSourceTests;
}
