import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { materializeExactSequence } from "../src/exact-sequence.js";
import { Memory, ensureRootBasis, type LinkHandle } from "../src/memory.js";
import { defineContext, readContext } from "../src/state.js";

function assert(c:unknown,m:string):asserts c{if(!c)throw new Error(`v0.13 A66f position recursion: ${m}`);}
function same<T>(a:T,e:T,m:string):void{assert(Object.is(a,e),`${m}: values differ`);}

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
function frameState(memory:Memory,k:LinkHandle):{readonly f:LinkHandle;readonly position:LinkHandle}{
  const context=readContext(memory,k);
  const state=memory.poles(context.current);
  return Object.freeze({f:state.start,position:state.end});
}

function exercise(noise:boolean):void{
  const memory=new Memory();
  const b=ensureRootBasis(memory);
  if(noise)memory.ensure(memory.ensure(b.U,b.C),b.O);

  const f0=memory.ensure(b.L,b.U);
  const a1=memory.ensure(b.O,b.C);
  const a2=memory.ensure(b.C,b.O);
  const a3=memory.ensure(a1,a2);
  const gA=memory.ensure(a1,b.L);
  const gB=memory.ensure(a1,b.U);
  const z=memory.ensure(a2,b.L);

  const sequence=materializeExactSequence(memory,[a1,a2,a3]);
  const p0=initialPosition(memory,sequence);
  const p0step=stepPosition(memory,p0);
  assert(!p0step.doneAfter&&p0step.nextPosition!==undefined,"P0 advances to P1");
  same(p0step.argument,a1,"P0 selects a1");
  const p1=p0step.nextPosition;

  const p1step=stepPosition(memory,p1);
  assert(!p1step.doneAfter&&p1step.nextPosition!==undefined,"P1 advances to P2");
  same(p1step.argument,a2,"P1 selects a2");
  const p2=p1step.nextPosition;

  const p2step=stepPosition(memory,p2);
  same(p2step.argument,a3,"P2 selects final a3");
  same(p2step.doneAfter,true,"P2 is final selected position");
  assert(p2step.nextPosition===undefined,"final selected position has no synthetic exhausted P");

  const k0=defineFrame(memory,memory.root,f0,p0);

  // Level 1: exact A66e MANY branching at a1.
  const app0=memory.ensure(f0,a1);
  const factA=memory.ensure(app0,gA);
  const factB=memory.ensure(app0,gB);
  const level1=readCarrier(
    memory,
    branchOnePosition(memory,k0,freezeCarrier(memory,[factA,factB])),
  );
  const kA=defineFrame(memory,k0,gA,p1);
  const kB=defineFrame(memory,k0,gB,p1);
  setSame(level1,[kA,kB],"first layer is exact A66e branching");

  // Level 2: only branch A has one selected continuation at a2.
  const appA=memory.ensure(gA,a2);
  const factAZ=memory.ensure(appA,z);
  const level2A=readCarrier(
    memory,
    branchOnePosition(memory,kA,freezeCarrier(memory,[factAZ])),
  );
  same(level2A.length,1,"continuing branch creates one grandchild");
  const kAZ=defineFrame(memory,kA,z,p2);
  same(level2A[0],kAZ,"grandchild is exact repeated A66d child law");

  // Branch B has a physical continuation at the same remaining argument,
  // but ZERO selected facts: local termination, not sequence exhaustion.
  const ambientBValue=memory.ensure(a2,b.U);
  const ambientBFact=memory.ensure(memory.ensure(gB,a2),ambientBValue);
  const beforeB=frameState(memory,kB);
  same(beforeB.position,p1,"terminating branch remains at second position");
  const bPosition=stepPosition(memory,beforeB.position);
  same(bPosition.argument,a2,"terminating branch still has current argument a2");
  same(bPosition.doneAfter,false,"terminating branch still has later argument a3");

  const level2B=readCarrier(
    memory,
    branchOnePosition(memory,kB,freezeCarrier(memory,[])),
  );
  same(level2B.length,0,"ZERO selected continuation terminates branch locally");
  same(frameState(memory,kB).f,gB,"terminated branch keeps current F");
  same(frameState(memory,kB).position,p1,"terminated branch keeps current P");
  same(memory.poles(ambientBFact).start,memory.ensure(gB,a2),
    "ambient physical continuation exists but remains unselected");

  // Successful recursive step advances exactly one position and preserves Sequence identity.
  const afterA=frameState(memory,kAZ);
  same(afterA.f,z,"recursive result becomes grandchild F");
  same(afterA.position,p2,"recursive step advances exactly one ExactSequence position");
  same(memory.poles(afterA.position).start,sequence,"recursive step retains selected Sequence identity");

  const remaining=stepPosition(memory,afterA.position);
  same(remaining.argument,a3,"continued branch now points at final argument");
  same(remaining.doneAfter,true,"continued branch has exactly one final argument remaining");
  assert(remaining.nextPosition===undefined,"no exhausted-position carrier is materialized");

  // We intentionally stop before consuming a3. Final application/return belongs to A66g.
  assert(kAZ!==kB,"continued grandchild remains distinct from locally terminated sibling");
}

