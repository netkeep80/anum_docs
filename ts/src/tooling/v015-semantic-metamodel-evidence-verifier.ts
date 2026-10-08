import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { findRepositoryRoot } from "./docs-sync.js";

type Obj = Record<string, unknown>;

export interface V015SemanticMetamodelEvidenceRequest {
  readonly id: string;
  readonly role: string;
  readonly source: string;
  readonly formalSourceSha256: string;
  readonly expectedSemanticAnetSha256: string;
  readonly stages: readonly string[];
}

export interface V015SemanticMetamodelEvidenceReceipt {
  readonly profile: "mts-v015-semantic-metamodel-evidence/v0.1";
  readonly outcome: "PASS";
  readonly caseId: string;
  readonly formalSourceSha256: string;
  readonly semanticAnetSha256: string;
  readonly runnerSourceSha256: string;
}

const RULE_ONLY = "Rule = V -> (Antecedent -> ExactSequence(Image...))";
const CORE_THREE = [
  RULE_ONLY,
  "Theory -> Rule ∈ M_t",
  "M_t -> Γ(M_t) -> M_(t+1)",
].join("\n");
const FULL_KERNEL = [
  RULE_ONLY,
  "Theory -> Rule ∈ M_t",
  "|roles(V,M_t)| = 0  -> grounded exact refinement",
  "",
  "M_t -> Γ(M_t) -> M_(t+1)",
  "snapshot -> S1 match/bind -> S2 construct -> 0/1/N image -> atomic publication",
  "J0 = selected",
  "J1 = NOT_REQUIRED",
].join("\n");

const SOURCE_BY_ID = Object.freeze({
  F0005: CORE_THREE,
  F0031: RULE_ONLY,
  F0048: RULE_ONLY,
  F0130: FULL_KERNEL,
} as const);

const STAGES = ["metamodelMapping", "denotation", "semanticLinks"] as const;

function fail(message: string): never {
  throw new Error("v015-semantic-metamodel-evidence-verifier: " + message);
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

function text(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) return fail(label + " must be a string");
  return value;
}

function bool(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") return fail(label + " must be boolean");
  return value;
}

function json(root: string, path: string): Obj {
  return obj(JSON.parse(readFileSync(resolve(root, path), "utf8")) as unknown, path);
}

function requirement(registry: Obj, id: string): Obj {
  const rows = arr(registry.requirements, "requirements/mts-v0.15.json#/requirements");
  const hit = rows.map((row, index) => obj(row, "requirement[" + index + "]"))
    .find((row) => row.id === id);
  if (hit === undefined) return fail("missing requirement " + id);
  return hit;
}

function traceRequirement(trace: Obj, id: string): Obj {
  const rows = obj(trace.requirements, "traceability requirements");
  const hit = rows[id];
  if (hit === undefined) return fail("missing traceability row " + id);
  return obj(hit, "traceability." + id);
}

function strings(value: unknown, label: string): string[] {
  return arr(value, label).map((item, index) => text(item, label + "[" + index + "]"));
}

function sameStrings(left: readonly string[], right: readonly string[], label: string): void {
  assertFact(JSON.stringify(left) === JSON.stringify(right), label + " differs");
}

function includesAll(haystack: readonly string[], needles: readonly string[], label: string): void {
  for (const needle of needles) assertFact(haystack.includes(needle), label + " missing " + needle);
}

