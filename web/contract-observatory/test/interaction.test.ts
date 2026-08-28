import {
  METHODOLOGY_STAGE_ORDER,
  buildInteractiveMethodologyModel,
  buildObservatoryInteractionConfig,
  createObservatoryInteractionKernel,
  decodeObservatoryHash,
  encodeObservatoryHash,
  reduceInteractionState,
  type ObservatoryInteractionState,
} from "../src/interaction.js";
import type { MethodologyProjection, MethodologyVersionProjection } from "../src/methodology-projection.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Contract Observatory V4c: ${message}`);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}

function projectedVersion(overrides: Partial<MethodologyVersionProjection> = {}): MethodologyVersionProjection {
  return Object.freeze({
    contractId: "mts-contract/v1.0",
    conformanceId: "mts-conformance/v1.0",
    contractPath: "contracts/mts-contract-v1.0.json",
    conformancePath: "contracts/mts-conformance-v1.0.json",
    status: "accepted",
    accepted: true,
    acceptanceReady: true,
    isCurrent: false,
    isPrevious: false,
    theoryReferences: Object.freeze([]),
    contractReferences: Object.freeze([]),
    positiveVectors: Object.freeze([]),
    negativeVectors: Object.freeze([]),
    executableGates: Object.freeze([]),
    evidenceReferences: Object.freeze([]),
    acceptanceReferences: Object.freeze([]),
    lifecycle: Object.freeze([
      Object.freeze({ stage: "candidate", evidence: Object.freeze(["contracts/mts-contract-v1.0.json"]) }),
      Object.freeze({ stage: "challenged", evidence: Object.freeze(["contracts/mts-conformance-v1.0.json"]) }),
      Object.freeze({ stage: "accepted", evidence: Object.freeze(["contracts/mts-contract-v1.0.json"]) }),
    ]),
    traceability: Object.freeze([]),
    unresolvedRelations: Object.freeze([]),
    ...overrides,
  });
}

const projection: MethodologyProjection = Object.freeze({
  schema: "mts-contract-methodology-projection/v0.1",
  versions: Object.freeze([
    projectedVersion({
      contractId: "mts-contract/v0.10",
      conformanceId: "mts-conformance/v0.10",
      isPrevious: true,
    }),
    projectedVersion({
      contractId: "mts-contract/v0.11",
      conformanceId: "mts-conformance/v0.11",
      isCurrent: true,
      contractReferences: Object.freeze([
        Object.freeze({ authority: "contract", id: "mts-contract/v0.11", path: "contracts/mts-contract-v0.11.json" }),
      ]),
      negativeVectors: Object.freeze([
        Object.freeze({ authority: "conformance-vector", id: "negative:edge", polarity: "negative", evidence: Object.freeze([]) }),
      ]),
      lifecycle: Object.freeze([
        Object.freeze({ stage: "research", evidence: Object.freeze(["issue:758"]) }),
        Object.freeze({ stage: "problem", evidence: Object.freeze(["issue:759"]) }),
        Object.freeze({ stage: "candidate", evidence: Object.freeze(["contracts/mts-contract-v0.11.json"]) }),
        Object.freeze({ stage: "challenged", evidence: Object.freeze(["contracts/mts-conformance-v0.11.json"]) }),
        Object.freeze({ stage: "modeled", evidence: Object.freeze(["contracts/mts-conformance-v0.11.json"]) }),
        Object.freeze({ stage: "accepted", evidence: Object.freeze(["contracts/mts-contract-v0.11.json"]) }),
        Object.freeze({ stage: "released", evidence: Object.freeze(["pointer:current"]) }),
      ]),
    }),
    projectedVersion({
      contractId: "mts-contract/v0.12-candidate",
      conformanceId: "mts-conformance/v0.12-candidate",
      status: "candidate",
      accepted: false,
      acceptanceReady: false,
      lifecycle: Object.freeze([
        Object.freeze({ stage: "candidate", evidence: Object.freeze(["contracts/mts-contract-v0.12-candidate.json"]) }),
      ]),
    }),
  ]),
});

same(
  METHODOLOGY_STAGE_ORDER.join(","),
  "research,problem,candidate,challenged,modeled,accepted,released",
  "methodology stage order remains explicit and deterministic",
);

const initial: ObservatoryInteractionState = Object.freeze({
  selectedVersionId: "mts-contract/v0.11",
  selectedStage: null,
  selectedItemId: null,
  filters: Object.freeze([]),
  viewport: Object.freeze({ x: 0, y: 0, scale: 1 }),
});

