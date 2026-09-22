import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { Memory, ensureRootBasis, type LinkHandle } from "../src/memory.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.13 A33 generic current occurrence: ${message}`);
}
function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: values differ`);
}
function exact(actual: readonly LinkHandle[], expected: readonly LinkHandle[], message: string): void {
  same(JSON.stringify(actual), JSON.stringify(expected), message);
}
function expectThrows(run: () => void, message: string): void {
  let threw=false; try { run(); } catch { threw=true; } assert(threw,message);
}

interface CurrentOccurrence {
  readonly context: LinkHandle;
  readonly currentValue: LinkHandle;
  readonly history: readonly LinkHandle[];
}

/**
 * Generic current-occurrence reader.
 *
 * Occurrence_n = Occurrence_(n-1) -> ContextualValue_n
 * ContextualValue_n = Context -> Payload_n
 *
 * The reader knows nothing about generation requests, meta execution,
 * targets, templates, states or events.
 */
function readCurrentOccurrence(memory: Memory, head: LinkHandle): CurrentOccurrence {
  const seen=new Set<LinkHandle>();
  const reversed:LinkHandle[]=[];
  let cursor=head;
  let context:LinkHandle|undefined;

  while(true){
    assert(!seen.has(cursor),"A33 occurrence ancestry cycle");
    seen.add(cursor);
    const occurrence=memory.poles(cursor);
    const value=occurrence.end;
    const vp=memory.poles(value);
    if(context===undefined) context=vp.start;
    else same(vp.start,context,"A33 occurrence history keeps one context");
    reversed.push(value);
    if(occurrence.start===memory.root) break;
    cursor=occurrence.start;
  }

  assert(context!==undefined,"A33 current occurrence context");
  reversed.reverse();
  return Object.freeze({
    context,
    currentValue:memory.poles(head).end,
    history:Object.freeze(reversed),
  });
}

function exercise(noise:boolean):void{
  const memory=new Memory(),b=ensureRootBasis(memory);
  if(noise) memory.ensure(memory.ensure(b.L,b.U),b.C);

  const G=memory.ensure(b.O,b.L);
  const h0=memory.ensure(b.C,b.O),h1=memory.ensure(h0,b.L),h2=memory.ensure(h1,b.U);
  const q0=memory.ensure(G,h0),q1=memory.ensure(G,h1),q2=memory.ensure(G,h2);
  const s0=memory.ensure(memory.root,q0),s1=memory.ensure(s0,q1);

  const selectedGeneration=readCurrentOccurrence(memory,s1);
  same(selectedGeneration.context,G,"A33 generation occurrence context");
  same(selectedGeneration.currentValue,q1,"A33 generation current Q");
  exact(selectedGeneration.history,[q0,q1],"A33 generation immutable history");

  // Ambient value and even a newer occurrence are inert while old head is selected.
  memory.ensure(G,memory.ensure(b.U,b.C));
  const s2=memory.ensure(s1,q2);
  const stillGeneration=readCurrentOccurrence(memory,s1);
  same(stillGeneration.currentValue,q1,"A33 ambient newer generation occurrence ignored");
  same(readCurrentOccurrence(memory,s2).currentValue,q2,
    "A33 advancing occurrence head selects newer generation value");

  const M=memory.ensure(b.C,b.L);
  const e0=memory.ensure(b.U,b.O),e1=memory.ensure(e0,b.C),e2=memory.ensure(e1,b.L);
  const mt0=memory.ensure(M,e0),mt1=memory.ensure(M,e1),mt2=memory.ensure(M,e2);
  const m0=memory.ensure(memory.root,mt0),m1=memory.ensure(m0,mt1);

  const selectedMeta=readCurrentOccurrence(memory,m1);
  same(selectedMeta.context,M,"A33 meta occurrence context");
  same(selectedMeta.currentValue,mt1,"A33 meta current truth");
  exact(selectedMeta.history,[mt0,mt1],"A33 meta immutable history");

  memory.ensure(M,memory.ensure(b.O,b.U));
  const m2=memory.ensure(m1,mt2);
  same(readCurrentOccurrence(memory,m1).currentValue,mt1,
    "A33 ambient newer meta occurrence ignored");
  same(readCurrentOccurrence(memory,m2).currentValue,mt2,
    "A33 advancing meta occurrence head selects newer truth");

  // Same generic reader must reject mixed contextual histories on either layer.
  const foreignG=memory.ensure(b.O,b.C);
  const foreignQ=memory.ensure(foreignG,h2);
  const mixedGeneration=memory.ensure(s1,foreignQ);
  expectThrows(
    ()=>{readCurrentOccurrence(memory,mixedGeneration);},
    "A33 mixed generation context rejected",
  );

  const foreignM=memory.ensure(b.U,b.L);
  const foreignMetaTruth=memory.ensure(foreignM,e2);
  const mixedMeta=memory.ensure(m1,foreignMetaTruth);
  expectThrows(
    ()=>{readCurrentOccurrence(memory,mixedMeta);},
    "A33 mixed meta context rejected",
  );
}

function staticGuards():void{
  const root=resolve(process.cwd(),"..");
  const own=readFileSync(
    join(root,"ts/test/research-v013-generic-current-occurrence-a33.test.ts"),"utf8",
  );
  const reader=own.slice(
    own.indexOf("function readCurrentOccurrence("),
    own.indexOf("\nfunction exercise(",own.indexOf("function readCurrentOccurrence(")),
  );
  for(const x of [
    "request","target","template","metaStep","produceNextExecution",
    ".find(", ".outgoing(", ".incoming(", "allLinks(", "switch(",
  ]) assert(!reader.includes(x),`A33 generic reader excludes semantic primitive ${x}`);

  const a22=readFileSync(
    join(root,"ts/test/research-v013-meta-detachment-history-a22.test.ts"),"utf8",
  );
  const a32=readFileSync(
    join(root,"ts/test/research-v013-generation-selection-occurrence-a32.test.ts"),"utf8",
  );
  assert(a22.includes("metaOccurrence = f.memory.ensure(metaOccurrence, nextTruth)"),
    "A33 A22 meta history uses occurrence ancestry");
  assert(a32.includes("const s0=memory.ensure(memory.root,q0),s1=memory.ensure(s0,q1)"),
    "A33 A32 generation selection uses occurrence ancestry");
}

function main():void{
  exercise(false);exercise(true);staticGuards();
  console.log([
    "MTS v0.13 A33: GENERIC_CURRENT_OCCURRENCE=GREEN_SCOPED_RESEARCH",
    "COMMON_SHAPE=PREVIOUS_OCCURRENCE_TO_CONTEXTUAL_VALUE",
    "GENERATION_SELECTION_READER=GENERIC META_SELECTION_READER=GENERIC",
    "SEMANTIC_SELECTOR_TYPES_REQUIRED=0",
    "AMBIENT_NEWER_GENERATION_OCCURRENCE=IGNORED",
    "AMBIENT_NEWER_META_OCCURRENCE=IGNORED",
    "ADVANCE_BY_NEW_HEAD=YES",
    "MIXED_GENERATION_CONTEXT=REJECTED MIXED_META_CONTEXT=REJECTED",
    "CURRENT_HEAD_SELECTION=EXECUTOR_STATE_BOUNDARY_SCOPED",
    "INDEPENDENT_MEMORIES=2 GLOBAL_E2=OPEN GLOBAL_E3=OPEN",
    "FULL_SELF_HOSTED=NOT_CLAIMED PRODUCTION_UNCHANGED",
  ].join(" "));
}
main();
