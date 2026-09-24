import { Memory, ensureRootBasis, type LinkHandle } from "../src/memory.js";
import { defineContext, readContext } from "../src/state.js";

function assert(c:unknown,m:string):asserts c{if(!c)throw new Error(`v0.13 A65 context-native frontier: ${m}`);}
function same<T>(a:T,b:T,m:string):void{assert(Object.is(a,b),m);}
function setSame(a:readonly LinkHandle[],b:readonly LinkHandle[],m:string):void{
  assert(a.length===b.length,`${m}: cardinality`);
  const s=new Set(a);for(const x of b)assert(s.has(x),`${m}: missing`);
}

function qseq(memory:Memory,args:readonly LinkHandle[]):LinkHandle{
  let q=memory.root;
  for(let i=args.length-1;i>=0;i-=1)q=memory.ensure(args[i]!,q);
  return q;
}
function qread(memory:Memory,q:LinkHandle):{done:boolean;arg?:LinkHandle;next?:LinkHandle}{
  if(q===memory.root)return {done:true};
  const p=memory.poles(q);return {done:false,arg:p.start,next:p.end};
}
function frame(memory:Memory,parent:LinkHandle,f:LinkHandle,q:LinkHandle):LinkHandle{
  return defineContext(memory,parent,memory.ensure(f,q));
}
function state(memory:Memory,k:LinkHandle):{parent:LinkHandle;f:LinkHandle;q:LinkHandle}{
  const c=readContext(memory,k),s=memory.poles(c.current);
  return {parent:c.parent,f:s.start,q:s.end};
}

interface Authority {
  readonly applications:ReadonlySet<LinkHandle>;
  readonly results:readonly LinkHandle[];
}
function freezeAuthority(memory:Memory,rows:readonly (readonly [LinkHandle,LinkHandle,readonly LinkHandle[]])[]):Authority{
  const applications:LinkHandle[]=[];const results:LinkHandle[]=[];
  for(const [f,arg,ys] of rows){
    const app=memory.ensure(f,arg);applications.push(app);
    for(const y of ys)results.push(memory.ensure(app,y));
  }
  return {applications:new Set(applications),results:Object.freeze(results)};
}
function nextValues(memory:Memory,authority:Authority,k:LinkHandle):readonly LinkHandle[]{
  const s=state(memory,k),q=qread(memory,s.q);
  if(q.done)return Object.freeze([]);
  assert(q.arg!==undefined,"A65 current argument");
  const app=memory.find(s.f,q.arg);
  if(app===undefined||!authority.applications.has(app))return Object.freeze([]);
  return Object.freeze(authority.results.flatMap(r=>{
    const p=memory.poles(r);return p.start===app?[p.end]:[];
  }));
}
function stepOne(memory:Memory,authority:Authority,k:LinkHandle):readonly LinkHandle[]{
  const s=state(memory,k),q=qread(memory,s.q);
  if(q.done)return Object.freeze([]);
  assert(q.next!==undefined,"A65 next cursor");
  return Object.freeze(nextValues(memory,authority,k).map(y=>frame(memory,k,y,q.next!)));
}
function stepFrontier(memory:Memory,authority:Authority,frontier:readonly LinkHandle[],schedule:"forward"|"reverse"):readonly LinkHandle[]{
  const parents=[...frontier];if(schedule==="reverse")parents.reverse();
  return Object.freeze(parents.flatMap(k=>stepOne(memory,authority,k)));
}