const initialModel = buildInteractiveMethodologyModel(projection, initial);
same(initialModel.versions.length, 3, "all projected versions render exactly once");
same(initialModel.versions.filter((entry) => entry.isCurrent).length, 1, "CURRENT derives only from projection state");
same(initialModel.versions.find((entry) => entry.isCurrent)?.contractId, "mts-contract/v0.11", "current version preserved");
same(initialModel.versions.find((entry) => entry.contractId.includes("candidate"))?.classification, "CANDIDATE", "candidate is textually distinct from accepted");
same(initialModel.versions.find((entry) => entry.contractId === "mts-contract/v0.11")?.classification, "CURRENT", "current classification is explicit");

const stageSelected = reduceInteractionState(initial, { type: "select-stage", stage: "challenged" }, projection);
same(stageSelected.selectedStage, "challenged", "stage selection is observable state");
const stageModel = buildInteractiveMethodologyModel(projection, stageSelected);
assert(stageModel.stages.find((entry) => entry.stage === "challenged")?.selected === true, "selected stage is emphasized");
assert(stageModel.versions.every((entry) => entry.stageStates.some((stage) => stage.stage === "challenged")), "stage state is synchronized across version lanes");

const versionSelected = reduceInteractionState(stageSelected, { type: "select-version", versionId: "mts-contract/v0.10" }, projection);
same(versionSelected.selectedVersionId, "mts-contract/v0.10", "version selection is synchronized state");

const encoded = encodeObservatoryHash(versionSelected, projection);
assert(encoded.startsWith("#v="), "deep link is a stable hash");
const decoded = decodeObservatoryHash(encoded, projection);
same(decoded.selectedVersionId, versionSelected.selectedVersionId, "hash restores selected version");
same(decoded.selectedStage, versionSelected.selectedStage, "hash restores selected stage");
same(encodeObservatoryHash(decoded, projection), encoded, "hash round-trip is deterministic");

const unknown = decodeObservatoryHash(
  "#v=missing&s=unknown&item=%3Cscript%3E&f=negative&f=unknown&f=negative&x=NaN&y=Infinity&z=99",
  projection,
);
same(unknown.selectedVersionId, "mts-contract/v0.11", "unknown version fails closed to projected current version");
same(unknown.selectedStage, null, "unknown methodology stage is not fabricated");
same(unknown.selectedItemId, null, "unknown item fails closed rather than surviving as opaque browser-only state");
same(unknown.filters.join(","), "negative", "unknown filters are dropped and known duplicates normalize");
same(unknown.viewport.x, 0, "invalid x fails closed");
same(unknown.viewport.y, 0, "invalid y fails closed");
same(unknown.viewport.scale, 1.8, "zoom is clamped to the canonical maximum");

const knownItem = decodeObservatoryHash("#item=mts-contract%2Fv0.11", projection);
same(knownItem.selectedItemId, "mts-contract/v0.11", "known projected item survives canonical decoding");

const lowZoom = decodeObservatoryHash("#z=-5", projection);
same(lowZoom.viewport.scale, 0.7, "zoom is clamped to the canonical minimum");

const unorderedFilters = decodeObservatoryHash("#f=previous&f=accepted", projection);
same(unorderedFilters.filters.join(","), "accepted,previous", "known filters normalize to canonical order");
same(encodeObservatoryHash(unorderedFilters, projection), "#v=mts-contract%2Fv0.11&f=accepted&f=previous", "canonical hash re-encodes normalized filters deterministically");

const kernel = createObservatoryInteractionKernel(buildObservatoryInteractionConfig(projection));
const conjunctive = kernel.reduce(initial, { type: "set-filters", filters: ["current", "accepted", "negative"] });
assert(kernel.isVersionVisible("mts-contract/v0.11", conjunctive), "CURRENT + ACCEPTED + NEGATIVE uses explicit conjunctive filter semantics");
assert(!kernel.isVersionVisible("mts-contract/v0.10", conjunctive), "version missing any active category is hidden");
const unknownFilter = kernel.reduce(conjunctive, { type: "toggle-filter", filter: "invented" });
same(unknownFilter.filters.join(","), conjunctive.filters.join(","), "unknown UI filter action is inert");

same(
  JSON.stringify(buildInteractiveMethodologyModel(projection, versionSelected)),
  JSON.stringify(buildInteractiveMethodologyModel(projection, versionSelected)),
  "same projection and interaction state produce deterministic rendered model",
);

console.log("Contract Observatory V4c interaction-model specification passed.");
