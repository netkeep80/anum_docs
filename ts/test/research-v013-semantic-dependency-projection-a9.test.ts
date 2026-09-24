import { readFileSync, readdirSync, statSync } from "node:fs";
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

function fnv1a64(items: readonly string[]): string {
  let hash = 14695981039346656037n;
  const prime = 1099511628211n;
  const mask = (1n << 64n) - 1n;
  const source = items.join("\n");
  for (let index = 0; index < source.length; index += 1) {
    hash ^= BigInt(source.charCodeAt(index));
    hash = (hash * prime) & mask;
  }
  return hash.toString(16).padStart(16, "0");
}

const repoRoot = resolve(process.cwd(), "..");
const read = (path: string): string => readFileSync(join(repoRoot, path), "utf8");
const readJson = (path: string): any => JSON.parse(read(path));

// P1 audit source; this file is external verification and is never imported by runtime.
const projectionPath = "traceability/mts-v0.13-semantic-dependency-projection.json";
const projection = readJson(projectionPath);
const contract = readJson("contracts/mts-contract-v0.13.json");

same(projection.schema, "mts-semantic-dependency-projection/v0.8", "projection schema");
same(projection.mtsVersion, "0.13", "projection MTS version");
same(projection.status, "research", "projection remains research evidence");
same(projection.externalAuditProjectionOnly, true, "projection is external audit tooling");
same(projection.normativeFoundation, false, "projection is not MTS foundation");
same(projection.semanticAuthority, false, "projection grants no semantic authority");
same(projection.executionDependency, false, "MTS execution does not depend on projection");
same(projection.ownerIssue, 1270, "projection is owned by #1270");
same(
  projection.candidateMain,
  "3c6883d2eb7496e398c33a5413c22571e719f2a7",
  "projection binds the exact post-P1g-a candidate snapshot",
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
  true,
  "P1d closes the actual inherited authority execution chain",
);
same(
  projection.coverage.stringCarrierTransitiveImplementationClosureComplete,
  true,
  "P1d closes the poles-only STRING authority reader path",
);
same(
  projection.measurement.modelRevision,
  "A9-P1g-b-proof-runtime-trust-audit",
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

// Static direct-dependency observation over the declared candidate-kernel files.
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
  0,
  "actual STRING authority read path has no remaining aggregate representation boundary",
);

same(
  projection.auditScope.stringAuthorityReadPath.root,
  "ts/src/v012-string-anum.ts#readV012StringAnum",
  "P1d STRING authority read root",
);
setEqual(
  projection.auditScope.stringAuthorityReadPath.files,
  [
    "ts/src/v012-string-anum.ts",
    "ts/src/memory.ts",
  ],
  "P1d STRING authority read file inventory",
);
setEqual(
  projection.auditScope.stringAuthorityReadPath.excludedFromPath,
  [
    "ts/src/byte-carrier.ts",
    "ts/src/quaternary-anum.ts",
    "ts/src/quaternary-state.ts",
    "ts/src/anum.ts",
  ],
  "producer/general codec modules are excluded from selected STRING authority read path",
);

const stringSource = read("ts/src/v012-string-anum.ts");
const stringReadStart = stringSource.indexOf("export function readV012StringAnum");
const stringReadEnd = stringSource.indexOf("export function materializeV012StringByteAnum");
assert(stringReadStart >= 0 && stringReadEnd > stringReadStart,
  "STRING read-only authority slice is locatable");
const stringReadSlice = stringSource.slice(0, stringReadEnd);
for (const requiredFragment of [
  "verifyRootBasis(",
  "memory.poles(",
  "readVerifiedV012StringByteAnum(",
  "value === basis.U",
  "value === basis.L",
] as const) {
  assert(stringReadSlice.includes(requiredFragment),
    `STRING authority reader uses expected structural dependency: ${requiredFragment}`);
}
for (const forbiddenFragment of [
  "byteToQuaternaryBits(",
  "encodeBytesToQuaternary(",
  "decodeBytesFromQuaternary(",
  "materializeQuaternaryAnum(",
  "serializeMaterializedQuaternaryAnum(",
  "memory.find(",
  "memory.ensure(",
  "memory.ensureStartSelfClosed(",
  "memory.ensureEndSelfClosed(",
] as const) {
  assert(!stringReadSlice.includes(forbiddenFragment),
    `STRING authority reader excludes producer/general codec dependency: ${forbiddenFragment}`);
}

