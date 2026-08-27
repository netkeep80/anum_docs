import {
  buildEvidenceAnatomyModel,
  type ObservatoryInteractionState,
} from "../src/interaction.js";
import type {
  MethodologyProjection,
  MethodologyVersionProjection,
} from "../src/methodology-projection.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Contract Observatory V4d: ${message}`);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}

const version: MethodologyVersionProjection = Object.freeze({
  contractId: "mts-contract/v0.11",
  conformanceId: "mts-conformance/v0.11",
  contractPath: "contracts/mts-contract-v0.11.json",
  conformancePath: "contracts/mts-conformance-v0.11.json",
  status: "accepted",
  accepted: true,
  acceptanceReady: true,
  isCurrent: true,
  isPrevious: false,
  theoryReferences: Object.freeze([
    Object.freeze({ authority: "theory-reference", id: "mts-contract/v0.10" }),
  ]),
  contractReferences: Object.freeze([
    Object.freeze({ authority: "contract", id: "mts-contract/v0.11", path: "contracts/mts-contract-v0.11.json" }),
  ]),
  positiveVectors: Object.freeze([
    Object.freeze({ authority: "conformance-vector", id: "POS-A", polarity: "positive", evidence: Object.freeze(["ts/test/positive.test.ts"]) }),
  ]),
  negativeVectors: Object.freeze([
    Object.freeze({ authority: "conformance-vector", id: "NEG-A", polarity: "negative", evidence: Object.freeze(["ts/test/negative.test.ts"]) }),
    Object.freeze({ authority: "conformance-vector", id: "NEG-UNLINKED", polarity: "negative", evidence: Object.freeze([]) }),
  ]),
  executableGates: Object.freeze([
    Object.freeze({ authority: "executable-gate", id: "gate:ts/test/release-cutover.test.ts", path: "ts/test/release-cutover.test.ts" }),
  ]),
  evidenceReferences: Object.freeze([
    Object.freeze({ authority: "evidence", id: "evidence:ts/test/negative.test.ts", sourcePath: "ts/test/negative.test.ts" }),
    Object.freeze({ authority: "evidence", id: "evidence:ts/test/positive.test.ts", sourcePath: "ts/test/positive.test.ts" }),
  ]),
  acceptanceReferences: Object.freeze([
    Object.freeze({ authority: "acceptance", id: "acceptance:mts-contract/v0.11:current", sourcePath: "cutover/typescript-c1-acceptance-v0.4.json" }),
  ]),
  lifecycle: Object.freeze([]),
  traceability: Object.freeze([
    Object.freeze({ authority: "traceability", from: "vector:NEG-A", to: "evidence:ts/test/negative.test.ts", relation: "supported-by" }),
    Object.freeze({ authority: "traceability", from: "vector:POS-A", to: "evidence:ts/test/positive.test.ts", relation: "supported-by" }),
    Object.freeze({ authority: "traceability", from: "contract:mts-contract/v0.11", to: "acceptance:mts-contract/v0.11:current", relation: "accepted-by" }),
  ]),
  unresolvedRelations: Object.freeze(["vector-evidence:NEG-UNLINKED"]),
});

const projection: MethodologyProjection = Object.freeze({
  schema: "mts-contract-methodology-projection/v0.1",
  versions: Object.freeze([version]),
});

const state: ObservatoryInteractionState = Object.freeze({
  selectedVersionId: "mts-contract/v0.11",
  selectedStage: null,
  selectedItemId: "evidence:ts/test/negative.test.ts",
  filters: Object.freeze([]),
  viewport: Object.freeze({ x: 0, y: 0, scale: 1 }),
});

const anatomy = buildEvidenceAnatomyModel(projection, state);
same(anatomy.versionId, "mts-contract/v0.11", "selected version drives anatomy");
same(anatomy.selectedItemId, "evidence:ts/test/negative.test.ts", "selected evidence remains explicit");
same(anatomy.positiveVectorIds.join(","), "POS-A", "positive vectors remain a separate first-class group");
same(anatomy.negativeVectorIds.join(","), "NEG-A,NEG-UNLINKED", "negative vectors remain a separate first-class group");
assert(anatomy.highlightedItemIds.includes("evidence:ts/test/negative.test.ts"), "selected evidence is highlighted");
assert(anatomy.highlightedItemIds.includes("vector:NEG-A"), "evidence selection back-highlights only an explicitly linked obligation");
assert(!anatomy.highlightedItemIds.includes("vector:POS-A"), "unrelated positive obligation is not guessed as linked");
assert(anatomy.sourcePaths.includes("contracts/mts-contract-v0.11.json"), "contract raw provenance is reachable");
assert(anatomy.sourcePaths.includes("contracts/mts-conformance-v0.11.json"), "conformance raw provenance is reachable");
assert(anatomy.sourcePaths.includes("cutover/typescript-c1-acceptance-v0.4.json"), "acceptance raw provenance is reachable");
assert(anatomy.unresolvedRelations.includes("vector-evidence:NEG-UNLINKED"), "missing traceability stays explicit");

const unknownSelection = buildEvidenceAnatomyModel(
  projection,
  Object.freeze({ ...state, selectedItemId: "evidence:missing" }),
);
same(unknownSelection.selectedItemId, null, "unknown selected item fails closed instead of fabricating traceability");
same(unknownSelection.highlightedItemIds.length, 0, "unknown item highlights nothing");

console.log("Contract Observatory V4d evidence anatomy specification passed.");
