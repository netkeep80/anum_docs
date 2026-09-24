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

    // Proper child payload is ordinary on its END side. END(parent) is also
    // outgoing(parent), but p.end===payload and must not be treated as state.
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
 * Derive the complete current executable set directly from one context-space
 * root. No queue, registry, selected-frontier carrier or active flag is input.
 *
 * Completed entries remain physically discoverable, but contribute zero active
 * leaves and therefore schedule no work.
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



interface PlannedNonFinalLeaf {
  readonly leaf: LinkHandle;
  readonly resultFacts: readonly LinkHandle[];
}

interface DerivedRoundPlan {
  readonly workset: readonly LinkHandle[];
  readonly nonFinal: readonly PlannedNonFinalLeaf[];
  readonly finalLeaves: readonly LinkHandle[];
}

/**
 * Freeze one executable round before any Context/END output write.
 *
 * Both membership choices are intrinsic:
 *
 *   workset     <- currentWorkset(C)
 *   resultFacts <- intrinsicApplicationResults(leaf)
 *
 * The only remaining branch is structural: final ExactSequence positions are
 * separated for the already-established A70d final-return boundary.
 */
function planDerivedRound(
  memory:Memory,
  contextRoot:LinkHandle,
):DerivedRoundPlan{
  const workset=currentWorkset(memory,contextRoot);
  const nonFinal:PlannedNonFinalLeaf[]=[];
  const finalLeaves:LinkHandle[]=[];

  for(const leaf of workset){
    const context=readContext(memory,leaf);
    const state=memory.poles(context.current);
    const positionStep=stepPosition(memory,state.end);

    if(positionStep.doneAfter){
      finalLeaves.push(leaf);
      continue;
    }

    const intrinsic=intrinsicApplicationResults(memory,leaf);
    nonFinal.push(Object.freeze({
      leaf,
      resultFacts:Object.freeze([...intrinsic.resultFacts]),
    }));
  }

  return Object.freeze({
    workset:Object.freeze([...workset]),
    nonFinal:Object.freeze(nonFinal),
    finalLeaves:Object.freeze(finalLeaves),
  });
}

interface DerivedRoundExecution {
  readonly children: readonly LinkHandle[];
  readonly closures: readonly LinkHandle[];
}

/**
 * Execute only the frozen intrinsic non-final plans.
 *
 * No adjacency/work discovery happens here. ZERO becomes END(leaf);
 * ONE/MANY are the unchanged A70c continuation derivation + A68 rewrite +
 * START activation.
 */
function executeFrozenNonFinalPlans(
  memory:Memory,
  plans:readonly PlannedNonFinalLeaf[],
  order:"forward"|"reverse",
):DerivedRoundExecution{
  const selected=[...plans];
  if(order==="reverse")selected.reverse();

  const children:LinkHandle[]=[];
  const closures:LinkHandle[]=[];

  for(const plan of selected){
    if(plan.resultFacts.length===0){
      closures.push(memory.ensureEndSelfClosed(plan.leaf));
      continue;
    }

    const continuations=plan.resultFacts.map(
      (fact)=>deriveFrameContinuation(memory,plan.leaf,fact),
    );
    const outputs=rewriteSelectedOne(
      memory,
      plan.leaf,
      carrier(memory,continuations),
    );
    for(const output of outputs){
      children.push(memory.ensureStartSelfClosed(output));
    }
  }

  return Object.freeze({
    children:Object.freeze(children),
    closures:Object.freeze(closures),
  });
}

interface DerivedRound {
  readonly plan: DerivedRoundPlan;
  readonly execution: DerivedRoundExecution;
}

function runDerivedRound(
  memory:Memory,
  contextRoot:LinkHandle,
  order:"forward"|"reverse",
):DerivedRound{
  const plan=planDerivedRound(memory,contextRoot);
  const execution=executeFrozenNonFinalPlans(memory,plan.nonFinal,order);
  return Object.freeze({plan,execution});
}

