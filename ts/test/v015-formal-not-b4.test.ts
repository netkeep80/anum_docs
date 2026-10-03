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
  materializeSourceNamespaceProfile,
} from "../src/source-namespace.js";
import {
  materializeV015LinkDefinitionProfile,
} from "../src/v015-link-definition.js";
import {
  compileV015FormalDefinitionsToRecursive,
  type V015FormalRecursiveCompileResult,
} from "../src/v015-formal-recursive-compiler.js";
import {
  defineStructuralInterpreter,
} from "../src/structural-rule.js";
import {
  defineV013WorkingScope,
  discoverV013TriggeredRuleImages,
  reactV013StructuralScope,
  V013CurrentScopeCursor,
} from "../src/v013-structural-execution.js";
import {
  defineV015GroundedUnaryEvaluationRule,
  defineV015UnaryEvaluationLifecycle,
  materializeV015EvaluationProfile,
  materializeV015RootEvaluationBoundary,
} from "../src/v015-formal-evaluation.js";
import {
  materializeV012StringAnum,
} from "../src/v012-string-anum.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.15 B4 FORMAL NOT: ${message}`);
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
  "NOT : T->F",
  "CALL : T->NOT",
  "DONE : F->NOT",
  "DICT : NOT->CALL",
  "GRAM : DONE->NOT",
  "THEORY : CALL->DONE",
  "GT : GRAM->THEORY",
  "INTERP : DICT->GT",
  "K : DICT->THEORY",
  "TERM_T : NOT->T",
  "REQ_T : CALL->TERM_T",
  "TERM_F : NOT->F",
  "REQ_F : CALL->TERM_F",
  "INNER_TERM : NOT->T",
  "INNER_REQ : CALL->INNER_TERM",
  "OUTER_TERM : NOT->INNER_REQ",
  "OUTER_REQ : CALL->OUTER_TERM",
  "FOREIGN_CALL : T->DONE",
  "FOREIGN_THEORY : DONE->CALL",
  "FGT : GRAM->FOREIGN_THEORY",
  "FINTERP : DICT->FGT",
].join("\n");

