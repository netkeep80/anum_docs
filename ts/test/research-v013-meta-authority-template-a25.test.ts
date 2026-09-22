import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { materializeExactSequence, readExactSequence } from "../src/exact-sequence.js";
import {
  Memory, ensureRootBasis, type LinkHandle, type ReadMemory, type RootBasis,
} from "../src/memory.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.13 A25 meta authority template: ${message}`);
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
  assert(e.start === envelope && e.end !== envelope, "A25 proper START-self envelope");
  const out: LinkHandle[] = [];
  const seen = new Set<LinkHandle>();
  let cursor = e.end;
  while (cursor !== memory.root) {
    assert(!seen.has(cursor), "A25 chain cycle");
    seen.add(cursor);
    const cell = memory.poles(cursor);
    out.push(cell.start);
    cursor = cell.end;
  }
  return Object.freeze(out);
}

interface Family {
  readonly K: LinkHandle; readonly metaParent: LinkHandle;
  readonly E0: LinkHandle; readonly E1: LinkHandle; readonly E2: LinkHandle;
  readonly E3: LinkHandle; readonly E4: LinkHandle;
}

function referenceNextExecution(memory: Memory, executionRoot: LinkHandle): LinkHandle {
  const execution = memory.poles(executionRoot);
  const context = execution.start;
  const continuations = readChain(memory, memory.poles(context).end);
  const occurrences = readChain(memory, execution.end);
  let nextBody = memory.root;
  for (const occurrence of occurrences) {
    const truth = memory.poles(memory.poles(occurrence).end);
    assert(truth.start === context, "A25 reference truth keeps K");
    for (const continuation of continuations) {
      const p = memory.poles(continuation);
      if (p.start !== truth.end) continue;
      const nextTruth = memory.ensure(context, p.end);
      nextBody = memory.ensure(memory.ensure(occurrence, nextTruth), nextBody);
    }
  }
  return memory.ensure(context, memory.ensureStartSelfClosed(nextBody));
}

function buildFamily(memory: Memory, b: RootBasis, seed: LinkHandle): Family {
  const fresh: LinkHandle[] = [];
  let x = seed;
  for (let i = 0; i < 18; i += 1) {
    x = memory.ensure(x, i % 2 === 0 ? b.O : b.C);
    fresh.push(x);
  }
  const at = (i: number): LinkHandle => {
    const v = fresh[i]; assert(v !== undefined, `A25 fresh ${i}`); return v;
  };
  const A0 = memory.ensure(at(0), at(1)), A1 = memory.ensure(at(2), at(3));
  const A2 = memory.ensure(at(4), at(5)), A3 = memory.ensure(at(6), at(7));
  const A4 = memory.ensure(at(8), at(9)), Z = memory.ensure(at(10), at(11));
  const parent = memory.ensure(at(12), at(13));
  const metaParent = memory.ensure(at(14), at(15));
  const semanticAuthority = freezeChain(memory, [
    memory.ensure(A0, A1), memory.ensure(A0, A2),
    memory.ensure(A2, A3), memory.ensure(A2, A4),
    memory.ensure(A3, Z), memory.ensure(A4, Z),
  ]);
  const K = memory.ensure(parent, semanticAuthority);
  const truth0 = memory.ensure(K, A0);
  const occurrence0 = memory.ensure(memory.root, truth0);
  const E0 = memory.ensure(K, freezeChain(memory, [occurrence0]));
  const E1 = referenceNextExecution(memory, E0);
  const E2 = referenceNextExecution(memory, E1);
  const E3 = referenceNextExecution(memory, E2);
  const E4 = referenceNextExecution(memory, E3);
  return Object.freeze({ K, metaParent, E0, E1, E2, E3, E4 });
}

/** Exact A23 runtime consumer; A25 changes only producer-authority source. */
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

