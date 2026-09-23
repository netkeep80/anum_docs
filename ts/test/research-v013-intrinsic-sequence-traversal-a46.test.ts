import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { materializeExactSequence } from "../src/exact-sequence.js";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
  type RootBasis,
} from "../src/memory.js";

function assert(condition:unknown,message:string):asserts condition{
  if(!condition)throw new Error(`v0.13 A46 intrinsic sequence traversal: ${message}`);
}
function same<T>(actual:T,expected:T,message:string):void{
  assert(Object.is(actual,expected),`${message}: values differ`);
}
function setSame(actual:readonly LinkHandle[],expected:readonly LinkHandle[],message:string):void{
  const a=new Set(actual),e=new Set(expected);
  same(a.size,e.size,`${message} cardinality`);
  for(const value of e)assert(a.has(value),`${message}: missing expected value`);
}

function freezeAuthority(memory:Memory,values:readonly LinkHandle[]):LinkHandle{
  let body=memory.root;
  for(let i=values.length-1;i>=0;i-=1)body=memory.ensure(values[i]!,body);
  return memory.ensureStartSelfClosed(body);
}
function freezeFrontier(memory:Memory,values:readonly LinkHandle[]):LinkHandle{
  let body=memory.root;
  for(let i=values.length-1;i>=0;i-=1)body=memory.ensure(values[i]!,body);
  return memory.ensureStartSelfClosed(body);
}
function readChain(memory:Memory,envelope:LinkHandle,kind:string):readonly LinkHandle[]{
  const e=memory.poles(envelope);
  assert(e.start===envelope&&e.end!==envelope,`A21 ${kind} envelope is proper START-self-closed`);
  const values:LinkHandle[]=[],seen=new Set<LinkHandle>();let cursor=e.end;
  while(cursor!==memory.root){
    assert(!seen.has(cursor),`A21 ${kind} chain cycle`);
    seen.add(cursor);const cell=memory.poles(cursor);
    values.push(cell.start);cursor=cell.end;
  }
  return Object.freeze(values);
}

/** Exact A21 single-root executor. */
function step(
  memory: Memory,
  executionRoot: LinkHandle,
  schedule: "forward" | "reverse",
): LinkHandle {
  const execution = memory.poles(executionRoot);
  const context = execution.start;
  const frontierEnvelope = execution.end;

  const contextPoles = memory.poles(context);
  const authorityEnvelope = contextPoles.end;
  const continuations = [...readChain(memory, authorityEnvelope, "authority")];
  const occurrences = [...readChain(memory, frontierEnvelope, "frontier")];
  if (schedule === "reverse") occurrences.reverse();

  let nextBody = memory.root;

  for (const occurrence of occurrences) {
    const occurrencePoles = memory.poles(occurrence);
    const truth = memory.poles(occurrencePoles.end);
    assert(truth.start === context, "A21 occurrence carries current-context truth");
    const antecedent = truth.end;

    for (const continuation of continuations) {
      const p = memory.poles(continuation);
      if (p.start !== antecedent) continue;

      const nextTruth = memory.ensure(context, p.end);
      const childOccurrence = memory.ensure(occurrence, nextTruth);
      nextBody = memory.ensure(childOccurrence, nextBody);
    }
  }

  const nextFrontier = memory.ensureStartSelfClosed(nextBody);
  return memory.ensure(context, nextFrontier);
}

function frontierTruthEnds(memory:Memory,E:LinkHandle):readonly LinkHandle[]{
  const ep=memory.poles(E),out:LinkHandle[]=[];
  for(const occurrence of readChain(memory,ep.end,"frontier")){
    const truth=memory.poles(memory.poles(occurrence).end);
    same(truth.start,ep.start,"A46 frontier context");
    out.push(truth.end);
  }
  return Object.freeze(out);
}

interface SequenceSupport{
  readonly final:LinkHandle;
  readonly cells:readonly LinkHandle[];
  readonly payloads:readonly LinkHandle[];
  readonly previous:readonly LinkHandle[];
  readonly values:readonly LinkHandle[];
}
function buildSequence(memory:Memory,values:readonly LinkHandle[]):SequenceSupport{
  let current=memory.root;
  const cells:LinkHandle[]=[],payloads:LinkHandle[]=[],previous:LinkHandle[]=[];
  for(const value of values){
    previous.push(current);
    const payload=memory.ensure(current,value);
    const cell=memory.ensureStartSelfClosed(payload);
    payloads.push(payload);cells.push(cell);current=cell;
  }
  same(current,materializeExactSequence(memory,values),"A46 fixture is canonical ExactSequence");
  return Object.freeze({
    final:current,cells:Object.freeze(cells),payloads:Object.freeze(payloads),
    previous:Object.freeze(previous),values:Object.freeze([...values]),
  });
}
function freshValues(memory:Memory,basis:RootBasis):readonly LinkHandle[]{
  let cursor=memory.ensure(basis.U,basis.L);const values:LinkHandle[]=[];
  for(let i=0;i<3;i+=1){cursor=memory.ensure(cursor,basis.C);values.push(cursor);}
  return Object.freeze(values);
}

