// mts-version-evidence: required-from=0.13
import * as publicApi from "../src/public.js";

import {
  V013HierarchicalCarrierError as InternalV013HierarchicalCarrierError,
  decomposeV013SemanticLink as internalDecomposeV013SemanticLink,
  materializeV013HierarchicalCarrier as internalMaterializeV013HierarchicalCarrier,
  materializeV013HierarchicalCarrierFromSemanticLink as internalMaterializeV013HierarchicalCarrierFromSemanticLink,
  serializeV013HierarchicalCarrier as internalSerializeV013HierarchicalCarrier,
} from "../src/v013-hierarchical-carrier.js";
import {
  V013RelativeFormMaterializationError as InternalV013RelativeFormMaterializationError,
  materializeAuthorizedBinaryLinkSource as internalMaterializeAuthorizedBinaryLinkSource,
  materializeAuthorizedRelativeUnaryFormSource as internalMaterializeAuthorizedRelativeUnaryFormSource,
} from "../src/v013-relative-form-materialization.js";
import {
  V013RelativePoleExecutionError as InternalV013RelativePoleExecutionError,
  executeAuthorizedRelativePoleSource as internalExecuteAuthorizedRelativePoleSource,
} from "../src/v013-relative-pole-execution.js";
import {
  V013FormalAspectEvaluationError as InternalV013FormalAspectEvaluationError,
  evaluateV013FormalAspectProgram as internalEvaluateV013FormalAspectProgram,
} from "../src/v013-formal-aspect-evaluator.js";

import type {
  V013FormalAspectEvaluationErrorCode,
  V013FormalAspectProgramEvidence,
  V013HierarchicalCarrierErrorCode,
  V013RelativeFormMaterializationErrorCode,
  V013RelativePoleExecutionErrorCode,
  V013RelativePoleExecutionResult,
  V013SelfIncidence,
  V013SemanticDecomposition,
  V013StructuralAspect,
} from "../src/public.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.13 public facade: ${message}`);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(
    Object.is(actual, expected),
    `${message}: exported operation is not the verified kernel operation`,
  );
}

// Type-only references make the intended consumer evidence surface compile.
type PublicV013Surface = readonly [
  V013HierarchicalCarrierErrorCode,
  V013StructuralAspect,
  V013SelfIncidence,
  V013SemanticDecomposition,
  V013RelativeFormMaterializationErrorCode,
  V013RelativePoleExecutionErrorCode,
  V013RelativePoleExecutionResult,
  V013FormalAspectEvaluationErrorCode,
  V013FormalAspectProgramEvidence,
];
const typeSurfaceExists: PublicV013Surface | undefined = undefined;
void typeSurfaceExists;

// Representation/read boundary.
same(
  publicApi.V013HierarchicalCarrierError,
  InternalV013HierarchicalCarrierError,
  "V013HierarchicalCarrierError",
);
same(
  publicApi.decomposeV013SemanticLink,
  internalDecomposeV013SemanticLink,
  "decomposeV013SemanticLink",
);
same(
  publicApi.materializeV013HierarchicalCarrierFromSemanticLink,
  internalMaterializeV013HierarchicalCarrierFromSemanticLink,
  "materializeV013HierarchicalCarrierFromSemanticLink",
);
same(
  publicApi.serializeV013HierarchicalCarrier,
  internalSerializeV013HierarchicalCarrier,
  "serializeV013HierarchicalCarrier",
);
same(
  publicApi.materializeV013HierarchicalCarrier,
  internalMaterializeV013HierarchicalCarrier,
  "materializeV013HierarchicalCarrier",
);

// Semantic writes remain authority-consuming boundaries. Public consumers may
// submit already-built source/Rule/Theory evidence, but do not gain producer
// authority merely by importing the package facade.
same(
  publicApi.V013RelativeFormMaterializationError,
  InternalV013RelativeFormMaterializationError,
  "V013RelativeFormMaterializationError",
);
same(
  publicApi.materializeAuthorizedRelativeUnaryFormSource,
  internalMaterializeAuthorizedRelativeUnaryFormSource,
  "materializeAuthorizedRelativeUnaryFormSource",
);
same(
  publicApi.materializeAuthorizedBinaryLinkSource,
  internalMaterializeAuthorizedBinaryLinkSource,
  "materializeAuthorizedBinaryLinkSource",
);
same(
  publicApi.V013RelativePoleExecutionError,
  InternalV013RelativePoleExecutionError,
  "V013RelativePoleExecutionError",
);
same(
  publicApi.executeAuthorizedRelativePoleSource,
  internalExecuteAuthorizedRelativePoleSource,
  "executeAuthorizedRelativePoleSource",
);
same(
  publicApi.V013FormalAspectEvaluationError,
  InternalV013FormalAspectEvaluationError,
  "V013FormalAspectEvaluationError",
);
same(
  publicApi.evaluateV013FormalAspectProgram,
  internalEvaluateV013FormalAspectProgram,
  "evaluateV013FormalAspectProgram",
);

// Keep implementation vocabulary internal. In particular, a package consumer
// must not bypass source/Rule authority by importing a low-level context builder
// or gain the authority to mutate Dictionary/Theory admission state.
for (const internalOnly of [
  "materializeRelativePoleContext",
  "readRelativePoleContext",
  "readRelativeUnaryForm",
  "defineDictionaryScope",
  "defineDictionaryEffect",
  "defineStructuralRoleDictionary",
  "defineStructuralRule",
  "admitStructuralRule",
  "defineStructuralInterpreter",
  "defineActHeader",
  "defineActField",
  "buildV012SelectedSourceEvidence",
] as const) {
  assert(!(internalOnly in publicApi), `${internalOnly} remains internal producer vocabulary`);
}

console.log(
  "MTS v0.13 public consumer facade: carrier/read + evidence-authorized write/evaluation boundary is explicit; producer authority remains internal: GREEN.",
);
