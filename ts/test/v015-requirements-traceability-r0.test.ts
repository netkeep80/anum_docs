// mts-version-evidence: candidate-v0.15-r0
// requirements-owner: #1976
// traceability-owner: #1977
// approved-json-regression-owner: #1978

import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

type Json = Record<string, unknown>;
type State =
  | "OPEN"
  | "EXPERIMENT_GREEN"
  | "COMPONENT_GREEN"
  | "AUTHOR_REVIEW_PENDING"
  | "VERTICAL_GREEN"
  | "RELEASE_READY"
  | "ACCEPTED"
  | "REJECTED";

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error("v0.15 R0 requirements: " + message);
}
function record(value: unknown, message: string): Json {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), message);
  return value as Json;
}
function text(value: unknown, message: string): string {
  assert(typeof value === "string", message);
  return value;
}
function bool(value: unknown, message: string): boolean {
  assert(typeof value === "boolean", message);
  return value;
}
function strings(value: unknown, message: string): readonly string[] {
  assert(Array.isArray(value) && value.every((item) => typeof item === "string"), message);
  return value as readonly string[];
}
function json(path: string): Json {
  return JSON.parse(readFileSync(path, "utf8")) as Json;
}
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
function reject(effect: () => void, label: string): void {
  try { effect(); } catch { return; }
  throw new Error("v0.15 R0 requirements: expected rejection: " + label);
}

const repoRoot = resolve(process.cwd(), "..");
const requirements = json(join(repoRoot, "requirements/mts-v0.15.json"));
const traceability = json(join(repoRoot, "traceability/mts-v0.15.json"));
const accepted14 = json(join(repoRoot, "requirements/mts-v0.14.json"));
const glossary = readFileSync(join(repoRoot, "docs/Словарь терминов МТС.md"), "utf8");

const allowedStates = new Set<State>([
  "OPEN",
  "EXPERIMENT_GREEN",
  "COMPONENT_GREEN",
  "AUTHOR_REVIEW_PENDING",
  "VERTICAL_GREEN",
  "RELEASE_READY",
  "ACCEPTED",
  "REJECTED",
]);

const verticalEvidenceFields = [
  "canonicalSource",
  "sourceDigest",
  "sourceEntry",
  "grammarProfileRevision",
  "textModelValidated",
  "jsonRoundTripComplete",
  "freshMemoryFormalReplay",
  "freshMemoryJsonReplay",
  "twoMemoryReplay",
  "executionOrProofResult",
  "mutationFalsifiers",
  "semanticInjectionCount",
  "generatedProjectionCurrent",
] as const;

function validateApprovedJsonEntry(entry: Json): void {
  const id = text(entry.id, "approved JSON id");
  const jsonArtifact = text(entry.canonicalJsonArtifact, id + " canonicalJsonArtifact");
  const jsonDigest = text(entry.canonicalJsonDigest, id + " canonicalJsonDigest");
  text(entry.formalSourceArtifact, id + " formalSourceArtifact");
  text(entry.formalSourceDigest, id + " formalSourceDigest");
  text(entry.metacompilerProfile, id + " metacompilerProfile");
  text(entry.expectedRecursiveDigest, id + " expectedRecursiveDigest");
  text(entry.amemoryExecutionProfile, id + " amemoryExecutionProfile");
  assert(entry.expectedSemanticResult !== undefined, id + " expectedSemanticResult");
  const review = record(entry.authorJsonReview, id + " authorJsonReview");
  assert(text(review.state, id + " review state") === "APPROVED", id + " requires explicit APPROVED");
  assert(text(review.artifact, id + " review artifact") === jsonArtifact, id + " approval artifact mismatch");
  assert(text(review.revisionOrDigest, id + " review digest") === jsonDigest, id + " approval stale after artifact change");
  text(review.decisionEvidence, id + " decisionEvidence");
}

