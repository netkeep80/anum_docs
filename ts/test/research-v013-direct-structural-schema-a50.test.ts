import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { materializeExactSequence, readExactSequence } from "../src/exact-sequence.js";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
  type LinkPoles,
  type ReadMemory,
  type RootBasis,
} from "../src/memory.js";
import {
  defineStructuralRoleDictionary,
  defineStructuralRule,
  readStructuralRoleDictionary,
  readStructuralRule,
} from "../src/structural-rule.js";

function assert(condition:unknown,message:string):asserts condition{
  if(!condition)throw new Error(`v0.13 A50 direct structural schema: ${message}`);
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
    same(truth.start,ep.start,"A50 frontier context");out.push(truth.end);
  }
  return Object.freeze(out);
}

interface Frame{readonly startRole:LinkHandle;readonly endRole:LinkHandle;}
function frame(memory:Memory,basis:RootBasis):Frame{
  const whole=memory.ensure(basis.L,basis.L);
  const startRole=memory.ensureStartSelfClosed(whole);
  const endRole=memory.ensureEndSelfClosed(whole);
  assert(startRole!==endRole,"A50 decomposition roles distinct");
  return Object.freeze({startRole,endRole});
}
interface ConstructionSchema{
  readonly rule:LinkHandle;
  readonly inputRoles:readonly [LinkHandle,LinkHandle];
}
function defineConstructionSchema(memory:Memory,f:Frame,basis:RootBasis):ConstructionSchema{
  const marker=memory.ensure(basis.U,basis.U);
  const sRole=memory.ensure(memory.ensure(basis.O,marker),marker);
  const eRole=memory.ensure(sRole,marker);
  const target=memory.ensure(sRole,eRole);
  const startBinding=memory.ensure(f.startRole,sRole),endBinding=memory.ensure(f.endRole,eRole);
  const witness=memory.ensure(memory.ensure(startBinding,endBinding),target);
  const dictionary=defineStructuralRoleDictionary(memory,[sRole,eRole]);
  const body=materializeExactSequence(memory,[target,witness]);
  return Object.freeze({
    rule:defineStructuralRule(memory,dictionary,body),
    inputRoles:[sRole,eRole] as const,
  });
}

interface DirectInstantiation{
  readonly outputs:readonly LinkHandle[];
  readonly explicitSeedCount:number;
  readonly mappedSeedCount:number;
  readonly ordinary:number;readonly startSelf:number;readonly endSelf:number;readonly fullSelf:number;
}
/**
 * Direct StructuralRule template execution.
 *
 * There is no intermediate F5 plan. Role bindings are the generic seed mapping
 * and the Rule body is the selected template-root carrier.
 */
function instantiateStructuralSchema(
  memory:Memory,
  rule:LinkHandle,
  bindings:readonly (readonly [LinkHandle,LinkHandle])[],
):DirectInstantiation{
  const structural=readStructuralRule(memory,rule);
  const dictionary=readStructuralRoleDictionary(memory,structural.roleDictionary);
  const mapping=new Map<LinkHandle,LinkHandle>();
  for(const [role,value] of bindings){
    assert(dictionary.roles.includes(role),"A50 binding role declared");
    const previous=mapping.get(role);
    if(previous!==undefined)same(previous,value,"A50 seed mapping consistent");
    else mapping.set(role,value);
  }
  for(const role of dictionary.roles)assert(mapping.has(role),"A50 all required schema roles mapped");
  same(mapping.size,dictionary.roles.length,"A50 no undeclared seed roles");
  const explicitSeedCount=mapping.size;

  let ordinary=0,startSelf=0,endSelf=0,fullSelf=0;
  const visiting=new Set<LinkHandle>();
  const clone=(source:LinkHandle):LinkHandle=>{
    const known=mapping.get(source);
    if(known!==undefined)return known;
    assert(!visiting.has(source),"unsupported non-self cycle");
    const p=memory.poles(source);
    let value:LinkHandle;
    if(p.start===source&&p.end===source){
      value=memory.ensureRoot(); fullSelf+=1;
    }else if(p.start===source){
      value=memory.ensureStartSelfClosed(clone(p.end)); startSelf+=1;
    }else if(p.end===source){
      value=memory.ensureEndSelfClosed(clone(p.start)); endSelf+=1;
    }else{
      visiting.add(source);
      const start=clone(p.start),end=clone(p.end);
      visiting.delete(source);
      value=memory.ensure(start,end); ordinary+=1;
    }
    mapping.set(source,value);
    return value;
  };

  const outputs=readExactSequence(memory,structural.body).values.map(clone);
  return Object.freeze({
    outputs:Object.freeze(outputs),explicitSeedCount,mappedSeedCount:mapping.size,
    ordinary,startSelf,endSelf,fullSelf,
  });
}