function staticGuards():void{
  const root=resolve(process.cwd(),"..");
  const own=readFileSync(
    join(root,"ts/test/research-v013-exact-sequence-position-recursion-a66f.test.ts"),"utf8",
  );
  const a66e=readFileSync(
    join(root,"ts/test/research-v013-exact-sequence-position-branching-a66e.test.ts"),"utf8",
  );
  const slice=(s:string,a:string,b:string):string=>{
    const i=s.indexOf(a),j=s.indexOf(b,i+1);
    assert(i>=0&&j>i,`slice ${a}`);
    return s.slice(i,j).replace(/\s+/g,"");
  };

  same(
    slice(own,"function advanceOnePosition(","\nfunction freezeCarrier("),
    slice(a66e,"function advanceOnePosition(","\nfunction freezeCarrier("),
    "A66f atomic step is source-identical A66e/A66d",
  );
  same(
    slice(own,"function branchOnePosition(","\nfunction setSame("),
    slice(a66e,"function branchOnePosition(","\nfunction setSame("),
    "A66f one-layer branching law is source-identical A66e",
  );

  const exercise=slice(own,"function exercise(","\nfunction staticGuards(");
  for(const forbidden of [
    "schedule",
    "convergence",
    "publication",
    "admission",
    "MetaState",
    "occurrence",
    "forwardCursor(",
  ])assert(!exercise.includes(forbidden),`A66f scoped exercise excludes ${forbidden}`);
}

function main():void{
  exercise(false);
  exercise(true);
  staticGuards();
  console.log([
    "MTS v0.13 A66f: EXACT_SEQUENCE_POSITION_RECURSION=GREEN_SCOPED_RESEARCH",
    "LEVEL1=A66E_SOURCE_IDENTICAL_BRANCHING",
    "LEVEL2=A66E_SOURCE_IDENTICAL_REAPPLIED_TO_CHILD",
    "CONTINUING_CHILD=ONE_GRANDCHILD",
    "TERMINATING_CHILD=ZERO_GRANDCHILDREN",
    "LOCAL_TERMINATION_WITH_REMAINING_POSITION=CONFIRMED",
    "AMBIENT_UNSELECTED_CONTINUATION=INERT",
    "POSITION_ADVANCE_PER_SUCCESSFUL_STEP=ONE_CELL",
    "SELECTED_SEQUENCE_IDENTITY=PRESERVED",
    "FINAL_POSITION=PRESENT_WITHOUT_SYNTHETIC_EXHAUSTED_POSITION",
    "FINAL_ARGUMENT_CONSUMPTION=NOT_TESTED",
    "FINAL_RETURN_TO_CALL_ROOT=NOT_TESTED",
    "CONVERGENCE=NOT_TESTED SCHEDULER=NOT_TESTED",
    "FORWARD_Q_CHAIN=0",
    "NEXT=A66G_FINAL_ARGUMENT_RETURN_CONVERGENCE_SCHEDULER",
    "V013_NOT_ACCEPTED PRODUCTION_UNCHANGED",
  ].join(" "));
}
main();
