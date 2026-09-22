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
  if (!condition) throw new Error(`v0.13 F5-F2 structural admission: ${message}`);
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
    assert(this.support.has(link),"F5-F2 selected support");
  }
  poles(link:LinkHandle):LinkPoles {
    this.require(link);
    const p=this.source.poles(link);
    assert(this.support.has(p.start)&&this.support.has(p.end),"F5-F2 pole-closed support");
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
  readonly schema:"mts-v013-structural-admission-f5-f2/research-v0.1";
  readonly topology:StorageTopologyImage;
  readonly ruleCoordinate:number;
  readonly requestCoordinates:readonly number[];
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
  same(new Set(roles).size,8,"F5-F2 anonymous roles distinct");
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

function defineRequest(
  memory:Memory,
  seedA:LinkHandle,
  seedB:LinkHandle,
):LinkHandle{
  const b=ensureRootBasis(memory);
  const nameCarrier=memory.ensure(seedA,b.U);
  const fnStart=memory.ensure(seedA,b.L);
  const fnEnd=memory.ensure(b.C,seedB);
  const argument=memory.ensure(seedB,b.O);
  const result1=memory.ensure(b.O,fnStart);
  const result2=memory.ensure(b.C,fnEnd);
  assert(memory.find(fnStart,fnEnd)===undefined,
    "F5-F2 function absent before generation");
  return materializeExactSequence(memory,[
    nameCarrier,fnStart,fnEnd,argument,result1,result2,
  ]);
}

function buildArtifact(noise:boolean):Artifact{
  const memory=new Memory();
  const b=ensureRootBasis(memory);
  if(noise){
    const n0=memory.ensure(b.U,b.C);
    const n1=memory.ensure(n0,b.O);
    memory.ensure(b.L,n1);
  }

  const rule=defineRule(memory);
  const seedA1=memory.ensure(b.R,b.L);
  const seedB1=memory.ensure(b.R,b.U);
  const seedA2=memory.ensure(b.O,b.R);
  const seedB2=memory.ensure(b.C,b.R);
  const request1=defineRequest(memory,seedA1,seedB1);
  const request2=defineRequest(memory,seedA2,seedB2);

  const support=closure(memory,[rule,request1,request2]);
  const canonical=exportCanonicalTopology(new View(memory,support));
  const coord=(link:LinkHandle):number=>{
    const n=canonical.coordinates.get(link);
    assert(n!==undefined,"F5-F2 coordinate");
    return n;
  };

  return Object.freeze({
    schema:"mts-v013-structural-admission-f5-f2/research-v0.1" as const,
    topology:canonical.topology,
    ruleCoordinate:coord(rule),
    requestCoordinates:Object.freeze([coord(request1),coord(request2)]),
  });
}

function generateCandidate(
  memory:Memory,
  request:LinkHandle,
):Readonly<{candidate:LinkHandle;values:readonly LinkHandle[]}>{
  const q=readExactSequence(memory,request).values;
  same(q.length,6,"F5-F2 request arity");
  const [nameCarrier,fnStart,fnEnd,argument,result1,result2]=q;
  assert(
    nameCarrier!==undefined&&fnStart!==undefined&&fnEnd!==undefined&&
    argument!==undefined&&result1!==undefined&&result2!==undefined,
    "F5-F2 complete request",
  );

  const fn=memory.ensure(fnStart,fnEnd);
  const application=memory.ensure(fn,argument);
  const continuation1=memory.ensure(application,result1);
  const continuation2=memory.ensure(application,result2);
  const values=Object.freeze([
    nameCarrier,fn,argument,application,result1,result2,continuation1,continuation2,
  ]);
  return Object.freeze({
    candidate:materializeExactSequence(memory,values),
    values,
  });
}

/**
 * Generic frozen structural-rule interpreter.
 *
 * Role meaning and all pair constraints come from Link data in rule.
 * No generated candidate identity or definition-specific role name is known.
 */
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

function frontier(memory:ReadMemory,values:readonly LinkHandle[]):BundleValue{
  const occurrences:ResolvedOccurrence[]=values.map((link,index)=>Object.freeze({
    path:Object.freeze([index]),
    link,
  }));
  return resolveFlatBundle(memory,Object.freeze(occurrences));
}

function selectUniqueStructurallyAdmitted(
  memory:ReadMemory,
  rule:LinkHandle,
  candidates:BundleValue,
):BundleValue{
  const admitted=[...candidates.links].filter(candidate=>
    structurallyAdmitted(memory,rule,candidate)
  );
  assert(admitted.length===1,"F5-F2 unique structurally admitted candidate required");
  const selected=admitted[0]!;
  return resolveFlatBundle(
    memory,
    Object.freeze(candidates.occurrences.filter(o=>o.link===selected)),
  );
}

function forgeApplication(
  memory:Memory,
  generated:Readonly<{values:readonly LinkHandle[]}>,
):LinkHandle{
  const v=[...generated.values];
  const bogus=memory.ensure(v[2]!,v[1]!);
  v[3]=bogus;
  return materializeExactSequence(memory,v);
}

function forgeContinuation(
  memory:Memory,
  generated:Readonly<{values:readonly LinkHandle[]}>,
):LinkHandle{
  const v=[...generated.values];
  const bogus=memory.ensure(v[4]!,v[3]!);
  v[6]=bogus;
  return materializeExactSequence(memory,v);
}

function forgeArity(
  memory:Memory,
  generated:Readonly<{values:readonly LinkHandle[]}>,
):LinkHandle{
  return materializeExactSequence(memory,generated.values.slice(0,-1));
}

interface RunResult {
  readonly finalTopology:StorageTopologyImage;
  readonly candidateCoordinates:readonly number[];
}

function execute(artifact:Artifact):RunResult{
  same(artifact.schema,"mts-v013-structural-admission-f5-f2/research-v0.1","F5-F2 schema");
  const memory=restoreTopology(artifact.topology);
  const all=memory.allLinks();
  const at=(n:number):LinkHandle=>{
    const x=all[n]; assert(x!==undefined,"F5-F2 replay coordinate"); return x;
  };
  const rule=at(artifact.ruleCoordinate);
  const requests=artifact.requestCoordinates.map(at);

  const before=memory.linkCount;
  const generated=requests.map(request=>generateCandidate(memory,request));
  assert(memory.linkCount>before,"F5-F2 candidates generated after freeze");
  same(generated.length,2,"F5-F2 two generated candidates");

  for(const item of generated){
    assert(structurallyAdmitted(memory,rule,item.candidate),
      "F5-F2 unknown generated candidate passes frozen structural rule");
  }

  const firstOnly=selectUniqueStructurallyAdmitted(
    memory,rule,frontier(memory,[generated[0]!.candidate]),
  );
  assert(firstOnly.links.has(generated[0]!.candidate),
    "F5-F2 unique valid candidate selectable");

  let ambiguous=false;
  try{
    selectUniqueStructurallyAdmitted(
      memory,rule,
      frontier(memory,[generated[0]!.candidate,generated[1]!.candidate]),
    );
  }catch{
    ambiguous=true;
  }
  assert(ambiguous,"F5-F2 two valid candidates remain publication ambiguity");

  assert(
    !structurallyAdmitted(memory,rule,forgeApplication(memory,generated[0]!)),
    "F5-F2 forged application rejected",
  );
  assert(
    !structurallyAdmitted(memory,rule,forgeContinuation(memory,generated[0]!)),
    "F5-F2 forged continuation rejected",
  );
  assert(
    !structurallyAdmitted(memory,rule,forgeArity(memory,generated[0]!)),
    "F5-F2 wrong arity rejected",
  );

  const canonical=exportCanonicalTopology(memory);
  const coords=generated.map(item=>{
    const n=canonical.coordinates.get(item.candidate);
    assert(n!==undefined,"F5-F2 generated candidate canonical coordinate");
    return n;
  });
  return Object.freeze({
    finalTopology:canonical.topology,
    candidateCoordinates:Object.freeze(coords),
  });
}

function staticVerifierGuard():void{
  const repoRoot=resolve(process.cwd(),"..");
  const source=readFileSync(
    join(repoRoot,"ts/test/research-v013-structural-admission-f5-f2.test.ts"),
    "utf8",
  );
  const start=source.indexOf("function structurallyAdmitted(");
  const end=source.indexOf("\nfunction frontier(",start);
  assert(start>=0&&end>start,"F5-F2 verifier source slice");
  const verifier=source.slice(start,end);
  for(const forbidden of [
    "switch(","candidateCoordinate","nameCarrier","argument",
    "application","continuation","result1","result2","isValidDefinition",
  ]){
    assert(!verifier.includes(forbidden),
      `F5-F2 verifier has no definition-specific branch: ${forbidden}`);
  }
}

function main():void{
  const a=buildArtifact(false);
  const b=buildArtifact(true);
  exactJson(a,b,"F5-F2 frozen rule/requests ignore unrelated source noise");

  const ar=execute(a);
  const br=execute(b);
  exactJson(ar.finalTopology,br.finalTopology,
    "F5-F2 independent Memories generate equal canonical topology");
  exactJson(ar.candidateCoordinates,br.candidateCoordinates,
    "F5-F2 generated candidate coordinates portable");
  staticVerifierGuard();

  console.log([
    "MTS v0.13 F5-F2:",
    "UNKNOWN_CANDIDATE_STRUCTURAL_ADMISSION=GREEN_SCOPED_RESEARCH",
    "GENERATED_CANDIDATES=2",
    "FROZEN_RULE_CANDIDATE_IDS=0",
    "PAIR_CONSTRAINTS=3",
    "FORGED_APPLICATION=REJECTED",
    "FORGED_CONTINUATION=REJECTED",
    "WRONG_ARITY=REJECTED",
    "TWO_VALID_CANDIDATES=AMBIGUITY_REJECTED",
    "INDEPENDENT_MEMORIES=2",
    "GLOBAL_E3=OPEN",
    "FULL_F4_GENERATED_AUTHORITY=OPEN",
    "PRODUCTION_UNCHANGED",
  ].join(" "));
}
main();
