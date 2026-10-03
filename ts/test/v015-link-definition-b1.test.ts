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
  materializeSourceNamespaceProfile,
} from "../src/source-namespace.js";
import {
  SyntaxAsetBuilder,
} from "../src/syntax-aset-contract.js";
import {
  V015LinkDefinitionError,
  evaluateV015LinkIdentityEquality,
  materializeV015LinkDefinitionProfile,
  materializeV015LinkDefinitions,
  type V015LinkDefinitionRead,
} from "../src/v015-link-definition.js";
import { materializeV012StringAnum } from "../src/v012-string-anum.js";
import {
  materializeV013HierarchicalCarrierFromSemanticLink,
  serializeV013HierarchicalCarrier,
} from "../src/v013-hierarchical-carrier.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.15 B1 definitions: ${message}`);
}
function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}
function reject(
  code: V015LinkDefinitionError["code"],
  effect: () => unknown,
  label: string,
): void {
  try { effect(); } catch (error) {
    assert(error instanceof V015LinkDefinitionError, `${label}: wrong error type`);
    same(error.code, code, `${label}: exact error code`);
    return;
  }
  throw new Error(`v0.15 B1 definitions: ${label}: expected rejection`);
}

interface Fixture {
  readonly memory: Memory;
  readonly basis: RootBasis;
  readonly grammarRoot: LinkHandle;
  readonly namespaceProfileRoot: LinkHandle;
  readonly definitionProfileRoot: LinkHandle;
  readonly grammar: ReturnType<typeof readNativeSyntaxGrammar>;
  readonly forms: Readonly<{
    pair: LinkHandle;
    nameRef: LinkHandle;
    declaration: LinkHandle;
    block: LinkHandle;
  }>;
  readonly roles: Readonly<{
    left: LinkHandle;
    right: LinkHandle;
    referencedName: LinkHandle;
    declarationName: LinkHandle;
    declarationBody: LinkHandle;
    blockItem: LinkHandle;
  }>;
  readonly name: (value: string) => LinkHandle;
}

