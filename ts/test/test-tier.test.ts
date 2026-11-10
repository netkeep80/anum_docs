import { verifyProjectOwnership as verifyProjectOwnershipImpl } from "./support/project-ownership.js";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { renderReaderW6 } from "../src/tooling/mts-reader-r44-w6.js";
import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { listRepositoryMarkdownSurface } from "../src/tooling/markdown-section-adapter.js";
import {
  buildTestTierPlan,
  runS18FixtureWitness,
  classifyTestPaths,
  selectTestTier,
} from "../src/tooling/test-tier.js";
import { THEOREM_CATALOG_PATH } from "../src/tooling/theorem-catalog-markdown.js";

// S11: witness the actual Reader W6 runtime file-read graph exactly once.
// This runs on the same tree as CURRENT and FULL; no precomputed claimed paths
// and no publication/semantic approval are inferred from draft material.
const readerRuntimeInputs = new Set<string>();
const realReadFileSync = fs.readFileSync;
const readerRepoRoot = resolve("..");
Object.defineProperty(fs, "readFileSync", {
  configurable: true,
  writable: true,
  value: (path: unknown, ...args: unknown[]) => {
    if (typeof path === "string") {
      const normalized = relative(readerRepoRoot, path).replaceAll("\\", "/");
      if ((normalized.startsWith("requirements/mts-source/") && normalized.endsWith(".yaml")) ||
          (normalized.startsWith("reviews/m06/") && normalized.endsWith(".txt")))
        readerRuntimeInputs.add(normalized);
    }
    return Reflect.apply(realReadFileSync, fs, [path, ...args]);
  },
});
syncBuiltinESMExports();
try {
  const renderedReader = renderReaderW6(readerRepoRoot);
  assert.equal(renderedReader.publication, "blocked");
  assert.ok(renderedReader.markdown.length > 1000);
} finally {
  Object.defineProperty(fs, "readFileSync", {
    configurable: true, writable: true, value: realReadFileSync,
  });
  syncBuiltinESMExports();
}
const verifiedReaderRuntimeInputs = [...readerRuntimeInputs];
const verifyProjectOwnership = (
  root: string, overrides: Readonly<Record<string, string>> = {},
) => verifyProjectOwnershipImpl(root, verifiedReaderRuntimeInputs, overrides);

// P7 project-ownership bridge: verify the artifact claims against present-tense consumers.
const p7CandidateWitness = verifyProjectOwnership(resolve(".."));
assert.equal(p7CandidateWitness.candidates, 6);
assert.equal(p7CandidateWitness.publicExportModules, 39);
assert.equal(p7CandidateWitness.proofEvidenceRecords, 43);
assert.equal(p7CandidateWitness.formalReplayResources, 21);
assert.equal(p7CandidateWitness.approvedSourceIntegrityResources, 6);
assert.equal(p7CandidateWitness.compiledProofSourceUnits, 16);
assert.equal(p7CandidateWitness.packageToolingEntrypoints, 4);
assert.equal(p7CandidateWitness.lineageToolingDependencies, 13);
assert.equal(p7CandidateWitness.publicationToolingDependencies, 28);
assert.equal(p7CandidateWitness.transitiveSourceDependencies, 16);
assert.equal(p7CandidateWitness.exactRelations, 539);
assert.equal(p7CandidateWitness.readerPreviewRuntimeYamlInputs, 43);
assert.equal(p7CandidateWitness.readerPreviewPinnedTranscriptions, 2);
assert.equal(p7CandidateWitness.readerPreviewLoaderModules, 23);
assert.equal(p7CandidateWitness.readerPreviewYamlInputs, 25);
assert.equal(p7CandidateWitness.observatorySources, 9);
assert.equal(p7CandidateWitness.observatoryExecutedTests, 11);
assert.equal(p7CandidateWitness.protectedHistoricalImages, 29);
assert.equal(p7CandidateWitness.currentDocumentationSurfaces, 12);

// S27: native source preservation is not a new independent proof claim.
// Reject missing project ownership, a forged active source pin and a broken
// present-tense theorem-catalog consumer without editing any frozen evidence.
const s27Root = resolve("..");
const s27OwnerPath = "requirements/project/MTS-PROJECT-PROOF-PROVENANCE-01.rg.yaml";
const s27Owner = readFileSync(resolve(s27Root, s27OwnerPath), "utf8");
const s27Witness = "ts/test/recursive-link-identity-proof.test.ts";
const s27Relation = "  - predicates: [requires]\n    target:\n      kind: artifact\n      path: " + s27Witness + "\n";
assert.ok(s27Owner.includes(s27Relation), "S27 exact typed witness is present");
assert.throws(() => verifyProjectOwnership(s27Root, {
  [s27OwnerPath]: s27Owner.replace(s27Relation, ""),
}), /S27|missing requires witness/, "S27 missing project ownership rejected");

const s27RecordPath = "proofs/native-proof-assurance.json";
const s27Record = readFileSync(resolve(s27Root, s27RecordPath), "utf8");
const s27PinnedSha = "e104f05033b4d46230b4f3f1d22d3773f2d0bd0f";
assert.ok(s27Record.includes(s27PinnedSha), "S27 FND-02/FND-13 exact pin present");
assert.throws(() => verifyProjectOwnership(s27Root, {
  [s27RecordPath]: s27Record.replaceAll(s27PinnedSha, "0".repeat(40)),
}), /S27 native proof source blob drift/,
"S27 altered native evidence source identity rejected");

const s27Fnd13Record = JSON.parse(s27Record) as any;
const s27Fnd13 = s27Fnd13Record.targets.find((v: any) => v.id === "FND-13");
assert.ok(s27Fnd13 && s27Fnd13.independent === false);
const s27Fnd13Evidence = s27Fnd13.evidence.find((v: any) =>
  v.path === "ts/test/v013-cyclic-grounding-boundary.test.ts");
assert.ok(s27Fnd13Evidence && /^[a-f0-9]{40}$/.test(s27Fnd13Evidence.gitBlobSha));
s27Fnd13Evidence.gitBlobSha = "0".repeat(40);
assert.throws(() => verifyProjectOwnership(s27Root, {
  [s27RecordPath]: JSON.stringify(s27Fnd13Record),
}), /S27 native proof source blob drift/,
"S27 forged FND-13 pin rejected");

const s27Escalated = JSON.parse(s27Record) as any;
s27Escalated.targets.find((v: any) => v.id === "FND-02").independent = true;
assert.throws(() => verifyProjectOwnership(s27Root, {
  [s27RecordPath]: JSON.stringify(s27Escalated),
}), /S27 FND-02\/FND-13 non-independent classification changed/,
"S27 independent proof authority escalation rejected");

const s27LoaderPath = "ts/src/tooling/theorem-projection-model.ts";
const s27Loader = readFileSync(resolve(s27Root, s27LoaderPath), "utf8");
assert.ok(s27Loader.includes('readJson(root, "proofs/native-proof-assurance.json")'));
assert.throws(() => verifyProjectOwnership(s27Root, {
  [s27LoaderPath]: s27Loader.replace('readJson(root, "proofs/native-proof-assurance.json")',
    'readJson(root, "proofs/native-proof-assurance.retired.json")'),
}), /S27 current theorem projection native provenance consumer changed/,
"S27 stale native source without present-tense consumer rejected");

// P7-S26: approved physical inputs require both an exact rooted Resource
// relation and an active integrity consumer with byte-exact SHA-256 evidence.
const s26Root = resolve("..");
const s26OwnerPath = "requirements/project/MTS-PROJECT-PROOF-PROVENANCE-01.rg.yaml";
const s26Owner = readFileSync(resolve(s26Root, s26OwnerPath), "utf8");
const s26Input = "formal/v0.15/regression/grounded-zero-role.formal";
const s26Clause = "  - predicates: [requires]\n    target:\n      kind: artifact\n      path: " + s26Input + "\n";
assert.ok(s26Owner.includes(s26Clause), "S26 exact approved source relation exists");
assert.throws(() => verifyProjectOwnership(s26Root, {
  [s26OwnerPath]: s26Owner.replace(s26Clause, ""),
}), /exact current FORMAL replay and approved SHA-256 source inputs/,
"S26 missing approved source relation rejected");

const s26ConsumerPath = "ts/test/v015-grounded-approved-source-integrity.test.ts";
const s26Consumer = readFileSync(resolve(s26Root, s26ConsumerPath), "utf8");
const s26Digest = "b0e5760786c900ab125f775f9f30d897336220ee2393f3c0e3fd5cff2296d51a";
assert.ok(s26Consumer.includes(s26Digest), "S26 approved SHA-256 pinned");
assert.throws(() => verifyProjectOwnership(s26Root, {
  [s26ConsumerPath]: s26Consumer.replace(s26Digest, "0".repeat(64)),
}), /S26 approved source SHA-256 drift/,
"S26 forged approved source hash rejected");
assert.throws(() => verifyProjectOwnership(s26Root, {
  [s26ConsumerPath]: s26Consumer.replace("readFileSync(resolve(repo, path))",
    'readFileSync(resolve(repo, path + ".missing"))'),
}), /S26 approved source hash-verifying consumer changed/,
"S26 disconnected approved source consumer rejected");

// S29: a cutover-pinned historical readiness witness has one exact lineage
// relation; it must never be promoted into a post-Author acceptance decision.
const s29Root = resolve("..");
const s29OwnerPath = "requirements/project/MTS-PROJECT-ACCEPTED-LINEAGE-01.rg.yaml";
const s29Owner = readFileSync(resolve(s29Root, s29OwnerPath), "utf8");
const s29Path = "formal/v0.15/evidence/final-readiness-r3.json";
const s29Relation = "  - predicates: [requires]\n    target:\n      kind: artifact\n      path: " + s29Path + "\n";
assert.ok(s29Owner.includes(s29Relation), "S29 exact cutover readiness relation exists");
assert.throws(() => verifyProjectOwnership(s29Root, {
  [s29OwnerPath]: s29Owner.replace(s29Relation, ""),
}), /missing requires witness/, "S29 missing lineage owner relation rejected");
const s29CutoverPath = "cutover/typescript-c1-acceptance-v0.8.json";
const s29Cutover = JSON.parse(readFileSync(resolve(s29Root, s29CutoverPath), "utf8"));
s29Cutover.evidence.finalReadiness = "formal/v0.15/evidence/forged-readiness.json";
assert.throws(() => verifyProjectOwnership(s29Root, {
  [s29CutoverPath]: JSON.stringify(s29Cutover),
}), /S29 accepted cutover finalReadiness pointer changed/,
"S29 altered acceptance pointer rejected");
const s29ReaderPath = "ts/test/v015-final-readiness-r3.test.ts";
const s29Reader = readFileSync(resolve(s29Root, s29ReaderPath), "utf8");
assert.ok(s29Reader.includes('readFileSync(join(root, "' + s29Path + '"), "utf8")'));
assert.throws(() => verifyProjectOwnership(s29Root, {
  [s29ReaderPath]: s29Reader.replace('"' + s29Path + '"', '"' + s29Path + '.forged"'),
}), /S29 physical historical readiness reader missing/,
"S29 disconnected historical reader rejected");
const s29Readiness = JSON.parse(readFileSync(resolve(s29Root, s29Path), "utf8"));
s29Readiness.finalAuthorGate.decision = "ACCEPTED";
assert.throws(() => verifyProjectOwnership(s29Root, {
  [s29Path]: JSON.stringify(s29Readiness),
}), /S29 historical readiness must remain pre-Author decision/,
"S29 historical Author-decision escalation rejected");
s29Readiness.finalAuthorGate.decision = "PENDING";
s29Readiness.conclusion.accepted = true;
assert.throws(() => verifyProjectOwnership(s29Root, {
  [s29Path]: JSON.stringify(s29Readiness),
}), /S29 historical readiness must remain pre-Author decision/,
"S29 forged accepted conclusion rejected");

