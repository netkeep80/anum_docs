// Project-scoped ownership witnesses. This is a consumer of native RepoGuard
// Requirements, not a second Requirement authority or a new semantic MTS model.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import * as ts from "typescript";
import { parseDocument } from "yaml";
import { listRepositoryMarkdownSurface } from "../../src/tooling/markdown-section-adapter.js";
import { THEOREM_CATALOG_PATH } from "../../src/tooling/theorem-catalog-markdown.js";

const OWNER_IDS = [
  "MTS-PROJECT-ACCEPTED-LINEAGE-01",
  "MTS-PROJECT-CHANGE-GOVERNANCE-01",
  "MTS-PROJECT-CI-01",
  "MTS-PROJECT-PACKAGE-01",
  "MTS-PROJECT-PROOF-PROVENANCE-01",
  "MTS-PROJECT-PUBLICATION-01",
] as const;
type Owner = (typeof OWNER_IDS)[number];
type RelationPredicate = "requires" | "implemented_by" | "verified_by" | "documents";
type RelationIndex = Map<string, RelationPredicate>;

function fail(message: string): never { throw Error("project-ownership: " + message); }
function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    fail(label + " must be an object");
  return value as Record<string, unknown>;
}
function array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) fail(label + " must be an array");
  return value as unknown[];
}
const sorted = (items: Iterable<string>): string[] => [...items].sort((a,b) => a.localeCompare(b, "en"));
const equalPaths = (actual: readonly string[], expected: readonly string[], label: string): void => {
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    fail(label + " relation coverage mismatches exact current consumers; missing=" +
      expected.filter(path => !actual.includes(path)).join(",") +
      "; surplus=" + actual.filter(path => !expected.includes(path)).join(","));
};
const ownerFile = (id: string) => "requirements/project/" + id + ".rg.yaml";
function collectEvidence(root: string, directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(resolve(root, directory), { withFileTypes: true })) {
    const child = directory + "/" + entry.name;
    if (entry.isDirectory()) files.push(...collectEvidence(root, child));
    else if (entry.isFile() && entry.name.endsWith(".json")) files.push(child);
  }
  return sorted(files);
}

export interface ProjectOwnershipReport {
  readonly candidates: number;
  readonly exactRelations: number;
  readonly publicExportModules: number;
  readonly packageToolingEntrypoints: number;
  readonly lineageToolingDependencies: number;
  readonly publicationToolingDependencies: number;
  readonly transitiveSourceDependencies: number;
  readonly proofEvidenceRecords: number;
  readonly compiledProofSourceUnits: number;
  readonly protectedHistoricalImages: number;
  readonly currentDocumentationSurfaces: number;
  readonly observatorySources: number;
  readonly observatoryExecutedTests: number;
}

