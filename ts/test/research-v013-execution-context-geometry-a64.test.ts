import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { Memory, ensureRootBasis, type LinkHandle } from "../src/memory.js";
import { defineContext, readContext } from "../src/state.js";

function assert(c:unknown,m:string):asserts c{if(!c)throw new Error(`v0.13 A64 execution-frame geometry: ${m}`);}
function same<T>(a:T,e:T,m:string):void{assert(Object.is(a,e),`${m}: values differ`);}
function expectThrows(fn:()=>void,m:string):void{let threw=false;try{fn();}catch{threw=true;}assert(threw,m);}

/**
 * Scoped argument-cursor carrier for this experiment:
 *
 *   Q_i = arg_i -> Q_(i+1)
 *   Q_done = R
 *
 * It is deliberately not claimed as the final v0.13 sequence representation.
 * A64 needs only an immutable Link-native cursor with local current/next poles.
 */
function argumentCursor(memory:Memory,args:readonly LinkHandle[]):LinkHandle{
  let q=memory.root;
  for(let i=args.length-1;i>=0;i-=1)q=memory.ensure(args[i]!,q);
  return q;
}
function readArgumentCursor(memory:Memory,q:LinkHandle):{readonly done:boolean;readonly argument?:LinkHandle;readonly next?:LinkHandle}{
  if(q===memory.root)return Object.freeze({done:true});
  const p=memory.poles(q);
  return Object.freeze({done:false,argument:p.start,next:p.end});
}

/**
 * Execution frame:
 *
 *   S_i = F_i -> Q_i
 *   K_i = Context(parent_i,S_i)
 *
 * F_i is the moving function/value pointer.
 * Q_i is the moving argument cursor.
 */
interface Frame{readonly context:LinkHandle;readonly parent:LinkHandle;readonly state:LinkHandle;readonly currentFn:LinkHandle;readonly cursor:LinkHandle;}
function defineFrame(memory:Memory,parent:LinkHandle,currentFn:LinkHandle,cursor:LinkHandle):Frame{
  const state=memory.ensure(currentFn,cursor);
  const context=defineContext(memory,parent,state);
  const k=readContext(memory,context),s=memory.poles(k.current);
  same(k.parent,parent,"A64 frame parent");
  same(k.current,state,"A64 frame state");
  same(s.start,currentFn,"A64 frame current function");
  same(s.end,cursor,"A64 frame argument cursor");
  return Object.freeze({context,parent,state,currentFn,cursor});
}
function readFrame(memory:Memory,context:LinkHandle):Frame{
  const k=readContext(memory,context),s=memory.poles(k.current);
  return Object.freeze({context,parent:k.parent,state:k.current,currentFn:s.start,cursor:s.end});
}

/**
 * One selected application-result fact:
 *
 *   application = F_i -> arg(Q_i)
 *   resultFact  = application -> y
 *
 * Advance does not search ambient Memory. The selected result fact is explicit.
 * The next child frame is:
 *
 *   F_(i+1) = y
 *   Q_(i+1) = next(Q_i)
 */
function advance(memory:Memory,parentContext:LinkHandle,resultFact:LinkHandle):Frame{
  const before=readFrame(memory,parentContext);
  const q=readArgumentCursor(memory,before.cursor);
  assert(!q.done&&q.argument!==undefined&&q.next!==undefined,"A64 cannot advance exhausted argument cursor");
  const application=memory.ensure(before.currentFn,q.argument);
  const result=memory.poles(resultFact);
  same(result.start,application,"A64 selected result belongs to exact current application");
  return defineFrame(memory,parentContext,result.end,q.next);
}

/**
 * Q exhaustion closes only this local frame.
 *
 * The returned K_root->F is a root-context continuation candidate, not proof of
 * global execution termination. F may itself be the antecedent of further
 * selected generalized-detachment continuations.
 */
function returnFromFrame(memory:Memory,rootContext:LinkHandle,leafContext:LinkHandle):LinkHandle{
  const leaf=readFrame(memory,leafContext),q=readArgumentCursor(memory,leaf.cursor);
  assert(q.done,"A64 only exhausted local frame may return to parent/root context");
  return memory.ensure(rootContext,leaf.currentFn);
}

function detach(memory:Memory,truth:LinkHandle,continuation:LinkHandle):LinkHandle{
  const t=memory.poles(truth),c=memory.poles(continuation);
  same(t.end,c.start,"A64 generalized detachment shares middle Link A");
  return memory.ensure(t.start,c.end);
}

