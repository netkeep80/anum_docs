import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { materializeExactSequence } from "../src/exact-sequence.js";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
  type LinkPoles,
  type ReadMemory,
  type RootBasis,
} from "../src/memory.js";

function assert(condition:unknown,message:string):asserts condition{
  if(!condition)throw new Error(`v0.13 A47 proof-carried START projection: ${message}`);
}
function same<T>(actual:T,expected:T,message:string):void{
  assert(Object.is(actual,expected),`${message}: values differ`);
}
function setSame(actual:readonly LinkHandle[],expected:readonly LinkHandle[],message:string):void{
  const a=new Set(actual),e=new Set(expected);same(a.size,e.size,`${message} cardinality`);
  for(const value of e)assert(a.has(value),`${message}: missing expected value`);
}
function freezeAuthority(memory:Memory,values:readonly LinkHandle[]):LinkHandle{
  let body=memory.root;for(let i=values.length-1;i>=0;i-=1)body=memory.ensure(values[i]!,body);
  return memory.ensureStartSelfClosed(body);
}
function freezeFrontier(memory:Memory,values:readonly LinkHandle[]):LinkHandle{
  let body=memory.root;for(let i=values.length-1;i>=0;i-=1)body=memory.ensure(values[i]!,body);
  return memory.ensureStartSelfClosed(body);
}
function readChain(memory:Memory,envelope:LinkHandle,kind:string):readonly LinkHandle[]{
  const e=memory.poles(envelope);assert(e.start===envelope&&e.end!==envelope,`A21 ${kind} envelope`);
  const out:LinkHandle[]=[],seen=new Set<LinkHandle>();let cursor=e.end;
  while(cursor!==memory.root){
    assert(!seen.has(cursor),`A21 ${kind} cycle`);seen.add(cursor);
    const p=memory.poles(cursor);out.push(p.start);cursor=p.end;
  }
  return Object.freeze(out);
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
    same(truth.start,ep.start,"A47 frontier context");out.push(truth.end);
  }
  return Object.freeze(out);
}

interface Frame{readonly startRole:LinkHandle;readonly endRole:LinkHandle;}
function frame(memory:Memory,basis:RootBasis):Frame{
  const whole=memory.ensure(basis.L,basis.L);
  const startRole=memory.ensureStartSelfClosed(whole);
  const endRole=memory.ensureEndSelfClosed(whole);
  assert(startRole!==endRole,"A47 decomposition roles distinct");
  return Object.freeze({startRole,endRole});
}

/**
 * Construction-time proof producer. The caller already owns start/end operands;
 * it never decomposes target to discover them and does not pre-author target->start.
 */
function defineDecompositionWitness(
  memory:Memory,
  f:Frame,
  target:LinkHandle,
  start:LinkHandle,
  end:LinkHandle,
):LinkHandle{
  const startBinding=memory.ensure(f.startRole,start);
  const endBinding=memory.ensure(f.endRole,end);
  return memory.ensure(memory.ensure(startBinding,endBinding),target);
}

class BindingEvidenceReader{
  readonly counters={witnessReads:0,pairReads:0,bindingReads:0,targetPoleReads:0};
  constructor(private readonly source:ReadMemory){}
  readWitness(link:LinkHandle):LinkPoles{this.counters.witnessReads+=1;return this.source.poles(link);}
  readPair(link:LinkHandle):LinkPoles{this.counters.pairReads+=1;return this.source.poles(link);}
  readBinding(link:LinkHandle):LinkPoles{this.counters.bindingReads+=1;return this.source.poles(link);}
}

interface ProjectionCandidate{
  readonly target:LinkHandle;readonly start:LinkHandle;readonly end:LinkHandle;
  readonly projection:LinkHandle;readonly gate:LinkHandle;readonly query:LinkHandle;
  readonly targetPoleReads:number;
}

/**
 * Receiver-side projection derivation.
 *
 * START/END values come only from proof-carrying bindings. The target is never
 * decomposed. Canonical reconstruction plus the A36 collapse gate decides
 * validity under ordinary A21 rather than a host target-equality branch.
 */
function deriveStartProjection(
  memory:Memory,
  f:Frame,
  witness:LinkHandle,
):ProjectionCandidate{
  const evidence=new BindingEvidenceReader(memory);
  const wp=evidence.readWitness(witness),pair=evidence.readPair(wp.start);
  const startBinding=evidence.readBinding(pair.start);
  const endBinding=evidence.readBinding(pair.end);
  same(startBinding.start,f.startRole,"A47 start binding role");
  same(endBinding.start,f.endRole,"A47 end binding role");

  const target=wp.end,start=startBinding.end,end=endBinding.end;
  const reconstructed=memory.ensure(start,end);
  const projection=memory.ensure(target,start);
  const gate=memory.ensureStartSelfClosed(target);
  const query=memory.ensure(gate,reconstructed);

  same(evidence.counters.targetPoleReads,0,"A47 receiver target pole reads");
  return Object.freeze({
    target,start,end,projection,gate,query,
    targetPoleReads:evidence.counters.targetPoleReads,
  });
}

