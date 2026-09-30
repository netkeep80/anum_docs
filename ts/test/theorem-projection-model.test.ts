import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

import {
  buildTheoremProjectionModel,
  loadRepositoryTheoremProjectionModel,
  loadRepositoryTheoremProjectionSources,
} from "../src/tooling/theorem-projection-model.js";

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

  assert.equal(first.schema, "mts-theorem-projection-model/v0.1");
  assert.equal(first.mtsVersion, "v0.14");
  assert.equal(first.sourceInventory, "theorems/current-v0.14.json");
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
  assert.equal(
    fnd02.evidence.mtsNative.length,
    0,
    "kernel realization is not fabricated into an mtsNative evidence record",
  );

  const fnd01 = first.theorems.find((theorem) => theorem.id === "FND-01");
  assert.ok(fnd01);
  assert.equal(
    fnd01.nativeAssurance,
    null,
    "native assurance must not be inferred from TypeScript or file naming",
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

  console.log("THEOREM_PROJECTION_MODEL = COMPLETE_CURRENT_INVENTORY");
  console.log("LEAN_ROCQ_ROLE = EXTERNAL_CROSS_CHECK");
  console.log("MTS_NATIVE_ROLE = NATIVE_PROOF_AUTHORITY_FROM_ASSURANCE");
  console.log("TYPESCRIPT_ROLE = EXECUTABLE_WITNESS_ONLY");
  console.log("MARKDOWN_AUTHORITY = NONE");
  console.log("accepted semantic delta = NONE");
}

main();
