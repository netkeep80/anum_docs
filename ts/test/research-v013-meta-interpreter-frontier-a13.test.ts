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
  defineContext,
  readContext,
} from "../src/state.js";
import {
  resolveFlatBundle,
  valuesEqual,
  type BundleValue,
  type ResolvedOccurrence,
} from "../src/value-bundle.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.13 A13 meta-interpreter frontier: ${message}`);
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
    assert(this.support.has(link),"A13 selected support");
  }
  poles(link:LinkHandle):LinkPoles {
    this.require(link);
    const p=this.source.poles(link);
    assert(this.support.has(p.start)&&this.support.has(p.end),"A13 pole-closed support");
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
    const link=pending.pop();
    if(link===undefined||support.has(link)) continue;
    const p=memory.poles(link);
    support.add(link);
    pending.push(p.start,p.end);
  }
  return support;
}

interface MetaState {
  readonly pool:LinkHandle;
  readonly context:LinkHandle;
  readonly tos:LinkHandle;
  readonly currentFn:LinkHandle;
}

function defineMetaState(
  memory:Memory,
  state:MetaState,
):LinkHandle{
  return materializeExactSequence(memory,[
    state.pool,state.context,state.tos,state.currentFn,
  ]);
}

function readMetaState(memory:ReadMemory, carrier:LinkHandle):MetaState{
  const seq=readExactSequence(memory,carrier);
  same(seq.values.length,4,"A13 meta-state arity");
  const [pool,context,tos,currentFn]=seq.values;
  assert(
    pool!==undefined&&context!==undefined&&tos!==undefined&&currentFn!==undefined,
    "A13 complete meta-state",
  );
  readContext(memory,context);
  return Object.freeze({pool,context,tos,currentFn});
}

interface Artifact {
  readonly schema:"mts-v013-meta-interpreter-frontier/research-v0.1";
  readonly topology:StorageTopologyImage;
  readonly applicationCoordinates:readonly number[];
  readonly transitionCoordinates:readonly number[];
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

  const pool0=memory.ensure(b.U,b.L);
  const poolA=memory.ensure(b.O,pool0);
  const poolB=memory.ensure(b.C,pool0);
  const poolC=memory.ensure(poolA,b.L);
  const poolD=memory.ensure(poolB,b.U);
  const poolZ=memory.ensure(poolC,poolD);

  const tos0=memory.ensure(b.L,b.U);
  const tosA=memory.ensure(tos0,b.O);
  const tosB=memory.ensure(tos0,b.C);
  const tosC=memory.ensure(tosA,b.L);
  const tosD=memory.ensure(tosB,b.U);
  const tosZ=memory.ensure(tosC,tosD);

  const f0=memory.ensure(b.O,b.U);
  const fA=memory.ensure(f0,b.O);
  const fB=memory.ensure(f0,b.C);
  const fC=memory.ensure(fA,b.L);
  const fD=memory.ensure(fB,b.U);
  const fZ=memory.ensure(fC,fD);

  const cur0=memory.ensure(b.R,b.L);
  const curA=memory.ensure(cur0,b.O);
  const curB=memory.ensure(cur0,b.C);
  const curC=memory.ensure(curA,b.L);
  const curD=memory.ensure(curB,b.U);
  const curZ=memory.ensure(curC,curD);

  const k0=defineContext(memory,b.R,cur0);
  const kA=defineContext(memory,k0,curA);
  const kB=defineContext(memory,k0,curB);
  const kC=defineContext(memory,kB,curC);
  const kD=defineContext(memory,kB,curD);
  const kZ=defineContext(memory,k0,curZ);

  const E0=defineMetaState(memory,{pool:pool0,context:k0,tos:tos0,currentFn:f0});
  const EA=defineMetaState(memory,{pool:poolA,context:kA,tos:tosA,currentFn:fA});
  const EB=defineMetaState(memory,{pool:poolB,context:kB,tos:tosB,currentFn:fB});
  const EC=defineMetaState(memory,{pool:poolC,context:kC,tos:tosC,currentFn:fC});
  const ED=defineMetaState(memory,{pool:poolD,context:kD,tos:tosD,currentFn:fD});
  const EZ=defineMetaState(memory,{pool:poolZ,context:kZ,tos:tosZ,currentFn:fZ});

  const event1=memory.ensure(b.O,b.C);
  const event2=memory.ensure(b.C,b.O);
  const event3=memory.ensure(event1,event2);

  const applications:LinkHandle[]=[];
  const transitions:LinkHandle[]=[];
  const define=(state:LinkHandle,event:LinkHandle,...next:LinkHandle[]):void=>{
    const app=memory.ensure(state,event);
    applications.push(app);
    for(const target of next) transitions.push(memory.ensure(app,target));
  };

  define(E0,event1,EA,EB);
  define(EA,event2);
  define(EB,event2,EC,ED);
  define(EC,event3,EZ);
  define(ED,event3,EZ);

