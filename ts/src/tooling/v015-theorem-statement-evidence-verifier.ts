import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { findRepositoryRoot } from "./docs-sync.js";

type Obj = Record<string, unknown>;

export interface V015TheoremStatementEvidenceRequest {
  readonly id: string;
  readonly role: string;
  readonly source: string;
  readonly formalSourceSha256: string;
  readonly expectedSemanticAnetSha256: string;
  readonly stages: readonly string[];
}

export interface V015TheoremStatementEvidenceReceipt {
  readonly profile: "mts-v015-theorem-statement-evidence/v0.1";
  readonly outcome: "PASS";
  readonly caseId: string;
  readonly formalSourceSha256: string;
  readonly semanticAnetSha256: string;
  readonly runnerSourceSha256: string;
}

interface CaseSpec {
  readonly theoremId: string;
  readonly source: string;
  readonly formalSourcePath: string;
  readonly testBlobSha: string;
  readonly proofClosure: string;
  readonly formalArtifactKind: string;
  readonly outputMarkers: readonly string[];
}

const CASES: Readonly<Record<string, CaseSpec>> = Object.freeze({
  "F0063": {
    "theoremId": "FND-01",
    "source": "FND01_STATEMENT : FND01_PREMISES->FND01_CONCLUSION",
    "formalSourcePath": "ts/test/v015-fnd01-formal-statement-b18.test.ts",
    "testBlobSha": "c8c4057c2016c09b8537cdf1ac752280ce6a184a",
    "proofClosure": "NO_PROOF_ARTIFACT",
    "formalArtifactKind": "STATEMENT_ONLY",
    "outputMarkers": [
      "MTS v0.15 B18 FND-01 FORMAL statement:",
      "JSON_J1=EXACT",
      "NATIVE_PROOF=NOT_CLAIMED",
      "APROVER_ACCEPT=NOT_CLAIMED"
    ]
  },
  "F0067": {
    "theoremId": "FND-02",
    "source": "FND02_STATEMENT : FND02_PREMISES->FND02_RULE",
    "formalSourcePath": "ts/test/v015-formal-bound-link-role-b12.test.ts",
    "testBlobSha": "31d89067ce1508bb2786f4453e7b33964be7a187",
    "proofClosure": "N_A_FOR_KERNEL_REALIZATION",
    "formalArtifactKind": "KERNEL_REALIZATION",
    "outputMarkers": [
      "FND02_BOUNDARY=A1_FORALL_LINK_FULLSELF_IMPLIES_ROOT",
      "KERNEL_CLASSIFICATION=KERNEL_REALIZED_NOT_INDEPENDENT",
      "UNIVERSAL_PROOF=NOT_CLAIMED"
    ]
  },
  "F0071": {
    "theoremId": "FND-13",
    "source": "FND13_STATEMENT : FND13_PREMISES->FND13_RULES",
    "formalSourcePath": "ts/test/v015-formal-bound-link-role-b12.test.ts",
    "testBlobSha": "31d89067ce1508bb2786f4453e7b33964be7a187",
    "proofClosure": "N_A_FOR_KERNEL_REALIZATION",
    "formalArtifactKind": "KERNEL_REALIZATION",
    "outputMarkers": [
      "FND13_BOUNDARY=GROUNDED_ORDERED_POLE_IDENTITY",
      "FND13_KERNEL_CLASSIFICATION=KERNEL_REALIZED_NOT_INDEPENDENT",
      "FND13_REPLAY_READ_ONLY=GREEN"
    ]
  },
  "F0084": {
    "theoremId": "FND-07",
    "source": "FND07_STATEMENT : TARGET_PREMISES->TARGET_CONCLUSION",
    "formalSourcePath": "ts/test/v015-fnd07-ordinary-formal-proof-p2.test.ts",
    "testBlobSha": "f826c4d38ab6d7b09502c870efe7ad2f46bf58bb",
    "proofClosure": "CLOSED",
    "formalArtifactKind": "CLOSED_PROOF",
    "outputMarkers": [
      "TRACKED_FND07_ARTIFACT=BYTE_EXACT",
      "JSON_J1_PROOF_SOURCE=BYTE_EXACT",
      "PROOF_AUTHORITY=GENERIC_REPLAY_ONLY"
    ]
  },
  "F0090": {
    "theoremId": "FND-08",
    "source": "FND08_STATEMENT : TARGET_PREMISES->G_RESULT",
    "formalSourcePath": "ts/test/v015-fnd08-open-formal-b14b1.test.ts",
    "testBlobSha": "0e5216073c0e05d2cbb4c9666e1b6ab017447825",
    "proofClosure": "OPEN_CONDITIONAL",
    "formalArtifactKind": "OPEN_PROOF",
    "outputMarkers": [
      "FND08_SELECTED_THEORY_SEMANTICS=EXPLICIT_OPEN_PREMISE",
      "JSON_J1_OPEN_PROOF=EXACT",
      "INDEPENDENT_CLOSED_NATIVE_PROOF=NOT_CLAIMED",
      "APROVER_ACCEPT=NOT_CLAIMED"
    ]
  },
  "F0094": {
    "theoremId": "FND-09",
    "source": "FND09_STATEMENT : TARGET_PREMISES->G_RESULT",
    "formalSourcePath": "ts/test/v015-fnd09-open-formal-b14b2.test.ts",
    "testBlobSha": "9a0a6b2abc98b5692e236c5a4955d62f40f18ca2",
    "proofClosure": "OPEN_CONDITIONAL",
    "formalArtifactKind": "OPEN_PROOF",
    "outputMarkers": [
      "SELECTED_THEORY_REACTION_SEMANTICS=ONLY_OPEN_PREMISE",
      "JSON_J1_OPEN_PROOF=EXACT",
      "INDEPENDENT_CLOSED_NATIVE_PROOF=NOT_CLAIMED",
      "APROVER_ACCEPT=NOT_CLAIMED"
    ]
  },
  "F0116": {
    "theoremId": "EXE-02",
    "source": "EXE02_STATEMENT : EXE02_PREMISES->EXE02_CLAUSES",
    "formalSourcePath": "ts/test/v015-exe02-formal-statement-b17.test.ts",
    "testBlobSha": "3cfc5ea70978814f01ba03f4379cbad7833d7afe",
    "proofClosure": "NO_PROOF_ARTIFACT",
    "formalArtifactKind": "STATEMENT_ONLY",
    "outputMarkers": [
      "MTS v0.15 B17 EXE-02 FORMAL statement:",
      "JSON_J1=EXACT",
      "NATIVE_PROOF=NOT_CLAIMED",
      "APROVER_ACCEPT=NOT_CLAIMED"
    ]
  }
});
const STAGES = ["grammar", "denotation", "semanticLinks", "theoremMapping"] as const;

