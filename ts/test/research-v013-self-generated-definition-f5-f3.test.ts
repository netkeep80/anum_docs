import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { exportCanonicalTopology } from "../src/canonical-topology.js";
import {
  defineDictionaryEffect,
  defineDictionaryScope,
  lookupScopedDictionary,
} from "../src/dictionary.js";
import { materializeExactSequence, readExactSequence } from "../src/exact-sequence.js";
import {
  Memory,
  ensureRootBasis,
  type EnumerableReadMemory,
  type LinkHandle,
  type LinkPoles,
  type ReadMemory,
  type RootBasis,
} from "../src/memory.js";
import {
  restoreTopology,
  type StorageTopologyImage,
} from "../src/persistence-topology.js";
import { defineSourceForm } from "../src/source.js";
import type {
  SelectedSegmentEvidence,
  SourceFrontEndEvidence,
} from "../src/source.js";
import {
  buildV012SelectedSourceEvidence,
  materializeV012SourceContent,
  replayV012SelectedSourceEvidence,
  type V012SourceAuthority,
} from "../src/v012-source.js";
import {
  resolveFlatBundle,
  type BundleValue,
  type ResolvedOccurrence,
} from "../src/value-bundle.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.13 FORMAL F5-F3 self-generation: ${message}`);
}
function same<T>(actual:T, expected:T, message:string):void {
  assert(Object.is(actual,expected), `${message}: values differ`);
}
function exactJson(actual:unknown, expected:unknown, message:string):void {
  same(JSON.stringify(actual),JSON.stringify(expected),message);
}
function bytes(text:string):Uint8Array { return new TextEncoder().encode(text); }

class View implements EnumerableReadMemory {
  readonly root:LinkHandle;
  private readonly ordered:readonly LinkHandle[];
  constructor(
    private readonly source:ReadMemory,
    private readonly support:ReadonlySet<LinkHandle>,
  ){
    this.root=source.root;
    this.ordered=Object.freeze([...support]);
  }
  get linkCount():number { return this.ordered.length; }
  private require(link:LinkHandle):void {
    assert(this.support.has(link),"F5-F3 selected support");
  }
  poles(link:LinkHandle):LinkPoles {
    this.require(link);
    const p=this.source.poles(link);
    assert(this.support.has(p.start)&&this.support.has(p.end),"F5-F3 support pole-closed");
    return p;
  }
  find(start:LinkHandle,end:LinkHandle):LinkHandle|undefined {
    this.require(start); this.require(end);
    const x=this.source.find(start,end);
    return x!==undefined&&this.support.has(x)?x:undefined;
  }
  outgoing(start:LinkHandle):readonly LinkHandle[] {
    this.require(start);
    return Object.freeze(this.source.outgoing(start).filter(x=>this.support.has(x)));
  }
  incoming(end:LinkHandle):readonly LinkHandle[] {
    this.require(end);
    return Object.freeze(this.source.incoming(end).filter(x=>this.support.has(x)));
  }
  allLinks():readonly LinkHandle[] { return this.ordered; }
}

function closure(memory:ReadMemory, roots:readonly LinkHandle[]):ReadonlySet<LinkHandle>{
  const support=new Set<LinkHandle>();
  const pending=[memory.root,...roots];
  while(pending.length>0){
    const x=pending.pop();
    if(x===undefined||support.has(x)) continue;
    const p=memory.poles(x);
    support.add(x);
    pending.push(p.start,p.end);
  }
  return support;
}

interface Frame {
  readonly startRole:LinkHandle;
  readonly endRole:LinkHandle;
  readonly directMethod:LinkHandle;
}
function frame(memory:Memory):Frame {
  const b=ensureRootBasis(memory);
  return Object.freeze({startRole:b.O,endRole:b.C,directMethod:b.L});
}

function defineName(
  memory:Memory,
  basis:RootBasis,
  dictionary:LinkHandle,
  history:LinkHandle,
  name:string,
  value:LinkHandle,
):Readonly<{dictionary:LinkHandle;history:LinkHandle;occurrence:LinkHandle}>{
  const content=materializeV012SourceContent(memory,basis,bytes(name));
  const effect=defineDictionaryEffect(
    memory,dictionary,basis.R,history,content,value,
  );
  return Object.freeze({
    dictionary:effect.afterScope,
    history:effect.historyAfter,
    occurrence:effect.occurrence,
  });
}

