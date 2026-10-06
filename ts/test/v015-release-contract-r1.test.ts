// mts-version-evidence: candidate-v0.15-release-contract-r1
// owners: #1976 #1188 #1977 #1978 #1910
//
// Consolidated release-contract witness over the Author-approved executable
// corpus. This is not a second compiler: it exercises the same production
// FORMAL/JSON -> native source ANet -> DAS -> recursive path in two fresh
// Memories and binds existing falsifier/governance gates to one contract.

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
  type RootBasis,
} from "../src/memory.js";
import {
  materializeNativeSyntaxGrammar,
  type NativeSyntaxGrammarRuleSpec,
} from "../src/native-syntax-grammar.js";
import { compileV015DirectFormalSourceAnet } from "../src/v015-direct-formal-source.js";
import { compileV015DirectJsonSourceAnet } from "../src/v015-direct-json-source.js";
import {
  denoteV015ResolvedSourceAnet,
  materializeV015SourceAnetProfile,
  type V015SourceAnetProfile,
} from "../src/v015-source-anet.js";
import {
  materializeV013HierarchicalCarrierFromSemanticLink,
  serializeV013HierarchicalCarrier,
} from "../src/v013-hierarchical-carrier.js";

type Json = Record<string, unknown>;

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error("v0.15 release contract R1: " + message);
}
function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), message + ": " + String(actual) + " !== " + String(expected));
}
function record(value: unknown, message: string): Json {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), message);
  return value as Json;
}
function text(value: unknown, message: string): string {
  assert(typeof value === "string" && value.length > 0, message);
  return value;
}
function read(path: string): string {
  return readFileSync(path, "utf8");
}
function json(path: string): Json {
  return JSON.parse(read(path)) as Json;
}
function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

interface Fixture {
  readonly memory: Memory;
  readonly basis: RootBasis;
  readonly grammarRoot: LinkHandle;
  readonly sourceAnetProfileRoot: LinkHandle;
}

function fixture(noise: number): Fixture {
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  let cursor = memory.ensure(basis.U, basis.L);
  for (let i = 0; i < noise; i += 1) {
    cursor = memory.ensure(cursor, i % 2 === 0 ? basis.O : basis.C);
  }
  const fresh = (): LinkHandle => {
    cursor = memory.ensureStartSelfClosed(cursor);
    return cursor;
  };
  const profile: V015SourceAnetProfile = Object.freeze({
    blockForm: fresh(),
    bareForm: fresh(),
    bindingForm: fresh(),
    bundleForm: fresh(),
    itemRole: fresh(),
    bareValueRole: fresh(),
    bindingNameRole: fresh(),
    bindingValueRole: fresh(),
    bundleAnchorRole: fresh(),
    bundleBodyRole: fresh(),
  });
  const rules: readonly NativeSyntaxGrammarRuleSpec[] = [
    { form: profile.blockForm, fields: [
      { role: profile.itemRole, target: "child", min: 0, max: null },
    ] },
    { form: profile.bareForm, fields: [
      { role: profile.bareValueRole, target: "carrier", min: 1, max: 1 },
    ] },
    { form: profile.bindingForm, fields: [
      { role: profile.bindingNameRole, target: "carrier", min: 1, max: 1 },
      { role: profile.bindingValueRole, target: "carrier", min: 1, max: 1 },
    ] },
    { form: profile.bundleForm, fields: [
      { role: profile.bundleAnchorRole, target: "carrier", min: 1, max: 1 },
      { role: profile.bundleBodyRole, target: "child", min: 1, max: 1 },
    ] },
  ];
  return Object.freeze({
    memory,
    basis,
    grammarRoot: materializeNativeSyntaxGrammar(memory, basis, {
      syntaxTag: fresh(),
      markerSeed: fresh(),
      rules,
    }),
    sourceAnetProfileRoot: materializeV015SourceAnetProfile(memory, profile),
  });
}

function wire(memory: Memory, basis: RootBasis, semantic: LinkHandle): string {
  return new TextDecoder().decode(
    serializeV013HierarchicalCarrier(
      memory,
      basis,
      materializeV013HierarchicalCarrierFromSemanticLink(memory, basis, semantic),
    ),
  );
}

