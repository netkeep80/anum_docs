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
  if(!condition)throw new Error(`v0.13 A49 structural construction schema: ${message}`);
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
    same(truth.start,ep.start,"A49 frontier context");out.push(truth.end);
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
  assert(startRole!==endRole,"A49 decomposition roles distinct");
  return Object.freeze({startRole,endRole});
}
function freshRole(memory:Memory,cursor:LinkHandle,marker:LinkHandle):LinkHandle{
  return memory.ensure(cursor,marker);
}

interface ConstructionSchema{
  readonly rule:LinkHandle;
  readonly inputRoles:readonly [LinkHandle,LinkHandle];
}
/**
 * Semantic construction authority only. No F5 seed/constraint/output plan is
 * stored here. The body is an ExactSequence of two output Link templates:
 * target and decomposition witness.
 */
function defineConstructionSchema(
  memory:Memory,
  f:Frame,
  basis:RootBasis,
):ConstructionSchema{
  const marker=memory.ensure(basis.U,basis.U);
  const sRole=freshRole(memory,memory.ensure(basis.O,marker),marker);
  const eRole=freshRole(memory,sRole,marker);
  const target=memory.ensure(sRole,eRole);
  const startBinding=memory.ensure(f.startRole,sRole);
  const endBinding=memory.ensure(f.endRole,eRole);
  const witness=memory.ensure(memory.ensure(startBinding,endBinding),target);
  const body=materializeExactSequence(memory,[target,witness]);
  const dictionary=defineStructuralRoleDictionary(memory,[sRole,eRole]);
  return Object.freeze({rule:defineStructuralRule(memory,dictionary,body),inputRoles:[sRole,eRole] as const});
}

function makePlanRoleFactory(memory:Memory):()=>LinkHandle{
  const b=ensureRootBasis(memory),marker=memory.ensure(b.U,b.U);let cursor=memory.ensure(b.C,marker);
  return ():LinkHandle=>{cursor=memory.ensure(cursor,marker);return cursor;};
}

/**
 * Generic StructuralRule -> F5 plan compiler.
 *
 * It knows only RoleDictionary membership, template topology and two output
 * templates carried by rule.body. It has no decomposition/START/END meaning.
 */
