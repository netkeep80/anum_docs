import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { materializeExactSequence, readExactSequence } from "../src/exact-sequence.js";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
  type RootBasis,
} from "../src/memory.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.13 A39 bootstrap producer plan: ${message}`);
}
function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: values differ`);
}
function expectThrows(run:()=>void,message:string):void{
  let threw=false;try{run();}catch{threw=true;}assert(threw,message);
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
  assert(e.start===envelope&&e.end!==envelope,`A21 ${kind} envelope`);
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
    same(truth.start,ep.start,"A39 frontier context");out.push(truth.end);
  }
  return Object.freeze(out);
}
function runToDepth(memory:Memory,E0:LinkHandle,depth:number):readonly LinkHandle[]{
  const out:LinkHandle[]=[];let e=E0;
  for(let i=0;i<depth;i+=1){e=step(memory,e,"forward");out.push(...frontierTruthEnds(memory,e));}
  return Object.freeze(out);
}

interface PlanExecution{
  readonly candidate:LinkHandle;
  readonly publication:LinkHandle;
  readonly ordinary:number;
  readonly startSelf:number;
  readonly endSelf:number;
  readonly fullSelf:number;
}

/** Source-identical generic executor from F5-F4. */
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

function makeRoles(memory:Memory,count:number):readonly LinkHandle[]{
  const b=ensureRootBasis(memory),marker=memory.ensure(b.U,b.U);
  let current=memory.ensure(b.L,marker);const roles:LinkHandle[]=[];
  for(let i=0;i<count;i+=1){current=memory.ensure(current,marker);roles.push(current);}
  same(new Set(roles).size,count,"A39 plan roles distinct");return Object.freeze(roles);
}

interface Candidate{readonly values:readonly LinkHandle[];readonly handle:LinkHandle;}
function candidate(memory:Memory,b:RootBasis,seed:LinkHandle):Candidate{
  let x=seed;const fresh=():LinkHandle=>{x=memory.ensure(x,b.C);return x;};
  const name=fresh(),fnStart=fresh(),fnEnd=fresh(),fn=memory.ensure(fnStart,fnEnd);
  const argument=fresh(),application=memory.ensure(fn,argument),r1=fresh(),r2=fresh();
  const c1=memory.ensure(application,r1),c2=memory.ensure(application,r2);
  const values=Object.freeze([name,fn,argument,application,r1,r2,c1,c2]);
  return Object.freeze({values,handle:materializeExactSequence(memory,values)});
}
function forged(memory:Memory,valid:Candidate,index:0|1|2):Candidate{
  const v=[...valid.values];
  if(index===0){const x=memory.ensure(v[2]!,v[1]!);v[3]=x;v[6]=memory.ensure(x,v[4]!);v[7]=memory.ensure(x,v[5]!);}
  else if(index===1)v[6]=memory.ensure(v[4]!,v[3]!);
  else v[7]=memory.ensure(v[5]!,v[3]!);
  const values=Object.freeze(v);return Object.freeze({values,handle:materializeExactSequence(memory,values)});
}
function defineRule(memory:Memory):LinkHandle{
  const b=ensureRootBasis(memory),roles:LinkHandle[]=[];let x=memory.ensure(b.O,b.U);
  for(let i=0;i<8;i+=1){x=memory.ensure(x,i%2===0?b.L:b.C);roles.push(x);}
  const cs=[
    materializeExactSequence(memory,[roles[3]!,roles[1]!,roles[2]!]),
    materializeExactSequence(memory,[roles[6]!,roles[3]!,roles[4]!]),
    materializeExactSequence(memory,[roles[7]!,roles[3]!,roles[5]!]),
  ];
  return materializeExactSequence(memory,[materializeExactSequence(memory,roles),materializeExactSequence(memory,cs)]);
}

interface FrozenPlan{readonly plan:LinkHandle;readonly authority:LinkHandle;readonly proposed:LinkHandle;}

/**
 * Bootstrap plan authoring residual.
 *
 * The future Candidate/E0/FreeSeedSequence handles are NOT seed-bound. Only
 * Rule, root basis and five free semantic values cross the freeze boundary.
 * The plan is ordinary Link data consumed later by the unchanged F5-F4
 * construction executor.
 */
function defineFrozenPlan(memory:Memory,rule:LinkHandle,proposed:Candidate):FrozenPlan{
  const b=ensureRootBasis(memory),v=proposed.values;
  same(v.length,8,"A39 proposed candidate arity");
  const roles=makeRoles(memory,72);let n=0;const role=():LinkHandle=>roles[n++]!;
  const rRoot=role(),rO=role(),rL=role(),rRule=role();
  const rName=role(),rFn=role(),rArg=role(),rR1=role(),rR2=role();
  const seeds=[
    memory.ensure(rRoot,memory.root),memory.ensure(rO,b.O),memory.ensure(rL,b.L),memory.ensure(rRule,rule),
    memory.ensure(rName,v[0]!),memory.ensure(rFn,v[1]!),memory.ensure(rArg,v[2]!),
    memory.ensure(rR1,v[4]!),memory.ensure(rR2,v[5]!),
  ];
  const triples:LinkHandle[][]=[];
  const ordinary=(start:LinkHandle,end:LinkHandle):LinkHandle=>{
    const target=role();triples.push([target,start,end]);return target;
  };
  const startSelf=(end:LinkHandle):LinkHandle=>{
    const target=role();triples.push([target,target,end]);return target;
  };
  const sequence=(items:readonly LinkHandle[]):LinkHandle=>{
    let current=rRoot;
    for(const item of items){const payload=ordinary(current,item);current=startSelf(payload);}
    return current;
  };

  const rApp=ordinary(rFn,rArg),rC1=ordinary(rApp,rR1),rC2=ordinary(rApp,rR2);
  const rCandidate=sequence([rName,rFn,rArg,rApp,rR1,rR2,rC1,rC2]);
  const rFreeSeeds=sequence([rName,rFn,rArg,rR1,rR2]);
  const rAccept=ordinary(rL,rCandidate);
  const g0=startSelf(rApp),g1=startSelf(rC1),g2=startSelf(rC2);
  const t0=ordinary(g0,g1),t1=ordinary(g1,g2),t2=ordinary(g2,rAccept);
  let authorityBody=ordinary(t2,rRoot);
  authorityBody=ordinary(t1,authorityBody);authorityBody=ordinary(t0,authorityBody);
  const authority=startSelf(authorityBody);
  const parent=ordinary(rCandidate,rO),K=ordinary(parent,authority);
  const truth=ordinary(K,g0),occurrence=ordinary(rRoot,truth);
  const frontierBody=ordinary(occurrence,rRoot),frontier=startSelf(frontierBody);
  const E0=ordinary(K,frontier);
  const descriptor=sequence([rCandidate,E0,rFreeSeeds]);
  const pack=ordinary(rRule,descriptor);

  const constraintLinks=triples.map(q=>materializeExactSequence(memory,q));
  const plan=materializeExactSequence(memory,[
    materializeExactSequence(memory,seeds),
    materializeExactSequence(memory,constraintLinks),
    materializeExactSequence(memory,[rCandidate,pack]),
  ]);
  return Object.freeze({plan,authority:memory.ensure(rule,plan),proposed:proposed.handle});
}

function bootstrapRequest(memory:Memory,context:LinkHandle,frozen:FrozenPlan,rule:LinkHandle,proposed:LinkHandle):LinkHandle{
  return memory.ensure(context,memory.ensure(frozen.authority,memory.ensure(rule,proposed)));
}

/**
 * Generic selected bootstrap execution. It does not interpret Rule/Candidate
 * roles. The frozen plan constructs the candidate and package; A36 canonical
 * identity plus A21 decides whether the proposed Candidate may publish it.
 */
function executeSelectedBootstrap(memory:Memory,requestTruth:LinkHandle):LinkHandle{
  const truth=memory.poles(requestTruth),context=truth.start,request=memory.poles(truth.end);
  const authority=memory.poles(request.start),target=memory.poles(request.end);
  same(authority.start,target.start,"A39 frozen plan Rule authority");
  const built=executeConstructionPlan(memory,authority.end);
  const gate=memory.ensureStartSelfClosed(target.end);
  const query=memory.ensure(gate,built.candidate);
  const transition=memory.ensure(gate,built.publication);
  const K=memory.ensure(context,freezeAuthority(memory,[transition]));
  const seedTruth=memory.ensure(K,query);
  return memory.ensure(K,freezeFrontier(memory,[memory.ensure(memory.root,seedTruth)]));
}

function exercise(memory:Memory,withNoise:boolean):void{
  const b=ensureRootBasis(memory);
  if(withNoise)memory.ensure(memory.ensure(b.U,b.C),b.L);
  const rule=defineRule(memory),valid=candidate(memory,b,memory.ensure(b.U,b.L));
  const frozen=defineFrozenPlan(memory,rule,valid);

  // Frozen plan names no Candidate handle and no constrained candidate value.
  const planParts=readExactSequence(memory,frozen.plan).values;
  const seedEnds=new Set(readExactSequence(memory,planParts[0]!).values.map(x=>memory.poles(x).end));
  assert(!seedEnds.has(valid.handle),"A39 future Candidate handle absent from plan seeds");
  for(const i of [3,6,7] as const)assert(!seedEnds.has(valid.values[i]!),`A39 constrained value ${i} absent from plan seeds`);

  const context=memory.ensure(b.R,b.U);
  const selected=bootstrapRequest(memory,context,frozen,rule,valid.handle);
  const before=memory.linkCount;
  const validation=executeSelectedBootstrap(memory,selected);
  assert(memory.linkCount>before,"A39 frozen plan materializes future authority");
  const publicationStep=step(memory,validation,"forward");
  const published=frontierTruthEnds(memory,publicationStep);
  same(published.length,1,"A39 valid template publishes one package");
  const pack=published[0]!,pp=memory.poles(pack);
  same(pp.start,rule,"A39 published package bound to Rule");

  const descriptor=readExactSequence(memory,pp.end).values;
  same(descriptor.length,3,"A39 A38-compatible descriptor arity");
  same(descriptor[0],valid.handle,"A39 generated Candidate is exact proposed Candidate");
  const E0=descriptor[1]!,seedSequence=descriptor[2]!;
  const expectedSeeds=[valid.values[0]!,valid.values[1]!,valid.values[2]!,valid.values[4]!,valid.values[5]!];
  const actualSeeds=readExactSequence(memory,seedSequence).values;
  same(JSON.stringify(actualSeeds),JSON.stringify(expectedSeeds),"A39 generated free-seed sequence");
  const accept=memory.ensure(b.L,valid.handle);
  assert(runToDepth(memory,E0,3).includes(accept),"A39 generated first TemplateE0 reaches ACCEPT");

  // Candidate cannot self-authorize a forged derived field. Same frozen plan
  // reconstructs from free seeds, then canonical candidate identity yields ZERO.
  for(const failed of [0,1,2] as const){
    const bad=forged(memory,valid,failed);
    memory.ensure(bad.handle,pack); // ambient self-publication attempt
    const badValidation=executeSelectedBootstrap(
      memory,bootstrapRequest(memory,context,frozen,rule,bad.handle),
    );
    same(frontierTruthEnds(memory,step(memory,badValidation,"forward")).length,0,
      `A39 forged template ${failed} cannot self-publish package`);
  }

  const foreignRule=memory.ensure(rule,b.U);
  expectThrows(()=>{executeSelectedBootstrap(
    memory,bootstrapRequest(memory,context,frozen,foreignRule,valid.handle),
  );},"A39 foreign frozen-plan authority rejected");

  // A late alternative plan/authority is ambient and cannot alter the selected
  // immutable request.
  const latePlan=memory.ensure(frozen.plan,b.C);
  memory.ensure(rule,latePlan);
  same(frontierTruthEnds(memory,step(memory,validation,"forward"))[0],pack,
    "A39 late ambient plan does not alter selected publication");
}

function staticGuards():void{
  const root=resolve(process.cwd(),"..");
  const own=readFileSync(join(root,"ts/test/research-v013-bootstrap-producer-plan-a39.test.ts"),"utf8");
  const f5=readFileSync(join(root,"ts/test/research-v013-generic-construction-plan-f5-f4.test.ts"),"utf8");
  const a37=readFileSync(join(root,"ts/test/research-v013-link-carried-admission-program-a37.test.ts"),"utf8");
  const forbiddenReferenceCompiler=["compile","Reference("].join("");
  assert(!own.includes(forbiddenReferenceCompiler),"A39 contains no host reference compiler");

  const a=own.slice(own.indexOf("function executeConstructionPlan("),own.indexOf("\nfunction makeRoles(",own.indexOf("function executeConstructionPlan(")));
  const z=f5.slice(f5.indexOf("function executeConstructionPlan("),f5.indexOf("\nfunction runReference(",f5.indexOf("function executeConstructionPlan(")));
  same(a.replace(/\s+/g,""),z.replace(/\s+/g,""),"A39 construction executor source-identical F5-F4");

  const x=own.slice(own.indexOf("function step("),own.indexOf("\nfunction frontierTruthEnds(",own.indexOf("function step(")));
  const y=a37.slice(a37.indexOf("function step("),a37.indexOf("\ninterface Program",a37.indexOf("function step(")));
  same(x.replace(/\s+/g,""),y.replace(/\s+/g,""),"A39 runtime source-identical A21/A37");

  const selected=own.slice(own.indexOf("function executeSelectedBootstrap("),own.indexOf("\nfunction exercise(",own.indexOf("function executeSelectedBootstrap(")));
  for(const forbidden of ["defineFrozenPlan(","compileReference(","roles[","constraintLinks",".find(",".outgoing(",".incoming(","switch("])
    assert(!selected.includes(forbidden),`A39 selected executor excludes authoring primitive ${forbidden}`);
}

function main():void{
  exercise(new Memory(),false);exercise(new Memory(),true);staticGuards();
  console.log([
    "MTS v0.13 A39: BOOTSTRAP_PRODUCER_PLAN=GREEN_SCOPED_RESEARCH",
    "FIRST_TEMPLATE_E0_SOURCE=FROZEN_LINK_CONSTRUCTION_PLAN",
    "FIRST_FREE_SEED_SEQUENCE_SOURCE=FROZEN_LINK_CONSTRUCTION_PLAN",
    "HOST_REFERENCE_COMPILER=0",
    "CONSTRUCTION_EXECUTOR=F5_F4_SOURCE_IDENTICAL",
    "PUBLICATION_VALIDATION=A36_CANONICAL_GATE_PLUS_A21",
    "VALID_TEMPLATE_PACKAGE=PUBLISHED",
    "FORGED_TEMPLATE_0_1_2=ZERO SELF_PUBLICATION=REJECTED",
    "LATE_AMBIENT_PLAN=INERT",
    "A38_PACKAGE_SCHEMA=COMPATIBLE",
    "PLAN_AUTHORING=HOST_BOOTSTRAP_RESIDUAL",
    "A35_PUBLICATION_EXISTENCE=RESIDUAL A36_PROBE_SCRATCH=RESIDUAL",
    "INDEPENDENT_MEMORIES=2 GLOBAL_E2=OPEN GLOBAL_E3=OPEN",
    "FULL_SELF_HOSTED=NOT_CLAIMED PRODUCTION_UNCHANGED",
  ].join(" "));
}
main();