// P7-S33: an actual FULL v0.14 accepted-lineage test reads the exact
// correction to its immutable candidate-era currentAccepted snapshot.
const s33Root = resolve("..");
const s33Path = "traceability/mts-v0.14-errata.json";
const s33OwnerPath = "requirements/project/MTS-PROJECT-ACCEPTED-LINEAGE-01.rg.yaml";
const s33Owner = readFileSync(resolve(s33Root, s33OwnerPath), "utf8");
const s33Relation = "  - predicates: [requires]\n    target:\n      kind: artifact\n      path: " + s33Path + "\n";
assert.ok(s33Owner.includes(s33Relation), "S33 one historical correction relation exists");
assert.throws(() => verifyProjectOwnership(s33Root, {
  [s33OwnerPath]: s33Owner.replace(s33Relation, ""),
}), /missing requires witness/, "S33 missing owner link rejected");
const s33ReaderPath = "ts/test/v014-traceability-candidate.test.ts";
const s33Reader = readFileSync(resolve(s33Root, s33ReaderPath), "utf8");
assert.ok(s33Reader.includes('json(join(repoRoot, "' + s33Path + '"))'));
assert.throws(() => verifyProjectOwnership(s33Root, {
  [s33ReaderPath]: s33Reader.replace('"' + s33Path + '"', '"' + s33Path + '.forged"'),
}), /S33 physical historical errata reader missing/,
"S33 disconnected actual FULL historical reader rejected");
const s33Source = JSON.parse(readFileSync(resolve(s33Root, s33Path), "utf8"));
const s33Authority = structuredClone(s33Source);
s33Authority.selectorAuthority = true;
assert.throws(() => verifyProjectOwnership(s33Root, {
  [s33Path]: JSON.stringify(s33Authority),
}), /S33 historical errata authority boundary changed/,
"S33 forged current selector authority rejected");
const s33Classification = structuredClone(s33Source);
s33Classification.corrections[0].classification = "CURRENT_ACCEPTED";
assert.throws(() => verifyProjectOwnership(s33Root, {
  [s33Path]: JSON.stringify(s33Classification),
}), /S33 stale historical selector classification changed/,
"S33 forged historical currentAccepted classification rejected");
const s33Observed = structuredClone(s33Source);
s33Observed.corrections[0].observed.contract = "contracts/mts-contract-v0.14.json";
assert.throws(() => verifyProjectOwnership(s33Root, {
  [s33Path]: JSON.stringify(s33Observed),
}), /S33 historical immutable stale snapshot mismatch/,
"S33 falsified immutable historical observation rejected");
const s33Cutover = structuredClone(s33Source);
s33Cutover.corrections[0].authoritativeCurrent.acceptance =
  "cutover/typescript-c1-acceptance-v0.8.json";
assert.throws(() => verifyProjectOwnership(s33Root, {
  [s33Path]: JSON.stringify(s33Cutover),
}), /S33 historical accepted cutover pointer changed/,
"S33 forged history-to-current cutover promotion rejected");
const s33Mutable = structuredClone(s33Source);
s33Mutable.sourceImmutable = false;
assert.throws(() => verifyProjectOwnership(s33Root, {
  [s33Path]: JSON.stringify(s33Mutable),
}), /S33 historical errata authority boundary changed/,
"S33 false claim that historical original is mutable rejected");
const s33Delta = structuredClone(s33Source);
s33Delta.acceptedSemanticDelta = "REDEFINED";
assert.throws(() => verifyProjectOwnership(s33Root, {
  [s33Path]: JSON.stringify(s33Delta),
}), /S33 historical errata authority boundary changed/,
"S33 illicit retroactive semantic delta rejected");

// P7-S34 BULK — exact current accepted FULL+CURRENT execution inventory.
// Do not turn the 30 unrelated historical research tests into CURRENT owners.
const s34Root = resolve("..");
const s34OwnerFile = "requirements/project/MTS-PROJECT-CI-01.rg.yaml";
const s34Owner = readFileSync(resolve(s34Root, s34OwnerFile), "utf8");
const s34Relation = (predicate: string, path: string): string =>
  "  - predicates: [" + predicate + "]\n    target:\n      kind: artifact\n      path: " + path + "\n";
const s34Required = JSON.parse(readFileSync(
  resolve(s34Root, "contracts/mts-conformance-v0.15.json"), "utf8"));
const s34BulkGate = "ts/test/research-v014-parametric-closure.test.ts";
assert.ok(s34Required.requiredExecutableGates.includes(s34BulkGate));
for (const path of [
  s34BulkGate,
  "ts/test/anum-two-memory-conformance.test.ts",
  "ts/test/v014-post-n20c-independent-readiness-audit.test.ts",
]) {
  const relation = s34Relation("verified_by", path);
  assert.ok(s34Owner.includes(relation), "S34 accepted FULL evidence declared " + path);
  assert.throws(() => verifyProjectOwnership(s34Root, {
    [s34OwnerFile]: s34Owner.replace(relation, ""),
  }), /missing verified_by witness/, "S34 deleted FULL gate ownership rejected: " + path);
}
for (const path of [
  "ts/test/portable-derivation-digest.test.ts",
  "ts/test/portable-derivation.test.ts",
]) {
  const relation = s34Relation("verified_by", path);
  assert.ok(s34Owner.includes(relation), "S34 explicit current assurance declared " + path);
  assert.throws(() => verifyProjectOwnership(s34Root, {
    [s34OwnerFile]: s34Owner.replace(relation, ""),
  }), /missing verified_by witness/, "S34 CURRENT assurance owner removal rejected: " + path);
}
const s34SourceModule = "ts/src/anum-carrier.ts";
assert.ok(s34Owner.includes(s34Relation("requires", s34SourceModule)));
assert.throws(() => verifyProjectOwnership(s34Root, {
  [s34OwnerFile]: s34Owner.replace(s34Relation("requires", s34SourceModule), ""),
}), /missing requires witness/, "S34 missing indirect import source rejected");
const s34CarrierReaderPath = "ts/src/quaternary-serialization.ts";
const s34CarrierReader = readFileSync(resolve(s34Root, s34CarrierReaderPath), "utf8");
assert.throws(() => verifyProjectOwnership(s34Root, {
  [s34CarrierReaderPath]: s34CarrierReader.replace('"./anum-carrier.js"',
    '"./anum-carrier.forged.js"'),
}), /S34 exact gate-to-source import edge missing/,
"S34 severed transitive dependency rejected");
const s34GateCandidate = structuredClone(s34Required);
s34GateCandidate.requiredExecutableGates = s34GateCandidate.requiredExecutableGates
  .filter((path: string) => path !== s34BulkGate);
assert.throws(() => verifyProjectOwnership(s34Root, {
  "contracts/mts-conformance-v0.15.json": JSON.stringify(s34GateCandidate),
}), /S34 current FULL conformance gate inventory changed/,
"S34 forged accepted current conformance gate count rejected");
const s34TierPath = "ts/src/tooling/test-tier.ts";
const s34Tier = readFileSync(resolve(s34Root, s34TierPath), "utf8");
assert.throws(() => verifyProjectOwnership(s34Root, {
  [s34TierPath]: s34Tier.replace('"ts/test/portable-derivation.test.ts"',
    '"ts/test/portable-derivation.forged.test.ts"'),
}), /S34 exact nonnative CURRENT assurance obligation changed/,
"S34 disconnected CURRENT assurance rejected");
assert.throws(() => verifyProjectOwnership(s34Root, {
  [s34TierPath]: s34Tier.replace("tier === \"current\" ? plan.currentSourceTests : plan.allSourceTests",
    "tier === \"current\" ? plan.currentSourceTests : plan.currentSourceTests"),
}), /S34 FULL tier execution binding changed/,
"S34 silently narrowed mandatory FULL runner rejected");

// S30: exact two-source historical readiness dependency, not blanket FORMAL
// ownership. All four negative cases must fail the existing owner verifier.
const s30Paths = [
  "formal/v0.15/evidence/governance-merge-enforcement-g1.json",
  "formal/v0.15/evidence/readiness-audit-r2.json",
] as const;
for (const path of s30Paths) {
  const clause = "  - predicates: [requires]\n    target:\n      kind: artifact\n      path: " + path + "\n";
  assert.ok(s29Owner.includes(clause), "S30 exact historical witness linked: " + path);
  assert.throws(() => verifyProjectOwnership(s29Root, {
    [s29OwnerPath]: s29Owner.replace(clause, ""),
  }), /missing requires witness/, "S30 missing owner link rejected: " + path);
  assert.ok(s29Reader.includes('readFileSync(join(root, "' + path + '"), "utf8")'));
  assert.throws(() => verifyProjectOwnership(s29Root, {
    [s29ReaderPath]: s29Reader.replace('"' + path + '"', '"' + path + '.forged"'),
  }), /S30 physical historical evidence reads/, "S30 disconnected reader rejected: " + path);
}
const s30R3 = JSON.parse(readFileSync(resolve(s29Root, s29Path), "utf8"));
s30R3.governance.evidence = "formal/v0.15/evidence/forged-governance.json";
assert.throws(() => verifyProjectOwnership(s29Root, {
  [s29Path]: JSON.stringify(s30R3),
}), /S30 R3 governance evidence pointer changed/,
"S30 forged governance source pointer rejected");
const s30Gov = JSON.parse(readFileSync(resolve(s29Root, s30Paths[0]), "utf8"));
s30Gov.acceptance.mtsV015Accepted = true;
assert.throws(() => verifyProjectOwnership(s29Root, {
  [s30Paths[0]]: JSON.stringify(s30Gov),
}), /S30 governance witness falsely accepts v0.15/,
"S30 retrospective governance acceptance rejected");
const s30Audit = JSON.parse(readFileSync(resolve(s29Root, s30Paths[1]), "utf8"));
s30Audit.status = "RELEASE_READY";
assert.throws(() => verifyProjectOwnership(s29Root, {
  [s30Paths[1]]: JSON.stringify(s30Audit),
}), /S30 historical blocked audit status changed/,
"S30 forged historical readiness status rejected");
const s30GovResult = JSON.parse(readFileSync(resolve(s29Root, s30Paths[0]), "utf8"));
s30GovResult.acceptance.governanceSatisfied = false;
assert.throws(() => verifyProjectOwnership(s29Root, {
  [s30Paths[0]]: JSON.stringify(s30GovResult),
}), /S30 governance witness falsely accepts v0.15/,
"S30 false historical governance-green claim rejected");
const s30AuditResult = JSON.parse(readFileSync(resolve(s29Root, s30Paths[1]), "utf8"));
s30AuditResult.conclusion.operationalMergeGovernance = "GREEN";
assert.throws(() => verifyProjectOwnership(s29Root, {
  [s30Paths[1]]: JSON.stringify(s30AuditResult),
}), /S30 historical blocked audit status changed/,
"S30 forged historical governance observation rejected");