interface PSegment {
  readonly start:number; readonly end:number;
  readonly form:number; readonly dictionaryOccurrence:number;
  readonly sliceContent:number; readonly span:number;
  readonly sliceEvidence:number; readonly lexeme:number;
  readonly resolution:number; readonly selection:number;
}
interface PSource {
  readonly content:number; readonly source:number;
  readonly dictionary:number; readonly grammar:number; readonly theory:number;
  readonly segments:readonly PSegment[];
  readonly selectionSequence:number; readonly formSequence:number;
  readonly grammarMembership:number; readonly theoryMembership:number;
}
interface PExpression {
  readonly source:PSource;
  readonly grouping:number;
}
interface FrozenArtifact {
  readonly schema:"mts-v013-self-generated-definition-f5-f3/frozen-v0.1";
  readonly topology:StorageTopologyImage;
  readonly ruleCoordinate:number;
  readonly requestCoordinate:number;
}
interface GeneratedArtifact {
  readonly schema:"mts-v013-self-generated-definition-f5-f3/generated-v0.1";
  readonly topology:StorageTopologyImage;
  readonly ruleCoordinate:number;
  readonly definitionCoordinate:number;
  readonly publicationCoordinate:number;
  readonly expression:PExpression;
  readonly directMethod:number;
  readonly witnessCoordinates:readonly number[];
}
interface GeneratedRun {
  readonly artifact:GeneratedArtifact;
  readonly candidate:LinkHandle;
  readonly values:readonly LinkHandle[];
  readonly authorityCarrier:LinkHandle;
  readonly publication:LinkHandle;
}

function coord(
  c:ReadonlyMap<LinkHandle,number>, link:LinkHandle, message:string,
):number{
  const n=c.get(link); assert(n!==undefined,message); return n;
}
function packSegment(
  c:ReadonlyMap<LinkHandle,number>, s:SelectedSegmentEvidence,
):PSegment{
  return Object.freeze({
    start:s.start,end:s.end,
    form:coord(c,s.form,"F5-F3 form coordinate"),
    dictionaryOccurrence:coord(c,s.dictionaryOccurrence,"F5-F3 occurrence coordinate"),
    sliceContent:coord(c,s.sliceContent,"F5-F3 slice content coordinate"),
    span:coord(c,s.span,"F5-F3 span coordinate"),
    sliceEvidence:coord(c,s.sliceEvidence,"F5-F3 slice evidence coordinate"),
    lexeme:coord(c,s.lexeme,"F5-F3 lexeme coordinate"),
    resolution:coord(c,s.resolution,"F5-F3 resolution coordinate"),
    selection:coord(c,s.selection,"F5-F3 selection coordinate"),
  });
}
function packSource(
  c:ReadonlyMap<LinkHandle,number>, e:SourceFrontEndEvidence,
):PSource{
  return Object.freeze({
    content:coord(c,e.content,"F5-F3 content coordinate"),
    source:coord(c,e.source,"F5-F3 source coordinate"),
    dictionary:coord(c,e.dictionary,"F5-F3 Dictionary coordinate"),
    grammar:coord(c,e.grammar,"F5-F3 Grammar coordinate"),
    theory:coord(c,e.theory,"F5-F3 Theory coordinate"),
    segments:Object.freeze(e.segments.map(s=>packSegment(c,s))),
    selectionSequence:coord(c,e.selectionSequence,"F5-F3 selection sequence coordinate"),
    formSequence:coord(c,e.formSequence,"F5-F3 form sequence coordinate"),
    grammarMembership:coord(c,e.grammarMembership,"F5-F3 Grammar membership coordinate"),
    theoryMembership:coord(c,e.theoryMembership,"F5-F3 Theory membership coordinate"),
  });
}

function defineWitness(memory:Memory,f:Frame,target:LinkHandle):LinkHandle{
  const p=memory.poles(target);
  const a=memory.ensure(f.startRole,p.start);
  const b=memory.ensure(f.endRole,p.end);
  return memory.ensure(memory.ensure(a,b),target);
}

function evidenceRoots(e:SourceFrontEndEvidence):readonly LinkHandle[]{
  return Object.freeze([
    e.content,e.source,e.dictionary,e.grammar,e.theory,
    e.selectionSequence,e.formSequence,e.grammarMembership,e.theoryMembership,
    ...e.segments.flatMap(s=>[
      s.form,s.dictionaryOccurrence,s.sliceContent,s.span,s.sliceEvidence,
      s.lexeme,s.resolution,s.selection,
    ]),
  ]);
}

