import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd(), "..");
const inventory = JSON.parse(readFileSync(resolve(root, "audits/v015-formula-candidate-inventory.json"), "utf8")) as {
  schema: string;
  status: string;
  files: { path: string; blobSha: string; lineCount: number }[];
  counts: { files: number; candidates: number; fences: number; inline: number };
  classification: {
    acceptedFormalDenotationsVerified: number;
    reviewedNonFormalCount: number;
    unverifiedDenotationCount: number;
    verifiedFormalCount: number;
  };
  candidates: { id: string; path: string; startLine: number; endLine: number; kind: string; source: string; role: string; denotation: string }[];
};
assert.equal(inventory.schema, "mts-v015-current-doc-formula-candidate-inventory/v0.1");
assert.equal(inventory.status, "CLASSIFIED_DENOTATION_VERIFIED_CURRENT_SCOPE");
assert.equal(inventory.classification.acceptedFormalDenotationsVerified, 26);
assert.equal(inventory.classification.reviewedNonFormalCount, 185);
assert.equal(inventory.classification.unverifiedDenotationCount, 0);
assert.equal(inventory.classification.verifiedFormalCount, 26);
const candidate = /⟼|->|≡|∈|⇒|=|\{\}|\{[A-Za-zА-Яа-я, ]+\}|\bDen\(|\bJ\(/u;
const actual: typeof inventory.candidates = [];
for (const file of inventory.files) {
  const content = readFileSync(resolve(root, file.path), "utf8");
  const gitObject = Buffer.from("blob " + Buffer.byteLength(content, "utf8") + "\0" + content, "utf8");
  assert.equal(createHash("sha1").update(gitObject).digest("hex"), file.blobSha, file.path + " source blob drift");
  const lines = content.split(/\r?\n/);
  assert.equal(lines.length, file.lineCount, file.path + " line count drift");
  let inside = false;
  let firstLine = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const fence = line.match(/^\s*(```|~~~)(\w*)/);
    if (fence !== null) {
      if (!inside) {
        inside = true;
        firstLine = i;
      } else {
        const source = lines.slice(firstLine + 1, i).join("\n");
        if (candidate.test(source)) actual.push({
          id: "F" + String(actual.length + 1).padStart(4, "0"),
          path: file.path,
          startLine: firstLine + 2,
          endLine: i,
          kind: "fence",
          source,
          role: "UNCLASSIFIED",
          denotation: "NOT_VERIFIED",
        });
        inside = false;
      }
      continue;
    }
    if (inside) continue;
    for (const match of line.matchAll(/`([^`\n]+)`/g)) {
      const expression = match[1]!;
      if (candidate.test(expression)) actual.push({
        id: "F" + String(actual.length + 1).padStart(4, "0"),
        path: file.path,
        startLine: i + 1,
        endLine: i + 1,
        kind: "inline-code",
        source: expression,
        role: "UNCLASSIFIED",
        denotation: "NOT_VERIFIED",
      });
    }
  }
}
assert.equal(inventory.counts.files, inventory.files.length);
assert.equal(inventory.counts.candidates, actual.length);
assert.equal(inventory.counts.fences, actual.filter((entry) => entry.kind === "fence").length);
assert.equal(inventory.counts.inline, actual.filter((entry) => entry.kind === "inline-code").length);
const occurrenceKey = (entry: typeof inventory.candidates[number]): string =>
  JSON.stringify([entry.path, entry.startLine, entry.endLine, entry.kind, entry.source]);
const actualOccurrenceKeys = actual.map(occurrenceKey).sort();
const inventoryOccurrenceKeys = inventory.candidates.map(occurrenceKey).sort();
assert.deepEqual(actualOccurrenceKeys, inventoryOccurrenceKeys,
  "formula inventory must cover the exact current source occurrences independent of audit-ID ordering");
assert.equal(new Set(actualOccurrenceKeys).size, actualOccurrenceKeys.length,
  "source occurrence identity must be unambiguous before assigning a stable audit ID");
const auditIds = inventory.candidates.map((entry) => entry.id);
assert.equal(new Set(auditIds).size, auditIds.length, "formula audit IDs are unique stable identities");
assert.ok(auditIds.every((id) => /^F[0-9]{4}$/.test(id)),
  "formula audit IDs use the stable Fdddd namespace");
assert.equal(inventory.candidates.length, actual.length);
const processCandidates = inventory.candidates.filter((entry) => entry.role === "NON_FORMAL_PROCESS_DIAGRAM");
assert.equal(processCandidates.length, 15, "only reviewed governance/process diagram cases are non-FORMAL");
for (const entry of processCandidates) {
  assert.ok(["docs/CONTRIBUTING.md", "README.md"].includes(entry.path), "only documented workflow examples can be exempted");
  assert.ok(["NOT_APPLICABLE_PROCESS_DOCUMENTATION","NOT_APPLICABLE_FORMAL_SOURCE"].includes(entry.denotation));
}
const representationCandidates = inventory.candidates.filter((entry) => entry.role === "NON_FORMAL_REPRESENTATION_META_NOTATION");
assert.equal(representationCandidates.length, 9, "only separate structural codec/Anum representation examples are excluded");
assert.ok(representationCandidates.every((entry) => entry.path === "docs/specs/Ачисла и сериализация.md" &&
  entry.denotation === "NOT_APPLICABLE_FORMAL_SOURCE"));
const lifecycleCandidates = inventory.candidates.filter((entry) => entry.role === "NON_FORMAL_GOVERNANCE_VOCABULARY");
assert.equal(lifecycleCandidates.length, 2, "only identified lifecycle vocabulary is excluded");
assert.deepEqual(new Set(lifecycleCandidates.map((entry) => entry.path)), new Set(["docs/Словарь терминов МТС.md", "README.md"]));
const historicalMetanotation = inventory.candidates.filter((entry) =>
  ["NON_FORMAL_HISTORICAL_RELATIONAL_METASCHEME",
   "NON_FORMAL_HISTORICAL_PSEUDOCODE_MENTION",
   "NON_FORMAL_HISTORICAL_EVIDENCE_FLAG"].includes(entry.role));
assert.equal(historicalMetanotation.length, 11, "legacy v0.14 relational sketches are scoped, not current FORMAL");
assert.ok(historicalMetanotation.every((entry) =>
  entry.denotation === "NOT_APPLICABLE_FORMAL_SOURCE" &&
  typeof (entry as typeof entry & { reviewBasis?: string }).reviewBasis === "string"),
  "historical notation cannot be mislabeled v0.15 denotation evidence");
const foundation = readFileSync(resolve(root, "docs/theory/Основания МТС.md"), "utf8");
const axiom = readFileSync(resolve(root, "docs/theory/Система аксиом МТС.md"), "utf8");
assert.ok(foundation.includes("**Историческая схема** положительного образа v0.14"));
assert.ok(axiom.includes("**Историческая метасхема v0.14**"));
assert.ok(foundation.includes("`A:{}` в принятой FORMAL v0.15 означает"));
assert.ok(!foundation.includes("A -> {}      успешный пустой образ"),
  "old pseudo ZERO cannot masquerade as current FORMAL example");
const acceptedMetanotation = inventory.candidates.filter((entry) =>
  entry.role === "NON_FORMAL_ACCEPTED_SEMANTIC_METANOTATION");
const formalSyntaxLegends = inventory.candidates.filter((entry) =>
  entry.role === "NON_FORMAL_FORMAL_SYNTAX_LEGEND");
assert.deepEqual(acceptedMetanotation.map((entry) => entry.id), ["F0127"]);
assert.deepEqual(formalSyntaxLegends.map((entry) => entry.id), ["F0128"]);
assert.ok([...acceptedMetanotation, ...formalSyntaxLegends].every((entry) =>
  entry.path === "docs/specs/Формальная нотация МТС.md" &&
  entry.denotation === "NOT_APPLICABLE_FORMAL_SOURCE" &&
  (entry as typeof entry & { sourceArtifact?: string }).sourceArtifact ===
    "ts/src/tooling/formal-notation-v015-markdown.ts" &&
  typeof (entry as typeof entry & { reviewBasis?: string }).reviewBasis === "string"),
  "accepted metanotation and syntax legends must remain generator-owned and explicitly non-executable");

const queryMeta = inventory.candidates.filter((entry) => entry.role === "NON_FORMAL_DERIVED_QUERY_METANOTATION");
assert.equal(queryMeta.length, 20, "derived ValueBundle query syntax must not be passed off as native FORMAL source");
assert.ok(queryMeta.every((entry) =>
  entry.path === "docs/specs/Пучки связей.md" &&
  entry.denotation === "NOT_APPLICABLE_FORMAL_SOURCE" &&
  typeof (entry as typeof entry & { reviewBasis?: string }).reviewBasis === "string"));
const bundleDoc = readFileSync(resolve(root, "docs/specs/Пучки связей.md"), "utf8");
assert.ok(bundleDoc.includes("равенство значений производного поискового API, **не** оператор идентичности Link в FORMAL v0.15"));
const acceptedBundleSource = inventory.candidates.filter((entry) =>
  entry.path === "docs/specs/Пучки связей.md" && entry.role === "FORMAL_V015_NOTATION_SPECIMEN");
assert.equal(acceptedBundleSource.length, 3);
assert.deepEqual(acceptedBundleSource.map((entry) => entry.source).sort(), ["A:{}", "A:{}", "{ A }"].sort());
assert.ok(acceptedBundleSource.every((entry) => entry.denotation === "VERIFIED_AGAINST_ACCEPTED_V015"),
  "the three exact bundle specimens are now backed by bounded native B20 receipts");
const historicalTheorems = JSON.parse(readFileSync(resolve(root, "theorems/current-v0.14.json"), "utf8")) as {
  theorems: { id: string; statement: string }[];
};
const formalOverlay = JSON.parse(readFileSync(resolve(root, "theorems/formal-v0.15.json"), "utf8")) as {
  entries: {
    id: string; formalStatement: string; proofClosure: string; formalArtifactKind: string;
    aproverStatus: string;
  }[];
};
const historicalStatements = inventory.candidates.filter((entry) =>
  entry.role === "NON_FORMAL_HISTORICAL_THEOREM_STATEMENT") as Array<typeof inventory.candidates[number] & {
    sourceArtifact: string; sourceTheoremId: string }>;
assert.equal(historicalStatements.length, 16, "generated source formula text is provenance, not FORMAL parser input");
for (const entry of historicalStatements) {
  assert.equal(entry.path, "docs/theory/Теоремы МТС.md");
  assert.equal(entry.denotation, "NOT_APPLICABLE_FORMAL_SOURCE");
  assert.equal(entry.sourceArtifact, "theorems/current-v0.14.json");
  assert.equal(historicalTheorems.theorems.find((theorem) => theorem.id === entry.sourceTheoremId)?.statement,
    entry.source, entry.id + " exact historical theorem source statement");
}
const actualFormalStatements = inventory.candidates.filter((entry) =>
  entry.role === "FORMAL_V015_THEOREM_STATEMENT") as typeof historicalStatements;
assert.equal(actualFormalStatements.length, 16, "current FORMAL overlay instances tracked individually");
const expectedTheoremReceipts = new Map<string, readonly [string, string, string, string, string]>([
  ["F0063", ["FND-01", "67eff6eee442df4fa067a9cad0a39bf17d00c69ffd18d3d8597a94299a2d7afb", "b85b51f82cfd4c57d97633a82f7f80b5ff9c4691906434c48deb8b16fad65745", "NO_PROOF_ARTIFACT", "STATEMENT_ONLY"]],
  ["F0067", ["FND-02", "498e0952d05cbed29e23e3cc7b20f5fbd96aa8ef85352e65774dbd5e786d8355", "1330bb0bc229e2e48c6a8b5132471dd8455273e6d74eb467f42f33d6d5cdbb3a", "N_A_FOR_KERNEL_REALIZATION", "KERNEL_REALIZATION"]],
  ["F0071", ["FND-13", "2ac9e8521c4d46c497897131dc53873aba9e6798f14ded66239ff072acf2b804", "94dd33cc30f2a55bb1f7b187c89990c3f050309f0e1d3069c20d506f04bd8cbf", "N_A_FOR_KERNEL_REALIZATION", "KERNEL_REALIZATION"]],
  ["F0084", ["FND-07", "c73af6577fa8b995f83401777498af7a24dc9697cc6fa4174b8b346418e85efe", "4e367ad2c0657f4374721225ce0aeb82939f6021da76236740a27f29d39c759e", "CLOSED", "CLOSED_PROOF"]],
  ["F0090", ["FND-08", "cf8aee8d965e2dca0a8613eaa13cc7c44430801291da10c1d4a7f3cac57b1b1c", "fb610912423b26659fd29795d5bb9311f040755a3f89bd590ae4aa2e4fc3cf29", "OPEN_CONDITIONAL", "OPEN_PROOF"]],
  ["F0094", ["FND-09", "536764d9b930207e9cde8bbb473ea83c952e80548e64316945b6b7016db7c067", "5ae0ddc9fb7c387afd9c68382a83c67ba1d379bcd129d7295c2fdebc8d7ef359", "OPEN_CONDITIONAL", "OPEN_PROOF"]],
  ["F0116", ["EXE-02", "4d79474df7c37b58172aae10980e1b4a5501f2c78ab362769bf2aa021eed8265", "d6d9114f7acab454b2f607ee419623b4acf3ab98c9da16b46c1593af1d15566a", "NO_PROOF_ARTIFACT", "STATEMENT_ONLY"]],
  ["F0203", ["FND-03", "32e0bacb882a7b1ed5363e6b6f7a7b6431697547e7e73d52c65cd95aa032d61e", "1ee7fb49ac3fe76e91f155cbaca60e1942a7ec23622399e00ff481e4fa8c81aa", "NO_PROOF_ARTIFACT", "STATEMENT_ONLY"]],
  ["F0204", ["FND-05", "e9dfedc0b8a4e5ed943c3f79b362335120a7ddd99b0a1f1a0e6763819b868494", "6d5f6f46b93b992a417a76dbca52a5c1ff9fc740cfe18742ed4189ff6baa82a9", "NO_PROOF_ARTIFACT", "STATEMENT_ONLY"]],
  ["F0205", ["INV-01", "98ab26955ee9e649f6476470f6686766c3e7ee1e6cd126c141b19e063b7c6f3b", "f22c4bcc32f0630c57a3449df03b2a7d79f6dfc5b811eefa54bc3cfcc4556651", "NO_PROOF_ARTIFACT", "STATEMENT_ONLY"]],
  ["F0206", ["FND-04", "1a5f9297a72e56695974f4ea3d6f7bde98fca75090d3c5911ba899952888e245", "c40aa3be89b307fe0e2a6dfa725c799c835db7de7d8967a537e5953d97a06130", "NO_PROOF_ARTIFACT", "STATEMENT_ONLY"]],
  ["F0207", ["INV-03", "8d1df4cc4032a62ed81752222cf2a79783ca3bebfb41fac55fb0e6ab75ae0634", "cde77b3ae7f9df8def236e0c809371e19fd062b46a9395f359c77c7d572bd458", "NO_PROOF_ARTIFACT", "STATEMENT_ONLY"]],
  ["F0208", ["INV-02", "75ff17b6cb88b623565bed9a7b4388c272d56871962ea85262cd3a436524f4c9", "50768b16f08916a51e83d7275519ddce93bb7f4e8fb5478651522077a9972663", "NO_PROOF_ARTIFACT", "STATEMENT_ONLY"]],
  ["F0209", ["INV-04", "5103de2fef6e17ba6df4cd658daa5981322869ed19b07a59cc8a141e8bbcc2ee", "39d252dfad7de7c816979e3e7c193aa221fb84c00e53333fc643a77a19662b53", "NO_PROOF_ARTIFACT", "STATEMENT_ONLY"]],
  ["F0210", ["FND-06", "e1bb790745a602ecf5c1fa1ae96f0bf774ecbbe21783a8a2cc46b1c799667f7a", "a2e858f237726762c66876ac49b9f6567c290174a73fbbf65be689d3685b8d1c", "NO_PROOF_ARTIFACT", "STATEMENT_ONLY"]],
  ["F0211", ["FND-11", "f09e4f9a5ee562358352146a0d0a2139c125a83291d122263a632ccb81b6aebe", "c46bacba2d772653e42f70f32ed4147d8cf2205eeec5c020ff632ef65177a947", "NO_PROOF_ARTIFACT", "STATEMENT_ONLY"]],
] as const);
for (const entry of actualFormalStatements) {
  assert.equal(entry.sourceArtifact, "theorems/formal-v0.15.json");
  assert.equal(entry.denotation, "VERIFIED_AGAINST_ACCEPTED_V015",
    "the migrated theorem statement sources require bounded mapping receipts");
  const expected = expectedTheoremReceipts.get(entry.id);
  assert.ok(expected, entry.id + " theorem receipt is explicitly enumerated");
  assert.equal(entry.sourceTheoremId, expected![0]);
  const overlay = formalOverlay.entries.find((theorem) => theorem.id === entry.sourceTheoremId);
  assert.equal(overlay?.formalStatement, entry.source, entry.id + " exact theorem FORMAL statement source");
  assert.equal(overlay?.proofClosure, expected![3], entry.id + " proof closure must not be promoted");
  assert.equal(overlay?.formalArtifactKind, expected![4], entry.id + " artifact kind must not be promoted");
  assert.equal(overlay?.aproverStatus, "NOT_RECORDED", entry.id + " aprover status must remain NOT_RECORDED");

  const semantic = (entry as typeof entry & { semanticEvidence?: Record<string, any> }).semanticEvidence;
  assert.ok(semantic, entry.id + " theorem statement requires semanticEvidence");
  assert.equal(semantic!.compilerVersion, "mts-v015-theorem-statement-evidence/v0.1");
  assert.equal(semantic!.acceptedFormalVersion, "v0.15");
  assert.equal(semantic!.formalSourceSha256, expected![1]);
  assert.equal(semantic!.executionApplicability, "NOT_APPLICABLE");
  assert.ok(String(semantic!.executionRationale).length >= 20);
  for (const [stage, marker] of Object.entries({
    grammar: "THEOREM_STAGE_GRAMMAR",
    denotation: "THEOREM_STAGE_DENOTATION",
    semanticLinks: "THEOREM_STAGE_SEMANTIC_LINKS",
    theoremMapping: "THEOREM_STAGE_MAPPING",
  })) {
    const stageEvidence = semantic![stage] as { path: string; gitBlobSha: string; testCase: string };
    assert.equal(stageEvidence.path, "ts/test/v015-theorem-statement-evidence-verifier.test.ts");
    assert.equal(stageEvidence.gitBlobSha, "c59d29a1127c854fed3eb484fa390d50bd350ba5");
    assert.equal(stageEvidence.testCase, marker);
  }
  const receipt = semantic!.machineReceipt as Record<string, string>;
  assert.equal(receipt.profile, "mts-v015-theorem-statement-evidence/v0.1");
  assert.equal(receipt.outcome, "PASS");
  assert.equal(receipt.caseId, entry.id);
  assert.equal(receipt.formalSourceSha256, expected![1]);
  assert.equal(receipt.semanticAnetSha256, expected![2]);
  assert.equal(receipt.runnerSourceSha256,
    "9c8716e3a96a9a66d9e12d68f42716c14f9a07b549c8510f4a60385ba0573a2b");
  if (receipt.evidenceCommit !== undefined) assert.match(receipt.evidenceCommit, /^[0-9a-f]{40}$/);
  if (receipt.ciRun !== undefined) assert.match(receipt.ciRun, /^\d+$/);
  if (receipt.ciJob !== undefined) assert.match(receipt.ciJob, /^\d+$/);
}
const toolchainPins = inventory.candidates.filter((entry) => entry.role === "NON_FORMAL_PROOF_TOOLCHAIN_IDENTITY");
assert.equal(toolchainPins.length, 42, "Lean/Rocq digests must never count as semantic Link equations");
assert.ok(toolchainPins.every((entry) => entry.path === "docs/theory/Теоремы МТС.md" &&
  /linux-sha256=|;docker=/.test(entry.source) && entry.denotation === "NOT_APPLICABLE_FORMAL_SOURCE"));
const externalProofCommentary = inventory.candidates.filter((entry) =>
  entry.role === "NON_FORMAL_THEOREM_EVIDENCE_COMMENTARY");
assert.equal(externalProofCommentary.length, 7);
assert.ok(externalProofCommentary.every((entry) => entry.path === "docs/theory/Теоремы МТС.md"));
const amemoryProfileCandidates = inventory.candidates.filter((entry) =>
  entry.role === "NON_FORMAL_HISTORICAL_EXECUTION_PROFILE_SKETCH" ||
  entry.role === "NON_FORMAL_HISTORICAL_EXECUTION_PROFILE_STATUS");
assert.equal(amemoryProfileCandidates.length, 34, "A-memory 0.1.0 profile examples are not native FORMAL programs");
assert.equal(amemoryProfileCandidates.filter((entry) =>
  entry.role === "NON_FORMAL_HISTORICAL_EXECUTION_PROFILE_SKETCH").length, 25);
assert.equal(amemoryProfileCandidates.filter((entry) =>
  entry.role === "NON_FORMAL_HISTORICAL_EXECUTION_PROFILE_STATUS").length, 9);
assert.ok(amemoryProfileCandidates.every((entry) =>
  entry.path === "docs/specs/Апамять и управление сетью связей.md" &&
  entry.denotation === "NOT_APPLICABLE_FORMAL_SOURCE"));
const amemoryDocumentation = readFileSync(resolve(root, "docs/specs/Апамять и управление сетью связей.md"), "utf8");
assert.ok(amemoryDocumentation.includes("**не является исходной грамматикой FORMAL v0.15**"));
assert.ok(amemoryDocumentation.includes("**псевдокод профиля 0.1.0**"));
const formalAmemoryBundle = inventory.candidates.filter((entry) =>
  entry.path === "docs/specs/Апамять и управление сетью связей.md" &&
  entry.role === "FORMAL_V015_NOTATION_SPECIMEN");
assert.equal(formalAmemoryBundle.length, 1);
assert.equal(formalAmemoryBundle[0]!.source, "A:{}");
assert.equal(formalAmemoryBundle[0]!.denotation, "VERIFIED_AGAINST_ACCEPTED_V015");
const inheritedMathematics = inventory.candidates.filter((entry) =>
  entry.role === "NON_FORMAL_INHERITED_V014_MATHEMATICAL_NOTATION");
const inheritedRelational = inventory.candidates.filter((entry) =>
  entry.role === "NON_FORMAL_INHERITED_V014_RELATIONAL_METASCHEME");
const foundationDiagrams = inventory.candidates.filter((entry) =>
  entry.role === "NON_FORMAL_FOUNDATION_EXPLANATORY_DIAGRAM");
assert.equal(inheritedMathematics.length, 11, "v0.14 mathematics is not FORMAL equality source");
assert.equal(inheritedRelational.length, 6, "contextual proof sketches are not native FORMAL programs");
assert.equal(foundationDiagrams.length, 2, "foundation illustrations do not need invented denotation");
assert.ok([...inheritedMathematics, ...inheritedRelational, ...foundationDiagrams].every((entry) =>
  entry.denotation === "NOT_APPLICABLE_FORMAL_SOURCE" &&
  typeof (entry as typeof entry & { reviewBasis?: string }).reviewBasis === "string"),
  "legacy notation exemptions are scope-limited and documented");
const nativeWitnessCandidates = inventory.candidates.filter((entry) =>
  (entry as typeof entry & { nativeEvidence?: unknown }).nativeEvidence !== undefined);
assert.equal(nativeWitnessCandidates.length, 6, "native bounded witnesses cover six current FORMAL specimens");
assert.deepEqual(nativeWitnessCandidates.map((entry) => entry.id).sort(),
  ["F0028", "F0036", "F0152", "F0180", "F0181", "F0184"].sort());
const boundedVerifiedIds = new Set(["F0036", "F0152", "F0180", "F0181", "F0184"]);
const expectedB20SourceHashes = new Map([
  ["F0180", "c72070dee0bb1c1ba234511d101ebb704b11fe525c35c297ae89cfe86033ad70"],
  ["F0036", "c9e8f2bccf320fa68d223b05a79ae6c3ff12cc11cbc85f6c93b58b498b8028a9"],
  ["F0152", "c9e8f2bccf320fa68d223b05a79ae6c3ff12cc11cbc85f6c93b58b498b8028a9"],
  ["F0181", "c9e8f2bccf320fa68d223b05a79ae6c3ff12cc11cbc85f6c93b58b498b8028a9"],
  ["F0184", "c9e8f2bccf320fa68d223b05a79ae6c3ff12cc11cbc85f6c93b58b498b8028a9"],
]);
for (const entry of nativeWitnessCandidates) {
  const witness = (entry as typeof entry & { nativeEvidence: {
    kind: string; testPath: string; testBlobSha: string; status: string; limitation: string;
    verifiedOnCommit: string; ciRun: string; scope: string;
  }; semanticEvidence?: {
    compilerVersion: string; acceptedFormalVersion: string; formalSourceSha256: string;
    executionApplicability: string; executionRationale: string;
    grammar: { path: string; gitBlobSha: string; testCase: string };
    denotation: { path: string; gitBlobSha: string; testCase: string };
    semanticLinks: { path: string; gitBlobSha: string; testCase: string };
    jsonParity: { path: string; gitBlobSha: string; testCase: string };
    machineReceipt: {
      profile: string; outcome: string; caseId: string; formalSourceSha256: string;
      semanticAnetSha256: string; runnerSourceSha256: string; evidenceCommit: string;
      ciRun: string; ciJob: string;
    };
  } }).nativeEvidence;
  assert.ok(["NATIVE_FORMAL_ROOT_BASIS_WIRE",
    "FORMAL_JSON_SOURCE_PARITY_EMPTY_BUNDLE_DENOTATION"].includes(witness.kind));
  const original = readFileSync(resolve(root, witness.testPath), "utf8");
  const gitObject = Buffer.from("blob " + Buffer.byteLength(original, "utf8") + "\0" + original, "utf8");
  assert.equal(createHash("sha1").update(gitObject).digest("hex"), witness.testBlobSha,
    entry.id + " evidence file must match pinned native test source");
  assert.equal(witness.status, "BOUNDED_NATIVE_RECEIPT_VERIFIED");
  assert.equal(entry.denotation, "VERIFIED_AGAINST_ACCEPTED_V015");
  const semantic = (entry as typeof entry & { semanticEvidence?: Record<string, any> }).semanticEvidence;
  assert.ok(semantic, entry.id + " verified denotation requires semanticEvidence");
  if (entry.id === "F0028") {
    assert.equal(semantic!.compilerVersion, "mts-v015-root-basis-evidence/v0.1");
    assert.equal(semantic!.acceptedFormalVersion, "v0.15");
    assert.equal(semantic!.formalSourceSha256,
      "4a13d9722fcafe057f92caaece82445fee38b33d33fdfd5dc5b32f531611a705");
    assert.equal(semantic!.executionApplicability, "NOT_APPLICABLE");
    assert.ok(String(semantic!.executionRationale).length >= 20);
    for (const [stage, marker] of Object.entries({
      grammar: "ROOT_BASIS_STAGE_GRAMMAR",
      denotation: "ROOT_BASIS_STAGE_DENOTATION",
      semanticLinks: "ROOT_BASIS_STAGE_SEMANTIC_LINKS",
      jsonParity: "ROOT_BASIS_STAGE_JSON_PARITY",
    })) {
      const stageEvidence = semantic![stage] as { path: string; gitBlobSha: string; testCase: string };
      assert.equal(stageEvidence.path, "ts/test/v015-root-basis-evidence-verifier.test.ts");
      assert.equal(stageEvidence.gitBlobSha, "ac2d20bb9f8290e13528a687d466146bca13c3fa");
      assert.equal(stageEvidence.testCase, marker);
    }
    const receipt = semantic!.machineReceipt as Record<string, string>;
    assert.equal(receipt.profile, "mts-v015-root-basis-evidence/v0.1");
    assert.equal(receipt.outcome, "PASS");
    assert.equal(receipt.caseId, "F0028");
    assert.equal(receipt.formalSourceSha256, semantic!.formalSourceSha256);
    assert.equal(receipt.semanticAnetSha256,
      "b1e89aa3b63820179bdbef36a409f6fcf10e75ff909de127c45c7b9db1082a07");
    assert.equal(receipt.runnerSourceSha256,
      "a3f89ec2410b13d53340cf94dc8d1f509edf7813dfc03d2e0fe900a197800fe6");
    assert.equal(receipt.evidenceCommit, "a98e455f8dbd7ec3c8cc0d35c1a7c56ecae8a927");
    assert.equal(receipt.ciRun, "37832996634");
    assert.equal(receipt.ciJob, "113502835860");
    assert.equal(witness.verifiedOnCommit, "a98e455f8dbd7ec3c8cc0d35c1a7c56ecae8a927");
    assert.ok(witness.ciRun.endsWith("/37832996634"));
    continue;
  }
  assert.ok(boundedVerifiedIds.has(entry.id), entry.id + " unexpected native witness profile");
  assert.equal(semantic!.compilerVersion, "mts-v015-native-evidence/v0.1");
  assert.equal(semantic!.acceptedFormalVersion, "v0.15");
  assert.equal(semantic!.formalSourceSha256, expectedB20SourceHashes.get(entry.id));
  assert.equal(semantic!.executionApplicability, "NOT_APPLICABLE");
  assert.ok(String(semantic!.executionRationale).length >= 20);
  for (const [stage, marker] of Object.entries({
    grammar: "B20_STAGE_GRAMMAR",
    denotation: "B20_STAGE_DENOTATION",
    semanticLinks: "B20_STAGE_SEMANTIC_LINKS",
    jsonParity: "B20_STAGE_JSON_PARITY",
  })) {
    const stageEvidence = semantic![stage] as { path: string; gitBlobSha: string; testCase: string };
    assert.equal(stageEvidence.path, "ts/test/v015-native-evidence-verifier.test.ts");
    assert.equal(stageEvidence.gitBlobSha, "59ebaa3313e4e1619199de39a6332e26b77fdb73");
    assert.equal(stageEvidence.testCase, marker);
  }
  const receipt = semantic!.machineReceipt as Record<string, string>;
  assert.equal(receipt.profile, "mts-v015-native-evidence/v0.1");
  assert.equal(receipt.outcome, "PASS");
  assert.equal(receipt.caseId, entry.id);
  assert.equal(receipt.formalSourceSha256, semantic!.formalSourceSha256);
  assert.match(receipt.semanticAnetSha256!, /^[0-9a-f]{64}$/, "native receipt requires semantic ANet SHA-256");
  assert.equal(receipt.runnerSourceSha256,
    "4ae3b27df9eefa97e1a4ad06a53a18c66eaa07406ae87599dafa6cd81abd3720");
  assert.equal(receipt.evidenceCommit, "89614d94e479d21550de5522e1f5168be0decb48");
  assert.equal(receipt.ciRun, "37820849894");
  assert.equal(receipt.ciJob, "113461627151");
}
const semanticMetamodel = inventory.candidates.filter((entry) =>
  entry.role === "FORMAL_V015_SEMANTIC_METAMODEL");
assert.deepEqual(semanticMetamodel.map((entry) => entry.id).sort(),
  ["F0005", "F0031", "F0048", "F0130"].sort());
const expectedMetamodel = new Map([
  ["F0005", ["306ed02550ce3808aa18ed15f046d14fc27022d37781670d96c862f9ded6eb83",
    "027996fdef690e0897563f13a58894031644fcbbcc4d17d4795a6ae53849529c"]],
  ["F0031", ["8a347f3a822a28be0a9c6ea41c30f1efe81bcb28fe91f34bb289837a5759d9b0",
    "257cc576383eb10c4a2d3a615b6765d861e27963d96b8d4542b0a9b378ac82b3"]],
  ["F0048", ["8a347f3a822a28be0a9c6ea41c30f1efe81bcb28fe91f34bb289837a5759d9b0",
    "257cc576383eb10c4a2d3a615b6765d861e27963d96b8d4542b0a9b378ac82b3"]],
  ["F0130", ["6556a2c3a6bc80a617fb08279519e8b5d34dc187911df249a26d0ee4d1a575aa",
    "10189db23b6cd316358055cd8554ca46118be6c3b97c7ca46dcdd12742fd8424"]],
]);
for (const entry of semanticMetamodel) {
  assert.equal(entry.denotation, "VERIFIED_AGAINST_ACCEPTED_V015");
  const semantic = (entry as typeof entry & { semanticEvidence?: Record<string, any> }).semanticEvidence;
  assert.ok(semantic, entry.id + " metamodel requires semanticEvidence");
  assert.equal(semantic!.compilerVersion, "mts-v015-semantic-metamodel-evidence/v0.1");
  assert.equal(semantic!.acceptedFormalVersion, "v0.15");
  assert.equal(semantic!.executionApplicability, "NOT_APPLICABLE");
  assert.ok(String(semantic!.executionRationale).length >= 20);
  const expected = expectedMetamodel.get(entry.id);
  assert.ok(expected, entry.id + " exact metamodel receipt is enumerated");
  assert.equal(semantic!.formalSourceSha256, expected![0]);
  for (const [stage, marker] of Object.entries({
    metamodelMapping: "METAMODEL_STAGE_MAPPING",
    denotation: "METAMODEL_STAGE_DENOTATION",
    semanticLinks: "METAMODEL_STAGE_SEMANTIC_LINKS",
  })) {
    const stageEvidence = semantic![stage] as { path: string; gitBlobSha: string; testCase: string };
    assert.equal(stageEvidence.path, "ts/test/v015-semantic-metamodel-evidence-verifier.test.ts");
    assert.equal(stageEvidence.gitBlobSha, "9ee507cb7c29b1b78740228c80da11c6cd7a99ba");
    assert.equal(stageEvidence.testCase, marker);
  }
  const receipt = semantic!.machineReceipt as Record<string, string>;
  assert.equal(receipt.profile, "mts-v015-semantic-metamodel-evidence/v0.1");
  assert.equal(receipt.outcome, "PASS");
  assert.equal(receipt.caseId, entry.id);
  assert.equal(receipt.formalSourceSha256, expected![0]);
  assert.equal(receipt.semanticAnetSha256, expected![1]);
  assert.equal(receipt.runnerSourceSha256,
    "a24e4ef23f3563548f789401e6aa3f4c0f48ecf60f763ffd9426ea7f8ccf916c");
  assert.equal(receipt.evidenceCommit, "209b3be3f3bee0065d20fd4b5f9149868c040dc4");
  assert.equal(receipt.ciRun, "37835687233");
  assert.equal(receipt.ciJob, "113511990164");
}

const pending = inventory.candidates.filter((entry) => entry.role === "UNCLASSIFIED");
assert.equal(pending.length, 0, "remaining UNCLASSIFIED formula backlog stays explicit");
assert.ok(pending.every((entry) => entry.denotation === "NOT_VERIFIED"), "unclassified formula must not claim semantic denotation");
assert.equal(inventory.candidates.filter((entry) =>
  entry.role.startsWith("FORMAL_V015_") && entry.denotation === "VERIFIED_AGAINST_ACCEPTED_V015").length, 26,
  "all 26 executable/current FORMAL primary occurrences have bounded source/denotation receipts");
assert.equal(inventory.candidates.filter((entry) =>
  entry.role.startsWith("FORMAL_V015_") && entry.denotation === "NOT_VERIFIED").length, 0,
  "primary FORMAL denotation backlog is closed independently of the 5 missing theorem migrations");
const verificationBacklog = inventory.candidates.filter((entry) =>
  entry.role === "UNCLASSIFIED" || entry.denotation === "NOT_VERIFIED");
assert.equal(verificationBacklog.length, 0, "all primary formula candidates are classified and denotation-closed");
assert.ok(inventory.candidates.every((entry) => entry.role === "UNCLASSIFIED" ||
  (typeof (entry as typeof entry & { reviewBasis?: string }).reviewBasis === "string" &&
   (entry as typeof entry & { reviewBasis?: string }).reviewBasis!.length > 0)),
  "every role classification requires human-readable evidence/rationale");


console.log("v0.15 current formula candidate inventory: SNAPSHOT_GREEN " + actual.length +
  " candidates; all 211 expressions scoped; 26 bounded FORMAL denotations verified; primary FORMAL denotation backlog=0; 5 theorem migrations remain separate; 2 accepted metanotation/legend fences non-executable; SEMANTIC_CONFORMANCE_NOT_YET_GREEN");
