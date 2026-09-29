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

// Integration pulse after portable INV-03/04 evidence merged to main:
// the external proof boundary is rechecked on the actual combined PR merge ref.
for (const [label, source] of [["Lean", lean], ["Rocq", rocq]] as const) {
  assert(
    source.includes("EXTERNAL PROJECTION BOUNDARY"),
    `${label} source declares the external projection boundary`,
  );
  assert(
    source.includes("not MTS ontology") &&
      source.includes("not leak back into MTS"),
    `${label} source forbids prover vocabulary from becoming MTS ontology`,
  );
}

for (const [label, source] of [["Lean", lean], ["Rocq", rocq]] as const) {
  assert(
    source.includes("EXTERNAL THEORY PROJECTION MANIFEST"),
    `${label} source declares the external-theory projection manifest`,
  );
  assert(
    source.includes("HOST FOUNDATION:") &&
      source.includes("USED EXTERNAL LOGIC / PROOF METHODS:") &&
      source.includes("ADDITIONAL EXTERNAL MATHEMATICAL THEORY:"),
    `${label} manifest separates prover foundation from additional theory`,
  );
  assert(
    source.includes("elementary group theory (Z2)") &&
      source.includes("EXTERNAL THEORY PROJECTION: elementary group theory (Z2)"),
    `${label} marks the Z2 group-theory projection explicitly`,
  );
  assert(
    source.includes("not MTS ontology or semantic authority"),
    `${label} keeps the external-theory no-backflow boundary`,
  );
}

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
  "open Classical",
  "Classical.em",
  "[DecidableEq",
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
  "classic.",
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
  false,
  "A6/pole extensionality is not inferred merely from completing FND-02",
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
  /separate explicit premises/i.test(fnd02.exclusions as string) &&
    /no dependency between them/i.test(fnd02.exclusions as string),
  "FND-02 exclusion records FND-13 as independent unless a bridge is proved",
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
  JSON.stringify(fnd13.dependsOn) === JSON.stringify([]),
  "FND-13 no longer claims a fake FND-02 dependency",
);
assert(
  JSON.stringify(fnd13.lawRefs) === JSON.stringify(["V14-L5"]),
  "FND-13 structural identity authority is V14-L5",
);
assert(
  JSON.stringify(fnd13.assumptions) === JSON.stringify([
    "F2/F3 name-neutral grounded normal-form completeness on the declared finite R-grounded theorem domain",
  ]),
  "FND-13 exposes exactly the grounded normalization-completeness premise",
);
assert(
  /finite R-grounded/i.test(String(fnd13.statement)) &&
    /Grounding|grounding|grounded/i.test(String(fnd13.scope)),
  "FND-13 P0 statement and scope remain explicitly finite-grounded",
);
assert(
  /stronger arbitrary-Link extensionality/i.test(String(fnd13.exclusions)) &&
    /not a premise of FND-13/i.test(String(fnd13.exclusions)),
  "FND-13 excludes global extensionality and fake FND-02 dependency",
);

