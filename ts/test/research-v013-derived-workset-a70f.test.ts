import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

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
  if(!c)throw new Error(`v0.13 A70f derived workset: ${m}`);
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
  for(let i=0;i<24;i+=1){
    seed=memory.ensure(seed,i%2===0?b.O:b.C);
    fresh.push(seed);
  }
  const at=(i:number):LinkHandle=>{
    const value=fresh[i];
    assert(value!==undefined,`fresh anchor ${i}`);
    return value;
  };

  const a0=memory.ensure(at(0),at(1));
  const a1=memory.ensure(at(2),at(3));
  const a2=memory.ensure(at(4),at(5));
  const a3=memory.ensure(at(6),at(7));
  const b0=memory.ensure(at(8),at(9));
  const b1=memory.ensure(at(10),at(11));
  const publicationValue=memory.ensure(at(12),at(13));
  const bareState=memory.ensure(at(14),at(15));

  // No physical entry, no work.
  let before=memory.linkCount;
  setSame(currentWorkset(memory,C),[],"empty context space has empty workset");
  same(memory.linkCount,before,"empty workset discovery read-only");

  // Bare C->state payload is not an entry.
  memory.ensure(C,bareState);
  setSame(currentWorkset(memory,C),[],"bare C->state payload does not schedule work");

  // Two independent entries are both active.
  const entryA=defineContext(memory,C,a0);
  const entryB=defineContext(memory,C,b0);
  before=memory.linkCount;
  setSame(currentWorkset(memory,C),[entryA,entryB],"two fresh entries scheduled");
  same(memory.linkCount,before,"fresh multi-entry workset read-only");

  // Advancing A replaces only A's frontier; B remains independently active.
  const aK1=defineContext(memory,entryA,a1);
  setSame(currentWorkset(memory,C),[aK1,entryB],
    "entry A child plus fresh entry B scheduled");

  // MANY under A yields sibling work while B remains present.
  const aK2=defineContext(memory,aK1,a2);
  const aK3=defineContext(memory,aK1,a3);
  setSame(currentWorkset(memory,C),[aK2,aK3,entryB],
    "branching A plus independent B compose into one workset");

  // Publication/data under an entry does not become executable work.
  const publication=memory.ensure(entryA,publicationValue);
  same(memory.poles(publication).start,entryA,"entry publication physically exists");
  setSame(currentWorkset(memory,C),[aK2,aK3,entryB],
    "entry publication is inert to scheduler");

  // Close one A branch; sibling and B remain.
  memory.ensureEndSelfClosed(aK2);
  setSame(currentWorkset(memory,C),[aK3,entryB],
    "branch-local END removes only one scheduled leaf");

  // Advance B and close its child independently.
  const bK1=defineContext(memory,entryB,b1);
  setSame(currentWorkset(memory,C),[aK3,bK1],
    "independent entry B advancement reflected automatically");
  memory.ensureEndSelfClosed(bK1);
  setSame(currentWorkset(memory,C),[aK3],
    "completed B contributes zero work while stale entry remains discoverable");

  // Close final A branch. Both physical entries remain, scheduler sees no work.
  memory.ensureEndSelfClosed(aK3);
  before=memory.linkCount;
  setSame(currentWorkset(memory,C),[],
    "all completed entries yield empty global workset");
  same(memory.linkCount,before,"completed global workset read-only");

  const entries=discoverEntryContexts(memory,C);
  setSame(entries,[entryA,entryB],"completed entries remain physically discoverable");
  setSame(activeFrontier(memory,entryA),[],"completed A frontier empty");
  setSame(activeFrontier(memory,entryB),[],"completed B frontier empty");

  // Repeated scheduler read is stable and cannot re-arm old entries.
  before=memory.linkCount;
  const replay1=currentWorkset(memory,C);
  const replay2=currentWorkset(memory,C);
  setSame(replay1,replay2,"repeated empty workset stable");
  same(memory.linkCount,before,"repeated scheduler read writes no Links");

  // New independent entry appears automatically without registering it in a
  // host queue.
  const c0=memory.ensure(at(16),at(17));
  const entryC=defineContext(memory,C,c0);
  setSame(currentWorkset(memory,C),[entryC],
    "new physical C-rooted entry joins workset automatically");

  // A malformed lifecycle in any discovered entry fails the whole scheduler
  // read closed rather than returning a partial workset.
  const bad0=memory.ensure(at(18),at(19));
  const bad1=memory.ensure(at(20),at(21));
  const badEntry=defineContext(memory,C,bad0);
  defineContext(memory,badEntry,bad1);
  memory.ensureEndSelfClosed(badEntry);
  expectThrows(
    ()=>currentWorkset(memory,C),
    "malformed discovered entry lifecycle fails scheduler closed",
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
    join(root,"ts/test/research-v013-derived-workset-a70f.test.ts"),"utf8",
  );
  const a68d=readFileSync(
    join(root,"ts/test/research-v013-entry-discovery-a68d.test.ts"),"utf8",
  );
  const a70e=readFileSync(
    join(root,"ts/test/research-v013-link-native-frontier-a70e.test.ts"),"utf8",
  );

  same(
    sourceSlice(own,"function discoverEntryContexts(","\n/**\n * Source-identical A70e child"),
    sourceSlice(a68d,"function discoverEntryContexts(","\nfunction statesOf("),
    "A70f entry discovery source-identical A68d",
  );
  same(
    sourceSlice(own,"function childContexts(","\n/**\n * Source-identical A70e closure"),
    sourceSlice(a70e,"function childContexts(","\n/**\n * Read the unique proper END"),
    "A70f child discovery source-identical A70e",
  );
  same(
    sourceSlice(own,"function closureOf(","\n/**\n * Source-identical A70e active"),
    sourceSlice(a70e,"function closureOf(","\n/**\n * Read the active execution frontier"),
    "A70f closure discovery source-identical A70e",
  );
  same(
    sourceSlice(own,"function activeFrontier(","\n/**\n * Derive the complete current executable set"),
    sourceSlice(a70e,"function activeFrontier(","\nfunction exercise("),
    "A70f active frontier source-identical A70e",
  );

  const scheduler=sourceSlice(
    own,
    "function currentWorkset(",
    "\nfunction exercise(",
  );
  for(const forbidden of [
    ".ensure(",
    ".find(",
    "allLinks(",
    "defineContext(",
    "queue",
    "registry",
    "selectedWorkFrontier",
    "activeFlag",
  ]){
    assert(!scheduler.includes(forbidden),
      `A70f scheduler excludes external work authority ${forbidden}`);
  }
  assert(scheduler.includes("discoverEntryContexts(memory,contextRoot)"),
    "scheduler derives entries from context-space root");
  assert(scheduler.includes("activeFrontier(memory,entry)"),
    "scheduler derives work only from active Context leaves");
}