// P1e independently discovers every direct Memory write sink in ts/src.
// It does not trust auditScope.candidateKernelFiles or any manually maintained
// source inventory. New direct write owners must be explicitly classified.
const writeMethods = new Set([
  "ensureRoot",
  "ensureStartSelfClosed",
  "ensureEndSelfClosed",
  "ensure",
]);

function tsSourceFiles(directory: string): readonly string[] {
  const result: string[] = [];
  for (const name of readdirSync(join(repoRoot, directory))) {
    const relative = join(directory, name).replaceAll("\\", "/");
    const absolute = join(repoRoot, relative);
    const stat = statSync(absolute);
    if (stat.isDirectory()) {
      result.push(...tsSourceFiles(relative));
    } else if (
      stat.isFile() &&
      relative.endsWith(".ts") &&
      !relative.endsWith(".d.ts")
    ) {
      result.push(relative);
    }
  }
  return result.sort();
}

interface WriteSink {
  readonly file: string;
  readonly owner: string;
  readonly method: string;
}

function memberName(name: ts.PropertyName | undefined): string | undefined {
  if (name === undefined) return undefined;
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  return undefined;
}

function discoverDirectWriteSinks(sourcePath: string): readonly WriteSink[] {
  const source = ts.createSourceFile(
    sourcePath,
    read(sourcePath),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const result: WriteSink[] = [];

  const visit = (node: ts.Node, owner: string): void => {
    let nestedOwner = owner;

    if (ts.isFunctionDeclaration(node) && node.name !== undefined) {
      nestedOwner = node.name.text;
    } else if (ts.isMethodDeclaration(node)) {
      const method = memberName(node.name) ?? "<computed-method>";
      const parent = node.parent;
      const className =
        ts.isClassDeclaration(parent) && parent.name !== undefined
          ? parent.name.text
          : "<class>";
      nestedOwner = `${className}.${method}`;
    } else if (ts.isConstructorDeclaration(node)) {
      const parent = node.parent;
      const className =
        ts.isClassDeclaration(parent) && parent.name !== undefined
          ? parent.name.text
          : "<class>";
      nestedOwner = `${className}.constructor`;
    } else if (
      (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) &&
      ts.isVariableDeclaration(node.parent) &&
      ts.isIdentifier(node.parent.name)
    ) {
      nestedOwner = node.parent.name.text;
    }

    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      writeMethods.has(node.expression.name.text)
    ) {
      result.push(Object.freeze({
        file: sourcePath,
        owner: nestedOwner,
        method: node.expression.name.text,
      }));
    }

    ts.forEachChild(node, (child) => visit(child, nestedOwner));
  };

  visit(source, "<module>");
  return result;
}

const observedDirectWriteSinks = tsSourceFiles("ts/src")
  .flatMap(discoverDirectWriteSinks)
  .sort((left, right) =>
    left.file.localeCompare(right.file) ||
    left.owner.localeCompare(right.owner) ||
    left.method.localeCompare(right.method)
  );

const observedDirectWriteOwners = [...new Set(
  observedDirectWriteSinks.map((sink) => `${sink.file}#${sink.owner}`),
)].sort();

if (projection.packageDirectSemanticWriteAudit === undefined) {
  console.log(
    "A9 P1e observed direct semantic write owners:\n" +
    observedDirectWriteOwners.join("\n"),
  );
  throw new Error(
    "v0.13 A9 semantic dependency projection: packageDirectSemanticWriteAudit is not yet declared",
  );
}

setEqual(
  observedDirectWriteOwners,
  projection.packageDirectSemanticWriteAudit.owners.map((entry: any) => entry.id),
  "package-wide direct semantic write owners",
);

const allowedWriteOwnerCategories = [
  "bootstrap-foundation-materialization",
  "authority-evidence-producer",
  "proof-derivation-producer",
  "representation-materialization",
  "authorized-semantic-target-materialization",
  "tooling",
] as const;
const observedWriteCategoryCounts: Record<string, number> = {};