function anonymousRoles(memory:Memory):readonly LinkHandle[]{
  const b=ensureRootBasis(memory);
  const r0=memory.ensure(b.O,b.L);
  const r1=memory.ensure(b.C,b.L);
  const r2=memory.ensure(b.L,b.O);
  const r3=memory.ensure(b.L,b.C);
  const r4=memory.ensure(b.U,b.O);
  const r5=memory.ensure(b.U,b.C);
  const r6=memory.ensure(r0,r4);
  const r7=memory.ensure(r1,r5);
  const roles=[r0,r1,r2,r3,r4,r5,r6,r7] as const;
  same(new Set(roles).size,8,"F5-F3 anonymous roles distinct");
  return Object.freeze(roles);
}

function defineRule(memory:Memory):LinkHandle{
  const roles=anonymousRoles(memory);
  const roleSequence=materializeExactSequence(memory,roles);
  const constraint0=materializeExactSequence(memory,[roles[3]!,roles[1]!,roles[2]!]);
  const constraint1=materializeExactSequence(memory,[roles[6]!,roles[3]!,roles[4]!]);
  const constraint2=materializeExactSequence(memory,[roles[7]!,roles[3]!,roles[5]!]);
  const constraints=materializeExactSequence(
    memory,[constraint0,constraint1,constraint2],
  );
  return materializeExactSequence(memory,[roleSequence,constraints]);
}

function structurallyAdmitted(
  memory:ReadMemory,
  rule:LinkHandle,
  candidate:LinkHandle,
):boolean{
  try{
    const ruleParts=readExactSequence(memory,rule).values;
    if(ruleParts.length!==2) return false;
    const roleSequence=ruleParts[0];
    const constraintSequence=ruleParts[1];
    if(roleSequence===undefined||constraintSequence===undefined) return false;

    const roles=readExactSequence(memory,roleSequence).values;
    const values=readExactSequence(memory,candidate).values;
    if(roles.length!==values.length) return false;
    if(new Set(roles).size!==roles.length) return false;

    const bindings=new Map<LinkHandle,LinkHandle>();
    roles.forEach((role,index)=>{
      const value=values[index];
      if(value!==undefined) bindings.set(role,value);
    });
    if(bindings.size!==roles.length) return false;

    const constraints=readExactSequence(memory,constraintSequence).values;
    for(const constraint of constraints){
      const triple=readExactSequence(memory,constraint).values;
      if(triple.length!==3) return false;
      const [targetRole,startRole,endRole]=triple;
      if(targetRole===undefined||startRole===undefined||endRole===undefined) return false;
      const target=bindings.get(targetRole);
      const start=bindings.get(startRole);
      const end=bindings.get(endRole);
      if(target===undefined||start===undefined||end===undefined) return false;
      if(memory.find(start,end)!==target) return false;
    }
    return true;
  }catch{
    return false;
  }
}

interface GenerationRequest {
  readonly nameContent:LinkHandle;
  readonly source:LinkHandle;
  readonly fnStart:LinkHandle;
  readonly fnEnd:LinkHandle;
  readonly argument:LinkHandle;
  readonly result1:LinkHandle;
  readonly result2:LinkHandle;
  readonly dictionary:LinkHandle;
  readonly history:LinkHandle;
  readonly grammar:LinkHandle;
  readonly theory:LinkHandle;
  readonly openUse:LinkHandle;
  readonly closeUse:LinkHandle;
  readonly openOccurrence:LinkHandle;
  readonly argumentOccurrence:LinkHandle;
  readonly closeOccurrence:LinkHandle;
  readonly result1Occurrence:LinkHandle;
  readonly result2Occurrence:LinkHandle;
  readonly directMethod:LinkHandle;
}

function readGenerationRequest(
  memory:ReadMemory,
  request:LinkHandle,
):GenerationRequest{
  const q=readExactSequence(memory,request).values;
  same(q.length,19,"F5-F3 request arity");
  for(const value of q) assert(value!==undefined,"F5-F3 complete request");
  return Object.freeze({
    nameContent:q[0]!,
    source:q[1]!,
    fnStart:q[2]!,
    fnEnd:q[3]!,
    argument:q[4]!,
    result1:q[5]!,
    result2:q[6]!,
    dictionary:q[7]!,
    history:q[8]!,
    grammar:q[9]!,
    theory:q[10]!,
    openUse:q[11]!,
    closeUse:q[12]!,
    openOccurrence:q[13]!,
    argumentOccurrence:q[14]!,
    closeOccurrence:q[15]!,
    result1Occurrence:q[16]!,
    result2Occurrence:q[17]!,
    directMethod:q[18]!,
  });
}

