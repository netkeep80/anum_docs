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
  if(!c)throw new Error(`v0.13 A71b recurrent active fixed point: ${m}`);
}
function same<T>(a:T,e:T,m:string):void{
  assert(Object.is(a,e),`${m}: values differ`);
}
function setSame(actual:readonly LinkHandle[],expected:readonly LinkHandle[],m:string):void{
  same(new Set(actual).size,new Set(expected).size,`${m}: cardinality`);
  for(const x of expected)assert(actual.includes(x),`${m}: missing expected Link`);
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

function exercise(noise:boolean):void{
  const memory=new Memory();
  const b=ensureRootBasis(memory);
  const C=b.C;

  if(noise){
    memory.ensure(memory.ensure(b.U,b.C),memory.ensure(b.O,b.L));
    memory.ensureEndSelfClosed(memory.ensure(b.L,b.U));
  }

  const s0=memory.ensure(b.L,b.U);
  const K=defineContext(memory,C,s0);
  const payload=memory.poles(K).end;

  same(memory.ensure(K,payload),K,
    "Context START self-closure is exact active witness K->payload");

  // Generic recurrence authority:
  //
  //   K = K -> P
  //   P -> P
  //   --------
  //   K -> P = K
  //
  // This is deliberately explicit selected authority. A71b proves a dynamic
  // regime of the generic rewrite algebra, not autonomous authority discovery.
  const stay=memory.ensure(payload,payload);
  const selected=carrier(memory,[stay]);

  setSame(discoverEntryContexts(memory,C),[K],"K is the only entry");
  setSame(activeFrontier(memory,K),[K],"fresh K active frontier");
  setSame(currentWorkset(memory,C),[K],"fresh current workset");

  // Once recurrence authority is materialized, executing it changes no
  // physical topology: the output canonicalizes to K itself.
  const beforeFirst=memory.linkCount;
  const first=rewriteSelectedOne(memory,K,selected);
  setSame(first,[K],"self-loop rewrite output is exact K identity");
  same(memory.linkCount,beforeFirst,
    "self-loop rewrite adds no Link after authority setup");
  setSame(currentWorkset(memory,C),[K],
    "self-loop leaves derived workset non-empty");

  // Repeat several logical ticks. Memory is a physical fixed point while the
  // execution relation remains enabled and the derived scheduler still sees K.
  const fixedCount=memory.linkCount;
  for(let tick=0;tick<8;tick+=1){
    const out=rewriteSelectedOne(memory,K,selected);
    setSame(out,[K],`tick ${tick} exact recurrent output`);
    same(memory.linkCount,fixedCount,
      `tick ${tick} physical Memory fixed point`);
    setSame(activeFrontier(memory,K),[K],
      `tick ${tick} active frontier remains K`);
    setSame(currentWorkset(memory,C),[K],
      `tick ${tick} global workset remains non-empty`);
  }

  // The recurrent regime is not irreversible. Adding the independently
  // established END leaf closure changes the derived lifecycle to quiescent.
  // This is a separate transition, not a consequence of the self-loop itself.
  const endK=memory.ensureEndSelfClosed(K);
  same(closureOf(memory,K),endK,"END(K) closure visible");
  setSame(activeFrontier(memory,K),[],"END(K) removes recurrent leaf from frontier");
  setSame(currentWorkset(memory,C),[],"END(K) yields quiescent workset");

  // The recurrence authority and K remain physically present after closure.
  same(memory.poles(stay).start,payload,"P->P recurrence authority persists");
  same(readContext(memory,K).parent,C,"K persists after closure");
  same(readContext(memory,K).current,s0,"K state persists after closure");

  // Re-applying the same selected self-loop after END does not resurrect K in
  // the derived lifecycle: physical rewrite identity and active membership are
  // distinct concepts.
  const afterClosureCount=memory.linkCount;
  setSame(rewriteSelectedOne(memory,K,selected),[K],
    "physical self-loop identity remains derivable after closure");
  same(memory.linkCount,afterClosureCount,
    "post-closure self-loop adds no Link");
  setSame(currentWorkset(memory,C),[],
    "closure topology keeps K scheduler-inert");
}

function sourceSlice(source:string,start:string,end:string):string{
  const i=source.indexOf(start),j=source.indexOf(end,i+1);
  assert(i>=0&&j>i,`source slice ${start}`);
  return source.slice(i,j).replace(/\s+/g,"");
}

function staticGuards():void{
  const root=resolve(process.cwd(),"..");
  const own=readFileSync(
    join(root,"ts/test/research-v013-recurrent-active-fixed-point-a71b.test.ts"),
    "utf8",
  );
  const a70f=readFileSync(
    join(root,"ts/test/research-v013-derived-workset-a70f.test.ts"),
    "utf8",
  );
  const a68=readFileSync(
    join(root,"ts/test/research-v013-uniform-active-rewrite-a68a.test.ts"),
    "utf8",
  );

  same(
    sourceSlice(own,"function rewriteSelectedOne(","\nfunction carrier("),
    sourceSlice(a68,"function rewriteSelectedOne(","\nfunction carrier("),
    "A71b recurrence uses source-identical A68 rewrite core",
  );
  same(
    sourceSlice(own,"function currentWorkset(","\nfunction exercise("),
    sourceSlice(a70f,"function currentWorkset(","\nfunction exercise("),
    "A71b workset derivation source-identical A70f",
  );

  const exercise=sourceSlice(
    own,
    "function exercise(",
    "\nfunction sourceSlice(",
  );
  assert(exercise.includes("memory.ensure(payload,payload)"),
    "recurrent authority is exact P->P");
  assert(exercise.includes("rewriteSelectedOne(memory,K,selected)"),
    "same generic rewrite drives recurrence");
  assert(!exercise.includes("while(true)"),
    "test harness does not hide an unbounded host loop");
}

function main():void{
  exercise(false);
  exercise(true);
  staticGuards();

  console.log([
    "MTS v0.13 A71b: RECURRENT_ACTIVE_FIXED_POINT=GREEN_SCOPED_RESEARCH",
    "RECURRENCE=K_SELF_WITNESS_PLUS_P_TO_P",
    "REWRITE_CORE=A68A_SOURCE_IDENTICAL",
    "WORKSET=A70F_SOURCE_IDENTICAL",
    "PHYSICAL_MEMORY_AFTER_SETUP=FIXED",
    "ACTIVE_FRONTIER=NONEMPTY_FIXED_POINT",
    "REPEATED_TICKS=8_ZERO_NEW_LINKS",
    "GLOBAL_TERMINATION=FALSE_AS_UNIVERSAL_CLAIM",
    "EMPTY_FRONTIER_ATTRACTOR=NOT_UNIVERSAL",
    "FRONTIER_CARDINALITY_LYAPUNOV=FALSE_AS_UNIVERSAL_CANDIDATE",
    "END_K=EXPLICIT_TRANSITION_TO_QUIESCENCE",
    "PHYSICAL_RECURRENCE_AUTHORITY_PERSISTS_AFTER_END",
    "CLOSURE_PREVENTS_SCHEDULER_RESURRECTION",
    "AUTONOMOUS_RECURRENCE_AUTHORITY_DISCOVERY=NOT_PROVEN",
    "OPEN_GROWTH_REGIME=NOT_PROVEN",
    "MINIMUM_ENERGY_LAW=NOT_PROVEN",
    "NEXT=A71C_RULE_TOPOLOGY_SELF_AUTHORING_FALSIFIER",
    "FULL_SELF_HOSTED=FALSE",
    "V013_NOT_ACCEPTED PRODUCTION_UNCHANGED",
  ].join(" "));
}

main();
