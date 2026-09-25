import {
  existsSync,
  readFileSync,
} from "node:fs";
import {
  join,
  resolve,
} from "node:path";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`external reader: ${message}`);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: expected ${String(expected)}, got ${String(actual)}`);
}

const root = resolve(process.cwd(), "..");
const docPath = join(root, "docs/specs/Апамять и управление сетью связей.md");
const profilePath = join(root, "profiles/amemory-execution-profile.json");
const policyPath = join(root, "repo-policy.json");
const packagePath = join(root, "ts/package.json");

const requiredGates = Object.freeze([
  "ts/test/docs-current-surface.test.ts",
  "ts/test/docs-glossary-links.test.ts",
  "ts/test/docs-amemory-execution-profile.test.ts",
]);

for (const relativePath of requiredGates) {
  assert(existsSync(join(root, relativePath)), `D8 gate exists: ${relativePath}`);
}

const pkg = JSON.parse(readFileSync(packagePath, "utf8")) as {
  scripts?: Record<string, string>;
};
assert(pkg.scripts !== undefined, "package scripts exist");
for (const script of ["docs:sync", "docs:check", "check"]) {
  assert(typeof pkg.scripts[script] === "string", `D8 script exists: ${script}`);
}

const policy = JSON.parse(readFileSync(policyPath, "utf8")) as {
  paths?: { canonical_docs?: string[] };
};
const canonicalDocs = policy.paths?.canonical_docs;
assert(Array.isArray(canonicalDocs), "canonical docs are declared");

const ownerMarker = "<!-- смысловой-владелец-апамяти -->";
let ownerCount = 0;
let ownerPath = "";
for (const relativePath of canonicalDocs) {
  const source = readFileSync(join(root, relativePath), "utf8");
  const count = source.split(ownerMarker).length - 1;
  if (count > 0) ownerPath = relativePath;
  ownerCount += count;
}
same(ownerCount, 1, "A-memory semantic owner marker count");
same(ownerPath, "docs/specs/Апамять и управление сетью связей.md", "A-memory semantic owner path");

const profile = JSON.parse(readFileSync(profilePath, "utf8")) as {
  authority: {
    canonicalSemanticOwner: string;
    machineReadableProjectionIsCompetingSemanticOwner: boolean;
  };
  classification: {
    V013_SUFFICIENT: boolean;
    V013_PLUS_EXECUTION_PROFILE: boolean;
    SEMANTIC_EXTENSION_REQUIRED: boolean;
  };
  state: {
    currentSemanticState: string;
    currentnessAuthority: string;
    physicalDeletionRequiredForSemanticReplacement: boolean;
  };
  theory: {
    visibility: string;
    sameReactionNewAdmissionExecutable: boolean;
    nextReactionNewAdmissionExecutable: boolean;
  };
  reaction: {
    notFoundEquivalentToNoAdmittedRelation: boolean;
    zeroImage: string;
    oneImage: string;
    manyImages: string;
  };
  scheduling: {
    physicalScheduleIsSemanticAuthority: boolean;
    normalizedSemanticResultMustBeScheduleIndependent: boolean;
  };
  liveness: {
    schedulerInactivityEqualsQuiescence: boolean;
    recurrenceAllowed: boolean;
    nonterminationAllowed: boolean;
    globalTerminationRequired: boolean;
    structuralEndImpliesGlobalHalt: boolean;
  };
  hierarchicalResult: {
    dynamicHierarchicalResultConstruction: string;
    nestedContextResultLifecycle: string;
    persistentResultVersions: string;
  };
  substrate: {
    localHandleIsSemanticIdentity: boolean;
    concreteMemoryApiIsMtsOntology: boolean;
    gpuLayoutIsMtsOntology: boolean;
  };
  selfHosting: {
    scopedLinkCarriedProgramSemantics: boolean;
    fullySelfHostedMtsSystem: boolean;
  };
};

same(profile.authority.canonicalSemanticOwner, ownerPath, "profile points to canonical owner");
same(
  profile.authority.machineReadableProjectionIsCompetingSemanticOwner,
  false,
  "machine profile is not a competing semantic owner",
);

const doc = readFileSync(docPath, "utf8");
const startMarker = '<a id="amemory-external-reader-acceptance"></a>';
const start = doc.indexOf(startMarker);
const end = doc.indexOf("## 18. Производный результат", start);
assert(start >= 0, "D9 acceptance section exists");
assert(end > start, "D9 acceptance section has a bounded current-doc range");
const d9 = doc.slice(start, end);

assert(!d9.includes("#1270"), "D9 answers do not require issue #1270");
assert(!d9.includes("#1558"), "D9 answers do not require issue #1558");

for (let index = 1; index <= 16; index += 1) {
  const marker = `D9-Q${String(index).padStart(2, "0")}`;
  same(d9.split(marker).length - 1, 1, `${marker} appears exactly once`);
}

const answerChecks: ReadonlyArray<readonly [string, readonly string[]]> = [
  ["D9-Q01", ["единственного опубликованного текущего `Scope`"]],
  ["D9-Q02", ["Единственный опубликованный текущий корень"]],
  ["D9-Q03", ["старые `Scope` и `K ⟼ A` могут оставаться физически доступными"]],
  ["D9-Q04", ["исчерпывает все отношения", "одной атомарной сменой текущего корня"]],
  ["D9-Q05", ["`NOT_FOUND`", "`ZERO`", "не доказывает отсутствия всех допущенных отношений"]],
  ["D9-Q06", ["`ONE`", "`MANY`", "совпавшие выходы сходятся"]],
  ["D9-Q07", ["одно исходное состояние", "один снимок `Theory`"]],
  ["D9-Q08", ["не должна менять нормализованный смысловой результат"]],
  ["D9-Q09", ["реакции `t+1`"]],
  ["D9-Q10", ["`matchedRelations = 0`", "бездействие планировщика покоем не является"]],
  ["D9-Q11", ["после одного или нескольких активных переходов"]],
  ["D9-Q12", ["неограниченное исполнение", "`END`"]],
  ["D9-Q13", ["независимая более поздняя возможность"]],
  ["D9-Q14", ["не являются онтологией МТС"]],
  ["D9-Q15", ["ограниченный самохостинг семантики программы"]],
  ["D9-Q16", ["Принятая MTS v0.13 задаёт основание", "принадлежат реализации `amemory`"]],
];

for (let index = 0; index < answerChecks.length; index += 1) {
  const current = answerChecks[index];
  const next = answerChecks[index + 1];
  if (current === undefined) continue;
  const [marker, fragments] = current;
  const from = d9.indexOf(marker);
  const to = next === undefined ? d9.length : d9.indexOf(next[0], from + marker.length);
  assert(from >= 0, `answer block exists: ${marker}`);
  assert(to > from, `answer block is bounded: ${marker}`);
  const block = d9.slice(from, to);
  for (const fragment of fragments) {
    assert(block.includes(fragment), `${marker} missing answer fragment: ${fragment}`);
  }
}

same(profile.classification.V013_SUFFICIENT, false, "Q16 foundation-alone classification");
same(profile.classification.V013_PLUS_EXECUTION_PROFILE, true, "Q16 execution-profile classification");
same(profile.classification.SEMANTIC_EXTENSION_REQUIRED, false, "Q16 semantic-extension classification");

same(profile.state.currentSemanticState, "members-of-single-published-scope", "Q01 profile alignment");
same(profile.state.currentnessAuthority, "published-current-root", "Q02 profile alignment");
same(profile.state.physicalDeletionRequiredForSemanticReplacement, false, "Q03 profile alignment");

same(profile.reaction.notFoundEquivalentToNoAdmittedRelation, false, "Q05 profile alignment");
same(profile.reaction.zeroImage, "zero-successor-contribution", "Q05 ZERO alignment");
same(profile.reaction.oneImage, "one-canonical-successor", "Q06 ONE alignment");
same(profile.reaction.manyImages, "union-all-canonical-successors", "Q06 MANY alignment");

same(profile.theory.visibility, "reaction-start-snapshot", "Q07/Q09 Theory visibility");
same(profile.theory.sameReactionNewAdmissionExecutable, false, "Q09 same-reaction visibility");
same(profile.theory.nextReactionNewAdmissionExecutable, true, "Q09 next-reaction visibility");

same(profile.scheduling.physicalScheduleIsSemanticAuthority, false, "Q08 scheduling authority");
same(
  profile.scheduling.normalizedSemanticResultMustBeScheduleIndependent,
  true,
  "Q08 normalized schedule independence",
);

same(profile.liveness.schedulerInactivityEqualsQuiescence, false, "Q10 scheduler inactivity");
same(profile.liveness.recurrenceAllowed, true, "Q11 recurrence");
same(profile.liveness.nonterminationAllowed, true, "Q12 nontermination");
same(profile.liveness.globalTerminationRequired, false, "Q12 global termination");
same(profile.liveness.structuralEndImpliesGlobalHalt, false, "Q12 END boundary");

for (const value of [
  profile.hierarchicalResult.dynamicHierarchicalResultConstruction,
  profile.hierarchicalResult.nestedContextResultLifecycle,
  profile.hierarchicalResult.persistentResultVersions,
]) {
  same(value, "INDEPENDENT_LATER_FEATURE", "Q13 hierarchical Result boundary");
}

same(profile.substrate.localHandleIsSemanticIdentity, false, "Q14 handle boundary");
same(profile.substrate.concreteMemoryApiIsMtsOntology, false, "Q14 API boundary");
same(profile.substrate.gpuLayoutIsMtsOntology, false, "Q14 GPU boundary");

same(profile.selfHosting.scopedLinkCarriedProgramSemantics, true, "Q15 scoped self-hosting");
same(profile.selfHosting.fullySelfHostedMtsSystem, false, "Q15 full self-hosting boundary");

console.log([
  "A-memory D8-D9 external-reader acceptance: GREEN",
  "D8_REQUIRED_GATES=PRESENT",
  "SEMANTIC_OWNER_COUNT=1",
  "D9_QUESTIONS=16",
  "ISSUE_HISTORY_REQUIRED=FALSE",
].join(" "));
