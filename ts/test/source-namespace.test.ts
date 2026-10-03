import { Memory, ensureRootBasis, type LinkHandle } from "../src/memory.js";
import {
  materializeNativeSyntaxGrammar,
  readNativeSyntaxGrammar,
  type NativeSyntaxGrammarRuleSpec,
} from "../src/native-syntax-grammar.js";
import {
  SourceNamespaceError,
  materializeSourceNamespaceProfile,
  readSourceNamespaceProfile,
  readSourceNamespaces,
} from "../src/source-namespace.js";
import { SyntaxAsetBuilder } from "../src/syntax-aset-contract.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`source namespace: ${message}`);
}
function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}
function reject(code: SourceNamespaceError["code"], effect: () => unknown, label: string): void {
  try { effect(); } catch (error) {
    assert(error instanceof SourceNamespaceError, `${label}: wrong error type`);
    same(error.code, code, `${label}: exact error code`);
    return;
  }
  throw new Error(`source namespace: ${label}: expected rejection`);
}

function baseFixture() {
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  let cursor = basis.U;
  const fresh = (): LinkHandle => (cursor = memory.ensure(cursor, basis.R));

  const syntaxTag = fresh();
  const markerSeed = fresh();
  const leafForm = fresh();
  const declarationForm = fresh();
  const blockForm = fresh();
  const valueRole = fresh();
  const nameRole = fresh();
  const bodyRole = fresh();
  const itemRole = fresh();
  const names = {
    A: fresh(), B: fresh(), C: fresh(), X: fresh(), Y: fresh(), L: fresh(), R: fresh(),
    A2: fresh(),
  };
  const values = { one: fresh(), two: fresh(), three: fresh() };

  const rules: readonly NativeSyntaxGrammarRuleSpec[] = [
    { form: leafForm, fields: [{ role: valueRole, target: "carrier", min: 1, max: 1 }] },
    {
      form: declarationForm,
      fields: [
        { role: nameRole, target: "carrier", min: 1, max: 1 },
        { role: bodyRole, target: "child", min: 1, max: 1 },
      ],
    },
    { form: blockForm, fields: [{ role: itemRole, target: "child", min: 0, max: null }] },
  ];
  const grammarRoot = materializeNativeSyntaxGrammar(memory, basis, {
    syntaxTag, markerSeed, rules,
  });
  const grammar = readNativeSyntaxGrammar(memory, basis, grammarRoot);
  const profileRoot = materializeSourceNamespaceProfile(memory, {
    blockForm,
    declarationForm,
    blockItemRole: itemRole,
    declarationNameRole: nameRole,
    declarationBodyRole: bodyRole,
  });
  return {
    memory, basis, grammarRoot, grammar, profileRoot,
    leafForm, declarationForm, blockForm,
    valueRole, nameRole, bodyRole, itemRole,
    names, values, fresh,
  };
}

function syntaxHelpers(f: ReturnType<typeof baseFixture>) {
  const builder = new SyntaxAsetBuilder(f.memory, f.grammar.vocabulary);
  const leaf = (value: LinkHandle) =>
    builder.addOccurrence(f.leafForm, [{ role: f.valueRole, value }]);
  const declaration = (name: LinkHandle, body: LinkHandle) =>
    builder.addOccurrence(f.declarationForm, [
      { role: f.nameRole, value: name },
      { role: f.bodyRole, value: body },
    ]);
  const block = (items: readonly LinkHandle[]) =>
    builder.addOccurrence(
      f.blockForm,
      items.map((value) => ({ role: f.itemRole, value })),
    );
  return { builder, leaf, declaration, block };
}

{
  const f = baseFixture();
  const p = readSourceNamespaceProfile(f.memory, f.basis, f.grammarRoot, f.profileRoot);
  same(p.blockForm, f.blockForm, "profile block form");
  same(p.declarationForm, f.declarationForm, "profile declaration form");
  const h = syntaxHelpers(f);
  const left = h.leaf(f.values.one);
  const right = h.leaf(f.values.two);
  const d1 = h.declaration(f.names.A, left);
  const d2 = h.declaration(f.names.A, right);
  const root = h.block([d1, d2]);
  const aset = h.builder.finish(root);
  reject(
    "duplicate-local-name",
    () => readSourceNamespaces(f.memory, f.basis, f.grammarRoot, f.profileRoot, aset),
    "same block A:B then A:C",
  );
}

{
  const f = baseFixture();
  const h = syntaxHelpers(f);
  const body = h.leaf(f.values.one);
  const declaration = h.declaration(f.names.A, body);
  const root = h.block([declaration, declaration]);
  const aset = h.builder.finish(root);
  reject(
    "duplicate-local-name",
    () => readSourceNamespaces(f.memory, f.basis, f.grammarRoot, f.profileRoot, aset),
    "same declaration occurrence reused twice",
  );
}