function validateProjection(
  memory:Memory,
  candidate:ProjectionCandidate,
  parent:LinkHandle,
):LinkHandle{
  const authority=freezeAuthority(memory,[memory.ensure(candidate.gate,candidate.projection)]);
  const K=memory.ensure(parent,authority);
  const seed=memory.ensure(K,candidate.query);
  const occurrence=memory.ensure(memory.root,seed);
  return step(memory,memory.ensure(K,freezeFrontier(memory,[occurrence])),"forward");
}

interface SequenceSupport{
  readonly final:LinkHandle;readonly cells:readonly LinkHandle[];
  readonly payloads:readonly LinkHandle[];readonly previous:readonly LinkHandle[];
  readonly values:readonly LinkHandle[];readonly witnesses:readonly LinkHandle[];
}
function buildWitnessedSequence(
  memory:Memory,
  f:Frame,
  values:readonly LinkHandle[],
):SequenceSupport{
  let current=memory.root;
  const cells:LinkHandle[]=[],payloads:LinkHandle[]=[],previous:LinkHandle[]=[],witnesses:LinkHandle[]=[];
  for(const value of values){
    const prev=current;previous.push(prev);
    const payload=memory.ensure(prev,value);
    assert(memory.find(payload,prev)===undefined,"A47 START projection absent before proof derivation");
    witnesses.push(defineDecompositionWitness(memory,f,payload,prev,value));
    assert(memory.find(payload,prev)===undefined,"A47 witness does not pre-author START projection");
    const cell=memory.ensureStartSelfClosed(payload);
    payloads.push(payload);cells.push(cell);current=cell;
  }
  same(current,materializeExactSequence(memory,values),"A47 witnessed carrier remains canonical ExactSequence");
  return Object.freeze({
    final:current,cells:Object.freeze(cells),payloads:Object.freeze(payloads),
    previous:Object.freeze(previous),values:Object.freeze([...values]),witnesses:Object.freeze(witnesses),
  });
}
function freshValues(memory:Memory,basis:RootBasis):readonly LinkHandle[]{
  let cursor=memory.ensure(basis.U,basis.L);const out:LinkHandle[]=[];
  for(let i=0;i<3;i+=1){cursor=memory.ensure(cursor,basis.C);out.push(cursor);}
  return Object.freeze(out);
}

function seedTraversal(
  memory:Memory,
  s:SequenceSupport,
  projections:readonly LinkHandle[],
  parent:LinkHandle,
):LinkHandle{
  const authority=freezeAuthority(memory,[...s.cells,...s.payloads,...projections]);
  const K=memory.ensure(parent,authority),truth=memory.ensure(K,s.final);
  const occurrence=memory.ensure(memory.root,truth);
  return memory.ensure(K,freezeFrontier(memory,[occurrence]));
}
function proveFullTraversal(
  memory:Memory,
  s:SequenceSupport,
  projections:readonly LinkHandle[],
  parent:LinkHandle,
):void{
  let E=seedTraversal(memory,s,projections,parent);
  E=step(memory,E,"forward");same(frontierTruthEnds(memory,E)[0],s.payloads[2]!,"A47 traversal Payload3");
  E=step(memory,E,"forward");same(frontierTruthEnds(memory,E)[0],s.cells[1]!,"A47 traversal Cell2");
  E=step(memory,E,"forward");setSame(frontierTruthEnds(memory,E),[s.payloads[1]!,s.values[2]!],"A47 traversal Value3");
  E=step(memory,E,"forward");same(frontierTruthEnds(memory,E)[0],s.cells[0]!,"A47 traversal Cell1");
  E=step(memory,E,"forward");setSame(frontierTruthEnds(memory,E),[s.payloads[0]!,s.values[1]!],"A47 traversal Value2");
  E=step(memory,E,"forward");same(frontierTruthEnds(memory,E)[0],memory.root,"A47 traversal R");
  E=step(memory,E,"forward");same(frontierTruthEnds(memory,E)[0],s.values[0]!,"A47 traversal Value1");
}