function acceptedFacts(root: string): Obj {
  const requirements = json(root, "requirements/mts-v0.15.json");
  const trace = json(root, "traceability/mts-v0.15.json");
  const kernel = json(root, "profiles/mts-v015-meta-interpreter-kernel.json");
  const reaction = json(root, "profiles/mts-v015-generalized-reaction-candidate.json");

  assertFact(requirements.mtsVersion === "v0.15" && requirements.accepted === true,
    "requirements registry is not accepted v0.15");
  assertFact(trace.mtsVersion === "v0.15" && trace.accepted === true,
    "traceability registry is not accepted v0.15");

  const gamma = requirement(requirements, "V15-GAMMA-01");
  const and04 = requirement(requirements, "V15-AND-04");
  const ctx01 = requirement(requirements, "V15-CTX-01");
  assertFact(gamma.state === "COMPONENT_GREEN", "V15-GAMMA-01 not COMPONENT_GREEN");
  assertFact(and04.state === "VERTICAL_GREEN", "V15-AND-04 not VERTICAL_GREEN");
  assertFact(ctx01.state === "COMPONENT_GREEN", "V15-CTX-01 not COMPONENT_GREEN");

  const gammaEvidence = obj(gamma.evidence, "V15-GAMMA-01.evidence");
  const andEvidence = obj(and04.evidence, "V15-AND-04.evidence");
  const ctxEvidence = obj(ctx01.evidence, "V15-CTX-01.evidence");
  const gammaPositive = strings(gammaEvidence.positiveVectors, "V15-GAMMA-01 positiveVectors");
  const andPositive = strings(andEvidence.positiveVectors, "V15-AND-04 positiveVectors");
  const ctxPositive = strings(ctxEvidence.positiveVectors, "V15-CTX-01 positiveVectors");
  includesAll(gammaPositive, [
    "a9-structural-unary-one-command-sufficiency",
    "grounded-zero-role-is-generic-refinement",
  ], "GAMMA vectors");
  includesAll(andPositive, [
    "boolean-family-semantic-theory-membership-rule-discovery",
    "boolean-family-generic-zero-role-compatibility-lowering",
  ], "AND vectors");
  includesAll(ctxPositive, [
    "a9-one-gamma-structural-execution-no-external-current-scope-theory-pointer",
  ], "CTX vectors");

  for (const [id, row] of [["V15-GAMMA-01", gamma], ["V15-AND-04", and04], ["V15-CTX-01", ctx01]] as const) {
    const reqGates = strings(obj(row.evidence, id + ".evidence").requiredExecutableGates, id + " req gates");
    const traceGates = strings(traceRequirement(trace, id).requiredExecutableGates, id + " trace gates");
    sameStrings(traceGates, reqGates, id + " requirement/traceability executable gates");
  }

  assertFact(kernel.status === "ACCEPTED_EXECUTION_AUTHORITY", "kernel status");
  assertFact(kernel.acceptedBaseline === "MTS v0.15", "kernel baseline");
  const semanticAuthority = obj(kernel.semanticAuthority, "kernel.semanticAuthority");
  assertFact(semanticAuthority.versionAccepted === true, "kernel not version accepted");
  const command = obj(kernel.command, "kernel.command");
  assertFact(command.name === "GAMMA_STRUCTURAL_ASET", "Gamma command");
  assertFact(command.repeatedCommandCount === 1, "one repeated Gamma");
  assertFact(command.localReaction === "STRUCTURAL_UNARY_J0", "J0 local reaction");
  assertFact(command.imageArity === "ZERO_ONE_MANY", "0/1/N image arity");
  assertFact(command.crossMemberJoin === "J1_NOT_REQUIRED", "J1 decision");
  assertFact(command.externalSemanticGrounderAllowed === false, "external semantic grounder forbidden");
  assertFact(command.programSpecificDispatchAllowed === false, "program-specific dispatch forbidden");

  const phases = obj(kernel.phases, "kernel.phases");
  const analysis = obj(phases.analysis, "kernel.phases.analysis");
  const synthesis = obj(phases.synthesis, "kernel.phases.synthesis");
  const publication = obj(phases.publication, "kernel.phases.publication");
  assertFact(analysis.id === "S1" && analysis.role === "STRUCTURAL_MATCH_BIND" &&
    bool(analysis.readOnly, "S1.readOnly") === true, "S1 analysis");
  assertFact(synthesis.id === "S2" &&
    synthesis.role === "CANONICAL_SUBSTITUTION_AND_LINK_CONSTRUCTION", "S2 synthesis");
  assertFact(publication.role === "ATOMIC_SEMANTIC_ASET_MEMBERSHIP_REWRITE" &&
    bool(publication.completeSuccessorBeforePublication, "publication complete") === true &&
    bool(publication.sameGenerationReadOwnWrites, "same generation") === false,
  "atomic publication boundary");

  const authority = obj(kernel.authority, "kernel.authority");
  assertFact(authority.currentness === "POSITIVE_SEMANTIC_ANET_MEMBERSHIP", "currentness authority");
  assertFact(authority.theory === "LINK_STRUCTURE_AND_REACTION_START_SEMANTIC_MEMBERSHIP_SNAPSHOT",
    "Theory authority");
  assertFact(authority.hostNameAuthority === false &&
    authority.externalSelectedTheoryPointer === false, "host Theory authority forbidden");

  assertFact(reaction.status === "AUTHOR_APPROVED_DESIGN_PROOF_GREEN", "reaction design status");
  const decision = obj(reaction.decision, "reaction.decision");
  assertFact(decision.minimalCompleteLocalReaction === "STRUCTURAL_UNARY_J0_SELECTED",
    "selected J0 decision");
  assertFact(decision.trueCrossMemberJoin === "J1_NOT_REQUIRED", "reaction J1 decision");
  const mp1 = obj(reaction.mp1, "reaction.mp1");
  assertFact(mp1.selectedAdmission === "Theory->(A->ExactSequence(B...))", "Theory->Rule admission shape");
  assertFact(mp1.imageCardinality === "0|1|N", "MP1 image cardinality");
  assertFact(mp1.relationDiscovery === "exhaustive-over-selected-theory-snapshot",
    "Theory-snapshot rule discovery");
  const selected = obj(reaction.competingCandidate, "reaction.competingCandidate");
  assertFact(selected.selectedForV015 === true, "structural unary candidate selected for v0.15");

  return Object.freeze({
    schema: "mts-v015-semantic-metamodel-facts/v0.1",
    acceptedVersion: "v0.15",
    requirementStates: {
      gamma: gamma.state,
      and04: and04.state,
      ctx01: ctx01.state,
    },
    command: {
      name: command.name,
      repeatedCommandCount: command.repeatedCommandCount,
      localReaction: command.localReaction,
      imageArity: command.imageArity,
      crossMemberJoin: command.crossMemberJoin,
    },
    phases: {
      S1: analysis.role,
      S2: synthesis.role,
      publication: publication.role,
    },
    authority: {
      currentness: authority.currentness,
      theory: authority.theory,
    },
    admission: {
      selectedAdmission: mp1.selectedAdmission,
      imageCardinality: mp1.imageCardinality,
      relationDiscovery: mp1.relationDiscovery,
    },
    selectedReaction: decision.minimalCompleteLocalReaction,
    j1: decision.trueCrossMemberJoin,
  });
}