function compile(f: Fixture, text: string): V015FormalRecursiveCompileResult {
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

function value(
  f: Fixture,
  compiled: V015FormalRecursiveCompileResult,
  name: string,
): LinkHandle {
  const carrier = nameCarrier(f, name);
  const found = compiled.definitions.find((definition) => definition.nameCarrier === carrier);
  assert(found !== undefined, `compiled definition exists for ${name}`);
  assert(found.wire.length > 0, `${name} has canonical recursive wire`);
  return found.semantic;
}

interface Runtime {
  readonly compiled: V015FormalRecursiveCompileResult;
  readonly T: LinkHandle;
  readonly F: LinkHandle;
  readonly NOT: LinkHandle;
  readonly CALL: LinkHandle;
  readonly DONE: LinkHandle;
  readonly theory: LinkHandle;
  readonly interpreter: LinkHandle;
  readonly K: LinkHandle;
  readonly profile: LinkHandle;
}

function runtime(f: Fixture): Runtime {
  const compiled = compile(f, source);
  const T = value(f, compiled, "T");
  const F = value(f, compiled, "F");
  const NOT = value(f, compiled, "NOT");
  const CALL = value(f, compiled, "CALL");
  const DONE = value(f, compiled, "DONE");
  const dictionary = value(f, compiled, "DICT");
  const grammar = value(f, compiled, "GRAM");
  const theory = value(f, compiled, "THEORY");
  const expectedInterpreter = value(f, compiled, "INTERP");
  const interpreter = defineStructuralInterpreter(f.memory, dictionary, grammar, theory);
  same(interpreter, expectedInterpreter, "FORMAL INTERP is exact structural interpreter Link");
  const K = value(f, compiled, "K");
  const profile = materializeV015EvaluationProfile(f.memory, CALL, DONE);

  defineV015UnaryEvaluationLifecycle(f.memory, theory, profile, f.fresh());
  defineV015GroundedUnaryEvaluationRule(
    f.memory, theory, profile, f.fresh(), NOT, T, F,
  );
  defineV015GroundedUnaryEvaluationRule(
    f.memory, theory, profile, f.fresh(), NOT, F, T,
  );

  return Object.freeze({
    compiled, T, F, NOT, CALL, DONE, theory, interpreter, K, profile,
  });
}

function scope(
  f: Fixture,
  interpreter: LinkHandle,
  active: LinkHandle,
): V013CurrentScopeCursor {
  return new V013CurrentScopeCursor(
    f.memory,
    defineV013WorkingScope(f.memory, f.fresh(), interpreter, [active]),
  );
}

function active(
  f: Fixture,
  K: LinkHandle,
  program: LinkHandle,
): LinkHandle {
  return f.memory.ensure(
    materializeV015RootEvaluationBoundary(f.memory, K),
    program,
  );
}

function run(
  f: Fixture,
  r: Runtime,
  program: LinkHandle,
  expected: LinkHandle,
  max: number,
  label: string,
): number {
  const cursor = scope(f, r.interpreter, active(f, r.K, program));
  let reactions = 0;
  while (true) {
    const step = reactV013StructuralScope(f.memory, cursor, f.fresh());
    if (step.quiescent) break;
    same(step.handoffCount, 1, `${label}: each active reaction publishes once`);
    reactions += 1;
    assert(reactions < max, `${label}: converges`);
  }
  const members = cursor.members();
  same(members.length, 1, `${label}: one stable result`);
  same(members[0], f.memory.ensure(r.K, expected), `${label}: exact K->result`);
  return reactions;
}

{
  const f = fixture();
  const r = runtime(f);
  same(r.T, f.basis.L, "compiled T is exact L");
  same(r.F, f.basis.U, "compiled F is exact U");

  const term = value(f, r.compiled, "TERM_T");
  const request = value(f, r.compiled, "REQ_T");
  same(term, f.memory.ensure(r.NOT, r.T), "FORMAL TERM_T is exact NOT->T");
  same(request, f.memory.ensure(r.CALL, term), "FORMAL REQ_T is exact CALL->TERM_T");
  assert(request !== term, "construction term and evaluation request are distinct Links");
  const cursor = scope(f, r.interpreter, active(f, r.K, term));
  const step = reactV013StructuralScope(f.memory, cursor, f.fresh());
  same(step.quiescent, true, "plain NOT->T remains passive");
  same(step.handoffCount, 0, "passive term performs no handoff");
}

{
  const f = fixture();
  const r = runtime(f);
  same(
    run(f, r, value(f, r.compiled, "REQ_T"), r.F, 8, "NOT(T)"),
    2,
    "NOT(T) = grounded rule + PUBLISH",
  );
  same(
    run(f, r, value(f, r.compiled, "REQ_F"), r.T, 8, "NOT(F)"),
    2,
    "NOT(F) = grounded rule + PUBLISH",
  );
}

{
  const f = fixture();
  const r = runtime(f);
  const outer = value(f, r.compiled, "OUTER_REQ");
  const initial = active(f, r.K, outer);
  same(
    discoverV013TriggeredRuleImages(f.memory, r.theory, initial).length,
    1,
    "nested initial state matches OPEN only",
  );
  same(
    run(f, r, outer, r.T, 12, "NOT(NOT(T))"),
    5,
    "nested NOT uses OPEN + inner + RESUME + outer + PUBLISH",
  );
}

{
  const f = fixture();
  const r = runtime(f);
  const foreignCall = value(f, r.compiled, "FOREIGN_CALL");
  const term = value(f, r.compiled, "TERM_T");
  const foreignRequest = f.memory.ensure(foreignCall, term);
  const cursor = scope(f, r.interpreter, active(f, r.K, foreignRequest));
  const step = reactV013StructuralScope(f.memory, cursor, f.fresh());
  same(step.quiescent, true, "foreign CALL tag is passive");
  same(step.handoffCount, 0, "foreign CALL performs no handoff");
}

{
  const f = fixture();
  const r = runtime(f);
  const foreignTheory = value(f, r.compiled, "FOREIGN_THEORY");
  const dictionary = value(f, r.compiled, "DICT");
  const grammar = value(f, r.compiled, "GRAM");
  const expected = value(f, r.compiled, "FINTERP");
  const foreignInterpreter = defineStructuralInterpreter(
    f.memory,
    dictionary,
    grammar,
    foreignTheory,
  );
  same(foreignInterpreter, expected, "FORMAL foreign interpreter topology is exact");
  const request = value(f, r.compiled, "REQ_T");
  const cursor = scope(f, foreignInterpreter, active(f, r.K, request));
  const step = reactV013StructuralScope(f.memory, cursor, f.fresh());
  same(step.quiescent, true, "NOT rule admitted only in selected Theory");
}

{
  const f = fixture();
  const renamed = [
    "root : root->root",
    "open : open->root",
    "close : root->close",
    "truth : open->close",
    "falsehood : close->open",
    "neg : truth->falsehood",
    "invoke : truth->neg",
    "complete : falsehood->neg",
    "dict : neg->invoke",
    "gram : complete->neg",
    "theory : invoke->complete",
    "gt : gram->theory",
    "interp : dict->gt",
    "caller : dict->theory",
    "term : neg->truth",
    "request : invoke->term",
  ].join("\n");
  const c = compile(f, renamed);
  const T = value(f, c, "truth");
  const F = value(f, c, "falsehood");
  const NOT = value(f, c, "neg");
  const CALL = value(f, c, "invoke");
  const DONE = value(f, c, "complete");
  const theory = value(f, c, "theory");
  const interpreter = defineStructuralInterpreter(
    f.memory,
    value(f, c, "dict"),
    value(f, c, "gram"),
    theory,
  );
  same(interpreter, value(f, c, "interp"), "renamed interpreter has same topology");
  const profile = materializeV015EvaluationProfile(f.memory, CALL, DONE);
  defineV015UnaryEvaluationLifecycle(f.memory, theory, profile, f.fresh());
  defineV015GroundedUnaryEvaluationRule(
    f.memory, theory, profile, f.fresh(), NOT, T, F,
  );
  defineV015GroundedUnaryEvaluationRule(
    f.memory, theory, profile, f.fresh(), NOT, F, T,
  );
  const renamedRuntime: Runtime = Object.freeze({
    compiled:c, T, F, NOT, CALL, DONE, theory, interpreter,
    K:value(f, c, "caller"), profile,
  });
  same(T, f.basis.L, "renamed truth still exact L");
  same(F, f.basis.U, "renamed falsehood still exact U");
  same(
    run(f, renamedRuntime, value(f, c, "request"), F, 8, "renamed NOT(T)"),
    2,
    "renamed labels do not change execution",
  );
}

console.log([
  "MTS v0.15 B4 executable FORMAL NOT:",
  "FORMAL_PROGRAM_ANCHORS=COMPILED_LINKS",
  "T=L",
  "F=U",
  "PLAIN_TERM=QUIESCENT",
  "REQ_T_TO_F=GREEN",
  "REQ_F_TO_T=GREEN",
  "NESTED_NOT_NOT_T_TO_T=GREEN",
  "CALL_ROLE=PROFILE_STRUCTURAL",
  "RULE_AUTHORITY=SELECTED_THEORY",
  "RENAMING_INVARIANCE=GREEN",
  "HOST_BOOLEAN_RESULT=0",
].join(" "));
