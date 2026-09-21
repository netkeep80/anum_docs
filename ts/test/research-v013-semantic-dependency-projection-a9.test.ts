import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import * as ts from "typescript";

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

same(projection.schema, "mts-semantic-dependency-projection/v0.3", "projection schema");
same(projection.mtsVersion, "0.13", "projection MTS version");
same(projection.status, "research", "projection remains research evidence");
same(projection.externalAuditProjectionOnly, true, "projection is external audit tooling");
same(projection.normativeFoundation, false, "projection is not MTS foundation");
same(projection.semanticAuthority, false, "projection grants no semantic authority");
same(projection.executionDependency, false, "MTS execution does not depend on projection");
same(projection.ownerIssue, 1270, "projection is owned by #1270");
same(
  projection.candidateMain,
  "fa8912c7691d52c9011ad9005620842044b26fb3",
  "projection binds the exact ready candidate snapshot",
);
same(projection.coverage.globalTrustBoundaryComplete, false, "P1 does not overclaim global trust closure");
same(
  projection.coverage.candidateKernelDirectDependencyCoverageComplete,
  true,
  "P1 covers direct candidate-kernel dependencies",
);
same(
  projection.coverage.inheritedAcceptedV012AuthorityRuntimeUnfolded,
  true,
  "P1b unfolds the inherited source/Dictionary/Theory/StructuralRule authority runtime",
);
same(
  projection.coverage.exactTheorySelectedAdmissionTransitiveImplementationClosureComplete,
  true,
  "P1c closes the exact-Theory selected-admission implementation chain",
);
same(
  projection.coverage.inheritedAuthorityTransitiveImplementationClosureComplete,
  false,
  "STRING/anum representation helpers remain to be unfolded before full inherited closure",
);
same(
  projection.coverage.stringCarrierTransitiveImplementationClosureComplete,
  false,
  "P1c does not overclaim lower STRING/anum carrier closure",
);
same(
  projection.measurement.modelRevision,
  "A9-P1c-exact-theory-unfolding",
  "measurement model revision",
);
same(
  projection.measurement.metricDeltaComparableToPreviousRevision,
  false,
  "P1b count changes are refinement, not runtime growth",
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

// P1b/P1c eliminate both coarse inherited authority aggregates. The exact
// selected-admission path is now represented as explicit derived,
// representation and resource capabilities; this is still not a claim that the
// whole package has global trust-boundary closure.
for (const removed of [
  "bootstrap.accepted-v012-authority-runtime",
  "bootstrap.exact-theory-artifact-runtime",
] as const) {
  assert(
    !projection.capabilities.some((capability: any) => capability.id === removed),
    `coarse bootstrap aggregate is removed: ${removed}`,
  );
}

for (const id of [
  "derived.dictionary-visibility",
  "derived.structural-act",
  "derived.structural-template-matching",
  "derived.structural-rule-replay",
  "derived.source-selection-replay",
  "derived.exact-theory-admission-authority",
  "derived.theory-support-projection",
  "derived.portable-theory-replay",
  "derived.canonical-link-fingerprint",
  "representation.v012-string-anum",
  "representation.portable-theory-envelope",
  "representation.storage-topology-image",
  "representation.topology-restoration",
  "representation.canonical-topology",
  "resource.memory-instance",
  "resource.link-enumeration",
] as const) {
  assert(capabilities.has(id), `P1c capability exists: ${id}`);
}

setEqual(
  projection.auditScope.inheritedAuthorityServiceFiles,
  [
    "ts/src/dictionary.ts",
    "ts/src/portable-theory.ts",
    "ts/src/source.ts",
    "ts/src/state.ts",
    "ts/src/structural-readers.ts",
    "ts/src/structural-rule.ts",
    "ts/src/v012-source.ts",
    "ts/src/v012-string-anum.ts",
  ],
  "P1b inherited authority service file inventory",
);

setEqual(
  projection.auditScope.exactTheorySelectedAdmissionPath.files,
  [
    "ts/src/portable-theory.ts",
    "ts/src/canonical-topology.ts",
    "ts/src/persistence-topology.ts",
    "ts/src/memory.ts",
  ],
  "P1c exact-Theory selected-admission file inventory",
);
same(
  projection.auditScope.exactTheorySelectedAdmissionPath.root,
  "ts/src/portable-theory.ts#verifySelectedTheoryAdmissionAuthority",
  "P1c exact-Theory selected-admission root",
);
setEqual(
  projection.auditScope.exactTheorySelectedAdmissionPath.excludedFromPath,
  [
    "ts/src/portable-theory-digest.ts#computePortableStructuralTheoryRevision",
    "ts/src/portable-proof-replay.ts#replayPortableStructuralProof",
    "ts/src/portable-proof-subanet-projection.ts#replayPortableProofSubAnetProjection",
  ],
  "unrelated portable revision/proof APIs are excluded from selected-admission trust path",
);

const portableTheorySource = read("ts/src/portable-theory.ts");
for (const requiredSymbol of [
  "verifySelectedTheoryAdmissionAuthority",
  "replayPortableStructuralTheory",
  "exportPortableStructuralTheory",
  "linkFingerprint",
  "projected",
  "includePoleClosure",
  "exportCanonicalTopology",
  "restoreTopology",
] as const) {
  assert(portableTheorySource.includes(requiredSymbol), `selected-admission chain contains ${requiredSymbol}`);
}
const selectedAdmissionStart = portableTheorySource.indexOf(
  "export function verifySelectedTheoryAdmissionAuthority",
);
const selectedAdmissionEnd = portableTheorySource.indexOf(
  "export async function verifyPortableStructuralProofTheoryRevision",
);
assert(selectedAdmissionStart >= 0 && selectedAdmissionEnd > selectedAdmissionStart,
  "selected-admission function boundary is locatable");
const selectedAdmissionTail = portableTheorySource.slice(selectedAdmissionStart, selectedAdmissionEnd);
assert(
  !selectedAdmissionTail.includes("computePortableStructuralTheoryRevision"),
  "SHA-256 Theory revision is not part of selected-admission path",
);
assert(
  !selectedAdmissionTail.includes("replayPortableStructuralProof("),
  "portable proof replay is not part of selected-admission path",
);
assert(
  !selectedAdmissionTail.includes("replayPortableProofSubAnetProjection("),
  "portable proof sub-aset projection is not part of selected-admission path",
);

for (const [path, requiredFragments] of [
  ["ts/src/canonical-topology.ts", ["memory.allLinks()", "memory.poles(", "memory.linkCount"]],
  ["ts/src/persistence-topology.ts", [
    "new Memory()",
    "memory.ensureStartSelfClosed(",
    "memory.ensureEndSelfClosed(",
    "memory.ensure(",
    "memory.linkCount",
  ]],
] as const) {
  const source = read(path);
  for (const fragment of requiredFragments) {
    assert(source.includes(fragment), `${path}: exact-Theory implementation dependency is visible: ${fragment}`);
  }
}

same(
  projection.metrics.coarseInheritedAuthorityAggregateCount,
  0,
  "coarse inherited authority aggregate count",
);
same(
  projection.metrics.unresolvedNestedBootstrapBoundaryCount,
  0,
  "selected-admission path has no remaining aggregate semantic-bootstrap boundary",
);
same(
  projection.metrics.unresolvedRepresentationBoundaryCount,
  1,
  "lower v0.12 STRING/anum representation chain remains intentionally aggregated",
);

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

// A9 P1 must remain research-only and cannot silently rewrite the accepted state.
same(contract.accepted, false, "v0.13 remains unaccepted");
same(contract.acceptanceReady, true, "existing readiness state is preserved");
same(contract.implementation.candidateRuntimeSelectable, false, "candidate remains non-selectable");
same(contract.candidateState.explicitAuthorAcceptanceRecorded, false, "author acceptance remains pending");

console.log(
  `MTS v0.13 A9 P1 semantic dependency projection: ${projection.metrics.publicSemanticEntrypointCount} public semantic entrypoints, ${projection.metrics.declaredCapabilityCount} declared capabilities, direct undocumented dependencies=0; global trust closure remains intentionally unclaimed: GREEN.`,
);