class BindingEvidenceReader{
  readonly counters={targetPoleReads:0};
  constructor(private readonly source:ReadMemory){}
  poles(link:LinkHandle):LinkPoles{return this.source.poles(link);}
}
interface ProjectionCandidate{
  readonly target:LinkHandle;readonly start:LinkHandle;readonly end:LinkHandle;
  readonly projection:LinkHandle;readonly gate:LinkHandle;readonly query:LinkHandle;
}
function deriveStartProjection(memory:Memory,f:Frame,witness:LinkHandle):ProjectionCandidate{
  const evidence=new BindingEvidenceReader(memory);
  const wp=evidence.poles(witness),pair=evidence.poles(wp.start);
  const startBinding=evidence.poles(pair.start),endBinding=evidence.poles(pair.end);
  same(startBinding.start,f.startRole,"A50 start binding role");
  same(endBinding.start,f.endRole,"A50 end binding role");
  const target=wp.end,start=startBinding.end,end=endBinding.end;
  const reconstructed=memory.ensure(start,end),projection=memory.ensure(target,start);
  const gate=memory.ensureStartSelfClosed(target),query=memory.ensure(gate,reconstructed);
  same(evidence.counters.targetPoleReads,0,"A50 receiver target pole reads");
  return Object.freeze({target,start,end,projection,gate,query});
}
function validateProjection(memory:Memory,c:ProjectionCandidate,parent:LinkHandle):LinkHandle{
  const authority=freezeAuthority(memory,[memory.ensure(c.gate,c.projection)]);
  const K=memory.ensure(parent,authority),truth=memory.ensure(K,c.query);
  return step(memory,memory.ensure(K,freezeFrontier(memory,[memory.ensure(memory.root,truth)])),"forward");
}

