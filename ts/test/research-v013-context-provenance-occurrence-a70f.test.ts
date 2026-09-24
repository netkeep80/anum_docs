import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { Memory, ensureRootBasis, type LinkHandle } from "../src/memory.js";
import { defineContext, readContext } from "../src/state.js";

function assert(c:unknown,m:string):asserts c{
  if(!c)throw new Error(`v0.13 A70f context provenance occurrence: ${m}`);
}
function same<T>(a:T,e:T,m:string):void{
  assert(Object.is(a,e),`${m}: values differ`);
}
function exact(actual:readonly LinkHandle[],expected:readonly LinkHandle[],m:string):void{
  same(actual.length,expected.length,`${m}: length`);
  for(let i=0;i<expected.length;i+=1)same(actual[i],expected[i],`${m}: value[${i}]`);
}

interface ContextPath{
  readonly contexts:readonly LinkHandle[];
  readonly states:readonly LinkHandle[];
}
function contextPath(
  memory:Memory,
  contextRoot:LinkHandle,
  leaf:LinkHandle,
):ContextPath{
  const contexts:LinkHandle[]=[];
  const states:LinkHandle[]=[];
  const seen=new Set<LinkHandle>();
  let current=leaf;

  while(current!==contextRoot){
    assert(!seen.has(current),"Context ancestry cycle");
    seen.add(current);
    const state=readContext(memory,current);
    contexts.push(current);
    states.push(state.current);
    current=state.parent;
  }

  contexts.reverse();
  states.reverse();
  return Object.freeze({
    contexts:Object.freeze(contexts),
    states:Object.freeze(states),
  });
}

function exercise(noise:boolean):void{
  const memory=new Memory();
  const b=ensureRootBasis(memory);
  const C=b.C;
  if(noise)memory.ensure(memory.ensure(b.U,b.C),memory.ensure(b.O,b.L));

  const fresh:LinkHandle[]=[];
  let seed=memory.ensure(b.U,b.L);
  for(let i=0;i<20;i+=1){
    seed=memory.ensure(seed,i%2===0?b.O:b.C);
    fresh.push(seed);
  }
  const at=(i:number):LinkHandle=>{
    const value=fresh[i];
    assert(value!==undefined,`fresh anchor ${i}`);
    return value;
  };

  const s0=memory.ensure(at(0),at(1));
  const s1a=memory.ensure(at(2),at(3));
  const s1b=memory.ensure(at(4),at(5));
  const s2=memory.ensure(at(6),at(7));
  const s3=memory.ensure(at(8),at(9));

  const k0=defineContext(memory,C,s0);
  const k1a=defineContext(memory,k0,s1a);
  const k1b=defineContext(memory,k0,s1b);

  // Both branches now converge extensionally to exactly the same state S2.
  // Context identity still retains which parent branch produced that state.
  const k2a=defineContext(memory,k1a,s2);
  const k2b=defineContext(memory,k1b,s2);
  assert(k2a!==k2b,"same converged state under distinct parents keeps distinct Context occurrence");

  const p2a=contextPath(memory,C,k2a);
  const p2b=contextPath(memory,C,k2b);
  exact(p2a.states,[s0,s1a,s2],"branch A Context-state provenance");
  exact(p2b.states,[s0,s1b,s2],"branch B Context-state provenance");
  assert(p2a.contexts[1]!==p2b.contexts[1],"branch provenance differs at first split");
  assert(p2a.contexts[2]!==p2b.contexts[2],"converged leaf Context identities remain distinct");

  // Convergence may continue through more equal states without losing ancestry.
  const k3a=defineContext(memory,k2a,s3);
  const k3b=defineContext(memory,k2b,s3);
  assert(k3a!==k3b,"continued equal state under distinct ancestry remains distinct");
  exact(contextPath(memory,C,k3a).states,[s0,s1a,s2,s3],"continued A provenance");
  exact(contextPath(memory,C,k3b).states,[s0,s1b,s2,s3],"continued B provenance");

  // Exact replay of the same structural history is not a new occurrence.
  // Canonical Memory returns the same Links at every level.
  const replayK0=defineContext(memory,C,s0);
  const replayK1a=defineContext(memory,replayK0,s1a);
  const replayK2a=defineContext(memory,replayK1a,s2);
  const replayK3a=defineContext(memory,replayK2a,s3);
  same(replayK0,k0,"exact replay root collapses to same K0");
  same(replayK1a,k1a,"exact replay first child collapses");
  same(replayK2a,k2a,"exact replay converged child collapses");
  same(replayK3a,k3a,"exact replay leaf collapses");

  // A genuinely distinct invocation must therefore differ structurally before
  // or at the root state. Different initial input/state gives another K0 tree
  // while preserving the same Context law thereafter.
  const s0Prime=memory.ensure(at(10),at(11));
  const k0Prime=defineContext(memory,C,s0Prime);
  assert(k0Prime!==k0,"distinct root state creates distinct entry Context");

  const k1Prime=defineContext(memory,k0Prime,s1a);
  const k2Prime=defineContext(memory,k1Prime,s2);
  const k3Prime=defineContext(memory,k2Prime,s3);
  assert(k1Prime!==k1a,"distinct entry ancestry keeps first child distinct");
  assert(k2Prime!==k2a,"distinct entry ancestry keeps converged child distinct");
  assert(k3Prime!==k3a,"distinct entry ancestry keeps final leaf distinct");
  exact(contextPath(memory,C,k3Prime).states,[s0Prime,s1a,s2,s3],
    "distinct invocation provenance includes distinct root state");

  // There is no need for a second occurrence chain merely to preserve branch
  // provenance inside one execution tree: parent(Context) already is the exact
  // predecessor occurrence relation.
  same(readContext(memory,k1a).parent,k0,"k1a predecessor carried by Context parent");
  same(readContext(memory,k2a).parent,k1a,"k2a predecessor carried by Context parent");
  same(readContext(memory,k3a).parent,k2a,"k3a predecessor carried by Context parent");

  // Exact same C + exact same root state cannot encode two temporal invocations
  // by Link identity alone. This experiment deliberately does not manufacture
  // a hidden counter. If such temporal multiplicity is semantically relevant,
  // an external/event/authority distinction must itself be represented.
  same(defineContext(memory,C,s0),k0,
    "same C plus same S0 has one canonical execution-root identity");
}