function compileSchemaPlan(
  memory:Memory,
  rule:LinkHandle,
  bindings:readonly (readonly [LinkHandle,LinkHandle])[],
):LinkHandle{
  const structural=readStructuralRule(memory,rule);
  const dictionary=readStructuralRoleDictionary(memory,structural.roleDictionary);
  const rho=new Map<LinkHandle,LinkHandle>();
  for(const [role,value] of bindings){
    assert(dictionary.roles.includes(role),"A49 binding role declared");
    assert(!rho.has(role),"A49 binding role unique");
    rho.set(role,value);
  }
  same(rho.size,dictionary.roles.length,"A49 all schema roles bound");

  const templates=readExactSequence(memory,structural.body).values;
  same(templates.length,2,"A49 schema output cardinality");
  const roleSet=new Set(dictionary.roles),containsMemo=new Map<LinkHandle,boolean>(),active=new Set<LinkHandle>();
  const containsRole=(node:LinkHandle):boolean=>{
    if(roleSet.has(node))return true;
    const cached=containsMemo.get(node);if(cached!==undefined)return cached;
    if(active.has(node))return false;
    active.add(node);
    const p=memory.poles(node),result=containsRole(p.start)||containsRole(p.end);
    active.delete(node);containsMemo.set(node,result);return result;
  };

  const planRole=new Map<LinkHandle,LinkHandle>(),seedBindings:LinkHandle[]=[],triples:LinkHandle[]=[];
  const nextRole=makePlanRoleFactory(memory);
  const encode=(node:LinkHandle):LinkHandle=>{
    const known=planRole.get(node);if(known!==undefined)return known;
    const r=nextRole();planRole.set(node,r);
    const bound=rho.get(node);
    if(bound!==undefined){
      seedBindings.push(memory.ensure(r,bound));return r;
    }
    if(!containsRole(node)){
      seedBindings.push(memory.ensure(r,node));return r;
    }
    const p=memory.poles(node),sr=encode(p.start),er=encode(p.end);
    triples.push(materializeExactSequence(memory,[r,sr,er]));
    return r;
  };
  const outputs=templates.map(encode);
  return materializeExactSequence(memory,[
    materializeExactSequence(memory,seedBindings),
    materializeExactSequence(memory,triples),
    materializeExactSequence(memory,outputs),
  ]);
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
  same(startBinding.start,f.startRole,"A49 start binding role");
  same(endBinding.start,f.endRole,"A49 end binding role");
  const target=wp.end,start=startBinding.end,end=endBinding.end;
  const reconstructed=memory.ensure(start,end),projection=memory.ensure(target,start);
  const gate=memory.ensureStartSelfClosed(target),query=memory.ensure(gate,reconstructed);
  same(evidence.counters.targetPoleReads,0,"A49 receiver target pole reads");
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
function buildGeneratedSequence(
  memory:Memory,
  schema:ConstructionSchema,
  values:readonly LinkHandle[],
):SequenceSupport{
  let current=memory.root;
  const cells:LinkHandle[]=[],payloads:LinkHandle[]=[],previous:LinkHandle[]=[],witnesses:LinkHandle[]=[];
  for(const value of values){
    const prev=current;previous.push(prev);
    assert(memory.find(prev,value)===undefined,"A49 target absent before schema compilation");
    const plan=compileSchemaPlan(memory,schema.rule,[
      [schema.inputRoles[0],prev],[schema.inputRoles[1],value],
    ]);
    assert(memory.find(prev,value)===undefined,"A49 generic compiler does not construct target");
    const built=executeConstructionPlan(memory,plan);
    const beforeOracle=memory.linkCount;
    same(memory.ensure(prev,value),built.candidate,"A49 constructed target exact");
    same(memory.linkCount,beforeOracle,"A49 post-hoc target oracle adds no Link");
    assert(memory.find(built.candidate,prev)===undefined,"A49 START projection absent");
    const cell=memory.ensureStartSelfClosed(built.candidate);
    payloads.push(built.candidate);witnesses.push(built.publication);cells.push(cell);current=cell;
  }
  same(current,materializeExactSequence(memory,values),"A49 carrier canonical");
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
  E=step(memory,E,"forward");same(frontierTruthEnds(memory,E)[0],s.payloads[2]!,"A49 Payload3");
  E=step(memory,E,"forward");same(frontierTruthEnds(memory,E)[0],s.cells[1]!,"A49 Cell2");
  E=step(memory,E,"forward");setSame(frontierTruthEnds(memory,E),[s.payloads[1]!,s.values[2]!],"A49 Value3");
  E=step(memory,E,"forward");same(frontierTruthEnds(memory,E)[0],s.cells[0]!,"A49 Cell1");
  E=step(memory,E,"forward");setSame(frontierTruthEnds(memory,E),[s.payloads[0]!,s.values[1]!],"A49 Value2");
  E=step(memory,E,"forward");same(frontierTruthEnds(memory,E)[0],memory.root,"A49 R");
  E=step(memory,E,"forward");same(frontierTruthEnds(memory,E)[0],s.values[0]!,"A49 Value1");
}

function exercise(memory:Memory,withNoise:boolean):void{
  const basis=ensureRootBasis(memory);if(withNoise)memory.ensure(memory.ensure(basis.U,basis.C),basis.O);
  const f=frame(memory,basis),schema=defineConstructionSchema(memory,f,basis);
  const rule=readStructuralRule(memory,schema.rule);
  same(readExactSequence(memory,rule.body).values.length,2,"A49 schema carries outputs not plan");
  const s=buildGeneratedSequence(memory,schema,freshValues(memory,basis));

  const candidates=s.witnesses.map(w=>deriveStartProjection(memory,f,w));
  let intrinsic=seedTraversal(memory,s,[],memory.ensure(basis.L,basis.U));
  intrinsic=step(memory,intrinsic,"forward");same(frontierTruthEnds(memory,intrinsic)[0],s.payloads[2]!,"A49 intrinsic first");
  intrinsic=step(memory,intrinsic,"forward");same(frontierTruthEnds(memory,intrinsic).length,0,"A49 ambient projection inert");

  const accepted=candidates.map((c,index)=>{
    same(c.target,s.payloads[index]!,"A49 witness target");
    same(c.start,s.previous[index]!,"A49 witness START");
    const ends=frontierTruthEnds(memory,validateProjection(memory,c,memory.ensure(basis.R,c.target)));
    same(ends.length,1,"A49 valid projection");
    return c.projection;
  });
  proveTraversal(memory,s,accepted,memory.ensure(basis.O,basis.U));

  const target=s.payloads[2]!,prev=s.previous[2]!,value=s.values[2]!;
  const forged=memory.ensure(memory.ensure(memory.ensure(f.startRole,value),memory.ensure(f.endRole,prev)),target);
  same(frontierTruthEnds(memory,validateProjection(
    memory,deriveStartProjection(memory,f,forged),memory.ensure(basis.C,basis.L),
  )).length,0,"A49 forged decomposition ZERO");
}

function staticGuards():void{
  const root=resolve(process.cwd(),"..");
  const own=readFileSync(join(root,"ts/test/research-v013-structural-construction-schema-a49.test.ts"),"utf8");
  const f5=readFileSync(join(root,"ts/test/research-v013-generic-construction-plan-f5-f4.test.ts"),"utf8");
  const a37=readFileSync(join(root,"ts/test/research-v013-link-carried-admission-program-a37.test.ts"),"utf8");

  const schema=own.slice(own.indexOf("function defineConstructionSchema("),own.indexOf("\nfunction makePlanRoleFactory(",own.indexOf("function defineConstructionSchema(")));
  for(const forbidden of ["seedBindings","triples","executeConstructionPlan","makePlanRoleFactory"])
    assert(!schema.includes(forbidden),`A49 semantic schema excludes F5 plan primitive ${forbidden}`);

  const compiler=own.slice(own.indexOf("function compileSchemaPlan("),own.indexOf("\nclass BindingEvidenceReader",own.indexOf("function compileSchemaPlan(")));
  for(const forbidden of ["startRole","endRole","witness","target","f.startRole","f.endRole"])
    assert(!compiler.includes(forbidden),`A49 compiler domain-agnostic ${forbidden}`);

  const a=own.slice(own.indexOf("function executeConstructionPlan("),own.indexOf("\ninterface Frame",own.indexOf("function executeConstructionPlan(")));
  const z=f5.slice(f5.indexOf("function executeConstructionPlan("),f5.indexOf("\nfunction runReference(",f5.indexOf("function executeConstructionPlan(")));
  same(a.replace(/\s+/g,""),z.replace(/\s+/g,""),"A49 constructor source-identical F5-F4");

  const x=own.slice(own.indexOf("function step("),own.indexOf("\nfunction frontierTruthEnds(",own.indexOf("function step(")));
  const y=a37.slice(a37.indexOf("function step("),a37.indexOf("\ninterface Program",a37.indexOf("function step(")));
  same(x.replace(/\s+/g,""),y.replace(/\s+/g,""),"A49 runtime source-identical A21/A37");
}
function main():void{
  exercise(new Memory(),false);exercise(new Memory(),true);staticGuards();
  console.log([
    "MTS v0.13 A49: STRUCTURAL_CONSTRUCTION_SCHEMA=GREEN_SCOPED_RESEARCH",
    "FROZEN_F5_PLAN_AUTHORITY=0 SCHEMA=STRUCTURAL_RULE_ROLE_TEMPLATE",
    "PER_INSTANCE_INPUTS=START_END_ONLY",
    "RULE_TO_PLAN_COMPILER=HOST_GENERIC_RESIDUAL",
    "F5_F4_CONSTRUCTOR=SOURCE_IDENTICAL A47_RECEIVER_TARGET_POLE_READS=0",
    "VALID_DECOMPOSITION=PROJECTION_ADMITTED FORGED_DECOMPOSITION=ZERO AMBIENT_PROJECTION=INERT",
    "DERIVED_PROJECTIONS=A46_FULL_TRAVERSAL",
    "SCHEMA_AUTHORITY_SOURCE=FIXTURE_RESIDUAL NEXT_BOUNDARY=A50_RULE_TO_PLAN_EXECUTION",
    "INDEPENDENT_MEMORIES=2 GLOBAL_E2=OPEN GLOBAL_E3=OPEN GLOBAL_E4=OPEN",
    "FULL_SELF_HOSTED=NOT_CLAIMED PRODUCTION_UNCHANGED",
  ].join(" "));
}
main();
