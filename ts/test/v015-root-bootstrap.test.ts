import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
  type RootBasis,
} from "../src/memory.js";
import {
  materializeNativeSyntaxGrammar,
  readNativeSyntaxGrammar,
  type NativeSyntaxGrammarRuleSpec,
} from "../src/native-syntax-grammar.js";
import {
  SourceNamespaceError,
  materializeSourceNamespaceProfile,
} from "../src/source-namespace.js";
import { SyntaxAsetBuilder } from "../src/syntax-aset-contract.js";
import {
  V015RootBootstrapError,
  materializeV015RootBootstrapProfile,
  readV015RootBootstrapProfile,
  resolveV015RootBootstrap,
  type V015RootBootstrapRead,
} from "../src/v015-root-bootstrap.js";
import { materializeV012StringAnum } from "../src/v012-string-anum.js";
import {
  materializeV013HierarchicalCarrierFromSemanticLink,
  serializeV013HierarchicalCarrier,
} from "../src/v013-hierarchical-carrier.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.15 RootBasis bootstrap: ${message}`);
}
function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}
function text(value: Uint8Array): string {
  return new TextDecoder().decode(value);
}
function reject(
  code: V015RootBootstrapError["code"],
  effect: () => unknown,
  label: string,
): void {
  try { effect(); } catch (error) {
    assert(error instanceof V015RootBootstrapError, `${label}: wrong error type`);
    same(error.code, code, `${label}: exact code`);
    return;
  }
  throw new Error(`v0.15 RootBasis bootstrap: ${label}: expected rejection`);
}

interface Fixture {
  readonly memory: Memory;
  readonly basis: RootBasis;
  readonly grammarRoot: LinkHandle;
  readonly namespaceProfileRoot: LinkHandle;
  readonly bootstrapProfileRoot: LinkHandle;
  readonly grammar: ReturnType<typeof readNativeSyntaxGrammar>;
  readonly forms: Readonly<{
    root: LinkHandle;
    start: LinkHandle;
    end: LinkHandle;
    pair: LinkHandle;
    nameRef: LinkHandle;
    declaration: LinkHandle;
    block: LinkHandle;
  }>;
  readonly roles: Readonly<{
    startChild: LinkHandle;
    endChild: LinkHandle;
    pairLeft: LinkHandle;
    pairRight: LinkHandle;
    referencedName: LinkHandle;
    declarationName: LinkHandle;
    declarationBody: LinkHandle;
    blockItem: LinkHandle;
  }>;
  readonly name: (value: string) => LinkHandle;
}

function fixture(noise = false): Fixture {
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  let cursor = memory.ensure(basis.U, basis.L);
  const fresh = (): LinkHandle => (cursor = memory.ensure(cursor, basis.C));
  if (noise) {
    const n = fresh();
    memory.ensureStartSelfClosed(n);
    memory.ensureEndSelfClosed(n);
  }

  const syntaxTag = fresh();
  const markerSeed = fresh();
  const forms = Object.freeze({
    root: fresh(),
    start: fresh(),
    end: fresh(),
    pair: fresh(),
    nameRef: fresh(),
    declaration: fresh(),
    block: fresh(),
  });
  const roles = Object.freeze({
    startChild: fresh(),
    endChild: fresh(),
    pairLeft: fresh(),
    pairRight: fresh(),
    referencedName: fresh(),
    declarationName: fresh(),
    declarationBody: fresh(),
    blockItem: fresh(),
  });

  const rules: readonly NativeSyntaxGrammarRuleSpec[] = [
    { form: forms.root, fields: [] },
    {
      form: forms.start,
      fields: [{ role: roles.startChild, target: "child", min: 1, max: 1 }],
    },
    {
      form: forms.end,
      fields: [{ role: roles.endChild, target: "child", min: 1, max: 1 }],
    },
    {
      form: forms.pair,
      fields: [
        { role: roles.pairLeft, target: "child", min: 1, max: 1 },
        { role: roles.pairRight, target: "child", min: 1, max: 1 },
      ],
    },
    {
      form: forms.nameRef,
      fields: [{ role: roles.referencedName, target: "carrier", min: 1, max: 1 }],
    },
    {
      form: forms.declaration,
      fields: [
        { role: roles.declarationName, target: "carrier", min: 1, max: 1 },
        { role: roles.declarationBody, target: "child", min: 1, max: 1 },
      ],
    },
    {
      form: forms.block,
      fields: [{ role: roles.blockItem, target: "child", min: 0, max: null }],
    },
  ];

  const grammarRoot = materializeNativeSyntaxGrammar(memory, basis, {
    syntaxTag,
    markerSeed,
    rules,
  });
  const grammar = readNativeSyntaxGrammar(memory, basis, grammarRoot);
  const namespaceProfileRoot = materializeSourceNamespaceProfile(memory, {
    blockForm: forms.block,
    declarationForm: forms.declaration,
    blockItemRole: roles.blockItem,
    declarationNameRole: roles.declarationName,
    declarationBodyRole: roles.declarationBody,
  });
  const bootstrapProfileRoot = materializeV015RootBootstrapProfile(memory, {
    rootForm: forms.root,
    startForm: forms.start,
    endForm: forms.end,
    pairForm: forms.pair,
    nameRefForm: forms.nameRef,
    startChildRole: roles.startChild,
    endChildRole: roles.endChild,
    pairLeftRole: roles.pairLeft,
    pairRightRole: roles.pairRight,
    referencedNameRole: roles.referencedName,
  });
  const name = (value: string): LinkHandle =>
    materializeV012StringAnum(memory, basis, new TextEncoder().encode(value)).anumLink;

  return Object.freeze({
    memory,
    basis,
    grammarRoot,
    namespaceProfileRoot,
    bootstrapProfileRoot,
    grammar,
    forms,
    roles,
    name,
  });
}