function exerciseIntegrated(noise:boolean):void{
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

  const a1=memory.ensure(at(0),at(1));
  const a2=memory.ensure(at(2),at(3));
  const a3=memory.ensure(at(4),at(5));
  const sequence=materializeExactSequence(memory,[a1,a2,a3]);

  // Materialize all three canonical positions before scheduling so planning is
  // observational in this fixture even though legacy stepPosition uses ensure
  // to recover an already-existing next-position identity.
  const p0=initialPosition(memory,sequence);
  const p1=stepPosition(memory,p0).nextPosition!;
  const p2=stepPosition(memory,p1).nextPosition!;
  same(stepPosition(memory,p2).doneAfter,true,"P2 is final");

  // Entry A: MANY at round 1.
  const fA=memory.ensure(at(6),at(7));
  const gA1=memory.ensure(at(8),at(9));
  const gA2=memory.ensure(at(10),at(11));
  const entryA=defineFrame(memory,C,fA,p0);
  const appA0=memory.ensure(fA,a1);
  const factA1=memory.ensure(appA0,gA1);
  const factA2=memory.ensure(appA0,gA2);

  // Entry B: ZERO at round 1.
  const fB=memory.ensure(at(12),at(13));
  const entryB=defineFrame(memory,C,fB,p0);
  memory.ensure(fB,a1); // application exists, ordinary result set is empty.

  // Entry C: ONE at round 1.
  const fC=memory.ensure(at(14),at(15));
  const gC=memory.ensure(at(16),at(17));
  const entryC=defineFrame(memory,C,fC,p0);
  const appC0=memory.ensure(fC,a1);
  const factC=memory.ensure(appC0,gC);

  // ROUND 1 — derive both scheduler membership and result authority from graph.
  let beforePlan=memory.linkCount;
  const plan1=planDerivedRound(memory,C);
  same(memory.linkCount,beforePlan,"round1 planning writes no Links");
  setSame(plan1.workset,[entryA,entryB,entryC],"round1 derived workset");
  same(plan1.finalLeaves.length,0,"round1 has no final leaves");

  const pA=plan1.nonFinal.find(x=>x.leaf===entryA);
  const pB=plan1.nonFinal.find(x=>x.leaf===entryB);
  const pC=plan1.nonFinal.find(x=>x.leaf===entryC);
  assert(pA!==undefined&&pB!==undefined&&pC!==undefined,
    "round1 plans all derived active leaves");
  setSame(pA.resultFacts,[factA1,factA2],"round1 A intrinsic MANY");
  setSame(pB.resultFacts,[],"round1 B intrinsic ZERO");
  setSame(pC.resultFacts,[factC],"round1 C intrinsic ONE");

  const forward1=executeFrozenNonFinalPlans(memory,plan1.nonFinal,"forward");
  const afterForward1=memory.linkCount;
  const reverse1=executeFrozenNonFinalPlans(memory,plan1.nonFinal,"reverse");
  same(memory.linkCount,afterForward1,
    "round1 reverse replay adds no Links");
  setSame(reverse1.children,forward1.children,
    "round1 schedule order preserves exact child set");
  setSame(reverse1.closures,forward1.closures,
    "round1 schedule order preserves exact closure set");

  // Compare integrated products to direct A70g replay for each frozen leaf.
  const directA=executeIntrinsicNonFinal(memory,entryA);
  const directB=executeIntrinsicNonFinal(memory,entryB);
  const directC=executeIntrinsicNonFinal(memory,entryC);
  setSame(directA.children,
    forward1.children.filter(k=>readContext(memory,k).parent===entryA),
    "round1 A integrated children exact A70g");
  setSame(directC.children,
    forward1.children.filter(k=>readContext(memory,k).parent===entryC),
    "round1 C integrated child exact A70g");
  assert(directB.closure!==undefined,"round1 B direct ZERO closure");
  setSame(forward1.closures,[directB.closure],
    "round1 integrated ZERO closure exact A70g");

  const childA1=advanceOnePosition(memory,entryA,factA1);
  const childA2=advanceOnePosition(memory,entryA,factA2);
  const childC=advanceOnePosition(memory,entryC,factC);
  setSame(currentWorkset(memory,C),[childA1,childA2,childC],
    "round1 topology automatically becomes next workset");
  same(closureOf(memory,entryB),directB.closure,
    "round1 completed B remains structurally closed");

  // Prepare ROUND 2 result adjacency on the now-active child applications.
  // A1 => ONE, A2 => ZERO, C => MANY.
  const hA1=memory.ensure(at(18),at(19));
  const appA1=memory.ensure(gA1,a2);
  const factAH=memory.ensure(appA1,hA1);

  memory.ensure(gA2,a2); // A2 application exists but has ZERO results.

  const hC1=memory.ensure(at(20),at(21));
  const hC2=memory.ensure(at(22),at(23));
  const appC1=memory.ensure(gC,a2);
  const factCH1=memory.ensure(appC1,hC1);
  const factCH2=memory.ensure(appC1,hC2);

  beforePlan=memory.linkCount;
  const round2=runDerivedRound(memory,C,"reverse");
  same(memory.linkCount>=beforePlan,true,"round2 execution may write outputs");
  setSame(round2.plan.workset,[childA1,childA2,childC],
    "round2 derives previous round frontier without queue");
  same(round2.plan.finalLeaves.length,0,"round2 still non-final");
  const r2A1=round2.plan.nonFinal.find(x=>x.leaf===childA1);
  const r2A2=round2.plan.nonFinal.find(x=>x.leaf===childA2);
  const r2C=round2.plan.nonFinal.find(x=>x.leaf===childC);
  assert(r2A1&&r2A2&&r2C,"round2 plans all three leaves");
  setSame(r2A1.resultFacts,[factAH],"round2 A1 ONE");
  setSame(r2A2.resultFacts,[],"round2 A2 ZERO");
  setSame(r2C.resultFacts,[factCH1,factCH2],"round2 C MANY");

  const finalA=advanceOnePosition(memory,childA1,factAH);
  const finalC1=advanceOnePosition(memory,childC,factCH1);
  const finalC2=advanceOnePosition(memory,childC,factCH2);
  setSame(currentWorkset(memory,C),[finalA,finalC1,finalC2],
    "round2 ONE/ZERO/MANY automatically yields final active leaves");
  assert(closureOf(memory,childA2)!==undefined,
    "round2 ZERO branch A2 is closed");

  // Final application results may already exist, but A70h deliberately does
  // not consume them. A70d remains the separate final publication boundary.
  const yA=memory.ensure(at(24),at(25));
  const yC1=memory.ensure(at(26),at(27));
  const yC2=memory.ensure(at(28),at(29));
  memory.ensure(memory.ensure(hA1,a3),yA);
  memory.ensure(memory.ensure(hC1,a3),yC1);
  memory.ensure(memory.ensure(hC2,a3),yC2);

  beforePlan=memory.linkCount;
  const plan3=planDerivedRound(memory,C);
  same(memory.linkCount,beforePlan,"final-only planning writes no Links");
  setSame(plan3.workset,[finalA,finalC1,finalC2],
    "round3 final workset remains structurally visible");
  same(plan3.nonFinal.length,0,
    "round3 delegates all final leaves instead of guessing final semantics");
  setSame(plan3.finalLeaves,[finalA,finalC1,finalC2],
    "round3 final leaves identified structurally");

  const finalNoop=executeFrozenNonFinalPlans(memory,plan3.nonFinal,"forward");
  setSame(finalNoop.children,[],"final-only round creates no child");
  setSame(finalNoop.closures,[],"final-only round creates no premature END");
  setSame(currentWorkset(memory,C),[finalA,finalC1,finalC2],
    "final leaves remain active for A70d final boundary");

  // Completed entry B remains discoverable but never re-enters workset.
  setSame(discoverEntryContexts(memory,C),[entryA,entryB,entryC],
    "all physical entries remain discoverable");
  assert(!currentWorkset(memory,C).includes(entryB),
    "completed stale B entry never re-executes");

  // No external queue/result selection is needed to reproduce two recursive
  // non-final rounds with ZERO/ONE/MANY and multiple entries.
}

