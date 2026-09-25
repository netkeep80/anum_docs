import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error("post-v0.13 #1558 execution-profile convergence: " + message);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), message + ": values differ");
}

function setEqual(actual: readonly string[], expected: readonly string[], message: string): void {
  const left = [...actual].sort();
  const right = [...expected].sort();
  assert(
    left.length === right.length && left.every((value, index) => value === right[index]),
    message + ": expected [" + right.join(", ") + "], got [" + left.join(", ") + "]",
  );
}

const root = resolve(process.cwd(), "..");
const read = (path: string): string => readFileSync(join(root, path), "utf8");
const json = (path: string): any => JSON.parse(read(path));

const profilePath = "traceability/mts-v0.13-amemory-execution-profile-v0.1.json";
const profile = json(profilePath);
const contract = json("contracts/mts-contract-v0.13.json");
const acceptance = json("cutover/typescript-c1-acceptance-v0.6.json");
const doc = read("docs/specs/Апамять и управление сетью связей.md");
const glossary = read("docs/Словарь терминов МТС.md");

same(profile.schema, "mts-amemory-execution-profile/v0.1", "profile schema");
same(profile.profileId, "mts-v0.13-amemory-execution", "profile id");
same(profile.profileVersion, "0.1", "profile version");
same(profile.status, "current", "profile status");
same(profile.ownerIssue, 1558, "profile owner issue");
same(profile.classification, "V013_PLUS_EXECUTION_PROFILE", "global #1558 classification");
same(profile.foundation.mtsVersion, "0.13", "foundation version");
same(profile.foundation.contract, "contracts/mts-contract-v0.13.json", "foundation contract path");
same(profile.foundation.accepted, true, "profile foundation is accepted");
same(profile.foundation.mutatedByThisProfile, false, "profile does not mutate accepted v0.13");
same(profile.authority.normativeForProfileConsumers, true, "profile is normative for consumers");
same(profile.authority.mtsOntologyAuthority, false, "profile is not MTS ontology authority");
same(profile.authority.changesAcceptedMtsSemantics, false, "accepted MTS semantics stay unchanged");
same(profile.authority.requiresFutureMtsVersion, false, "minimal profile needs no future MTS version");

same(contract.status, "accepted", "v0.13 contract remains accepted");
same(contract.accepted, true, "v0.13 contract remains accepted=true");
same(acceptance.current.contract, "contracts/mts-contract-v0.13.json", "accepted current contract unchanged");
same(acceptance.acceptance.fullSelfHostedSystemClaimed, false, "profile does not broaden self-hosting claim");

const expectedRequirementIds = Array.from(
  { length: 17 },
  (_, index) => "AEP-" + String(index + 1).padStart(2, "0"),
);
const actualRequirementIds = profile.requirements.map((requirement: any) =>
  String(requirement.id).slice(0, 6)
);
setEqual(actualRequirementIds, expectedRequirementIds, "all 17 portable-profile rules are present");
same(new Set(profile.requirements.map((requirement: any) => requirement.id)).size, 17, "profile rule ids are unique");

same(profile.concurrency.threadOrWorkgroupOrderIsSemantic, false, "physical scheduler order is non-semantic");
same(profile.concurrency.snapshotTheoryAtReactionStart, true, "reaction-start Theory snapshot is required");
same(profile.recurrence.quiescenceEqualsSchedulerIdle, false, "scheduler idle is not quiescence");
same(profile.recurrence.recurrenceEqualsQuiescence, false, "recurrence is not quiescence");
same(profile.recurrence.globalTerminationRequired, false, "global termination is not required");
same(profile.recurrence.structuralEndImpliesGlobalHalt, false, "structural END is not global halt");
same(profile.hierarchicalResult.classification, "INDEPENDENT_LATER_FEATURE", "E6 classification");
same(profile.hierarchicalResult.dynamicHierarchicalConstructionRequiredForMinimum, false, "dynamic Result tree construction is not minimal");
same(profile.substrateBoundary.a9ConfirmedIndependentPrimitiveCount, 0, "A9 confirms no new independent MTS primitive");
same(profile.substrateBoundary.a9UnknownPrimitiveStatusCount, 8, "A9 retains eight irreducibility questions");

setEqual(
  profile.substrateBoundary.carrierCapabilities,
  [
    "local-link-technical-identity",
    "root-anchor",
    "pole-read",
    "canonical-pair-lookup",
    "ensure-ordinary-pair",
    "ensure-start-selfclosure",
    "ensure-end-selfclosure",
    "outgoing-incidence-query",
  ],
  "exact carrier substrate capability boundary",
);