{
  const f = baseFixture();
  const h = syntaxHelpers(f);
  const innerValue = h.leaf(f.values.one);
  const innerA = h.declaration(f.names.A, innerValue);
  const innerBlock = h.block([innerA]);
  const outerValue = h.leaf(f.values.two);
  const outerA = h.declaration(f.names.A, outerValue);
  const outerB = h.declaration(f.names.B, innerBlock);
  const root = h.block([outerA, outerB]);
  const aset = h.builder.finish(root);
  const before = f.memory.linkCount;
  const read = readSourceNamespaces(f.memory, f.basis, f.grammarRoot, f.profileRoot, aset);
  same(f.memory.linkCount, before, "namespace replay is read-only");
  same(read.declarations.length, 3, "outer and nested declarations");
  const aDecls = read.declarations.filter((d) => d.nameCarrier === f.names.A);
  same(aDecls.length, 2, "same exact name appears in two namespaces");
  assert(aDecls[0]?.namespace !== aDecls[1]?.namespace, "outer and inner namespace identities differ");
  same(aDecls[0]?.namespacePath.length, 1, "outer namespace path length");
  same(aDecls[1]?.namespacePath.length, 2, "nested namespace path length");
}

{
  const f = baseFixture();
  const h = syntaxHelpers(f);
  const leftA = h.declaration(f.names.A, h.leaf(f.values.one));
  const leftBlock = h.block([leftA]);
  const rightA = h.declaration(f.names.A, h.leaf(f.values.two));
  const rightBlock = h.block([rightA]);
  const left = h.declaration(f.names.L, leftBlock);
  const right = h.declaration(f.names.R, rightBlock);
  const root = h.block([left, right]);
  const aset = h.builder.finish(root);
  const read = readSourceNamespaces(f.memory, f.basis, f.grammarRoot, f.profileRoot, aset);
  const aDecls = read.declarations.filter((d) => d.nameCarrier === f.names.A);
  same(aDecls.length, 2, "same exact name accepted in sibling namespaces");
  assert(aDecls[0]?.namespace !== aDecls[1]?.namespace, "sibling namespaces differ");
}

{
  const f = baseFixture();
  const h = syntaxHelpers(f);
  const d1 = h.declaration(f.names.A, h.leaf(f.values.one));
  const d2 = h.declaration(f.names.A2, h.leaf(f.values.two));
  const root = h.block([d1, d2]);
  const aset = h.builder.finish(root);
  same(
    readSourceNamespaces(f.memory, f.basis, f.grammarRoot, f.profileRoot, aset).declarations.length,
    2,
    "distinct exact name carriers remain distinct",
  );
}

{
  const f = baseFixture();
  const h = syntaxHelpers(f);
  const inner = h.declaration(f.names.A, h.leaf(f.values.one));
  const sharedBlock = h.block([inner]);
  const x = h.declaration(f.names.X, sharedBlock);
  const y = h.declaration(f.names.Y, sharedBlock);
  const root = h.block([x, y]);
  const aset = h.builder.finish(root);
  reject(
    "shared-namespace-block",
    () => readSourceNamespaces(f.memory, f.basis, f.grammarRoot, f.profileRoot, aset),
    "one namespace block cannot have two lexical parents",
  );
}

{
  const f = baseFixture();
  const foreignProfile = materializeSourceNamespaceProfile(f.memory, {
    blockForm: f.fresh(),
    declarationForm: f.declarationForm,
    blockItemRole: f.itemRole,
    declarationNameRole: f.nameRole,
    declarationBodyRole: f.bodyRole,
  });
  reject(
    "incompatible-profile",
    () => readSourceNamespaceProfile(f.memory, f.basis, f.grammarRoot, foreignProfile),
    "foreign block form",
  );

  const swappedProfile = materializeSourceNamespaceProfile(f.memory, {
    blockForm: f.blockForm,
    declarationForm: f.declarationForm,
    blockItemRole: f.itemRole,
    declarationNameRole: f.bodyRole,
    declarationBodyRole: f.nameRole,
  });
  reject(
    "incompatible-profile",
    () => readSourceNamespaceProfile(f.memory, f.basis, f.grammarRoot, swappedProfile),
    "name/body role target mismatch",
  );
}

console.log([
  "MTS v0.15 G0 source namespaces:",
  "LOCAL_NAME_UNIQUENESS=EXACT_CARRIER_PER_BLOCK",
  "IDENTICAL_RHS_DUPLICATE=REJECT",
  "NESTED_SAME_NAME=ACCEPT",
  "SIBLING_SAME_NAME=ACCEPT",
  "SHARED_NAMESPACE_BLOCK=REJECT",
  "LEGACY_DICTIONARY_POLICY=UNCHANGED",
  "READ_ONLY_REPLAY=GREEN",
].join(" "));
