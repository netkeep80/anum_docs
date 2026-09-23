import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { Memory, ensureRootBasis, type LinkHandle } from "../src/memory.js";
import { defineContext, readContext } from "../src/state.js";

function assert(c:unknown,m:string):asserts c{if(!c)throw new Error(`v0.13 A65b context-native branching: ${m}`);}
function same<T>(a:T,e:T,m:string):void{assert(Object.is(a,e),`${m}: values differ`);}
function expectThrows(fn:()=>void,m:string):void{let threw=false;try{fn();}catch{threw=true;}assert(threw,m);}

function defineFrame(memory:Memory,parent:LinkHandle,f:LinkHandle,q:LinkHandle):LinkHandle{
  return defineContext(memory,parent,memory.ensure(f,q));
}

function advanceOne(memory:Memory,context:LinkHandle,selectedResultFact:LinkHandle):LinkHandle{
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

/**
 * Exactly one branching layer.
 *
 * Input:
 *   K
 *   selected result-fact carrier
 *
 * Output:
 *   carrier of child contexts
 *
 * No child is executed again here.
 */
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

function exercise(noise:boolean):void{
  const memory=new Memory();
  const b=ensureRootBasis(memory);
  if(noise)memory.ensure(memory.ensure(b.U,b.C),b.O);

  const f=memory.ensure(b.L,b.U);
  const argument=memory.ensure(b.O,b.C);
  const nextQ=memory.ensure(b.C,b.L);
  const q=memory.ensure(argument,nextQ);
  const K=defineFrame(memory,memory.root,f,q);

  const application=memory.ensure(f,argument);
  const y1=memory.ensure(b.C,b.O);
  const y2=memory.ensure(b.O,b.L);
  const ambientY=memory.ensure(b.U,b.L);
  const fact1=memory.ensure(application,y1);
  const fact2=memory.ensure(application,y2);
  const ambientFact=memory.ensure(application,ambientY);

  const zero=readCarrier(memory,branchOne(memory,K,freezeCarrier(memory,[])));
  same(zero.length,0,"ZERO selected results produce ZERO children");

  const one=readCarrier(memory,branchOne(memory,K,freezeCarrier(memory,[fact1])));
  same(one.length,1,"ONE selected result produces ONE child");
  const expected1=defineFrame(memory,K,y1,nextQ);
  same(one[0],expected1,"ONE child is exact A65a child");

  const many=readCarrier(memory,branchOne(memory,K,freezeCarrier(memory,[fact1,fact2])));
  const expected2=defineFrame(memory,K,y2,nextQ);
  setSame(many,[expected1,expected2],"MANY selected results produce exact child set");
  assert(expected1!==expected2,"distinct results produce distinct child contexts");

  const reversed=readCarrier(memory,branchOne(memory,K,freezeCarrier(memory,[fact2,fact1])));
  setSame(reversed,[expected1,expected2],"selected carrier order does not change extensional child set");

  const oneAgain=readCarrier(memory,branchOne(memory,K,freezeCarrier(memory,[fact1])));
  same(oneAgain.length,1,"ambient result remains unselected");
  same(oneAgain[0],expected1,"ambient result cannot create child");
  assert(!oneAgain.includes(defineFrame(memory,K,ambientY,nextQ)),
    "ambient physical result fact is inert outside selected carrier");

  const wrongF=memory.ensure(b.O,b.U);
  const wrongFact=memory.ensure(memory.ensure(wrongF,argument),ambientY);
  expectThrows(
    ()=>{branchOne(memory,K,freezeCarrier(memory,[fact1,wrongFact]));},
    "malformed selected result makes branching fail closed",
  );

  // Presence is not selection.
  same(memory.poles(ambientFact).start,application,"ambient fact physically exists");
}

function staticGuards():void{
  const root=resolve(process.cwd(),"..");
  const own=readFileSync(
    join(root,"ts/test/research-v013-context-native-branching-a65b.test.ts"),"utf8",
  );
  const a65a=readFileSync(
    join(root,"ts/test/research-v013-context-native-step-a65a.test.ts"),"utf8",
  );

  const slice=(s:string,a:string,b:string):string=>{
    const i=s.indexOf(a),j=s.indexOf(b,i+1);
    assert(i>=0&&j>i,`slice ${a}`);
    return s.slice(i,j).replace(/\s+/g,"");
  };
  same(
    slice(own,"function advanceOne(","\nfunction freezeCarrier("),
    slice(a65a,"function advanceOne(","\nfunction exercise("),
    "A65b child law is source-identical to A65a",
  );

  const branch=slice(own,"function branchOne(","\nfunction setSame(");
  for(const forbidden of [
    "branchOne(memory",
    "readContext(memory,children",
    "MetaState",
    "schedule",
    "publication",
    "admission",
  ])assert(!branch.includes(forbidden),`A65b one-layer branching excludes ${forbidden}`);
}

function main():void{
  exercise(false);
  exercise(true);
  staticGuards();
  console.log([
    "MTS v0.13 A65b: CONTEXT_NATIVE_ONE_STEP_BRANCHING=GREEN_SCOPED_RESEARCH",
    "INPUTS=CONTEXT_PLUS_SELECTED_RESULT_CARRIER",
    "CHILD_LAW=A65A_SOURCE_IDENTICAL",
    "ZERO_RESULTS=ZERO_CHILDREN",
    "ONE_RESULT=ONE_CHILD",
    "MANY_RESULTS=MANY_SIBLING_CHILDREN",
    "SELECTED_ORDER=EXTENSIONALLY_INERT",
    "AMBIENT_RESULT_FACT=INERT",
    "MALFORMED_SELECTED_RESULT=FAIL_CLOSED",
    "RECURSION=NOT_TESTED LOCAL_TERMINATION=NOT_TESTED CONVERGENCE=NOT_TESTED",
    "Q_REPRESENTATION=SCOPED_NOT_FINAL",
    "V013_NOT_ACCEPTED PRODUCTION_UNCHANGED",
  ].join(" "));
}

main();