interface SequenceSupport{
  readonly final:LinkHandle;readonly cells:readonly LinkHandle[];readonly payloads:readonly LinkHandle[];
  readonly previous:readonly LinkHandle[];readonly values:readonly LinkHandle[];readonly witnesses:readonly LinkHandle[];
}
function buildGeneratedSequence(memory:Memory,schema:ConstructionSchema,values:readonly LinkHandle[]):SequenceSupport{
  let current=memory.root;
  const cells:LinkHandle[]=[],payloads:LinkHandle[]=[],previous:LinkHandle[]=[],witnesses:LinkHandle[]=[];
  for(const value of values){
    const prev=current;previous.push(prev);
    assert(memory.find(prev,value)===undefined,"A50 target absent before direct execution");
    const built=instantiateStructuralSchema(memory,schema.rule,[
      [schema.inputRoles[0],prev],[schema.inputRoles[1],value],
    ]);
    same(built.outputs.length,2,"A50 schema output cardinality");
    const target=built.outputs[0]!,witness=built.outputs[1]!;
    const beforeOracle=memory.linkCount;
    same(memory.ensure(prev,value),target,"A50 direct target exact");
    const expectedWitness=memory.ensure(
      memory.ensure(memory.ensure(frame(memory,ensureRootBasis(memory)).startRole,prev),
        memory.ensure(frame(memory,ensureRootBasis(memory)).endRole,value)),
      target,
    );
    same(expectedWitness,witness,"A50 direct witness exact");
    same(memory.linkCount,beforeOracle,"A50 post-hoc semantic oracle adds zero Links");
    assert(memory.find(target,prev)===undefined,"A50 START projection absent");
    const cell=memory.ensureStartSelfClosed(target);
    payloads.push(target);witnesses.push(witness);cells.push(cell);current=cell;
  }
  same(current,materializeExactSequence(memory,values),"A50 carrier canonical");
  return Object.freeze({final:current,cells:Object.freeze(cells),payloads:Object.freeze(payloads),
    previous:Object.freeze(previous),values:Object.freeze([...values]),witnesses:Object.freeze(witnesses)});
}
function freshValues(memory:Memory,basis:RootBasis):readonly LinkHandle[]{
  let cursor=memory.ensure(basis.C,basis.O);const out:LinkHandle[]=[];
  for(let i=0;i<3;i+=1){cursor=memory.ensure(cursor,basis.L);out.push(cursor);}
  return Object.freeze(out);
}
function seedTraversal(memory:Memory,s:SequenceSupport,projections:readonly LinkHandle[],parent:LinkHandle):LinkHandle{
  const K=memory.ensure(parent,freezeAuthority(memory,[...s.cells,...s.payloads,...projections]));
  return memory.ensure(K,freezeFrontier(memory,[memory.ensure(memory.root,memory.ensure(K,s.final))]));
}
function proveTraversal(memory:Memory,s:SequenceSupport,projections:readonly LinkHandle[],parent:LinkHandle):void{
  let E=seedTraversal(memory,s,projections,parent);
  E=step(memory,E,"forward");same(frontierTruthEnds(memory,E)[0],s.payloads[2]!,"A50 Payload3");
  E=step(memory,E,"forward");same(frontierTruthEnds(memory,E)[0],s.cells[1]!,"A50 Cell2");
  E=step(memory,E,"forward");setSame(frontierTruthEnds(memory,E),[s.payloads[1]!,s.values[2]!],"A50 Value3");
  E=step(memory,E,"forward");same(frontierTruthEnds(memory,E)[0],s.cells[0]!,"A50 Cell1");
  E=step(memory,E,"forward");setSame(frontierTruthEnds(memory,E),[s.payloads[0]!,s.values[1]!],"A50 Value2");
  E=step(memory,E,"forward");same(frontierTruthEnds(memory,E)[0],memory.root,"A50 R");
  E=step(memory,E,"forward");same(frontierTruthEnds(memory,E)[0],s.values[0]!,"A50 Value1");
}

function exercise(memory:Memory,withNoise:boolean):void{
  const basis=ensureRootBasis(memory);if(withNoise)memory.ensure(memory.ensure(basis.U,basis.C),basis.O);
  const f=frame(memory,basis),schema=defineConstructionSchema(memory,f,basis);
  const structural=readStructuralRule(memory,schema.rule);
  same(readExactSequence(memory,structural.body).values.length,2,"A50 schema remains A49 shape");
  const s=buildGeneratedSequence(memory,schema,freshValues(memory,basis));

  const candidates=s.witnesses.map(w=>deriveStartProjection(memory,f,w));
  let intrinsic=seedTraversal(memory,s,[],memory.ensure(basis.L,basis.U));
  intrinsic=step(memory,intrinsic,"forward");same(frontierTruthEnds(memory,intrinsic)[0],s.payloads[2]!,"A50 intrinsic first");
  intrinsic=step(memory,intrinsic,"forward");same(frontierTruthEnds(memory,intrinsic).length,0,"A50 ambient projection inert");

  const accepted=candidates.map((c,index)=>{
    same(c.target,s.payloads[index]!,"A50 witness target");
    same(c.start,s.previous[index]!,"A50 witness START");
    const ends=frontierTruthEnds(memory,validateProjection(memory,c,memory.ensure(basis.R,c.target)));
    same(ends.length,1,"A50 valid projection");
    return c.projection;
  });
  proveTraversal(memory,s,accepted,memory.ensure(basis.O,basis.U));

  const target=s.payloads[2]!,prev=s.previous[2]!,value=s.values[2]!;
  const forged=memory.ensure(memory.ensure(memory.ensure(f.startRole,value),memory.ensure(f.endRole,prev)),target);
  same(frontierTruthEnds(memory,validateProjection(
    memory,deriveStartProjection(memory,f,forged),memory.ensure(basis.C,basis.L),
  )).length,0,"A50 forged decomposition ZERO");
}