// Overrides exist only to construct negative falsifiers without changing Git or
// changing the project Requirement authorizations in the repository.
export function verifyProjectOwnership(
  root: string,
  overrides: Readonly<Record<string, string>> = {},
): ProjectOwnershipReport {
  const read = (path: string): string =>
    Object.hasOwn(overrides, path) ? overrides[path]! : readFileSync(resolve(root, path), "utf8");

  const actualOwners = sorted(readdirSync(resolve(root, "requirements/project"))
    .filter(name => name.endsWith(".rg.yaml")).map(name => name.slice(0, -8)));
  equalPaths(actualOwners, sorted(OWNER_IDS), "explicit project-owner set");

  const relations = new Map<Owner, RelationIndex>();
  let exactRelations = 0;
  for (const id of OWNER_IDS) {
    const path = ownerFile(id);
    const doc = parseDocument(read(path), { strict: true, uniqueKeys: true, merge: false });
    if (doc.errors.length || doc.warnings.length)
      fail(id + " invalid YAML: " + [...doc.errors, ...doc.warnings].map(x => x.message).join("; "));
    const raw = object(doc.toJS({ maxAliasCount: 0 }), id);
    if (raw.format !== "repo-guard/requirement-v1" || raw.id !== id ||
      typeof raw.normative !== "string" || !raw.normative.trim())
      fail(id + " invalid native Requirement identity/normative");
    const lifecycle = object(raw.lifecycle, id + ".lifecycle");
    if (lifecycle.accepted !== true || lifecycle.current !== true)
      fail(id + " Author-accepted project lifecycle must remain accepted/current; a pending proposal is not current authority");
    const byPath: RelationIndex = new Map();
    for (const rawRelation of array(raw.relations, id + ".relations")) {
      const relation = object(rawRelation, id + ".relation");
      if (Object.keys(relation).sort().join(",") !== "predicates,target")
        fail(id + " relation must be path-exact and have no hidden attributes");
      const predicates = array(relation.predicates, id + ".predicates");
      if (predicates.length !== 1 || !["requires", "implemented_by", "verified_by", "documents"].includes(String(predicates[0])))
        fail(id + " only one typed direct artifact predicate is allowed");
      const predicate = predicates[0] as RelationPredicate;
      const target = object(relation.target, id + ".target");
      if (Object.keys(target).sort().join(",") !== "kind,path" || target.kind !== "artifact" || typeof target.path !== "string")
        fail(id + " relation target must be one exact artifact");
      const file = target.path;
      if (!file || file.startsWith("/") || file.split("/").some(part => part === ".." || part === "." || part === "") ||
        /[?*\[\]{}]/.test(file) || relative(root, resolve(root, file)).replaceAll("\\", "/") !== file)
        fail(id + " unsafe or broad Resource: " + file);
      if (!existsSync(resolve(root, file))) fail(id + " missing tracked target: " + file);
      if (byPath.has(file)) fail(id + " duplicate Resource target " + file);
      byPath.set(file, predicate);
      exactRelations++;
    }
    relations.set(id, byPath);
  }
  const get = (id: Owner): RelationIndex => relations.get(id)!;
  const assertRelation = (id: Owner, path: string, predicate: RelationPredicate): void => {
    if (get(id).get(path) !== predicate)
      fail(id + " missing " + predicate + " witness for " + path);
  };
  const exportedSource = read("ts/src/public.ts");
  const exportedPaths = sorted(new Set(
    [...exportedSource.matchAll(/\bfrom\s+["'](\.\/[^"']+\.js)["']/g)]
      .map(match => "ts/src/" + match[1]!.slice(2, -3) + ".ts"),
  ));
  if (exportedPaths.length === 0) fail("public API is empty/unparseable");
  const packageOwner = get("MTS-PROJECT-PACKAGE-01");
  assertRelation("MTS-PROJECT-PACKAGE-01", "ts/src/public.ts", "implemented_by");
  assertRelation("MTS-PROJECT-PACKAGE-01", "ts/test/public-api.test.ts", "verified_by");
  assertRelation("MTS-PROJECT-PACKAGE-01", "ts/consumer/package-consumer.ts", "verified_by");
  const packageMeta = object(JSON.parse(read("ts/package.json")), "package metadata");
  const packageExports = object(packageMeta.exports, "package exports");
  const packageBin = object(packageMeta.bin, "package bin");
  const toToolingSource = (path: unknown, label: string): string => {
    if (typeof path !== "string" ||
        !path.startsWith("./dist/src/tooling/") || !path.endsWith(".js")) {
      fail(label + " must resolve to exact compiled TypeScript tooling entrypoint");
    }
    const source = "ts/src/" + path.slice("./dist/src/".length, -3) + ".ts";
    if (!existsSync(resolve(root, source))) fail(label + " source missing: " + source);
    return source;
  };
  const entrypoints: string[] = [];
  for (const [name, value] of Object.entries(packageExports)) {
    if (name === ".") continue;
    const fields = object(value, "package export " + name);
    entrypoints.push(toToolingSource(fields.default, "package export " + name));
  }
  for (const [name, target] of Object.entries(packageBin)) {
    entrypoints.push(toToolingSource(target, "package bin " + name));
  }
  const toolingEntrypoints = sorted(new Set(entrypoints));
  if (toolingEntrypoints.length === 0 || toolingEntrypoints.length !== entrypoints.length)
    fail("package tooling entrypoints missing or duplicated");
  const declaredExports = sorted([...packageOwner.entries()]
    .filter(([path, predicate]) => path.startsWith("ts/src/") &&
      path !== "ts/src/public.ts" && predicate === "implemented_by")
    .map(([path]) => path));
  equalPaths(declaredExports, sorted([...exportedPaths, ...toolingEntrypoints]), "public API implemented_by");
  const unexpectedPackageSource = [...packageOwner.entries()]
    .filter(([path, predicate]) => path.startsWith("ts/src/") &&
      path !== "ts/src/public.ts" && predicate !== "implemented_by" && predicate !== "requires");
  if (unexpectedPackageSource.length) fail("public source misclassified as non-implementation");

  // Enforce private implementation dependency closure from actual TypeScript
  // import/export edges. Direct public exports are implemented_by; recursively
  // imported modules are requires, not new public entrypoints.
  const staticSourceDependencies = (owner: string): string[] => {
    const source = ts.createSourceFile(owner, read(owner), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const local = new Set<string>();
    const add = (module: string): void => {
      if (!module.startsWith(".") || !module.endsWith(".js")) return;
      const absolute = resolve(dirname(resolve(root, owner)), module.slice(0, -3) + ".ts");
      const relativePath = relative(root, absolute).replaceAll("\\", "/");
      if (!relativePath.startsWith("ts/src/")) return;
      if (!existsSync(absolute)) fail("missing static TypeScript dependency: " + owner + " -> " + relativePath);
      local.add(relativePath);
    };
    const visit = (node: ts.Node): void => {
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
          node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier))
        add(node.moduleSpecifier.text);
      if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) &&
          ts.isStringLiteral(node.argument.literal)) add(node.argument.literal.text);
      if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword &&
          node.arguments[0] && ts.isStringLiteral(node.arguments[0]))
        add(node.arguments[0].text);
      ts.forEachChild(node, visit);
    };
    visit(source);
    return sorted(local);
  };
  const reached = new Set<string>();
  const stack: string[] = ["ts/src/public.ts", ...toolingEntrypoints];
  while (stack.length > 0) {
    const file = stack.pop()!;
    if (reached.has(file)) continue;
    reached.add(file);
    stack.push(...staticSourceDependencies(file));
  }
  const transitiveRequired = sorted([...reached].filter(path =>
    path !== "ts/src/public.ts" && !exportedPaths.includes(path) && !toolingEntrypoints.includes(path)));
  const declaredRequired = sorted([...packageOwner.entries()]
    .filter(([path, predicate]) => path.startsWith("ts/src/") && predicate === "requires")
    .map(([path]) => path));
  equalPaths(declaredRequired, transitiveRequired, "public package transitive requires");

  // The already accepted compiler and reader tooling are independently owned
  // by their project obligations, not by whichever CI executable imports them.
  // Require exactly the source-reachable, unclaimed private implementation
  // dependencies of each owner. Other owners' files cannot be claimed twice.
  const verifyToolingClosure = (id: Owner): number => {
    const owner = get(id);
    const roots = sorted([...owner.entries()]
      .filter(([path, predicate]) => path.startsWith("ts/src/") && predicate === "implemented_by")
      .map(([path]) => path));
    if (roots.length === 0) fail(id + " has no executable tooling root");
    const claimedByOther = new Set<string>();
    for (const [otherId, other] of relations) {
      if (otherId === id) continue;
      for (const path of other.keys()) claimedByOther.add(path);
    }
    const visited = new Set<string>();
    const pending = [...roots];
    while (pending.length) {
      const path = pending.pop()!;
      if (visited.has(path)) continue;
      visited.add(path);
      pending.push(...staticSourceDependencies(path));
    }
    const expected = sorted([...visited].filter(path =>
      path.startsWith("ts/src/") && !roots.includes(path) &&
      !claimedByOther.has(path)));
    const actual = sorted([...owner.entries()]
      .filter(([path, predicate]) => path.startsWith("ts/src/") && predicate === "requires")
      .map(([path]) => path));
    equalPaths(actual, expected, id + " tooling requires");
    return expected.length;
  };
  const lineageToolingDependencies = verifyToolingClosure("MTS-PROJECT-ACCEPTED-LINEAGE-01");
  const publicationToolingDependencies = verifyToolingClosure("MTS-PROJECT-PUBLICATION-01");



  const proofOwner = get("MTS-PROJECT-PROOF-PROVENANCE-01");
  const evidencePaths = collectEvidence(root, "proofs/evidence");
  const declaredEvidence = sorted([...proofOwner.entries()]
    .filter(([path]) => path.startsWith("proofs/evidence/")).map(([path]) => path));
  equalPaths(declaredEvidence, evidencePaths, "proof evidence record");
  for (const path of evidencePaths)
    assertRelation("MTS-PROJECT-PROOF-PROVENANCE-01", path, "requires");

  const workflow = read(".github/workflows/ci.yml");
  const compiledProofPaths = sorted(new Set(
    [...workflow.matchAll(/\bproofs\/(?:lean4|coq)\/Mts[A-Za-z0-9]+\.(?:lean|v)\b/g)]
      .map(match => match[0]),
  ));
  if (compiledProofPaths.length === 0) fail("proof CI has no referenced proof sources");
  const declaredProofSources = sorted([...proofOwner.keys()]
    .filter(path => /^proofs\/(?:lean4|coq)\/Mts[A-Za-z0-9]+\.(?:lean|v)$/.test(path)));
  equalPaths(declaredProofSources, compiledProofPaths, "CI proof source");
  for (const path of compiledProofPaths)
    assertRelation("MTS-PROJECT-PROOF-PROVENANCE-01", path, "requires");

  const nativeRecord = object(JSON.parse(read("proofs/evidence/FND-07/mtsNative.json")), "FND-07");
  if (nativeRecord.lane !== "mtsNative") fail("FND-07 lane is not native");
  for (const rawArtifact of array(nativeRecord.artifacts, "FND-07.artifacts")) {
    const path = object(rawArtifact, "native proof artifact").path;
    if (typeof path !== "string") fail("invalid native proof path");
    assertRelation("MTS-PROJECT-PROOF-PROVENANCE-01", path, "requires");
  }
  for (const path of [
    "ts/test/proof-infrastructure.test.ts",
    "ts/test/v015-formal-proof-assurance-f0.test.ts",
    "ts/test/native-fnd07-contextual-detachment.test.ts",
    "ts/test/native-fnd07-root-truth-aspect.test.ts",
  ]) assertRelation("MTS-PROJECT-PROOF-PROVENANCE-01", path, "verified_by");

  // Historical pictures are Author-designated permanent source evidence.
  // The accepted manifest is separately immutable-byte-verified by
  // historical-images-protection.test.ts. This verifier guards causal ownership.
  const historicalOwner = get("MTS-PROJECT-CHANGE-GOVERNANCE-01");
  const historicalManifestPath = "profiles/mts-historical-images.json";
  const historicalManifest = object(JSON.parse(read(historicalManifestPath)), "historical image manifest");
  if (historicalManifest.status !== "PERMANENT_HISTORICAL_RESEARCH_ASSETS_DO_NOT_DELETE" ||
      historicalManifest.origin !== "AUTHOR_DESIGNATED_HISTORICAL" ||
      historicalManifest.ownerIssue !== 2080)
    fail("historical image retention manifest lost Author-designated immutable authority");
  const protectedAssets = array(historicalManifest.assets, "historical image assets")
    .map(raw => object(raw, "historical image asset").path)
    .map(raw => {
      if (typeof raw !== "string" || !/^pics\/[^/]+\.(?:jpe?g|png|svg)$/i.test(raw))
        fail("historical image manifest contains invalid path");
      return raw;
    });
  if (historicalManifest.assetCount !== protectedAssets.length ||
      new Set(protectedAssets).size !== protectedAssets.length ||
      protectedAssets.length === 0)
    fail("historical image manifest has invalid exact inventory");
  const expectedHistoricalPaths = sorted([...protectedAssets, "pics/README.md"]);
  const declaredHistoricalPaths = sorted([...historicalOwner.entries()]
    .filter(([path]) => path.startsWith("pics/")).map(([path]) => path));
  equalPaths(declaredHistoricalPaths, expectedHistoricalPaths, "permanent historical picture corpus");
  for (const path of expectedHistoricalPaths)
    assertRelation("MTS-PROJECT-CHANGE-GOVERNANCE-01", path, "requires");
  assertRelation("MTS-PROJECT-CHANGE-GOVERNANCE-01", historicalManifestPath, "requires");
  const currentPictureFiles = sorted(readdirSync(resolve(root, "pics"))
    .filter(name => /\.(?:jpe?g|png|svg)$/i.test(name))
    .map(name => "pics/" + name));
  equalPaths(currentPictureFiles, sorted(protectedAssets), "actual historical picture files");

  // Same source-surface projection used by the MTS compiler: the separately
  // generated theorem catalog is not a hand-authored project document.
  const publicationOwner = get("MTS-PROJECT-PUBLICATION-01");
  const currentDocuments = sorted(listRepositoryMarkdownSurface(root)
    .filter(path => path !== THEOREM_CATALOG_PATH));
  if (currentDocuments.length === 0) fail("current documentation surface is empty");
  const declaredDocuments = sorted([...publicationOwner.entries()]
    .filter(([, predicate]) => predicate === "documents").map(([path]) => path));
  equalPaths(declaredDocuments, currentDocuments, "current Markdown publication surface");
  for (const path of currentDocuments)
    assertRelation("MTS-PROJECT-PUBLICATION-01", path, "documents");

  // GitHub Pages actually compiles the Contract Observatory and runs only
  // two explicit tests. Derive ownership from the deployed build-site AST and
  // the executable workflow commands, not from every file in web/**.
  const observatoryPrefix = "web/contract-observatory/";
  const buildSiteSource = observatoryPrefix + "src/build-site.ts";
  const pagesWorkflow = read(".github/workflows/pages.yml");
  if (!pagesWorkflow.includes("tsc -p web/contract-observatory/tsconfig.json") ||
      !pagesWorkflow.includes("node web/contract-observatory/dist/src/build-site.js"))
    fail("Contract Observatory workflow no longer compiles and materializes accepted Pages");
  assertRelation("MTS-PROJECT-PUBLICATION-01", buildSiteSource, "implemented_by");
  assertRelation("MTS-PROJECT-PUBLICATION-01", observatoryPrefix + "tsconfig.json", "requires");
  const observedSources = new Set<string>(), pendingObservatory = [buildSiteSource];
  while (pendingObservatory.length) {
    const file = pendingObservatory.pop()!;
    if (observedSources.has(file)) continue;
    observedSources.add(file);
    const script = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const visit = (node: ts.Node): void => {
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
          node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier) &&
          node.moduleSpecifier.text.startsWith(".") && node.moduleSpecifier.text.endsWith(".js")) {
        const absolute = resolve(dirname(resolve(root, file)),
          node.moduleSpecifier.text.slice(0, -3) + ".ts");
        const dep = relative(root, absolute).replaceAll("\\", "/");
        if (!dep.startsWith(observatoryPrefix + "src/") || !existsSync(absolute))
          fail("Contract Observatory has unresolved local source dependency: " + file + " -> " + dep);
        pendingObservatory.push(dep);
      }
      ts.forEachChild(node, visit);
    };
    visit(script);
  }
  const observatoryPrivate = sorted([...observedSources].filter(path => path !== buildSiteSource));
  const declaredObservatoryPrivate = sorted([...publicationOwner.entries()]
    .filter(([path, predicate]) => path.startsWith(observatoryPrefix + "src/") &&
      path !== buildSiteSource && predicate === "requires")
    .map(([path]) => path));
  equalPaths(declaredObservatoryPrivate, observatoryPrivate, "Contract Observatory site source dependency");
  for (const path of observatoryPrivate)
    assertRelation("MTS-PROJECT-PUBLICATION-01", path, "requires");
  const executedObservatoryTests = sorted(new Set(
    [...pagesWorkflow.matchAll(/\bnode web\/contract-observatory\/dist\/test\/([A-Za-z0-9.-]+)\.js/g)]
      .map(match => observatoryPrefix + "test/" + match[1]! + ".ts"),
  ));
  if (executedObservatoryTests.length === 0) fail("Contract Observatory has no executed site verification");
  const declaredObservatoryTests = sorted([...publicationOwner.entries()]
    .filter(([path, predicate]) => path.startsWith(observatoryPrefix + "test/") &&
      predicate === "verified_by")
    .map(([path]) => path));
  equalPaths(declaredObservatoryTests, executedObservatoryTests, "Contract Observatory executed tests");
  for (const path of executedObservatoryTests)
    assertRelation("MTS-PROJECT-PUBLICATION-01", path, "verified_by");

  assertRelation("MTS-PROJECT-CI-01", "ts/src/tooling/test-tier.ts", "implemented_by");
  assertRelation("MTS-PROJECT-CI-01", "ts/test/test-tier.test.ts", "verified_by");
  assertRelation("MTS-PROJECT-ACCEPTED-LINEAGE-01", "ts/src/tooling/mts-compiler.ts", "implemented_by");
  assertRelation("MTS-PROJECT-CHANGE-GOVERNANCE-01", ".github/workflows/repo-guard.yml", "implemented_by");
  assertRelation("MTS-PROJECT-PUBLICATION-01", "tools/reader-preview/render.mjs", "implemented_by");
  return Object.freeze({
    candidates: OWNER_IDS.length,
    exactRelations,
    publicExportModules: exportedPaths.length,
    packageToolingEntrypoints: toolingEntrypoints.length,
    lineageToolingDependencies,
    publicationToolingDependencies,
    transitiveSourceDependencies: transitiveRequired.length,
    proofEvidenceRecords: evidencePaths.length,
    compiledProofSourceUnits: compiledProofPaths.length,
    protectedHistoricalImages: protectedAssets.length,
    currentDocumentationSurfaces: currentDocuments.length,
    observatorySources: observedSources.size,
    observatoryExecutedTests: executedObservatoryTests.length,
  });
}
