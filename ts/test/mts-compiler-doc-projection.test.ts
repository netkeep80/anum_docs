import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import {
  compileRequirementDocuments,
  loadCurrentProjectDocumentConfiguration,
  loadHistoricalRequirementLawProjection,
  loadMtsSemanticIr,
  renderRequirementProjection,
  upsertRequirementProjection,
  validateCurrentProjectDocumentConfiguration,
} from "../src/tooling/mts-compiler.js";
import {
  assertOutsideOwnedBlockUnchanged,
  listMarkdownAnchorIds,
  listMarkdownChildren,
  listRepositoryMarkdownSurface,
  readMarkdownNode,
  readOwnedMarkdownBlock,
  replaceOwnedMarkdownSection,
  resolveMarkdownAnchor,
} from "../src/tooling/markdown-section-adapter.js";

const root = resolve(process.cwd(), "..");
const expect = (fn: () => unknown, pattern: RegExp, message?: string): void => {
  assert.throws(fn, pattern, message);
};

const markdownDb = [
  "# Документ",
  '<a id="root"></a>',
  "Авторский текст корня.",
  "",
  "## Первый раздел",
  '<a id="node-a"></a>',
  "Авторский payload A.",
  "",
  "### Дочерний раздел",
  '<a id="node-a-child"></a>',
  "Дочерний payload.",
  "",
  "## Второй раздел",
  '<a id="node-b"></a>',
  "Авторский payload B.",
  "",
  "```html",
  '<a id="fake"></a>',
  "<!-- мтс:требование:FAKE:начало -->",
  "<!-- мтс:требование:FAKE:конец -->",
  "```",
].join("\n");

const pathOf = (id: string): Array<[number, string]> =>
  resolveMarkdownAnchor(markdownDb, id).headingPath.map((x) => [x.level, x.title]);

assert.deepEqual(pathOf("node-a"), [[1, "Документ"], [2, "Первый раздел"]]);
assert.deepEqual(pathOf("node-a-child"), [
  [1, "Документ"],
  [2, "Первый раздел"],
  [3, "Дочерний раздел"],
]);
expect(() => resolveMarkdownAnchor(markdownDb, "fake"), /anchor not found/);

const firstWrite = replaceOwnedMarkdownSection({
  source: markdownDb,
  mode: "hybrid",
  anchorId: "node-a",
  blockId: "REQ_A",
  generatedContent: "> generated A",
});
assert.match(readOwnedMarkdownBlock(firstWrite, "REQ_A")?.content ?? "", /> generated A/);
for (const text of ["Авторский payload A.", "Дочерний payload.", "Авторский payload B."]) {
  assert.ok(firstWrite.includes(text), `authored text must survive: ${text}`);
}

const secondWrite = replaceOwnedMarkdownSection({
  source: firstWrite,
  mode: "hybrid",
  anchorId: "node-a",
  blockId: "REQ_A",
  generatedContent: "> generated A v2",
});
assertOutsideOwnedBlockUnchanged(firstWrite, secondWrite, "REQ_A");
assert.match(secondWrite, /> generated A v2/);
assert.equal(
  replaceOwnedMarkdownSection({
    source: secondWrite,
    mode: "hybrid",
    anchorId: "node-a",
    blockId: "REQ_A",
    generatedContent: "> generated A v2",
  }),
  secondWrite,
);

for (const mode of ["source", "generated"] as const) {
  expect(
    () => replaceOwnedMarkdownSection({
      source: markdownDb,
      mode,
      anchorId: "node-a",
      blockId: "REQ_A",
      generatedContent: "> forbidden",
    }),
    mode === "source" ? /SOURCE document is read-only/ : /whole-file GENERATED mode is not supported/,
  );
}
expect(() => resolveMarkdownAnchor(markdownDb + '\n<a id="node-a"></a>\n', "node-a"), /anchor is duplicated/);
expect(
  () => readOwnedMarkdownBlock(
    markdownDb.replace("Авторский payload A.", "Авторский payload A.\n<!-- мтс:требование:REQ_A:начало -->"),
    "REQ_A",
  ),
  /malformed owned block/,
);

const treeDb = [
  '<a id="db-root"></a>',
  "# Корень БД",
  "Корневой payload.",
  "",
  '<a id="db-a"></a>',
  "<!-- мтс:требование:META_A:начало -->",
  "> служебная метаинформация",
  "<!-- мтс:требование:META_A:конец -->",
  "## Узел A",
  "Авторский payload A.",
  "",
  '<a id="db-a1"></a>',
  "### Узел A1",
  "Авторский payload A1.",
  "",
  '<a id="db-b"></a>',
  "## Узел B",
  "Авторский payload B.",
  "",
  "```md",
  '<a id="db-fake"></a>',
  "## Ложный узел",
  "```",
].join("\n");

assert.deepEqual(listMarkdownAnchorIds(treeDb), ["db-root", "db-a", "db-a1", "db-b"]);
const rootNode = readMarkdownNode(treeDb, "db-root");
const aNode = readMarkdownNode(treeDb, "db-a");
assert.deepEqual(
  aNode.headingPath.map((x) => [x.level, x.title]),
  [[1, "Корень БД"], [2, "Узел A"]],
  "compiler-owned metadata between anchor and heading must not break node addressing",
);
assert.deepEqual(listMarkdownChildren(treeDb, "db-root").map((x) => x.anchorId), ["db-a", "db-b"]);
assert.deepEqual(listMarkdownChildren(treeDb, "db-a").map((x) => x.anchorId), ["db-a1"]);
assert.ok(!aNode.subtree.includes('<a id="db-b"></a>'), "A subtree must end before sibling B anchor");
assert.equal(rootNode.end, treeDb.length);

const malformedNode = treeDb + '\n<a id="orphan"></a>\nне заголовок\n';
expect(() => readMarkdownNode(malformedNode, "orphan"), /not a canonical tree node/);
expect(() => readMarkdownNode(treeDb, "db-fake"), /anchor not found/);

const surface = listRepositoryMarkdownSurface(root);
assert.equal(new Set(surface).size, surface.length);
assert.ok(surface.includes("docs/research/Исходные мысли МТС.md"));
assert.ok(surface.includes("docs/theory/Система аксиом МТС.md"));