function exercise(noise:boolean):void{
  const memory=new Memory(),b=ensureRootBasis(memory);
  if(noise)memory.ensure(memory.ensure(b.U,b.C),memory.ensure(b.O,b.L));

  const f0=memory.ensure(b.L,b.U);
  const a1=memory.ensure(b.O,b.C),a2=memory.ensure(b.C,b.O);
  const gA=memory.ensure(a1,b.L),gB=memory.ensure(a1,b.U);
  const z=memory.ensure(a2,b.L),foreign=memory.ensure(a2,b.U);

  // One immutable argument sequence and a selected cursor into it.
  const q0=argumentCursor(memory,[a1,a2]);
  const q0p=memory.poles(q0);
  same(q0p.start,a1,"A64 Q0 selects first argument");
  const q1=q0p.end;
  same(memory.poles(q1).start,a2,"A64 Q1 selects second argument");
  same(memory.poles(q1).end,memory.root,"A64 Q1 advances to exhausted cursor");

  // Root execution frame contains the current function/value pointer and arg cursor.
  const rootFrame=defineFrame(memory,memory.root,f0,q0);
  const rootContext=rootFrame.context;

  // Context payload is the mirrored/right-associated triad parent -> (F -> Q).
  const rootContextPoles=memory.poles(rootContext);
  const rootPayload=memory.poles(rootContextPoles.end);
  same(rootPayload.start,memory.root,"A64 context payload outer START is parent context");
  same(rootPayload.end,rootFrame.state,"A64 context payload outer END is F->Q state");
  same(memory.poles(rootPayload.end).start,f0,"A64 right-associated context triad keeps F");
  same(memory.poles(rootPayload.end).end,q0,"A64 right-associated context triad keeps Q");

  // The executable application/result triad is exactly left-associated (F->arg)->value.
  const app0=memory.ensure(f0,a1);
  const factA=memory.ensure(app0,gA),factB=memory.ensure(app0,gB);
  same(memory.poles(factA).start,app0,"A64 result fact START is application Link");
  same(memory.poles(app0).start,f0,"A64 application START is current function");
  same(memory.poles(app0).end,a1,"A64 application END is selected argument");
  same(q0p.start,memory.poles(app0).end,
    "A64 current argument alternates from START in Q to END in application");
  assert(memory.poles(factA).start===app0&&rootPayload.end===rootFrame.state,
    "A64 application/context triads use opposite left/right association");

  // MANY on one application creates sibling child contexts.
  const kA=advance(memory,rootContext,factA);
  const kB=advance(memory,rootContext,factB);
  assert(kA.context!==kB.context,"A64 MANY creates distinct child contexts");
  same(kA.parent,rootContext,"A64 branch A parent");
  same(kB.parent,rootContext,"A64 branch B parent");
  same(kA.cursor,q1,"A64 branch A advances same argument cursor");
  same(kB.cursor,q1,"A64 branch B advances same argument cursor");
  same(kA.currentFn,gA,"A64 branch A result becomes next current function");
  same(kB.currentFn,gB,"A64 branch B result becomes next current function");
  same(memory.poles(factA).end,memory.poles(kA.state).start,
    "A64 result alternates from END in result fact to START in next frame state");
  same(memory.poles(factB).end,memory.poles(kB.state).start,
    "A64 branch B result alternates END-to-START likewise");

  // Intermediate values are branch-local temporaries, not root results.
  assert(memory.find(rootContext,gA)===undefined,"A64 intermediate A absent from root result scope");
  assert(memory.find(rootContext,gB)===undefined,"A64 intermediate B absent from root result scope");
  expectThrows(()=>{returnFromFrame(memory,rootContext,kA.context);},"A64 branch A cannot finalize before arguments exhausted");
  expectThrows(()=>{returnFromFrame(memory,rootContext,kB.context);},"A64 branch B cannot finalize before arguments exhausted");

  // Second application consumes the same next argument independently per branch.
  const appA=memory.ensure(gA,a2),appB=memory.ensure(gB,a2);
  const factAZ=memory.ensure(appA,z),factBZ=memory.ensure(appB,z);
  const kzA=advance(memory,kA.context,factAZ),kzB=advance(memory,kB.context,factBZ);

  same(kzA.currentFn,z,"A64 branch A moving function pointer reaches z");
  same(kzB.currentFn,z,"A64 branch B moving function pointer reaches same z");
  same(kzA.cursor,memory.root,"A64 branch A cursor exhausted");
  same(kzB.cursor,memory.root,"A64 branch B cursor exhausted");
  assert(kzA.context!==kzB.context,"A64 equal final value preserves distinct nested execution contexts");
  assert(kzA.parent!==kzB.parent,"A64 equal final value preserves branch ancestry");

  // Both completed branches return the same extensional result to the root context.
  const rootResultA=returnFromFrame(memory,rootContext,kzA.context);
  const rootResultB=returnFromFrame(memory,rootContext,kzB.context);
  same(rootResultA,rootResultB,"A64 converged branches canonically return one root result");
  const rr=memory.poles(rootResultA);
  same(rr.start,rootContext,"A64 local frame return is contextualized by root execution context");
  same(rr.end,z,"A64 local frame return value");

  // Q=R is LOCAL completion only. The returned value may be a whole Link that
  // immediately participates in further generalized detachment.
  const nestedFunction=memory.ensure(b.O,b.U);
  const nestedArgument=memory.ensure(b.C,b.L);
  const nestedApplication=memory.ensure(nestedFunction,nestedArgument);
  const nestedValueA=memory.ensure(nestedArgument,b.O);
  const nestedValueB=memory.ensure(nestedArgument,b.C);

  // Make the locally returned z itself a compound/application Link.
  const compoundReturn=memory.ensure(nestedFunction,nestedArgument);
  const compoundLeaf=defineFrame(memory,kzA.parent,compoundReturn,memory.root);
  const rootCompoundTruth=returnFromFrame(memory,rootContext,compoundLeaf.context);
  same(memory.poles(rootCompoundTruth).end,compoundReturn,
    "A64 locally completed value may itself be a compound application Link");

  // Generalized MP is the global cascade law:
  // K->A, A->B => K->B. ONE local completion can fan out to MANY continuations.
  const contA=memory.ensure(compoundReturn,nestedValueA);
  const contB=memory.ensure(compoundReturn,nestedValueB);
  const cascadedA=detach(memory,rootCompoundTruth,contA);
  const cascadedB=detach(memory,rootCompoundTruth,contB);
  assert(cascadedA!==cascadedB,"A64 one contextual truth may split into parallel detachment branches");
  same(memory.poles(cascadedA).start,rootContext,"A64 cascade branch A keeps context");
  same(memory.poles(cascadedB).start,rootContext,"A64 cascade branch B keeps context");

  // A consequence may itself be another compound antecedent and detach again.
  const deeper=memory.ensure(nestedValueA,b.L);
  const nextContinuation=memory.ensure(nestedValueA,deeper);
  const cascadedAgain=detach(memory,cascadedA,nextContinuation);
  same(memory.poles(cascadedAgain).end,deeper,
    "A64 detachment consequence recursively becomes next antecedent");
  assert(memory.poles(cascadedAgain).end!==nestedValueA,
    "A64 global cascade does not stop at one unary application");

  // The moving pointer is immutable history, not host mutation.
  same(readFrame(memory,rootContext).currentFn,f0,"A64 root keeps original function");
  same(readFrame(memory,kA.context).currentFn,gA,"A64 first branch keeps intermediate function");
  same(readFrame(memory,kB.context).currentFn,gB,"A64 second branch keeps intermediate function");

  // Function pointer and argument pointer are independent frame coordinates.
  const sameFnDifferentCursor=defineFrame(memory,rootContext,gA,memory.root);
  assert(sameFnDifferentCursor.context!==kA.context,"A64 same function with different cursor is distinct state");
  const differentFnSameCursor=defineFrame(memory,rootContext,foreign,q1);
  assert(differentFnSameCursor.context!==kA.context,"A64 same cursor with different function is distinct state");

  // Wrong result provenance cannot advance this frame.
  const wrongApplication=memory.ensure(f0,a2),wrongFact=memory.ensure(wrongApplication,foreign);
  expectThrows(()=>{advance(memory,rootContext,wrongFact);},"A64 mismatched application/result fact rejected");
}

