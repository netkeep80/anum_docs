import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { exportCanonicalTopology } from "../src/canonical-topology.js";
import { defineDictionaryEffect, defineDictionaryScope, lookupScopedDictionary } from "../src/dictionary.js";
import { materializeExactSequence, readExactSequence } from "../src/exact-sequence.js";
import { Memory, ensureRootBasis, type LinkHandle, type ReadMemory, type RootBasis } from "../src/memory.js";
import { restoreTopology, type StorageTopologyImage } from "../src/persistence-topology.js";
import { defineSourceForm } from "../src/source.js";
import {
  buildV012SelectedSourceEvidence,
  materializeV012SourceContent,
  type V012SourceAuthority,
} from "../src/v012-source.js";

function assert(condition:unknown,message:string):asserts condition{
  if(!condition) throw new Error(`v0.13 F5-F8 template selection convergence: ${message}`);
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
function defineAdmissionRule(memory:Memory):LinkHandle{
  const b=ensureRootBasis(memory);
  const roles=[
    memory.ensure(b.O,b.L),memory.ensure(b.C,b.L),
    memory.ensure(b.L,b.O),memory.ensure(b.L,b.C),
    memory.ensure(b.U,b.O),memory.ensure(b.U,b.C),
  ];
  roles.push(memory.ensure(roles[0]!,roles[4]!));
  roles.push(memory.ensure(roles[1]!,roles[5]!));
  const roleSequence=materializeExactSequence(memory,roles);
  const constraints=materializeExactSequence(memory,[
    materializeExactSequence(memory,[roles[3]!,roles[1]!,roles[2]!]),
    materializeExactSequence(memory,[roles[6]!,roles[3]!,roles[4]!]),
    materializeExactSequence(memory,[roles[7]!,roles[3]!,roles[5]!]),
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
    for(const encoded of readExactSequence(memory,parts[1]).values){
      const q=readExactSequence(memory,encoded).values;
      if(q.length!==3||q.some(x=>x===undefined))return false;
      const target=binding.get(q[0]!),start=binding.get(q[1]!),end=binding.get(q[2]!);
      if(target===undefined||start===undefined||end===undefined)return false;
      if(memory.find(start,end)!==target)return false;
    }
    return true;
  }catch{return false;}
}

interface Request{
  readonly values:readonly LinkHandle[];
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
function requestFromValues(values:readonly LinkHandle[]):Request{
  same(values.length,19,"request arity");
  return Object.freeze({
    values:Object.freeze([...values]),
    nameContent:values[0]!,source:values[1]!,fnStart:values[2]!,fnEnd:values[3]!,
    argument:values[4]!,result1:values[5]!,result2:values[6]!,dictionary:values[7]!,
    history:values[8]!,grammar:values[9]!,theory:values[10]!,openUse:values[11]!,
    closeUse:values[12]!,openOccurrence:values[13]!,argumentOccurrence:values[14]!,
    closeOccurrence:values[15]!,result1Occurrence:values[16]!,result2Occurrence:values[17]!,
    directMethod:values[18]!,
  });
}
function readRequest(memory:ReadMemory,request:LinkHandle):Request{
  return requestFromValues(readExactSequence(memory,request).values);
}
interface GenerationResult{
  readonly candidate:LinkHandle;
  readonly publication:LinkHandle;
  readonly dictionary:LinkHandle;
  readonly history:LinkHandle;
  readonly functionLink:LinkHandle;
  readonly authorityRoots:readonly LinkHandle[];
}
function referenceGenerate(memory:Memory,rule:LinkHandle,request:LinkHandle):GenerationResult{
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
  const authorityRoots=Object.freeze([
    publication,
    evidence.content,evidence.source,evidence.dictionary,evidence.grammar,evidence.theory,
    evidence.selectionSequence,evidence.formSequence,evidence.grammarMembership,evidence.theoryMembership,
    ...evidence.segments.flatMap(segment=>[
      segment.form,segment.dictionaryOccurrence,segment.sliceContent,segment.span,
      segment.sliceEvidence,segment.lexeme,segment.resolution,segment.selection,
    ]),
    grouping,q.directMethod,...witnesses,
  ]);
  return Object.freeze({
    candidate,publication,dictionary:effect.afterScope,history:effect.historyAfter,
    functionLink:fn,authorityRoots,
  });
}

interface FrozenArtifact{
  readonly schema:"mts-v013-template-selection-convergence-f5-f8/v0.1";
  readonly topology:StorageTopologyImage;
  readonly ruleCoordinate:number;
  readonly templateFrontierCoordinate:number;
  readonly targetRequestCoordinate:number;
}
function addMapping(
  map:Map<LinkHandle,LinkHandle>,
  from:LinkHandle,to:LinkHandle,
):void{
  const previous=map.get(from);
  if(previous!==undefined)same(previous,to,"seed mapping consistent");
  else map.set(from,to);
}
function buildFrozen():FrozenArtifact{
  const memory=new Memory(),basis=ensureRootBasis(memory),f=frame(memory);
  const openUse=memory.ensure(basis.O,basis.U),closeUse=memory.ensure(basis.C,basis.L);
  const argument=memory.ensure(basis.C,basis.U);
  const result1=memory.ensure(basis.O,basis.L);
  const result2=memory.ensure(basis.C,basis.O);
  let history=basis.R;
  let dictionary=defineDictionaryScope(memory,basis.R,history);
  const occurrences=new Map<string,LinkHandle>();
  for(const [name,value] of [["(",openUse],["a",argument],[")",closeUse],["b1",result1],["b2",result2]] as const){
    const next=defineName(memory,basis,dictionary,history,name,value);
    dictionary=next.dictionary; history=next.history; occurrences.set(name,next.occurrence);
  }
  const grammar=memory.ensure(openUse,closeUse),theory=memory.ensure(closeUse,openUse);
  const rule=defineAdmissionRule(memory);

  const qFnStart=memory.ensure(basis.U,basis.L),qFnEnd=memory.ensure(basis.L,basis.C);
  const qName=materializeV012SourceContent(memory,basis,bytes("q"));
  const qSource=defineSourceForm(memory,materializeV012SourceContent(memory,basis,bytes("q(a)")));
  const qRequest=materializeExactSequence(memory,[
    qName,qSource,qFnStart,qFnEnd,argument,result1,result2,dictionary,history,grammar,theory,
    openUse,closeUse,occurrences.get("(")!,occurrences.get("a")!,occurrences.get(")")!,
    occurrences.get("b1")!,occurrences.get("b2")!,f.directMethod,
  ]);
  const qGenerated=referenceGenerate(memory,rule,qRequest);
  const qTemplateRoots=materializeExactSequence(memory,qGenerated.authorityRoots);

  const sFnStart=memory.ensure(basis.L,basis.U),sFnEnd=memory.ensure(basis.U,basis.C);
  assert(memory.find(sFnStart,sFnEnd)===undefined,"second template function absent before generation");
  const sName=materializeV012SourceContent(memory,basis,bytes("s"));
  const sSource=defineSourceForm(memory,materializeV012SourceContent(memory,basis,bytes("s(a)")));
  same(lookupScopedDictionary(memory,dictionary,sName),undefined,"second template name absent in shared base");
  const sRequest=materializeExactSequence(memory,[
    sName,sSource,sFnStart,sFnEnd,argument,result1,result2,dictionary,history,grammar,theory,
    openUse,closeUse,occurrences.get("(")!,occurrences.get("a")!,occurrences.get(")")!,
    occurrences.get("b1")!,occurrences.get("b2")!,f.directMethod,
  ]);
  const sGenerated=referenceGenerate(memory,rule,sRequest);
  const sTemplateRoots=materializeExactSequence(memory,sGenerated.authorityRoots);

  const rFnStart=memory.ensure(basis.U,basis.O),rFnEnd=memory.ensure(basis.C,basis.L);
  assert(memory.find(rFnStart,rFnEnd)===undefined,"target function absent at freeze");
  const rName=materializeV012SourceContent(memory,basis,bytes("r"));
  const rSource=defineSourceForm(memory,materializeV012SourceContent(memory,basis,bytes("r(a)")));
  same(lookupScopedDictionary(memory,qGenerated.dictionary,rName),undefined,"target name absent at freeze");
  const rRequestValues=[
    rName,rSource,rFnStart,rFnEnd,argument,result1,result2,
    qGenerated.dictionary,qGenerated.history,grammar,theory,openUse,closeUse,
    occurrences.get("(")!,occurrences.get("a")!,occurrences.get(")")!,
    occurrences.get("b1")!,occurrences.get("b2")!,f.directMethod,
  ] as const;
  const rRequest=materializeExactSequence(memory,rRequestValues);

  const qCorrespondence=memory.ensure(qRequest,rRequest);
  const sCorrespondence=memory.ensure(sRequest,rRequest);
  const qPackage=materializeExactSequence(memory,[
    qRequest,qGenerated.publication,qTemplateRoots,qCorrespondence,
  ]);
  const sPackage=materializeExactSequence(memory,[
    sRequest,sGenerated.publication,sTemplateRoots,sCorrespondence,
  ]);
  const templateFrontier=materializeExactSequence(memory,[qPackage,sPackage]);

  assert(memory.find(rFnStart,rFnEnd)===undefined,"template frontier does not create target function");
  same(lookupScopedDictionary(memory,qGenerated.dictionary,rName),undefined,"template frontier does not create target name authority");

  const canonical=exportCanonicalTopology(memory);
  return Object.freeze({
    schema:"mts-v013-template-selection-convergence-f5-f8/v0.1" as const,
    topology:canonical.topology,
    ruleCoordinate:coord(canonical.coordinates,rule,"rule coordinate"),
    templateFrontierCoordinate:coord(canonical.coordinates,templateFrontier,"template frontier coordinate"),
    targetRequestCoordinate:coord(canonical.coordinates,rRequest,"target request coordinate"),
  });
}

interface InstantiateResult{
  readonly publication:LinkHandle;
  readonly candidate:LinkHandle;
  readonly requestZippedPositionCount:number;
  readonly structuralCarrierCandidateCount:number;
  readonly derivedPrefixPositionCount:number;
  readonly derivedSeedCount:number;
  readonly mappedSeedCount:number;
  readonly ordinary:number;
  readonly startSelf:number;
  readonly endSelf:number;
  readonly fullSelf:number;
}
function ordinaryRootPrefixes(
  memory:ReadMemory,
  startSelf:LinkHandle,
):readonly LinkHandle[]|undefined{
  try{
    const outer=memory.poles(startSelf);
    if(outer.start!==startSelf||outer.end===startSelf)return undefined;
    const reversed:LinkHandle[]=[];
    const visited=new Set<LinkHandle>();
    let current=outer.end;
    while(current!==memory.root){
      if(visited.has(current))return undefined;
      visited.add(current);
      const p=memory.poles(current);
      if(p.start===current||p.end===current)return undefined;
      reversed.push(current);
      current=p.start;
    }
    return Object.freeze([memory.root,...reversed.reverse()]);
  }catch{
    return undefined;
  }
}
function deriveDeepStartRootedCorrespondence(
  memory:ReadMemory,
  pairs:readonly (readonly [LinkHandle,LinkHandle])[],
  mapping:Map<LinkHandle,LinkHandle>,
):Readonly<{candidateCount:number;prefixPositions:number}>{
  const candidates:Readonly<{from:readonly LinkHandle[];to:readonly LinkHandle[]}>[]=[];
  for(const [left,right] of pairs){
    const from=ordinaryRootPrefixes(memory,left);
    const to=ordinaryRootPrefixes(memory,right);
    if(from===undefined||to===undefined)continue;
    if(from.length<=2||from.length!==to.length)continue;
    candidates.push(Object.freeze({from,to}));
  }
  same(candidates.length,1,"exactly one deep START rooted-chain correspondence");
  const selected=candidates[0]!;
  selected.from.forEach((value,index)=>addMapping(mapping,value,selected.to[index]!));
  return Object.freeze({
    candidateCount:candidates.length,
    prefixPositions:selected.from.length,
  });
}
function instantiateTemplate(
  memory:Memory,
  templateRoot:LinkHandle,
  templateRoots:LinkHandle,
  requestCorrespondence:LinkHandle,
  fullAuthority:boolean,
):InstantiateResult{
  const mapping=new Map<LinkHandle,LinkHandle>();
  const pair=memory.poles(requestCorrespondence);
  const from=readExactSequence(memory,pair.start).values;
  const to=readExactSequence(memory,pair.end).values;
  same(from.length,to.length,"request correspondence cardinality");
  const requestPairs:readonly (readonly [LinkHandle,LinkHandle])[]=Object.freeze(
    from.map((value,index)=>Object.freeze([value,to[index]!] as const)),
  );
  for(const [left,right] of requestPairs)addMapping(mapping,left,right);
  const derived=deriveDeepStartRootedCorrespondence(memory,requestPairs,mapping);
  const derivedSeedCount=mapping.size;

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

  if(fullAuthority){
    for(const root of readExactSequence(memory,templateRoots).values) clone(root);
  }
  const publication=clone(templateRoot);
  const candidate=memory.poles(publication).start;
  return Object.freeze({
    publication,candidate,
    requestZippedPositionCount:requestPairs.length,
    structuralCarrierCandidateCount:derived.candidateCount,
    derivedPrefixPositionCount:derived.prefixPositions,
    derivedSeedCount,
    mappedSeedCount:mapping.size,
    ordinary,startSelf,endSelf,fullSelf,
  });
}
function runReference(artifact:FrozenArtifact):Readonly<{topology:StorageTopologyImage;candidate:LinkHandle;publication:LinkHandle}>{
  const memory=restoreTopology(artifact.topology),all=memory.allLinks();
  const generated=referenceGenerate(
    memory,at(all,artifact.ruleCoordinate),at(all,artifact.targetRequestCoordinate),
  );
  return Object.freeze({
    topology:exportCanonicalTopology(memory).topology,
    candidate:generated.candidate,
    publication:generated.publication,
  });
}
interface FrontierRun{
  readonly topology:StorageTopologyImage;
  readonly templateCount:number;
  readonly successfulInstantiationCount:number;
  readonly distinctPublicationCount:number;
  readonly publication:LinkHandle;
  readonly results:readonly InstantiateResult[];
}
function runFrontier(artifact:FrozenArtifact):FrontierRun{
  const memory=restoreTopology(artifact.topology),all=memory.allLinks();
  const targetRequest=at(all,artifact.targetRequestCoordinate);
  const rule=at(all,artifact.ruleCoordinate);
  const packages=readExactSequence(
    memory,at(all,artifact.templateFrontierCoordinate),
  ).values;
  const results:InstantiateResult[]=[];
  for(const packageLink of packages){
    const packageValues=readExactSequence(memory,packageLink).values;
    same(packageValues.length,4,"template package arity");
    const [templateRequest,templatePublication,templateRoots,requestCorrespondence]=packageValues;
    assert(
      templateRequest!==undefined&&templatePublication!==undefined&&
      templateRoots!==undefined&&requestCorrespondence!==undefined,
      "template package complete",
    );
    const cp=memory.poles(requestCorrespondence);
    same(cp.start,templateRequest,"package correspondence starts at template request");
    same(cp.end,targetRequest,"package correspondence targets selected request");
    const result=instantiateTemplate(
      memory,templatePublication,templateRoots,requestCorrespondence,true,
    );
    assert(structurallyAdmitted(memory,rule,result.candidate),"frontier candidate passes frozen F5-F2 rule");

    const carrier=readExactSequence(memory,memory.poles(result.publication).end).values;
    same(carrier.length,6,"frontier authority carrier arity");
    const dictionary=carrier[0]; assert(dictionary!==undefined,"frontier dictionary exists");
    const target=readRequest(memory,targetRequest);
    const resolved=lookupScopedDictionary(memory,dictionary,target.nameContent);
    assert(resolved!==undefined,"frontier target name resolves");
    const candidateValues=readExactSequence(memory,result.candidate).values;
    same(candidateValues.length,8,"frontier candidate arity");
    same(resolved.form,candidateValues[1],"frontier Dictionary resolves candidate function");
    results.push(result);
  }
  same(results.length,packages.length,"all frontier templates instantiate");
  const publications=new Set(results.map(result=>result.publication));
  same(publications.size,1,"all structurally compatible templates converge to one publication");
  const publication=results[0]?.publication;
  assert(publication!==undefined,"converged publication exists");
  return Object.freeze({
    topology:exportCanonicalTopology(memory).topology,
    templateCount:packages.length,
    successfulInstantiationCount:results.length,
    distinctPublicationCount:publications.size,
    publication,
    results:Object.freeze(results),
  });
}
function staticFrontierGuard():void{
  const source=readFileSync(
    join(resolve(process.cwd(),".."),"ts/test/research-v013-template-selection-convergence-f5-f8.test.ts"),
    "utf8",
  );
  const start=source.indexOf("function runFrontier(");
  const end=source.indexOf("\nfunction staticFrontierGuard(",start);
  assert(start>=0&&end>start,"F5-F8 frontier runner source slice");
  const kernel=source.slice(start,end);
  for(const forbidden of ['"q"','"s"',"switch(","templateFrontierCoordinate]"]){
    assert(!kernel.includes(forbidden),"F5-F8 frontier runner has no template identity branch: "+forbidden);
  }
}
function staticSelectorGuard():void{
  const source=readFileSync(
    join(resolve(process.cwd(),".."),"ts/test/research-v013-template-selection-convergence-f5-f8.test.ts"),
    "utf8",
  );
  const start=source.indexOf("function ordinaryRootPrefixes(");
  const end=source.indexOf("\nfunction instantiateTemplate(",start);
  assert(start>=0&&end>start,"F5-F8 structural selector source slice");
  const kernel=source.slice(start,end);
  for(const forbidden of [
    "readRequest","requestFromValues",".source","STRING","readV012SourceContent","[1]",
  ]) assert(!kernel.includes(forbidden),"F5-F8 selector has no source-field semantic shortcut: "+forbidden);
}

function main():void{
  const artifact=buildFrozen();
  const reference=runReference(artifact);
  const a=runFrontier(artifact),b=runFrontier(artifact);

  exactJson(a.topology,b.topology,"independent template frontiers agree");
  exactJson(a.topology,reference.topology,"converged multi-template topology equals domain reference");
  same(a.templateCount,2,"two independently valid templates in frontier");
  same(a.successfulInstantiationCount,2,"both templates instantiate");
  same(a.distinctPublicationCount,1,"two templates converge extensionally");
  same(a.results.length,2,"two result records");
  for(const result of a.results){
    same(result.requestZippedPositionCount,19,"each template uses one 19-position request correspondence");
    same(result.structuralCarrierCandidateCount,1,"each template has one structural deep-START carrier");
    same(result.derivedPrefixPositionCount,5,"each template derives five rooted prefixes");
  }
  staticSelectorGuard();
  staticFrontierGuard();

  console.log([
    "MTS v0.13 F5-F8:",
    "TEMPLATE_SELECTION_CONVERGENCE=GREEN_SCOPED_RESEARCH",
    `TEMPLATE_FRONTIER_SIZE=${a.templateCount}`,
    `SUCCESSFUL_TEMPLATE_INSTANTIATIONS=${a.successfulInstantiationCount}`,
    `DISTINCT_TARGET_PUBLICATIONS=${a.distinctPublicationCount}`,
    "HOST_SELECTED_TEMPLATE_HANDLE=NO",
    "REQUEST_CORRESPONDENCE_PER_TEMPLATE=1",
    "STRUCTURAL_DEEP_START_CANDIDATES_PER_TEMPLATE=1",
    "DERIVED_PREFIX_POSITIONS_PER_TEMPLATE=5",
    "GENERIC_TEMPLATE_TOPOLOGY_EQUALS_REFERENCE=YES",
    "FROZEN_F5_F2_ADMISSION=GREEN",
    "TARGET_NAME_RESOLUTION=GREEN",
    "INDEPENDENT_FRONTIER_MEMORIES=2",
    "EXTERNAL_TEMPLATE_FRONTIER_MEMBERSHIP=YES",
    "EXTERNAL_TARGET_REQUEST_SELECTION=YES",
    "EXTERNAL_REQUEST_CORRESPONDENCE=YES",
    "SEMANTIC_INFORMATION_ELIMINATED=NOT_CLAIMED",
    "GLOBAL_E2=OPEN",
    "GLOBAL_E3=OPEN",
    "FULL_SELF_HOSTED=NOT_CLAIMED",
    "PRODUCTION_UNCHANGED",
  ].join(" "));
}
main();
