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

console.log("mathlib-m0-export-contract.test.ts: ok");
