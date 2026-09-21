import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  createStructuralProofProducer,
  replayStructuralDerivation,
  replayStructuralDerivationWithAssumptions,
  replayStructuralDerivationWithTheorems,
  replayStructuralTheorem,
  replayV012SelectedSourceEvidence,
  replayV012SourceResultEvidence,
} from "../src/public.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`A6 FORMAL logic dialect baseline: ${message}`);
}
function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: values differ`);
}

const repoRoot = resolve(process.cwd(), "..");
const contract12 = JSON.parse(
  readFileSync(join(repoRoot, "contracts/mts-contract-v0.12.json"), "utf8"),
);
const contract13 = JSON.parse(
  readFileSync(join(repoRoot, "contracts/mts-contract-v0.13.json"), "utf8"),
);
const conformance13 = JSON.parse(
  readFileSync(join(repoRoot, "contracts/mts-conformance-v0.13.json"), "utf8"),
);

const benchmark = conformance13.nonBlockingComparativeResearch.formalLogicDialectA6;
same(benchmark.status, "baseline-recorded", "A6 is research baseline");
same(benchmark.acceptanceBlocker, false, "A6 is not yet an acceptance blocker");
same(
  benchmark.promotionRequiresExplicitAuthorDecision,
  true,
  "promotion requires explicit author decision",
);
same(benchmark.comparisonRule.aggregateScoreForbidden, true, "no arbitrary aggregate score");

same(contract12.foundation.internalSignCount, 11, "v0.12 FORMAL internal sign count");
same(contract12.foundation.qAlphabetCount, 4, "v0.12 Q alphabet count");
same(contract12.interpreterModel.identities.length, 3, "v0.12 interpreter kind count");
same(
  contract13.structuralQuaternaryAlphabet.symbols.length,
  4,
  "v0.13 aspect alphabet count",
);
same(
  contract13.structuralQuaternaryAlphabet.derivedFromLinkSelfIncidencePartition,
  true,
  "v0.13 aspect alphabet is derived from Link",
);
same(
  contract13.retainedAcceptedCapabilities.interpreterLayerV012.interpreterModel.identities.length,
  3,
  "v0.13 currently retains the same interpreter-kind count",
);

// Current backend capabilities exist independently of a complete source dialect.
for (const [name, value] of Object.entries({
  createStructuralProofProducer,
  replayStructuralDerivation,
  replayStructuralDerivationWithAssumptions,
  replayStructuralDerivationWithTheorems,
  replayStructuralTheorem,
  replayV012SelectedSourceEvidence,
  replayV012SourceResultEvidence,
})) {
  assert(typeof value === "function", `${name} is a live backend capability`);
}

const v12 = benchmark.currentBaseline.v012;
const v13 = benchmark.currentBaseline.v013;

same(v12.stages.B0, "GREEN", "v0.12 exact source baseline");
same(v12.stages.B1, "GREEN", "v0.12 source authority baseline");
same(v12.stages.B3, "NOT_DEMONSTRATED_FROM_FORMAL_SOURCE", "v0.12 axiom source dialect gap");
same(v12.stages.B4, "NOT_DEMONSTRATED_FROM_FORMAL_SOURCE", "v0.12 rule source dialect gap");
same(v12.stages.B10, "NOT_DEMONSTRATED_FROM_FORMAL_SOURCE", "v0.12 complete axiom dialect gap");

same(v13.stages.B0, "GREEN_RETAINED", "v0.13 exact source retained");
same(v13.stages.B1, "GREEN_RETAINED", "v0.13 source authority retained");
same(v13.stages.B3, "NOT_DEMONSTRATED_FROM_FORMAL_SOURCE", "v0.13 axiom source dialect gap");
same(v13.stages.B4, "NOT_DEMONSTRATED_FROM_FORMAL_SOURCE", "v0.13 rule source dialect gap");
same(v13.stages.B10, "NOT_DEMONSTRATED_FROM_FORMAL_SOURCE", "v0.13 complete axiom dialect gap");

same(
  v12.proofBackend.theoremSpecificKernelRequiredForExistingDerivedLogic,
  false,
  "existing derived logic needs no theorem-specific kernel",
);
same(
  v13.proofBackendRelation,
  "same accepted structural proof backend retained; no A6 dialect advantage claimed yet",
  "v0.13 does not claim an unimplemented dialect advantage",
);

console.log(
  "A6 FORMAL logic dialect baseline: v0.12 and current v0.13 share a strong structural proof backend, but neither yet demonstrates an end-to-end FORMAL source dialect for axioms/rules/proofs; v0.13's measured advantage at baseline is foundation derivability, not source-language power: GREEN.",
);