function anonymousRoles(memory: Memory): readonly LinkHandle[] {
  const b = ensureRootBasis(memory);
  const roles: LinkHandle[] = [];
  let x = memory.ensure(b.O, b.U);
  for (let i=0;i<17;i+=1) { x=memory.ensure(x,i%2===0?b.L:b.C); roles.push(x); }
  return Object.freeze(roles);
}
function defineRule(memory: Memory): LinkHandle {
  const r=anonymousRoles(memory);
  const triples=[
    [T0,E0,E1],[T1,E1,E2],[T2,E2,E3],[T3,E3,E4],
    [C3,T3,ROOT],[C2,T2,C3],[C1,T1,C2],[C0,T0,C1],
    [ENV,ENV,C0],[M,META,ENV],
  ] as const;
  return materializeExactSequence(memory,[
    materializeExactSequence(memory,r),
    materializeExactSequence(memory,triples.map(([t,s,e])=>
      materializeExactSequence(memory,[r[t]!,r[s]!,r[e]!])));
  ]);
}
function structurallyAdmitted(memory: ReadMemory, rule: LinkHandle, candidate: LinkHandle): boolean {
  try {
    const p=readExactSequence(memory,rule).values;
    if(p.length!==2||p[0]===undefined||p[1]===undefined) return false;
    const roles=readExactSequence(memory,p[0]).values;
    const values=readExactSequence(memory,candidate).values;
    if(roles.length!==values.length||new Set(roles).size!==roles.length) return false;
    const bind=new Map<LinkHandle,LinkHandle>();
    roles.forEach((r,i)=>{ if(values[i]!==undefined) bind.set(r,values[i]!); });
    if(bind.size!==roles.length) return false;
    for(const c of readExactSequence(memory,p[1]).values){
      const q=readExactSequence(memory,c).values;
      if(q.length!==3) return false;
      const t=bind.get(q[0]!),s=bind.get(q[1]!),e=bind.get(q[2]!);
      if(t===undefined||s===undefined||e===undefined||memory.find(s,e)!==t) return false;
    }
    return true;
  } catch { return false; }
}

interface Template {
  readonly candidate: LinkHandle;
  readonly M: LinkHandle;
  readonly publication: LinkHandle;
}

function directTemplate(memory: Memory, rule: LinkHandle, f: Family): Template {
  const es=[f.E0,f.E1,f.E2,f.E3,f.E4] as const;
  const ts=es.slice(0,-1).map((e,i)=>memory.ensure(e,es[i+1]!));
  let tail=memory.root; const cells:LinkHandle[]=[];
  for(let i=ts.length-1;i>=0;i-=1){ tail=memory.ensure(ts[i]!,tail); cells.unshift(tail); }
  const env=memory.ensureStartSelfClosed(cells[0]!);
  const meta=memory.ensure(f.metaParent,env);
  const values=[
    memory.root,f.metaParent,...es,...ts,cells[3]!,cells[2]!,cells[1]!,cells[0]!,env,meta,
  ];
  const candidate=materializeExactSequence(memory,values);
  assert(structurallyAdmitted(memory,rule,candidate),"A25 source template admitted");
  return Object.freeze({
    candidate,M:meta,publication:memory.ensure(candidate,meta),
  });
}

function seedSequence(memory: Memory, f: Family): LinkHandle {
  return materializeExactSequence(memory,[f.metaParent,f.E0,f.E1,f.E2,f.E3,f.E4]);
}
function deriveSeedMap(
  memory: Memory,
  correspondence: LinkHandle,
): Map<LinkHandle,LinkHandle> {
  const p=memory.poles(correspondence);
  const a=readExactSequence(memory,p.start).values;
  const b=readExactSequence(memory,p.end).values;
  assert(a.length===b.length,"A25 correspondence cardinality");
  const map=new Map<LinkHandle,LinkHandle>([[memory.root,memory.root]]);
  for(let i=0;i<a.length;i+=1){
    const s=a[i],t=b[i]; assert(s!==undefined&&t!==undefined,"A25 complete correspondence");
    const prior=map.get(s); assert(prior===undefined||prior===t,"A25 correspondence conflict");
    map.set(s,t);
  }
  return map;
}

/** Generic topology instantiation; semantic correspondence is entirely seed data. */
function instantiate(
  memory: Memory,
  source: LinkHandle,
  map: Map<LinkHandle,LinkHandle>,
): LinkHandle {
  const known=map.get(source);
  if(known!==undefined) return known;
  const p=memory.poles(source);
  let target:LinkHandle;
  if(p.start===source&&p.end===source) target=memory.ensureRoot();
  else if(p.start===source) target=memory.ensureStartSelfClosed(instantiate(memory,p.end,map));
  else if(p.end===source) target=memory.ensureEndSelfClosed(instantiate(memory,p.start,map));
  else target=memory.ensure(instantiate(memory,p.start,map),instantiate(memory,p.end,map));
  const prior=map.get(source); assert(prior===undefined||prior===target,"A25 clone conflict");
  map.set(source,target);
  return target;
}

