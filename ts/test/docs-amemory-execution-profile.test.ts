import { readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`A-memory profile: ${message}`);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: expected ${String(expected)}, got ${String(actual)}`);
}

const root = resolve(process.cwd(), "..");
const profilePath = join(root, "profiles/amemory-execution-profile.json");
const docPath = join(root, "docs/specs/Апамять и управление сетью связей.md");
const glossaryPath = join(root, "docs/Словарь терминов МТС.md");
const policyPath = join(root, "repo-policy.json");

const profile = JSON.parse(readFileSync(profilePath, "utf8")) as {
  schema: string;
  id: string;
  profileVersion: string;
  status: string;
  foundation: {
    mtsVersion: string;
    contract: string;
    conformance: string;
    acceptedFoundationMutated: boolean;
  };
  classification: {
    V013_SUFFICIENT: boolean;
    V013_PLUS_EXECUTION_PROFILE: boolean;
    SEMANTIC_EXTENSION_REQUIRED: boolean;
  };
  authority: {
    canonicalSemanticOwner: string;
    machineReadableProjection: boolean;
    machineReadableProjectionIsCompetingSemanticOwner: boolean;
    issue: number;
  };
  state: Record<string, unknown>;
  theory: Record<string, unknown>;
  reaction: Record<string, unknown>;
  publication: Record<string, unknown>;
  scheduling: Record<string, unknown>;
  liveness: Record<string, unknown>;
  hierarchicalResult: Record<string, unknown>;
  substrate: Record<string, unknown>;
  selfHosting: Record<string, unknown>;
  portableLaws: string[];
  consumerRequirements: Record<string, unknown>;
  evidence: {
    witnesses: string[];
    semanticSlices: string[];
  };
};

const doc = readFileSync(docPath, "utf8");
const glossary = readFileSync(glossaryPath, "utf8");
const policy = JSON.parse(readFileSync(policyPath, "utf8")) as {
  paths?: { canonical_docs?: string[] };
};

same(profile.schema, "mts-amemory-execution-profile/v0.1", "schema");
same(profile.id, "minimal-portable-amemory-execution", "profile id");
same(profile.profileVersion, "0.1.0", "profile version");
same(profile.status, "current-post-v0.13-profile", "profile status");
same(profile.foundation.mtsVersion, "v0.13", "foundation version");
same(profile.foundation.contract, "contracts/mts-contract-v0.13.json", "foundation contract");
same(profile.foundation.conformance, "contracts/mts-conformance-v0.13.json", "foundation conformance");
same(profile.foundation.acceptedFoundationMutated, false, "accepted v0.13 is unchanged");

same(profile.classification.V013_SUFFICIENT, false, "v0.13-alone classification");
same(profile.classification.V013_PLUS_EXECUTION_PROFILE, true, "execution-profile classification");
same(profile.classification.SEMANTIC_EXTENSION_REQUIRED, false, "semantic-extension classification");

same(
  profile.authority.canonicalSemanticOwner,
  "docs/specs/Апамять и управление сетью связей.md",
  "canonical semantic owner",
);
same(profile.authority.machineReadableProjection, true, "machine projection marker");
same(
  profile.authority.machineReadableProjectionIsCompetingSemanticOwner,
  false,
  "machine projection must not compete with prose owner",
);
same(profile.authority.issue, 1558, "research issue");

assert(
  policy.paths?.canonical_docs?.includes(profile.authority.canonicalSemanticOwner) === true,
  "canonical semantic owner must remain a canonical current document",
);
assert(
  !/v\d+\.\d+/i.test(basename(profilePath)),
  "current profile filename must be versionless",
);

same(profile.state.currentSemanticState, "members-of-single-published-scope", "current state");
same(profile.state.currentnessAuthority, "published-current-root", "currentness authority");
same(profile.state.physicalDeletionRequiredForSemanticReplacement, false, "physical deletion boundary");

same(profile.theory.visibility, "reaction-start-snapshot", "Theory visibility");
same(profile.theory.sameSnapshotForAllCurrentMembers, true, "one Theory snapshot");
same(profile.theory.sameReactionNewAdmissionExecutable, false, "same-reaction admission visibility");
same(profile.theory.nextReactionNewAdmissionExecutable, true, "next-reaction admission visibility");
same(profile.theory.snapshotIsMtsEntity, false, "snapshot ontology boundary");

same(profile.reaction.relationDiscovery, "exhaustive-over-selected-theory-snapshot", "relation discovery");
same(profile.reaction.noAdmittedRelation, "preserve-current-truth", "no-relation behavior");
same(profile.reaction.zeroImage, "zero-successor-contribution", "ZERO behavior");
same(profile.reaction.oneImage, "one-canonical-successor", "ONE behavior");
same(profile.reaction.manyImages, "union-all-canonical-successors", "MANY behavior");
same(profile.reaction.notFoundEquivalentToNoAdmittedRelation, false, "NOT_FOUND distinction");
same(profile.reaction.mixedZeroAndNonZero, "union-nonzero-outputs", "mixed ZERO behavior");

same(profile.publication.fullSuccessorBuiltBeforePublication, true, "successor publication boundary");
same(profile.publication.atomicCurrentRootHandoff, true, "atomic handoff");
same(profile.publication.matchedRelationsZero, "no-handoff-quiescent", "quiescent publication behavior");

same(profile.scheduling.physicalScheduleIsSemanticAuthority, false, "physical scheduling authority");
same(profile.scheduling.threadOrderIsSemanticAuthority, false, "thread order authority");
same(profile.scheduling.workGroupOrderIsSemanticAuthority, false, "work-group order authority");
same(profile.scheduling.gpuLaneOrderIsSemanticAuthority, false, "GPU lane order authority");
same(profile.scheduling.allocationOrderIsSemanticAuthority, false, "allocation order authority");
same(
  profile.scheduling.normalizedSemanticResultMustBeScheduleIndependent,
  true,
  "normalized schedule independence",
);

same(
  profile.liveness.quiescence,
  "complete-logical-reaction-with-zero-matches-and-zero-handoffs",
  "quiescence observable",
);
same(profile.liveness.schedulerInactivityEqualsQuiescence, false, "scheduler inactivity boundary");
same(profile.liveness.recurrenceAllowed, true, "recurrence");
same(profile.liveness.nonterminationAllowed, true, "nontermination");
same(profile.liveness.globalTerminationRequired, false, "global termination");
same(profile.liveness.structuralEndImpliesGlobalHalt, false, "END halt boundary");

same(
  profile.hierarchicalResult.dynamicHierarchicalResultConstruction,
  "INDEPENDENT_LATER_FEATURE",
  "hierarchical construction classification",
);
same(
  profile.hierarchicalResult.nestedContextResultLifecycle,
  "INDEPENDENT_LATER_FEATURE",
  "nested Context lifecycle classification",
);
same(
  profile.hierarchicalResult.persistentResultVersions,
  "INDEPENDENT_LATER_FEATURE",
  "persistent Result versions classification",
);
same(profile.hierarchicalResult.deferredResearchRetained, true, "deferred research retention");

same(profile.substrate.localHandleIsSemanticIdentity, false, "local handle boundary");
same(profile.substrate.concreteMemoryApiIsMtsOntology, false, "Memory API boundary");
same(profile.substrate.doubletsLayoutIsMtsOntology, false, "Doublets boundary");
same(profile.substrate.gpuLayoutIsMtsOntology, false, "GPU layout boundary");

same(profile.selfHosting.scopedLinkCarriedProgramSemantics, true, "scoped self-hosting");
same(profile.selfHosting.fullySelfHostedMtsSystem, false, "full self-hosting boundary");

same(profile.portableLaws.length, 17, "portable law count");
same(new Set(profile.portableLaws).size, 17, "portable law uniqueness");
for (let index = 1; index <= 17; index += 1) {
  const prefix = `P${String(index).padStart(2, "0")}_`;
  assert(profile.portableLaws.some((law) => law.startsWith(prefix)), `missing portable law ${prefix}`);
}

same(profile.evidence.witnesses.join(","), "W1,W2,W3,W4,W5,W6,W7", "witness coverage");
same(profile.evidence.semanticSlices.join(","), "E1,E2,E3,E4,E5,E6,E7", "semantic slice coverage");

for (const [name, value] of Object.entries(profile.consumerRequirements)) {
  same(value, true, `consumer requirement ${name}`);
}

const requiredDocFragments = [
  "<!-- смысловой-владелец-апамяти -->",
  "profiles/amemory-execution-profile.json",
  "V013_PLUS_EXECUTION_PROFILE = TRUE",
  "SEMANTIC_EXTENSION_REQUIRED = FALSE for minimal complete A-memory",
  "NO_ADMITTED_RELATION(A, Theory)",
  "specific relation lookup = NOT_FOUND",
  "generator-first trajectory",
  "S0 = { K ⟼ A }",
  "HIERARCHICAL_LINK_AS_RESULT = supported by minimal reaction",
  "normalized successor A = normalized successor B",
  "Матрица обязательных примеров D5",
];

for (const fragment of requiredDocFragments) {
  assert(doc.includes(fragment), `canonical document missing fragment: ${fragment}`);
}

const requiredGlossaryTerms = [
  "### Апамять",
  "### Асеть",
  "### Контекст (`Context`)",
  "### Область исполнения (`Scope`)",
  "### Текущесть (`currentness`)",
  "### Контекстная истина",
  "### Реакция и переход",
  "### Ветвь `ZERO`",
  "### Ветвь `ONE`",
  "### Ветвь `MANY`",
  "### Состояние `NOT_FOUND`",
  "### Неподвижная точка",
  "### Покой (`quiescence`)",
  "### Рекуррентность",
  "### Неограниченное исполнение (`nontermination`)",
  "### Теория (`Theory`)",
  "### Допуск `Theory`",
  "### Публикация текущего корня (`publication`)",
  "### Снимок `Theory` (`Theory snapshot`)",
  "### Самохостинг (`self-hosted`)",
  "### Субстрат апамяти (`substrate`)",
  "### Иерархический результат (`hierarchical Result`)",
  "### Дочерний контекст (`child Context`)",
];

for (const term of requiredGlossaryTerms) {
  assert(glossary.includes(term), `glossary missing required D4 term: ${term}`);
}

console.log([
  "A-memory execution profile convergence D1-D6: GREEN",
  "PROFILE_LAWS=17",
  "WITNESSES=7",
  "SEMANTIC_EXTENSION_REQUIRED=FALSE",
  "HIERARCHICAL_RESULT=INDEPENDENT_LATER_FEATURE",
  "D7_CONSUMER_REQUIREMENTS=EXPLICIT",
].join(" "));