function staticGuards():void{
  const root=resolve(process.cwd(),"..");
  const own=readFileSync(join(root,"ts/test/research-v013-direct-structural-schema-a50.test.ts"),"utf8");
  const f5=readFileSync(join(root,"ts/test/research-v013-template-instantiation-f5-f5.test.ts"),"utf8");
  const a37=readFileSync(join(root,"ts/test/research-v013-link-carried-admission-program-a37.test.ts"),"utf8");

  const direct=own.slice(
    own.indexOf("function instantiateStructuralSchema("),
    own.indexOf("\nclass BindingEvidenceReader",own.indexOf("function instantiateStructuralSchema(")),
  );
  for(const forbidden of [
    "compileSchemaPlan","executeConstructionPlan","seedSequence","constraintSequence",
    "outputSequence","startRole","endRole","witness","target",
  ])assert(!direct.includes(forbidden),`A50 direct executor excludes compiler/domain primitive ${forbidden}`);

  const ownClone=direct.slice(direct.indexOf("  let ordinary=0"),direct.indexOf("\n  const outputs="));
  const f5Start=f5.indexOf("function instantiateTemplate(");
  const f5Clone=f5.slice(
    f5.indexOf("  let ordinary=0",f5Start),
    f5.indexOf("\n  if(fullAuthority)",f5Start),
  );
  same(ownClone.replace(/\s+/g,""),f5Clone.replace(/\s+/g,""),
    "A50 recursive clone law source-identical F5-F5");

  const x=own.slice(own.indexOf("function step("),own.indexOf("\nfunction frontierTruthEnds(",own.indexOf("function step(")));
  const y=a37.slice(a37.indexOf("function step("),a37.indexOf("\ninterface Program",a37.indexOf("function step(")));
  same(x.replace(/\s+/g,""),y.replace(/\s+/g,""),"A50 runtime source-identical A21/A37");
}
function main():void{
  exercise(new Memory(),false);exercise(new Memory(),true);staticGuards();
  console.log([
    "MTS v0.13 A50: DIRECT_STRUCTURAL_SCHEMA_EXECUTION=GREEN_SCOPED_RESEARCH",
    "STRUCTURAL_RULE_TO_F5_PLAN_COMPILER=0 INTERMEDIATE_F5_PLAN=0",
    "SCHEMA=A49_STRUCTURAL_RULE_UNCHANGED PER_INSTANCE_INPUTS=START_END_ONLY",
    "GENERIC_TEMPLATE_EXECUTION=F5_F5_CLONE_LAW_SOURCE_IDENTICAL",
    "A47_RECEIVER_TARGET_POLE_READS=0",
    "VALID_DECOMPOSITION=PROJECTION_ADMITTED FORGED_DECOMPOSITION=ZERO AMBIENT_PROJECTION=INERT",
    "DERIVED_PROJECTIONS=A46_FULL_TRAVERSAL",
    "GENERIC_RECURSIVE_TEMPLATE_INSTANTIATION=HOST_RESIDUAL",
    "SCHEMA_AUTHORITY_SOURCE=FIXTURE_RESIDUAL NEXT_BOUNDARY=A51_TEMPLATE_INSTANTIATION_SOURCE",
    "INDEPENDENT_MEMORIES=2 GLOBAL_E2=OPEN GLOBAL_E3=OPEN GLOBAL_E4=OPEN",
    "FULL_SELF_HOSTED=NOT_CLAIMED PRODUCTION_UNCHANGED",
  ].join(" "));
}
main();
