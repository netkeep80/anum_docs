import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { Memory, ensureRootBasis, type LinkHandle } from "../src/memory.js";
import { defineContext, readContext } from "../src/state.js";

function assert(condition:unknown,message:string):asserts condition{
  if(!condition)throw new Error(`v0.13 A67 provenance roles: ${message}`);
}
function same<T>(actual:T,expected:T,message:string):void{
  assert(Object.is(actual,expected),`${message}: values differ`);
}
function exact(actual:readonly LinkHandle[],expected:readonly LinkHandle[],message:string):void{
  same(JSON.stringify(actual),JSON.stringify(expected),message);
}
function expectThrows(run:()=>void,message:string):void{
  let threw=false;try{run();}catch{threw=true;}assert(threw,message);
}

interface CurrentOccurrence {
  readonly context: LinkHandle;
  readonly currentValue: LinkHandle;
  readonly history: readonly LinkHandle[];
}

/**
 * Source-identical A33 generic current-occurrence reader.
 */
function readCurrentOccurrence(memory: Memory, head: LinkHandle): CurrentOccurrence {
  const seen=new Set<LinkHandle>();
  const reversed:LinkHandle[]=[];
  let cursor=head;
  let context:LinkHandle|undefined;

  while(true){
    assert(!seen.has(cursor),"A33 occurrence ancestry cycle");
    seen.add(cursor);
    const occurrence=memory.poles(cursor);
    const value=occurrence.end;
    const vp=memory.poles(value);
    if(context===undefined) context=vp.start;
    else same(vp.start,context,"A33 occurrence history keeps one context");
    reversed.push(value);
    if(occurrence.start===memory.root) break;
    cursor=occurrence.start;
  }

  assert(context!==undefined,"A33 current occurrence context");
  reversed.reverse();
  return Object.freeze({
    context,
    currentValue:memory.poles(head).end,
    history:Object.freeze(reversed),
  });
}

function contextStatePath(memory:Memory,head:LinkHandle):readonly LinkHandle[]{
  const reversed:LinkHandle[]=[];
  const seen=new Set<LinkHandle>();
  let cursor=head;
  while(cursor!==memory.root){
    assert(!seen.has(cursor),"execution context ancestry cycle");
    seen.add(cursor);
    const k=readContext(memory,cursor);
    reversed.push(k.current);
    cursor=k.parent;
  }
  return Object.freeze(reversed.reverse());
}

function detach(
  memory:Memory,
  context:LinkHandle,
  truth:LinkHandle,
  continuation:LinkHandle,
):LinkHandle{
  const t=memory.poles(truth);
  same(t.start,context,"local truth belongs to selected context");
  const c=memory.poles(continuation);
  same(c.start,t.end,"continuation starts at true antecedent");
  return memory.ensure(context,c.end);
}

function exerciseContextAncestry(noise:boolean):void{
  const memory=new Memory(),b=ensureRootBasis(memory);
  if(noise)memory.ensure(memory.ensure(b.U,b.C),b.O);

  const p=memory.ensure(b.O,b.C);
  const f0=memory.ensure(b.L,b.U);
  const fA=memory.ensure(f0,b.O);
  const fB=memory.ensure(f0,b.C);
  const z=memory.ensure(fA,fB);

  const state0=memory.ensure(f0,p);
  const stateA=memory.ensure(fA,p);
  const stateB=memory.ensure(fB,p);
  const stateZ=memory.ensure(z,p);

  const k0=defineContext(memory,memory.root,state0);
  const kA=defineContext(memory,k0,stateA);
  const kB=defineContext(memory,k0,stateB);
  const kAZ=defineContext(memory,kA,stateZ);
  const kBZ=defineContext(memory,kB,stateZ);

  assert(kAZ!==kBZ,"equal current state does not collapse distinct execution contexts");
  same(readContext(memory,kAZ).current,stateZ,"A branch converges to state Z");
  same(readContext(memory,kBZ).current,stateZ,"B branch converges to same state Z");
  exact(contextStatePath(memory,kAZ),[state0,stateA,stateZ],"A branch ancestry");
  exact(contextStatePath(memory,kBZ),[state0,stateB,stateZ],"B branch ancestry");

  // Re-materialization order changes nothing: ancestry is already in K identity.
  same(defineContext(memory,kB,stateZ),kBZ,"B converged context canonical");
  same(defineContext(memory,kA,stateZ),kAZ,"A converged context canonical");

  // A canonical call-root result intentionally collapses the extensional value,
  // while the two producer histories remain represented by their pre-return K ancestry.
  const y=memory.ensure(z,b.L);
  const rootResultA=memory.ensure(k0,y);
  const rootResultB=memory.ensure(k0,y);
  same(rootResultA,rootResultB,"call-root result identity is extensional");
  same(memory.poles(rootResultA).start,k0,"call-root result context");
  same(memory.poles(rootResultA).end,y,"call-root result value");
  assert(kAZ!==kBZ,"producer branch histories remain distinct outside root-result identity");

  // A21's local contextual truth law does not require occurrence ancestry.
  const antecedent=memory.ensure(b.C,b.L);
  const consequent=memory.ensure(b.U,b.O);
  const truth=memory.ensure(kA,antecedent);
  const continuation=memory.ensure(antecedent,consequent);
  const nextTruth=detach(memory,kA,truth,continuation);
  same(memory.poles(nextTruth).start,kA,"detachment preserves selected local context");
  same(memory.poles(nextTruth).end,consequent,"detachment produces selected consequence");
}