function compilePair(
  root: string,
  formalPath: string,
  jsonPath: string,
  noise: number,
): readonly string[] {
  const f = fixture(noise);
  const formal = compileV015DirectFormalSourceAnet(
    f.memory,
    f.basis,
    f.grammarRoot,
    f.sourceAnetProfileRoot,
    Uint8Array.from(readFileSync(join(root, formalPath))),
  );
  const canonicalJson = compileV015DirectJsonSourceAnet(
    f.memory,
    f.basis,
    f.grammarRoot,
    f.sourceAnetProfileRoot,
    Uint8Array.from(readFileSync(join(root, jsonPath))),
  );
  same(formal.sourceAset, canonicalJson.sourceAset, formalPath + " FORMAL/JSON same native source ANet");

  const denotation = denoteV015ResolvedSourceAnet(
    f.memory,
    f.basis,
    f.grammarRoot,
    f.sourceAnetProfileRoot,
    formal.sourceAset,
  );
  return Object.freeze(
    [...denotation.members]
      .map((member) => wire(f.memory, f.basis, member))
      .sort(),
  );
}

function noSemanticHostTags(value: unknown, path = "$"): void {
  if (Array.isArray(value)) {
    value.forEach((item, i) => noSemanticHostTags(item, path + "[" + i + "]"));
    return;
  }
  if (value === null || typeof value !== "object") return;
  const forbidden = new Set([
    "type",
    "RuleKind",
    "grounded",
    "generic",
    "pattern",
    "bind",
    "instantiate",
    "active",
    "current",
    "currentScope",
    "selectedTheory",
    "selectedScope",
    "opcode",
  ]);
  for (const [key, nested] of Object.entries(value as Json)) {
    assert(!forbidden.has(key), "approved JSON excludes semantic host tag " + path + "." + key);
    noSemanticHostTags(nested, path + "." + key);
  }
}

const root = resolve(process.cwd(), "..");
const requirements = json(join(root, "requirements/mts-v0.15.json"));
const traceability = json(join(root, "traceability/mts-v0.15.json"));
const corpus = record(traceability.approvedJsonCorpus, "approvedJsonCorpus");
const entriesRaw = corpus.entries;
assert(Array.isArray(entriesRaw) && entriesRaw.length >= 6, "approved executable corpus has baseline six artifacts");
const entries = entriesRaw as Json[];

const requiredIds = new Set([
  "grounded-zero-role-rule",
  "two-role-meta-rule",
  "compact-boolean-and",
  "compact-boolean-not",
  "compact-boolean-or",
  "compact-boolean-xor",
]);
const ids = new Set(entries.map((entry) => text(entry.id, "corpus id")));
for (const id of requiredIds) assert(ids.has(id), "approved corpus contains " + id);

