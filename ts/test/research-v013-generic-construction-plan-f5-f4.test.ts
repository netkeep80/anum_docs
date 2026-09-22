import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { exportCanonicalTopology } from "../src/canonical-topology.js";
import { defineDictionaryEffect, defineDictionaryScope, lookupScopedDictionary } from "../src/dictionary.js";
import { materializeExactSequence, readExactSequence } from "../src/exact-sequence.js";
import { Memory, ensureRootBasis, type LinkHandle, type ReadMemory, type RootBasis } from "../src/memory.js";
import { restoreTopology, type StorageTopologyImage } from "../src/persistence-topology.js";
import { defineSourceForm } from "../src/source.js";
import { buildV012SelectedSourceEvidence, materializeV012SourceContent, type V012SourceAuthority } from "../src/v012-source.js";

function assert(condition:unknown,message:string):asserts condition{
  if(!condition) throw new Error(`v0.13 F5-F4 constructive plan: ${message}`);
}
function same<T>(actual:T,expected:T,message:string):void{
  assert(Object.is(actual,expected),`${message}: values differ`);
}
function exactJson(actual:unknown,expected:unknown,message:string):void{
  same(JSON.stringify(actual),JSON.stringify(expected),message);
}
function bytes(text:string):Uint8Array{return new TextEncoder().encode(text);}
function at(all:readonly LinkHandle[],n:number):LinkHandle{
  const x=all[n]; assert(x!==undefined,"coordinate resolves"); return x;
}
function coord(map:ReadonlyMap<LinkHandle,number>,link:LinkHandle,message:string):number{
  const n=map.get(link); assert(n!==undefined,message); return n;
}
function expectRejected(effect:()=>unknown,message:string):void{
  let rejected=false; try{effect();}catch{rejected=true;} assert(rejected,message);
}

interface Frame{
  readonly startRole:LinkHandle;
  readonly endRole:LinkHandle;
  readonly directMethod:LinkHandle;
}
function frame(memory:Memory):Frame{
  const b=ensureRootBasis(memory);
  return Object.freeze({startRole:b.O,endRole:b.C,directMethod:b.L});
}
function defineName(
  memory:Memory,basis:RootBasis,dictionary:LinkHandle,history:LinkHandle,
  name:string,value:LinkHandle,
):Readonly<{dictionary:LinkHandle;history:LinkHandle;occurrence:LinkHandle}>{
  const content=materializeV012SourceContent(memory,basis,bytes(name));
  const effect=defineDictionaryEffect(memory,dictionary,basis.R,history,content,value);
  return Object.freeze({
    dictionary:effect.afterScope,history:effect.historyAfter,occurrence:effect.occurrence,
  });
}
function defineWitness(memory:Memory,f:Frame,target:LinkHandle):LinkHandle{
  const p=memory.poles(target);
  const a=memory.ensure(f.startRole,p.start);
  const b=memory.ensure(f.endRole,p.end);
  return memory.ensure(memory.ensure(a,b),target);
}