function run(noise:boolean):void{
  const memory=new Memory(), b=ensureRootBasis(memory);
  if(noise) memory.ensure(memory.ensure(b.L,b.U),b.C);
  const source=buildFamily(memory,b,memory.ensure(b.U,b.L));
  const target=buildFamily(memory,b,memory.ensure(b.C,b.U));
  const rule=defineRule(memory);
  const template=directTemplate(memory,rule,source);
  assert(template.publication===memory.find(template.candidate,template.M),"A25 source published");

  const sourceSeeds=seedSequence(memory,source);
  const targetSeeds=seedSequence(memory,target);
  const correspondence=memory.ensure(sourceSeeds,targetSeeds);
  same(memory.find(target.E0,target.E1),undefined,"A25 target authority absent at freeze");

  const map=deriveSeedMap(memory,correspondence);
  const targetCandidate=instantiate(memory,template.candidate,map);
  assert(structurallyAdmitted(memory,rule,targetCandidate),"A25 cloned target candidate admitted");
  const values=readExactSequence(memory,targetCandidate).values;
  same(values.length,17,"A25 cloned candidate arity");
  const targetM=values[M]; assert(targetM!==undefined,"A25 target M");
  const publication=memory.ensure(targetCandidate,targetM);
  assert(memory.find(targetCandidate,targetM)===publication,"A25 target publication");

  let truth=memory.ensure(targetM,target.E0);
  for(const expected of [target.E1,target.E2,target.E3,target.E4]){
    const next=metaStep(memory,truth); assert(next!==undefined,"A25 target meta-step");
    same(memory.poles(next).end,expected,"A25 cloned authority selects target execution");
    truth=next;
  }
  same(metaStep(memory,truth),undefined,"A25 target terminal ZERO");

  const shortTarget=materializeExactSequence(memory,[target.metaParent,target.E0,target.E1]);
  expectThrows(
    ()=>{ deriveSeedMap(memory,memory.ensure(sourceSeeds,shortTarget)); },
    "A25 malformed correspondence rejected",
  );
}

function staticGuards():void{
  const root=resolve(process.cwd(),"..");
  const own=readFileSync(join(root,"ts/test/research-v013-meta-authority-template-a25.test.ts"),"utf8");
  const prior=readFileSync(join(root,"ts/test/research-v013-meta-transition-authority-a23.test.ts"),"utf8");
  const a=own.slice(own.indexOf("function metaStep("),own.indexOf("\nconst ROOT=",own.indexOf("function metaStep(")));
  const b=prior.slice(prior.indexOf("function metaStep("),prior.indexOf("\nfunction frontierOccurrences(",prior.indexOf("function metaStep(")));
  same(a.replace(/\s+/g,""),b.replace(/\s+/g,""),"A25 unchanged A23 metaStep");
  const clone=own.slice(own.indexOf("function instantiate("),own.indexOf("\nfunction run(",own.indexOf("function instantiate(")));
  for(const x of ["E0","E1","E2","E3","E4","META","candidate","publication","switch("])
    assert(!clone.includes(x),`A25 generic clone excludes semantic branch ${x}`);
}

function main():void{
  run(false); run(true); staticGuards();
  console.log([
    "MTS v0.13 A25: META_AUTHORITY_TEMPLATE_INSTANTIATION=GREEN_SCOPED_RESEARCH",
    "TARGET_POSITIONAL_GENERATION_REQUEST=REMOVED SEQUENCE_CORRESPONDENCE_SOURCES=1",
    "DERIVED_SEED_MAPPINGS=7 TARGET_AUTHORITY_ABSENT_AT_FREEZE=YES",
    "GENERIC_TOPOLOGY_INSTANTIATION=GREEN FROZEN_STRUCTURAL_ADMISSION=GREEN",
    "EXPLICIT_PUBLICATION=YES UNCHANGED_A23_META_STEP=YES",
    "MALFORMED_CORRESPONDENCE=REJECTED EXTERNAL_TEMPLATE_SELECTION=YES",
    "EXTERNAL_SEQUENCE_CORRESPONDENCE=YES SEMANTIC_INFORMATION_ELIMINATED=NOT_CLAIMED",
    "INDEPENDENT_MEMORIES=2 GLOBAL_E2=OPEN GLOBAL_E3=OPEN FULL_SELF_HOSTED=NOT_CLAIMED",
    "PRODUCTION_UNCHANGED",
  ].join(" "));
}
main();
