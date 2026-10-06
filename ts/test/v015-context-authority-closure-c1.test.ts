// mts-version-evidence: candidate-v0.15-context-authority-closure-c1
// owner: #1987
//
// Closure witness for contextual execution authority.
// It does not implement a new executor. The underlying A5/A6/A8/A9 tests
// execute independently in the same suite; this file binds their invariants
// to the machine-readable architecture/proof authorities.

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

type Json = Record<string, unknown>;

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error("v0.15 CTX authority C1: " + message);
}
function record(value: unknown, message: string): Json {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), message);
  return value as Json;
}
function text(value: unknown, message: string): string {
  assert(typeof value === "string" && value.length > 0, message);
  return value;
}
function strings(value: unknown, message: string): readonly string[] {
  assert(Array.isArray(value) && value.every((item) => typeof item === "string"), message);
  return value as string[];
}
function read(root: string, path: string): string {
  return readFileSync(join(root, path), "utf8");
}
function json(root: string, path: string): Json {
  return JSON.parse(read(root, path)) as Json;
}
function includesAll(source: string, markers: readonly string[], label: string): void {
  for (const marker of markers) {
    assert(source.includes(marker), label + " marker: " + marker);
  }
}

const root = resolve(process.cwd(), "..");

const a5 = read(root, "ts/test/v015-self-contained-context-freeze-resume-a5.test.ts");
const a6 = read(root, "ts/test/v015-context-theory-self-contained-a6.test.ts");
const a8 = read(root, "ts/test/v015-positive-aset-currentness-a8.test.ts");
const a9 = read(root, "ts/test/v015-structural-aset-one-command-a9.test.ts");
const das = read(root, "ts/test/v015-native-source-anet-denotation-das-a2.test.ts");

includesAll(a5, [
  "EXTERNAL_CURRENT_CONTEXT_POINTER=0",
  "EXTERNAL_CURRENT_SCOPE_POINTER=0",
  "EXTERNAL_PROGRAM_COUNTER=0",
  "WHOLE_MEMORY_CANONICAL_FREEZE_TRANSFER_RESTORE=GREEN",
  "RESUME_WITHOUT_SERIALIZED_CONTEXT_HANDLE=GREEN",
], "A5");

includesAll(a6, [
  "EXECUTION_ENVIRONMENT=C_TO_THEORY",
  "EXTERNAL_SELECTED_THEORY_POINTER=0",
  "EXTERNAL_CURRENT_SCOPE_POINTER=0",
  "THEORY_DERIVED_FROM_CONTEXT_ANCESTRY=TRUE",
  "FOREIGN_THEORY_ISOLATION=TRUE",
  "NEXT_REACTION_NEW_ADMISSION_EXECUTABLE=TRUE",
], "A6");

includesAll(a8, [
  "CURRENTNESS=POSITIVE_ASET_MEMBERSHIP",
  "EXTERNAL_CURRENT_POINTER=0",
  "EXTERNAL_SCOPE_POINTER=0",
  "APPEND_ONLY_PHYSICAL_LINK_PRESENCE_IS_CURRENTNESS_AUTHORITY=FALSE",
  "THEORY_AUTHORITY=ASET_MEMBERSHIP",
  "CURRENT_TRUTHS_RECONSTRUCT_WITHOUT_POINTER=TRUE",
], "A8");

includesAll(a9, [
  "COMMAND=GAMMA_STRUCTURAL_ASET_OF_M",
  "EXTERNAL_CURRENT_POINTER=0",
  "EXTERNAL_SCOPE_POINTER=0",
  "EXTERNAL_SELECTED_THEORY_POINTER=0",
  "PRE_GROUNDER_COMMAND=0_FOR_TESTED_VECTOR",
  "CURRENTNESS=POSITIVE_ASET_MEMBERSHIP_WITNESS",
  "THEORY_AUTHORITY=REACTION_START_ASET_MEMBERSHIP_SNAPSHOT",
  "S1_MATCH_BIND=READ_ONLY_COMPLETE_PLAN",
  "S2_INSTANTIATION=AFTER_COMPLETE_PLAN",
  "PUBLICATION=ATOMIC_SEMANTIC_MEMBERSHIP_REWRITE",
  "CROSS_MEMBER_JOIN=0",
], "A9");

