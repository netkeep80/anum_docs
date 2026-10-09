import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
  type RootBasis,
} from "../memory.js";
import {
  materializeNativeSyntaxGrammar,
  type NativeSyntaxGrammarRuleSpec,
} from "../native-syntax-grammar.js";
import { materializeSourceNamespaceProfile } from "../source-namespace.js";
import { materializeV015LinkDefinitionProfile } from "../v015-link-definition.js";
import {
  compileV015FormalDefinitionsToRecursive,
  type V015FormalRecursiveCompileResult,
} from "../v015-formal-recursive-compiler.js";
import {
  V015_FORMAL_JSON_J1_SCHEMA,
  decodeV015FormalSourceAsetJson,
  encodeV015FormalSourceAsetJson,
} from "../v015-formal-decoder.js";
import { materializeV012StringAnum } from "../v012-string-anum.js";
import { findRepositoryRoot } from "./docs-sync.js";

/**
 * Bounded attestation for the exact v0.15 root-basis documentation specimen.
 *
 * This adapter deliberately accepts only the five already accepted definitions
 * R/O/C/L/U. It does not generalize FORMAL, invent a new JSON logical element,
 * prove a theorem, or exercise A-memory reactions. JSON is used only as the
 * already versioned J1 projection of the exact same native source ANet.
 */
export interface V015RootBasisEvidenceRequest {
  readonly id: string;
  readonly role: string;
  readonly source: string;
  readonly formalSourceSha256: string;
  readonly expectedSemanticAnetSha256: string;
  readonly stages: readonly string[];
}

export interface V015RootBasisEvidenceReceipt {
  readonly profile: "mts-v015-root-basis-evidence/v0.1";
  readonly outcome: "PASS";
  readonly caseId: string;
  readonly formalSourceSha256: string;
  readonly semanticAnetSha256: string;
  readonly runnerSourceSha256: string;
}

const ROOT_BASIS_SOURCE = [
  "R : R->R",
  "O : O->R",
  "C : R->C",
  "L : O->C",
  "U : C->O",
].join("\n");

const ROOT_BASIS_STAGES = [
  "grammar",
  "denotation",
  "semanticLinks",
  "jsonParity",
] as const;

const ROOT_WIRES = Object.freeze({
  R: "8",
  O: "98",
  C: "68",
  L: "19868",
  U: "16898",
} as const);

type RootName = keyof typeof ROOT_WIRES;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function fail(reason: string): never {
  throw new Error("v015-root-basis-evidence-verifier: " + reason);
}

function assertRoot(condition: boolean, reason: string): void {
  if (!condition) fail(reason);
}

interface Fixture {
  readonly memory: Memory;
  readonly basis: RootBasis;
  readonly grammarRoot: LinkHandle;
  readonly namespaceProfileRoot: LinkHandle;
  readonly definitionProfileRoot: LinkHandle;
}

function fixture(): Fixture {
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  // Tooling is orchestration-only: it must not become a new direct Link-write
  // owner. Stable private vocabulary handles are materialized through the
  // already governed string-Anum constructor instead of Memory.ensure().
  const tag = (name: string): LinkHandle => materializeV012StringAnum(
    memory,
    basis,
    encoder.encode("v015-root-basis-evidence/" + name),
  ).anumLink;

  const syntaxTag = tag("syntax-tag");
  const markerSeed = tag("marker-seed");
  const pairForm = tag("pair-form");
  const nameRefForm = tag("name-ref-form");
  const declarationForm = tag("declaration-form");
  const blockForm = tag("block-form");
  const pairLeftRole = tag("pair-left-role");
  const pairRightRole = tag("pair-right-role");
  const referencedNameRole = tag("referenced-name-role");
  const declarationNameRole = tag("declaration-name-role");
  const declarationBodyRole = tag("declaration-body-role");
  const blockItemRole = tag("block-item-role");

  const rules: readonly NativeSyntaxGrammarRuleSpec[] = [
    { form: pairForm, fields: [
      { role: pairLeftRole, target: "child", min: 1, max: 1 },
      { role: pairRightRole, target: "child", min: 1, max: 1 },
    ] },
    { form: nameRefForm, fields: [
      { role: referencedNameRole, target: "carrier", min: 1, max: 1 },
    ] },
    { form: declarationForm, fields: [
      { role: declarationNameRole, target: "carrier", min: 1, max: 1 },
      { role: declarationBodyRole, target: "child", min: 1, max: 1 },
    ] },
    { form: blockForm, fields: [
      { role: blockItemRole, target: "child", min: 0, max: null },
    ] },
  ];

  const grammarRoot = materializeNativeSyntaxGrammar(memory, basis, {
    syntaxTag,
    markerSeed,
    rules,
  });
  const namespaceProfileRoot = materializeSourceNamespaceProfile(memory, {
    blockForm,
    declarationForm,
    blockItemRole,
    declarationNameRole,
    declarationBodyRole,
  });
  const definitionProfileRoot = materializeV015LinkDefinitionProfile(memory, {
    pairForm,
    nameRefForm,
    pairLeftRole,
    pairRightRole,
    referencedNameRole,
  });
  return Object.freeze({
    memory,
    basis,
    grammarRoot,
    namespaceProfileRoot,
    definitionProfileRoot,
  });
}

