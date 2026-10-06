import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
  type RootBasis,
} from "../src/memory.js";
import {
  materializeNativeSyntaxGrammar,
  readNativeSyntaxGrammar,
  readSyntaxAsetWithNativeGrammar,
  type NativeSyntaxGrammarRuleSpec,
} from "../src/native-syntax-grammar.js";
import {
  materializeSourceNamespaceProfile,
  readSourceNamespaces,
} from "../src/source-namespace.js";
import {
  V015FormalDecodeError,
  decodeV015FormalDefinitions,
} from "../src/v015-formal-decoder.js";
import {
  evaluateV015LinkIdentityEquality,
  materializeV015ContextualNamePath,
  materializeV015LinkDefinitionProfile,
  materializeV015LinkDefinitions,
  type V015LinkDefinitionRead,
} from "../src/v015-link-definition.js";
import { materializeV012StringAnum } from "../src/v012-string-anum.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.15 B2 decoder: ${message}`);
}
function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}
function reject(
  code: V015FormalDecodeError["code"],
  effect: () => unknown,
  label: string,
): void {
  try { effect(); } catch (error) {
    assert(error instanceof V015FormalDecodeError, `${label}: wrong error type`);
    same(error.code, code, `${label}: exact error code`);
    return;
  }
  throw new Error(`v0.15 B2 decoder: ${label}: expected rejection`);
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
  const fresh = (): LinkHandle => (cursor = memory.ensure(cursor, basis.C));
  const syntaxTag = fresh();
  const markerSeed = fresh();
  const pairForm = fresh();
  const nameRefForm = fresh();
  const declarationForm = fresh();
  const blockForm = fresh();
  const leftRole = fresh();
  const rightRole = fresh();
  const referencedNameRole = fresh();
  const declarationNameRole = fresh();
  const declarationBodyRole = fresh();
  const blockItemRole = fresh();

  const rules: readonly NativeSyntaxGrammarRuleSpec[] = [
    {
      form: pairForm,
      fields: [
        { role: leftRole, target: "child", min: 1, max: 1 },
        { role: rightRole, target: "child", min: 1, max: 1 },
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
    pairLeftRole: leftRole,
    pairRightRole: rightRole,
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

const enc = new TextEncoder();
const latin = [
  "R : R->R",
  "O : O->R",
  "C : R->C",
  "L : O->C",
  "U : C->O",
].join("\n");
const unicode = [
  "∞ : ∞(∞)",
  "♂∞ : ♂∞(∞)",
  "∞♀ : ∞(∞♀)",
  "⟼ : ♂∞(∞♀)",
  "↛ : ∞♀(♂∞)",
].join("\n");

function decode(f: Fixture, source: string | Uint8Array) {
  return decodeV015FormalDefinitions(
    f.memory,
    f.basis,
    f.grammarRoot,
    f.namespaceProfileRoot,
    f.definitionProfileRoot,
    typeof source === "string" ? enc.encode(source) : source,
  );
}

function resolve(f: Fixture, sourceAset: LinkHandle): V015LinkDefinitionRead {
  return materializeV015LinkDefinitions(
    f.memory,
    f.basis,
    f.grammarRoot,
    f.namespaceProfileRoot,
    f.definitionProfileRoot,
    sourceAset,
  );
}

function carrier(f: Fixture, name: string): LinkHandle {
  return materializeV012StringAnum(f.memory, f.basis, enc.encode(name)).anumLink;
}

function value(f: Fixture, read: V015LinkDefinitionRead, name: string): LinkHandle {
  const key = carrier(f, name);
  const found = read.definitions.find((definition) => definition.nameCarrier === key);
  assert(found !== undefined, `binding exists for ${name}`);
  return found.value;
}

function assertLatinBasis(f: Fixture, read: V015LinkDefinitionRead): void {
  same(value(f, read, "R"), f.basis.R, "R -> exact R");
  same(value(f, read, "O"), f.basis.O, "O -> exact O");
  same(value(f, read, "C"), f.basis.C, "C -> exact C");
  same(value(f, read, "L"), f.basis.L, "L -> exact L");
  same(value(f, read, "U"), f.basis.U, "U -> exact U");
}

{
  const f = fixture();
  const decoded = decode(f, latin);
  same(decoded.definitionSpans.length, 5, "five Latin source definitions");
  same(decoded.definitionSpans[0]?.line, 1, "first definition line");
  same(decoded.definitionSpans[0]?.startByte, 0, "first physical line starts at byte 0");
  same(decoded.definitionSpans[0]?.endByte, 8, "first physical line byte extent");
  same(decoded.definitionSpans[0]?.nameStartByte, 0, "first name starts at byte 0");
  same(decoded.definitionSpans[0]?.nameEndByte, 1, "first name exact byte span");
  same(decoded.definitionSpans[0]?.bodyStartByte, 4, "first body start after ASCII spacing");
  same(decoded.definitionSpans[0]?.bodyEndByte, 8, "first body exact byte span");

  const replay = readSyntaxAsetWithNativeGrammar(
    f.memory,
    f.basis,
    f.grammarRoot,
    decoded.sourceAset,
  );
  assert(replay.occurrences.length > 0, "completed source Aset replays without parser state");
  assertLatinBasis(f, resolve(f, decoded.sourceAset));
}

{
  const f = fixture();
  const decoded = decode(f, unicode);
  const read = resolve(f, decoded.sourceAset);
  same(value(f, read, "∞"), f.basis.R, "Unicode ROOT name");
  same(value(f, read, "♂∞"), f.basis.O, "Unicode START name");
  same(value(f, read, "∞♀"), f.basis.C, "Unicode END name");
  same(value(f, read, "⟼"), f.basis.L, "Unicode direct name");
  same(value(f, read, "↛"), f.basis.U, "Unicode inverse name");
}

{
  const f = fixture();
  const direct = decode(f, "A : A->A");
  const parenthesized = decode(f, "A : A(A)");
  same(
    direct.sourceAset,
    parenthesized.sourceAset,
    "direct and parenthesized spelling normalize to exact same SyntaxAset",
  );
  assert(
    direct.sourceContent !== parenthesized.sourceContent,
    "physical source evidence remains distinct",
  );
}

{
  const f = fixture();
  const lf = decode(f, latin);
  const crlf = decode(f, latin.replaceAll("\n", "\r\n"));
  same(lf.sourceAset, crlf.sourceAset, "LF/CRLF logical source Aset parity");
  assert(lf.sourceContent !== crlf.sourceContent, "LF/CRLF physical bytes stay distinct");
}

{
  const f = fixture();
  const reversed = [
    "U : C->O",
    "L : O->C",
    "C : R->C",
    "O : O->R",
    "R : R->R",
  ].join("\n");
  assertLatinBasis(f, resolve(f, decode(f, reversed).sourceAset));
}

{
  const f = fixture();
  const first = decode(f, latin);
  const second = decode(f, unicode);
  const latinRead = resolve(f, first.sourceAset);
  const unicodeRead = resolve(f, second.sourceAset);
  for (const [a, b] of [
    ["R", "∞"],
    ["O", "♂∞"],
    ["C", "∞♀"],
    ["L", "⟼"],
    ["U", "↛"],
  ] as const) {
    same(
      evaluateV015LinkIdentityEquality(
        f.memory,
        f.basis,
        value(f, latinRead, a),
        value(f, unicodeRead, b),
      ),
      f.basis.L,
      `${a} = ${b} -> exact L`,
    );
  }
}

{
  const f = fixture();
  const source = [
    "é : é->é",
    "é : é->é",
  ].join("\n");
  const decoded = decode(f, source);
  const namespaces = readSourceNamespaces(
    f.memory,
    f.basis,
    f.grammarRoot,
    f.namespaceProfileRoot,
    decoded.sourceAset,
  );
  same(namespaces.declarations.length, 2, "canonically similar Unicode spellings remain separate");
  assert(
    namespaces.declarations[0]?.nameCarrier !== namespaces.declarations[1]?.nameCarrier,
    "no NFC normalization of exact name carriers",
  );
  const read = resolve(f, decoded.sourceAset);
  same(value(f, read, "é"), f.basis.R, "precomposed spelling resolves");
  same(value(f, read, "é"), f.basis.R, "decomposed spelling resolves independently");
}

for (const [label, source, code] of [
  ["empty", new Uint8Array(), "empty-document"],
  ["invalid utf8", Uint8Array.of(0xff), "invalid-utf8"],
  ["bare CR", enc.encode("A:A->A\rB:B->B"), "invalid-line-ending"],
  ["blank line", enc.encode("A:A->A\n\nB:B->B"), "empty-definition"],
  ["missing close", enc.encode("A:A(B"), "invalid-expression"],
  ["missing rhs", enc.encode("A:A->"), "invalid-name"],
  ["missing lhs", enc.encode(":A->B"), "invalid-name"],
  ["malformed contextual path", enc.encode("A : ::A->A"), "invalid-name"],
  ["extra close", enc.encode("A:A(B))"), "invalid-expression"],
  ["duplicate", enc.encode("A:A->A\nA:A(A)"), "duplicate-local-name"],
] as const) {
  const f = fixture();
  const before = f.memory.linkCount;
  reject(
    code,
    () => decode(f, source),
    label,
  );
  same(f.memory.linkCount, before, `${label}: syntax/preflight rejection writes no Links`);
}

{
  const f = fixture();
  const decoded = decode(f, "A : A->B");
  const before = f.memory.linkCount;
  let rejected = false;
  try {
    resolve(f, decoded.sourceAset);
  } catch {
    rejected = true;
  }
  assert(rejected, "unknown RHS name is syntax-valid but semantic resolution rejects");
  same(f.memory.linkCount, before, "unbound semantic rejection adds no Link");
}

{
  const f = fixture();
  const before = f.memory.linkCount;
  const decoded = decode(f, "A\t:\tA ( A )");
  assert(decoded.sourceAset !== undefined, "horizontal spacing around grammar tokens is accepted");
  assert(f.memory.linkCount > before, "successful decode publishes source Links");
  same(resolve(f, decoded.sourceAset).definitions[0]?.value, f.basis.R, "spaced form resolves");
}

{
  const f = fixture();
  const source = [
    "Abs : :Theory->:GroundRule",
    "Explicit : R:Theory->R:GroundRule",
    "Relative : K:A->K:A:B",
  ].join("\n");
  const decoded = decode(f, source);
  const read = resolve(f, decoded.sourceAset);

  const rootTheory = materializeV015ContextualNamePath(
    f.memory,
    f.basis,
    f.basis.R,
    [carrier(f, "Theory")],
    true,
  );
  const rootGroundRule = materializeV015ContextualNamePath(
    f.memory,
    f.basis,
    f.basis.R,
    [carrier(f, "GroundRule")],
    true,
  );
  const expectedAbsolutePair = f.memory.ensure(rootTheory, rootGroundRule);
  same(value(f, read, "Abs"), expectedAbsolutePair, ":Theory -> :GroundRule");
  same(
    value(f, read, "Explicit"),
    expectedAbsolutePair,
    "R:Theory -> R:GroundRule is identical to absolute shorthand",
  );

  const relativeKA = materializeV015ContextualNamePath(
    f.memory,
    f.basis,
    f.basis.R,
    [carrier(f, "K"), carrier(f, "A")],
    false,
  );
  const relativeKAB = materializeV015ContextualNamePath(
    f.memory,
    f.basis,
    f.basis.R,
    [carrier(f, "K"), carrier(f, "A"), carrier(f, "B")],
    false,
  );
  same(
    value(f, read, "Relative"),
    f.memory.ensure(relativeKA, relativeKAB),
    "relative contextual path K:A:B lowers through the shared Link-native resolver",
  );

  const compact = decode(f, "Compact::Theory->:GroundRule");
  const spaced = decode(f, "Compact : :Theory->:GroundRule");
  same(
    compact.sourceAset,
    spaced.sourceAset,
    "binder delimiter remains unambiguous when an absolute reference follows immediately",
  );
  same(
    value(f, resolve(f, compact.sourceAset), "Compact"),
    expectedAbsolutePair,
    "compact absolute reference resolves",
  );
}

console.log([
  "MTS v0.15 B2 FORMAL decoder:",
  "INPUT=UTF8_TEXT",
  "OUTPUT=CANONICAL_NATIVE_SYNTAX_ASET",
  "PERSISTENT_HOST_AST=0",
  "LATIN_ROOT_BASIS=GREEN",
  "UNICODE_ROOT_BASIS=GREEN",
  "DIRECT_PAREN_NORMALIZATION=SAME_SOURCE_ASET",
  "LF_CRLF_LOGICAL_PARITY=GREEN",
  "PHYSICAL_SOURCE_EVIDENCE=PRESERVED",
  "INVALID_SYNTAX_ZERO_WRITES=GREEN",
  "CONTEXTUAL_NAME_PATHS=GREEN",
  "ABSOLUTE_SHORTHAND_EQUIVALENCE=GREEN",
].join(" "));