function fixture(): Fixture {
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  let cursor = memory.ensure(basis.U, basis.L);
  const fresh = (): LinkHandle => (cursor = memory.ensure(cursor, basis.C));
  const syntaxTag = fresh();
  const markerSeed = fresh();
  const forms = Object.freeze({
    pair: fresh(),
    nameRef: fresh(),
    declaration: fresh(),
    block: fresh(),
  });
  const roles = Object.freeze({
    left: fresh(),
    right: fresh(),
    referencedName: fresh(),
    declarationName: fresh(),
    declarationBody: fresh(),
    blockItem: fresh(),
  });
  const rules: readonly NativeSyntaxGrammarRuleSpec[] = [
    {
      form: forms.pair,
      fields: [
        { role: roles.left, target: "child", min: 1, max: 1 },
        { role: roles.right, target: "child", min: 1, max: 1 },
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
  const definitionProfileRoot = materializeV015LinkDefinitionProfile(memory, {
    pairForm: forms.pair,
    nameRefForm: forms.nameRef,
    pairLeftRole: roles.left,
    pairRightRole: roles.right,
    referencedNameRole: roles.referencedName,
  });
  const cache = new Map<string, LinkHandle>();
  const name = (value: string): LinkHandle => {
    const known = cache.get(value);
    if (known !== undefined) return known;
    const carrier = materializeV012StringAnum(
      memory,
      basis,
      new TextEncoder().encode(value),
    ).anumLink;
    cache.set(value, carrier);
    return carrier;
  };
  return Object.freeze({
    memory,
    basis,
    grammarRoot,
    namespaceProfileRoot,
    definitionProfileRoot,
    grammar,
    forms,
    roles,
    name,
  });
}

function pairSource(expression: string): readonly [string, string] {
  const direct = expression.indexOf("->");
  if (direct >= 0) {
    assert(expression.indexOf("->", direct + 2) < 0, "B1 adapter accepts one direct constructor");
    const left = expression.slice(0, direct).trim();
    const right = expression.slice(direct + 2).trim();
    assert(left.length > 0 && right.length > 0, "direct constructor has two names");
    return Object.freeze([left, right]);
  }
  const open = expression.indexOf("(");
  const close = expression.lastIndexOf(")");
  assert(
    open > 0 &&
    close === expression.length - 1 &&
    expression.indexOf("(", open + 1) < 0,
    "B1 adapter accepts one parenthesized constructor",
  );
  const left = expression.slice(0, open).trim();
  const right = expression.slice(open + 1, close).trim();
  assert(left.length > 0 && right.length > 0, "parenthesized constructor has two names");
  return Object.freeze([left, right]);
}

function lowerJsonFixture(f: Fixture, json: string): LinkHandle {
  const decoded = JSON.parse(json) as Record<string, unknown>;
  assert(
    decoded !== null && typeof decoded === "object" && !Array.isArray(decoded),
    "fixture JSON is an object",
  );
  const builder = new SyntaxAsetBuilder(f.memory, f.grammar.vocabulary);
  const declarations: LinkHandle[] = [];
  const ref = (name: string): LinkHandle =>
    builder.addOccurrence(f.forms.nameRef, [
      { role: f.roles.referencedName, value: f.name(name) },
    ]);
  for (const [localName, source] of Object.entries(decoded)) {
    assert(typeof source === "string", "fixture RHS is FORMAL source text");
    const [leftName, rightName] = pairSource(source);
    const left = ref(leftName);
    const right = ref(rightName);
    const body = builder.addOccurrence(f.forms.pair, [
      { role: f.roles.left, value: left },
      { role: f.roles.right, value: right },
    ]);
    const declaration = builder.addOccurrence(f.forms.declaration, [
      { role: f.roles.declarationName, value: f.name(localName) },
      { role: f.roles.declarationBody, value: body },
    ]);
    declarations.push(declaration);
  }
  const root = builder.addOccurrence(
    f.forms.block,
    declarations.map((value) => ({ role: f.roles.blockItem, value })),
  );
  return builder.finish(root);
}

function resolve(f: Fixture, aset: LinkHandle): V015LinkDefinitionRead {
  return materializeV015LinkDefinitions(
    f.memory,
    f.basis,
    f.grammarRoot,
    f.namespaceProfileRoot,
    f.definitionProfileRoot,
    aset,
  );
}

function value(
  f: Fixture,
  read: V015LinkDefinitionRead,
  name: string,
): LinkHandle {
  const carrier = f.name(name);
  const found = read.definitions.find((definition) => definition.nameCarrier === carrier);
  assert(found !== undefined, `binding exists for ${name}`);
  return found.value;
}

const latinJson = JSON.stringify({
  R: "R->R",
  O: "O->R",
  C: "R->C",
  L: "O->C",
  U: "C->O",
});
const unicodeJson = JSON.stringify({
  "∞": "∞(∞)",
  "♂∞": "♂∞(∞)",
  "∞♀": "∞(∞♀)",
  "⟼": "♂∞(∞♀)",
  "↛": "∞♀(♂∞)",
});

{
  const f = fixture();
  const latinAset = lowerJsonFixture(f, latinJson);
  const unicodeAset = lowerJsonFixture(f, unicodeJson);
  const before = f.memory.linkCount;
  const latin = resolve(f, latinAset);
  same(f.memory.linkCount, before, "Latin definitions reuse pre-existing RootBasis");
  const unicode = resolve(f, unicodeAset);
  same(f.memory.linkCount, before, "Unicode definitions reuse pre-existing RootBasis");

  same(value(f, latin, "R"), f.basis.R, "R self/self -> exact ROOT");
  same(value(f, latin, "O"), f.basis.O, "O self/start -> exact O");
  same(value(f, latin, "C"), f.basis.C, "C self/end -> exact C");
  same(value(f, latin, "L"), f.basis.L, "L ordinary pair -> exact L");
  same(value(f, latin, "U"), f.basis.U, "U ordinary pair -> exact U");

  same(value(f, unicode, "∞"), f.basis.R, "∞(∞) -> exact ROOT");
  same(value(f, unicode, "♂∞"), f.basis.O, "♂∞(∞) -> exact O");
  same(value(f, unicode, "∞♀"), f.basis.C, "∞(∞♀) -> exact C");
  same(value(f, unicode, "⟼"), f.basis.L, "♂∞(∞♀) -> exact L");
  same(value(f, unicode, "↛"), f.basis.U, "∞♀(♂∞) -> exact U");

  for (const [left, right] of [
    ["R", "∞"],
    ["O", "♂∞"],
    ["C", "∞♀"],
    ["L", "⟼"],
    ["U", "↛"],
  ] as const) {
    const result = evaluateV015LinkIdentityEquality(
      f.memory,
      f.basis,
      value(f, latin, left),
      value(f, unicode, right),
    );
    same(result, f.basis.L, `${left} = ${right} returns exact L`);
  }
  same(
    evaluateV015LinkIdentityEquality(
      f.memory,
      f.basis,
      value(f, latin, "R"),
      value(f, latin, "O"),
    ),
    f.basis.U,
    "distinct Link identity returns exact U",
  );

  for (const [name, expectedWire] of [
    ["R", "8"],
    ["O", "98"],
    ["C", "68"],
    ["L", "19868"],
    ["U", "16898"],
  ] as const) {
    const carrier = materializeV013HierarchicalCarrierFromSemanticLink(
      f.memory,
      f.basis,
      value(f, latin, name),
    );
    same(
      new TextDecoder().decode(
        serializeV013HierarchicalCarrier(f.memory, f.basis, carrier),
      ),
      expectedWire,
      `${name} agrees with AC10 recursive representation`,
    );
  }
}

{
  const f = fixture();
  const reversed = JSON.stringify({
    U: "C->O",
    L: "O->C",
    C: "R->C",
    O: "O->R",
    R: "R->R",
  });
  const read = resolve(f, lowerJsonFixture(f, reversed));
  same(value(f, read, "R"), f.basis.R, "JSON member order is not RootBasis authority");
  same(value(f, read, "O"), f.basis.O, "dependency iteration resolves O");
  same(value(f, read, "C"), f.basis.C, "dependency iteration resolves C");
  same(value(f, read, "L"), f.basis.L, "dependency iteration resolves L");
  same(value(f, read, "U"), f.basis.U, "dependency iteration resolves U");
}

{
  const f = fixture();
  const aliases = resolve(
    f,
    lowerJsonFixture(f, JSON.stringify({
      A: "A->A",
      B: "B(B)",
    })),
  );
  same(value(f, aliases, "A"), f.basis.R, "first self/self definition canonicalizes to ROOT");
  same(value(f, aliases, "B"), f.basis.R, "second self/self name aliases same ROOT");
  same(
    evaluateV015LinkIdentityEquality(
      f.memory,
      f.basis,
      value(f, aliases, "A"),
      value(f, aliases, "B"),
    ),
    f.basis.L,
    "different names for same recursively constructed Link compare to L",
  );
}

{
  const f = fixture();
  reject(
    "unbound-name",
    () => resolve(
      f,
      lowerJsonFixture(f, JSON.stringify({ A: "A->B" })),
    ),
    "unknown external name",
  );
}

{
  const f = fixture();
  reject(
    "unresolved-constraint",
    () => resolve(
      f,
      lowerJsonFixture(f, JSON.stringify({
        A: "B->C",
        B: "C->A",
        C: "A->B",
      })),
    ),
    "mutually unresolved non-self cycle",
  );
}

{
  const f = fixture();
  const altered = resolve(
    f,
    lowerJsonFixture(f, JSON.stringify({
      R: "R->R",
      O: "O->R",
      C: "R->C",
      L: "C->O",
      U: "O->C",
    })),
  );
  same(value(f, altered, "L"), f.basis.U, "textual L carries no intrinsic truth authority");
  same(value(f, altered, "U"), f.basis.L, "textual U carries no intrinsic false authority");
}

console.log([
  "MTS v0.15 B1 generic Link definitions:",
  "COLON_NE_EQUALITY=TRUE",
  "SELF_REFERENCE=BINDER_AWARE_RECURSIVE_LINK_CONSTRUCTION",
  "ROOT_START_END_PAIR_SPECIAL_FORMS=NOT_REQUIRED",
  "DIRECT_AND_PAREN_SOURCE_SPELLINGS=ONE_PAIR_FORM",
  "LATIN_AND_UNICODE_ROOT_BASIS=GREEN",
  "EQUALITY_RESULT=EXACT_L_OR_U_LINK",
  "JSON_MEMBER_ORDER=NOT_AUTHORITY",
  "AC10_DIFFERENTIAL=GREEN",
].join(" "));
