import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { materializeExactSequence, readExactSequence } from "../src/exact-sequence.js";
import { Memory, ensureRootBasis, type LinkHandle, type RootBasis } from "../src/memory.js";

function assert(condition:unknown,message:string):asserts condition{
  if(!condition)throw new Error(`v0.13 A40 producer schema: ${message}`);
}
function same<T>(actual:T,expected:T,message:string):void{
  assert(Object.is(actual,expected),`${message}: values differ`);
}
function expectThrows(run:()=>void,message:string):void{
  let threw=false;try{run();}catch{threw=true;}assert(threw,message);
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

/** Exact A21 executor. */
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
    same(truth.start,ep.start,"A40 frontier context");out.push(truth.end);
  }
  return Object.freeze(out);
}
function runToDepth(memory:Memory,E0:LinkHandle,depth:number):readonly LinkHandle[]{
  const out:LinkHandle[]=[];let e=E0;
  for(let i=0;i<depth;i+=1){e=step(memory,e,"forward");out.push(...frontierTruthEnds(memory,e));}
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
      const end=values.get(endRole);assert(end!==undefined,"start-self end bound");
      value=memory.ensureStartSelfClosed(end);startSelf+=1;
    }else if(targetRole===endRole){
      const start=values.get(startRole);assert(start!==undefined,"end-self start bound");
      value=memory.ensureEndSelfClosed(start);endSelf+=1;
    }else{
      const start=values.get(startRole),end=values.get(endRole);
      assert(start!==undefined&&end!==undefined,"ordinary poles bound");
      value=memory.ensure(start,end);ordinary+=1;
    }
    const previous=values.get(targetRole);
    if(previous!==undefined)same(previous,value,"target role stable");else values.set(targetRole,value);
  }
  const outputs=readExactSequence(memory,outputSequence).values;same(outputs.length,2,"output arity");
  const candidate=outputs[0]===undefined?undefined:values.get(outputs[0]);
  const publication=outputs[1]===undefined?undefined:values.get(outputs[1]);
  assert(candidate!==undefined&&publication!==undefined,"outputs constructed");
  return Object.freeze({candidate,publication,ordinary,startSelf,endSelf,fullSelf});
}

function makeRoles(memory:Memory,count:number):readonly LinkHandle[]{
  const b=ensureRootBasis(memory),marker=memory.ensure(b.U,b.U);let current=memory.ensure(b.L,marker);
  const roles:LinkHandle[]=[];for(let i=0;i<count;i+=1){current=memory.ensure(current,marker);roles.push(current);}
  same(new Set(roles).size,count,"A40 plan roles distinct");return Object.freeze(roles);
}
interface Candidate{readonly values:readonly LinkHandle[];readonly handle:LinkHandle;}
function candidate(memory:Memory,b:RootBasis,seed:LinkHandle):Candidate{
  let x=seed;const fresh=():LinkHandle=>{x=memory.ensure(x,b.C);return x;};
  const name=fresh(),fnStart=fresh(),fnEnd=fresh(),fn=memory.ensure(fnStart,fnEnd);
  const arg=fresh(),app=memory.ensure(fn,arg),r1=fresh(),r2=fresh();
  const c1=memory.ensure(app,r1),c2=memory.ensure(app,r2);
  const values=Object.freeze([name,fn,arg,app,r1,r2,c1,c2]);
  return Object.freeze({values,handle:materializeExactSequence(memory,values)});
}
function forge(memory:Memory,valid:Candidate,index:0|1|2):Candidate{
  const v=[...valid.values];
  if(index===0){const x=memory.ensure(v[2]!,v[1]!);v[3]=x;v[6]=memory.ensure(x,v[4]!);v[7]=memory.ensure(x,v[5]!);}
  else if(index===1)v[6]=memory.ensure(v[4]!,v[3]!);else v[7]=memory.ensure(v[5]!,v[3]!);
  const values=Object.freeze(v);return Object.freeze({values,handle:materializeExactSequence(memory,values)});
}
function defineRule(memory:Memory):LinkHandle{
  const b=ensureRootBasis(memory),roles:LinkHandle[]=[];let x=memory.ensure(b.O,b.U);
  for(let i=0;i<8;i+=1){x=memory.ensure(x,i%2===0?b.L:b.C);roles.push(x);}
  return materializeExactSequence(memory,[
    materializeExactSequence(memory,roles),
    materializeExactSequence(memory,[
      materializeExactSequence(memory,[roles[3]!,roles[1]!,roles[2]!]),
      materializeExactSequence(memory,[roles[6]!,roles[3]!,roles[4]!]),
      materializeExactSequence(memory,[roles[7]!,roles[3]!,roles[5]!]),
    ]),
  ]);
}

