import {
  buildMethodologyProjection,
  serializeMethodologyProjection,
  type MethodologyProjection,
} from "../src/methodology-projection.js";
import { buildContractObservatoryIndex } from "../src/contract-index.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Contract Observatory V4b: ${message}`);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}

const repositoryRoot = process.cwd();
const index = buildContractObservatoryIndex(repositoryRoot);
const projection: MethodologyProjection = buildMethodologyProjection(repositoryRoot, index);

same(projection.schema, "mts-contract-methodology-projection/v0.1", "projection schema");
same(projection.versions.length, 2, "live v0.10/v0.11 pair projected exactly once");
same(
  projection.versions.map((version) => version.contractId).join(","),
  "mts-contract/v0.10,mts-contract/v0.11",
  "projection preserves V3 deterministic version order",
);

const current = projection.versions.find((version) => version.isCurrent);
assert(current !== undefined, "current contract version exists");
same(current.contractId, "mts-contract/v0.11", "current comes from V3 evidence, not file recency");
same(current.accepted, true, "explicit accepted state preserved");
assert(current.positiveVectors.length > 0, "positive conformance vectors are first-class");
assert(current.negativeVectors.length > 0, "negative/veto vectors are first-class");
assert(current.executableGates.length > 0, "challenge/gate evidence is first-class");
assert(current.acceptanceReferences.length > 0, "explicit acceptance evidence is represented");
assert(
  current.negativeVectors.every((vector) => vector.polarity === "negative"),
  "negative vectors cannot collapse into positive evidence",
);

const serialized = serializeMethodologyProjection(projection);
same(
  serialized,
  serializeMethodologyProjection(buildMethodologyProjection(repositoryRoot, buildContractObservatoryIndex(repositoryRoot))),
  "same repository evidence serializes byte-identically",
);
assert(!serialized.includes("semanticLink"), "methodology projection does not claim MTS semantic Link identity");
