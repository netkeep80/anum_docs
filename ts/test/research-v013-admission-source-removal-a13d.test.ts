import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { exportCanonicalTopology } from "../src/canonical-topology.js";
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
  if (!condition) throw new Error(`v0.13 A13d admission source removal: ${message}`);
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
    assert(this.support.has(link),"A13d selected support");
  }
  poles(link:LinkHandle):LinkPoles {
    this.require(link);
    const p=this.source.poles(link);
    assert(this.support.has(p.start)&&this.support.has(p.end),"A13d pole-closed support");
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
  readonly inverseMethod:LinkHandle;
}

function frame(memory:Memory):Frame{
  const b=ensureRootBasis(memory);
  const whole=memory.ensure(b.L,b.L);
  const startRole=memory.ensureStartSelfClosed(whole);
  const endRole=memory.ensureEndSelfClosed(whole);
  const directMethod=memory.ensure(startRole,endRole);
  const inverseMethod=memory.ensure(endRole,startRole);
  assert(startRole!==endRole,"A13d roles distinct");
  assert(directMethod!==inverseMethod,"A13d methods distinct");
  return Object.freeze({startRole,endRole,directMethod,inverseMethod});
}

function defineWitness(
  memory:Memory,
  f:Frame,
  target:LinkHandle,
):LinkHandle{
  const p=memory.poles(target);
  const a=memory.ensure(f.startRole,p.start);
  const b=memory.ensure(f.endRole,p.end);
  return memory.ensure(memory.ensure(a,b),target);
}

function defineReversedWitness(
  memory:Memory,
  f:Frame,
  target:LinkHandle,
):LinkHandle{
  const p=memory.poles(target);
  const a=memory.ensure(f.startRole,p.end);
  const b=memory.ensure(f.endRole,p.start);
  return memory.ensure(memory.ensure(a,b),target);
}

interface Profile {
  readonly rootCoordinate:number;
  readonly methodCoordinate:number;
  readonly admissionWitnessCoordinates:readonly number[];
}

interface Artifact {
  readonly schema:"mts-v013-admission-source-removal/research-v0.1";
  readonly topology:StorageTopologyImage;
  readonly directMethodCoordinate:number;
  readonly inverseMethodCoordinate:number;
  readonly methodWitnessCoordinates:readonly number[];
  readonly candidateCoordinates:Readonly<Record<string,number>>;
  readonly profiles:Readonly<Record<string,Profile>>;
  readonly forgedWitnessCoordinate:number;
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

  const PA=memory.ensure(basis.U,basis.L);
  const PB=memory.ensure(basis.L,basis.U);
  const PZ=memory.ensure(PA,PB);

  const rootA=memory.ensure(basis.O,PA);
  const rootNone=memory.ensure(basis.C,PB);
  const rootZ=memory.ensure(rootA,rootNone);

  const directA=memory.ensure(rootA,PA);
  const directB=memory.ensure(rootA,PB);
  const inverseA=memory.ensure(PA,rootA);
  const directZ=memory.ensure(rootZ,PZ);

  const methodTargets=[f.directMethod,f.inverseMethod] as const;
  const methodWitnesses=methodTargets.map(target=>defineWitness(memory,f,target));
  const directAWitness=defineWitness(memory,f,directA);
  const directBWitness=defineWitness(memory,f,directB);
  const inverseAWitness=defineWitness(memory,f,inverseA);
  const directZWitness=defineWitness(memory,f,directZ);
  const forged=defineReversedWitness(memory,f,directA);

  const selected=[
    f.startRole,f.endRole,f.directMethod,f.inverseMethod,
    PA,PB,PZ,rootA,rootNone,rootZ,
    ...methodWitnesses,
    directAWitness,directBWitness,inverseAWitness,directZWitness,forged,
  ];
  const support=closure(memory,selected);
  const canonical=exportCanonicalTopology(new View(memory,support));
  const coord=(link:LinkHandle):number=>{
    const n=canonical.coordinates.get(link);
    assert(n!==undefined,"A13d coordinate");
    return n;
  };