function buildFrozenArtifact(noise:boolean):FrozenArtifact{
  const memory=new Memory();
  const basis=ensureRootBasis(memory);
  if(noise){
    const n0=memory.ensure(basis.U,basis.C);
    const n1=memory.ensure(n0,basis.O);
    memory.ensure(basis.L,n1);
  }

  const f=frame(memory);
  const fnStart=memory.ensure(basis.U,basis.L);
  const fnEnd=memory.ensure(basis.L,basis.C);
  const argument=memory.ensure(basis.C,basis.U);
  const result1=memory.ensure(basis.O,fnStart);
  const result2=memory.ensure(basis.C,fnEnd);
  const openUse=memory.ensure(basis.O,basis.U);
  const closeUse=memory.ensure(basis.C,basis.L);

  assert(memory.find(fnStart,fnEnd)===undefined,"F5-F3 function absent before freeze");

  let history=basis.R;
  let dictionary=defineDictionaryScope(memory,basis.R,history);
  const occurrences=new Map<string,LinkHandle>();
  for(const [name,value] of [
    ["(",openUse],
    ["a",argument],
    [")",closeUse],
    ["b1",result1],
    ["b2",result2],
  ] as const){
    const next=defineName(memory,basis,dictionary,history,name,value);
    dictionary=next.dictionary;
    history=next.history;
    occurrences.set(name,next.occurrence);
  }

  const nameContent=materializeV012SourceContent(memory,basis,bytes("q"));
  same(
    lookupScopedDictionary(memory,dictionary,nameContent),
    undefined,
    "F5-F3 new function name has no frozen Dictionary authority",
  );

  const sourceContent=materializeV012SourceContent(memory,basis,bytes("q(a)"));
  const source=defineSourceForm(memory,sourceContent);
  const grammar=memory.ensure(openUse,closeUse);
  const theory=memory.ensure(closeUse,openUse);
  const rule=defineRule(memory);

  const request=materializeExactSequence(memory,[
    nameContent,source,fnStart,fnEnd,argument,result1,result2,
    dictionary,history,grammar,theory,openUse,closeUse,
    occurrences.get("(")!,
    occurrences.get("a")!,
    occurrences.get(")")!,
    occurrences.get("b1")!,
    occurrences.get("b2")!,
    f.directMethod,
  ]);

  const support=closure(memory,[rule,request]);
  const canonical=exportCanonicalTopology(new View(memory,support));
  const c=canonical.coordinates;

  return Object.freeze({
    schema:"mts-v013-self-generated-definition-f5-f3/frozen-v0.1" as const,
    topology:canonical.topology,
    ruleCoordinate:coord(c,rule,"F5-F3 rule coordinate"),
    requestCoordinate:coord(c,request,"F5-F3 request coordinate"),
  });
}

function publishGeneratedAuthority(
  memory:Memory,
  rule:LinkHandle,
  candidate:LinkHandle,
  authorityCarrier:LinkHandle,
):LinkHandle{
  assert(
    structurallyAdmitted(memory,rule,candidate),
    "F5-F3 publication requires frozen structural admission",
  );
  return memory.ensure(candidate,authorityCarrier);
}

