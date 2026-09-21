import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import * as ts from "typescript";
import { Memory, ensureRootBasis } from "../src/memory.js";
import { decomposeV013SemanticLink } from "../src/v013-hierarchical-carrier.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.13 A9 semantic dependency projection: ${message}`);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: expected ${String(expected)}, got ${String(actual)}`);
}

function setEqual(actual: readonly string[], expected: readonly string[], message: string): void {
  const left = [...actual].sort();
  const right = [...expected].sort();
  assert(
    left.length === right.length && left.every((value, index) => value === right[index]),
    `${message}: expected [${right.join(", ")}], got [${left.join(", ")}]`,
  );
}

const repoRoot = resolve(process.cwd(), "..");
const read = (path: string): string => readFileSync(join(repoRoot, path), "utf8");
const readJson = (path: string): any => JSON.parse(read(path));

// P1 audit source; this file is external verification and is never imported by runtime.
const projectionPath = "traceability/mts-v0.13-semantic-dependency-projection.json";
const projection = readJson(projectionPath);
const contract = readJson("contracts/mts-contract-v0.13.json");

same(projection.schema, "mts-semantic-dependency-projection/v0.1", "projection schema");
same(projection.mtsVersion, "0.13", "projection MTS version");
same(projection.status, "research", "projection remains research evidence");
same(projection.externalAuditProjectionOnly, true, "projection is external audit tooling");
same(projection.normativeFoundation, false, "projection is not MTS foundation");
same(projection.semanticAuthority, false, "projection grants no semantic authority");
same(projection.executionDependency, false, "MTS execution does not depend on projection");
same(projection.ownerIssue, 1270, "projection is owned by #1270");
same(
  projection.candidateMain,
  "eaa949f8e3f064ad60c575eeb973502b8e15d9fd",
  "projection binds the exact ready candidate snapshot",
);
same(projection.coverage.globalTrustBoundaryComplete, false, "P1 does not overclaim global trust closure");
same(
  projection.coverage.candidateKernelDirectDependencyCoverageComplete,
  true,
  "P1 covers direct candidate-kernel dependencies",
);
same(
  projection.metrics.globalUndocumentedSemanticPathCount,
  null,
  "global undocumented semantic path count remains intentionally unknown",
);

setEqual(
  projection.auditScope.candidateKernelFiles,
  contract.implementation.candidateKernelFiles,
  "audit scope exactly equals declared v0.13 candidate kernel files",
);

