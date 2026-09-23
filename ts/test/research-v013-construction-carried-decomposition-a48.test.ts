import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { materializeExactSequence } from "../src/exact-sequence.js";
import { readExactSequence } from "../src/exact-sequence.js";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
  type LinkPoles,
  type ReadMemory,
  type RootBasis,
} from "../src/memory.js";

function assert(condition:unknown,message:string):asserts condition{
  if(!condition)throw new Error(`v0.13 A48 construction-carried decomposition: ${message}`);
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
    same(truth.start,ep.start,"A48 frontier context");out.push(truth.end);
  }
  return Object.freeze(out);
}

interface PlanExecution{
  readonly candidate:LinkHandle;readonly publication:LinkHandle;
  readonly ordinary:number;readonly startSelf:number;readonly endSelf:number;readonly fullSelf:number;
}
/** Source-identical generic F5-F4 construction executor. */
function executeConstructionPlan(memory:Memory,plan:LinkHandle):PlanExecution{
  const parts=readExactSequence(memory,plan).values;
  same(parts.length,3,"plan arity");
  const [seedSequence,constraintSequence,outputSequence]=parts;
  assert(seedSequence!==undefined&&constraintSequence!==undefined&&outputSequence!==undefined,"plan complete");
  const values=new Map<LinkHandle,LinkHandle>();
  for(const binding of readExactSequence(memory,seedSequence).values){
    const p=memory.poles(binding);
    assert(!values.has(p.start),"seed role unique");
    values.set(p.start,p.end);
  }
  let ordinary=0,startSelf=0,endSelf=0,fullSelf=0;
  for(const encoded of readExactSequence(memory,constraintSequence).values){
    const q=readExactSequence(memory,encoded).values;
    same(q.length,3,"constraint arity");
    const [targetRole,startRole,endRole]=q;
    assert(targetRole!==undefined&&startRole!==undefined&&endRole!==undefined,"constraint complete");
    let value:LinkHandle;
    if(targetRole===startRole&&targetRole===endRole){
      value=memory.ensureRoot(); fullSelf+=1;
    }else if(targetRole===startRole){
      const end=values.get(endRole); assert(end!==undefined,"start-self end bound");
      value=memory.ensureStartSelfClosed(end); startSelf+=1;
    }else if(targetRole===endRole){
      const start=values.get(startRole); assert(start!==undefined,"end-self start bound");
      value=memory.ensureEndSelfClosed(start); endSelf+=1;
    }else{
      const start=values.get(startRole),end=values.get(endRole);
      assert(start!==undefined&&end!==undefined,"ordinary poles bound");
      value=memory.ensure(start,end); ordinary+=1;
    }
    const previous=values.get(targetRole);
    if(previous!==undefined)same(previous,value,"target role stable");
    else values.set(targetRole,value);
  }
  const outputs=readExactSequence(memory,outputSequence).values;
  same(outputs.length,2,"output arity");
  const candidate=outputs[0]===undefined?undefined:values.get(outputs[0]);
  const publication=outputs[1]===undefined?undefined:values.get(outputs[1]);
  assert(candidate!==undefined&&publication!==undefined,"outputs constructed");
  return Object.freeze({candidate,publication,ordinary,startSelf,endSelf,fullSelf});
}

interface Frame{readonly startRole:LinkHandle;readonly endRole:LinkHandle;}
function frame(memory:Memory,basis:RootBasis):Frame{
  const whole=memory.ensure(basis.L,basis.L);
  const startRole=memory.ensureStartSelfClosed(whole);
  const endRole=memory.ensureEndSelfClosed(whole);
  assert(startRole!==endRole,"A48 decomposition roles distinct");
  return Object.freeze({startRole,endRole});
}
function makeRoles(memory:Memory,count:number):readonly LinkHandle[]{
  const b=ensureRootBasis(memory),marker=memory.ensure(b.U,b.U);let current=memory.ensure(b.L,marker);
  const roles:LinkHandle[]=[];for(let i=0;i<count;i+=1){current=memory.ensure(current,marker);roles.push(current);}
  same(new Set(roles).size,count,"A48 construction roles distinct");return Object.freeze(roles);
}

interface ConstructionTemplate{
  readonly startSeed:LinkHandle;readonly endSeed:LinkHandle;readonly plan:LinkHandle;
}
/**
 * One Link-carried generic creation authority. It is authored once and encodes
 * target plus ordered decomposition evidence; target-specific callers provide
 * only start/end operands.
 */