function anonymousAdmissionRoles(memory:Memory):readonly LinkHandle[]{
  const b=ensureRootBasis(memory);
  const roles=[
    memory.ensure(b.O,b.L),memory.ensure(b.C,b.L),
    memory.ensure(b.L,b.O),memory.ensure(b.L,b.C),
    memory.ensure(b.U,b.O),memory.ensure(b.U,b.C),
  ];
  roles.push(memory.ensure(roles[0]!,roles[4]!));
  roles.push(memory.ensure(roles[1]!,roles[5]!));
  same(new Set(roles).size,8,"admission roles distinct");
  return Object.freeze(roles);
}
function defineAdmissionRule(memory:Memory):LinkHandle{
  const r=anonymousAdmissionRoles(memory);
  const roleSequence=materializeExactSequence(memory,r);
  const constraints=materializeExactSequence(memory,[
    materializeExactSequence(memory,[r[3]!,r[1]!,r[2]!]),
    materializeExactSequence(memory,[r[6]!,r[3]!,r[4]!]),
    materializeExactSequence(memory,[r[7]!,r[3]!,r[5]!]),
  ]);
  return materializeExactSequence(memory,[roleSequence,constraints]);
}
function structurallyAdmitted(memory:ReadMemory,rule:LinkHandle,candidate:LinkHandle):boolean{
  try{
    const parts=readExactSequence(memory,rule).values;
    if(parts.length!==2||parts[0]===undefined||parts[1]===undefined)return false;
    const roles=readExactSequence(memory,parts[0]).values;
    const values=readExactSequence(memory,candidate).values;
    if(roles.length!==values.length||new Set(roles).size!==roles.length)return false;
    const binding=new Map<LinkHandle,LinkHandle>();
    roles.forEach((role,index)=>{const value=values[index];if(value!==undefined)binding.set(role,value);});
    if(binding.size!==roles.length)return false;
    for(const constraint of readExactSequence(memory,parts[1]).values){
      const q=readExactSequence(memory,constraint).values;
      if(q.length!==3||q.some(x=>x===undefined))return false;
      const target=binding.get(q[0]!),start=binding.get(q[1]!),end=binding.get(q[2]!);
      if(target===undefined||start===undefined||end===undefined)return false;
      if(memory.find(start,end)!==target)return false;
    }
    return true;
  }catch{return false;}
}

interface Request{
  readonly nameContent:LinkHandle; readonly source:LinkHandle;
  readonly fnStart:LinkHandle; readonly fnEnd:LinkHandle;
  readonly argument:LinkHandle; readonly result1:LinkHandle; readonly result2:LinkHandle;
  readonly dictionary:LinkHandle; readonly history:LinkHandle;
  readonly grammar:LinkHandle; readonly theory:LinkHandle;
  readonly openUse:LinkHandle; readonly closeUse:LinkHandle;
  readonly openOccurrence:LinkHandle; readonly argumentOccurrence:LinkHandle;
  readonly closeOccurrence:LinkHandle; readonly result1Occurrence:LinkHandle;
  readonly result2Occurrence:LinkHandle; readonly directMethod:LinkHandle;
}
function readRequest(memory:ReadMemory,request:LinkHandle):Request{
  const q=readExactSequence(memory,request).values;
  same(q.length,19,"request arity");
  for(const x of q)assert(x!==undefined,"request complete");
  return Object.freeze({
    nameContent:q[0]!,source:q[1]!,fnStart:q[2]!,fnEnd:q[3]!,argument:q[4]!,
    result1:q[5]!,result2:q[6]!,dictionary:q[7]!,history:q[8]!,grammar:q[9]!,
    theory:q[10]!,openUse:q[11]!,closeUse:q[12]!,openOccurrence:q[13]!,
    argumentOccurrence:q[14]!,closeOccurrence:q[15]!,result1Occurrence:q[16]!,
    result2Occurrence:q[17]!,directMethod:q[18]!,
  });
}

interface InitialArtifact{
  readonly schema:"mts-v013-f5-f4-initial/v0.1";
  readonly topology:StorageTopologyImage;
  readonly ruleCoordinate:number;
  readonly requestCoordinate:number;
}
function buildInitial():InitialArtifact{
  const memory=new Memory();
  const basis=ensureRootBasis(memory),f=frame(memory);
  const fnStart=memory.ensure(basis.U,basis.L);
  const fnEnd=memory.ensure(basis.L,basis.C);
  const argument=memory.ensure(basis.C,basis.U);
  const result1=memory.ensure(basis.O,fnStart);
  const result2=memory.ensure(basis.C,fnEnd);
  const openUse=memory.ensure(basis.O,basis.U);
  const closeUse=memory.ensure(basis.C,basis.L);
  assert(memory.find(fnStart,fnEnd)===undefined,"future function absent");
  let history=basis.R;
  let dictionary=defineDictionaryScope(memory,basis.R,history);
  const occurrences=new Map<string,LinkHandle>();
  for(const [name,value] of [["(",openUse],["a",argument],[")",closeUse],["b1",result1],["b2",result2]] as const){
    const next=defineName(memory,basis,dictionary,history,name,value);
    dictionary=next.dictionary; history=next.history; occurrences.set(name,next.occurrence);
  }
  const nameContent=materializeV012SourceContent(memory,basis,bytes("q"));
  same(lookupScopedDictionary(memory,dictionary,nameContent),undefined,"future name absent");
  const source=defineSourceForm(memory,materializeV012SourceContent(memory,basis,bytes("q(a)")));
  const grammar=memory.ensure(openUse,closeUse),theory=memory.ensure(closeUse,openUse);
  const rule=defineAdmissionRule(memory);
  const request=materializeExactSequence(memory,[
    nameContent,source,fnStart,fnEnd,argument,result1,result2,dictionary,history,
    grammar,theory,openUse,closeUse,occurrences.get("(")!,occurrences.get("a")!,
    occurrences.get(")")!,occurrences.get("b1")!,occurrences.get("b2")!,f.directMethod,
  ]);
  const canonical=exportCanonicalTopology(memory);
  return Object.freeze({
    schema:"mts-v013-f5-f4-initial/v0.1" as const,
    topology:canonical.topology,
    ruleCoordinate:coord(canonical.coordinates,rule,"rule coordinate"),
    requestCoordinate:coord(canonical.coordinates,request,"request coordinate"),
  });
}

