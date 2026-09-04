import { buildContractObservatoryIndex } from "../src/contract-index.js";
import { buildMethodologyProjection } from "../src/methodology-projection.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Contract Observatory V4d: ${message}`);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}

const repositoryRoot = process.cwd();
const projection = buildMethodologyProjection(repositoryRoot, buildContractObservatoryIndex(repositoryRoot));
const current = projection.versions.find((version) => version.isCurrent);
assert(current !== undefined, "current version exists");

same(current.semanticInvariants.length, 7, "current v0.11 exposes exactly seven authority invariants");
const topLevelDot = current.semanticInvariants.find((invariant) => invariant.id === "topLevelDot");
assert(topLevelDot !== undefined, "topLevelDot invariant is projected from traceability authority");
same(topLevelDot.traceabilitySourcePath, "traceability/mts-v0.11.json", "manifest source path remains explicit");
same(topLevelDot.contractPointer, "/requiredSemanticLaws/topLevelDot", "exact contract pointer is preserved");
same(topLevelDot.contractValue, ". -> R under TopBind(R,S)", "contract law is resolved from exact pointer");
same(
  topLevelDot.positive.requiredGenesisVectors.join(","),
  "v011-top-level-astrika-supplies-root-binding,v011-top-level-dot-resolves-to-root",
  "genesis vector category comes directly from manifest",
);
same(
  topLevelDot.negative.requiredNegativeVectors.join(","),
  "v011-dot-is-not-ambient-runtime-current,v011-host-stack-is-not-semantic-authority,v011-top-bind-does-not-insert-hidden-root-glyph",
  "negative vectors stay separate and normalize deterministically",
);
same(
  topLevelDot.requiredExecutableGates.join(","),
  "ts/test/research-physical-dot-bootstrap.test.ts,ts/test/v011-top-level-root-binding.test.ts",
  "required gates come directly from manifest",
);

const dotMeaning = current.semanticInvariants.find((invariant) => invariant.id === "dotMeaning");
assert(dotMeaning !== undefined, "dotMeaning invariant exists");
same(dotMeaning.negative.requiredNegativeVectors.length, 0, "explicit empty negative category remains empty");
assert(
  !dotMeaning.positive.requiredC2ClassificationVectors.some((id) => id.includes("q-boundary")),
  "Q-boundary evidence is not guessed into dotMeaning",
);

const previous = projection.versions.find((version) => version.isPrevious);
assert(previous !== undefined, "previous version exists");
same(previous.semanticInvariants.length, 0, "version without a matching traceability manifest stays unlinked");
assert(previous.unresolvedRelations.includes("traceability-manifest"), "missing manifest remains explicit");
