// Technical policy regression for task #2173; not a substitute for actual repo-guard check-pr.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

type Budget = { max_new_files: number; max_new_docs: number; max_net_added_lines: number };
type Profile = {
  allow_surfaces: string[];
  require_surfaces: string[];
  allow_unclassified_surfaces: boolean;
  budgets: Budget;
};
type Policy = {
  surfaces: Record<string, string[]>;
  change_profiles: Record<string, Profile>;
  diff_rules: Budget;
  size_rules: Array<{ id: string; max: number; max_growth: number }>;
};
const p = JSON.parse(readFileSync(resolve("..", "repo-policy.json"), "utf8")) as Policy;
const scienceName = "post-v015-science-source-reader-evidence-technical-merge";
const science: Profile = p.change_profiles[scienceName] ?? (() => {
  throw new Error("exact scientific change profile required");
})();
assert.equal(science.allow_unclassified_surfaces, false);
assert.deepEqual(science.budgets, {
  max_new_docs: 0,
  max_new_files: 108,
  max_net_added_lines: 17118,
});
assert.equal(p.diff_rules.max_net_added_lines, 800, "global budget must remain unchanged");
const size = p.size_rules.find((rule) => rule.id === "typescript-tests-controlled-growth");
assert.ok(size);
assert.equal(size.max, 1000);
assert.equal(size.max_growth, 1);

function pathsForSurfaces(names: readonly string[]): string[] {
  return [...new Set(names.flatMap((name) => {
    const paths = p.surfaces[name];
    assert.ok(paths, `missing surface ${name}`);
    return paths;
  }))].sort();
}
function fingerprint(paths: readonly string[]): string {
  let hash = 2166136261;
  for (const char of paths.join("\n") + "\n") {
    hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
const allowed = pathsForSurfaces(science.allow_surfaces);
assert.equal(allowed.length, 112, "exact 112 file scientific path scope");
assert.equal(fingerprint(allowed), "ecc9ea1d", "scientific path inventory must not silently widen or shrink");
assert.deepEqual(science.allow_surfaces, [
  "science-corpus-pr2173-exact-files",
  "science-shared-reader-coverage-files",
  "science-shared-research-classification-test",
]);
assert.deepEqual(science.require_surfaces, science.allow_surfaces);
assert.equal(p.surfaces["science-corpus-pr2173-exact-files"]?.length, 109);
assert.equal(p.surfaces["science-shared-reader-coverage-files"]?.length, 2);
assert.equal(p.surfaces["science-shared-research-classification-test"]?.length, 1);

// Structural rejection witnesses. Real enforcement is subsequently checked by RepoGuard CI.
function permits(changeType: string, changed: readonly string[], budget: Budget): boolean {
  if (changeType !== scienceName || science.allow_unclassified_surfaces) return false;
  if (changed.some((path) => !allowed.includes(path))) return false;
  if (science.require_surfaces.some((surface) =>
    !changed.some((path) => p.surfaces[surface]?.includes(path)))) return false;
  return budget.max_new_files <= science.budgets.max_new_files &&
    budget.max_new_docs <= science.budgets.max_new_docs &&
    budget.max_net_added_lines <= science.budgets.max_net_added_lines;
}
const exactBudget = { max_new_docs: 0, max_new_files: 108, max_net_added_lines: 17118 };
assert.ok(permits(scienceName, allowed, exactBudget), "known science path set must fit narrowly");
assert.equal(permits(scienceName, [...allowed, "ts/test/unrelated-expansion.test.ts"], exactBudget), false,
  "unrelated file must fail");
assert.equal(permits("post-v015-science-source-corpus-technical-merge", allowed, exactBudget), false,
  "wrong change_type must fail");
assert.equal(permits(scienceName, allowed, { ...exactBudget, max_net_added_lines: 17119 }), false,
  "over-budget net lines must fail");
assert.equal(permits(scienceName, allowed, { ...exactBudget, max_new_files: 109 }), false,
  "over-budget new files must fail");

// Compare old #2153/#2138 *effective path sets*, not mere surface names.
const previous = [
  ["post-v015-science-source-corpus-technical-merge", ["requirements/mts-source/MTS-READER-INTRO-PROPOSAL.yaml","requirements/mts-source/MTS-READER-ROUTE-PROPOSAL.yaml","requirements/mts-source/MTS-READER-V14-G10.yaml","requirements/mts-source/MTS-READER-V14-G7.yaml","requirements/mts-source/MTS-READER-V14-G8.yaml","requirements/mts-source/MTS-READER-V15-G11-W1.yaml","requirements/mts-source/MTS-READER-V15-G11-W2.yaml","requirements/mts-source/MTS-READER-V15-G11-W3.yaml","requirements/mts-source/MTS-READER-V15-G11-W4.yaml","ts/src/tooling/mts-reader-coverage.ts","ts/test/mts-reader-coverage.test.ts","ts/test/research-v013-semantic-dependency-projection-a9.test.ts"]],
  ["post-v015-science-source-foundation-technical-merge", ["requirements/mts-source/MTS-FND-V14-L1.yaml","ts/package-lock.json","ts/package.json","ts/src/tooling/mts-source-requirement.ts","ts/test/mts-source-requirement.test.ts","ts/test/research-v013-semantic-dependency-projection-a9.test.ts"]],
] as const;
for (const [name, expected] of previous) {
  const prior = p.change_profiles[name];
  assert.ok(prior, `missing prior profile ${name}`);
  assert.equal(prior.allow_unclassified_surfaces, false);
  assert.deepEqual(pathsForSurfaces(prior.allow_surfaces), [...expected].sort(),
    `prior profile ${name} unexpectedly widened`);
  assert.deepEqual(pathsForSurfaces(prior.require_surfaces), [...expected].sort(),
    `prior required surfaces of ${name} changed`);
}
console.log("RepoGuard exact scientific profile: positive and negative policy-data regression PASS");
