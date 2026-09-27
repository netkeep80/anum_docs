// mts-version-evidence: candidate-from=0.14
// research-owner: #1669

import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { Memory, ensureRootBasis } from "../src/memory.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error("v0.14 N20 requirement projection: " + message);
}
function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), message + ": values differ");
}
function sameSet(actual: readonly string[], expected: readonly string[], message: string): void {
  const a=[...new Set(actual)].sort();
  const e=[...new Set(expected)].sort();
  same(JSON.stringify(a), JSON.stringify(e), message);
  same(a.length, actual.length, message + " actual duplicates");
  same(e.length, expected.length, message + " expected duplicates");
}

const repoRoot=resolve(process.cwd(),"..");
const readJson=(path:string):any=>JSON.parse(readFileSync(join(repoRoot,path),"utf8"));
const contract=readJson("contracts/mts-contract-v0.14.json");
const trace=readJson("traceability/mts-v0.14.json");
const registry=readJson("requirements/mts-v0.14.json");

// A mandatory semantic projection gate must still execute against the real
// kernel. The registry is metadata over these semantics, not a paper-only
// replacement for them.
const memory = new Memory();
const basis = ensureRootBasis(memory);
assert(basis.R !== basis.O && basis.O !== basis.C, "live kernel RootBasis remains proper");
same(memory.ensure(basis.O, basis.C), basis.L, "live kernel L remains canonical");
same(memory.ensure(basis.C, basis.O), basis.U, "live kernel U remains canonical");

same(registry.schema,"mts-requirement-registry/v0.2","registry schema");
same(registry.status,"candidate","registry remains pre-acceptance");
same(registry.contract,"mts-contract/v0.14","registry contract");
same(registry.semanticSource.path,"contracts/mts-contract-v0.14.json","semantic source");
same(registry.semanticSource.pointer,"/requiredSemanticLaws","semantic pointer");
same(contract.documentationProjectionRegistry,"requirements/mts-v0.14.json","contract projection pointer");
same(trace.documentationProjectionRegistry,"requirements/mts-v0.14.json","traceability projection pointer");

const lawIds=Object.keys(contract.requiredSemanticLaws).sort();
const reqIds=registry.requirements.map((x:any)=>x.id).sort();
sameSet(reqIds,lawIds,"every v0.14 law has exactly one projection record");
same(lawIds.length,14,"v0.14 law count after N20");

const ownerKeys=new Set<string>();
for(const requirement of registry.requirements){
  same(requirement.status,"candidate",requirement.id+" candidate projection status");
  same(requirement.authority.document,"contracts/mts-contract-v0.14.json",requirement.id+" authority document");
  same(requirement.authority.pointer,"/requiredSemanticLaws/"+requirement.id,requirement.id+" authority pointer");
  assert(typeof requirement.classification.path==="string" && requirement.classification.path.includes("/"),requirement.id+" hierarchical classification");
  assert(typeof requirement.docProjection.path==="string",requirement.id+" doc path");
  assert(typeof requirement.docProjection.anchor==="string",requirement.id+" doc anchor");
  assert(existsSync(join(repoRoot,requirement.docProjection.path)),requirement.id+" owner document exists");
  const key=requirement.docProjection.path+"#"+requirement.docProjection.anchor;
  assert(!ownerKeys.has(key),requirement.id+" duplicate owner anchor");
  ownerKeys.add(key);

  const invariant=trace.invariants[requirement.id];
  assert(invariant!==undefined,requirement.id+" traceability invariant");
  same(invariant.documentationOwner.registry,"requirements/mts-v0.14.json",requirement.id+" owner registry");
  same(invariant.documentationOwner.path,requirement.docProjection.path,requirement.id+" owner path");
  same(invariant.documentationOwner.anchor,requirement.docProjection.anchor,requirement.id+" owner anchor");
}

for(const [path,descriptor] of Object.entries(registry.documentSurface) as [string,any][]){
  assert(existsSync(join(repoRoot,path)),path+" document surface exists");
  assert(descriptor.mode!=="generated",path+" is not whole-file generated pre-reconstruction");
}

same(
  trace.documentationOwnerProjection,
  "PREDECLARED_IN_REQUIREMENTS_MTS_V0_14_PROSE_DEFERRED_TO_1585",
  "owner map ready while prose remains deferred",
);
same(contract.candidateState.documentationOwnershipMapComplete,true,"documentation ownership map complete");
same(contract.candidateState.documentationComplete,false,"prose reconstruction remains post-acceptance");
same(contract.acceptanceBoundary.documentationReconstructionUnblocked,false,"#1585 remains blocked before acceptance");

console.log([
  "MTS v0.14 N20: REQUIREMENT_PROJECTION_READINESS=GREEN",
  "LAW_COUNT=14",
  "ONE_CANONICAL_OWNER_PER_LAW=TRUE",
  "OWNER_DOCUMENTS_EXIST=TRUE",
  "WHOLE_FILE_GENERATED_PRE_REWRITE=FALSE",
  "PROSE_RECONSTRUCTION=DEFERRED_TO_1585",
].join(" "));