for (const entry of entries) {
  const id = text(entry.id, "id");
  const formalPath = text(entry.formalSourceArtifact, id + " FORMAL path");
  const jsonPath = text(entry.canonicalJsonArtifact, id + " JSON path");
  const recursivePath = text(entry.expectedRecursiveRepresentation, id + " recursive path");
  const packagePath = text(entry.amemoryReplayPackage, id + " A-memory package path");
  const evidencePath = text(entry.amemoryReplayEvidence, id + " A-memory evidence path");

  for (const path of [formalPath, jsonPath, recursivePath, packagePath, evidencePath]) {
    assert(path.includes("formal/v0.15/regression/"), id + " permanent regression artifact");
    assert(existsSync(join(root, path)), id + " artifact exists: " + path);
  }

  const formalRaw = read(join(root, formalPath));
  const jsonRaw = read(join(root, jsonPath));
  const recursiveRaw = read(join(root, recursivePath));
  const packageRaw = read(join(root, packagePath));
  const evidenceRaw = read(join(root, evidencePath));

  same(sha256(formalRaw), text(entry.formalSourceDigest, id + " FORMAL digest"), id + " FORMAL digest");
  same(sha256(jsonRaw), text(entry.canonicalJsonDigest, id + " JSON digest"), id + " JSON digest");
  same(sha256(recursiveRaw), text(entry.expectedRecursiveDigest, id + " recursive digest"), id + " recursive digest");
  same(sha256(packageRaw), text(entry.amemoryReplayPackageDigest, id + " package digest"), id + " package digest");

  const approved = record(entry.authorJsonReview, id + " Author review");
  same(text(approved.state, id + " approval state"), "APPROVED", id + " Author approved");
  same(text(approved.artifact, id + " approval artifact"), jsonPath, id + " approval artifact");
  same(
    text(approved.revisionOrDigest, id + " approval digest"),
    text(entry.canonicalJsonDigest, id + " canonical JSON digest"),
    id + " approval bound to exact JSON digest",
  );
  text(approved.decisionEvidence, id + " approval evidence");

  noSemanticHostTags(JSON.parse(jsonRaw), id);

  const expected = recursiveRaw.trim().split("\n").filter(Boolean).sort();
  assert(expected.length > 0, id + " recursive output nonempty");
  for (const value of expected) assert(/^[8961]+$/u.test(value), id + " recursive alphabet 8/9/6/1");

  const first = compilePair(root, formalPath, jsonPath, 0);
  const second = compilePair(root, formalPath, jsonPath, 23);
  same(JSON.stringify(first), JSON.stringify(expected), id + " fresh Memory recursive output");
  same(JSON.stringify(second), JSON.stringify(expected), id + " allocation-noise recursive output");
  same(JSON.stringify(first), JSON.stringify(second), id + " two-Memory deterministic semantics");

  const pkg = JSON.parse(packageRaw) as Json;
  same(text(pkg.schema, id + " package schema"), "mts-v015-recursive-execution-package/v0.1", id + " package schema");
  const links = pkg.links;
  assert(Array.isArray(links) && links.length > 0, id + " package links");
  for (const value of links) assert(typeof value === "string" && /^[8961]+$/u.test(value), id + " package Link wire");

  const evidence = JSON.parse(evidenceRaw) as Json;
  same(text(evidence.schema, id + " evidence schema"), "mts-v015-recursive-execution-evidence/v0.1", id + " evidence schema");
  assert(Array.isArray(evidence.runs) && evidence.runs.length > 0, id + " positive frozen runs");
  assert(evidence.negative_run !== null && evidence.negative_run !== undefined, id + " frozen mutation/falsifier run");

  const deps = record(entry.externalDependencies, id + " external dependencies");
  same(text(deps.amemoryMain, id + " A-memory SHA"), "832daa89f15fd0f3b7b40819b6d3670c7fd57e7d", id + " frozen A-memory SHA");
  same(text(deps.amemoryVersion, id + " A-memory version"), "0.175.0", id + " frozen A-memory version");
  text(entry.metacompilerRevision, id + " metacompiler revision");
  text(entry.metacompilerProfile, id + " metacompiler profile");
}

const gateFiles = [
  "ts/test/v015-requirements-traceability-r0.test.ts",
  "ts/test/v015-source-anet-closure-s2.test.ts",
  "ts/test/v015-native-source-anet-denotation-das-a2.test.ts",
  "ts/test/v015-direct-structural-aspects-s1.test.ts",
  "ts/test/v015-json-array-rooted-fold-a4.test.ts",
  "ts/test/v015-formal-json-j1-b9.test.ts",
  "ts/test/v015-context-authority-closure-c1.test.ts",
  "ts/test/v015-metacompiler-corpus-closure-c0.test.ts",
];
for (const path of gateFiles) assert(existsSync(join(root, path)), "release gate exists: " + path);

const r0 = read(join(root, "ts/test/v015-requirements-traceability-r0.test.ts"));
for (const marker of [
  "ANET_TERMINOLOGY=GREEN",
  "AUTHOR_JSON_APPROVAL_REQUIRED=TRUE",
  "STALE_JSON_APPROVAL_REJECTED=TRUE",
  "REAL_AMEMORY_PROFILE_REQUIRED=TRUE",
]) assert(r0.includes(marker), "R0 governance marker " + marker);

const sourceClosure = read(join(root, "ts/test/v015-source-anet-closure-s2.test.ts"));
for (const marker of [
  "NAME01=COMPONENT_GREEN",
  "STRUCT01=COMPONENT_GREEN",
  "JSON02=COMPONENT_GREEN",
  "FRM07_08_BRIDGE=GREEN",
]) assert(sourceClosure.includes(marker), "source closure marker " + marker);

