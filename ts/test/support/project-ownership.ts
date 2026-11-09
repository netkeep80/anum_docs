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
  // Derive the set from actual readFileSync calls in the five FULL tests,
  // including the parameterized hierarchical fixture loop. Do not blanket
  // claim all examples or count comments as executable readers.
  const conformanceConsumers = [
    "ts/test/anum-two-memory-conformance.test.ts",
    "ts/test/quaternary-anum-hierarchical-two-memory.test.ts",
    "ts/test/string-anum-two-memory-conformance.test.ts",
    "ts/test/v012-string-utf8-boundary.test.ts",
    "ts/test/v013-file-wire-conformance.test.ts",
  ] as const;
  const fixturePrefix = "../examples/anum/conformance/";
  const observedConformancePaths = new Set<string>();

  // A reader nested in an uncalled function/arrow, conditional or callback
  // does not witness an executed FULL test dependency. Only the existing
  // immediate, top-level const initializers are admitted, with two explicit
  // synchronous byte-wrapper forms; anything else fails closed.
  const immediateFixtureRead = (initializer: ts.Expression): string | undefined => {
    let readExpression: ts.Expression = initializer;
    if (ts.isNewExpression(initializer)) {
      if (!ts.isIdentifier(initializer.expression) ||
          initializer.expression.text !== "Uint8Array" ||
          initializer.arguments?.length !== 1 || initializer.arguments[0] === undefined)
        return undefined;
      readExpression = initializer.arguments[0];
    } else if (ts.isCallExpression(initializer) &&
               ts.isPropertyAccessExpression(initializer.expression) &&
               ts.isIdentifier(initializer.expression.expression) &&
               initializer.expression.expression.text === "Uint8Array" &&
               initializer.expression.name.text === "from") {
      const wrapperArg = initializer.arguments[0];
      if (initializer.arguments.length !== 1 || wrapperArg === undefined)
        return undefined;
      readExpression = wrapperArg;
    }
    if (!ts.isCallExpression(readExpression) ||
        !ts.isIdentifier(readExpression.expression) ||
        readExpression.expression.text !== "readFileSync" ||
        (readExpression.arguments.length !== 1 && readExpression.arguments.length !== 2))
      return undefined;
    const path = readExpression.arguments[0];
    if (path === undefined || !ts.isStringLiteral(path) ||
        !path.text.startsWith(fixturePrefix))
      return undefined;
    return path.text.slice(3);
  };
  const directTopLevelReads = (source: ts.SourceFile): string[] => {
    const observed: string[] = [];
    const examine = (statement: ts.Statement): void => {
      if (!ts.isVariableStatement(statement) ||
          !(statement.declarationList.flags & ts.NodeFlags.Const) ||
          statement.declarationList.declarations.length !== 1)
        return;
      const initializer = statement.declarationList.declarations[0]?.initializer;
      if (initializer === undefined) return;
      const path = immediateFixtureRead(initializer);
      if (path !== undefined) observed.push(path);
    };
    for (const statement of source.statements) {
      if (ts.isBlock(statement)) {
        // A bare module-level block is executed when the test is imported.
        // Never recurse into an if/loop/function that might be unreachable.
        for (const nested of statement.statements) examine(nested);
      } else examine(statement);
    }
    return observed;
  };

  const hierarchicalTopLevelReads = (source: ts.SourceFile): string[] => {
    // Derive the data exclusively from the exact top-level binding used by
    // the top-level for-of. Do not sweep arbitrary path properties in the AST.
    const fixtureBindings: ts.VariableDeclaration[] = [];
    const loops: ts.ForOfStatement[] = [];
    let bindingPosition = -1, loopPosition = -1;
    for (const [index, statement] of source.statements.entries()) {
      if (ts.isVariableStatement(statement)) {
        for (const declaration of statement.declarationList.declarations) {
          if (ts.isIdentifier(declaration.name) && declaration.name.text === "fixtures") {
            if (!(statement.declarationList.flags & ts.NodeFlags.Const))
              fail("S18 hierarchical fixture binding is not const");
            fixtureBindings.push(declaration);
            bindingPosition = index;
          }
        }
      }
      if (ts.isForOfStatement(statement) && ts.isIdentifier(statement.expression) &&
          statement.expression.text === "fixtures") {
        loops.push(statement);
        loopPosition = index;
      }
    }
    if (fixtureBindings.length !== 1 || loops.length !== 1 ||
        bindingPosition >= loopPosition)
      fail("S18 hierarchical fixture collection/loop topology changed");
    const binding = fixtureBindings[0];
    const loop = loops[0];
    if (binding === undefined || loop === undefined ||
        binding.initializer === undefined ||
        !ts.isCallExpression(binding.initializer) ||
        !ts.isPropertyAccessExpression(binding.initializer.expression) ||
        !ts.isIdentifier(binding.initializer.expression.expression) ||
        binding.initializer.expression.expression.text !== "Object" ||
        binding.initializer.expression.name.text !== "freeze" ||
        binding.initializer.arguments.length !== 1 ||
        !ts.isArrayLiteralExpression(binding.initializer.arguments[0]!))
      fail("S18 hierarchical fixture collection must directly freeze the used literal array");
    const literal = binding.initializer.arguments[0];
    if (literal === undefined || !ts.isArrayLiteralExpression(literal) ||
        literal.elements.length !== 4)
      fail("S18 hierarchical fixture collection must contain exactly four objects");
    const paths: string[] = [];
    for (const element of literal.elements) {
      if (!ts.isObjectLiteralExpression(element))
        fail("S18 hierarchical fixture array contains a non-literal entry");
      const pathProperties = element.properties.filter(property =>
        ts.isPropertyAssignment(property) &&
        ((ts.isIdentifier(property.name) && property.name.text === "path") ||
         (ts.isStringLiteral(property.name) && property.name.text === "path")));
      const pathProperty = pathProperties[0];
      if (pathProperties.length !== 1 || pathProperty === undefined ||
          !ts.isPropertyAssignment(pathProperty) ||
          !ts.isStringLiteral(pathProperty.initializer) ||
          !pathProperty.initializer.text.startsWith(fixturePrefix))
        fail("S18 hierarchical fixture object lacks a single literal conformance path");
      paths.push(pathProperty.initializer.text.slice(3));
    }
    const init = loop.initializer;
    if (!ts.isVariableDeclarationList(init) ||
        !(init.flags & ts.NodeFlags.Const) || init.declarations.length !== 1 ||
        !ts.isIdentifier(init.declarations[0]!.name) ||
        init.declarations[0]!.name.text !== "fixture" ||
        init.declarations[0]!.initializer !== undefined ||
        !ts.isBlock(loop.statement))
      fail("S18 hierarchical fixture for-of must bind exactly const fixture");
    // The first statement must read the current loop element unconditionally.
    // Thus an early continue, return, guard or other skip cannot silently
    // drop a dependency while leaving unrelated reads elsewhere in the file.
    const first = loop.statement.statements[0];
    if (first === undefined || !ts.isVariableStatement(first) ||
        !(first.declarationList.flags & ts.NodeFlags.Const) ||
        first.declarationList.declarations.length !== 1)
      fail("S18 hierarchical fixture first read is no longer unconditional");
    const readBinding = first.declarationList.declarations[0];
    const readCall = readBinding?.initializer;
    if (readBinding === undefined || !ts.isIdentifier(readBinding.name) ||
        readBinding.name.text !== "source" ||
        readCall === undefined || !ts.isCallExpression(readCall) ||
        !ts.isIdentifier(readCall.expression) ||
        readCall.expression.text !== "readFileSync" ||
        readCall.arguments.length !== 2)
      fail("S18 hierarchical fixture first read is not the actual source loader");
    const pathArg = readCall.arguments[0];
    const encodingArg = readCall.arguments[1];
    if (pathArg === undefined || !ts.isPropertyAccessExpression(pathArg) ||
        !ts.isIdentifier(pathArg.expression) || pathArg.expression.text !== "fixture" ||
        pathArg.name.text !== "path" ||
        encodingArg === undefined || !ts.isStringLiteral(encodingArg) ||
        encodingArg.text !== "utf8")
      fail("S18 hierarchical fixture read must use the bound loop element");
    if (new Set(paths).size !== 4)
      fail("S18 hierarchical fixture paths must be distinct");
    return paths;
  };

  // P7-S18-AUD-002: a spelling match to Object.freeze or readFileSync is
  // insufficient unless those names actually denote the built-in Object
  // and the node:fs reader. A shadow can leave all literal paths intact
  // while running fewer (or zero) physical reads. Accept only the exact
  // current import and reject any rebind in the consumer source.
  const assertUnshadowedFixturePrimitives = (source: ts.SourceFile, testPath: string): void => {
    let nodeFsImportCount = 0;
    for (const statement of source.statements) {
      if (!ts.isImportDeclaration(statement) ||
          !ts.isStringLiteral(statement.moduleSpecifier)) continue;
      const moduleName = statement.moduleSpecifier.text;
      const clause = statement.importClause;
      if (clause?.name !== undefined &&
          (clause.name.text === "Object" || clause.name.text === "readFileSync"))
        fail("S18 fixture primitive import must not alias a built-in: " + testPath);
      const named = clause?.namedBindings;
      if (named !== undefined && ts.isNamespaceImport(named) &&
          (named.name.text === "Object" || named.name.text === "readFileSync"))
        fail("S18 fixture primitive namespace import must not shadow: " + testPath);
      if (named === undefined || !ts.isNamedImports(named)) continue;
      for (const element of named.elements) {
        if (element.name.text === "Object")
          fail("S18 built-in Object must not be imported/shadowed: " + testPath);
        if (element.name.text === "readFileSync") {
          if (moduleName !== "node:fs" || element.propertyName !== undefined ||
              element.isTypeOnly)
            fail("S18 readFileSync must come directly from node:fs: " + testPath);
          nodeFsImportCount++;
        }
      }
    }
    if (nodeFsImportCount !== 1)
      fail("S18 readFileSync must have one direct node:fs import: " + testPath);
    const forbidden = (name: ts.Identifier | undefined): void => {
      if (name !== undefined && (name.text === "Object" || name.text === "readFileSync"))
        fail("S18 fixture primitive shadowed by local binding: " + testPath);
    };
    const visit = (node: ts.Node): void => {
      if ((ts.isVariableDeclaration(node) || ts.isParameter(node) ||
           ts.isBindingElement(node)) && ts.isIdentifier(node.name))
        forbidden(node.name);
      if ((ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) ||
           ts.isClassDeclaration(node)) && node.name !== undefined)
        forbidden(node.name);
      if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
          ts.isPropertyAccessExpression(node.left) &&
          ts.isIdentifier(node.left.expression) &&
          node.left.expression.text === "Object" &&
          node.left.name.text === "freeze")
        fail("S18 built-in Object.freeze must not be reassigned: " + testPath);
      ts.forEachChild(node, visit);
    };
    visit(source);
  };

  for (const testPath of conformanceConsumers) {
    const source = ts.createSourceFile(testPath, read(testPath),
      ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    assertUnshadowedFixturePrimitives(source, testPath);
    if (testPath === "ts/test/quaternary-anum-hierarchical-two-memory.test.ts") {
      const indexed = hierarchicalTopLevelReads(source);
      if (directTopLevelReads(source).length !== 0)
        fail("S18 hierarchical consumer contains unexpected direct fixture readers");
      for (const path of indexed) observedConformancePaths.add(path);
    } else {
      const reads = directTopLevelReads(source);
      if (reads.length !== 1)
        fail("S18 direct conformance test fixture reader changed: " + testPath);
      observedConformancePaths.add(reads[0]!);
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
  const declaredReplayPaths = sorted([...proofOwner.entries()]
    .filter(([path]) => path.startsWith("formal/v0.15/regression/"))
    .map(([path]) => path));
  equalPaths(declaredReplayPaths, exactReplayPaths, "current frozen FORMAL replay input");
  for (const path of exactReplayPaths)
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