// S31: preserve exact current W6 preview source dependencies only. These
// witnesses do not accept scientific source claims or publish the draft.
const s31Root = resolve("..");
const s31OwnerPath = "requirements/project/MTS-PROJECT-PUBLICATION-01.rg.yaml";
const s31Owner = readFileSync(resolve(s31Root, s31OwnerPath), "utf8");
const s31Checks = [
  {path: "ts/src/v015-formal-roles.ts",
   reader: "ts/src/tooling/mts-reader-review-m03.ts", arg: "path"},
  {path: "ts/src/v015-direct-association.ts",
   reader: "ts/src/tooling/mts-reader-review-l01-l02-l03.ts", arg: "v"},
] as const;
for (const item of s31Checks) {
  const clause = "  - predicates: [requires]\n    target:\n      kind: artifact\n      path: " + item.path + "\n";
  assert.ok(s31Owner.includes(clause), "S31 source-owned W6 preview link present");
  assert.throws(() => verifyProjectOwnership(s31Root, {
    [s31OwnerPath]: s31Owner.replace(clause, ""),
  }), /tooling requires relation coverage mismatches/, "S31 missing typed preview link rejected");
  const reader = readFileSync(resolve(s31Root, item.reader), "utf8");
  assert.ok(reader.includes('"' + item.path + '"'));
  assert.throws(() => verifyProjectOwnership(s31Root, {
    [item.reader]: reader.replace('"' + item.path + '"', '"' + item.path + '.forged"'),
  }), /S31 preview evidence source path changed/,
  "S31 forged source path rejected");
  assert.throws(() => verifyProjectOwnership(s31Root, {
    [item.reader]: reader.replace("read(root," + item.arg + ")",
      "read(root," + item.arg + ' + ".forged")'),
  }), /S31 preview evidence physical read disconnected/,
  "S31 disconnected physical reader rejected");
}
const s31Research = readFileSync(resolve(s31Root, s31Checks[1].path), "utf8");
assert.ok(s31Research.includes('status: "RESEARCH_NOT_ACCEPTED"'));
assert.throws(() => verifyProjectOwnership(s31Root, {
  [s31Checks[1].path]: s31Research.replace("RESEARCH_NOT_ACCEPTED", "ACCEPTED"),
}), /S31 preview source marker or research boundary changed/,
"S31 research-to-accepted authority promotion rejected");
const s31Roles = readFileSync(resolve(s31Root, s31Checks[0].path), "utf8");
assert.ok(s31Roles.includes("LINK_IDENTITY_EQUALITY"));
assert.throws(() => verifyProjectOwnership(s31Root, {
  [s31Checks[0].path]: s31Roles.replace("LINK_IDENTITY_EQUALITY", "FORGED_ROLE"),
}), /S31 preview source marker or research boundary changed/,
"S31 corrupted notation role source rejected");

// S26 second independent approved source cohort: negative digest mutation.
const s26TwoRolePath = "ts/test/v015-two-role-approved-source-integrity.test.ts";
const s26TwoRole = readFileSync(resolve(s26Root, s26TwoRolePath), "utf8");
const s26TwoRoleDigest = "f68e8629b5d476f49366f3f59e65ef64d523d5b5f8964dcf918283144ba292f9";
assert.ok(s26TwoRole.includes(s26TwoRoleDigest), "S26 two-role Author-approved hash pinned");
assert.throws(() => verifyProjectOwnership(s26Root, {
  [s26TwoRolePath]: s26TwoRole.replace(s26TwoRoleDigest, "0".repeat(64)),
}), /S26 approved source SHA-256 drift/,
"S26 tampered two-role source rejected");

// P7-S25: each exact restored witness must have project ownership in addition
// to being visible through its present-tense consumer. Dropping a single typed
// edge must fail without changing the accepted CURRENT/FULL selector.
for (const [id, target] of [
  ["MTS-PROJECT-CI-01", "ts/test/research-v013-append-only-currentness-falsifier-a72n.test.ts"],
  ["MTS-PROJECT-PROOF-PROVENANCE-01", "ts/test/research-v013-finite-recursive-description-boundary.test.ts"],
  ["MTS-PROJECT-PUBLICATION-01", "ts/test/research-physical-dot-bootstrap.test.ts"],
] as const) {
  const ownerPath = "requirements/project/" + id + ".rg.yaml";
  const original = readFileSync(resolve("..", ownerPath), "utf8");
  const clause = "  - predicates: [requires]\\n    target:\\n      kind: artifact\\n      path: " + target + "\\n";
  const exactClause = clause.replaceAll("\\n", "\n");
  assert.ok(original.includes(exactClause), "S25 exact ownership edge retained: " + target);
  assert.throws(() => verifyProjectOwnership(resolve(".."), {
    [ownerPath]: original.replace(exactClause, ""),
  }), /missing requires witness/, "S25 restored executable source needs typed causal ownership: " + target);
}

// S25: removing a real observer-to-source reference must also fail even if
// the Requirement relation still exists. One negative probe per owner class.
for (const [observer, target] of [
  ["ts/test/research-v013-flat-generalized-modus-ponens-a72w.test.ts", "ts/test/research-v013-append-only-currentness-falsifier-a72n.test.ts"],
  ["ts/test/v015-fnd05-formal-statement-candidate-b22.test.ts", "ts/test/research-v013-finite-recursive-description-boundary.test.ts"],
  ["web/contract-observatory/test/invariant-traceability.test.ts", "ts/test/research-physical-dot-bootstrap.test.ts"],
] as const) {
  const original = readFileSync(resolve("..", observer), "utf8");
  assert.ok(original.includes(target), "S25 observer still reads exact witness: " + target);
  assert.throws(() => verifyProjectOwnership(resolve(".."), {
    [observer]: original.replace(target, "ts/test/s25-deleted-exact-witness.test.ts"),
  }), /S25 restored witness lost live consumer/,
  "S25 orphaned evidence cannot be hidden by retaining an unused requires: " + target);
}

// S25: the synthetic CURRENT-tier reference must not be satisfied merely by
// repeating its filename in the S25 observer inventory or negative tests.
const s25TierSource = readFileSync(resolve("..", "ts/test/test-tier.test.ts"), "utf8");
const s25TierProbe = 'const evidenceOnly = "ts/test/research-v013-context-dualization-a75b.test.ts";';
assert.ok(s25TierSource.split(/\r?\n/).some(line => line.trim() === s25TierProbe));
assert.throws(() => verifyProjectOwnership(resolve(".."), {
  "ts/test/test-tier.test.ts": s25TierSource.replace(
    /^  const evidenceOnly = "ts\/test\/research-v013-context-dualization-a75b\.test\.ts";$/m,
    '  const evidenceOnly = "ts/test/s25-missing-context-dualization.test.ts";'),
}), /S25 tier synthetic evidence source probe was removed/,
"S25 no self-referential CURRENT evidence source witness");

// P7-S16: protected historical lineage is an actual policy obligation, not
// a discretionary bulk J1 relation. Test both missing typed ownership and
// silent policy removal independently from exact real source files.
const s16LineageFile = "requirements/project/MTS-PROJECT-ACCEPTED-LINEAGE-01.rg.yaml";
const s16LineageText = readFileSync(resolve("..", s16LineageFile), "utf8");
const s16LineageRelation = "  - predicates: [requires]\\n    target:\\n      kind: artifact\\n      path: contracts/mts-conformance-v0.11.json\\n".replaceAll("\\n", "\n");
assert.ok(s16LineageText.includes(s16LineageRelation));
assert.throws(() => verifyProjectOwnership(resolve(".."), {
  [s16LineageFile]: s16LineageText.replace(s16LineageRelation, ""),
}), /accepted historical immutable lineage relation coverage mismatches/,
  "S16: exact immutable historic contract cannot lose requires");
const s16PolicyFile = "repo-policy.json";
const s16PolicyText = readFileSync(resolve("..", s16PolicyFile), "utf8");
const s16ProtectedPath = '    "cutover/typescript-c1-acceptance-v0.1.json",\\n'.replaceAll("\\n", "\n");
assert.ok(s16PolicyText.includes(s16ProtectedPath));
assert.throws(() => verifyProjectOwnership(resolve(".."), {
  [s16PolicyFile]: s16PolicyText.replace(s16ProtectedPath, ""),
}), /accepted historical immutable lineage inventory changed/,
  "S16: removing an accepted immutable legacy path from policy must fail");

// S32: policy belongs to the existing change-governance owner because
// an actual blocking RepoGuard workflow and the CURRENT S16 verifier consume it.
const s32Root = resolve("..");
const s32OwnerPath = "requirements/project/MTS-PROJECT-CHANGE-GOVERNANCE-01.rg.yaml";
const s32Owner = readFileSync(resolve(s32Root, s32OwnerPath), "utf8");
const s32Relation = "  - predicates: [requires]\n    target:\n      kind: artifact\n      path: repo-policy.json\n";
assert.ok(s32Owner.includes(s32Relation), "S32 exact policy relation exists");
assert.throws(() => verifyProjectOwnership(s32Root, {
  [s32OwnerPath]: s32Owner.replace(s32Relation, ""),
}), /S32|missing requires witness/, "S32 missing exact policy ownership rejected");
const s32PolicyPath = "repo-policy.json";
const s32Policy = JSON.parse(readFileSync(resolve(s32Root, s32PolicyPath), "utf8"));
const s32Blocked = structuredClone(s32Policy);
s32Blocked.enforcement.mode = "advisory";
assert.throws(() => verifyProjectOwnership(s32Root, {
  [s32PolicyPath]: JSON.stringify(s32Blocked),
}), /S32 current blocking policy mode changed/, "S32 nonblocking policy rejected");
const s32Unbound = structuredClone(s32Policy);
s32Unbound.paths.governance_paths = s32Unbound.paths.governance_paths
  .filter((path: string) => path !== "repo-policy.json");
assert.throws(() => verifyProjectOwnership(s32Root, {
  [s32PolicyPath]: JSON.stringify(s32Unbound),
}), /S32 governance policy\/workflow bindings changed/, "S32 removed self-governance rejected");
const s32ForgedPin = structuredClone(s32Policy);
s32ForgedPin.document_relations.rules.find((v: any) =>
  v.id === "repo-guard-workflow-action-pin").value =
    "netkeep80/repo-guard@" + "0".repeat(40);
assert.throws(() => verifyProjectOwnership(s32Root, {
  [s32PolicyPath]: JSON.stringify(s32ForgedPin),
}), /S32 temporary blocking gate source\/pin changed/, "S32 forged pinned guard rejected");
const s32Rebound = structuredClone(s32Policy);
s32Rebound.document_relations.documents["repo-guard-workflow"].path =
  ".github/workflows/ci.yml";
assert.throws(() => verifyProjectOwnership(s32Root, {
  [s32PolicyPath]: JSON.stringify(s32Rebound),
}), /S32 live guard document binding changed/, "S32 rerouted governance workflow rejected");
const s32ForgedRule = structuredClone(s32Policy);
s32ForgedRule.document_relations.rules.find((v: any) =>
  v.id === "repo-guard-workflow-enforcement").value = "monitor";
assert.throws(() => verifyProjectOwnership(s32Root, {
  [s32PolicyPath]: JSON.stringify(s32ForgedRule),
}), /S32 guard policy document enforcement changed/,
"S32 advisory control-document rule rejected");
const s32WorkflowPath = ".github/workflows/repo-guard.yml";
const s32Workflow = readFileSync(resolve(s32Root, s32WorkflowPath), "utf8");
assert.ok(s32Workflow.includes("enforcement: blocking"));
assert.throws(() => verifyProjectOwnership(s32Root, {
  [s32WorkflowPath]: s32Workflow.replace("enforcement: blocking", "enforcement: monitor"),
}), /S32 temporary blocking gate source\/pin changed/, "S32 weakened actual workflow rejected");

