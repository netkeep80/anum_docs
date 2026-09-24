import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { materializeExactSequence } from "../src/exact-sequence.js";
import { Memory, ensureRootBasis, type LinkHandle } from "../src/memory.js";
import { defineContext, readContext } from "../src/state.js";

function assert(c:unknown,m:string):asserts c{if(!c)throw new Error(`v0.13 A66d ExactSequence frame step: ${m}`);}
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

  if(current===sequence){
    return Object.freeze({argument:currentView.value,doneAfter:true});
  }

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

function defineFrame(
  memory:Memory,
  parent:LinkHandle,
  f:LinkHandle,
  position:LinkHandle,
):LinkHandle{
  return defineContext(memory,parent,memory.ensure(f,position));
}

function advanceOnePosition(
  memory:Memory,
  context:LinkHandle,
  selectedResultFact:LinkHandle,
):LinkHandle{
  const k=readContext(memory,context);
  const state=memory.poles(k.current);
  const f=state.start;
  const position=state.end;

  const positionStep=stepPosition(memory,position);
  assert(!positionStep.doneAfter,"A66d fixture requires a next ExactSequence position");
  assert(positionStep.nextPosition!==undefined,"A66d next position exists");

  const fact=memory.poles(selectedResultFact);
  const application=memory.poles(fact.start);
  same(application.start,f,"selected result uses current F");
  same(application.end,positionStep.argument,"selected result uses current ExactSequence argument");

  return defineFrame(memory,context,fact.end,positionStep.nextPosition);
}

function exercise(noise:boolean):void{
  const memory=new Memory();
  const b=ensureRootBasis(memory);
  if(noise)memory.ensure(memory.ensure(b.U,b.C),b.O);

  const f=memory.ensure(b.L,b.U);
  const a1=memory.ensure(b.O,b.C);
  const a2=memory.ensure(b.C,b.O);
  const y=memory.ensure(a1,b.L);

  const sequence=materializeExactSequence(memory,[a1,a2]);
  const p0=initialPosition(memory,sequence);
  const p0p=memory.poles(p0);
  same(p0p.start,sequence,"initial position retains selected sequence");

  const initialCell=p0p.end;
  same(readExactCell(memory,initialCell).value,a1,"initial position selects first argument");

  const k0=defineFrame(memory,memory.root,f,p0);
  const application=memory.ensure(f,a1);
  const resultFact=memory.ensure(application,y);

  const child=advanceOnePosition(memory,k0,resultFact);
  const childContext=readContext(memory,child);
  same(childContext.parent,k0,"child parent is exact previous context");

  const childState=memory.poles(childContext.current);
  same(childState.start,y,"result becomes next F");
  const p1=childState.end;
  const p1p=memory.poles(p1);
  same(p1p.start,sequence,"advanced position retains exact selected sequence identity");
  same(p1p.end,sequence,"two-element advanced position selects final ExactSequence cell");

  const second=stepPosition(memory,p1);
  same(second.argument,a2,"advanced position exposes second argument");
  same(second.doneAfter,true,"second argument exhausts selected sequence");
  assert(second.nextPosition===undefined,"final position has no successor");

  // Parent frame remains immutable.
  const parentState=memory.poles(readContext(memory,k0).current);
  same(parentState.start,f,"parent keeps original F");
  same(parentState.end,p0,"parent keeps original position");

  // Wrong selected result evidence still fails exactly at application matching.
  const wrongF=memory.ensure(b.O,b.U);
  const wrongFResult=memory.ensure(memory.ensure(wrongF,a1),y);
  expectThrows(()=>advanceOnePosition(memory,k0,wrongFResult),"wrong F result rejected");

  const wrongArgument=memory.ensure(b.U,b.L);
  const wrongArgResult=memory.ensure(memory.ensure(f,wrongArgument),y);
  expectThrows(()=>advanceOnePosition(memory,k0,wrongArgResult),"wrong argument result rejected");

  // Position references existing ExactSequence cells; no forward suffix Q is constructed.
  const beforeRepeat=memory.linkCount;
  same(initialPosition(memory,sequence),p0,"initial position canonical");
  const repeatChild=advanceOnePosition(memory,k0,resultFact);
  same(repeatChild,child,"repeated step canonical");
  same(memory.linkCount,beforeRepeat,"repeated position-based step adds no Links");
}

function staticGuards():void{
  const root=resolve(process.cwd(),"..");
  const own=readFileSync(
    join(root,"ts/test/research-v013-exact-sequence-frame-step-a66d.test.ts"),"utf8",
  );
  const a66b=readFileSync(
    join(root,"ts/test/research-v013-exact-sequence-position-a66b.test.ts"),"utf8",
  );
  const a66c=readFileSync(
    join(root,"ts/test/research-v013-exact-sequence-initial-position-a66c.test.ts"),"utf8",
  );

  const slice=(s:string,a:string,b:string):string=>{
    const i=s.indexOf(a),j=s.indexOf(b,i+1);
    assert(i>=0&&j>i,`slice ${a}`);
    return s.slice(i,j).replace(/\s+/g,"");
  };

  same(
    slice(own,"function stepPosition(","\nfunction initialPosition("),
    slice(a66b,"function stepPosition(","\nfunction exercise("),
    "A66d position advancement is source-identical A66b",
  );
  same(
    slice(own,"function initialPosition(","\nfunction defineFrame("),
    slice(a66c,"function initialPosition(","\nfunction positionValue("),
    "A66d position initialization is source-identical A66c",
  );

  const step=slice(own,"function advanceOnePosition(","\nfunction exercise(");
  for(const forbidden of [
    "forwardCursor(",
    "readExactSequence(",
    ".incoming(",
    ".outgoing(",
    ".allLinks(",
    "MetaState",
    "currentFn:",
    "tos:",
    "branchOne(",
    "schedule",
  ])assert(!step.includes(forbidden),`A66d atomic frame step excludes ${forbidden}`);
}

function main():void{
  exercise(false);
  exercise(true);
  staticGuards();
  console.log([
    "MTS v0.13 A66d: EXACT_SEQUENCE_POSITION_FRAME_STEP=GREEN_SCOPED_RESEARCH",
    "FRAME_STATE=F_TO_P",
    "POSITION=P_EQ_SEQUENCE_TO_CURRENT_CELL",
    "INITIAL_POSITION=A66C_SOURCE_IDENTICAL",
    "POSITION_STEP=A66B_SOURCE_IDENTICAL",
    "CURRENT_ARGUMENT=FROM_SELECTED_EXACT_SEQUENCE_POSITION",
    "RESULT_FACT=(F_TO_ARG)_TO_Y",
    "CHILD_STATE=Y_TO_NEXT_POSITION",
    "SEQUENCE_IDENTITY=PRESERVED_ACROSS_ADVANCE",
    "FORWARD_Q_CHAIN=0",
    "HOST_INDEX=0 HOST_VALUE_ARRAY=0 AMBIENT_MEMORY_ENUMERATION=0",
    "PARENT_CONTEXT_IMMUTABLE=YES",
    "WRONG_F=REJECTED WRONG_ARGUMENT=REJECTED",
    "REPEATED_STEP=CANONICAL_NO_GROWTH",
    "BRANCHING=NOT_TESTED RECURSION=NOT_TESTED SCHEDULER=NOT_TESTED",
    "NEXT=A66E_POSITION_BASED_BRANCHING_OR_SCHEDULER",
    "V013_NOT_ACCEPTED PRODUCTION_UNCHANGED",
  ].join(" "));
}
main();
