import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { Memory, ensureRootBasis, type LinkHandle } from "../src/memory.js";
import { defineContext, readContext } from "../src/state.js";

function assert(c:unknown,m:string):asserts c{if(!c)throw new Error(`v0.13 A65c context-native recursion: ${m}`);}
function same<T>(a:T,e:T,m:string):void{assert(Object.is(a,e),`${m}: values differ`);}

function defineFrame(memory:Memory,parent:LinkHandle,f:LinkHandle,q:LinkHandle):LinkHandle{
  return defineContext(memory,parent,memory.ensure(f,q));
}

function advanceOne(
  memory: Memory,
  context: LinkHandle,
  selectedResultFact: LinkHandle,
): LinkHandle {
  const k=readContext(memory,context);
  const state=memory.poles(k.current);
  const f=state.start;
  const q=state.end;

  assert(q!==memory.root,"argument cursor is not exhausted");
  const cursor=memory.poles(q);
  const argument=cursor.start;
  const nextQ=cursor.end;

  const fact=memory.poles(selectedResultFact);
  const application=memory.poles(fact.start);
  same(application.start,f,"selected result uses current F");
  same(application.end,argument,"selected result uses current argument");

  return defineFrame(memory,context,fact.end,nextQ);
}

function freezeCarrier(memory:Memory,values:readonly LinkHandle[]):LinkHandle{
  let body=memory.root;
  for(let i=values.length-1;i>=0;i-=1)body=memory.ensure(values[i]!,body);
  return memory.ensureStartSelfClosed(body);
}

function readCarrier(memory:Memory,envelope:LinkHandle):readonly LinkHandle[]{
  const e=memory.poles(envelope);
  same(e.start,envelope,"selected carrier is START-self-closed");
  const out:LinkHandle[]=[];
  const seen=new Set<LinkHandle>();
  let cursor=e.end;
  while(cursor!==memory.root){
    assert(!seen.has(cursor),"selected carrier cycle");
    seen.add(cursor);
    const p=memory.poles(cursor);
    out.push(p.start);
    cursor=p.end;
  }
  return Object.freeze(out);
}

function branchOne(
  memory:Memory,
  context:LinkHandle,
  selectedResults:LinkHandle,
):LinkHandle{
  const children=readCarrier(memory,selectedResults)
    .map(resultFact=>advanceOne(memory,context,resultFact));
  return freezeCarrier(memory,children);
}

function setSame(actual:readonly LinkHandle[],expected:readonly LinkHandle[],m:string):void{
  same(new Set(actual).size,new Set(expected).size,`${m}: cardinality`);
  for(const x of expected)assert(actual.includes(x),`${m}: missing child`);
}

function frameState(memory:Memory,K:LinkHandle):{readonly f:LinkHandle;readonly q:LinkHandle}{
  const k=readContext(memory,K),s=memory.poles(k.current);
  return Object.freeze({f:s.start,q:s.end});
}

