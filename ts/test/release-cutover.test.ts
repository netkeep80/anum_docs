import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { Memory, ensureRootBasis } from "../src/memory.js";
import { deserializeStream, symbolicStackAlgebra, StreamError } from "../src/anum.js";
import {
  PersistenceTopologyError,
  STORAGE_TOPOLOGY_SCHEMA,
  restoreTopology,
} from "../src/persistence-topology.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`release-cutover: ${message}`);
}

function negativeVector(id: string, condition: boolean): void {
  assert(condition, `negative vector failed: ${id}`);
}

function rejectsTopology(links: readonly (readonly [number, number])[]): boolean {
  try {
    restoreTopology({ schema: STORAGE_TOPOLOGY_SCHEMA, root: 0, links });
    return false;
  } catch (error) {
    return error instanceof PersistenceTopologyError;
  }
}

const repoRoot = resolve(process.cwd(), "..");
const ignoredDirectories = new Set([".git", "node_modules", "dist"]);

function pythonFiles(directory: string): string[] {
  const result: string[] = [];
  for (const name of readdirSync(directory)) {
    if (ignoredDirectories.has(name)) continue;
    const path = join(directory, name);
    const relative = path.slice(repoRoot.length + 1).replaceAll("\\", "/");
    if (statSync(path).isDirectory()) result.push(...pythonFiles(path));
    else if (name.endsWith(".py")) result.push(relative);
  }
  return result;
}

interface PackageExportTarget {
  readonly types?: string;
  readonly default?: string;
}

interface ConformanceBoundary {
  readonly status?: string;
  readonly accepted?: boolean;
  readonly acceptanceReady?: boolean;
  readonly requiredExecutableGates?: readonly string[];
  readonly requiredNegativeVectors?: readonly string[];
  readonly vectorEvidence?: {
    readonly negative?: Readonly<Record<string, readonly string[]>>;
  };
}

function mappedNegativeVector(conformance: ConformanceBoundary, id: string): boolean {
  if (!conformance.requiredNegativeVectors?.includes(id)) return false;
  const requiredGates = new Set(conformance.requiredExecutableGates ?? []);
  const evidence = conformance.vectorEvidence?.negative ?? {};
  return Object.entries(evidence).some(([testPath, ids]) => requiredGates.has(testPath) && ids.includes(id));
}

const packageJson = JSON.parse(readFileSync(join(repoRoot, "ts/package.json"), "utf8")) as {
  readonly name?: string;
  readonly types?: string;
  readonly exports?: Record<string, string | PackageExportTarget>;
};
assert(packageJson.name === "@mts/core", "canonical package must be @mts/core");
assert(packageJson.types === "./dist/src/public.d.ts", "package root declarations must be public.ts build output");
const rootExport = packageJson.exports?.["."];
assert(
  typeof rootExport === "object"
    && rootExport !== null
    && rootExport.types === "./dist/src/public.d.ts"
    && rootExport.default === "./dist/src/public.js",
  "package root must expose matching declaration and runtime outputs",
);

const contract = JSON.parse(readFileSync(join(repoRoot, "contracts/mts-contract-v0.10.json"), "utf8")) as {
  readonly schema?: string;
  readonly status?: string;
  readonly accepted?: boolean;
  readonly semanticBase?: string;
  readonly observableSemanticDelta?: boolean;
  readonly acceptanceReady?: boolean;
  readonly implementation?: {
    readonly language?: string;
    readonly pythonRuntimePresent?: boolean;
    readonly singleLiveSemanticRuntime?: boolean;
    readonly compatibilityRuntimeSelectable?: boolean;
  };
};
assert(contract.schema === "mts-contract/v0.10", "current contract must be v0.10");
assert(contract.status === "accepted" && contract.accepted === true, "current v0.10 contract must be accepted");
assert(contract.semanticBase === "mts-contract/v0.9", "v0.10 semantic base must be accepted v0.9");
assert(contract.observableSemanticDelta === true, "v0.10 must retain its explicit semantic delta");
assert(contract.acceptanceReady === true, "accepted v0.10 must retain proven readiness");
assert(contract.implementation?.language === "TypeScript", "current implementation must be TypeScript");
assert(contract.implementation?.pythonRuntimePresent === false, "current contract must reject Python runtime ownership");
assert(contract.implementation?.singleLiveSemanticRuntime === true, "accepted runtime must remain single");
assert(contract.implementation?.compatibilityRuntimeSelectable === false, "compatibility runtime must remain unavailable");