function validateCandidate(req: Json, trace: Json): void {
  assert(text(req.schema, "requirements schema") === "mts-requirement-registry/v0.3-candidate", "requirements schema");
  assert(text(trace.schema, "traceability schema") === "mts-traceability/v0.3-candidate", "traceability schema");
  assert(bool(req.accepted, "requirements accepted") === false, "candidate requirements cannot be accepted");
  assert(bool(trace.accepted, "trace accepted") === false, "candidate traceability cannot be accepted");
  assert(bool(req.acceptanceReady, "requirements readiness") === false, "R0 cannot claim release readiness");
  assert(bool(trace.acceptanceReady, "trace readiness") === false, "R0 trace cannot claim release readiness");
  assert(text(trace.releaseState, "releaseState") === "OPEN", "R0 releaseState remains OPEN");

  assert(text(trace.requirementsRegistry, "requirementsRegistry") === "requirements/mts-v0.15.json", "traceability points to the candidate requirements registry");
  const current = record(trace.currentAccepted, "currentAccepted");
  assert(text(current.mtsVersion, "current accepted version") === "v0.14", "v0.14 remains accepted/current");
  assert(text(current.requirements, "current accepted requirements") === "requirements/mts-v0.14.json", "accepted requirements pointer");
  assert(text(accepted14.status, "v0.14 status") === "accepted", "accepted v0.14 registry remains accepted");

  const list = req.requirements;
  assert(Array.isArray(list), "requirements array");
  const ids = (list as Json[]).map((item) => text(item.id, "requirement id"));
  assert(new Set(ids).size === ids.length, "requirement IDs unique");
  const idSet = new Set(ids);
  const traces = record(trace.requirements, "trace requirements");
  assert(Object.keys(traces).length === ids.length, "one trace record per requirement");
  for (const id of ids) assert(Object.prototype.hasOwnProperty.call(traces, id), "missing trace " + id);

  const byId = new Map((list as Json[]).map((item) => [text(item.id, "id"), item]));
  const visiting = new Set<string>();
  const done = new Set<string>();
  const visit = (id: string): void => {
    if (done.has(id)) return;
    assert(!visiting.has(id), "dependency cycle at " + id);
    visiting.add(id);
    const item = byId.get(id);
    assert(item !== undefined, "known dependency node " + id);
    for (const dep of strings(item.dependsOn, id + " dependsOn")) {
      assert(idSet.has(dep), id + " unknown dependency " + dep);
      visit(dep);
    }
    visiting.delete(id);
    done.add(id);
  };
  ids.forEach(visit);

  for (const item of list as Json[]) {
    const id = text(item.id, "id");
    const state = text(item.state, id + " state") as State;
    assert(allowedStates.has(state), id + " allowed state");
    assert(state !== "ACCEPTED" && state !== "RELEASE_READY", id + " cannot be accepted/release-ready in R0");
    const evidence = record(item.evidence, id + " evidence");
    strings(evidence.positiveVectors, id + " positiveVectors");
    strings(evidence.negativeVectors, id + " negativeVectors");
    strings(evidence.requiredExecutableGates, id + " requiredExecutableGates");

    const traced = record(traces[id], id + " trace");
    assert(text(traced.state, id + " trace state") === state, id + " state matches traceability");
    assert(JSON.stringify(strings(traced.dependsOn, id + " trace dependsOn")) === JSON.stringify(strings(item.dependsOn, id + " dependsOn")), id + " dependency projection exact");
  }

  const gov = byId.get("V15-GOV-01");
  assert(gov !== undefined, "V15-GOV-01 exists");
  assert(text(gov.state, "V15-GOV-01 state") === "COMPONENT_GREEN", "R0 registry itself is only COMPONENT_GREEN");
  const govEvidence = record(gov.evidence, "V15-GOV-01 evidence");
  assert(strings(govEvidence.positiveVectors, "GOV positive").length > 0, "GOV positive evidence");
  assert(strings(govEvidence.negativeVectors, "GOV negative").length >= 3, "GOV overclaim negatives");
  for (const gate of strings(govEvidence.requiredExecutableGates, "GOV gates")) {
    assert(existsSync(join(repoRoot, gate)), "GOV gate exists: " + gate);
  }

  const corpus = record(trace.approvedJsonCorpus, "approvedJsonCorpus");
  const entries = corpus.entries;
  assert(Array.isArray(entries), "approved corpus entries");
  for (const entry of entries as Json[]) validateApprovedJsonEntry(entry);
}