for (const entry of projection.packageDirectSemanticWriteAudit.owners as any[]) {
  assert(
    allowedWriteOwnerCategories.includes(entry.category),
    `${entry.id}: write owner category is from the closed classification`,
  );
  observedWriteCategoryCounts[entry.category] =
    (observedWriteCategoryCounts[entry.category] ?? 0) + 1;
  assert(typeof entry.category === "string" && entry.category.length > 0,
    `${entry.id}: write owner category is declared`);
  assert(typeof entry.reason === "string" && entry.reason.length > 0,
    `${entry.id}: write owner reason is declared`);
  if (entry.capabilityId !== null) {
    assert(capabilities.has(entry.capabilityId),
      `${entry.id}: write owner capability resolves`);
  }
}

same(
  projection.packageDirectSemanticWriteAudit.scanRoot,
  "ts/src",
  "package-wide direct write scan root",
);
setEqual(
  projection.packageDirectSemanticWriteAudit.methods,
  [...writeMethods],
  "direct write sink method set",
);
same(
  projection.metrics.directSemanticWriteOwnerCount,
  observedDirectWriteOwners.length,
  "direct semantic write owner count",
);
same(
  projection.metrics.unclassifiedDirectSemanticWriteOwnerCount,
  0,
  "all direct semantic write owners are classified",
);
same(
  JSON.stringify(projection.metrics.directSemanticWriteOwnersByCategory),
  JSON.stringify(observedWriteCategoryCounts),
  "direct semantic write category counts",
);
same(
  projection.coverage.packageDirectSemanticWriteAuditComplete,
  true,
  "package-wide direct semantic write audit is complete",
);
same(
  projection.coverage.packageInterpretationEntrypointAuditComplete,
  true,
  "P1f closes the declared static interpretation/decision candidate audit",
);
same(
  projection.coverage.globalTrustBoundaryComplete,
  false,
  "write-sink audit alone does not establish global trust closure",
);

// P1f independently discovers S3 package-wide typed ReadMemory access and
// host-owned decision candidates. Unlike P1e's deliberately syntax-only write
// inventory, this pass resolves the called/read member to declarations in
// memory.ts so unrelated methods with the same spelling are excluded.
const sourcePaths = tsSourceFiles("ts/src");
const typedProgram = ts.createProgram({
  rootNames: sourcePaths.map((path) => join(repoRoot, path)),
  options: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    strict: true,
    skipLibCheck: true,
  },
});
const typeChecker = typedProgram.getTypeChecker();
const memorySourceSuffix = "/ts/src/memory.ts";
const readMemoryMembers = new Set([
  "root",
  "linkCount",
  "poles",
  "find",
  "outgoing",
  "incoming",
  "issuanceIndex",
  "allLinks",
]);
const writeMemoryMembers = new Set([
  "ensureRoot",
  "ensureStartSelfClosed",
  "ensureEndSelfClosed",
  "ensure",
]);

interface TypedReadSite {
  readonly file: string;
  readonly owner: string;
  readonly member: string;
}

interface DecisionCandidate {
  readonly file: string;
  readonly owner: string;
  readonly signals: readonly string[];
}

function declarationIsMemoryMemberFrom(
  symbol: ts.Symbol | undefined,
  member: string,
  members: ReadonlySet<string>,
): boolean {
  if (symbol === undefined || !members.has(member)) return false;
  return (symbol.getDeclarations() ?? []).some((declaration) => {
    const file = declaration.getSourceFile().fileName.replaceAll("\\", "/");
    return file.endsWith(memorySourceSuffix) || file.endsWith("ts/src/memory.ts");
  });
}

function declarationIsMemoryMember(symbol: ts.Symbol | undefined, member: string): boolean {
  return declarationIsMemoryMemberFrom(symbol, member, readMemoryMembers);
}