function exercise(memory:Memory,withNoise:boolean):void{
  const basis=ensureRootBasis(memory);if(withNoise)memory.ensure(memory.ensure(basis.C,basis.U),basis.L);
  const f=frame(memory,basis),s=buildWitnessedSequence(memory,f,freshValues(memory,basis));

  // Constructor START(P)=S,S=S->P is not the first pole of ordinary Payload P.
  for(let i=0;i<s.payloads.length;i+=1){
    assert(memory.ensureStartSelfClosed(s.payloads[i]!)!==s.previous[i]!,
      "A47 START self-incidence constructor is not arbitrary-Link START projection");
  }

  const candidates=s.witnesses.map(w=>deriveStartProjection(memory,f,w));
  const accepted=candidates.map((candidate,index)=>{
    same(candidate.target,s.payloads[index]!,"A47 witness target");
    same(candidate.start,s.previous[index]!,"A47 witness-carried START");
    same(candidate.targetPoleReads,0,"A47 no target pole read");
    const ends=frontierTruthEnds(memory,validateProjection(
      memory,candidate,memory.ensure(basis.R,candidate.target),
    ));
    same(ends.length,1,"A47 valid decomposition admits one projection");
    same(ends[0],candidate.projection,"A47 admitted projection exact");
    return candidate.projection;
  });

  proveFullTraversal(memory,s,accepted,memory.ensure(basis.O,basis.U));

  // Forged decomposition carries wrong ordered poles. Projection is physically
  // constructible but never becomes contextual authority because gate != query.
  const forged=defineDecompositionWitness(
    memory,f,s.payloads[2]!,s.values[2]!,s.previous[2]!,
  );
  const bad=deriveStartProjection(memory,f,forged);
  const rejected=frontierTruthEnds(memory,validateProjection(
    memory,bad,memory.ensure(basis.C,basis.L),
  ));
  same(rejected.length,0,"A47 forged decomposition yields ZERO");
}

function staticGuards():void{
  const root=resolve(process.cwd(),"..");
  const own=readFileSync(join(root,"ts/test/research-v013-proof-carried-start-projection-a47.test.ts"),"utf8");
  const a37=readFileSync(join(root,"ts/test/research-v013-link-carried-admission-program-a37.test.ts"),"utf8");
  const relative=readFileSync(join(root,"ts/src/v013-relative-pole-context.ts"),"utf8");
  const formal=readFileSync(join(root,"ts/src/v013-formal-aspect-evaluator.ts"),"utf8");

  const derive=own.slice(
    own.indexOf("function deriveStartProjection("),
    own.indexOf("\nfunction validateProjection(",own.indexOf("function deriveStartProjection(")),
  );
  for(const forbidden of [
    "memory.poles(target","memory.poles(candidate","readTargetPoles","memory.find(",
  ])assert(!derive.includes(forbidden),`A47 receiver excludes target projection oracle ${forbidden}`);

  const x=own.slice(own.indexOf("function step("),own.indexOf("\nfunction frontierTruthEnds(",own.indexOf("function step(")));
  const y=a37.slice(a37.indexOf("function step("),a37.indexOf("\ninterface Program",a37.indexOf("function step(")));
  same(x.replace(/\s+/g,""),y.replace(/\s+/g,""),"A47 runtime source-identical A21/A37");

  assert(relative.includes("const poles = memory.poles(unary.whole);"),
    "A47 records current relative-pole projection as bootstrap pole-read path");
  assert(formal.includes("memory.ensureStartSelfClosed(materializePlan"),
    "A47 distinguishes FORMAL START constructor from arbitrary-Link pole projection");
}
function main():void{
  exercise(new Memory(),false);exercise(new Memory(),true);staticGuards();
  console.log([
    "MTS v0.13 A47: PROOF_CARRIED_START_PROJECTION=GREEN_SCOPED_RESEARCH",
    "START_CONSTRUCTOR_NOT_PROJECTION=CONFIRMED",
    "PREAUTHORED_START_PROJECTION_EDGES=0 RECEIVER_TARGET_POLE_READS=0",
    "DECOMPOSITION_VALIDATION=A36_CANONICAL_COLLAPSE_PLUS_A21",
    "VALID_DECOMPOSITION=PROJECTION_ADMITTED FORGED_DECOMPOSITION=ZERO",
    "DERIVED_START_PROJECTIONS=A46_FULL_TRAVERSAL",
    "DECOMPOSITION_WITNESS_SOURCE=CONSTRUCTION_TIME_RESIDUAL",
    "RELATIVE_POLE_PROJECTION=BOOTSTRAP_POLE_READ_NOT_REUSED",
    "A21_RUNTIME=SOURCE_IDENTICAL INDEPENDENT_MEMORIES=2",
    "NEXT_BOUNDARY=A48_DECOMPOSITION_WITNESS_SOURCE",
    "GLOBAL_E2=OPEN GLOBAL_E3=OPEN FULL_SELF_HOSTED=NOT_CLAIMED PRODUCTION_UNCHANGED",
  ].join(" "));
}
main();
