import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import {
  materializeExactSequence,
  readExactSequence,
} from "../src/exact-sequence.js";
import { Memory, ensureRootBasis, type LinkHandle } from "../src/memory.js";
import { defineContext, readContext, StateError } from "../src/state.js";

function assert(c:unknown,m:string):asserts c{
  if(!c)throw new Error(`v0.13 A70d final return/end closure: ${m}`);
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

/** Source-identical A68a rewrite core. */
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
 * A70a top-level call root is the unique Context ancestor directly under C.
 * This is a scoped top-level-call law only; nested-call delimitation is not
 * inferred here.
 */
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

interface FinalProducts{
  readonly callRoot:LinkHandle;
  readonly publication:LinkHandle;
  readonly closure:LinkHandle;
}

/**
 * Factor the final position into two independent products:
 *
 *   publication = callRoot -> Y
 *   closure     = END(leaf)
 *
 * Publication is the old A66 observable result.
 * Closure is derived through the same A68 rewrite using leaf self-witness.
 */
function finalProducts(
  memory:Memory,
  contextRoot:LinkHandle,
  leaf:LinkHandle,
  selectedResultFact:LinkHandle,
):FinalProducts{
  const state=frameState(memory,leaf);
  const positionStep=stepPosition(memory,state.position);
  assert(positionStep.doneAfter,"final products require final position");
  assert(positionStep.nextPosition===undefined,"final position has no successor");

  const fact=memory.poles(selectedResultFact);
  const application=memory.poles(fact.start);
  same(application.start,state.f,"final products current F");
  same(application.end,positionStep.argument,"final products selected argument");

  const callRoot=entryRootOf(memory,contextRoot,leaf);
  const publication=memory.ensure(callRoot,fact.end);

  const leafPayload=memory.poles(leaf).end;
  same(memory.ensure(leaf,leafPayload),leaf,"leaf self-witnesses Context payload");
  const closure=memory.ensureEndSelfClosed(leaf);
  const toClosure=memory.ensure(leafPayload,closure);
  const reduced=rewriteSelectedOne(memory,leaf,carrier(memory,[toClosure]));
  setSame(reduced,[closure],"leaf closure comes from generic rewrite");

  return Object.freeze({callRoot,publication,closure});
}

function exercise(noise:boolean):void{
  const memory=new Memory();
  const b=ensureRootBasis(memory);
  const C=b.C;
  if(noise)memory.ensure(memory.ensure(b.U,b.C),memory.ensure(b.O,b.L));

  const fresh:LinkHandle[]=[];
  let seed=memory.ensure(b.U,b.L);
  for(let i=0;i<22;i+=1){
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
  const a3=memory.ensure(at(6),at(7));
  const g=memory.ensure(at(8),at(9));
  const h=memory.ensure(at(10),at(11));
  const y=memory.ensure(at(12),at(13));
  const ambientY=memory.ensure(at(14),at(15));

  const sequence=materializeExactSequence(memory,[a1,a2,a3]);
  const p0=initialPosition(memory,sequence);
  const p1=stepPosition(memory,p0).nextPosition!;
  const p2=stepPosition(memory,p1).nextPosition!;
  same(stepPosition(memory,p2).doneAfter,true,"P2 final");

  const k0=defineFrame(memory,C,f0,p0);
  const fact1=memory.ensure(memory.ensure(f0,a1),g);
  const k1=advanceOnePosition(memory,k0,fact1);
  const fact2=memory.ensure(memory.ensure(g,a2),h);
  const k2=advanceOnePosition(memory,k1,fact2);
  same(entryRootOf(memory,C,k2),k0,"leaf recovers exact C-rooted call root");

  const finalFact=memory.ensure(memory.ensure(h,a3),y);
  const ambientFact=memory.ensure(memory.ensure(h,a3),ambientY);
  same(memory.poles(ambientFact).end,ambientY,"ambient final fact exists");

  // Old A66 publication and factorized publication are exact same Link.
  const direct=returnFinalPosition(memory,k0,k2,finalFact);
  const products=finalProducts(memory,C,k2,finalFact);
  same(products.callRoot,k0,"derived call root exact k0");
  same(products.publication,direct,"factorized publication exact A66 identity");
  same(memory.poles(products.publication).start,k0,"publication starts at k0");
  same(memory.poles(products.publication).end,y,"publication value Y");

  // Closure is a distinct structural product. It neither replaces publication
  // nor creates an exhausted child Context.
  const endLeaf=memory.ensureEndSelfClosed(k2);
  same(products.closure,endLeaf,"closure exact END(k2)");
  assert(products.closure!==products.publication,
    "return publication and branch closure are distinct Links");
  same(memory.poles(endLeaf).start,k2,"END leaf retains leaf as START pole");
  same(memory.poles(endLeaf).end,endLeaf,"END leaf self-closes END pole");

  // No synthetic exhausted position or child is needed after final result.
  const beforeSynthetic=memory.linkCount;
  same(stepPosition(memory,p2).nextPosition,undefined,"no exhausted position");
  same(memory.linkCount,beforeSynthetic,"final-position read creates no synthetic state");

  // Ambient final fact is not published merely because it exists.
  assert(memory.find(k0,ambientY)===undefined,"ambient Y not published to call root");

  // Closing one leaf does not imply closure of the call root or context space.
  assert(products.closure!==memory.ensureEndSelfClosed(k0),
    "leaf closure distinct from call-root closure");
  assert(products.closure!==C,"leaf closure distinct from context-space root C");

  // A sibling leaf can remain live while this branch is closed.
  const hSibling=memory.ensure(at(16),at(17));
  const fact2Sibling=memory.ensure(memory.ensure(g,a2),hSibling);
  const sibling=advanceOnePosition(memory,k1,fact2Sibling);
  assert(sibling!==k2,"sibling final-position Context distinct");
  same(readContext(memory,sibling).parent,k1,"sibling shares parent");
  same(frameState(memory,sibling).position,p2,"sibling remains at final position");
  assert(memory.ensureEndSelfClosed(sibling)!==products.closure,
    "branch-local END residues remain distinct");

  // Wrong current function fails before publication/closure.
  const badF=memory.ensure(at(18),at(19));
  const badY=memory.ensure(at(20),at(21));
  const badFact=memory.ensure(memory.ensure(badF,a3),badY);
  assert(memory.find(k0,badY)===undefined,"bad publication absent before failure");
  const beforeBad=memory.linkCount;
  expectThrows(
    ()=>finalProducts(memory,C,k2,badFact),
    "wrong-F final evidence rejected",
  );
  same(memory.linkCount,beforeBad,"bad final evidence performs no writes");

  // Top-level scope boundary: a foreign non-C-rooted leaf cannot derive k0.
  const foreignRoot=defineFrame(memory,memory.root,f0,p0);
  const foreign1=advanceOnePosition(memory,foreignRoot,fact1);
  const foreign2=advanceOnePosition(memory,foreign1,fact2);
  expectThrows(
    ()=>entryRootOf(memory,C,foreign2),
    "foreign execution tree has no C-rooted entry root",
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
    join(root,"ts/test/research-v013-final-return-end-closure-a70d.test.ts"),"utf8",
  );
  const a66=readFileSync(
    join(root,"ts/test/research-v013-final-return-scheduler-a66g.test.ts"),"utf8",
  );
  const a68=readFileSync(
    join(root,"ts/test/research-v013-uniform-active-rewrite-a68a.test.ts"),"utf8",
  );

  same(
    sourceSlice(own,"function returnFinalPosition(","\n/** Source-identical A68a"),
    sourceSlice(a66,"function returnFinalPosition(","\nfunction selectedWork("),
    "A70d direct publication reference source-identical A66g",
  );
  same(
    sourceSlice(own,"function rewriteSelectedOne(","\nfunction carrier("),
    sourceSlice(a68,"function rewriteSelectedOne(","\nfunction carrier("),
    "A70d closure rewrite source-identical A68a",
  );

  const rootFinder=sourceSlice(own,"function entryRootOf(","\ninterface FinalProducts");
  for(const forbidden of [".find(",".outgoing(",".incoming(","allLinks(","contextRoot->"]){
    assert(!rootFinder.includes(forbidden),`entry-root derivation excludes ${forbidden}`);
  }
  assert(rootFinder.includes("state.parent===contextRoot"),
    "top-level call root is derived by C-parent boundary");

  const final=sourceSlice(own,"function finalProducts(","\nfunction exercise(");
  assert(final.includes("rewriteSelectedOne(memory,leaf,"),
    "leaf closure uses generic A68 rewrite");
  assert(!final.includes("defineContext("),"final products create no child Context");
  assert(!final.includes("defineFrame("),"final products create no frame");
}

function main():void{
  exercise(false);
  exercise(true);
  staticGuards();
  console.log([
    "MTS v0.13 A70d: FINAL_RETURN_AND_END_CLOSURE=GREEN_SCOPED_RESEARCH",
    "DIRECT_RETURN_REFERENCE=A66G_SOURCE_IDENTICAL",
    "CLOSURE_REWRITE=A68A_SOURCE_IDENTICAL",
    "TOP_LEVEL_CALL_ROOT=UNIQUE_CONTEXT_ANCESTOR_WITH_PARENT_C",
    "SEPARATE_CALL_ROOT_HOST_ARGUMENT=REMOVED_IN_FACTORIZED_PATH",
    "FINAL_PUBLICATION=CALL_ROOT_TO_Y",
    "FINAL_PUBLICATION=EXACT_A66_IDENTITY",
    "BRANCH_CLOSURE=END_LEAF",
    "PUBLICATION_AND_CLOSURE=DISTINCT_COMPATIBLE_PRODUCTS",
    "CLOSURE=GENERIC_REWRITE_FROM_LEAF_SELF_WITNESS",
    "SYNTHETIC_EXHAUSTED_POSITION=0",
    "FINAL_CHILD_CONTEXT=0",
    "AMBIENT_FINAL_FACT=INERT",
    "LEAF_CLOSURE=BRANCH_LOCAL_NOT_CALL_ROOT_OR_CONTEXT_SPACE_CLOSURE",
    "SIBLING_FINAL_BRANCH_MAY_REMAIN_LIVE",
    "FOREIGN_NON_C_ROOTED_EXECUTION=REJECTED",
    "NESTED_CALL_ROOT_DELIMITATION=NOT_CLAIMED",
    "NEXT=A70E_FINAL_PRODUCT_AUTHORITY_AND_NESTED_CALL_BOUNDARY",
    "FULL_SELF_HOSTED=FALSE",
    "V013_NOT_ACCEPTED PRODUCTION_UNCHANGED",
  ].join(" "));
}
main();