function entry(
  fixtureValue: Fixture,
  compiled: V015FormalRecursiveCompileResult,
  name: RootName,
) {
  const nameCarrier = materializeV012StringAnum(
    fixtureValue.memory,
    fixtureValue.basis,
    encoder.encode(name),
  ).anumLink;
  const found = compiled.definitions.find((definition) =>
    definition.nameCarrier === nameCarrier
  );
  if (found === undefined) return fail("missing root definition " + name);
  return found;
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length &&
    left.every((value, index) => right[index] === value);
}

/**
 * Returns a stable digest of semantic facts, never of local Link handles.
 */
export function deriveV015RootBasisDigest(source: string): string {
  assertRoot(source === ROOT_BASIS_SOURCE,
    "unsupported source; root-basis adapter is exact-source bounded");

  const f = fixture();
  const compiled = compileV015FormalDefinitionsToRecursive(
    f.memory,
    f.basis,
    f.grammarRoot,
    f.namespaceProfileRoot,
    f.definitionProfileRoot,
    encoder.encode(source),
  );
  assertRoot(compiled.definitions.length === 5, "expected exactly five root definitions");

  const expectedLinks: Readonly<Record<RootName, LinkHandle>> = Object.freeze({
    R: f.basis.R,
    O: f.basis.O,
    C: f.basis.C,
    L: f.basis.L,
    U: f.basis.U,
  });

  for (const name of Object.keys(ROOT_WIRES) as RootName[]) {
    const definition = entry(f, compiled, name);
    assertRoot(definition.semantic === expectedLinks[name],
      name + " does not denote the exact accepted root-basis Link");
    assertRoot(decoder.decode(definition.wire) === ROOT_WIRES[name],
      name + " recursive wire differs from the accepted 8/9/6/1 representation");
  }

  const json = encodeV015FormalSourceAsetJson(
    f.memory,
    f.basis,
    f.grammarRoot,
    f.namespaceProfileRoot,
    f.definitionProfileRoot,
    compiled.source.sourceAset,
  );
  const jsonText = decoder.decode(json);
  assertRoot(jsonText.includes(`"schema":"${V015_FORMAL_JSON_J1_SCHEMA}"`),
    "root-basis projection must use the accepted J1 schema");
  const roundTrip = decodeV015FormalSourceAsetJson(
    f.memory,
    f.basis,
    f.grammarRoot,
    f.namespaceProfileRoot,
    f.definitionProfileRoot,
    json,
  );
  assertRoot(roundTrip.sourceAset === compiled.source.sourceAset,
    "J1 round-trip must preserve the exact native source ANet");
  assertRoot(sameBytes(roundTrip.canonicalJson, json),
    "J1 round-trip must preserve canonical JSON bytes");

  const canonicalIdentity = JSON.stringify({
    schema: "mts-v015-root-basis-semantic-anet-identity/v0.1",
    acceptedVersion: "v0.15",
    sourceLiteral: ROOT_BASIS_SOURCE,
    semanticLinks: ["R=R", "O=O", "C=C", "L=L", "U=U"],
    recursiveWires: ROOT_WIRES,
    jsonSchema: V015_FORMAL_JSON_J1_SCHEMA,
    nativeJsonSourceAsetEquality: true,
  });
  return createHash("sha256").update(canonicalIdentity, "utf8").digest("hex");
}

export function verifyV015RootBasisEvidence(
  input: V015RootBasisEvidenceRequest,
): V015RootBasisEvidenceReceipt {
  assertRoot(typeof input.id === "string" && /^F[0-9]{4}$/.test(input.id),
    "invalid source-occurrence ID");
  assertRoot(input.id === "F0028",
    "profile is deliberately bound to the exact documented root-basis occurrence F0028");
  assertRoot(input.role === "FORMAL_V015_NOTATION_SPECIMEN",
    "unsupported role");
  assertRoot(typeof input.source === "string", "missing FORMAL source");
  assertRoot(input.source === ROOT_BASIS_SOURCE, "source differs from accepted root-basis specimen");
  assertRoot(typeof input.formalSourceSha256 === "string" &&
    /^[0-9a-f]{64}$/.test(input.formalSourceSha256),
  "invalid source digest");
  assertRoot(
    createHash("sha256").update(input.source, "utf8").digest("hex") ===
      input.formalSourceSha256,
    "source SHA-256 does not match exact occurrence",
  );
  assertRoot(Array.isArray(input.stages) &&
    input.stages.length === ROOT_BASIS_STAGES.length &&
    input.stages.every((stage, index) => stage === ROOT_BASIS_STAGES[index]),
  "unsupported evidence stages");

  const derived = deriveV015RootBasisDigest(input.source);
  assertRoot(typeof input.expectedSemanticAnetSha256 === "string" &&
    /^[0-9a-f]{64}$/.test(input.expectedSemanticAnetSha256) &&
    input.expectedSemanticAnetSha256 === derived,
  "claimed semantic identity differs from root-basis compiler/codec evidence");

  const runner = readFileSync(resolve(
    findRepositoryRoot(), "ts/src/tooling/v015-root-basis-evidence-verifier.ts",
  ), "utf8");

  return Object.freeze({
    profile: "mts-v015-root-basis-evidence/v0.1",
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
    const raw = JSON.parse(readFileSync(0, "utf8")) as V015RootBasisEvidenceRequest;
    const receipt = verifyV015RootBasisEvidence(raw);
    process.stdout.write(JSON.stringify(receipt) + "\n");
  } catch (error) {
    process.stderr.write(String(error) + "\n");
    process.exitCode = 1;
  }
}
