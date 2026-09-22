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
  valuesEqual,
  type BundleValue,
  type ResolvedOccurrence,
} from "../src/value-bundle.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.13 A12 bundle continuation: ${message}`);
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
    assert(this.support.has(link),"A12 selected support");
  }
  poles(link:LinkHandle):LinkPoles {
    this.require(link);
    const p=this.source.poles(link);
    assert(this.support.has(p.start)&&this.support.has(p.end),"A12 pole-closed support");
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

interface Artifact {
  readonly schema:"mts-v013-bundle-continuation/research-v0.1";
  readonly topology:StorageTopologyImage;
  readonly applicationCoordinates:readonly number[];
  readonly continuationCoordinates:readonly number[];
  readonly named:Readonly<Record<string,number>>;
}

function buildArtifact(noise:boolean):Artifact{
  const memory=new Memory();
  const b=ensureRootBasis(memory);
  if(noise){
    const n0=memory.ensure(b.U,b.C);
    const n1=memory.ensure(n0,b.O);
    memory.ensure(b.L,n1);
  }

  const F=memory.ensure(b.U,b.L);
  const a=memory.ensure(b.L,b.U);
  const x=memory.ensure(b.O,F);
  const y=memory.ensure(b.C,F);
  const t=memory.ensure(F,b.O);
  const g=memory.ensure(b.O,b.U);
  const h=memory.ensure(b.C,b.L);
  const u=memory.ensure(g,b.C);
  const v=memory.ensure(h,b.O);
  const w=memory.ensure(g,h);
  const z=memory.ensure(u,v);
  const q=memory.ensure(w,z);

  const apps:LinkHandle[]=[];
  const edges:LinkHandle[]=[];
  const define=(fn:LinkHandle,arg:LinkHandle,...results:LinkHandle[]):void=>{
    const app=memory.ensure(fn,arg);
    apps.push(app);
    for(const result of results) edges.push(memory.ensure(app,result));
  };

  define(F,a,g,h);
  define(g,x,u);
  define(h,x,v,w);
  define(g,y,z);
  define(h,y,z);
  define(g,t);
  define(h,t,q);

  const roots=[...apps,...edges,F,a,x,y,t,g,h,u,v,w,z,q];
  const support=closure(memory,roots);
  const canonical=exportCanonicalTopology(new View(memory,support));
  const c=canonical.coordinates;
  const coord=(link:LinkHandle):number=>{
    const n=c.get(link);
    assert(n!==undefined,"A12 coordinate exists");
    return n;
  };

  return Object.freeze({
    schema:"mts-v013-bundle-continuation/research-v0.1" as const,
    topology:canonical.topology,
    applicationCoordinates:Object.freeze(apps.map(coord)),
    continuationCoordinates:Object.freeze(edges.map(coord)),
    named:Object.freeze(Object.fromEntries(
      Object.entries({F,a,x,y,t,g,h,u,v,w,z,q}).map(([name,link])=>[name,coord(link)]),
    )),
  });
}

interface Replay {
  readonly memory:Memory;
  readonly applications:ReadonlySet<LinkHandle>;
  readonly continuations:readonly LinkHandle[];
  readonly named:Readonly<Record<string,LinkHandle>>;
}

function replay(artifact:Artifact):Replay{
  same(artifact.schema,"mts-v013-bundle-continuation/research-v0.1","A12 schema");
  const memory=restoreTopology(artifact.topology);
  const all=memory.allLinks();
  const at=(n:number):LinkHandle=>{
    const x=all[n]; assert(x!==undefined,"A12 replay coordinate"); return x;
  };
  const named=Object.fromEntries(
    Object.entries(artifact.named).map(([name,n])=>[name,at(n)]),
  ) as Record<string,LinkHandle>;
  return Object.freeze({
    memory,
    applications:new Set(artifact.applicationCoordinates.map(at)),
    continuations:Object.freeze(artifact.continuationCoordinates.map(at)),
    named:Object.freeze(named),
  });
}

function continuations(
  replayed:Replay,
  state:LinkHandle,
  argument:LinkHandle,
):readonly LinkHandle[]{
  const app=replayed.memory.find(state,argument);
  if(app===undefined||!replayed.applications.has(app)) return Object.freeze([]);
  const results:LinkHandle[]=[];
  for(const edge of replayed.continuations){
    const p=replayed.memory.poles(edge);
    if(p.start===app) results.push(p.end);
  }
  return Object.freeze(results);
}

function stepOne(
  replayed:Replay,
  state:LinkHandle,
  argument:LinkHandle,
  parentPath:readonly number[],
):readonly ResolvedOccurrence[]{
  return Object.freeze(
    continuations(replayed,state,argument).map((link,index)=>
      Object.freeze({
        path:Object.freeze([...parentPath,index]),
        link,
      })
    ),
  );
}

function stepLink(
  replayed:Replay,
  state:LinkHandle,
  argument:LinkHandle,
):BundleValue{
  return resolveFlatBundle(
    replayed.memory,
    stepOne(replayed,state,argument,Object.freeze([])),
  );
}

function stepFrontier(
  replayed:Replay,
  frontier:BundleValue,
  argument:LinkHandle,
  schedule:"forward"|"reverse",
):BundleValue{
  const parents=[...frontier.occurrences];
  if(schedule==="reverse") parents.reverse();
  const next:ResolvedOccurrence[]=[];
  for(const parent of parents){
    next.push(...stepOne(replayed,parent.link,argument,parent.path));
  }
  return resolveFlatBundle(replayed.memory,Object.freeze(next));
}

function setSame(
  actual:ReadonlySet<LinkHandle>,
  expected:readonly LinkHandle[],
  message:string,
):void{
  same(actual.size,new Set(expected).size,`${message}: cardinality`);
  for(const x of expected) assert(actual.has(x),`${message}: missing Link`);
}

function provenance(
  replayed:Replay,
  bundle:BundleValue,
):readonly string[]{
  const index=new Map(
    replayed.memory.allLinks().map((link,i)=>[link,i] as const),
  );
  return Object.freeze(bundle.occurrences.map(o=>{
    const n=index.get(o.link);
    assert(n!==undefined,"A12 provenance Link coordinate");
    return `${o.path.join(".")}:${n}`;
  }).sort());
}

function exercise(artifact:Artifact):void{
  const r=replay(artifact);
  const n=r.named;
  for(const key of ["F","a","x","y","t","g","h","u","v","w","z","q"]){
    assert(n[key]!==undefined,`A12 named ${key}`);
  }

  const first=stepLink(r,n.F!,n.a!);
  setSame(first.links,[n.g!,n.h!],"A12 F(a)");
  same(first.occurrences.length,2,"A12 initial fanout");

  const forward=stepFrontier(r,first,n.x!,"forward");
  const reverse=stepFrontier(r,first,n.x!,"reverse");
  setSame(forward.links,[n.u!,n.v!,n.w!],"A12 branch fanout");
  same(forward.occurrences.length,3,"A12 second-step occurrence fanout");
  assert(valuesEqual(forward,reverse),"A12 schedule order preserves extensional result");
  exactJson(
    provenance(r,forward),
    provenance(r,reverse),
    "A12 schedule order preserves provenance semantics",
  );

  const converged=stepFrontier(r,first,n.y!,"forward");
  setSame(converged.links,[n.z!],"A12 converged extensional result");
  same(converged.occurrences.length,2,"A12 convergence preserves two provenance occurrences");
  exactJson(
    converged.occurrences.map(o=>o.path),
    [[0,0],[1,0]],
    "A12 convergence keeps parent branch paths",
  );

  const partial=stepFrontier(r,first,n.t!,"forward");
  setSame(partial.links,[n.q!],"A12 surviving branch");
  same(partial.occurrences.length,1,"A12 one branch terminates while one survives");
  exactJson(partial.occurrences[0]!.path,[1,0],"A12 survivor provenance");
}

function staticExecutorGuard():void{
  const repoRoot=resolve(process.cwd(),"..");
  const source=readFileSync(
    join(repoRoot,"ts/test/research-v013-bundle-continuation-a12.test.ts"),
    "utf8",
  );
  const start=source.indexOf("function stepOne(");
  const end=source.indexOf("function setSame(",start);
  assert(start>=0&&end>start,"A12 executor source slice");
  const kernel=source.slice(start,end);
  for(const forbidden of ["Promise","Worker","async ","await ","setTimeout","worker_threads"]){
    assert(!kernel.includes(forbidden),`A12 semantic kernel excludes physical concurrency primitive ${forbidden}`);
  }
}

function main():void{
  const a=buildArtifact(false);
  const b=buildArtifact(true);
  exactJson(a,b,"A12 portable authority ignores unrelated allocation noise");

  exercise(a);
  exercise(b);
  staticExecutorGuard();

  console.log([
    "MTS v0.13 A12:",
    "BUNDLE_CONTINUATION_FRONTIER=GREEN_SCOPED_RESEARCH",
    "F_OF_A_FANOUT=2",
    "SECOND_STEP_FANOUT=3",
    "CONVERGENCE_LINKS=1",
    "CONVERGENCE_OCCURRENCES=2",
    "PARTIAL_BRANCH_TERMINATION=SURVIVOR_1",
    "SCHEDULE_ORDERS=FORWARD_REVERSE_EQUIVALENT",
    "PHYSICAL_CONCURRENCY_PRIMITIVES=0",
    "INDEPENDENT_MEMORIES=2",
    "MATERIALIZING_CONCURRENCY=OPEN",
    "PRODUCTION_UNCHANGED",
  ].join(" "));
}
main();
