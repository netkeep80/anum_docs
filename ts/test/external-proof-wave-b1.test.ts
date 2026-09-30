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
const lean = readFileSync(resolve(root, "proofs", "lean4", "MtsFoundation.lean"), "utf8");
const rocq = readFileSync(resolve(root, "proofs", "coq", "MtsFoundation.v"), "utf8");

const expectedStatements: Record<string, string> = {
  "FND-03":
    "R/O/C/L are derived structural representatives of the accepted Link foundation under an orientation convention, not four independent ontology primitives.",
  "FND-04":
    "U = C ⟼ O is an ordinary PAIR-derived representative and not a fifth self-incidence class.",
};

const expectedSymbols: Record<string, { lean4: string[]; rocq: string[] }> = {
  "FND-03": {
    lean4: ["MTS.External.FND_03_derived_aspect_basis"],
    rocq: ["FND_03_derived_aspect_basis"],
  },
  "FND-04": {
    lean4: ["MTS.External.FND_04_u_is_ordinary_pair"],
    rocq: ["FND_04_u_is_ordinary_pair"],
  },
};

for (const id of ["FND-03", "FND-04"]) {
  const target = p0.targets.find((entry: any) => entry.id === id);
  assert.ok(target, `${id} must exist in frozen P0`);
  assert.equal(target.wave, "B", `${id} remains a Wave-B target`);
  assert.equal(target.statement, expectedStatements[id], `${id} frozen statement`);

  const assured = assurance.targets.find((entry: any) => entry.id === id);
  assert.ok(assured, `${id} must be registered in external proof assurance`);
  assert.deepEqual(assured.lean4, expectedSymbols[id]!.lean4, `${id} Lean assurance symbols`);
  assert.deepEqual(assured.rocq, expectedSymbols[id]!.rocq, `${id} Rocq assurance symbols`);

  for (const lane of ["lean4", "coq"]) {
    const path = resolve(root, "proofs", "evidence", id, `${lane}.json`);
    assert.ok(existsSync(path), `${id} ${lane} portable evidence must exist`);
    const evidence = JSON.parse(readFileSync(path, "utf8"));
    assert.equal(evidence.theoremId, id, `${id} ${lane} theorem id`);
    assert.equal(evidence.lane, lane, `${id} ${lane} lane`);
    assert.equal(evidence.result, "proved", `${id} ${lane} result`);
    assert.equal(evidence.authority, "external-cross-check", `${id} ${lane} authority`);
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
    assert.equal(
      evidence.proofSource.commitSha,
      "6a6cfc3fa47aa310676cccfddf4f166f459d3cba",
      `${id} ${lane} exact kernel-GREEN proof source`,
    );
  }
}

for (const symbol of [
  "FND_03_derived_aspect_basis",
  "f2f3_reverse_pair_pattern",
  "FND_04_u_is_ordinary_pair",
]) {
  assert.ok(lean.includes(symbol), `Lean Wave-B1 source must expose ${symbol}`);
  assert.ok(rocq.includes(symbol), `Rocq Wave-B1 source must expose ${symbol}`);
}

assert.ok(
  !/inductive\s+.*Aspect|structure\s+.*Aspect|enum\s+.*Aspect/u.test(lean),
  "Lean Wave-B1 must not introduce a four-aspect ontology datatype",
);
assert.ok(
  !/Inductive\s+.*Aspect|Record\s+.*Aspect/u.test(rocq),
  "Rocq Wave-B1 must not introduce a four-aspect ontology datatype",
);

console.log("external proof Wave-B1: GREEN FND-03+FND-04 paired kernel/evidence");