function validateVerticalPromotion(requirement: Json, evidence: Json): void {
  assert(text(requirement.state, "promotion state") === "VERTICAL_GREEN", "promotion target");
  for (const field of verticalEvidenceFields) {
    assert(Object.prototype.hasOwnProperty.call(evidence, field), "missing vertical evidence " + field);
  }
  assert(Number(evidence.semanticInjectionCount) === 0, "semantic injection must be zero");
  assert(evidence.textModelValidated === true, "text model validation");
  assert(evidence.jsonRoundTripComplete === true, "full JSON round-trip");
  assert(evidence.freshMemoryFormalReplay === true, "fresh FORMAL replay");
  assert(evidence.freshMemoryJsonReplay === true, "fresh JSON replay");
  assert(evidence.twoMemoryReplay === true, "two-Memory replay");
  assert(evidence.generatedProjectionCurrent === true, "projection current");
  assert(Array.isArray(evidence.mutationFalsifiers) && evidence.mutationFalsifiers.length > 0, "mutation falsifiers");
  const review = record(evidence.authorJsonReview, "authorJsonReview");
  assert(text(review.state, "author review state") === "APPROVED", "explicit Author JSON approval");
  const jsonDigest = text(evidence.canonicalJsonDigest, "canonicalJsonDigest");
  assert(text(review.revisionOrDigest, "review digest") === jsonDigest, "approval bound to exact JSON digest");
}

validateCandidate(requirements, traceability);
// Terminology lock: English MTS term is ANet, never Aset.
{
  const list = requirements.requirements;
  assert(Array.isArray(list), "requirements array for terminology");
  const term = (list as Json[]).find((item) => item.id === "V15-TERM-01");
  assert(term !== undefined, "V15-TERM-01 is registered");
  assert(
    text(term.summary, "V15-TERM-01 summary").includes("ANet"),
    "V15-TERM-01 names ANet",
  );
  assert(
    glossary.includes("### Асеть (`ANet`)"),
    "glossary defines Асеть (ANet)",
  );
  assert(
    glossary.includes("Aset` не является английским термином МТС"),
    "glossary rejects Aset as English MTS term",
  );
  const traces = record(traceability.requirements, "trace requirements");
  assert(
    Object.prototype.hasOwnProperty.call(traces, "V15-TERM-01"),
    "traceability contains V15-TERM-01",
  );
}



