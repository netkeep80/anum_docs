import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { materializeExactSequence } from "../src/exact-sequence.js";
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
import {
  compileV015DirectFormalSourceAnet,
} from "../src/v015-direct-formal-source.js";
import {
  compileV015DirectJsonSourceAnet,
} from "../src/v015-direct-json-source.js";
import {
  materializeV015ContextualNamePath,
} from "../src/v015-link-definition.js";
import {
  denoteV015ResolvedSourceAnet,
  materializeV015SourceAnetProfile,
  type V015SourceAnetProfile,
} from "../src/v015-source-anet.js";
import {
  materializeV013HierarchicalCarrierFromSemanticLink,
  serializeV013HierarchicalCarrier,
} from "../src/v013-hierarchical-carrier.js";
import {
  unifyStructuralRuleTemplate,
} from "../src/structural-unification.js";
import {
  instantiateV013StructuralTemplate,
} from "../src/v013-structural-execution.js";
import { materializeV012StringAnum } from "../src/v012-string-anum.js";

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error("v0.15 two-role approved recursive: " + message);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(
    Object.is(actual, expected),
    message + ": " + String(actual) + " !== " + String(expected),
  );
}

function setSame(
  actual: ReadonlySet<LinkHandle>,
  expected: readonly LinkHandle[],
  message: string,
): void {
  same(actual.size, expected.length, message + " cardinality");
  for (const value of expected) assert(actual.has(value), message + " member");
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function repositoryRoot(): string {
  for (const candidate of [resolve(process.cwd(), ".."), process.cwd()]) {
    if (
      existsSync(
        resolve(
          candidate,
          "formal/v0.15/regression/two-role-meta-rule.formal",
        ),
      )
    ) return candidate;
  }
  throw new Error("v0.15 two-role approved recursive: repository root");
}

interface Fixture {
  readonly memory: Memory;
  readonly basis: RootBasis;
  readonly grammarRoot: LinkHandle;
  readonly sourceAnetProfileRoot: LinkHandle;
}

function fixture(noise = 0): Fixture {
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  let cursor = memory.ensure(basis.U, basis.L);
  for (let index = 0; index < noise; index += 1) {
    cursor = memory.ensure(cursor, index % 2 === 0 ? basis.O : basis.C);
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

  const syntaxTag = fresh();
  const markerSeed = fresh();
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

  const grammarRoot = materializeNativeSyntaxGrammar(
    memory,
    basis,
    { syntaxTag, markerSeed, rules },
  );
  const sourceAnetProfileRoot = materializeV015SourceAnetProfile(
    memory,
    profile,
  );
  return Object.freeze({ memory, basis, grammarRoot, sourceAnetProfileRoot });
}

const root = repositoryRoot();
const formalBytes = Uint8Array.from(readFileSync(
  resolve(root, "formal/v0.15/regression/two-role-meta-rule.formal"),
));
const jsonBytes = Uint8Array.from(readFileSync(
  resolve(root, "formal/v0.15/regression/two-role-meta-rule.json"),
));

function compileOne(noise = 0): Readonly<{
  recursiveSetBytes: Uint8Array;
  memberWires: readonly string[];
}> {
  const f = fixture(noise);
  const formal = compileV015DirectFormalSourceAnet(
    f.memory, f.basis, f.grammarRoot, f.sourceAnetProfileRoot, formalBytes,
  );
  const json = compileV015DirectJsonSourceAnet(
    f.memory, f.basis, f.grammarRoot, f.sourceAnetProfileRoot, jsonBytes,
  );
  same(
    formal.sourceAset,
    json.sourceAset,
    "FORMAL and JSON reconstruct exact same native source ANet",
  );

  const denotation = denoteV015ResolvedSourceAnet(
    f.memory, f.basis, f.grammarRoot, f.sourceAnetProfileRoot, json.sourceAset,
  );

  const enc = new TextEncoder();
  const carrier = (name: string): LinkHandle =>
    materializeV012StringAnum(f.memory, f.basis, enc.encode(name)).anumLink;
  const absolute = (name: string): LinkHandle =>
    materializeV015ContextualNamePath(
      f.memory, f.basis, f.basis.R, [carrier(name)], true,
    );

  const V = absolute("V");
  const X = absolute("X");
  const Y = absolute("Y");
  const Tag = absolute("Tag");
  const Theory = absolute("Theory");
  const MetaRuleName = absolute("MetaRule");

  const roleX = f.memory.ensure(V, X);
  const roleY = f.memory.ensure(V, Y);
  const metaRuleBinding = denotation.bindings.find(
    (binding) => binding.coordinate === null && binding.name === MetaRuleName,
  );
  assert(metaRuleBinding !== undefined, "MetaRule root binding");
  const admission = f.memory.ensure(Theory, metaRuleBinding.value);

  setSame(
    denotation.members,
    [roleX, roleY, admission],
    "semantic ANet is exactly role members plus Theory admission",
  );

  const roleMembers = [...denotation.members].filter(
    (member) => f.memory.poles(member).start === V,
  );
  setSame(new Set(roleMembers), [roleX, roleY], "derived role bundle members");

  const rulePoles = f.memory.poles(metaRuleBinding.value);
  same(rulePoles.start, V, "MetaRule role-bundle anchor");
  const body = f.memory.poles(rulePoles.end);
  const antecedent = body.start;
  const image = body.end;

  const actualA = absolute("A");
  const actualB = absolute("B");
  const actualAntecedent = f.memory.ensure(
    Tag,
    f.memory.ensure(actualA, actualB),
  );
  const bindings = unifyStructuralRuleTemplate(
    f.memory,
    antecedent,
    actualAntecedent,
    roleMembers,
  );
  same(bindings.length, 2, "two structural role bindings");

  // The approved image contains exactly one output template.
  const expectedOutputTemplate = f.memory.ensure(roleY, roleX);
  same(
    image,
    materializeExactSequence(f.memory, [expectedOutputTemplate]),
    "approved image topology",
  );
  same(
    instantiateV013StructuralTemplate(
      f.memory,
      expectedOutputTemplate,
      bindings,
    ),
    f.memory.ensure(actualB, actualA),
    "approved meta-rule swaps matched pair",
  );

  const memberWires = [...denotation.members]
    .map((member) => {
      const recursiveCarrier =
        materializeV013HierarchicalCarrierFromSemanticLink(
          f.memory,
          f.basis,
          member,
        );
      return new TextDecoder().decode(
        serializeV013HierarchicalCarrier(
          f.memory,
          f.basis,
          recursiveCarrier,
        ),
      );
    })
    .sort();

  same(memberWires.length, 3, "recursive semantic member count");
  for (const value of memberWires) {
    assert(/^[8961]+$/u.test(value), "recursive member uses 8/9/6/1 only");
  }

  // Newline order is representation-only canonicalization for hashing an
  // extensional ANet. It is not semantic sequence/order in MTS.
  const recursiveSetBytes = new TextEncoder().encode(
    memberWires.join("\n") + "\n",
  );
  return Object.freeze({
    recursiveSetBytes,
    memberWires: Object.freeze(memberWires),
  });
}

const first = compileOne();
const noisy = compileOne(11);
same(
  new TextDecoder().decode(first.recursiveSetBytes),
  new TextDecoder().decode(noisy.recursiveSetBytes),
  "recursive member set is portable across independent Memory handle layouts",
);

const formalDigest = sha256(formalBytes);
const jsonDigest = sha256(jsonBytes);
const recursiveDigest = sha256(first.recursiveSetBytes);

console.log([
  "MTS_V015_TWO_ROLE_APPROVED_RECURSIVE=GREEN",
  "FORMAL_SHA256=" + formalDigest,
  "JSON_SHA256=" + jsonDigest,
  "RECURSIVE_SET_SHA256=" + recursiveDigest,
  "RECURSIVE_MEMBER_COUNT=3",
  "RECURSIVE_SET=" + JSON.stringify(first.memberWires),
  "FORMAL_JSON_NATIVE_SOURCE_ANET=EXACT_SAME",
  "SEMANTIC_MEMBERS=ROLE_X_ROLE_Y_AND_ADMISSION",
  "STRUCTURAL_SWAP=GREEN",
  "TWO_MEMORY_RECURSIVE_PARITY=GREEN",
  "REAL_AMEMORY_REPLAY=PENDING",
].join(" "));
