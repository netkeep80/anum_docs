import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const exporterPath = resolve("..", "research", "mathlib-m0", "lean", "Export.lean");
assert(existsSync(exporterPath), "Mathlib M0 post-elaboration exporter must exist");

const source = readFileSync(exporterPath, "utf8");
assert(
  source.includes("import Mathlib.Logic.Function.Basic") &&
    !source.includes("import Mathlib.Logic.Pairwise"),
  "exporter must import the approved Π/→ umbrella module",
);
assert(/\bgetEnv\b/.test(source), "exporter must read Lean's post-elaboration Environment");
assert(
  source.includes("MATHLIB_M0_OUTPUT"),
  "exporter must write to the workflow-provided output path",
);
assert(
  !source.includes("Mathlib/Logic/Pairwise.lean"),
  "exporter must not parse the source file as evidence",
);
assert(
  !source.includes("IO.FS.readFile"),
  "exporter must not derive kernel evidence by reading source text",
);
assert(
  !/\btypeRepr\b|\bvalueRepr\??\b/.test(source) &&
    !/reprStr\s+typeExpr|valueExpr\?\.map\s+reprStr/.test(source),
  "exporter must not use reprStr-backed strings as the kernel type/value transport boundary",
);
assert(
  [".bvar", ".sort", ".const", ".app", ".lam", ".forallE", ".lit", ".proj"].every((form) =>
    source.includes(`| ${form}`),
  ),
  "exporter must structurally traverse the supported Lean Expr forms",
);
assert(
  source.includes("| .proj typeName index struct => do") &&
    source.includes('(\"typeName\", Json.str typeName.toString)') &&
    source.includes('(\"index\", Json.num (JsonNumber.fromNat index))') &&
    source.includes('(\"struct\", structJson)') &&
    !source.includes('unsupported kernel expression form: proj'),
  "exporter must serialize Lean Expr.proj structurally instead of rejecting it",
);
assert(
  [".zero", ".param", ".succ"].every((form) => source.includes(`| ${form}`)),
  "exporter must structurally traverse the supported Lean Level forms",
);
assert(
  source.includes("collectDependencyClosure") &&
    source.includes("collectDependencyClosure env corpusRoots"),
  "corpus roots must seed a recursive post-elaboration dependency closure",
);
assert(
  !/corpusRoots\.mapM\s*\(buildNode env corpusRoots\)/.test(source),
  "exporter must not treat the source roots themselves as the dependency-closed corpus",
);
assert(
  source.includes("diagnoseRootClosures") &&
    source.includes("per-root exportable closures:"),
  "aggregate closure overflow must report deterministic per-root closure sizes for corpus selection",
);

assert(
  source.includes('requireEnv "MATHLIB_M0_BOUNDARY_OUTPUT"') &&
    source.includes("mts-mathlib-m0-external-boundary/v0.1"),
  "exporter must emit a separate workflow-provided external-boundary evidence artifact",
);
const constantInfoClassifier =
  source.match(/private def constantInfoKind[\s\S]*?(?=\nprivate def )/)?.[0] ?? "";
assert(
  [
    ".axiomInfo _ => \"axiom\"",
    ".defnInfo _ => \"definition\"",
    ".thmInfo _ => \"theorem\"",
    ".opaqueInfo _ => \"opaque\"",
    ".quotInfo _ => \"quotient\"",
    ".inductInfo _ => \"inductive\"",
    ".ctorInfo _ => \"constructor\"",
    ".recInfo _ => \"recursor\"",
  ].every((clause) => constantInfoClassifier.includes(clause)) &&
    !/\|\s*_\s*=>/.test(constantInfoClassifier),
  "external-boundary evidence must classify every pinned Lean ConstantInfo constructor exhaustively",
);
assert(
  source.includes("referencedBy") && source.includes("externalDependencies"),
  "external-boundary referencedBy identities must derive from exported nodes' externalDependencies",
);

const corpusSeedPath = resolve("..", "research", "mathlib-m0", "corpus-seed.json");
const reproductionPath = resolve("..", "research", "mathlib-m0", "corpus-reproduction.json");
assert(existsSync(corpusSeedPath), "Mathlib M0 corpus seed manifest must exist");
assert(existsSync(reproductionPath), "Mathlib M0 corpus reproduction manifest must exist");

type SourcePin = {
  module: string;
  path: string;
  blobSha: string;
};

