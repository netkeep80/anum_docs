import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { materializeExactSequence } from "../src/exact-sequence.js";
import { Memory, ensureRootBasis, type LinkHandle } from "../src/memory.js";
import { defineContext, readContext } from "../src/state.js";

function assert(c:unknown,m:string):asserts c{if(!c)throw new Error(`v0.13 A66g final return: ${m}`);}
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

/**
 * Final application differs from non-final advance:
 *
 *   K.current = F -> P_final
 *   (F -> arg(P_final)) -> Y
 *
 * P_final has doneAfter=true and no successor. The selected Y is returned
 * directly to the root context of this call; no extra temporary child frame
 * and no synthetic exhausted position are created.
 */
function returnFinalPosition(
  memory:Memory,
  callRoot:LinkHandle,
  context:LinkHandle,
  selectedResultFact:LinkHandle,
):LinkHandle{
  const state=frameState(memory,context);
  const positionStep=stepPosition(memory,state.position);
  assert(positionStep.doneAfter,"final return requires final ExactSequence position");
  assert(positionStep.nextPosition===undefined,"final position has no successor");

  const fact=memory.poles(selectedResultFact);
  const application=memory.poles(fact.start);
  same(application.start,state.f,"final result uses current F");
  same(application.end,positionStep.argument,"final result uses selected final argument");

  return memory.ensure(callRoot,fact.end);
}

function selectedWork(memory:Memory,context:LinkHandle,resultFact:LinkHandle):LinkHandle{
  return memory.ensure(context,resultFact);
}
function runAdvanceSchedule(
  memory:Memory,
  work:readonly LinkHandle[],
  order:"forward"|"reverse",
):readonly LinkHandle[]{
  const selected=[...work];
  if(order==="reverse")selected.reverse();
  return Object.freeze(selected.map(item=>{
    const p=memory.poles(item);
    return advanceOnePosition(memory,p.start,p.end);
  }));
}
function runFinalSchedule(
  memory:Memory,
  callRoot:LinkHandle,
  work:readonly LinkHandle[],
  order:"forward"|"reverse",
):readonly LinkHandle[]{
  const selected=[...work];
  if(order==="reverse")selected.reverse();
  return Object.freeze(selected.map(item=>{
    const p=memory.poles(item);
    return returnFinalPosition(memory,callRoot,p.start,p.end);
  }));
}

