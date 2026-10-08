import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
} from "../memory.js";
import {
  materializeNativeSyntaxGrammar,
  type NativeSyntaxGrammarRuleSpec,
} from "../native-syntax-grammar.js";
import { compileV015DirectFormalSourceAnet } from "../v015-direct-formal-source.js";
import { compileV015DirectJsonSourceAnet } from "../v015-direct-json-source.js";
import { materializeV015ContextualNamePath } from "../v015-link-definition.js";
import {
  denoteV015ResolvedSourceAnet,
  materializeV015SourceAnetProfile,
  type V015SourceAnetProfile,
} from "../v015-source-anet.js";
import { materializeV012StringAnum } from "../v012-string-anum.js";
import { findRepositoryRoot } from "./docs-sync.js";

/**
 * Intentionally BOUNDED native attestation of already researched B20 source
 * shapes. This is not a generic FORMAL interpreter, theorem prover, nor an
 * approval of any new Author-gated logical JSON.
 *
 * Unsupported specimens MUST fail closed until an independently tested native
 * adapter with accepted denotation exists.
 */
export interface V015NativeEvidenceRequest {
  readonly id: string;
  readonly role: string;
  readonly source: string;
  readonly formalSourceSha256: string;
  readonly expectedSemanticAnetSha256: string;
  readonly stages: readonly string[];
}

export interface V015NativeEvidenceReceipt {
  readonly profile: "mts-v015-native-evidence/v0.1";
  readonly outcome: "PASS";
  readonly caseId: string;
  readonly formalSourceSha256: string;
  readonly semanticAnetSha256: string;
  readonly runnerSourceSha256: string;
}

const B20_STAGES = ["grammar", "denotation", "semanticLinks", "jsonParity"] as const;
const encoder = new TextEncoder();
const sourceSpec = Object.freeze({
  "{ A }": {
    formal: "{ A }",
    json: "{\"A\":null}",
    role: "BARE_DECLARATION",
    members: ["R:A"],
  },
  "A:{}": {
    formal: "{ A : {} }",
    json: "{\"A\":{}}",
    role: "EMPTY_NAMED_BUNDLE",
    members: [],
  },
} as const);

type SupportedB20Source = keyof typeof sourceSpec;

function fail(reason: string): never {
  throw new Error("v015-native-evidence-verifier: " + reason);
}

function assertNative(condition: boolean, reason: string): void {
  if (!condition) fail(reason);
}

function requireSupportedSource(source: string): SupportedB20Source {
  if (!Object.prototype.hasOwnProperty.call(sourceSpec, source))
    fail("unsupported FORMAL source shape; native B20 adapter is deliberately bounded");
  return source as SupportedB20Source;
}

