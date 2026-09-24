import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import {
  materializeExactSequence,
  readExactSequence,
} from "../src/exact-sequence.js";
import { Memory, ensureRootBasis, type LinkHandle } from "../src/memory.js";
import { defineContext, readContext } from "../src/state.js";

function assert(c:unknown,m:string):asserts c{
  if(!c)throw new Error(`v0.13 A70c A66 factor through rewrite: ${m}`);
}
function same<T>(a:T,e:T,m:string):void{
  assert(Object.is(a,e),`${m}: values differ`);
}
function setSame(actual:readonly LinkHandle[],expected:readonly LinkHandle[],m:string):void{
  same(new Set(actual).size,new Set(expected).size,`${m}: cardinality`);
  for(const x of expected)assert(actual.includes(x),`${m}: missing expected Link`);
}
function expectThrows(fn:()=>void,m:string):void{
  let threw=false;
  try{fn();}catch{threw=true;}
  assert(threw,m);
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

/**
 * Source-identical A68a rewrite core.
 */
function rewriteSelectedOne(
  memory: Memory,
  activeTruth: LinkHandle,
  selectedContinuationCarrier: LinkHandle,
): readonly LinkHandle[] {
  const active = memory.poles(activeTruth);
  const context = active.start;
  const antecedent = active.end;

  const selected = readExactSequence(memory, selectedContinuationCarrier).values;
  const targets = selected.map((continuation) => {
    const c = memory.poles(continuation);
    same(c.start, antecedent, "selected continuation starts at active antecedent");
    return c.end;
  });

  return Object.freeze(
    targets.map((target) => memory.ensure(context, target)),
  );
}

function carrier(memory:Memory,values:readonly LinkHandle[]):LinkHandle{
  return materializeExactSequence(memory,values);
}

/**
 * The only A66-specific residual in the factorized path.
 *
 * Read selected A66 evidence and derive one generic continuation:
 *
 *   ContextPayload(K) -> NextState
 *
 * where:
 *
 *   NextState = Y -> next(P)
 *
 * No child Context is created here.
 */
function deriveFrameContinuation(
  memory:Memory,
  context:LinkHandle,
  selectedResultFact:LinkHandle,
):LinkHandle{
  const k=readContext(memory,context);
  const state=memory.poles(k.current);
  const f=state.start;
  const position=state.end;

  const positionStep=stepPosition(memory,position);
  assert(!positionStep.doneAfter,"factorized step requires non-final position");
  assert(positionStep.nextPosition!==undefined,"factorized next position exists");

  const fact=memory.poles(selectedResultFact);
  const application=memory.poles(fact.start);
  same(application.start,f,"factorized result uses current F");
  same(application.end,positionStep.argument,
    "factorized result uses current ExactSequence argument");

  const nextState=memory.ensure(fact.end,positionStep.nextPosition);
  const contextPayload=memory.poles(context).end;
  return memory.ensure(contextPayload,nextState);
}

/**
 * A66 non-final execution factored through the generic A68 rewrite:
 *
 *   K = K -> ContextPayload
 *   ContextPayload -> NextState
 *   ---------------------------
 *   K -> NextState
 *   START(K -> NextState) = child Context
 */
function advanceViaRewrite(
  memory:Memory,
  context:LinkHandle,
  selectedResultFact:LinkHandle,
):LinkHandle{
  const continuation=deriveFrameContinuation(memory,context,selectedResultFact);
  const outputs=rewriteSelectedOne(memory,context,carrier(memory,[continuation]));
  same(outputs.length,1,"factorized ONE output");
  return memory.ensureStartSelfClosed(outputs[0]!);
}

function exercise(noise:boolean):void{
  const memory=new Memory();
  const b=ensureRootBasis(memory);
  const C=b.C;
  if(noise)memory.ensure(memory.ensure(b.U,b.C),memory.ensure(b.O,b.L));

  const fresh:LinkHandle[]=[];
  let seed=memory.ensure(b.U,b.L);
  for(let i=0;i<18;i+=1){
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
  const y1=memory.ensure(at(6),at(7));
  const y2=memory.ensure(at(8),at(9));
  const ambientY=memory.ensure(at(10),at(11));

  const sequence=materializeExactSequence(memory,[a1,a2]);
  const p0=initialPosition(memory,sequence);
  const first=stepPosition(memory,p0);
  assert(!first.doneAfter&&first.nextPosition!==undefined,"P0 has P1");
  const p1=first.nextPosition;

  const K=defineFrame(memory,C,f0,p0);
  const payload=memory.poles(K).end;
  same(memory.ensure(K,payload),K,"K self-witnesses exact Context payload");

  const app=memory.ensure(f0,a1);
  const fact1=memory.ensure(app,y1);
  const fact2=memory.ensure(app,y2);
  const ambientFact=memory.ensure(app,ambientY);

  // ONE: direct A66 and A68+START factorization converge to the exact same Link.
  const direct1=advanceOnePosition(memory,K,fact1);
  const continuation1=deriveFrameContinuation(memory,K,fact1);
  const cp1=memory.poles(continuation1);
  same(cp1.start,payload,"derived continuation starts at Context payload");
  const expectedState1=memory.ensure(y1,p1);
  same(cp1.end,expectedState1,"derived continuation ends at exact A66 next state");

  const factored1=advanceViaRewrite(memory,K,fact1);
  same(factored1,direct1,"factorized ONE equals direct A66 child identity");
  same(readContext(memory,factored1).parent,K,"factorized child parent");
  same(readContext(memory,factored1).current,expectedState1,
    "factorized child current state");

  // MANY: compile selected result facts to generic continuations, invoke one
  // A68 MANY rewrite, then START-lift each payload. Exact child set equals
  // direct A66 execution of each selected fact.
  const directMany=[advanceOnePosition(memory,K,fact1),advanceOnePosition(memory,K,fact2)];
  const continuations=[
    deriveFrameContinuation(memory,K,fact1),
    deriveFrameContinuation(memory,K,fact2),
  ];
  const payloads=rewriteSelectedOne(memory,K,carrier(memory,continuations));
  const factorMany=payloads.map(q=>memory.ensureStartSelfClosed(q));
  setSame(factorMany,directMany,"factorized MANY equals direct A66 child set");

  const reversePayloads=rewriteSelectedOne(
    memory,K,carrier(memory,[continuations[1]!,continuations[0]!]),
  );
  setSame(reversePayloads,payloads,"factorized selected order preserves payload set");
  setSame(
    reversePayloads.map(q=>memory.ensureStartSelfClosed(q)),
    directMany,
    "factorized selected order preserves child set",
  );

  // ZERO is the same generic A68 cardinality: no selected results means no
  // derived continuations, no rewrite payloads and no child Contexts.
  const zero=rewriteSelectedOne(memory,K,carrier(memory,[]));
  same(zero.length,0,"factorized ZERO produces no child payload");

  // Ambient physical result evidence remains inert until selected.
  same(memory.poles(ambientFact).end,ambientY,"ambient result fact exists");
  assert(memory.find(K,memory.ensure(ambientY,p1))===undefined,
    "ambient next-state payload absent without selected continuation");

  // Wrong selected A66 evidence fails in the residual derivation before the
  // generic rewrite is reached.
  const foreignF=memory.ensure(at(12),at(13));
  const badY=memory.ensure(at(14),at(15));
  const badFact=memory.ensure(memory.ensure(foreignF,a1),badY);
  const beforeBad=memory.linkCount;
  expectThrows(
    ()=>deriveFrameContinuation(memory,K,badFact),
    "wrong-F selected result rejected before rewrite",
  );
  same(memory.linkCount,beforeBad,"wrong-F derivation performs no writes");

  // Final-position behavior is deliberately out of scope. The next frame K1
  // is now on P1, so attempting the non-final factorization there must fail.
  expectThrows(
    ()=>deriveFrameContinuation(memory,direct1,
      memory.ensure(memory.ensure(y1,a2),memory.ensure(at(16),at(17)))),
    "factorized non-final step rejects final position",
  );

  // K and the ExactSequence remain immutable throughout.
  same(readContext(memory,K).parent,C,"K parent remains C");
  same(readContext(memory,K).current,memory.ensure(f0,p0),"K current unchanged");
}

function sourceSlice(source:string,start:string,end:string):string{
  const i=source.indexOf(start),j=source.indexOf(end,i+1);
  assert(i>=0&&j>i,`source slice ${start}`);
  return source.slice(i,j).replace(/\s+/g,"");
}
function staticGuards():void{
  const root=resolve(process.cwd(),"..");
  const own=readFileSync(
    join(root,"ts/test/research-v013-a66-factor-through-rewrite-a70c.test.ts"),"utf8",
  );
  const a66=readFileSync(
    join(root,"ts/test/research-v013-final-return-scheduler-a66g.test.ts"),"utf8",
  );
  const a68=readFileSync(
    join(root,"ts/test/research-v013-uniform-active-rewrite-a68a.test.ts"),"utf8",
  );

  same(
    sourceSlice(own,"function advanceOnePosition(","\n/**\n * Source-identical A68a"),
    sourceSlice(a66,"function advanceOnePosition(","\nfunction freezeCarrier("),
    "A70c direct comparison step is source-identical A66g",
  );
  same(
    sourceSlice(own,"function rewriteSelectedOne(","\nfunction carrier("),
    sourceSlice(a68,"function rewriteSelectedOne(","\nfunction carrier("),
    "A70c rewrite kernel is source-identical A68a",
  );

  const factor=sourceSlice(own,"function advanceViaRewrite(","\nfunction exercise(");
  assert(!factor.includes("defineContext("),
    "factorized path does not directly construct Context");
  assert(!factor.includes("defineFrame("),
    "factorized path does not call A66 frame constructor");
  assert(factor.includes("rewriteSelectedOne(memory,context,"),
    "factorized path passes Context itself to A68 rewrite");
  assert(factor.includes("memory.ensureStartSelfClosed(outputs[0]!)"),
    "factorized ordinary result activates by START lift");
}

function main():void{
  exercise(false);
  exercise(true);
  staticGuards();
  console.log([
    "MTS v0.13 A70c: A66_NONFINAL_FACTORED_THROUGH_A68=GREEN_SCOPED_RESEARCH",
    "DIRECT_REFERENCE=A66G_SOURCE_IDENTICAL",
    "REWRITE_CORE=A68A_SOURCE_IDENTICAL",
    "K_SELF_WITNESS=YES",
    "RESIDUAL_DERIVATION=SELECTED_RESULT_PLUS_POSITION_TO_CONTEXT_PAYLOAD_TO_NEXT_STATE",
    "NEXT_STATE=Y_TO_NEXT_POSITION",
    "ONE_FACTORIZED_CHILD=EXACT_A66_IDENTITY",
    "MANY_FACTORIZED_CHILD_SET=EXACT_A66_SET",
    "ZERO=NO_CHILD",
    "SELECTED_ORDER=EXTENSIONALLY_INERT",
    "AMBIENT_RESULT_FACT=INERT",
    "WRONG_RESULT=REJECTED_BEFORE_REWRITE",
    "FACTORIZED_PATH_DIRECT_DEFINE_CONTEXT=0",
    "FACTORIZED_PATH_DIRECT_DEFINE_FRAME=0",
    "FINAL_POSITION=OUT_OF_SCOPE",
    "NEXT=A70D_FINAL_RETURN_AND_END_LIFECYCLE",
    "FULL_SELF_HOSTED=FALSE",
    "V013_NOT_ACCEPTED PRODUCTION_UNCHANGED",
  ].join(" "));
}
main();