interface FrozenPlan{readonly plan:LinkHandle;readonly authority:LinkHandle;}
/** A39 recipe retained only to author one abstract ProducerSchema and post-hoc oracle. */
function authorReferencePlan(memory:Memory,rule:LinkHandle,proposed:Candidate):FrozenPlan{
  const b=ensureRootBasis(memory),v=proposed.values;
  const roles=makeRoles(memory,72);let n=0;const role=():LinkHandle=>roles[n++]!;
  const rRoot=role(),rO=role(),rL=role(),rRule=role();
  const rName=role(),rFn=role(),rArg=role(),rR1=role(),rR2=role();
  const seeds=[
    memory.ensure(rRoot,memory.root),memory.ensure(rO,b.O),memory.ensure(rL,b.L),memory.ensure(rRule,rule),
    memory.ensure(rName,v[0]!),memory.ensure(rFn,v[1]!),memory.ensure(rArg,v[2]!),
    memory.ensure(rR1,v[4]!),memory.ensure(rR2,v[5]!),
  ];
  const triples:LinkHandle[][]=[];
  const ordinary=(start:LinkHandle,end:LinkHandle):LinkHandle=>{const target=role();triples.push([target,start,end]);return target;};
  const startSelf=(end:LinkHandle):LinkHandle=>{const target=role();triples.push([target,target,end]);return target;};
  const sequence=(items:readonly LinkHandle[]):LinkHandle=>{
    let current=rRoot;for(const item of items){const payload=ordinary(current,item);current=startSelf(payload);}return current;
  };
  const rApp=ordinary(rFn,rArg),rC1=ordinary(rApp,rR1),rC2=ordinary(rApp,rR2);
  const rCandidate=sequence([rName,rFn,rArg,rApp,rR1,rR2,rC1,rC2]);
  const rFreeSeeds=sequence([rName,rFn,rArg,rR1,rR2]);
  const rAccept=ordinary(rL,rCandidate);
  const g0=startSelf(rApp),g1=startSelf(rC1),g2=startSelf(rC2);
  const t0=ordinary(g0,g1),t1=ordinary(g1,g2),t2=ordinary(g2,rAccept);
  let authorityBody=ordinary(t2,rRoot);
  authorityBody=ordinary(t1,authorityBody);authorityBody=ordinary(t0,authorityBody);
  const authority=startSelf(authorityBody),parent=ordinary(rCandidate,rO),K=ordinary(parent,authority);
  const truth=ordinary(K,g0),occurrence=ordinary(rRoot,truth);
  const frontier=startSelf(ordinary(occurrence,rRoot)),E0=ordinary(K,frontier);
  const descriptor=sequence([rCandidate,E0,rFreeSeeds]),pack=ordinary(rRule,descriptor);
  const plan=materializeExactSequence(memory,[
    materializeExactSequence(memory,seeds),
    materializeExactSequence(memory,triples.map(q=>materializeExactSequence(memory,q))),
    materializeExactSequence(memory,[rCandidate,pack]),
  ]);
  return Object.freeze({plan,authority:memory.ensure(rule,plan)});
}

interface ProducerSchema{readonly handle:LinkHandle;readonly templatePlan:LinkHandle;readonly template:Candidate;}
function defineProducerSchema(memory:Memory,rule:LinkHandle,b:RootBasis):ProducerSchema{
  const template=candidate(memory,b,memory.ensure(b.C,b.U));
  const authored=authorReferencePlan(memory,rule,template);
  const free=materializeExactSequence(memory,[
    template.values[0]!,template.values[1]!,template.values[2]!,template.values[4]!,template.values[5]!,
  ]);
  const descriptor=materializeExactSequence(memory,[template.handle,authored.plan,free]);
  return Object.freeze({handle:memory.ensure(rule,descriptor),templatePlan:authored.plan,template});
}
function schemaRequest(memory:Memory,context:LinkHandle,schema:LinkHandle,rule:LinkHandle,proposed:LinkHandle):LinkHandle{
  return memory.ensure(context,memory.ensure(schema,memory.ensure(rule,proposed)));
}

/**
 * Generic ProducerSchema instantiation.
 * No A39 topology recipe, role index or admission constraint meaning occurs here.
 */