function generateAuthority(
  memory:Memory,
  rule:LinkHandle,
  request:LinkHandle,
):GeneratedRun{
  const basis=ensureRootBasis(memory);
  const q=readGenerationRequest(memory,request);

  assert(memory.find(q.fnStart,q.fnEnd)===undefined,"F5-F3 function absent at generation start");
  same(
    lookupScopedDictionary(memory,q.dictionary,q.nameContent),
    undefined,
    "F5-F3 name absent at generation start",
  );

  const before=memory.linkCount;
  const fn=memory.ensure(q.fnStart,q.fnEnd);
  const application=memory.ensure(fn,q.argument);
  const continuation1=memory.ensure(application,q.result1);
  const continuation2=memory.ensure(application,q.result2);
  const values=Object.freeze([
    q.nameContent,fn,q.argument,application,q.result1,q.result2,
    continuation1,continuation2,
  ]);
  const candidate=materializeExactSequence(memory,values);

  assert(
    structurallyAdmitted(memory,rule,candidate),
    "F5-F3 generated unknown definition passes frozen structural rule",
  );

  const nameEffect=defineDictionaryEffect(
    memory,q.dictionary,basis.R,q.history,q.nameContent,fn,
  );
  const dictionary=nameEffect.afterScope;
  const nameOccurrence=nameEffect.occurrence;

  const forms=materializeExactSequence(
    memory,[fn,q.openUse,q.argument,q.closeUse],
  );
  const authority:V012SourceAuthority=Object.freeze({
    dictionary,
    grammar:q.grammar,
    theory:q.theory,
    grammarMembership:memory.ensure(q.grammar,forms),
    theoryMembership:memory.ensure(q.theory,forms),
  });

  const evidence=buildV012SelectedSourceEvidence(
    memory,basis,q.source,[
      {start:0,end:1,form:fn,dictionaryOccurrence:nameOccurrence},
      {start:1,end:2,form:q.openUse,dictionaryOccurrence:q.openOccurrence},
      {start:2,end:3,form:q.argument,dictionaryOccurrence:q.argumentOccurrence},
      {start:3,end:4,form:q.closeUse,dictionaryOccurrence:q.closeOccurrence},
    ],authority,
  );

  const f=frame(memory);
  const sourceStart=memory.ensure(f.startRole,evidence.segments[0]!.resolution);
  const sourceEnd=memory.ensure(f.endRole,evidence.segments[2]!.resolution);
  const sourcePair=memory.ensure(sourceStart,sourceEnd);
  const descriptor=memory.ensure(evidence.formSequence,sourcePair);
  const grouping=memory.ensure(descriptor,application);

  const targets=[
    q.directMethod,
    application,
    continuation1,
    continuation2,
  ] as const;
  const witnesses=targets.map(target=>defineWitness(memory,f,target));
  const witnessSequence=materializeExactSequence(memory,witnesses);

  const authorityCarrier=materializeExactSequence(memory,[
    dictionary,
    evidence.source,
    evidence.formSequence,
    grouping,
    q.directMethod,
    witnessSequence,
  ]);
  const publication=publishGeneratedAuthority(
    memory,rule,candidate,authorityCarrier,
  );

  assert(memory.linkCount>before,"F5-F3 generation materializes new authority topology");

  const roots=[
    rule,publication,
    ...evidenceRoots(evidence),
    grouping,q.directMethod,...witnesses,
  ];
  const support=closure(memory,roots);
  const canonical=exportCanonicalTopology(new View(memory,support));
  const c=canonical.coordinates;

  const artifact:GeneratedArtifact=Object.freeze({
    schema:"mts-v013-self-generated-definition-f5-f3/generated-v0.1" as const,
    topology:canonical.topology,
    ruleCoordinate:coord(c,rule,"F5-F3 generated rule coordinate"),
    definitionCoordinate:coord(c,candidate,"F5-F3 definition coordinate"),
    publicationCoordinate:coord(c,publication,"F5-F3 publication coordinate"),
    expression:Object.freeze({
      source:packSource(c,evidence),
      grouping:coord(c,grouping,"F5-F3 grouping coordinate"),
    }),
    directMethod:coord(c,q.directMethod,"F5-F3 direct method coordinate"),
    witnessCoordinates:Object.freeze(
      witnesses.map(w=>coord(c,w,"F5-F3 proof witness coordinate")),
    ),
  });

  return Object.freeze({
    artifact,candidate,values,authorityCarrier,publication,
  });
}

function generatePortable(frozen:FrozenArtifact):GeneratedRun{
  same(
    frozen.schema,
    "mts-v013-self-generated-definition-f5-f3/frozen-v0.1",
    "F5-F3 frozen schema",
  );
  const memory=restoreTopology(frozen.topology);
  const all=memory.allLinks();
  const rule=at(all,frozen.ruleCoordinate);
  const request=at(all,frozen.requestCoordinate);
  return generateAuthority(memory,rule,request);
}

