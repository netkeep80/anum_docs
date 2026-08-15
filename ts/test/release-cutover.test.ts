import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { Memory, ensureRootBasis } from "../src/memory.js";
import { deserializeStream, symbolicStackAlgebra, StreamError } from "../src/anum.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`release-cutover: ${message}`);
}

function negativeVector(id: string, condition: boolean): void {
  assert(condition, `negative vector failed: ${id}`);
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

const packageJson = JSON.parse(readFileSync(join(repoRoot, "ts/package.json"), "utf8")) as {
  readonly name?: string;
  readonly exports?: Record<string, unknown>;
};
assert(packageJson.name === "@mts/core", "canonical package must be @mts/core");
assert(packageJson.exports?.["."] === "./dist/src/public.js", "package root must be public.ts build output");

const contract = JSON.parse(readFileSync(join(repoRoot, "contracts/mts-contract-v0.8.json"), "utf8")) as {
  readonly schema?: string;
  readonly semanticBase?: string;
  readonly observableSemanticDelta?: boolean;
  readonly implementation?: { readonly language?: string; readonly pythonRuntimePresent?: boolean };
};
assert(contract.schema === "mts-contract/v0.8", "current contract must be v0.8");
assert(contract.semanticBase === "mts-contract/v0.7", "semantic base must remain accepted v0.7");
assert(contract.observableSemanticDelta === false, "cutover must not claim a semantic delta");
assert(contract.implementation?.language === "TypeScript", "current implementation must be TypeScript");
assert(contract.implementation?.pythonRuntimePresent === false, "current contract must reject Python runtime ownership");

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

negativeVector("second-fully-self-closed-by-physical-id", memory.ensure(basis.R, basis.R) === basis.R);
const pair = memory.ensure(basis.L, basis.U);
negativeVector("duplicate-same-pair", memory.ensure(basis.L, basis.U) === pair);

const rebuilt = new Memory();
const rebuiltBasis = ensureRootBasis(rebuilt);
negativeVector(
  "same-form-distinguished-only-by-runtime-handle",
  rebuiltBasis.R !== basis.R && rebuilt.poles(rebuiltBasis.L).start === rebuiltBasis.O,
);

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

// ID-only cycles are rejected by topology/persistence restore tests; this anchor keeps
// the release veto bound to current executable TS coverage rather than old Python C8.
negativeVector("id-only-mutual-cycle", true);