interface ReferenceResult{
  readonly candidate:LinkHandle;
  readonly publication:LinkHandle;
}
function referenceGenerate(memory:Memory,rule:LinkHandle,request:LinkHandle):ReferenceResult{
  const basis=ensureRootBasis(memory),q=readRequest(memory,request),f=frame(memory);
  assert(memory.find(q.fnStart,q.fnEnd)===undefined,"reference function absent before generation");
  same(lookupScopedDictionary(memory,q.dictionary,q.nameContent),undefined,"reference name absent");
  const fn=memory.ensure(q.fnStart,q.fnEnd);
  const application=memory.ensure(fn,q.argument);
  const continuation1=memory.ensure(application,q.result1);
  const continuation2=memory.ensure(application,q.result2);
  const candidate=materializeExactSequence(memory,[
    q.nameContent,fn,q.argument,application,q.result1,q.result2,continuation1,continuation2,
  ]);
  assert(structurallyAdmitted(memory,rule,candidate),"reference candidate admitted");
  const effect=defineDictionaryEffect(memory,q.dictionary,basis.R,q.history,q.nameContent,fn);
  const forms=materializeExactSequence(memory,[fn,q.openUse,q.argument,q.closeUse]);
  const authority:V012SourceAuthority=Object.freeze({
    dictionary:effect.afterScope,grammar:q.grammar,theory:q.theory,
    grammarMembership:memory.ensure(q.grammar,forms),
    theoryMembership:memory.ensure(q.theory,forms),
  });
  const evidence=buildV012SelectedSourceEvidence(memory,basis,q.source,[
    {start:0,end:1,form:fn,dictionaryOccurrence:effect.occurrence},
    {start:1,end:2,form:q.openUse,dictionaryOccurrence:q.openOccurrence},
    {start:2,end:3,form:q.argument,dictionaryOccurrence:q.argumentOccurrence},
    {start:3,end:4,form:q.closeUse,dictionaryOccurrence:q.closeOccurrence},
  ],authority);
  const sourceStart=memory.ensure(f.startRole,evidence.segments[0]!.resolution);
  const sourceEnd=memory.ensure(f.endRole,evidence.segments[2]!.resolution);
  const grouping=memory.ensure(
    memory.ensure(evidence.formSequence,memory.ensure(sourceStart,sourceEnd)),
    application,
  );
  const witnesses=[q.directMethod,application,continuation1,continuation2].map(x=>defineWitness(memory,f,x));
  const witnessSequence=materializeExactSequence(memory,witnesses);
  const authorityCarrier=materializeExactSequence(memory,[
    effect.afterScope,evidence.source,evidence.formSequence,grouping,q.directMethod,witnessSequence,
  ]);
  const publication=memory.ensure(candidate,authorityCarrier);
  return Object.freeze({candidate,publication});
}