function exercise(noise:boolean):void{
  const memory=new Memory();
  const b=ensureRootBasis(memory);
  if(noise)memory.ensure(memory.ensure(b.U,b.C),b.O);

  const f0=memory.ensure(b.L,b.U);
  const a1=memory.ensure(b.O,b.C);
  const a2=memory.ensure(b.C,b.O);
  const q1=memory.ensure(a2,memory.root);
  const q0=memory.ensure(a1,q1);
  const K0=defineFrame(memory,memory.root,f0,q0);

  const app0=memory.ensure(f0,a1);
  const gA=memory.ensure(a1,b.L);
  const gB=memory.ensure(a1,b.U);
  const factA=memory.ensure(app0,gA);
  const factB=memory.ensure(app0,gB);

  // Reuse A65b once: one parent -> two first-level children.
  const level1=readCarrier(memory,branchOne(memory,K0,freezeCarrier(memory,[factA,factB])));
  const KA=defineFrame(memory,K0,gA,q1);
  const KB=defineFrame(memory,K0,gB,q1);
  setSame(level1,[KA,KB],"first layer is exact A65b branching");

  // Exactly one branch gets exactly one selected second-step continuation.
  const z=memory.ensure(a2,b.L);
  const appA=memory.ensure(gA,a2);
  const factAZ=memory.ensure(appA,z);
  const level2A=readCarrier(memory,branchOne(memory,KA,freezeCarrier(memory,[factAZ])));
  same(level2A.length,1,"continuing branch creates one grandchild");
  const KAZ=defineFrame(memory,KA,z,memory.root);
  same(level2A[0],KAZ,"grandchild is exact repeated A65a child law");

  // Sibling has the same remaining argument but ZERO selected continuations.
  const ambientBValue=memory.ensure(a2,b.U);
  const ambientBFact=memory.ensure(memory.ensure(gB,a2),ambientBValue);
  const beforeB=frameState(memory,KB);
  same(beforeB.q,q1,"terminating branch still has one argument cursor cell");
  assert(beforeB.q!==memory.root,"local termination is not cursor exhaustion");

  const level2B=readCarrier(memory,branchOne(memory,KB,freezeCarrier(memory,[])));
  same(level2B.length,0,"ZERO selected second-step results terminates this branch locally");
  same(frameState(memory,KB).f,gB,"terminated child keeps current F");
  same(frameState(memory,KB).q,q1,"terminated child keeps remaining Q");
  same(memory.poles(ambientBFact).start,memory.ensure(gB,a2),
    "ambient physical continuation exists but remains unselected");

  // The continued branch consumed exactly one further cursor cell.
  const afterA=frameState(memory,KAZ);
  same(afterA.f,z,"recursive step result becomes grandchild F");
  same(afterA.q,memory.root,"recursive step advances exactly one Q cell");

  // Only KA has a selected child at level 2; KB stops at its first child frame.
  assert(KAZ!==KB,"continued grandchild remains distinct from terminated sibling");
}

function staticGuards():void{
  const root=resolve(process.cwd(),"..");
  const own=readFileSync(
    join(root,"ts/test/research-v013-context-native-recursion-a65c.test.ts"),"utf8",
  );
  const a65b=readFileSync(
    join(root,"ts/test/research-v013-context-native-branching-a65b.test.ts"),"utf8",
  );
  const slice=(s:string,a:string,b:string):string=>{
    const i=s.indexOf(a),j=s.indexOf(b,i+1);
    assert(i>=0&&j>i,`slice ${a}`);
    return s.slice(i,j).replace(/\s+/g,"");
  };

  same(
    slice(own,"function advanceOne(","\nfunction freezeCarrier("),
    slice(a65b,"function advanceOne(","\nfunction freezeCarrier("),
    "A65c atomic child law is source-identical A65b/A65a",
  );
  same(
    slice(own,"function branchOne(","\nfunction setSame("),
    slice(a65b,"function branchOne(","\nfunction setSame("),
    "A65c one-layer branching law is source-identical A65b",
  );

  const exercise=slice(own,"function exercise(","\nfunction staticGuards(");
  for(const forbidden of [
    "schedule",
    "convergence",
    "publication",
    "admission",
    "MetaState",
    "occurrence",
  ])assert(!exercise.includes(forbidden),`A65c scoped exercise excludes ${forbidden}`);
}

function main():void{
  exercise(false);
  exercise(true);
  staticGuards();
  console.log([
    "MTS v0.13 A65c: CONTEXT_NATIVE_TWO_LEVEL_CONTINUATION=GREEN_SCOPED_RESEARCH",
    "LEVEL1=A65B_SOURCE_IDENTICAL",
    "LEVEL2=A65B_SOURCE_IDENTICAL_REAPPLIED_TO_CHILD",
    "CONTINUING_CHILD=ONE_GRANDCHILD",
    "TERMINATING_CHILD=ZERO_GRANDCHILDREN",
    "LOCAL_TERMINATION_WITH_REMAINING_Q=CONFIRMED",
    "AMBIENT_UNSELECTED_CONTINUATION=INERT",
    "CURSOR_ADVANCE_PER_SUCCESSFUL_STEP=ONE_CELL",
    "CONVERGENCE=NOT_TESTED PROVENANCE_REDUCTION=NOT_TESTED SCHEDULER=NOT_TESTED",
    "GENERALIZED_CASCADE=NOT_TESTED Q_REPRESENTATION=SCOPED_NOT_FINAL",
    "V013_NOT_ACCEPTED PRODUCTION_UNCHANGED",
  ].join(" "));
}

main();
