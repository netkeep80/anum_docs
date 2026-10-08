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
  candidates: { id: string; path: string; startLine: number; endLine: number; kind: string; source: string; role: string; denotation: string }[];
};
assert.equal(inventory.schema, "mts-v015-current-doc-formula-candidate-inventory/v0.1");
assert.equal(inventory.status, "CLASSIFIED_DENOTATION_VERIFICATION_PENDING");
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
for (let i = 0; i < actual.length; i++) {
  const expected = inventory.candidates[i]!;
  const observed = actual[i]!;
  for (const key of ["id", "path", "startLine", "endLine", "kind", "source"] as const) {
    assert.equal(observed[key], expected[key], "candidate " + observed.id + " " + key);
  }
}
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
assert.ok(acceptedBundleSource.every((entry) => entry.denotation === "NOT_VERIFIED"),
  "do not fake v0.15 FORMAL denotation while classifying syntax specimens");
const historicalTheorems = JSON.parse(readFileSync(resolve(root, "theorems/current-v0.14.json"), "utf8")) as {
  theorems: { id: string; statement: string }[];
};
const formalOverlay = JSON.parse(readFileSync(resolve(root, "theorems/formal-v0.15.json"), "utf8")) as {
  entries: { id: string; formalStatement: string }[];
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
assert.equal(actualFormalStatements.length, 7, "current FORMAL overlay instances tracked individually");
for (const entry of actualFormalStatements) {
  assert.equal(entry.sourceArtifact, "theorems/formal-v0.15.json");
  assert.equal(entry.denotation, "NOT_VERIFIED", "a FORMAL syntactic overlay does not prove denotation or proof closure");
  assert.equal(formalOverlay.entries.find((theorem) => theorem.id === entry.sourceTheoremId)?.formalStatement,
    entry.source, entry.id + " exact theorem FORMAL statement source");
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
assert.equal(formalAmemoryBundle[0]!.denotation, "NOT_VERIFIED");
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
assert.equal(nativeWitnessCandidates.length, 6, "native B10/B20 partial witnesses cover six current FORMAL specimens");
assert.deepEqual(nativeWitnessCandidates.map((entry) => entry.id).sort(),
  ["F0028", "F0036", "F0152", "F0180", "F0181", "F0184"].sort());
for (const entry of nativeWitnessCandidates) {
  const witness = (entry as typeof entry & { nativeEvidence: {
    kind: string; testPath: string; testBlobSha: string; status: string; limitation: string;
    verifiedOnCommit: string; ciRun: string; scope: string;
  } }).nativeEvidence;
  assert.ok(["NATIVE_FORMAL_ROOT_BASIS_WIRE",
    "FORMAL_JSON_SOURCE_PARITY_EMPTY_BUNDLE_DENOTATION"].includes(witness.kind));
  assert.equal(witness.status, "PARTIAL_NATIVE_WITNESS_GREEN");
  assert.equal(entry.denotation, "NOT_VERIFIED",
    "successful native fixture is not complete FORMAL proof/replay acceptance");
  const original = readFileSync(resolve(root, witness.testPath), "utf8");
  const gitObject = Buffer.from("blob " + Buffer.byteLength(original, "utf8") + "\0" + original, "utf8");
  assert.equal(createHash("sha1").update(gitObject).digest("hex"), witness.testBlobSha,
    entry.id + " evidence file must match pinned native test source");
  assert.ok(witness.scope.length > 15 && witness.limitation.includes("NOT_VERIFIED"));
  assert.equal(witness.verifiedOnCommit, "3348e490b1751b4a68b24159fddc8c820200abb5");
  assert.ok(witness.ciRun.endsWith("/37749386834"));
}
const pending = inventory.candidates.filter((entry) => entry.role === "UNCLASSIFIED");
assert.equal(pending.length, 0, "remaining UNCLASSIFIED formula backlog stays explicit");
assert.ok(pending.every((entry) => entry.denotation === "NOT_VERIFIED"), "unclassified formula must not claim semantic denotation");
assert.equal(inventory.candidates.filter((entry) =>
  entry.role.startsWith("FORMAL_V015_") && entry.denotation === "NOT_VERIFIED").length, 19,
  "classified FORMAL explanatory specimens stay pending denotation verification");
const verificationBacklog = inventory.candidates.filter((entry) =>
  entry.role === "UNCLASSIFIED" || entry.denotation === "NOT_VERIFIED");
assert.equal(verificationBacklog.length, 19, "semantic proof/denotation backlog remains nonzero");
assert.ok(inventory.candidates.every((entry) => entry.role === "UNCLASSIFIED" ||
  (typeof (entry as typeof entry & { reviewBasis?: string }).reviewBasis === "string" &&
   (entry as typeof entry & { reviewBasis?: string }).reviewBasis!.length > 0)),
  "every role classification requires human-readable evidence/rationale");


console.log("v0.15 current formula candidate inventory: SNAPSHOT_GREEN " + actual.length + " candidates; all 202 expressions scoped; 19 FORMAL denotations pending; SEMANTIC_CONFORMANCE_NOT_YET_GREEN");