function instantiatePlanFromSchema(memory:Memory,requestTruth:LinkHandle):LinkHandle{
  const truth=memory.poles(requestTruth),context=truth.start,request=memory.poles(truth.end);
  const schema=memory.poles(request.start),target=memory.poles(request.end);
  same(schema.start,target.start,"A40 schema Rule authority");
  const d=readExactSequence(memory,schema.end).values;same(d.length,3,"A40 schema descriptor arity");
  const templateCandidate=d[0],templatePlan=d[1],freeSequence=d[2];
  assert(templateCandidate!==undefined&&templatePlan!==undefined&&freeSequence!==undefined,"A40 schema complete");
  const from=readExactSequence(memory,templateCandidate).values,to=readExactSequence(memory,target.end).values;
  same(from.length,to.length,"A40 candidate correspondence cardinality");
  const free=new Set(readExactSequence(memory,freeSequence).values),mapping=new Map<LinkHandle,LinkHandle>([[memory.root,memory.root]]);
  let mapped=0;
  from.forEach((value,index)=>{
    if(!free.has(value))return;
    const next=to[index];assert(next!==undefined,"A40 target free seed");
    const old=mapping.get(value);if(old!==undefined)same(old,next,"A40 seed mapping stable");else mapping.set(value,next);
    mapped+=1;
  });
  same(mapped,free.size,"A40 all schema free seeds mapped");
  const visiting=new Set<LinkHandle>();
  const clone=(source:LinkHandle):LinkHandle=>{
    const known=mapping.get(source);if(known!==undefined)return known;
    assert(!visiting.has(source),"A40 unsupported non-self cycle");
    const p=memory.poles(source);let value:LinkHandle;
    if(p.start===source&&p.end===source)value=memory.ensureRoot();
    else if(p.start===source)value=memory.ensureStartSelfClosed(clone(p.end));
    else if(p.end===source)value=memory.ensureEndSelfClosed(clone(p.start));
    else{visiting.add(source);value=memory.ensure(clone(p.start),clone(p.end));visiting.delete(source);}
    mapping.set(source,value);return value;
  };
  return memory.ensure(context,clone(templatePlan));
}

function executeSelectedPlan(memory:Memory,rule:LinkHandle,plan:LinkHandle,proposed:LinkHandle,context:LinkHandle):LinkHandle{
  const built=executeConstructionPlan(memory,plan);
  const gate=memory.ensureStartSelfClosed(proposed),query=memory.ensure(gate,built.candidate);
  const K=memory.ensure(context,freezeAuthority(memory,[memory.ensure(gate,built.publication)]));
  return memory.ensure(K,freezeFrontier(memory,[memory.ensure(memory.root,memory.ensure(K,query))]));
}

function exercise(memory:Memory,withNoise:boolean):void{
  const b=ensureRootBasis(memory);if(withNoise)memory.ensure(memory.ensure(b.U,b.C),b.L);
  const rule=defineRule(memory);
  const schema=defineProducerSchema(memory,rule,b);
  const schemaFrozenAt=memory.linkCount;

  // Concrete bootstrap candidate appears only after ProducerSchema is frozen.
  const proposed=candidate(memory,b,memory.ensure(b.O,b.U));
  assert(memory.linkCount>schemaFrozenAt,"A40 concrete candidate created after schema freeze");
  const context=memory.ensure(b.R,b.U);
  const planTruth=instantiatePlanFromSchema(memory,schemaRequest(memory,context,schema.handle,rule,proposed.handle));
  same(memory.poles(planTruth).start,context,"A40 concrete plan contextual result");
  const plan=memory.poles(planTruth).end;

  // Post-hoc A39 author is oracle only: generated Plan must already be exact.
  memory.ensure(rule,plan);
  const beforeOracle=memory.linkCount;
  const oracle=authorReferencePlan(memory,rule,proposed);
  same(oracle.plan,plan,"A40 schema instantiation equals exact A39 Plan");
  same(memory.linkCount,beforeOracle,"A40 oracle adds zero missing Plan Links");

  const validation=executeSelectedPlan(memory,rule,plan,proposed.handle,context);
  const next=step(memory,validation,"forward"),published=frontierTruthEnds(memory,next);
  same(published.length,1,"A40 valid concrete Plan publishes Package");
  const pack=published[0]!,descriptor=readExactSequence(memory,memory.poles(pack).end).values;
  same(descriptor[0],proposed.handle,"A40 Package candidate");
  const E0=descriptor[1]!,accept=memory.ensure(b.L,proposed.handle);
  assert(runToDepth(memory,E0,3).includes(accept),"A40 schema-derived TemplateE0 reaches ACCEPT");

  for(const failed of [0,1,2] as const){
    const bad=forge(memory,proposed,failed);
    const badPlan=memory.poles(instantiatePlanFromSchema(
      memory,schemaRequest(memory,context,schema.handle,rule,bad.handle),
    )).end;
    const badValidation=executeSelectedPlan(memory,rule,badPlan,bad.handle,context);
    same(frontierTruthEnds(memory,step(memory,badValidation,"forward")).length,0,
      `A40 forged candidate ${failed} cannot publish`);
  }

  const foreignRule=memory.ensure(rule,b.C);
  expectThrows(()=>{instantiatePlanFromSchema(
    memory,schemaRequest(memory,context,schema.handle,foreignRule,proposed.handle),
  );},"A40 foreign Rule/schema authority rejected");

  const alternateSchema=memory.ensure(rule,memory.ensure(memory.poles(schema.handle).end,b.L));
  schemaRequest(memory,context,alternateSchema,rule,proposed.handle);
  same(memory.poles(planTruth).end,plan,"A40 late ambient schema inert");
}