// Scope-boundary anti-drift: v0.15 execution core must not reacquire v0.16 proof/aprover blockers.
{
  const list = requirements.requirements;
  assert(Array.isArray(list), "requirements array for v0.15/v0.16 scope boundary");
  const byId = new Map((list as Json[]).map((item) => [text(item.id, "scope id"), item]));
  const deferredProofIds = [
    "V15-DUAL-01",
    "V15-DUAL-02",
    "V15-THM-01",
    "V15-THM-02",
    "V15-THM-03",
    "V15-PROOF-01",
    "V15-PROOF-EXEC-01",
    "V15-PROOF-EXEC-02",
    "V15-PROOF-EXEC-03",
  ];
  for (const id of deferredProofIds) {
    assert(!byId.has(id), id + " is v0.16 scope and must not block v0.15");
  }

  const gamma = byId.get("V15-GAMMA-01");
  assert(gamma !== undefined, "V15-GAMMA-01 exists");
  assert(text(gamma.state, "Gamma state") === "COMPONENT_GREEN", "closed #2001 projects to COMPONENT_GREEN");
  assert(text(gamma.ownerIssue, "Gamma owner") === "#2001", "Gamma owner #2001");
  assert(!/aprover/i.test(text(gamma.summary, "Gamma summary")), "v0.15 Gamma summary excludes aprover");
  assert(/meta\/interpreter ANets/i.test(text(gamma.summary, "Gamma summary core")), "Gamma retains self-hosted meta/interpreter scope");

  const ctx = byId.get("V15-CTX-01");
  assert(ctx !== undefined, "V15-CTX-01 exists");
  assert(text(ctx.ownerIssue, "CTX owner") === "#1987", "execution authority is owned by #1987");
  assert(/semantic ANet membership/i.test(text(ctx.summary, "CTX summary")), "execution authority comes from ANet membership");
  assert(!/launch-manifest authority/i.test(text(ctx.summary, "CTX summary stale host authority")), "launch manifest is not semantic authority");

  const stage = byId.get("V15-STAGE-01");
  assert(stage !== undefined, "V15-STAGE-01 exists");
  assert(text(stage.ownerIssue, "STAGE owner") === "#1911", "compiler/metacompiler owns staged compilation boundary");

  const corpus = byId.get("V15-CORPUS-01");
  assert(corpus !== undefined, "V15-CORPUS-01 exists");
  assert(/Author-approved v0\.15 executable artifact/i.test(text(corpus.summary, "CORPUS summary")), "frozen harness covers approved executable corpus");
  assert(!/every semantic item/i.test(text(corpus.summary, "CORPUS stale inventory")), "old A-memory semantic inventory is not v0.15 scope");

  const andBoundary = byId.get("V15-AND-03");
  assert(andBoundary !== undefined, "V15-AND-03 exists");
  assert(/one canonical semantic .*AND/i.test(text(andBoundary.summary, "AND semantic authority")), "one canonical AND semantics");
  assert(/semantics-preserving/i.test(text(andBoundary.summary, "AND lowering boundary")), "optimized/backend lowerings require semantic preservation");

  const review = record(requirements.authorJsonReview, "authorJsonReview scope");
  const groups = strings(review.applicableGroups, "authorJsonReview applicable groups");
  assert(!groups.includes("THM") && !groups.includes("PROOF"), "v0.16 proof groups removed from v0.15 Author JSON scope");
}

// compact Boolean AND approved corpus lock.
{
  const corpus = record(traceability.approvedJsonCorpus, "approvedJsonCorpus AND lock");
  const entries = corpus.entries;
  assert(Array.isArray(entries), "approved corpus entries for AND lock");
  const andEntry = (entries as Json[]).find(
    (entry) => entry.id === "compact-boolean-and",
  );
  assert(andEntry !== undefined, "approved compact Boolean AND corpus entry");
  assert(
    text(andEntry.canonicalJsonDigest, "compact AND JSON digest") ===
      "cf5028f68500bba04ee10e06ac5512eec223078d8b428f4d5de1de6433ba5941",
    "compact AND exact approved JSON digest",
  );
  assert(
    text(andEntry.expectedRecursiveDigest, "compact AND recursive digest") ===
      "37b2c02b927eed6cdd061931b60930d0a31d674a49bc585b075401a5cb5ddcb0",
    "compact AND exact recursive digest",
  );
  const review = record(andEntry.authorJsonReview, "compact AND author review");
  assert(text(review.state, "compact AND approval state") === "APPROVED", "compact AND explicit Author approval");
}

// Boolean family Author-approval promotion lock.
{
  const list = requirements.requirements;
  assert(Array.isArray(list), "requirements array for Boolean family lock");
  const byId = new Map((list as Json[]).map((item) => [text(item.id, "logic id"), item]));
  const family = byId.get("V15-AND-04");
  assert(family !== undefined, "V15-AND-04 exists");

  const corpus = record(traceability.approvedJsonCorpus, "approvedJsonCorpus logic lock");
  const entries = corpus.entries;
  assert(Array.isArray(entries), "approved corpus entries for logic lock");
  const ids = new Set((entries as Json[]).map((entry) => text(entry.id, "corpus id")));
  const required = [
    "compact-boolean-not",
    "compact-boolean-or",
    "compact-boolean-xor",
  ];
  const allApproved = required.every((id) => ids.has(id));
  const state = text(family.state, "V15-AND-04 state");
  if (state === "VERTICAL_GREEN") {
    assert(allApproved, "V15-AND-04 promotion requires approved NOT/OR/XOR corpus");
  } else {
    assert(state === "OPEN", "V15-AND-04 is OPEN or VERTICAL_GREEN");
  }
}