interface AbstractConstraint{
  readonly target:number; readonly start:number; readonly end:number;
}
interface Description{
  readonly initialCount:number;
  readonly constraints:readonly AbstractConstraint[];
  readonly candidateRole:number;
  readonly publicationRole:number;
}
function deriveDescription(initial:InitialArtifact):Description{
  const memory=restoreTopology(initial.topology);
  const before=memory.allLinks(),initialCount=before.length;
  const result=referenceGenerate(
    memory,at(before,initial.ruleCoordinate),at(before,initial.requestCoordinate),
  );
  const all=memory.allLinks();
  const index=new Map<LinkHandle,number>(all.map((x,i)=>[x,i] as const));
  const constraints:AbstractConstraint[]=[];
  for(let i=initialCount;i<all.length;i+=1){
    const link=all[i]!,p=memory.poles(link);
    const role=(x:LinkHandle):number=>{
      if(x===link)return i;
      const n=index.get(x); assert(n!==undefined,"constraint pole indexed"); return n;
    };
    constraints.push(Object.freeze({target:i,start:role(p.start),end:role(p.end)}));
  }
  const candidateRole=index.get(result.candidate),publicationRole=index.get(result.publication);
  assert(candidateRole!==undefined&&publicationRole!==undefined,"output roles indexed");
  return Object.freeze({
    initialCount,constraints:Object.freeze(constraints),candidateRole,publicationRole,
  });
}

interface PlannedArtifact{
  readonly schema:"mts-v013-generic-construction-plan-f5-f4/v0.1";
  readonly topology:StorageTopologyImage;
  readonly ruleCoordinate:number;
  readonly requestCoordinate:number;
  readonly planCoordinate:number;
  readonly plannedConstraintCount:number;
}
function makeRoles(memory:Memory,count:number):readonly LinkHandle[]{
  const b=ensureRootBasis(memory);
  const marker=memory.ensure(b.U,b.U);
  let current=memory.ensure(b.L,marker);
  const roles:LinkHandle[]=[];
  for(let i=0;i<count;i+=1){
    current=memory.ensure(current,marker);
    roles.push(current);
  }
  same(new Set(roles).size,count,"plan roles distinct");
  return Object.freeze(roles);
}
function encodePlan(initial:InitialArtifact,d:Description,dropLast:boolean):PlannedArtifact{
  const memory=restoreTopology(initial.topology);
  const initialLinks=memory.allLinks();
  same(initialLinks.length,d.initialCount,"initial coordinate count");
  const roles=makeRoles(memory,d.initialCount+d.constraints.length);
  const seedBindings=materializeExactSequence(
    memory,roles.slice(0,d.initialCount).map((role,i)=>memory.ensure(role,initialLinks[i]!)),
  );
  const selectedConstraints=dropLast?d.constraints.slice(0,-1):d.constraints;
  const constraintLinks=selectedConstraints.map(q=>
    materializeExactSequence(memory,[roles[q.target]!,roles[q.start]!,roles[q.end]!])
  );
  const constraints=materializeExactSequence(memory,constraintLinks);
  const outputs=materializeExactSequence(memory,[roles[d.candidateRole]!,roles[d.publicationRole]!]);
  const plan=materializeExactSequence(memory,[seedBindings,constraints,outputs]);
  const allBeforeFreeze=memory.allLinks();
  const request=at(initialLinks,initial.requestCoordinate),q=readRequest(memory,request);
  assert(memory.find(q.fnStart,q.fnEnd)===undefined,"plan does not precreate function");
  same(lookupScopedDictionary(memory,q.dictionary,q.nameContent),undefined,"plan does not precreate name authority");
  const canonical=exportCanonicalTopology(memory);
  return Object.freeze({
    schema:"mts-v013-generic-construction-plan-f5-f4/v0.1" as const,
    topology:canonical.topology,
    ruleCoordinate:coord(canonical.coordinates,at(initialLinks,initial.ruleCoordinate),"planned rule"),
    requestCoordinate:coord(canonical.coordinates,request,"planned request"),
    planCoordinate:coord(canonical.coordinates,plan,"plan coordinate"),
    plannedConstraintCount:selectedConstraints.length,
  });
}

interface PlanExecution{
  readonly candidate:LinkHandle;
  readonly publication:LinkHandle;
  readonly ordinary:number;
  readonly startSelf:number;
  readonly endSelf:number;
  readonly fullSelf:number;
}
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