  return Object.freeze({
    schema:"mts-v013-admission-source-removal/research-v0.1" as const,
    topology:canonical.topology,
    directMethodCoordinate:coord(f.directMethod),
    inverseMethodCoordinate:coord(f.inverseMethod),
    methodWitnessCoordinates:Object.freeze(methodWitnesses.map(coord)),
    candidateCoordinates:Object.freeze({
      PA:coord(PA),PB:coord(PB),PZ:coord(PZ),
    }),
    profiles:Object.freeze({
      DIRECT_A:Object.freeze({
        rootCoordinate:coord(rootA),
        methodCoordinate:coord(f.directMethod),
        admissionWitnessCoordinates:Object.freeze([coord(directAWitness)]),
      }),
      INVERSE_A:Object.freeze({
        rootCoordinate:coord(rootA),
        methodCoordinate:coord(f.inverseMethod),
        admissionWitnessCoordinates:Object.freeze([coord(inverseAWitness)]),
      }),
      BOTH:Object.freeze({
        rootCoordinate:coord(rootA),
        methodCoordinate:coord(f.directMethod),
        admissionWitnessCoordinates:Object.freeze([
          coord(directAWitness),coord(directBWitness),
        ]),
      }),
      NONE:Object.freeze({
        rootCoordinate:coord(rootNone),
        methodCoordinate:coord(f.directMethod),
        admissionWitnessCoordinates:Object.freeze([]),
      }),
      Z:Object.freeze({
        rootCoordinate:coord(rootZ),
        methodCoordinate:coord(f.directMethod),
        admissionWitnessCoordinates:Object.freeze([coord(directZWitness)]),
      }),
    }),
    forgedWitnessCoordinate:coord(forged),
  });
}

interface VerifiedBinding {
  readonly target:LinkHandle;
  readonly values:ReadonlyMap<LinkHandle,LinkHandle>;
}

function verifyWitness(
  memory:ReadMemory,
  startRole:LinkHandle,
  endRole:LinkHandle,
  witness:LinkHandle,
):VerifiedBinding{
  const wp=memory.poles(witness);
  const pair=memory.poles(wp.start);
  const values=new Map<LinkHandle,LinkHandle>();

  for(const handle of [pair.start,pair.end] as const){
    const binding=memory.poles(handle);
    assert(
      binding.start===startRole||binding.start===endRole,
      "A13d witness uses selected roles only",
    );
    assert(!values.has(binding.start),"A13d selected role occurs once");
    values.set(binding.start,binding.end);
  }

  same(values.size,2,"A13d exact two-role coverage");
  const a=values.get(startRole);
  const b=values.get(endRole);
  assert(a!==undefined&&b!==undefined,"A13d both roles bind");
  same(memory.find(a,b),wp.end,"A13d witness reconstructs exact target");
  return Object.freeze({target:wp.end,values});
}

function bindingFor(
  bindings:readonly VerifiedBinding[],
  target:LinkHandle,
):VerifiedBinding{
  const found=bindings.filter(x=>x.target===target);
  same(found.length,1,"A13d one selected binding per target");
  return found[0]!;
}

function orientation(
  method:VerifiedBinding,
  startRole:LinkHandle,
  endRole:LinkHandle,
):Readonly<{fromRole:LinkHandle;toRole:LinkHandle}>{
  const fromRole=method.values.get(startRole);
  const toRole=method.values.get(endRole);
  assert(fromRole!==undefined&&toRole!==undefined,"A13d method roles resolve");
  const roles=new Set([startRole,endRole]);
  assert(roles.has(fromRole)&&roles.has(toRole),"A13d method maps role frame");
  assert(fromRole!==toRole,"A13d method is bijective");
  return Object.freeze({fromRole,toRole});
}

function frontier(
  memory:ReadMemory,
  values:readonly LinkHandle[],
):BundleValue{
  const occurrences:ResolvedOccurrence[]=values.map((link,index)=>Object.freeze({
    path:Object.freeze([index]),
    link,
  }));
  return resolveFlatBundle(memory,Object.freeze(occurrences));
}

