import { createHash } from "node:crypto";
import {
  existsSync,
  readFileSync,
} from "node:fs";
import {
  join,
  resolve,
} from "node:path";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`A-memory D10 completion: ${message}`);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(
    Object.is(actual, expected),
    `${message}: expected ${String(expected)}, got ${String(actual)}`,
  );
}

function gitBlobSha(source: string): string {
  const body = Buffer.from(source, "utf8");
  const header = Buffer.from(`blob ${body.length}\0`, "utf8");
  return createHash("sha1").update(header).update(body).digest("hex");
}

const root = resolve(process.cwd(), "..");
const docPath = join(root, "docs/specs/Апамять и управление сетью связей.md");
const profilePath = join(root, "profiles/amemory-execution-profile.json");
const policyPath = join(root, "repo-policy.json");

const requiredConvergenceGates = Object.freeze([
  "ts/test/docs-current-surface.test.ts",
  "ts/test/docs-glossary-links.test.ts",
  "ts/test/docs-amemory-execution-profile.test.ts",
  "ts/test/docs-amemory-external-reader-acceptance.test.ts",
]);

for (const relativePath of requiredConvergenceGates) {
  assert(
    existsSync(join(root, relativePath)),
    `required D1-D9 convergence gate exists: ${relativePath}`,
  );
}

const profileSource = readFileSync(profilePath, "utf8");
same(
  gitBlobSha(profileSource),
  "e2c614e1556f31f6230cb69d686d1f22ab2c97e8",
  "D10 must not mutate the D7-pinned execution profile blob",
);

const profile = JSON.parse(profileSource) as {
  schema: string;
  id: string;
  profileVersion: string;
  classification: {
    V013_SUFFICIENT: boolean;
    V013_PLUS_EXECUTION_PROFILE: boolean;
    SEMANTIC_EXTENSION_REQUIRED: boolean;
  };
  authority: {
    canonicalSemanticOwner: string;
    machineReadableProjectionIsCompetingSemanticOwner: boolean;
  };
  scheduling: {
    physicalScheduleIsSemanticAuthority: boolean;
    threadOrderIsSemanticAuthority: boolean;
    workGroupOrderIsSemanticAuthority: boolean;
    gpuLaneOrderIsSemanticAuthority: boolean;
    allocationOrderIsSemanticAuthority: boolean;
    normalizedSemanticResultMustBeScheduleIndependent: boolean;
  };
  selfHosting: {
    scopedLinkCarriedProgramSemantics: boolean;
    fullySelfHostedMtsSystem: boolean;
  };
};

same(profile.schema, "mts-amemory-execution-profile/v0.1", "profile schema");
same(profile.id, "minimal-portable-amemory-execution", "profile id");
same(profile.profileVersion, "0.1.0", "profile version");
same(profile.classification.V013_SUFFICIENT, false, "v0.13-alone classification");
same(
  profile.classification.V013_PLUS_EXECUTION_PROFILE,
  true,
  "separate execution-profile classification",
);
same(
  profile.classification.SEMANTIC_EXTENSION_REQUIRED,
  false,
  "semantic-extension classification",
);

same(
  profile.authority.machineReadableProjectionIsCompetingSemanticOwner,
  false,
  "machine profile must not become a competing semantic owner",
);

same(
  profile.selfHosting.scopedLinkCarriedProgramSemantics,
  true,
  "scoped self-hosted program semantics",
);
same(
  profile.selfHosting.fullySelfHostedMtsSystem,
  false,
  "full self-hosting remains explicitly unclaimed",
);

for (const [name, value] of Object.entries({
  physicalScheduleIsSemanticAuthority:
    profile.scheduling.physicalScheduleIsSemanticAuthority,
  threadOrderIsSemanticAuthority:
    profile.scheduling.threadOrderIsSemanticAuthority,
  workGroupOrderIsSemanticAuthority:
    profile.scheduling.workGroupOrderIsSemanticAuthority,
  gpuLaneOrderIsSemanticAuthority:
    profile.scheduling.gpuLaneOrderIsSemanticAuthority,
  allocationOrderIsSemanticAuthority:
    profile.scheduling.allocationOrderIsSemanticAuthority,
})) {
  same(value, false, `scheduling authority veto: ${name}`);
}
same(
  profile.scheduling.normalizedSemanticResultMustBeScheduleIndependent,
  true,
  "normalized schedule independence",
);