// Negative: a mere state flip cannot promote an R0 requirement to VERTICAL_GREEN.
{
  const req = { id: "X", state: "VERTICAL_GREEN" };
  reject(() => validateVerticalPromotion(req, {}), "illegal VERTICAL_GREEN without evidence");
}

// Negative: even complete technical evidence cannot bypass explicit Author JSON approval.
{
  const req = { id: "AND", state: "VERTICAL_GREEN" };
  const evidence: Json = {
    canonicalSource: "formal/and.mts",
    sourceDigest: "s1",
    sourceEntry: "AND",
    grammarProfileRevision: "g1",
    textModelValidated: true,
    jsonRoundTripComplete: true,
    freshMemoryFormalReplay: true,
    freshMemoryJsonReplay: true,
    twoMemoryReplay: true,
    executionOrProofResult: "GREEN",
    mutationFalsifiers: ["remove-tt-row"],
    semanticInjectionCount: 0,
    generatedProjectionCurrent: true,
    canonicalJsonDigest: "j1",
    authorJsonReview: { state: "PENDING", revisionOrDigest: "j1" },
  };
  reject(() => validateVerticalPromotion(req, evidence), "missing explicit Author JSON approval");
}

// Negative: approval is tied to the exact artifact digest and becomes stale after a material change.
{
  const entry: Json = {
    id: "AND",
    canonicalJsonArtifact: "formal/and.json",
    canonicalJsonDigest: "new-digest",
    formalSourceArtifact: "formal/and.mts",
    formalSourceDigest: "formal-digest",
    metacompilerProfile: "v0.15",
    expectedRecursiveDigest: "recursive-digest",
    amemoryExecutionProfile: "amemory#482",
    expectedSemanticResult: "FF=F;FT=F;TF=F;TT=T",
    authorJsonReview: {
      state: "APPROVED",
      artifact: "formal/and.json",
      revisionOrDigest: "old-digest",
      decisionEvidence: "author-decision",
    },
  };
  reject(() => validateApprovedJsonEntry(entry), "stale approval after JSON digest change");
}

// Negative: an approved-corpus entry cannot omit the real A-memory replay profile.
{
  const entry: Json = {
    id: "AND",
    canonicalJsonArtifact: "formal/and.json",
    canonicalJsonDigest: "j1",
    formalSourceArtifact: "formal/and.mts",
    formalSourceDigest: "s1",
    metacompilerProfile: "v0.15",
    expectedRecursiveDigest: "r1",
    expectedSemanticResult: "GREEN",
    authorJsonReview: {
      state: "APPROVED",
      artifact: "formal/and.json",
      revisionOrDigest: "j1",
      decisionEvidence: "author-decision",
    },
  };
  reject(() => validateApprovedJsonEntry(entry), "approved corpus requires real A-memory profile");
}

console.log([
  "MTS_V015_R0_REQUIREMENTS=COMPONENT_GREEN",
  "CANDIDATE_ACCEPTED=FALSE",
  "CURRENT_ACCEPTED=v0.14",
  "DEPENDENCY_DAG=GREEN",
  "VERTICAL_OVERCLAIM_REJECTED=TRUE",
  "AUTHOR_JSON_APPROVAL_REQUIRED=TRUE",
  "STALE_JSON_APPROVAL_REJECTED=TRUE",
  "REAL_AMEMORY_PROFILE_REQUIRED=TRUE",
  "APPROVED_JSON_CORPUS_OWNER=1978",
  "REAL_AMEMORY_REPLAY_OWNER=amemory#482",
  "ANET_TERMINOLOGY=GREEN",
  "V016_PROOF_SCOPE_REMOVED=TRUE",
  "GAMMA_SCOPE_CORE_ONLY=TRUE",
  "CTX_AUTHORITY_SELF_HOSTED=TRUE",
  "CANONICAL_AND_BACKEND_LOWERING_BOUNDARY=GREEN",
].join(" "));