function staticGuards():void{
  const root=resolve(process.cwd(),"..");
  const own=readFileSync(
    join(root,"ts/test/research-v013-context-provenance-occurrence-a70f.test.ts"),
    "utf8",
  );

  const begin=own.indexOf("function contextPath(");
  const end=own.indexOf("\nfunction exercise(",begin);
  assert(begin>=0&&end>begin,"A70f contextPath source slice");
  const reader=own.slice(begin,end);

  for(const forbidden of [
    ".find(",
    ".outgoing(",
    ".incoming(",
    "allLinks(",
    "ensureStartSelfClosed",
    "ensureEndSelfClosed",
    "switch",
  ]){
    assert(!reader.includes(forbidden),
      `A70f provenance reader excludes ${forbidden}`);
  }

  assert(reader.includes("state=readContext(memory,current)"),
    "provenance uses generic Context ancestry only");
  assert(reader.includes("current=state.parent"),
    "Context parent is predecessor occurrence relation");

  const exercise=own.slice(
    own.indexOf("function exercise("),
    own.indexOf("\nfunction staticGuards("),
  );
  assert(!exercise.includes("Occurrence_n"),
    "runtime fixture introduces no second occurrence carrier");
  assert(!exercise.includes("previousOccurrence"),
    "runtime fixture introduces no host occurrence predecessor");
}

function main():void{
  exercise(false);
  exercise(true);
  staticGuards();

  console.log([
    "MTS v0.13 A70f: CONTEXT_ANCESTRY_PROVENANCE=GREEN_SCOPED_RESEARCH",
    "INTRA_EXECUTION_OCCURRENCE_STACK_REQUIRED=NO_FOR_TESTED_BRANCH_PROVENANCE",
    "CONVERGED_EQUAL_STATE_DISTINCT_CONTEXTS=YES",
    "CONTEXT_PARENT=PREDECESSOR_OCCURRENCE_RELATION",
    "EXACT_PATH_REPLAY=CANONICAL_SAME_CONTEXT_IDENTITIES",
    "SAME_C_PLUS_SAME_S0=ONE_EXECUTION_ROOT_IDENTITY",
    "DISTINCT_ROOT_STATE=DISTINCT_INVOCATION_TREE",
    "HIDDEN_TEMPORAL_COUNTER=NOT_INTRODUCED",
    "TEMPORAL_MULTIPLICITY_WITH_IDENTICAL_INPUTS=OPEN_IF_SEMANTICALLY_REQUIRED",
    "A20_A33_OCCURRENCE=NOT_GLOBALLY_REMOVED",
    "NEXT=A70G_GLOBAL_WORKSET_FROM_C_ENTRIES_PLUS_CONTEXT_FRONTIERS",
    "FULL_SELF_HOSTED=FALSE",
    "V013_NOT_ACCEPTED PRODUCTION_UNCHANGED",
  ].join(" "));
}

main();
