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
import { materializeSourceNamespaceProfile } from "../src/source-namespace.js";
import {
  decodeV015FormalDefinitions,
  decodeV015FormalSourceAsetJson,
  encodeV015FormalSourceAsetJson,
} from "../src/v015-formal-decoder.js";
import {
  materializeV015LinkDefinitionProfile,
  materializeV015LinkDefinitions,
} from "../src/v015-link-definition.js";
import { materializeV012StringAnum } from "../src/v012-string-anum.js";
import { readExactSequence } from "../src/exact-sequence.js";
import {
  materializeV015OpenProofDenotation,
  materializeV015ProofDenotation,
  V015ProofFormError,
} from "../src/v015-proof-source.js";
import { replayStructuralRootedProofAset } from "../src/rooted-proof-aset.js";
import {
  replayStructuralHeterogeneousDerivedOpenRootedInstance,
} from "../src/derived-derivation-heterogeneous-instance.js";
import {
  exportPortableClosedRootedProof,
} from "../src/portable-closed-rooted-proof.js";
import {
  materializeV013HierarchicalCarrierFromSemanticLink,
  serializeV013HierarchicalCarrier,
} from "../src/v013-hierarchical-carrier.js";

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(`v0.15 B14a OPEN FORMAL proof: ${message}`);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(
    Object.is(actual, expected),
    `${message}: ${String(actual)} !== ${String(expected)}`,
  );
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
  let cursor = memory.ensure(basis.U, basis.L);
  const fresh = (): LinkHandle => (
    cursor = memory.ensure(cursor, basis.C)
  );

  const syntaxTag = fresh();
  const markerSeed = fresh();
  const pairForm = fresh();
  const nameRefForm = fresh();
  const declarationForm = fresh();
  const blockForm = fresh();
  const sequenceForm = fresh();

  const pairLeftRole = fresh();
  const pairRightRole = fresh();
  const referencedNameRole = fresh();
  const declarationNameRole = fresh();
  const declarationBodyRole = fresh();
  const blockItemRole = fresh();
  const sequenceItemRole = fresh();

  const rules: readonly NativeSyntaxGrammarRuleSpec[] = [
    {
      form: pairForm,
      fields: [
        { role: pairLeftRole, target: "child", min: 1, max: 1 },
        { role: pairRightRole, target: "child", min: 1, max: 1 },
      ],
    },
    {
      form: nameRefForm,
      fields: [{ role: referencedNameRole, target: "carrier", min: 1, max: 1 }],
    },
    {
      form: declarationForm,
      fields: [
        { role: declarationNameRole, target: "carrier", min: 1, max: 1 },
        { role: declarationBodyRole, target: "child", min: 1, max: 1 },
      ],
    },
    {
      form: blockForm,
      fields: [{ role: blockItemRole, target: "child", min: 0, max: null }],
    },
    {
      form: sequenceForm,
      fields: [{ role: sequenceItemRole, target: "child", min: 0, max: null }],
    },
  ];

  const grammarRoot = materializeNativeSyntaxGrammar(
    memory,
    basis,
    { syntaxTag, markerSeed, rules },
  );
  const namespaceProfileRoot = materializeSourceNamespaceProfile(
    memory,
    {
      blockForm,
      declarationForm,
      blockItemRole,
      declarationNameRole,
      declarationBodyRole,
    },
  );
  const definitionProfileRoot = materializeV015LinkDefinitionProfile(
    memory,
    {
      pairForm,
      nameRefForm,
      pairLeftRole,
      pairRightRole,
      referencedNameRole,
      sequenceForm,
      sequenceItemRole,
    },
  );

  return Object.freeze({
    memory,
    basis,
    grammarRoot,
    namespaceProfileRoot,
    definitionProfileRoot,
  });
}

const enc = new TextEncoder();