function at(all:readonly LinkHandle[],n:number):LinkHandle{
  const x=all[n]; assert(x!==undefined,"F4 coordinate resolves"); return x;
}
function restoreSegment(all:readonly LinkHandle[],s:PSegment):SelectedSegmentEvidence{
  return Object.freeze({
    start:s.start,end:s.end,
    form:at(all,s.form),
    dictionaryOccurrence:at(all,s.dictionaryOccurrence),
    sliceContent:at(all,s.sliceContent),span:at(all,s.span),
    sliceEvidence:at(all,s.sliceEvidence),lexeme:at(all,s.lexeme),
    resolution:at(all,s.resolution),selection:at(all,s.selection),
  });
}
function restoreSource(memory:Memory,p:PSource):SourceFrontEndEvidence{
  const all=memory.allLinks();
  return Object.freeze({
    basis:ensureRootBasis(memory),
    content:at(all,p.content),source:at(all,p.source),
    dictionary:at(all,p.dictionary),grammar:at(all,p.grammar),theory:at(all,p.theory),
    segments:Object.freeze(p.segments.map(s=>restoreSegment(all,s))),
    selectionSequence:at(all,p.selectionSequence),
    formSequence:at(all,p.formSequence),
    grammarMembership:at(all,p.grammarMembership),
    theoryMembership:at(all,p.theoryMembership),
  });
}

interface Binding {
  readonly target:LinkHandle;
  readonly values:ReadonlyMap<LinkHandle,LinkHandle>;
}
function verifyWitness(memory:ReadMemory,f:Frame,witness:LinkHandle):Binding{
  const wp=memory.poles(witness);
  const pair=memory.poles(wp.start);
  const values=new Map<LinkHandle,LinkHandle>();
  for(const handle of [pair.start,pair.end]){
    const b=memory.poles(handle);
    assert(
      b.start===f.startRole||b.start===f.endRole,
      "F4 proof witness selected roles only",
    );
    assert(!values.has(b.start),"F4 proof role unique");
    values.set(b.start,b.end);
  }
  same(values.size,2,"F4 exact proof role coverage");
  const s=values.get(f.startRole), e=values.get(f.endRole);
  assert(s!==undefined&&e!==undefined,"F4 proof values exist");
  same(memory.find(s,e),wp.end,"F4 proof reconstructs target");
  return Object.freeze({target:wp.end,values});
}
function bindingFor(bindings:readonly Binding[],target:LinkHandle):Binding{
  const found=bindings.filter(b=>b.target===target);
  same(found.length,1,"F4 exact binding per target");
  return found[0]!;
}
function valueOfResolution(
  memory:ReadMemory,e:SourceFrontEndEvidence,resolution:LinkHandle,
):LinkHandle{
  const segment=e.segments.find(s=>s.resolution===resolution);
  assert(segment!==undefined,"F4 grouping uses verified source resolution");
  same(memory.poles(resolution).end,segment.form,"F4 source resolution semantic value");
  return segment.form;
}
function groupedApplication(
  memory:ReadMemory,
  evidence:SourceFrontEndEvidence,
  selectedUses:readonly LinkHandle[],
  f:Frame,
  grouping:LinkHandle,
  bindings:readonly Binding[],
):LinkHandle{
  same(selectedUses.length,4,"F4 exact source Use count");
  const gp=memory.poles(grouping);
  const descriptor=memory.poles(gp.start);
  same(descriptor.start,evidence.formSequence,"F4 grouping exact formSequence");

  const pair=memory.poles(descriptor.end);
  const sourceRoles=new Map<LinkHandle,LinkHandle>();
  for(const h of [pair.start,pair.end]){
    const b=memory.poles(h);
    assert(
      b.start===f.startRole||b.start===f.endRole,
      "F4 grouping selected roles only",
    );
    assert(!sourceRoles.has(b.start),"F4 grouping role unique");
    sourceRoles.set(b.start,b.end);
  }
  const sr=sourceRoles.get(f.startRole), er=sourceRoles.get(f.endRole);
  assert(sr!==undefined&&er!==undefined,"F4 grouping role values exist");
  const functionValue=valueOfResolution(memory,evidence,sr);
  const argumentValue=valueOfResolution(memory,evidence,er);

  const app=bindingFor(bindings,gp.end);
  same(app.values.get(f.startRole),functionValue,"F4 grouped function matches app");
  same(app.values.get(f.endRole),argumentValue,"F4 grouped argument matches app");
  return gp.end;
}
function evaluate(
  memory:Memory,
  f:Frame,
  directMethod:LinkHandle,
  application:LinkHandle,
  bindings:readonly Binding[],
):BundleValue{
  const method=bindingFor(bindings,directMethod);
  const fromRole=method.values.get(f.startRole);
  const toRole=method.values.get(f.endRole);
  assert(fromRole!==undefined&&toRole!==undefined,"F4 method roles");
  const occurrences:ResolvedOccurrence[]=[];
  let index=0;
  for(const candidate of bindings){
    if(candidate.target===directMethod) continue;
    const from=candidate.values.get(fromRole);
    const to=candidate.values.get(toRole);
    assert(from!==undefined&&to!==undefined,"F4 candidate roles");
    if(from!==application) continue;
    occurrences.push(Object.freeze({path:Object.freeze([index]),link:to}));
    index+=1;
  }
  return resolveFlatBundle(memory,Object.freeze(occurrences));
}

