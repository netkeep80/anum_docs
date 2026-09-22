import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { exportCanonicalTopology } from "../src/canonical-topology.js";
import {
  materializeExactSequence,
  readExactSequence,
} from "../src/exact-sequence.js";
import {
  Memory,
  ensureRootBasis,
  type EnumerableReadMemory,
  type LinkHandle,
  type LinkPoles,
  type ReadMemory,
} from "../src/memory.js";
import {
  restoreTopology,
  type StorageTopologyImage,
} from "../src/persistence-topology.js";
import {
  resolveFlatBundle,
  type BundleValue,
  type ResolvedOccurrence,
} from "../src/value-bundle.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.13 F5-F1 self-generated admission: ${message}`);
}
function same<T>(actual:T, expected:T, message:string):void {
  assert(Object.is(actual,expected), `${message}: values differ`);
}
function exactJson(actual:unknown, expected:unknown, message:string):void {
  same(JSON.stringify(actual),JSON.stringify(expected),message);
}

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
    assert(this.support.has(link),"F5-F1 selected support");
  }
  poles(link:LinkHandle):LinkPoles {
    this.require(link);
    const p=this.source.poles(link);
    assert(this.support.has(p.start)&&this.support.has(p.end),"F5-F1 pole-closed support");
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
function frame(memory:Memory):Frame{
  const b=ensureRootBasis(memory);
  return Object.freeze({
    startRole:b.O,
    endRole:b.C,
    directMethod:b.L,
  });
}

function defineWitness(memory:Memory,f:Frame,target:LinkHandle):LinkHandle{
  const p=memory.poles(target);
  const a=memory.ensure(f.startRole,p.start);
  const b=memory.ensure(f.endRole,p.end);
  return memory.ensure(memory.ensure(a,b),target);
}

interface Artifact {
  readonly schema:"mts-v013-self-generated-admission-f5-f1/research-v0.1";
  readonly topology:StorageTopologyImage;
  readonly requestCoordinate:number;
  readonly resolutionRootCoordinate:number;
  readonly oldCandidateCoordinate:number;
  readonly directMethodCoordinate:number;
  readonly methodWitnessCoordinate:number;
  readonly oldAdmissionWitnessCoordinate:number;
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

  const resolutionRoot=memory.ensure(basis.U,basis.L);
  const oldCandidate=memory.ensure(basis.C,basis.U);
  const oldAdmission=memory.ensure(resolutionRoot,oldCandidate);
  const methodWitness=defineWitness(memory,f,f.directMethod);
  const oldAdmissionWitness=defineWitness(memory,f,oldAdmission);

  const nameCarrier=memory.ensure(basis.O,basis.U);
  const fnStart=memory.ensure(basis.C,basis.L);
  const fnEnd=memory.ensure(basis.U,basis.C);
  const argument=memory.ensure(basis.L,basis.C);
  const result1=memory.ensure(basis.O,fnStart);
  const result2=memory.ensure(basis.C,fnEnd);

  assert(memory.find(fnStart,fnEnd)===undefined,
    "F5-F1 generated function Link absent before freeze");

  const request=materializeExactSequence(memory,[
    nameCarrier,fnStart,fnEnd,argument,result1,result2,
  ]);

  const support=closure(memory,[
    request,resolutionRoot,oldCandidate,
    f.directMethod,methodWitness,oldAdmissionWitness,
  ]);
  const canonical=exportCanonicalTopology(new View(memory,support));
  const coord=(link:LinkHandle):number=>{
    const n=canonical.coordinates.get(link);
    assert(n!==undefined,"F5-F1 coordinate");
    return n;
  };

  return Object.freeze({
    schema:"mts-v013-self-generated-admission-f5-f1/research-v0.1" as const,
    topology:canonical.topology,
    requestCoordinate:coord(request),
    resolutionRootCoordinate:coord(resolutionRoot),
    oldCandidateCoordinate:coord(oldCandidate),
    directMethodCoordinate:coord(f.directMethod),
    methodWitnessCoordinate:coord(methodWitness),
    oldAdmissionWitnessCoordinate:coord(oldAdmissionWitness),
  });
}

interface Binding {
  readonly target:LinkHandle;
  readonly values:ReadonlyMap<LinkHandle,LinkHandle>;
}
function verifyWitness(
  memory:ReadMemory,
  f:Frame,
  witness:LinkHandle,
):Binding{
  const wp=memory.poles(witness);
  const pair=memory.poles(wp.start);
  const values=new Map<LinkHandle,LinkHandle>();
  for(const h of [pair.start,pair.end] as const){
    const b=memory.poles(h);
    assert(
      b.start===f.startRole||b.start===f.endRole,
      "F5-F1 witness roles",
    );
    assert(!values.has(b.start),"F5-F1 unique role");
    values.set(b.start,b.end);
  }
  const s=values.get(f.startRole), e=values.get(f.endRole);
  assert(s!==undefined&&e!==undefined,"F5-F1 witness complete");
  same(memory.find(s,e),wp.end,"F5-F1 witness reconstructs exact target");
  return Object.freeze({target:wp.end,values});
}

function orientation(
  method:Binding,
  f:Frame,
):Readonly<{fromRole:LinkHandle;toRole:LinkHandle}>{
  const fromRole=method.values.get(f.startRole);
  const toRole=method.values.get(f.endRole);
  assert(fromRole!==undefined&&toRole!==undefined,"F5-F1 method orientation");
  return Object.freeze({fromRole,toRole});
}

function frontier(memory:ReadMemory,values:readonly LinkHandle[]):BundleValue{
  const occurrences:ResolvedOccurrence[]=values.map((link,index)=>Object.freeze({
    path:Object.freeze([index]),
    link,
  }));
  return resolveFlatBundle(memory,Object.freeze(occurrences));
}

function resolveAdmission(
  memory:ReadMemory,
  candidates:BundleValue,
  resolutionRoot:LinkHandle,
  bindings:readonly Binding[],
  oriented:Readonly<{fromRole:LinkHandle;toRole:LinkHandle}>,
):BundleValue{
  const admitted=new Set<LinkHandle>();
  for(const binding of bindings){
    const from=binding.values.get(oriented.fromRole);
    const to=binding.values.get(oriented.toRole);
    assert(from!==undefined&&to!==undefined,"F5-F1 admission binding complete");
    if(from===resolutionRoot&&candidates.links.has(to)) admitted.add(to);
  }
  assert(admitted.size===1,"F5-F1 exactly one explicitly admitted candidate required");
  const selected=[...admitted][0]!;
  return resolveFlatBundle(
    memory,
    Object.freeze(candidates.occurrences.filter(o=>o.link===selected)),
  );
}

/**
 * Generic definition-shaped candidate generator.
 *
 * It knows only the fixed request carrier arity and ordinary Link construction.
 * It receives no resolution/admission root and creates no admission evidence.
 */
function generateCandidate(
  memory:Memory,
  request:LinkHandle,
):Readonly<{
  candidate:LinkHandle;
  fn:LinkHandle;
  application:LinkHandle;
  continuations:readonly LinkHandle[];
}>{
  const values=readExactSequence(memory,request).values;
  same(values.length,6,"F5-F1 request arity");
  const [nameCarrier,fnStart,fnEnd,argument,result1,result2]=values;
  assert(
    nameCarrier!==undefined&&fnStart!==undefined&&fnEnd!==undefined&&
    argument!==undefined&&result1!==undefined&&result2!==undefined,
    "F5-F1 complete generation request",
  );

  const fn=memory.ensure(fnStart,fnEnd);
  const application=memory.ensure(fn,argument);
  const c1=memory.ensure(application,result1);
  const c2=memory.ensure(application,result2);
  const candidate=materializeExactSequence(memory,[
    nameCarrier,fn,application,c1,c2,
  ]);
  return Object.freeze({
    candidate,fn,application,continuations:Object.freeze([c1,c2]),
  });
}

function expectRejected(effect:()=>unknown,message:string):void{
  let rejected=false;
  try{ effect(); }catch{ rejected=true; }
  assert(rejected,message);
}

interface RunResult {
  readonly generatedTopology:StorageTopologyImage;
  readonly invalidSelfApprovalWouldAccept:boolean;
}

function execute(artifact:Artifact):RunResult{
  same(
    artifact.schema,
    "mts-v013-self-generated-admission-f5-f1/research-v0.1",
    "F5-F1 schema",
  );
  const memory=restoreTopology(artifact.topology);
  const all=memory.allLinks();
  const at=(n:number):LinkHandle=>{
    const x=all[n]; assert(x!==undefined,"F5-F1 replay coordinate"); return x;
  };
  const f=frame(memory);
  const request=at(artifact.requestCoordinate);
  const resolutionRoot=at(artifact.resolutionRootCoordinate);
  const oldCandidate=at(artifact.oldCandidateCoordinate);
  const directMethod=at(artifact.directMethodCoordinate);

  // Frozen selected authority is captured before generation.
  const method=verifyWitness(memory,f,at(artifact.methodWitnessCoordinate));
  same(method.target,directMethod,"F5-F1 method witness target");
  const oriented=orientation(method,f);
  const oldAdmission=verifyWitness(
    memory,f,at(artifact.oldAdmissionWitnessCoordinate),
  );
  const frozenAdmissions=Object.freeze([oldAdmission]);

  const oldSelected=resolveAdmission(
    memory,frontier(memory,[oldCandidate]),
    resolutionRoot,frozenAdmissions,oriented,
  );
  assert(oldSelected.links.has(oldCandidate),"F5-F1 frozen control admission works");

  const before=memory.linkCount;
  const generated=generateCandidate(memory,request);
  assert(memory.linkCount>before,"F5-F1 runtime generation creates new Links");
  assert(
    frozenAdmissions.every(binding=>binding.target!==generated.candidate),
    "F5-F1 generated candidate was not named by frozen admission authority",
  );

  expectRejected(
    ()=>resolveAdmission(
      memory,frontier(memory,[generated.candidate]),
      resolutionRoot,frozenAdmissions,oriented,
    ),
    "F5-F1 frozen exact-candidate authority rejects new generated candidate",
  );

  // Late live admission is deliberately invisible to frozen selected authority.
  const lateAdmissionTarget=memory.ensure(resolutionRoot,generated.candidate);
  const lateWitness=defineWitness(memory,f,lateAdmissionTarget);
  expectRejected(
    ()=>resolveAdmission(
      memory,frontier(memory,[generated.candidate]),
      resolutionRoot,frozenAdmissions,oriented,
    ),
    "F5-F1 late ambient admission does not mutate frozen authority",
  );

  // Demonstrate the only exact-candidate escape hatch: expand authority after
  // seeing Dnew. This can accept, but is INVALID_SELF_APPROVAL by construction.
  const lateBinding=verifyWitness(memory,f,lateWitness);
  const expanded=resolveAdmission(
    memory,frontier(memory,[generated.candidate]),
    resolutionRoot,Object.freeze([...frozenAdmissions,lateBinding]),oriented,
  );
  const invalidSelfApprovalWouldAccept=expanded.links.has(generated.candidate);
  assert(invalidSelfApprovalWouldAccept,
    "F5-F1 moving authority boundary would accept generated candidate");

  return Object.freeze({
    generatedTopology:exportCanonicalTopology(memory).topology,
    invalidSelfApprovalWouldAccept,
  });
}

function staticGeneratorGuard():void{
  const repoRoot=resolve(process.cwd(),"..");
  const source=readFileSync(
    join(repoRoot,"ts/test/research-v013-self-generated-admission-f5-f1.test.ts"),
    "utf8",
  );
  const start=source.indexOf("function generateCandidate(");
  const end=source.indexOf("\nfunction expectRejected(",start);
  assert(start>=0&&end>start,"F5-F1 generator source slice");
  const generator=source.slice(start,end);
  for(const forbidden of [
    "resolutionRoot","defineWitness","Dictionary","buildV012","switch(",
    '"x"','"y"','"f"',"admission",
  ]){
    assert(!generator.includes(forbidden),
      `F5-F1 generator contains no authority/name-specific branch: ${forbidden}`);
  }
}

function main():void{
  const a=buildArtifact(false);
  const b=buildArtifact(true);
  exactJson(a,b,"F5-F1 frozen request/authority ignores unrelated source noise");

  const ar=execute(a);
  const br=execute(b);
  exactJson(
    ar.generatedTopology,
    br.generatedTopology,
    "F5-F1 independent Memories generate byte-identical canonical topology",
  );
  assert(ar.invalidSelfApprovalWouldAccept&&br.invalidSelfApprovalWouldAccept,
    "F5-F1 invalid moving-authority path is reproducible");
  staticGeneratorGuard();

  console.log([
    "MTS v0.13 F5-F1:",
    "SELF_GENERATED_UNKNOWN_CANDIDATE_ADMISSION=RED_CURRENT_ARCHITECTURE",
    "GENERIC_RUNTIME_CANDIDATE_GENERATION=CONFIRMED",
    "OLD_FROZEN_CONTROL_ADMISSION=GREEN",
    "NEW_CANDIDATE_FROZEN_EXACT_ADMISSION=REJECTED",
    "LATE_AMBIENT_ADMISSION=IGNORED",
    "EXPANDED_AUTHORITY_AFTER_GENERATION=INVALID_SELF_APPROVAL",
    "INDEPENDENT_MEMORIES=2",
    "MISSING=GENERIC_UNKNOWN_CANDIDATE_FORMATION_ADMISSION_LAW",
    "SELF_GENERATED=OPEN",
    "PRODUCTION_UNCHANGED",
  ].join(" "));
}
main();
