import {
  materializeExactSequence,
  readExactSequence,
} from "../src/exact-sequence.js";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
  type RootBasis,
} from "../src/memory.js";
import {
  NativeSyntaxGrammarError,
  materializeNativeSyntaxGrammar,
  readNativeSyntaxGrammar,
  readSyntaxAsetWithNativeGrammar,
  type NativeSyntaxGrammarRead,
  type NativeSyntaxGrammarRuleSpec,
} from "../src/native-syntax-grammar.js";
import {
  SyntaxAsetBuilder,
  SyntaxAsetContractError,
  readSyntaxAset,
  type SyntaxAsetVocabulary,
} from "../src/syntax-aset-contract.js";
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`native syntax grammar: ${message}`);
}
function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}
function exactJson(actual: unknown, expected: unknown, message: string): void {
  same(JSON.stringify(actual), JSON.stringify(expected), message);
}
function expectGrammarReject(
  code: NativeSyntaxGrammarError["code"],
  effect: () => unknown,
  label: string,
): void {
  try {
    effect();
  } catch (error) {
    assert(error instanceof NativeSyntaxGrammarError, `${label}: wrong error type`);
    same(error.code, code, `${label}: exact error code`);
    return;
  }
  throw new Error(`native syntax grammar: ${label}: expected rejection`);
}
function expectSyntaxReject(
  code: SyntaxAsetContractError["code"],
  effect: () => unknown,
  label: string,
): void {
  try {
    effect();
  } catch (error) {
    assert(error instanceof SyntaxAsetContractError, `${label}: wrong error type`);
    same(error.code, code, `${label}: exact error code`);
    return;
  }
  throw new Error(`native syntax grammar: ${label}: expected rejection`);
}
interface Fixture {
  readonly memory: Memory;
  readonly basis: RootBasis;
  readonly syntaxTag: LinkHandle;
  readonly markerSeed: LinkHandle;
  readonly forms: readonly LinkHandle[];
  readonly roles: readonly LinkHandle[];
  readonly carrierA: LinkHandle;
  readonly carrierB: LinkHandle;
  readonly rules: readonly NativeSyntaxGrammarRuleSpec[];
  readonly grammarRoot: LinkHandle;
  readonly grammar: NativeSyntaxGrammarRead;
}
function fixture(noise = false): Fixture {
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  let cursor = basis.U;
  const fresh = (): LinkHandle => (cursor = memory.ensure(cursor, basis.R));
  if (noise) {
    const n0 = memory.ensure(basis.C, basis.U);
    memory.ensureStartSelfClosed(n0);
  }
  const syntaxTag = fresh();
  const markerSeed = fresh();
  const leafForm = fresh();
  const binaryForm = fresh();
  const definitionForm = fresh();
  const containerForm = fresh();
  const forms = Object.freeze([
    leafForm,
    binaryForm,
    definitionForm,
    containerForm,
  ]);
  const valueRole = fresh();
  const startRole = fresh();
  const endRole = fresh();
  const nameRole = fresh();
  const bodyRole = fresh();
  const itemRole = fresh();
  const roles = Object.freeze([
    valueRole,
    startRole,
    endRole,
    nameRole,
    bodyRole,
    itemRole,
  ]);
  const carrierA = fresh();
  const carrierB = fresh();
  const rules: readonly NativeSyntaxGrammarRuleSpec[] = Object.freeze([
    Object.freeze({
      form: leafForm,
      fields: Object.freeze([
        Object.freeze({ role: valueRole, target: "carrier" as const, min: 1, max: 1 }),
      ]),
    }),
    Object.freeze({
      form: binaryForm,
      fields: Object.freeze([
        Object.freeze({ role: startRole, target: "child" as const, min: 1, max: 1 }),
        Object.freeze({ role: endRole, target: "child" as const, min: 1, max: 1 }),
      ]),
    }),
    Object.freeze({
      form: definitionForm,
      fields: Object.freeze([
        Object.freeze({ role: nameRole, target: "carrier" as const, min: 1, max: 1 }),
        Object.freeze({ role: bodyRole, target: "child" as const, min: 1, max: 1 }),
      ]),
    }),
    Object.freeze({
      form: containerForm,
      fields: Object.freeze([
        Object.freeze({ role: itemRole, target: "child" as const, min: 0, max: null }),
      ]),
    }),
  ]);
  const grammarRoot = materializeNativeSyntaxGrammar(memory, basis, {
    syntaxTag,
    markerSeed,
    rules,
  });
  const grammar = readNativeSyntaxGrammar(memory, basis, grammarRoot);
  return Object.freeze({
    memory,
    basis,
    syntaxTag,
    markerSeed,
    forms,
    roles,
    carrierA,
    carrierB,
    rules,
    grammarRoot,
    grammar,
  });
}
function normalizedShape(f: Fixture): unknown {
  const formIndex = new Map(f.forms.map((form, index) => [form, index]));
  const roleIndex = new Map(f.roles.map((role, index) => [role, index]));
  return f.grammar.vocabulary.rules.map((rule) => ({
    form: formIndex.get(rule.kind),
    fields: rule.fields.map((field) => ({
      role: roleIndex.get(field.role),
      target: field.target,
      min: field.min,
      max: field.max,
    })),
  }));
}
function buildSyntax(f: Fixture): LinkHandle {
  const [leafForm, binaryForm, definitionForm, containerForm] = f.forms;
  const [valueRole, startRole, endRole, nameRole, bodyRole, itemRole] = f.roles;
  assert(
    leafForm !== undefined &&
    binaryForm !== undefined &&
    definitionForm !== undefined &&
    containerForm !== undefined &&
    valueRole !== undefined &&
    startRole !== undefined &&
    endRole !== undefined &&
    nameRole !== undefined &&
    bodyRole !== undefined &&
    itemRole !== undefined,
    "fixture roles/forms exist",
  );
  const builder = new SyntaxAsetBuilder(f.memory, f.grammar.vocabulary);
  const left = builder.addOccurrence(leafForm, [
    { role: valueRole, value: f.carrierA },
  ]);
  const right = builder.addOccurrence(leafForm, [
    { role: valueRole, value: f.carrierB },
  ]);
  const binary = builder.addOccurrence(binaryForm, [
    { role: startRole, value: left },
    { role: endRole, value: right },
  ]);
  const definition = builder.addOccurrence(definitionForm, [
    { role: nameRole, value: f.carrierA },
    { role: bodyRole, value: binary },
  ]);
  const root = builder.addOccurrence(containerForm, [
    { role: itemRole, value: definition },
    { role: itemRole, value: definition },
  ]);
  return builder.finish(root);
}
function nat(memory: Memory, basis: RootBasis, value: number): LinkHandle {
  let current = basis.U;
  for (let index = 0; index < value; index += 1) {
    current = memory.ensure(current, basis.L);
  }
  return current;
}
{
  const a = fixture(false);
  const b = fixture(true);
  assert(a.grammarRoot !== b.grammarRoot, "independent Memories use unrelated handles");
  exactJson(normalizedShape(a), normalizedShape(b), "cross-Memory normalized Grammar shape");
  same(a.grammar.vocabulary.rules.length, 4, "four structural form rules");
  same(a.grammar.vocabulary.rules[0]?.fields[0]?.min, 1, "finite minimum read from Nat");
  same(a.grammar.vocabulary.rules[0]?.fields[0]?.max, 1, "finite maximum read from Nat");
  same(a.grammar.vocabulary.rules[3]?.fields[0]?.min, 0, "zero minimum read from U");
  same(a.grammar.vocabulary.rules[3]?.fields[0]?.max, null, "unbounded maximum remains explicit");
}
{
  const f = fixture();
  const syntax = buildSyntax(f);
  const before = f.memory.linkCount;
  const read = readSyntaxAsetWithNativeGrammar(
    f.memory,
    f.basis,
    f.grammarRoot,
    syntax,
  );
  same(f.memory.linkCount, before, "Grammar+Syntax replay performs zero writes");
  const root = read.occurrences.at(-1);
  assert(root !== undefined, "source root occurrence exists");
  same(root.fields.length, 2, "ordered repeated container items preserved");
  same(root.fields[0]?.value, root.fields[1]?.value, "same child may occupy two positions");
}
{
  const f = fixture();
  const syntax = buildSyntax(f);
  const [leafForm, binaryForm, definitionForm, containerForm] = f.forms;
  const [valueRole, startRole, endRole, nameRole, bodyRole, itemRole] = f.roles;
  assert(
    leafForm !== undefined &&
    binaryForm !== undefined &&
    definitionForm !== undefined &&
    containerForm !== undefined &&
    valueRole !== undefined &&
    startRole !== undefined &&
    endRole !== undefined &&
    nameRole !== undefined &&
    bodyRole !== undefined &&
    itemRole !== undefined,
    "restrictive grammar fixture exists",
  );
  const restrictiveRoot = materializeNativeSyntaxGrammar(f.memory, f.basis, {
    syntaxTag: f.syntaxTag,
    markerSeed: f.memory.ensureStartSelfClosed(f.markerSeed),
    rules: [
      { form: leafForm, fields: [{ role: valueRole, target: "carrier", min: 1, max: 1 }] },
      {
        form: binaryForm,
        fields: [
          { role: startRole, target: "child", min: 1, max: 1 },
          { role: endRole, target: "child", min: 1, max: 1 },
        ],
      },
      {
        form: definitionForm,
        fields: [
          { role: nameRole, target: "carrier", min: 1, max: 1 },
          { role: bodyRole, target: "child", min: 1, max: 1 },
        ],
      },
      { form: containerForm, fields: [{ role: itemRole, target: "child", min: 0, max: 1 }] },
    ],
  });
  expectSyntaxReject(
    "invalid-grammar",
    () => readSyntaxAsetWithNativeGrammar(f.memory, f.basis, restrictiveRoot, syntax),
    "selected restrictive Grammar rejects repeated item",
  );
  const restrictive = readNativeSyntaxGrammar(f.memory, f.basis, restrictiveRoot);
  const forgedRules = restrictive.vocabulary.rules.map((rule) => {
    if (rule.kind !== containerForm) return rule;
    return Object.freeze({
      kind: rule.kind,
      fields: Object.freeze(rule.fields.map((field) =>
        field.role === itemRole
          ? Object.freeze({ ...field, max: null })
          : field
      )),
    });
  });
  const forgedVocabulary: SyntaxAsetVocabulary = Object.freeze({
    ...restrictive.vocabulary,
    rules: Object.freeze(forgedRules),
  });
  same(
    readSyntaxAset(f.memory, syntax, forgedVocabulary).root,
    readSyntaxAset(f.memory, syntax, f.grammar.vocabulary).root,
    "legacy generic API can consume caller-provided host descriptors",
  );
  expectSyntaxReject(
    "invalid-grammar",
    () => readSyntaxAsetWithNativeGrammar(f.memory, f.basis, restrictiveRoot, syntax),
    "native Grammar API ignores forged host widening",
  );
}
{
  const f = fixture();
  const rootPoles = f.memory.poles(f.grammarRoot);
  const ruleLinks = readExactSequence(f.memory, rootPoles.end).values;
  const firstRule = ruleLinks[0];
  assert(firstRule !== undefined, "first native rule exists");
  const duplicateForms = materializeExactSequence(f.memory, [firstRule, firstRule]);
  const duplicateFormsRoot = f.memory.ensure(rootPoles.start, duplicateForms);
  expectGrammarReject(
    "duplicate-form-rule",
    () => readNativeSyntaxGrammar(f.memory, f.basis, duplicateFormsRoot),
    "duplicate form",
  );
  const firstRulePoles = f.memory.poles(firstRule);
  const firstField = readExactSequence(f.memory, firstRulePoles.end).values[0];
  assert(firstField !== undefined, "first native field exists");
  const duplicateFields = materializeExactSequence(f.memory, [firstField, firstField]);
  const duplicateRoleRule = f.memory.ensure(firstRulePoles.start, duplicateFields);
  const duplicateRoleRoot = f.memory.ensure(
    rootPoles.start,
    materializeExactSequence(f.memory, [duplicateRoleRule]),
  );
  expectGrammarReject(
    "duplicate-role-rule",
    () => readNativeSyntaxGrammar(f.memory, f.basis, duplicateRoleRoot),
    "duplicate role",
  );
}
{
  const f = fixture();
  const rootPoles = f.memory.poles(f.grammarRoot);
  const header = readExactSequence(f.memory, rootPoles.start).values;
  const rules = readExactSequence(f.memory, rootPoles.end).values;
  const firstRule = rules[0];
  assert(firstRule !== undefined, "first rule exists");
  const firstRulePoles = f.memory.poles(firstRule);
  const firstField = readExactSequence(f.memory, firstRulePoles.end).values[0];
  assert(firstField !== undefined, "first field exists");
  const firstFieldPoles = f.memory.poles(firstField);
  const firstSpec = readExactSequence(f.memory, firstFieldPoles.end).values;
  const min = firstSpec[1];
  const max = firstSpec[2];
  assert(min !== undefined && max !== undefined, "first field cardinality exists");
  const rogueTarget = f.memory.ensure(f.carrierA, f.carrierB);
  const badTargetSpec = materializeExactSequence(f.memory, [rogueTarget, min, max]);
  const badTargetField = f.memory.ensure(firstFieldPoles.start, badTargetSpec);
  const badTargetRule = f.memory.ensure(
    firstRulePoles.start,
    materializeExactSequence(f.memory, [badTargetField]),
  );
  const badTargetRoot = f.memory.ensure(
    rootPoles.start,
    materializeExactSequence(f.memory, [badTargetRule]),
  );
  expectGrammarReject(
    "invalid-target-class",
    () => readNativeSyntaxGrammar(f.memory, f.basis, badTargetRoot),
    "unknown target marker",
  );
  const target = firstSpec[0];
  assert(target !== undefined, "first target marker exists");
  const reversedCardinalitySpec = materializeExactSequence(f.memory, [
    target,
    nat(f.memory, f.basis, 2),
    nat(f.memory, f.basis, 1),
  ]);
  const reversedField = f.memory.ensure(firstFieldPoles.start, reversedCardinalitySpec);
  const reversedRule = f.memory.ensure(
    firstRulePoles.start,
    materializeExactSequence(f.memory, [reversedField]),
  );
  const reversedRoot = f.memory.ensure(
    rootPoles.start,
    materializeExactSequence(f.memory, [reversedRule]),
  );
  expectGrammarReject(
    "invalid-cardinality-order",
    () => readNativeSyntaxGrammar(f.memory, f.basis, reversedRoot),
    "max below min",
  );
  const invalidHeader = materializeExactSequence(f.memory, [
    header[0]!,
    header[1]!,
    header[2]!,
    f.basis.U,
  ]);
  const invalidHeaderRoot = f.memory.ensure(invalidHeader, rootPoles.end);
  expectGrammarReject(
    "invalid-grammar-header",
    () => readNativeSyntaxGrammar(f.memory, f.basis, invalidHeaderRoot),
    "unbounded marker cannot also be finite Nat",
  );
}
{
  const f = fixture();
  const foreign = new Memory();
  const foreignBasis = ensureRootBasis(foreign);
  expectGrammarReject(
    "invalid-root-basis",
    () => readNativeSyntaxGrammar(f.memory, foreignBasis, f.grammarRoot),
    "foreign RootBasis",
  );
}
console.log([
  "MTS v0.15 G0 native syntax Grammar:",
  "CANONICAL_SYNTAX_ASET_TOPOLOGY=REUSED",
  "GRAMMAR_AUTHORITY=LINK_NATIVE",
  "HOST_VOCABULARY=DERIVED_READ_ONLY_VIEW",
  "CARDINALITY=NAT_N0_U_SUCC_N_TO_L",
  "FORGED_HOST_WIDENING=NO_AUTHORITY",
  "READ_ONLY_REPLAY=GREEN",
].join(" "));
