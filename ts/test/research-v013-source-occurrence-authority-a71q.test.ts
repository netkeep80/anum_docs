import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
} from "../src/memory.js";
import { defineContext, readContext } from "../src/state.js";

function assert(c:unknown,m:string):asserts c{
  if(!c)throw new Error(`v0.13 A71q source occurrence authority: ${m}`);
}
function same<T>(a:T,e:T,m:string):void{
  assert(Object.is(a,e),`${m}: values differ`);
}
function setSame(actual:readonly LinkHandle[],expected:readonly LinkHandle[],m:string):void{
  same(new Set(actual).size,new Set(expected).size,`${m}: cardinality`);
  for(const x of expected)assert(actual.includes(x),`${m}: missing expected Link`);
}

/**
 * Diagnostic only: all immediate source parents visible from raw Memory
 * adjacency. This intentionally ignores template occurrence authority.
 */
function adjacentSourceParents(
  memory:Memory,
  child:LinkHandle,
):readonly LinkHandle[]{
  const candidates=new Set<LinkHandle>();

  for(const link of memory.outgoing(child)){
    if(link===child)continue;
    const p=memory.poles(link);
    if(p.start===child)candidates.add(link);
  }
  for(const link of memory.incoming(child)){
    if(link===child)continue;
    const p=memory.poles(link);
    if(p.end===child)candidates.add(link);
  }

  return Object.freeze([...candidates]);
}

interface OccurrencePath{
  readonly rootOccurrence:LinkHandle;
  readonly parentOccurrence:LinkHandle;
  readonly childOccurrence:LinkHandle;
  readonly mappingContext:LinkHandle;
}

/**
 * Top-down Context-carried source occurrence.
 *
 * The Context chain itself records:
 *
 *   templateRoot -> selectedParent -> selectedChild -> mappingFact
 *
 * so the intended parent is recoverable without any ambient adjacency scan.
 */
function carrySourceOccurrence(
  memory:Memory,
  contextRoot:LinkHandle,
  templateRoot:LinkHandle,
  selectedParent:LinkHandle,
  selectedChild:LinkHandle,
  mappingFact:LinkHandle,
):OccurrencePath{
  const rootOccurrence=defineContext(memory,contextRoot,templateRoot);
  const parentOccurrence=defineContext(memory,rootOccurrence,selectedParent);
  const childOccurrence=defineContext(memory,parentOccurrence,selectedChild);
  const mappingContext=defineContext(memory,childOccurrence,mappingFact);

  return Object.freeze({
    rootOccurrence,
    parentOccurrence,
    childOccurrence,
    mappingContext,
  });
}

interface SelectedParent{
  readonly child:LinkHandle;
  readonly parent:LinkHandle;
  readonly mappingFact:LinkHandle;
}

/**
 * Recover exact selected parent from Context ancestry only.
 *
 * No incoming/outgoing/global scan participates.
 */
function selectedParentFromOccurrence(
  memory:Memory,
  mappingContext:LinkHandle,
):SelectedParent{
  const mappingState=readContext(memory,mappingContext);
  const childOccurrence=mappingState.parent;
  const childState=readContext(memory,childOccurrence);
  const parentOccurrence=childState.parent;
  const parentState=readContext(memory,parentOccurrence);

  const child=childState.current;
  const parent=parentState.current;
  const p=memory.poles(parent);

  assert(
    p.start===child || p.end===child,
    "Context-selected parent is structurally adjacent to selected child",
  );

  return Object.freeze({
    child,
    parent,
    mappingFact:mappingState.current,
  });
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

  // One canonical source child is reused in two different template paths.
  const sharedChild=memory.ensure(at(0),at(1));
  const startParent=memory.ensureStartSelfClosed(sharedChild);
  const endParent=memory.ensureEndSelfClosed(sharedChild);

  const templateRootA=memory.ensureEndSelfClosed(startParent);
  const templateRootB=memory.ensureStartSelfClosed(endParent);

  // Before any mapping/result links are added, raw local neighborhood is
  // already ambiguous.
  const rawParents=adjacentSourceParents(memory,sharedChild);
  setSame(rawParents,[startParent,endParent],
    "same source child has two physical parents across templates");

  // One grounded image/mapping fact is intentionally shared by both template
  // occurrences.
  const image=memory.ensure(at(2),at(3));
  const mappingFact=memory.ensure(sharedChild,image);

  // If execution keeps only map(child,image), adjacency alone cannot decide
  // whether propagation belongs to template A or template B.
  assert(rawParents.length===2,
    "global propagate-to-all-adjacent-parents would cross template boundaries");

  const pathA=carrySourceOccurrence(
    memory,C,templateRootA,startParent,sharedChild,mappingFact,
  );
  const pathB=carrySourceOccurrence(
    memory,C,templateRootB,endParent,sharedChild,mappingFact,
  );

  // Same physical mapping fact, distinct Context occurrences.
  same(readContext(memory,pathA.mappingContext).current,mappingFact,
    "A carries shared mapping fact");
  same(readContext(memory,pathB.mappingContext).current,mappingFact,
    "B carries same shared mapping fact");
  assert(pathA.mappingContext!==pathB.mappingContext,
    "same mapping fact under different occurrence ancestry remains distinct");

  const selectedA=selectedParentFromOccurrence(memory,pathA.mappingContext);
  const selectedB=selectedParentFromOccurrence(memory,pathB.mappingContext);

  same(selectedA.child,sharedChild,"A exact child");
  same(selectedB.child,sharedChild,"B exact child");
  same(selectedA.mappingFact,mappingFact,"A exact mapping fact");
  same(selectedB.mappingFact,mappingFact,"B exact mapping fact");
  same(selectedA.parent,startParent,
    "A Context occurrence selects START parent only");
  same(selectedB.parent,endParent,
    "B Context occurrence selects END parent only");

  // The selected parent aspect can differ even though child and mapping are
  // identical. Therefore parent authority cannot be reconstructed from the
  // mapping fact alone.
  const pa=memory.poles(selectedA.parent);
  const pb=memory.poles(selectedB.parent);
  same(pa.start,selectedA.parent,"A parent is START self-closed");
  same(pa.end,sharedChild,"A START child");
  same(pb.start,sharedChild,"B END child");
  same(pb.end,selectedB.parent,"B parent is END self-closed");

  // Exact replay of each occurrence path is canonical.
  const replayA=carrySourceOccurrence(
    memory,C,templateRootA,startParent,sharedChild,mappingFact,
  );
  const replayB=carrySourceOccurrence(
    memory,C,templateRootB,endParent,sharedChild,mappingFact,
  );
  same(replayA.mappingContext,pathA.mappingContext,"A occurrence replay canonical");
  same(replayB.mappingContext,pathB.mappingContext,"B occurrence replay canonical");

  // A third unrelated parent makes raw global adjacency even noisier, while
  // Context-carried authority remains unchanged.
  const noiseParent=memory.ensure(sharedChild,at(4));
  const noisyParents=adjacentSourceParents(memory,sharedChild);
  assert(noisyParents.includes(noiseParent),"ambient ordinary parent visible");
  same(selectedParentFromOccurrence(memory,pathA.mappingContext).parent,startParent,
    "A occurrence unaffected by ambient parent noise");
  same(selectedParentFromOccurrence(memory,pathB.mappingContext).parent,endParent,
    "B occurrence unaffected by ambient parent noise");
}

