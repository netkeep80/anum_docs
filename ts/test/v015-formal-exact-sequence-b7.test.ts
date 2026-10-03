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
  V015LinkDefinitionError,
  materializeV015LinkDefinitionProfile,
} from "../src/v015-link-definition.js";
import {
  V015FormalDecodeError,
} from "../src/v015-formal-decoder.js";
import {
  compileV015FormalDefinitionsToRecursive,
  type V015FormalRecursiveCompileResult,
} from "../src/v015-formal-recursive-compiler.js";
import {
  materializeExactSequence,
  readExactSequence,
} from "../src/exact-sequence.js";
import { materializeV012StringAnum } from "../src/v012-string-anum.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.15 B7 FORMAL sequence: ${message}`);
}
function same<T>(actual: T, expected: T, message: string): void {
  assert(
    Object.is(actual, expected),
    `${message}: ${String(actual)} !== ${String(expected)}`,
  );
}
function reject(
  effect: () => unknown,
  label: string,
): void {
  let rejected = false;
  try {
    effect();
  } catch (error) {
    assert(
      error instanceof V015FormalDecodeError ||
      error instanceof V015LinkDefinitionError,
      `${label}: exact FORMAL/definition error type`,
    );
    rejected = true;
  }
  assert(rejected, `${label}: must fail closed`);
}

interface Fixture {
  readonly memory: Memory;
  readonly basis: RootBasis;
  readonly grammarRoot: LinkHandle;
  readonly namespaceProfileRoot: LinkHandle;
  readonly definitionProfileRoot: LinkHandle;
}