  const namedLinks={E0,EA,EB,EC,ED,EZ,event1,event2,event3};
  const support=closure(memory,[
    ...applications,...transitions,
    ...Object.values(namedLinks),
  ]);
  const canonical=exportCanonicalTopology(new View(memory,support));
  const coord=(link:LinkHandle):number=>{
    const n=canonical.coordinates.get(link);
    assert(n!==undefined,"A13 coordinate");
    return n;
  };

  return Object.freeze({
    schema:"mts-v013-meta-interpreter-frontier/research-v0.1" as const,
    topology:canonical.topology,
    applicationCoordinates:Object.freeze(applications.map(coord)),
    transitionCoordinates:Object.freeze(transitions.map(coord)),
    named:Object.freeze(Object.fromEntries(
      Object.entries(namedLinks).map(([name,link])=>[name,coord(link)]),
    )),
  });
}

interface Replay {
  readonly memory:Memory;
  readonly applications:readonly LinkHandle[];
  readonly applicationSet:ReadonlySet<LinkHandle>;
  readonly transitions:readonly LinkHandle[];
  readonly named:Readonly<Record<string,LinkHandle>>;
}

function replay(artifact:Artifact):Replay{
  same(artifact.schema,"mts-v013-meta-interpreter-frontier/research-v0.1","A13 schema");
  const memory=restoreTopology(artifact.topology);
  const all=memory.allLinks();
  const at=(n:number):LinkHandle=>{
    const x=all[n]; assert(x!==undefined,"A13 coordinate replay"); return x;
  };
  const applications=Object.freeze(artifact.applicationCoordinates.map(at));
  return Object.freeze({
    memory,
    applications,
    applicationSet:new Set(applications),
    transitions:Object.freeze(artifact.transitionCoordinates.map(at)),
    named:Object.freeze(Object.fromEntries(
      Object.entries(artifact.named).map(([name,n])=>[name,at(n)]),
    )),
  });
}

function applicationFor(
  r:Replay,
  state:LinkHandle,
  event:LinkHandle,
):LinkHandle{
  const matches=r.applications.filter(app=>{
    const p=r.memory.poles(app);
    return p.start===state&&p.end===event;
  });
  same(matches.length,1,"A13 exact selected state/event application");
  return matches[0]!;
}

function nextStates(
  r:Replay,
  state:LinkHandle,
  event:LinkHandle,
):readonly LinkHandle[]{
  const app=applicationFor(r,state,event);
  const result:LinkHandle[]=[];
  for(const edge of r.transitions){
    const p=r.memory.poles(edge);
    if(p.start===app) result.push(p.end);
  }
  return Object.freeze(result);
}

function stepOne(
  r:Replay,
  state:LinkHandle,
  event:LinkHandle,
  parentPath:readonly number[],
):readonly ResolvedOccurrence[]{
  const before=r.memory.linkCount;
  const children=nextStates(r,state,event);
  const result=children.map((link,index)=>Object.freeze({
    path:Object.freeze([...parentPath,index]),
    link,
  }));
  same(r.memory.linkCount,before,"A13 semantic step is read-only");
  return Object.freeze(result);
}

function stepFrontier(
  r:Replay,
  frontier:BundleValue,
  event:LinkHandle,
  schedule:"forward"|"reverse",
):BundleValue{
  const parents=[...frontier.occurrences];
  if(schedule==="reverse") parents.reverse();
  const next:ResolvedOccurrence[]=[];
  for(const parent of parents){
    next.push(...stepOne(r,parent.link,event,parent.path));
  }
  return resolveFlatBundle(r.memory,Object.freeze(next));
}

function initial(r:Replay,state:LinkHandle):BundleValue{
  return resolveFlatBundle(r.memory,Object.freeze([
    Object.freeze({path:Object.freeze([]),link:state}),
  ]));
}

function setSame(
  actual:ReadonlySet<LinkHandle>,
  expected:readonly LinkHandle[],
  message:string,
):void{
  same(actual.size,new Set(expected).size,`${message}: cardinality`);
  for(const link of expected) assert(actual.has(link),`${message}: missing state`);
}

function normalizedProvenance(r:Replay,bundle:BundleValue):readonly string[]{
  const index=new Map(r.memory.allLinks().map((link,i)=>[link,i] as const));
  return Object.freeze(bundle.occurrences.map(o=>{
    const n=index.get(o.link);
    assert(n!==undefined,"A13 occurrence coordinate");
    return `${o.path.join(".")}:${n}`;
  }).sort());
}

function assertBranchLocalStates(r:Replay):void{
  const n=r.named;
  const A=readMetaState(r.memory,n.EA!);
  const B=readMetaState(r.memory,n.EB!);
  assert(A.context!==B.context,"A13 branch contexts differ");
  assert(A.tos!==B.tos,"A13 branch TOS differ");
  assert(A.currentFn!==B.currentFn,"A13 branch current functions differ");
  assert(A.pool!==B.pool,"A13 branch Pools may diverge");

  const ka=readContext(r.memory,A.context);
  const kb=readContext(r.memory,B.context);
  assert(ka.current!==kb.current,"A13 branch-local K.current differs");
  same(ka.parent,kb.parent,"A13 first split preserves one lexical parent");

  const C=readMetaState(r.memory,n.EC!);
  const D=readMetaState(r.memory,n.ED!);
  assert(C.context!==D.context&&C.tos!==D.tos&&C.currentFn!==D.currentFn,
    "A13 recursive split remains branch-local");
}

