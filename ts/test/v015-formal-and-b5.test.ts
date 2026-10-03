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
import { defineStructuralInterpreter } from "../src/structural-rule.js";
import {
  defineV013WorkingScope,
  reactV013StructuralScope,
  V013CurrentScopeCursor,
} from "../src/v013-structural-execution.js";
import {
  defineV015GroundedUnaryEvaluationRule,
  defineV015UnaryEvaluationLifecycle,
  materializeV015EvaluationProfile,
  materializeV015RootEvaluationBoundary,
} from "../src/v015-formal-evaluation.js";
import { materializeV012StringAnum } from "../src/v012-string-anum.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.15 B5 FORMAL AND: ${message}`);
}
function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
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
    syntaxTag, markerSeed, rules,
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
    memory, basis, grammarRoot, namespaceProfileRoot, definitionProfileRoot, fresh,
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
  "AND_SEED : R->L",
  "AND : AND_SEED->O",
  "CALL : C->AND",
  "DONE : U->AND",
  "DICT : AND->CALL",
  "GRAM : DONE->AND",
  "THEORY : CALL->DONE",
  "GT : GRAM->THEORY",
  "INTERP : DICT->GT",
  "K : DICT->THEORY",
  "ARGS_FF : F->F",
  "ARGS_FT : F->T",
  "ARGS_TF : T->F",
  "ARGS_TT : T->T",
  "TERM_FF : AND->ARGS_FF",
  "TERM_FT : AND->ARGS_FT",
  "TERM_TF : AND->ARGS_TF",
  "TERM_TT : AND->ARGS_TT",
  "REQ_FF : CALL->TERM_FF",
  "REQ_FT : CALL->TERM_FT",
  "REQ_TF : CALL->TERM_TF",
  "REQ_TT : CALL->TERM_TT",
  "FOREIGN_CALL : O->AND",
  "FOREIGN_THEORY : DONE->CALL",
  "FGT : GRAM->FOREIGN_THEORY",
  "FINTERP : DICT->FGT",
].join("\n");

function compile(f: Fixture, text: string): V015FormalRecursiveCompileResult {
  return compileV015FormalDefinitionsToRecursive(
    f.memory, f.basis, f.grammarRoot,
    f.namespaceProfileRoot, f.definitionProfileRoot,
    enc.encode(text),
  );
}

function nameCarrier(f: Fixture, name: string): LinkHandle {
  return materializeV012StringAnum(f.memory, f.basis, enc.encode(name)).anumLink;
}

function value(
  f: Fixture,
  compiled: V015FormalRecursiveCompileResult,
  name: string,
): LinkHandle {
  const carrier = nameCarrier(f, name);
  const found = compiled.definitions.find((entry) => entry.nameCarrier === carrier);
  assert(found !== undefined, `compiled definition exists for ${name}`);
  return found.semantic;
}

interface Runtime {
  readonly compiled: V015FormalRecursiveCompileResult;
  readonly T: LinkHandle;
  readonly F: LinkHandle;
  readonly AND: LinkHandle;
  readonly CALL: LinkHandle;
  readonly DONE: LinkHandle;
  readonly theory: LinkHandle;
  readonly interpreter: LinkHandle;
  readonly K: LinkHandle;
  readonly profile: LinkHandle;
}