function defineConstructionTemplate(
  memory:Memory,
  f:Frame,
  basis:RootBasis,
):ConstructionTemplate{
  const startSeed=memory.ensure(basis.U,basis.L);
  const endSeed=memory.ensure(startSeed,basis.C);
  const roles=makeRoles(memory,9);let i=0;const role=():LinkHandle=>roles[i++]!;
  const rStart=role(),rEnd=role(),rStartRole=role(),rEndRole=role();
  const rTarget=role(),rStartBinding=role(),rEndBinding=role(),rPair=role(),rWitness=role();
  const seeds=materializeExactSequence(memory,[
    memory.ensure(rStart,startSeed),memory.ensure(rEnd,endSeed),
    memory.ensure(rStartRole,f.startRole),memory.ensure(rEndRole,f.endRole),
  ]);
  const constraints=materializeExactSequence(memory,[
    materializeExactSequence(memory,[rTarget,rStart,rEnd]),
    materializeExactSequence(memory,[rStartBinding,rStartRole,rStart]),
    materializeExactSequence(memory,[rEndBinding,rEndRole,rEnd]),
    materializeExactSequence(memory,[rPair,rStartBinding,rEndBinding]),
    materializeExactSequence(memory,[rWitness,rPair,rTarget]),
  ]);
  const outputs=materializeExactSequence(memory,[rTarget,rWitness]);
  const plan=materializeExactSequence(memory,[seeds,constraints,outputs]);
  return Object.freeze({startSeed,endSeed,plan});
}

/** Domain-agnostic topology substitution of only two input seed values. */
function instantiateConstructionPlan(
  memory:Memory,
  template:ConstructionTemplate,
  start:LinkHandle,
  end:LinkHandle,
):LinkHandle{
  const mapping=new Map<LinkHandle,LinkHandle>([
    [memory.root,memory.root],[template.startSeed,start],[template.endSeed,end],
  ]);
  const visiting=new Set<LinkHandle>();
  const clone=(source:LinkHandle):LinkHandle=>{
    const known=mapping.get(source);if(known!==undefined)return known;
    assert(!visiting.has(source),"A48 unsupported non-self cycle");
    const p=memory.poles(source);let value:LinkHandle;
    if(p.start===source&&p.end===source)value=memory.ensureRoot();
    else if(p.start===source)value=memory.ensureStartSelfClosed(clone(p.end));
    else if(p.end===source)value=memory.ensureEndSelfClosed(clone(p.start));
    else{visiting.add(source);value=memory.ensure(clone(p.start),clone(p.end));visiting.delete(source);}
    mapping.set(source,value);return value;
  };
  return clone(template.plan);
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
}
function deriveStartProjection(memory:Memory,f:Frame,witness:LinkHandle):ProjectionCandidate{
  const evidence=new BindingEvidenceReader(memory);
  const wp=evidence.readWitness(witness),pair=evidence.readPair(wp.start);
  const startBinding=evidence.readBinding(pair.start),endBinding=evidence.readBinding(pair.end);
  same(startBinding.start,f.startRole,"A48 start binding role");
  same(endBinding.start,f.endRole,"A48 end binding role");
  const target=wp.end,start=startBinding.end,end=endBinding.end;
  const reconstructed=memory.ensure(start,end);
  const projection=memory.ensure(target,start);
  const gate=memory.ensureStartSelfClosed(target),query=memory.ensure(gate,reconstructed);
  same(evidence.counters.targetPoleReads,0,"A48 receiver target pole reads");
  return Object.freeze({target,start,end,projection,gate,query});
}
function validateProjection(memory:Memory,c:ProjectionCandidate,parent:LinkHandle):LinkHandle{
  const authority=freezeAuthority(memory,[memory.ensure(c.gate,c.projection)]);
  const K=memory.ensure(parent,authority),truth=memory.ensure(K,c.query);
  const occurrence=memory.ensure(memory.root,truth);
  return step(memory,memory.ensure(K,freezeFrontier(memory,[occurrence])),"forward");
}