function rootFixture() {
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  let cursor = memory.ensure(basis.U, basis.L);
  const fresh = (): LinkHandle => {
    cursor = memory.ensureStartSelfClosed(cursor);
    return cursor;
  };
  const profile: V015SourceAnetProfile = Object.freeze({
    blockForm: fresh(), bareForm: fresh(), bindingForm: fresh(),
    bundleForm: fresh(), itemRole: fresh(), bareValueRole: fresh(),
    bindingNameRole: fresh(), bindingValueRole: fresh(), bundleAnchorRole: fresh(),
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
  const grammarRoot = materializeNativeSyntaxGrammar(memory, basis, {
    syntaxTag: fresh(), markerSeed: fresh(), rules,
  });
  const profileRoot = materializeV015SourceAnetProfile(memory, profile);
  return { memory, basis, grammarRoot, profileRoot };
}

function sameMembers(actual: ReadonlySet<LinkHandle>, other: ReadonlySet<LinkHandle>): boolean {
  return actual.size === other.size && [...actual].every((item) => other.has(item));
}

/**
 * Derives a stable SHA-256 over a B20-specific canonical *semantic identity
 * witness*. A Link handle number is deliberately not used as the digest.
 * Both physical source ANets and extensional semantic members are compared
 * before the digest is emitted. This does not generalize to arbitrary ANets.
 */
export function deriveV015BoundedAnetDigest(source: string): string {
  const key = requireSupportedSource(source);
  const spec = sourceSpec[key];
  const { memory, basis, grammarRoot, profileRoot } = rootFixture();
  const formal = compileV015DirectFormalSourceAnet(
    memory, basis, grammarRoot, profileRoot, encoder.encode(spec.formal),
  );
  const json = compileV015DirectJsonSourceAnet(
    memory, basis, grammarRoot, profileRoot, encoder.encode(spec.json),
  );
  assertNative(formal.sourceAset === json.sourceAset,
    "accepted FORMAL/JSON must produce Link-identical native source ANet");
  const formalDenotation = denoteV015ResolvedSourceAnet(
    memory, basis, grammarRoot, profileRoot, formal.sourceAset,
  );
  const jsonDenotation = denoteV015ResolvedSourceAnet(
    memory, basis, grammarRoot, profileRoot, json.sourceAset,
  );
  assertNative(sameMembers(formalDenotation.members, jsonDenotation.members),
    "native FORMAL/JSON extensional semantic members differ");

  const observed = formalDenotation.members;
  if (key === "{ A }") {
    const carrier = materializeV012StringAnum(
      memory, basis, encoder.encode("A"),
    ).anumLink;
    const expected = materializeV015ContextualNamePath(
      memory, basis, basis.R, [carrier], true,
    );
    assertNative(observed.size === 1 && observed.has(expected),
      "bare A must denote the Link-identified member R:A");
  } else {
    assertNative(observed.size === 0,
      "empty named bundle must contribute zero root semantic members");
    // The empty named bundle and the bare member must have distinct
    // native source identities even when the name carrier is the same.
    const bare = compileV015DirectFormalSourceAnet(
      memory, basis, grammarRoot, profileRoot, encoder.encode("{ A }"),
    );
    assertNative(bare.sourceAset !== formal.sourceAset,
      "B20 empty bundle must not collapse to bare declaration");
  }

  const canonicalIdentity = JSON.stringify({
    schema: "mts-v015-b20-semantic-anet-identity/v0.1",
    acceptedVersion: "v0.15",
    sourceLiteral: key,
    nativeRole: spec.role,
    extensionalMembers: spec.members,
    nativeFormalJsonSourceAsetEquality: true,
    nativeFormalJsonDenotationEquality: true,
  });
  return createHash("sha256").update(canonicalIdentity, "utf8").digest("hex");
}

export function verifyV015NativeEvidence(
  input: V015NativeEvidenceRequest,
): V015NativeEvidenceReceipt {
  assertNative(typeof input.id === "string" && /^F[0-9]{4}$/.test(input.id),
    "invalid source-occurrence ID");
  assertNative(input.role === "FORMAL_V015_NOTATION_SPECIMEN",
    "unsupported role; theorem/metamodel must not use B20 source semantics");
  assertNative(typeof input.source === "string", "missing FORMAL source");
  assertNative(typeof input.formalSourceSha256 === "string" &&
    /^[0-9a-f]{64}$/.test(input.formalSourceSha256),
  "invalid source digest");
  assertNative(createHash("sha256").update(input.source, "utf8").digest("hex") ===
    input.formalSourceSha256, "source SHA-256 does not match exact occurrence");
  assertNative(Array.isArray(input.stages) &&
    input.stages.length === B20_STAGES.length &&
    input.stages.every((stage, index) => stage === B20_STAGES[index]),
  "unsupported evidence stages; replay/theorem mapping must not be guessed");

  const derived = deriveV015BoundedAnetDigest(input.source);
  assertNative(typeof input.expectedSemanticAnetSha256 === "string" &&
    /^[0-9a-f]{64}$/.test(input.expectedSemanticAnetSha256) &&
    derived === input.expectedSemanticAnetSha256,
  "claimed semantic ANet identity differs from native compiler/denotation");
  const runner = readFileSync(resolve(
    findRepositoryRoot(), "ts/src/tooling/v015-native-evidence-verifier.ts",
  ), "utf8");
  return Object.freeze({
    profile: "mts-v015-native-evidence/v0.1",
    outcome: "PASS",
    caseId: input.id,
    formalSourceSha256: input.formalSourceSha256,
    semanticAnetSha256: derived,
    runnerSourceSha256: createHash("sha256").update(runner, "utf8").digest("hex"),
  });
}

const invokedPath = process.argv[1] === undefined ? undefined : resolve(process.argv[1]);
if (invokedPath === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv[2] !== "--verify-stdin") fail("use --verify-stdin");
    const raw = JSON.parse(readFileSync(0, "utf8")) as V015NativeEvidenceRequest;
    const receipt = verifyV015NativeEvidence(raw);
    process.stdout.write(JSON.stringify(receipt) + "\n");
  } catch (error) {
    process.stderr.write(String(error) + "\n");
    process.exitCode = 1;
  }
}
