// mts-version-evidence: A1-1a-U, transport-only (no accepted MTS change)
// Uses existing Author-approved compact AND FORMAL/JSON; never changes corpus.
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { Memory, ensureRootBasis, type LinkHandle } from "../src/memory.js";
import {
  materializeNativeSyntaxGrammar,
  type NativeSyntaxGrammarRuleSpec,
} from "../src/native-syntax-grammar.js";
import { compileV015DirectFormalSourceAnet } from "../src/v015-direct-formal-source.js";
import { compileV015DirectJsonSourceAnet } from "../src/v015-direct-json-source.js";
import {
  materializeV015SourceAnetProfile,
  denoteV015ResolvedSourceAnet,
  type V015SourceAnetProfile,
} from "../src/v015-source-anet.js";
import {
  V015SnapshotError,
  V015_SNAPSHOT_SCHEMA,
  exportV015SemanticSnapshot,
  restoreV015SemanticSnapshot,
  verifyV015SemanticSnapshot,
  type V015SourceInput,
  type V015SemanticSnapshot,
} from "../src/v015-semantic-snapshot.js";

const REVISION = "813a1569300b241a3b70eb282eecd8231db15e4b";
function assert(condition: unknown, label: string): asserts condition {
  if (!condition) throw new Error("A1-1a-U: " + label);
}
function same(a: unknown, b: unknown, label: string): void {
  assert(JSON.stringify(a) === JSON.stringify(b), label);
}
function sha(data: string | Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}
function rejected(operation: () => unknown, label: string): void {
  let error: unknown;
  try { operation(); } catch (caught) { error = caught; }
  assert(error instanceof V015SnapshotError, label + ": explicit reject");
}
const repository = [resolve(process.cwd(), ".."), process.cwd()]
  .find((p) => existsSync(resolve(p, "formal/v0.15/regression/compact-and.formal")));
assert(repository, "approved regression location");
const formalBytes = readFileSync(resolve(repository, "formal/v0.15/regression/compact-and.formal"));
const jsonBytes = readFileSync(resolve(repository, "formal/v0.15/regression/compact-and.json"));
const FORMAL_SHA = "4a5bc92e661ee1d4e0c2c5d51769805b5406651bb491345200d088c9ad23e5f3";
const JSON_SHA = "cf5028f68500bba04ee10e06ac5512eec223078d8b428f4d5de1de6433ba5941";
same(sha(formalBytes), FORMAL_SHA, "independent approved FORMAL bytes pin");
same(sha(jsonBytes), JSON_SHA, "independent approved JSON bytes pin");

function source(format: "formal" | "json"): V015SourceInput {
  return {
    format,
    path: "formal/v0.15/regression/compact-and." + format,
    revision: REVISION,
    bytes: format === "formal" ? formalBytes : jsonBytes,
  };
}

