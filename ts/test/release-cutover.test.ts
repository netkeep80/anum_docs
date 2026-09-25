import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  Memory,
  MemoryError,
  ensureRootBasis,
  type LinkHandle,
  type LinkPoles,
  type ReadMemory,
  type RootBasis,
} from "../src/memory.js";
import { deserializeStream, symbolicStackAlgebra, StreamError } from "../src/anum.js";
import {
  PersistenceTopologyError,
  STORAGE_TOPOLOGY_SCHEMA,
  restoreTopology,
} from "../src/persistence-topology.js";
import {
  V013HierarchicalCarrierError,
  decomposeV013SemanticLink,
} from "../src/v013-hierarchical-carrier.js";

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


function rejectsForeignAbitHandle(): boolean {
  const memoryA = new Memory();
  const basisA = ensureRootBasis(memoryA);
  const memoryB = new Memory();
  const basisB = ensureRootBasis(memoryB);

  try {
    memoryA.poles(basisB.O);
    return false;
  } catch (error) {
    if (!(error instanceof MemoryError)) return false;
  }

  try {
    memoryB.poles(basisA.L);
    return false;
  } catch (error) {
    return error instanceof MemoryError;
  }
}

function rejectsSecondBothSelfClosedSemanticLink(): boolean {
  const handle = (): LinkHandle => Object.freeze({}) as LinkHandle;
  const R = handle();
  const O = handle();
  const C = handle();
  const L = handle();
  const U = handle();
  const X = handle();

  const cells = new Map<LinkHandle, LinkPoles>([
    [R, Object.freeze({ start: R, end: R })],
    [O, Object.freeze({ start: O, end: R })],
    [C, Object.freeze({ start: R, end: C })],
    [L, Object.freeze({ start: O, end: C })],
    [U, Object.freeze({ start: C, end: O })],
    [X, Object.freeze({ start: X, end: X })],
  ]);
  const basis: RootBasis = Object.freeze({ R, O, C, L, U });

  class SyntheticReadMemory implements ReadMemory {
    readonly root = R;
    get linkCount(): number { return cells.size; }
    poles(link: LinkHandle): LinkPoles {
      const poles = cells.get(link);
      if (poles === undefined) throw new MemoryError("unknown synthetic Link");
      return poles;
    }
    find(): LinkHandle | undefined { return undefined; }
    outgoing(): readonly LinkHandle[] { return []; }
    incoming(): readonly LinkHandle[] { return []; }
  }

  try {
    decomposeV013SemanticLink(new SyntheticReadMemory(), basis, X);
    return false;
  } catch (error) {
    return error instanceof V013HierarchicalCarrierError
      && error.code === "invalid-semantic-link";
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

const traceability13 = JSON.parse(
  readFileSync(join(repoRoot, "traceability/mts-v0.13.json"), "utf8"),
) as {
  readonly invariants?: Readonly<Record<string, {
    readonly negative?: { readonly requiredNegativeVectors?: readonly string[] };
    readonly requiredExecutableGates?: readonly string[];
  }>>;
};

function mappedV013NegativeVector(conformance: ConformanceBoundary, id: string): boolean {
  if (!conformance.requiredNegativeVectors?.includes(id)) return false;
  const requiredGates = new Set(conformance.requiredExecutableGates ?? []);
  for (const invariant of Object.values(traceability13.invariants ?? {})) {
    if (!invariant.negative?.requiredNegativeVectors?.includes(id)) continue;
    if ((invariant.requiredExecutableGates ?? []).some((gate) =>
      requiredGates.has(gate) && existsSync(join(repoRoot, gate)))) return true;
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

const contract = JSON.parse(readFileSync(join(repoRoot, "contracts/mts-contract-v0.13.json"), "utf8")) as {
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
assert(contract.schema === "mts-contract/v0.13", "current contract must be v0.13");
assert(contract.status === "accepted" && contract.accepted === true, "current v0.13 contract must be accepted");
assert(contract.semanticBase === "mts-contract/v0.12", "v0.13 semantic base must be accepted v0.12");
assert(contract.observableSemanticDelta === true, "v0.13 must retain its explicit semantic delta");
assert(contract.acceptanceReady === true, "accepted v0.13 must retain proven readiness");
assert(contract.implementation?.language === "TypeScript", "current implementation must be TypeScript");
assert(contract.implementation?.pythonRuntimePresent === false, "current contract must reject Python runtime ownership");
assert(contract.implementation?.singleLiveSemanticRuntime === true, "accepted runtime must remain single");
assert(contract.implementation?.compatibilityRuntimeSelectable === false, "compatibility runtime must remain unavailable");

const conformance = JSON.parse(
  readFileSync(join(repoRoot, "contracts/mts-conformance-v0.13.json"), "utf8"),
) as ConformanceBoundary;
assert(conformance.status === "accepted" && conformance.accepted === true, "current v0.13 conformance must be accepted");
assert(conformance.acceptanceReady === true, "accepted v0.13 conformance must retain proven readiness");

// Keep the immediately previous accepted release independently checkable.
const previousConformance = JSON.parse(
  readFileSync(join(repoRoot, "contracts/mts-conformance-v0.12.json"), "utf8"),
) as ConformanceBoundary;
assert(previousConformance.status === "accepted" && previousConformance.accepted === true, "previous v0.12 conformance must remain accepted evidence");
assert(previousConformance.acceptanceReady === true, "previous v0.12 conformance must retain proven readiness");

const historicalConformance = JSON.parse(
  readFileSync(join(repoRoot, "contracts/mts-conformance-v0.11.json"), "utf8"),
) as ConformanceBoundary;

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
negativeVector("v011-root-is-not-execution-frame", mappedNegativeVector(historicalConformance, "v011-root-is-not-execution-frame"));
negativeVector("v011-dot-is-not-ambient-runtime-current", mappedNegativeVector(historicalConformance, "v011-dot-is-not-ambient-runtime-current"));
negativeVector("v011-top-bind-does-not-insert-hidden-root-glyph", mappedNegativeVector(historicalConformance, "v011-top-bind-does-not-insert-hidden-root-glyph"));
negativeVector("v011-nonroot-pair-A-A-is-not-A", mappedNegativeVector(historicalConformance, "v011-nonroot-pair-A-A-is-not-A"));
negativeVector("v011-colon-meaning-is-not-dot-dot-fold", mappedNegativeVector(historicalConformance, "v011-colon-meaning-is-not-dot-dot-fold"));
negativeVector("v011-q-alphabet-remains-four-abits", mappedNegativeVector(historicalConformance, "v011-q-alphabet-remains-four-abits"));
negativeVector("v011-dot-is-not-q-abit", mappedNegativeVector(historicalConformance, "v011-dot-is-not-q-abit"));
negativeVector("v011-colon-is-not-q-abit", mappedNegativeVector(historicalConformance, "v011-colon-is-not-q-abit"));
negativeVector("v011-host-stack-is-not-semantic-authority", mappedNegativeVector(historicalConformance, "v011-host-stack-is-not-semantic-authority"));

// Previous-v0.12 anchors remain independently checkable through their accepted evidence map.
assert((previousConformance.requiredExecutableGates ?? []).length === 16, "previous accepted v0.12 keeps all 16 mandatory executable gates");
negativeVector("v012-string-glyph-one-is-not-q-abit-one", mappedNegativeVector(previousConformance, "v012-string-glyph-one-is-not-q-abit-one"));
negativeVector("v012-formal-square-brackets-do-not-select-q-child", mappedNegativeVector(previousConformance, "v012-formal-square-brackets-do-not-select-q-child"));
negativeVector("v012-representation-is-not-interpretation", mappedNegativeVector(previousConformance, "v012-representation-is-not-interpretation"));
negativeVector("v012-formal-empty-parentheses-are-not-a-valid-result", mappedNegativeVector(previousConformance, "v012-formal-empty-parentheses-are-not-a-valid-result"));
negativeVector("v012-child-creation-does-not-auto-select-contextual-k", mappedNegativeVector(previousConformance, "v012-child-creation-does-not-auto-select-contextual-k"));
negativeVector("v012-nearest-lexical-frame-is-not-semantic-authority", mappedNegativeVector(previousConformance, "v012-nearest-lexical-frame-is-not-semantic-authority"));
negativeVector("v012-ambient-current-is-not-semantic-authority", mappedNegativeVector(previousConformance, "v012-ambient-current-is-not-semantic-authority"));
negativeVector("v012-hidden-parent-traversal-is-not-semantic-authority", mappedNegativeVector(previousConformance, "v012-hidden-parent-traversal-is-not-semantic-authority"));
negativeVector("v012-link-left-association-is-not-formal-grammar", mappedNegativeVector(previousConformance, "v012-link-left-association-is-not-formal-grammar"));
negativeVector("v012-generic-flat-reader-is-not-formal-grammar", mappedNegativeVector(previousConformance, "v012-generic-flat-reader-is-not-formal-grammar"));
negativeVector("v012-formal-square-bracket-low-level-open-is-not-authority", mappedNegativeVector(previousConformance, "v012-formal-square-bracket-low-level-open-is-not-authority"));
negativeVector("v012-formal-square-bracket-missing-rule-does-not-open", mappedNegativeVector(previousConformance, "v012-formal-square-bracket-missing-rule-does-not-open"));
negativeVector("v012-formal-square-bracket-substituted-q-rule-does-not-open", mappedNegativeVector(previousConformance, "v012-formal-square-bracket-substituted-q-rule-does-not-open"));

// Current v0.13 keeps the exact accepted executable boundary.
assert((conformance.requiredExecutableGates ?? []).length === 39, "accepted v0.13 keeps all 39 mandatory executable gates");
negativeVector("v013-flat-relative-glyph-collision-not-canonical", mappedV013NegativeVector(conformance, "v013-flat-relative-glyph-collision-not-canonical"));
negativeVector("v013-noncanonical-pair-188-rejected", mappedV013NegativeVector(conformance, "v013-noncanonical-pair-188-rejected"));
negativeVector("v013-noncanonical-pair-1988-rejected", mappedV013NegativeVector(conformance, "v013-noncanonical-pair-1988-rejected"));
negativeVector("v013-noncanonical-pair-1868-rejected", mappedV013NegativeVector(conformance, "v013-noncanonical-pair-1868-rejected"));
negativeVector("v013-description-does-not-materialize-target", mappedV013NegativeVector(conformance, "v013-description-does-not-materialize-target"));
negativeVector("v013-wrong-structural-rule-writes-zero-target-links", mappedV013NegativeVector(conformance, "v013-wrong-structural-rule-writes-zero-target-links"));
negativeVector("v013-invalid-physical-opcode-fails-before-representation-writes", mappedV013NegativeVector(conformance, "v013-invalid-physical-opcode-fails-before-representation-writes"));
negativeVector("v013-empty-wire-is-not-root", mappedV013NegativeVector(conformance, "v013-empty-wire-is-not-root"));
negativeVector("v013-unrooted-sequence-lookalike-rejected", mappedV013NegativeVector(conformance, "v013-unrooted-sequence-lookalike-rejected"));
negativeVector("v013-unrooted-anum-hierarchy-rejected", mappedV013NegativeVector(conformance, "v013-unrooted-anum-hierarchy-rejected"));
negativeVector("v013-nonroot-both-selfclosed-rejected-by-root-uniqueness", rejectsSecondBothSelfClosedSemanticLink());
negativeVector("v013-foreign-abit-handle-rejected", rejectsForeignAbitHandle());
negativeVector("v013-current-recursive-proof-rejects-cycle-without-graph-cycle-evidence", mappedV013NegativeVector(conformance, "v013-current-recursive-proof-rejects-cycle-without-graph-cycle-evidence"));
negativeVector("v013-formal-root-wrong-rule-rejected", mappedV013NegativeVector(conformance, "v013-formal-root-wrong-rule-rejected"));
negativeVector("v013-formal-root-wrong-theory-rejected", mappedV013NegativeVector(conformance, "v013-formal-root-wrong-theory-rejected"));
negativeVector("v013-formal-root-malformed-prefix-rejected", mappedV013NegativeVector(conformance, "v013-formal-root-malformed-prefix-rejected"));
negativeVector("v013-formal-root-noncanonical-pair-alias-rejected", mappedV013NegativeVector(conformance, "v013-formal-root-noncanonical-pair-alias-rejected"));
negativeVector("v013-formal-root-no-host-term-special-case", mappedV013NegativeVector(conformance, "v013-formal-root-no-host-term-special-case"));
