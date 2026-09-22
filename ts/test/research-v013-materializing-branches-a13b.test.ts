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
  type BundleValue,
  type ResolvedOccurrence,
} from "../src/value-bundle.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.13 A13b materializing branches: ${message}`);
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
    assert(this.support.has(link),"A13b selected support");
  }
  poles(link:LinkHandle):LinkPoles {
    this.require(link);
    const p=this.source.poles(link);
    assert(this.support.has(p.start)&&this.support.has(p.end),"A13b pole-closed support");
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

interface Plan {
  readonly branchId:LinkHandle;
  readonly sharedStart:LinkHandle;
  readonly sharedEnd:LinkHandle;
  readonly uniqueStart:LinkHandle;
  readonly uniqueEnd:LinkHandle;
  readonly parentContext:LinkHandle;
  readonly poolSeed:LinkHandle;
}

function definePlan(memory:Memory, plan:Plan):LinkHandle{
  return materializeExactSequence(memory,[
    plan.branchId,
    plan.sharedStart,plan.sharedEnd,
    plan.uniqueStart,plan.uniqueEnd,
    plan.parentContext,plan.poolSeed,
  ]);
}

function readPlan(memory:ReadMemory, carrier:LinkHandle):Plan{
  const seq=readExactSequence(memory,carrier);
  same(seq.values.length,7,"A13b plan arity");
  const [
    branchId,sharedStart,sharedEnd,uniqueStart,uniqueEnd,parentContext,poolSeed,
  ]=seq.values;
  assert(
    branchId!==undefined&&sharedStart!==undefined&&sharedEnd!==undefined&&
    uniqueStart!==undefined&&uniqueEnd!==undefined&&parentContext!==undefined&&
    poolSeed!==undefined,
    "A13b complete plan",
  );
  readContext(memory,parentContext);
  return Object.freeze({
    branchId,sharedStart,sharedEnd,uniqueStart,uniqueEnd,parentContext,poolSeed,
  });
}

interface Artifact {
  readonly schema:"mts-v013-materializing-branches/research-v0.1";
  readonly topology:StorageTopologyImage;
  readonly planCoordinates:Readonly<Record<string,number>>;
}

function buildArtifact(noise:boolean):Artifact{
  const memory=new Memory();
  const b=ensureRootBasis(memory);
  if(noise){
    const n0=memory.ensure(b.U,b.C);
    const n1=memory.ensure(n0,b.O);
    memory.ensure(b.L,n1);
  }

  const a=memory.ensure(b.U,b.L);
  const bend=memory.ensure(b.L,b.U);
  const c=memory.ensure(b.O,a);
  const d=memory.ensure(b.C,bend);
  const parentCurrent=memory.ensure(c,d);
  const parent=defineContext(memory,b.R,parentCurrent);

  const branchA=memory.ensure(b.O,c);
  const branchB=memory.ensure(b.C,d);
  const branchC=memory.ensure(branchA,b.L);
  const branchD=memory.ensure(branchB,b.U);

  const seedA=memory.ensure(b.L,a);
  const seedB=memory.ensure(b.U,bend);
  const seedShared=memory.ensure(seedA,seedB);

  assert(memory.find(a,bend)===undefined,"A13b shared target absent before execution");
  assert(memory.find(a,c)===undefined,"A13b A unique target absent before execution");
  assert(memory.find(d,bend)===undefined,"A13b B unique target absent before execution");

  const plans={
    A:definePlan(memory,{
      branchId:branchA,
      sharedStart:a,sharedEnd:bend,
      uniqueStart:a,uniqueEnd:c,
      parentContext:parent,poolSeed:seedA,
    }),
    B:definePlan(memory,{
      branchId:branchB,
      sharedStart:a,sharedEnd:bend,
      uniqueStart:d,uniqueEnd:bend,
      parentContext:parent,poolSeed:seedB,
    }),
    C:definePlan(memory,{
      branchId:branchC,
      sharedStart:a,sharedEnd:bend,
      uniqueStart:a,uniqueEnd:c,
      parentContext:parent,poolSeed:seedShared,
    }),
    D:definePlan(memory,{
      branchId:branchD,
      sharedStart:a,sharedEnd:bend,
      uniqueStart:a,uniqueEnd:c,
      parentContext:parent,poolSeed:seedShared,
    }),
  };

  const support=closure(memory,Object.values(plans));
  const canonical=exportCanonicalTopology(new View(memory,support));
  const planCoordinates=Object.fromEntries(
    Object.entries(plans).map(([name,link])=>{
      const n=canonical.coordinates.get(link);
      assert(n!==undefined,"A13b plan coordinate");
      return [name,n];
    }),
  );

  return Object.freeze({
    schema:"mts-v013-materializing-branches/research-v0.1" as const,
    topology:canonical.topology,
    planCoordinates:Object.freeze(planCoordinates),
  });
}

interface BranchWriteResult {
  readonly branchId:LinkHandle;
  readonly shared:LinkHandle;
  readonly unique:LinkHandle;
  readonly context:LinkHandle;
  readonly publication:LinkHandle;
}

function executePlan(memory:Memory, carrier:LinkHandle):BranchWriteResult{
  const p=readPlan(memory,carrier);
  const shared=memory.ensure(p.sharedStart,p.sharedEnd);
  const unique=memory.ensure(p.uniqueStart,p.uniqueEnd);
  const context=defineContext(memory,p.parentContext,unique);
  const contextState=readContext(memory,context);
  same(contextState.parent,p.parentContext,"A13b branch Context preserves explicit parent");
  same(contextState.current,unique,"A13b branch Context current is branch-local materialization");
  const publication=memory.ensure(p.poolSeed,context);
  return Object.freeze({
    branchId:p.branchId,
    shared,unique,context,publication,
  });
}

interface ScheduleResult {
  readonly topology:StorageTopologyImage;
  readonly sharedWrites:BundleValue;
  readonly publications:BundleValue;
  readonly results:readonly BranchWriteResult[];
}

function executeSchedule(
  artifact:Artifact,
  order:readonly string[],
):ScheduleResult{
  same(artifact.schema,"mts-v013-materializing-branches/research-v0.1","A13b schema");
  const memory=restoreTopology(artifact.topology);
  const all=memory.allLinks();
  const plan=(name:string):LinkHandle=>{
    const n=artifact.planCoordinates[name];
    assert(n!==undefined,"A13b plan name");
    const x=all[n];
    assert(x!==undefined,"A13b plan replay");
    return x;
  };

  const stableIndex=new Map(
    Object.keys(artifact.planCoordinates).sort().map((name,index)=>[name,index] as const),
  );
  const results:BranchWriteResult[]=[];
  const sharedOccurrences:ResolvedOccurrence[]=[];
  const publicationOccurrences:ResolvedOccurrence[]=[];

  for(const name of order){
    const result=executePlan(memory,plan(name));
    results.push(result);
    const index=stableIndex.get(name);
    assert(index!==undefined,"A13b stable branch provenance index");
    sharedOccurrences.push(Object.freeze({
      path:Object.freeze([index,0]),
      link:result.shared,
    }));
    publicationOccurrences.push(Object.freeze({
      path:Object.freeze([index,1]),
      link:result.publication,
    }));
  }

  return Object.freeze({
    topology:exportCanonicalTopology(memory).topology,
    sharedWrites:resolveFlatBundle(memory,Object.freeze(sharedOccurrences)),
    publications:resolveFlatBundle(memory,Object.freeze(publicationOccurrences)),
    results:Object.freeze(results),
  });
}

function requireUniquePublication(bundle:BundleValue):LinkHandle{
  assert(bundle.links.size===1,"A13b publication ambiguity requires explicit authority");
  return [...bundle.links][0]!;
}

function expectRejected(effect:()=>unknown,message:string):void{
  let rejected=false;
  try{ effect(); }catch{ rejected=true; }
  assert(rejected,message);
}

function validateDivergent(
  artifact:Artifact,
  forward:ScheduleResult,
  reverse:ScheduleResult,
):void{
  exactJson(forward.topology,reverse.topology,
    "A13b A/B branch scheduling preserves canonical final topology");

  same(forward.sharedWrites.links.size,1,"A13b shared write canonicalizes to one Link");
  same(forward.sharedWrites.occurrences.length,2,"A13b shared write preserves two occurrences");
  same(reverse.sharedWrites.links.size,1,"A13b reverse shared write canonicalizes");
  same(reverse.sharedWrites.occurrences.length,2,"A13b reverse shared provenance");

  same(forward.publications.links.size,2,"A13b divergent publication candidates remain two");
  same(forward.publications.occurrences.length,2,"A13b divergent publication provenance");
  expectRejected(
    ()=>requireUniquePublication(forward.publications),
    "A13b divergent publication cannot use implicit last-writer-wins",
  );

  const [a,b]=forward.results;
  assert(a!==undefined&&b!==undefined,"A13b A/B results exist");
  same(a.shared,b.shared,"A13b both branches receive the same canonical shared Link");
  assert(a.unique!==b.unique,"A13b branch unique writes remain distinct");
  assert(a.context!==b.context,"A13b immutable branch contexts remain distinct");
  assert(a.publication!==b.publication,"A13b publication candidates remain distinct");

  same(Object.keys(artifact.planCoordinates).length,4,"A13b authority contains four plans");
}

function validateConvergent(
  forward:ScheduleResult,
  reverse:ScheduleResult,
):void{
  exactJson(forward.topology,reverse.topology,
    "A13b C/D branch scheduling preserves canonical final topology");
  same(forward.sharedWrites.links.size,1,"A13b convergent shared write one Link");
  same(forward.sharedWrites.occurrences.length,2,"A13b convergent shared provenance");
  same(forward.publications.links.size,1,"A13b converged publication one exact Link");
  same(forward.publications.occurrences.length,2,"A13b converged publication keeps two occurrences");
  const selected=requireUniquePublication(forward.publications);
  assert(forward.publications.links.has(selected),"A13b singleton publication is selectable");

  const [c,d]=forward.results;
  assert(c!==undefined&&d!==undefined,"A13b C/D results exist");
  same(c.shared,d.shared,"A13b convergent branches share canonical shared Link");
  same(c.unique,d.unique,"A13b convergent branches share canonical unique Link");
  same(c.context,d.context,"A13b convergent branches share canonical Context");
  same(c.publication,d.publication,"A13b convergent branches share publication Link");
}

function staticKernelGuard():void{
  const repoRoot=resolve(process.cwd(),"..");
  const source=readFileSync(
    join(repoRoot,"ts/test/research-v013-materializing-branches-a13b.test.ts"),
    "utf8",
  );
  const start=source.indexOf("function executePlan(");
  const end=source.indexOf("function expectRejected(",start);
  assert(start>=0&&end>start,"A13b executor source slice");
  const kernel=source.slice(start,end);
  for(const forbidden of [
    "Promise","Worker","async ","await ","setTimeout","worker_threads",
    "lastWriter","last-writer","mutex","lock(",
  ]){
    assert(!kernel.includes(forbidden),`A13b semantic executor excludes ${forbidden}`);
  }
}

function main():void{
  const a=buildArtifact(false);
  const b=buildArtifact(true);
  exactJson(a,b,"A13b frozen authority ignores unrelated allocation noise");

  const ab=executeSchedule(a,["A","B"]);
  const ba=executeSchedule(a,["B","A"]);
  validateDivergent(a,ab,ba);

  const cd=executeSchedule(a,["C","D"]);
  const dc=executeSchedule(a,["D","C"]);
  validateConvergent(cd,dc);

  staticKernelGuard();

  console.log([
    "MTS v0.13 A13b:",
    "MATERIALIZING_BRANCHES=GREEN_SCOPED_RESEARCH",
    "A_B_CANONICAL_TOPOLOGY_ORDER_INDEPENDENT=CONFIRMED",
    "SHARED_WRITE_LINKS=1",
    "SHARED_WRITE_OCCURRENCES=2",
    "DIVERGENT_PUBLICATIONS=2",
    "IMPLICIT_LAST_WRITER_WINS=REJECTED",
    "C_D_CONVERGED_PUBLICATION_LINKS=1",
    "C_D_CONVERGED_PUBLICATION_OCCURRENCES=2",
    "PHYSICAL_CONCURRENCY_PRIMITIVES=0",
    "ACTUAL_THREAD_SAFETY=NOT_TESTED",
    "PRODUCTION_UNCHANGED",
  ].join(" "));
}
main();
