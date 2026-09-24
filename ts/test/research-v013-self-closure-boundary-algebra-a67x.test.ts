import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { materializeExactSequence } from "../src/exact-sequence.js";
import { Memory, ensureRootBasis, type LinkHandle } from "../src/memory.js";
import { defineContext } from "../src/state.js";

function assert(c:unknown,m:string):asserts c{
  if(!c)throw new Error(`v0.13 A67x self-closure boundary algebra: ${m}`);
}
function same<T>(a:T,e:T,m:string):void{
  assert(Object.is(a,e),`${m}: values differ`);
}
function distinct(a:LinkHandle,b:LinkHandle,m:string):void{
  assert(a!==b,m);
}

function detach(
  memory:Memory,
  context:LinkHandle,
  truth:LinkHandle,
  continuation:LinkHandle,
):LinkHandle{
  const t=memory.poles(truth);
  same(t.start,context,"selected truth context");
  const c=memory.poles(continuation);
  same(c.start,t.end,"continuation starts at selected antecedent");
  return memory.ensure(context,c.end);
}

function exercise(noise:boolean):void{
  const memory=new Memory();
  const b=ensureRootBasis(memory);
  if(noise)memory.ensure(memory.ensure(b.U,b.C),memory.ensure(b.O,b.L));

  const X=memory.ensure(b.L,b.U);
  const K=memory.ensure(b.O,b.U);
  const A1=memory.ensure(b.C,b.L);
  const A2=memory.ensure(b.U,b.C);
  const B=memory.ensure(A1,A2);

  // Root projection: the same boundary algebra is already the R/O/C/L/U basis.
  const startR=memory.ensureStartSelfClosed(b.R);
  const endR=memory.ensureEndSelfClosed(b.R);
  same(startR,b.O,"START(R)=O");
  same(endR,b.C,"END(R)=C");
  same(memory.ensure(startR,endR),b.L,"START(R)->END(R)=L");
  same(memory.ensure(endR,startR),b.U,"END(R)->START(R)=U");

  // -----------------------------------------------------------------------
  // Exact chiral fixed-point identities for arbitrary grounded X/K.
  // -----------------------------------------------------------------------
  const startX=memory.ensureStartSelfClosed(X);
  const endK=memory.ensureEndSelfClosed(K);

  const sp=memory.poles(startX);
  same(sp.start,startX,"START(X) is START-self-closed");
  same(sp.end,X,"START(X) retains X as external END");
  same(memory.ensure(startX,X),startX,"START(X)->X canonically reduces to START(X)");

  const ep=memory.poles(endK);
  same(ep.start,K,"END(K) retains K as external START");
  same(ep.end,endK,"END(K) is END-self-closed");
  same(memory.ensure(K,endK),endK,"K->END(K) canonically reduces to END(K)");

  // Chirality is real: the opposite pole placements are not the same fixed points.
  distinct(memory.ensure(X,startX),startX,"X->START(X) is not START(X)");
  distinct(memory.ensure(endK,K),endK,"END(K)->K is not END(K)");

  // -----------------------------------------------------------------------
  // The unchanged contextual-detachment law can hit either fixed point.
  //
  // START-side mirror:
  //   START(X)->A, A->X  => START(X)->X = START(X)
  //
  // END-side terminal reduction:
  //   K->A, A->END(K)   => K->END(K) = END(K)
  // -----------------------------------------------------------------------
  for(const A of [A1,A2] as const){
    const startTruth=memory.ensure(startX,A);
    const backToX=memory.ensure(A,X);
    same(
      detach(memory,startX,startTruth,backToX),
      startX,
      "START-side detachment collapses to canonical START(X)",
    );

    const endTruth=memory.ensure(K,A);
    const toEnd=memory.ensure(A,endK);
    same(
      detach(memory,K,endTruth,toEnd),
      endK,
      "END-side detachment collapses to canonical END(K)",
    );
  }

  // Multiple terminal predecessors reduce to one exact END(K) identity.
  const endFromA1=detach(memory,K,memory.ensure(K,A1),memory.ensure(A1,endK));
  const endFromA2=detach(memory,K,memory.ensure(K,A2),memory.ensure(A2,endK));
  same(endFromA1,endFromA2,"many terminal predecessors converge to one END(K)");

  // Mixed terminal/surviving continuations must not be mistaken for global emptiness.
  const truthA1=memory.ensure(K,A1);
  const terminal=detach(memory,K,truthA1,memory.ensure(A1,endK));
  const survivor=detach(memory,K,truthA1,memory.ensure(A1,B));
  same(terminal,endK,"mixed step retains exact terminal reduction");
  same(memory.poles(survivor).start,K,"mixed ordinary survivor remains contextual");
  same(memory.poles(survivor).end,B,"mixed ordinary survivor value");
  distinct(terminal,survivor,"terminal marker does not erase surviving branch");

  // -----------------------------------------------------------------------
  // START is already the actual exact-Anum sequence-cell constructor.
  //
  //   Cell(prev,value) = START(prev->value)
  // -----------------------------------------------------------------------
  const seq1=materializeExactSequence(memory,[A1]);
  const payload1=memory.ensure(memory.root,A1);
  same(seq1,memory.ensureStartSelfClosed(payload1),"first ExactSequence cell is START(root->A1)");
  same(memory.ensure(seq1,payload1),seq1,"first ExactSequence cell satisfies START fixed point");

  const seq2=materializeExactSequence(memory,[A1,A2]);
  const payload2=memory.ensure(seq1,A2);
  same(seq2,memory.ensureStartSelfClosed(payload2),"second ExactSequence cell is START(previous->A2)");
  same(memory.ensure(seq2,payload2),seq2,"second ExactSequence cell satisfies START fixed point");

  // Execution Context uses the exact same generic START-lift constructor.
  const ctx=defineContext(memory,seq1,B);
  const ctxPayload=memory.ensure(seq1,B);
  same(ctx,memory.ensureStartSelfClosed(ctxPayload),"Context(parent,current) is same START-lift topology");
  same(memory.ensure(ctx,ctxPayload),ctx,"Context itself satisfies START fixed point");

  // This is structural identity of constructor form, not semantic role identity.
  distinct(seq2,ctx,"ExactSequence cell and Context remain distinct when payloads differ");

  // Canonical re-materialization is stable.
  const count=memory.linkCount;
  same(memory.ensureStartSelfClosed(X),startX,"START(X) canonical repeat");
  same(memory.ensureEndSelfClosed(K),endK,"END(K) canonical repeat");
  same(memory.linkCount,count,"boundary re-materialization adds no Links");
}