const corpusSeed = JSON.parse(readFileSync(corpusSeedPath, "utf8")) as {
  roots?: unknown;
  source?: unknown;
  sources?: unknown;
};
const reproduction = JSON.parse(readFileSync(reproductionPath, "utf8")) as {
  source?: unknown;
  sources?: unknown;
  selection?: { roots?: unknown };
};
const expectedRoots = [
  "Function.eval",
  "hidden",
  "Function.swap₂",
  "Function.dcomp",
  "Function.onFun",
  "Function.swap",
  "Function.bicompl",
  "Function.bicompr",
  "Pi.map",
  "forall₃_imp",
];
const expectedSources: SourcePin[] = [
  {
    module: "Mathlib.Logic.Function.Basic",
    path: "Mathlib/Logic/Function/Basic.lean",
    blobSha: "e32127e286544f7ecdbd488c9787b85bee4548ba",
  },
  {
    module: "Mathlib.Logic.Function.Defs",
    path: "Mathlib/Logic/Function/Defs.lean",
    blobSha: "565ae3df6b95fa084d60818ab13fab2e80874f3f",
  },
  {
    module: "Mathlib.Basic.Logic.Basic",
    path: "Mathlib/Basic/Logic/Basic.lean",
    blobSha: "1b8251cc298129bb6613435742ca7cb9ab553df2",
  },
];
const expectedLeanRoots = [
  "``Function.eval",
  "``hidden",
  "``Function.swap₂",
  "``Function.dcomp",
  "``Function.onFun",
  "``Function.swap",
  "``Function.bicompl",
  "``Function.bicompr",
  "``Pi.map",
  "``forall₃_imp",
];
assert(
  JSON.stringify(corpusSeed.roots) === JSON.stringify(expectedRoots) &&
    JSON.stringify(reproduction.selection?.roots) === JSON.stringify(expectedRoots),
  "Mathlib M0 manifests must pin the approved Π/→ source roots",
);
assert(
  JSON.stringify(corpusSeed.sources) === JSON.stringify(expectedSources) &&
    JSON.stringify(reproduction.sources) === JSON.stringify(expectedSources),
  "Mathlib M0 manifests must pin exact root-source provenance",
);
assert(
  !("source" in corpusSeed) && !("source" in reproduction),
  "multi-source Π/→ provenance must not retain the obsolete singular source field",
);
assert(
  expectedLeanRoots.every((root) => source.includes(root)),
  "Lean exporter must use every approved Π/→ source root",
);
assert(
  !source.includes("``Pairwise.set_pairwise"),
  "Lean exporter must not retain the falsified Pairwise root as active selection",
);

const workflowPath = resolve("..", ".github", "workflows", "mathlib-m0-export.yml");
assert(existsSync(workflowPath), "Mathlib M0 pinned export workflow must exist");
const workflow = readFileSync(workflowPath, "utf8");
assert(
  workflow.includes("- ts/src/mathlib-m0-transport.ts"),
  "live export gate must rerun when the TypeScript transport validator changes",
);
assert(
  workflow.includes("- ts/src/mathlib-m0-external-boundary.ts"),
  "live export gate must rerun when the TypeScript external-boundary validator changes",
);
assert(
  workflow.includes("- .github/workflows/mathlib-m0-export.yml"),
  "live export gate must rerun when its own validation contract changes",
);
assert(
  workflow.includes("MATHLIB_M0_BOUNDARY_OUTPUT") &&
    workflow.includes("external-boundary-$pass.json"),
  "both live exporter passes must receive a deterministic external-boundary output path",
);
assert(
  workflow.includes('cmp "$artifact_dir/external-boundary-1.json" "$artifact_dir/external-boundary-2.json"'),
  "live boundary evidence must be byte-for-byte deterministic across both Lean exporter passes",
);
assert(
  workflow.includes("parseMathlibM0TransportBundle"),
  "live Lean output must pass through the TypeScript transport parser",
);
assert(
  workflow.includes("parseMathlibM0ExternalBoundary"),
  "live Lean boundary output must pass through the TypeScript external-boundary parser",
);
assert(
  workflow.includes("npm run build --silent"),
  "live export gate must build the exact research-head TypeScript validator",
);
assert(
  workflow.includes("mathlib-m0-artifacts/corpus-export.json"),
  "TypeScript transport validation must consume the actual live Lean artifact",
);
assert(
  workflow.includes("mathlib-m0-artifacts/external-boundary.json"),
  "TypeScript boundary validation must consume the actual live Lean boundary artifact",
);
assert(
  workflow.includes("if (boundary.entries.length !== 0)") &&
    workflow.includes("live transport is not dependency-closed"),
  "live Mathlib M0 gate must reject every non-empty external kernel boundary",
);

console.log("mathlib-m0-export-contract.test.ts: ok");
