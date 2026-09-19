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
  readonly vectorEvidence?: Readonly<Record<string, Readonly<Record<string, readonly string[]>>>>;
}

function mappedNegativeVector(conformance: ConformanceBoundary, id: string): boolean {
  if (!conformance.requiredNegativeVectors?.includes(id)) return false;
  const requiredGates = new Set(conformance.requiredExecutableGates ?? []);
  for (const evidenceGroup of Object.values(conformance.vectorEvidence ?? {})) {
    if (Object.entries(evidenceGroup).some(([testPath, ids]) => requiredGates.has(testPath) && ids.includes(id))) {
      return true;
    }
  }
  return false;
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

const contract = JSON.parse(readFileSync(join(repoRoot, "contracts/mts-contract-v0.12.json"), "utf8")) as {
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
assert(contract.schema === "mts-contract/v0.12", "current contract must be v0.12");
assert(contract.status === "accepted" && contract.accepted === true, "current v0.12 contract must be accepted");
assert(contract.semanticBase === "mts-contract/v0.11", "v0.12 semantic base must be accepted v0.11");
assert(contract.observableSemanticDelta === true, "v0.12 must retain its explicit semantic delta");
assert(contract.acceptanceReady === true, "accepted v0.12 must retain proven readiness");
assert(contract.implementation?.language === "TypeScript", "current implementation must be TypeScript");
assert(contract.implementation?.pythonRuntimePresent === false, "current contract must reject Python runtime ownership");
assert(contract.implementation?.singleLiveSemanticRuntime === true, "accepted runtime must remain single");
assert(contract.implementation?.compatibilityRuntimeSelectable === false, "compatibility runtime must remain unavailable");

const conformance = JSON.parse(
  readFileSync(join(repoRoot, "contracts/mts-conformance-v0.12.json"), "utf8"),
) as ConformanceBoundary;
assert(conformance.status === "accepted" && conformance.accepted === true, "current v0.12 conformance must be accepted");
assert(conformance.acceptanceReady === true, "accepted v0.12 conformance must retain proven readiness");

// Keep the immediately previous accepted release independently checkable while
// the trusted-base current/previous pair rotates from v0.11/v0.10 to v0.12/v0.11.
const previousConformance = JSON.parse(
  readFileSync(join(repoRoot, "contracts/mts-conformance-v0.11.json"), "utf8"),
) as ConformanceBoundary;
assert(previousConformance.status === "accepted" && previousConformance.accepted === true, "previous v0.11 conformance must remain accepted evidence");
assert(previousConformance.acceptanceReady === true, "previous v0.11 conformance must retain proven readiness");

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
negativeVector("read-or-replay-materializes", memory.linkCount === countBeforeRead);

let rootRejected = false;
try {
  deserializeStream("R", symbolicStackAlgebra);
} catch (error) {
  rootRejected = error instanceof StreamError && error.code === "non-abit";
}
negativeVector("root-as-fifth-abit", rootRejected);
negativeVector("empty-group-rejected", deserializeStream("[]", symbolicStackAlgebra).denotation === "R");

// Retain every accepted-v0.11 required negative as a literal trusted-base anchor.
negativeVector("v011-root-is-not-execution-frame", mappedNegativeVector(previousConformance, "v011-root-is-not-execution-frame"));
negativeVector("v011-dot-is-not-ambient-runtime-current", mappedNegativeVector(previousConformance, "v011-dot-is-not-ambient-runtime-current"));
negativeVector("v011-top-bind-does-not-insert-hidden-root-glyph", mappedNegativeVector(previousConformance, "v011-top-bind-does-not-insert-hidden-root-glyph"));
negativeVector("v011-nonroot-pair-A-A-is-not-A", mappedNegativeVector(previousConformance, "v011-nonroot-pair-A-A-is-not-A"));
negativeVector("v011-colon-meaning-is-not-dot-dot-fold", mappedNegativeVector(previousConformance, "v011-colon-meaning-is-not-dot-dot-fold"));
negativeVector("v011-q-alphabet-remains-four-abits", mappedNegativeVector(previousConformance, "v011-q-alphabet-remains-four-abits"));
negativeVector("v011-dot-is-not-q-abit", mappedNegativeVector(previousConformance, "v011-dot-is-not-q-abit"));
negativeVector("v011-colon-is-not-q-abit", mappedNegativeVector(previousConformance, "v011-colon-is-not-q-abit"));
negativeVector("v011-host-stack-is-not-semantic-authority", mappedNegativeVector(previousConformance, "v011-host-stack-is-not-semantic-authority"));

// Current-v0.12 anchors must each map through one of the exact 16 accepted gates.
// Evidence-group names are not semantic, so the helper traverses every group.
assert((conformance.requiredExecutableGates ?? []).length === 16, "accepted v0.12 keeps all 16 mandatory executable gates");
negativeVector("v012-string-glyph-one-is-not-q-abit-one", mappedNegativeVector(conformance, "v012-string-glyph-one-is-not-q-abit-one"));
negativeVector("v012-formal-square-brackets-do-not-select-q-child", mappedNegativeVector(conformance, "v012-formal-square-brackets-do-not-select-q-child"));
negativeVector("v012-representation-is-not-interpretation", mappedNegativeVector(conformance, "v012-representation-is-not-interpretation"));
negativeVector("v012-formal-empty-parentheses-are-not-a-valid-result", mappedNegativeVector(conformance, "v012-formal-empty-parentheses-are-not-a-valid-result"));
negativeVector("v012-child-creation-does-not-auto-select-contextual-k", mappedNegativeVector(conformance, "v012-child-creation-does-not-auto-select-contextual-k"));
negativeVector("v012-nearest-lexical-frame-is-not-semantic-authority", mappedNegativeVector(conformance, "v012-nearest-lexical-frame-is-not-semantic-authority"));
negativeVector("v012-ambient-current-is-not-semantic-authority", mappedNegativeVector(conformance, "v012-ambient-current-is-not-semantic-authority"));
negativeVector("v012-hidden-parent-traversal-is-not-semantic-authority", mappedNegativeVector(conformance, "v012-hidden-parent-traversal-is-not-semantic-authority"));
negativeVector("v012-link-left-association-is-not-formal-grammar", mappedNegativeVector(conformance, "v012-link-left-association-is-not-formal-grammar"));
negativeVector("v012-generic-flat-reader-is-not-formal-grammar", mappedNegativeVector(conformance, "v012-generic-flat-reader-is-not-formal-grammar"));
negativeVector("v012-formal-square-bracket-low-level-open-is-not-authority", mappedNegativeVector(conformance, "v012-formal-square-bracket-low-level-open-is-not-authority"));
negativeVector("v012-formal-square-bracket-missing-rule-does-not-open", mappedNegativeVector(conformance, "v012-formal-square-bracket-missing-rule-does-not-open"));
negativeVector("v012-formal-square-bracket-substituted-q-rule-does-not-open", mappedNegativeVector(conformance, "v012-formal-square-bracket-substituted-q-rule-does-not-open"));