const conformance = JSON.parse(
  readFileSync(join(repoRoot, "contracts/mts-conformance-v0.10.json"), "utf8"),
) as ConformanceBoundary;
assert(conformance.status === "accepted" && conformance.accepted === true, "current v0.10 conformance must be accepted");
assert(conformance.acceptanceReady === true, "accepted v0.10 conformance must retain proven readiness");

// Trusted base policy still evaluates the same PR head while v0.9 is current.
// Keep its negative-vector bindings independently checkable during rotation.
const previousConformance = JSON.parse(
  readFileSync(join(repoRoot, "contracts/mts-conformance-v0.9.json"), "utf8"),
) as ConformanceBoundary;
assert(previousConformance.status === "accepted" && previousConformance.accepted === true, "previous v0.9 conformance must remain accepted evidence");

const currentPython = pythonFiles(repoRoot);
negativeVector("python-runtime-present", currentPython.length === 0);

const memory = new Memory();
const basis = ensureRootBasis(memory);
const rootPoles = memory.poles(basis.R);
assert(rootPoles.start === basis.R && rootPoles.end === basis.R, "R must be fully self-closed");
assert(memory.poles(basis.O).start === basis.O && memory.poles(basis.O).end === basis.R, "O basis mismatch");
assert(memory.poles(basis.C).start === basis.R && memory.poles(basis.C).end === basis.C, "C basis mismatch");
assert(memory.poles(basis.L).start === basis.O && memory.poles(basis.L).end === basis.C, "L basis mismatch");
assert(memory.poles(basis.U).start === basis.C && memory.poles(basis.U).end === basis.O, "U basis mismatch");

negativeVector("second-fully-self-closed-by-physical-id", rejectsTopology([[0, 0], [1, 1]]));
negativeVector("duplicate-same-pair", rejectsTopology([[0, 0], [1, 0], [0, 2], [1, 2], [1, 2]]));

const pair = memory.ensure(basis.L, basis.U);
assert(memory.ensure(basis.L, basis.U) === pair, "same semantic pair must be reused");
const rebuilt = new Memory();
const rebuiltBasis = ensureRootBasis(rebuilt);
negativeVector("same-form-distinguished-only-by-runtime-handle", rebuiltBasis.R !== basis.R && rebuilt.poles(rebuiltBasis.L).start === rebuiltBasis.O);
negativeVector("id-only-mutual-cycle", rejectsTopology([[0, 0], [2, 0], [1, 0]]));

const countBeforeRead = memory.linkCount;
memory.find(basis.L, basis.U);
memory.outgoing(basis.L);
memory.incoming(basis.U);
negativeVector(
  "read-or-replay-materializes",
  memory.linkCount === countBeforeRead && mappedNegativeVector(previousConformance, "read-or-replay-materializes"),
);

let rootRejected = false;
try {
  deserializeStream("R", symbolicStackAlgebra);
} catch (error) {
  rootRejected = error instanceof StreamError && error.code === "non-abit";
}
negativeVector("root-as-fifth-abit", rootRejected);
negativeVector("empty-group-rejected", deserializeStream("[]", symbolicStackAlgebra).denotation === "R");