function sourceSlice(
  source:string,
  start:string,
  end:string,
):string{
  const i=source.indexOf(start),j=source.indexOf(end,i+1);
  assert(i>=0&&j>i,`source slice ${start}`);
  return source.slice(i,j).replace(/\s+/g,"");
}

function staticGuards():void{
  const root=resolve(process.cwd(),"..");
  const own=readFileSync(
    join(root,"ts/test/research-v013-derived-execution-cycle-a70h.test.ts"),
    "utf8",
  );
  const a70f=readFileSync(
    join(root,"ts/test/research-v013-derived-workset-a70f.test.ts"),
    "utf8",
  );
  const a70g=readFileSync(
    join(root,"ts/test/research-v013-intrinsic-application-results-a70g.test.ts"),
    "utf8",
  );

  same(
    sourceSlice(
      own,
      "function currentWorkset(",
      "\ninterface PlannedNonFinalLeaf",
    ),
    sourceSlice(
      a70f,
      "function currentWorkset(",
      "\nfunction exercise(",
    ),
    "A70h current workset is source-identical A70f",
  );

  same(
    sourceSlice(
      own,
      "function intrinsicApplicationResults(",
      "\ninterface IntrinsicNonFinalStep",
    ),
    sourceSlice(
      a70g,
      "function intrinsicApplicationResults(",
      "\ninterface IntrinsicNonFinalStep",
    ),
    "A70h intrinsic result discovery is source-identical A70g",
  );

  same(
    sourceSlice(
      own,
      "function executeIntrinsicNonFinal(",
      "\n/**\n * Source-identical A68d entry discovery.",
    ),
    sourceSlice(
      a70g,
      "function executeIntrinsicNonFinal(",
      "\nfunction exercise(",
    ),
    "A70h direct intrinsic executor reference is source-identical A70g",
  );

  const plan=sourceSlice(
    own,
    "function planDerivedRound(",
    "\ninterface DerivedRoundExecution",
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
      `A70h planner excludes external execution authority ${forbidden}`);
  }
  assert(plan.includes("currentWorkset(memory,contextRoot)"),
    "A70h planner derives runnable Contexts");
  assert(plan.includes("intrinsicApplicationResults(memory,leaf)"),
    "A70h planner derives per-leaf application values");

  const executor=sourceSlice(
    own,
    "function executeFrozenNonFinalPlans(",
    "\ninterface DerivedRound",
  );
  assert(!executor.includes("memory.outgoing("),
    "A70h executor performs no late result adjacency discovery");
  assert(!executor.includes("currentWorkset("),
    "A70h executor performs no late scheduler discovery");
  assert(executor.includes("rewriteSelectedOne("),
    "A70h ONE/MANY execute through generic A68");
  assert(executor.includes("memory.ensureEndSelfClosed(plan.leaf)"),
    "A70h ZERO closes exact leaf");
}