interface Program{readonly E0:LinkHandle;readonly K:LinkHandle;}
function seedProgram(
  memory:Memory,
  start:LinkHandle,
  continuations:readonly LinkHandle[],
  parent:LinkHandle,
):Program{
  const authority=freezeAuthority(memory,continuations);
  const K=memory.ensure(parent,authority);
  const truth=memory.ensure(K,start);
  const occurrence=memory.ensure(memory.root,truth);
  return Object.freeze({K,E0:memory.ensure(K,freezeFrontier(memory,[occurrence]))});
}
function advance(memory:Memory,E:LinkHandle):LinkHandle{
  return step(memory,E,"forward");
}

/**
 * A46 falsifier: selected intrinsic ExactSequence Links are not a complete
 * A21 iterator. They expose Cell->Payload, but no selected continuation starts
 * at Payload and returns its START pole (Prev).
 */
function intrinsicStopsAtPayload(memory:Memory,s:SequenceSupport,parent:LinkHandle):void{
  const intrinsic=Object.freeze([...s.cells,...s.payloads]);
  let E=seedProgram(memory,s.final,intrinsic,parent).E0;
  E=advance(memory,E);
  same(frontierTruthEnds(memory,E)[0],s.payloads[2]!,"A46 intrinsic first step Cell3->Payload3");
  E=advance(memory,E);
  same(frontierTruthEnds(memory,E).length,0,"A46 intrinsic topology stops at Payload3");
}

/**
 * Positive control: one explicit Link-carried START projection per Payload is
 * sufficient. END/value projection is unnecessary because Payload=Prev->Value
 * already becomes the value continuation whenever Prev is current.
 */
function selectedStartProjectionTraverses(
  memory:Memory,
  s:SequenceSupport,
  parent:LinkHandle,
  startProjections:readonly LinkHandle[],
):void{
  const selected=Object.freeze([...s.cells,...s.payloads,...startProjections]);
  let E=seedProgram(memory,s.final,selected,parent).E0;

  E=advance(memory,E);
  same(frontierTruthEnds(memory,E)[0],s.payloads[2]!,"A46 projected step1 Payload3");
  E=advance(memory,E);
  same(frontierTruthEnds(memory,E)[0],s.cells[1]!,"A46 projected step2 Prev=Cell2");
  E=advance(memory,E);
  setSame(frontierTruthEnds(memory,E),[s.payloads[1]!,s.values[2]!],
    "A46 projected step3 Payload2 plus Value3");
  E=advance(memory,E);
  same(frontierTruthEnds(memory,E)[0],s.cells[0]!,"A46 projected step4 Prev=Cell1");
  E=advance(memory,E);
  setSame(frontierTruthEnds(memory,E),[s.payloads[0]!,s.values[1]!],
    "A46 projected step5 Payload1 plus Value2");
  E=advance(memory,E);
  same(frontierTruthEnds(memory,E)[0],memory.root,"A46 projected step6 Prev=R");
  E=advance(memory,E);
  same(frontierTruthEnds(memory,E)[0],s.values[0]!,"A46 projected step7 Value1");
}

/** END-only projection can expose the last value but cannot recurse to Prev. */
function selectedEndProjectionDoesNotTraverse(
  memory:Memory,
  s:SequenceSupport,
  parent:LinkHandle,
  endProjections:readonly LinkHandle[],
):void{
  const selected=Object.freeze([...s.cells,...s.payloads,...endProjections]);
  let E=seedProgram(memory,s.final,selected,parent).E0;
  E=advance(memory,E);
  same(frontierTruthEnds(memory,E)[0],s.payloads[2]!,"A46 END-only first step Payload3");
  E=advance(memory,E);
  same(frontierTruthEnds(memory,E)[0],s.values[2]!,"A46 END-only exposes Value3");
  E=advance(memory,E);
  same(frontierTruthEnds(memory,E).length,0,"A46 END-only cannot recurse to Prev");
}

