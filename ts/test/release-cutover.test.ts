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

const contract = JSON.parse(readFileSync(join(repoRoot, "contracts/mts-contract-v0.9.json"), "utf8")) as {
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
  };
};
assert(contract.schema === "mts-contract/v0.9", "current contract must be v0.9");
assert(contract.status === "accepted" && contract.accepted === true, "current v0.9 contract must be accepted");
assert(contract.semanticBase === "mts-contract/v0.8", "v0.9 semantic base must be accepted v0.8");
assert(contract.observableSemanticDelta === true, "v0.9 must retain its explicit semantic delta");
assert(contract.acceptanceReady === true, "accepted v0.9 must retain proven readiness");
assert(contract.implementation?.language === "TypeScript", "current implementation must be TypeScript");
assert(contract.implementation?.pythonRuntimePresent === false, "current contract must reject Python runtime ownership");
assert(contract.implementation?.singleLiveSemanticRuntime === true, "accepted runtime must remain single");

const conformance = JSON.parse(readFileSync(join(repoRoot, "contracts/mts-conformance-v0.9.json"), "utf8")) as {
  readonly status?: string;
  readonly accepted?: boolean;
  readonly acceptanceReady?: boolean;
  readonly requiredExecutableGates?: readonly string[];
  readonly requiredNegativeVectors?: readonly string[];
  readonly vectorEvidence?: {
    readonly negative?: Readonly<Record<string, readonly string[]>>;
  };
};
assert(conformance.status === "accepted" && conformance.accepted === true, "current v0.9 conformance must be accepted");
assert(conformance.acceptanceReady === true, "accepted v0.9 conformance must retain proven readiness");

function mappedNegativeVector(id: string): boolean {
  if (!conformance.requiredNegativeVectors?.includes(id)) return false;
  const requiredGates = new Set(conformance.requiredExecutableGates ?? []);
  const evidence = conformance.vectorEvidence?.negative ?? {};
  return Object.entries(evidence).some(([testPath, ids]) => requiredGates.has(testPath) && ids.includes(id));
}

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

// Retain the accepted-v0.8 physical safety anchors so trusted base policy remains
// independently checkable during the atomic cutover.
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
negativeVector("read-or-replay-materializes", memory.linkCount === countBeforeRead && mappedNegativeVector("read-or-replay-materializes"));

let rootRejected = false;
try {
  deserializeStream("R", symbolicStackAlgebra);
} catch (error) {
  rootRejected = error instanceof StreamError && error.code === "non-abit";
}
negativeVector("root-as-fifth-abit", rootRejected);
negativeVector("empty-group-rejected", deserializeStream("[]", symbolicStackAlgebra).denotation === "R");

// The following accepted-v0.9 anchors do not duplicate semantic execution.
// They prove that every current negative vector is bound to one of the exact
// executable gates that full CI runs. The semantic checks stay in those gates.
negativeVector("exact-sequence-empty-vs-single-root", mappedNegativeVector("exact-sequence-empty-vs-single-root"));
negativeVector("exact-sequence-leading-root-loss", mappedNegativeVector("exact-sequence-leading-root-loss"));
negativeVector("restricted-rooted-sequence-admits-root", mappedNegativeVector("restricted-rooted-sequence-admits-root"));
negativeVector("exact-sequence-malformed-cell", mappedNegativeVector("exact-sequence-malformed-cell"));
negativeVector("exact-sequence-predecessor-cycle", mappedNegativeVector("exact-sequence-predecessor-cycle"));
negativeVector("q-state-hidden-started-disagrees", mappedNegativeVector("q-state-hidden-started-disagrees"));
negativeVector("canonical-string-carrier-codepoint-envelope", mappedNegativeVector("canonical-string-carrier-codepoint-envelope"));
negativeVector("canonical-byte-opaque-runtime-id", mappedNegativeVector("canonical-byte-opaque-runtime-id"));
negativeVector("forged-interpreter-configuration", mappedNegativeVector("forged-interpreter-configuration"));
negativeVector("interpreter-components-disagree-with-evidence", mappedNegativeVector("interpreter-components-disagree-with-evidence"));
negativeVector("forged-role-dictionary", mappedNegativeVector("forged-role-dictionary"));
negativeVector("rule-not-admitted-by-theory", mappedNegativeVector("rule-not-admitted-by-theory"));
negativeVector("rule-missing-required-role", mappedNegativeVector("rule-missing-required-role"));
negativeVector("rule-conflicting-role-binding", mappedNegativeVector("rule-conflicting-role-binding"));
negativeVector("rule-undeclared-role-binding", mappedNegativeVector("rule-undeclared-role-binding"));
negativeVector("rule-wrong-result", mappedNegativeVector("rule-wrong-result"));
negativeVector("rule-wrong-before-context", mappedNegativeVector("rule-wrong-before-context"));
negativeVector("rule-wrong-after-context", mappedNegativeVector("rule-wrong-after-context"));
negativeVector("context-close-wrong-parent", mappedNegativeVector("context-close-wrong-parent"));
negativeVector("parent-continuation-wrong-interpreter", mappedNegativeVector("parent-continuation-wrong-interpreter"));
negativeVector("returned-root-disappears-from-exact-parent-sequence", mappedNegativeVector("returned-root-disappears-from-exact-parent-sequence"));
negativeVector("noncanonical-unparenthesized-formal-relation", mappedNegativeVector("noncanonical-unparenthesized-formal-relation"));
negativeVector("empty-formal-context-admitted", mappedNegativeVector("empty-formal-context-admitted"));
