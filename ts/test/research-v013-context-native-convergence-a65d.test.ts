import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { Memory, ensureRootBasis, type LinkHandle } from "../src/memory.js";
import { defineContext, readContext } from "../src/state.js";

function assert(c:unknown,m:string):asserts c{if(!c)throw new Error(`v0.13 A65d context-native convergence: ${m}`);}
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

function ancestry(memory:Memory,leaf:LinkHandle):readonly LinkHandle[]{
  const out:LinkHandle[]=[];
  const seen=new Set<LinkHandle>();
  let cursor=leaf;
  while(cursor!==memory.root){
    assert(!seen.has(cursor),"context ancestry cycle");
    seen.add(cursor);
    out.push(cursor);
    cursor=readContext(memory,cursor).parent;
  }
  return Object.freeze(out);
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

  const level1=readCarrier(memory,branchOne(memory,K0,freezeCarrier(memory,[factA,factB])));
  const KA=defineFrame(memory,K0,gA,q1);
  const KB=defineFrame(memory,K0,gB,q1);
  setSame(level1,[KA,KB],"first layer preserves the two sibling histories");

  // Both siblings use the same second argument and converge extensionally to z.
  const z=memory.ensure(a2,b.L);
  const factAZ=memory.ensure(memory.ensure(gA,a2),z);
  const factBZ=memory.ensure(memory.ensure(gB,a2),z);

  const nextA=readCarrier(memory,branchOne(memory,KA,freezeCarrier(memory,[factAZ])));
  const nextB=readCarrier(memory,branchOne(memory,KB,freezeCarrier(memory,[factBZ])));
  same(nextA.length,1,"branch A creates one leaf");
  same(nextB.length,1,"branch B creates one leaf");

  const KAZ=nextA[0]!;
  const KBZ=nextB[0]!;
  const stateA=frameState(memory,KAZ);
  const stateB=frameState(memory,KBZ);

  same(stateA.f,z,"branch A extensional value");
  same(stateB.f,z,"branch B extensional value");
  same(stateA.q,memory.root,"branch A cursor state");
  same(stateB.q,memory.root,"branch B cursor state");
  same(new Set([stateA.f,stateB.f]).size,1,"converged extensional value count");
  same(new Set([KAZ,KBZ]).size,2,"converged context count");

  assert(KAZ!==KBZ,"equal F does not collapse leaf contexts");
  same(readContext(memory,KAZ).parent,KA,"branch A leaf retains exact parent");
  same(readContext(memory,KBZ).parent,KB,"branch B leaf retains exact parent");
  assert(KA!==KB,"first-level branch contexts remain distinct");

  const pathA=ancestry(memory,KAZ);
  const pathB=ancestry(memory,KBZ);
  same(pathA.length,3,"branch A ancestry depth");
  same(pathB.length,3,"branch B ancestry depth");
  same(pathA[2],K0,"branch A reaches common root frame");
  same(pathB[2],K0,"branch B reaches common root frame");
  assert(pathA[0]!==pathB[0],"leaf ancestry differs");
  assert(pathA[1]!==pathB[1],"parent ancestry differs");

  // Re-materialization preserves the same two context identities.
  same(defineFrame(memory,KA,z,memory.root),KAZ,"branch A leaf canonical");
  same(defineFrame(memory,KB,z,memory.root),KBZ,"branch B leaf canonical");
}

function staticGuards():void{
  const root=resolve(process.cwd(),"..");
  const own=readFileSync(
    join(root,"ts/test/research-v013-context-native-convergence-a65d.test.ts"),"utf8",
  );
  const a65c=readFileSync(
    join(root,"ts/test/research-v013-context-native-recursion-a65c.test.ts"),"utf8",
  );
  const slice=(s:string,a:string,b:string):string=>{
    const i=s.indexOf(a),j=s.indexOf(b,i+1);
    assert(i>=0&&j>i,`slice ${a}`);
    return s.slice(i,j).replace(/\s+/g,"");
  };

  same(
    slice(own,"function advanceOne(","\nfunction freezeCarrier("),
    slice(a65c,"function advanceOne(","\nfunction freezeCarrier("),
    "A65d atomic child law is source-identical A65c/A65b/A65a",
  );
  same(
    slice(own,"function branchOne(","\nfunction setSame("),
    slice(a65c,"function branchOne(","\nfunction setSame("),
    "A65d branching law is source-identical A65c/A65b",
  );

  const normative=own.slice(0,own.indexOf("function staticGuards():void"));
  for(const forbidden of [
    "MetaState",
    "occurrence",
    "schedule",
    "publication",
    "admission",
    "generalized",
  ])assert(!normative.includes(forbidden),`A65d scoped execution excludes ${forbidden}`);
}

function main():void{
  exercise(false);
  exercise(true);
  staticGuards();
  console.log([
    "MTS v0.13 A65d: CONTEXT_NATIVE_CONVERGENCE_HISTORY=GREEN_SCOPED_RESEARCH",
    "EXECUTION_LAWS=A65A_A65B_SOURCE_IDENTICAL",
    "EXTENSIONAL_FINAL_F_COUNT=1",
    "DISTINCT_LEAF_CONTEXT_COUNT=2",
    "DISTINCT_PARENT_CONTEXT_COUNT=2",
    "COMMON_ANCESTOR=K0",
    "BRANCH_HISTORY=RECOVERABLE_FROM_CONTEXT_ANCESTRY",
    "SEPARATE_EXECUTION_PATH_CARRIER=0_SCOPED",
    "A21_OCCURRENCE_MODEL=NOT_INVALIDATED",
    "SCHEDULER_EQUIVALENCE=NOT_TESTED GENERALIZED_CASCADE=NOT_TESTED",
    "Q_REPRESENTATION=SCOPED_NOT_FINAL",
    "V013_NOT_ACCEPTED PRODUCTION_UNCHANGED",
  ].join(" "));
}

main();