// Find the runtime functions from v0.13 modules that are re-exported through
// the package facade. A future new public v0.13 semantic function must therefore
// be declared in this projection or the audit fails.
function exportedFunctionNames(sourcePath: string): ReadonlySet<string> {
  const source = ts.createSourceFile(
    sourcePath,
    read(sourcePath),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const result = new Set<string>();
  for (const statement of source.statements) {
    if (!ts.isFunctionDeclaration(statement) || statement.name === undefined) continue;
    const exported = statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ?? false;
    if (exported) result.add(statement.name.text);
  }
  return result;
}

const publicSource = ts.createSourceFile(
  "ts/src/public.ts",
  read("ts/src/public.ts"),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TS,
);
const observedPublicFunctions = new Set<string>();

for (const statement of publicSource.statements) {
  if (
    !ts.isExportDeclaration(statement) ||
    statement.moduleSpecifier === undefined ||
    !ts.isStringLiteral(statement.moduleSpecifier) ||
    !statement.moduleSpecifier.text.startsWith("./v013-") ||
    statement.exportClause === undefined ||
    !ts.isNamedExports(statement.exportClause)
  ) {
    continue;
  }

  const sourcePath = `ts/src/${statement.moduleSpecifier.text.slice(2).replace(/\.js$/, ".ts")}`;
  const functions = exportedFunctionNames(sourcePath);
  for (const element of statement.exportClause.elements) {
    const sourceName = element.propertyName?.text ?? element.name.text;
    if (functions.has(sourceName)) observedPublicFunctions.add(element.name.text);
  }
}

setEqual(
  [...observedPublicFunctions],
  projection.publicSemanticEntrypoints.map((entry: any) => entry.symbol),
  "all public v0.13 runtime functions are classified as semantic entrypoints",
);

// Static direct-dependency observation over the five candidate-kernel files.
// This projection is deliberately external observability: it watches source
// dependencies but is never read by the runtime implementation.
const memoryMembers = new Set([
  "root",
  "linkCount",
  "poles",
  "find",
  "outgoing",
  "incoming",
  "ensureRoot",
  "ensureStartSelfClosed",
  "ensureEndSelfClosed",
  "ensure",
]);

function observedDirectDependencies(sourcePath: string): readonly string[] {
  const source = ts.createSourceFile(
    sourcePath,
    read(sourcePath),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const imports = new Map<string, { readonly imported: string; readonly from: string }>();

  for (const statement of source.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      !statement.moduleSpecifier.text.startsWith(".") ||
      statement.importClause?.namedBindings === undefined ||
      !ts.isNamedImports(statement.importClause.namedBindings)
    ) {
      continue;
    }

    for (const element of statement.importClause.namedBindings.elements) {
      imports.set(element.name.text, {
        imported: element.propertyName?.text ?? element.name.text,
        from: statement.moduleSpecifier.text,
      });
    }
  }

  const observed = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      if (ts.isIdentifier(node.expression)) {
        const imported = imports.get(node.expression.text);
        if (imported !== undefined) {
          observed.add(`${imported.from}#${imported.imported}`);
        }
      }
    }

    if (
      ts.isPropertyAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "memory" &&
      memoryMembers.has(node.name.text)
    ) {
      observed.add(`memory#${node.name.text}`);
    }

    ts.forEachChild(node, visit);
  };
  visit(source);
  return [...observed].sort();
}

let undocumentedDirectDependencyCount = 0;
for (const sourcePath of projection.auditScope.candidateKernelFiles as string[]) {
  const observed = observedDirectDependencies(sourcePath);
  const declared = projection.auditScope.directDependenciesByFile[sourcePath] ?? [];
  setEqual(observed, declared, `${sourcePath}: direct dependency projection`);

  for (const dependency of observed) {
    if (projection.implementationBindings[dependency] === undefined) {
      undocumentedDirectDependencyCount += 1;
    }
  }
}
same(
  undocumentedDirectDependencyCount,
  projection.metrics.directUndocumentedDependencyCount,
  "direct undocumented dependency metric",
);
same(undocumentedDirectDependencyCount, 0, "no direct candidate-kernel dependency is undocumented");

// Every dependency relation is closed over declared capability IDs.
const capabilities = new Map<string, any>(
  projection.capabilities.map((capability: any) => [capability.id, capability]),
);
same(capabilities.size, projection.capabilities.length, "capability IDs are unique");

for (const capability of projection.capabilities as any[]) {
  for (const dependency of capability.dependsOn as string[]) {
    assert(capabilities.has(dependency), `${capability.id}: dependency exists: ${dependency}`);
  }
  if (capability.layer === "derived-semantic") {
    assert(capability.dependsOn.length > 0, `${capability.id}: derived semantic service is not a hidden terminal`);
  }
}

for (const entry of projection.publicSemanticEntrypoints as any[]) {
  assert(capabilities.has(entry.capabilityId), `${entry.symbol}: public capability exists`);
}

for (const [symbol, capabilityId] of Object.entries(projection.implementationBindings) as Array<[string, string]>) {
  assert(capabilities.has(capabilityId), `${symbol}: implementation binding resolves to a capability`);
}