function exercise(noise:boolean,firstOrder:"forward"|"reverse"):void{
  const memory=new Memory();
  const b=ensureRootBasis(memory);
  if(noise)memory.ensure(memory.ensure(b.U,b.C),b.O);

  const f0=memory.ensure(b.L,b.U);
  const a1=memory.ensure(b.O,b.C);
  const a2=memory.ensure(b.C,b.O);
  const a3=memory.ensure(a1,a2);
  const gA=memory.ensure(a1,b.L);
  const gB=memory.ensure(a1,b.U);
  const hA=memory.ensure(a2,b.L);
  const hB=memory.ensure(a2,b.U);
  const y=memory.ensure(hA,hB);
  const ambientY=memory.ensure(hB,hA);

  const sequence=materializeExactSequence(memory,[a1,a2,a3]);
  const p0=initialPosition(memory,sequence);
  const s0=stepPosition(memory,p0);
  assert(!s0.doneAfter&&s0.nextPosition!==undefined,"P0 has P1");
  const p1=s0.nextPosition;
  const s1=stepPosition(memory,p1);
  assert(!s1.doneAfter&&s1.nextPosition!==undefined,"P1 has P2");
  const p2=s1.nextPosition;
  const s2=stepPosition(memory,p2);
  same(s2.argument,a3,"P2 selects final argument");
  same(s2.doneAfter,true,"P2 is final");
  assert(s2.nextPosition===undefined,"P2 has no synthetic exhausted successor");

  const k0=defineFrame(memory,memory.root,f0,p0);

  // First non-final split: exact A66e law.
  const app0=memory.ensure(f0,a1);
  const factA=memory.ensure(app0,gA);
  const factB=memory.ensure(app0,gB);
  const level1=readCarrier(
    memory,
    branchOnePosition(memory,k0,freezeCarrier(memory,[factA,factB])),
  );
  const kA=defineFrame(memory,k0,gA,p1);
  const kB=defineFrame(memory,k0,gB,p1);
  setSame(level1,[kA,kB],"level1 exact sibling set");

  // Both branches advance from P1 to the pre-final P2. Parent scheduling is E4 only.
  const factAH=memory.ensure(memory.ensure(gA,a2),hA);
  const factBH=memory.ensure(memory.ensure(gB,a2),hB);
  const workA=selectedWork(memory,kA,factAH);
  const workB=selectedWork(memory,kB,factBH);
  const work=[workA,workB] as const;

  const level2First=runAdvanceSchedule(memory,work,firstOrder);
  const level2Other=runAdvanceSchedule(
    memory,work,firstOrder==="forward"?"reverse":"forward",
  );
  const kHA=defineFrame(memory,kA,hA,p2);
  const kHB=defineFrame(memory,kB,hB,p2);
  setSame(level2First,[kHA,kHB],"first parent schedule exact pre-final contexts");
  setSame(level2Other,[kHA,kHB],"reverse parent schedule exact pre-final contexts");
  setSame(level2First,level2Other,"parent schedule preserves exact context set");

  assert(kHA!==kHB,"pre-final branch contexts remain distinct");
  same(readContext(memory,kHA).parent,kA,"A ancestry retained");
  same(readContext(memory,kHB).parent,kB,"B ancestry retained");
  assert(readContext(memory,kHA).parent!==readContext(memory,kHB).parent,
    "converging final branches retain distinct parents before return");
  same(frameState(memory,kHA).position,p2,"A at final position");
  same(frameState(memory,kHB).position,p2,"B at final position");

  // Both distinct final applications select the same extensional Y.
  const factAY=memory.ensure(memory.ensure(hA,a3),y);
  const factBY=memory.ensure(memory.ensure(hB,a3),y);
  const ambientFact=memory.ensure(memory.ensure(hA,a3),ambientY);
  const finalA=selectedWork(memory,kHA,factAY);
  const finalB=selectedWork(memory,kHB,factBY);
  const finalWork=[finalA,finalB] as const;

  // Final return cannot be applied early and rejects a result from the other branch.
  expectThrows(
    ()=>returnFinalPosition(memory,k0,kA,factAH),
    "non-final position cannot return to call root",
  );
  expectThrows(
    ()=>returnFinalPosition(memory,k0,kHA,factBY),
    "foreign final result fact rejected",
  );

  assert(memory.find(k0,y)===undefined,"root result absent before selected final return");
  assert(memory.find(k0,ambientY)===undefined,"ambient value absent from root result scope");
  assert(memory.find(kHA,y)===undefined&&memory.find(kHB,y)===undefined,
    "final value absent as child-context result before return");

  const beforeFinal=memory.linkCount;
  const finalFirst=runFinalSchedule(memory,k0,finalWork,firstOrder);
  same(new Set(finalFirst).size,1,"two final branches converge to one root-result identity");
  const rootResult=finalFirst[0]!;
  same(memory.linkCount,beforeFinal+1,
    "final convergence materializes exactly one call-root result Link and no child frame");

  const finalOther=runFinalSchedule(
    memory,k0,finalWork,firstOrder==="forward"?"reverse":"forward",
  );
  same(new Set(finalOther).size,1,"reverse final schedule also converges");
  setSame(finalFirst,finalOther,"final scheduler order preserves exact root-result set");
  same(memory.linkCount,beforeFinal+1,"reverse final schedule adds no Links");

  const rp=memory.poles(rootResult);
  same(rp.start,k0,"final result START is selected call-root context");
  same(rp.end,y,"final result END is converged value");
  same(memory.find(k0,y),rootResult,"root result recovered by exact call-root/value pair");

  // Intermediate and final branch state remains branch-local history.
  same(frameState(memory,k0).f,f0,"call root keeps original F");
  same(frameState(memory,k0).position,p0,"call root keeps initial position");
  same(frameState(memory,kHA).f,hA,"A pre-final temporary F retained");
  same(frameState(memory,kHB).f,hB,"B pre-final temporary F retained");
  assert(memory.find(kHA,y)===undefined&&memory.find(kHB,y)===undefined,
    "final return does not create child-context result Links");

  // Ambient physical result evidence is inert because it was not selected.
  same(memory.poles(ambientFact).end,ambientY,"ambient final fact physically exists");
  assert(memory.find(k0,ambientY)===undefined,"ambient final value never reaches call root");
}