function exercise(noise:boolean):void{
  const memory=new Memory(),b=ensureRootBasis(memory);
  if(noise)memory.ensure(memory.ensure(b.U,b.C),memory.ensure(b.O,b.L));

  const a1=memory.ensure(b.O,b.C),a2=memory.ensure(b.C,b.O),a3=memory.ensure(a1,a2);
  const f0=memory.ensure(b.L,b.U);
  const fA=memory.ensure(f0,b.O),fB=memory.ensure(f0,b.C);
  const fC=memory.ensure(fA,b.L),fD=memory.ensure(fB,b.U);
  const z=memory.ensure(fC,fD);

  const q0=qseq(memory,[a1,a2,a3]);
  const k0=frame(memory,memory.root,f0,q0);

  const authority=freezeAuthority(memory,[
    [f0,a1,[fA,fB]],
    [fA,a2,[]],
    [fB,a2,[fC,fD]],
    [fC,a3,[z]],
    [fD,a3,[z]],
  ]);

  // First split: frontier is contexts themselves.
  const first=stepFrontier(memory,authority,[k0],"forward");
  same(first.length,2,"A65 first split");
  const [kA,kB]=first;
  assert(kA!==undefined&&kB!==undefined&&kA!==kB,"A65 sibling contexts distinct");
  same(state(memory,kA).parent,k0,"A65 A parent");
  same(state(memory,kB).parent,k0,"A65 B parent");
  assert(state(memory,kA).f!==state(memory,kB).f,"A65 branch-local F differs");

  // Second step: A terminates, B splits. No occurrence path is carried.
  const secondF=stepFrontier(memory,authority,first,"forward");
  const secondR=stepFrontier(memory,authority,first,"reverse");
  same(secondF.length,2,"A65 local termination plus recursive split");
  setSame(secondF,secondR,"A65 scheduler order preserves exact child-context set");
  const [kC,kD]=secondF;
  assert(kC!==undefined&&kD!==undefined&&kC!==kD,"A65 recursive sibling contexts distinct");
  same(state(memory,kC).parent,kB,"A65 recursive C parent");
  same(state(memory,kD).parent,kB,"A65 recursive D parent");

  // Third step: same extensional z, but contexts remain distinct by ancestry.
  const thirdF=stepFrontier(memory,authority,secondF,"forward");
  const thirdR=stepFrontier(memory,authority,secondR,"reverse");
  same(thirdF.length,2,"A65 converged branch count");
  setSame(thirdF,thirdR,"A65 converged scheduler order preserves exact contexts");
  const [kZc,kZd]=thirdF;
  assert(kZc!==undefined&&kZd!==undefined&&kZc!==kZd,"A65 convergence does not collapse contexts");
  same(state(memory,kZc).f,z,"A65 converged C value");
  same(state(memory,kZd).f,z,"A65 converged D value");
  assert(state(memory,kZc).parent!==state(memory,kZd).parent,"A65 ancestry preserved structurally");
  same(state(memory,kZc).q,memory.root,"A65 C cursor exhausted");
  same(state(memory,kZd).q,memory.root,"A65 D cursor exhausted");

  // One extensional result can be projected while provenance remains in K ancestry.
  const rootResultC=memory.ensure(k0,z),rootResultD=memory.ensure(k0,z);
  same(rootResultC,rootResultD,"A65 converged extensional root result canonical");
  assert(kZc!==kZd,"A65 canonical result does not erase child execution histories");

  // Ambient unselected continuation is inert.
  const ambient=memory.ensure(memory.ensure(fA,a2),z);
  assert(ambient!==rootResultC,"A65 ambient result fact exists physically");
  same(stepOne(memory,authority,kA).length,0,"A65 ambient unselected result cannot revive terminated branch");

  // No external MetaState wrapper is required: each frontier element decodes F and Q from K.current.
  for(const k of [k0,...first,...secondF,...thirdF]){
    const s=state(memory,k);
    assert(s.f!==undefined&&s.q!==undefined,"A65 complete state from context alone");
  }
}

function main():void{
  exercise(false);exercise(true);
  console.log([
    "MTS v0.13 A65: CONTEXT_NATIVE_FRONTIER=GREEN_SCOPED_RESEARCH",
    "FRONTIER_ELEMENT=EXECUTION_CONTEXT_K",
    "EXTERNAL_METASTATE_WRAPPER=0",
    "K_CURRENT=F_TO_Q",
    "FIRST_SPLIT=2",
    "LOCAL_TERMINATION=CONFIRMED",
    "RECURSIVE_SPLIT=2",
    "CONVERGED_VALUE_COUNT=1",
    "CONVERGED_CONTEXT_COUNT=2",
    "OCCURRENCE_PATH_REQUIRED_FOR_BRANCH_PROVENANCE=NO_IN_TESTED_PATH",
    "BRANCH_PROVENANCE=CONTEXT_ANCESTRY",
    "SCHEDULE_ORDER=FORWARD_REVERSE_CONTEXT_SET_EQUIVALENT",
    "AMBIENT_UNSELECTED_RESULT=INERT",
    "A21_CONTEXTUAL_TRUTH_LAW=NOT_REJECTED",
    "FULL_FUNCTION_EXECUTION=K_TO_CHILD_K_EVOLUTION",
    "Q_REPRESENTATION=SCOPED_A64_CARRIER",
    "NEXT=A66_START_END_CHIRAL_SEQUENCE_CURSOR",
    "GLOBAL_E2=OPEN GLOBAL_E3=OPEN GLOBAL_E4=OPEN FULL_SELF_HOSTED=FALSE",
    "V013_NOT_ACCEPTED PRODUCTION_UNCHANGED",
  ].join(" "));
}
main();