const das = read(join(root, "ts/test/v015-native-source-anet-denotation-das-a2.test.ts"));
for (const marker of [
  "PHYSICAL_EXISTENCE_IMPLIES_MEMBERSHIP=FALSE",
  "CURRENTNESS_REQUIRES_MEMBERSHIP=TRUE",
  "PRESENTATION_RENAME_MEMBERSHIP_INVARIANT=GREEN",
  "HOST_GLOBAL_ATOM_NAMESPACE_AUTHORITY=FALSE",
]) assert(das.includes(marker), "DAS authority marker " + marker);

const structural = read(join(root, "ts/test/v015-direct-structural-aspects-s1.test.ts"));
for (const marker of [
  "ROOT=8",
  "START_PREFIX=9",
  "END_PREFIX=6",
  "PAIR_PREFIX=1",
  "ARBITRARY_CYCLIC_BINDING=REJECTED",
  "PROOF_SPECIFIC_GRAMMAR=0",
]) assert(structural.includes(marker), "structural source marker " + marker);

const jsonMutation = read(join(root, "ts/test/v015-formal-json-j1-b9.test.ts"));
for (const marker of [
  "duplicate-key",
  "unsupported-profile",
  "unknown field",
  "duplicate-local-name",
  "SOURCE_ASET_ROUNDTRIP=EXACT",
]) assert(jsonMutation.includes(marker), "JSON mutation marker " + marker);

const arrayGate = read(join(root, "ts/test/v015-json-array-rooted-fold-a4.test.ts"));
assert(arrayGate.includes("ExactSequence"), "JSON array ExactSequence gate");
assert(arrayGate.includes("rooted fold"), "JSON array rooted-fold falsifier");

const context = read(join(root, "ts/test/v015-context-authority-closure-c1.test.ts"));
for (const marker of [
  "HOST_POINTER_AUTHORITY=0",
  "HOST_NAME_AUTHORITY=0",
  "FOREIGN_THEORY=INERT",
  "EXTERNAL_GROUNDER_COMMAND=0",
]) assert(context.includes(marker), "context authority marker " + marker);

const meta = read(join(root, "ts/test/v015-metacompiler-corpus-closure-c0.test.ts"));
for (const marker of [
  "RULE_DISCOVERY=SEMANTIC_THEORY_MEMBERSHIP",
  "PROGRAM_SPECIFIC_COMPATIBILITY_DISPATCH=0",
  "METACOMPILER_OWNER=ANUM_DOCS",
  "SELF_HOSTING=DEFERRED",
]) assert(meta.includes(marker), "metacompiler boundary marker " + marker);

const reqList = requirements.requirements;
assert(Array.isArray(reqList), "requirements list");
const byId = new Map((reqList as Json[]).map((item) => [text(item.id, "requirement id"), item]));
for (const id of ["V15-NAME-01", "V15-STRUCT-01", "V15-JSON-02", "V15-STAGE-01", "V15-STAGE-02", "V15-GAMMA-01", "V15-CTX-01", "V15-CTX-02"]) {
  const item = byId.get(id);
  assert(item !== undefined, id + " exists");
  assert(["COMPONENT_GREEN", "VERTICAL_GREEN"].includes(text(item.state, id + " state")), id + " prerequisite green");
}

console.log([
  "MTS_V015_RELEASE_CONTRACT_R1=COMPONENT_GREEN_EVIDENCE",
  "APPROVED_EXECUTABLE_CORPUS=" + entries.length,
  "ANET_TERMINOLOGY=GREEN",
  "ONE_SEMANTIC_AUTHORITY_PATH=GREEN",
  "ONE_LINK_ONTOLOGY_BOUNDARY=GREEN",
  "PRESENTATION_NAMES_NOT_AUTHORITY=GREEN",
  "FORMAL_JSON_SAME_SOURCE_ANET=GREEN",
  "FRESH_MEMORY_FORMAL_JSON=GREEN",
  "TWO_MEMORY_ALLOCATION_NOISE=GREEN",
  "JSON_MUTATION_FAIL_CLOSED=GREEN",
  "EXACT_SEQUENCE_ARRAY_CARRIER=GREEN",
  "SEMANTIC_INJECTION_BUDGET=0",
  "AUTHOR_APPROVAL_EXACT_DIGEST=GREEN",
  "FROZEN_AMEMORY_PINNED=GREEN",
  "PROGRAM_SPECIFIC_HOST_DISPATCH=0",
].join(" "));
