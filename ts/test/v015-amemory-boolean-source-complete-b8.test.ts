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
  if (!condition) {
    throw new Error(`v0.15 B8 source-complete amemory logic: ${message}`);
  }
}
function same<T>(actual: T, expected: T, message: string): void {
  assert(
    Object.is(actual, expected),
    `${message}: ${String(actual)} !== ${String(expected)}`,
  );
}
function sameBytes(
  actual: Uint8Array,
  expected: Uint8Array,
  message: string,
): void {
  same(actual.length, expected.length, `${message}: length`);
  for (let i = 0; i < actual.length; i += 1) {
    same(actual[i], expected[i], `${message}: byte ${i}`);
  }
}
interface Fixture {
  readonly memory: Memory;
  readonly basis: RootBasis;
  readonly grammarRoot: LinkHandle;
  readonly namespaceProfileRoot: LinkHandle;
  readonly definitionProfileRoot: LinkHandle;
  readonly fresh: () => LinkHandle;
}
function fixture(noise = 0): Fixture {
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  let cursor = memory.ensure(basis.U, basis.L);
  for (let index = 0; index < noise; index += 1) {
    cursor = memory.ensure(
      cursor,
      index % 2 === 0 ? basis.O : basis.C,
    );
  }
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
      fields: [{
        role: referencedNameRole,
        target: "carrier",
        min: 1,
        max: 1,
      }],
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
      fields: [{
        role: blockItemRole,
        target: "child",
        min: 0,
        max: null,
      }],
    },
    {
      form: sequenceForm,
      fields: [{
        role: sequenceItemRole,
        target: "child",
        min: 0,
        max: null,
      }],
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
  "T : O->C",
  "F : C->O",
  "ARGS_F : [F]",
  "ARGS_T : [T]",
  "ARGS_FF : [F,F]",
  "ARGS_FT : [F,T]",
  "ARGS_TF : [T,F]",
  "ARGS_TT : [T,T]",
  "OUT_F : [F]",
  "OUT_T : [T]",
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
function nameCarrier(f: Fixture, name: string): LinkHandle {
  return materializeV012StringAnum(
    f.memory,
    f.basis,
    enc.encode(name),
  ).anumLink;
}
function definition(
  f: Fixture,
  result: V015FormalRecursiveCompileResult,
  name: string,
) {
  const key = nameCarrier(f, name);
  const found = result.definitions.find(
    (entry) => entry.nameCarrier === key,
  );
  assert(found !== undefined, `compiled definition ${name}`);
  assert(found.wire.length > 0, `${name} has recursive wire`);
  return found;
}
type BinaryName = "AND" | "OR" | "XOR";
type BinaryRow = "FF" | "FT" | "TF" | "TT";
interface Runtime {
  readonly compiled: V015FormalRecursiveCompileResult;
  readonly AND: LinkHandle;
  readonly OR: LinkHandle;
  readonly XOR: LinkHandle;
  readonly NOT: LinkHandle;
  readonly theory: LinkHandle;
  readonly interpreter: LinkHandle;
  readonly foreignInterpreter: LinkHandle;
  readonly argsF: LinkHandle;
  readonly argsT: LinkHandle;
  readonly argsFF: LinkHandle;
  readonly argsFT: LinkHandle;
  readonly argsTF: LinkHandle;
  readonly argsTT: LinkHandle;
  readonly outF: LinkHandle;
  readonly outT: LinkHandle;
}
function field(
  f: Fixture,
  r: V015FormalRecursiveCompileResult,
  name: string,
): LinkHandle {
  return definition(f, r, name).semantic;
}
function admitGateRow(
  f: Fixture,
  theory: LinkHandle,
  fn: LinkHandle,
  args: LinkHandle,
  outputCarrier: LinkHandle,
): void {
  const callerRole = f.fresh();
  // Exact retained amemory GateSet ABI:
  // caller -> (O -> (function -> ExactSequence(args)))
  const invocation = f.memory.ensure(
    f.basis.O,
    f.memory.ensure(fn, args),
  );
  const before = f.memory.ensure(callerRole, invocation);
  // Output carrier is supplied by FORMAL (OUT_F / OUT_T).
  const after = f.memory.ensure(callerRole, outputCarrier);
  // Generic reaction image bundle belongs to structural Rule machinery.
  const dictionary = defineStructuralRoleDictionary(
    f.memory,
    [callerRole],
  );
  const body = f.memory.ensure(
    before,
    materializeExactSequence(f.memory, [after]),
  );
  const rule = defineStructuralRule(
    f.memory,
    dictionary,
    body,
  );
  const admission = admitStructuralRule(
    f.memory,
    theory,
    rule,
  );
  // Current amemory logic_n.rs indexes gate rows under O.
  f.memory.ensure(f.basis.O, admission);
}
function runtime(
  f: Fixture,
  omit?: Readonly<{ fn: BinaryName; row: BinaryRow }>,
): Runtime {
  const compiled = compile(f);
  const AND = field(f, compiled, "AND");
  const OR = field(f, compiled, "OR");
  const XOR = field(f, compiled, "XOR");
  const NOT = field(f, compiled, "NOT");
  const theory = field(f, compiled, "THEORY");
  const interpreter = defineStructuralInterpreter(
    f.memory,
    field(f, compiled, "DICT"),
    field(f, compiled, "GRAM"),
    theory,
  );
  same(
    interpreter,
    field(f, compiled, "INTERP"),
    "FORMAL interpreter topology",
  );
  const foreignInterpreter = defineStructuralInterpreter(
    f.memory,
    field(f, compiled, "DICT"),
    field(f, compiled, "GRAM"),
    field(f, compiled, "FOREIGN_THEORY"),
  );
  same(
    foreignInterpreter,
    field(f, compiled, "FINTERP"),
    "FORMAL foreign interpreter topology",
  );
  const argsF = field(f, compiled, "ARGS_F");
  const argsT = field(f, compiled, "ARGS_T");
  const argsFF = field(f, compiled, "ARGS_FF");
  const argsFT = field(f, compiled, "ARGS_FT");
  const argsTF = field(f, compiled, "ARGS_TF");
  const argsTT = field(f, compiled, "ARGS_TT");
  const outF = field(f, compiled, "OUT_F");
  const outT = field(f, compiled, "OUT_T");
  const rows = [
    ["AND", "FF", AND, argsFF, outF],
    ["AND", "FT", AND, argsFT, outF],
    ["AND", "TF", AND, argsTF, outF],
    ["AND", "TT", AND, argsTT, outT],
    ["OR", "FF", OR, argsFF, outF],
    ["OR", "FT", OR, argsFT, outT],
    ["OR", "TF", OR, argsTF, outT],
    ["OR", "TT", OR, argsTT, outT],
    ["XOR", "FF", XOR, argsFF, outF],
    ["XOR", "FT", XOR, argsFT, outT],
    ["XOR", "TF", XOR, argsTF, outT],
    ["XOR", "TT", XOR, argsTT, outF],
  ] as const;
  for (const [fnName, row, fn, args, output] of rows) {
    if (omit?.fn === fnName && omit.row === row) continue;
    admitGateRow(f, theory, fn, args, output);
  }
  admitGateRow(f, theory, NOT, argsF, outT);
  admitGateRow(f, theory, NOT, argsT, outF);
  return Object.freeze({
    compiled,
    AND,
    OR,
    XOR,
    NOT,
    theory,
    interpreter,
    foreignInterpreter,
    argsF,
    argsT,
    argsFF,
    argsFT,
    argsTF,
    argsTT,
    outF,
    outT,
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
  interpreter: LinkHandle,
  fn: LinkHandle,
  args: LinkHandle,
  outputCarrier: LinkHandle,
  label: string,
): LinkHandle {
  const caller = f.fresh();
  const request = f.memory.ensure(
    caller,
    f.memory.ensure(
      f.basis.O,
      f.memory.ensure(fn, args),
    ),
  );
  const cursor = scope(f, interpreter, request);
  const reaction = reactV013StructuralScope(
    f.memory,
    cursor,
    f.fresh(),
  );
  same(reaction.quiescent, false, `${label}: reacts`);
  same(reaction.handoffCount, 1, `${label}: one handoff`);
  const expected = f.memory.ensure(caller, outputCarrier);
  same(cursor.members().length, 1, `${label}: one successor`);
  same(cursor.members()[0], expected, `${label}: exact successor`);
  const stable = reactV013StructuralScope(
    f.memory,
    cursor,
    f.fresh(),
  );
  same(stable.quiescent, true, `${label}: quiescent after row`);
  return outputCarrier;
}
function binaryArgs(
  r: Runtime,
  aOne: boolean,
  bOne: boolean,
): LinkHandle {
  if (!aOne && !bOne) return r.argsFF;
  if (!aOne && bOne) return r.argsFT;
  if (aOne && !bOne) return r.argsTF;
  return r.argsTT;
}
function expectedBinaryOne(
  name: BinaryName,
  aOne: boolean,
  bOne: boolean,
): boolean {
  if (name === "AND") return aOne && bOne;
  if (name === "OR") return aOne || bOne;
  return aOne !== bOne;
}
function runWordBinary(
  f: Fixture,
  r: Runtime,
  name: BinaryName,
  a: number,
  b: number,
  label: string,
): number {
  const fn = name === "AND" ? r.AND : name === "OR" ? r.OR : r.XOR;
  let result = 0;
  for (let bit = 0; bit < 32; bit += 1) {
    const aOne = ((a >>> bit) & 1) === 1;
    const bOne = ((b >>> bit) & 1) === 1;
    const out = expectedBinaryOne(name, aOne, bOne)
      ? r.outT
      : r.outF;
    const actual = runGate(
      f,
      r,
      r.interpreter,
      fn,
      binaryArgs(r, aOne, bOne),
      out,
      `${label}/bit${bit}`,
    );
    if (actual === r.outT) result = (result | (1 << bit)) >>> 0;
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
    const one = ((a >>> bit) & 1) === 1;
    const actual = runGate(
      f,
      r,
      r.interpreter,
      r.NOT,
      one ? r.argsT : r.argsF,
      one ? r.outF : r.outT,
      `${label}/bit${bit}`,
    );
    if (actual === r.outT) result = (result | (1 << bit)) >>> 0;
  }
  return result >>> 0;
}
{
  const f = fixture();
  const r = runtime(f);
  // Host ExactSequence construction is differential oracle only.
  same(
    r.argsF,
    materializeExactSequence(f.memory, [f.basis.U]),
    "FORMAL ARGS_F equals canonical host sequence",
  );
  same(
    r.argsT,
    materializeExactSequence(f.memory, [f.basis.L]),
    "FORMAL ARGS_T equals canonical host sequence",
  );
  same(
    r.argsFF,
    materializeExactSequence(f.memory, [f.basis.U, f.basis.U]),
    "FORMAL ARGS_FF equals canonical host sequence",
  );
  same(
    r.argsFT,
    materializeExactSequence(f.memory, [f.basis.U, f.basis.L]),
    "FORMAL ARGS_FT equals canonical host sequence",
  );
  same(
    r.argsTF,
    materializeExactSequence(f.memory, [f.basis.L, f.basis.U]),
    "FORMAL ARGS_TF equals canonical host sequence",
  );
  same(
    r.argsTT,
    materializeExactSequence(f.memory, [f.basis.L, f.basis.L]),
    "FORMAL ARGS_TT equals canonical host sequence",
  );
  same(
    r.outF,
    materializeExactSequence(f.memory, [f.basis.U]),
    "FORMAL OUT_F equals canonical host singleton",
  );
  same(
    r.outT,
    materializeExactSequence(f.memory, [f.basis.L]),
    "FORMAL OUT_T equals canonical host singleton",
  );
  assert(r.argsFT !== r.argsTF, "FORMAL binary sequence order preserved");
  const ft = readExactSequence(f.memory, r.argsFT).values;
  same(ft[0], f.basis.U, "ARGS_FT[0]=F/U");
  same(ft[1], f.basis.L, "ARGS_FT[1]=T/L");
  for (const [name, fn, rows] of [
    ["AND", r.AND, [
      [r.argsFF, r.outF],
      [r.argsFT, r.outF],
      [r.argsTF, r.outF],
      [r.argsTT, r.outT],
    ]],
    ["OR", r.OR, [
      [r.argsFF, r.outF],
      [r.argsFT, r.outT],
      [r.argsTF, r.outT],
      [r.argsTT, r.outT],
    ]],
    ["XOR", r.XOR, [
      [r.argsFF, r.outF],
      [r.argsFT, r.outT],
      [r.argsTF, r.outT],
      [r.argsTT, r.outF],
    ]],
  ] as const) {
    for (const [args, output] of rows) {
      runGate(
        f,
        r,
        r.interpreter,
        fn,
        args,
        output,
        `${name} source-carrier row`,
      );
    }
  }
  runGate(
    f,
    r,
    r.interpreter,
    r.NOT,
    r.argsF,
    r.outT,
    "NOT(F)",
  );
  runGate(
    f,
    r,
    r.interpreter,
    r.NOT,
    r.argsT,
    r.outF,
    "NOT(T)",
  );
}
{
  const f = fixture();
  const r = runtime(f);
  // Missing Apply=O envelope must remain passive.
  const caller = f.fresh();
  const plain = f.memory.ensure(r.OR, r.argsTT);
  const cursor = scope(
    f,
    r.interpreter,
    f.memory.ensure(caller, plain),
  );
  same(
    reactV013StructuralScope(f.memory, cursor, f.fresh()).quiescent,
    true,
    "Function->FORMAL Args without Apply=O is inert",
  );
}
{
  const f = fixture();
  const r = runtime(f, { fn: "XOR", row: "TT" });
  const caller = f.fresh();
  const request = f.memory.ensure(
    caller,
    f.memory.ensure(
      f.basis.O,
      f.memory.ensure(r.XOR, r.argsTT),
    ),
  );
  const cursor = scope(f, r.interpreter, request);
  same(
    reactV013StructuralScope(f.memory, cursor, f.fresh()).quiescent,
    true,
    "missing XOR/TT row has no fallback",
  );
}
{
  const f = fixture();
  const r = runtime(f);
  const caller = f.fresh();
  const request = f.memory.ensure(
    caller,
    f.memory.ensure(
      f.basis.O,
      f.memory.ensure(r.OR, r.argsTT),
    ),
  );
  const cursor = scope(f, r.foreignInterpreter, request);
  same(
    reactV013StructuralScope(f.memory, cursor, f.fresh()).quiescent,
    true,
    "FORMAL gate rows inert under foreign selected Theory",
  );
}
{
  // Retained amemory Scenario manifests, replayed through FORMAL-produced
  // argument/result carriers and structural GateSet-compatible rows.
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
  const notVectors = [
    [0x00000000, 0xffffffff],
    [0xffffffff, 0x00000000],
    [0x12345678, 0xedcba987],
    [0x00000000, 0xffffffff],
  ] as const;
  const f = fixture();
  const r = runtime(f);
  for (const [name, a, b, expected] of binaryVectors) {
    same(
      runWordBinary(
        f,
        r,
        name,
        a,
        b,
        `amemory ${name}32 manifest`,
      ),
      expected >>> 0,
      `amemory ${name}32 manifest result`,
    );
  }
  for (const [a, expected] of notVectors) {
    same(
      runWordNot(f, r, a, "amemory NOT32 manifest"),
      expected >>> 0,
      "amemory NOT32 manifest result",
    );
  }
}
{
  const a = fixture(0);
  const b = fixture(23);
  const ar = compile(a);
  const br = compile(b);
  for (const name of [
    "ARGS_F",
    "ARGS_T",
    "ARGS_FF",
    "ARGS_FT",
    "ARGS_TF",
    "ARGS_TT",
    "OUT_F",
    "OUT_T",
    "AND",
    "OR",
    "XOR",
    "NOT",
    "THEORY",
    "INTERP",
  ]) {
    sameBytes(
      definition(a, ar, name).wire,
      definition(b, br, name).wire,
      `${name}: deterministic recursive wire`,
    );
  }
}
console.log([
  "MTS v0.15 B8 source-complete amemory logic:",
  `AMEMORY_MAIN=${AMEMORY_ORACLE.main}`,
  `AMEMORY_VERSION=${AMEMORY_ORACLE.version}`,
  "ARGS_FROM_FORMAL=TRUE",
  "RESULT_CARRIERS_FROM_FORMAL=TRUE",
  "HOST_SEQUENCE=DIFFERENTIAL_ORACLE_ONLY",
  "ZERO=U",
  "ONE=L",
  "APPLY=O",
  "AND_OR_XOR_NOT_ROWS=GREEN",
  "MISSING_ROW=NO_FALLBACK",
  "FOREIGN_THEORY=INERT",
  "PLAIN_FUNCTION_ARGS=INERT",
  "PINNED_LOGIC32_SCENARIOS=GREEN",
  "CROSS_MEMORY_8961=DETERMINISTIC",
].join(" "));