function staticGuards():void{
  const root=resolve(process.cwd(),"..");
  const own=readFileSync(
    join(root,"ts/test/research-v013-final-return-scheduler-a66g.test.ts"),"utf8",
  );
  const a66f=readFileSync(
    join(root,"ts/test/research-v013-exact-sequence-position-recursion-a66f.test.ts"),"utf8",
  );
  const slice=(s:string,a:string,b:string):string=>{
    const i=s.indexOf(a),j=s.indexOf(b,i+1);
    assert(i>=0&&j>i,`slice ${a}`);
    return s.slice(i,j).replace(/\s+/g,"");
  };

  same(
    slice(own,"function advanceOnePosition(","\nfunction freezeCarrier("),
    slice(a66f,"function advanceOnePosition(","\nfunction freezeCarrier("),
    "A66g non-final atomic step is source-identical A66f/A66e/A66d",
  );
  same(
    slice(own,"function branchOnePosition(","\nfunction setSame("),
    slice(a66f,"function branchOnePosition(","\nfunction setSame("),
    "A66g one-layer branching law is source-identical A66f/A66e",
  );

  const finalReturn=slice(
    own,"function returnFinalPosition(","\nfunction selectedWork(",
  );
  assert(!finalReturn.includes("defineFrame("),
    "final return does not create another execution frame");
  assert(!finalReturn.includes("defineContext("),
    "final return does not create another context");
  assert(finalReturn.includes("positionStep.doneAfter"),
    "final return requires the final ExactSequence position");
  assert(finalReturn.includes("memory.ensure(callRoot,fact.end)"),
    "final return targets the selected call-root context directly");
  for(const forbidden of [
    "forwardCursor(",
    "MetaState",
    ".incoming(",
    ".outgoing(",
    ".allLinks(",
  ])assert(!finalReturn.includes(forbidden),`A66g final return excludes ${forbidden}`);
}

function main():void{
  exercise(false,"forward");
  exercise(true,"reverse");
  staticGuards();
  console.log([
    "MTS v0.13 A66g: FINAL_POSITION_CALL_ROOT_RETURN=GREEN_SCOPED_RESEARCH",
    "NONFINAL_STEP=A66F_A66E_A66D_SOURCE_IDENTICAL",
    "FRAME_STATE=F_TO_P",
    "FINAL_POSITION=DONE_AFTER_TRUE_NO_NEXT_POSITION",
    "FINAL_APPLICATION=(F_TO_FINAL_ARG)_TO_Y",
    "FINAL_CHILD_FRAME=0",
    "SYNTHETIC_EXHAUSTED_POSITION=0",
    "FINAL_RETURN=CALL_ROOT_TO_Y",
    "PRE_FINAL_CONTEXT_COUNT=2",
    "PRE_FINAL_ANCESTRY=DISTINCT",
    "EXTENSIONAL_FINAL_VALUE_COUNT=1",
    "CALL_ROOT_RESULT_COUNT=1",
    "INTERMEDIATE_VALUES=CHILD_CONTEXT_LOCAL_HISTORY",
    "PARENT_SCHEDULE=FORWARD_REVERSE_EXACT_CONTEXT_SET_EQUIVALENT",
    "FINAL_SCHEDULE=FORWARD_REVERSE_EXACT_ROOT_RESULT_EQUIVALENT",
    "AMBIENT_FINAL_FACT=INERT",
    "NONFINAL_EARLY_RETURN=REJECTED",
    "FOREIGN_FINAL_FACT=REJECTED",
    "FORWARD_Q_CHAIN=0",
    "ROOT_RESULT_TEMPORAL_PROVENANCE_FROM_LINK_IDENTITY=NOT_CLAIMED",
    "NEXT=REASSESS_A20_A21_A33_OCCURRENCE_ROLE_AND_RECONNECT_RULE_LIFECYCLE",
    "V013_NOT_ACCEPTED GLOBAL_E2=OPEN GLOBAL_E3=OPEN GLOBAL_E4=OPEN FULL_SELF_HOSTED=FALSE",
    "PRODUCTION_UNCHANGED",
  ].join(" "));
}
main();