const nativeV015Paths = readdirSync(resolve(root, "requirements/mts-v0.15"), { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith(".rg.yaml"))
  .map((entry) => `requirements/mts-v0.15/${entry.name}`)
  .sort((left, right) => left.localeCompare(right, "en"));
assert.equal(nativeV015Paths.length, 48, "exact native v0.15 Requirement source count");

const ir = loadMtsSemanticIr(root);
assert.equal(ir.schema, "mts-requirement-registry/v0.3");
assert.equal(ir.contract, "mts-contract/v0.15");
assert.equal(ir.projectionState, "MATERIALIZED");
assert.equal(ir.requirements.length, 48, "accepted v0.15 requirement count");
assert.ok(ir.requirements.some((x) => x.id === "V15-AUTH-01"));
assert.ok(ir.requirements.some((x) => x.id === "V15-READY-03"));
assert.ok(ir.requirements.every((x) => x.status === "accepted"));
assert.deepEqual(ir.repositoryRequirements.map((x) => x.id), [
  "README-AUTHORS",
  "README-OBSERVATORY",
]);
assert.ok(ir.repositoryRequirements.every((x) => x.status === "required"));
assert.match(
  ir.repositoryRequirements.find((x) => x.id === "README-OBSERVATORY")?.generatedContent ?? "",
  /https:\/\/netkeep80\.github\.io\/anum_docs\//,
);
assert.match(
  ir.repositoryRequirements.find((x) => x.id === "README-AUTHORS")?.generatedContent ?? "",
  /Дьяченко Константин Константинович/,
);
assert.equal(Object.values(ir.documentModes).includes("generated"), false);

const expectedCurrentDocumentModes = Object.freeze({
  "README.md": "hybrid",
  "PORTFOLIO.md": "source",
  "docs/CONTRIBUTING.md": "source",
  "docs/research/Исходные мысли МТС.md": "source",
  "docs/research/Новое осмысление МТС.md": "source",
  "docs/specs/Апамять и управление сетью связей.md": "hybrid",
  "docs/specs/Ачисла и сериализация.md": "hybrid",
  "docs/specs/Пучки связей.md": "source",
  "docs/specs/Формальная нотация МТС.md": "hybrid",
  "docs/theory/Основания МТС.md": "hybrid",
  "docs/theory/Система аксиом МТС.md": "hybrid",
  "docs/Словарь терминов МТС.md": "hybrid",
});
assert.equal(Object.keys(ir.documentModes).length, 12, "G4-A exact current document mode fact count");
assert.deepEqual(ir.documentModes, expectedCurrentDocumentModes, "G4-A exact current document modes");
const loadedCurrentProjectConfiguration = loadCurrentProjectDocumentConfiguration(root);
assert.deepEqual(loadedCurrentProjectConfiguration.documentModes, ir.documentModes, "G4-A current typed document configuration must project directly into current IR");
assert.deepEqual(loadedCurrentProjectConfiguration.repositoryRequirements, ir.repositoryRequirements, "G4-A current typed README project facts must project directly into current IR");

const currentProjectConfigurationCandidate = {
  documentModes: { ...expectedCurrentDocumentModes },
  repositoryRequirements: [
    {
      id: "README-OBSERVATORY",
      kind: "readme-link",
      status: "required",
      projection: { path: "README.md", anchor: "mts-readme-contract-observatory" },
      label: "Открыть Обозреватель контрактов",
      url: "https://netkeep80.github.io/anum_docs/",
      description: "Производная визуализация принятых машинных свидетельств только для чтения; она не является смысловым авторитетом.",
    },
    {
      id: "README-AUTHORS",
      kind: "readme-contributors",
      status: "required",
      projection: { path: "README.md", anchor: "mts-readme-authors" },
      contributors: [
        { name: "Вертушкин Роман Павлович", url: "https://github.com/netkeep80" },
        { name: "Дьяченко Константин Константинович", url: "https://github.com/konard" },
        { name: "Шакиров Тимур Эдуардович", url: "https://github.com/TimaxLacs" },
        { name: "Бурдуков Александр Николаевич", url: "https://github.com/InAiwetrustAGI" },
        { name: "Глазунов Иван Сергеевич", url: "https://github.com/ivansglazunov" },
      ],
    },
  ],
} as const;
assert.deepEqual(validateCurrentProjectDocumentConfiguration(root, currentProjectConfigurationCandidate), loadedCurrentProjectConfiguration, "G4-A typed current configuration validator must reproduce the production projection");
const mutateCurrentProjectConfiguration = (
  mutate: (candidate: { documentModes: Record<string, unknown>; repositoryRequirements: any[] }) => void,
): void => {
  const candidate = JSON.parse(JSON.stringify(currentProjectConfigurationCandidate)) as {
    documentModes: Record<string, unknown>;
    repositoryRequirements: any[];
  };
  mutate(candidate);
  expect(() => validateCurrentProjectDocumentConfiguration(root, candidate), /mts-compiler:/, "G4-A current project/document configuration must fail closed");
};
mutateCurrentProjectConfiguration((candidate) => { delete candidate.documentModes["PORTFOLIO.md"]; });
mutateCurrentProjectConfiguration((candidate) => { candidate.documentModes["docs/unknown-current-document.md"] = "source"; });
mutateCurrentProjectConfiguration((candidate) => { candidate.documentModes["PORTFOLIO.md"] = "invalid-mode"; });
mutateCurrentProjectConfiguration((candidate) => {
  candidate.repositoryRequirements = candidate.repositoryRequirements.filter((item) => item.id !== "README-AUTHORS");
});
mutateCurrentProjectConfiguration((candidate) => {
  candidate.repositoryRequirements.push(JSON.parse(JSON.stringify(candidate.repositoryRequirements[0])));
});
mutateCurrentProjectConfiguration((candidate) => { candidate.documentModes["README.md"] = "source"; });

const currentCausalEdges = ir.requirements.flatMap((item) =>
  item.dependsOn.map((dependency) => `${item.id}->${dependency}`)
);
assert.equal(currentCausalEdges.length, 33, "native depends_on must define exactly 33 current causal edges");
assert.equal(new Set(currentCausalEdges).size, 33, "native current causal edges must be unique");
const currentCausalSet = new Set(currentCausalEdges);

const legacyV015Registry = JSON.parse(
  readFileSync(resolve(root, "requirements/mts-v0.15.json"), "utf8"),
) as { requirements: Array<{ id: string; dependsOn: string[] }> };
const legacyCausalEdges = legacyV015Registry.requirements.flatMap((item) =>
  item.dependsOn.map((dependency) => `${item.id}->${dependency}`)
);
assert.equal(legacyCausalEdges.length, 85, "legacy shadow retains exactly 85 dependsOn edges");
assert.ok(
  currentCausalEdges.every((edge) => new Set(legacyCausalEdges).has(edge)),
  "native causal graph must remain a subset of the legacy transition graph",
);
assert.equal(
  legacyCausalEdges.filter((edge) => !currentCausalSet.has(edge)).length,
  52,
  "exactly 52 legacy-only edges must be absent from current causal authority",
);

const v015Contract = JSON.parse(
  readFileSync(resolve(root, "contracts/mts-contract-v0.15.json"), "utf8"),
) as { requiredSemanticLaws: Record<string, string> };
assert.equal(Object.keys(v015Contract.requiredSemanticLaws).length, 48);
const legacyNormativeDivergence = ir.requirements
  .filter((requirement) => requirement.statement !== v015Contract.requiredSemanticLaws[requirement.id])
  .map((requirement) => requirement.id)
  .sort();
assert.deepEqual(
  legacyNormativeDivergence,
  ["V15-FORMAL-PROOF-01", "V15-JSON-02", "V15-JSON-03", "V15-ONTO-02"].sort(),
  "G3-S1 legacy normative text divergence must be exactly the four accepted G2 native owners",
);
for (const requirement of ir.requirements) {
  assert.match(
    requirement.authorityDocument,
    /^requirements\/mts-v0\.15\/V15-[A-Z0-9-]+\.rg\.yaml$/,
    `${requirement.id}: authorityDocument must name the exact native source`,
  );
  assert.equal(requirement.authorityPointer, "/normative", `${requirement.id}: native authority pointer`);
}

const classCLegacyRegistry = JSON.parse(
  readFileSync(resolve(root, "requirements/mts-v0.15.json"), "utf8"),
) as {
  requirements: Array<{
    id: string;
    evidence?: { positiveVectors?: string[]; negativeVectors?: string[] };
  }>;
};
const classCConformance = JSON.parse(
  readFileSync(resolve(root, "contracts/mts-conformance-v0.15.json"), "utf8"),
) as { requiredPositiveVectors: string[]; requiredNegativeVectors: string[] };
const classCConstraints = [
  { vector: "no-proof-specific-grammar-opcodes", family: "C-GRAMMAR", legacyOwner: "V15-FORMAL-PROOF-01", polarity: "negative", semanticOwner: "V15-FORMAL-PROOF-01", explicit: "proof models must not introduce proof-specific Grammar opcodes" },
  { vector: "proof-specific-grammar-zero", family: "C-GRAMMAR", legacyOwner: "V15-ONTO-02", polarity: "negative", semanticOwner: "V15-ONTO-02", explicit: "proof-specific Grammar forms must not be introduced as MTS semantic authority" },
  { vector: "direct-json-nested-object-to-anchored-source-anet", family: "C-JSON-MAP", legacyOwner: "V15-JSON-02", polarity: "positive", semanticOwner: "V15-JSON-02", explicit: "a nested object denotes an anchored source bundle" },
  { vector: "direct-json-null-to-bare-source-entry", family: "C-JSON-MAP", legacyOwner: "V15-JSON-02", polarity: "positive", semanticOwner: "V15-JSON-02", explicit: "object-member null denotes a bare source entry" },
  { vector: "direct-json-string-rhs-to-binding", family: "C-JSON-MAP", legacyOwner: "V15-JSON-02", polarity: "positive", semanticOwner: "V15-JSON-02", explicit: "a string RHS denotes a binding" },
  { vector: "direct-json-structured-bare-key-to-resolved-membership", family: "C-JSON-MAP", legacyOwner: "V15-JSON-02", polarity: "positive", semanticOwner: "V15-JSON-02", explicit: "a structured bare key denotes resolved semantic membership" },
  { vector: "grounded-empty-role-bundle-admission-only", family: "C-BIND-MEM", legacyOwner: "V15-JSON-02", polarity: "positive", semanticOwner: "V15-JSON-02", explicit: "a grounded empty role bundle publishes only its Theory-to-Rule admission" },
  { vector: "role-bundle-membership-plus-admission", family: "C-BIND-MEM", legacyOwner: "V15-JSON-02", polarity: "positive", semanticOwner: "V15-JSON-02", explicit: "A non-empty role bundle publishes its resolved role members plus its Theory-to-Rule admission" },
  { vector: "root-binding-does-not-publish-membership", family: "C-BIND-MEM", legacyOwner: "V15-JSON-02", polarity: "positive", semanticOwner: "V15-JSON-02", explicit: "A root binding alone does not publish semantic membership" },
  { vector: "array-null-rejects", family: "C-JSON-STRICT", legacyOwner: "V15-JSON-02", polarity: "negative", semanticOwner: "V15-JSON-03", explicit: "null inside arrays" },
  { vector: "duplicate-decoded-json-key-rejects", family: "C-JSON-STRICT", legacyOwner: "V15-JSON-02", polarity: "negative", semanticOwner: "V15-JSON-03", explicit: "keys that become equal after JSON escape decoding" },
  { vector: "duplicate-key-reject", family: "C-JSON-STRICT", legacyOwner: "V15-JSON-03", polarity: "negative", semanticOwner: "V15-JSON-03", explicit: "duplicate object keys" },
  { vector: "duplicate-local-name-reject", family: "C-JSON-STRICT", legacyOwner: "V15-JSON-03", polarity: "negative", semanticOwner: "V15-JSON-03", explicit: "duplicate local names" },
  { vector: "structured-binding-head-fails-closed-bounded-fragment", family: "C-JSON-STRICT", legacyOwner: "V15-JSON-02", polarity: "negative", semanticOwner: "V15-JSON-03", explicit: "structured binding heads outside the supported bounded fragment" },
  { vector: "top-level-null-rejects", family: "C-JSON-STRICT", legacyOwner: "V15-JSON-02", polarity: "negative", semanticOwner: "V15-JSON-03", explicit: "top-level null" },
  { vector: "unknown-field-reject", family: "C-JSON-STRICT", legacyOwner: "V15-JSON-03", polarity: "negative", semanticOwner: "V15-JSON-03", explicit: "unknown fields" },
  { vector: "unsupported-profile-reject", family: "C-JSON-STRICT", legacyOwner: "V15-JSON-03", polarity: "negative", semanticOwner: "V15-JSON-03", explicit: "unsupported profile/schema identifiers" },
] as const;
assert.equal(classCConstraints.length, 17, "G2 exact accepted Class-C inventory");
assert.deepEqual(
  [...new Set(classCConstraints.map((item) => item.semanticOwner))].sort(),
  ["V15-FORMAL-PROOF-01", "V15-JSON-02", "V15-JSON-03", "V15-ONTO-02"].sort(),
  "G2 must close Class-C only in existing native owners",
);
for (const item of classCConstraints) {
  const legacyOwner = classCLegacyRegistry.requirements.find((candidate) => candidate.id === item.legacyOwner);
  assert.ok(legacyOwner, item.vector + ": accepted legacy owner exists");
  const legacyVectors = item.polarity === "positive"
    ? legacyOwner.evidence?.positiveVectors ?? []
    : legacyOwner.evidence?.negativeVectors ?? [];
  assert.ok(legacyVectors.includes(item.vector), item.vector + ": accepted legacy conformance assignment remains present");
  const acceptedVectors = item.polarity === "positive"
    ? classCConformance.requiredPositiveVectors
    : classCConformance.requiredNegativeVectors;
  assert.ok(acceptedVectors.includes(item.vector), item.vector + ": accepted v0.15 conformance obligation remains present");
  const nativeOwner = ir.requirements.find((candidate) => candidate.id === item.semanticOwner);
  assert.ok(nativeOwner, item.vector + ": existing native semantic owner exists");
  assert.ok(
    nativeOwner.statement.includes(item.explicit),
    item.vector + ": Class-C constraint must be explicit in native normative authority",
  );
}


const legacyIr = loadMtsSemanticIr(root, "requirements/mts-v0.14.json");
assert.equal(legacyIr.schema, "mts-requirement-registry/v0.2");
assert.equal(legacyIr.contract, "mts-contract/v0.14");
assert.equal(legacyIr.requirements.length, 14, "legacy Markdown compatibility requirement count");
const a4 = legacyIr.requirements.find((x) => x.id === "V14-L12");
assert.ok(a4);
assert.equal(a4.classificationPath, "theory/foundation/context-relative-chiral-gauge");
assert.match(a4.statementDigest, /^[0-9a-f]{16}$/);
assert.ok(a4.positiveVectorCount > 0);
assert.ok(a4.negativeVectorCount > 0);
assert.ok(a4.executableGateCount > 0);
assert.match(renderRequirementProjection(a4), /мтс:требование:V14-L12:начало/);

const a4Source = [
  markdownDb,
  "",
  '<a id="mts-v014-v14-l12"></a>',
  "## A4 prime",
  "Авторский текст A4.",
].join("\n");
const a4Updated = upsertRequirementProjection(a4Source, a4, "hybrid");
assert.match(a4Updated, /мтс:требование:V14-L12:начало/);
assert.ok(a4Updated.includes("Авторский текст A4."), "compiler projection must preserve authored bytes");

// #1585 materialized all accepted owners; compiler must be idempotent.
assert.deepEqual(compileRequirementDocuments(root, false), []);
assert.deepEqual(compileRequirementDocuments(root, true), []);

const tempRoot = mkdtempSync(resolve(tmpdir(), "mts-compiler-v014-"));
const copy = (path: string): void => {
  const target = resolve(tempRoot, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, readFileSync(resolve(root, path), "utf8"), "utf8");
};
const registryPath = "requirements/mts-v0.14.json";
const readRegistry = (): any =>
  JSON.parse(readFileSync(resolve(tempRoot, registryPath), "utf8"));
const writeRegistry = (value: unknown): void =>
  writeFileSync(resolve(tempRoot, registryPath), JSON.stringify(value), "utf8");

try {
  for (const path of [
    "contracts/mts-contract-v0.15.json",
    "contracts/mts-conformance-v0.15.json",
    "requirements/mts-v0.15.json",
    "traceability/mts-v0.15.json",
    "cutover/typescript-c1-acceptance-v0.8.json",
    "contracts/mts-contract-v0.14.json",
    "contracts/mts-conformance-v0.14.json",
    "traceability/mts-v0.14.json",
    registryPath,
    ...nativeV015Paths,
    ...surface,
  ]) copy(path);

  const tempIr = loadMtsSemanticIr(tempRoot);
  assert.deepEqual(tempIr, ir, "isolated accepted fixture must preserve the real repository semantic IR");
  assert.equal(tempIr.requirements.length, 48);
  assert.equal(tempIr.contract, "mts-contract/v0.15");

  const historicalRegistrySource = readFileSync(resolve(tempRoot, registryPath), "utf8");
  const historicalLawProjection = loadHistoricalRequirementLawProjection(tempRoot, registryPath);

  try {
    const historicalModeMutation = JSON.parse(historicalRegistrySource) as any;
    assert.equal(historicalModeMutation.documentSurface["PORTFOLIO.md"].mode, "source", "G4-A historical mode falsifier baseline");
    historicalModeMutation.documentSurface["PORTFOLIO.md"].mode = "hybrid";
    writeRegistry(historicalModeMutation);
    assert.deepEqual(loadMtsSemanticIr(tempRoot).documentModes, ir.documentModes, "G4-A historical v0.14 mode mutation cannot change current v0.15 documentModes");
    assert.equal(loadMtsSemanticIr(tempRoot, registryPath).documentModes["PORTFOLIO.md"], "hybrid", "G4-A explicit historical v0.14 replay must still observe historical mode mutation");
    assert.deepEqual(compileRequirementDocuments(tempRoot, false), [], "G4-A historical v0.14 mode mutation cannot change current docs behavior");
    assert.deepEqual(
      loadHistoricalRequirementLawProjection(tempRoot, registryPath),
      historicalLawProjection,
      "G4-A2 F1 inherited law projection must ignore historical document mode mutation",
    );
  } finally {
    writeFileSync(resolve(tempRoot, registryPath), historicalRegistrySource, "utf8");
  }

  try {
    const historicalReadmeMutation = JSON.parse(historicalRegistrySource) as any;
    const observatory = historicalReadmeMutation.repositoryRequirements.find((item: any) => item.id === "README-OBSERVATORY");
    assert.ok(observatory, "G4-A historical README-OBSERVATORY baseline exists");
    observatory.label = "Историческая мутация README-OBSERVATORY";
    writeRegistry(historicalReadmeMutation);
    assert.deepEqual(loadMtsSemanticIr(tempRoot).repositoryRequirements, ir.repositoryRequirements, "G4-A historical v0.14 README mutation cannot change current repositoryRequirements");
    assert.match(
      loadMtsSemanticIr(tempRoot, registryPath).repositoryRequirements.find((item) => item.id === "README-OBSERVATORY")?.generatedContent ?? "",
      /Историческая мутация README-OBSERVATORY/,
      "G4-A explicit historical v0.14 replay must still observe historical README mutation",
    );
    assert.deepEqual(compileRequirementDocuments(tempRoot, false), [], "G4-A historical v0.14 README mutation cannot change current generated README expectation");
    assert.deepEqual(
      loadHistoricalRequirementLawProjection(tempRoot, registryPath),
      historicalLawProjection,
      "G4-A2 F2 inherited law projection must ignore historical README project mutation",
    );
  } finally {
    writeFileSync(resolve(tempRoot, registryPath), historicalRegistrySource, "utf8");
  }

  try {
    const invalidHistoricalReadmeUrl = JSON.parse(historicalRegistrySource) as any;
    invalidHistoricalReadmeUrl.repositoryRequirements
      .find((item: any) => item.id === "README-OBSERVATORY").url =
      "http://netkeep80.github.io/anum_docs/";
    writeRegistry(invalidHistoricalReadmeUrl);
    assert.deepEqual(loadMtsSemanticIr(tempRoot), ir, "G4-A2 F3 invalid historical README URL cannot veto current IR");
    assert.deepEqual(
      loadHistoricalRequirementLawProjection(tempRoot, registryPath),
      historicalLawProjection,
      "G4-A2 F3 inherited law projection ignores historical README URL validation",
    );
    assert.deepEqual(compileRequirementDocuments(tempRoot, false), [], "G4-A2 F3 invalid historical README URL cannot veto current compile");
    expect(
      () => loadMtsSemanticIr(tempRoot, registryPath),
      /absolute https URL/,
      "G4-A2 F3 full historical replay remains strict",
    );
  } finally {
    writeFileSync(resolve(tempRoot, registryPath), historicalRegistrySource, "utf8");
  }

  try {
    const historicalWithoutProjectRequirements = JSON.parse(historicalRegistrySource) as any;
    delete historicalWithoutProjectRequirements.repositoryRequirements;
    writeRegistry(historicalWithoutProjectRequirements);
    assert.deepEqual(loadMtsSemanticIr(tempRoot), ir, "G4-A2 F4 missing historical repositoryRequirements cannot veto current IR");
    assert.deepEqual(
      loadHistoricalRequirementLawProjection(tempRoot, registryPath),
      historicalLawProjection,
      "G4-A2 F4 inherited law projection does not require historical repositoryRequirements",
    );
    assert.deepEqual(compileRequirementDocuments(tempRoot, false), [], "G4-A2 F4 missing historical repositoryRequirements cannot veto current compile");
    expect(
      () => loadMtsSemanticIr(tempRoot, registryPath),
      /repositoryRequirements must be an array/,
      "G4-A2 F4 full historical replay still requires historical project payload",
    );
  } finally {
    writeFileSync(resolve(tempRoot, registryPath), historicalRegistrySource, "utf8");
  }

  try {
    const historicalLawProvenanceMutation = JSON.parse(historicalRegistrySource) as any;
    historicalLawProvenanceMutation.requirements[0].authority.pointer = "/requiredSemanticLaws/V14-L2";
    writeRegistry(historicalLawProvenanceMutation);
    expect(
      () => loadHistoricalRequirementLawProjection(tempRoot, registryPath),
      /authority must point to its accepted contract law/,
      "G4-A2 F5 inherited law projection must fail closed on historical law provenance mutation",
    );
    expect(
      () => compileRequirementDocuments(tempRoot, false),
      /authority must point to its accepted contract law/,
      "G4-A2 F5 inherited current compilation must remain sensitive to historical law provenance",
    );
    expect(
      () => loadMtsSemanticIr(tempRoot, registryPath),
      /authority must point to its accepted contract law/,
      "G4-A2 F5 full historical replay must remain sensitive to historical law provenance",
    );
  } finally {
    writeFileSync(resolve(tempRoot, registryPath), historicalRegistrySource, "utf8");
  }

  const policyPath = resolve(tempRoot, "repo-policy.json");
  const policySource = JSON.stringify({
    packs: {
      "contract-conformance": {
        current: { contract: { path: "decoy-current-contract" } },
      },
    },
  });
  writeFileSync(policyPath, policySource, "utf8");
  const policy = JSON.parse(policySource) as any;
  policy.packs["contract-conformance"].current.contract.path = "contracts/mts-contract-v0.14.json";
  writeFileSync(policyPath, JSON.stringify(policy), "utf8");
  assert.deepEqual(
    loadMtsSemanticIr(tempRoot),
    ir,
    "repo-policy current contract mutation must not influence accepted v0.15 semantic IR",
  );
  writeFileSync(policyPath, policySource, "utf8");

  const nativeAuthorityCases: Array<[string, (value: any) => void, RegExp]> = [
    [
      "requirements/mts-v0.15.json",
      (value) => { value.contract = "contracts/mts-contract-v0.14.json"; },
      /registry current accepted contract path mismatch/,
    ],
    [
      "traceability/mts-v0.15.json",
      (value) => { value.currentAccepted.contract = "contracts/mts-contract-v0.14.json"; },
      /traceability current accepted contract path mismatch/,
    ],
    [
      "cutover/typescript-c1-acceptance-v0.8.json",
      (value) => { value.current.contract = "contracts/mts-contract-v0.14.json"; },
      /acceptance current contract path mismatch/,
    ],
  ];
  for (const [path, mutate, pattern] of nativeAuthorityCases) {
    const target = resolve(tempRoot, path);
    const source = readFileSync(target, "utf8");
    const value = JSON.parse(source);
    mutate(value);
    writeFileSync(target, JSON.stringify(value), "utf8");
    expect(() => loadMtsSemanticIr(tempRoot), pattern, path);
    writeFileSync(target, source, "utf8");
  }

  // G3-S1 mutation A: legacy normative text is transition evidence only.
  const legacyContractPath = resolve(tempRoot, "contracts/mts-contract-v0.15.json");
  const legacyContractSource = readFileSync(legacyContractPath, "utf8");
  try {
    const value = JSON.parse(legacyContractSource) as any;
    value.requiredSemanticLaws["V15-AND-01"] = "legacy text mutation must not veto native authority";
    writeFileSync(legacyContractPath, JSON.stringify(value), "utf8");
    assert.equal(
      loadMtsSemanticIr(tempRoot).requirements.find((item) => item.id === "V15-AND-01")?.statement,
      ir.requirements.find((item) => item.id === "V15-AND-01")?.statement,
      "G3-S1 mutation A: legacy normative text cannot change current IR statement",
    );
  } finally {
    writeFileSync(legacyContractPath, legacyContractSource, "utf8");
  }

  const nativePath = (id: string): string => `requirements/mts-v0.15/${id}.rg.yaml`;
  const mutateNative = (
    id: string,
    mutate: (source: string) => string,
    pattern: RegExp,
    message: string,
  ): void => {
    const path = nativePath(id);
    const target = resolve(tempRoot, path);
    const source = readFileSync(target, "utf8");
    try {
      writeFileSync(target, mutate(source), "utf8");
      expect(() => loadMtsSemanticIr(tempRoot), pattern, message);
    } finally {
      writeFileSync(target, source, "utf8");
    }
  };

  // G1-S1 fail-closed matrix. Legacy shadow remains intact for every native failure.
  mutateNative("V15-AND-01", () => "format: [\n", /native YAML parse error/, "F1 malformed YAML; F13 no legacy fallback");
  mutateNative(
    "V15-AND-01",
    (source) => source + "id: V15-AND-01\n",
    /native YAML parse error/,
    "F2 duplicate YAML key",
  );
  mutateNative(
    "V15-AND-01",
    (source) => source.replace(/^normative: (.+)$/m, "normative: &g1 $1") + "aliasProbe: *g1\n",
    /aliases are not allowed/,
    "F3 YAML alias usage",
  );
  mutateNative(
    "V15-AND-01",
    (source) => source + "<<: { probe: true }\n",
    /merge keys are not allowed/,
    "F4 YAML merge key",
  );
  mutateNative(
    "V15-AND-01",
    (source) => source.replace(/^normative: (.+)$/m, "normative: !!str $1"),
    /explicit tag/,
    "explicit YAML tags fail closed",
  );
  mutateNative(
    "V15-AND-02",
    (source) => source.replace(/^id: V15-AND-02$/m, "id: V15-AND-01"),
    /duplicate native Requirement ID/,
    "F5 duplicate Requirement ID",
  );

  const missingPath = resolve(tempRoot, nativePath("V15-AND-01"));
  const missingSource = readFileSync(missingPath, "utf8");
  rmSync(missingPath);
  try {
    expect(() => loadMtsSemanticIr(tempRoot), /source count 47 differs from accepted 48/, "F6 missing native Requirement");
  } finally {
    writeFileSync(missingPath, missingSource, "utf8");
  }

  const extraPath = resolve(tempRoot, "requirements/mts-v0.15/V15-EXTRA-01.rg.yaml");
  writeFileSync(
    extraPath,
    [
      "format: repo-guard/requirement-v1",
      "id: V15-EXTRA-01",
      'normative: "unexpected extra Requirement"',
      "lifecycle:",
      "  accepted: true",
      "  current: true",
      "relations:",
      "  - predicates: [verified_by]",
      "    target:",
      "      kind: artifact",
      "      path: ts/test/extra.test.ts",
      "",
    ].join("\n"),
    "utf8",
  );
  try {
    expect(() => loadMtsSemanticIr(tempRoot), /source count 49 differs from accepted 48/, "F7 extra native Requirement");
  } finally {
    rmSync(extraPath);
  }

  mutateNative(
    "V15-AND-01",
    (source) => source.replace(/^id: V15-AND-01$/m, "id: V15-UNEXPECTED-01"),
    /native v0\.15 requirement id set differs/,
    "F7b unexpected native Requirement ID with source count unchanged",
  );

  mutateNative(
    "V15-AND-02",
    (source) => source.replace("      id: V15-AND-01", "      id: V15-NO-SUCH-01"),
    /depends on unknown requirement V15-NO-SUCH-01/,
    "F8 unknown depends_on target",
  );
  mutateNative(
    "V15-AND-02",
    (source) => source.replace("      id: V15-AND-01", "      id: V15-AND-02"),
    /depends on itself/,
    "F9 self depends_on",
  );
  const cycleLeftPath = resolve(tempRoot, nativePath("V15-AND-01"));
  const cycleRightPath = resolve(tempRoot, nativePath("V15-GOV-03"));
  const cycleLeftSource = readFileSync(cycleLeftPath, "utf8");
  const cycleRightSource = readFileSync(cycleRightPath, "utf8");
  try {
    writeFileSync(
      cycleLeftPath,
      cycleLeftSource + [
        "  - predicates: [depends_on]",
        "    target:",
        "      kind: requirement",
        "      id: V15-AND-02",
        "",
      ].join("\n"),
      "utf8",
    );
    writeFileSync(
      cycleRightPath,
      cycleRightSource.replace(
        [
          "  - predicates: [depends_on]",
          "    target:",
          "      kind: requirement",
          "      id: V15-GOV-01",
          "",
        ].join("\n"),
        "",
      ),
      "utf8",
    );
    expect(
      () => loadMtsSemanticIr(tempRoot),
      /dependency cycle detected/,
      "F10 native dependency cycle with accepted 189/33 graph cardinality preserved",
    );
  } finally {
    writeFileSync(cycleLeftPath, cycleLeftSource, "utf8");
    writeFileSync(cycleRightPath, cycleRightSource, "utf8");
  }
  mutateNative(
    "V15-AND-01",
    (source) => source.replace(
      "      kind: artifact\n      path: ts/test/v015-compact-and-approved-source-integrity.test.ts",
      "      kind: requirement\n      path: ts/test/v015-compact-and-approved-source-integrity.test.ts",
    ),
    /target.*(?:missing required field id|unexpected fields)/,
    "F11 malformed verified_by relation",
  );
  const nativeEvidencePath = resolve(tempRoot, nativePath("V15-AND-01"));
  const nativeEvidenceSource = readFileSync(nativeEvidencePath, "utf8");
  const nativeEvidenceBaseline = loadMtsSemanticIr(tempRoot).requirements
    .find((item) => item.id === "V15-AND-01");
  assert.ok(nativeEvidenceBaseline, "G3-S2c native evidence baseline exists");
  try {
    writeFileSync(
      nativeEvidencePath,
      nativeEvidenceSource.replace("  - predicates: [verified_by]", "  - predicates: [implemented_by]"),
      "utf8",
    );
    assert.equal(
      loadMtsSemanticIr(tempRoot).requirements.find((item) => item.id === "V15-AND-01")?.executableGateCount,
      nativeEvidenceBaseline.executableGateCount - 1,
      "G3-S2c mutation G: native verified_by controls current executableGateCount without legacy registry veto",
    );
  } finally {
    writeFileSync(nativeEvidencePath, nativeEvidenceSource, "utf8");
  }
  // G3-S1 mutation B: native normative text changes current IR without legacy synchronization.
  const nativeNormativePath = resolve(tempRoot, nativePath("V15-AND-01"));
  const nativeNormativeSource = readFileSync(nativeNormativePath, "utf8");
  try {
    writeFileSync(
      nativeNormativePath,
      nativeNormativeSource.replace(/^normative: .+$/m, 'normative: "G3-S1 native-only normative mutation"'),
      "utf8",
    );
    assert.equal(
      loadMtsSemanticIr(tempRoot).requirements.find((item) => item.id === "V15-AND-01")?.statement,
      "G3-S1 native-only normative mutation",
      "G3-S1 mutation B: current IR statement follows native .rg without legacy text synchronization",
    );
  } finally {
    writeFileSync(nativeNormativePath, nativeNormativeSource, "utf8");
  }
  mutateNative(
    "V15-AND-01",
    (source) => source.replace("  accepted: true", "  accepted: false"),
    /native lifecycle must be accepted=true,current=true/,
    "F13 native lifecycle failure must not fall back to legacy authority",
  );

  const deterministicShape = (value: ReturnType<typeof loadMtsSemanticIr>): string =>
    JSON.stringify(value.requirements.map((item) => ({
      id: item.id,
      dependsOn: item.dependsOn,
      statementDigest: item.statementDigest,
      authorityDocument: item.authorityDocument,
      authorityPointer: item.authorityPointer,
      executableGateCount: item.executableGateCount,
    })));
  const deterministicBaseline = deterministicShape(loadMtsSemanticIr(tempRoot));
  assert.equal(deterministicShape(loadMtsSemanticIr(tempRoot)), deterministicBaseline, "F14 repeated native load deterministic");
  const nativeSnapshots = nativeV015Paths.map((path) => [path, readFileSync(resolve(tempRoot, path), "utf8")] as const);
  for (const [path] of nativeSnapshots) rmSync(resolve(tempRoot, path));
  for (const [path, source] of [...nativeSnapshots].reverse()) {
    const target = resolve(tempRoot, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, source, "utf8");
  }
  assert.equal(
    deterministicShape(loadMtsSemanticIr(tempRoot)),
    deterministicBaseline,
    "F14 reverse native file creation order must not change IR",
  );

  // G3-S1 mutation D: current causal projection follows native depends_on.
  const nativeDependsPath = resolve(tempRoot, nativePath("V15-AND-02"));
  const nativeDependsSource = readFileSync(nativeDependsPath, "utf8");
  try {
    writeFileSync(
      nativeDependsPath,
      nativeDependsSource.replace("      id: V15-AND-01", "      id: V15-AUTH-01"),
      "utf8",
    );
    assert.deepEqual(
      loadMtsSemanticIr(tempRoot).requirements.find((item) => item.id === "V15-AND-02")?.dependsOn,
      ["V15-AUTH-01"],
      "G3-S1 mutation D: native depends_on changes current causal projection",
    );
  } finally {
    writeFileSync(nativeDependsPath, nativeDependsSource, "utf8");
  }

  const legacyV015Path = resolve(tempRoot, "requirements/mts-v0.15.json");
  const legacyV015Source = readFileSync(legacyV015Path, "utf8");
  try {
    const value = JSON.parse(legacyV015Source) as any;
    value.requirements.find((item: any) => item.id === "V15-AND-01").dependsOn = ["V15-READY-03"];
    writeFileSync(legacyV015Path, JSON.stringify(value), "utf8");
    assert.deepEqual(
      loadMtsSemanticIr(tempRoot).requirements.find((item) => item.id === "V15-AND-01")?.dependsOn,
      [],
      "G3-S1 mutation E: legacy-only dependsOn mutation cannot enter current causal graph",
    );
  } finally {
    writeFileSync(legacyV015Path, legacyV015Source, "utf8");
  }

  const evidenceShadowBaseline = loadMtsSemanticIr(tempRoot).requirements
    .find((item) => item.id === "V15-AND-02");
  assert.ok(evidenceShadowBaseline, "G3-S2c evidence shadow baseline exists");

  const mutateLegacyEvidence = (
    mutate: (evidence: any) => void,
    label: string,
  ): void => {
    try {
      const value = JSON.parse(legacyV015Source) as any;
      const evidence = value.requirements.find((item: any) => item.id === "V15-AND-02").evidence;
      mutate(evidence);
      writeFileSync(legacyV015Path, JSON.stringify(value), "utf8");
      assert.deepEqual(
        loadMtsSemanticIr(tempRoot).requirements.find((item) => item.id === "V15-AND-02"),
        evidenceShadowBaseline,
        label,
      );
    } finally {
      writeFileSync(legacyV015Path, legacyV015Source, "utf8");
    }
  };
  mutateLegacyEvidence(
    (evidence) => { evidence.positiveVectors = ["g3-s2c-legacy-shadow-positive-only"]; },
    "G3-S2c mutation A: registry positiveVectors cannot change current IR",
  );
  mutateLegacyEvidence(
    (evidence) => { evidence.negativeVectors = ["g3-s2c-legacy-shadow-negative-only"]; },
    "G3-S2c mutation B: registry negativeVectors cannot change current IR",
  );
  mutateLegacyEvidence(
    (evidence) => { evidence.requiredExecutableGates = ["ts/test/g3-s2c-legacy-shadow-gate.test.ts"]; },
    "G3-S2c mutation C: registry requiredExecutableGates cannot veto or change current IR",
  );

  const traceV015Path = resolve(tempRoot, "traceability/mts-v0.15.json");
  const traceV015Source = readFileSync(traceV015Path, "utf8");
  const mutateTrace = (
    mutate: (traceRequirement: any) => void,
    assertMutation: (current: NonNullable<typeof evidenceShadowBaseline>) => void,
  ): void => {
    try {
      const value = JSON.parse(traceV015Source) as any;
      const traced = value.requirements["V15-AND-02"];
      mutate(traced);
      writeFileSync(traceV015Path, JSON.stringify(value), "utf8");
      const current = loadMtsSemanticIr(tempRoot).requirements.find((item) => item.id === "V15-AND-02");
      assert.ok(current, "G3-S2c mutated trace Requirement remains projected");
      assertMutation(current);
    } finally {
      writeFileSync(traceV015Path, traceV015Source, "utf8");
    }
  };

  mutateTrace(
    (traced) => { traced.positiveVectors = traced.positiveVectors.slice(0, 1); },
    (current) => assert.equal(
      current.positiveVectorCount,
      evidenceShadowBaseline.positiveVectorCount - 1,
      "G3-S2c mutation D: traceability positive mapping controls current IR count",
    ),
  );
  mutateTrace(
    (traced) => { traced.negativeVectors = traced.negativeVectors.slice(0, 2); },
    (current) => assert.equal(
      current.negativeVectorCount,
      evidenceShadowBaseline.negativeVectorCount - 1,
      "G3-S2c mutation E: traceability negative mapping controls current IR count",
    ),
  );

  try {
    const value = JSON.parse(traceV015Source) as any;
    delete value.requirements["V15-AND-02"].positiveVectors;
    writeFileSync(traceV015Path, JSON.stringify(value), "utf8");
    expect(
      () => loadMtsSemanticIr(tempRoot),
      /V15-AND-02 traceability positiveVectors must be an array/,
      "G3-S2c mutation F: missing current traceability vector mapping fails closed with no registry fallback",
    );
  } finally {
    writeFileSync(traceV015Path, traceV015Source, "utf8");
  }

  const tempLegacyIr = loadMtsSemanticIr(tempRoot, registryPath);
  assert.equal(tempLegacyIr.requirements.length, 14);
  assert.equal(tempLegacyIr.repositoryRequirements.length, 2);
  assert.deepEqual(compileRequirementDocuments(tempRoot, false), []);
  assert.deepEqual(compileRequirementDocuments(tempRoot, true), []);

  const readmePath = resolve(tempRoot, "README.md");
  const readmeSource = readFileSync(readmePath, "utf8");
  const withoutAuthors = readmeSource.replace(
    /<!-- мтс:требование:README-AUTHORS:начало -->[\s\S]*?<!-- мтс:требование:README-AUTHORS:конец -->/,
    "",
  );
  writeFileSync(readmePath, withoutAuthors, "utf8");
  assert.deepEqual(
    compileRequirementDocuments(tempRoot, false),
    ["README.md"],
    "missing required README metadata must make compiler check RED",
  );
  assert.deepEqual(compileRequirementDocuments(tempRoot, true), ["README.md"]);
  const restoredReadme = readFileSync(readmePath, "utf8");
  for (const requiredText of [
    "https://netkeep80.github.io/anum_docs/",
    "Вертушкин Роман Павлович",
    "Дьяченко Константин Константинович",
    "Шакиров Тимур Эдуардович",
    "Бурдуков Александр Николаевич",
    "Глазунов Иван Сергеевич",
  ]) {
    assert.ok(restoredReadme.includes(requiredText), `docs:sync must restore README metadata: ${requiredText}`);
  }

  const registrySource = readFileSync(resolve(tempRoot, registryPath), "utf8");
  const cases: Array<[(r: any) => void, RegExp]> = [
    [(r) => { r.schema = "mts-requirement-registry/v9"; }, /unsupported registry schema/],
    [(r) => { r.requirements.find((x: any) => x.id === "V14-L12").classification.path = "flat"; }, /hierarchical path/],
    [(r) => { r.requirements.find((x: any) => x.id === "V14-L12").dependsOn = ["NO_SUCH"]; }, /unknown requirement/],
    [(r) => { r.requirements.find((x: any) => x.id === "V14-L12").docProjection.path = "docs/specs/Формальная нотация МТС.md"; }, /differs from traceability documentation owner/],
    [(r) => { r.requirements = r.requirements.filter((x: any) => x.id !== "V14-L14"); }, /requirement id set differs/],
    [(r) => { r.repositoryRequirements = r.repositoryRequirements.filter((x: any) => x.id !== "README-AUTHORS"); }, /repository requirement id set differs/],
    [(r) => { r.repositoryRequirements.find((x: any) => x.id === "README-OBSERVATORY").url = "http://example.test"; }, /absolute https URL/],
    [(r) => { r.repositoryRequirements.find((x: any) => x.id === "README-AUTHORS").contributors = []; }, /contributors must be a non-empty array/],
  ];
  for (const [mutate, pattern] of cases) {
    const registry = readRegistry();
    mutate(registry);
    writeRegistry(registry);
    expect(() => loadMtsSemanticIr(tempRoot, registryPath), pattern);
    writeFileSync(resolve(tempRoot, registryPath), registrySource, "utf8");
  }

  const rogue = resolve(tempRoot, "docs/Новый неизвестный документ.md");
  writeFileSync(rogue, "# Новый документ\n", "utf8");
  expect(() => loadMtsSemanticIr(tempRoot, registryPath), /Markdown document surface differs/);
  rmSync(rogue);

  const a4OwnerPath = resolve(tempRoot, "docs/theory/Система аксиом МТС.md");
  const a4OwnerSource = readFileSync(a4OwnerPath, "utf8");
  writeFileSync(
    a4OwnerPath,
    a4OwnerSource.replace(/^<a id="mts-v014-v14-l12"><\/a>.*\r?\n/m, ""),
    "utf8",
  );
  expect(
    () => compileRequirementDocuments(tempRoot, false),
    /anchor not found/,
    "materialized projection must fail closed when a stable owner anchor disappears",
  );
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}

console.log("MTS Compiler D20: GREEN CURRENT_REQUIREMENTS=48 CURRENT_REGISTRY=v0.3 MARKDOWN_COMPATIBILITY_REQUIREMENTS=14 LEGACY_REGISTRY=v0.2");
