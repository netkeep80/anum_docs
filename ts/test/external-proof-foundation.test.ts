import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

interface Toolchain {
  readonly role: string;
  readonly stable: boolean;
  readonly version: string;
  readonly tag: string;
  readonly commit: string;
  readonly repository: string;
  readonly releaseDate: string;
}

interface ToolchainManifest {
  readonly schema: string;
  readonly status: string;
  readonly acceptedMtsVersion: string;
  readonly p0Inventory: string;
  readonly authority: string;
  readonly execution: string;
  readonly lean4: Toolchain & { readonly mathlibDependency: boolean };
  readonly rocq: Toolchain & {
    readonly tagObject: string;
    readonly releaseTarballSha256: string;
    readonly standardLibraryDependency: boolean;
  };
  readonly constraints: {
    readonly normativeMtsAuthority: boolean;
    readonly theoremProofClaimsAllowed: boolean;
    readonly fourCaseDatatypeAllowed: boolean;
    readonly fourCaseAxiomAllowed: boolean;
    readonly rootUniquenessAxiomAllowed: boolean;
    readonly sorryOrAdmitAllowed: boolean;
  };
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`external proof foundation: ${message}`);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} != ${String(expected)}`);
}

const root = resolve(process.cwd(), "..");
const manifest = JSON.parse(
  readFileSync(join(root, "proofs/external-toolchains.json"), "utf8"),
) as ToolchainManifest;
const lean = readFileSync(join(root, "proofs/lean4/MtsFoundation.lean"), "utf8");
const rocq = readFileSync(join(root, "proofs/coq/MtsFoundation.v"), "utf8");
const ci = readFileSync(join(root, ".github/workflows/ci.yml"), "utf8");

same(manifest.schema, "mts-external-proof-toolchains/v0.1", "toolchain schema");
same(manifest.status, "compiler-ci-active", "compiler CI phase");
same(manifest.acceptedMtsVersion, "v0.14", "accepted MTS version");
same(manifest.p0Inventory, "theorems/p0-v0.14.json", "P0 inventory binding");
same(manifest.authority, "external-differential-evidence-only", "external prover role");
same(manifest.execution, "CI_ACTIVE_ON_PROOF_DIFF", "execution gate");

same(manifest.lean4.stable, true, "Lean stable pin");
same(manifest.lean4.version, "4.34.1", "Lean version");
same(manifest.lean4.tag, "v4.34.1", "Lean tag");
same(
  manifest.lean4.commit,
  "5045d0056413266e57c625dcd7c365b10e377c52",
  "Lean release commit",
);
same(manifest.lean4.mathlibDependency, false, "Lean foundation has no mathlib dependency");
same(
  (manifest.lean4 as Toolchain & { readonly linuxReleaseAsset?: string }).linuxReleaseAsset,
  "lean-4.34.1-linux.tar.zst",
  "Lean Linux release asset",
);
same(
  (manifest.lean4 as Toolchain & { readonly linuxReleaseSha256?: string }).linuxReleaseSha256,
  "47bf4bbd78f70c2e9670598ab7124d92b6efb7330ff33e5fbb4030f6fd72e4e4",
  "Lean Linux release digest",
);

same(manifest.rocq.stable, true, "Rocq stable pin");
same(manifest.rocq.version, "9.2.0", "Rocq version");
same(manifest.rocq.tag, "V9.2.0", "Rocq tag");
same(
  manifest.rocq.tagObject,
  "f4392b61e195f1554260589b8778eec39c4834ac",
  "Rocq signed tag object",
);
same(
  manifest.rocq.commit,
  "adfbf1855c348766beb4b790dcc8ebc02f908f63",
  "Rocq release commit",
);
same(
  manifest.rocq.releaseTarballSha256,
  "a45280ab4fbaac7540b136a6b073b4a6db15739ec1e149bded43fa6f4fc25f20",
  "Rocq release tarball digest",
);
same(
  manifest.rocq.standardLibraryDependency,
  false,
  "Rocq foundation has no standard-library dependency",
);
same(
  (manifest.rocq as ToolchainManifest["rocq"] & { readonly dockerManifestSha256?: string }).dockerManifestSha256,
  "61edd1ba7242c19b4261728c75437c1589d9383506ad2747f463a94c82857cf7",
  "Rocq Docker manifest digest",
);
same(
  (manifest.rocq as ToolchainManifest["rocq"] & { readonly imageOcaml?: string }).imageOcaml,
  "4.14.2+flambda",
  "Rocq image OCaml",
);

for (const [name, value] of Object.entries(manifest.constraints)) {
  same(value, false, `anti-cheat constraint ${name}`);
}

const requiredSymbols = [
  "Link",
  "form",
  "start",
  "finish",
  "R",
  "form_start",
  "form_finish",
  "link_ext",
  "root_self",
] as const;

for (const symbol of requiredSymbols) {
  assert(lean.includes(symbol), `Lean interface contains ${symbol}`);
  assert(rocq.includes(symbol), `Rocq interface contains ${symbol}`);
}

const leanForbidden = [
  "inductive Aspect",
  "inductive SelfIncidence",
  "ROOT | START",
  "axiom four",
  "root_unique",
  "sorry",
  "theorem FND",
  "Mathlib",
] as const;
for (const token of leanForbidden) {
  assert(!lean.includes(token), `Lean anti-cheat token absent: ${token}`);
}

const rocqForbidden = [
  "Inductive Aspect",
  "Inductive SelfIncidence",
  "Axiom four",
  "root_unique",
  "Admitted.",
  "admit.",
  "Theorem FND",
  "Require Import",
] as const;
for (const token of rocqForbidden) {
  assert(!rocq.includes(token), `Rocq anti-cheat token absent: ${token}`);
}

assert(
  lean.includes("root_self : form R R = R"),
  "Lean states root self-closure without root uniqueness",
);
assert(
  rocq.includes("form R R = R"),
  "Rocq states root self-closure without root uniqueness",
);

assert(ci.includes("Detect external proof diff"), "CI has conditional proof-diff gate");
assert(
  ci.includes("Compile pinned Lean external foundation"),
  "CI compiles Lean foundation",
);
assert(
  ci.includes("linuxReleaseSha256"),
  "CI reads Lean release digest from provenance manifest",
);
assert(
  ci.includes("Compile pinned Rocq external foundation"),
  "CI compiles Rocq foundation",
);
assert(
  ci.includes("rocq.dockerImage"),
  "CI reads digest-pinned Rocq image from provenance manifest",
);
assert(
  ci.includes("steps.external-proof-diff.outputs.run == 'true'"),
  "external compilers are conditional inside existing CI job",
);
assert(
  !ci.includes("jobs:\n  external-proofs:"),
  "no additional external-proof VM/job is introduced",
);

console.log([
  "MTS #1431 P-INFRA2A:",
  "LEAN=4.34.1@5045d005",
  "ROCQ=9.2.0@adfbf185",
  "FOUNDATION_INTERFACES=2",
  "FOUR_CASE_DATATYPE=ABSENT",
  "FOUR_CASE_AXIOM=ABSENT",
  "ROOT_UNIQUENESS_AXIOM=ABSENT",
  "SORRY_ADMIT=ABSENT",
  "THEOREM_PROOF_CLAIMS=0",
  "EXECUTION=CI_ACTIVE_ON_PROOF_DIFF",
  "SEMANTIC_DELTA=NONE",
].join(" "));
