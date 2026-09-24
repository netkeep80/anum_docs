import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { materializeExactSequence } from "../src/exact-sequence.js";
import { Memory, ensureRootBasis, type LinkHandle } from "../src/memory.js";
import { defineContext, readContext } from "../src/state.js";

function assert(c:unknown,m:string):asserts c{
  if(!c)throw new Error(`v0.13 A70a discovered entry call root: ${m}`);
}
function same<T>(a:T,e:T,m:string):void{
  assert(Object.is(a,e),`${m}: values differ`);
}
function setSame(actual:readonly LinkHandle[],expected:readonly LinkHandle[],m:string):void{
  same(new Set(actual).size,new Set(expected).size,`${m}: cardinality`);
  for(const x of expected)assert(actual.includes(x),`${m}: missing expected Link`);
}

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
function frameState(memory:Memory,k:LinkHandle):{readonly f:LinkHandle;readonly position:LinkHandle}{
  const context=readContext(memory,k);
  const state=memory.poles(context.current);
  return Object.freeze({f:state.start,position:state.end});
}
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

function discoverEntryContexts(
  memory: Memory,
  contextRoot: LinkHandle,
): readonly LinkHandle[] {
  const discovered: LinkHandle[] = [];
  const seen = new Set<LinkHandle>();

  for (const payload of memory.outgoing(contextRoot)) {
    const p = memory.poles(payload);
    if (p.start !== contextRoot) continue;

    for (const candidate of memory.incoming(payload)) {
      if (seen.has(candidate)) continue;
      const c = memory.poles(candidate);
      if (c.start !== candidate || c.end !== payload) continue;

      const state = readContext(memory, candidate);
      same(state.parent, contextRoot, "discovered entry parent");
      same(state.current, p.end, "discovered entry state");

      seen.add(candidate);
      discovered.push(candidate);
    }
  }

  return Object.freeze(discovered);
}

function exercise(noise:boolean):void{
  const memory=new Memory();
  const b=ensureRootBasis(memory);
  const C=b.C;
  if(noise)memory.ensure(memory.ensure(b.U,b.C),memory.ensure(b.O,b.L));

  const fresh:LinkHandle[]=[];
  let seed=memory.ensure(b.U,b.L);
  for(let i=0;i<12;i+=1){
    seed=memory.ensure(seed,i%2===0?b.O:b.C);
    fresh.push(seed);
  }
  const at=(i:number):LinkHandle=>{
    const value=fresh[i];
    assert(value!==undefined,`fresh anchor ${i}`);
    return value;
  };
  const f0=memory.ensure(at(0),at(1));
  const a1=memory.ensure(at(2),at(3));
  const a2=memory.ensure(at(4),at(5));
  const g=memory.ensure(at(6),at(7));
  const y=memory.ensure(at(8),at(9));
  const ambientY=memory.ensure(at(10),at(11));
  assert(y!==ambientY,"selected and ambient final values are distinct");

  const sequence=materializeExactSequence(memory,[a1,a2]);
  const p0=initialPosition(memory,sequence);
  const first=stepPosition(memory,p0);
  assert(!first.doneAfter&&first.nextPosition!==undefined,"P0 has final P1");
  const p1=first.nextPosition;
  same(stepPosition(memory,p1).doneAfter,true,"P1 is final");

  // No adapter: the A66 call-root frame is constructed directly under C and
  // is therefore exactly the A68d-discoverable execution entry.
  const k0=defineFrame(memory,C,f0,p0);
  const k0State=readContext(memory,k0);
  same(k0State.parent,C,"discovered call root is directly C-rooted");
  same(k0State.current,memory.ensure(f0,p0),"entry current is exact A66 F->P state");
  setSame(discoverEntryContexts(memory,C),[k0],"A66 call root is discovered as K0");

  // First A66 step is unchanged. It grows an ordinary child Context under K0.
  const firstFact=memory.ensure(memory.ensure(f0,a1),g);
  const k1=advanceOnePosition(memory,k0,firstFact);
  same(readContext(memory,k1).parent,k0,"A66 child parent is discovered K0");
  same(frameState(memory,k1).f,g,"child current F");
  same(frameState(memory,k1).position,p1,"child advanced ExactSequence position");

  // Entry classification is structural: the child is not another top-level
  // entry because its parent is K0 rather than C.
  const afterChild=discoverEntryContexts(memory,C);
  setSame(afterChild,[k0],"child Context does not become top-level entry");
  assert(!afterChild.includes(k1),"K1 excluded from C-rooted entry set");

  // Final A66 return targets the exact discovered K0, with no root translation.
  const finalFact=memory.ensure(memory.ensure(g,a2),y);
  const ambientFact=memory.ensure(memory.ensure(g,a2),ambientY);
  assert(memory.find(k0,y)===undefined,"final result absent before selected return");
  const result=returnFinalPosition(memory,k0,k1,finalFact);
  const rp=memory.poles(result);
  same(rp.start,k0,"final result returns to exact discovered K0 identity");
  same(rp.end,y,"final result value");
  same(memory.find(k0,y),result,"final result stored under discovered entry");
  assert(memory.find(k0,ambientY)===undefined,"ambient final fact remains inert");
  same(memory.poles(ambientFact).end,ambientY,"ambient final fact physically exists");

  // Entry state is immutable history; execution descendants/results accumulate
  // around the same root rather than mutating the K0 carrier.
  same(readContext(memory,k0).parent,C,"K0 parent remains C");
  same(frameState(memory,k0).f,f0,"K0 keeps initial function");
  same(frameState(memory,k0).position,p0,"K0 keeps initial argument position");
  setSame(discoverEntryContexts(memory,C),[k0],
    "completed call root remains physically discoverable");

  // This persistence is deliberately classified as lifecycle residual:
  // discovery and call execution compose, but completion does not consume K0.
}

