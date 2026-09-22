import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { exportCanonicalTopology } from "../src/canonical-topology.js";
import {
  defineDictionaryEffect,
  defineDictionaryScope,
  lookupScopedDictionary,
} from "../src/dictionary.js";
import { materializeExactSequence } from "../src/exact-sequence.js";
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
  if (!condition) throw new Error(`v0.13 FORMAL F4 self-extension: ${message}`);
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
    assert(this.support.has(link),"F4 selected support");
  }
  poles(link:LinkHandle):LinkPoles {
    this.require(link);
    const p=this.source.poles(link);
    assert(this.support.has(p.start)&&this.support.has(p.end),"F4 support pole-closed");
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
interface Artifact {
  readonly schema:"mts-v013-formal-self-extension/research-v0.1";
  readonly topology:StorageTopologyImage;
  readonly expressions:readonly PExpression[];
  readonly directMethod:number;
  readonly witnessCoordinates:readonly number[];
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
    form:coord(c,s.form,"F4 form coordinate"),
    dictionaryOccurrence:coord(c,s.dictionaryOccurrence,"F4 occurrence coordinate"),
    sliceContent:coord(c,s.sliceContent,"F4 slice content coordinate"),
    span:coord(c,s.span,"F4 span coordinate"),
    sliceEvidence:coord(c,s.sliceEvidence,"F4 slice evidence coordinate"),
    lexeme:coord(c,s.lexeme,"F4 lexeme coordinate"),
    resolution:coord(c,s.resolution,"F4 resolution coordinate"),
    selection:coord(c,s.selection,"F4 selection coordinate"),
  });
}
function packSource(
  c:ReadonlyMap<LinkHandle,number>, e:SourceFrontEndEvidence,
):PSource{
  return Object.freeze({
    content:coord(c,e.content,"F4 content coordinate"),
    source:coord(c,e.source,"F4 source coordinate"),
    dictionary:coord(c,e.dictionary,"F4 Dictionary coordinate"),
    grammar:coord(c,e.grammar,"F4 Grammar coordinate"),
    theory:coord(c,e.theory,"F4 Theory coordinate"),
    segments:Object.freeze(e.segments.map(s=>packSegment(c,s))),
    selectionSequence:coord(c,e.selectionSequence,"F4 selection sequence coordinate"),
    formSequence:coord(c,e.formSequence,"F4 form sequence coordinate"),
    grammarMembership:coord(c,e.grammarMembership,"F4 Grammar membership coordinate"),
    theoryMembership:coord(c,e.theoryMembership,"F4 Theory membership coordinate"),
  });
}

function defineWitness(memory:Memory,f:Frame,target:LinkHandle):LinkHandle{
  const p=memory.poles(target);
  const a=memory.ensure(f.startRole,p.start);
  const b=memory.ensure(f.endRole,p.end);
  return memory.ensure(memory.ensure(a,b),target);
}