const source = [
  "R : R->R",
  "O : O->R",
  "C : R->C",
  "L : O->C",
  "U : C->O",
  "THEORY : C->U",
  "SEED : L->U",
  "X : SEED->O",
  "Y : X->O",
  "x : Y->O",
  "y : x->O",
  "A : y->O",
  "B : A->O",

  "PROFILE_SEED : U->L",
  "DICT_TAG : PROFILE_SEED->O",
  "RULE_TAG : DICT_TAG->O",
  "DR_TAG : RULE_TAG->O",
  "MAP_TAG : DR_TAG->O",
  "MORPH_TAG : MAP_TAG->O",
  "GENERIC_TAG : MORPH_TAG->O",
  "BIND_TAG : GENERIC_TAG->O",
  "OPEN_TAG : BIND_TAG->O",
  "PRIM_TAG : OPEN_TAG->O",
  "COORD_TAG : PRIM_TAG->O",
  "DISCHARGE_TAG : COORD_TAG->O",
  "PROOF_PROFILE : [DICT_TAG,RULE_TAG,DR_TAG,MAP_TAG,MORPH_TAG,GENERIC_TAG,BIND_TAG,OPEN_TAG,PRIM_TAG,COORD_TAG,DISCHARGE_TAG]",

  "GLOBAL_ROLES : [X,Y]",
  "GLOBAL_DICT : DICT_TAG->GLOBAL_ROLES",
  "TARGET_RULE_DATA : [GLOBAL_DICT,Y]",
  "TARGET_RULE : RULE_TAG->TARGET_RULE_DATA",
  "TARGET_PREMISES : [X]",
  "TARGET_DR_DATA : [TARGET_RULE,TARGET_PREMISES]",
  "TARGET_DR : DR_TAG->TARGET_DR_DATA",

  "LOCAL_ROLES : [x,y]",
  "LOCAL_DICT : DICT_TAG->LOCAL_ROLES",
  "LOCAL_RULE_DATA : [LOCAL_DICT,y]",
  "LOCAL_RULE : RULE_TAG->LOCAL_RULE_DATA",
  "LOCAL_PREMISES : [x]",
  "LOCAL_DR_DATA : [LOCAL_RULE,LOCAL_PREMISES]",
  "LOCAL_DR : DR_TAG->LOCAL_DR_DATA",

  "MAP_X_DATA : [x,X]",
  "MAP_X : MAP_TAG->MAP_X_DATA",
  "MAP_Y_DATA : [y,Y]",
  "MAP_Y : MAP_TAG->MAP_Y_DATA",
  "MAPPINGS : [MAP_X,MAP_Y]",
  "MORPH_DATA : [THEORY,LOCAL_DICT,GLOBAL_DICT,MAPPINGS]",
  "MORPH : MORPH_TAG->MORPH_DATA",

  "GENERIC_DATA : [TARGET_DR,THEORY,LOCAL_DR,MORPH]",
  "GENERIC : GENERIC_TAG->GENERIC_DATA",

  "BIND_X_DATA : [X,A]",
  "BIND_X : BIND_TAG->BIND_X_DATA",
  "BIND_Y_DATA : [Y,B]",
  "BIND_Y : BIND_TAG->BIND_Y_DATA",
  "BINDINGS : [BIND_X,BIND_Y]",
  "OPEN_DATA : [GENERIC,BINDINGS]",
  "OPEN_PROOF : OPEN_TAG->OPEN_DATA",

  "ENTRY : [PROOF_PROFILE,OPEN_PROOF]",
].join("\n");

function canonicalWire(
  memory: Memory,
  basis: RootBasis,
  semantic: LinkHandle,
): string {
  const carrier = materializeV013HierarchicalCarrierFromSemanticLink(
    memory,
    basis,
    semantic,
  );
  return new TextDecoder().decode(
    serializeV013HierarchicalCarrier(memory, basis, carrier),
  );
}

function resolveSource(text: string) {
  const f = fixture();
  const decoded = decodeV015FormalDefinitions(
    f.memory,
    f.basis,
    f.grammarRoot,
    f.namespaceProfileRoot,
    f.definitionProfileRoot,
    enc.encode(text),
  );
  const read = materializeV015LinkDefinitions(
    f.memory,
    f.basis,
    f.grammarRoot,
    f.namespaceProfileRoot,
    f.definitionProfileRoot,
    decoded.sourceAset,
  );
  const carrier = (name: string): LinkHandle => (
    materializeV012StringAnum(
      f.memory,
      f.basis,
      enc.encode(name),
    ).anumLink
  );
  const value = (name: string): LinkHandle => {
    const found = read.definitions.find(
      (entry) => entry.nameCarrier === carrier(name),
    );
    assert(found !== undefined, `definition ${name}`);
    return found.value;
  };

  const entry = read.definitions[read.definitions.length - 1];
  assert(entry !== undefined, "explicit ENTRY");
  const entryValues = readExactSequence(f.memory, entry.value).values;
  same(entryValues.length, 2, "ENTRY arity");
  const profileRoot = entryValues[0];
  const sourceRoot = entryValues[1];
  assert(profileRoot !== undefined && sourceRoot !== undefined, "ENTRY coordinates");

  const open = materializeV015OpenProofDenotation(
    f.memory,
    profileRoot,
    sourceRoot,
  );
  const rooted = replayStructuralRootedProofAset(
    f.memory,
    open.openRoot,
  );
  const instance = replayStructuralHeterogeneousDerivedOpenRootedInstance(
    f.memory,
    {
      generic: open.generic,
      concreteRoot: open.openRoot,
    },
  );

  return Object.freeze({
    f,
    decoded,
    read,
    value,
    profileRoot,
    sourceRoot,
    open,
    rooted,
    instance,
  });
}

