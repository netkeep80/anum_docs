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
  if(!c)throw new Error(`v0.13 A70e Link-native frontier: ${m}`);
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

/**
 * Discover already-existing direct child Contexts of one execution Context.
 *
 * A child has exact topology:
 *
 *   payload = parent -> state
 *   child   = START(payload)
 *
 * Bare parent->state facts are not children until their START wrapper exists.
 * The operation is read-only.
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
 * Read the unique proper END-self-closed closure witness:
 *
 *   END(K) = K -> END(K)
 *
 * No closure Link is materialized by observation.
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
 * Read the active execution frontier rooted at one already-discovered entry.
 *
 * Lifecycle law:
 *
 *   no child + no END(K) => active leaf
 *   child exists         => K is immutable history, recurse into children
 *   END(K) exists        => closed leaf
 *
 * END on a non-leaf is rejected rather than interpreted as subtree
 * cancellation; A70d established branch-local leaf closure only.
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
  for(let i=0;i<18;i+=1){
    seed=memory.ensure(seed,i%2===0?b.O:b.C);
    fresh.push(seed);
  }
  const at=(i:number):LinkHandle=>{
    const value=fresh[i];
    assert(value!==undefined,`fresh anchor ${i}`);
    return value;
  };

  const s0=memory.ensure(at(0),at(1));
  const s1=memory.ensure(at(2),at(3));
  const s2a=memory.ensure(at(4),at(5));
  const s2b=memory.ensure(at(6),at(7));
  const s3=memory.ensure(at(8),at(9));
  const publicationValue=memory.ensure(at(10),at(11));
  const ambientState=memory.ensure(at(12),at(13));

  const k0=defineContext(memory,C,s0);

  // Fresh entry is the only active frontier node.
  let before=memory.linkCount;
  setSame(activeFrontier(memory,k0),[k0],"fresh K0 frontier");
  same(memory.linkCount,before,"fresh frontier discovery read-only");

  // Bare K0->state payload does not consume K0 until START activation exists.
  const ambientPayload=memory.ensure(k0,ambientState);
  before=memory.linkCount;
  setSame(activeFrontier(memory,k0),[k0],
    "bare next-state payload does not consume frontier");
  same(memory.linkCount,before,"bare-payload frontier read-only");
  same(memory.poles(ambientPayload).start,k0,"ambient payload physically exists");

  // START child activation consumes predecessor from the frontier without
  // deleting or mutating it.
  const k1=defineContext(memory,k0,s1);
  before=memory.linkCount;
  setSame(activeFrontier(memory,k0),[k1],"K1 replaces K0 on frontier");
  same(memory.linkCount,before,"single-child frontier read-only");
  same(readContext(memory,k0).current,s0,"K0 immutable after child activation");

  // MANY produces sibling active leaves.
  const k2a=defineContext(memory,k1,s2a);
  const k2b=defineContext(memory,k1,s2b);
  setSame(activeFrontier(memory,k0),[k2a,k2b],
    "MANY child Contexts become sibling frontier leaves");

  // A publication fact under an ancestor is data only. Without START lift it
  // is not execution growth.
  const publication=memory.ensure(k0,publicationValue);
  same(memory.poles(publication).start,k0,"publication exists under K0");
  setSame(activeFrontier(memory,k0),[k2a,k2b],
    "ancestor publication does not alter active frontier");

  // END closes exactly one branch-local leaf.
  const endA=memory.ensureEndSelfClosed(k2a);
  same(closureOf(memory,k2a),endA,"closureOf reads exact END(k2a)");
  setSame(activeFrontier(memory,k0),[k2b],
    "END(k2a) removes only branch A from frontier");

  // Branch B may continue after sibling A closes.
  const k3=defineContext(memory,k2b,s3);
  setSame(activeFrontier(memory,k0),[k3],
    "START child under branch B advances frontier to K3");

  const end3=memory.ensureEndSelfClosed(k3);
  same(closureOf(memory,k3),end3,"closureOf reads exact END(k3)");
  before=memory.linkCount;
  setSame(activeFrontier(memory,k0),[],
    "all branch leaves closed means entry has empty active frontier");
  same(memory.linkCount,before,"completed frontier discovery read-only");

  // The physical entry remains present but no longer schedules work. This is
  // the append-only replacement for deleting/consuming K0.
  same(readContext(memory,k0).parent,C,"completed K0 still physically exists");
  setSame(activeFrontier(memory,k0),[],
    "stale physical K0 does not imply re-execution");

  // Repeated observation remains stable and write-free.
  before=memory.linkCount;
  const replay1=activeFrontier(memory,k0);
  const replay2=activeFrontier(memory,k0);
  setSame(replay1,replay2,"repeated completed frontier stable");
  same(memory.linkCount,before,"repeated completed frontier writes no Links");

  // END on a node that already has live children is not silently treated as a
  // recursive subtree cancellation. Such topology is outside the established
  // A70d leaf-closure law and must fail closed.
  const badRoot=defineContext(memory,C,memory.ensure(at(14),at(15)));
  const badChild=defineContext(memory,badRoot,memory.ensure(at(16),at(17)));
  assert(badChild!==badRoot,"bad lifecycle child distinct");
  memory.ensureEndSelfClosed(badRoot);
  expectThrows(
    ()=>activeFrontier(memory,badRoot),
    "END on non-leaf lifecycle topology rejected",
  );
}

function staticGuards():void{
  const root=resolve(process.cwd(),"..");
  const own=readFileSync(
    join(root,"ts/test/research-v013-link-native-frontier-a70e.test.ts"),"utf8",
  );

  const begin=own.indexOf("function childContexts(");
  const end=own.indexOf("\nfunction exercise(",begin);
  assert(begin>=0&&end>begin,"A70e frontier core source slice");
  const core=own.slice(begin,end);

  for(const forbidden of [
    ".ensure(",
    "ensureStartSelfClosed",
    "ensureEndSelfClosed",
    ".find(",
    "allLinks(",
    "defineContext(",
    ".delete(",
    ".remove(",
    "switch",
  ]){
    assert(!core.includes(forbidden),
      `A70e frontier core excludes constructive/global primitive ${forbidden}`);
  }

  assert(core.includes("memory.outgoing(parent)"),
    "child discovery is parent-scoped");
  assert(core.includes("memory.incoming(payload)"),
    "child discovery observes existing START wrappers");
  assert(core.includes("memory.outgoing(context)"),
    "closure discovery is Context-scoped");
  assert(core.includes("children.length>0"),
    "frontier derives activity from child topology");
  assert(core.includes("closure===undefined"),
    "frontier derives activity from END absence");
}

function main():void{
  exercise(false);
  exercise(true);
  staticGuards();

  console.log([
    "MTS v0.13 A70e: LINK_NATIVE_ACTIVE_FRONTIER=GREEN_SCOPED_RESEARCH",
    "ACTIVE_LEAF=NO_START_CHILD_AND_NO_END_CLOSURE",
    "START_CHILD=PREDECESSOR_BECOMES_HISTORY",
    "MANY_CHILDREN=SIBLING_ACTIVE_FRONTIER",
    "END_LEAF=BRANCH_LOCAL_FRONTIER_REMOVAL",
    "ALL_LEAVES_END=EMPTY_ENTRY_FRONTIER",
    "STALE_PHYSICAL_K0=NO_REEXECUTION",
    "ENTRY_DELETION_REQUIRED=NO",
    "ACTIVE_FLAG_REQUIRED=NO",
    "ANCESTOR_PUBLICATION=INERT_TO_FRONTIER",
    "BARE_NEXT_STATE_PAYLOAD=INERT_UNTIL_START_LIFT",
    "END_NONLEAF=FAIL_CLOSED",
    "FRONTIER_DISCOVERY=READ_ONLY",
    "AMBIENT_GLOBAL_ALL_LINK_SCAN=0",
    "REARM_SAME_CANONICAL_K0=OPEN_OCCURRENCE_IDENTITY",
    "NESTED_CALL_BOUNDARY=OPEN_NOT_INVENTED",
    "NEXT=A70F_OCCURRENCE_IDENTITY_OR_STRUCTURAL_REARM",
    "FULL_SELF_HOSTED=FALSE",
    "V013_NOT_ACCEPTED PRODUCTION_UNCHANGED",
  ].join(" "));
}

main();