function exercise(memory:Memory,withNoise:boolean):void{
  const basis=ensureRootBasis(memory);
  if(withNoise)memory.ensure(memory.ensure(basis.C,basis.U),basis.L);
  const values=freshValues(memory,basis),s=buildSequence(memory,values);
  same(s.cells.length,3,"A46 fixture cell count");

  const parentIntrinsic=memory.ensure(basis.R,basis.O);
  intrinsicStopsAtPayload(memory,s,parentIntrinsic);

  // Materialize both projection families only after intrinsic authority was
  // exercised. Physical ambient existence must not retroactively grant them.
  const startProjections=s.payloads.map((payload,index)=>
    memory.ensure(payload,s.previous[index]!)
  );
  const endProjections=s.payloads.map((payload,index)=>
    memory.ensure(payload,s.values[index]!)
  );

  const parentAmbient=memory.ensure(basis.O,basis.C);
  intrinsicStopsAtPayload(memory,s,parentAmbient);

  const parentEnd=memory.ensure(basis.C,basis.L);
  selectedEndProjectionDoesNotTraverse(memory,s,parentEnd,endProjections);

  const parentStart=memory.ensure(basis.L,basis.U);
  selectedStartProjectionTraverses(memory,s,parentStart,startProjections);
}

function staticGuards():void{
  const root=resolve(process.cwd(),"..");
  const own=readFileSync(join(root,"ts/test/research-v013-intrinsic-sequence-traversal-a46.test.ts"),"utf8");
  const a37=readFileSync(join(root,"ts/test/research-v013-link-carried-admission-program-a37.test.ts"),"utf8");
  const exact=readFileSync(join(root,"ts/src/exact-sequence.ts"),"utf8");

  const runtime=own.slice(
    own.indexOf("function advance("),
    own.indexOf("\n/**\n * A46 falsifier",own.indexOf("function advance(")),
  );
  for(const forbidden of [
    "memory.poles(","readExactSequence(","sequenceNode(","foldSequence(","zipSequence(",
  ])assert(!runtime.includes(forbidden),`A46 traversal runtime excludes host carrier reader ${forbidden}`);

  const x=own.slice(own.indexOf("function step("),own.indexOf("\nfunction frontierTruthEnds(",own.indexOf("function step(")));
  const y=a37.slice(a37.indexOf("function step("),a37.indexOf("\ninterface Program",a37.indexOf("function step(")));
  same(x.replace(/\s+/g,""),y.replace(/\s+/g,""),"A46 runtime source-identical A21/A37");

  assert(exact.includes("current = memory.ensureStartSelfClosed(payload);"),
    "A46 falsifier targets canonical ExactSequence Cell=self->Payload");
  assert(exact.includes("const payload = memory.ensure(current, value);"),
    "A46 falsifier targets canonical Payload=Prev->Value");
}
function main():void{
  exercise(new Memory(),false);exercise(new Memory(),true);staticGuards();
  console.log([
    "MTS v0.13 A46: INTRINSIC_SEQUENCE_TRAVERSAL=RED_BOUNDARY_CLASSIFIED",
    "INTRINSIC_SELECTED_AUTHORITY=Cell_TO_Payload_PLUS_Prev_TO_Value",
    "INTRINSIC_RESULT=STOPS_AFTER_Cell_TO_Payload",
    "AMBIENT_START_END_PROJECTIONS=INERT",
    "SELECTED_END_PROJECTION=LAST_VALUE_ONLY_NO_RECURSION",
    "SELECTED_START_PROJECTION=FULL_TRAVERSAL_VALUES_3_OF_3",
    "MINIMUM_MISSING_AUTHORITY=Payload_TO_START_Payload",
    "A21_RUNTIME=SOURCE_IDENTICAL HOST_RECURSIVE_SEQUENCE_READER_IN_RUNTIME=0",
    "A45_GENERIC_RECURSIVE_TRANSDUCER_SOURCE_REMOVAL=RED_UNDER_INTRINSIC_AUTHORITY",
    "NEXT_BOUNDARY=A47_START_PROJECTION_AUTHORITY_SOURCE",
    "RULE_CONTRACT_DERIVATION=HOST_STRUCTURAL_RESIDUAL",
    "INDEPENDENT_MEMORIES=2 GLOBAL_E2=OPEN GLOBAL_E3=OPEN",
    "FULL_SELF_HOSTED=NOT_CLAIMED PRODUCTION_UNCHANGED",
  ].join(" "));
}
main();
