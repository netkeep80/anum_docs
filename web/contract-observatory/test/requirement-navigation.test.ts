import { loadCompiledMtsSemanticIr, type ObservatorySemanticIr } from "../src/semantic-ir-bridge.js";
import { buildRequirementNavigationModel } from "../src/requirement-navigation.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Contract Observatory P3b: ${message}`);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}

const repositoryRoot = process.cwd();
const ir = loadCompiledMtsSemanticIr(repositoryRoot);
const model = buildRequirementNavigationModel(ir);

same(model.entries.length, ir.requirements.length, "all validated requirements are navigable");
same(model.diagnostics.length, 0, "validated current IR has no unresolved navigation diagnostics");
same(model.versionComparison.available, false, "single compiled registry does not fabricate version comparison");
assert(model.versionComparison.reason?.includes("compiler-supported requirement registry") === true, "missing previous registry is explicit");
assert(model.kinds.length > 0, "kind filters are derived");
assert(model.statuses.includes("accepted"), "status filters are derived");
assert(model.layers.includes("representation"), "top-level classification layers are derived");

const byId = new Map(model.entries.map((item) => [item.id, item] as const));
for (const item of model.entries) {
  same(item.layer, item.classificationPath.split("/")[0], `${item.id}: layer comes from classification path`);
  for (const dependency of item.dependsOn) {
    const parent = byId.get(dependency);
    assert(parent !== undefined, `${item.id}: dependency exists`);
    assert(parent.dependents.includes(item.id), `${item.id}: reverse dependent backlink exists on ${dependency}`);
  }
  for (const dependent of item.dependents) {
    const child = byId.get(dependent);
    assert(child !== undefined, `${item.id}: dependent exists`);
    assert(child.dependsOn.includes(item.id), `${item.id}: dependent backlink is reciprocal for ${dependent}`);
  }
}

const changed = { ...ir.requirements[0]!, statementDigest: "changed-digest" };
const previousOnly = { ...ir.requirements[0]!, id: "OLD", statementDigest: "old-only" };
const previous: ObservatorySemanticIr = Object.freeze({
  ...ir,
  contract: "mts-contract/previous-fixture",
  requirements: Object.freeze([
    changed,
    ...ir.requirements.slice(1, -1),
    previousOnly,
  ]),
});
const compared = buildRequirementNavigationModel(ir, previous).versionComparison;
same(compared.available, true, "comparison activates only with a second validated-style IR");
same(compared.previousContract, "mts-contract/previous-fixture", "previous contract identity is explicit");
same(compared.rows.find((row) => row.id === changed.id)?.state, "changed", "stable ID detects changed metadata");
same(compared.rows.find((row) => row.id === ir.requirements.at(-1)!.id)?.state, "added", "current-only stable ID is added");
same(compared.rows.find((row) => row.id === "OLD")?.state, "removed", "previous-only stable ID is removed");

console.log(`Contract Observatory P3b requirement navigation: GREEN requirements=${model.entries.length} diagnostics=${model.diagnostics.length}`);
