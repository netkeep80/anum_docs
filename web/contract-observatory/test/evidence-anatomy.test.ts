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
assert(
  !invariantHighlights.includes("vector:v013-empty-wire-is-not-root"),
  "forward highlighting never guesses unrelated Q-boundary evidence",
);

const gateState = kernel.reduce(kernel.initialState(), {
  type: "select-item",
  itemId: "gate:ts/test/v013-root-aspect-formal-composition.test.ts",
});
const gateHighlights = kernel.highlightedItemIds(gateState);
includes(gateHighlights, "gate:ts/test/v013-root-aspect-formal-composition.test.ts", "selected gate highlights itself");
includes(
  gateHighlights,
  "invariant:L12",
  "gate walks backwards through the manifest-declared invariant relation",
);
assert(
  !gateHighlights.includes("evidence:ts/test/v013-root-aspect-formal-composition.test.ts"),
  "v0.13 does not invent vectorEvidence that its conformance does not declare",
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