function fail(message: string): never {
  throw new Error("v015-theorem-statement-evidence-verifier: " + message);
}
function assertFact(condition: boolean, message: string): void {
  if (!condition) fail(message);
}
function obj(value: unknown, label: string): Obj {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return fail(label + " must be an object");
  }
  return value as Obj;
}
function arr(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) return fail(label + " must be an array");
  return value;
}
function strings(value: unknown, label: string): string[] {
  return arr(value ?? [], label).map((item, index) => {
    if (typeof item !== "string") return fail(label + "[" + index + "] must be a string");
    return item;
  });
}
function gitBlobSha1(source: string): string {
  return createHash("sha1")
    .update("blob " + Buffer.byteLength(source, "utf8") + "\0")
    .update(source, "utf8").digest("hex");
}
function spec(id: string): CaseSpec {
  const value = CASES[id];
  if (value === undefined) return fail("unsupported theorem documentation occurrence " + id);
  return value;
}
function overlayEntry(root: string, theoremId: string): Obj {
  const overlay = obj(JSON.parse(readFileSync(resolve(root, "theorems/formal-v0.15.json"), "utf8")) as unknown,
    "theorems/formal-v0.15.json");
  assertFact(overlay.schema === "mts-formal-theorem-overlay/v0.4", "unexpected theorem overlay schema");
  assertFact(overlay.authority === "formal-migration-descriptor-only", "theorem overlay authority changed");
  const entry = arr(overlay.entries, "theorem overlay entries")
    .map((value, index) => obj(value, "theorem overlay entry " + index))
    .find((value) => value.id === theoremId);
  if (entry === undefined) return fail("missing theorem overlay entry " + theoremId);
  return entry;
}