function staticGuards():void{
  const root=resolve(process.cwd(),"..");
  const state=readFileSync(join(root,"ts/src/state.ts"),"utf8");
  const a13=readFileSync(join(root,"ts/test/research-v013-meta-interpreter-frontier-a13.test.ts"),"utf8");
  const oldBinary=readFileSync(join(root,"ts/test/contextual-binary-relation.test.ts"),"utf8");
  const own=readFileSync(join(root,"ts/test/research-v013-execution-context-geometry-a64.test.ts"),"utf8");
  const normative=own.slice(0,own.indexOf("function staticGuards():void"));

  assert(state.includes("const payload = memory.ensure(parent, current);"),
    "A64 reuses current MTS parent/current context law");
  assert(state.includes("return memory.ensureStartSelfClosed(payload);"),
    "A64 reuses current MTS START-self-closed context law");
  assert(a13.includes("readonly tos:LinkHandle;")&&a13.includes("readonly currentFn:LinkHandle;"),
    "A64 is compatible with prior independent cursor/function meta-state evidence");
  assert(a13.includes("A13 branch contexts differ")&&a13.includes("A13 convergence preserves two branches"),
    "A64 inherits branch-local and convergence-provenance evidence");
  assert(oldBinary.includes("BINARY_CURRIED_CONTEXT_SURVIVES"),
    "A64 reuses prior MTS evidence for left-associated application topology");
  for(const forbidden of ["jsonRVM","$sub","$obj","$rel","parent_ref","ctx_ref"])
    assert(!normative.includes(forbidden),`A64 normative experiment excludes imported historical semantics ${forbidden}`);
}