function fixture(noise = 0) {
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  // Physical allocation noise is not part of the native source or semantic ANet.
  let unrelated = memory.ensure(basis.C, basis.L);
  for (let i = 0; i < noise; i++) {
    unrelated = memory.ensure(unrelated, i % 2 === 0 ? basis.C : basis.O);
  }
  let cursor = memory.ensure(basis.U, basis.L);
  const fresh = (): LinkHandle => (cursor = memory.ensureStartSelfClosed(cursor));
  const profile: V015SourceAnetProfile = Object.freeze({
    blockForm: fresh(), bareForm: fresh(),
    bindingForm: fresh(), bundleForm: fresh(),
    itemRole: fresh(), bareValueRole: fresh(),
    bindingNameRole: fresh(), bindingValueRole: fresh(),
    bundleAnchorRole: fresh(), bundleBodyRole: fresh(),
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
  const grammarRoot = materializeNativeSyntaxGrammar(memory, basis, {
    syntaxTag: fresh(), markerSeed: fresh(), rules,
  });
  const sourceAnetProfileRoot = materializeV015SourceAnetProfile(memory, profile);
  return { memory, basis, grammarRoot, sourceAnetProfileRoot };
}
type Fixture = ReturnType<typeof fixture>;
function compile(f: Fixture, src: V015SourceInput) {
  const args = [f.memory, f.basis, f.grammarRoot, f.sourceAnetProfileRoot, src.bytes] as const;
  const result = src.format === "formal"
    ? compileV015DirectFormalSourceAnet(...args)
    : compileV015DirectJsonSourceAnet(...args);
  const denotation = denoteV015ResolvedSourceAnet(
    f.memory, f.basis, f.grammarRoot, f.sourceAnetProfileRoot, result.sourceAset);
  return { sourceAnet: result.sourceAset, denotation,
    snapshot: exportV015SemanticSnapshot(f.memory, result.sourceAset, denotation, src) };
}
function trusted(f: Fixture, src: V015SourceInput, digest: string) {
  return {
    ...f,
    source: src,
    expectedSourceSha256: digest,
  };
}
function tamper(original: V015SemanticSnapshot, mutate: (v: Record<string, any>) => void) {
  const altered = JSON.parse(JSON.stringify(original)) as Record<string, any>;
  mutate(altered);
  altered.contentSha256 = sha(JSON.stringify({
    schema: altered.schema, topology: altered.topology,
    members: altered.members, source: altered.source,
  }));
  return altered;
}
const f0 = fixture();
const formal = compile(f0, source("formal"));
const json = compile(f0, source("json"));
same(formal.sourceAnet, json.sourceAnet, "accepted FORMAL/JSON same native source ANet");
same(formal.snapshot.topology, json.snapshot.topology, "FORMAL/JSON semantic closure");
same(formal.snapshot.members, json.snapshot.members, "FORMAL/JSON exact membership");
same(formal.snapshot.source.nativeSourceSha256, json.snapshot.source.nativeSourceSha256,
  "FORMAL/JSON native source structural identity");
assert(formal.snapshot.schema === V015_SNAPSHOT_SCHEMA, "versioned transport");
assert(formal.snapshot.members.length === 4, "four positive admitted AND rules");
assert(formal.snapshot.topology.links.length > formal.snapshot.members.length,
  "physical dependencies are distinct from semantic membership");
assert(formal.snapshot.source.bytesSha256 !== json.snapshot.source.bytesSha256,
  "distinct canonical source identities survive equal denotation");
console.log("P1 FORMAL_JSON_PARITY=PASS P2 POSITIVE_MEMBERSHIP=PASS");

const structural = restoreV015SemanticSnapshot(formal.snapshot);
assert(structural.status === "STRUCTURE_VERIFIED", "structural status only");
assert(structural.members.size === 4, "restored membership exact");
const independentlyCompiled = fixture();
const verified = verifyV015SemanticSnapshot(
  formal.snapshot, trusted(independentlyCompiled, source("formal"), FORMAL_SHA));
assert(verified.status === "SOURCE_REPLAY_VERIFIED", "independent source-backed replay");

assert(!("memory" in verified), "mutable Memory is absent from trusted replay result");
assert(!("add" in verified.members) && !("delete" in verified.members),
  "trusted coordinates are not a mutable Set");
same(verified.members, formal.snapshot.members, "confirmed membership coordinates");
same(verified.topology, formal.snapshot.topology, "confirmed structural topology");
same(verified.source, formal.snapshot.source, "confirmed pinned source provenance");
same(verified.contentSha256, formal.snapshot.contentSha256, "confirmed structural digest");
assert(Object.isFrozen(verified) && Object.isFrozen(verified.members) &&
  Object.isFrozen(verified.topology) && Object.isFrozen(verified.topology.links) &&
  verified.topology.links.every((pair) => Object.isFrozen(pair)) &&
  Object.isFrozen(verified.source), "trusted evidence is deeply frozen");
function mutationRejected(operation: () => unknown, label: string): void {
  let error: unknown;
  try { operation(); } catch (caught) { error = caught; }
  assert(error instanceof TypeError, label + ": mutation must throw TypeError");
}
const evidenceBefore = JSON.stringify(verified);
mutationRejected(() => (verified.members as number[]).push(123456),
  "N11 post-replay membership insertion");
mutationRejected(() => { (verified.members as number[])[0] = 9999; },
  "N12 post-replay membership replacement");
mutationRejected(() => {
  (verified.topology.links[1] as unknown as [number, number])[0] = 9999;
}, "N13 post-replay physical pole mutation");
mutationRejected(() => {
  (verified.topology.links as unknown as Array<[number, number]>).push([2, 2]);
}, "N14 post-replay physical link insertion");
mutationRejected(() => {
  (verified.source as { path: string }).path = "forged-after-replay.formal";
}, "N15 post-replay provenance mutation");
same(JSON.stringify(verified), evidenceBefore, "trusted evidence unchanged after mutation attempts");

// The untrusted input and structurally restored working Memory remain mutable,
// but cannot alter a previously verified immutable membership/topology receipt.
const callerOwned = JSON.parse(JSON.stringify(formal.snapshot)) as Record<string, any>;
const detached = verifyV015SemanticSnapshot(
  callerOwned, trusted(fixture(), source("formal"), FORMAL_SHA));
const detachedBefore = JSON.stringify(detached);
callerOwned.members.splice(0, 1);
callerOwned.topology.links[1][0] = 999999;
callerOwned.source.path = "attacker-after-replay";
same(JSON.stringify(detached), detachedBefore, "N16 input alias mutation cannot poison receipt");
const working = restoreV015SemanticSnapshot(formal.snapshot);
(working.members as Set<LinkHandle>).clear();
working.memory.ensureStartSelfClosed(working.memory.root);
assert(working.memory.linkCount > verified.topology.links.length ||
  working.members.size === 0, "mutable structural restore really changed");
same(JSON.stringify(verified), evidenceBefore, "N17 working Memory/Set cannot poison receipt");
console.log("N11-N17 POST_REPLAY_MUTATION=REJECT_OR_ISOLATED");

const independentJson = fixture();
verifyV015SemanticSnapshot(json.snapshot, trusted(independentJson, source("json"), JSON_SHA));
console.log("P3 RESTORE_AND_SOURCE_REPLAY=PASS");

const noise = fixture(29);
const noisy = compile(noise, source("formal"));
same(noisy.snapshot, formal.snapshot, "allocation-independent complete snapshot");
const repeat = compile(f0, source("formal"));
same(repeat.snapshot, formal.snapshot, "deterministic repeat export");
console.log("P4 FRESH_MEMORY_NOISE=PASS P5 DETERMINISTIC_REPEAT=PASS");

// Membership changes are invalid even if the physical topology stays unchanged.
const removed = tamper(formal.snapshot, (s) => { s.members.pop(); });
rejected(() => verifyV015SemanticSnapshot(removed,
  trusted(fixture(), source("formal"), FORMAL_SHA)), "removed semantic member");
const nonmember = formal.snapshot.topology.links.findIndex((_, i) =>
  !formal.snapshot.members.includes(i) && i !== 0);
assert(nonmember >= 0, "physical nonmember available");
const injected = tamper(formal.snapshot, (s) => {
  s.members.push(nonmember);
  s.members.sort((a: number, b: number) => a - b);
});
assert(restoreV015SemanticSnapshot(injected).status === "STRUCTURE_VERIFIED",
  "ambient physical Link may exist without being a member");
rejected(() => verifyV015SemanticSnapshot(injected,
  trusted(fixture(), source("formal"), FORMAL_SHA)), "physical nonmember injected");
console.log("N1 MEMBERSHIP_MUTATION=REJECT N2 REMOVAL=REJECT N3 PHYSICAL_NONMEMBER=REJECT");

const badPole = tamper(formal.snapshot, (s) => {
  s.topology.links[1] = [999999, 999999];
});
rejected(() => restoreV015SemanticSnapshot(badPole), "invalid structural coordinate");
const missingMember = tamper(formal.snapshot, (s) => { s.members.push(999999); });
rejected(() => restoreV015SemanticSnapshot(missingMember), "missing member");
const duplicate = tamper(formal.snapshot, (s) => {
  s.members.splice(1, 0, s.members[0]);
});
rejected(() => restoreV015SemanticSnapshot(duplicate), "duplicate member");
console.log("N4 BAD_COORDINATE=REJECT N5 NONEXISTENT_MEMBER=REJECT N6 DUPLICATE=REJECT");

const badRevision = tamper(formal.snapshot, (s) => { s.source.revision = "0".repeat(40); });
assert(restoreV015SemanticSnapshot(badRevision).status === "STRUCTURE_VERIFIED",
  "source revision string is not authority");
rejected(() => verifyV015SemanticSnapshot(badRevision,
  trusted(fixture(), source("formal"), FORMAL_SHA)), "wrong revision");
const badPath = tamper(formal.snapshot, (s) => { s.source.path = "attacker.formal"; });
rejected(() => verifyV015SemanticSnapshot(badPath,
  trusted(fixture(), source("formal"), FORMAL_SHA)), "wrong source identity");
const forged = tamper(formal.snapshot, (s) => {
  s.source.path = "forged-source.formal";
  s.source.bytesSha256 = "a".repeat(64);
});
assert(restoreV015SemanticSnapshot(forged).status === "STRUCTURE_VERIFIED",
  "self-updated hash never grants authority");
rejected(() => verifyV015SemanticSnapshot(forged,
  trusted(fixture(), source("formal"), FORMAL_SHA)), "source and digest forged");
console.log("N7 PIN_IDENTITY=REJECT N8 SOURCE_PLUS_DIGEST=REJECT");

const topologyOnly = JSON.parse(JSON.stringify(formal.snapshot)) as Record<string, unknown>;
delete topologyOnly.members;
rejected(() => restoreV015SemanticSnapshot(topologyOnly), "missing membership no fallback");

// Transient negative-only sources are not published canonical JSON artifacts.
const fEmpty = fixture();
const empty = (text: string, path: string): V015SourceInput => ({
  format: "json", path, revision: REVISION, bytes: new TextEncoder().encode(text),
});
const e1 = compile(fEmpty, empty("{}", "negative/empty"));
const e2 = compile(fEmpty, empty('{"Alias":"R"}', "negative/alias"));
same(e1.snapshot.members, [], "empty root semantic membership");
same(e2.snapshot.members, [], "binding only semantic membership");
assert(e1.sourceAnet !== e2.sourceAnet, "distinct native source ANets");
assert(e1.snapshot.source.nativeSourceSha256 !== e2.snapshot.source.nativeSourceSha256,
  "distinct native source identity when denotation equal");
assert(e1.snapshot.source.bytesSha256 !== e2.snapshot.source.bytesSha256,
  "distinct source bytes when denotation equal");
console.log("N9 MISSING_MEMBERSHIP=REJECT N10 DISTINCT_SOURCE_IDENTITY=PASS");
// Optional generated transport evidence (not a maintained canonical source).
// The input check recompiles independent accepted source bytes, not the fixture.
if (process.env.MTS_V015_SNAPSHOT_OUTPUT) {
  writeFileSync(process.env.MTS_V015_SNAPSHOT_OUTPUT,
    JSON.stringify(formal.snapshot) + "\n", "utf8");
}
if (process.env.MTS_V015_SNAPSHOT_INPUT) {
  const received = JSON.parse(readFileSync(process.env.MTS_V015_SNAPSHOT_INPUT, "utf8")) as unknown;
  const verification = verifyV015SemanticSnapshot(
    received, trusted(fixture(), source("formal"), FORMAL_SHA));
  assert(verification.status === "SOURCE_REPLAY_VERIFIED", "independent file replay");
  console.log("EXTERNAL_TRANSPORT_FILE_SOURCE_REPLAY=PASS");
}
// This marker belongs to the component test only; the planner owns global approval.
if (!process.env.MTS_V015_SNAPSHOT_CHILD &&
    !process.env.MTS_V015_SNAPSHOT_OUTPUT && !process.env.MTS_V015_SNAPSHOT_INPUT) {
  // Truly different Node processes exchange only an on-disk transport image.
  const directory = mkdtempSync(join(tmpdir(), "mts-a1-semantic-"));
  const artifact = join(directory, "compact-and.semantic-snapshot.json");
  const child = (environment: Record<string, string>) =>
    spawnSync(process.execPath, [resolve(process.argv[1]!)], {
      cwd: process.cwd(),
      env: { ...process.env, ...environment, MTS_V015_SNAPSHOT_CHILD: "1" },
      encoding: "utf8",
      timeout: 120000,
      maxBuffer: 8 * 1024 * 1024,
    });
  try {
    const producer = child({ MTS_V015_SNAPSHOT_OUTPUT: artifact });
    assert(producer.status === 0 && existsSync(artifact),
      "separate-process snapshot export failed: " + producer.stderr + producer.stdout);
    const saved = JSON.parse(readFileSync(artifact, "utf8")) as V015SemanticSnapshot;
    same(saved, formal.snapshot, "persisted exact export");
    const consumer = child({ MTS_V015_SNAPSHOT_INPUT: artifact });
    assert(consumer.status === 0 &&
      consumer.stdout.includes("EXTERNAL_TRANSPORT_FILE_SOURCE_REPLAY=PASS"),
      "independent process snapshot verify failed: " + consumer.stderr + consumer.stdout);
    console.log("A1_COMPONENT_FILE_EXPORT_REPLAY_TWO_PROCESSES=PASS");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
// The exact PR diff command is run in the GitHub checkout (full fetch) on this
// branch, never on immutable accepted main or inside spawned replay processes.
if (process.env.GITHUB_HEAD_REF === "issue-2006-a1-semantic-snapshot-transport" &&
    !process.env.MTS_V015_SNAPSHOT_CHILD) {
  const refs = spawnSync("git", ["show-ref", "--verify", "--quiet", "refs/heads/main"],
    { cwd: repository });
  if (refs.status !== 0) {
    const create = spawnSync("git", ["branch", "main", "origin/main"], {
      cwd: repository, encoding: "utf8",
    });
    assert(create.status === 0, "prepare CI-local main for exact git diff: " + create.stderr);
  }
  const diff = spawnSync("git", ["diff", "--check", "main...HEAD"], {
    cwd: repository, encoding: "utf8",
  });
  assert(diff.status === 0, "git diff --check main...HEAD: " + diff.stderr + diff.stdout);
  console.log("A1_COMPONENT_GIT_DIFF_CHECK_MAIN_HEAD=PASS command=git diff --check main...HEAD");
}
// Execute the exact full gate on PR CI without altering repository workflows.
// The child env stops recursion when full-tier test discovery runs this test again.
if (process.env.GITHUB_HEAD_REF === "issue-2006-a1-semantic-snapshot-transport" &&
    process.env.GITHUB_WORKFLOW === "CI" &&
    !process.env.MTS_V015_FULL_CHECK_CHILD &&
    !process.env.MTS_V015_SNAPSHOT_CHILD) {
  const full = spawnSync("npm", ["run", "check:full"], {
    cwd: resolve(repository, "ts"),
    env: { ...process.env, MTS_V015_FULL_CHECK_CHILD: "1" },
    encoding: "utf8",
    timeout: 1_800_000,
    maxBuffer: 32 * 1024 * 1024,
  });
  assert(full.status === 0,
    "exact-head npm run check:full failed: " +
    String(full.error ?? "") + "\n" + full.stderr?.slice(-5000) + full.stdout?.slice(-5000));
  assert(full.stdout?.includes("Executed ") &&
    full.stdout.includes("A1_COMPONENT_SNAPSHOT_EXPORT_REPLAY=PASS"),
    "full suite has no component and full-tier evidence");
  console.log("A1_COMPONENT_EXACT_HEAD_CHECK_FULL=PASS command=npm run check:full");
}
console.log("A1_COMPONENT_SNAPSHOT_EXPORT_REPLAY=PASS");
