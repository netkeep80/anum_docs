import { buildContractObservatoryIndex } from "../src/contract-index.js";
import {
  buildObservatoryInteractionConfig,
  createObservatoryInteractionKernel,
} from "../src/interaction.js";
import { buildMethodologyProjection } from "../src/methodology-projection.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Contract Observatory V4d anatomy: ${message}`);
}

function includes(values: readonly string[], value: string, message: string): void {
  assert(values.includes(value), `${message}: missing ${value}`);
}

const repositoryRoot = process.cwd();
const projection = buildMethodologyProjection(repositoryRoot, buildContractObservatoryIndex(repositoryRoot));
const config = buildObservatoryInteractionConfig(projection);
const current = config.versions.find((version) => version.id === "mts-contract/v0.13");
assert(current !== undefined, "current interaction version exists");

includes(current.itemIds, "invariant:L12", "semantic invariant is selectable");
includes(
  current.itemIds,
  "gate:ts/test/v013-root-aspect-formal-composition.test.ts",
  "manifest-required executable gate is selectable",
);

const kernel = createObservatoryInteractionKernel(config);
const invariantState = kernel.reduce(kernel.initialState(), {
  type: "select-item",
  itemId: "invariant:L12",
});
assert(invariantState.selectedItemId === "invariant:L12", "invariant selection survives normalization");
const invariantHighlights = kernel.highlightedItemIds(invariantState);
includes(invariantHighlights, "invariant:L12", "selected invariant highlights itself");
includes(
  invariantHighlights,
  "vector:v013-formal-root-R-from-8",
  "invariant highlights its manifest-declared positive vector",
);
includes(
  invariantHighlights,
  "vector:v013-formal-root-wrong-rule-rejected",
  "invariant highlights its manifest-declared negative vector",
);
includes(
  invariantHighlights,
  "gate:ts/test/v013-root-aspect-formal-composition.test.ts",
  "invariant highlights its manifest-declared executable gate",
);
includes(
  invariantHighlights,
  "evidence:ts/test/v013-root-aspect-formal-composition.test.ts",
  "invariant follows vectorEvidence forward to existing executable evidence",
);
assert(
  !invariantHighlights.includes("vector:v013-empty-wire-is-not-root"),
  "forward highlighting never guesses unrelated Q-boundary evidence",
);

const evidenceState = kernel.reduce(kernel.initialState(), {
  type: "select-item",
  itemId: "evidence:ts/test/v013-root-aspect-formal-composition.test.ts",
});
const evidenceHighlights = kernel.highlightedItemIds(evidenceState);
includes(evidenceHighlights, "evidence:ts/test/v013-root-aspect-formal-composition.test.ts", "selected evidence highlights itself");
includes(
  evidenceHighlights,
  "vector:v013-formal-root-R-from-8",
  "evidence walks the explicit relation graph backwards to its vector",
);
includes(
  evidenceHighlights,
  "invariant:L12",
  "evidence walks backwards from vector to source-linked invariant",
);

const previousState = kernel.reduce(kernel.initialState(), {
  type: "select-version",
  versionId: "mts-contract/v0.12",
});
assert(
  kernel.highlightedItemIds(previousState).length === 0,
  "version without selected evidence has no fabricated highlights",
);

console.log("Contract Observatory V4d evidence-anatomy interaction specification passed.");