// P7-S17: an actual documentation/source consumer must causally own each
// current audit/profile input, not just cite the path as historical metadata.
const s17PubOwnerFile = "requirements/project/MTS-PROJECT-PUBLICATION-01.rg.yaml";
const s17PubOwnerSource = readFileSync(resolve("..", s17PubOwnerFile), "utf8");
const s17AuditRelation = "  - predicates: [requires]\\n    target:\\n      kind: artifact\\n      path: audits/v015-current-documentation-migration.json\\n".replaceAll("\\n", "\n");
assert.ok(s17PubOwnerSource.includes(s17AuditRelation));
assert.throws(() => verifyProjectOwnership(resolve(".."), {
  [s17PubOwnerFile]: s17PubOwnerSource.replace(s17AuditRelation, ""),
}), /S17 current documentation audit input relation coverage mismatches/,
  "S17: removal of an actual documentation audit input must fail");
const s17DocsCodePath = "ts/src/tooling/v015-documentation-acceptance.ts";
const s17DocsCode = readFileSync(resolve("..", s17DocsCodePath), "utf8");
const s17RealRead = 'read(root, "audits/v015-formula-candidate-inventory.json")';
assert.ok(s17DocsCode.includes(s17RealRead));
assert.throws(() => verifyProjectOwnership(resolve(".."), {
  [s17DocsCodePath]: s17DocsCode.replace(s17RealRead, 'read(root, "audits/v015-other.json")'),
}), /S17 current documentation audit input relation coverage mismatches/,
  "S17: a changed actual reader cannot be hidden by stale Relations");
const s17ProofFile = "requirements/project/MTS-PROJECT-PROOF-PROVENANCE-01.rg.yaml";
const s17ProofSource = readFileSync(resolve("..", s17ProofFile), "utf8");
const s17CaseRelation = "  - predicates: [requires]\\n    target:\\n      kind: artifact\\n      path: audits/v015-theorem-statement-evidence-cases.json\\n".replaceAll("\\n", "\n");
assert.ok(s17ProofSource.includes(s17CaseRelation));
assert.throws(() => verifyProjectOwnership(resolve(".."), {
  [s17ProofFile]: s17ProofSource.replace(s17CaseRelation, ""),
}), /S17 theorem case manifest input relation coverage mismatches/,
  "S17: theorem case evidence must retain exact current provenance");

// P7-S18: FULL fixture inputs must be preserved under the existing CI owner.
const s18CiOwnerPath = "requirements/project/MTS-PROJECT-CI-01.rg.yaml";
const s18CiOwnerSource = readFileSync(resolve("..", s18CiOwnerPath), "utf8");
const s18FixtureRelation = "  - predicates: [requires]\\n    target:\\n      kind: artifact\\n      path: examples/anum/conformance/q-flat-110.anum\\n".replaceAll("\\n", "\n");
assert.ok(s18CiOwnerSource.includes(s18FixtureRelation));
assert.throws(() => verifyProjectOwnership(resolve(".."), {
  [s18CiOwnerPath]: s18CiOwnerSource.replace(s18FixtureRelation, ""),
}), /S18 exact current FULL conformance fixture ownership relation coverage mismatches/,
  "S18: a consumed fixture with removed ownership must fail closed");
const s18TestPath = "ts/test/anum-two-memory-conformance.test.ts";
const s18TestSource = readFileSync(resolve("..", s18TestPath), "utf8");
assert.ok(s18TestSource.includes("../examples/anum/conformance/q-flat-110.anum"));
assert.throws(() => verifyProjectOwnership(resolve(".."), {
  [s18TestPath]: s18TestSource.replace("../examples/anum/conformance/q-flat-110.anum",
    "../examples/anum/conformance/q-flat-111.anum"),
}), /S18 conformance fixture executable FULL coverage relation coverage mismatches/,
  "S18: a drifted executable fixture reader cannot be hidden by stale Relations");
const s18IndexedTest = "ts/test/quaternary-anum-hierarchical-two-memory.test.ts";
const s18IndexedSource = readFileSync(resolve("..", s18IndexedTest), "utf8");
assert.ok(s18IndexedSource.includes("q-hierarchical-byte-4d.anum"));
assert.throws(() => verifyProjectOwnership(resolve(".."), {
  [s18IndexedTest]: s18IndexedSource.replace("q-hierarchical-byte-4d.anum",
    "q-hierarchical-byte-4e.anum"),
}), /S18 conformance fixture executable FULL coverage relation coverage mismatches/,
  "S18: changes to parameterized fixtures must fail closed");

// S18: observe physical reads from child processes, not AST spelling.
const s18WitnessDir = mkdtempSync(join(tmpdir(), "mts-s18-witness-"));
const s18WitnessRoot = resolve("..");
const s18A = "examples/anum/conformance/q-flat-110.anum";
const s18B = "examples/anum/conformance/q-hierarchical-byte-4d.anum";
const s18ReadA = 'import { readFileSync } from "node:fs";\n' +
  'readFileSync(' + JSON.stringify(resolve(s18WitnessRoot, s18A)) + ');\n';
const s18ReadB = 'readFileSync(' + JSON.stringify(resolve(s18WitnessRoot, s18B)) + ');\n';
try {
  const healthy = join(s18WitnessDir, "healthy.mjs");
  writeFileSync(healthy, s18ReadA + s18ReadB);
  assert.doesNotThrow(() => runS18FixtureWitness(
    healthy, [s18A, s18B], s18WitnessRoot));

  const before = join(s18WitnessDir, "exit-before.mjs");
  writeFileSync(before, 'process.exit(0);\n' + s18ReadA + s18ReadB);
  assert.throws(() => runS18FixtureWitness(
    before, [s18A, s18B], s18WitnessRoot),
  /S18 physical fixture read mismatch/,
  "S18-AUD-004: exit(0) before fixture read must fail");

  const afterOne = join(s18WitnessDir, "exit-after-one.mjs");
  writeFileSync(afterOne, s18ReadA + 'process.exit(0);\n' + s18ReadB);
  assert.throws(() => runS18FixtureWitness(
    afterOne, [s18A, s18B], s18WitnessRoot),
  /S18 physical fixture read mismatch/,
  "S18-AUD-004: exit(0) inside first fixture's verification must fail");

  const afterAll = join(s18WitnessDir, "exit-after-all.mjs");
  writeFileSync(afterAll, s18ReadA + s18ReadB + 'process.exit(0);\n');
  assert.throws(() => runS18FixtureWitness(
    afterAll, [s18A, s18B], s18WitnessRoot),
  /S18 explicit process.exit/,
  "S18-AUD-004: even after reads, explicit exit is not normal completion");
} finally {
  rmSync(s18WitnessDir, { recursive: true, force: true });
}

const acceptedOwnerFile = "requirements/project/MTS-PROJECT-CHANGE-GOVERNANCE-01.rg.yaml";
const acceptedOwnerSource = readFileSync(resolve("..", acceptedOwnerFile), "utf8");
assert.throws(
  () => verifyProjectOwnership(resolve(".."), {
    [acceptedOwnerFile]: acceptedOwnerSource.replace("  accepted: true", "  accepted: false"),
  }),
  /Author-accepted project lifecycle must remain accepted\/current/,
  "silent reversion of an accepted project Requirement must fail closed",
);
assert.throws(
  () => verifyProjectOwnership(resolve(".."), {
    [acceptedOwnerFile]: acceptedOwnerSource.replace("  current: true", "  current: false"),
  }),
  /Author-accepted project lifecycle must remain accepted\/current/,
  "accepted but non-current Requirement cannot justify present-tense project Resources",
);


const packageOwnerFile = "requirements/project/MTS-PROJECT-PACKAGE-01.rg.yaml";
const packageOwnerText = readFileSync(resolve("..", packageOwnerFile), "utf8");
const proofOwnerFile = "requirements/project/MTS-PROJECT-PROOF-PROVENANCE-01.rg.yaml";
const proofOwnerText = readFileSync(resolve("..", proofOwnerFile), "utf8");
const s14ProofRelation = "  - predicates: [requires]\\n    target:\\n      kind: artifact\\n      path: proofs/v015-evidence/gpr01-single-state-transformer.json\\n".replaceAll("\\n", "\n");
assert.ok(proofOwnerText.includes(s14ProofRelation));
assert.throws(
  () => verifyProjectOwnership(resolve(".."), {
    [proofOwnerFile]: proofOwnerText.replace(s14ProofRelation, ""),
  }),
  /current theorem projection evidence relation coverage mismatches/,
  "S14: current theorem evidence cannot lose exact required relation",
);
const theoremProjectionFile = "ts/src/tooling/theorem-projection-contract.ts";
const theoremProjectionText = readFileSync(resolve("..", theoremProjectionFile), "utf8");
const evidenceConsumerExpression = "...THEOREM_CATALOG_INTEGRATION_CONTRACT.candidateProofFamilies.flatMap(";
assert.ok(theoremProjectionText.includes(evidenceConsumerExpression), "S14 theorem evidence consumer exists");
assert.throws(
  () => verifyProjectOwnership(resolve(".."), {
    [theoremProjectionFile]: theoremProjectionText.replace(evidenceConsumerExpression, "...[].flatMap("),
  }),
  /current theorem projection evidence source consumption changed/,
  "S14: textual evidence inventory without active projection input is not enough",
);
const replayPair = "  - predicates: [requires]\n    target:\n      kind: artifact\n      path: formal/v0.15/regression/compact-and.amemory-package.json\n";
assert.ok(proofOwnerText.includes(replayPair), "S8 fixture relation must exist");
assert.throws(
  () => verifyProjectOwnership(resolve(".."), {
    [proofOwnerFile]: proofOwnerText.replace(replayPair, ""),
  }),
  /exact current FORMAL replay and approved SHA-256 source inputs relation coverage mismatches/,
  "S8: loss of a current exact frozen package must fail",
);
assert.throws(
  () => verifyProjectOwnership(resolve(".."), {
    [proofOwnerFile]: proofOwnerText.replace(replayPair,
      replayPair.replace("[requires]", "[documents]")),
  }),
  /missing requires witness for formal\/v0\.15\/regression\/compact-and\.amemory-package\.json/,
  "S8: wrong typed predicate must not justify a real replay package",
);
assert.throws(
  () => verifyProjectOwnership(resolve(".."), {
    [proofOwnerFile]: proofOwnerText +
      "  - predicates: [requires]\n    target:\n      kind: artifact\n      path: formal/v0.15/regression/compact-not.recursive\n",
  }),
  /exact current FORMAL replay and approved SHA-256 source inputs relation coverage mismatches/,
  "S8: existing but unread optional recursive file must not become current ownership",
);
const frozenTestPath = "ts/test/v015-frozen-replay-artifact-integrity.test.ts";
assert.throws(
  () => verifyProjectOwnership(resolve(".."), {
    [frozenTestPath]: readFileSync(resolve("..", frozenTestPath), "utf8")
      .replace("compact-and.amemory-package.json", "compact-not.amemory-package.json"),
  }),
  /frozen replay verifier must read six distinct package\/evidence pairs/,
  "S8: changed consumer's exact frozen evidence set invalidates stale ownership",
);