interface BuiltExpression {
  readonly evidence:SourceFrontEndEvidence;
  readonly grouping:LinkHandle;
  readonly application:LinkHandle;
}
function buildExpression(
  memory:Memory,
  basis:RootBasis,
  f:Frame,
  dictionary:LinkHandle,
  grammar:LinkHandle,
  theory:LinkHandle,
  functionName:"x"|"y",
  functionLink:LinkHandle,
  argument:LinkHandle,
  openUse:LinkHandle,
  closeUse:LinkHandle,
  occurrences:ReadonlyMap<string,LinkHandle>,
):BuiltExpression{
  const forms=materializeExactSequence(
    memory,[functionLink,openUse,argument,closeUse],
  );
  const authority:V012SourceAuthority=Object.freeze({
    dictionary,grammar,theory,
    grammarMembership:memory.ensure(grammar,forms),
    theoryMembership:memory.ensure(theory,forms),
  });
  const content=materializeV012SourceContent(
    memory,basis,bytes(`${functionName}(a)`),
  );
  const source=defineSourceForm(memory,content);
  const evidence=buildV012SelectedSourceEvidence(
    memory,basis,source,[
      {start:0,end:1,form:functionLink,dictionaryOccurrence:occurrences.get(functionName)!},
      {start:1,end:2,form:openUse,dictionaryOccurrence:occurrences.get("(")!},
      {start:2,end:3,form:argument,dictionaryOccurrence:occurrences.get("a")!},
      {start:3,end:4,form:closeUse,dictionaryOccurrence:occurrences.get(")")!},
    ],authority,
  );
  const application=memory.ensure(functionLink,argument);
  const sourceStart=memory.ensure(f.startRole,evidence.segments[0]!.resolution);
  const sourceEnd=memory.ensure(f.endRole,evidence.segments[2]!.resolution);
  const pair=memory.ensure(sourceStart,sourceEnd);
  const descriptor=memory.ensure(evidence.formSequence,pair);
  return Object.freeze({
    evidence,
    grouping:memory.ensure(descriptor,application),
    application,
  });
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

function buildArtifact(noise:boolean):Artifact{
  const memory=new Memory();
  const basis=ensureRootBasis(memory);
  if(noise){
    const n0=memory.ensure(basis.U,basis.C);
    const n1=memory.ensure(n0,basis.O);
    memory.ensure(basis.L,n1);
  }
  const f=frame(memory);
  const fx=memory.ensure(basis.U,basis.L);
  const fy=memory.ensure(basis.L,basis.C);
  const arg=memory.ensure(basis.C,basis.U);
  const openUse=memory.ensure(basis.O,basis.U);
  const closeUse=memory.ensure(basis.C,basis.L);
  const b1=memory.ensure(basis.O,fx);
  const b2=memory.ensure(basis.C,fy);
  const b3=memory.ensure(fx,fy);

  assert(fx!==fy,"F4 unknown function Links differ");
  for(const x of [fx,fy]){
    assert(
      x!==basis.R&&x!==basis.O&&x!==basis.C&&x!==basis.L&&x!==basis.U,
      "F4 unknown function is outside root basis signs",
    );
  }

  let history=basis.R;
  let dictionary=defineDictionaryScope(memory,basis.R,history);
  const occurrences=new Map<string,LinkHandle>();
  for(const [name,value] of [
    ["x",fx],["y",fy],["(",openUse],[")",closeUse],["a",arg],
    ["b1",b1],["b2",b2],["b3",b3],
  ] as const){
    const next=defineName(memory,basis,dictionary,history,name,value);
    dictionary=next.dictionary; history=next.history;
    occurrences.set(name,next.occurrence);
  }

  const grammar=memory.ensure(openUse,closeUse);
  const theory=memory.ensure(closeUse,openUse);
  const xExpr=buildExpression(
    memory,basis,f,dictionary,grammar,theory,"x",fx,arg,openUse,closeUse,occurrences,
  );
  const yExpr=buildExpression(
    memory,basis,f,dictionary,grammar,theory,"y",fy,arg,openUse,closeUse,occurrences,
  );

  const xResult=memory.ensure(xExpr.application,b1);
  const yResult1=memory.ensure(yExpr.application,b2);
  const yResult2=memory.ensure(yExpr.application,b3);

  const targets=[
    f.directMethod,
    xExpr.application,xResult,
    yExpr.application,yResult1,yResult2,
  ] as const;
  const witnesses=targets.map(target=>defineWitness(memory,f,target));

  const roots=[
    ...evidenceRoots(xExpr.evidence),
    ...evidenceRoots(yExpr.evidence),
    xExpr.grouping,yExpr.grouping,f.directMethod,...witnesses,
  ];
  const support=closure(memory,roots);
  const canonical=exportCanonicalTopology(new View(memory,support));
  const c=canonical.coordinates;

  return Object.freeze({
    schema:"mts-v013-formal-self-extension/research-v0.1" as const,
    topology:canonical.topology,
    expressions:Object.freeze([
      Object.freeze({
        source:packSource(c,xExpr.evidence),
        grouping:coord(c,xExpr.grouping,"F4 x grouping coordinate"),
      }),
      Object.freeze({
        source:packSource(c,yExpr.evidence),
        grouping:coord(c,yExpr.grouping,"F4 y grouping coordinate"),
      }),
    ]),
    directMethod:coord(c,f.directMethod,"F4 direct method coordinate"),
    witnessCoordinates:Object.freeze(
      witnesses.map(w=>coord(c,w,"F4 proof witness coordinate")),
    ),
  });
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

function executeArtifact(artifact:Artifact):void{
  same(
    artifact.schema,
    "mts-v013-formal-self-extension/research-v0.1",
    "F4 schema",
  );
  const memory=restoreTopology(artifact.topology);
  const all=memory.allLinks();
  const f=frame(memory);
  const directMethod=at(all,artifact.directMethod);
  const bindings=artifact.witnessCoordinates.map(
    n=>verifyWitness(memory,f,at(all,n)),
  );
  same(bindings.length,6,"F4 six proof bindings");

  const xResult=executeExpression(
    memory,artifact.expressions[0]!,directMethod,bindings,
  );
  const yResult=executeExpression(
    memory,artifact.expressions[1]!,directMethod,bindings,
  );

  const dictionary=restoreSource(memory,artifact.expressions[0]!.source).dictionary;
  const b1=resolveName(memory,dictionary,"b1");
  const b2=resolveName(memory,dictionary,"b2");
  const b3=resolveName(memory,dictionary,"b3");
  assert(b1!==undefined&&b2!==undefined&&b3!==undefined,"F4 output names resolve");

  setSame(xResult.links,[b1],"F4 x(a)");
  setSame(yResult.links,[b2,b3],"F4 y(a)");
  same(xResult.links.size,1,"F4 x cardinality");
  same(yResult.links.size,2,"F4 y cardinality");
  same(resolveName(memory,dictionary,"z"),undefined,"F4 unknown z has no Use");
}

function expectRejected(effect:()=>unknown,message:string):void{
  let rejected=false;
  try{ effect(); }catch{ rejected=true; }
  assert(rejected,message);
}

function negativeControls(artifact:Artifact):void{
  const memory=restoreTopology(artifact.topology);
  const all=memory.allLinks();
  const f=frame(memory);
  const directMethod=at(all,artifact.directMethod);
  const bindings=artifact.witnessCoordinates.map(
    n=>verifyWitness(memory,f,at(all,n)),
  );

  const xPortable=artifact.expressions[0]!;
  const yPortable=artifact.expressions[1]!;
  const xEvidence=restoreSource(memory,xPortable.source);
  const yEvidence=restoreSource(memory,yPortable.source);
  const xSelected=replayV012SelectedSourceEvidence(
    memory,ensureRootBasis(memory),xEvidence,
  );
  const ySelected=replayV012SelectedSourceEvidence(
    memory,ensureRootBasis(memory),yEvidence,
  );
  const xGrouping=at(all,xPortable.grouping);
  const yGrouping=at(all,yPortable.grouping);

  expectRejected(
    ()=>groupedApplication(
      memory,xEvidence,xSelected,f,yGrouping,bindings,
    ),
    "F4 cross-source grouping fails closed",
  );

  {
    const xgp=memory.poles(xGrouping);
    const yApplication=memory.poles(yGrouping).end;
    const forged=memory.ensure(xgp.start,yApplication);
    expectRejected(
      ()=>groupedApplication(
        memory,xEvidence,xSelected,f,forged,bindings,
      ),
      "F4 application-target substitution fails closed",
    );
  }

  {
    const xApplication=memory.poles(xGrouping).end;
    const p=memory.poles(xApplication);
    const a=memory.ensure(f.startRole,p.end);
    const b=memory.ensure(f.endRole,p.start);
    const forged=memory.ensure(memory.ensure(a,b),xApplication);
    expectRejected(
      ()=>verifyWitness(memory,f,forged),
      "F4 reversed proof-binding values fail closed",
    );
  }

  same(ySelected.length,4,"F4 y source remains exact after negative controls");
  const yResult=evaluate(
    memory,f,directMethod,
    groupedApplication(memory,yEvidence,ySelected,f,yGrouping,bindings),
    bindings,
  );
  same(yResult.links.size,2,"F4 y behavior unchanged after forged controls");
}

function staticBranchGuard():void{
  const repoRoot=resolve(process.cwd(),"..");
  const source=readFileSync(
    join(repoRoot,"ts/test/research-v013-formal-self-extension-f4.test.ts"),
    "utf8",
  );
  const start=source.indexOf("function executeExpression(");
  const end=source.indexOf("function resolveName(",start);
  assert(start>=0&&end>start,"F4 generic receiver source slice");
  const kernel=source.slice(start,end);
  assert(!kernel.includes('"x"')&&!kernel.includes('"y"'),"F4 receiver has no x/y literals");
  assert(
    !kernel.includes('"b1"')&&!kernel.includes('"b2"')&&!kernel.includes('"b3"'),
    "F4 receiver has no result-name literals",
  );
  assert(!kernel.includes("switch ("),"F4 receiver has no form switch");
  assert(!kernel.includes("unifyStructuralTemplate"),"F4 receiver has no unifier");
  assert(!kernel.includes("canonicalByte"),"F4 receiver has no canonical-byte dispatch");
  assert(!kernel.includes("operatorAspect"),"F4 receiver has no operator-aspect gate");
}

function main():void{
  const a=buildArtifact(false);
  const b=buildArtifact(true);
  exactJson(a,b,"F4 portable authority ignores unrelated allocation noise");
  executeArtifact(a);
  executeArtifact(b);
  negativeControls(a);
  staticBranchGuard();

  console.log([
    "MTS v0.13 FORMAL F4:",
    "F_KERNEL_SELF_EXTENSION=GREEN_SCOPED_RESEARCH",
    "UNKNOWN_FUNCTION_FORMS=2",
    "X_RESULT_CARDINALITY=1",
    "Y_RESULT_CARDINALITY=2",
    "GENERIC_RECEIVER_FORM_BRANCHES=0",
    "HOST_MATCHERS=0",
    "STRUCTURAL_UNIFICATION=NOT_USED",
    "CANONICAL_BYTE_OPERATOR_ASPECT=NOT_USED",
    "INDEPENDENT_MEMORIES=2",
    "UNKNOWN_Z=NO_AUTHORITY",
    "NEGATIVE_CONTROLS=3",
    "PRODUCTION_FORMAL_EVALUATOR=UNCHANGED",
    "FULL_SELF_HOSTED=NOT_CLAIMED",
  ].join(" "));
}
main();
