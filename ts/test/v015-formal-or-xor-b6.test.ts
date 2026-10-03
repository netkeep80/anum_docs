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
  if (!condition) throw new Error(`v0.15 B6 FORMAL OR/XOR: ${message}`);
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
    { form: pairForm, fields: [
      { role: leftRole, target: "child", min: 1, max: 1 },
      { role: rightRole, target: "child", min: 1, max: 1 },
    ]},
    { form: refForm, fields: [{ role: refRole, target: "carrier", min: 1, max: 1 }] },
    { form: declarationForm, fields: [
      { role: nameRole, target: "carrier", min: 1, max: 1 },
      { role: bodyRole, target: "child", min: 1, max: 1 },
    ]},
    { form: blockForm, fields: [{ role: itemRole, target: "child", min: 0, max: null }] },
  ];
  const grammarRoot = materializeNativeSyntaxGrammar(memory, basis, { syntaxTag, markerSeed, rules });
  const namespaceProfileRoot = materializeSourceNamespaceProfile(memory, {
    blockForm, declarationForm, blockItemRole: itemRole,
    declarationNameRole: nameRole, declarationBodyRole: bodyRole,
  });
  const definitionProfileRoot = materializeV015LinkDefinitionProfile(memory, {
    pairForm, nameRefForm: refForm, pairLeftRole: leftRole,
    pairRightRole: rightRole, referencedNameRole: refRole,
  });
  return Object.freeze({ memory, basis, grammarRoot, namespaceProfileRoot, definitionProfileRoot, fresh });
}

const enc = new TextEncoder();
const source = [
  "R : R->R","O : O->R","C : R->C","L : O->C","U : C->O",
  "T : O->C","F : C->O",
  "OR_SEED : R->L","OR : OR_SEED->O",
  "XOR_SEED : R->U","XOR : XOR_SEED->O",
  "CALL_SEED : L->L","CALL : CALL_SEED->O",
  "DONE_SEED : U->U","DONE : DONE_SEED->O",
  "DICT : OR->XOR","GRAM : CALL->DONE","THEORY : DICT->GRAM",
  "GT : GRAM->THEORY","INTERP : DICT->GT","K : OR_SEED->THEORY",
  "ARGS_FF : F->F","ARGS_FT : F->T","ARGS_TF : T->F","ARGS_TT : T->T",
  "OR_TERM_FF : OR->ARGS_FF","OR_TERM_FT : OR->ARGS_FT",
  "OR_TERM_TF : OR->ARGS_TF","OR_TERM_TT : OR->ARGS_TT",
  "OR_REQ_FF : CALL->OR_TERM_FF","OR_REQ_FT : CALL->OR_TERM_FT",
  "OR_REQ_TF : CALL->OR_TERM_TF","OR_REQ_TT : CALL->OR_TERM_TT",
  "XOR_TERM_FF : XOR->ARGS_FF","XOR_TERM_FT : XOR->ARGS_FT",
  "XOR_TERM_TF : XOR->ARGS_TF","XOR_TERM_TT : XOR->ARGS_TT",
  "XOR_REQ_FF : CALL->XOR_TERM_FF","XOR_REQ_FT : CALL->XOR_TERM_FT",
  "XOR_REQ_TF : CALL->XOR_TERM_TF","XOR_REQ_TT : CALL->XOR_TERM_TT",
  "FOREIGN_CALL : O->DONE","FOREIGN_THEORY : DONE->CALL",
  "FGT : GRAM->FOREIGN_THEORY","FINTERP : DICT->FGT",
].join("\n");

function compile(f: Fixture, text = source): V015FormalRecursiveCompileResult {
  return compileV015FormalDefinitionsToRecursive(
    f.memory, f.basis, f.grammarRoot, f.namespaceProfileRoot,
    f.definitionProfileRoot, enc.encode(text),
  );
}
function carrier(f: Fixture, name: string): LinkHandle {
  return materializeV012StringAnum(f.memory, f.basis, enc.encode(name)).anumLink;
}
function value(f: Fixture, c: V015FormalRecursiveCompileResult, name: string): LinkHandle {
  const key = carrier(f, name);
  const found = c.definitions.find((entry) => entry.nameCarrier === key);
  assert(found !== undefined, `compiled ${name}`);
  return found.semantic;
}