function sourceSlice(source:string,start:string,end:string):string{
  const i=source.indexOf(start),j=source.indexOf(end,i+1);
  assert(i>=0&&j>i,`source slice ${start}`);
  return source.slice(i,j).replace(/\s+/g,"");
}
function staticGuards():void{
  const root=resolve(process.cwd(),"..");
  const own=readFileSync(
    join(root,"ts/test/research-v013-discovered-entry-call-root-a70a.test.ts"),"utf8",
  );
  const a66=readFileSync(
    join(root,"ts/test/research-v013-final-return-scheduler-a66g.test.ts"),"utf8",
  );
  const a68d=readFileSync(
    join(root,"ts/test/research-v013-entry-discovery-a68d.test.ts"),"utf8",
  );

  same(
    sourceSlice(own,"function advanceOnePosition(","\nfunction frameState("),
    sourceSlice(a66,"function advanceOnePosition(","\nfunction freezeCarrier("),
    "A70a non-final step is source-identical A66g core",
  );
  same(
    sourceSlice(own,"function returnFinalPosition(","\nfunction discoverEntryContexts("),
    sourceSlice(a66,"function returnFinalPosition(","\nfunction selectedWork("),
    "A70a final return is source-identical A66g",
  );
  same(
    sourceSlice(own,"function discoverEntryContexts(","\nfunction exercise("),
    sourceSlice(a68d,"function discoverEntryContexts(","\nfunction statesOf("),
    "A70a entry discovery is source-identical A68d",
  );

  const exercise=sourceSlice(own,"function exercise(","\nfunction sourceSlice(");
  assert(exercise.includes("const k0=defineFrame(memory,C,f0,p0)"),
    "call root is directly C-rooted A66 frame");
  assert(exercise.includes("setSame(discoverEntryContexts(memory,C),[k0]"),
    "the exact A66 frame identity is the discovered entry");
}

function main():void{
  exercise(false);
  exercise(true);
  staticGuards();
  console.log([
    "MTS v0.13 A70a: DISCOVERED_ENTRY_IS_A66_CALL_ROOT=GREEN_SCOPED_RESEARCH",
    "CONTEXT_ROOT=C_END_R",
    "K0=START_C_TO_F0_TO_P0",
    "K0_DISCOVERY=A68D_SOURCE_IDENTICAL",
    "NONFINAL_EXECUTION=A66G_SOURCE_IDENTICAL",
    "FINAL_RETURN=A66G_SOURCE_IDENTICAL",
    "ENTRY_TO_CALL_ROOT_ADAPTER=0 ROOT_TRANSLATION=0",
    "K1_PARENT=K0",
    "K1_TOP_LEVEL_ENTRY=NO",
    "FINAL_RESULT=K0_TO_Y",
    "K0_INITIAL_STATE=IMMUTABLE",
    "AMBIENT_FINAL_FACT=INERT",
    "COMPLETED_K0_REMAINS_DISCOVERABLE=YES",
    "ENTRY_CONSUMPTION_REARMING=LIFECYCLE_RESIDUAL",
    "NEXT=A70B_RECONCILE_ACTIVE_REWRITE_WITH_CONTEXT_GROWTH",
    "FULL_SELF_HOSTED=FALSE",
    "V013_NOT_ACCEPTED PRODUCTION_UNCHANGED",
  ].join(" "));
}
main();
