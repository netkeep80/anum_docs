import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { materializeExactSequence } from "../src/exact-sequence.js";
import { Memory, ensureRootBasis, type LinkHandle } from "../src/memory.js";
import { defineContext, readContext } from "../src/state.js";

function assert(c:unknown,m:string):asserts c{if(!c)throw new Error(`v0.13 A66e position branching: ${m}`);}
function same<T>(a:T,e:T,m:string):void{assert(Object.is(a,e),`${m}: values differ`);}
function expectThrows(fn:()=>void,m:string):void{let threw=false;try{fn();}catch{threw=true;}assert(threw,m);}

interface CellView{readonly previous:LinkHandle;readonly value:LinkHandle;}
function readExactCell(memory:Memory,cell:LinkHandle):CellView{
  assert(cell!==memory.root,"exact cell is not root");
  const outer=memory.poles(cell);
  same(outer.start,cell,"exact cell START-self-closed");
  const payload=memory.poles(outer.end);
  return Object.freeze({previous:payload.start,value:payload.end});
}
function definePosition(memory:Memory,sequence:LinkHandle,currentCell:LinkHandle):LinkHandle{
  return memory.ensure(sequence,currentCell);
}
interface PositionStep{
  readonly argument:LinkHandle;
  readonly doneAfter:boolean;
  readonly nextPosition?:LinkHandle;
}
function stepPosition(memory:Memory,position:LinkHandle):PositionStep{
  const p=memory.poles(position);
  const sequence=p.start;
  const current=p.end;
  const currentView=readExactCell(memory,current);
  if(current===sequence)return Object.freeze({argument:currentView.value,doneAfter:true});
  let cursor=sequence;
  const seen=new Set<LinkHandle>();
  while(cursor!==memory.root){
    assert(!seen.has(cursor),"sequence ancestry cycle");
    seen.add(cursor);
    const view=readExactCell(memory,cursor);
    if(view.previous===current){
      return Object.freeze({
        argument:currentView.value,
        doneAfter:false,
        nextPosition:definePosition(memory,sequence,cursor),
      });
    }
    cursor=view.previous;
  }
  throw new Error("selected current cell is not in selected sequence");
}
function initialPosition(memory:Memory,sequence:LinkHandle):LinkHandle{
  assert(sequence!==memory.root,"selected sequence must be non-empty");
  const seen=new Set<LinkHandle>();
  let current=sequence;
  while(true){
    assert(!seen.has(current),"selected sequence ancestry cycle");
    seen.add(current);
    const cell=readExactCell(memory,current);
    if(cell.previous===memory.root)return definePosition(memory,sequence,current);
    current=cell.previous;
  }
}
function defineFrame(memory:Memory,parent:LinkHandle,f:LinkHandle,position:LinkHandle):LinkHandle{
  return defineContext(memory,parent,memory.ensure(f,position));
}
function advanceOnePosition(memory:Memory,context:LinkHandle,selectedResultFact:LinkHandle):LinkHandle{
  const k=readContext(memory,context);
  const state=memory.poles(k.current);
  const f=state.start;
  const position=state.end;
  const positionStep=stepPosition(memory,position);
  assert(!positionStep.doneAfter,"A66e fixture requires next position");
  assert(positionStep.nextPosition!==undefined,"A66e next position exists");
  const fact=memory.poles(selectedResultFact);
  const application=memory.poles(fact.start);
  same(application.start,f,"selected result uses current F");
  same(application.end,positionStep.argument,"selected result uses current argument");
  return defineFrame(memory,context,fact.end,positionStep.nextPosition);
}