function executeExpression(
  memory:Memory,
  portable:PExpression,
  directMethod:LinkHandle,
  bindings:readonly Binding[],
):BundleValue{
  const evidence=restoreSource(memory,portable.source);
  const selected=replayV012SelectedSourceEvidence(
    memory,ensureRootBasis(memory),evidence,
  );
  const f=frame(memory);
  const grouping=at(memory.allLinks(),portable.grouping);
  const application=groupedApplication(
    memory,evidence,selected,f,grouping,bindings,
  );
  return evaluate(memory,f,directMethod,application,bindings);
}

function resolveName(
  memory:Memory,dictionary:LinkHandle,name:string,
):LinkHandle|undefined{
  const basis=ensureRootBasis(memory);
  const content=materializeV012SourceContent(memory,basis,bytes(name));
  return lookupScopedDictionary(memory,dictionary,content)?.form;
}
function setSame(
  actual:ReadonlySet<LinkHandle>,expected:readonly LinkHandle[],message:string,
):void{
  same(actual.size,new Set(expected).size,`${message}: cardinality`);
  for(const x of expected) assert(actual.has(x),`${message}: missing result`);
}

function executeGeneratedArtifact(artifact:GeneratedArtifact):void{
  same(
    artifact.schema,
    "mts-v013-self-generated-definition-f5-f3/generated-v0.1",
    "F5-F3 generated schema",
  );
  const memory=restoreTopology(artifact.topology);
  const all=memory.allLinks();
  const rule=at(all,artifact.ruleCoordinate);
  const candidate=at(all,artifact.definitionCoordinate);
  const publication=at(all,artifact.publicationCoordinate);

  assert(
    structurallyAdmitted(memory,rule,candidate),
    "F5-F3 second Memory replays structural admission",
  );
  const publicationPoles=memory.poles(publication);
  same(publicationPoles.start,candidate,"F5-F3 publication names admitted definition");
  assert(
    publicationPoles.end!==candidate,
    "F5-F3 publication carries separate generated authority",
  );

  const f=frame(memory);
  const directMethod=at(all,artifact.directMethod);
  const bindings=artifact.witnessCoordinates.map(
    n=>verifyWitness(memory,f,at(all,n)),
  );
  same(bindings.length,4,"F5-F3 four proof bindings");

  const result=executeExpression(
    memory,artifact.expression,directMethod,bindings,
  );
  const evidence=restoreSource(memory,artifact.expression.source);
  const dictionary=evidence.dictionary;
  const fn=resolveName(memory,dictionary,"q");
  const b1=resolveName(memory,dictionary,"b1");
  const b2=resolveName(memory,dictionary,"b2");
  assert(fn!==undefined&&b1!==undefined&&b2!==undefined,"F5-F3 generated names resolve");
  same(fn,evidence.segments[0]!.form,"F5-F3 generated Dictionary resolves new function");
  setSame(result.links,[b1,b2],"F5-F3 generated q(a)");
  same(result.links.size,2,"F5-F3 generated behavior cardinality");
}

function expectRejected(effect:()=>unknown,message:string):void{
  let rejected=false;
  try{ effect(); }catch{ rejected=true; }
  assert(rejected,message);
}