interface Runtime {
  readonly c: V015FormalRecursiveCompileResult;
  readonly T: LinkHandle;
  readonly F: LinkHandle;
  readonly OR: LinkHandle;
  readonly XOR: LinkHandle;
  readonly CALL: LinkHandle;
  readonly DONE: LinkHandle;
  readonly theory: LinkHandle;
  readonly interpreter: LinkHandle;
  readonly K: LinkHandle;
}

function runtime(
  f: Fixture,
  omit?: Readonly<{ fn: "OR" | "XOR"; args: "ARGS_FF" | "ARGS_FT" | "ARGS_TF" | "ARGS_TT" }>,
): Runtime {
  const c = compile(f);
  const T = value(f,c,"T"), F = value(f,c,"F");
  const OR = value(f,c,"OR"), XOR = value(f,c,"XOR");
  const CALL = value(f,c,"CALL"), DONE = value(f,c,"DONE");
  const theory = value(f,c,"THEORY");
  const dictionary = value(f,c,"DICT");
  const grammar = value(f,c,"GRAM");
  const interpreter = defineStructuralInterpreter(f.memory,dictionary,grammar,theory);
  same(interpreter,value(f,c,"INTERP"),"FORMAL interpreter topology");
  const K = value(f,c,"K");
  const profile = materializeV015EvaluationProfile(f.memory,CALL,DONE);
  defineV015UnaryEvaluationLifecycle(f.memory,theory,profile,f.fresh());
  const rows = [
    ["OR","ARGS_FF",F],["OR","ARGS_FT",T],["OR","ARGS_TF",T],["OR","ARGS_TT",T],
    ["XOR","ARGS_FF",F],["XOR","ARGS_FT",T],["XOR","ARGS_TF",T],["XOR","ARGS_TT",F],
  ] as const;
  for (const [fnName,argsName,out] of rows) {
    if (omit?.fn === fnName && omit.args === argsName) continue;
    defineV015GroundedUnaryEvaluationRule(
      f.memory,theory,profile,f.fresh(),
      fnName === "OR" ? OR : XOR,
      value(f,c,argsName),
      out,
    );
  }
  return Object.freeze({ c,T,F,OR,XOR,CALL,DONE,theory,interpreter,K });
}

function active(f: Fixture,K: LinkHandle,program: LinkHandle): LinkHandle {
  return f.memory.ensure(materializeV015RootEvaluationBoundary(f.memory,K),program);
}
function scope(f: Fixture,interpreter: LinkHandle,member: LinkHandle): V013CurrentScopeCursor {
  return new V013CurrentScopeCursor(
    f.memory,
    defineV013WorkingScope(f.memory,f.fresh(),interpreter,[member]),
  );
}
function run(
  f: Fixture,r: Runtime,requestName: string,expected: LinkHandle,label: string,
): number {
  const cursor = scope(f,r.interpreter,active(f,r.K,value(f,r.c,requestName)));
  let reactions = 0;
  while (true) {
    const step = reactV013StructuralScope(f.memory,cursor,f.fresh());
    if (step.quiescent) break;
    same(step.handoffCount,1,`${label}: atomic handoff`);
    reactions += 1;
    assert(reactions < 8,`${label}: converges`);
  }
  same(cursor.members().length,1,`${label}: one result`);
  same(cursor.members()[0],f.memory.ensure(r.K,expected),`${label}: exact result`);
  return reactions;
}