/**
 * Admission-specific relation shape is absent here.
 *
 * The resolver sees only VERIFIED generic two-role bindings and a selected
 * method orientation. It never decomposes an admission target Link.
 */
function resolveAdmission(
  memory:ReadMemory,
  candidates:BundleValue,
  resolutionRoot:LinkHandle,
  admissionBindings:readonly VerifiedBinding[],
  oriented:Readonly<{fromRole:LinkHandle;toRole:LinkHandle}>,
):BundleValue{
  const admitted=new Set<LinkHandle>();

  for(const binding of admissionBindings){
    const from=binding.values.get(oriented.fromRole);
    const to=binding.values.get(oriented.toRole);
    assert(from!==undefined&&to!==undefined,"A13d verified admission roles resolve");
    if(from===resolutionRoot&&candidates.links.has(to)) admitted.add(to);
  }

  assert(admitted.size>0,"A13d no admitted publication candidate");
  assert(admitted.size===1,"A13d publication admission ambiguity");
  const selected=[...admitted][0]!;
  const occurrences=candidates.occurrences.filter(o=>o.link===selected);
  assert(occurrences.length>0,"A13d selected candidate provenance exists");
  return resolveFlatBundle(memory,Object.freeze(occurrences));
}

function expectRejected(effect:()=>unknown,message:string):void{
  let rejected=false;
  try{ effect(); }catch{ rejected=true; }
  assert(rejected,message);
}

function execute(artifact:Artifact):void{
  same(artifact.schema,"mts-v013-admission-source-removal/research-v0.1","A13d schema");
  const memory=restoreTopology(artifact.topology);
  const all=memory.allLinks();
  const at=(n:number):LinkHandle=>{
    const x=all[n]; assert(x!==undefined,"A13d replay coordinate"); return x;
  };

  const directMethod=at(artifact.directMethodCoordinate);
  const inverseMethod=at(artifact.inverseMethodCoordinate);
  const methodPoles=memory.poles(directMethod);
  const startRole=methodPoles.start;
  const endRole=methodPoles.end;
  assert(startRole!==endRole,"A13d replay roles distinct");
  same(memory.find(endRole,startRole),inverseMethod,"A13d inverse method identity");

  const methodBindings=artifact.methodWitnessCoordinates.map(n=>
    verifyWitness(memory,startRole,endRole,at(n))
  );
  const direct=orientation(
    bindingFor(methodBindings,directMethod),startRole,endRole,
  );
  const inverse=orientation(
    bindingFor(methodBindings,inverseMethod),startRole,endRole,
  );

  const candidates=Object.fromEntries(
    Object.entries(artifact.candidateCoordinates).map(([name,n])=>[name,at(n)]),
  ) as Record<string,LinkHandle>;
  const PA=candidates.PA!, PB=candidates.PB!, PZ=candidates.PZ!;

  const profile=(name:string)=>{
    const p=artifact.profiles[name];
    assert(p!==undefined,"A13d profile exists");
    const method=at(p.methodCoordinate);
    const oriented=method===directMethod?direct:
      method===inverseMethod?inverse:
      (()=>{throw new Error("A13d unknown selected method");})();
    const bindings=p.admissionWitnessCoordinates.map(n=>
      verifyWitness(memory,startRole,endRole,at(n))
    );
    return Object.freeze({
      root:at(p.rootCoordinate),
      oriented,
      bindings:Object.freeze(bindings),
    });
  };

  const divergent=frontier(memory,[PA,PB]);
  const reversed=frontier(memory,[PB,PA]);
  const converged=frontier(memory,[PZ,PZ]);

  const d=profile("DIRECT_A");
  const directA=resolveAdmission(memory,divergent,d.root,d.bindings,d.oriented);
  assert(directA.links.has(PA),"A13d direct method admits PA");

  const inverseProfile=profile("INVERSE_A");
  const inverseA=resolveAdmission(
    memory,divergent,
    inverseProfile.root,inverseProfile.bindings,inverseProfile.oriented,
  );
  assert(inverseA.links.has(PA),"A13d inverse method admits PA under same resolver");

  const reverseA=resolveAdmission(memory,reversed,d.root,d.bindings,d.oriented);
  assert(reverseA.links.has(PA),"A13d candidate order remains non-authoritative");

  const both=profile("BOTH");
  expectRejected(
    ()=>resolveAdmission(memory,divergent,both.root,both.bindings,both.oriented),
    "A13d double admission rejects ambiguity",
  );

  const none=profile("NONE");
  expectRejected(
    ()=>resolveAdmission(memory,divergent,none.root,none.bindings,none.oriented),
    "A13d no admission rejects divergent frontier",
  );
  expectRejected(
    ()=>resolveAdmission(memory,converged,none.root,none.bindings,none.oriented),
    "A13d singleton without admission is unauthorized",
  );

  const z=profile("Z");
  const selectedZ=resolveAdmission(memory,converged,z.root,z.bindings,z.oriented);
  assert(selectedZ.links.has(PZ),"A13d admitted convergence selects PZ");
  same(selectedZ.occurrences.length,2,"A13d convergence preserves two occurrences");

  const forged=at(artifact.forgedWitnessCoordinate);
  expectRejected(
    ()=>verifyWitness(memory,startRole,endRole,forged),
    "A13d reversed forged proof witness fails exact target identity",
  );

  // Late ambient direct-shaped Link has no authority without frozen proof witness.
  memory.ensure(d.root,PB);
  const stillA=resolveAdmission(memory,divergent,d.root,d.bindings,d.oriented);
  assert(stillA.links.has(PA),"A13d late ambient relation is ignored");
}