function fixture(noise = 0, sequence = true): Fixture {
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  let cursor = memory.ensure(basis.U, basis.L);
  for (let i = 0; i < noise; i += 1) {
    cursor = memory.ensure(cursor, i % 2 === 0 ? basis.O : basis.C);
  }
  const fresh = (): LinkHandle => (cursor = memory.ensure(cursor, basis.C));

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

  const rules: NativeSyntaxGrammarRuleSpec[] = [
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
      fields: [{ role: blockItemRole, target: "child", min: 0, max: null }],
    },
  ];
  if (sequence) {
    rules.push({
      form: sequenceForm,
      fields: [{
        role: sequenceItemRole,
        target: "child",
        min: 0,
        max: null,
      }],
    });
  }

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
  const definitionProfileRoot = materializeV015LinkDefinitionProfile(
    memory,
    sequence
      ? {
          pairForm,
          nameRefForm,
          pairLeftRole,
          pairRightRole,
          referencedNameRole,
          sequenceForm,
          sequenceItemRole,
        }
      : {
          pairForm,
          nameRefForm,
          pairLeftRole,
          pairRightRole,
          referencedNameRole,
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
  "T : O->C",
  "F : C->O",
  "EMPTY : []",
  "SINGLE_F : [F]",
  "SINGLE_T : [T]",
  "PAIR_FT : [F,T]",
  "PAIR_TF : [T,F]",
  "DUP_FF : [F,F]",
  "LINK_FT : F->T",
  "OR_SEED : R->U",
  "OR : OR_SEED->O",
  "ARGS_FT : [F,T]",
  "OUT_T : [T]",
  "OR_CALL : OR->ARGS_FT",
  "CALL_OR_FT : O->OR_CALL",
].join("\n");

function compile(
  f: Fixture,
  text = source,
): V015FormalRecursiveCompileResult {
  return compileV015FormalDefinitionsToRecursive(
    f.memory,
    f.basis,
    f.grammarRoot,
    f.namespaceProfileRoot,
    f.definitionProfileRoot,
    enc.encode(text),
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
  const carrier = nameCarrier(f, name);
  const found = result.definitions.find((entry) => entry.nameCarrier === carrier);
  assert(found !== undefined, `compiled definition exists for ${name}`);
  return found;
}

{
  const f = fixture();
  const result = compile(f);

  const empty = definition(f, result, "EMPTY").semantic;
  const singleF = definition(f, result, "SINGLE_F").semantic;
  const singleT = definition(f, result, "SINGLE_T").semantic;
  const pairFT = definition(f, result, "PAIR_FT").semantic;
  const pairTF = definition(f, result, "PAIR_TF").semantic;
  const dupFF = definition(f, result, "DUP_FF").semantic;
  const linkFT = definition(f, result, "LINK_FT").semantic;

  same(empty, f.basis.R, "[] lowers to exact empty sequence/root carrier");

  const sf = readExactSequence(f.memory, singleF).values;
  same(sf.length, 1, "[F] length");
  same(sf[0], f.basis.U, "[F][0] = F/U");

  const st = readExactSequence(f.memory, singleT).values;
  same(st.length, 1, "[T] length");
  same(st[0], f.basis.L, "[T][0] = T/L");

  const ft = readExactSequence(f.memory, pairFT).values;
  same(ft.length, 2, "[F,T] length");
  same(ft[0], f.basis.U, "[F,T][0]");
  same(ft[1], f.basis.L, "[F,T][1]");

  const tf = readExactSequence(f.memory, pairTF).values;
  same(tf.length, 2, "[T,F] length");
  same(tf[0], f.basis.L, "[T,F][0]");
  same(tf[1], f.basis.U, "[T,F][1]");
  assert(pairFT !== pairTF, "ExactSequence preserves order");

  const duplicate = readExactSequence(f.memory, dupFF).values;
  same(duplicate.length, 2, "[F,F] preserves multiplicity");
  same(duplicate[0], f.basis.U, "[F,F][0]");
  same(duplicate[1], f.basis.U, "[F,F][1]");
  assert(dupFF !== singleF, "[F,F] differs from [F]");

  same(
    linkFT,
    f.memory.ensure(f.basis.U, f.basis.L),
    "F->T remains ordinary Link",
  );
  assert(linkFT !== pairFT, "F->T is not ExactSequence [F,T]");

  same(
    pairFT,
    materializeExactSequence(f.memory, [f.basis.U, f.basis.L]),
    "FORMAL [F,T] equals canonical host ExactSequence carrier exactly",
  );
  same(
    singleT,
    materializeExactSequence(f.memory, [f.basis.L]),
    "FORMAL [T] equals canonical host ExactSequence carrier exactly",
  );

  const OR = definition(f, result, "OR").semantic;
  const args = definition(f, result, "ARGS_FT").semantic;
  const out = definition(f, result, "OUT_T").semantic;
  const term = definition(f, result, "OR_CALL").semantic;
  const call = definition(f, result, "CALL_OR_FT").semantic;

  same(args, pairFT, "ARGS_FT reuses exact [F,T] carrier");
  same(out, singleT, "OUT_T reuses exact [T] carrier");
  same(term, f.memory.ensure(OR, args), "OR_CALL = OR -> ExactSequence([F,T])");
  same(
    call,
    f.memory.ensure(f.basis.O, term),
    "CALL_OR_FT matches real amemory O -> (OR -> Args)",
  );
}

{
  const a = fixture(0);
  const b = fixture(19);
  const ar = compile(a);
  const br = compile(b);
  for (const name of [
    "EMPTY",
    "SINGLE_F",
    "PAIR_FT",
    "PAIR_TF",
    "DUP_FF",
    "CALL_OR_FT",
  ]) {
    const aw = definition(a, ar, name).wire;
    const bw = definition(b, br, name).wire;
    same(aw.length, bw.length, `${name}: cross-Memory wire length`);
    for (let i = 0; i < aw.length; i += 1) {
      same(aw[i], bw[i], `${name}: cross-Memory wire byte ${i}`);
    }
  }
}

{
  const legacy = fixture(0, false);
  const result = compile(
    legacy,
    [
      "R : R->R",
      "O : O->R",
      "C : R->C",
      "L : O->C",
      "U : C->O",
      "X : L->U",
    ].join("\n"),
  );
  same(
    definition(legacy, result, "X").semantic,
    legacy.memory.ensure(legacy.basis.L, legacy.basis.U),
    "legacy 5-position definition profile remains valid",
  );
  reject(
    () => compile(
      legacy,
      [
        "R : R->R",
        "O : O->R",
        "C : R->C",
        "L : O->C",
        "U : C->O",
        "S : [L,U]",
      ].join("\n"),
    ),
    "sequence source requires sequence-enabled structural profile",
  );
}

for (const malformed of [
  "S : [F,]",
  "S : [,F]",
  "S : [F,,T]",
  "S : [F",
  "S : F]",
  "S : [[F]]",
]) {
  const f = fixture();
  reject(
    () => compile(
      f,
      [
        "R : R->R",
        "O : O->R",
        "C : R->C",
        "L : O->C",
        "U : C->O",
        "T : O->C",
        "F : C->O",
        malformed,
      ].join("\n"),
    ),
    `malformed sequence ${malformed}`,
  );
}

{
  const f = fixture();
  reject(
    () => compile(
      f,
      [
        "R : R->R",
        "O : O->R",
        "C : R->C",
        "L : O->C",
        "U : C->O",
        "S : [MISSING]",
      ].join("\n"),
    ),
    "unknown sequence item fails during semantic resolution",
  );
}

console.log([
  "MTS v0.15 B7 FORMAL ExactSequence:",
  "EMPTY_SEQUENCE=R",
  "SINGLETON=GREEN",
  "ORDER=PRESERVED",
  "MULTIPLICITY=PRESERVED",
  "PAIR_NE_SEQUENCE=GREEN",
  "LEGACY_PROFILE=GREEN",
  "MALFORMED_SEQUENCE=FAIL_CLOSED",
  "CROSS_MEMORY_8961=DETERMINISTIC",
  "AMEMORY_ARGS_FT=FORMAL_SEQUENCE",
  "AMEMORY_CALL_O_FUNCTION_ARGS=GREEN",
].join(" "));