function sourceSlice(source:string,start:string,end:string):string{
  const i=source.indexOf(start),j=source.indexOf(end,i+1);
  assert(i>=0&&j>i,`source slice ${start}`);
  return source.slice(i,j).replace(/\s+/g,"");
}

function staticGuards():void{
  const root=resolve(process.cwd(),"..");
  const own=readFileSync(
    join(root,"ts/test/research-v013-source-occurrence-authority-a71q.test.ts"),
    "utf8",
  );
  const a71p=readFileSync(
    join(root,"ts/test/research-v013-aspect-preserving-rule-matcher-a71p.test.ts"),
    "utf8",
  );

  const selected=sourceSlice(
    own,
    "function selectedParentFromOccurrence(",
    "\nfunction exercise(",
  );
  for(const forbidden of [
    ".outgoing(",
    ".incoming(",
    "allLinks(",
    ".find(",
    "switch(",
    "templateRootA",
    "templateRootB",
  ]){
    assert(!selected.includes(forbidden),
      `A71q occurrence parent selection excludes ambient selector ${forbidden}`);
  }
  assert(selected.includes("readContext(memory,mappingContext)"),
    "A71q parent authority starts from current Context");
  assert(selected.includes("readContext(memory,childOccurrence)"),
    "A71q parent authority uses ancestry");
  assert(selected.includes("readContext(memory,parentOccurrence)"),
    "A71q selected source parent is Context-carried");

  assert(a71p.includes("PROJECTION_VS_RULE_MATCHING_SPLIT=GREEN_SCOPED_RESEARCH"),
    "A71q starts after A71p aspect ambiguity is resolved");
}

function main():void{
  exercise(false);
  exercise(true);
  staticGuards();

  console.log([
    "MTS v0.13 A71q: SOURCE_PARENT_OCCURRENCE_AUTHORITY=GREEN_RED_SCOPED_RESEARCH",
    "SHARED_SOURCE_CHILD=TWO_TEMPLATE_PARENTS",
    "RAW_LOCAL_ADJACENCY=AMBIGUOUS",
    "GLOBAL_PROPAGATE_ALL_ADJACENT_PARENTS=REJECTED",
    "SAME_MAPPING_FACT=TWO_DISTINCT_CONTEXT_OCCURRENCES",
    "CONTEXT_ANCESTRY_SELECTS_EXACT_PARENT=GREEN_CONTROL",
    "START_PARENT_AND_END_PARENT=DISAMBIGUATED",
    "AMBIENT_PARENT_NOISE=INERT_TO_OCCURRENCE_AUTHORITY",
    "OCCURRENCE_PARENT_SELECTION_GLOBAL_SCAN=0",
    "EXACT_REPLAY=CANONICAL",
    "BOTTOM_UP_MAPPING_WITHOUT_OCCURRENCE=INSUFFICIENT",
    "CANDIDATE_SOLUTION=CONTEXT_CARRIED_SOURCE_OCCURRENCE",
    "NEXT=A71R_INTEGRATE_OCCURRENCE_PATH_WITH_UNIVERSAL_ASPECT_RULES",
    "FULL_SELF_HOSTED=FALSE",
    "V013_NOT_ACCEPTED PRODUCTION_UNCHANGED",
  ].join(" "));
}

main();