// A narrow but executable object-specific shortcut detector: a concrete
// multi-abit wire term such as 98/19868 must not participate in host control
// flow that selects semantic behavior. Structural data labels such as the
// self-incidence classifier "11" are not shortcuts merely because they are
// strings containing the same characters.
let objectSpecificWireLiteralCount = 0;
const exactTermLiteral = /^[8961]{2,}$/;
for (const sourcePath of projection.auditScope.candidateKernelFiles as string[]) {
  const source = ts.createSourceFile(
    sourcePath,
    read(sourcePath),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const visit = (node: ts.Node): void => {
    if (
      ts.isStringLiteral(node) &&
      exactTermLiteral.test(node.text) &&
      (ts.isBinaryExpression(node.parent) || ts.isCaseClause(node.parent))
    ) {
      objectSpecificWireLiteralCount += 1;
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}
same(
  objectSpecificWireLiteralCount,
  projection.metrics.objectSpecificHostSemanticShortcutCount,
  "object-specific exact-term host shortcut metric",
);
same(objectSpecificWireLiteralCount, 0, "no exact multi-abit object special case exists in candidate kernel");

// Recompute all published P1 metrics from stable capability IDs.
const byLayer = (layer: string): any[] =>
  projection.capabilities.filter((capability: any) => capability.layer === layer);
const semanticCapabilities = projection.capabilities.filter((capability: any) =>
  ["semantic-bootstrap", "derived-semantic"].includes(capability.layer)
);

same(projection.metrics.candidateKernelFileCount, projection.auditScope.candidateKernelFiles.length, "kernel file count");
same(projection.metrics.publicSemanticEntrypointCount, projection.publicSemanticEntrypoints.length, "public semantic entrypoint count");
same(projection.metrics.declaredCapabilityCount, projection.capabilities.length, "declared capability count");
same(projection.metrics.ontologyCapabilityCount, byLayer("ontology").length, "ontology capability count");
same(projection.metrics.semanticBootstrapCapabilityCount, byLayer("semantic-bootstrap").length, "semantic bootstrap capability count");
same(projection.metrics.derivedSemanticCapabilityCount, byLayer("derived-semantic").length, "derived semantic capability count");
same(projection.metrics.representationCapabilityCount, byLayer("representation").length, "representation capability count");
same(projection.metrics.resourceControlCapabilityCount, byLayer("resource-control").length, "resource control capability count");
same(
  projection.metrics.hostOrMixedSemanticCapabilityCount,
  semanticCapabilities.filter((capability: any) => capability.execution !== "link-defined").length,
  "host/mixed semantic capability count",
);
same(
  projection.metrics.linkExpressedSemanticCapabilityCount,
  semanticCapabilities.filter((capability: any) => capability.linkExpressed === true).length,
  "Link-expressed semantic capability count",
);
same(
  projection.metrics.linkExecutedSemanticCapabilityCount,
  semanticCapabilities.filter((capability: any) => capability.execution === "link-defined").length,
  "Link-executed semantic capability count",
);
same(
  projection.metrics.hostLinkSemanticDuplicationCount,
  semanticCapabilities.filter((capability: any) => capability.hostLinkDuplication === true).length,
  "host/Link semantic duplication count",
);

const bootstrap = byLayer("semantic-bootstrap");
same(
  projection.metrics.confirmedIndependentPrimitiveCount,
  bootstrap.filter((capability: any) => capability.primitiveStatus === "INDEPENDENT").length,
  "confirmed independent primitive count",
);
same(
  projection.metrics.unknownPrimitiveStatusCount,
  bootstrap.filter((capability: any) => capability.primitiveStatus === "UNKNOWN").length,
  "unknown bootstrap primitive status count",
);

// ---------------------------------------------------------------------------
// A9 root-function hypothesis falsifier.
//
// Historical #1010 witnesses happened to use O as an explanatory Function /
// Relation kind. Their own comments explicitly say those host labels were not
// semantic authority. Test the stronger hypothesis against the v0.13 root
// aspect model instead of preserving that accidental assignment.
//
// Result we are looking for:
//
// 1. no one root Link is forced to be the contextual F merely by application
//    topology: R/O/C/L/U can all head the same left-associated relation shape;
// 2. every ordinary application/correspondence step is locally PAIR/00 and
//    therefore has the canonical root representative L;
// 3. L does not by itself imply mathematical functionality, because one fully
//    applied prefix may still have multiple ordinary PAIR/L continuations.
//
// So L is a candidate root representative of the *mapping/application form*,
// not a primitive Function kind and not a proof of single-valuedness.
{
  const memory = new Memory();
  const basis = ensureRootBasis(memory);

  const argument = memory.ensure(basis.U, basis.L);
  const value1 = memory.ensure(basis.C, basis.O);
  const value2 = memory.ensure(basis.L, basis.C);

  const rootCandidates = [
    ["R", basis.R],
    ["O", basis.O],
    ["C", basis.C],
    ["L", basis.L],
    ["U", basis.U],
  ] as const;

  for (const [name, functionContext] of rootCandidates) {
    const application = memory.ensure(functionContext, argument);
    const fact = memory.ensure(application, value1);

    const applicationAspect = decomposeV013SemanticLink(memory, basis, application);
    const factAspect = decomposeV013SemanticLink(memory, basis, fact);

    same(applicationAspect.aspect, "PAIR", `${name}: application is ordinary PAIR`);
    same(applicationAspect.selfIncidence, "00", `${name}: application self-incidence`);
    same(applicationAspect.sign, basis.L, `${name}: application root representative is L`);

    same(factAspect.aspect, "PAIR", `${name}: correspondence fact is ordinary PAIR`);
    same(factAspect.selfIncidence, "00", `${name}: fact self-incidence`);
    same(factAspect.sign, basis.L, `${name}: correspondence root representative is L`);
  }

  // O was historically chosen as functionKind in #1010, but left-associated
  // relation topology alone does not distinguish it from the other roots.
  const oApplication = memory.ensure(basis.O, argument);
  const lApplication = memory.ensure(basis.L, argument);
  assert(oApplication !== lApplication, "O and L contexts remain distinct Links");
  same(
    decomposeV013SemanticLink(memory, basis, oApplication).sign,
    basis.L,
    "O-headed application still has PAIR/L form",
  );
  same(
    decomposeV013SemanticLink(memory, basis, lApplication).sign,
    basis.L,
    "L-headed application has the same PAIR/L form",
  );

  // A conventional mathematical function needs uniqueness. The same PAIR/L
  // application prefix can have more than one value continuation, so L alone
  // cannot mean “single-valued function”.
  const fullPrefix = memory.ensure(basis.L, argument);
  const continuation1 = memory.ensure(fullPrefix, value1);
  const continuation2 = memory.ensure(fullPrefix, value2);
  assert(continuation1 !== continuation2, "two distinct values remain representable");

  for (const continuation of [continuation1, continuation2]) {
    const decomposition = decomposeV013SemanticLink(memory, basis, continuation);
    same(decomposition.aspect, "PAIR", "multivalued continuation remains PAIR");
    same(decomposition.sign, basis.L, "multivalued continuation remains represented by L");
  }
}

// A9 P1 must remain research-only and cannot silently rewrite the accepted state.
same(contract.accepted, false, "v0.13 remains unaccepted");
same(contract.acceptanceReady, true, "existing readiness state is preserved");
same(contract.implementation.candidateRuntimeSelectable, false, "candidate remains non-selectable");
same(contract.candidateState.explicitAuthorAcceptanceRecorded, false, "author acceptance remains pending");

console.log(
  `MTS v0.13 A9 P1 semantic dependency projection: ${projection.metrics.publicSemanticEntrypointCount} public semantic entrypoints, ${projection.metrics.declaredCapabilityCount} declared capabilities, direct undocumented dependencies=0; global trust closure remains intentionally unclaimed: GREEN.`,
);