function nodeOwner(node: ts.Node): string {
  let current: ts.Node | undefined = node;
  while (current !== undefined) {
    if (ts.isFunctionDeclaration(current) && current.name !== undefined) {
      return current.name.text;
    }
    if (ts.isMethodDeclaration(current)) {
      const method = memberName(current.name) ?? "<computed-method>";
      const parent = current.parent;
      const className =
        ts.isClassDeclaration(parent) && parent.name !== undefined
          ? parent.name.text
          : "<class>";
      return `${className}.${method}`;
    }
    if (ts.isConstructorDeclaration(current)) {
      const parent = current.parent;
      const className =
        ts.isClassDeclaration(parent) && parent.name !== undefined
          ? parent.name.text
          : "<class>";
      return `${className}.constructor`;
    }
    if (
      (ts.isArrowFunction(current) || ts.isFunctionExpression(current)) &&
      ts.isVariableDeclaration(current.parent) &&
      ts.isIdentifier(current.parent.name)
    ) {
      return current.parent.name.text;
    }
    current = current.parent;
  }
  return "<module>";
}

function containsLinkHandle(node: ts.Node): boolean {
  let found = false;
  const visit = (child: ts.Node): void => {
    if (found) return;
    if (ts.isIdentifier(child) || ts.isPropertyAccessExpression(child)) {
      const type = typeChecker.getTypeAtLocation(child);
      const text = typeChecker.typeToString(type);
      if (/\bLinkHandle\b/.test(text)) {
        found = true;
        return;
      }
    }
    ts.forEachChild(child, visit);
  };
  visit(node);
  return found;
}

function containsTypedMemoryRead(node: ts.Node): boolean {
  let found = false;
  const visit = (child: ts.Node): void => {
    if (found) return;
    if (ts.isPropertyAccessExpression(child)) {
      const member = child.name.text;
      const symbol = typeChecker.getSymbolAtLocation(child.name);
      if (declarationIsMemoryMember(symbol, member)) {
        found = true;
        return;
      }
    }
    ts.forEachChild(child, visit);
  };
  visit(node);
  return found;
}

const semanticTagNames = new Set([
  "kind",
  "type",
  "role",
  "mode",
  "operator",
  "aspect",
  "tag",
  "opcode",
  "classification",
  "sourceKind",
]);

function isHostLiteral(node: ts.Node): boolean {
  return (
    ts.isStringLiteral(node) ||
    ts.isNumericLiteral(node) ||
    node.kind === ts.SyntaxKind.TrueKeyword ||
    node.kind === ts.SyntaxKind.FalseKeyword ||
    node.kind === ts.SyntaxKind.NullKeyword
  );
}

function containsSemanticTag(node: ts.Node): boolean {
  let found = false;
  const visit = (child: ts.Node): void => {
    if (found) return;
    if (
      ts.isPropertyAccessExpression(child) &&
      semanticTagNames.has(child.name.text)
    ) {
      found = true;
      return;
    }
    ts.forEachChild(child, visit);
  };
  visit(node);
  return found;
}

function containsAmbientMutable(node: ts.Node): boolean {
  let found = false;
  const visit = (child: ts.Node): void => {
    if (found) return;
    if (ts.isIdentifier(child)) {
      const symbol = typeChecker.getSymbolAtLocation(child);
      for (const declaration of symbol?.getDeclarations() ?? []) {
        if (!ts.isVariableDeclaration(declaration)) continue;
        const list = declaration.parent;
        if (!ts.isVariableDeclarationList(list)) continue;
        if ((list.flags & ts.NodeFlags.Const) !== 0) continue;
        const statement = list.parent;
        if (ts.isVariableStatement(statement) && ts.isSourceFile(statement.parent)) {
          found = true;
          return;
        }
      }
    }
    ts.forEachChild(child, visit);
  };
  visit(node);
  return found;
}

function hasLiteralCase(node: ts.SwitchStatement): boolean {
  return node.caseBlock.clauses.some(
    (clause) => ts.isCaseClause(clause) && isHostLiteral(clause.expression),
  );
}

const typedReadSites: TypedReadSite[] = [];
const typedWriteSites: TypedReadSite[] = [];
const decisionSignalsByOwner = new Map<string, Set<string>>();

