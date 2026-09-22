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
  if (!condition) throw new Error(`v0.13 A13c publication admission: ${message}`);
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
    assert(this.support.has(link),"A13c selected support");
  }
  poles(link:LinkHandle):LinkPoles {
    this.require(link);
    const p=this.source.poles(link);
    assert(this.support.has(p.start)&&this.support.has(p.end),"A13c pole-closed support");
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

interface Profile {
  readonly rootCoordinate:number;
  readonly admissionCoordinates:readonly number[];
}

interface Artifact {
  readonly schema:"mts-v013-publication-admission/research-v0.1";
  readonly topology:StorageTopologyImage;
  readonly candidateCoordinates:Readonly<Record<string,number>>;
  readonly profiles:Readonly<Record<string,Profile>>;
}

function buildArtifact(noise:boolean):Artifact{
  const memory=new Memory();
  const b=ensureRootBasis(memory);
  if(noise){
    const n0=memory.ensure(b.C,b.U);
    const n1=memory.ensure(n0,b.L);
    memory.ensure(b.O,n1);
  }

  const PA=memory.ensure(b.U,b.L);
  const PB=memory.ensure(b.L,b.U);
  const PZ=memory.ensure(PA,PB);

  const rootA=memory.ensure(b.O,PA);
  const rootBoth=memory.ensure(b.C,PB);
  const rootNone=memory.ensure(rootA,rootBoth);
  const rootZ=memory.ensure(rootBoth,rootA);

  const admitA=memory.ensure(rootA,PA);
  const admitBothA=memory.ensure(rootBoth,PA);
  const admitBothB=memory.ensure(rootBoth,PB);
  const admitZ=memory.ensure(rootZ,PZ);

  const roots=[
    PA,PB,PZ,
    rootA,rootBoth,rootNone,rootZ,
    admitA,admitBothA,admitBothB,admitZ,
  ];
  const support=closure(memory,roots);
  const canonical=exportCanonicalTopology(new View(memory,support));
  const coord=(link:LinkHandle):number=>{
    const n=canonical.coordinates.get(link);
    assert(n!==undefined,"A13c coordinate");
    return n;
  };

  return Object.freeze({
    schema:"mts-v013-publication-admission/research-v0.1" as const,
    topology:canonical.topology,
    candidateCoordinates:Object.freeze({
      PA:coord(PA),PB:coord(PB),PZ:coord(PZ),
    }),
    profiles:Object.freeze({
      A:Object.freeze({
        rootCoordinate:coord(rootA),
        admissionCoordinates:Object.freeze([coord(admitA)]),
      }),
      BOTH:Object.freeze({
        rootCoordinate:coord(rootBoth),
        admissionCoordinates:Object.freeze([coord(admitBothA),coord(admitBothB)]),
      }),
      NONE:Object.freeze({
        rootCoordinate:coord(rootNone),
        admissionCoordinates:Object.freeze([]),
      }),
      Z:Object.freeze({
        rootCoordinate:coord(rootZ),
        admissionCoordinates:Object.freeze([coord(admitZ)]),
      }),
    }),
  });
}

interface Replay {
  readonly memory:Memory;
  readonly candidates:Readonly<Record<string,LinkHandle>>;
  readonly profile:(name:string)=>Readonly<{root:LinkHandle; admissions:readonly LinkHandle[]}>;
}

function replay(artifact:Artifact):Replay{
  same(artifact.schema,"mts-v013-publication-admission/research-v0.1","A13c schema");
  const memory=restoreTopology(artifact.topology);
  const all=memory.allLinks();
  const at=(n:number):LinkHandle=>{
    const x=all[n]; assert(x!==undefined,"A13c replay coordinate"); return x;
  };
  return Object.freeze({
    memory,
    candidates:Object.freeze(Object.fromEntries(
      Object.entries(artifact.candidateCoordinates).map(([name,n])=>[name,at(n)]),
    )),
    profile:(name:string)=>{
      const p=artifact.profiles[name];
      assert(p!==undefined,"A13c profile");
      return Object.freeze({
        root:at(p.rootCoordinate),
        admissions:Object.freeze(p.admissionCoordinates.map(at)),
      });
    },
  });
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

function resolvePublication(
  memory:ReadMemory,
  candidates:BundleValue,
  root:LinkHandle,
  admissions:readonly LinkHandle[],
):BundleValue{
  const admitted=new Set<LinkHandle>();
  for(const evidence of admissions){
    const p=memory.poles(evidence);
    same(p.start,root,"A13c admission belongs to selected root");
    if(candidates.links.has(p.end)) admitted.add(p.end);
  }

  assert(admitted.size>0,"A13c no admitted publication candidate");
  assert(admitted.size===1,"A13c publication admission ambiguity");
  const selected=[...admitted][0]!;

  const occurrences=candidates.occurrences.filter(o=>o.link===selected);
  assert(occurrences.length>0,"A13c selected admission has candidate provenance");
  return resolveFlatBundle(memory,Object.freeze(occurrences));
}

function expectRejected(effect:()=>unknown,message:string):void{
  let rejected=false;
  try{ effect(); }catch{ rejected=true; }
  assert(rejected,message);
}

function execute(artifact:Artifact):void{
  const r=replay(artifact);
  const PA=r.candidates.PA!;
  const PB=r.candidates.PB!;
  const PZ=r.candidates.PZ!;

  const divergent=frontier(r.memory,[PA,PB]);
  const reversed=frontier(r.memory,[PB,PA]);
  const converged=frontier(r.memory,[PZ,PZ]);

  const A=r.profile("A");
  const BOTH=r.profile("BOTH");
  const NONE=r.profile("NONE");
  const Z=r.profile("Z");

  const selected=resolvePublication(r.memory,divergent,A.root,A.admissions);
  same(selected.links.size,1,"A13c select-A cardinality");
  assert(selected.links.has(PA),"A13c explicit admission selects PA");

  const selectedReverse=resolvePublication(r.memory,reversed,A.root,A.admissions);
  assert(selectedReverse.links.has(PA),"A13c candidate order cannot change admission");
  exactJson(
    [...selected.links],
    [...selectedReverse.links],
    "A13c forward/reverse candidate order same extensional selection",
  );

  expectRejected(
    ()=>resolvePublication(r.memory,divergent,BOTH.root,BOTH.admissions),
    "A13c double admission rejects ambiguity",
  );
  expectRejected(
    ()=>resolvePublication(r.memory,divergent,NONE.root,NONE.admissions),
    "A13c no admission rejects divergent frontier",
  );
  expectRejected(
    ()=>resolvePublication(r.memory,converged,NONE.root,NONE.admissions),
    "A13c singleton candidate without admission is unauthorized",
  );

  const selectedZ=resolvePublication(r.memory,converged,Z.root,Z.admissions);
  same(selectedZ.links.size,1,"A13c converged admitted publication one Link");
  assert(selectedZ.links.has(PZ),"A13c explicit admission selects converged PZ");
  same(selectedZ.occurrences.length,2,"A13c converged publication preserves provenance");

  // Late live admission after frozen A profile selection must be invisible.
  r.memory.ensure(A.root,PB);
  const stillA=resolvePublication(r.memory,divergent,A.root,A.admissions);
  same(stillA.links.size,1,"A13c late live admission does not alter frozen profile");
  assert(stillA.links.has(PA),"A13c frozen profile still selects PA");
}

function staticResolverGuard():void{
  const repoRoot=resolve(process.cwd(),"..");
  const source=readFileSync(
    join(repoRoot,"ts/test/research-v013-publication-admission-a13c.test.ts"),
    "utf8",
  );
  const start=source.indexOf("function resolvePublication(");
  const end=source.indexOf("function expectRejected(",start);
  assert(start>=0&&end>start,"A13c resolver source slice");
  const kernel=source.slice(start,end);
  for(const forbidden of [
    ".outgoing(","switch(","lastWriter","last-writer","sort(","priority",
  ]){
    assert(!kernel.includes(forbidden),`A13c resolver excludes ${forbidden}`);
  }
}

function main():void{
  const a=buildArtifact(false);
  const b=buildArtifact(true);
  exactJson(a,b,"A13c frozen admission authority ignores unrelated source noise");

  execute(a);
  execute(b);
  staticResolverGuard();

  console.log([
    "MTS v0.13 A13c:",
    "PUBLICATION_ADMISSION=GREEN_SCOPED_RESEARCH",
    "DIVERGENT_FRONTIER_EXPLICIT_A_SELECTS_PA=CONFIRMED",
    "CANDIDATE_ORDER_NON_AUTHORITATIVE=CONFIRMED",
    "DOUBLE_ADMISSION=AMBIGUITY_REJECTED",
    "NO_ADMISSION=REJECTED",
    "SINGLETON_WITHOUT_ADMISSION=REJECTED",
    "CONVERGED_PZ_OCCURRENCES=2",
    "LATE_AMBIENT_ADMISSION=IGNORED",
    "HOST_PRIORITY=0",
    "INDEPENDENT_AUTHORITIES=2",
    "GLOBAL_E3=OPEN",
    "PRODUCTION_UNCHANGED",
  ].join(" "));
}
main();