function runtime(f: Fixture, ttOnly = false): Runtime {
  const compiled = compile(f, source);
  const T = value(f, compiled, "T");
  const F = value(f, compiled, "F");
  const AND = value(f, compiled, "AND");
  const CALL = value(f, compiled, "CALL");
  const DONE = value(f, compiled, "DONE");
  const dictionary = value(f, compiled, "DICT");
  const grammar = value(f, compiled, "GRAM");
  const theory = value(f, compiled, "THEORY");
  const interpreter = defineStructuralInterpreter(f.memory, dictionary, grammar, theory);
  same(interpreter, value(f, compiled, "INTERP"), "FORMAL interpreter topology");
  const K = value(f, compiled, "K");
  const profile = materializeV015EvaluationProfile(f.memory, CALL, DONE);
  defineV015UnaryEvaluationLifecycle(f.memory, theory, profile, f.fresh());

  const rows = ttOnly
    ? [["ARGS_TT", T]] as const
    : [
        ["ARGS_FF", F],
        ["ARGS_FT", F],
        ["ARGS_TF", F],
        ["ARGS_TT", T],
      ] as const;
  for (const [argsName, output] of rows) {
    defineV015GroundedUnaryEvaluationRule(
      f.memory,
      theory,
      profile,
      f.fresh(),
      AND,
      value(f, compiled, argsName),
      output,
    );
  }

  return Object.freeze({
    compiled, T, F, AND, CALL, DONE, theory, interpreter, K, profile,
  });
}

function active(f: Fixture, K: LinkHandle, program: LinkHandle): LinkHandle {
  return f.memory.ensure(materializeV015RootEvaluationBoundary(f.memory, K), program);
}

function scope(
  f: Fixture,
  interpreter: LinkHandle,
  activeLink: LinkHandle,
): V013CurrentScopeCursor {
  return new V013CurrentScopeCursor(
    f.memory,
    defineV013WorkingScope(f.memory, f.fresh(), interpreter, [activeLink]),
  );
}

function run(
  f: Fixture,
  r: Runtime,
  request: LinkHandle,
  expected: LinkHandle,
  label: string,
): number {
  const cursor = scope(f, r.interpreter, active(f, r.K, request));
  let reactions = 0;
  while (true) {
    const step = reactV013StructuralScope(f.memory, cursor, f.fresh());
    if (step.quiescent) break;
    same(step.handoffCount, 1, `${label}: atomic handoff`);
    reactions += 1;
    assert(reactions < 8, `${label}: converges`);
  }
  const members = cursor.members();
  same(members.length, 1, `${label}: one stable result`);
  same(members[0], f.memory.ensure(r.K, expected), `${label}: exact result`);
  return reactions;
}

{
  const f = fixture();
  const r = runtime(f);
  same(r.T, f.basis.L, "T is exact L");
  same(r.F, f.basis.U, "F is exact U");
  assert(r.AND !== r.CALL, "function identity differs from CALL role");
  assert(r.AND !== r.DONE, "function identity differs from DONE role");
  assert(r.CALL !== r.DONE, "CALL and DONE remain distinct profile roles");

  const ft = value(f, r.compiled, "ARGS_FT");
  const tf = value(f, r.compiled, "ARGS_TF");
  assert(ft !== tf, "ordered argument pair preserves left/right distinction");

  const termFT = value(f, r.compiled, "TERM_FT");
  const termTF = value(f, r.compiled, "TERM_TF");
  assert(termFT !== termTF, "swapping arguments changes application term");

  const reqFT = value(f, r.compiled, "REQ_FT");
  const reqTF = value(f, r.compiled, "REQ_TF");
  assert(reqFT !== reqTF, "swapping arguments changes evaluation request");

  same(termFT, f.memory.ensure(r.AND, ft), "TERM_FT = AND->ARGS_FT");
  same(reqFT, f.memory.ensure(r.CALL, termFT), "REQ_FT = CALL->TERM_FT");
  assert(reqFT !== termFT, "binary construction term differs from evaluation request");

  const passive = scope(f, r.interpreter, active(f, r.K, termFT));
  const passiveStep = reactV013StructuralScope(f.memory, passive, f.fresh());
  same(passiveStep.quiescent, true, "plain binary term remains passive");
  same(passiveStep.handoffCount, 0, "passive term has no handoff");
}

{
  const f = fixture();
  const r = runtime(f);
  for (const [requestName, expected, label] of [
    ["REQ_FF", r.F, "AND(F,F)"],
    ["REQ_FT", r.F, "AND(F,T)"],
    ["REQ_TF", r.F, "AND(T,F)"],
    ["REQ_TT", r.T, "AND(T,T)"],
  ] as const) {
    same(
      run(f, r, value(f, r.compiled, requestName), expected, label),
      2,
      `${label}: grounded rule + PUBLISH`,
    );
  }
}