for (const sourcePath of sourcePaths) {
  const source = typedProgram.getSourceFile(join(repoRoot, sourcePath));
  assert(source !== undefined, `typed source is available: ${sourcePath}`);

  const addDecision = (node: ts.Node, signal: string): void => {
    const owner = `${sourcePath}#${nodeOwner(node)}`;
    let signals = decisionSignalsByOwner.get(owner);
    if (signals === undefined) {
      signals = new Set<string>();
      decisionSignalsByOwner.set(owner, signals);
    }
    signals.add(signal);
  };

  const visit = (node: ts.Node): void => {
    if (ts.isPropertyAccessExpression(node)) {
      const member = node.name.text;
      const symbol = typeChecker.getSymbolAtLocation(node.name);
      if (declarationIsMemoryMember(symbol, member)) {
        typedReadSites.push(Object.freeze({
          file: sourcePath,
          owner: nodeOwner(node),
          member,
        }));
      }
      if (declarationIsMemoryMemberFrom(symbol, member, writeMemoryMembers)) {
        typedWriteSites.push(Object.freeze({
          file: sourcePath,
          owner: nodeOwner(node),
          member,
        }));
      }
    }

    if (ts.isIfStatement(node)) {
      if (containsLinkHandle(node.expression)) addDecision(node, "if-link");
      if (containsTypedMemoryRead(node.expression)) addDecision(node, "if-memory-read");
      if (containsSemanticTag(node.expression)) addDecision(node, "host-tag-decision");
      if (containsAmbientMutable(node.expression)) addDecision(node, "ambient-mutable-decision");
    } else if (ts.isConditionalExpression(node)) {
      if (containsLinkHandle(node.condition)) addDecision(node, "ternary-link");
      if (containsTypedMemoryRead(node.condition)) addDecision(node, "ternary-memory-read");
      if (containsSemanticTag(node.condition)) addDecision(node, "host-tag-decision");
      if (containsAmbientMutable(node.condition)) addDecision(node, "ambient-mutable-decision");
    } else if (ts.isSwitchStatement(node)) {
      if (containsLinkHandle(node.expression)) addDecision(node, "switch-link");
      if (containsTypedMemoryRead(node.expression)) addDecision(node, "switch-memory-read");
      if (containsSemanticTag(node.expression)) addDecision(node, "host-tag-decision");
      if (hasLiteralCase(node)) addDecision(node, "literal-switch");
      if (containsAmbientMutable(node.expression)) addDecision(node, "ambient-mutable-decision");
    } else if (
      ts.isBinaryExpression(node) &&
      [
        ts.SyntaxKind.EqualsEqualsEqualsToken,
        ts.SyntaxKind.ExclamationEqualsEqualsToken,
        ts.SyntaxKind.EqualsEqualsToken,
        ts.SyntaxKind.ExclamationEqualsToken,
      ].includes(node.operatorToken.kind)
    ) {
      if (containsLinkHandle(node)) addDecision(node, "link-equality");
      if (containsTypedMemoryRead(node)) addDecision(node, "memory-read-equality");
      if (containsSemanticTag(node)) addDecision(node, "host-tag-decision");
      if (isHostLiteral(node.left) || isHostLiteral(node.right)) {
        addDecision(node, "literal-equality");
      }
      const literal = ts.isStringLiteral(node.left)
        ? node.left.text
        : ts.isStringLiteral(node.right)
          ? node.right.text
          : null;
      if (literal !== null && /^[8961]{2,}$/.test(literal)) {
        addDecision(node, "wire-literal-dispatch");
      }
      if (containsAmbientMutable(node)) addDecision(node, "ambient-mutable-decision");
    } else if (
      ts.isElementAccessExpression(node) &&
      node.argumentExpression !== undefined &&
      ts.isNumericLiteral(node.argumentExpression)
    ) {
      addDecision(node, "fixed-coordinate-index");
    } else if (ts.isCallExpression(node)) {
      if (
        ts.isPropertyAccessExpression(node.expression) &&
        ["includes", "has", "get"].includes(node.expression.name.text) &&
        node.arguments.some(isHostLiteral)
      ) {
        addDecision(node, "literal-membership");
      }
      if (ts.isIdentifier(node.expression)) {
        const symbol = typeChecker.getSymbolAtLocation(node.expression);
        const parameterOwned = (symbol?.getDeclarations() ?? []).some(ts.isParameter);
        if (
          parameterOwned &&
          typeChecker.getTypeAtLocation(node.expression).getCallSignatures().length > 0
        ) {
          addDecision(node, "host-callback-call");
        }
      }
    }

    ts.forEachChild(node, visit);
  };
  visit(source);
}