const policy = JSON.parse(readFileSync(policyPath, "utf8")) as {
  paths?: { canonical_docs?: string[] };
};
const canonicalDocs = policy.paths?.canonical_docs;
assert(Array.isArray(canonicalDocs), "canonical current docs are declared");

const ownerMarker = "<!-- смысловой-владелец-апамяти -->";
let ownerCount = 0;
let ownerPath = "";
for (const relativePath of canonicalDocs) {
  const source = readFileSync(join(root, relativePath), "utf8");
  const count = source.split(ownerMarker).length - 1;
  if (count > 0) ownerPath = relativePath;
  ownerCount += count;
}
same(ownerCount, 1, "competing A-memory semantic owner count must remain zero");
same(
  ownerPath,
  "docs/specs/Апамять и управление сетью связей.md",
  "canonical A-memory semantic owner path",
);
same(
  profile.authority.canonicalSemanticOwner,
  ownerPath,
  "machine profile must point to the same semantic owner",
);

const doc = readFileSync(docPath, "utf8");
const d10Marker = '<a id="d10-completion"></a>';
same(doc.split(d10Marker).length - 1, 1, "D10 section appears exactly once");

const d10Start = doc.indexOf(d10Marker);
const d10End = doc.indexOf("## 18. Производный результат", d10Start);
assert(d10Start >= 0 && d10End > d10Start, "D10 section has a bounded current-doc range");
const d10 = doc.slice(d10Start, d10End);

for (const exactEvidence of [
  "amemory D7 issue 24 = COMPLETED",
  "amemory PR 25 = MERGED",
  "amemory main = 90a6a3a26ad14b8d00fca0ec6e66fa1fdd9a5203",
  "440caf09558d4ff5cfda11805cb3ef97b48d1ad5",
  "af4e3dadbb9857fba7239a58f79ed2da59bc5c42",
  "e2c614e1556f31f6230cb69d686d1f22ab2c97e8",
  "implementedProfileId = minimal-portable-amemory-execution",
  "implementedProfileVersion = 0.1.0",
  "supportLevel = partial",
  "fullProfileConformance = false",
  "current reaction Scope = NOT_IMPLEMENTED_FOR_EXECUTION",
  "P10 / P15 = supporting evidence only",
  "P01-P09 / P11-P14 / P16-P17 = not-yet-executed",
]) {
  assert(d10.includes(exactEvidence), `D10 missing downstream evidence: ${exactEvidence}`);
}

for (const finalClassification of [
  "V013_SUFFICIENT = FALSE",
  "V013_PLUS_EXECUTION_PROFILE = TRUE",
  "SEMANTIC_EXTENSION_REQUIRED = FALSE",
]) {
  assert(
    d10.includes(finalClassification),
    `D10 missing final classification: ${finalClassification}`,
  );
}

for (const completionMetric of [
  "A_MEMORY_DOCUMENTATION = COMPLETE",
  "GLOSSARY = CONVERGED",
  "AMEMORY_IMPLEMENTATION_DOCS = ALIGNED",
  "BROKEN_CURRENT_LINKS = 0",
  "COMPETING_A_MEMORY_SEMANTIC_OWNERS = 0",
  "UNSCOPED_SELF_HOSTING_CLAIMS = 0",
  "HOST_SCHEDULING_PRESENTED_AS_SEMANTICS = 0",
  "D1_D10 = COMPLETE",
  "FULL_REACTION_PROFILE_CONFORMANCE = FALSE",
]) {
  assert(
    d10.includes(completionMetric),
    `D10 missing completion metric: ${completionMetric}`,
  );
}

assert(
  d10.includes("не означает") &&
    d10.includes("все семнадцать законов реакции"),
  "D10 must explicitly separate profile completion from reaction implementation",
);

assert(!d10.includes("#1270"), "D10 current documentation must not depend on issue #1270");
assert(!d10.includes("#1558"), "D10 current documentation must not depend on issue #1558");

console.log([
  "A_MEMORY_D10_COMPLETION=GREEN",
  "A_MEMORY_DOCUMENTATION=COMPLETE",
  "GLOSSARY=CONVERGED",
  "AMEMORY_IMPLEMENTATION_DOCS=ALIGNED",
  "BROKEN_CURRENT_LINKS=0",
  "COMPETING_A_MEMORY_SEMANTIC_OWNERS=0",
  "UNSCOPED_SELF_HOSTING_CLAIMS=0",
  "HOST_SCHEDULING_PRESENTED_AS_SEMANTICS=0",
  "D1_D10=COMPLETE",
  "FULL_REACTION_PROFILE_CONFORMANCE=FALSE",
].join(" "));