assert.throws(
  () => verifyProjectOwnership(resolve(".."), {
    [packageOwnerFile]: packageOwnerText.replace("path: ts/src/anum.ts", "path: ts/src/tooling/mts-compiler.ts"),
  }),
  /public API implemented_by relation coverage mismatches/,
  "an existing but nonexported file must not justify public API ownership",
);
assert.throws(
  () => verifyProjectOwnership(resolve(".."), {
    [packageOwnerFile]: packageOwnerText.replace(
      "  - predicates: [implemented_by]\n    target:\n      kind: artifact\n      path: ts/src/anum.ts",
      "  - predicates: [verified_by]\n    target:\n      kind: artifact\n      path: ts/src/anum.ts",
    ),
  }),
  /public API implemented_by relation coverage mismatches/,
  "a true export with wrong relation predicate does not satisfy implemented_by",
);
assert.throws(
  () => verifyProjectOwnership(resolve(".."), {
    [proofOwnerFile]: proofOwnerText.replace(
      "  - predicates: [requires]\n    target:\n      kind: artifact\n      path: proofs/evidence/FND-01/coq.json",
      "",
    ),
  }),
  /proof evidence record relation coverage mismatches/,
  "a currently consumed proof record cannot silently lose its exact owner relation",
);

assert.throws(
  () => verifyProjectOwnership(resolve(".."), {
    [packageOwnerFile]: packageOwnerText.replace(
      "  - predicates: [requires]\n    target:\n      kind: artifact\n      path: ts/src/byte-carrier.ts\n",
      "",
    ),
  }),
  /public package transitive requires relation coverage mismatches/,
  "a real transitive import must keep its exact Resource relationship",
);
assert.throws(
  () => verifyProjectOwnership(resolve(".."), {
    [packageOwnerFile]: packageOwnerText.replace(
      "path: ts/src/byte-carrier.ts",
      "path: ts/src/tooling/mts-compiler.ts",
    ),
  }),
  /public package transitive requires relation coverage mismatches/,
  "an existing unrelated source is not a valid package transitive dependency",
);

const lineageOwnerFile = "requirements/project/MTS-PROJECT-ACCEPTED-LINEAGE-01.rg.yaml";
const lineageOwnerText = readFileSync(resolve("..", lineageOwnerFile), "utf8");
const publicationOwnerFile = "requirements/project/MTS-PROJECT-PUBLICATION-01.rg.yaml";
const publicationOwnerText = readFileSync(resolve("..", publicationOwnerFile), "utf8");


const s14WebRelation = "  - predicates: [verified_by]\\n    target:\\n      kind: artifact\\n      path: web/contract-observatory/test/interaction.test.ts\\n".replaceAll("\\n", "\n");
assert.ok(publicationOwnerText.includes(s14WebRelation));
assert.throws(
  () => verifyProjectOwnership(resolve(".."), {
    [publicationOwnerFile]: publicationOwnerText.replace(s14WebRelation, ""),
  }),
  /Contract Observatory executed tests relation coverage mismatches/,
  "S14: an executed web test cannot lose its exact verified_by relation",
);
assert.throws(
  () => verifyProjectOwnership(resolve(".."), {
    [".github/workflows/pages.yml"]: readFileSync(resolve("..", ".github/workflows/pages.yml"), "utf8")
      .replace("node web/contract-observatory/dist/test/contract-index.test.js", "echo no-test-execution"),
  }),
  /Contract Observatory Pages suite entrypoint changed/,
  "S14: compile-only Pages cannot justify verified_by",
);
const observatorySuiteFile = "web/contract-observatory/test/contract-index.test.ts";
const observatorySuiteText = readFileSync(resolve("..", observatorySuiteFile), "utf8");
assert.ok(observatorySuiteText.includes("execFileSync(process.execPath,"), "S14 runner must execute tests");
assert.throws(
  () => verifyProjectOwnership(resolve(".."), {
    [observatorySuiteFile]: observatorySuiteText.replace("execFileSync(process.execPath,", "console.log(process.execPath,"),
  }),
  /Contract Observatory suite runner no longer executes full compiled test set/,
  "S14: dropping transitive test execution must lose verified_by authority",
);
const previewDraftPath = "requirements/mts-source/MTS-READER-HUMAN-EDITION-R44-W6.yaml";
assert.throws(
  () => verifyProjectOwnership(resolve(".."), {
    [previewDraftPath]: readFileSync(resolve("..", previewDraftPath), "utf8")
      .replace("author_approval: not-recorded", "author_approval: approved"),
  }),
  /Reader W6 draft model cannot gain unrecorded approval or semantic authority/,
  "S9: source ownership cannot be confused with Author acceptance",
);

const previewSourceRelation =
  "  - predicates: [requires]\n    target:\n      kind: artifact\n      path: requirements/mts-source/MTS-READER-HUMAN-EDITION-R44-W6.yaml\n";
assert.ok(publicationOwnerText.includes(previewSourceRelation), "S9: preview-root source relation must exist");
assert.throws(
  () => verifyProjectOwnership(resolve(".."), {
    [publicationOwnerFile]: publicationOwnerText.replace(previewSourceRelation, ""),
  }),
  /Reader W6 directly invoked YAML inputs relation coverage mismatches/,
  "S9: removing a currently read Reader preview source must fail closed",
);
assert.throws(
  () => verifyProjectOwnership(resolve(".."), {
    [publicationOwnerFile]: publicationOwnerText.replace(
      previewSourceRelation, previewSourceRelation.replace("[requires]", "[documents]")),
  }),
  /current Markdown publication surface relation coverage mismatches/,
  "S9: a document projection is not the causal input used by Reader preview",
);
assert.throws(
  () => verifyProjectOwnership(resolve(".."), {
    [publicationOwnerFile]: publicationOwnerText +
      "  - predicates: [requires]\n    target:\n      kind: artifact\n      path: requirements/mts-source/MTS-READER-EDGE-REVIEW-R39-W1.yaml\n",
  }),
  new RegExp("missing tracked target: requirements/mts-source/MTS-READER-EDGE-REVIEW-R39-W1[.]yaml"),
  "S13: a deleted unused Reader draft cannot be reintroduced as a dangling ownership claim",
);
// S11-A: only the actual current M06-B read, not a historical directory.
const m06BRelation =
  "  - predicates: [requires]\n    target:\n      kind: artifact\n      path: reviews/m06/reviewer-b-97-indexed-extraction.txt\n";
assert.ok(publicationOwnerText.includes(m06BRelation), "S11-A M06-B causal relation must exist");
assert.throws(
  () => verifyProjectOwnership(resolve(".."), {
    [publicationOwnerFile]: publicationOwnerText.replace(m06BRelation, ""),
  }),
  /Reader W6 full observed runtime input closure relation coverage mismatches/,
  "S11-A: a presently read source cannot lose ownership",
);
const m06BPath = "reviews/m06/reviewer-b-97-indexed-extraction.txt";
assert.throws(
  () => verifyProjectOwnership(resolve(".."), {
    [m06BPath]: readFileSync(resolve("..", m06BPath), "utf8") + "\nTAMPERED\n",
  }),
  /Reader W6 pinned M06 transcription bytes changed/,
  "S11-A: source bytes must be checked against the current exact consumer SHA",
);

// S11-B: assert exact transitive YAML and C sources, never a broad source folder.
const runtimeRouteRelation =
  "  - predicates: [requires]\n    target:\n      kind: artifact\n      path: requirements/mts-source/MTS-READER-ROUTE-PROPOSAL.yaml\n";
const m06CRelation =
  "  - predicates: [requires]\n    target:\n      kind: artifact\n      path: reviews/m06/reviewer-c-43-indexed-extraction.txt\n";
assert.ok(publicationOwnerText.includes(runtimeRouteRelation) &&
  publicationOwnerText.includes(m06CRelation), "S11-B restored current runtime paths");
assert.throws(
  () => verifyProjectOwnership(resolve(".."), {
    [publicationOwnerFile]: publicationOwnerText.replace(runtimeRouteRelation, ""),
  }),
  /Reader W6 full observed runtime input closure relation coverage mismatches/,
  "S11-B: a real transitive Reader YAML input cannot disappear",
);
assert.throws(
  () => verifyProjectOwnership(resolve(".."), {
    [publicationOwnerFile]: publicationOwnerText.replace(m06CRelation, ""),
  }),
  /Reader W6 full observed runtime input closure relation coverage mismatches/,
  "S11-B: the pinned secondary M06-C source cannot disappear",
);
assert.throws(
  () => verifyProjectOwnership(resolve(".."), {
    [publicationOwnerFile]: publicationOwnerText.replace(
      runtimeRouteRelation, runtimeRouteRelation.replace("[requires]", "[documents]")),
  }),
  /current Markdown publication surface relation coverage mismatches/,
  "S11-B: a runtime input cannot be represented as a Markdown publication",
);
const m06CPath = "reviews/m06/reviewer-c-43-indexed-extraction.txt";
assert.throws(
  () => verifyProjectOwnership(resolve(".."), {
    [m06CPath]: readFileSync(resolve("..", m06CPath), "utf8") + "\nMUTATED\n",
  }),
  /Reader W6 pinned M06 transcription bytes changed/,
  "S11-B: exact original C Git blob must remain unchanged",
);

// S12: exact Pages/docs:coverage and generated-theorem current observers.
const s12CoverageRelation =
  "  - predicates: [implemented_by]\\n    target:\\n      kind: artifact\\n      path: ts/src/tooling/docs-coverage.ts\\n".replaceAll("\\n", "\n");
const s12CatalogRelation =
  "  - predicates: [requires]\\n    target:\\n      kind: artifact\\n      path: docs/theory/Теоремы МТС.md\\n".replaceAll("\\n", "\n");
assert.ok(publicationOwnerText.includes(s12CoverageRelation) &&
  publicationOwnerText.includes(s12CatalogRelation), "S12 current Pages resources claimed");
assert.throws(
  () => verifyProjectOwnership(resolve(".."), {
    [publicationOwnerFile]: publicationOwnerText.replace(s12CoverageRelation, ""),
  }),
  /current publication tooling entrypoints relation coverage mismatches/,
  "S12 missing docs-coverage implementation must fail closed",
);
assert.throws(
  () => verifyProjectOwnership(resolve(".."), {
    [publicationOwnerFile]: publicationOwnerText.replace(
      s12CoverageRelation, s12CoverageRelation.replace("[implemented_by]", "[requires]")),
  }),
  /current publication tooling entrypoints relation coverage mismatches/,
  "S12 docs-coverage cannot be misclassified as non-executable input",
);
assert.throws(
  () => verifyProjectOwnership(resolve(".."), {
    [publicationOwnerFile]: publicationOwnerText.replace(s12CatalogRelation, ""),
  }),
  /missing requires witness for docs\/theory\/Теоремы МТС\.md/,
  "S12 current generated theorem catalog requires a path-exact resource relation",
);
assert.throws(
  () => verifyProjectOwnership(resolve(".."), {
    [publicationOwnerFile]: publicationOwnerText.replace(
      s12CatalogRelation, s12CatalogRelation.replace("[requires]", "[documents]")),
  }),
  /current Markdown publication surface relation coverage mismatches/,
  "S12 generated theorem projection must not become hand-authored Markdown ownership",
);
const s12PagesPath = ".github/workflows/pages.yml";
assert.throws(
  () => verifyProjectOwnership(resolve(".."), {
    [s12PagesPath]: readFileSync(resolve("..", s12PagesPath), "utf8")
      .replace("npm --prefix ts run docs:coverage", "echo fake-coverage"),
  }),
  /S12 Pages current docs-coverage executable binding changed/,
  "S12 a stale coverage source must not survive a workflow execution change",
);
const s12DocsSyncPath = "ts/src/tooling/docs-sync.ts";
assert.throws(
  () => verifyProjectOwnership(resolve(".."), {
    [s12DocsSyncPath]: readFileSync(resolve("..", s12DocsSyncPath), "utf8")
      .replace("writeFileSync(theoremCatalogFullPath", "void(theoremCatalogFullPath"),
  }),
  /S12 generated theorem catalog current docs-sync source\/observer changed/,
  "S12 a previously generated but no longer written catalog cannot remain owned as current",
);