interface BootstrapNames {
  readonly R: LinkHandle;
  readonly O: LinkHandle;
  readonly C: LinkHandle;
  readonly L: LinkHandle;
  readonly U: LinkHandle;
}

function names(f: Fixture, values: readonly [string, string, string, string, string]): BootstrapNames {
  return Object.freeze({
    R: f.name(values[0]),
    O: f.name(values[1]),
    C: f.name(values[2]),
    L: f.name(values[3]),
    U: f.name(values[4]),
  });
}

function buildBootstrap(
  f: Fixture,
  n: BootstrapNames,
  options: Readonly<{ swapPairs?: boolean; unknownPairRight?: LinkHandle }> = {},
): LinkHandle {
  const b = new SyntaxAsetBuilder(f.memory, f.grammar.vocabulary);
  const root = b.addOccurrence(f.forms.root, []);
  const declaration = (name: LinkHandle, body: LinkHandle): LinkHandle =>
    b.addOccurrence(f.forms.declaration, [
      { role: f.roles.declarationName, value: name },
      { role: f.roles.declarationBody, value: body },
    ]);
  const ref = (name: LinkHandle): LinkHandle =>
    b.addOccurrence(f.forms.nameRef, [
      { role: f.roles.referencedName, value: name },
    ]);
  const start = (child: LinkHandle): LinkHandle =>
    b.addOccurrence(f.forms.start, [{ role: f.roles.startChild, value: child }]);
  const end = (child: LinkHandle): LinkHandle =>
    b.addOccurrence(f.forms.end, [{ role: f.roles.endChild, value: child }]);
  const pair = (left: LinkHandle, right: LinkHandle): LinkHandle =>
    b.addOccurrence(f.forms.pair, [
      { role: f.roles.pairLeft, value: left },
      { role: f.roles.pairRight, value: right },
    ]);

  const dR = declaration(n.R, root);
  const dO = declaration(n.O, start(ref(n.R)));
  const dC = declaration(n.C, end(ref(n.R)));

  const lLeft = ref(options.swapPairs ? n.C : n.O);
  const lRight = ref(
    options.unknownPairRight ??
    (options.swapPairs ? n.O : n.C),
  );
  const dL = declaration(n.L, pair(lLeft, lRight));
  const dU = declaration(
    n.U,
    pair(
      ref(options.swapPairs ? n.O : n.C),
      ref(options.swapPairs ? n.C : n.O),
    ),
  );
  const block = b.addOccurrence(
    f.forms.block,
    [dR, dO, dC, dL, dU].map((value) => ({
      role: f.roles.blockItem,
      value,
    })),
  );
  return b.finish(block);
}

function resolve(f: Fixture, aset: LinkHandle): V015RootBootstrapRead {
  return resolveV015RootBootstrap(
    f.memory,
    f.basis,
    f.grammarRoot,
    f.namespaceProfileRoot,
    f.bootstrapProfileRoot,
    aset,
  );
}

function value(read: V015RootBootstrapRead, name: LinkHandle): LinkHandle {
  return read.bindings.find((binding) => binding.nameCarrier === name)?.value
    ?? (() => { throw new Error("v0.15 RootBasis bootstrap: missing binding"); })();
}

function assertBasis(read: V015RootBootstrapRead, n: BootstrapNames, basis: RootBasis): void {
  same(value(read, n.R), basis.R, "ROOT name resolves exact R");
  same(value(read, n.O), basis.O, "START(R) resolves exact O");
  same(value(read, n.C), basis.C, "END(R) resolves exact C");
  same(value(read, n.L), basis.L, "PAIR(O,C) resolves exact L");
  same(value(read, n.U), basis.U, "PAIR(C,O) resolves exact U");
}

