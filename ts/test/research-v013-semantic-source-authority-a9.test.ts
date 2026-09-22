import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import * as ts from "typescript";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.13 E2 semantic-source audit: ${message}`);
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
const projection = JSON.parse(
  read("traceability/mts-v0.13-semantic-dependency-projection.json"),
) as any;
const contract = JSON.parse(read("contracts/mts-contract-v0.13.json")) as any;

const audit = projection.semanticSourceAuthorityAudit;
assert(audit !== undefined, "E2 audit is declared");
same(audit.status, "inventory-complete-reconstruction-falsifier-pending", "E2 audit status");
same(audit.boundaryClass, "E2-semantic-source-kernel-generation-authority", "E2 boundary class");
same(audit.countUnit, "semantic-law-family", "E2 count unit");
same(projection.coverage.semanticSourceAuthorityInventoryComplete, true, "E2 inventory complete");
same(projection.coverage.semanticSourceReconstructionProven, false, "E2 reconstruction not yet proven");

const classifications = [
  "HOST_DEFINED",
  "LINK_REPRESENTED_ONLY",
  "LINK_VALIDATED",
  "LINK_INTERPRETED",
  "LINK_EXECUTED",
  "LINK_RECONSTRUCTED",
] as const;
setEqual(audit.classificationScale, classifications, "E2 classification scale");

const expectedFamilies = [
  "root-basis-topology-law",
  "structural-template-matching-law",
  "structural-rule-replay-law",
  "structural-unification-law",
  "structural-substitution-law",
  "structural-derivation-replay-law",
  "recursive-link-identity-proof-law",
  "rooted-proof-aset-replay-law",
  "source-result-coupling-law",
  "root-aspect-decomposition-law",
  "relative-unary-form-law",
  "relative-pole-context-law",
  "authorized-unary-materialization-law",
  "authorized-binary-materialization-law",
  "authorized-relative-pole-source-law",
  "relative-pole-transition-law",
  "formal-operator-grounding-law",
  "formal-prefix-composition-law",
  "formal-plan-materialization-law",
] as const;

setEqual(
  audit.authorityFamilies.map((family: any) => family.id),
  expectedFamilies,
  "exact E2 semantic-law family inventory",
);
same(audit.authorityFamilies.length, 19, "E2 semantic-law family count");
same(projection.metrics.hostSemanticSourceDefinitionCount, 19, "metric: host semantic source definition count");

const familyIds = new Set<string>();
const ownerIds = new Set<string>();
const observedCounts = Object.fromEntries(classifications.map((classification) => [classification, 0]));

function topLevelFunctionNames(path: string): ReadonlySet<string> {
  const source = ts.createSourceFile(
    path,
    read(path),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const result = new Set<string>();
  for (const statement of source.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name !== undefined) {
      result.add(statement.name.text);
    }
  }
  return result;
}

const functionsByPath = new Map<string, ReadonlySet<string>>();

for (const family of audit.authorityFamilies as any[]) {
  assert(!familyIds.has(family.id), `duplicate E2 family id: ${family.id}`);
  familyIds.add(family.id);
  assert(classifications.includes(family.currentClassification), `${family.id}: known classification`);
  observedCounts[family.currentClassification] += 1;
  assert(
    typeof family.linkEvidence === "string" && family.linkEvidence.length > 0,
    `${family.id}: Link-evidence boundary is explained`,
  );
  assert(Array.isArray(family.owners) && family.owners.length > 0, `${family.id}: has source owner`);

  for (const owner of family.owners as string[]) {
    assert(!ownerIds.has(owner), `source owner is counted by only one semantic-law family: ${owner}`);
    ownerIds.add(owner);
    const split = owner.lastIndexOf("#");
    assert(split > 0 && split < owner.length - 1, `owner uses path#symbol form: ${owner}`);
    const path = owner.slice(0, split);
    const symbol = owner.slice(split + 1);
    let functions = functionsByPath.get(path);
    if (functions === undefined) {
      functions = topLevelFunctionNames(path);
      functionsByPath.set(path, functions);
    }
    assert(functions.has(symbol), `${family.id}: declared owner exists: ${owner}`);
  }
}

same(
  JSON.stringify(observedCounts),
  JSON.stringify(audit.classificationCounts),
  "E2 classification counts are derived from exact inventory",
);
same(observedCounts.HOST_DEFINED, 19, "all current E2 laws remain host-defined");
for (const classification of classifications.slice(1)) {
  same(observedCounts[classification], 0, `no unproven E2 maturity upgrade: ${classification}`);
}

const allOwners = [...ownerIds];
for (const excluded of audit.representationOnlyExclusions as string[]) {
  assert(!allOwners.includes(excluded), `representation-only helper is excluded from E2 source count: ${excluded}`);
}

same(
  projection.metrics.selfGeneratedOrReconstructedSemanticArtifactCount,
  null,
  "semantic artifact reconstruction count remains unmeasured until removal falsifier",
);
same(
  projection.metrics.externallyGeneratedSemanticArtifactCount,
  null,
  "external semantic artifact count remains unmeasured until common artifact scope",
);
same(
  projection.metrics.hostFormationAdmissibilityAuthorityCount,
  null,
  "E3 remains intentionally unmeasured",
);
same(
  projection.metrics.hostOrchestrationAuthorityCount,
  null,
  "E4 remains intentionally unmeasured",
);

const falsifier = audit.kernelSourceRemovalFalsifier;
same(falsifier.id, "E2-F1-root-aspect-source-removal", "first E2 falsifier id");
same(falsifier.targetAuthority, "root-aspect-decomposition-law", "first E2 falsifier target");
same(falsifier.status, "DESIGNED_NOT_EXECUTED", "first E2 falsifier is not pre-claimed green");
same(falsifier.currentResult, "NOT_RUN", "first E2 falsifier has no invented result");
assert(
  (falsifier.failConditions as string[]).some((condition) =>
    condition.includes("re-encodes the same self-incidence-to-aspect switch")
  ),
  "equivalent host reimplementation is an explicit E2 failure",
);
assert(
  (falsifier.passConditions as string[]).some((condition) =>
    condition.includes("two independent Memories")
  ),
  "two-Memory portability is required for E2 reconstruction",
);
assert(
  (falsifier.passConditions as string[]).some((condition) =>
    condition.includes("frozen verifier/generator authority remains unchanged")
  ),
  "candidate cannot rewrite E2 verifier/generator authority",
);

same(projection.coverage.globalTrustBoundaryComplete, false, "global trust closure remains false");
same(contract.accepted, false, "v0.13 remains unaccepted");
same(contract.acceptanceReady, false, "v0.13 readiness remains reopened");
same(contract.implementation.candidateRuntimeSelectable, false, "candidate runtime remains non-selectable");

console.log(
  `MTS v0.13 E2 P2: E2_SOURCE_AUTHORITY_INVENTORY_GREEN families=${audit.authorityFamilies.length} hostDefined=${observedCounts.HOST_DEFINED} reconstructed=0 falsifier=${falsifier.currentResult} fullSelfHosted=false`,
);