for (const source of [lean, rocq]) {
  assert(
    source.includes("F2F3GroundedNormalization"),
    "external source names exact Grounded normalization premise",
  );
  assert(
    source.includes("F2F3Normalization"),
    "external source separately names stronger global normalization premise",
  );
  assert(
    source.includes("fnd13_form_injective"),
    "external source proves constructor injectivity independently",
  );
  assert(
    source.includes("FND_13_identity_by_poles"),
    "external source contains grounded FND-13 theorem",
  );
  assert(
    source.includes("global_identity_by_poles_from_complete_normalization"),
    "external source names stronger global extensionality auxiliary",
  );
  assert(
    source.includes("poles_recompose_from_global_normalization"),
    "external source attributes arbitrary-Link reconstruction to global normalization",
  );
}
assert(
  lean.includes("theorem FND_13_identity_by_poles") &&
    lean.includes("(gx : Grounded F x)") &&
    lean.includes("(gy : Grounded F y)"),
  "Lean FND-13 theorem requires Grounded evidence for both Links",
);
assert(
  rocq.includes("Theorem FND_13_identity_by_poles") &&
    rocq.includes("Grounded F x ->") &&
    rocq.includes("Grounded F y ->"),
  "Rocq FND-13 theorem requires Grounded evidence for both Links",
);
assert(
  !/F2F3Normalization F\s*\(/.test(lean) &&
    !/F2F3Normalization F\s*\(/.test(rocq),
  "global normalization is not fake-indexed by FND-02 or another proof",
);
const leanGlobalNormStart = lean.indexOf("structure F2F3Normalization");
const leanGlobalNormEnd = lean.indexOf("theorem fnd13_form_injective", leanGlobalNormStart);
const rocqGlobalNormStart = rocq.indexOf("Record F2F3Normalization");
const rocqGlobalNormEnd = rocq.indexOf("Theorem fnd13_form_injective", rocqGlobalNormStart);
assert(
  leanGlobalNormStart >= 0 && leanGlobalNormEnd > leanGlobalNormStart &&
    !lean.slice(leanGlobalNormStart, leanGlobalNormEnd).includes("FND_02"),
  "Lean global normalization fields do not smuggle FND-02",
);
assert(
  rocqGlobalNormStart >= 0 && rocqGlobalNormEnd > rocqGlobalNormStart &&
    !rocq.slice(rocqGlobalNormStart, rocqGlobalNormEnd).includes("FND_02"),
  "Rocq global normalization fields do not smuggle FND-02",
);
const leanFnd13Start = lean.indexOf("theorem FND_13_identity_by_poles");
const rocqFnd13Start = rocq.indexOf("Theorem FND_13_identity_by_poles");
assert(leanFnd13Start >= 0 && rocqFnd13Start >= 0, "FND-13 theorem boundary exists");
assert(
  lean.indexOf("theorem fnd13_form_injective") < leanFnd13Start &&
    rocq.indexOf("Theorem fnd13_form_injective") < rocqFnd13Start,
  "constructor injectivity is separated before the grounded FND-13 theorem",
);
assert(
  lean.indexOf("global_identity_by_poles_from_complete_normalization") > leanFnd13Start &&
    rocq.indexOf("global_identity_by_poles_from_complete_normalization") > rocqFnd13Start,
  "strong global extensionality is explicitly downstream/separate from grounded FND-13",
);

const fnd01 = (p0.targets as Record<string, any>[]).find((target) => target.id === "FND-01");
assert(fnd01 !== undefined, "P0 contains FND-01");
assert(
  JSON.stringify(fnd01.dependsOn) === JSON.stringify(["FND-02"]),
  "FND-01 structural classification depends only on unique ROOT",
);
assert(
  (fnd01.assumptions as string[]).some((value) =>
    value.includes("global F2/F3 normalization completeness")
  ),
  "FND-01 exposes stronger global normalization only for its auxiliary identity conjunct",
);
assert(
  (fnd01.assumptions as string[]).some((value) => value.includes("F2/F3 grounded-form existence")),
  "FND-01 P0 keeps F2/F3 realizability explicit",
);
assert(
  /separate the four proposition-level combinations from implementation decidability/i.test(
    fnd01.exclusions as string,
  ),
  "FND-01 P0 requires proposition-level classification to stay separate from implementation decidability",
);
for (const source of [lean, rocq]) {
  assert(source.includes("StartSelf"), "external source defines start-self proposition");
  assert(source.includes("FinishSelf"), "external source defines finish-self proposition");
  assert(source.includes("StartOnly"), "external source defines one-sided start-self proposition");
  assert(source.includes("FinishOnly"), "external source defines one-sided finish-self proposition");
  assert(source.includes("PairLocal"), "external source defines neither-self proposition");
  assert(source.includes("LocalSelfDecision"), "external source requires explicit local identity decisions");
  assert(
    source.includes("LocalSelfIncidenceExhaustive"),
    "external source states four-way proposition exhaustiveness",
  );
  assert(
    source.includes("LocalSelfIncidenceExclusive"),
    "external source states pairwise proposition exclusivity",
  );
  assert(source.includes("FND_01_local_partition"), "external source contains FND-01 C1 theorem");
}
assert(
  lean.includes("theorem FND_01_local_partition"),
  "Lean FND-01 C1 is a theorem, not an axiom",
);
assert(
  rocq.includes("Theorem FND_01_local_partition"),
  "Rocq FND-01 C1 is a theorem, not an axiom",
);
assert(
  lean.includes("FND_02_unique_root F a1 h") &&
    lean.includes("global_identity_by_poles_from_complete_normalization F N"),
  "Lean FND-01 C1 consumes FND-02 plus the explicitly stronger global identity auxiliary",
);
assert(
  rocq.includes("FND_02_unique_root F A1 x H") &&
    rocq.includes("global_identity_by_poles_from_complete_normalization F N x y"),
  "Rocq FND-01 C1 consumes FND-02 plus the explicitly stronger global identity auxiliary",
);
assert(
  !lean.includes("inductive SelfIncidence") && !rocq.includes("Inductive SelfIncidence"),
  "FND-01 C1 uses propositions rather than a four-case authority datatype",
);
assert(
  !lean.includes("open Classical") &&
    !lean.includes("Classical.em") &&
    !lean.includes("[DecidableEq"),
  "Lean FND-01 C1 does not smuggle global equality decidability",
);
assert(
  !rocq.includes("classic."),
  "Rocq FND-01 C1 does not smuggle classical excluded middle",
);

for (const source of [lean, rocq]) {
  assert(
    source.includes("F2F3OneSidedExistence"),
    "external source names the minimal F2/F3 one-sided existence premise",
  );
  assert(
    source.includes("startRootEquation") || source.includes("f2f3_start_root_equation"),
    "external source carries proper start-self recursive equation",
  );
  assert(
    source.includes("finishRootEquation") || source.includes("f2f3_finish_root_equation"),
    "external source carries proper finish-self recursive equation",
  );
  assert(
    source.includes("startRootNeRoot") || source.includes("f2f3_start_root_ne_root"),
    "external source keeps start-self witness distinct from ROOT",
  );
  assert(
    source.includes("finishRootNeRoot") || source.includes("f2f3_finish_root_ne_root"),
    "external source keeps finish-self witness distinct from ROOT",
  );
  assert(
    source.includes("f2f3_pair_pattern"),
    "PAIR proposition pattern is derived from the one Link-forming primitive",
  );
  assert(
    source.includes("f2f3_pair_grounded"),
    "derived PAIR representative is finitely grounded",
  );
  assert(
    source.includes("FND_01_grounded_realizability"),
    "external source contains FND-01 C2 realizability theorem",
  );
}
assert(
  lean.includes("theorem FND_01_grounded_realizability"),
  "Lean FND-01 C2 is a theorem, not an axiom",
);
assert(
  rocq.includes("Theorem FND_01_grounded_realizability"),
  "Rocq FND-01 C2 is a theorem, not an axiom",
);
assert(
  lean.includes("F.form E.startRoot E.finishRoot") &&
    rocq.includes("form F (f2f3_start_root F E) (f2f3_finish_root F E)"),
  "PAIR witness is constructed through the single Link-forming primitive",
);
assert(
  !lean.includes("  pairRoot :") && !rocq.includes("f2f3_pair_root :"),
  "F2/F3 C2 premise does not postulate a fourth ready-made PAIR witness",
);

assert(
  (fnd01.assumptions as string[]).some((value) =>
    value.includes("Context orientation only names one-sided cases")
  ),
  "FND-01 P0 keeps Context orientation at the naming-only boundary",
);
for (const source of [lean, rocq]) {
  assert(
    source.includes("FND_01_four_structural_cases"),
    "external source contains the FND-01 structural capstone theorem",
  );
  assert(
    source.includes("ContextOneSidedNames"),
    "external source names the Context one-sided alias relation",
  );
  assert(
    source.includes("FND_01_context_names_only"),
    "external source proves Context naming does not create structural cases",
  );
}
assert(
  lean.includes("theorem FND_01_four_structural_cases"),
  "Lean FND-01 capstone is a theorem, not an axiom",
);
assert(
  rocq.includes("Theorem FND_01_four_structural_cases"),
  "Rocq FND-01 capstone is a theorem, not an axiom",
);
assert(
  lean.includes("have c1 := FND_01_local_partition") &&
    lean.includes("have c2 := FND_01_grounded_realizability"),
  "Lean capstone explicitly composes C1 and C2",
);
assert(
  rocq.includes("FND_01_local_partition F A1 N x D") &&
    rocq.includes("FND_01_grounded_realizability F E"),
  "Rocq capstone explicitly composes C1 and C2",
);
assert(
  lean.includes("START_K = E.startRoot ∧ END_K = E.finishRoot"),
  "Lean Context naming relation is alias-only",
);
assert(
  rocq.includes("START_K = f2f3_start_root F E /\\") &&
    rocq.includes("END_K = f2f3_finish_root F E"),
  "Rocq Context naming relation is alias-only",
);
const leanNamesStart = lean.indexOf("def ContextOneSidedNames");
const leanNamesEnd = lean.indexOf("theorem FND_01_context_names_only", leanNamesStart);
const rocqNamesStart = rocq.indexOf("Definition ContextOneSidedNames");
const rocqNamesEnd = rocq.indexOf("Theorem FND_01_context_names_only", rocqNamesStart);
assert(
  leanNamesStart >= 0 && leanNamesEnd > leanNamesStart &&
    !lean.slice(leanNamesStart, leanNamesEnd).includes("F.form"),
  "Lean Context naming predicate does not construct a Link",
);
assert(
  rocqNamesStart >= 0 && rocqNamesEnd > rocqNamesStart &&
    !rocq.slice(rocqNamesStart, rocqNamesEnd).includes("form F"),
  "Rocq Context naming predicate does not construct a Link",
);

const inv01 = (p0.targets as Record<string, any>[]).find((target) => target.id === "INV-01");
assert(inv01 !== undefined, "P0 contains INV-01");
assert(
  JSON.stringify(inv01.dependsOn) === JSON.stringify(["FND-01", "FND-02"]),
  "INV-01 depends exactly on FND-01 and FND-02",
);
assert(
  /Host field order, graph labels, or codec digits are not the semantic definition of J/.test(
    inv01.exclusions as string,
  ),
  "INV-01 excludes representation order and codec authority",
);
for (const source of [lean, rocq]) {
  assert(
    source.includes("RecursiveInversionDomain"),
    "external source defines the declared finite recursive inversion domain",
  );
  assert(
    source.includes("RecursiveInversion"),
    "external source defines the Prop-valued structural inversion graph",
  );
  assert(
    source.includes("recursive_start") || source.includes("recursive_inversion_start"),
    "external source carries START to mirrored one-sided inversion rule",
  );
  assert(
    source.includes("recursive_end") || source.includes("recursive_inversion_finish"),
    "external source carries END to mirrored one-sided inversion rule",
  );
  assert(
    source.includes("recursive_inversion_pair") || source.includes("| pair"),
    "external source carries PAIR child-reversal inversion rule",
  );
  assert(
    source.includes("INV_01_recursive_inversion_total"),
    "external source proves total structural inversion on grounded domain",
  );
  assert(
    source.includes("recursive_inversion_image_grounded"),
    "external source proves inversion image remains grounded",
  );
}
assert(
  lean.includes("inductive RecursiveInversion") &&
    lean.includes("F.Link → F.Link → Prop"),
  "Lean inversion is a Prop-valued proof graph, not an ontology datatype",
);
assert(
  rocq.includes("Inductive RecursiveInversion") &&
    rocq.includes("Link F -> Link F -> Prop"),
  "Rocq inversion is a Prop-valued proof graph, not an ontology datatype",
);
assert(
  lean.includes("F.form inverseFinish inverseStart") &&
    rocq.includes("form F inverseFinish inverseStart"),
  "recursive PAIR inversion reverses the two recursively inverted poles",
);
assert(
  lean.includes("FND_01_local_partition F a1 N decision") &&
    lean.includes("FND_02_unique_root F a1 hFull"),
  "Lean INV-01 totality consumes FND-01 partition and FND-02 unique ROOT",
);
assert(
  rocq.includes("FND_01_local_partition F A1 N x Decision") &&
    rocq.includes("FND_02_unique_root F A1 x HFull"),
  "Rocq INV-01 totality consumes FND-01 partition and FND-02 unique ROOT",
);
for (const source of [lean, rocq]) {
  assert(
    source.includes("INV_01_recursive_pole_reversal"),
    "external source proves relational J(A->B)=J(B)->J(A)",
  );
  assert(
    source.includes("recursive_inversion_functional"),
    "external source proves structural inversion graph functionality",
  );
  assert(
    source.includes("INV_01_recursive_inversion_unique_total"),
    "external source closes INV-01 with unique total graph",
  );
}
assert(
  lean.includes("def UniqueRecursiveInverse") &&
    lean.includes("UniqueRecursiveInverse F D x"),
  "Lean INV-01 capstone states unique existence in core Prop only",
);
assert(
  rocq.includes("forall z : Link F,") &&
    rocq.includes("RecursiveInversion F E D x z ->") &&
    rocq.includes("z = y"),
  "Rocq INV-01 capstone states constructive unique existence",
);
assert(
  lean.includes("y = F.form inverseFinish inverseStart") &&
    rocq.includes("y = form F inverseFinish inverseStart"),
  "both external proofs state recursive pole reversal equation",
);
const leanInvStart = lean.indexOf("structure RecursiveInversionDomain");
const leanInvEnd = lean.indexOf("theorem INV_01_recursive_inversion_total", leanInvStart);
const rocqInvStart = rocq.indexOf("Record RecursiveInversionDomain");
const rocqInvEnd = rocq.indexOf("Theorem INV_01_recursive_inversion_total", rocqInvStart);
for (const [label, source, start, end] of [
  ["Lean", lean, leanInvStart, leanInvEnd],
  ["Rocq", rocq, rocqInvStart, rocqInvEnd],
] as const) {
  assert(start >= 0 && end > start, `${label} INV-01 proof region exists`);
  const region = source.slice(start, end);
  for (const forbidden of ["ExactSequence", "canonicalWire", "LinkHandle", "codec", "opcode"]) {
    assert(!region.includes(forbidden), `${label} INV-01 structural region excludes ${forbidden}`);
  }
}

const inv02 = (p0.targets as Record<string, any>[]).find((target) => target.id === "INV-02");
assert(inv02 !== undefined, "P0 contains INV-02");
assert(
  JSON.stringify(inv02.assumptions) === JSON.stringify(["INV-01"]),
  "INV-02 assumes only INV-01",
);
assert(
  JSON.stringify(inv02.dependsOn) === JSON.stringify(["INV-01"]),
  "INV-02 depends exactly on INV-01",
);
assert(
  /Exact domain on which INV-01 is defined/.test(inv02.scope as string),
  "INV-02 scope is exactly the INV-01 domain",
);
assert(
  /No claim outside the declared recursive\/inversion domain/.test(inv02.exclusions as string),
  "INV-02 explicitly excludes domain expansion",
);
for (const source of [lean, rocq]) {
  assert(
    source.includes("recursive_start_form_canonical"),
    "external source derives canonical semantic START form before INV-02",
  );
  assert(
    source.includes("recursive_end_form_canonical"),
    "external source derives canonical semantic END form before INV-02",
  );
  assert(
    source.includes("poles_recompose_from_global_normalization"),
    "external source uses explicit global-normalization pole reconstruction rather than an axiom",
  );
  assert(
    source.includes("recursive_inversion_source_grounded"),
    "external source proves INV-01 graph sources stay in the exact Grounded domain",
  );
  assert(
    source.includes("INV_02_recursive_inversion_involutive"),
    "external source proves relational INV-02 involution",
  );
  assert(
    source.includes("INV_02_unique_total_involution"),
    "external source proves function-level double inversion witness from INV-01 totality",
  );
}
assert(
  lean.includes("theorem INV_02_recursive_inversion_involutive"),
  "Lean INV-02 is a theorem, not an axiom",
);
assert(
  rocq.includes("Theorem INV_02_recursive_inversion_involutive"),
  "Rocq INV-02 is a theorem, not an axiom",
);
assert(
  lean.includes("INV_01_recursive_inversion_total F a1 N E D gx") &&
    lean.includes("recursive_inversion_image_grounded F D hxy"),
  "Lean INV-02 capstone reuses INV-01 totality and its exact image domain",
);
assert(
  rocq.includes("INV_01_recursive_inversion_total F A1 N E D x GX") &&
    rocq.includes("recursive_inversion_image_grounded F E D x y Hxy"),
  "Rocq INV-02 capstone reuses INV-01 totality and its exact image domain",
);
assert(
  lean.includes("INV_01_recursive_pole_reversal F D hyz") &&
    lean.includes("poles_recompose_from_global_normalization F a1 N x"),
  "Lean PAIR involution reverses poles twice and reconstructs the original Link",
);
assert(
  rocq.includes("INV_01_recursive_pole_reversal") &&
    rocq.includes("poles_recompose_from_global_normalization F A1 N x"),
  "Rocq PAIR involution reverses poles twice and reconstructs the original Link through explicit global normalization",
);
for (const [label, source] of [["Lean", lean], ["Rocq", rocq]] as const) {
  const inv02Start = source.indexOf(
    label === "Lean"
      ? "theorem recursive_inversion_source_grounded"
      : "Lemma recursive_inversion_source_grounded",
  );
  const inv02End = source.indexOf(
    label === "Lean"
      ? "theorem INV_03_root_fixed"
      : "Theorem INV_03_root_fixed",
    inv02Start,
  );
  assert(inv02Start >= 0 && inv02End > inv02Start, `${label} INV-02 proof region exists`);
  const region = source.slice(inv02Start, inv02End);
  for (const forbidden of [
    "ExactSequence",
    "canonicalWire",
    "LinkHandle",
    "codec",
    "opcode",
    "RecursiveInversionV2",
    "RecursiveInversionDomainV2",
  ]) {
    assert(!region.includes(forbidden), `${label} INV-02 region excludes ${forbidden}`);
  }
}
assert(
  !lean.includes("axiom INV_02") && !rocq.includes("Axiom INV_02"),
  "INV-02 is not postulated as an axiom",
);

const invSupportIds = ["INV-03", "INV-04", "INV-05"] as const;
for (const id of invSupportIds) {
  const target = (p0.targets as Record<string, any>[]).find((candidate) => candidate.id === id);
  assert(target !== undefined, `P0 contains ${id}`);
  assert(
    JSON.stringify(target.assumptions) === JSON.stringify(["INV-01"]),
    `${id} assumptions remain exactly INV-01`,
  );
  assert(
    JSON.stringify(target.dependsOn) === JSON.stringify(["INV-01"]),
    `${id} dependency remains exactly INV-01`,
  );
}
for (const source of [lean, rocq]) {
  assert(source.includes("INV_03_root_fixed"), "external source proves INV-03 ROOT fixed");
  assert(source.includes("INV_04_start_to_finish"), "external source proves INV-04 START to END");
  assert(source.includes("INV_04_finish_to_start"), "external source proves INV-04 END to START");
  assert(
    source.includes("INV_05_pair_preserved_and_reversed"),
    "external source proves INV-05 PAIR preservation and pole reversal",
  );
  assert(
    source.includes("INV_01_recursive_pole_reversal"),
    "INV-05 reuses INV-01 recursive pole reversal",
  );
  assert(
    source.includes("INV_02_recursive_inversion_involutive"),
    "INV-05 non-collapse reuses derived INV-02 rather than a new domain axiom",
  );
}
assert(
  lean.includes("theorem INV_03_root_fixed") &&
    lean.includes("theorem INV_04_start_to_finish") &&
    lean.includes("theorem INV_04_finish_to_start") &&
    lean.includes("theorem INV_05_pair_preserved_and_reversed"),
  "Lean INV-03/04/05 are theorems",
);
assert(
  rocq.includes("Theorem INV_03_root_fixed") &&
    rocq.includes("Theorem INV_04_start_to_finish") &&
    rocq.includes("Theorem INV_04_finish_to_start") &&
    rocq.includes("Theorem INV_05_pair_preserved_and_reversed"),
  "Rocq INV-03/04/05 are theorems",
);
assert(
  !lean.includes("pairPreserved :") &&
    !rocq.includes("recursive_pair_preserved :"),
  "INV-05 does not add a pair-preservation field to the inversion domain",
);

const inv06 = (p0.targets as Record<string, any>[]).find((target) => target.id === "INV-06");
assert(inv06 !== undefined, "P0 contains INV-06");
assert(
  JSON.stringify(inv06.assumptions) === JSON.stringify(["INV-03", "INV-04", "INV-05"]),
  "INV-06 assumptions remain exactly the supporting inversion theorems",
);
assert(
  JSON.stringify(inv06.dependsOn) === JSON.stringify(["INV-03", "INV-04", "INV-05"]),
  "INV-06 dependencies remain exactly INV-03/04/05",
);
for (const [label, source] of [["Lean", lean], ["Rocq", rocq]] as const) {
  assert(
    source.includes("f2f3_reverse_pair_pattern"),
    `${label} derives mirror C->O as an ordinary PAIR`,
  );
  assert(source.includes("INV_06_root_basis"), `${label} contains INV-06 capstone`);
  const start = source.indexOf(
    label === "Lean" ? "theorem INV_06_root_basis" : "Theorem INV_06_root_basis",
  );
  assert(start >= 0, `${label} INV-06 region exists`);
  const region = source.slice(start);
  for (const support of [
    "INV_03_root_fixed",
    "INV_04_start_to_finish",
    "INV_04_finish_to_start",
    "INV_05_pair_preserved_and_reversed",
  ]) {
    assert(region.includes(support), `${label} INV-06 cross-checks ${support}`);
  }
  assert(
    region.includes("startRoot") || region.includes("f2f3_start_root"),
    `${label} O is the selected START-side F2/F3 representative`,
  );
  assert(
    region.includes("finishRoot") || region.includes("f2f3_finish_root"),
    `${label} C is the selected END-side F2/F3 representative`,
  );
}
assert(
  !lean.includes("structure RootBasis") && !rocq.includes("Record RootBasis"),
  "INV-06 introduces no RootBasis ontology datatype",
);
assert(
  !lean.includes("axiom INV_06") && !rocq.includes("Axiom INV_06"),
  "INV-06 is proved rather than postulated",
);


const inv07 = (p0.targets as Record<string, any>[]).find((target) => target.id === "INV-07");
assert(inv07 !== undefined, "P0 contains INV-07");
assert(
  JSON.stringify(inv07.assumptions) === JSON.stringify(["INV-02", "INV-04", "INV-05"]),
  "INV-07 assumptions remain exactly INV-02/04/05",
);
assert(
  JSON.stringify(inv07.dependsOn) === JSON.stringify(["INV-02", "INV-04", "INV-05"]),
  "INV-07 dependencies remain exactly INV-02/04/05",
);
for (const [label, source] of [["Lean", lean], ["Rocq", rocq]] as const) {
  const theoremName =
    label === "Lean"
      ? "theorem INV_07_objective_chirality"
      : "Theorem INV_07_objective_chirality";
  const start = source.indexOf(theoremName);
  assert(start >= 0, `${label} contains INV-07 objective chirality capstone`);
  const region = source.slice(start);
  for (const support of [
    "INV_02_recursive_inversion_involutive",
    "INV_04_start_to_finish",
    "INV_04_finish_to_start",
    "INV_05_pair_preserved_and_reversed",
  ]) {
    assert(region.includes(support), `${label} INV-07 derives through ${support}`);
  }
  assert(region.includes("StartOnly"), `${label} INV-07 keeps START structural`);
  assert(region.includes("FinishOnly"), `${label} INV-07 keeps END structural`);
  assert(region.includes("PairLocal"), `${label} INV-07 keeps PAIR structural`);
}
assert(
  !lean.includes("axiom INV_07") && !rocq.includes("Axiom INV_07"),
  "INV-07 is proved rather than postulated",
);
assert(
  !lean.includes("structure Chirality") && !rocq.includes("Record Chirality"),
  "INV-07 introduces no chirality ontology datatype",
);

const ctx03 = (p0.targets as Record<string, any>[]).find((target) => target.id === "CTX-03");
assert(ctx03 !== undefined, "P0 contains CTX-03");
assert(
  JSON.stringify(ctx03.assumptions) === JSON.stringify([
    "INV-02",
    "INV-07",
    "accepted Link-native Context orientation markers",
  ]),
  "CTX-03 assumptions remain exactly INV-02/INV-07/Link-native markers",
);
assert(
  JSON.stringify(ctx03.dependsOn) === JSON.stringify(["INV-02", "INV-07"]),
  "CTX-03 dependencies remain exactly INV-02/INV-07",
);

for (const [label, source] of [["Lean", lean], ["Rocq", rocq]] as const) {
  const startName =
    label === "Lean"
      ? "def ProperOneSided"
      : "Definition ProperOneSided";
  const start = source.indexOf(startName);
  const end = source.indexOf(
    label === "Lean" ? "def ContextOrientationMarker" : "Definition ContextOrientationMarker",
    start,
  );
  assert(start >= 0 && end > start, `${label} contains CTX-03 relational support vocabulary`);
  const region = source.slice(start, end);
  for (const symbol of [
    "SameChiralClass",
    "OppositeChiralClass",
    "RelativeZ2Law",
    "InversionIsMirrorTransport",
    "CTX_03_relational_z2_support",
  ]) {
    assert(region.includes(symbol), `${label} CTX-03 support contains ${symbol}`);
  }
  assert(
    region.includes("INV_07_objective_chirality"),
    `${label} mirror transport derives through INV-07`,
  );
  for (const forbidden of [
    "inductive Gauge",
    "structure Gauge",
    "def Gauge",
    "Inductive Gauge",
    "Record Gauge",
    "Definition Gauge",
    "inductive Frame",
    "structure Frame",
    "def Frame",
    "Inductive Frame",
    "Record Frame",
    "Definition Frame",
    "DIRECT",
    "MIRROR",
    "ExactSequence",
  ]) {
    assert(!region.includes(forbidden), `${label} CTX-03 support forbids host orientation carrier: ${forbidden}`);
  }
}
assert(
  !lean.includes("axiom CTX_03_relational_z2_support") &&
    !rocq.includes("Axiom CTX_03_relational_z2_support"),
  "CTX-03 relational support is proved rather than postulated",
);

for (const [label, source, marker] of [
  ["Lean", lean, "def ContextOrientationMarker"],
  ["Rocq", rocq, "Definition ContextOrientationMarker"],
] as const) {
  const start = source.indexOf(marker);
  const end = source.indexOf("FND-07 external projection of accepted contextual-truth semantics", start);
  assert(start >= 0 && end > start, `${label} contains Link-native Context orientation markers`);
  const region = source.slice(start, end);
  for (const symbol of [
    "ContextLocalStartRole",
    "ContextLocalEndRole",
    "CTX_03_context_selection_induces_local_roles",
    "CTX_03_objective_chiral_orbit_before_context",
    "CTX_03_simultaneous_inversion_covariance",
    "CTX_03_context_relative_gauge",
  ]) {
    assert(region.includes(symbol), `${label} CTX-03 capstone contains ${symbol}`);
  }
  assert(
    region.includes("CTX_03_relational_z2_support"),
    `${label} CTX-03 capstone consumes the canonical relational Z2 support layer`,
  );
  assert(
    region.includes("INV_02_recursive_inversion_involutive") ||
      region.includes("ctx03_inversion_is_mirror_transport"),
    `${label} CTX-03 capstone keeps inversion provenance explicit`,
  );
  for (const forbidden of [
    "structure ContextFrame",
    "inductive ContextFrame",
    "Record ContextFrame",
    "ContextFrame : Type",
    "DIRECT",
    "MIRROR",
    "ExactSequence",
    "FORMAL",
  ]) {
    assert(
      !region.includes(forbidden),
      `${label} CTX-03 Context layer forbids host orientation authority: ${forbidden}`,
    );
  }
}
assert(
  !lean.includes("axiom CTX_03_context_relative_gauge") &&
    !rocq.includes("Axiom CTX_03_context_relative_gauge"),
  "CTX-03 capstone is proved rather than postulated",
);

for (const [label, source] of [["Lean", lean], ["Rocq", rocq]] as const) {
  const chiStart = source.indexOf(
    label === "Lean"
      ? "def ContextInRWitness"
      : "Definition ContextInRWitness",
  );
  const chiEnd = source.indexOf(
    label === "Lean"
      ? "CTX-03 capstone: objective chirality"
      : "CTX-03 capstone: objective chirality",
    chiStart,
  );
  assert(chiStart >= 0 && chiEnd > chiStart, `${label} contains CTX-03 chi bridge region`);
  const chiRegion = source.slice(chiStart, chiEnd);

  for (const symbol of [
    "ContextInRWitness",
    "ContextOutRWitness",
    "ContextChiWitness",
    "ctx03_direction_witnesses_distinct",
    "CTX_03_direction_witness_inversion",
    "CTX_03_context_marker_selects_unique_chi",
    "CTX_03_chi_direction_bridge",
  ]) {
    assert(chiRegion.includes(symbol), `${label} CTX-03 chi bridge contains ${symbol}`);
  }

  assert(
    chiRegion.includes("SameChiralClass") &&
      chiRegion.includes("ContextInRWitness") &&
      chiRegion.includes("ContextOutRWitness"),
    `${label} chi selection is relationally tied to chiral class and accepted witnesses`,
  );
  assert(
    chiRegion.includes("RecursiveInversion"),
    `${label} chi bridge proves structural J transport rather than host remapping`,
  );

  for (const forbidden of [
    "Bool",
    "DIRECT",
    "MIRROR",
    "structure ContextFrame",
    "inductive ContextFrame",
    "Record ContextFrame",
    "Definition ContextFrame",
    "inductive Gauge",
    "structure Gauge",
    "Record Gauge",
    "Definition Gauge",
    "ExactSequence",
  ]) {
    assert(
      !chiRegion.includes(forbidden),
      `${label} chi bridge excludes host orientation authority: ${forbidden}`,
    );
  }
}
assert(
  !lean.includes("axiom CTX_03_chi_direction_bridge") &&
    !rocq.includes("Axiom CTX_03_chi_direction_bridge"),
  "CTX-03 chi bridge is proved rather than postulated",
);

for (const [label, source] of [["Lean", lean], ["Rocq", rocq]] as const) {
  const semanticStart = source.indexOf(
    label === "Lean"
      ? "def ContextSemanticArrow"
      : "Definition ContextSemanticArrow",
  );
  const semanticEnd = source.indexOf(
    label === "Lean"
      ? "FND-07 external projection of accepted contextual-truth semantics"
      : "FND-07 external projection of accepted contextual-truth semantics",
    semanticStart,
  );
  assert(
    semanticStart >= 0 && semanticEnd > semanticStart,
    `${label} contains CTX-03 semantic covariance region`,
  );
  const semanticRegion = source.slice(semanticStart, semanticEnd);

  for (const symbol of [
    "ContextSemanticArrow",
    "CTX_03_semantic_arrow_covariant",
    "ContextGeneralizedMPStep",
    "ContextGeneralizedMPCovarianceLaw",
    "CTX_03_generalized_mp_semantic_covariance",
    "TechnicalStartOperation",
    "InversionCovariantUnaryOperation",
    "CTX_03_technical_start_not_covariant",
    "CTX_03_semantic_covariance_capstone",
  ]) {
    assert(
      semanticRegion.includes(symbol),
      `${label} CTX-03 semantic covariance contains ${symbol}`,
    );
  }

  assert(
    semanticRegion.includes("INV_01_recursive_pole_reversal") &&
      semanticRegion.includes("recursive_inversion_functional") &&
      semanticRegion.includes("INV_07_objective_chirality"),
    `${label} semantic covariance is derived from structural J evidence`,
  );
  assert(
    semanticRegion.includes("K") &&
      semanticRegion.includes("A") &&
      semanticRegion.includes("B") &&
      semanticRegion.includes("truth") &&
      semanticRegion.includes("rule") &&
      semanticRegion.includes("result"),
    `${label} generalized-MP semantic relation carries K/A/B truth/rule/result`,
  );

  for (const forbidden of [
    "DIRECT",
    "MIRROR",
    "ExactSequence",
    "ContextFrame",
    "SemanticOrientationView",
    "inductive Gauge",
    "structure Gauge",
    "Record Gauge",
    "Definition Gauge",
  ]) {
    assert(
      !semanticRegion.includes(forbidden),
      `${label} semantic covariance excludes host orientation authority: ${forbidden}`,
    );
  }
}
assert(
  !lean.includes("axiom CTX_03_semantic_covariance_capstone") &&
    !rocq.includes("Axiom CTX_03_semantic_covariance_capstone"),
  "CTX-03 semantic covariance capstone is proved rather than postulated",
);

const fnd07 = (p0.targets as Record<string, any>[]).find((target) => target.id === "FND-07");
assert(fnd07 !== undefined, "P0 contains FND-07");
same(
  JSON.stringify(fnd07.assumptions),
  JSON.stringify(["accepted contextual truth semantics"]),
  "FND-07 assumptions remain exactly the accepted contextual-truth semantics",
);
same(
  JSON.stringify(fnd07.dependsOn),
  JSON.stringify([]),
  "FND-07 adds no theorem dependency",
);

for (const [label, source, marker] of [
  ["Lean", lean, "FND-07 external projection of accepted contextual-truth semantics"],
  ["Rocq", rocq, "FND-07 external projection of accepted contextual-truth semantics"],
] as const) {
  const start = source.indexOf(marker);
  const end = source.indexOf("FND-05 external proof projection", start);
  assert(start >= 0 && end > start, label + " contains FND-07 contextual-truth projection");
  const region = source.slice(start, end);
  for (const symbol of [
    "ContextualTruthWitness",
    "ContextualTruth",
    "TruthValueL",
    "FND_07_contextual_truth_boundary",
    "CurrentScopeMember",
  ]) {
    assert(region.includes(symbol), label + " FND-07 contains " + symbol);
  }
  assert(
    region.includes("EXTERNAL THEORY PROJECTION NOTE") &&
      region.includes("no additional external mathematical theory"),
    label + " FND-07 declares that no new external mathematical theory is used",
  );
  assert(
    region.includes("axiomatic-set-theory") &&
      region.includes("not"),
    label + " FND-07 rejects set-theory membership as semantic authority",
  );
  assert(
    region.includes("ambient Link") &&
      region.includes("not contextual truth"),
    label + " FND-07 separates ambient structural existence from contextual truth",
  );
  assert(
    region.includes("truth value") &&
      region.includes("truth witness"),
    label + " FND-07 separates L value role from K-to-A witness role",
  );
}
const leanFnd07 = lean.slice(lean.indexOf("def ContextualTruthWitness"));
const rocqFnd07 = rocq.slice(rocq.indexOf("Definition ContextualTruthWitness"));
for (const forbidden of [
  "Set F.Link",
  "Finset F.Link",
  "Finset (",
  "HashMap",
  "Std.Data.HashMap",
  ": Bool",
  "→ Bool",
]) {
  assert(!leanFnd07.includes(forbidden), "Lean FND-07 forbids host truth carrier " + forbidden);
}
for (const forbidden of [
  "Ensemble",
  "MSet",
  "FSet",
  ": bool",
  "-> bool",
]) {
  assert(!rocqFnd07.includes(forbidden), "Rocq FND-07 forbids host truth carrier " + forbidden);
}
assert(
  !lean.includes("axiom FND_07") && !rocq.includes("Axiom FND_07"),
  "FND-07 is proved rather than postulated",
);

const fnd05 = (p0.targets as Record<string, any>[]).find((target) => target.id === "FND-05");
assert(fnd05 !== undefined, "P0 contains FND-05");
same(
  JSON.stringify(fnd05.assumptions),
  JSON.stringify(["FND-01", "FND-02", "declared finite recursive carrier domain"]),
  "FND-05 assumptions remain exactly FND-01/FND-02/declared finite carrier",
);
same(
  JSON.stringify(fnd05.dependsOn),
  JSON.stringify(["FND-01", "FND-02"]),
  "FND-05 dependencies remain exactly FND-01/FND-02",
);
assert(
  /finite ROOT-decomposable carrier domain/i.test(String(fnd05.statement)),
  "FND-05 statement remains restricted to the finite ROOT-decomposable domain",
);
assert(
  /non-well-founded.*cycles/i.test(String(fnd05.exclusions)) &&
    /Anum\/Q identity/i.test(String(fnd05.exclusions)),
  "FND-05 keeps cycle and sequential identity exclusions explicit",
);

for (const [label, source, marker] of [
  ["Lean", lean, "FND-05 external proof projection"],
  ["Rocq", rocq, "FND-05 external proof projection"],
] as const) {
  const start = source.indexOf(marker);
  const end = source.indexOf("FND-11 external proof vocabulary", start);
  assert(start >= 0 && end > start, label + " contains FND-05 external projection");
  const region = source.slice(start, end);
  for (const symbol of [
    "RecursiveDescriptionCode",
    "FiniteRecursiveCarrierDecision",
    "CanonicalRecursiveDescription",
    "FND_05_recursive_description_total",
    "recursive_description_functional",
    "FND_05_canonical_recursive_description_unique",
  ]) {
    assert(region.includes(symbol), label + " FND-05 contains " + symbol);
  }
  assert(
    region.includes("EXTERNAL THEORY PROJECTION NOTE") &&
      region.includes("host inductive proof syntax"),
    label + " FND-05 marks the recursive code as prover-side syntax",
  );
  assert(
    /not[\s\S]{0,80}MTS ontology[\s\S]{0,40}datatype/i.test(region) &&
      /not[\s\S]{0,80}Anum\/Q[\s\S]{0,40}carrier/i.test(region),
    label + " FND-05 forbids host recursive code from becoming MTS ontology",
  );
  assert(
    region.includes("no additional external mathematical theory") ||
      region.includes("No additional external mathematical theory"),
    label + " FND-05 introduces no undeclared external mathematical theory",
  );
  assert(
    region.includes("Grounded"),
    label + " FND-05 remains on the finite Grounded carrier",
  );
  assert(
    region.includes("FND_02_unique_root"),
    label + " FND-05 consumes established unique ROOT",
  );
  assert(
    !region.includes("ExactSequence"),
    label + " FND-05 does not import ExactSequence identity",
  );
  assert(
    !region.includes("canonicalWire"),
    label + " FND-05 does not use implementation wire spelling as semantic authority",
  );
}
assert(
  !lean.includes("axiom FND_05") && !rocq.includes("Axiom FND_05"),
  "FND-05 is proved rather than postulated",
);
assert(
  !lean.includes("structure RecursiveDescriptionCode") &&
    !rocq.includes("Record RecursiveDescriptionCode"),
  "FND-05 proof code is not disguised as a record carrying semantic authority",
);

const fnd11 = (p0.targets as Record<string, any>[]).find((target) => target.id === "FND-11");
assert(fnd11 !== undefined, "P0 contains FND-11");
same(
  JSON.stringify(fnd11.assumptions),
  JSON.stringify(["accepted v0.14 representation-layer definitions"]),
  "FND-11 assumptions remain exactly the accepted representation-layer definitions",
);
same(
  JSON.stringify(fnd11.dependsOn),
  JSON.stringify(["FND-05"]),
  "FND-11 dependency remains exactly FND-05",
);
assert(
  /representation\/codec boundary/i.test(String(fnd11.scope)),
  "FND-11 scope remains the accepted representation/codec boundary",
);
assert(
  /No claim.*globally isomorphic/i.test(String(fnd11.exclusions)) &&
    /shorter source.*stronger representation contract/i.test(String(fnd11.exclusions)),
  "FND-11 keeps global-isomorphism and representation-ranking exclusions",
);

for (const [label, source, marker] of [
  ["Lean", lean, "FND-11 external proof vocabulary"],
  ["Rocq", rocq, "FND-11 external proof vocabulary"],
] as const) {
  const start = source.indexOf(marker);
  assert(start >= 0, label + " contains FND-11 representation boundary");
  const region = source.slice(start);

  for (const symbol of [
    "RepresentationIdentityTarget",
    "AcceptedV014RepresentationDefinitions",
    "FND05Canonicality",
    "fnd05_dependency_witness",
    "ExactSequenceFoldCollision",
    "QDenotationCollision",
    "FND_11_representation_identities_separated",
  ]) {
    assert(region.includes(symbol), label + " FND-11 contains " + symbol);
  }

  assert(
    region.includes("EXTERNAL THEORY PROJECTION NOTE") &&
      /not an MTS ontology datatype/i.test(region) &&
      /No additional external mathematical theory/i.test(region),
    label + " FND-11 marks host representation classification as external only",
  );

  assert(
    region.includes("FND_05_canonical_recursive_description_unique"),
    label + " FND-11 dependency adapter consumes the proved FND-05 capstone",
  );

  assert(
    region.includes("recursive_codec_target_ne_anum") &&
      region.includes("exact_sequence_target_ne_fold"),
    label + " FND-11 proves distinct identity-target classifications",
  );

  assert(
    region.includes("exact_sequence_fold_collision") &&
      region.includes("q_denotation_collision"),
    label + " FND-11 has concrete non-injective denotation witnesses",
  );

  assert(
    /anumOriginRoot|anum_origin_root/.test(region) &&
      /exactSequenceOriginRoot|exact_sequence_origin_root/.test(region) &&
      /qOriginRoot|q_origin_root/.test(region),
    label + " FND-11 makes every projected local sequence origin R",
  );

  assert(
    /Anum and ExactSequence are modeled as predicates over the one Link carrier/i.test(region),
    label + " FND-11 keeps Anum/ExactSequence as Link-carrier views rather than ontology sorts",
  );

  for (const forbidden of [
    "structure Anum",
    "inductive Anum",
    "Record Anum",
    "Inductive Anum",
    "structure ExactSequence",
    "inductive ExactSequence",
    "Record ExactSequence",
    "Inductive ExactSequence",
    "Equiv",
    "CategoryTheory",
    "NaturalTransformation",
  ]) {
    assert(
      !region.includes(forbidden),
      label + " FND-11 forbids undeclared representation/ontology machinery: " + forbidden,
    );
  }
}

assert(
  !lean.includes("axiom FND_11") && !rocq.includes("Axiom FND_11"),
  "FND-11 is proved rather than postulated",
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
  ci.includes("#print axioms"),
  "CI extracts actual Lean theorem axiom dependencies",
);
assert(
  ci.includes("Print Assumptions"),
  "CI extracts actual Rocq theorem assumptions",
);
assert(
  ci.includes("KERNEL_ASSUMPTIONS_LEAN=CHECKED"),
  "CI reports successful Lean assumption assurance only after checking",
);
assert(
  ci.includes("KERNEL_ASSUMPTIONS_ROCQ=CHECKED"),
  "CI reports successful Rocq assumption assurance only after checking",
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
  "EXTERNAL_PROJECTION_BOUNDARY=GUARDED",
  "FOUR_CASE_DATATYPE=ABSENT",
  "FOUR_CASE_AXIOM=ABSENT",
  "ROOT_UNIQUENESS_AXIOM=ABSENT",
  "POLE_EXTENSIONALITY_PRE_FND02=ABSENT",
  "FND02_BASIS=A1_F2_F3",
  "SORRY_ADMIT_STATUS=CHECKED_BY_EXTERNAL_PROOF_ASSURANCE",
  "THEOREM_PROOF_CLAIMS=19",
  "FND02_LEAN=PROOF_SOURCE_PRESENT",
  "FND02_ROCQ=PROOF_SOURCE_PRESENT",
  "FND13_LEAN=PROOF_SOURCE_PRESENT",
  "FND13_ROCQ=PROOF_SOURCE_PRESENT",
  "FND13_BASIS=FND02_INDEXED_F2F3_NORMALIZATION",
  "FND01_C1=PROPOSITION_PARTITION_ONLY",
  "FND01_DECIDABILITY=EXPLICIT_LOCAL_EVIDENCE",
  "FND01_C2=GROUNDED_REALIZABILITY",
  "FND01_C2_PREMISE=TWO_PROPER_ONE_SIDED_FORMS",
  "FND01_PAIR=DERIVED_BY_SINGLE_FORM",
  "FND01_CAPSTONE=EXTERNAL_PROOF_COMPLETE",
  "FND01_CONTEXT=NAMES_ONLY",
  "FND01_CTX03_DEPENDENCY=NONE",
  "FND01_PORTABLE_EVIDENCE=LEAN4+ROCQ",
  "INV01_GRAPH=PROP_VALUED_STRUCTURAL",
  "INV01_TOTAL=GROUNDED_DOMAIN",
  "INV01_IMAGE=GROUNDED",
  "INV01_POLE_REVERSAL=GREEN_SOURCE",
  "INV01_FUNCTIONAL=GREEN_SOURCE",
  "INV01_UNIQUE_TOTAL=GREEN_SOURCE",
  "INV01_UNIQUENESS=EXPLICIT",
  "INV02_DOMAIN=SAME_AS_INV01",
  "INV02_ONE_SIDED_CANONICALITY=DERIVED",
  "INV02_RELATIONAL_INVOLUTION=GREEN_SOURCE",
  "INV02_UNIQUE_TOTAL_INVOLUTION=GREEN_SOURCE",
  "INV02_DOMAIN_EXPANSION=NONE",
  "INV03_ROOT_FIXED=GREEN_SOURCE",
  "INV04_ONE_SIDED_EXCHANGE=GREEN_SOURCE",
  "INV04_NO_IDENTIFICATION=GREEN_SOURCE",
  "INV05_PAIR_PRESERVED=GREEN_SOURCE",
  "INV05_POLE_REVERSAL=INV01_REUSED",
  "INV05_NEW_DOMAIN_AXIOM=NONE",
  "INV06_ROOT_BASIS=R_FIXED_O_C_EXCHANGED_L_U_FIXED",
  "INV06_O_C=F2F3_ORIENTATION_REPRESENTATIVES",
  "INV06_L_U=PAIR_DERIVED",
  "INV06_ABSOLUTE_ORIENTATION=NONE",
  "INV07_OBJECTIVE_CHIRALITY=ONE_SIDED_EXCHANGE+INVOLUTION+PAIR_STABILITY",
  "INV07_DEPENDENCIES=INV02+INV04+INV05",
  "INV07_GLOBAL_ORIENTATION=NONE",
  "CTX03_RELATIONAL_SUPPORT=Z2_SAME_OPPOSITE",
  "CTX03_ORIENTATION_CARRIER=LINK_NATIVE_ONE_SIDED",
  "CTX03_HOST_FRAME_DATATYPE=NONE",
  "CTX03_CONTEXT_MARKER=LINK_NATIVE_ONE_SIDED",
  "CTX03_LOCAL_ROLES=CONTEXT_RELATIVE",
  "CTX03_OBJECTIVE_ORBIT=PRE_SELECTION",
  "CTX03_COVARIANCE=SIMULTANEOUS_J",
  "CTX03_CAPSTONE=RELATIONAL_Z2+CONTEXT_SELECTION",
  "FND07_TRUTH_WITNESS=K_TO_A_CURRENT_LINK",
  "FND07_AMBIENT_EXISTENCE_AUTHORITY=NONE",
  "FND07_TRUTH_VALUE=L",
  "FND07_HOST_SET_MEMBERSHIP=NONE",
  "FND05_DOMAIN=FINITE_GROUNDED_ROOT_DECOMPOSABLE",
  "FND05_CANONICAL_DESCRIPTION=UNIQUE",
  "FND05_HOST_CODE=EXTERNAL_PROJECTION_ONLY",
  "FND05_GENERAL_CYCLES=EXCLUDED",
  "FND05_ANUM_Q_IDENTITY=EXCLUDED",
  "FND11_DEPENDENCY=FND05",
  "FND11_RECURSIVE_CODEC_NE_ANUM=PROVED_TARGET_SEPARATION",
  "FND11_EXACT_SEQUENCE_NE_FOLD=COLLISION_WITNESS",
  "FND11_Q_SOURCE_NE_DENOTATION=COLLISION_WITNESS",
  "FND11_LOCAL_SEQUENCE_ORIGIN=R",
  "FND11_SECOND_ONTOLOGY=NONE",
  "CTX03_J_TRANSPORT=INV07_DERIVED",
  "EXECUTION=CI_ACTIVE_ON_PROOF_DIFF",
  "SEMANTIC_DELTA=NONE",
].join(" "));
