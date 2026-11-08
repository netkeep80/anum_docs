// Project-scoped ownership witnesses. This is a consumer of native RepoGuard
// Requirements, not a second Requirement authority or a new semantic MTS model.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { parseDocument } from "yaml";

const OWNER_IDS = [
  "MTS-PROJECT-CI-01",
  "MTS-PROJECT-PACKAGE-01",
  "MTS-PROJECT-PROOF-PROVENANCE-01",
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
  readonly proofEvidenceRecords: number;
  readonly compiledProofSourceUnits: number;
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
  const declaredExports = sorted([...packageOwner.entries()]
    .filter(([path, predicate]) => path.startsWith("ts/src/") &&
      path !== "ts/src/public.ts" && predicate === "implemented_by")
    .map(([path]) => path));
  equalPaths(declaredExports, exportedPaths, "public API implemented_by");
  const unexpectedPackageSource = [...packageOwner.entries()]
    .filter(([path, predicate]) => path.startsWith("ts/src/") &&
      path !== "ts/src/public.ts" && predicate !== "implemented_by");
  if (unexpectedPackageSource.length) fail("public source misclassified as non-implementation");

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

  assertRelation("MTS-PROJECT-CI-01", "ts/src/tooling/test-tier.ts", "implemented_by");
  assertRelation("MTS-PROJECT-CI-01", "ts/test/test-tier.test.ts", "verified_by");
  return Object.freeze({
    candidates: OWNER_IDS.length,
    exactRelations,
    publicExportModules: exportedPaths.length,
    proofEvidenceRecords: evidencePaths.length,
    compiledProofSourceUnits: compiledProofPaths.length,
  });
}