function staticIdentity(id: string, source: string): Obj {
  const root = findRepositoryRoot();
  const expected = spec(id);
  assertFact(source === expected.source, "source differs from exact theorem statement occurrence");

  const entry = overlayEntry(root, expected.theoremId);
  assertFact(entry.migrationStatus === "FORMAL_MIGRATED", expected.theoremId + " is not FORMAL_MIGRATED");
  assertFact(entry.formalStatement === source, expected.theoremId + " overlay statement differs");
  assertFact(entry.formalSourcePath === expected.formalSourcePath, expected.theoremId + " source owner differs");
  assertFact(entry.proofClosure === expected.proofClosure, expected.theoremId + " proof closure differs");
  assertFact(entry.formalArtifactKind === expected.formalArtifactKind, expected.theoremId + " artifact kind differs");
  assertFact(entry.aproverStatus === "NOT_RECORDED", expected.theoremId + " aprover status was promoted");

  const ownerSource = readFileSync(resolve(root, expected.formalSourcePath), "utf8");
  assertFact(gitBlobSha1(ownerSource) === expected.testBlobSha,
    expected.theoremId + " theorem-owner test Git blob differs");
  assertFact(ownerSource.includes(expected.theoremId),
    expected.theoremId + " theorem-owner test no longer names the mapped theorem");
  for (const marker of expected.outputMarkers) {
    assertFact(ownerSource.includes(marker),
      expected.theoremId + " theorem-owner test no longer contains expected evidence marker " + marker);
  }

  return Object.freeze({
    schema: "mts-v015-theorem-statement-identity/v0.1",
    acceptedVersion: "v0.15",
    occurrenceId: id,
    theoremId: expected.theoremId,
    formalStatement: source,
    migrationStatus: entry.migrationStatus,
    proofClosure: entry.proofClosure,
    formalArtifactKind: entry.formalArtifactKind,
    aproverStatus: entry.aproverStatus,
    formalPremises: strings(entry.formalPremises, expected.theoremId + ".formalPremises"),
    formalDependencies: strings(entry.formalDependencies, expected.theoremId + ".formalDependencies"),
    formalDomain: strings(entry.formalDomain, expected.theoremId + ".formalDomain"),
    formalExistentialDomain: strings(entry.formalExistentialDomain,
      expected.theoremId + ".formalExistentialDomain"),
    formalNonPremises: strings(entry.formalNonPremises, expected.theoremId + ".formalNonPremises"),
    nativeClassification: entry.nativeClassification ?? null,
    kernelLaw: entry.kernelLaw ?? null,
    nativeIndependent: entry.nativeIndependent ?? null,
    formalSourcePath: expected.formalSourcePath,
    theoremOwnerTestBlobSha: expected.testBlobSha,
    executionMarkers: expected.outputMarkers,
  });
}

function executeOwnerTest(expected: CaseSpec): void {
  const root = findRepositoryRoot();
  const testName = basename(expected.formalSourcePath).replace(/\.ts$/, ".js");
  const built = resolve(root, "ts", "dist", "test", testName);
  const execution = spawnSync(process.execPath, [built], {
    cwd: resolve(root, "ts"),
    encoding: "utf8",
    timeout: 90000,
    maxBuffer: 8 * 1024 * 1024,
  });
  if (execution.error !== undefined || execution.signal !== null || execution.status !== 0) {
    return fail(expected.theoremId + " theorem-owner executable test failed");
  }
  for (const marker of expected.outputMarkers) {
    assertFact(execution.stdout.includes(marker),
      expected.theoremId + " executable test output lacks marker " + marker);
  }
}

export function deriveV015TheoremStatementDigest(id: string, source: string): string {
  const canonical = JSON.stringify(staticIdentity(id, source));
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

export function verifyV015TheoremStatementEvidence(
  input: V015TheoremStatementEvidenceRequest,
): V015TheoremStatementEvidenceReceipt {
  assertFact(input.role === "FORMAL_V015_THEOREM_STATEMENT", "unsupported FORMAL role");
  const expected = spec(input.id);
  assertFact(input.source === expected.source, "source/occurrence mapping mismatch");
  assertFact(typeof input.formalSourceSha256 === "string" &&
    /^[0-9a-f]{64}$/.test(input.formalSourceSha256), "invalid source SHA-256");
  assertFact(createHash("sha256").update(input.source, "utf8").digest("hex") ===
    input.formalSourceSha256, "source SHA-256 mismatch");
  assertFact(Array.isArray(input.stages) && input.stages.length === STAGES.length &&
    input.stages.every((stage, index) => stage === STAGES[index]), "unsupported evidence stages");

  const derived = deriveV015TheoremStatementDigest(input.id, input.source);
  assertFact(typeof input.expectedSemanticAnetSha256 === "string" &&
    /^[0-9a-f]{64}$/.test(input.expectedSemanticAnetSha256) &&
    input.expectedSemanticAnetSha256 === derived, "theorem statement semantic identity digest mismatch");

  // This is statement/mapping evidence, not proof escalation. The already owned
  // executable theorem test must still run successfully with its exact pinned blob.
  executeOwnerTest(expected);

  const runner = readFileSync(resolve(
    findRepositoryRoot(), "ts/src/tooling/v015-theorem-statement-evidence-verifier.ts",
  ), "utf8");
  return Object.freeze({
    profile: "mts-v015-theorem-statement-evidence/v0.1",
    outcome: "PASS",
    caseId: input.id,
    formalSourceSha256: input.formalSourceSha256,
    semanticAnetSha256: derived,
    runnerSourceSha256: createHash("sha256").update(runner, "utf8").digest("hex"),
  });
}

const invoked = process.argv[1] === undefined ? undefined : resolve(process.argv[1]);
if (invoked === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv[2] !== "--verify-stdin") fail("use --verify-stdin");
    const raw = JSON.parse(readFileSync(0, "utf8")) as V015TheoremStatementEvidenceRequest;
    process.stdout.write(JSON.stringify(verifyV015TheoremStatementEvidence(raw)) + "\n");
  } catch (error) {
    process.stderr.write(String(error) + "\n");
    process.exitCode = 1;
  }
}