function expectedSource(id: string): string {
  const source = (SOURCE_BY_ID as Readonly<Record<string, string>>)[id];
  if (source === undefined) return fail("unsupported source occurrence " + id);
  return source;
}

export function deriveV015SemanticMetamodelDigest(id: string, source: string): string {
  assertFact(source === expectedSource(id), "source differs from the exact metamodel occurrence");
  const canonical = JSON.stringify({
    schema: "mts-v015-semantic-metamodel-identity/v0.1",
    source,
    facts: acceptedFacts(findRepositoryRoot()),
  });
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

export function verifyV015SemanticMetamodelEvidence(
  input: V015SemanticMetamodelEvidenceRequest,
): V015SemanticMetamodelEvidenceReceipt {
  assertFact(input.role === "FORMAL_V015_SEMANTIC_METAMODEL", "unsupported role");
  assertFact(input.source === expectedSource(input.id), "source/occurrence mapping mismatch");
  assertFact(typeof input.formalSourceSha256 === "string" &&
    /^[0-9a-f]{64}$/.test(input.formalSourceSha256), "invalid source SHA-256");
  assertFact(createHash("sha256").update(input.source, "utf8").digest("hex") ===
    input.formalSourceSha256, "source SHA-256 mismatch");
  assertFact(Array.isArray(input.stages) && input.stages.length === STAGES.length &&
    input.stages.every((stage, index) => stage === STAGES[index]), "unsupported evidence stages");

  const derived = deriveV015SemanticMetamodelDigest(input.id, input.source);
  assertFact(typeof input.expectedSemanticAnetSha256 === "string" &&
    /^[0-9a-f]{64}$/.test(input.expectedSemanticAnetSha256) &&
    input.expectedSemanticAnetSha256 === derived, "semantic metamodel digest mismatch");

  const runner = readFileSync(resolve(
    findRepositoryRoot(), "ts/src/tooling/v015-semantic-metamodel-evidence-verifier.ts",
  ), "utf8");
  return Object.freeze({
    profile: "mts-v015-semantic-metamodel-evidence/v0.1",
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
    const raw = JSON.parse(readFileSync(0, "utf8")) as V015SemanticMetamodelEvidenceRequest;
    process.stdout.write(JSON.stringify(verifyV015SemanticMetamodelEvidence(raw)) + "\n");
  } catch (error) {
    process.stderr.write(String(error) + "\n");
    process.exitCode = 1;
  }
}