function main():void{
  exercise(false);
  exercise(true);
  staticGuards();

  console.log([
    "MTS v0.13 A70f: CURRENT_WORKSET_DERIVED_FROM_CONTEXT_SPACE=GREEN_SCOPED_RESEARCH",
    "ENTRY_DISCOVERY=A68D_SOURCE_IDENTICAL",
    "ACTIVE_FRONTIER=A70E_SOURCE_IDENTICAL",
    "WORKSET=UNION_OF_ACTIVE_LEAVES_OF_DISCOVERED_ENTRIES",
    "HOST_QUEUE_REQUIRED=NO",
    "HOST_ENTRY_REGISTRY_REQUIRED=NO",
    "ACTIVE_FLAG_REQUIRED=NO",
    "COMPLETED_STALE_ENTRY=ZERO_WORK",
    "NEW_C_ROOTED_ENTRY=AUTO_DISCOVERED",
    "MULTIPLE_ENTRIES=COMPOSE",
    "MANY_BRANCHES=COMPOSE",
    "BRANCH_END=LOCAL_WORK_REMOVAL",
    "PUBLICATION_FACT=INERT_TO_SCHEDULER",
    "MALFORMED_ENTRY_LIFECYCLE=FAIL_CLOSED",
    "SCHEDULER_DISCOVERY=READ_ONLY",
    "GLOBAL_ALL_LINK_SCAN=0",
    "HOST_ITERATION_OVER_DERIVED_WORKSET=RESIDUAL",
    "CONTINUATION_AUTHORITY_PER_LEAF=RESIDUAL",
    "REPEATED_TOP_LEVEL_ACTIVATION_IDENTITY=OPEN",
    "NEXT=A70G_CONNECT_DERIVED_WORKSET_TO_GENERIC_REWRITE_EXECUTION",
    "FULL_SELF_HOSTED=FALSE",
    "V013_NOT_ACCEPTED PRODUCTION_UNCHANGED",
  ].join(" "));
}

main();
