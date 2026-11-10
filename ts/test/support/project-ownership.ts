// Project-scoped ownership witnesses. This is a consumer of native RepoGuard
// Requirements, not a second Requirement authority or a new semantic MTS model.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
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
  readonly formalReplayResources: number;
  readonly approvedSourceIntegrityResources: number;
  readonly compiledProofSourceUnits: number;
  readonly protectedHistoricalImages: number;
  readonly currentDocumentationSurfaces: number;
  readonly readerPreviewLoaderModules: number;
  readonly readerPreviewYamlInputs: number;
  readonly readerPreviewRuntimeYamlInputs: number;
  readonly readerPreviewPinnedTranscriptions: number;
  readonly observatorySources: number;
  readonly observatoryExecutedTests: number;
}

// Overrides exist only to construct negative falsifiers without changing Git or
// changing the project Requirement authorizations in the repository.
export function verifyProjectOwnership(
  root: string,
  readerRuntimeInputs: readonly string[],
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
  // P7-S16: exact accepted historical lineage files are already protected by the
  // current repo-policy.json pr_immutable contract. This verifies actual retained
  // files against the sole existing project Requirement without granting historic
  // contracts any competing semantic authority.
  const repoPolicy = object(JSON.parse(read("repo-policy.json")), "repository policy");
  const immutable = array(object(repoPolicy.paths, "policy paths").pr_immutable,
    "repository pr_immutable").map((item) => {
    if (typeof item !== "string") fail("immutable policy path must be a string");
    return item;
  });
  const acceptedLegacyPath = (path: string): boolean =>
    /^contracts\/mts-(?:contract|conformance)-v0\.(?:11|12|13)\.json$/.test(path) ||
    /^cutover\/typescript-c1-acceptance-v0\.[1-7]\.json$/.test(path) ||
    /^traceability\/mts-v0\.(?:11|12|13)(?:-self-proof-authority-profile|-semantic-dependency-projection)?\.json$/.test(path);
  const liveImmutableLineage = sorted(new Set(immutable.filter(acceptedLegacyPath)));
  if (liveImmutableLineage.length !== 18)
    fail("accepted historical immutable lineage inventory changed");
  const declaredImmutableLineage = sorted([...get("MTS-PROJECT-ACCEPTED-LINEAGE-01").entries()]
    .filter(([path]) => acceptedLegacyPath(path)).map(([path]) => path));
  equalPaths(declaredImmutableLineage, liveImmutableLineage,
    "accepted historical immutable lineage");
  for (const path of liveImmutableLineage)
    assertRelation("MTS-PROJECT-ACCEPTED-LINEAGE-01", path, "requires");

  // P7-S29: acceptance cutover points to one exact historical pre-Author
  // readiness record. Preserve it as release lineage, not a new authority.
  // The historical executable verifier must physically read the same file.
  const s29Path = "formal/v0.15/evidence/final-readiness-r3.json";
  const s29Cutover = object(JSON.parse(read("cutover/typescript-c1-acceptance-v0.8.json")),
    "S29 accepted cutover");
  if (object(s29Cutover.evidence, "S29 cutover evidence").finalReadiness !== s29Path)
    fail("S29 accepted cutover finalReadiness pointer changed");
  const s29Readiness = object(JSON.parse(read(s29Path)), "S29 readiness witness");
  if (s29Readiness.status !== "RELEASE_READY_AWAITING_AUTHOR_DECISION" ||
      object(s29Readiness.finalAuthorGate, "S29 Author gate").decision !== "PENDING" ||
      object(s29Readiness.conclusion, "S29 readiness conclusion").accepted !== false)
    fail("S29 historical readiness must remain pre-Author decision");
  const s29TestPath = "ts/test/v015-final-readiness-r3.test.ts";
  const s29Source = ts.createSourceFile(s29TestPath, read(s29TestPath),
    ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  let s29PhysicalReader = false;
  const s29Visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) &&
        node.expression.text === "readFileSync" && node.arguments.length === 2) {
      const arg = node.arguments[0];
      if (arg && ts.isCallExpression(arg) && ts.isIdentifier(arg.expression) &&
          arg.expression.text === "join" && arg.arguments.length === 2) {
        const rootArg = arg.arguments[0];
        const fileArg = arg.arguments[1];
        if (rootArg && fileArg && ts.isIdentifier(rootArg) && rootArg.text === "root" &&
            ts.isStringLiteral(fileArg) && fileArg.text === s29Path)
          s29PhysicalReader = true;
      }
    }
    ts.forEachChild(node, s29Visit);
  };
  s29Visit(s29Source);
  if (!s29PhysicalReader)
    fail("S29 physical historical readiness reader missing");
  assertRelation("MTS-PROJECT-ACCEPTED-LINEAGE-01", s29Path, "requires");

  // P7-S30: two earlier release-readiness evidence records are physically
  // verified by the historical R3 gate. Neither record independently accepts v0.15.
  const s30Paths = [
    "formal/v0.15/evidence/governance-merge-enforcement-g1.json",
    "formal/v0.15/evidence/readiness-audit-r2.json",
  ] as const;
  if (object(s29Readiness.governance, "S30 R3 governance").evidence !== s30Paths[0])
    fail("S30 R3 governance evidence pointer changed");
  const s30Readers = new Set<string>();
  const s30Visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) &&
        node.expression.text === "readFileSync" && node.arguments.length === 2) {
      const arg = node.arguments[0];
      if (arg && ts.isCallExpression(arg) && ts.isIdentifier(arg.expression) &&
          arg.expression.text === "join" && arg.arguments.length === 2) {
        const a = arg.arguments[0], b = arg.arguments[1];
        if (a && b && ts.isIdentifier(a) && a.text === "root" &&
            ts.isStringLiteral(b) && s30Paths.some(path => path === b.text))
          s30Readers.add(b.text);
      }
    }
    ts.forEachChild(node, s30Visit);
  };
  s30Visit(s29Source);
  equalPaths(sorted(s30Readers), sorted(s30Paths), "S30 physical historical evidence reads");
  const s30Governance = object(JSON.parse(read(s30Paths[0])), "S30 governance witness");
  const s30GovAcceptance = object(s30Governance.acceptance, "S30 governance acceptance");
  if (s30GovAcceptance.governanceSatisfied !== true ||
      s30GovAcceptance.mtsV015Accepted !== false)
    fail("S30 governance witness falsely accepts v0.15");
  const s30Audit = object(JSON.parse(read(s30Paths[1])), "S30 historical audit");
  if (s30Audit.status !== "AUDIT_COMPLETE_BLOCKED_BY_GOVERNANCE" ||
      object(s30Audit.conclusion, "S30 historical conclusion").operationalMergeGovernance !== "BLOCKED")
    fail("S30 historical blocked audit status changed");
  for (const path of s30Paths)
    assertRelation("MTS-PROJECT-ACCEPTED-LINEAGE-01", path, "requires");

  // P7-S17: attest only the actual current docs/FORMAL and theorem verifier
  // source readers. No global audits/** or profiles/** directory whitelist.
  // Using TypeScript AST call expressions rejects path mentions in comments or
  // audit metadata that are not actual read(root, path) invocations.
  const staticLiteralReads = (sourcePath: string, method: string, prefix: string): string[] => {
    const sourceText = read(sourcePath);
    const source = ts.createSourceFile(sourcePath, sourceText,
      ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const found = new Set<string>();
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) &&
          node.expression.text === method && node.arguments.length === 2) {
        const rootArg = node.arguments[0];
        const pathArg = node.arguments[1];
        if (rootArg !== undefined && pathArg !== undefined &&
            ts.isIdentifier(rootArg) && rootArg.text === "root" &&
            ts.isStringLiteral(pathArg) && pathArg.text.startsWith(prefix))
          found.add(pathArg.text);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
    return sorted(found);
  };
  const documentationAuditInputs = staticLiteralReads(
    "ts/src/tooling/v015-documentation-acceptance.ts", "read", "audits/v015-");
  if (documentationAuditInputs.length !== 4)
    fail("S17 current documentation audit reader count changed");
  const rendererProfileInputs = staticLiteralReads(
    "ts/src/tooling/formal-notation-v015-markdown.ts", "readJson", "profiles/mts-v015-");
  if (rendererProfileInputs.length !== 2)
    fail("S17 FORMAL notation renderer profile input count changed");
  const publication = get("MTS-PROJECT-PUBLICATION-01");
  const declaredDocAudits = sorted([...publication.keys()]
    .filter(path => path.startsWith("audits/v015-")));
  equalPaths(declaredDocAudits, documentationAuditInputs,
    "S17 current documentation audit input");
  const declaredRendererProfiles = sorted([...publication.keys()]
    .filter(path => /^profiles\/mts-v015-(?:meta-interpreter-kernel|generalized-reaction-candidate)\.json$/.test(path)));
  equalPaths(declaredRendererProfiles, rendererProfileInputs,
    "S17 current FORMAL notation renderer input");
  for (const path of [...documentationAuditInputs, ...rendererProfileInputs])
    assertRelation("MTS-PROJECT-PUBLICATION-01", path, "requires");
  const theoremCaseSource = read("ts/src/tooling/v015-theorem-statement-evidence-verifier.ts");
  const casePath = /const CASE_MANIFEST_PATH = "(audits\/v015-[^"]+\.json)";/
    .exec(theoremCaseSource)?.[1];
  if (!casePath || !theoremCaseSource.includes(
      "readFileSync(resolve(findRepositoryRoot(), CASE_MANIFEST_PATH)"))
    fail("S17 theorem case manifest lacks actual current reader");
  const declaredTheoremCaseInputs = sorted([...get("MTS-PROJECT-PROOF-PROVENANCE-01").keys()]
    .filter(path => path.startsWith("audits/v015-")));
  equalPaths(declaredTheoremCaseInputs, [casePath], "S17 theorem case manifest input");
  assertRelation("MTS-PROJECT-PROOF-PROVENANCE-01", casePath, "requires");

  // P7-S18: conformance fixtures are present-tense FULL test file inputs.
  // AST inventories references, not executed reads. The FULL runner proves
  // exact physical inputs separately. Never claim arbitrary examples/**.
  const conformanceConsumers = [
    "ts/test/anum-two-memory-conformance.test.ts",
    "ts/test/quaternary-anum-hierarchical-two-memory.test.ts",
    "ts/test/string-anum-two-memory-conformance.test.ts",
    "ts/test/v012-string-utf8-boundary.test.ts",
    "ts/test/v013-file-wire-conformance.test.ts",
  ] as const;
  const fixturePrefix = "../examples/anum/conformance/";
  const observedConformancePaths = new Set<string>();
  for (const testPath of conformanceConsumers) {
    const source = ts.createSourceFile(testPath, read(testPath),
      ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const literalReads = new Set<string>();
    const fixtureDeclarations = new Set<string>();
    let indexedRead = false, indexedLoop = false;
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) &&
          node.expression.text === "readFileSync") {
        const arg = node.arguments[0];
        if (arg !== undefined && ts.isStringLiteral(arg) &&
            arg.text.startsWith(fixturePrefix))
          literalReads.add(arg.text.slice(3));
        if (arg !== undefined && ts.isPropertyAccessExpression(arg) &&
            ts.isIdentifier(arg.expression) && arg.expression.text === "fixture" &&
            arg.name.text === "path")
          indexedRead = true;
      }
      if (ts.isPropertyAssignment(node) &&
          ((ts.isIdentifier(node.name) && node.name.text === "path") ||
            (ts.isStringLiteral(node.name) && node.name.text === "path")) &&
          ts.isStringLiteral(node.initializer) &&
          node.initializer.text.startsWith(fixturePrefix))
        fixtureDeclarations.add(node.initializer.text.slice(3));
      if (ts.isForOfStatement(node) &&
          ts.isIdentifier(node.expression) && node.expression.text === "fixtures" &&
          node.initializer.getText(source) === "const fixture")
        indexedLoop = true;
      ts.forEachChild(node, visit);
    };
    visit(source);
    if (testPath === "ts/test/quaternary-anum-hierarchical-two-memory.test.ts") {
      if (!indexedRead || !indexedLoop || fixtureDeclarations.size !== 4 ||
          literalReads.size !== 0)
        fail("S18 hierarchical fixture loop/source reader changed");
      for (const path of fixtureDeclarations) observedConformancePaths.add(path);
    } else {
      if (literalReads.size !== 1 || indexedRead || fixtureDeclarations.size !== 0)
        fail("S18 direct conformance test fixture reader changed: " + testPath);
      for (const path of literalReads) observedConformancePaths.add(path);
    }
  }
  const observedConformance = sorted(observedConformancePaths);
  if (observedConformance.length !== 8)
    fail("S18 expected eight exact current FULL conformance inputs");
  const diskConformance = sorted(readdirSync(resolve(root, "examples/anum/conformance"))
    .map(name => "examples/anum/conformance/" + name));
  equalPaths(diskConformance, observedConformance,
    "S18 conformance fixture executable FULL coverage");
  const declaredConformance = sorted([...get("MTS-PROJECT-CI-01").entries()]
    .filter(([path]) => path.startsWith("examples/anum/conformance/"))
    .map(([path]) => path));
  equalPaths(declaredConformance, observedConformance,
    "S18 exact current FULL conformance fixture ownership");
  for (const path of observedConformance)
    assertRelation("MTS-PROJECT-CI-01", path, "requires");

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
  // S31: unlike private imported modules, these two source-file inputs are
  // read as preview evidence. Their exact W6 loader/read chain is verified below.
  const s31Witnesses = [
    { consumer: "ts/src/tooling/mts-reader-review-m03.ts",
      loader: "loadReaderM03", key: "roles", target: "ts/src/v015-formal-roles.ts",
      arg: "path", marker: "LINK_IDENTITY_EQUALITY" },
    { consumer: "ts/src/tooling/mts-reader-review-l01-l02-l03.ts",
      loader: "loadReaderL01L03", key: "association_ts",
      target: "ts/src/v015-direct-association.ts", arg: "v",
      marker: "V015_DIRECT_ASSOCIATION_RESEARCH" },
  ] as const;
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
    const readerEvidence = id === "MTS-PROJECT-PUBLICATION-01"
      ? s31Witnesses.map(w => w.target) : [];
    equalPaths(actual, sorted([...expected, ...readerEvidence]),
      id + " tooling and exact physical preview-source requires");
    // Report only import-closure modules, not evidence read as source data.
    return expected.length;
  };

  // S12: Pages explicitly runs docs:coverage, in addition to the two
  // executable Reader publication roots. Never equate a test's mere existence
  // or a directory prefix with a present-tense project obligation.
  const coverageWorkflow = read(".github/workflows/pages.yml");
  const publicationScripts = object(
    object(JSON.parse(read("ts/package.json")), "TS package").scripts,
    "TS package scripts");
  const coverageScript = publicationScripts["docs:coverage"];
  if (!coverageWorkflow.includes("npm --prefix ts run docs:coverage") ||
      coverageScript !== "npm run build --silent && node dist/src/tooling/docs-coverage.js")
    fail("S12 Pages current docs-coverage executable binding changed");
  const docsCoverageEntrypoint = "ts/src/tooling/docs-coverage.ts";
  const docsCoverageSource = read(docsCoverageEntrypoint);
  if (!docsCoverageSource.includes('from "./docs-sync.js"') ||
      !docsCoverageSource.includes('from "./markdown-coverage-audit.js"') ||
      !docsCoverageSource.includes("buildMarkdownCoverageAudit(findRepositoryRoot())"))
    fail("S12 Pages docs-coverage lost its actual Markdown audit consumer");
  const previewPublishedRoots = sorted([...get("MTS-PROJECT-PUBLICATION-01").entries()]
    .filter(([path, predicate]) =>
      path.startsWith("ts/src/tooling/") && predicate === "implemented_by")
    .map(([path]) => path));
  equalPaths(previewPublishedRoots, sorted([
    docsCoverageEntrypoint,
    "ts/src/tooling/mts-reader-coverage.ts",
    "ts/src/tooling/mts-reader-r44-w6-cli.ts",
  ]), "current publication tooling entrypoints");

  const lineageToolingDependencies = verifyToolingClosure("MTS-PROJECT-ACCEPTED-LINEAGE-01");
  const publicationToolingDependencies = verifyToolingClosure("MTS-PROJECT-PUBLICATION-01");



  const proofOwner = get("MTS-PROJECT-PROOF-PROVENANCE-01");
  // P7-S25: six S23-restored sources have exact current observers; unlike
  // unreferenced historical tests, these cannot disappear from HEAD without
  // breaking current FULL/Observatory or proof-evidence functions.
  // Consumers and target paths are deliberately enumerated, not inferred from
  // a test filename prefix or the broad FULL tier.
  const restoredWitnesses = [
    ["MTS-PROJECT-CI-01", "ts/test/research-v013-append-only-currentness-falsifier-a72n.test.ts", "ts/test/research-v013-flat-generalized-modus-ponens-a72w.test.ts"],
    ["MTS-PROJECT-CI-01", "ts/test/research-v013-context-dualization-a75b.test.ts", "ts/test/test-tier.test.ts"],
    ["MTS-PROJECT-CI-01", "ts/test/research-v013-static-fixity-a7.test.ts", "ts/test/codec-capability-model.test.ts"],
    ["MTS-PROJECT-PROOF-PROVENANCE-01", "ts/test/research-v013-finite-recursive-description-boundary.test.ts", "ts/test/v015-fnd05-formal-statement-candidate-b22.test.ts"],
    ["MTS-PROJECT-PROOF-PROVENANCE-01", "ts/test/research-v013-execution-entry-root-chirality-a68c.test.ts", "proofs/v015-evidence/gpr09-c-boundary-chirality.json"],
    ["MTS-PROJECT-PUBLICATION-01", "ts/test/research-physical-dot-bootstrap.test.ts", "web/contract-observatory/test/invariant-traceability.test.ts"],
  ] as const;
  for (const [owner, target, observer] of restoredWitnesses) {
    const observedSource = read(observer);
    if (!observedSource.includes(target))
      fail("S25 restored witness lost live consumer: " + observer + " -> " + target);
    if (observer.endsWith(".test.ts") && !observedSource.includes("readFileSync"))
      fail("S25 executable observer lost source-reading capability: " + observer);
    // This CURRENT tier mutation must be an actually executed source probe,
    // not merely an occurrence of the path inside S25's own test metadata.
    if (target === "ts/test/research-v013-context-dualization-a75b.test.ts" &&
        !observedSource.split(/\r?\n/).some(line => line.trim() ===
          'const evidenceOnly = "' + target + '";'))
      fail("S25 tier synthetic evidence source probe was removed");
    if (observer === "proofs/v015-evidence/gpr09-c-boundary-chirality.json") {
      const record = object(JSON.parse(observedSource), "S25 GPR09 evidence");
      if (!array(record.executableWitnesses, "S25 GPR09 executableWitnesses").includes(target))
        fail("S25 GPR09 current executable evidence witness was removed");
    }
    assertRelation(owner, target, "requires");
  }

  // S8: retain only current replay inputs named by actual CURRENT tests.
  // The frozen integrity test reads the six exact package/evidence pairs;
  // the parameterized Boolean replay reads four FORMAL/JSON source pairs and
  // the exact AND recursive wire witness. No directory-wide FORMAL ownership.
  const frozenReplay = read("ts/test/v015-frozen-replay-artifact-integrity.test.ts");
  const frozenPaths = sorted([...frozenReplay.matchAll(
    /\b(?:packagePath|evidencePath): "(formal\/v0\.15\/regression\/[^"]+)"/g,
  )].map(match => match[1]!));
  if (frozenPaths.length !== 12 || new Set(frozenPaths).size !== 12)
    fail("frozen replay verifier must read six distinct package/evidence pairs");
  const booleanReplay = read("ts/test/v015-boolean-package-replay-a2.test.ts");
  if (!booleanReplay.includes('const requested = process.env.V015_BOOLEAN_OPERATOR ?? "AND"') ||
      !["AND", "NOT", "OR", "XOR"].every(id => booleanReplay.includes('requested === "' + id + '"')) ||
      !booleanReplay.includes('resolve(repoRoot, "formal/v0.15/regression/compact-" + lower + ".formal")') ||
      !booleanReplay.includes('resolve(repoRoot, "formal/v0.15/regression/compact-" + lower + ".json")') ||
      !booleanReplay.includes('"formal/v0.15/regression/compact-and.formal"') ||
      !booleanReplay.includes('"formal/v0.15/regression/compact-and.json"') ||
      !booleanReplay.includes('"formal/v0.15/regression/compact-and.recursive"'))
    fail("bounded Boolean replay source/selector consumer contract changed");
  const booleanPaths = ["and", "not", "or", "xor"].flatMap(id => [
    "formal/v0.15/regression/compact-" + id + ".formal",
    "formal/v0.15/regression/compact-" + id + ".json",
  ]);
  const exactReplayPaths = sorted([...frozenPaths, ...booleanPaths,
    "formal/v0.15/regression/compact-and.recursive"]);
  if (new Set(exactReplayPaths).size !== 21)
    fail("current FORMAL replay witnesses unexpectedly overlap");
  // P7-S26: two previously Author-approved frozen source triples are physically
  // read and SHA-256 verified by active FULL integrity tests. Keep them distinct
  // from S8 package/evidence replay inputs, and never infer ownership of a
  // whole FORMAL directory or any new MTS semantic/proof authority.
  const approvedSourcePaths = sorted([
    ["ts/test/v015-grounded-approved-source-integrity.test.ts", "grounded-zero-role"],
    ["ts/test/v015-two-role-approved-source-integrity.test.ts", "two-role-meta-rule"],
  ].flatMap(([testPath, stem]) => {
    const consumer = read(testPath!);
    if (!consumer.includes("for (const [path, sha256] of expected)") ||
        !consumer.includes("readFileSync(resolve(repo, path))") ||
        !consumer.includes('createHash("sha256").update(bytes).digest("hex")'))
      fail("S26 approved source hash-verifying consumer changed: " + testPath);
    const pairs = [...consumer.matchAll(
      /\["(formal\/v0\.15\/regression\/[^"]+\.(?:formal|json|recursive))", "([a-f0-9]{64})"\]/g,
    )].map(match => ({ path: match[1]!, digest: match[2]! }));
    const expectedPaths = sorted(["formal", "json", "recursive"]
      .map(ext => "formal/v0.15/regression/" + stem + "." + ext));
    equalPaths(sorted(pairs.map(pair => pair.path)), expectedPaths,
      "S26 exact approved FORMAL source consumer " + stem);
    for (const {path, digest} of pairs) {
      const actual = createHash("sha256").update(readFileSync(resolve(root, path))).digest("hex");
      if (actual !== digest) fail("S26 approved source SHA-256 drift: " + path);
    }
    return expectedPaths;
  }));
  if (approvedSourcePaths.length !== 6 || new Set(approvedSourcePaths).size !== 6)
    fail("S26 approved source triples must be six disjoint physical artifacts");
  const declaredReplayPaths = sorted([...proofOwner.entries()]
    .filter(([path]) => path.startsWith("formal/v0.15/regression/"))
    .map(([path]) => path));
  equalPaths(declaredReplayPaths, sorted([...exactReplayPaths, ...approvedSourcePaths]),
    "exact current FORMAL replay and approved SHA-256 source inputs");
  for (const path of exactReplayPaths)
    assertRelation("MTS-PROJECT-PROOF-PROVENANCE-01", path, "requires");
  for (const path of approvedSourcePaths)
    assertRelation("MTS-PROJECT-PROOF-PROVENANCE-01", path, "requires");

  // P7-S14: current theorem projection contract names exact evidence inputs.
  // No blanket proofs/** claim; removal or mutation of the consumer changes the expected set.
  const theoremProjectionSource = read("ts/src/tooling/theorem-projection-contract.ts");
  if (!theoremProjectionSource.includes("evidencePaths: Object.freeze"))
    fail("current theorem projection evidence consumer missing");
  const theoremEvidencePaths = sorted(new Set(
    [...theoremProjectionSource.matchAll(/\bproofs\/v015-evidence\/[a-z0-9-]+\.json\b/g)]
      .map(match => match[0]),
  ));
  if (theoremEvidencePaths.length !== 11)
    fail("current theorem projection evidence inventory changed");
  // Evidence strings alone are not a causal witness: the actual builder must
  // include candidateProofFamilies in the returned source declaration.
  const theoremProjectionAst = ts.createSourceFile(
    "theorem-projection-contract.ts", theoremProjectionSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS,
  );
  const theoremProjectionBuilder = theoremProjectionAst.statements.find(statement =>
    ts.isFunctionDeclaration(statement) && statement.name?.text === "buildTheoremCatalogProjectionDeclaration");
  const theoremBuilderBody = theoremProjectionBuilder && ts.isFunctionDeclaration(theoremProjectionBuilder)
    ? theoremProjectionBuilder.body?.getText(theoremProjectionAst) ?? "" : "";
  if (!theoremBuilderBody.includes("THEOREM_CATALOG_INTEGRATION_CONTRACT.candidateProofFamilies.flatMap(") ||
      !theoremBuilderBody.includes("...family.evidencePaths") ||
      !theoremBuilderBody.includes("sources: Object.freeze(paths.map(projectionSource))"))
    fail("current theorem projection evidence source consumption changed");
  const declaredTheoremEvidence = sorted([...proofOwner.entries()]
    .filter(([path]) => path.startsWith("proofs/v015-evidence/")).map(([path]) => path));
  equalPaths(declaredTheoremEvidence, theoremEvidencePaths, "current theorem projection evidence");
  for (const path of theoremEvidencePaths)
    assertRelation("MTS-PROJECT-PROOF-PROVENANCE-01", path, "requires");

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

  // P7-S27: the active theorem catalog loader consumes pinned native proof
  // evidence for FND-02/FND-13. Their kernel realizations are not independent
  // external proofs. Preserve exactly the three physical executable sources.
  const projectionLoader = read("ts/src/tooling/theorem-projection-model.ts");
  const projectionCaller = read("ts/src/tooling/docs-sync.ts");
  if (!projectionLoader.includes('readJson(root, "proofs/native-proof-assurance.json")') ||
      !projectionLoader.includes("for (const targetValue of native.targets)") ||
      !projectionLoader.includes('paths.add(text(evidence.path, "native assurance evidence.path"))') ||
      !projectionCaller.includes("loadRepositoryTheoremProjectionSources("))
    fail("S27 current theorem projection native provenance consumer changed");
  const nativeAssurance = object(JSON.parse(read("proofs/native-proof-assurance.json")),
    "S27 native assurance");
  if (nativeAssurance.status !== "active" ||
      nativeAssurance.authority !== "native-proof-assurance-classification-only")
    fail("S27 native provenance classification changed");
  const pinned = new Map<string, string>();
  const pinnedTargets = array(nativeAssurance.targets, "S27 native targets");
  for (const theoremId of ["FND-02", "FND-13"]) {
    const target = pinnedTargets.map((v) => object(v, "S27 native target"))
      .find(v => v.id === theoremId);
    if (!target || target.classification !== "KERNEL_REALIZED_NOT_INDEPENDENT" ||
        target.independent !== false)
      fail("S27 FND-02/FND-13 non-independent classification changed");
    for (const rawArtifact of array(target.evidence, "S27 native evidence")) {
      const item = object(rawArtifact, "S27 native item");
      const path = item.path;
      const digest = item.gitBlobSha;
      if (typeof path !== "string" || typeof digest !== "string" ||
          !/^[a-f0-9]{40}$/.test(digest))
        fail("S27 native evidence path/hash malformed");
      if (!path.startsWith("ts/test/") || !path.endsWith(".test.ts")) continue;
      if (pinned.has(path) && pinned.get(path) !== digest)
        fail("S27 inconsistent shared native source pin: " + path);
      pinned.set(path, digest);
    }
  }
  const nativeSourceWitnesses = sorted(pinned.keys());
  equalPaths(nativeSourceWitnesses, sorted([
    "ts/test/recursive-link-identity-proof.test.ts",
    "ts/test/v013-aspect-foundation-theorem.test.ts",
    "ts/test/v013-cyclic-grounding-boundary.test.ts",
  ]), "S27 exact active native FND-02/FND-13 witnesses");
  for (const path of nativeSourceWitnesses) {
    const bytes = readFileSync(resolve(root, path));
    const sha = createHash("sha1")
      .update("blob " + bytes.length + "\0").update(bytes).digest("hex");
    if (sha !== pinned.get(path)) fail("S27 native proof source blob drift: " + path);
    assertRelation("MTS-PROJECT-PROOF-PROVENANCE-01", path, "requires");
  }

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


  // S12: generated theorem catalog is a current deterministic docs-sync
  // input/output, not an independently authored semantic Requirement or
  // a hand-authored 'documents' resource.
  const catalogGenerator = read("ts/src/tooling/theorem-catalog-markdown.ts");
  const docsSyncConsumer = read("ts/src/tooling/docs-sync.ts");
  const catalogSourceMarker = 'export const THEOREM_CATALOG_PATH = "' +
    THEOREM_CATALOG_PATH + '";';
  if (!catalogGenerator.includes(catalogSourceMarker) ||
      !docsSyncConsumer.includes('from "./theorem-catalog-markdown.js"') ||
      !docsSyncConsumer.includes("readFileSync(resolve(root, THEOREM_CATALOG_PATH)") ||
      !docsSyncConsumer.includes("readFileSync(theoremCatalogFullPath") ||
      !docsSyncConsumer.includes("writeFileSync(theoremCatalogFullPath") ||
      !coverageWorkflow.includes("npm --prefix ts run docs:sync") ||
      publicationScripts["docs:sync"] !==
        "npm run build --silent && node dist/src/tooling/docs-sync.js --write" ||
      publicationScripts["docs:check"] !==
        "npm run build --silent && node dist/src/tooling/docs-sync.js --check")
    fail("S12 generated theorem catalog current docs-sync source/observer changed");
  assertRelation("MTS-PROJECT-PUBLICATION-01", THEOREM_CATALOG_PATH, "requires");

  // S9: bounded non-authoritative Reader W6 preview inputs. Ownership is
  // reconstructed from the real workflow/CLI, the renderer's directly invoked
  // loader imports, and their exact source-owner constants. This does not
  // grant editorial approval or own the rest of requirements/mts-source.
  const readerWorkflow = read(".github/workflows/reader-preview.yml");
  const readerCli = read("ts/src/tooling/mts-reader-r44-w6-cli.ts");
  if (!readerWorkflow.includes("node dist/src/tooling/mts-reader-r44-w6-cli.js") ||
      !readerCli.includes('from "./mts-reader-r44-w6.js"') ||
      !readerCli.includes('renderReaderW6(resolve(".."))'))
    fail("Reader W6 preview no longer has the bounded executable workflow/CLI consumer");
  const readerW6ModelPath = "requirements/mts-source/MTS-READER-HUMAN-EDITION-R44-W6.yaml";
  const readerW6Doc = parseDocument(read(readerW6ModelPath),
    { strict: true, uniqueKeys: true, merge: false });
  if (readerW6Doc.errors.length || readerW6Doc.warnings.length)
    fail("Reader W6 model must be strict YAML without parse warnings");
  const readerW6Model = object(readerW6Doc.toJS({ maxAliasCount: 0 }), "Reader W6 model");
  if (readerW6Model.status !== "proposed" ||
      readerW6Model.author_approval !== "not-recorded" ||
      readerW6Model.publication !== "blocked" ||
      readerW6Model.semantic_change !== false)
    fail("Reader W6 draft model cannot gain unrecorded approval or semantic authority");
  const previewRoot = "ts/src/tooling/mts-reader-r44-w6.ts";
  const previewSource = read(previewRoot);
  const previewAst = ts.createSourceFile(previewRoot, previewSource, ts.ScriptTarget.Latest, true);
  const directlyInvoked = new Map<string, string[]>();
  for (const statement of previewAst.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier))
      continue;
    const module = statement.moduleSpecifier.text;
    if (!module.startsWith("./mts-reader-") || !module.endsWith(".js")) continue;
    const binding = statement.importClause?.namedBindings;
    if (!binding || !ts.isNamedImports(binding)) fail("Reader W6 loader import must be named");
    const path = "ts/src/tooling/" + module.slice(2, -3) + ".ts";
    if (directlyInvoked.has(path)) fail("Reader W6 loader imported twice: " + path);
    const names = binding.elements.map(element => element.name.text);
    if (!names.length || names.some(name => !name.startsWith("loadReader") ||
        !previewSource.includes(name + "(root)")))
      fail("Reader W6 module imported without direct loader execution: " + path);
    directlyInvoked.set(path, names);
  }
  if (directlyInvoked.size !== 23)
    fail("Reader W6 directly invoked loader module count changed");
  const readCalls = new Set(["read", "get", "load", "file", "local", "readFileSync"]);
  const modelPaths = new Set<string>();
  for (const path of [previewRoot, ...directlyInvoked.keys()]) {
    const text = read(path);
    const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
    let modelCount = 0;
    const visit = (node: ts.Node): void => {
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) &&
          node.name.text.endsWith("_PATH") && node.initializer &&
          ts.isStringLiteral(node.initializer) &&
          node.initializer.text.startsWith("requirements/mts-source/") &&
          node.initializer.text.endsWith(".yaml")) {
        const name = node.name.text;
        const target = node.initializer.text;
        if (!existsSync(resolve(root, target)))
          fail("Reader W6 loader model path missing: " + target);
        let readConsumer = false;
        const findReadCall = (call: ts.Node): void => {
          if (ts.isCallExpression(call) && ts.isIdentifier(call.expression) &&
              readCalls.has(call.expression.text) &&
              call.arguments.some(arg => new RegExp("\\b" + name + "\\b")
                .test(arg.getText(source))))
            readConsumer = true;
          ts.forEachChild(call, findReadCall);
        };
        findReadCall(source);
        if (!readConsumer)
          fail("Reader W6 model constant lacks direct file-reader consumer: " + name);
        if (modelPaths.has(target)) fail("duplicate Reader W6 direct model input: " + target);
        modelPaths.add(target);
        modelCount++;
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
    if (!modelCount) fail("Reader W6 loader has no exact YAML input: " + path);
  }
  const exactPreviewPaths = sorted(modelPaths);
  if (exactPreviewPaths.length !== 25)
    fail("Reader W6 direct YAML input count changed");
  const declaredPreviewPaths = sorted([...publicationOwner.entries()]
    .filter(([path]) => path.startsWith("requirements/mts-source/"))
    .map(([path]) => path));
  const declaredDirectPreviewPaths = declaredPreviewPaths.filter(path =>
    exactPreviewPaths.includes(path));
  equalPaths(declaredDirectPreviewPaths, exactPreviewPaths, "Reader W6 directly invoked YAML inputs");
  for (const path of exactPreviewPaths)
    assertRelation("MTS-PROJECT-PUBLICATION-01", path, "requires");

  // P7-S31: the current W6 preview executes two exact scientific-review
  // readers. Their source bytes are required for non-authoritative preview,
  // not declared accepted semantic algorithms or production authority.
  for (const witness of s31Witnesses) {
    if (!directlyInvoked.get(witness.consumer)?.includes(witness.loader))
      fail("S31 W6 preview reader is not directly invoked");
    const source = ts.createSourceFile(witness.consumer, read(witness.consumer),
      ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const sourcesDecl = source.statements
      .filter(ts.isVariableStatement)
      .flatMap(s => s.declarationList.declarations)
      .find(d => ts.isIdentifier(d.name) && d.name.text === "sources");
    const expr = sourcesDecl?.initializer;
    const sourceMap = expr && ts.isAsExpression(expr) ? expr.expression : expr;
    if (!sourceMap || !ts.isObjectLiteralExpression(sourceMap))
      fail("S31 preview sources declaration changed");
    const property = sourceMap.properties.find(p =>
      ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && p.name.text === witness.key);
    if (!property || !ts.isPropertyAssignment(property) ||
        !ts.isStringLiteral(property.initializer) ||
        property.initializer.text !== witness.target)
      fail("S31 preview evidence source path changed");
    let sourceReader = false;
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) &&
          node.expression.text === "read" && node.arguments.length === 2 &&
          ts.isIdentifier(node.arguments[0]!) &&
          (node.arguments[0] as ts.Identifier).text === "root" &&
          ts.isIdentifier(node.arguments[1]!) &&
          (node.arguments[1] as ts.Identifier).text === witness.arg)
        sourceReader = true;
      ts.forEachChild(node, visit);
    };
    visit(source);
    const readerDecl = source.statements.find(s => ts.isFunctionDeclaration(s) &&
      s.name?.text === "read");
    if (!sourceReader || !readerDecl ||
        !readerDecl.getText(source).includes('return readFileSync(resolve(root,path),"utf8")'))
      fail("S31 preview evidence physical read disconnected");
    const witnessBytes = read(witness.target);
    if (!witnessBytes.includes(witness.marker) ||
        (witness.key === "association_ts" &&
         !witnessBytes.includes('status: "RESEARCH_NOT_ACCEPTED"')))
      fail("S31 preview source marker or research boundary changed");
    assertRelation("MTS-PROJECT-PUBLICATION-01", witness.target, "requires");
  }

  // S11: the actual W6 renderer was instrumented with node:fs
  // syncBuiltinESMExports and exercised against the exact candidate tree.
  // Unlike textual path enumeration, this is the full observed read closure.
  // The two M06 transcriptions are immutable, runtime-consumed byte-pinned
  // *secondary* sources, never PDF original bytes or semantic approval.
  const runtimePaths = sorted(readerRuntimeInputs);
  if (runtimePaths.length !== new Set(runtimePaths).size)
    fail("Reader W6 runtime file-read witness contains duplicates");
  const runtimeYamlPaths = runtimePaths.filter(path =>
    path.startsWith("requirements/mts-source/") && path.endsWith(".yaml"));
  const runtimeM06Paths = runtimePaths.filter(path =>
    path.startsWith("reviews/m06/") && path.endsWith(".txt"));
  if (runtimeYamlPaths.length !== 43 || runtimeM06Paths.length !== 2 ||
      runtimePaths.length !== 45)
    fail("Reader W6 complete runtime provenance input count changed");
  const expectedReviewPaths = sorted([
    "reviews/m06/reviewer-b-97-indexed-extraction.txt",
    "reviews/m06/reviewer-c-43-indexed-extraction.txt",
  ]);
  equalPaths(runtimeM06Paths, expectedReviewPaths, "Reader W6 exact M06 runtime transcript paths");
  const declaredRuntimePaths = sorted([...publicationOwner.entries()]
    .filter(([path]) => path.startsWith("requirements/mts-source/") ||
      path.startsWith("reviews/m06/"))
    .map(([path]) => path));
  equalPaths(declaredRuntimePaths, runtimePaths, "Reader W6 full observed runtime input closure");
  for (const path of runtimePaths)
    assertRelation("MTS-PROJECT-PUBLICATION-01", path, "requires");
  const m06Source = read("ts/src/tooling/mts-reader-review-m06.ts");
  const blobSource = /const originalBlob\s*=\s*{([\s\S]*?)}\s*as const;/.exec(m06Source)?.[1];
  if (!blobSource) fail("M06 original Git blob pins disappeared from current consumer");
  for (const [tag, path] of [["B", expectedReviewPaths[0]!], ["C", expectedReviewPaths[1]!]] as const) {
    if (!m06Source.includes(tag + ':"' + path + '"'))
      fail("Reader W6 M06 current consumer path changed: " + tag);
    const pin = new RegExp("\\b" + tag + ':\\s*"([0-9a-f]{40})"').exec(blobSource)?.[1];
    if (!pin) fail("Reader W6 M06 source SHA pin missing: " + tag);
    const value = read(path);
    const digest = createHash("sha1").update("blob " + Buffer.byteLength(value) + "\0")
      .update(value).digest("hex");
    if (digest !== pin) fail("Reader W6 pinned M06 transcription bytes changed: " + path);
    if (!value.includes("NOT ORIGINAL PDF BYTES") ||
        !value.includes("no claim of PDF-byte identity"))
      fail("Reader W6 M06 transcription must not misrepresent original PDF bytes");
  }


  // S11-A: restore only the exact secondary M06-B transcription whose
  // absence caused an actual Reader W6 ENOENT. Verify the present-tense
  // caller and its exact Git-blob pin rather than historical interest.
  const m06ReaderSource = read("ts/src/tooling/mts-reader-review-m06.ts");
  const m06BPath = "reviews/m06/reviewer-b-97-indexed-extraction.txt";
  const m06BlobSource = /const originalBlob\s*=\s*{([\s\S]*?)}\s*as const;/.exec(m06ReaderSource)?.[1];
  const m06BPin = m06BlobSource &&
    /\bB:\s*"([0-9a-f]{40})"/.exec(m06BlobSource)?.[1];
  if (!m06ReaderSource.includes('B:"' + m06BPath + '"') || !m06BPin)
    fail("M06-B current runtime consumer/path/Git blob pin is absent");
  const m06BText = read(m06BPath);
  const m06BDigest = createHash("sha1").update("blob " + Buffer.byteLength(m06BText) + "\0")
    .update(m06BText).digest("hex");
  if (m06BDigest !== m06BPin || !m06BText.includes("NOT ORIGINAL PDF BYTES") ||
      !m06BText.includes("no claim of PDF-byte identity"))
    fail("M06-B secondary transcription byte identity or source status drift");
  assertRelation("MTS-PROJECT-PUBLICATION-01", m06BPath, "requires");

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
  // Pages invokes contract-index.test.js, which itself executes every other
  // compiled test. Do not re-run the same suite in a second shell loop.
  if (!pagesWorkflow.includes("node web/contract-observatory/dist/test/contract-index.test.js"))
    fail("Contract Observatory Pages suite entrypoint changed");
  const suiteSource = read(observatoryPrefix + "test/contract-index.test.ts");
  const suiteAst = ts.createSourceFile("contract-index.test.ts", suiteSource,
    ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const suiteLoop = suiteAst.statements.find(node =>
    ts.isForOfStatement(node) && node.expression.getText(suiteAst) === "compiledTests");
  let executesCompiledTests = false;
  if (suiteLoop && ts.isForOfStatement(suiteLoop)) {
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node) &&
          node.expression.getText(suiteAst) === "execFileSync" &&
          node.arguments[0]?.getText(suiteAst) === "process.execPath" &&
          node.arguments[1]?.getText(suiteAst) === "[join(compiledTestDirectory, testName)]")
        executesCompiledTests = true;
      ts.forEachChild(node, visit);
    };
    visit(suiteLoop.statement);
  }
  if (!executesCompiledTests ||
      !suiteSource.includes('if (testName === "contract-index.test.js") continue;') ||
      !suiteSource.includes("readdirSync(compiledTestDirectory)") ||
      !suiteSource.includes("sourceTests.join(") ||
      !suiteSource.includes("compiledTests.join("))
    fail("Contract Observatory suite runner no longer executes full compiled test set");
  const observatoryConfig = object(JSON.parse(read(observatoryPrefix + "tsconfig.json")), "Observatory tsconfig");
  if (!array(observatoryConfig.include, "Observatory includes").includes("test/**/*.ts"))
    fail("Contract Observatory compiled test inclusion changed");
  const executedObservatoryTests = sorted(readdirSync(resolve(root, observatoryPrefix + "test"))
    .filter(name => name.endsWith(".test.ts"))
    .map(name => observatoryPrefix + "test/" + name));
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
    formalReplayResources: exactReplayPaths.length,
    approvedSourceIntegrityResources: approvedSourcePaths.length,
    compiledProofSourceUnits: compiledProofPaths.length,
    protectedHistoricalImages: protectedAssets.length,
    currentDocumentationSurfaces: currentDocuments.length,
    readerPreviewLoaderModules: directlyInvoked.size,
    readerPreviewYamlInputs: exactPreviewPaths.length,
    readerPreviewRuntimeYamlInputs: runtimeYamlPaths.length,
    readerPreviewPinnedTranscriptions: runtimeM06Paths.length,
    observatorySources: observedSources.size,
    observatoryExecutedTests: executedObservatoryTests.length,
  });
}
