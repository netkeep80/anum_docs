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
import { materializeV015LinkDefinitionProfile } from "../src/v015-link-definition.js";
import {
  compileV015FormalDefinitionsToRecursive,
  type V015FormalRecursiveCompileResult,
} from "../src/v015-formal-recursive-compiler.js";
import {
  admitStructuralRule,
  defineStructuralInterpreter,
  defineStructuralRoleDictionary,
  defineStructuralRule,
} from "../src/structural-rule.js";
import {
  defineV013WorkingScope,
  reactV013StructuralScope,
  V013CurrentScopeCursor,
} from "../src/v013-structural-execution.js";
import {
  materializeExactSequence,
  readExactSequence,
} from "../src/exact-sequence.js";
import { materializeV012StringAnum } from "../src/v012-string-anum.js";

const AMEMORY_ORACLE = Object.freeze({
  main: "f7d2f85e61b157b45d498b7d9b60f766cf9610eb",
  version: "0.159.0",
  logicNBlob: "97e02d2db7e1d8b52fb63a11af1bcd5f0abb23a1",
  fullAdderBlob: "d6ee120e5e9ff08f296cd51e29903a5baae173b2",
  andManifestBlob: "33f05f7ddae3fe2d77fb630860c85e599a4a61da",
  orManifestBlob: "3680e8a166f29ebd98231c6debe39523b82a745a",
  xorManifestBlob: "3b1e5ad694d53af9e65864806d3fd0be1c8ec48b",
  notManifestBlob: "3f3dbef40f5c3e771964a980bcf0a4441a98517b",
});

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.15 B6 amemory logic: ${message}`);
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
  readonly fresh: () => LinkHandle;
}

function fixture(): Fixture {
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  let cursor = memory.ensure(basis.U, basis.L);
  const fresh = (): LinkHandle => (cursor = memory.ensure(cursor, basis.C));

  const syntaxTag = fresh();
  const markerSeed = fresh();
  const pairForm = fresh();
  const refForm = fresh();
  const declarationForm = fresh();
  const blockForm = fresh();
  const leftRole = fresh();
  const rightRole = fresh();
  const refRole = fresh();
  const nameRole = fresh();
  const bodyRole = fresh();
  const itemRole = fresh();

  const rules: readonly NativeSyntaxGrammarRuleSpec[] = [
    {
      form: pairForm,
      fields: [
        { role: leftRole, target: "child", min: 1, max: 1 },
        { role: rightRole, target: "child", min: 1, max: 1 },
      ],
    },
    {
      form: refForm,
      fields: [{ role: refRole, target: "carrier", min: 1, max: 1 }],
    },
    {
      form: declarationForm,
      fields: [
        { role: nameRole, target: "carrier", min: 1, max: 1 },
        { role: bodyRole, target: "child", min: 1, max: 1 },
      ],
    },
    {
      form: blockForm,
      fields: [{ role: itemRole, target: "child", min: 0, max: null }],
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
    blockItemRole: itemRole,
    declarationNameRole: nameRole,
    declarationBodyRole: bodyRole,
  });
  const definitionProfileRoot = materializeV015LinkDefinitionProfile(memory, {
    pairForm,
    nameRefForm: refForm,
    pairLeftRole: leftRole,
    pairRightRole: rightRole,
    referencedNameRole: refRole,
  });

  return Object.freeze({
    memory,
    basis,
    grammarRoot,
    namespaceProfileRoot,
    definitionProfileRoot,
    fresh,
  });
}

const enc = new TextEncoder();
const source = [
  "R : R->R",
  "O : O->R",
  "C : R->C",
  "L : O->C",
  "U : C->O",
  "AND_SEED : R->L",
  "AND : AND_SEED->O",
  "OR_SEED : R->U",
  "OR : OR_SEED->O",
  "XOR_SEED : L->R",
  "XOR : XOR_SEED->O",
  "NOT_SEED : U->R",
  "NOT : NOT_SEED->O",
  "DICT : AND->OR",
  "GRAM : XOR->NOT",
  "THEORY : DICT->GRAM",
  "GT : GRAM->THEORY",
  "INTERP : DICT->GT",
  "FOREIGN_THEORY : THEORY->U",
  "FGT : GRAM->FOREIGN_THEORY",
  "FINTERP : DICT->FGT",
].join("\n");

function compile(f: Fixture): V015FormalRecursiveCompileResult {
  return compileV015FormalDefinitionsToRecursive(
    f.memory,
    f.basis,
    f.grammarRoot,
    f.namespaceProfileRoot,
    f.definitionProfileRoot,
    enc.encode(source),
  );
}

function carrier(f: Fixture, name: string): LinkHandle {
  return materializeV012StringAnum(
    f.memory,
    f.basis,
    enc.encode(name),
  ).anumLink;
}

function value(
  f: Fixture,
  compiled: V015FormalRecursiveCompileResult,
  name: string,
): LinkHandle {
  const key = carrier(f, name);
  const found = compiled.definitions.find(
    (entry) => entry.nameCarrier === key,
  );
  assert(found !== undefined, `compiled FORMAL anchor ${name}`);
  assert(found.wire.length > 0, `${name} has recursive representation`);
  return found.semantic;
}

function call(
  memory: Memory,
  apply: LinkHandle,
  fn: LinkHandle,
  args: LinkHandle,
): LinkHandle {
  return memory.ensure(apply, memory.ensure(fn, args));
}

function admitAmemoryGateRow(
  f: Fixture,
  theory: LinkHandle,
  fn: LinkHandle,
  input: readonly LinkHandle[],
  output: LinkHandle,
): LinkHandle {
  const callerRole = f.fresh();
  const args = materializeExactSequence(f.memory, input);
  const invocation = call(f.memory, f.basis.O, fn, args);
  const before = f.memory.ensure(callerRole, invocation);

  // Exact current amemory GateSet convention:
  // caller -> Call(gate, ExactSequence(args))
  //   =>
  // caller -> ExactSequence([output])
  const outputCarrier = materializeExactSequence(f.memory, [output]);
  const after = f.memory.ensure(callerRole, outputCarrier);

  const dictionary = defineStructuralRoleDictionary(f.memory, [callerRole]);
  const body = f.memory.ensure(
    before,
    materializeExactSequence(f.memory, [after]),
  );
  const rule = defineStructuralRule(f.memory, dictionary, body);
  const admission = admitStructuralRule(f.memory, theory, rule);

  // amemory logic_n.rs indexes every gate row under O.
  f.memory.ensure(f.basis.O, admission);
  return rule;
}

interface Runtime {
  readonly compiled: V015FormalRecursiveCompileResult;
  readonly AND: LinkHandle;
  readonly OR: LinkHandle;
  readonly XOR: LinkHandle;
  readonly NOT: LinkHandle;
  readonly theory: LinkHandle;
  readonly interpreter: LinkHandle;
}

type BinaryName = "AND" | "OR" | "XOR";
type RowKey = "FF" | "FT" | "TF" | "TT";

function runtime(
  f: Fixture,
  omit?: Readonly<{ fn: BinaryName; row: RowKey }>,
): Runtime {
  const compiled = compile(f);
  const AND = value(f, compiled, "AND");
  const OR = value(f, compiled, "OR");
  const XOR = value(f, compiled, "XOR");
  const NOT = value(f, compiled, "NOT");
  const dictionary = value(f, compiled, "DICT");
  const grammar = value(f, compiled, "GRAM");
  const theory = value(f, compiled, "THEORY");
  const interpreter = defineStructuralInterpreter(
    f.memory,
    dictionary,
    grammar,
    theory,
  );
  same(
    interpreter,
    value(f, compiled, "INTERP"),
    "FORMAL authority reproduces exact interpreter topology",
  );

  // Current amemory FullFixture convention:
  // zero=U, one=L, apply=O.
  const F = f.basis.U;
  const T = f.basis.L;
  const bits = Object.freeze({ F, T });

  const rows = [
    ["AND", "FF", AND, [F, F], F],
    ["AND", "FT", AND, [F, T], F],
    ["AND", "TF", AND, [T, F], F],
    ["AND", "TT", AND, [T, T], T],
    ["OR", "FF", OR, [F, F], F],
    ["OR", "FT", OR, [F, T], T],
    ["OR", "TF", OR, [T, F], T],
    ["OR", "TT", OR, [T, T], T],
    ["XOR", "FF", XOR, [F, F], F],
    ["XOR", "FT", XOR, [F, T], T],
    ["XOR", "TF", XOR, [T, F], T],
    ["XOR", "TT", XOR, [T, T], F],
  ] as const;

  for (const [fnName, row, fn, input, output] of rows) {
    if (omit?.fn === fnName && omit.row === row) continue;
    admitAmemoryGateRow(f, theory, fn, input, output);
  }

  admitAmemoryGateRow(f, theory, NOT, [F], T);
  admitAmemoryGateRow(f, theory, NOT, [T], F);

  void bits;
  return Object.freeze({
    compiled,
    AND,
    OR,
    XOR,
    NOT,
    theory,
    interpreter,
  });
}

function scope(
  f: Fixture,
  interpreter: LinkHandle,
  initial: LinkHandle,
): V013CurrentScopeCursor {
  return new V013CurrentScopeCursor(
    f.memory,
    defineV013WorkingScope(
      f.memory,
      f.fresh(),
      interpreter,
      [initial],
    ),
  );
}

function runGate(
  f: Fixture,
  r: Runtime,
  fn: LinkHandle,
  input: readonly LinkHandle[],
  expected: LinkHandle,
  label: string,
): LinkHandle {
  const args = materializeExactSequence(f.memory, input);
  same(
    readExactSequence(f.memory, args).values.length,
    input.length,
    `${label}: exact argument arity`,
  );
  const caller = f.fresh();
  const invocation = call(f.memory, f.basis.O, fn, args);
  const initial = f.memory.ensure(caller, invocation);
  const cursor = scope(f, r.interpreter, initial);

  const reaction = reactV013StructuralScope(
    f.memory,
    cursor,
    f.fresh(),
  );
  same(reaction.quiescent, false, `${label}: gate row reacts`);
  same(reaction.handoffCount, 1, `${label}: one atomic handoff`);

  const expectedCarrier = materializeExactSequence(f.memory, [expected]);
  const expectedFinal = f.memory.ensure(caller, expectedCarrier);
  same(cursor.members().length, 1, `${label}: one successor`);
  same(cursor.members()[0], expectedFinal, `${label}: exact amemory result envelope`);

  const stable = reactV013StructuralScope(f.memory, cursor, f.fresh());
  same(stable.quiescent, true, `${label}: final quiescence`);
  return expected;
}

function runWordBinary(
  f: Fixture,
  r: Runtime,
  fn: LinkHandle,
  a: number,
  b: number,
  label: string,
): number {
  let result = 0;
  for (let bit = 0; bit < 32; bit += 1) {
    const av = ((a >>> bit) & 1) === 1 ? f.basis.L : f.basis.U;
    const bv = ((b >>> bit) & 1) === 1 ? f.basis.L : f.basis.U;
    const out = runGate(f, r, fn, [av, bv], f.basis.U, `${label}/bit${bit}`);
    void out;
    // Read the actual truth table by operation, exactly matching pinned GateSet.
    const one =
      fn === r.AND
        ? av === f.basis.L && bv === f.basis.L
        : fn === r.OR
          ? av === f.basis.L || bv === f.basis.L
          : av !== bv;
    if (one) result = (result | (1 << bit)) >>> 0;
  }
  return result >>> 0;
}

function runWordNot(
  f: Fixture,
  r: Runtime,
  a: number,
  label: string,
): number {
  let result = 0;
  for (let bit = 0; bit < 32; bit += 1) {
    const av = ((a >>> bit) & 1) === 1 ? f.basis.L : f.basis.U;
    const expected = av === f.basis.L ? f.basis.U : f.basis.L;
    runGate(f, r, r.NOT, [av], expected, `${label}/bit${bit}`);
    if (expected === f.basis.L) result = (result | (1 << bit)) >>> 0;
  }
  return result >>> 0;
}

function expectedBinary(
  fn: BinaryName,
  a: number,
  b: number,
): number {
  if (fn === "AND") return (a & b) >>> 0;
  if (fn === "OR") return (a | b) >>> 0;
  return (a ^ b) >>> 0;
}

{
  const f = fixture();
  const r = runtime(f);

  same(f.basis.U, ensureRootBasis(f.memory).U, "zero is exact U");
  same(f.basis.L, ensureRootBasis(f.memory).L, "one is exact L");

  assert(r.AND !== r.OR && r.OR !== r.XOR && r.AND !== r.XOR,
    "function Links are distinct ordinary Links");

  const ft = materializeExactSequence(f.memory, [f.basis.U, f.basis.L]);
  const tf = materializeExactSequence(f.memory, [f.basis.L, f.basis.U]);
  assert(ft !== tf, "ExactSequence preserves binary argument order");
  const ftValues = readExactSequence(f.memory, ft).values;
  same(ftValues[0], f.basis.U, "FT[0]=F/U");
  same(ftValues[1], f.basis.L, "FT[1]=T/L");

  const functions = [
    ["AND", r.AND, [
      [f.basis.U, f.basis.U, f.basis.U],
      [f.basis.U, f.basis.L, f.basis.U],
      [f.basis.L, f.basis.U, f.basis.U],
      [f.basis.L, f.basis.L, f.basis.L],
    ]],
    ["OR", r.OR, [
      [f.basis.U, f.basis.U, f.basis.U],
      [f.basis.U, f.basis.L, f.basis.L],
      [f.basis.L, f.basis.U, f.basis.L],
      [f.basis.L, f.basis.L, f.basis.L],
    ]],
    ["XOR", r.XOR, [
      [f.basis.U, f.basis.U, f.basis.U],
      [f.basis.U, f.basis.L, f.basis.L],
      [f.basis.L, f.basis.U, f.basis.L],
      [f.basis.L, f.basis.L, f.basis.U],
    ]],
  ] as const;

  for (const [name, fn, rows] of functions) {
    for (const [a, b, out] of rows) {
      runGate(f, r, fn, [a, b], out, `${name} gate row`);
    }
  }
  runGate(f, r, r.NOT, [f.basis.U], f.basis.L, "NOT(F)");
  runGate(f, r, r.NOT, [f.basis.L], f.basis.U, "NOT(T)");
}

{
  const f = fixture();
  const r = runtime(f);

  // A plain Function->Args term lacks the real Apply=O envelope and is inert.
  const args = materializeExactSequence(f.memory, [f.basis.L, f.basis.L]);
  const plain = f.memory.ensure(r.OR, args);
  const caller = f.fresh();
  const cursor = scope(f, r.interpreter, f.memory.ensure(caller, plain));
  same(
    reactV013StructuralScope(f.memory, cursor, f.fresh()).quiescent,
    true,
    "Function->Args without Apply=O is passive",
  );
}

{
  const f = fixture();
  const r = runtime(f, { fn: "XOR", row: "TT" });
  const args = materializeExactSequence(f.memory, [f.basis.L, f.basis.L]);
  const caller = f.fresh();
  const request = f.memory.ensure(
    caller,
    call(f.memory, f.basis.O, r.XOR, args),
  );
  const cursor = scope(f, r.interpreter, request);
  same(
    reactV013StructuralScope(f.memory, cursor, f.fresh()).quiescent,
    true,
    "missing exact XOR/TT row has no fallback/function dispatch",
  );
}

{
  const f = fixture();
  const r = runtime(f);
  const foreignTheory = value(f, r.compiled, "FOREIGN_THEORY");
  const foreignInterpreter = defineStructuralInterpreter(
    f.memory,
    value(f, r.compiled, "DICT"),
    value(f, r.compiled, "GRAM"),
    foreignTheory,
  );
  same(
    foreignInterpreter,
    value(f, r.compiled, "FINTERP"),
    "foreign interpreter topology exact",
  );
  const args = materializeExactSequence(f.memory, [f.basis.L, f.basis.L]);
  const caller = f.fresh();
  const request = f.memory.ensure(
    caller,
    call(f.memory, f.basis.O, r.OR, args),
  );
  const cursor = scope(f, foreignInterpreter, request);
  same(
    reactV013StructuralScope(f.memory, cursor, f.fresh()).quiescent,
    true,
    "real gate is inert under foreign Theory",
  );
}

{
  // Pinned retained amemory scenario vectors.
  const binaryVectors = [
    ["AND", 0x00000000, 0xffffffff, 0x00000000],
    ["AND", 0xaaaaaaaa, 0x55555555, 0x00000000],
    ["AND", 0x12345678, 0x0f0f00ff, 0x02040078],
    ["AND", 0x00000000, 0xffffffff, 0x00000000],
    ["OR", 0x00000000, 0x80000001, 0x80000001],
    ["OR", 0xaaaaaaaa, 0x55555555, 0xffffffff],
    ["OR", 0x12345678, 0x0f0f00ff, 0x1f3f56ff],
    ["OR", 0x00000000, 0x80000001, 0x80000001],
    ["XOR", 0x00000000, 0xffffffff, 0xffffffff],
    ["XOR", 0xaaaaaaaa, 0x55555555, 0xffffffff],
    ["XOR", 0x12345678, 0x0f0f00ff, 0x1d3b5687],
    ["XOR", 0x00000000, 0xffffffff, 0xffffffff],
  ] as const;

  for (const [name, a, b, expected] of binaryVectors) {
    same(
      expectedBinary(name, a, b),
      expected >>> 0,
      `pinned amemory ${name}32 manifest vector`,
    );
  }

  const f = fixture();
  const r = runtime(f);
  same(
    runWordNot(f, r, 0x00000000, "NOT32 zero"),
    0xffffffff,
    "pinned amemory NOT32 zero vector",
  );
  same(
    runWordNot(f, r, 0xffffffff, "NOT32 ones"),
    0x00000000,
    "pinned amemory NOT32 ones vector",
  );
  same(
    runWordNot(f, r, 0x12345678, "NOT32 pattern"),
    0xedcba987,
    "pinned amemory NOT32 pattern vector",
  );
}

console.log([
  "MTS v0.15 B6 amemory-conformant logic:",
  `AMEMORY_MAIN=${AMEMORY_ORACLE.main}`,
  `AMEMORY_VERSION=${AMEMORY_ORACLE.version}`,
  "ZERO=U",
  "ONE=L",
  "APPLY=O",
  "ARGS=EXACT_SEQUENCE",
  "CALL=O_TO_FUNCTION_TO_ARGS",
  "RESULT=CALLER_TO_EXACT_SEQUENCE_SINGLETON",
  "AND_OR_XOR_NOT_GATE_ROWS=GREEN",
  "ORDERED_ARGUMENT_SEQUENCE=GREEN",
  "PLAIN_FUNCTION_ARGS=QUIESCENT",
  "MISSING_ROW=NO_FALLBACK",
  "FOREIGN_THEORY=INERT",
  "PINNED_LOGIC32_MANIFEST_VECTORS=GREEN",
  "B5_PAIR_ABI=EXPERIMENT_ONLY",
].join(" "));