{
  const f = fixture();
  const r = runtime(f, true);
  const request = value(f, r.compiled, "REQ_TF");
  const cursor = scope(f, r.interpreter, active(f, r.K, request));
  const step = reactV013StructuralScope(f.memory, cursor, f.fresh());
  same(step.quiescent, true, "TF request is inert when only TT Rule is admitted");
}

{
  const f = fixture();
  const r = runtime(f);
  const foreignCall = value(f, r.compiled, "FOREIGN_CALL");
  const term = value(f, r.compiled, "TERM_TT");
  const request = f.memory.ensure(foreignCall, term);
  const cursor = scope(f, r.interpreter, active(f, r.K, request));
  const step = reactV013StructuralScope(f.memory, cursor, f.fresh());
  same(step.quiescent, true, "foreign CALL tag is passive");
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
  same(foreignInterpreter, value(f, r.compiled, "FINTERP"), "foreign interpreter topology");
  const request = value(f, r.compiled, "REQ_TT");
  const cursor = scope(f, foreignInterpreter, active(f, r.K, request));
  const step = reactV013StructuralScope(f.memory, cursor, f.fresh());
  same(step.quiescent, true, "AND requires selected Theory admission");
}

{
  const f = fixture();
  const renamed = [
    "root : root->root",
    "open : open->root",
    "close : root->close",
    "truth : open->close",
    "falsehood : close->open",
    "seed : root->truth",
    "both : seed->open",
    "invoke : close->both",
    "done : falsehood->both",
    "dict : both->invoke",
    "gram : done->both",
    "theory : invoke->done",
    "gt : gram->theory",
    "interp : dict->gt",
    "caller : dict->theory",
    "args : truth->truth",
    "term : both->args",
    "request : invoke->term",
  ].join("\n");
  const c = compile(f, renamed);
  const T = value(f, c, "truth");
  const F = value(f, c, "falsehood");
  const AND = value(f, c, "both");
  const CALL = value(f, c, "invoke");
  const DONE = value(f, c, "done");
  const theory = value(f, c, "theory");
  const interpreter = defineStructuralInterpreter(
    f.memory, value(f, c, "dict"), value(f, c, "gram"), theory,
  );
  same(interpreter, value(f, c, "interp"), "renamed interpreter topology");
  const profile = materializeV015EvaluationProfile(f.memory, CALL, DONE);
  defineV015UnaryEvaluationLifecycle(f.memory, theory, profile, f.fresh());
  defineV015GroundedUnaryEvaluationRule(
    f.memory, theory, profile, f.fresh(), AND, value(f, c, "args"), T,
  );
  const renamedRuntime: Runtime = Object.freeze({
    compiled:c, T, F, AND, CALL, DONE, theory, interpreter,
    K:value(f, c, "caller"), profile,
  });
  same(
    run(f, renamedRuntime, value(f, c, "request"), T, "renamed AND(T,T)"),
    2,
    "presentation labels do not change binary execution",
  );
}

console.log([
  "MTS v0.15 B5 FORMAL AND:",
  "BINARY_RUNTIME=REUSED_UNARY_LIFECYCLE",
  "ARGUMENT_CARRIER=ORDERED_LINK_X_TO_Y",
  "AND_FF=F",
  "AND_FT=F",
  "AND_TF=F",
  "AND_TT=T",
  "T=L",
  "F=U",
  "PLAIN_BINARY_TERM=QUIESCENT",
  "ARGUMENT_ORDER_IDENTITY=PRESERVED",
  "COMMUTATIVITY=THEORY_NOT_CARRIER",
  "FOREIGN_CALL=INERT",
  "FOREIGN_THEORY=INERT",
  "RENAMING_INVARIANCE=GREEN",
  "BINARY_OPCODE=0",
].join(" "));