const readerW6ToolPath = "ts/src/tooling/mts-reader-r44-w6.ts";
assert.throws(
  () => verifyProjectOwnership(resolve(".."), {
    [readerW6ToolPath]: readFileSync(resolve("..", readerW6ToolPath), "utf8")
      .replace('from "./mts-reader-review-m06-w3.js"',
        'from "./mts-reader-review-m06-w2.js"'),
  }),
  /MTS-PROJECT-PUBLICATION-01 tooling requires relation coverage mismatches/,
  "S9: a changed actual loader graph invalidates stale source ownership",
);

assert.throws(
  () => verifyProjectOwnership(resolve(".."), {
    [packageOwnerFile]: packageOwnerText.replace(
      "  - predicates: [implemented_by]\n    target:\n      kind: artifact\n      path: ts/src/tooling/notation.ts\n", ""),
  }),
  /public API implemented_by relation coverage mismatches/,
  "declared package tooling export cannot lose its exact entrypoint link",
);
assert.throws(
  () => verifyProjectOwnership(resolve(".."), {
    [packageOwnerFile]: packageOwnerText.replace(
      "  - predicates: [requires]\n    target:\n      kind: artifact\n      path: ts/src/syntax-aset-contract.ts\n", ""),
  }),
  /public package transitive requires relation coverage mismatches/,
  "tooling subpath import must retain its exact private dependency",
);
assert.throws(
  () => verifyProjectOwnership(resolve(".."), {
    [lineageOwnerFile]: lineageOwnerText.replace(
      "  - predicates: [requires]\n    target:\n      kind: artifact\n      path: ts/src/tooling/docs-sync.ts\n", ""),
  }),
  /MTS-PROJECT-ACCEPTED-LINEAGE-01 tooling requires relation coverage mismatches/,
  "current accepted-lineage compiler depends on docs-sync via exact imports",
);

const previewCliRelation =
  "  - predicates: [implemented_by]\n    target:\n      kind: artifact\n      path: ts/src/tooling/mts-reader-r44-w6-cli.ts\n";
const previewModuleRelation =
  "  - predicates: [requires]\n    target:\n      kind: artifact\n      path: ts/src/tooling/mts-reader-r44-w6.ts\n";
assert.ok(publicationOwnerText.includes(previewCliRelation) &&
  publicationOwnerText.includes(previewModuleRelation),
  "S10: CLI and renderer relations must exist before negative mutations");
assert.throws(
  () => verifyProjectOwnership(resolve(".."), {
    [publicationOwnerFile]: publicationOwnerText.replace(previewCliRelation, ""),
  }),
  /current publication tooling entrypoints relation coverage mismatches/,
  "S10: current Reader preview CLI must retain implemented_by relationship",
);
assert.throws(
  () => verifyProjectOwnership(resolve(".."), {
    [publicationOwnerFile]: publicationOwnerText.replace(previewModuleRelation, ""),
  }),
  /MTS-PROJECT-PUBLICATION-01 tooling requires relation coverage mismatches/,
  "S10: a real reader renderer dependency cannot silently lose its exact link",
);
assert.throws(
  () => verifyProjectOwnership(resolve(".."), {
    [publicationOwnerFile]: publicationOwnerText.replace(
      previewModuleRelation,
      previewModuleRelation.replace("mts-reader-r44-w6.ts", "test-runner.ts")),
  }),
  /MTS-PROJECT-PUBLICATION-01 tooling requires relation coverage mismatches/,
  "S10: an unrelated but existing tooling source does not satisfy the import graph",
);

assert.throws(
  () => verifyProjectOwnership(resolve(".."), {
    [readerW6ToolPath]: 'import "./v015-native-evidence-verifier.js";\n' +
      readFileSync(resolve("..", readerW6ToolPath), "utf8"),
  }),
  /MTS-PROJECT-PUBLICATION-01 tooling requires relation coverage mismatches/,
  "S10: a newly imported real private implementation requires an explicit exact relation",
);

assert.throws(
  () => verifyProjectOwnership(resolve(".."), {
    [publicationOwnerFile]: publicationOwnerText.replace(
      previewCliRelation, previewCliRelation.replace("[implemented_by]", "[requires]")),
  }),
  /current publication tooling entrypoints relation coverage mismatches/,
  "S10: current executable Reader entrypoint cannot masquerade as private dependency",
);

assert.throws(
  () => verifyProjectOwnership(resolve(".."), {
    [publicationOwnerFile]: publicationOwnerText.replace(
      "path: ts/src/tooling/mts-source-requirement.ts",
      "path: ts/src/tooling/test-runner.ts",
    ),
  }),
  /MTS-PROJECT-PUBLICATION-01 tooling requires relation coverage mismatches/,
  "an unrelated but existing tooling source does not justify publication ownership",
);

assert.throws(
  () => verifyProjectOwnership(resolve(".."), {
    [acceptedOwnerFile]: acceptedOwnerSource.replace(
      "  - predicates: [requires]\n    target:\n      kind: artifact\n      path: pics/64ачисла.jpg\n", ""),
  }),
  /permanent historical picture corpus relation coverage mismatches/,
  "an immutable Author-designated historical image cannot lose its causal owner",
);
assert.throws(
  () => verifyProjectOwnership(resolve(".."), {
    ["profiles/mts-historical-images.json"]: readFileSync(resolve("..", "profiles/mts-historical-images.json"), "utf8")
      .replace("PERMANENT_HISTORICAL_RESEARCH_ASSETS_DO_NOT_DELETE", "UNPROTECTED"),
  }),
  /historical image retention manifest lost Author-designated immutable authority/,
  "manifest status cannot be silently downgraded",
);
assert.throws(
  () => verifyProjectOwnership(resolve(".."), {
    [publicationOwnerFile]: publicationOwnerText.replace(
      "  - predicates: [documents]\n    target:\n      kind: artifact\n      path: docs/research/Исходные мысли МТС.md\n", ""),
  }),
  /current Markdown publication surface relation coverage mismatches/,
  "current authored Markdown cannot disappear from project publication ownership",
);
assert.throws(
  () => verifyProjectOwnership(resolve(".."), {
    [publicationOwnerFile]: publicationOwnerText +
      "  - predicates: [documents]\n    target:\n      kind: artifact\n      path: pics/README.md\n",
  }),
  /current Markdown publication surface relation coverage mismatches/,
  "historical picture README is not the current MTS public document surface",
);

assert.throws(
  () => verifyProjectOwnership(resolve(".."), {
    [publicationOwnerFile]: publicationOwnerText.replace(
      "  - predicates: [requires]\n    target:\n      kind: artifact\n      path: web/contract-observatory/src/site.ts\n", ""),
  }),
  /Contract Observatory site source dependency relation coverage mismatches/,
  "compiled deployed site dependency must retain its exact ownership",
);
assert.throws(
  () => verifyProjectOwnership(resolve(".."), {
    [publicationOwnerFile]: publicationOwnerText.replace(
      "path: web/contract-observatory/src/site.ts",
      "path: web/contract-observatory/src/visual-host.mjs",
    ),
  }),
  /Contract Observatory site source dependency relation coverage mismatches/,
  "a different existing visual host is not part of the deployed site source graph",
);
assert.throws(
  () => verifyProjectOwnership(resolve(".."), {
    [publicationOwnerFile]: publicationOwnerText.replace(
      "  - predicates: [verified_by]\n    target:\n      kind: artifact\n      path: web/contract-observatory/test/site.test.ts\n", ""),
  }),
  /Contract Observatory executed tests relation coverage mismatches/,
  "a test actually invoked by Pages cannot silently lose its verifier relation",
);

// RED receipt synchronize: keep this commit test-only until behavioral failure is observed.
const repositoryRoot = resolve("..");

const EXPECTED_NATIVE_VERIFIED_BY: readonly string[] = Object.freeze([
  "ts/test/docs-current-surface.test.ts",
  "ts/test/docs-size-budget.test.ts",
  "ts/test/docs-sync.test.ts",
  "ts/test/release-cutover.test.ts",
  "ts/test/v015-boolean-package-replay-a2.test.ts",
  "ts/test/v015-compact-and-approved-source-integrity.test.ts",
  "ts/test/v015-compact-not-approved-source-integrity.test.ts",
  "ts/test/v015-compact-or-approved-source-integrity.test.ts",
  "ts/test/v015-compact-xor-approved-source-integrity.test.ts",
  "ts/test/v015-context-authority-closure-c1.test.ts",
  "ts/test/v015-context-theory-self-contained-a6.test.ts",
  "ts/test/v015-direct-formal-source-b20.test.ts",
  "ts/test/v015-direct-json-denotation-das-a2b.test.ts",
  "ts/test/v015-direct-structural-aspects-s1.test.ts",
  "ts/test/v015-exact-finite-support-necessity-a10.test.ts",
  "ts/test/v015-final-readiness-r3.test.ts",
  "ts/test/v015-finite-materialized-reaction-a12.test.ts",
  "ts/test/v015-formal-decoder-b2.test.ts",
  "ts/test/v015-formal-exact-sequence-b7.test.ts",
  "ts/test/v015-formal-json-j1-b9.test.ts",
  "ts/test/v015-formal-production-refinement-f1.test.ts",
  "ts/test/v015-formal-proof-assurance-f0.test.ts",
  "ts/test/v015-frozen-replay-artifact-integrity.test.ts",
  "ts/test/v015-grounded-approved-source-integrity.test.ts",
  "ts/test/v015-independent-readiness-r2.test.ts",
  "ts/test/v015-parallel-reaction-reduction-a11.test.ts",
  "ts/test/v015-positive-aset-currentness-a8.test.ts",
  "ts/test/v015-requirements-traceability-r0.test.ts",
  "ts/test/v015-rule-bundle-denotation-das-a2c.test.ts",
  "ts/test/v015-self-contained-context-freeze-resume-a5.test.ts",
  "ts/test/v015-source-anet-denotation-core-das-a2a.test.ts",
  "ts/test/v015-structural-aset-gamma-antidrift-a9c.test.ts",
  "ts/test/v015-structural-aset-gamma-core-a9a.test.ts",
  "ts/test/v015-structural-aset-role-bundle-a9b.test.ts",
  "ts/test/v015-two-role-approved-source-integrity.test.ts",
]);

const G14_TRANSITIONED_CURRENT_ASSURANCE: readonly string[] = Object.freeze([
  "ts/test/portable-derivation.test.ts",
  "ts/test/portable-derivation-digest.test.ts",
  "ts/test/proof-infrastructure.test.ts",
]);

const EXPECTED_CURRENT_ASSURANCE: readonly string[] = Object.freeze([
  "ts/test/historical-images-protection.test.ts",
  "ts/test/portable-derivation-digest.test.ts",
  "ts/test/portable-derivation.test.ts",
  "ts/test/proof-infrastructure.test.ts",
  "ts/test/public-api.test.ts",
  "ts/test/test-tier.test.ts",
  "ts/test/v015-documentation-acceptance.test.ts",
  "ts/test/v015-semantic-metamodel-evidence-verifier-v02.test.ts",
]);

const EXPECTED_BOUNDED_CURRENTIZATION: readonly string[] = Object.freeze([]);
// G14 RED-first: these exact role assertions fail against the pre-fix 5/3 production partition.

const PRE_G14_CURRENT_ASSURANCE = Object.freeze(
  EXPECTED_CURRENT_ASSURANCE.filter(
    (path) => !G14_TRANSITIONED_CURRENT_ASSURANCE.includes(path),
  ),
);