{
  const f = fixture();
  const n = names(f, ["R", "O", "C", "L", "U"]);
  const aset = buildBootstrap(f, n);
  const before = f.memory.linkCount;
  const read = resolve(f, aset);
  same(f.memory.linkCount, before, "bootstrap resolution is read-only");
  same(read.bindings.length, 5, "five foundational definitions");
  assertBasis(read, n, f.basis);

  for (const [name, expectedWire] of [
    [n.R, "8"],
    [n.O, "98"],
    [n.C, "68"],
    [n.L, "19868"],
    [n.U, "16898"],
  ] as const) {
    const semantic = value(read, name);
    const carrier = materializeV013HierarchicalCarrierFromSemanticLink(
      f.memory,
      f.basis,
      semantic,
    );
    same(
      text(serializeV013HierarchicalCarrier(f.memory, f.basis, carrier)),
      expectedWire,
      `AC10 differential ${expectedWire}`,
    );
  }
}

{
  const f = fixture(true);
  const n = names(f, ["root", "open", "close", "direct", "inverse"]);
  const read = resolve(f, buildBootstrap(f, n));
  assertBasis(read, n, f.basis);
}

{
  const a = fixture(false);
  const b = fixture(true);
  const an = names(a, ["R", "O", "C", "L", "U"]);
  const bn = names(b, ["R", "O", "C", "L", "U"]);
  const ar = resolve(a, buildBootstrap(a, an));
  const br = resolve(b, buildBootstrap(b, bn));
  assert(a.memory !== b.memory, "independent Memories remain separate authorities");
  assertBasis(ar, an, a.basis);
  assertBasis(br, bn, b.basis);
}

{
  const f = fixture();
  const n = names(f, ["R", "O", "C", "L", "U"]);
  const read = resolve(f, buildBootstrap(f, n, { swapPairs: true }));
  same(value(read, n.L), f.basis.U, "textual L has no intrinsic direct-link authority");
  same(value(read, n.U), f.basis.L, "textual U has no intrinsic inverse-link authority");
}

{
  const f = fixture();
  const n = names(f, ["R", "O", "C", "L", "U"]);
  const unknown = f.name("UNKNOWN");
  reject(
    "unbound-name",
    () => resolve(f, buildBootstrap(f, n, { unknownPairRight: unknown })),
    "unknown name fails closed",
  );
}

{
  const f = fixture();
  const p = readV015RootBootstrapProfile(
    f.memory,
    f.basis,
    f.grammarRoot,
    f.bootstrapProfileRoot,
  );
  same(p.rootForm, f.forms.root, "structural bootstrap profile replay");

  const malformed = materializeV015RootBootstrapProfile(f.memory, {
    ...p,
    rootForm: f.forms.start,
  });
  reject(
    "invalid-profile",
    () => readV015RootBootstrapProfile(f.memory, f.basis, f.grammarRoot, malformed),
    "duplicate structural forms fail closed",
  );
}

{
  const f = fixture();
  const sameName = f.name("R");
  const b = new SyntaxAsetBuilder(f.memory, f.grammar.vocabulary);
  const root = b.addOccurrence(f.forms.root, []);
  const declaration = (body: LinkHandle): LinkHandle =>
    b.addOccurrence(f.forms.declaration, [
      { role: f.roles.declarationName, value: sameName },
      { role: f.roles.declarationBody, value: body },
    ]);
  const d1 = declaration(root);
  const d2 = declaration(root);
  const block = b.addOccurrence(f.forms.block, [d1, d2].map((value) => ({
    role: f.roles.blockItem,
    value,
  })));
  const aset = b.finish(block);
  let rejected = false;
  try {
    resolve(f, aset);
  } catch (error) {
    assert(error instanceof SourceNamespaceError, "duplicate name rejected by #1919 boundary");
    same(error.code, "duplicate-local-name", "exact duplicate-name error");
    rejected = true;
  }
  assert(rejected, "duplicate local name must fail closed");
}

console.log([
  "MTS v0.15 B0 RootBasis FORMAL bootstrap:",
  "SOURCE=CANONICAL_SYNTAX_ASET",
  "NAME_CARRIER=V012_STRING_ANUM",
  "R_O_C_L_U=EXACT_VERIFIED_ROOT_BASIS",
  "TEXTUAL_ROOT_NAMES=NOT_INTRINSIC_AUTHORITY",
  "ALTERNATE_NAMES=SAME_DENOTATION",
  "CROSS_MEMORY=GREEN",
  "AC10_8_9_6_1_DIFFERENTIAL=GREEN",
  "RESOLUTION=READ_ONLY",
].join(" "));