function freezeCarrier(memory:Memory,values:readonly LinkHandle[]):LinkHandle{
  let body=memory.root;
  for(let i=values.length-1;i>=0;i-=1)body=memory.ensure(values[i]!,body);
  return memory.ensureStartSelfClosed(body);
}
function readCarrier(memory:Memory,envelope:LinkHandle):readonly LinkHandle[]{
  const e=memory.poles(envelope);
  same(e.start,envelope,"selected carrier START-self-closed");
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
function branchOnePosition(memory:Memory,context:LinkHandle,selectedResults:LinkHandle):LinkHandle{
  const children=readCarrier(memory,selectedResults)
    .map(resultFact=>advanceOnePosition(memory,context,resultFact));
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
  const a1=memory.ensure(b.O,b.C);
  const a2=memory.ensure(b.C,b.O);
  const y1=memory.ensure(a1,b.L);
  const y2=memory.ensure(a1,b.U);
  const ambientY=memory.ensure(a2,b.L);

  const sequence=materializeExactSequence(memory,[a1,a2]);
  const p0=initialPosition(memory,sequence);
  const firstStep=stepPosition(memory,p0);
  assert(firstStep.nextPosition!==undefined&&!firstStep.doneAfter,"A66e initial position advances");
  const p1=firstStep.nextPosition;

  const k=defineFrame(memory,memory.root,f,p0);
  const application=memory.ensure(f,a1);
  const fact1=memory.ensure(application,y1);
  const fact2=memory.ensure(application,y2);
  const ambientFact=memory.ensure(application,ambientY);

  const zero=readCarrier(memory,branchOnePosition(memory,k,freezeCarrier(memory,[])));
  same(zero.length,0,"ZERO selected results produce ZERO child contexts");

  const one=readCarrier(memory,branchOnePosition(memory,k,freezeCarrier(memory,[fact1])));
  same(one.length,1,"ONE selected result produces ONE child context");
  const expected1=defineFrame(memory,k,y1,p1);
  same(one[0],expected1,"ONE child is exact position-based child");

  const many=readCarrier(memory,branchOnePosition(memory,k,freezeCarrier(memory,[fact1,fact2])));
  const expected2=defineFrame(memory,k,y2,p1);
  setSame(many,[expected1,expected2],"MANY produces exact sibling child contexts");
  assert(expected1!==expected2,"distinct results produce distinct siblings");

  for(const child of many){
    const s=memory.poles(readContext(memory,child).current);
    const pos=memory.poles(s.end);
    same(pos.start,sequence,"all siblings retain selected Sequence identity");
    same(s.end,p1,"all siblings share exact advanced position");
  }

  const reversed=readCarrier(memory,branchOnePosition(memory,k,freezeCarrier(memory,[fact2,fact1])));
  setSame(reversed,[expected1,expected2],"selected result order does not change extensional child set");

  const oneAgain=readCarrier(memory,branchOnePosition(memory,k,freezeCarrier(memory,[fact1])));
  same(oneAgain.length,1,"ambient physical result remains unselected");
  same(oneAgain[0],expected1,"ambient result cannot create a child");
  assert(!oneAgain.includes(defineFrame(memory,k,ambientY,p1)),"ambient result child absent");
  same(memory.poles(ambientFact).start,application,"ambient result fact physically exists");

  const wrongF=memory.ensure(b.O,b.U);
  const wrongFact=memory.ensure(memory.ensure(wrongF,a1),ambientY);
  expectThrows(
    ()=>{branchOnePosition(memory,k,freezeCarrier(memory,[fact1,wrongFact]));},
    "malformed selected result fails closed",
  );

  const beforeRepeat=memory.linkCount;
  const manyAgain=readCarrier(memory,branchOnePosition(memory,k,freezeCarrier(memory,[fact1,fact2])));
  setSame(manyAgain,[expected1,expected2],"repeat returns same siblings");
  same(memory.linkCount,beforeRepeat,"repeat branching adds no Links");
}

function staticGuards():void{
  const root=resolve(process.cwd(),"..");
  const own=readFileSync(
    join(root,"ts/test/research-v013-exact-sequence-position-branching-a66e.test.ts"),"utf8",
  );
  const a66d=readFileSync(
    join(root,"ts/test/research-v013-exact-sequence-frame-step-a66d.test.ts"),"utf8",
  );
  const slice=(s:string,a:string,b:string):string=>{
    const i=s.indexOf(a),j=s.indexOf(b,i+1);
    assert(i>=0&&j>i,`slice ${a}`);
    return s.slice(i,j).replace(/\s+/g,"");
  };
  same(
    slice(own,"function advanceOnePosition(","\nfunction freezeCarrier("),
    slice(a66d,"function advanceOnePosition(","\nfunction exercise("),
    "A66e atomic frame step is source-identical A66d",
  );
  const branch=slice(own,"function branchOnePosition(","\nfunction setSame(");
  for(const forbidden of [
    "branchOnePosition(memory,",
    "schedule",
    "recurs",
    "publication",
    "admission",
    "forwardCursor(",
    "MetaState",
  ])assert(!branch.includes(forbidden),`A66e one-layer branching excludes ${forbidden}`);
}

function main():void{
  exercise(false);
  exercise(true);
  staticGuards();
  console.log([
    "MTS v0.13 A66e: EXACT_SEQUENCE_POSITION_BRANCHING=GREEN_SCOPED_RESEARCH",
    "FRAME_STATE=F_TO_P",
    "ATOMIC_STEP=A66D_SOURCE_IDENTICAL",
    "ZERO_RESULTS=ZERO_CHILDREN",
    "ONE_RESULT=ONE_CHILD",
    "MANY_RESULTS=MANY_SIBLING_CHILDREN",
    "SIBLING_POSITION=SHARED_NEXT_P",
    "SIBLING_SEQUENCE_IDENTITY=PRESERVED",
    "SELECTED_RESULT_ORDER=EXTENSIONALLY_INERT",
    "AMBIENT_RESULT_FACT=INERT",
    "MALFORMED_SELECTED_RESULT=FAIL_CLOSED",
    "REPEATED_BRANCHING=CANONICAL_NO_GROWTH",
    "FORWARD_Q_CHAIN=0",
    "RECURSION=NOT_TESTED SCHEDULER=NOT_TESTED",
    "NEXT=A66F_POSITION_BASED_RECURSION_LOCAL_TERMINATION",
    "V013_NOT_ACCEPTED PRODUCTION_UNCHANGED",
  ].join(" "));
}
main();