const typedReadOwners = [...new Set(
  typedReadSites.map((site) => `${site.file}#${site.owner}`),
)].sort();
const typedWriteOwners = [...new Set(
  typedWriteSites.map((site) => `${site.file}#${site.owner}`),
)].sort();

const typedReadMemberCounts = Object.fromEntries(
  [...readMemoryMembers].sort().map((member) => [
    member,
    typedReadSites.filter((site) => site.member === member).length,
  ]),
);

const decisionCandidates: readonly DecisionCandidate[] = [...decisionSignalsByOwner.entries()]
  .map(([id, signals]) => {
    const split = id.lastIndexOf("#");
    return Object.freeze({
      file: id.slice(0, split),
      owner: id.slice(split + 1),
      signals: Object.freeze([...signals].sort()),
    });
  })
  .sort((left, right) =>
    left.file.localeCompare(right.file) || left.owner.localeCompare(right.owner)
  );

const decisionAudit = projection.packageSemanticDecisionAudit;
assert(decisionAudit !== undefined, "P1f semantic decision audit is declared");

const decisionSignatures = decisionCandidates.map(
  (entry) => `${entry.file}#${entry.owner} [${entry.signals.join(",")}]`,
);
const observedDecisionCountsByFile: Record<string, number> = {};
const observedDecisionSignalCounts: Record<string, number> = {};
const observedDecisionCountsByCategory: Record<string, number> = {};

for (const entry of decisionCandidates) {
  observedDecisionCountsByFile[entry.file] =
    (observedDecisionCountsByFile[entry.file] ?? 0) + 1;
  const category = decisionAudit.fileCategoryByFile[entry.file];
  assert(typeof category === "string" && category.length > 0,
    `P1f decision file is classified: ${entry.file}`);
  observedDecisionCountsByCategory[category] =
    (observedDecisionCountsByCategory[category] ?? 0) + 1;
  for (const signal of entry.signals) {
    observedDecisionSignalCounts[signal] =
      (observedDecisionSignalCounts[signal] ?? 0) + 1;
  }
}
for (const signal of Object.keys(decisionAudit.decisionSignalCounts)) {
  observedDecisionSignalCounts[signal] ??= 0;
}

same(decisionAudit.scope, "S3", "P1f uses whole-package audit scope");
same(projection.measurement.scope, "S3", "measurement revision declares S3 scope");
same(
  projection.measurementScopes.S0.id,
  "foundation-bootstrap-only",
  "S0 is reserved for minimal-foundation claims",
);
same(
  projection.measurementScopes.S3.id,
  "whole-ts-src-package",
  "S3 identifies whole-package audit counts",
);
same(decisionAudit.typedReadSiteCount, typedReadSites.length, "typed ReadMemory site count");
same(decisionAudit.typedReadOwnerCount, typedReadOwners.length, "typed ReadMemory owner count");
same(
  decisionAudit.typedReadOwnerFingerprintFNV64,
  fnv1a64(typedReadOwners),
  "typed ReadMemory owner fingerprint",
);
same(
  JSON.stringify(decisionAudit.typedReadMemberCounts),
  JSON.stringify(typedReadMemberCounts),
  "typed ReadMemory member counts",
);
same(
  decisionAudit.decisionCandidateOwnerCount,
  decisionCandidates.length,
  "static semantic decision candidate owner count",
);
same(
  decisionAudit.decisionCandidateFingerprintFNV64,
  fnv1a64(decisionSignatures),
  "static semantic decision candidate fingerprint",
);
same(
  JSON.stringify(decisionAudit.decisionOwnerCountsByFile),
  JSON.stringify(Object.fromEntries(Object.entries(observedDecisionCountsByFile).sort())),
  "decision owner counts by file",
);
same(
  JSON.stringify(decisionAudit.decisionSignalCounts),
  JSON.stringify(Object.fromEntries(Object.entries(observedDecisionSignalCounts).sort())),
  "decision signal counts",
);
same(
  JSON.stringify(decisionAudit.decisionOwnerCountsByCategory),
  JSON.stringify(Object.fromEntries(Object.entries(observedDecisionCountsByCategory).sort())),
  "decision owner counts by category",
);
same(
  decisionAudit.unclassifiedDecisionCandidateOwnerCount,
  0,
  "all static decision candidate files are classified",
);
same(
  decisionAudit.staticInterpretationCandidateBoundaryCovered,
  true,
  "static interpretation candidate boundary is covered",
);
same(
  decisionAudit.runtimePathCoverageComplete,
  false,
  "P1f does not claim runtime path closure",
);