const EXPECTED_PRE_G14_CURRENT = Object.freeze(
  [...new Set([
    ...EXPECTED_NATIVE_VERIFIED_BY,
    ...PRE_G14_CURRENT_ASSURANCE,
    ...G14_TRANSITIONED_CURRENT_ASSURANCE,
  ])].sort(),
);

const EXPECTED_TARGET_CURRENT = Object.freeze(
  [...new Set([
    ...EXPECTED_NATIVE_VERIFIED_BY,
    ...EXPECTED_CURRENT_ASSURANCE,
    ...EXPECTED_BOUNDED_CURRENTIZATION,
  ])].sort(),
);

assert.equal(EXPECTED_NATIVE_VERIFIED_BY.length, 35);
assert.equal(PRE_G14_CURRENT_ASSURANCE.length, 5);
assert.equal(EXPECTED_CURRENT_ASSURANCE.length, 8);
assert.equal(EXPECTED_BOUNDED_CURRENTIZATION.length, 0);
assert.equal(EXPECTED_PRE_G14_CURRENT.length, 43);
assert.equal(EXPECTED_TARGET_CURRENT.length, 43);
assert.deepEqual(
  EXPECTED_TARGET_CURRENT,
  EXPECTED_PRE_G14_CURRENT,
  "G14 sunset changes lifecycle roles only; exact CURRENT membership is byte/logically identical",
);

const plan = buildTestTierPlan(repositoryRoot);
const executionPlan = plan as typeof plan & {
  readonly nativeVerifiedByCurrentSourceTests: readonly string[];
  readonly currentAssuranceSourceTests: readonly string[];
  readonly boundedCurrentizationSourceTests: readonly string[];
  readonly boundedCurrentizationTests: readonly {
    readonly path: string;
    readonly sunset: string;
  }[];
  readonly evidenceRoutingSources: readonly string[];
};

// P6-D1 had exactly 170 FULL tests; P6-D2 may retire historical tests without changing
// the durable CURRENT owners. Guard actual FULL coverage rather than freezing a past census.
const physicalFullTestPaths = readdirSync(resolve(repositoryRoot, "ts/test"))
  .filter((name) => name.endsWith(".test.ts"))
  .map((name) => `ts/test/${name}`)
  .sort();
assert.deepEqual(
  plan.allSourceTests,
  physicalFullTestPaths,
  "FULL must contain every physical test exactly once, without stale or synthetic paths",
);
const RETIRED_P6_D2_RESEARCH_PATHS = Object.freeze([
  "ts/test/research-v013-branch-skew-completion-falsifier-a72s.test.ts",
  "ts/test/research-v013-readiness-scope-review-a73s.test.ts",
  "ts/test/research-v013-rule-self-authoring-gap-a71c.test.ts",
  "ts/test/research-v013-self-admission-local-index-a73i.test.ts",
  "ts/test/research-v013-source-occurrence-authority-a71q.test.ts",
  "ts/test/research-v013-universal-aspect-dataflow-a71o.test.ts",
  // Second bounded retirement: only two research tests with zero observed references.
  "ts/test/research-historical-coq-self-context.test.ts",
  "ts/test/research-post-v013-amemory-recurrence-e5-w6.test.ts",
  // Historical v0.11 executable witnesses; no current v0.15 or theorem routing.
  "ts/test/research-minimal-sign-basis-c2.test.ts",
  "ts/test/research-zero-context-genesis.test.ts",
]);
for (const path of RETIRED_P6_D2_RESEARCH_PATHS) {
  assert.equal(
    plan.allSourceTests.includes(path),
    false,
    `P6-D2 retired historical research test must not be silently reintroduced: ${path}`,
  );
}
assert.equal(plan.currentSourceTests.length, 43, "G11-S2 RED-1/2: CURRENT must contract from 370 to exact 43");
assert.equal(plan.machineReferencedSourceTests.length, 111, "evidence-reference diagnostic remains exact 111");
assert.deepEqual(plan.currentSourceTests, EXPECTED_TARGET_CURRENT, "G11-S2 RED-2: exact CURRENT identity, not count only");
assert.deepEqual(
  executionPlan.nativeVerifiedByCurrentSourceTests,
  EXPECTED_NATIVE_VERIFIED_BY,
  "native verified_by projection owns exact 35 CURRENT tests",
);
assert.deepEqual(
  executionPlan.currentAssuranceSourceTests,
  EXPECTED_CURRENT_ASSURANCE,
  "G14 sunset: explicit current-assurance owner set is exact 8",
);
assert.deepEqual(
  executionPlan.boundedCurrentizationSourceTests,
  EXPECTED_BOUNDED_CURRENTIZATION,
  "G14 sunset: bounded currentization owner set is empty",
);
assert.ok(
  Array.isArray(executionPlan.boundedCurrentizationTests),
  "G14 metadata invariant: bounded currentization lifecycle surface remains present",
);
assert.deepEqual(
  executionPlan.boundedCurrentizationSourceTests,
  executionPlan.boundedCurrentizationTests.map((item) => item.path).sort(),
  "G14 metadata invariant: bounded execution paths are derived from metadata-bearing lifecycle entries",
);
assert.deepEqual(
  executionPlan.boundedCurrentizationTests,
  [],
  "G14 metadata invariant: all currently bounded obligations are sunset while metadata surface remains inspectable",
);

for (const path of G14_TRANSITIONED_CURRENT_ASSURANCE) {
  assert.equal(
    executionPlan.currentAssuranceSourceTests.includes(path),
    true,
    `G14 sunset role transition: CURRENT_ASSURANCE owns exact path: ${path}`,
  );
  assert.equal(
    executionPlan.boundedCurrentizationSourceTests.includes(path),
    false,
    `G14 sunset role transition: BOUNDED_CURRENTIZATION no longer owns exact path: ${path}`,
  );
  assert.equal(
    plan.currentSourceTests.includes(path),
    true,
    `G14 sunset role transition: exact path remains CURRENT: ${path}`,
  );
  assert.equal(
    plan.allSourceTests.includes(path),
    true,
    `G14 sunset role transition: exact path remains FULL: ${path}`,
  );
}
assert.ok(
  executionPlan.evidenceRoutingSources.includes("theorems/current-v0.15.json"),
  "current theorem capsule remains an evidence-routing surface",
);
assert.equal(
  executionPlan.evidenceRoutingSources.includes("theorems/current-v0.14.json"),
  false,
  "historical v0.14 theorem index is not a current evidence-routing surface",
);
assert.equal(
  executionPlan.evidenceRoutingSources.includes("theorems/registry.json"),
  false,
  "historical v0.13 theorem registry is not a current evidence-routing surface",
);

const allSet = new Set(plan.allSourceTests);
const currentSet = new Set(plan.currentSourceTests);
const referencedSet = new Set(plan.machineReferencedSourceTests);

for (const path of EXPECTED_TARGET_CURRENT) {
  assert.ok(allSet.has(path), `accepted CURRENT target must physically exist: ${path}`);
}
for (const path of plan.currentSourceTests) {
  assert.ok(allSet.has(path), `CURRENT path must be in FULL: ${path}`);
}
for (const path of plan.machineReferencedSourceTests) {
  assert.ok(allSet.has(path), `evidence-referenced test must physically exist: ${path}`);
}

assert.equal(
  currentSet.has("ts/test/v016-functional-formal-t09.test.ts"),
  false,
  "G11-S2 RED-1: v0.16 development witness must leave CURRENT despite non-research filename",
);
assert.equal(
  allSet.has("ts/test/v016-functional-formal-t09.test.ts"),
  false,
  "P6-D1: retired v0.16 development witness is recoverable from Git history, not a current FULL obligation",
);
assert.equal(
  currentSet.has("ts/test/v015-semantic-metamodel-evidence-verifier.test.ts"),
  false,
  "historical v01 remains FULL-only",
);
assert.equal(
  allSet.has("ts/test/v015-semantic-metamodel-evidence-verifier.test.ts"),
  false,
  "P6-D1: retired v01 is preserved by Git history, not forced into current HEAD",
);
assert.equal(
  currentSet.has("ts/test/v015-semantic-metamodel-evidence-verifier-v02.test.ts"),
  true,
  "v02 remains CURRENT through explicit current assurance",
);

const f3bWitness = "ts/test/research-v013-explicit-zero-image-a72y.test.ts";
assert.equal(referencedSet.has(f3bWitness), true, "F3B witness remains evidence-referenced");
assert.equal(currentSet.has(f3bWitness), false, "G11-S2 RED-8: F3B evidence witness must leave CURRENT");
assert.equal(allSet.has(f3bWitness), true, "F3B witness remains FULL");

assert.deepEqual(selectTestTier(plan, "full"), plan.allSourceTests);
assert.deepEqual(selectTestTier(plan, "current"), plan.currentSourceTests);

const classify = classifyTestPaths as unknown as (
  allSourceTests: readonly string[],
  evidenceReferencedSourceTests: readonly string[],
  explicitCurrentSourceTests: readonly string[],
) => ReturnType<typeof classifyTestPaths>;

const synthetic = classify(
  [
    "ts/test/core.test.ts",
    "ts/test/ownerless.test.ts",
    "ts/test/research-evidence.test.ts",
    "ts/test/v015-semantic-metamodel-evidence-verifier.test.ts",
  ],
  ["ts/test/research-evidence.test.ts"],
  ["ts/test/core.test.ts"],
);
assert.deepEqual(
  synthetic.currentSourceTests,
  ["ts/test/core.test.ts"],
  "G11-S2 RED-4: arbitrary non-research filename does not create execution authority",
);
assert.equal(
  synthetic.currentSourceTests.includes("ts/test/research-evidence.test.ts"),
  false,
  "evidence reference alone does not create CURRENT",
);
assert.equal(
  synthetic.currentSourceTests.includes("ts/test/ownerless.test.ts"),
  false,
  "physical existence and non-research filename do not create CURRENT",
);

assert.throws(
  () => classify(["ts/test/core.test.ts"], ["ts/test/missing.test.ts"], ["ts/test/core.test.ts"]),
  /machine-readable evidence references missing test/,
  "evidence target existence remains fail-closed",
);
assert.throws(
  () => classify(["ts/test/core.test.ts"], [], ["ts/test/missing.test.ts"]),
  /current.*missing|missing.*current/i,
  "selected CURRENT path must exist physically",
);
assert.throws(
  () => classify(
    ["ts/test/v015-semantic-metamodel-evidence-verifier.test.ts"],
    [],
    ["ts/test/v015-semantic-metamodel-evidence-verifier.test.ts"],
  ),
  /historical.*current|current.*historical/i,
  "historical v01 cannot be selected as CURRENT",
);
assert.throws(
  () => classify(["ts/test/core.test.ts"], [], ["ts/test/nested/core.test.ts"]),
  /invalid.*test path|test path.*invalid|missing/i,
  "execution selector accepts only flat ts/test/*.test.ts paths",
);

