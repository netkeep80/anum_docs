import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import {
  materializeExactSequence,
  readExactSequence,
} from "../src/exact-sequence.js";
import { Memory, ensureRootBasis, type LinkHandle } from "../src/memory.js";
import { defineContext, readContext, StateError } from "../src/state.js";

function assert(c:unknown,m:string):asserts c{
  if(!c)throw new Error(`v0.13 A70i intrinsic final results: ${m}`);
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
function frameState(memory:Memory,k:LinkHandle):{readonly f:LinkHandle;readonly position:LinkHandle}{
  const context=readContext(memory,k);
  const state=memory.poles(context.current);
  return Object.freeze({f:state.start,position:state.end});
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

interface IntrinsicApplication {
  readonly f:LinkHandle;
  readonly argument:LinkHandle;
  readonly application:LinkHandle|undefined;
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

function entryRootOf(
  memory:Memory,
  contextRoot:LinkHandle,
  leaf:LinkHandle,
):LinkHandle{
  let current=leaf;
  const seen=new Set<LinkHandle>();
  while(true){
    assert(!seen.has(current),"entry-root ancestry cycle");
    seen.add(current);
    let state;
    try{
      state=readContext(memory,current);
    }catch(error){
      if(error instanceof StateError)throw new Error("leaf is outside Context ancestry");
      throw error;
    }
    if(state.parent===contextRoot)return current;
    current=state.parent;
  }
}

interface IntrinsicFinalProducts{
  readonly callRoot:LinkHandle;
  readonly resultFacts:readonly LinkHandle[];
  readonly publications:readonly LinkHandle[];
  readonly closure:LinkHandle;
}

function executeIntrinsicFinal(
  memory:Memory,
  contextRoot:LinkHandle,
  leaf:LinkHandle,
):IntrinsicFinalProducts{
  const state=frameState(memory,leaf);
  const positionStep=stepPosition(memory,state.position);
  assert(positionStep.doneAfter,"intrinsic final requires final position");
  assert(positionStep.nextPosition===undefined,"final position has no successor");

  const intrinsic=intrinsicApplicationResults(memory,leaf);
  const callRoot=entryRootOf(memory,contextRoot,leaf);
  const publications=intrinsic.resultFacts.map((fact)=>{
    const p=memory.poles(fact);
    return memory.ensure(callRoot,p.end);
  });

  const leafPayload=memory.poles(leaf).end;
  same(memory.ensure(leaf,leafPayload),leaf,"leaf self-witnesses Context payload");
  const closure=memory.ensureEndSelfClosed(leaf);
  const toClosure=memory.ensure(leafPayload,closure);
  const reduced=rewriteSelectedOne(memory,leaf,carrier(memory,[toClosure]));
  setSame(reduced,[closure],"final closure comes from generic rewrite");

  return Object.freeze({
    callRoot,
    resultFacts:intrinsic.resultFacts,
    publications:Object.freeze(publications),
    closure,
  });
}

function makeFinalChain(
  memory:Memory,
  C:LinkHandle,
  f0:LinkHandle,
  f1:LinkHandle,
  f2:LinkHandle,
  p0:LinkHandle,
  p1:LinkHandle,
  p2:LinkHandle,
):readonly [LinkHandle,LinkHandle,LinkHandle]{
  const k0=defineFrame(memory,C,f0,p0);
  const k1=defineFrame(memory,k0,f1,p1);
  const k2=defineFrame(memory,k1,f2,p2);
  return Object.freeze([k0,k1,k2]);
}

function exercise(noise:boolean):void{
  const memory=new Memory();
  const b=ensureRootBasis(memory);
  const C=b.C;
  if(noise)memory.ensure(memory.ensure(b.U,b.C),memory.ensure(b.O,b.L));

  const fresh:LinkHandle[]=[];
  let seed=memory.ensure(b.U,b.L);
  for(let i=0;i<44;i+=1){
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
  const a3=memory.ensure(at(4),at(5));
  const sequence=materializeExactSequence(memory,[a1,a2,a3]);
  const p0=initialPosition(memory,sequence);
  const p1=stepPosition(memory,p0).nextPosition!;
  const p2=stepPosition(memory,p1).nextPosition!;
  same(stepPosition(memory,p2).doneAfter,true,"P2 final");

  const fZero0=memory.ensure(at(6),at(7));
  const fZero1=memory.ensure(at(8),at(9));
  const fZero2=memory.ensure(at(10),at(11));
  const [z0,,z2]=makeFinalChain(memory,C,fZero0,fZero1,fZero2,p0,p1,p2);
  same(entryRootOf(memory,C,z2),z0,"ZERO root recovery");
  const appZero=memory.ensure(fZero2,a3);
  memory.ensureStartSelfClosed(appZero);
  memory.ensureEndSelfClosed(appZero);
  const zeroRead=intrinsicApplicationResults(memory,z2);
  setSame(zeroRead.resultFacts,[],"final ZERO excludes START/END wrappers");
  const zero=executeIntrinsicFinal(memory,C,z2);
  setSame(zero.publications,[],"final ZERO publishes nothing");
  same(zero.closure,memory.ensureEndSelfClosed(z2),"final ZERO closes leaf");
  assert(memory.find(z0,appZero)===undefined,"ZERO creates no accidental publication");

  const fOne0=memory.ensure(at(12),at(13));
  const fOne1=memory.ensure(at(14),at(15));
  const fOne2=memory.ensure(at(16),at(17));
  const yOne=memory.ensure(at(18),at(19));
  const [o0,,o2]=makeFinalChain(memory,C,fOne0,fOne1,fOne2,p0,p1,p2);
  const appOne=memory.ensure(fOne2,a3);
  const factOne=memory.ensure(appOne,yOne);
  const directOne=returnFinalPosition(memory,o0,o2,factOne);
  const one=executeIntrinsicFinal(memory,C,o2);
  same(one.callRoot,o0,"ONE recovers exact call root");
  setSame(one.resultFacts,[factOne],"ONE intrinsic final result");
  setSame(one.publications,[directOne],"ONE publication exact A70d/A66 identity");
  same(one.closure,memory.ensureEndSelfClosed(o2),"ONE closes exact leaf");
  assert(one.closure!==directOne,"publication and closure remain distinct");

  const fMany0=memory.ensure(at(20),at(21));
  const fMany1=memory.ensure(at(22),at(23));
  const fMany2=memory.ensure(at(24),at(25));
  const y1=memory.ensure(at(26),at(27));
  const y2=memory.ensure(at(28),at(29));
  const y3=memory.ensure(at(30),at(31));
  const [m0,,m2]=makeFinalChain(memory,C,fMany0,fMany1,fMany2,p0,p1,p2);
  const appMany=memory.ensure(fMany2,a3);
  const fact1=memory.ensure(appMany,y1);
  const fact2=memory.ensure(appMany,y2);
  const fact3=memory.ensure(appMany,y3);
  memory.ensureStartSelfClosed(appMany);
  memory.ensureEndSelfClosed(appMany);

  const foreignF=memory.ensure(at(32),at(33));
  const foreignY=memory.ensure(at(34),at(35));
  const foreignFact=memory.ensure(memory.ensure(foreignF,a3),foreignY);
  same(memory.poles(foreignFact).end,foreignY,"foreign final fact exists");

  const directMany=[
    returnFinalPosition(memory,m0,m2,fact1),
    returnFinalPosition(memory,m0,m2,fact2),
    returnFinalPosition(memory,m0,m2,fact3),
  ];
  const many=executeIntrinsicFinal(memory,C,m2);
  setSame(many.resultFacts,[fact1,fact2,fact3],
    "MANY includes all ordinary exact-application results only");
  setSame(many.publications,directMany,
    "MANY publishes every intrinsic value with exact A66 identities");
  same(many.closure,memory.ensureEndSelfClosed(m2),"MANY closes leaf once");
  assert(!many.publications.includes(memory.ensure(m0,foreignY)),
    "foreign application result is not an intrinsic publication");

  const beforeReplay=memory.linkCount;
  const replay=executeIntrinsicFinal(memory,C,m2);
  setSame(replay.publications,many.publications,"final replay publication set stable");
  same(replay.closure,many.closure,"final replay closure stable");
  same(memory.linkCount,beforeReplay,"final replay adds no Links");

  const fBad0=memory.ensure(at(36),at(37));
  const fBad1=memory.ensure(at(38),at(39));
  const fBad2=memory.ensure(at(40),at(41));
  const [b0,b1]=makeFinalChain(memory,C,fBad0,fBad1,fBad2,p0,p1,p2);
  expectThrows(
    ()=>executeIntrinsicFinal(memory,C,b1),
    "intrinsic final rejects non-final position",
  );

  const foreignRoot=defineFrame(memory,memory.root,fBad0,p0);
  const foreignLeaf=defineFrame(memory,foreignRoot,fBad2,p2);
  expectThrows(
    ()=>executeIntrinsicFinal(memory,C,foreignLeaf),
    "foreign non-C-rooted final chain rejected",
  );

  same(readContext(memory,b0).parent,C,"test control root remains C-rooted");
}

function sourceSlice(source:string,start:string,end:string):string{
  const i=source.indexOf(start),j=source.indexOf(end,i+1);
  assert(i>=0&&j>i,`source slice ${start}`);
  return source.slice(i,j).replace(/\s+/g,"");
}

function staticGuards():void{
  const root=resolve(process.cwd(),"..");
  const own=readFileSync(
    join(root,"ts/test/research-v013-intrinsic-final-results-a70i.test.ts"),"utf8",
  );
  const a70d=readFileSync(
    join(root,"ts/test/research-v013-final-return-end-closure-a70d.test.ts"),"utf8",
  );
  const a70g=readFileSync(
    join(root,"ts/test/research-v013-intrinsic-application-results-a70g.test.ts"),"utf8",
  );

  same(
    sourceSlice(own,"function returnFinalPosition(","\nfunction rewriteSelectedOne("),
    sourceSlice(a70d,"function returnFinalPosition(","\n/** Source-identical A68a"),
    "A70i direct final reference source-identical A70d",
  );
  same(
    sourceSlice(own,"function rewriteSelectedOne(","\nfunction carrier("),
    sourceSlice(a70g,"function rewriteSelectedOne(","\nfunction carrier("),
    "A70i rewrite core source-identical A70g/A68a",
  );
  same(
    sourceSlice(own,"function intrinsicApplicationResults(","\nfunction entryRootOf("),
    sourceSlice(a70g,"function intrinsicApplicationResults(","\ninterface IntrinsicNonFinalStep"),
    "A70i intrinsic result discovery source-identical A70g",
  );
  same(
    sourceSlice(own,"function entryRootOf(","\ninterface IntrinsicFinalProducts"),
    sourceSlice(a70d,"function entryRootOf(","\ninterface FinalProducts"),
    "A70i entry-root derivation source-identical A70d",
  );

  const executor=sourceSlice(
    own,
    "function executeIntrinsicFinal(",
    "\nfunction makeFinalChain(",
  );
  assert(!executor.includes("selectedResult"),
    "intrinsic final executor has no selected-result authority");
  assert(executor.includes("intrinsicApplicationResults(memory,leaf)"),
    "final values derive from exact application adjacency");
  assert(executor.includes("memory.ensure(callRoot,p.end)"),
    "every intrinsic final value publishes to entry root");
  assert(executor.includes("rewriteSelectedOne(memory,leaf,"),
    "final closure uses generic A68 rewrite");
  assert(!executor.includes("defineContext("),
    "final executor creates no child Context");
}

function main():void{
  exercise(false);
  exercise(true);
  staticGuards();
  console.log([
    "MTS v0.13 A70i: INTRINSIC_FINAL_APPLICATION_RESULTS=GREEN_SCOPED_RESEARCH",
    "FINAL_RESULT_AUTHORITY=ALL_ORDINARY_OUTGOING_PAIRS_OF_EXACT_APPLICATION",
    "HOST_SELECTED_FINAL_RESULT=0",
    "ZERO=NO_PUBLICATION_PLUS_END_LEAF",
    "ONE=EXACT_A70D_A66_PUBLICATION_PLUS_END_LEAF",
    "MANY=ALL_INTRINSIC_PUBLICATIONS_PLUS_ONE_END_LEAF",
    "START_END_APPLICATION_WRAPPERS=NOT_RESULTS",
    "FOREIGN_APPLICATION_RESULTS=INERT",
    "CALL_ROOT=A70D_CONTEXT_ANCESTRY",
    "REWRITE_CORE=A70G_A68_SOURCE_IDENTICAL",
    "PUBLICATION_AND_CLOSURE=DISTINCT",
    "SYNTHETIC_EXHAUSTED_POSITION=0",
    "FINAL_CHILD_CONTEXT=0",
    "REPLAY=CANONICAL_STABLE",
    "TOP_LEVEL_C_ROOTED_SCOPE_ONLY=YES",
    "NESTED_CALL_BOUNDARY=OPEN",
    "NEXT=A70J_FULL_DERIVED_TOP_LEVEL_CYCLE_TO_EMPTY_WORKSET",
    "FULL_SELF_HOSTED=FALSE",
    "V013_NOT_ACCEPTED PRODUCTION_UNCHANGED",
  ].join(" "));
}
main();
