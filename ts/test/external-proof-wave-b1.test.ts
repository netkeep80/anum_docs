import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function findRepositoryRoot(): string {
  const candidates = [resolve(process.cwd(), ".."), process.cwd()];
  const root = candidates.find((candidate) =>
    existsSync(resolve(candidate, "theorems", "p0-v0.14.json")),
  );
  if (root === undefined) throw new Error("Wave-B proof root not found");
  return root;
}

const root = findRepositoryRoot();
const p0 = JSON.parse(
  readFileSync(resolve(root, "theorems", "p0-v0.14.json"), "utf8"),
);
const assurance = JSON.parse(
  readFileSync(resolve(root, "proofs", "external-proof-assurance.json"), "utf8"),
);

for (const id of ["FND-03", "FND-04"]) {
  const target = p0.targets.find((entry: any) => entry.id === id);
  assert.ok(target, `${id} must exist in frozen P0`);
  assert.equal(target.wave, "B", `${id} remains a Wave-B target`);

  const assured = assurance.targets.find((entry: any) => entry.id === id);
  assert.ok(assured, `${id} must be registered in external proof assurance`);
  assert.ok(
    Array.isArray(assured.lean4) && assured.lean4.length > 0,
    `${id} must expose at least one Lean theorem symbol`,
  );
  assert.ok(
    Array.isArray(assured.rocq) && assured.rocq.length > 0,
    `${id} must expose at least one Rocq theorem symbol`,
  );

  for (const lane of ["lean4", "coq"]) {
    const path = resolve(root, "proofs", "evidence", id, `${lane}.json`);
    assert.ok(existsSync(path), `${id} ${lane} portable evidence must exist`);
    const evidence = JSON.parse(readFileSync(path, "utf8"));
    assert.equal(evidence.theoremId, id, `${id} ${lane} theorem id`);
    assert.equal(evidence.lane, lane, `${id} ${lane} lane`);
    assert.equal(evidence.result, "proved", `${id} ${lane} result`);
    assert.deepEqual(
      evidence.assumptions,
      target.assumptions,
      `${id} ${lane} assumptions must match frozen P0`,
    );
    assert.deepEqual(
      evidence.dependencies,
      target.dependsOn,
      `${id} ${lane} dependencies must match frozen P0`,
    );
  }
}

console.log("external proof Wave-B1: GREEN FND-03+FND-04 paired evidence");