{
  const r = resolveSource(source);
  same(r.rooted.declaredAssumptionCount, 1, "OPEN declares one premise");
  same(r.rooted.usedAssumptionCount, 1, "OPEN uses one premise");
  same(r.instance.bindings.length, 2, "OPEN has two explicit role bindings");
  same(r.rooted.conclusion, r.value("B"), "OPEN concrete conclusion");
  same(
    r.f.memory.poles(r.rooted.targetIdentity).end,
    r.value("THEORY"),
    "OPEN exact Theory",
  );
}

{
  const r = resolveSource(source);
  const before = r.f.memory.linkCount;
  let rejected = false;
  try {
    exportPortableClosedRootedProof(
      r.f.memory,
      r.f.basis,
      r.open.openRoot,
    );
  } catch {
    rejected = true;
  }
  assert(rejected, "OPEN proof must not export through CLOSED boundary");
  same(
    r.f.memory.linkCount,
    before,
    "rejected CLOSED export remains read-only",
  );
}

{
  const r = resolveSource(source);
  let rejected = false;
  try {
    materializeV015ProofDenotation(
      r.f.memory,
      r.profileRoot,
      r.sourceRoot,
    );
  } catch (error) {
    assert(error instanceof V015ProofFormError, "closed entry rejection type");
    same(error.code, "unexpected-form", "OPEN cannot masquerade as CLOSED");
    rejected = true;
  }
  assert(rejected, "closed materializer rejects OPEN entry");
}

{
  const r = resolveSource(source);
  const json = encodeV015FormalSourceAsetJson(
    r.f.memory,
    r.f.basis,
    r.f.grammarRoot,
    r.f.namespaceProfileRoot,
    r.f.definitionProfileRoot,
    r.decoded.sourceAset,
  );
  const round = decodeV015FormalSourceAsetJson(
    r.f.memory,
    r.f.basis,
    r.f.grammarRoot,
    r.f.namespaceProfileRoot,
    r.f.definitionProfileRoot,
    json,
  );
  same(round.sourceAset, r.decoded.sourceAset, "JSON J1 exact source-Aset round-trip");

  const read = materializeV015LinkDefinitions(
    r.f.memory,
    r.f.basis,
    r.f.grammarRoot,
    r.f.namespaceProfileRoot,
    r.f.definitionProfileRoot,
    round.sourceAset,
  );
  const entry = read.definitions[read.definitions.length - 1];
  assert(entry !== undefined, "round ENTRY");
  const values = readExactSequence(r.f.memory, entry.value).values;
  const profileRoot = values[0];
  const sourceRoot = values[1];
  assert(profileRoot !== undefined && sourceRoot !== undefined, "round coordinates");
  const reopened = materializeV015OpenProofDenotation(
    r.f.memory,
    profileRoot,
    sourceRoot,
  );
  same(reopened.openRoot, r.open.openRoot, "JSON preserves OPEN proof root");
}

{
  const original = resolveSource(source);
  const renamed = resolveSource(
    source
      .replaceAll("GLOBAL_", "G_")
      .replaceAll("TARGET_", "T_")
      .replaceAll("LOCAL_", "L_")
      .replaceAll("MAP_X", "MX")
      .replaceAll("MAP_Y", "MY")
      .replaceAll("MAPPINGS", "MS")
      .replaceAll("MORPH", "MU")
      .replaceAll("GENERIC", "GEN")
      .replaceAll("BIND_X", "BX")
      .replaceAll("BIND_Y", "BY")
      .replaceAll("BINDINGS", "BS")
      .replaceAll("OPEN_PROOF", "OP")
      .replaceAll("PROOF_PROFILE", "PP")
      .replaceAll("ENTRY", "E"),
  );
  same(
    canonicalWire(
      original.f.memory,
      original.f.basis,
      original.open.openRoot,
    ),
    canonicalWire(
      renamed.f.memory,
      renamed.f.basis,
      renamed.open.openRoot,
    ),
    "presentation alpha-renaming preserves OPEN proof topology",
  );
}

{
  const production = materializeV015OpenProofDenotation.toString();
  assert(!production.includes("FND-08"), "no theorem-id dispatch");
  assert(!production.includes("FND-09"), "no theorem-id dispatch");
}

console.log([
  "MTS v0.15 B14a generic OPEN FORMAL proof entry:",
  "SURFACE=PAIR_PLUS_EXACT_SEQUENCE_ONLY",
  "OPEN_ENTRY=SUPPORTED",
  "DECLARED_ASSUMPTIONS=1",
  "USED_ASSUMPTIONS=1",
  "CLOSED_EXPORT_OF_OPEN=REJECT",
  "CLOSED_MATERIALIZER_OF_OPEN=REJECT",
  "JSON_J1_OPEN_SOURCE=EXACT",
  "ALPHA_RENAME=SEMANTICALLY_STABLE",
  "THEOREM_ID_DISPATCH=0",
  "NEW_TRUSTED_PRIMITIVE=0",
].join(" "));