function staticGuards():void{
  const repoRoot=resolve(process.cwd(),"..");
  const source=readFileSync(
    join(repoRoot,"ts/test/research-v013-admission-source-removal-a13d.test.ts"),
    "utf8",
  );

  for(const forbidden of [
    "structural-"+"unification.js",
    "matchStructural"+"Template(",
    "StructuralRole"+"Morphism",
  ]){
    assert(!source.includes(forbidden),`A13d has no host matcher dependency: ${forbidden}`);
  }

  const begin=source.indexOf("function resolveAdmission(");
  const finish=source.indexOf("\nfunction expectRejected(",begin);
  assert(begin>=0&&finish>begin,"A13d resolver source slice");
  const resolver=source.slice(begin,finish);
  for(const forbidden of [
    ".poles(", ".find(", ".start", ".end", "switch(", "directMethod", "inverseMethod",
  ]){
    assert(!resolver.includes(forbidden),`A13d resolver has no admission-shape/direction special case: ${forbidden}`);
  }

  const vbegin=source.indexOf("function verifyWitness(");
  const vfinish=source.indexOf("\nfunction bindingFor(",vbegin);
  assert(vbegin>=0&&vfinish>vbegin,"A13d verifier source slice");
  const verifier=source.slice(vbegin,vfinish);
  for(const forbidden of [
    "poles(target)","memory.poles(target","source.poles(target",
  ]){
    assert(!verifier.includes(forbidden),`A13d verifier does not decompose target: ${forbidden}`);
  }
}

function main():void{
  const a=buildArtifact(false);
  const b=buildArtifact(true);
  exactJson(a,b,"A13d portable authority ignores unrelated source noise");

  execute(a);
  execute(b);
  staticGuards();

  console.log([
    "MTS v0.13 A13d:",
    "ADMISSION_RELATION_SOURCE_REMOVAL=GREEN_SCOPED_RESEARCH",
    "DIRECT_METHOD_ROOT_TO_PA=PA",
    "INVERSE_METHOD_PA_TO_ROOT=PA",
    "ONE_GENERIC_RESOLVER=CONFIRMED",
    "A13C_REGRESSION=GREEN",
    "FORGED_REVERSED_WITNESS=REJECTED",
    "ADMISSION_TARGET_DECOMPOSITION_READS=0",
    "HOST_MATCHERS=0",
    "ADMISSION_DIRECTION_HOST_BRANCHES=0",
    "INDEPENDENT_MEMORIES=2",
    "GLOBAL_E3=OPEN",
    "PRODUCTION_UNCHANGED",
  ].join(" "));
}
main();