function exerciseStableContextHistory(noise:boolean):void{
  const memory=new Memory(),b=ensureRootBasis(memory);
  if(noise)memory.ensure(memory.ensure(b.L,b.U),b.C);

  const G=memory.ensure(b.C,b.L);
  const A=memory.ensure(b.O,b.L);
  const B=memory.ensure(A,b.O);
  const C=memory.ensure(A,b.C);
  const Z=memory.ensure(B,C);

  const gA=memory.ensure(G,A);
  const gB=memory.ensure(G,B);
  const gC=memory.ensure(G,C);
  const gZ=memory.ensure(G,Z);

  // Two immutable histories converge to the exact same current contextual value.
  const oA=memory.ensure(memory.root,gA);
  const oAB=memory.ensure(oA,gB);
  const oAC=memory.ensure(oA,gC);
  const oABZ=memory.ensure(oAB,gZ);
  const oACZ=memory.ensure(oAC,gZ);

  same(memory.poles(oABZ).end,gZ,"history ABZ current value");
  same(memory.poles(oACZ).end,gZ,"history ACZ same current value");
  assert(oABZ!==oACZ,"different stable-context histories retain distinct heads");

  const hABZ=readCurrentOccurrence(memory,oABZ);
  const hACZ=readCurrentOccurrence(memory,oACZ);
  same(hABZ.context,G,"ABZ stable semantic context");
  same(hACZ.context,G,"ACZ stable semantic context");
  same(hABZ.currentValue,gZ,"ABZ current contextual value");
  same(hACZ.currentValue,gZ,"ACZ same current contextual value");
  exact(hABZ.history,[gA,gB,gZ],"ABZ immutable ancestry");
  exact(hACZ.history,[gA,gC,gZ],"ACZ immutable ancestry");

  // Current contextual value alone cannot distinguish the two histories.
  same(memory.ensure(G,Z),gZ,"current-only carrier canonically collapses history");
  const currentOnly=memory.poles(gZ);
  same(currentOnly.start,G,"current-only carrier knows stable context");
  same(currentOnly.end,Z,"current-only carrier knows current payload");

  // Selecting an old head remains stable even after a newer occurrence exists.
  const selectedOld=readCurrentOccurrence(memory,oAB);
  same(selectedOld.currentValue,gB,"selected old head stays on B");
  same(selectedOld.history.length,2,"selected old head retains exact old history");
  same(readCurrentOccurrence(memory,oABZ).currentValue,gZ,"new head explicitly advances current selection");

  // Ambient contextual values are not selected merely by physical existence.
  const ambient=memory.ensure(G,memory.ensure(Z,b.U));
  same(readCurrentOccurrence(memory,oAB).currentValue,gB,
    "ambient contextual value cannot change selected old head");
  assert(ambient!==gB,"ambient value distinct");

  // Mixed stable contexts still fail closed under the generic A33 reader.
  const G2=memory.ensure(b.U,b.L);
  const foreign=memory.ensure(G2,Z);
  const mixed=memory.ensure(oAB,foreign);
  expectThrows(
    ()=>{readCurrentOccurrence(memory,mixed);},
    "mixed stable-context history rejected",
  );
}