function negativeControls(frozen:FrozenArtifact):void{
  const memory=restoreTopology(frozen.topology);
  const all=memory.allLinks();
  const rule=at(all,frozen.ruleCoordinate);
  const request=at(all,frozen.requestCoordinate);
  const generated=generateAuthority(memory,rule,request);

  {
    const v=[...generated.values];
    v[3]=memory.ensure(v[2]!,v[1]!);
    const forged=materializeExactSequence(memory,v);
    assert(
      !structurallyAdmitted(memory,rule,forged),
      "F5-F3 forged application rejected",
    );
    expectRejected(
      ()=>publishGeneratedAuthority(memory,rule,forged,generated.authorityCarrier),
      "F5-F3 forged application cannot publish",
    );
  }

  {
    const v=[...generated.values];
    v[6]=memory.ensure(v[4]!,v[3]!);
    const forged=materializeExactSequence(memory,v);
    assert(
      !structurallyAdmitted(memory,rule,forged),
      "F5-F3 forged continuation rejected",
    );
  }

  {
    const forged=materializeExactSequence(
      memory,generated.values.slice(0,-1),
    );
    assert(
      !structurallyAdmitted(memory,rule,forged),
      "F5-F3 wrong arity rejected",
    );
  }
}

function staticGeneratorGuard():void{
  const repoRoot=resolve(process.cwd(),"..");
  const source=readFileSync(
    join(repoRoot,"ts/test/research-v013-self-generated-definition-f5-f3.test.ts"),
    "utf8",
  );
  const start=source.indexOf("function generateAuthority(");
  const end=source.indexOf("\nfunction generatePortable(",start);
  assert(start>=0&&end>start,"F5-F3 generator source slice");
  const generator=source.slice(start,end);
  for(const forbidden of [
    '"q"','"b1"','"b2"',"switch (","operatorAspect",
    "unifyStructuralTemplate","candidateCoordinate",
  ]){
    assert(
      !generator.includes(forbidden),
      "F5-F3 generator has no name/form-specific semantic branch: "+forbidden,
    );
  }
}

function staticReceiverIdentityGuard():void{
  const repoRoot=resolve(process.cwd(),"..");
  const current=readFileSync(
    join(repoRoot,"ts/test/research-v013-self-generated-definition-f5-f3.test.ts"),
    "utf8",
  );
  const f4=readFileSync(
    join(repoRoot,"ts/test/research-v013-formal-self-extension-f4.test.ts"),
    "utf8",
  );
  const extract=(source:string):string=>{
    const start=source.indexOf("function at(");
    const end=source.indexOf("\nfunction resolveName(",start);
    assert(start>=0&&end>start,"F5-F3 receiver source slice");
    return source.slice(start,end);
  };
  same(
    extract(current),
    extract(f4),
    "F5-F3 executes the exact unchanged F4 generic receiver source block",
  );
}

function main():void{
  const frozenA=buildFrozenArtifact(false);
  const frozenB=buildFrozenArtifact(true);
  exactJson(
    frozenA,frozenB,
    "F5-F3 frozen rule/request ignores unrelated allocation noise",
  );

  const generatedA=generatePortable(frozenA);
  const generatedB=generatePortable(frozenB);
  exactJson(
    generatedA.artifact,generatedB.artifact,
    "F5-F3 independent producers generate byte-identical portable authority",
  );

  executeGeneratedArtifact(generatedA.artifact);
  executeGeneratedArtifact(generatedB.artifact);
  negativeControls(frozenA);
  staticGeneratorGuard();
  staticReceiverIdentityGuard();

  console.log([
    "MTS v0.13 F5-F3:",
    "FULL_F4_COMPATIBLE_GENERATED_AUTHORITY=GREEN_SCOPED_RESEARCH",
    "FUNCTION_ABSENT_AT_FREEZE=YES",
    "NAME_AUTHORITY_ABSENT_AT_FREEZE=YES",
    "POST_FREEZE_DICTIONARY_EXTENSION=YES",
    "POST_FREEZE_SOURCE_GROUPING=YES",
    "POST_FREEZE_CONTINUATIONS=2",
    "FROZEN_STRUCTURAL_ADMISSION=GREEN",
    "EXPLICIT_PUBLICATION=YES",
    "SECOND_MEMORY_EXECUTION=GREEN",
    "UNCHANGED_F4_RECEIVER_SOURCE=EXACT",
    "GENERATOR_NAME_SPECIFIC_BRANCHES=0",
    "NEGATIVE_CONTROLS=3",
    "INDEPENDENT_PRODUCER_MEMORIES=2",
    "INDEPENDENT_RECEIVER_MEMORIES=2",
    "GLOBAL_E3=OPEN",
    "GLOBAL_E4=OPEN",
    "FULL_SELF_HOSTED=NOT_CLAIMED",
    "PRODUCTION_UNCHANGED",
  ].join(" "));
}
main();