const fixtureRoot = mkdtempSync(join(tmpdir(), "mts-test-tier-s2-"));
try {
  const copy = (path: string): void => {
    const target = resolve(fixtureRoot, path);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(resolve(repositoryRoot, path), target);
  };

  for (const path of [
    "requirements/mts-v0.15.json",
    "traceability/mts-v0.15.json",
    "contracts/mts-contract-v0.15.json",
    "contracts/mts-conformance-v0.15.json",
    "cutover/typescript-c1-acceptance-v0.8.json",
    "proofs/provers.json",
    "theorems/current-v0.15.json",
    "theorems/current-v0.14.json",
  ]) {
    copy(path);
  }

  const currentMarkdownSurface = listRepositoryMarkdownSurface(repositoryRoot)
    .filter((path) => path !== THEOREM_CATALOG_PATH);
  assert.equal(currentMarkdownSurface.length, 12);
  for (const path of currentMarkdownSurface) copy(path);

  const nativeV015RequirementPaths = readdirSync(resolve(repositoryRoot, "requirements/mts-v0.15"), { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".rg.yaml"))
    .map((entry) => `requirements/mts-v0.15/${entry.name}`)
    .sort((left, right) => left.localeCompare(right, "en"));
  assert.equal(nativeV015RequirementPaths.length, 48);
  for (const path of nativeV015RequirementPaths) copy(path);

  for (const path of plan.allSourceTests) {
    const target = resolve(fixtureRoot, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, "", "utf8");
  }

  const fixturePlan = buildTestTierPlan(fixtureRoot);
  assert.deepEqual(fixturePlan, plan, "isolated accepted fixture reproduces exact repository plan");

  const removeExactReference = (value: any, target: string): number => {
    if (Array.isArray(value)) {
      let removed = 0;
      for (let index = value.length - 1; index >= 0; index -= 1) {
        if (value[index] === target) {
          value.splice(index, 1);
          removed += 1;
        } else {
          removed += removeExactReference(value[index], target);
        }
      }
      return removed;
    }
    if (value !== null && typeof value === "object") {
      let removed = 0;
      for (const item of Object.values(value)) removed += removeExactReference(item, target);
      return removed;
    }
    return 0;
  };

  const historicalTheoremPath = resolve(fixtureRoot, "theorems/current-v0.14.json");
  const historicalTheoremSource = readFileSync(historicalTheoremPath, "utf8");
  const historicalTheoremMutation = JSON.parse(historicalTheoremSource) as any;
  assert.equal(removeExactReference(historicalTheoremMutation, f3bWitness), 2);
  writeFileSync(historicalTheoremPath, JSON.stringify(historicalTheoremMutation), "utf8");
  assert.deepEqual(
    buildTestTierPlan(fixtureRoot),
    fixturePlan,
    "historical theorem-index mutation remains execution/evidence-routing neutral",
  );
  writeFileSync(historicalTheoremPath, historicalTheoremSource, "utf8");

  const currentTheoremPath = resolve(fixtureRoot, "theorems/current-v0.15.json");
  const currentTheoremSource = readFileSync(currentTheoremPath, "utf8");
  const currentTheoremMutation = JSON.parse(currentTheoremSource) as any;
  assert.equal(removeExactReference(currentTheoremMutation, f3bWitness), 2);
  writeFileSync(currentTheoremPath, JSON.stringify(currentTheoremMutation), "utf8");
  const theoremRemovalPlan = buildTestTierPlan(fixtureRoot);
  assert.deepEqual(
    theoremRemovalPlan.currentSourceTests,
    fixturePlan.currentSourceTests,
    "G11-S2 RED-6: theorem evidence removal must not change CURRENT",
  );
  assert.equal(
    theoremRemovalPlan.machineReferencedSourceTests.length,
    fixturePlan.machineReferencedSourceTests.length - 1,
    "theorem evidence removal changes diagnostics only",
  );
  writeFileSync(currentTheoremPath, currentTheoremSource, "utf8");

  const conformanceWitness = "ts/test/research-v012-interpreter-delta-c2.test.ts";
  const conformancePath = resolve(fixtureRoot, "contracts/mts-conformance-v0.15.json");
  const conformanceSource = readFileSync(conformancePath, "utf8");
  const conformanceMutation = JSON.parse(conformanceSource) as any;
  assert.ok(removeExactReference(conformanceMutation, conformanceWitness) > 0);
  writeFileSync(conformancePath, JSON.stringify(conformanceMutation), "utf8");
  const conformanceRemovalPlan = buildTestTierPlan(fixtureRoot);
  assert.deepEqual(
    conformanceRemovalPlan.currentSourceTests,
    fixturePlan.currentSourceTests,
    "G11-S2 RED-6: conformance evidence removal must not change CURRENT",
  );
  assert.equal(
    conformanceRemovalPlan.machineReferencedSourceTests.length,
    fixturePlan.machineReferencedSourceTests.length - 1,
    "conformance evidence removal changes diagnostics only",
  );
  writeFileSync(conformancePath, conformanceSource, "utf8");

  const evidenceOnly = "ts/test/research-v013-context-dualization-a75b.test.ts";
  const evidenceAddition = JSON.parse(currentTheoremSource) as any;
  evidenceAddition.g11S2EvidenceOnlyProbe = evidenceOnly;
  writeFileSync(currentTheoremPath, JSON.stringify(evidenceAddition), "utf8");
  const evidenceAdditionPlan = buildTestTierPlan(fixtureRoot);
  assert.deepEqual(
    evidenceAdditionPlan.currentSourceTests,
    fixturePlan.currentSourceTests,
    "G11-S2 RED-6: evidence addition must not promote CURRENT",
  );
  assert.equal(
    evidenceAdditionPlan.machineReferencedSourceTests.length,
    fixturePlan.machineReferencedSourceTests.length + 1,
    "evidence addition changes diagnostics only",
  );
  writeFileSync(currentTheoremPath, currentTheoremSource, "utf8");

  const v02 = "ts/test/v015-semantic-metamodel-evidence-verifier-v02.test.ts";
  const v02Addition = JSON.parse(currentTheoremSource) as any;
  v02Addition.g11S2V02EvidenceProbe = v02;
  writeFileSync(currentTheoremPath, JSON.stringify(v02Addition), "utf8");
  const v02EvidencePlan = buildTestTierPlan(fixtureRoot);
  assert.equal(v02EvidencePlan.currentSourceTests.includes(v02), true);
  assert.deepEqual(
    v02EvidencePlan.currentSourceTests,
    fixturePlan.currentSourceTests,
    "v02 remains CURRENT because of explicit assurance, not evidence coordinates",
  );
  assert.equal(
    v02EvidencePlan.machineReferencedSourceTests.length,
    fixturePlan.machineReferencedSourceTests.length + 1,
  );
  writeFileSync(currentTheoremPath, currentTheoremSource, "utf8");

  const docsNativePath = resolve(fixtureRoot, "requirements/mts-v0.15/V15-DOCS-01.rg.yaml");
  const docsNativeSource = readFileSync(docsNativePath, "utf8");
  const nativeWitness = "ts/test/docs-size-budget.test.ts";
  const nativeNeedle = [
    "  - predicates: [verified_by]",
    "    target:",
    "      kind: artifact",
    `      path: ${nativeWitness}`,
  ].join("\n");
  const nativeReplacement = [
    "  - predicates: [implemented_by]",
    "    target:",
    "      kind: artifact",
    `      path: ${nativeWitness}`,
  ].join("\n");
  assert.ok(docsNativeSource.includes(nativeNeedle), "fixture contains isolated native verified_by witness");
  writeFileSync(docsNativePath, docsNativeSource.replace(nativeNeedle, nativeReplacement), "utf8");
  const nativeMutationPlan = buildTestTierPlan(fixtureRoot) as typeof executionPlan;
  assert.equal(
    nativeMutationPlan.nativeVerifiedByCurrentSourceTests.includes(nativeWitness),
    false,
    "G11-S2 RED-3: native verified_by removal removes native execution authority",
  );
  assert.equal(
    nativeMutationPlan.machineReferencedSourceTests.includes(nativeWitness),
    true,
    "traceability/conformance evidence may still mention witness diagnostically",
  );
  assert.equal(
    nativeMutationPlan.currentSourceTests.includes(nativeWitness),
    false,
    "traceability mirror must not repair removed native execution authority",
  );
  assert.equal(nativeMutationPlan.currentSourceTests.length, 42);
  writeFileSync(docsNativePath, docsNativeSource, "utf8");

  const boundedPath = resolve(fixtureRoot, "ts/test/portable-derivation.test.ts");
  rmSync(boundedPath);
  assert.throws(
    () => buildTestTierPlan(fixtureRoot),
    /current.*missing|missing.*current/i,
    "G14 sunset: missing transitioned current-assurance test fails closed",
  );
  writeFileSync(boundedPath, "", "utf8");

  const policyPath = resolve(fixtureRoot, "repo-policy.json");
  const policySource = JSON.stringify({
    packs: {
      "contract-conformance": {
        current: { contract: { path: "decoy-current-contract" }, conformance: { path: "decoy-current-conformance" } },
        acceptance: { document: { path: "decoy-acceptance" } },
      },
    },
  });
  writeFileSync(policyPath, policySource, "utf8");
  const policy = JSON.parse(policySource) as any;
  policy.packs["contract-conformance"].current.contract.path = "contracts/mts-contract-v0.14.json";
  policy.packs["contract-conformance"].current.conformance.path = "contracts/mts-conformance-v0.14.json";
  policy.packs["contract-conformance"].acceptance.document.path = "cutover/typescript-c1-acceptance-v0.7.json";
  writeFileSync(policyPath, JSON.stringify(policy), "utf8");
  assert.deepEqual(
    buildTestTierPlan(fixtureRoot),
    fixturePlan,
    "repo-policy mutations remain irrelevant to test-tier selection",
  );
  writeFileSync(policyPath, policySource, "utf8");

  const registryPath = resolve(fixtureRoot, "requirements/mts-v0.15.json");
  const registrySource = readFileSync(registryPath, "utf8");
  const registry = JSON.parse(registrySource) as any;
  registry.currentAccepted.contract = "contracts/mts-contract-v0.14.json";
  writeFileSync(registryPath, JSON.stringify(registry), "utf8");
  assert.throws(
    () => buildTestTierPlan(fixtureRoot),
    /v0\.15 registry current accepted contract path mismatch/,
    "accepted native authority inconsistency remains fail-closed",
  );
  writeFileSync(registryPath, registrySource, "utf8");

  const contractPath = resolve(fixtureRoot, "contracts/mts-contract-v0.15.json");
  const contractSource = readFileSync(contractPath, "utf8");
  const conformanceMismatch = JSON.parse(contractSource) as any;
  conformanceMismatch.conformanceCorpus = "contracts/mts-conformance-v0.14.json";
  writeFileSync(contractPath, JSON.stringify(conformanceMismatch), "utf8");
  assert.throws(
    () => buildTestTierPlan(fixtureRoot),
    /v0\.15 contract conformanceCorpus differs from accepted conformance path/,
  );
  writeFileSync(contractPath, contractSource, "utf8");

  const traceabilityMismatch = JSON.parse(contractSource) as any;
  traceabilityMismatch.traceabilityManifest = "traceability/mts-v0.14.json";
  writeFileSync(contractPath, JSON.stringify(traceabilityMismatch), "utf8");
  assert.throws(
    () => buildTestTierPlan(fixtureRoot),
    /v0\.15 contract traceabilityManifest differs from accepted traceability path/,
  );
  writeFileSync(contractPath, contractSource, "utf8");
} finally {
  rmSync(fixtureRoot, { recursive: true, force: true });
}

console.log(
  [
    "G11-S2 test tiers: GREEN",
    `full=${plan.allSourceTests.length}`,
    `current=${plan.currentSourceTests.length}`,
    `native-verified-by=${executionPlan.nativeVerifiedByCurrentSourceTests.length}`,
    `current-assurance=${executionPlan.currentAssuranceSourceTests.length}`,
    `bounded-currentization=${executionPlan.boundedCurrentizationSourceTests.length}`,
    `machine-referenced=${plan.machineReferencedSourceTests.length}`,
  ].join(" "),
);