function staticGuards():void{
  const root=resolve(process.cwd(),"..");
  const own=readFileSync(join(root,"ts/test/research-v013-producer-schema-a40.test.ts"),"utf8");
  const f5=readFileSync(join(root,"ts/test/research-v013-generic-construction-plan-f5-f4.test.ts"),"utf8");
  const a37=readFileSync(join(root,"ts/test/research-v013-link-carried-admission-program-a37.test.ts"),"utf8");
  const inst=own.slice(own.indexOf("function instantiatePlanFromSchema("),own.indexOf("\nfunction executeSelectedPlan(",own.indexOf("function instantiatePlanFromSchema(")));
  for(const forbidden of [
    "authorReferencePlan(","makeRoles(","roles[","triples",
    "for(const encoded","for (const encoded","constraintSequence",
    ".find(",".outgoing(",".incoming(","switch(",
  ]) assert(!inst.includes(forbidden),`A40 schema instantiator excludes recipe primitive ${forbidden}`);
  const a=own.slice(own.indexOf("function executeConstructionPlan("),own.indexOf("\nfunction makeRoles(",own.indexOf("function executeConstructionPlan(")));
  const z=f5.slice(f5.indexOf("function executeConstructionPlan("),f5.indexOf("\nfunction runReference(",f5.indexOf("function executeConstructionPlan(")));
  same(a.replace(/\s+/g,""),z.replace(/\s+/g,""),"A40 construction executor source-identical F5-F4");
  const x=own.slice(own.indexOf("function step("),own.indexOf("\nfunction frontierTruthEnds(",own.indexOf("function step(")));
  const y=a37.slice(a37.indexOf("function step("),a37.indexOf("\ninterface Program",a37.indexOf("function step(")));
  same(x.replace(/\s+/g,""),y.replace(/\s+/g,""),"A40 runtime source-identical A21/A37");
}

function main():void{
  exercise(new Memory(),false);exercise(new Memory(),true);staticGuards();
  console.log([
    "MTS v0.13 A40: PRODUCER_SCHEMA_INSTANTIATION=GREEN_SCOPED_RESEARCH",
    "RULE_ONLY_PLAN_AUTHORITY=INSUFFICIENT_PACKAGING_SCHEMA_REQUIRED",
    "CONCRETE_PLAN_SOURCE=LINK_CARRIED_PRODUCER_SCHEMA",
    "PER_INSTANCE_PLAN_AUTHORING=0",
    "SCHEMA_INSTANTIATOR=GENERIC_TOPOLOGY_CLONE",
    "A39_REFERENCE_PLAN=EXACT_ZERO_ADDITIONAL_LINKS",
    "CONSTRUCTION_EXECUTOR=F5_F4_SOURCE_IDENTICAL RUNTIME=A21_SOURCE_IDENTICAL",
    "VALID_PACKAGE=PUBLISHED FORGED_0_1_2=ZERO",
    "FOREIGN_SCHEMA_RULE=REJECTED LATE_AMBIENT_SCHEMA=INERT",
    "PRODUCER_SCHEMA_AUTHORING=HOST_BOOTSTRAP_RESIDUAL",
    "A35_PUBLICATION_EXISTENCE=RESIDUAL A36_PROBE_SCRATCH=RESIDUAL",
    "INDEPENDENT_MEMORIES=2 GLOBAL_E2=OPEN GLOBAL_E3=OPEN",
    "FULL_SELF_HOSTED=NOT_CLAIMED PRODUCTION_UNCHANGED",
  ].join(" "));
}
main();
