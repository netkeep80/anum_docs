import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const exporterPath = resolve("..", "research", "mathlib-m0", "lean", "Export.lean");
assert(existsSync(exporterPath), "Mathlib M0 post-elaboration exporter must exist");

const source = readFileSync(exporterPath, "utf8");
assert(
  source.includes("import Mathlib.Logic.Pairwise"),
  "exporter must import the exact pinned corpus module",
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
  [".bvar", ".sort", ".const", ".app", ".lam", ".forallE", ".lit"].every((form) =>
    source.includes(`| ${form}`),
  ),
  "exporter must structurally traverse the supported Lean Expr forms",
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

const workflowPath = resolve("..", ".github", "workflows", "mathlib-m0-export.yml");
assert(existsSync(workflowPath), "Mathlib M0 pinned export workflow must exist");
const workflow = readFileSync(workflowPath, "utf8");
assert(
  workflow.includes("- ts/src/mathlib-m0-transport.ts"),
  "live export gate must rerun when the TypeScript transport validator changes",
);
assert(
  workflow.includes("- .github/workflows/mathlib-m0-export.yml"),
  "live export gate must rerun when its own validation contract changes",
);
assert(
  workflow.includes("parseMathlibM0TransportBundle"),
  "live Lean output must pass through the TypeScript transport parser",
);
assert(
  workflow.includes("npm run build --silent"),
  "live export gate must build the exact research-head TypeScript validator",
);
assert(
  workflow.includes("mathlib-m0-artifacts/corpus-export.json"),
  "TypeScript transport validation must consume the actual live Lean artifact",
);

console.log("mathlib-m0-export-contract.test.ts: ok");
