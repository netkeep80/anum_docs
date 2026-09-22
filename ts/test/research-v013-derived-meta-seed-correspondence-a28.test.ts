import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { materializeExactSequence, readExactSequence } from "../src/exact-sequence.js";
import {
  Memory, ensureRootBasis, type LinkHandle, type ReadMemory, type RootBasis,
} from "../src/memory.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.13 A28 derived meta seed correspondence: ${message}`);
}
function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: values differ`);
}
function expectThrows(run: () => void, message: string): void {
  let threw = false;
  try { run(); } catch { threw = true; }
  assert(threw, message);
}

function freezeChain(memory: Memory, values: readonly LinkHandle[]): LinkHandle {
  let body = memory.root;
  for (let i = values.length - 1; i >= 0; i -= 1) body = memory.ensure(values[i]!, body);
  return memory.ensureStartSelfClosed(body);
}
function readChain(memory: Memory, envelope: LinkHandle): readonly LinkHandle[] {
  const e = memory.poles(envelope);
  assert(e.start === envelope && e.end !== envelope, "A28 proper START-self envelope");
  const out: LinkHandle[] = [];
  const seen = new Set<LinkHandle>();
  let cursor = e.end;
  while (cursor !== memory.root) {
    assert(!seen.has(cursor), "A28 chain cycle");
    seen.add(cursor);
    const cell = memory.poles(cursor);
    out.push(cell.start); cursor = cell.end;
  }
  return Object.freeze(out);
}

interface Family {
  readonly metaParent: LinkHandle;
  readonly E0: LinkHandle; readonly E1: LinkHandle; readonly E2: LinkHandle;
  readonly E3: LinkHandle; readonly E4: LinkHandle;
}
function referenceNextExecution(memory: Memory, executionRoot: LinkHandle): LinkHandle {
  const execution = memory.poles(executionRoot);
  const K = execution.start;
  const continuations = readChain(memory, memory.poles(K).end);
  const occurrences = readChain(memory, execution.end);
  let nextBody = memory.root;
  for (const occurrence of occurrences) {
    const truth = memory.poles(memory.poles(occurrence).end);
    assert(truth.start === K, "A28 reference truth keeps K");
    for (const continuation of continuations) {
      const p = memory.poles(continuation);
      if (p.start !== truth.end) continue;
      const nextTruth = memory.ensure(K, p.end);
      nextBody = memory.ensure(memory.ensure(occurrence, nextTruth), nextBody);
    }
  }
  return memory.ensure(K, memory.ensureStartSelfClosed(nextBody));
}
function buildFamily(memory: Memory, b: RootBasis, seed: LinkHandle): Family {
  const fresh: LinkHandle[] = [];
  let x = seed;
  for (let i=0;i<18;i+=1) { x=memory.ensure(x,i%2===0?b.O:b.C); fresh.push(x); }
  const at=(i:number):LinkHandle=>{const v=fresh[i];assert(v!==undefined,`A28 fresh ${i}`);return v;};
  const A0=memory.ensure(at(0),at(1)), A1=memory.ensure(at(2),at(3));
  const A2=memory.ensure(at(4),at(5)), A3=memory.ensure(at(6),at(7));
  const A4=memory.ensure(at(8),at(9)), Z=memory.ensure(at(10),at(11));
  const parent=memory.ensure(at(12),at(13)), metaParent=memory.ensure(at(14),at(15));
  const authority=freezeChain(memory,[
    memory.ensure(A0,A1),memory.ensure(A0,A2),memory.ensure(A2,A3),
    memory.ensure(A2,A4),memory.ensure(A3,Z),memory.ensure(A4,Z),
  ]);
  const K=memory.ensure(parent,authority);
  const occurrence0=memory.ensure(memory.root,memory.ensure(K,A0));
  const E0=memory.ensure(K,freezeChain(memory,[occurrence0]));
  const E1=referenceNextExecution(memory,E0), E2=referenceNextExecution(memory,E1);
  const E3=referenceNextExecution(memory,E2), E4=referenceNextExecution(memory,E3);
  return Object.freeze({metaParent,E0,E1,E2,E3,E4});
}

/** Exact A23 runtime consumer; A28 changes only producer-authority source selection. */
function metaStep(
  memory: Memory,
  currentExecutionTruth: LinkHandle,
): LinkHandle | undefined {
  const truth = memory.poles(currentExecutionTruth);
  const metaContext = truth.start;
  const currentExecution = truth.end;

  const metaContextPoles = memory.poles(metaContext);
  const envelope = metaContextPoles.end;
  const envelopePoles = memory.poles(envelope);
  assert(
    envelopePoles.start === envelope && envelopePoles.end !== envelope,
    "A23 meta-context carries proper START-self-closed producer authority",
  );

  const seen = new Set<LinkHandle>();
  let cursor = envelopePoles.end;
  let selected: LinkHandle | undefined;

  while (cursor !== memory.root) {
    assert(!seen.has(cursor), "A23 producer authority cycle");
    seen.add(cursor);

    const cell = memory.poles(cursor);
    const candidate = cell.start;
    const transition = memory.poles(candidate);

    if (transition.start === currentExecution) {
      assert(selected === undefined,
        "A23 producer authority is ambiguous for current execution");
      selected = candidate;
    }
    cursor = cell.end;
  }

  if (selected === undefined) return undefined;
  const transition = memory.poles(selected);
  return memory.ensure(metaContext, transition.end);
}

const ROOT=0,META=1,E0=2,E1=3,E2=4,E3=5,E4=6,T0=7,T1=8,T2=9,T3=10;
const C3=11,C2=12,C1=13,C0=14,ENV=15,M=16;
function anonymousRoles(memory:Memory):readonly LinkHandle[]{
  const b=ensureRootBasis(memory); const roles:LinkHandle[]=[]; let x=memory.ensure(b.O,b.U);
  for(let i=0;i<17;i+=1){x=memory.ensure(x,i%2===0?b.L:b.C);roles.push(x);}
  return Object.freeze(roles);
}
function defineRule(memory:Memory):LinkHandle{
  const r=anonymousRoles(memory);
  const triples=[
    [T0,E0,E1],[T1,E1,E2],[T2,E2,E3],[T3,E3,E4],
    [C3,T3,ROOT],[C2,T2,C3],[C1,T1,C2],[C0,T0,C1],[ENV,ENV,C0],[M,META,ENV],
  ] as const;
  return materializeExactSequence(memory,[
    materializeExactSequence(memory,r),
    materializeExactSequence(
      memory,
      triples.map(([t,s,e])=>materializeExactSequence(memory,[r[t]!,r[s]!,r[e]!])),
    ),
  ]);
}
function admitted(memory:ReadMemory,rule:LinkHandle,candidate:LinkHandle):boolean{
  try{
    const p=readExactSequence(memory,rule).values;
    if(p.length!==2||p[0]===undefined||p[1]===undefined)return false;
    const roles=readExactSequence(memory,p[0]).values, values=readExactSequence(memory,candidate).values;
    if(roles.length!==values.length||new Set(roles).size!==roles.length)return false;
    const bind=new Map<LinkHandle,LinkHandle>();
    roles.forEach((r,i)=>{if(values[i]!==undefined)bind.set(r,values[i]!);});
    if(bind.size!==roles.length)return false;
    for(const c of readExactSequence(memory,p[1]).values){
      const q=readExactSequence(memory,c).values;
      if(q.length!==3)return false;
      const t=bind.get(q[0]!),s=bind.get(q[1]!),e=bind.get(q[2]!);
      if(t===undefined||s===undefined||e===undefined||memory.find(s,e)!==t)return false;
    }
    return true;
  }catch{return false;}
}
interface Template {
  readonly candidate:LinkHandle;
  readonly M:LinkHandle;
  readonly publication:LinkHandle;
}
function producerTemplate(
  memory:Memory,
  metaParent:LinkHandle,
  executions:readonly LinkHandle[],
):Template{
  assert(executions.length>1,"A28 producer template has at least one transition");
  const ts=executions.slice(0,-1).map((e,i)=>memory.ensure(e,executions[i+1]!));
  let tail=memory.root; const cells:LinkHandle[]=[];
  for(let i=ts.length-1;i>=0;i-=1){
    tail=memory.ensure(ts[i]!,tail);cells.unshift(tail);
  }
  const env=memory.ensureStartSelfClosed(cells[0]!);
  const meta=memory.ensure(metaParent,env);
  const candidate=materializeExactSequence(memory,[
    memory.root,metaParent,...executions,...ts,...[...cells].reverse(),env,meta,
  ]);
  return Object.freeze({
    candidate,M:meta,publication:memory.ensure(candidate,meta),
  });
}

function seedSequence(memory:Memory,f:Family):LinkHandle{
  return materializeExactSequence(memory,[f.metaParent,f.E0,f.E1,f.E2,f.E3,f.E4]);
}
/**
 * Derive the source seed sequence from producer-authority topology itself.
 *
 * No candidate role positions are interpreted. The extractor searches the
 * candidate's Link values for exactly one M whose END is a proper START-self
 * envelope. That envelope must carry a non-empty contiguous chain of
 * execution transitions E_i->E_(i+1).
 */
function deriveProducerSeeds(
  memory:Memory,
  candidate:LinkHandle,
):readonly LinkHandle[]{
  const values=readExactSequence(memory,candidate).values;
  const members=new Set(values);
  const matches:LinkHandle[][]=[];

  for(const possibleMeta of values){
    const mp=memory.poles(possibleMeta);
    if(!members.has(mp.start)||!members.has(mp.end))continue;
    const envelope=mp.end;
    const ep=memory.poles(envelope);
    if(ep.start!==envelope||ep.end===envelope)continue;

    const transitions:LinkHandle[]=[];
    const seen=new Set<LinkHandle>();
    let cursor=ep.end;
    let valid=true;
    while(cursor!==memory.root){
      if(seen.has(cursor)||!members.has(cursor)){valid=false;break;}
      seen.add(cursor);
      const cell=memory.poles(cursor);
      if(!members.has(cell.start)){valid=false;break;}
      transitions.push(cell.start);
      cursor=cell.end;
    }
    if(!valid||transitions.length===0)continue;

    const executions:LinkHandle[]=[];
    for(let i=0;i<transitions.length;i+=1){
      const tp=memory.poles(transitions[i]!);
      if(!members.has(tp.start)||!members.has(tp.end)){valid=false;break;}
      if(i===0)executions.push(tp.start);
      else if(executions[executions.length-1]!==tp.start){valid=false;break;}
      executions.push(tp.end);
    }
    if(!valid)continue;
    matches.push([mp.start,...executions]);
  }

  same(matches.length,1,"A28 exactly one structural producer seed path");
  return Object.freeze(matches[0]!);
}

function derivedSeedMap(
  memory:Memory,
  sourceCandidate:LinkHandle,
  targetSeeds:LinkHandle,
):Map<LinkHandle,LinkHandle>|undefined{
  const source=deriveProducerSeeds(memory,sourceCandidate);
  const target=readExactSequence(memory,targetSeeds).values;
  if(source.length!==target.length)return undefined;
  const map=new Map<LinkHandle,LinkHandle>([[memory.root,memory.root]]);
  for(let i=0;i<source.length;i+=1){
    const t=target[i];assert(t!==undefined,"A28 complete target seed description");
    const prior=map.get(source[i]!);
    assert(prior===undefined||prior===t,"A28 derived seed correspondence conflict");
    map.set(source[i]!,t);
  }
  return map;
}

function instantiate(memory:Memory,source:LinkHandle,map:Map<LinkHandle,LinkHandle>):LinkHandle{
  const known=map.get(source);if(known!==undefined)return known;
  const p=memory.poles(source);let target:LinkHandle;
  if(p.start===source&&p.end===source)target=memory.ensureRoot();
  else if(p.start===source)target=memory.ensureStartSelfClosed(instantiate(memory,p.end,map));
  else if(p.end===source)target=memory.ensureEndSelfClosed(instantiate(memory,p.start,map));
  else target=memory.ensure(instantiate(memory,p.start,map),instantiate(memory,p.end,map));
  const prior=map.get(source);assert(prior===undefined||prior===target,"A28 clone conflict");
  map.set(source,target);return target;
}

function runInventory(
  memory:Memory,
  rule:LinkHandle,
  inventory:LinkHandle,
  targetSeeds:LinkHandle,
):Readonly<{
  candidate:LinkHandle;
  publication:LinkHandle;
  M:LinkHandle;
  compatibleCount:number;
  inventoryCount:number;
}>{
  const sources=readExactSequence(memory,inventory).values;
  assert(sources.length>0,"A28 non-empty broad template inventory");
  const candidates=new Set<LinkHandle>(),publications=new Set<LinkHandle>(),metas=new Set<LinkHandle>();
  let compatibleCount=0;

  for(const source of sources){
    const map=derivedSeedMap(memory,source,targetSeeds);
    if(map===undefined)continue;
    compatibleCount+=1;
    const candidate=instantiate(memory,source,map);
    assert(admitted(memory,rule,candidate),"A28 structurally derived target candidate admitted");
    const values=readExactSequence(memory,candidate).values;
    const meta=values[M];assert(meta!==undefined,"A28 target M");
    const publication=memory.ensure(candidate,meta);
    candidates.add(candidate);publications.add(publication);metas.add(meta);
  }

  assert(compatibleCount>0,"A28 at least one structurally compatible template");
  same(candidates.size,1,"A28 derived compatible templates converge candidate");
  same(publications.size,1,"A28 derived compatible templates converge publication");
  same(metas.size,1,"A28 derived compatible templates converge M");
  return Object.freeze({
    candidate:[...candidates][0]!,publication:[...publications][0]!,M:[...metas][0]!,
    compatibleCount,inventoryCount:sources.length,
  });
}

function exercise(noise:boolean):void{
  const memory=new Memory(),b=ensureRootBasis(memory);
  if(noise)memory.ensure(memory.ensure(b.L,b.U),b.C);

  const source1=buildFamily(memory,b,memory.ensure(b.U,b.L));
  const source2=buildFamily(memory,b,memory.ensure(b.O,b.U));
  const source3=buildFamily(memory,b,memory.ensure(b.C,b.L));
  const target=buildFamily(memory,b,memory.ensure(b.C,b.U));
  const rule=defineRule(memory);

  const t1=producerTemplate(
    memory,source1.metaParent,[source1.E0,source1.E1,source1.E2,source1.E3,source1.E4],
  );
  const t2=producerTemplate(
    memory,source2.metaParent,[source2.E0,source2.E1,source2.E2,source2.E3,source2.E4],
  );
  // Valid producer authority, but with only three transitions. It can execute
  // its own E0..E3 history, yet is structurally incompatible with the target's
  // four-transition description.
  const t3=producerTemplate(
    memory,source3.metaParent,[source3.E0,source3.E1,source3.E2,source3.E3],
  );
  assert(new Set([t1.candidate,t2.candidate,t3.candidate]).size===3,
    "A28 broad inventory source candidate identities distinct");
  assert(admitted(memory,rule,t1.candidate)&&admitted(memory,rule,t2.candidate),
    "A28 full-length source templates admitted");

  let shortTruth=memory.ensure(t3.M,source3.E0);
  for(const expected of [source3.E1,source3.E2,source3.E3]){
    const next=metaStep(memory,shortTruth);
    assert(next!==undefined,"A28 shorter source authority executes");
    same(memory.poles(next).end,expected,"A28 shorter authority transition");
    shortTruth=next;
  }
  same(metaStep(memory,shortTruth),undefined,"A28 shorter valid authority terminates");

  const targetSeeds=seedSequence(memory,target);
  same(memory.find(target.E0,target.E1),undefined,"A28 target authority absent at freeze");

  // Inventory members are source candidates only: no sourceSeeds->targetSeeds
  // correspondence Link is frozen per template.
  const inventory=materializeExactSequence(memory,[t1.candidate,t2.candidate,t3.candidate]);
  const out=runInventory(memory,rule,inventory,targetSeeds);
  same(out.inventoryCount,3,"A28 broad inventory size");
  same(out.compatibleCount,2,"A28 structurally derived compatible subset size");

  let truth=memory.ensure(out.M,target.E0);
  for(const expected of [target.E1,target.E2,target.E3,target.E4]){
    const next=metaStep(memory,truth);assert(next!==undefined,"A28 target meta-step");
    same(memory.poles(next).end,expected,"A28 derived authority execution");truth=next;
  }
  same(metaStep(memory,truth),undefined,"A28 terminal ZERO");

  // Late ambient full-length source candidate remains inert outside frozen inventory.
  producerTemplate(
    memory,source3.metaParent,[source3.E0,source3.E1,source3.E2,source3.E3,source3.E4],
  );
  const afterAmbient=runInventory(memory,rule,inventory,targetSeeds);
  same(afterAmbient.inventoryCount,3,"A28 ambient candidate does not mutate inventory");
  same(afterAmbient.compatibleCount,2,"A28 ambient compatible candidate ignored");
  same(afterAmbient.candidate,out.candidate,"A28 ambient candidate preserves target");

  // Remove one authority-chain cell from the candidate evidence while leaving
  // the actual ambient topology intact. Structural extraction must reject the
  // malformed selected candidate instead of recovering it from ambient Memory.
  const bad=[...readExactSequence(memory,t1.candidate).values];
  const env=memory.poles(t1.M).end;
  const firstCell=memory.poles(env).end;
  const index=bad.indexOf(firstCell);
  assert(index>=0,"A28 malformed candidate locates authority cell");
  bad[index]=memory.ensure(source1.E4,source1.E0);
  const malformed=materializeExactSequence(memory,bad);
  expectThrows(
    ()=>{runInventory(
      memory,rule,materializeExactSequence(memory,[t1.candidate,t2.candidate,malformed]),targetSeeds,
    );},
    "A28 malformed structural producer evidence rejected",
  );
}

function staticGuards():void{
  const root=resolve(process.cwd(),"..");
  const own=readFileSync(
    join(root,"ts/test/research-v013-derived-meta-seed-correspondence-a28.test.ts"),"utf8",
  );
  const prior=readFileSync(
    join(root,"ts/test/research-v013-meta-transition-authority-a23.test.ts"),"utf8",
  );
  const a=own.slice(
    own.indexOf("function metaStep("),
    own.indexOf("\nconst ROOT=",own.indexOf("function metaStep(")),
  );
  const b=prior.slice(
    prior.indexOf("function metaStep("),
    prior.indexOf("\nfunction frontierOccurrences(",prior.indexOf("function metaStep(")),
  );
  same(a.replace(/\s+/g,""),b.replace(/\s+/g,""),"A28 unchanged A23 metaStep");

  const derive=own.slice(
    own.indexOf("function deriveProducerSeeds("),
    own.indexOf("\nfunction derivedSeedMap(",own.indexOf("function deriveProducerSeeds(")),
  );
  for(const x of ["META","E0","E1","E2","E3","E4","T0","C0","ENV","switch(", ".find(", ".outgoing(", ".incoming(", "allLinks("])
    assert(!derive.includes(x),`A28 structural seed extractor excludes positional/ambient primitive ${x}`);

  const runner=own.slice(
    own.indexOf("function runInventory("),
    own.indexOf("\nfunction exercise(",own.indexOf("function runInventory(")),
  );
  for(const x of ["source1","source2","source3","t1","t2","t3","correspondence","switch(","allLinks(", ".outgoing(", ".incoming("])
    assert(!runner.includes(x),`A28 inventory runner excludes explicit correspondence/template primitive ${x}`);
}

function main():void{
  exercise(false);exercise(true);staticGuards();
  console.log([
    "MTS v0.13 A28: DERIVED_META_SEED_CORRESPONDENCE=GREEN_SCOPED_RESEARCH",
    "BROAD_INVENTORY_SIZE=3 DERIVED_COMPATIBLE_TEMPLATES=2",
    "VALID_SHORTER_PRODUCER_TEMPLATE=EXCLUDED_BY_STRUCTURAL_ARITY",
    "EXPLICIT_PER_TEMPLATE_SEED_CORRESPONDENCE=REMOVED",
    "SOURCE_SEEDS=DERIVED_FROM_PRODUCER_AUTHORITY_TOPOLOGY",
    "TARGET_SEED_DESCRIPTION=EXTERNAL_SELECTED",
    "DISTINCT_TARGET_CANDIDATES=1 DISTINCT_TARGET_PUBLICATIONS=1 DISTINCT_TARGET_META_CONTEXTS=1",
    "TARGET_AUTHORITY_ABSENT_AT_FREEZE=YES FROZEN_STRUCTURAL_ADMISSION=GREEN",
    "UNCHANGED_A23_META_STEP=YES LATE_AMBIENT_COMPATIBLE_CANDIDATE=IGNORED",
    "MALFORMED_STRUCTURAL_PRODUCER_EVIDENCE=REJECTED",
    "EXTERNAL_BROAD_INVENTORY_MEMBERSHIP=YES EXTERNAL_SEQUENCE_CORRESPONDENCE=NO",
    "EXTERNAL_TARGET_SEED_SELECTION=YES SEMANTIC_INFORMATION_ELIMINATED=NOT_CLAIMED",
    "INDEPENDENT_MEMORIES=2 GLOBAL_E2=OPEN GLOBAL_E3=OPEN",
    "FULL_SELF_HOSTED=NOT_CLAIMED PRODUCTION_UNCHANGED",
  ].join(" "));
}
main();