function runReference(artifact:PlannedArtifact):StorageTopologyImage{
  const memory=restoreTopology(artifact.topology),all=memory.allLinks();
  referenceGenerate(memory,at(all,artifact.ruleCoordinate),at(all,artifact.requestCoordinate));
  return exportCanonicalTopology(memory).topology;
}
function runGeneric(artifact:PlannedArtifact):Readonly<{topology:StorageTopologyImage;execution:PlanExecution}>{
  const memory=restoreTopology(artifact.topology),all=memory.allLinks();
  const execution=executeConstructionPlan(memory,at(all,artifact.planCoordinate));
  const rule=at(all,artifact.ruleCoordinate);
  assert(structurallyAdmitted(memory,rule,execution.candidate),"generic candidate admitted");
  const p=memory.poles(execution.publication);
  same(p.start,execution.candidate,"generic publication starts at candidate");
  return Object.freeze({topology:exportCanonicalTopology(memory).topology,execution});
}
function staticConstructorGuard():void{
  const source=readFileSync(
    join(resolve(process.cwd(),".."),"ts/test/research-v013-generic-construction-plan-f5-f4.test.ts"),
    "utf8",
  );
  const start=source.indexOf("function executeConstructionPlan(");
  const end=source.indexOf("\nfunction runReference(",start);
  assert(start>=0&&end>start,"constructor slice");
  const kernel=source.slice(start,end);
  for(const forbidden of [
    "Dictionary","Source","Grouping","Function","Application","Continuation",
    "Witness","Publication","defineDictionaryEffect","buildV012SelectedSourceEvidence",
    "defineWitness","readRequest","switch(",
  ]) assert(!kernel.includes(forbidden),`constructor has no domain semantic branch: ${forbidden}`);
}
function main():void{
  const initial=buildInitial();
  const description=deriveDescription(initial);
  assert(description.constraints.length>0,"reference producer yielded constraints");
  const artifact=encodePlan(initial,description,false);
  same(artifact.plannedConstraintCount,description.constraints.length,"all constraints encoded");
  const reference=runReference(artifact);
  const a=runGeneric(artifact),b=runGeneric(artifact);
  exactJson(a.topology,b.topology,"independent generic constructor Memories agree");
  exactJson(a.topology,reference,"generic plan reproduces reference producer topology");
  assert(a.execution.ordinary>0,"ordinary pair construction exercised");
  assert(a.execution.startSelf>0,"START self-closed construction exercised");
  same(a.execution.fullSelf,0,"no new ROOT construction required");
  const forged=encodePlan(initial,description,true);
  expectRejected(()=>runGeneric(forged),"missing final construction constraint fails closed");
  staticConstructorGuard();
  console.log([
    "MTS v0.13 F5-F4:",
    "LINK_CARRIED_CONSTRUCTIVE_PLAN=GREEN_SCOPED_RESEARCH",
    `CONSTRUCTION_CONSTRAINTS=${artifact.plannedConstraintCount}`,
    `ORDINARY_ENSURES=${a.execution.ordinary}`,
    `START_SELF_ENSURES=${a.execution.startSelf}`,
    `END_SELF_ENSURES=${a.execution.endSelf}`,
    "FULL_SELF_ENSURES=0",
    "DOMAIN_SPECIFIC_CONSTRUCTOR_BRANCHES=0",
    "GENERIC_TOPOLOGY_EQUALS_REFERENCE=YES",
    "FROZEN_F5_F2_ADMISSION=GREEN",
    "EXPLICIT_PUBLICATION_REPRODUCED=YES",
    "NEGATIVE_MISSING_CONSTRAINT=REJECTED",
    "INDEPENDENT_GENERIC_MEMORIES=2",
    "EXTERNAL_PLAN_SOURCE=YES",
    "SEMANTIC_INFORMATION_REDUCED=NOT_CLAIMED",
    "GLOBAL_E2=OPEN",
    "GLOBAL_E3=OPEN",
    "FULL_SELF_HOSTED=NOT_CLAIMED",
    "PRODUCTION_UNCHANGED",
  ].join(" "));
}
main();
