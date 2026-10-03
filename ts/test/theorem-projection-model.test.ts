import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildTheoremProjectionModel,
  loadRepositoryTheoremProjectionModel,
  loadRepositoryTheoremProjectionSources,
} from "../src/tooling/theorem-projection-model.js";
// T1 RED: the normalized model module intentionally lands after this consumer.
function repositoryRoot(): string {
  const candidates = [resolve(process.cwd(), ".."), process.cwd()];
  const root = candidates.find((candidate) =>
    existsSync(resolve(candidate, "theorems", "current-v0.14.json")),
  );
  if (root === undefined) throw new Error("theorem projection repository root not found");
  return root;
}
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
function expectReject(effect: () => unknown, pattern: RegExp, label: string): void {
  try {
    effect();
  } catch (error) {
    assert(error instanceof Error, `${label}: expected Error`);
    assert.match(error.message, pattern, label);
    return;
  }
  throw new Error(`${label}: expected rejection`);
}
function main(): void {
  const root = repositoryRoot();
  const sources = loadRepositoryTheoremProjectionSources(root);
  const first = buildTheoremProjectionModel(sources);
  const second = loadRepositoryTheoremProjectionModel(root);
  assert.deepEqual(second, first, "repository loader and pure builder must agree");
  assert.equal(
    JSON.stringify(loadRepositoryTheoremProjectionModel(root)),
    JSON.stringify(first),
    "projection model must be byte-deterministic under repeated load",
  );
  assert.equal(first.schema, "mts-theorem-projection-model/v0.4");
  assert.equal(first.mtsVersion, "v0.14");
  assert.equal(first.sourceInventory, "theorems/current-v0.14.json");
  assert.equal(first.formalOverlay, "theorems/formal-v0.15.json");
  assert.equal(first.formalCandidateVersion, "v0.15-candidate");
  assert.equal(first.theorems.length, 21);
  const sourceIds = sources.currentIndex.theorems.map((theorem: any) => theorem.id);
  assert.deepEqual(
    first.theorems.map((theorem) => theorem.id),
    sourceIds,
    "theorem ordering follows the current theorem inventory",
  );
  assert.equal(first.lanes.typescript.role, "executable-witness");
  assert.equal(first.lanes.typescript.proofAuthority, "none");
  assert.equal(first.lanes.lean4.role, "external-cross-check");
  assert.equal(first.lanes.lean4.proofAuthority, "external-only");
  assert.equal(first.lanes.coq.role, "external-cross-check");
  assert.equal(first.lanes.mtsNative.role, "native-proof");
  assert.equal(
    first.lanes.mtsNative.proofAuthority,
    "native-replay-under-exact-theory",
  );
  assert.equal(first.lanes.aprover.role, "independent-consumer-replay");
  for (const theorem of first.theorems) {
    const source = sources.currentIndex.theorems.find(
      (candidate: any) => candidate.id === theorem.id,
    );
    assert.ok(source, `missing source theorem ${theorem.id}`);
    assert.equal(theorem.statement, source.statement);
    assert.deepEqual(theorem.lawRefs, source.lawRefs);
    assert.deepEqual(theorem.assumptions, source.assumptions);
    assert.deepEqual(theorem.formalPremises, source.formalPremises);
    assert.deepEqual(theorem.dependsOn, source.dependsOn);
    assert.deepEqual(theorem.scope, source.scope);
    assert.deepEqual(theorem.exclusions, source.exclusions);
  }
  const fnd07 = first.theorems.find((theorem) => theorem.id === "FND-07");
  assert.ok(fnd07);
  assert.equal(
    fnd07.nativeAssurance?.classification,
    "DERIVED_CLOSED_PROOF_ANET",
  );
  assert.equal(fnd07.nativeAssurance?.independent, true);
  assert.equal(fnd07.evidence.mtsNative.length, 1);
  assert.equal(fnd07.evidence.mtsNative[0]?.kind, "evidence-record");
  assert.equal(fnd07.evidence.mtsNative[0]?.role, "native-proof");
  assert.equal(
    fnd07.evidence.mtsNative[0]?.proofAuthority,
    "native-replay-under-exact-theory",
  );
  assert.equal(fnd07.evidence.mtsNative[0]?.record?.authority, "native-replay");
  assert.equal(fnd07.evidence.mtsNative[0]?.record?.result, "accepted");
  assert.equal(fnd07.evidence.lean4.length, 1);
  assert.equal(fnd07.evidence.lean4[0]?.role, "external-cross-check");
  assert.equal(fnd07.evidence.lean4[0]?.proofAuthority, "external-only");
  assert.equal(
    fnd07.evidence.lean4[0]?.record?.authority,
    "external-cross-check",
  );
  assert.equal(fnd07.evidence.lean4[0]?.record?.result, "proved");
  assert.equal(fnd07.evidence.typescript.length, 1);
  assert.equal(fnd07.evidence.typescript[0]?.kind, "executable-witness");
  assert.equal(fnd07.evidence.typescript[0]?.role, "executable-witness");
  assert.equal(fnd07.evidence.typescript[0]?.proofAuthority, "none");
  assert.equal(fnd07.evidence.typescript[0]?.record, undefined);
  assert.equal(fnd07.formalV015.migrationStatus, "FORMAL_MIGRATED");
  assert.equal(fnd07.formalV015.proofClosure, "CLOSED");
  assert.equal(
    fnd07.formalV015.formalStatement,
    "FND07_STATEMENT : TARGET_PREMISES->TARGET_CONCLUSION",
  );
  assert.deepEqual(fnd07.formalV015.formalPremises, ["TARGET_P1", "TARGET_P2"]);
  assert.equal(
    fnd07.formalV015.formalSourcePath,
    "ts/test/v015-fnd07-ordinary-formal-proof-p2.test.ts",
  );
  assert.equal(fnd07.formalV015.aproverStatus, "NOT_RECORDED");

  const fnd08 = first.theorems.find((theorem) => theorem.id === "FND-08");
  assert.ok(fnd08);
  assert.equal(fnd08.formalV015.migrationStatus, "FORMAL_MIGRATED");
  assert.equal(fnd08.formalV015.proofClosure, "OPEN_CONDITIONAL");
  assert.deepEqual(fnd08.formalV015.formalPremises, ["G_SEM", "G_BOUNDARY"]);

  const fnd09 = first.theorems.find((theorem) => theorem.id === "FND-09");
  assert.ok(fnd09);
  assert.equal(fnd09.formalV015.migrationStatus, "FORMAL_MIGRATED");
  assert.equal(fnd09.formalV015.proofClosure, "OPEN_CONDITIONAL");
  assert.deepEqual(fnd09.formalV015.formalPremises, ["G_SEM"]);

  assert.deepEqual(
    fnd07.externalAssurance,
    sources.externalAssurance.targets.find((target: any) => target.id === "FND-07"),
    "FND-07 external assurance names are authority sourced",
  );
  const fnd02 = first.theorems.find((theorem) => theorem.id === "FND-02");
  assert.ok(fnd02);
  assert.equal(
    fnd02.nativeAssurance?.classification,
    "KERNEL_REALIZED_NOT_INDEPENDENT",
  );
  assert.equal(fnd02.nativeAssurance?.independent, false);
  assert.equal(fnd02.formalV015.migrationStatus, "FORMAL_MIGRATED");
  assert.equal(fnd02.formalV015.proofClosure, "N_A_FOR_KERNEL_REALIZATION");
  assert.equal(
    fnd02.formalV015.formalStatement,
    "FND02_STATEMENT : FND02_PREMISES->FND02_RULE",
  );
  assert.deepEqual(fnd02.formalV015.formalPremises, ["A1RecursiveSeparation"]);
  assert.deepEqual(fnd02.formalV015.formalDomain, ["X : Link"]);
  assert.deepEqual(
    fnd02.formalV015.formalNonPremises,
    ["Grounded(X)", "F2/F3 normalization", "FND-13"],
  );
  assert.equal(
    fnd02.formalV015.nativeClassification,
    "KERNEL_REALIZED_NOT_INDEPENDENT",
  );
  assert.equal(
    fnd02.formalV015.kernelLaw,
    "recursive-link-identity/full-full-canonical-root-base",
  );
  assert.equal(fnd02.formalV015.nativeIndependent, false);
  assert.equal(fnd02.formalV015.aproverStatus, "NOT_RECORDED");
  assert.equal(
    fnd02.evidence.mtsNative.length,
    0,
    "kernel realization is not fabricated into an mtsNative evidence record",
  );

  const fnd13 = first.theorems.find((theorem) => theorem.id === "FND-13");
  assert.ok(fnd13);
  assert.equal(
    fnd13.nativeAssurance?.classification,
    "KERNEL_REALIZED_NOT_INDEPENDENT",
  );
  assert.equal(fnd13.nativeAssurance?.independent, false);
  assert.equal(fnd13.formalV015.migrationStatus, "FORMAL_MIGRATED");
  assert.equal(fnd13.formalV015.proofClosure, "N_A_FOR_KERNEL_REALIZATION");
  assert.equal(
    fnd13.formalV015.formalStatement,
    "FND13_STATEMENT : FND13_PREMISES->FND13_RULES",
  );
  assert.deepEqual(
    fnd13.formalV015.formalPremises,
    ["F2F3GroundedNormalization", "Grounded:x", "Grounded:y"],
  );
  assert.deepEqual(fnd13.formalV015.formalDomain, ["x : Link", "y : Link"]);
  assert.deepEqual(
    fnd13.formalV015.formalNonPremises,
    ["FND-02", "F2F3Normalization", "arbitrary non-grounded Link extensionality"],
  );
  assert.equal(
    fnd13.formalV015.nativeClassification,
    "KERNEL_REALIZED_NOT_INDEPENDENT",
  );
  assert.equal(
    fnd13.formalV015.kernelLaw,
    "recursive-link-identity/ordered-pole-grounded-closure",
  );
  assert.equal(fnd13.formalV015.nativeIndependent, false);
  assert.equal(fnd13.formalV015.aproverStatus, "NOT_RECORDED");
  assert.equal(
    fnd13.evidence.mtsNative.length,
    0,
    "FND-13 kernel realization is not fabricated into an mtsNative evidence record",
  );

  const exe02 = first.theorems.find((theorem) => theorem.id === "EXE-02");
  assert.ok(exe02);
  assert.equal(exe02.nativeAssurance, null);
  assert.equal(exe02.formalV015.migrationStatus, "FORMAL_MIGRATED");
  assert.equal(exe02.formalV015.proofClosure, "NO_PROOF_ARTIFACT");
  assert.equal(
    exe02.formalV015.formalStatement,
    "EXE02_STATEMENT : EXE02_PREMISES->EXE02_CLAUSES",
  );
  assert.deepEqual(exe02.formalV015.formalPremises, []);
  assert.deepEqual(
    exe02.formalV015.formalDomain,
    ["a : Link", "a' : Link", "b : Link", "b' : Link", "x : Link", "y : Link", "c : Link", "d : Link"],
  );
  assert.deepEqual(
    exe02.formalV015.formalNonPremises,
    ["FND-13", "Grounded", "Memory handle/object identity"],
  );
  assert.equal(exe02.formalV015.nativeClassification, null);
  assert.equal(exe02.formalV015.kernelLaw, null);
  assert.equal(exe02.formalV015.nativeIndependent, null);
  assert.equal(exe02.formalV015.aproverStatus, "NOT_RECORDED");
  assert.equal(exe02.evidence.mtsNative.length, 0);
  assert.equal(exe02.evidence.aprover.length, 0);

  const fnd01 = first.theorems.find((theorem) => theorem.id === "FND-01");
  assert.ok(fnd01);
  assert.equal(
    fnd01.nativeAssurance,
    null,
    "native assurance must not be inferred from TypeScript or file naming",
  );
  assert.equal(fnd01.formalV015.migrationStatus, "NOT_MIGRATED");
  assert.equal(fnd01.formalV015.formalStatement, null);
  assert.deepEqual(fnd01.formalV015.formalPremises, []);
  assert.deepEqual(fnd01.formalV015.formalDomain, []);
  assert.deepEqual(fnd01.formalV015.formalNonPremises, []);
  assert.equal(fnd01.formalV015.nativeClassification, null);
  assert.equal(fnd01.formalV015.kernelLaw, null);
  assert.equal(fnd01.formalV015.nativeIndependent, null);

  const fnd02OverlayIndex = sources.formalOverlay.entries.findIndex(
    (entry: any) => entry.id === "FND-02",
  );
  assert.notEqual(fnd02OverlayIndex, -1);

  const badKernelClassification = clone(sources);
  badKernelClassification.formalOverlay.entries[fnd02OverlayIndex].nativeClassification =
    "DERIVED_CLOSED_PROOF_ANET";
  expectReject(
    () => buildTheoremProjectionModel(badKernelClassification),
    /FORMAL\/native classification mismatch.*FND-02/i,
    "kernel classification mismatch",
  );

  const badKernelLaw = clone(sources);
  badKernelLaw.formalOverlay.entries[fnd02OverlayIndex].kernelLaw = "forged/kernel-law";
  expectReject(
    () => buildTheoremProjectionModel(badKernelLaw),
    /FORMAL\/native kernel law mismatch.*FND-02/i,
    "kernel law mismatch",
  );

  const badKernelIndependence = clone(sources);
  badKernelIndependence.formalOverlay.entries[fnd02OverlayIndex].nativeIndependent = true;
  expectReject(
    () => buildTheoremProjectionModel(badKernelIndependence),
    /FORMAL\/native independence mismatch.*FND-02/i,
    "kernel independence mismatch",
  );

  const falseClosedKernel = clone(sources);
  falseClosedKernel.formalOverlay.entries[fnd02OverlayIndex].proofClosure = "CLOSED";
  expectReject(
    () => buildTheoremProjectionModel(falseClosedKernel),
    /KERNEL_REALIZED_NOT_INDEPENDENT cannot be represented as CLOSED/i,
    "kernel realization cannot become CLOSED",
  );

  for (const forbiddenPremise of ["Grounded(X)", "F2/F3 normalization", "FND-13"]) {
    const badPremise = clone(sources);
    badPremise.formalOverlay.entries[fnd02OverlayIndex].formalPremises.push(forbiddenPremise);
    expectReject(
      () => buildTheoremProjectionModel(badPremise),
      /kernel-realized FORMAL premises must match accepted theorem boundary/i,
      `forbidden FND-02 premise ${forbiddenPremise}`,
    );
  }

  const missingA1 = clone(sources);
  missingA1.formalOverlay.entries[fnd02OverlayIndex].formalPremises = [];
  expectReject(
    () => buildTheoremProjectionModel(missingA1),
    /kernel-realized FORMAL premises must match accepted theorem boundary/i,
    "missing FND-02 A1 premise",
  );

  const forgedAproverAccept = clone(sources);
  forgedAproverAccept.formalOverlay.entries[fnd02OverlayIndex].aproverStatus = "ACCEPT";
  expectReject(
    () => buildTheoremProjectionModel(forgedAproverAccept),
    /aprover ACCEPT requires registered aprover evidence/i,
    "aprover ACCEPT without evidence",
  );

  const fnd13OverlayIndex = sources.formalOverlay.entries.findIndex(
    (entry: any) => entry.id === "FND-13",
  );
  assert.notEqual(fnd13OverlayIndex, -1);

  const fnd13GlobalNormalization = clone(sources);
  fnd13GlobalNormalization.formalOverlay.entries[fnd13OverlayIndex].formalPremises[0] =
    "F2F3Normalization";
  expectReject(
    () => buildTheoremProjectionModel(fnd13GlobalNormalization),
    /kernel-realized FORMAL premises must match accepted theorem boundary/i,
    "FND-13 global normalization must not replace grounded normalization",
  );

  const fnd13MissingGroundedX = clone(sources);
  fnd13MissingGroundedX.formalOverlay.entries[fnd13OverlayIndex].formalPremises =
    fnd13MissingGroundedX.formalOverlay.entries[fnd13OverlayIndex].formalPremises.filter(
      (premise: string) => premise !== "Grounded:x",
    );
  expectReject(
    () => buildTheoremProjectionModel(fnd13MissingGroundedX),
    /kernel-realized FORMAL premises must match accepted theorem boundary/i,
    "FND-13 missing Grounded:x",
  );

  const fnd13MissingGroundedY = clone(sources);
  fnd13MissingGroundedY.formalOverlay.entries[fnd13OverlayIndex].formalPremises =
    fnd13MissingGroundedY.formalOverlay.entries[fnd13OverlayIndex].formalPremises.filter(
      (premise: string) => premise !== "Grounded:y",
    );
  expectReject(
    () => buildTheoremProjectionModel(fnd13MissingGroundedY),
    /kernel-realized FORMAL premises must match accepted theorem boundary/i,
    "FND-13 missing Grounded:y",
  );

  const fnd13FakeDependency = clone(sources);
  fnd13FakeDependency.formalOverlay.entries[fnd13OverlayIndex].formalPremises.push("FND-02");
  expectReject(
    () => buildTheoremProjectionModel(fnd13FakeDependency),
    /kernel-realized FORMAL premises must match accepted theorem boundary/i,
    "FND-13 must not acquire FND-02 premise",
  );

  const fnd13FalseClosed = clone(sources);
  fnd13FalseClosed.formalOverlay.entries[fnd13OverlayIndex].proofClosure = "CLOSED";
  expectReject(
    () => buildTheoremProjectionModel(fnd13FalseClosed),
    /KERNEL_REALIZED_NOT_INDEPENDENT cannot be represented as CLOSED/i,
    "FND-13 kernel realization cannot become CLOSED",
  );

  const fnd13BadKernelLaw = clone(sources);
  fnd13BadKernelLaw.formalOverlay.entries[fnd13OverlayIndex].kernelLaw =
    "recursive-link-identity/full-full-canonical-root-base";
  expectReject(
    () => buildTheoremProjectionModel(fnd13BadKernelLaw),
    /FORMAL\/native kernel law mismatch.*FND-13/i,
    "FND-13 kernel law mismatch",
  );

  const fnd13FalseIndependent = clone(sources);
  fnd13FalseIndependent.formalOverlay.entries[fnd13OverlayIndex].nativeIndependent = true;
  expectReject(
    () => buildTheoremProjectionModel(fnd13FalseIndependent),
    /FORMAL\/native independence mismatch.*FND-13/i,
    "FND-13 false independent native proof",
  );

  const fnd13ForgedAprover = clone(sources);
  fnd13ForgedAprover.formalOverlay.entries[fnd13OverlayIndex].aproverStatus = "ACCEPT";
  expectReject(
    () => buildTheoremProjectionModel(fnd13ForgedAprover),
    /aprover ACCEPT requires registered aprover evidence/i,
    "FND-13 aprover ACCEPT without evidence",
  );

  const exe02OverlayIndex = sources.formalOverlay.entries.findIndex(
    (entry: any) => entry.id === "EXE-02",
  );
  assert.notEqual(exe02OverlayIndex, -1);

  const exe02FalseClosed = clone(sources);
  exe02FalseClosed.formalOverlay.entries[exe02OverlayIndex].proofClosure = "CLOSED";
  expectReject(
    () => buildTheoremProjectionModel(exe02FalseClosed),
    /CLOSED FORMAL proof requires registered mtsNative evidence/i,
    "EXE-02 cannot become CLOSED without native evidence",
  );

  const exe02FalseOpen = clone(sources);
  exe02FalseOpen.formalOverlay.entries[exe02OverlayIndex].proofClosure = "OPEN_CONDITIONAL";
  expectReject(
    () => buildTheoremProjectionModel(exe02FalseOpen),
    /OPEN_CONDITIONAL requires at least one formal premise/i,
    "EXE-02 zero-premise statement is not an OPEN conditional proof artifact",
  );

  for (const forbiddenPremise of ["FND-13", "Grounded", "Memory handle/object identity"]) {
    const badPremise = clone(sources);
    badPremise.formalOverlay.entries[exe02OverlayIndex].formalPremises.push(forbiddenPremise);
    expectReject(
      () => buildTheoremProjectionModel(badPremise),
      /statement-only FORMAL premises must match accepted theorem boundary/i,
      `EXE-02 forbidden premise ${forbiddenPremise}`,
    );
  }

  const exe02FakeKernel = clone(sources);
  exe02FakeKernel.formalOverlay.entries[exe02OverlayIndex].nativeClassification =
    "KERNEL_REALIZED_NOT_INDEPENDENT";
  exe02FakeKernel.formalOverlay.entries[exe02OverlayIndex].kernelLaw =
    "recursive-link-identity/ordered-pole-grounded-closure";
  exe02FakeKernel.formalOverlay.entries[exe02OverlayIndex].nativeIndependent = false;
  expectReject(
    () => buildTheoremProjectionModel(exe02FakeKernel),
    /FORMAL native classification for EXE-02 has no native assurance authority/i,
    "EXE-02 cannot invent kernel realization",
  );

  const exe02ForgedAprover = clone(sources);
  exe02ForgedAprover.formalOverlay.entries[exe02OverlayIndex].aproverStatus = "ACCEPT";
  expectReject(
    () => buildTheoremProjectionModel(exe02ForgedAprover),
    /NO_PROOF_ARTIFACT cannot claim aprover evidence|aprover ACCEPT requires registered aprover evidence/i,
    "EXE-02 aprover ACCEPT without evidence",
  );

  for (const theorem of first.theorems) {
    for (const lane of ["typescript", "lean4", "coq", "mtsNative", "aprover"] as const) {
      for (const evidence of theorem.evidence[lane]) {
        assert(
          sources.availablePaths.includes(evidence.path),
          `${theorem.id}/${lane}: registered path must exist`,
        );
        if (evidence.record !== undefined) {
          for (const artifact of evidence.record.artifacts) {
            assert(
              sources.availablePaths.includes(artifact.path),
              `${theorem.id}/${lane}: artifact path must exist`,
            );
          }
        }
      }
    }
  }
  const badDependency = clone(sources);
  badDependency.currentIndex.theorems.find((theorem: any) => theorem.id === "FND-07").dependsOn = [
    "FND-999",
  ];
  expectReject(
    () => buildTheoremProjectionModel(badDependency),
    /unresolved theorem dependency.*FND-07.*FND-999/i,
    "unresolved dependency",
  );
  const badLaw = clone(sources);
  badLaw.currentIndex.theorems.find((theorem: any) => theorem.id === "FND-07").lawRefs = [
    "V14-L999",
  ];
  expectReject(
    () => buildTheoremProjectionModel(badLaw),
    /unresolved accepted law.*FND-07.*V14-L999/i,
    "unresolved lawRef",
  );
  const badNativeRecord = clone(sources);
  const nativePath = "proofs/evidence/FND-07/mtsNative.json";
  badNativeRecord.evidenceRecords[nativePath].theoremId = "FND-08";
  expectReject(
    () => buildTheoremProjectionModel(badNativeRecord),
    /evidence theorem mismatch.*FND-07.*FND-08/i,
    "evidence theorem mismatch",
  );
  const badExternal = clone(sources);
  badExternal.currentIndex.theorems.find(
    (theorem: any) => theorem.id === "FND-07",
  ).externalAssurance.lean4 = [];
  expectReject(
    () => buildTheoremProjectionModel(badExternal),
    /external assurance mismatch.*FND-07/i,
    "external assurance mismatch",
  );
  const missingNativeAssurance = clone(sources);
  missingNativeAssurance.nativeAssurance.targets =
    missingNativeAssurance.nativeAssurance.targets.filter(
      (target: any) => target.id !== "FND-07",
    );
  expectReject(
    () => buildTheoremProjectionModel(missingNativeAssurance),
    /mtsNative evidence.*FND-07.*native assurance/i,
    "mtsNative requires native assurance",
  );
  const missingRecord = clone(sources);
  delete missingRecord.evidenceRecords[nativePath];
  expectReject(
    () => buildTheoremProjectionModel(missingRecord),
    /missing evidence record.*mtsNative\.json/i,
    "missing evidence record",
  );
  const missingPath = clone(sources);
  missingPath.availablePaths = missingPath.availablePaths.filter(
    (path: string) => path !== nativePath,
  );
  expectReject(
    () => buildTheoremProjectionModel(missingPath),
    /registered path does not exist.*mtsNative\.json/i,
    "missing registered path",
  );
  const duplicateOverlay = clone(sources);
  duplicateOverlay.formalOverlay.entries.push(
    clone(duplicateOverlay.formalOverlay.entries[0]),
  );
  expectReject(
    () => buildTheoremProjectionModel(duplicateOverlay),
    /duplicate theorem FND-07/i,
    "duplicate FORMAL overlay theorem",
  );

  const foreignOverlay = clone(sources);
  foreignOverlay.formalOverlay.entries[0].id = "FND-999";
  expectReject(
    () => buildTheoremProjectionModel(foreignOverlay),
    /non-current theorem FND-999/i,
    "foreign FORMAL overlay theorem",
  );

  const missingFormalSource = clone(sources);
  missingFormalSource.formalOverlay.entries[0].formalSourcePath =
    "ts/test/does-not-exist.test.ts";
  expectReject(
    () => buildTheoremProjectionModel(missingFormalSource),
    /formalSourcePath does not exist/i,
    "missing FORMAL source",
  );

  const authorityEscalation = clone(sources);
  authorityEscalation.formalOverlay.authority = "proof-authority";
  expectReject(
    () => buildTheoremProjectionModel(authorityEscalation),
    /must not claim proof authority/i,
    "FORMAL overlay authority escalation",
  );

  console.log("THEOREM_PROJECTION_MODEL = COMPLETE_CURRENT_INVENTORY");
  console.log("LEAN_ROCQ_ROLE = EXTERNAL_CROSS_CHECK");
  console.log("MTS_NATIVE_ROLE = NATIVE_PROOF_AUTHORITY_FROM_ASSURANCE");
  console.log("TYPESCRIPT_ROLE = EXECUTABLE_WITNESS_ONLY");
  console.log("MARKDOWN_AUTHORITY = NONE");
  console.log("accepted semantic delta = NONE");
}
main();