function staticGuards():void{
  const root=resolve(process.cwd(),"..");
  const own=readFileSync(
    join(root,"ts/test/research-v013-provenance-ancestry-roles-a67.test.ts"),"utf8",
  );
  const a33=readFileSync(
    join(root,"ts/test/research-v013-generic-current-occurrence-a33.test.ts"),"utf8",
  );
  const slice=(s:string,a:string,b:string):string=>{
    const i=s.indexOf(a),j=s.indexOf(b,i+1);
    assert(i>=0&&j>i,`slice ${a}`);
    return s.slice(i,j).replace(/\s+/g,"");
  };

  same(
    slice(own,"function readCurrentOccurrence(","\nfunction contextStatePath("),
    slice(a33,"function readCurrentOccurrence(","\nfunction exercise("),
    "A67 stable-history reader is source-identical A33",
  );

  const execution=slice(
    own,"function exerciseContextAncestry(","\nfunction exerciseStableContextHistory(",
  );
  for(const forbidden of [
    "readCurrentOccurrence(",
    "Occurrence",
    "occurrence",
    "freezeFrontier",
  ])assert(!execution.includes(forbidden),
    `A67 execution branch provenance excludes duplicate occurrence carrier ${forbidden}`);

  const detachment=slice(own,"function detach(","\nfunction exerciseContextAncestry(");
  for(const forbidden of ["Occurrence","occurrence","contextStatePath"])
    assert(!detachment.includes(forbidden),
      `A67 local contextual truth law excludes provenance primitive ${forbidden}`);
}

function main():void{
  exerciseContextAncestry(false);
  exerciseContextAncestry(true);
  exerciseStableContextHistory(false);
  exerciseStableContextHistory(true);
  staticGuards();

  console.log([
    "MTS v0.13 A67: PROVENANCE_ANCESTRY_ROLE_FACTORIZATION=GREEN_SCOPED_RESEARCH",
    "GENERAL_PRINCIPLE=PROVENANCE_REQUIRES_ANCESTRY_NOT_NECESSARILY_OCCURRENCE",
    "EXECUTION_BRANCH_PROVENANCE=CONTEXT_ANCESTRY_SUFFICIENT_IN_TESTED_PATH",
    "A20_A21_BRANCH_OCCURRENCE=REDUNDANT_IN_CONTEXT_NATIVE_EXECUTION_PATH",
    "A21_CONTEXTUAL_TRUTH_LAW=RETAINED",
    "STABLE_CONTEXT_CURRENT_VALUE=INSUFFICIENT_FOR_HISTORY",
    "CONVERGED_STABLE_CONTEXT_VALUE=CANONICAL_HISTORY_COLLAPSE",
    "A33_OCCURRENCE_HISTORY=RETAINED_ROLE",
    "A33_CURRENT_HEAD_SELECTION=RETAINED_ROLE",
    "A33_READER=SOURCE_IDENTICAL",
    "AMBIENT_CONTEXTUAL_VALUE=INERT",
    "MIXED_STABLE_CONTEXT_HISTORY=REJECTED",
    "CALL_ROOT_RESULT_IDENTITY=EXTENSIONAL_NOT_PRODUCER_PROVENANCE",
    "OCCURRENCE_AS_UNIVERSAL_EXECUTION_PRIMITIVE=NO",
    "OCCURRENCE_AS_GENERIC_HISTORY_CARRIER=YES_IN_CURRENT_MODEL",
    "MINIMALITY_OF_OCCURRENCE_REPRESENTATION=NOT_CLAIMED",
    "NEXT=A68_RECONNECT_RULE_ADMISSION_PUBLICATION_TO_CONTEXT_NATIVE_EXECUTION",
    "V013_NOT_ACCEPTED GLOBAL_E2=OPEN GLOBAL_E3=OPEN GLOBAL_E4=OPEN FULL_SELF_HOSTED=FALSE",
    "PRODUCTION_UNCHANGED",
  ].join(" "));
}
main();
