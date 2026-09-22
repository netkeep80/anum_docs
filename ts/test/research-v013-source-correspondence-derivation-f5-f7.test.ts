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
  materializeV012SourceContent
  type V012SourceAuthority,
} from "../src/v012-source.js";

function assert(condition:unknown,message:string):asserts condition{
  if(!condition) throw new Error(`v0.13 F5-F7 source correspondence derivation: ${message}`);
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
  readonly schema:"mts-v013-source-correspondence-derivation-f5-f7/v0.1";
  readonly topology:StorageTopologyImage;
  readonly ruleCoordinate:number;
  readonly templatePublicationCoordinate:number;
  readonly templateRootsCoordinate:number;
  readonly targetRequestCoordinate:number;
  readonly requestCorrespondenceCoordinate:number;
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
  const templateRoots=materializeExactSequence(memory,qGenerated.authorityRoots);

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

  const requestCorrespondence=memory.ensure(qRequest,rRequest);

  assert(memory.find(rFnStart,rFnEnd)===undefined,"correspondence artifact does not create target function");
  same(lookupScopedDictionary(memory,qGenerated.dictionary,rName),undefined,"correspondence artifact does not create target name authority");

  const canonical=exportCanonicalTopology(memory);
  return Object.freeze({
    schema:"mts-v013-source-correspondence-derivation-f5-f7/v0.1" as const,
    topology:canonical.topology,
    ruleCoordinate:coord(canonical.coordinates,rule,"rule coordinate"),
    templatePublicationCoordinate:coord(canonical.coordinates,qGenerated.publication,"template publication coordinate"),
    templateRootsCoordinate:coord(canonical.coordinates,templateRoots,"template roots coordinate"),
    targetRequestCoordinate:coord(canonical.coordinates,rRequest,"target request coordinate"),
    requestCorrespondenceCoordinate:coord(
      canonical.coordinates,requestCorrespondence,"request correspondence coordinate",
    ),
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
type CorrespondenceMode="full"|"malformed-rooted-depth";
function selectRequestCorrespondence(
  memory:Memory,
  original:LinkHandle,
  mode:CorrespondenceMode,
):LinkHandle{
  if(mode==="full")return original;
  const pair=memory.poles(original);
  const targetValues=[...readExactSequence(memory,pair.end).values];
  same(targetValues.length,19,"target request arity for negative control");
  const basis=ensureRootBasis(memory);
  const shallowContent=memory.ensure(memory.ensure(basis.R,basis.L),basis.U);
  const shallowStart=memory.ensureStartSelfClosed(shallowContent);
  targetValues[1]=shallowStart;
  const malformedTarget=materializeExactSequence(memory,targetValues);
  return memory.ensure(pair.start,malformedTarget);
}
function runTemplate(
  artifact:FrozenArtifact,
  mode:CorrespondenceMode,
):Readonly<{topology:StorageTopologyImage;result:InstantiateResult}>{
  const memory=restoreTopology(artifact.topology),all=memory.allLinks();
  const requestCorrespondence=selectRequestCorrespondence(
    memory,at(all,artifact.requestCorrespondenceCoordinate),mode,
  );
  const result=instantiateTemplate(
    memory,
    at(all,artifact.templatePublicationCoordinate),
    at(all,artifact.templateRootsCoordinate),
    requestCorrespondence,
    true,
  );
  const rule=at(all,artifact.ruleCoordinate);
  assert(structurallyAdmitted(memory,rule,result.candidate),"instantiated candidate passes frozen F5-F2 rule");

  const target=readRequest(memory,at(all,artifact.targetRequestCoordinate));
  const carrier=readExactSequence(memory,memory.poles(result.publication).end).values;
  same(carrier.length,6,"instantiated authority carrier arity");
  const dictionary=carrier[0]; assert(dictionary!==undefined,"instantiated dictionary exists");
  const resolved=lookupScopedDictionary(memory,dictionary,target.nameContent);
  assert(resolved!==undefined,"instantiated target name resolves");
  const candidateValues=readExactSequence(memory,result.candidate).values;
  same(candidateValues.length,8,"instantiated candidate arity");
  same(resolved.form,candidateValues[1],"instantiated Dictionary resolves candidate function");

  return Object.freeze({topology:exportCanonicalTopology(memory).topology,result});
}
function staticSelectorGuard():void{
  const source=readFileSync(
    join(resolve(process.cwd(),".."),"ts/test/research-v013-source-correspondence-derivation-f5-f7.test.ts"),
    "utf8",
  );
  const start=source.indexOf("function ordinaryRootPrefixes(");
  const end=source.indexOf("\nfunction instantiateTemplate(",start);
  assert(start>=0&&end>start,"F5-F7 structural selector source slice");
  const kernel=source.slice(start,end);
  for(const forbidden of [
    "readRequest","requestFromValues",".source","STRING","readV012SourceContent","[1]",
  ]) assert(!kernel.includes(forbidden),"F5-F7 selector has no source-field semantic shortcut: "+forbidden);
}

function main():void{
  const artifact=buildFrozen();
  const reference=runReference(artifact);

  expectRejected(
    ()=>runTemplate(artifact,"malformed-rooted-depth"),
    "different deep START rooted-chain depth fails closed",
  );

  const a=runTemplate(artifact,"full"),b=runTemplate(artifact,"full");
  exactJson(a.topology,b.topology,"independent structurally-derived instantiations agree");
  exactJson(a.topology,reference.topology,"source-correspondence derivation equals domain reference");
  same(a.result.requestZippedPositionCount,19,"one request correspondence zips 19 positions");
  same(a.result.structuralCarrierCandidateCount,1,"one deep START rooted-chain pair selected");
  assert(a.result.derivedPrefixPositionCount>2,"deep rooted prefix correspondence derived");
  assert(a.result.derivedSeedCount>0,"derived mappings exist");
  assert(a.result.ordinary>0&&a.result.startSelf>0,"generic cloning exercised");
  staticSelectorGuard();

  console.log([
    "MTS v0.13 F5-F7:",
    "SOURCE_CORRESPONDENCE_DERIVATION=GREEN_SCOPED_RESEARCH",
    "EXPLICIT_PER_LINK_SEED_PAIRS=0",
    "EXTERNAL_CORRESPONDENCE_DECLARATIONS=1",
    `REQUEST_ZIPPED_POSITIONS=${a.result.requestZippedPositionCount}`,
    `STRUCTURAL_DEEP_START_CANDIDATES=${a.result.structuralCarrierCandidateCount}`,
    `DERIVED_PREFIX_POSITIONS=${a.result.derivedPrefixPositionCount}`,
    `DERIVED_UNIQUE_SEEDS=${a.result.derivedSeedCount}`,
    `MAPPED_LINKS_AFTER_RUN=${a.result.mappedSeedCount}`,
    `ORDINARY_CLONES=${a.result.ordinary}`,
    `START_SELF_CLONES=${a.result.startSelf}`,
    "EXTERNAL_PREFIX_SEQUENCE_PREPARATION=NO",
    "SOURCE_FIELD_INDEX_BRANCHES=0",
    "MALFORMED_ROOTED_DEPTH=REJECTED",
    "GENERIC_TEMPLATE_TOPOLOGY_EQUALS_REFERENCE=YES",
    "FROZEN_F5_F2_ADMISSION=GREEN",
    "TARGET_NAME_RESOLUTION=GREEN",
    "INDEPENDENT_TEMPLATE_MEMORIES=2",
    "EXTERNAL_TEMPLATE_SELECTION=YES",
    "EXTERNAL_REQUEST_CORRESPONDENCE_SELECTION=1",
    "SEMANTIC_INFORMATION_ELIMINATED=NOT_CLAIMED",
    "GLOBAL_E2=OPEN",
    "GLOBAL_E3=OPEN",
    "FULL_SELF_HOSTED=NOT_CLAIMED",
    "PRODUCTION_UNCHANGED",
  ].join(" "));
}
main();