const evidenceMarkers: Record<string, string> = {
  E1_W1: "POST_V013_1558_E1_W1=GREEN",
  E2_W2_W3: "POST_V013_1558_E2_W2_W3=GREEN",
  E3_W4_W5: "POST_V013_1558_E3_W4_W5=GREEN_WITH_BOUNDARY",
  E4: "POST_V013_1558_E4=GREEN_PROFILE_CLASSIFICATION",
  E5_W6: "POST_V013_1558_E5_W6=GREEN",
  E6: "POST_V013_1558_E6=GREEN",
  E7_W7: "POST_V013_1558_E7_W7=GREEN",
};

for (const [key, marker] of Object.entries(evidenceMarkers)) {
  const path = profile.evidence[key];
  assert(typeof path === "string", "profile evidence path exists for " + key);
  assert(read(path).includes(marker), key + " evidence retains executable GREEN marker");
}

assert(
  doc.includes("../../traceability/mts-v0.13-amemory-execution-profile-v0.1.json"),
  "canonical A-memory doc links machine-readable profile",
);
assert(
  doc.includes("V013_PLUS_EXECUTION_PROFILE = TRUE"),
  "canonical A-memory doc states final profile classification",
);
assert(
  doc.includes("SEMANTIC_EXTENSION_REQUIRED = FALSE for minimal complete A-memory"),
  "canonical A-memory doc records no new MTS law for minimal profile",
);

const docAnchors = new Set(
  [...doc.matchAll(/<a id="([^"]+)"/g)].map((match) => match[1]),
);
const reader = profile.documentationConvergence.readerAcceptance;
same(reader.length, 16, "D9 external-reader question count");
same(new Set(reader.map((item: any) => item.id)).size, 16, "D9 question ids are unique");
for (const item of reader) {
  assert(docAnchors.has(item.section), item.id + " resolves to an explicit canonical-doc anchor");
}

function normalizeHeading(value: string): string {
  return value
    .replace(/^###\s+/, "")
    .replace(/\`/g, "")
    .replace(/\s+\([^)]*\)\s*$/, "")
    .trim();
}

const glossaryLines = glossary.split(/\r?\n/);
const glossarySections = new Map<string, string>();
for (let index = 0; index < glossaryLines.length; index += 1) {
  if (!glossaryLines[index]?.startsWith("### ")) continue;
  const start = index;
  let end = glossaryLines.length;
  for (let next = index + 1; next < glossaryLines.length; next += 1) {
    if (glossaryLines[next]?.startsWith("### ") || glossaryLines[next]?.startsWith("## ")) {
      end = next;
      break;
    }
  }
  const heading = normalizeHeading(glossaryLines[start] ?? "");
  glossarySections.set(heading, glossaryLines.slice(start, end).join("\n"));
}

for (const term of profile.documentationConvergence.requiredGlossaryPreferredTerms) {
  const section = glossarySections.get(term);
  assert(section !== undefined, "required glossary preferred term exists: " + term);
  assert(section.includes("**Подробнее:**"), "required glossary term has canonical Подробнее link: " + term);
}

const reactionSection = glossarySections.get("Реакция");
assert(reactionSection?.includes("**Другие имена:** переход"), "reaction declares transition as an explicit alias");
const substrateSection = glossarySections.get("Субстрат апамяти");
assert(substrateSection?.includes("техническое основание исполнения"), "substrate retains prior phrase as explicit alias");

const forbiddenSemanticPromotions = [
  "local-handle-value",
  "allocation-order",
  "storage-index",
  "Links-or-Doublets-API-shape",
  "array-layout",
  "GPU-layout",
  "thread-order",
  "workgroup-order",
];
setEqual(
  profile.substrateBoundary.nonSemanticImplementationChoices,
  forbiddenSemanticPromotions,
  "implementation choices remain explicitly non-semantic",
);

console.log([
  "POST_V013_1558_EXECUTION_PROFILE_V01=GREEN",
  "PROFILE_CLASSIFICATION=V013_PLUS_EXECUTION_PROFILE",
  "PROFILE_REQUIREMENTS=17",
  "E1_E7_EVIDENCE_BOUND=TRUE",
  "D4_GLOSSARY_TERMS_BOUND=TRUE",
  "D9_READER_MAP=16_OF_16",
  "ACCEPTED_V013_MUTATED=FALSE",
].join(" "));