function main():void{
  exerciseIntegrated(false);
  exerciseIntegrated(true);
  staticGuards();

  console.log([
    "MTS v0.13 A70h: DERIVED_EXECUTION_CYCLE=GREEN_SCOPED_RESEARCH",
    "WORKSET=A70F_SOURCE_IDENTICAL",
    "APPLICATION_RESULT_AUTHORITY=A70G_SOURCE_IDENTICAL",
    "ROUND_PLAN=FROZEN_BEFORE_EXECUTION",
    "HOST_QUEUE=0 HOST_ENTRY_REGISTRY=0 ACTIVE_FLAG=0",
    "HOST_SELECTED_RESULT_LIST=0 HOST_SELECTED_RESULT_CARRIER=0",
    "MULTIPLE_ENTRIES=YES",
    "ROUND1=MANY_PLUS_ZERO_PLUS_ONE",
    "ROUND2=ONE_PLUS_ZERO_PLUS_MANY",
    "ZERO=END_LEAF",
    "ONE_MANY=A68_REWRITE_PLUS_START",
    "NEXT_WORKSET=DERIVED_FROM_WRITTEN_CONTEXT_TOPOLOGY",
    "FORWARD_REVERSE_FROZEN_ROUND=EXACT_SET_EQUIVALENT",
    "COMPLETED_STALE_ENTRY=ZERO_WORK",
    "FINAL_LEAVES=STRUCTURALLY_CLASSIFIED_AND_DELEGATED_TO_A70D",
    "FINAL_EXECUTION=RESIDUAL",
    "HOST_EXACT_SEQUENCE_TRAVERSAL=RESIDUAL",
    "HOST_ITERATION_OVER_FROZEN_PLAN=RESIDUAL",
    "REPEATED_TOP_LEVEL_ACTIVATION_IDENTITY=OPEN",
    "NEXT=A70I_INTRINSIC_FINAL_APPLICATION_PUBLICATION",
    "FULL_SELF_HOSTED=FALSE",
    "V013_NOT_ACCEPTED PRODUCTION_UNCHANGED",
  ].join(" "));
}

main();