// Retain every accepted-v0.9 literal anchor for trusted base policy.
negativeVector("exact-sequence-empty-vs-single-root", mappedNegativeVector(previousConformance, "exact-sequence-empty-vs-single-root"));
negativeVector("exact-sequence-leading-root-loss", mappedNegativeVector(previousConformance, "exact-sequence-leading-root-loss"));
negativeVector("restricted-rooted-sequence-admits-root", mappedNegativeVector(previousConformance, "restricted-rooted-sequence-admits-root"));
negativeVector("exact-sequence-malformed-cell", mappedNegativeVector(previousConformance, "exact-sequence-malformed-cell"));
negativeVector("exact-sequence-predecessor-cycle", mappedNegativeVector(previousConformance, "exact-sequence-predecessor-cycle"));
negativeVector("q-state-hidden-started-disagrees", mappedNegativeVector(previousConformance, "q-state-hidden-started-disagrees"));
negativeVector("canonical-string-carrier-codepoint-envelope", mappedNegativeVector(previousConformance, "canonical-string-carrier-codepoint-envelope"));
negativeVector("canonical-byte-opaque-runtime-id", mappedNegativeVector(previousConformance, "canonical-byte-opaque-runtime-id"));
negativeVector("forged-interpreter-configuration", mappedNegativeVector(previousConformance, "forged-interpreter-configuration"));
negativeVector("interpreter-components-disagree-with-evidence", mappedNegativeVector(previousConformance, "interpreter-components-disagree-with-evidence"));
negativeVector("forged-role-dictionary", mappedNegativeVector(previousConformance, "forged-role-dictionary"));
negativeVector("rule-not-admitted-by-theory", mappedNegativeVector(previousConformance, "rule-not-admitted-by-theory"));
negativeVector("rule-missing-required-role", mappedNegativeVector(previousConformance, "rule-missing-required-role"));
negativeVector("rule-conflicting-role-binding", mappedNegativeVector(previousConformance, "rule-conflicting-role-binding"));
negativeVector("rule-undeclared-role-binding", mappedNegativeVector(previousConformance, "rule-undeclared-role-binding"));
negativeVector("rule-wrong-result", mappedNegativeVector(previousConformance, "rule-wrong-result"));
negativeVector("rule-wrong-before-context", mappedNegativeVector(previousConformance, "rule-wrong-before-context"));
negativeVector("rule-wrong-after-context", mappedNegativeVector(previousConformance, "rule-wrong-after-context"));
negativeVector("context-close-wrong-parent", mappedNegativeVector(previousConformance, "context-close-wrong-parent"));
negativeVector("parent-continuation-wrong-interpreter", mappedNegativeVector(previousConformance, "parent-continuation-wrong-interpreter"));
negativeVector("returned-root-disappears-from-exact-parent-sequence", mappedNegativeVector(previousConformance, "returned-root-disappears-from-exact-parent-sequence"));
negativeVector("noncanonical-unparenthesized-formal-relation", mappedNegativeVector(previousConformance, "noncanonical-unparenthesized-formal-relation"));
negativeVector("empty-formal-context-admitted", mappedNegativeVector(previousConformance, "empty-formal-context-admitted"));

// New current-v0.10 anchors prove that every required negative boundary is
// backed by one of the exact executable gates run by full CI.
negativeVector("v010-free-dot-has-no-ambient-current", mappedNegativeVector(conformance, "v010-free-dot-has-no-ambient-current"));
negativeVector("v010-dot-is-not-parent-navigation", mappedNegativeVector(conformance, "v010-dot-is-not-parent-navigation"));
negativeVector("v010-dot-is-not-runtime-current", mappedNegativeVector(conformance, "v010-dot-is-not-runtime-current"));
negativeVector("v010-dot-is-not-read-begin", mappedNegativeVector(conformance, "v010-dot-is-not-read-begin"));
negativeVector("v010-dot-is-not-read-end", mappedNegativeVector(conformance, "v010-dot-is-not-read-end"));
negativeVector("v010-dot-is-not-storage-dereference", mappedNegativeVector(conformance, "v010-dot-is-not-storage-dereference"));
negativeVector("v010-dot-is-not-arbitrary-rewrite", mappedNegativeVector(conformance, "v010-dot-is-not-arbitrary-rewrite"));
negativeVector("v010-nonroot-full-dot-selfclosure-rejected", mappedNegativeVector(conformance, "v010-nonroot-full-dot-selfclosure-rejected"));