{
  const f=fixture(), r=runtime(f);
  same(r.T,f.basis.L,"T=L");
  same(r.F,f.basis.U,"F=U");
  assert(r.OR !== r.XOR,"OR and XOR functions are distinct");
  assert(r.CALL !== r.DONE,"shared CALL and DONE are distinct");

  const ft=value(f,r.c,"ARGS_FT"), tf=value(f,r.c,"ARGS_TF");
  assert(ft !== tf,"FT and TF ordered carriers differ");
  assert(value(f,r.c,"OR_TERM_TT") !== value(f,r.c,"XOR_TERM_TT"),"same args, different function -> different term");
  assert(value(f,r.c,"OR_REQ_TT") !== value(f,r.c,"XOR_REQ_TT"),"same args, different function -> different request");

  for (const [req,out,label] of [
    ["OR_REQ_FF",r.F,"OR(F,F)"],["OR_REQ_FT",r.T,"OR(F,T)"],
    ["OR_REQ_TF",r.T,"OR(T,F)"],["OR_REQ_TT",r.T,"OR(T,T)"],
    ["XOR_REQ_FF",r.F,"XOR(F,F)"],["XOR_REQ_FT",r.T,"XOR(F,T)"],
    ["XOR_REQ_TF",r.T,"XOR(T,F)"],["XOR_REQ_TT",r.F,"XOR(T,T)"],
  ] as const) {
    same(run(f,r,req,out,label),2,`${label}: grounded rule + PUBLISH`);
  }
}

{
  const f=fixture(), r=runtime(f);
  for (const termName of ["OR_TERM_FT","XOR_TERM_FT"] as const) {
    const cursor=scope(f,r.interpreter,active(f,r.K,value(f,r.c,termName)));
    const step=reactV013StructuralScope(f.memory,cursor,f.fresh());
    same(step.quiescent,true,`${termName} passive outside CALL`);
  }
}

{
  const f=fixture(), r=runtime(f,{fn:"XOR",args:"ARGS_TT"});
  const cursor=scope(f,r.interpreter,active(f,r.K,value(f,r.c,"XOR_REQ_TT")));
  const step=reactV013StructuralScope(f.memory,cursor,f.fresh());
  same(step.quiescent,true,"missing exact XOR/TT row has no fallback dispatch");
}

{
  const f=fixture(), r=runtime(f);
  const request=f.memory.ensure(value(f,r.c,"FOREIGN_CALL"),value(f,r.c,"OR_TERM_TT"));
  const cursor=scope(f,r.interpreter,active(f,r.K,request));
  same(reactV013StructuralScope(f.memory,cursor,f.fresh()).quiescent,true,"foreign CALL inert");
}

{
  const f=fixture(), r=runtime(f);
  const foreignTheory=value(f,r.c,"FOREIGN_THEORY");
  const foreignInterpreter=defineStructuralInterpreter(
    f.memory,value(f,r.c,"DICT"),value(f,r.c,"GRAM"),foreignTheory,
  );
  same(foreignInterpreter,value(f,r.c,"FINTERP"),"foreign interpreter topology");
  const cursor=scope(f,foreignInterpreter,active(f,r.K,value(f,r.c,"OR_REQ_TT")));
  same(reactV013StructuralScope(f.memory,cursor,f.fresh()).quiescent,true,"foreign Theory inert");
}

console.log([
  "MTS v0.15 B6 FORMAL OR/XOR:",
  "SHARED_CALL_DONE_PROFILE=TRUE",
  "SHARED_THEORY=TRUE",
  "OR_FF=F OR_FT=T OR_TF=T OR_TT=T",
  "XOR_FF=F XOR_FT=T XOR_TF=T XOR_TT=F",
  "TT_CROSS_FUNCTION_DISCRIMINATOR=GREEN",
  "ORDERED_ARGUMENT_IDENTITY=PRESERVED",
  "PLAIN_TERMS=QUIESCENT",
  "MISSING_ROW=NO_FALLBACK",
  "FOREIGN_CALL=INERT",
  "FOREIGN_THEORY=INERT",
  "NEW_RUNTIME_CODE=0",
].join(" "));
