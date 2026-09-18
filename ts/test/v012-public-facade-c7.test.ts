// mts-version-evidence: required-from=0.12
import * as publicApi from "../src/public.js";
import {
  QuaternaryAnumError as InternalQuaternaryAnumError,
  materializeQuaternaryAnum as internalMaterializeQuaternaryAnum,
  materializeQuaternaryAnumTarget as internalMaterializeQuaternaryAnumTarget,
  resolveQuaternaryAnum as internalResolveQuaternaryAnum,
  serializeMaterializedQuaternaryAnum as internalSerializeMaterializedQuaternaryAnum,
} from "../src/quaternary-anum.js";
import {
  V012StringAnumError as InternalV012StringAnumError,
  materializeV012StringAnum as internalMaterializeV012StringAnum,
  materializeV012StringByteAnum as internalMaterializeV012StringByteAnum,
  readV012StringAnum as internalReadV012StringAnum,
  readV012StringByteAnum as internalReadV012StringByteAnum,
  serializeV012StringAnum as internalSerializeV012StringAnum,
} from "../src/v012-string-anum.js";
import {
  materializeV012SourceContent as internalMaterializeV012SourceContent,
  readV012SourceContent as internalReadV012SourceContent,
  replayV012SelectedSourceEvidence as internalReplayV012SelectedSourceEvidence,
} from "../src/v012-source.js";
import {
  SourceError as InternalSourceError,
} from "../src/source.js";
import {
  StructuralRuleError as InternalStructuralRuleError,
  replayStructuralRule as internalReplayStructuralRule,
} from "../src/structural-rule.js";

import type {
  MaterializedQuaternaryAnum,
  QuaternaryAnumHierarchy,
  QuaternaryAnumItem,
  ReadV012StringAnum,
  SourceFrontEndEvidence,
  StructuralRuleReplayEvidence,
  StructuralRuleReplayResult,
  V012SourceContent,
} from "../src/public.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.12 C7 public facade: ${message}`);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: exported operation is not the kernel operation`);
}

// Type-only references make the intended consumer evidence surface compile.
type PublicEvidenceSurface = readonly [
  MaterializedQuaternaryAnum,
  QuaternaryAnumHierarchy,
  QuaternaryAnumItem,
  ReadV012StringAnum,
  V012SourceContent,
  SourceFrontEndEvidence,
  StructuralRuleReplayEvidence,
  StructuralRuleReplayResult,
];
const typeSurfaceExists: PublicEvidenceSurface | undefined = undefined;
void typeSurfaceExists;

same(publicApi.QuaternaryAnumError, InternalQuaternaryAnumError, "QuaternaryAnumError");
same(publicApi.materializeQuaternaryAnum, internalMaterializeQuaternaryAnum, "materializeQuaternaryAnum");
same(publicApi.serializeMaterializedQuaternaryAnum, internalSerializeMaterializedQuaternaryAnum, "serializeMaterializedQuaternaryAnum");
same(publicApi.resolveQuaternaryAnum, internalResolveQuaternaryAnum, "resolveQuaternaryAnum");
same(publicApi.materializeQuaternaryAnumTarget, internalMaterializeQuaternaryAnumTarget, "materializeQuaternaryAnumTarget");

same(publicApi.V012StringAnumError, InternalV012StringAnumError, "V012StringAnumError");
same(publicApi.materializeV012StringByteAnum, internalMaterializeV012StringByteAnum, "materializeV012StringByteAnum");
same(publicApi.materializeV012StringAnum, internalMaterializeV012StringAnum, "materializeV012StringAnum");
same(publicApi.serializeV012StringAnum, internalSerializeV012StringAnum, "serializeV012StringAnum");
same(publicApi.readV012StringByteAnum, internalReadV012StringByteAnum, "readV012StringByteAnum");
same(publicApi.readV012StringAnum, internalReadV012StringAnum, "readV012StringAnum");

same(publicApi.SourceError, InternalSourceError, "SourceError");
same(publicApi.materializeV012SourceContent, internalMaterializeV012SourceContent, "materializeV012SourceContent");
same(publicApi.readV012SourceContent, internalReadV012SourceContent, "readV012SourceContent");
same(publicApi.replayV012SelectedSourceEvidence, internalReplayV012SelectedSourceEvidence, "replayV012SelectedSourceEvidence");

same(publicApi.StructuralRuleError, InternalStructuralRuleError, "StructuralRuleError");
same(publicApi.replayStructuralRule, internalReplayStructuralRule, "replayStructuralRule");

// C7 exposes consumer carrier/replay operations, not the fixture/authority
// construction vocabulary that produced the completion witnesses.
for (const internalOnly of [
  "buildV012SelectedSourceEvidence",
  "defineDictionaryScope",
  "defineDictionaryEffect",
  "defineStructuralRule",
  "admitStructuralRule",
  "defineActHeader",
  "defineActField",
] as const) {
  assert(!(internalOnly in publicApi), `${internalOnly} remains internal producer vocabulary`);
}

console.log("MTS v0.12 C7 public consumer facade: GREEN.");