setEqual(
  typedWriteOwners,
  projection.packageDirectSemanticWriteAudit.owners.map((entry: any) => entry.id),
  "P1f typed Memory write owner set matches P1e syntax inventory",
);
same(
  projection.packageDirectSemanticWriteAudit.typedOwnerSetCrossCheckedByP1f,
  true,
  "P1e owner set has a typed P1f cross-check",
);
same(
  projection.packageDirectSemanticWriteAudit.physicalMutationBoundaryProven,
  false,
  "static direct-call evidence still does not prove the complete physical mutation boundary",
);

same(projection.metrics.typedReadMemorySiteCount, typedReadSites.length, "metric: typed read sites");
same(projection.metrics.typedReadMemoryOwnerCount, typedReadOwners.length, "metric: typed read owners");
same(
  projection.metrics.typedDirectSemanticWriteOwnerCount,
  typedWriteOwners.length,
  "metric: typed direct Memory write owners",
);
same(
  projection.metrics.staticSemanticDecisionCandidateOwnerCount,
  decisionCandidates.length,
  "metric: static decision candidate owners",
);
same(
  projection.metrics.unclassifiedStaticDecisionCandidateOwnerCount,
  0,
  "metric: unclassified static decision candidates",
);
same(
  JSON.stringify(projection.metrics.staticDecisionOwnersByCategory),
  JSON.stringify(Object.fromEntries(Object.entries(observedDecisionCountsByCategory).sort())),
  "metric: decision owners by category",
);
same(
  projection.metrics.packageWideExactWireLiteralDispatchCount,
  observedDecisionSignalCounts["wire-literal-dispatch"] ?? 0,
  "metric: exact wire literal dispatch",
);
same(
  projection.metrics.packageWideObjectSpecificHostSemanticCount,
  null,
  "object-specific semantic-equivalence count remains unmeasured until P1g/elimination",
);
same(
  projection.coverage.packageStaticSemanticDecisionAuditComplete,
  true,
  "P1f static semantic decision audit complete",
);
same(
  projection.coverage.packageTypedMemoryReadAuditComplete,
  true,
  "P1f typed Memory read audit complete",
);
same(
  projection.coverage.packageTypedMemoryWriteCrossCheckComplete,
  true,
  "P1f typed Memory write cross-check complete",
);
same(
  projection.coverage.globalTrustBoundaryComplete,
  false,
  "P1f static closure does not overclaim global runtime trust closure",
);
same(
  projection.metrics.globalUndocumentedSemanticPathCount,
  null,
  "runtime undocumented semantic path count remains unmeasured",
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
same(
  projection.metrics.hostLinkDuplicationCandidateCount,
  semanticCapabilities.filter((capability: any) => capability.hostLinkDuplication === true).length,
  "host/Link duplication candidate count",
);
same(
  projection.metrics.confirmedHostLinkEquivalentDuplicationCount,
  null,
  "confirmed host/Link equivalent duplication remains unmeasured",
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

// A9 remains research-only and does not broaden the accepted v0.13 claim. Global trust/minimality remains post-acceptance research.
same(contract.accepted, true, "v0.13 is accepted while A9 remains research-only");
same(contract.acceptanceReady, true, "ready state is restored while A9 global gaps remain research-only");
same(contract.implementation.candidateRuntimeSelectable, false, "candidate remains non-selectable");
same(contract.candidateState.explicitAuthorAcceptanceRecorded, true, "author acceptance is recorded");

console.log(
  `MTS v0.13 A9 P1f: ${typedReadOwners.length} typed ReadMemory owners / ${typedReadSites.length} sites, ${decisionCandidates.length} static host-decision candidates, ${typedWriteOwners.length} typed direct Memory write owners; S3 static audit complete, runtime trust closure remains intentionally unclaimed: GREEN.`,
);
