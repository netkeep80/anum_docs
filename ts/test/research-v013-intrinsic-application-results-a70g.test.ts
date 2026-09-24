import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import {
  materializeExactSequence,
  readExactSequence,
} from "../src/exact-sequence.js";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
} from "../src/memory.js";
import {
  defineContext,
  readContext,
} from "../src/state.js";

function assert(c:unknown,m:string):asserts c{
  if(!c)throw new Error(`v0.13 A70g intrinsic application results: ${m}`);
}
function same<T>(a:T,e:T,m:string):void{
  assert(Object.is(a,e),`${m}: values differ`);
}
function setSame(actual:readonly LinkHandle[],expected:readonly LinkHandle[],m:string):void{
  same(new Set(actual).size,new Set(expected).size,`${m}: cardinality`);
  for(const x of expected)assert(actual.includes(x),`${m}: missing expected Link`);
}
function expectThrows(fn:()=>void,m:string):void{
  let threw=false;try{fn();}catch{threw=true;}assert(threw,m);
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

interface IntrinsicApplication {
  readonly f:LinkHandle;
  readonly argument:LinkHandle;
  readonly application?:LinkHandle;
  readonly resultFacts:readonly LinkHandle[];
}

/**
 * Read the current application and all of its ordinary PAIR result relations.
 *
 *   state       = F -> P
 *   argument    = arg(P)
 *   application = F -> argument
 *   resultFact  = application -> Y
 *
 * There is no host-selected result list. For this scoped hypothesis every
 * ordinary outgoing PAIR from the exact current application is a function
 * value relation by topology.
 *
 * START/END self-incidence around the application is structural syntax/control
 * and is not classified as an ordinary result fact.
 */
function intrinsicApplicationResults(
  memory:Memory,
  context:LinkHandle,
):IntrinsicApplication{
  const k=readContext(memory,context);
  const state=memory.poles(k.current);
  const f=state.start;
  const positionStep=stepPosition(memory,state.end);
  const argument=positionStep.argument;

  let application:LinkHandle|undefined;
  for(const candidate of memory.outgoing(f)){
    const p=memory.poles(candidate);
    if(p.start!==f || p.end!==argument)continue;
    assert(p.start!==candidate && p.end!==candidate,
      "current application must be an ordinary PAIR");
    assert(application===undefined || application===candidate,
      "canonical current application must be unique");
    application=candidate;
  }

  if(application===undefined){
    return Object.freeze({
      f,argument,application:undefined,resultFacts:Object.freeze([]),
    });
  }

  const resultFacts:LinkHandle[]=[];
  const seen=new Set<LinkHandle>();
  for(const candidate of memory.outgoing(application)){
    if(seen.has(candidate))continue;
    const p=memory.poles(candidate);
    if(p.start!==application)continue;
    if(p.start===candidate || p.end===candidate)continue;
    seen.add(candidate);
    resultFacts.push(candidate);
  }

  return Object.freeze({
    f,
    argument,
    application,
    resultFacts:Object.freeze(resultFacts),
  });
}

interface IntrinsicNonFinalStep{
  readonly resultFacts:readonly LinkHandle[];
  readonly children:readonly LinkHandle[];
  readonly closure?:LinkHandle;
}

/**
 * Execute one non-final active Context without a selected-result carrier.
 *
 * ZERO ordinary application results closes the leaf with END(K), which is the
 * append-only realization of local disappearance established by A70e.
 *
 * ONE/MANY results are translated to the same A70c continuations, then passed
 * through the source-identical A68 rewrite and START-lifted to child Contexts.
 */
function executeIntrinsicNonFinal(
  memory:Memory,
  context:LinkHandle,
):IntrinsicNonFinalStep{
  const k=readContext(memory,context);
  const state=memory.poles(k.current);
  const positionStep=stepPosition(memory,state.end);
  assert(!positionStep.doneAfter,"A70g is scoped to non-final position");
  assert(positionStep.nextPosition!==undefined,"A70g non-final next position");

  const intrinsic=intrinsicApplicationResults(memory,context);

  if(intrinsic.resultFacts.length===0){
    return Object.freeze({
      resultFacts:intrinsic.resultFacts,
      children:Object.freeze([]),
      closure:memory.ensureEndSelfClosed(context),
    });
  }

  const continuations=intrinsic.resultFacts.map(
    (fact)=>deriveFrameContinuation(memory,context,fact),
  );
  const outputs=rewriteSelectedOne(memory,context,carrier(memory,continuations));
  const children=outputs.map((output)=>memory.ensureStartSelfClosed(output));

  return Object.freeze({
    resultFacts:intrinsic.resultFacts,
    children:Object.freeze(children),
  });
}

function exercise(noise:boolean):void{
  const memory=new Memory();
  const b=ensureRootBasis(memory);
  const C=b.C;

  if(noise){
    memory.ensure(memory.ensure(b.U,b.C),memory.ensure(b.O,b.L));
  }

  const fresh:LinkHandle[]=[];
  let seed=memory.ensure(b.U,b.L);
  for(let i=0;i<30;i+=1){
    seed=memory.ensure(seed,i%2===0?b.O:b.C);
    fresh.push(seed);
  }
  const at=(i:number):LinkHandle=>{
    const value=fresh[i];
    assert(value!==undefined,`fresh anchor ${i}`);
    return value;
  };

  const a1=memory.ensure(at(0),at(1));
  const a2=memory.ensure(at(2),at(3));
  const sequence=materializeExactSequence(memory,[a1,a2]);
  const p0=initialPosition(memory,sequence);
  const p1=stepPosition(memory,p0).nextPosition!;
  same(stepPosition(memory,p1).doneAfter,true,"P1 final");

  // ZERO: application may exist and even have START/END structural wrappers,
  // but with no ordinary application->Y PAIR there is no function value.
  const fZero=memory.ensure(at(4),at(5));
  const kZero=defineFrame(memory,C,fZero,p0);
  const appZero=memory.ensure(fZero,a1);
  memory.ensureStartSelfClosed(appZero);
  memory.ensureEndSelfClosed(appZero);

  let before=memory.linkCount;
  const zeroRead=intrinsicApplicationResults(memory,kZero);
  same(zeroRead.application,appZero,"ZERO exact application found");
  setSame(zeroRead.resultFacts,[],"START/END wrappers are not application results");
  same(memory.linkCount,before,"intrinsic result discovery read-only");

  const zero=executeIntrinsicNonFinal(memory,kZero);
  setSame(zero.children,[],"ZERO has no child Context");
  assert(zero.closure!==undefined,"ZERO closes active leaf");
  same(zero.closure,memory.ensureEndSelfClosed(kZero),"ZERO exact END(K)");

  // ONE: intrinsic discovery of one ordinary result reproduces the exact A66
  // child via A70c factorization; no selected result carrier is supplied.
  const fOne=memory.ensure(at(6),at(7));
  const yOne=memory.ensure(at(8),at(9));
  const kOne=defineFrame(memory,C,fOne,p0);
  const appOne=memory.ensure(fOne,a1);
  const factOne=memory.ensure(appOne,yOne);

  const oneRead=intrinsicApplicationResults(memory,kOne);
  setSame(oneRead.resultFacts,[factOne],"ONE intrinsic result set");
  const directOne=advanceOnePosition(memory,kOne,factOne);
  const one=executeIntrinsicNonFinal(memory,kOne);
  same(one.closure,undefined,"ONE does not END predecessor");
  setSame(one.children,[directOne],"ONE intrinsic child exact A66 identity");

  // MANY: every ordinary outgoing result relation of this exact application is
  // semantically a value branch. There is intentionally no notion of a hidden
  // "ambient but same-application" ordinary result in this hypothesis.
  const fMany=memory.ensure(at(10),at(11));
  const y1=memory.ensure(at(12),at(13));
  const y2=memory.ensure(at(14),at(15));
  const y3=memory.ensure(at(16),at(17));
  const kMany=defineFrame(memory,C,fMany,p0);
  const appMany=memory.ensure(fMany,a1);
  const fact1=memory.ensure(appMany,y1);
  const fact2=memory.ensure(appMany,y2);
  const fact3=memory.ensure(appMany,y3);

  // Structural wrappers of the application itself remain non-result aspects.
  memory.ensureStartSelfClosed(appMany);
  memory.ensureEndSelfClosed(appMany);

  // A relation from another application is unrelated and remains inert.
  const foreignF=memory.ensure(at(18),at(19));
  const foreignY=memory.ensure(at(20),at(21));
  const foreignApp=memory.ensure(foreignF,a1);
  const foreignFact=memory.ensure(foreignApp,foreignY);
  same(memory.poles(foreignFact).start,foreignApp,"foreign result exists");

  before=memory.linkCount;
  const manyRead=intrinsicApplicationResults(memory,kMany);
  setSame(manyRead.resultFacts,[fact1,fact2,fact3],
    "MANY includes every ordinary same-application result and excludes wrappers/foreign");
  same(memory.linkCount,before,"MANY intrinsic discovery read-only");

  const expectedMany=[
    advanceOnePosition(memory,kMany,fact1),
    advanceOnePosition(memory,kMany,fact2),
    advanceOnePosition(memory,kMany,fact3),
  ];
  const many=executeIntrinsicNonFinal(memory,kMany);
  same(many.closure,undefined,"MANY does not END predecessor");
  setSame(many.children,expectedMany,"MANY exact A66 child set");

  // Selected-order authority has disappeared: result insertion order may affect
  // enumeration order but never the extensional child set.
  const manyAgain=executeIntrinsicNonFinal(memory,kMany);
  setSame(manyAgain.children,expectedMany,"replay preserves canonical child set");

  // Missing application itself is also intrinsic ZERO.
  const fAbsent=memory.ensure(at(22),at(23));
  const kAbsent=defineFrame(memory,C,fAbsent,p0);
  same(intrinsicApplicationResults(memory,kAbsent).application,undefined,
    "absent application discovered as ZERO");
  const absent=executeIntrinsicNonFinal(memory,kAbsent);
  assert(absent.closure!==undefined,"absent application closes leaf");

  // Final-position execution is explicitly outside A70g.
  const fFinal=memory.ensure(at(24),at(25));
  const kFinal=defineFrame(memory,C,fFinal,p1);
  const appFinal=memory.ensure(fFinal,a2);
  memory.ensure(appFinal,memory.ensure(at(26),at(27)));
  expectThrows(
    ()=>executeIntrinsicNonFinal(memory,kFinal),
    "A70g non-final executor rejects final position",
  );
}

function sourceSlice(source:string,start:string,end:string):string{
  const i=source.indexOf(start),j=source.indexOf(end,i+1);
  assert(i>=0&&j>i,`source slice ${start}`);
  return source.slice(i,j).replace(/\s+/g,"");
}

function staticGuards():void{
  const root=resolve(process.cwd(),"..");
  const own=readFileSync(
    join(root,"ts/test/research-v013-intrinsic-application-results-a70g.test.ts"),"utf8",
  );
  const a70c=readFileSync(
    join(root,"ts/test/research-v013-a66-factor-through-rewrite-a70c.test.ts"),"utf8",
  );
  const a68=readFileSync(
    join(root,"ts/test/research-v013-uniform-active-rewrite-a68a.test.ts"),"utf8",
  );

  same(
    sourceSlice(own,"function advanceOnePosition(","\n/**\n * Source-identical A68a"),
    sourceSlice(a70c,"function advanceOnePosition(","\n/**\n * Source-identical A68a"),
    "A70g direct child reference source-identical A70c",
  );
  same(
    sourceSlice(own,"function rewriteSelectedOne(","\nfunction carrier("),
    sourceSlice(a68,"function rewriteSelectedOne(","\nfunction carrier("),
    "A70g rewrite core source-identical A68a",
  );
  same(
    sourceSlice(own,"function deriveFrameContinuation(","\ninterface IntrinsicApplication"),
    sourceSlice(a70c,"function deriveFrameContinuation(","\n/**\n * A66 non-final execution factored"),
    "A70g continuation derivation source-identical A70c",
  );

  const discovery=sourceSlice(
    own,
    "function intrinsicApplicationResults(",
    "\ninterface IntrinsicNonFinalStep",
  );
  for(const forbidden of [
    ".ensure(",
    ".find(",
    "allLinks(",
    "selectedResult",
    "resultCarrier",
    "authorityTruth",
  ]){
    assert(!discovery.includes(forbidden),
      `A70g intrinsic result discovery excludes external authority ${forbidden}`);
  }
  assert(discovery.includes("memory.outgoing(f)"),
    "current application discovered from exact F adjacency");
  assert(discovery.includes("memory.outgoing(application)"),
    "result authority is exact application adjacency");
  assert(discovery.includes("p.start===candidate || p.end===candidate"),
    "START/END self-incidence excluded from ordinary result facts");

  const executor=sourceSlice(
    own,
    "function executeIntrinsicNonFinal(",
    "\nfunction exercise(",
  );
  assert(!executor.includes("selectedResultFact"),
    "intrinsic executor has no selected-result input");
  assert(!executor.includes("selectedResultCarrier"),
    "intrinsic executor has no selected-result carrier");
  assert(executor.includes("memory.ensureEndSelfClosed(context)"),
    "ZERO realizes local disappearance through END closure");
  assert(executor.includes("rewriteSelectedOne(memory,context,"),
    "ONE/MANY still use generic A68 rewrite");
}

function main():void{
  exercise(false);
  exercise(true);
  staticGuards();

  console.log([
    "MTS v0.13 A70g: INTRINSIC_APPLICATION_RESULT_AUTHORITY=GREEN_SCOPED_RESEARCH",
    "APPLICATION=F_TO_CURRENT_ARGUMENT",
    "RESULT_FACT=ORDINARY_APPLICATION_TO_Y_PAIR",
    "RESULT_AUTHORITY=ALL_ORDINARY_OUTGOING_PAIRS_OF_EXACT_APPLICATION",
    "HOST_SELECTED_RESULT_LIST=0",
    "HOST_SELECTED_RESULT_CARRIER=0",
    "START_END_APPLICATION_WRAPPERS=NOT_RESULTS",
    "FOREIGN_APPLICATION_RESULTS=INERT",
    "SAME_APPLICATION_ORDINARY_RELATION=VALUE_BY_TOPOLOGY",
    "ZERO=END_ACTIVE_LEAF",
    "ONE=EXACT_A70C_A66_CHILD",
    "MANY=EXACT_A70C_A66_CHILD_SET",
    "REWRITE_CORE=A68A_SOURCE_IDENTICAL",
    "CONTINUATION_DERIVATION=A70C_SOURCE_IDENTICAL",
    "DISCOVERY=READ_ONLY_SCOPED_ADJACENCY",
    "GLOBAL_ALL_LINK_SCAN=0",
    "FINAL_POSITION=OUT_OF_SCOPE",
    "SEMANTIC_DELTA=EARLIER_SELECTED_RESULT_AUTHORITY_REMOVED_FOR_APPLICATION_VALUES",
    "NEXT=A70H_COMPOSE_DERIVED_WORKSET_WITH_INTRINSIC_APPLICATION_EXECUTION",
    "FULL_SELF_HOSTED=FALSE",
    "V013_NOT_ACCEPTED PRODUCTION_UNCHANGED",
  ].join(" "));
}

main();
