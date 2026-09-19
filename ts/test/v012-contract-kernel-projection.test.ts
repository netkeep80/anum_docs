import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.12 contract kernel projection: ${message}`);
}

const repoRoot = resolve(process.cwd(), "..");
const contract = JSON.parse(
  readFileSync(join(repoRoot, "contracts/mts-contract-v0.12.json"), "utf8"),
) as any;

// Lifecycle must not move merely because the paper projection catches up.
assert(contract.status === "candidate", "status remains candidate");
assert(contract.accepted === false, "candidate remains not accepted");
assert(contract.acceptanceReady === false, "candidate remains not ready");
assert(contract.implementation?.candidateRuntimeSelectable === false, "candidate remains non-selectable");
assert(contract.implementation?.publicFacade === "ts/src/public.ts", "public facade path remains explicit");
assert(contract.candidateState?.publicFacadeComplete === true, "C7 public facade is complete");
assert(contract.implementation?.implementationComplete === true, "candidate kernel implementation is complete");
assert(
  contract.implementation?.implementationCompleteMeaning ===
    "current-v0.12-candidate-kernel-scope-only; excludes C8 documentation, C9 readiness and C10 acceptance",
  "implementationComplete meaning is bounded to the candidate kernel scope",
);
assert(contract.candidateState?.documentationComplete === true, "C8 documentation is complete");
assert(contract.candidateState?.traceabilityComplete === true, "v0.12 traceability is complete");

// The live accepted v0.11 runtime is unchanged, while the v0.12 candidate
// kernel now contains executable behavior that must be projected honestly.
assert(contract.implementation?.productionBehaviorChanged === false, "accepted live runtime remains unchanged");
assert(contract.implementation?.candidateKernelBehaviorImplemented === true, "candidate kernel behavior is implemented");
assert(
  contract.implementation?.productionBehaviorChangedMeaning === "accepted-live-runtime-remains-v0.11",
  "productionBehaviorChanged meaning is explicit",
);

// Foundation: Anum is a Link role rooted locally at R; exact question/address
// and addressed answer/target are distinct.
assert(contract.anumProtocol?.anumIsSeparateEntity === false, "Anum is not a separate entity");
assert(contract.anumProtocol?.ontologyEntity === "Link", "Link remains the sole ontology entity");
assert(contract.anumProtocol?.everyLocalAnumStartsAt === "R", "every local Anum starts at R");
assert(contract.anumProtocol?.exactAnumEqualsAddressedTarget === false, "exact Anum differs from target");
assert(
  contract.anumProtocol?.readOutcomes?.join("|") === "UNINTERPRETABLE|NOT_FOUND|FOUND",
  "question understanding and answer presence remain distinct",
);

// Resolve and explicit writes are separate one-root-cut capabilities.
assert(contract.anumProtocol?.resolve?.rootCutDepth === 1, "Resolve removes exactly one leading R");
assert(contract.anumProtocol?.resolve?.readOnly === true, "Resolve is read-only");
assert(contract.anumProtocol?.resolve?.recursiveDereference === false, "Resolve is not recursive dereference");
assert(contract.anumProtocol?.resolve?.notFoundMaterializes === false, "NOT_FOUND never materializes");
assert(contract.anumProtocol?.addressMaterialization?.materializesTarget === false, "address materialization does not create target");
assert(contract.anumProtocol?.targetMaterialization?.rootCutDepth === 1, "target materialization is one root cut");
assert(contract.anumProtocol?.targetMaterialization?.recursiveDereference === false, "target materialization is not recursive");
assert(contract.anumProtocol?.targetMaterialization?.failClosedBeforeWrite === true, "invalid hierarchy fails before writes");
assert(contract.anumProtocol?.rootBasis?.verifiedAtQBoundary === true, "declared Q root basis is structurally verified");
assert(contract.anumProtocol?.rootBasis?.properOstensiveOCRelativeToR === true, "RootBasis requires proper O/C relative to R");
assert(contract.anumProtocol?.rootBasis?.verifiedAtStringReadBoundary === true, "STRING read validates RootBasis");
assert(contract.anumProtocol?.rootBasis?.verifiedAtSourceReadBoundary === true, "source read validates RootBasis");
assert(contract.anumProtocol?.rootBasis?.invalidBasisWrites === false, "invalid root basis writes nothing");

// v0.12 STRING is the self-carrying grouped-Q hierarchy, not Byte_v09.
assert(
  contract.stringAnumV012?.byteLaw === "Byte_v012(p)=Anum(bits8(p))=Resolve_Q([bits8(p)])",
  "v0.12 byte identity is the exact eight-bit Anum",
);
assert(contract.stringAnumV012?.historicalByteV09Reused === false, "Byte_v09 is not silently reused");
assert(contract.stringAnumV012?.groupedQTopLevelIsExactStringAnum === true, "grouped Q top level is exact STRING Anum");
assert(contract.stringAnumV012?.utf8GroupingRewritesCarrierTopology === false, "UTF-8 grouping does not rewrite carrier");
assert(contract.stringAnumV012?.malformedExactBytesMayBeUtf8Uninterpretable === true, "carrier validity differs from UTF-8 readability");
assert(contract.stringAnumV012?.glyphSpellingIsSemanticAuthority === false, "glyph spelling is not semantic authority");

// Exact source -> selected Use -> same-Theory admitted Rule -> result.
assert(contract.sourceAuthority?.exactSourceCarrier === "StringAnum_v012", "FORMAL source is carried by exact STRING Anum");
assert(contract.sourceAuthority?.dictionaryGrammarTheoryFixedBeforeCandidate === true, "D/G/T authority is fixed before candidate");
assert(contract.sourceAuthority?.candidateCanSelfAdmit === undefined, "ambiguous global self-admit claim is removed");
assert(contract.sourceAuthority?.independentlySelectedAuthorityRequired === true, "source authority is selected independently");
assert(contract.sourceAuthority?.dictionaryIdentitySelectedIndependently === true, "Dictionary identity is independently selected");
assert(contract.sourceAuthority?.grammarMembershipSelectedIndependently === true, "Grammar membership is independently selected");
assert(contract.sourceAuthority?.theoryMembershipSelectedIndependently === true, "Theory membership is independently selected");
assert(contract.sourceAuthority?.rawSourceReplayConfersAuthority === false, "raw source replay is not authority");
assert(contract.sourceAuthority?.rawRuleReplayConfersAuthority === false, "raw Rule replay is not authority");
assert(contract.sourceAuthority?.candidateCanSelfAdmitAtConsumerBoundary === false, "candidate cannot self-admit at consumer boundary");
assert(contract.sourceAuthority?.fixedTheoryArtifactRequired === true, "fixed Theory artifact is required");
assert(contract.sourceAuthority?.selectedActAttachmentBoundaryRequired === true, "finite selected Act evidence is required");
assert(contract.sourceAuthority?.sourceInterpreterAuthorityMustMatch === true, "source and Rule D/G/T authority must match");
assert(contract.sourceAuthority?.sourceUseBindingMustMatch === true, "source-selected Use must match Rule binding");
assert(contract.sourceAuthority?.lateAmbientActMutationChangesSelectedVerdict === false, "late unselected Act mutation does not change selected verdict");
assert(contract.sourceAuthority?.compositeConsumerVerifier === "replayV012SourceResultEvidence", "composite consumer verifier is explicit");
assert(contract.sourceAuthority?.ruleAdmissionUsesSameTheory === true, "Rule admission uses the same selected Theory");
assert(contract.sourceAuthority?.replayReadOnly === true, "authority replay is read-only");
assert(contract.sourceAuthority?.alternateWellFormedUseRejected === true, "alternate well-formed Use rejects");
assert(contract.sourceAuthority?.unadmittedRuleRejected === true, "unadmitted Rule rejects");
assert(contract.sourceAuthority?.wrongClaimedResultRejected === true, "wrong claimed result rejects");
assert(contract.sourceAuthority?.hostParserIsSemanticAuthority === false, "host parser is not authority");

assert(
  contract.requiredSemanticLaws?.rootBasisBoundary ===
    "Q and v0.12 STRING/source operations require a structurally valid declared R/O/C/L/U basis with proper O/C relative to R; invalid, collapsed, forged or foreign basis evidence fails closed and write operations perform zero writes",
  "RootBasis law reflects the adversarial boundary",
);
assert(
  contract.requiredSemanticLaws?.sourceUseAuthority ===
    "exact STRING source is replayed only against an independently selected V012SourceAuthority: exact Dictionary identity plus exact Grammar/Theory membership Links; raw membership shape is not semantic authority",
  "source authority law reflects independent selection",
);
assert(
  contract.requiredSemanticLaws?.formalResultAuthority ===
    "consumer source-to-result replay requires fixed Theory authority, selected finite Act attachments, matching Dictionary/Grammar/Theory, and equality between the source-selected Use and the selected Rule-role binding; candidate self-admission and late unselected ambient attachments do not gain authority",
  "formal result law reflects the composite consumer boundary",
);

// Mandatory foundation evidence is already projected in conformance; the
// version contract must now state that its foundation projection is current.
assert(contract.candidateState?.foundationReconciliationComplete === true, "foundation reconciliation is complete");
assert(contract.candidateState?.mandatoryKernelEvidenceProjected === true, "mandatory kernel evidence is projected");
assert(contract.candidateState?.contractDerivedFromKernelEvidence === true, "contract is derived from executable evidence");

// Old generic transport=false is now false information: Anum two-memory
// transport is mandatory evidence, while proof-transport delta remains deferred.
assert(contract.explicitlyDeferred?.transportInScope === undefined, "ambiguous old transportInScope field is removed");
assert(contract.explicitlyDeferred?.anumTwoMemoryTransportInScope === true, "Anum two-memory transport is in scope");
assert(contract.explicitlyDeferred?.proofTransportDeltaInScope === false, "proof transport delta remains deferred");
assert(contract.explicitlyDeferred?.cutDepthNCapabilityInScope === false, "CUT_DEPTH=N remains deferred");

console.log("MTS v0.12 contract derived from kernel/conformance: GREEN.");
