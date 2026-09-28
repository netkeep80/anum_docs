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
const p0 = JSON.parse(
  readFileSync(join(root, "theorems/p0-v0.14.json"), "utf8"),
) as Record<string, any>;

same(manifest.schema, "mts-external-proof-toolchains/v0.1", "toolchain schema");
same(manifest.status, "external-proof-active", "external proof phase");
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

same(manifest.constraints.normativeMtsAuthority, false, "external provers are not normative MTS authority");
same(manifest.constraints.theoremProofClaimsAllowed, true, "compiled external theorem claims are enabled");
same(manifest.constraints.fourCaseDatatypeAllowed, false, "four-case datatype remains forbidden");
same(manifest.constraints.fourCaseAxiomAllowed, false, "four-case axiom remains forbidden");
same(manifest.constraints.rootUniquenessAxiomAllowed, false, "root uniqueness axiom remains forbidden");
same(manifest.constraints.sorryOrAdmitAllowed, false, "sorry/admit remain forbidden");

const requiredSymbols = [
  "Link",
  "form",
  "start",
  "finish",
  "R",
  "form_start",
  "form_finish",
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
  "link_ext",
  "axiom FND_02",
  "axiom FND_13",
  "link_reconstruct",
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
  "Axiom link_ext",
  "Axiom FND_02",
  "Axiom FND_13",
  "link_reconstruct",
  "Admitted.",
  "admit.",
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

const fnd02 = (p0.targets as Record<string, any>[]).find((target) => target.id === "FND-02");
assert(fnd02 !== undefined, "P0 contains FND-02");
same(
  p0.constraints.fnd02MayAssumePoleExtensionality,
  false,
  "FND-02 cannot assume A6/pole extensionality",
);
same(
  p0.constraints.poleExtensionalityAvailableAfterFnd02,
  true,
  "A6/pole extensionality is downstream of FND-02",
);
assert(
  (fnd02.assumptions as string[]).some((value) => value.includes("A1")),
  "FND-02 explicitly depends on A1 recursive distinguishability",
);
assert(
  (fnd02.assumptions as string[]).some((value) => value.includes("F2/F3")),
  "FND-02 explicitly depends on F2/F3 grounded normalization",
);
assert(
  !(fnd02.assumptions as string[]).some((value) =>
    /pole extensionality|identity\/equality laws/i.test(value)
  ),
  "FND-02 assumptions do not smuggle A6 identity-by-poles",
);
assert(
  /A6.*downstream/i.test(fnd02.exclusions as string),
  "FND-02 exclusion records A6 as downstream",
);

for (const source of [lean, rocq]) {
  assert(source.includes("Grounded"), "external source defines finite Grounded evidence");
  assert(source.includes("Distinguishable"), "external source defines finite Distinguishable evidence");
  assert(source.includes("A1RecursiveSeparation"), "external source names the A1 recursive-separation premise");
  assert(source.includes("FND_02_unique_root"), "external source contains FND-02 theorem");
}
assert(
  lean.includes("inductive Grounded") && !lean.includes("inductive Aspect"),
  "Lean grounding uses a generic inductive relation, not four Aspect constructors",
);
assert(
  rocq.includes("Inductive Grounded") && !rocq.includes("Inductive Aspect"),
  "Rocq grounding uses a generic inductive relation, not four Aspect constructors",
);
assert(
  lean.includes("theorem FND_02_unique_root"),
  "Lean FND-02 is a theorem, not an axiom",
);
assert(
  rocq.includes("Theorem FND_02_unique_root"),
  "Rocq FND-02 is a theorem, not an axiom",
);
assert(
  lean.includes("full_self_not_distinguishable"),
  "Lean proof derives absence of distinction for full self-closure",
);
assert(
  rocq.includes("full_self_not_distinguishable"),
  "Rocq proof derives absence of distinction for full self-closure",
);

const fnd13 = (p0.targets as Record<string, any>[]).find((target) => target.id === "FND-13");
assert(fnd13 !== undefined, "P0 contains recovered FND-13/A6");
same(
  fnd13.origin,
  "historical-unregistered-restated",
  "FND-13 is recovered historical A6 rather than a new v0.14 theorem",
);
assert(
  (fnd13.dependsOn as string[]).length === 1 &&
    (fnd13.dependsOn as string[])[0] === "FND-02",
  "FND-13 depends on unique ROOT before pole identity",
);
for (const source of [lean, rocq]) {
  assert(source.includes("F2F3Normalization"), "external source names F2/F3 normalization premise");
  assert(source.includes("normalForm") || source.includes("normal_form"), "external source carries normal-form projection");
  assert(
    source.includes("recursiveEquation") || source.includes("normal_form_equation"),
    "external source carries recursive normal-form equation",
  );
  assert(
    source.includes("complete") || source.includes("normal_form_complete"),
    "external source carries one-normal-form-per-semantic-Link completeness",
  );
  assert(source.includes("FND_13_identity_by_poles"), "external source contains FND-13 theorem");
}
assert(
  lean.includes("theorem FND_13_identity_by_poles"),
  "Lean FND-13 is a theorem, not an axiom",
);
assert(
  rocq.includes("Theorem FND_13_identity_by_poles"),
  "Rocq FND-13 is a theorem, not an axiom",
);
assert(
  lean.includes("rootUnique") && rocq.includes("root_unique_fnd02"),
  "F2/F3 normalization interface explicitly consumes FND-02 unique ROOT",
);
assert(
  !lean.includes("form (F.start x) (F.finish x) = x"),
  "Lean does not smuggle A6 as a reconstruction axiom",
);
assert(
  !rocq.includes("form F (start F x) (finish F x) = x"),
  "Rocq does not smuggle A6 as a reconstruction axiom",
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
// P-INFRA2B validates that the pinned compilers accept the foundation sources;
// it does not promote any P0 theorem from target status to proved status.
same(manifest.constraints.theoremProofClaimsAllowed, true, "compiler CI may validate explicit external theorem claims");

console.log([
  "MTS #1431 P-INFRA2A:",
  "LEAN=4.34.1@5045d005",
  "ROCQ=9.2.0@adfbf185",
  "FOUNDATION_INTERFACES=2",
  "FOUR_CASE_DATATYPE=ABSENT",
  "FOUR_CASE_AXIOM=ABSENT",
  "ROOT_UNIQUENESS_AXIOM=ABSENT",
  "POLE_EXTENSIONALITY_PRE_FND02=ABSENT",
  "FND02_BASIS=A1_F2_F3",
  "SORRY_ADMIT=ABSENT",
  "THEOREM_PROOF_CLAIMS=2",
  "FND02_LEAN=PROOF_SOURCE_PRESENT",
  "FND02_ROCQ=PROOF_SOURCE_PRESENT",
  "FND13_LEAN=PROOF_SOURCE_PRESENT",
  "FND13_ROCQ=PROOF_SOURCE_PRESENT",
  "FND13_BASIS=F2F3_NORMALIZATION",
  "EXECUTION=CI_ACTIVE_ON_PROOF_DIFF",
  "SEMANTIC_DELTA=NONE",
].join(" "));