interface SequenceSupport{
  readonly final:LinkHandle;readonly cells:readonly LinkHandle[];
  readonly payloads:readonly LinkHandle[];readonly previous:readonly LinkHandle[];
  readonly values:readonly LinkHandle[];readonly witnesses:readonly LinkHandle[];
}
function buildGeneratedSequence(
  memory:Memory,
  template:ConstructionTemplate,
  values:readonly LinkHandle[],
):SequenceSupport{
  let current=memory.root;
  const cells:LinkHandle[]=[],payloads:LinkHandle[]=[],previous:LinkHandle[]=[],witnesses:LinkHandle[]=[];
  for(const value of values){
    const prev=current;previous.push(prev);
    assert(memory.find(prev,value)===undefined,"A48 target absent before generic plan execution");
    const plan=instantiateConstructionPlan(memory,template,prev,value);
    assert(memory.find(prev,value)===undefined,"A48 plan instantiation does not create target");
    const built=executeConstructionPlan(memory,plan);
    const beforeOracle=memory.linkCount;
    same(memory.ensure(prev,value),built.candidate,"A48 constructed target exact");
    same(memory.linkCount,beforeOracle,"A48 post-hoc target oracle adds no Link");
    assert(memory.find(built.candidate,prev)===undefined,"A48 START projection absent after witness construction");
    const cell=memory.ensureStartSelfClosed(built.candidate);
    payloads.push(built.candidate);witnesses.push(built.publication);cells.push(cell);current=cell;
  }
  same(current,materializeExactSequence(memory,values),"A48 generated carrier canonical ExactSequence");
  return Object.freeze({final:current,cells:Object.freeze(cells),payloads:Object.freeze(payloads),
    previous:Object.freeze(previous),values:Object.freeze([...values]),witnesses:Object.freeze(witnesses)});
}
function freshValues(memory:Memory,basis:RootBasis):readonly LinkHandle[]{
  let cursor=memory.ensure(basis.C,basis.U);const out:LinkHandle[]=[];
  for(let i=0;i<3;i+=1){cursor=memory.ensure(cursor,basis.L);out.push(cursor);}
  return Object.freeze(out);
}
function seedTraversal(memory:Memory,s:SequenceSupport,projections:readonly LinkHandle[],parent:LinkHandle):LinkHandle{
  const authority=freezeAuthority(memory,[...s.cells,...s.payloads,...projections]);
  const K=memory.ensure(parent,authority),truth=memory.ensure(K,s.final);
  return memory.ensure(K,freezeFrontier(memory,[memory.ensure(memory.root,truth)]));
}
function proveTraversal(memory:Memory,s:SequenceSupport,projections:readonly LinkHandle[],parent:LinkHandle):void{
  let E=seedTraversal(memory,s,projections,parent);
  E=step(memory,E,"forward");same(frontierTruthEnds(memory,E)[0],s.payloads[2]!,"A48 Payload3");
  E=step(memory,E,"forward");same(frontierTruthEnds(memory,E)[0],s.cells[1]!,"A48 Cell2");
  E=step(memory,E,"forward");setSame(frontierTruthEnds(memory,E),[s.payloads[1]!,s.values[2]!],"A48 Value3");
  E=step(memory,E,"forward");same(frontierTruthEnds(memory,E)[0],s.cells[0]!,"A48 Cell1");
  E=step(memory,E,"forward");setSame(frontierTruthEnds(memory,E),[s.payloads[0]!,s.values[1]!],"A48 Value2");
  E=step(memory,E,"forward");same(frontierTruthEnds(memory,E)[0],memory.root,"A48 R");
  E=step(memory,E,"forward");same(frontierTruthEnds(memory,E)[0],s.values[0]!,"A48 Value1");
}

function exercise(memory:Memory,withNoise:boolean):void{
  const basis=ensureRootBasis(memory);if(withNoise)memory.ensure(memory.ensure(basis.U,basis.O),basis.C);
  const f=frame(memory,basis),template=defineConstructionTemplate(memory,f,basis);
  const s=buildGeneratedSequence(memory,template,freshValues(memory,basis));

  const candidates=s.witnesses.map(w=>deriveStartProjection(memory,f,w));
  let intrinsic=seedTraversal(memory,s,[],memory.ensure(basis.L,basis.U));
  intrinsic=step(memory,intrinsic,"forward");same(frontierTruthEnds(memory,intrinsic)[0],s.payloads[2]!,"A48 intrinsic first");
  intrinsic=step(memory,intrinsic,"forward");same(frontierTruthEnds(memory,intrinsic).length,0,"A48 ambient projections inert");

  const accepted=candidates.map((c,index)=>{
    same(c.target,s.payloads[index]!,"A48 witness target");
    same(c.start,s.previous[index]!,"A48 witness START");
    const ends=frontierTruthEnds(memory,validateProjection(memory,c,memory.ensure(basis.R,c.target)));
    same(ends.length,1,"A48 valid decomposition projection");
    same(ends[0],c.projection,"A48 projection exact");
    return c.projection;
  });
  proveTraversal(memory,s,accepted,memory.ensure(basis.O,basis.U));

  const target=s.payloads[2]!,prev=s.previous[2]!,value=s.values[2]!;
  const forged=memory.ensure(
    memory.ensure(memory.ensure(f.startRole,value),memory.ensure(f.endRole,prev)),
    target,
  );
  const bad=deriveStartProjection(memory,f,forged);
  same(frontierTruthEnds(memory,validateProjection(memory,bad,memory.ensure(basis.C,basis.L))).length,0,
    "A48 forged decomposition ZERO");
}

