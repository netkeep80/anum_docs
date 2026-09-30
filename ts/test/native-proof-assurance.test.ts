import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function findRepositoryRoot(): string {
  const candidates = [resolve(process.cwd(), ".."), process.cwd()];
  const root = candidates.find((candidate) =>
    existsSync(resolve(candidate, "proofs", "native-proof-assurance.json")),
  );
  if (root === undefined) throw new Error("native proof assurance repository root not found");
  return root;
}

const root = findRepositoryRoot();
const assurance = JSON.parse(
  readFileSync(resolve(root, "proofs", "native-proof-assurance.json"), "utf8"),
);
const p0 = JSON.parse(
  readFileSync(resolve(root, "theorems", "p0-v0.14.json"), "utf8"),
);
const external = JSON.parse(
  readFileSync(resolve(root, "proofs", "external-proof-assurance.json"), "utf8"),
);

assert.equal(assurance.schema, "mts-native-proof-assurance/v0.1");
assert.equal(assurance.status, "active");
assert.equal(assurance.authority, "native-proof-assurance-classification-only");
assert.equal(assurance.proofTruthAuthority, "trusted-rooted-proof-anet-replay");
assert.equal(
  assurance.independentCrossCheckAuthority,
  "external-lean4-rocq-kernel-lane",
);

const allowed = new Set<string>(assurance.allowedClassifications);
assert(allowed.has("KERNEL_REALIZED_NOT_INDEPENDENT"));
assert(allowed.has("DERIVED_CLOSED_PROOF_ANET"));

const p0Ids = new Set<string>(p0.targets.map((target: any) => target.id));
const externalIds = new Set<string>(external.targets.map((target: any) => target.id));
const seen = new Set<string>();

function gitBlobSha(path: string): string {
  return execFileSync("git", ["rev-parse", `HEAD:${path}`], {
    cwd: root,
    encoding: "utf8",
  }).trim();
}

for (const target of assurance.targets) {
  assert.equal(typeof target.id, "string");
  assert(p0Ids.has(target.id), `native assurance target is not in P0: ${target.id}`);
  assert(!seen.has(target.id), `duplicate native assurance target: ${target.id}`);
  seen.add(target.id);

  assert(
    allowed.has(target.classification),
    `unknown native assurance classification for ${target.id}`,
  );
  assert(
    externalIds.has(target.id),
    `${target.id}: native assurance must retain external differential cross-check`,
  );

  if (target.classification === "KERNEL_REALIZED_NOT_INDEPENDENT") {
    assert.equal(target.independent, false, `${target.id}: kernel realization is not independent`);
  }

  assert.equal(typeof target.kernelLaw, "string");
  assert(target.kernelLaw.length > 0, `${target.id}: kernel law required`);
  assert(Array.isArray(target.evidence) && target.evidence.length > 0);
  assert(Array.isArray(target.overclaimVeto) && target.overclaimVeto.length > 0);

  for (const evidence of target.evidence) {
    const path = resolve(root, evidence.path);
    assert(existsSync(path), `${target.id}: missing native evidence path ${evidence.path}`);
    assert.equal(
      gitBlobSha(evidence.path),
      evidence.gitBlobSha,
      `${target.id}: native evidence blob drift ${evidence.path}`,
    );
  }

  assert.equal("proved" in target, false, `${target.id}: JSON classification cannot assert proved`);
  assert.equal(
    "independentProof" in target,
    false,
    `${target.id}: JSON classification cannot assert independentProof`,
  );
}

assert.deepEqual(
  [...seen].sort(),
  ["FND-02", "FND-13"],
  "Native-N2 initial assured target set is exact",
);

const kernelSource = readFileSync(
  resolve(root, "ts", "src", "recursive-link-identity-proof.ts"),
  "utf8",
);
const kernelTest = readFileSync(
  resolve(root, "ts", "test", "recursive-link-identity-proof.test.ts"),
  "utf8",
);
const cycleTest = readFileSync(
  resolve(root, "ts", "test", "v013-cyclic-grounding-boundary.test.ts"),
  "utf8",
);

assert(
  kernelSource.includes('case "full":') &&
    kernelSource.includes("data.left !== memory.root") &&
    kernelSource.includes('fail("invalid-root-base")'),
  "FND-02 kernel realization must retain canonical ROOT/full-selfclosed base",
);
assert(
  kernelTest.includes("fully selfclosed proof is accepted only") &&
    kernelTest.includes('"invalid-root-base"'),
  "FND-02 executable negative boundary must remain present",
);

assert(
  kernelSource.includes('case "ordinary":') &&
    kernelSource.includes("[left.start, right.start]") &&
    kernelSource.includes("[left.end, right.end]"),
  "FND-13 kernel realization must recurse through ordered poles",
);
assert(
  kernelSource.includes('fail("cyclic-grounding")') &&
    cycleTest.includes("current well-founded recursive identity proof rejects"),
  "FND-13 native realization must fail closed on cyclic grounding",
);

assert.equal(seen.size, 2);
assert.equal(p0.targets.length, 21);

const independent = assurance.targets.filter((target: any) => target.independent === true);
assert.equal(independent.length, 0, "Native-N2 must not claim an independent native theorem proof");

console.log(`NATIVE_ASSURANCE_TARGETS = ${seen.size}/${p0.targets.length}`);
console.log("FND02_NATIVE = KERNEL_REALIZED_NOT_INDEPENDENT");
console.log("FND13_NATIVE = KERNEL_REALIZED_NOT_INDEPENDENT");
console.log(`INDEPENDENT_NATIVE_PROOFS = ${independent.length}`);
console.log("accepted semantic delta = NONE");
