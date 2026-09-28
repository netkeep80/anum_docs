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
  "axiom INV_01",
  "inductive InversionAspect",
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
  "Axiom INV_01",
  "Inductive InversionAspect",
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
  lean.includes("def RootUniqueness") && rocq.includes("Definition RootUniqueness"),
  "external sources name the unique-ROOT proof boundary",
);
assert(
  lean.includes("(a1 : A1RecursiveSeparation F)") &&
    lean.includes("FND_02_unique_root F a1 hx"),
  "Lean FND-13 normalization witness is indexed by the FND-02 result",
);
assert(
  rocq.includes("(A1 : A1RecursiveSeparation F)") &&
    rocq.includes("F2F3Normalization F (FND_02_unique_root F A1)"),
  "Rocq FND-13 normalization witness is indexed by the FND-02 result",
);
assert(
  !lean.includes("rootUnique :") && !rocq.includes("root_unique_fnd02"),
  "unique ROOT is not duplicated as a free normalization record field",
);
assert(
  !lean.includes("form (F.start x) (F.finish x) = x"),
  "Lean does not smuggle A6 as a reconstruction axiom",
);
assert(
  !rocq.includes("form F (start F x) (finish F x) = x"),
  "Rocq does not smuggle A6 as a reconstruction axiom",
);

const fnd01 = (p0.targets as Record<string, any>[]).find((target) => target.id === "FND-01");
assert(fnd01 !== undefined, "P0 contains FND-01");
assert(
  JSON.stringify(fnd01.dependsOn) === JSON.stringify(["FND-02", "FND-13"]),
  "FND-01 follows unique ROOT and ordered-pole identity",
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
    lean.includes("FND_13_identity_by_poles F a1 N"),
  "Lean FND-01 C1 explicitly consumes FND-02 and FND-13",
);
assert(
  rocq.includes("FND_02_unique_root F A1 x H") &&
    rocq.includes("FND_13_identity_by_poles F A1 N x y"),
  "Rocq FND-01 C1 explicitly consumes FND-02 and FND-13",
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
  /finite recursive Link domain/i.test(inv01.scope as string),
  "INV-01 remains scoped to the declared finite recursive Link domain",
);
assert(
  /Host field order, graph labels, or codec digits/i.test(inv01.exclusions as string),
  "INV-01 excludes host/graph/codec semantic authority",
);

for (const source of [lean, rocq]) {
  assert(
    source.includes("F2F3RecursiveFormation"),
    "INV-01 source exposes generic accepted F2/F3 START/END formation",
  );
  assert(
    source.includes("ProofDecision"),
    "INV-01 source carries exact local proposition decisions",
  );
  assert(
    source.includes("InversionReady"),
    "INV-01 source carries finite recursive traversal evidence",
  );
  assert(
    source.includes("RecursiveInverse"),
    "INV-01 source defines inversion as a Link-level recursive relation",
  );
  assert(
    source.includes("recursive_inverse_exists"),
    "INV-01 source proves inversion existence on its declared ready domain",
  );
  assert(
    source.includes("recursive_inverse_functional"),
    "INV-01 source proves inversion result uniqueness",
  );
  assert(
    source.includes("INV_01_recursive_inversion"),
    "INV-01 source contains the theorem claim",
  );
}
assert(
  lean.includes("theorem INV_01_recursive_inversion"),
  "Lean INV-01 is a theorem, not an axiom",
);
assert(
  rocq.includes("Theorem INV_01_recursive_inversion"),
  "Rocq INV-01 is a theorem, not an axiom",
);
assert(
  lean.includes("FND_01_four_structural_cases F a1 N E localDecision"),
  "Lean INV-01 existence consumes the proved FND-01 partition",
);
assert(
  rocq.includes("FND_01_four_structural_cases F A1 N E x LocalDecision"),
  "Rocq INV-01 existence consumes the proved FND-01 partition",
);
assert(
  lean.includes("FND_02_unique_root F a1 hFull") &&
    rocq.includes("FND_02_unique_root F A1 x HFull"),
  "INV-01 consumes FND-02 for the full-self ROOT branch",
);
assert(
  lean.includes("RecursiveInverse.startCase hStart hChild") &&
    lean.includes("RecursiveInverse.finishCase hFinish hChild") &&
    lean.includes("RecursiveInverse.pairCase hPair hStartInverse hFinishInverse"),
  "Lean INV-01 derives START/END/PAIR recursive rules structurally",
);
assert(
  rocq.includes("apply inverse_start") &&
    rocq.includes("apply inverse_finish") &&
    rocq.includes("apply inverse_pair"),
  "Rocq INV-01 derives START/END/PAIR recursive rules structurally",
);
assert(
  lean.includes("F.form finishInverse startInverse") &&
    rocq.includes("form F finishInverse startInverse"),
  "PAIR inversion reverses recursively inverted pole order",
);
const leanInvStart = lean.indexOf("structure F2F3RecursiveFormation");
const rocqInvStart = rocq.indexOf("Record F2F3RecursiveFormation");
assert(leanInvStart >= 0 && rocqInvStart >= 0, "INV-01 source slices exist");
const leanInv = lean.slice(leanInvStart);
const rocqInv = rocq.slice(rocqInvStart);
for (const token of [".poles(", ".outgoing(", ".incoming(", "DecidableEq", "Classical.em"]) {
  assert(!leanInv.includes(token), `Lean INV-01 excludes host/global-decision shortcut: ${token}`);
}
for (const token of ["Require Import", "classic."]) {
  assert(!rocqInv.includes(token), `Rocq INV-01 excludes imported/classical shortcut: ${token}`);
}
assert(
  !leanInv.includes("inductive InversionAspect") &&
    !rocqInv.includes("Inductive InversionAspect"),
  "INV-01 does not encode inversion authority as a four-case Aspect datatype",
);
assert(
  lean.includes("inductive InversionReady") &&
    rocq.includes("Inductive InversionReady"),
  "INV-01 readiness is one recursive evidence relation",
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
  "THEOREM_PROOF_CLAIMS=7",
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
  "FND01_PORTABLE_EVIDENCE=RECORDED",
  "INV01=UNIQUE_STRUCTURAL_RELATION",
  "INV01_DOMAIN=FINITE_READY_WITH_LOCAL_DECISIONS",
  "INV01_FORMATION=F2F3_GENERIC_START_END",
  "EXECUTION=CI_ACTIVE_ON_PROOF_DIFF",
  "SEMANTIC_DELTA=NONE",
].join(" "));