function exercise(artifact:Artifact):void{
  const r=replay(artifact);
  const n=r.named;
  for(const name of ["E0","EA","EB","EC","ED","EZ","event1","event2","event3"]){
    assert(n[name]!==undefined,`A13 named ${name}`);
  }
  assertBranchLocalStates(r);

  const f0=initial(r,n.E0!);
  const first=stepFrontier(r,f0,n.event1!,"forward");
  setSame(first.links,[n.EA!,n.EB!],"A13 first split");
  same(first.occurrences.length,2,"A13 first branch count");

  const secondForward=stepFrontier(r,first,n.event2!,"forward");
  const secondReverse=stepFrontier(r,first,n.event2!,"reverse");
  setSame(secondForward.links,[n.EC!,n.ED!],"A13 recursive split");
  same(secondForward.occurrences.length,2,"A13 EA terminates while EB splits");
  assert(valuesEqual(secondForward,secondReverse),
    "A13 second-step scheduler order preserves extensional value");
  exactJson(
    normalizedProvenance(r,secondForward),
    normalizedProvenance(r,secondReverse),
    "A13 second-step scheduler order preserves provenance",
  );
  exactJson(
    secondForward.occurrences.map(o=>o.path).sort(),
    [[1,0],[1,1]],
    "A13 terminated EA branch contributes no child occurrences",
  );

  const thirdForward=stepFrontier(r,secondForward,n.event3!,"forward");
  const thirdReverse=stepFrontier(r,secondReverse,n.event3!,"reverse");
  setSame(thirdForward.links,[n.EZ!],"A13 converged semantic state");
  same(thirdForward.occurrences.length,2,"A13 convergence preserves two branches");
  assert(valuesEqual(thirdForward,thirdReverse),
    "A13 converged extensional result ignores scheduler order");
  exactJson(
    normalizedProvenance(r,thirdForward),
    normalizedProvenance(r,thirdReverse),
    "A13 converged provenance ignores scheduler order",
  );

  const z=readMetaState(r.memory,n.EZ!);
  const kz=readContext(r.memory,z.context);
  assert(kz.current!==r.memory.root,"A13 converged state keeps explicit context value");

  // Late ambient transition after freeze is not in selected transition list.
  const before=nextStates(r,n.EB!,n.event2!);
  const bogusCurrent=r.memory.ensure(n.event1!,n.event3!);
  const bogusK=defineContext(r.memory,r.memory.root,bogusCurrent);
  const bogus=defineMetaState(r.memory,{
    pool:n.E0!,context:bogusK,tos:n.event1!,currentFn:n.event3!,
  });
  const app=r.memory.find(n.EB!,n.event2!);
  assert(app!==undefined,"A13 live selected application exists");
  r.memory.ensure(app,bogus);
  const after=nextStates(r,n.EB!,n.event2!);
  exactJson(after,before,"A13 late ambient transition has no frozen authority");
}

function staticKernelGuard():void{
  const repoRoot=resolve(process.cwd(),"..");
  const source=readFileSync(
    join(repoRoot,"ts/test/research-v013-meta-interpreter-frontier-a13.test.ts"),
    "utf8",
  );
  const start=source.indexOf("function applicationFor(");
  const end=source.indexOf("function initial(",start);
  assert(start>=0&&end>start,"A13 kernel slice");
  const kernel=source.slice(start,end);
  for(const forbidden of [
    "Promise","Worker","async ","await ","setTimeout","worker_threads",
    ".ensure(","defineContext(","defineMetaState(",
  ]){
    assert(!kernel.includes(forbidden),`A13 semantic kernel excludes ${forbidden}`);
  }
}

function main():void{
  const a=buildArtifact(false);
  const b=buildArtifact(true);
  exactJson(a,b,"A13 portable authority ignores unrelated allocation noise");

  exercise(a);
  exercise(b);
  staticKernelGuard();

  console.log([
    "MTS v0.13 A13:",
    "META_INTERPRETER_FRONTIER=GREEN_SCOPED_RESEARCH",
    "E0_EVENT1_BRANCHES=2",
    "EA_EVENT2=LOCAL_TERMINATION",
    "EB_EVENT2_BRANCHES=2",
    "EC_ED_EVENT3_CONVERGE=EZ",
    "CONVERGENCE_DISTINCT_STATES=1",
    "CONVERGENCE_OCCURRENCES=2",
    "BRANCH_LOCAL_K_F_TOS_POOL=CONFIRMED",
    "SCHEDULE_ORDERS=FORWARD_REVERSE_EQUIVALENT",
    "LATE_AMBIENT_TRANSITION=IGNORED",
    "SEMANTIC_KERNEL_WRITES=0",
    "PHYSICAL_CONCURRENCY_PRIMITIVES=0",
    "INDEPENDENT_MEMORIES=2",
    "MATERIALIZING_CONCURRENCY=OPEN",
    "PRODUCTION_UNCHANGED",
  ].join(" "));
}
main();