function staticGuards():void{
  const root=resolve(process.cwd(),"..");
  const own=readFileSync(
    join(root,"ts/test/research-v013-self-closure-boundary-algebra-a67x.test.ts"),
    "utf8",
  );
  const sequence=readFileSync(join(root,"ts/src/exact-sequence.ts"),"utf8");
  const state=readFileSync(join(root,"ts/src/state.ts"),"utf8");

  assert(
    sequence.includes("current = memory.ensureStartSelfClosed(payload);"),
    "ExactSequence production uses START-lifted cells",
  );
  assert(
    state.includes("return memory.ensureStartSelfClosed(payload);"),
    "Context production uses START-lifted payload",
  );

  const exercise=own.slice(
    own.indexOf("function exercise("),
    own.indexOf("\nfunction staticGuards("),
  );
  for(const forbidden of [
    ".delete(",
    ".remove(",
    "deleteLink",
    "removeLink",
    "jsonRVM",
  ])assert(!exercise.includes(forbidden),`A67x excludes physical deletion/imported semantics: ${forbidden}`);
}

function main():void{
  exercise(false);
  exercise(true);
  staticGuards();

  console.log([
    "MTS v0.13 A67x: SELF_CLOSURE_BOUNDARY_ALGEBRA=GREEN_SCOPED_RESEARCH",
    "START_FIXED_POINT=START_X_TO_X_EQ_START_X",
    "END_FIXED_POINT=X_TO_END_X_EQ_END_X",
    "START_END_CHIRALITY=CONFIRMED",
    "ROOT_BOUNDARY_PROJECTION=START_R_O_END_R_C_DIRECT_L_INVERSE_U",
    "START_SIDE_DETACHMENT_REDUCTION=CONFIRMED",
    "END_SIDE_DETACHMENT_REDUCTION=CONFIRMED",
    "MULTIPLE_TERMINAL_PREDECESSORS=ONE_CANONICAL_END",
    "MIXED_TERMINAL_AND_SURVIVOR=COEXIST",
    "END_REDUCTION_GLOBAL_EMPTY=NOT_IMPLIED",
    "EXACT_SEQUENCE_CELL=START_PREVIOUS_TO_VALUE",
    "EXECUTION_CONTEXT=START_PARENT_TO_CURRENT",
    "SEQUENCE_AND_CONTEXT=COMMON_START_LIFT_TOPOLOGY_DISTINCT_ROLES",
    "PHYSICAL_DELETE_REQUIRED=NO_IN_TESTED_PATH",
    "ANUM_START_AS_INTERPRETER_ENTRY=HYPOTHESIS_READY_NOT_PROVEN",
    "FOUR_ASPECT_NATURAL_INTERPRETER=HYPOTHESIS_READY_NOT_PROVEN",
    "V013_NOT_ACCEPTED PRODUCTION_UNCHANGED",
  ].join(" "));
}
main();