includesAll(das, [
  "PHYSICAL_EXISTENCE_IMPLIES_MEMBERSHIP=FALSE",
  "CURRENTNESS_REQUIRES_MEMBERSHIP=TRUE",
  "CURRENTNESS_MEMBERSHIP_MOVE=GREEN",
  "PRESENTATION_RENAME_MEMBERSHIP_INVARIANT=GREEN",
  "HOST_GLOBAL_ATOM_NAMESPACE_AUTHORITY=FALSE",
], "DAS");

const model = json(root, "profiles/mts-v015-meta-interpreter-model.json");
const knownBoundaries = model.knownBoundaries;
assert(Array.isArray(knownBoundaries), "meta-interpreter knownBoundaries");
const boundaryById = new Map(
  (knownBoundaries as Json[]).map((item) => [text(item.id, "boundary id"), item]),
);
for (const id of ["MI-B08", "MI-B09", "MI-B12", "MI-B13", "MI-B18"]) {
  const boundary = boundaryById.get(id);
  assert(boundary !== undefined, "boundary exists: " + id);
  assert(text(boundary.status, id + " status") === "PROVED_RESEARCH", id + " proved research");
}

const context = record(model.contextCandidate, "contextCandidate");
assert(text(context.status, "context status") === "PROVED_RESEARCH", "context candidate proved");
assert(text(context.authorDecision, "context Author decision") === "APPROVED_FOR_V015", "C boundary Author approved");
assert(text(context.directGaugeBoundary, "direct gauge boundary") === "C", "direct gauge C");

const target = record(model.targetOrganization, "targetOrganization");
const substrate = record(target.externalSubstrate, "externalSubstrate");
const forbidden = new Set(strings(substrate.forbiddenSemanticInputs, "forbidden semantic inputs"));
for (const item of [
  "external current Context pointer",
  "external program counter",
  "external selected Scope pointer",
  "program-specific opcode dispatch",
  "logical-element-specific executor",
]) {
  assert(forbidden.has(item), "external substrate forbids: " + item);
}

const gpr = json(root, "proofs/v015-external-proof-assurance.json");
const allowed = record(gpr.allowedGlobalAxioms, "allowedGlobalAxioms");
assert(Array.isArray(allowed.lean4) && allowed.lean4.length === 0, "Lean4 global axiom allowlist empty");
assert(Array.isArray(allowed.rocq) && allowed.rocq.length === 0, "Rocq global axiom allowlist empty");
const targets = gpr.targets;
assert(Array.isArray(targets), "GPR targets");
const targetById = new Map((targets as Json[]).map((item) => [text(item.id, "GPR id"), item]));
for (const id of ["GPR-01", "GPR-03", "GPR-07", "GPR-08", "GPR-09"]) {
  const targetItem = targetById.get(id);
  assert(targetItem !== undefined, "GPR target exists: " + id);
  assert(text(targetItem.classification, id + " classification").startsWith("PROVED_"), id + " proved");
}

// Static anti-drift: the selected one-command Gamma source must not regain
// external semantic cursors or a program-specific dispatch path.
const gammaStart = a9.indexOf("function gammaStructuralAset(");
const gammaEnd = a9.indexOf("\nfunction currentTruths(", gammaStart);
assert(gammaStart >= 0 && gammaEnd > gammaStart, "A9 Gamma source slice");
const gamma = a9.slice(gammaStart, gammaEnd);
for (const forbiddenToken of [
  "selectedTheory",
  "selectedScope",
  "currentScope",
  "currentPointer",
  "programCounter",
  "RuleKind",
  "opcode",
  "triggerKey",
]) {
  assert(!gamma.includes(forbiddenToken), "Gamma excludes host semantic authority: " + forbiddenToken);
}

console.log([
  "MTS_V015_CTX_AUTHORITY_C1=COMPONENT_GREEN_EVIDENCE",
  "CURRENTNESS=SEMANTIC_ANET_MEMBERSHIP",
  "THEORY_AUTHORITY=SEMANTIC_ANET_MEMBERSHIP_OR_LINK_ANCESTRY",
  "PHYSICAL_EXISTENCE_ALONE=NO_AUTHORITY",
  "HOST_POINTER_AUTHORITY=0",
  "HOST_NAME_AUTHORITY=0",
  "FOREIGN_THEORY=INERT",
  "FREEZE_RESUME_WITHOUT_SIDECAR=GREEN",
  "ONE_GAMMA_STRUCTURAL_EXECUTION=GREEN",
  "EXTERNAL_GROUNDER_COMMAND=0",
  "GPR_PROOF_CLOSURE=GREEN",
].join(" "));