function staticGuards():void{
  const root=resolve(process.cwd(),"..");
  const own=readFileSync(join(root,"ts/test/research-v013-construction-carried-decomposition-a48.test.ts"),"utf8");
  const f5=readFileSync(join(root,"ts/test/research-v013-generic-construction-plan-f5-f4.test.ts"),"utf8");
  const a37=readFileSync(join(root,"ts/test/research-v013-link-carried-admission-program-a37.test.ts"),"utf8");

  const perTarget=own.slice(own.indexOf("function buildGeneratedSequence("),own.indexOf("\nfunction freshValues(",own.indexOf("function buildGeneratedSequence(")));
  for(const forbidden of ["defineDecompositionWitness","memory.ensure(f.startRole","memory.ensure(f.endRole","startBinding=","endBinding="])
    assert(!perTarget.includes(forbidden),`A48 per-target path excludes witness authoring ${forbidden}`);

  const inst=own.slice(own.indexOf("function instantiateConstructionPlan("),own.indexOf("\nclass BindingEvidenceReader",own.indexOf("function instantiateConstructionPlan(")));
  for(const forbidden of ["startRole","endRole","witness","target","memory.find("])
    assert(!inst.includes(forbidden),`A48 plan instantiator domain-agnostic ${forbidden}`);

  const derive=own.slice(own.indexOf("function deriveStartProjection("),own.indexOf("\nfunction validateProjection(",own.indexOf("function deriveStartProjection(")));
  for(const forbidden of ["memory.poles(target","memory.poles(c.target","memory.find("])
    assert(!derive.includes(forbidden),`A48 receiver excludes target oracle ${forbidden}`);

  const a=own.slice(own.indexOf("function executeConstructionPlan("),own.indexOf("\ninterface Frame",own.indexOf("function executeConstructionPlan(")));
  const z=f5.slice(f5.indexOf("function executeConstructionPlan("),f5.indexOf("\nfunction runReference(",f5.indexOf("function executeConstructionPlan(")));
  same(a.replace(/\s+/g,""),z.replace(/\s+/g,""),"A48 constructor source-identical F5-F4");

  const x=own.slice(own.indexOf("function step("),own.indexOf("\nfunction frontierTruthEnds(",own.indexOf("function step(")));
  const y=a37.slice(a37.indexOf("function step("),a37.indexOf("\ninterface Program",a37.indexOf("function step(")));
  same(x.replace(/\s+/g,""),y.replace(/\s+/g,""),"A48 runtime source-identical A21/A37");
}
function main():void{
  exercise(new Memory(),false);exercise(new Memory(),true);staticGuards();
  console.log([
    "MTS v0.13 A48: CONSTRUCTION_CARRIED_DECOMPOSITION=GREEN_SCOPED_RESEARCH",
    "CONSTRUCTION_TEMPLATE_COUNT=1 PER_TARGET_WITNESS_AUTHORING=0",
    "TARGET_AND_WITNESS=F5_F4_LINK_CARRIED_PLAN",
    "PLAN_INSTANTIATOR=GENERIC_TOPOLOGY_SUBSTITUTION",
    "PREAUTHORED_START_PROJECTION=0 RECEIVER_TARGET_POLE_READS=0",
    "VALID_DECOMPOSITION=PROJECTION_ADMITTED FORGED_DECOMPOSITION=ZERO AMBIENT_PROJECTION=INERT",
    "DERIVED_PROJECTIONS=A46_FULL_TRAVERSAL",
    "CONSTRUCTION_TEMPLATE_AUTHORING=BOOTSTRAP_RESIDUAL GENERIC_CLONE=HOST_RESIDUAL",
    "A21_RUNTIME=SOURCE_IDENTICAL INDEPENDENT_MEMORIES=2",
    "NEXT_BOUNDARY=A49_CONSTRUCTION_TEMPLATE_SOURCE",
    "GLOBAL_E2=OPEN GLOBAL_E3=OPEN GLOBAL_E4=OPEN FULL_SELF_HOSTED=NOT_CLAIMED PRODUCTION_UNCHANGED",
  ].join(" "));
}
main();
