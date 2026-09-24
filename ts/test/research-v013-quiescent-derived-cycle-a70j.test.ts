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
  StateError,
} from "../src/state.js";

function assert(c:unknown,m:string):asserts c{
  if(!c)throw new Error(`v0.13 A70j quiescent derived cycle: ${m}`);
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
 * Source-identical A70c continuation derivation.
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

interface IntrinsicApplication {
  readonly f:LinkHandle;
  readonly argument:LinkHandle;
  readonly application:LinkHandle|undefined;
  readonly resultFacts:readonly LinkHandle[];
}

/**
 * Source-identical A70g/A70i intrinsic application result discovery.
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

/**
 * Source-identical A68d entry discovery.
 */
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

/**
 * Source-identical A70e child discovery.
 */
function childContexts(
  memory:Memory,
  parent:LinkHandle,
):readonly LinkHandle[]{
  const out:LinkHandle[]=[];
  const seen=new Set<LinkHandle>();

  for(const payload of memory.outgoing(parent)){
    const p=memory.poles(payload);
    if(p.start!==parent || p.end===payload)continue;

    for(const candidate of memory.incoming(payload)){
      if(seen.has(candidate))continue;
      const c=memory.poles(candidate);
      if(c.start!==candidate || c.end!==payload)continue;

      const state=readContext(memory,candidate);
      same(state.parent,parent,"discovered child parent");
      same(state.current,p.end,"discovered child state");

      seen.add(candidate);
      out.push(candidate);
    }
  }

  return Object.freeze(out);
}

/**
 * Source-identical A70e closure discovery.
 */
function closureOf(
  memory:Memory,
  context:LinkHandle,
):LinkHandle|undefined{
  let closure:LinkHandle|undefined;

  for(const candidate of memory.outgoing(context)){
    const p=memory.poles(candidate);
    if(p.start!==context || p.end!==candidate || p.start===candidate)continue;
    assert(closure===undefined || closure===candidate,
      "multiple proper END closures for one Context");
    closure=candidate;
  }

  return closure;
}

/**
 * Source-identical A70e active frontier.
 */
function activeFrontier(
  memory:Memory,
  entry:LinkHandle,
):readonly LinkHandle[]{
  const active:LinkHandle[]=[];
  const visiting=new Set<LinkHandle>();
  const visited=new Set<LinkHandle>();

  const walk=(context:LinkHandle):void=>{
    assert(!visiting.has(context),"Context child cycle");
    if(visited.has(context))return;

    visiting.add(context);
    const children=childContexts(memory,context);
    const closure=closureOf(memory,context);

    if(children.length>0){
      assert(closure===undefined,
        "closed non-leaf Context is invalid lifecycle topology");
      for(const child of children)walk(child);
    }else if(closure===undefined){
      active.push(context);
    }

    visiting.delete(context);
    visited.add(context);
  };

  walk(entry);
  return Object.freeze(active);
}

/**
 * Source-identical A70f workset derivation.
 */
function currentWorkset(
  memory:Memory,
  contextRoot:LinkHandle,
):readonly LinkHandle[]{
  const work:LinkHandle[]=[];
  const seen=new Set<LinkHandle>();

  for(const entry of discoverEntryContexts(memory,contextRoot)){
    for(const leaf of activeFrontier(memory,entry)){
      assert(!seen.has(leaf),"active leaf belongs to more than one entry tree");
      seen.add(leaf);
      work.push(leaf);
    }
  }

  return Object.freeze(work);
}

/**
 * Source-identical A70d/A70i top-level entry-root derivation.
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

interface PlannedLeaf {
  readonly leaf:LinkHandle;
  readonly final:boolean;
  readonly resultFacts:readonly LinkHandle[];
  readonly callRoot?:LinkHandle;
}
interface FrozenRoundPlan {
  readonly workset:readonly LinkHandle[];
  readonly leaves:readonly PlannedLeaf[];
}

/**
 * Derive all scheduler membership, final/non-final position status and exact
 * application result authority before any execution write in the round.
 */
function planFrozenRound(
  memory:Memory,
  contextRoot:LinkHandle,
):FrozenRoundPlan{
  const workset=currentWorkset(memory,contextRoot);
  const leaves:PlannedLeaf[]=[];

  for(const leaf of workset){
    const k=readContext(memory,leaf);
    const state=memory.poles(k.current);
    const position=stepPosition(memory,state.end);
    const intrinsic=intrinsicApplicationResults(memory,leaf);
    leaves.push(Object.freeze({
      leaf,
      final:position.doneAfter,
      resultFacts:Object.freeze([...intrinsic.resultFacts]),
      callRoot:position.doneAfter
        ? entryRootOf(memory,contextRoot,leaf)
        : undefined,
    }));
  }

  return Object.freeze({
    workset:Object.freeze([...workset]),
    leaves:Object.freeze(leaves),
  });
}

interface RoundProducts {
  readonly children:readonly LinkHandle[];
  readonly closures:readonly LinkHandle[];
  readonly publications:readonly LinkHandle[];
}

/**
 * Execute only one already-frozen round. No late workset or application-result
 * discovery is permitted here.
 */
function executeFrozenRound(
  memory:Memory,
  plan:FrozenRoundPlan,
  order:"forward"|"reverse",
):RoundProducts{
  const leaves=[...plan.leaves];
  if(order==="reverse")leaves.reverse();

  const children:LinkHandle[]=[];
  const closures:LinkHandle[]=[];
  const publications:LinkHandle[]=[];

  for(const planned of leaves){
    if(planned.final){
      const callRoot=planned.callRoot;
      assert(callRoot!==undefined,"final planned leaf has call root");

      for(const fact of planned.resultFacts){
        const p=memory.poles(fact);
        publications.push(memory.ensure(callRoot,p.end));
      }

      const leafPayload=memory.poles(planned.leaf).end;
      same(memory.ensure(planned.leaf,leafPayload),planned.leaf,
        "final leaf self-witnesses Context payload");
      const closure=memory.ensureEndSelfClosed(planned.leaf);
      const toClosure=memory.ensure(leafPayload,closure);
      const reduced=rewriteSelectedOne(
        memory,
        planned.leaf,
        carrier(memory,[toClosure]),
      );
      setSame(reduced,[closure],"final closure via generic rewrite");
      closures.push(closure);
      continue;
    }

    if(planned.resultFacts.length===0){
      closures.push(memory.ensureEndSelfClosed(planned.leaf));
      continue;
    }

    const continuations=planned.resultFacts.map(
      (fact)=>deriveFrameContinuation(memory,planned.leaf,fact),
    );
    const outputs=rewriteSelectedOne(
      memory,
      planned.leaf,
      carrier(memory,continuations),
    );
    for(const output of outputs){
      children.push(memory.ensureStartSelfClosed(output));
    }
  }

  return Object.freeze({
    children:Object.freeze(children),
    closures:Object.freeze(closures),
    publications:Object.freeze(publications),
  });
}

interface QuiescentRun {
  readonly rounds:number;
  readonly finalWorkset:readonly LinkHandle[];
  readonly publications:readonly LinkHandle[];
  readonly closures:readonly LinkHandle[];
}

/**
 * Research-only bounded host fixed-point driver.
 *
 * The host still performs repeated rounds; that residual is explicit. What is
 * proven here is that each round's WHAT-runs and WHAT-results authority is
 * derived from the Link network, and this finite fixture reaches quiescence.
 */
function runToQuiescence(
  memory:Memory,
  contextRoot:LinkHandle,
  maxRounds:number,
):QuiescentRun{
  const publications:LinkHandle[]=[];
  const closures:LinkHandle[]=[];

  for(let round=0;round<maxRounds;round+=1){
    const plan=planFrozenRound(memory,contextRoot);
    if(plan.workset.length===0){
      return Object.freeze({
        rounds:round,
        finalWorkset:plan.workset,
        publications:Object.freeze(publications),
        closures:Object.freeze(closures),
      });
    }

    const forward=executeFrozenRound(memory,plan,"forward");
    const afterForward=memory.linkCount;
    const reverse=executeFrozenRound(memory,plan,"reverse");

    setSame(reverse.children,forward.children,
      `round ${round} forward/reverse children`);
    setSame(reverse.closures,forward.closures,
      `round ${round} forward/reverse closures`);
    setSame(reverse.publications,forward.publications,
      `round ${round} forward/reverse publications`);
    same(memory.linkCount,afterForward,
      `round ${round} reverse replay adds no Links`);

    publications.push(...forward.publications);
    closures.push(...forward.closures);
  }

  throw new Error("finite fixture did not reach quiescent workset within bound");
}

function exercise(noise:boolean):void{
  const memory=new Memory();
  const b=ensureRootBasis(memory);
  const C=b.C;
  if(noise){
    memory.ensure(memory.ensure(b.U,b.C),memory.ensure(b.O,b.L));
    memory.ensureEndSelfClosed(memory.ensure(b.L,b.U));
  }

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

  // Two-position finite sequence: round 1 is non-final, round 2 is final.
  const a1=memory.ensure(at(0),at(1));
  const a2=memory.ensure(at(2),at(3));
  const sequence=materializeExactSequence(memory,[a1,a2]);
  const p0=initialPosition(memory,sequence);
  const p1=stepPosition(memory,p0).nextPosition!;
  same(stepPosition(memory,p1).doneAfter,true,"P1 final");

  // Entry A: non-final MANY -> final ONE + final ZERO.
  const fA=memory.ensure(at(4),at(5));
  const gA1=memory.ensure(at(6),at(7));
  const gA2=memory.ensure(at(8),at(9));
  const yA=memory.ensure(at(10),at(11));
  const entryA=defineFrame(memory,C,fA,p0);
  const appA0=memory.ensure(fA,a1);
  memory.ensure(appA0,gA1);
  memory.ensure(appA0,gA2);
  memory.ensure(memory.ensure(gA1,a2),yA);
  memory.ensure(gA2,a2); // final ZERO

  // Entry B: non-final ZERO.
  const fB=memory.ensure(at(12),at(13));
  const entryB=defineFrame(memory,C,fB,p0);
  memory.ensure(fB,a1);

  // Entry C: non-final ONE -> final MANY.
  const fC=memory.ensure(at(14),at(15));
  const gC=memory.ensure(at(16),at(17));
  const yC1=memory.ensure(at(18),at(19));
  const yC2=memory.ensure(at(20),at(21));
  const entryC=defineFrame(memory,C,fC,p0);
  memory.ensure(memory.ensure(fC,a1),gC);
  const appC1=memory.ensure(gC,a2);
  memory.ensure(appC1,yC1);
  memory.ensure(appC1,yC2);

  const initialEntries=discoverEntryContexts(memory,C);
  setSame(initialEntries,[entryA,entryB,entryC],"three initial entries");
  setSame(currentWorkset(memory,C),[entryA,entryB,entryC],
    "initial workset");

  // Planning is read-only once sequence positions/applications are materialized.
  const beforePlan=memory.linkCount;
  const firstPlan=planFrozenRound(memory,C);
  same(memory.linkCount,beforePlan,"initial frozen plan writes no Links");
  same(firstPlan.leaves.filter(x=>x.final).length,0,
    "initial round entirely non-final");

  const run=runToQuiescence(memory,C,8);
  same(run.rounds,2,"finite fixture reaches quiescence in two execution rounds");
  setSame(run.finalWorkset,[],"quiescent fixed point is empty workset");

  // Expected publications are only final ONE/MANY results.
  const pubA=memory.ensure(entryA,yA);
  const pubC1=memory.ensure(entryC,yC1);
  const pubC2=memory.ensure(entryC,yC2);
  setSame(run.publications,[pubA,pubC1,pubC2],
    "final publication set");

  // Physical entries and published results remain after activity stops.
  setSame(discoverEntryContexts(memory,C),[entryA,entryB,entryC],
    "completed entries remain physical");
  setSame(currentWorkset(memory,C),[],
    "completed physical entries contribute zero work");
  same(memory.find(entryA,yA),pubA,"A result persists");
  same(memory.find(entryC,yC1),pubC1,"C result 1 persists");
  same(memory.find(entryC,yC2),pubC2,"C result 2 persists");

  // Re-running the host fixed-point observer over quiescent topology performs
  // no execution writes and returns immediately.
  const beforeReplay=memory.linkCount;
  const replay=runToQuiescence(memory,C,8);
  same(replay.rounds,0,"quiescent replay performs zero execution rounds");
  setSame(replay.publications,[],"quiescent replay publishes nothing new");
  same(memory.linkCount,beforeReplay,"quiescent replay writes no Links");

  // This is a scoped terminating witness only. It does not establish that every
  // possible Link network reaches an empty frontier.
}

function sourceSlice(source:string,start:string,end:string):string{
  const i=source.indexOf(start),j=source.indexOf(end,i+1);
  assert(i>=0&&j>i,`source slice ${start}`);
  return source.slice(i,j).replace(/\s+/g,"");
}

function staticGuards():void{
  const root=resolve(process.cwd(),"..");
  const own=readFileSync(
    join(root,"ts/test/research-v013-quiescent-derived-cycle-a70j.test.ts"),"utf8",
  );
  const a70h=readFileSync(
    join(root,"ts/test/research-v013-derived-execution-cycle-a70h.test.ts"),"utf8",
  );
  const a70i=readFileSync(
    join(root,"ts/test/research-v013-intrinsic-final-results-a70i.test.ts"),"utf8",
  );

  same(
    sourceSlice(own,"function rewriteSelectedOne(","\nfunction carrier("),
    sourceSlice(a70i,"function rewriteSelectedOne(","\nfunction carrier("),
    "A70j rewrite core source-identical A70i/A68",
  );
  same(
    sourceSlice(own,"function intrinsicApplicationResults(","\n/**\n * Source-identical A68d"),
    sourceSlice(a70i,"function intrinsicApplicationResults(","\nfunction entryRootOf("),
    "A70j intrinsic application discovery source-identical A70i",
  );
  same(
    sourceSlice(own,"function currentWorkset(","\n/**\n * Source-identical A70d"),
    sourceSlice(a70h,"function currentWorkset(","\n\n\ninterface PlannedNonFinalLeaf"),
    "A70j workset source-identical A70h/A70f",
  );
  same(
    sourceSlice(own,"function entryRootOf(","\ninterface PlannedLeaf"),
    sourceSlice(a70i,"function entryRootOf(","\ninterface IntrinsicFinalProducts"),
    "A70j entry-root derivation source-identical A70i/A70d",
  );

  const plan=sourceSlice(
    own,
    "function planFrozenRound(",
    "\ninterface RoundProducts",
  );
  for(const forbidden of [
    ".ensure(",
    "selectedResult",
    "selectedWork",
    "queue",
    "registry",
    "activeFlag",
  ]){
    assert(!plan.includes(forbidden),
      `A70j planner excludes external execution authority ${forbidden}`);
  }

  const executor=sourceSlice(
    own,
    "function executeFrozenRound(",
    "\ninterface QuiescentRun",
  );
  assert(!executor.includes("currentWorkset("),
    "A70j executor performs no late scheduler discovery");
  assert(!executor.includes("intrinsicApplicationResults("),
    "A70j executor performs no late result discovery");
  assert(executor.includes("rewriteSelectedOne("),
    "A70j transitions use generic A68 rewrite");

  const driver=sourceSlice(
    own,
    "function runToQuiescence(",
    "\nfunction exercise(",
  );
  assert(driver.includes("for(let round=0;round<maxRounds;round+=1)"),
    "host fixed-point iteration remains explicit residual");
}

function main():void{
  exercise(false);
  exercise(true);
  staticGuards();

  console.log([
    "MTS v0.13 A70j: FINITE_DERIVED_CYCLE_TO_QUIESCENCE=GREEN_SCOPED_RESEARCH",
    "INITIAL_ENTRIES=THREE",
    "ROUND1_NONFINAL=MANY_PLUS_ZERO_PLUS_ONE",
    "ROUND2_FINAL=ONE_PLUS_ZERO_PLUS_MANY",
    "FINAL_WORKSET=EMPTY",
    "QUIESCENT_REPLAY=ZERO_WRITES",
    "PHYSICAL_HISTORY_AND_PUBLICATIONS=PERSIST",
    "WORKSET_AND_RESULT_AUTHORITY=LINK_DERIVED",
    "HOST_QUEUE=0 HOST_REGISTRY=0 HOST_SELECTED_RESULTS=0",
    "FROZEN_ROUND_FORWARD_REVERSE=EXACT_SET_EQUIVALENT",
    "META_INTERPRETER_EXECUTION=APAMEMORY_INTERNAL_DYNAMICS_CANDIDATE",
    "QUIESCENT_FIXED_POINT=PROVEN_FOR_FINITE_FIXTURE",
    "GLOBAL_TERMINATION=NOT_PROVEN",
    "MINIMUM_ENERGY_LAW=NOT_PROVEN",
    "HOST_FIXED_POINT_ITERATION=RESIDUAL",
    "HOST_EXACT_SEQUENCE_TRAVERSAL=RESIDUAL",
    "REPEATED_IDENTICAL_TOP_LEVEL_ACTIVATION=OPEN",
    "NESTED_CALL_BOUNDARY=OPEN",
    "NEXT=A71_NONQUIESCENT_AND_ENDOGENOUS_RULE_FIELD_DYNAMICS",
    "FULL_SELF_HOSTED=FALSE",
    "V013_NOT_ACCEPTED PRODUCTION_UNCHANGED",
  ].join(" "));
}

main();