function main():void{
  exercise(false);
  exercise(true);
  staticGuards();
  console.log([
    "MTS v0.13 A64: EXECUTION_FRAME_CURSOR_GEOMETRY=GREEN_SCOPED_RESEARCH",
    "EXECUTION_TRIAD=CONTEXT_CURRENT_FUNCTION_ARGUMENT_CURSOR",
    "FRAME_STATE=F_TO_Q",
    "APPLICATION_RESULT_TRIAD=(F_TO_ARG)_TO_VALUE",
    "APPLICATION_TRIAD_ASSOCIATIVITY=LEFT",
    "CONTEXT_PAYLOAD_TRIAD=PARENT_TO_(F_TO_Q)",
    "CONTEXT_TRIAD_ASSOCIATIVITY=RIGHT",
    "MIRROR_ASSOCIATIVITY=CONFIRMED_SCOPED",
    "ARGUMENT_ROLE_ALTERNATION=Q_START_TO_APPLICATION_END",
    "RESULT_ROLE_ALTERNATION=RESULT_END_TO_NEXT_FRAME_START",
    "CURRENT_ARGUMENT=START_OF_SELECTED_Q NEXT_CURSOR=END_OF_SELECTED_Q",
    "MOVING_FUNCTION_POINTER=RESULT_BECOMES_NEXT_F",
    "MOVING_ARGUMENT_POINTER=Q_BECOMES_NEXT_Q",
    "POINTER_MOVEMENT=IMMUTABLE_CHILD_CONTEXT_NOT_MUTATION",
    "MANY_RESULT=SIBLING_CHILD_CONTEXTS",
    "INTERMEDIATE_VALUES=CHILD_CONTEXT_LOCAL_TEMPORARIES",
    "EXHAUSTED_CURSOR=LOCAL_FRAME_RETURN_ONLY",
    "GLOBAL_TERMINATION=NOT_EQ_CURSOR_EXHAUSTION",
    "GENERALIZED_DETACHMENT_TRIAD=K_A_B_WITH_TWO_PREMISE_LINKS",
    "DETACHMENT=K_TO_A_PLUS_A_TO_B_GIVES_K_TO_B",
    "FRACTAL_OPERANDS=COMPOUND_LINKS_ALLOWED",
    "CASCADE=CONSEQUENCE_CAN_BECOME_NEXT_ANTECEDENT",
    "PARALLEL_CASCADE=ZERO_ONE_MANY_CONTINUATIONS",
    "CONVERGED_BRANCHES=ONE_ROOT_RETURN_CANDIDATE_DISTINCT_CHILD_ANCESTRY",
    "FUNCTION_AND_CURSOR=INDEPENDENT_FRAME_COORDINATES",
    "MISMATCHED_RESULT_PROVENANCE=REJECTED",
    "ARGUMENT_CURSOR_CARRIER=SCOPED_NOT_FINAL_REPRESENTATION",
    "JSONRVM=NORMATIVE_AUTHORITY_0",
    "NEXT=A65_CONTEXT_NATIVE_FRACTAL_DETACHMENT_CASCADE",
    "GLOBAL_E2=OPEN GLOBAL_E3=OPEN GLOBAL_E4=OPEN FULL_SELF_HOSTED=FALSE",
    "V013_NOT_ACCEPTED PRODUCTION_UNCHANGED",
  ].join(" "));
}
main();
