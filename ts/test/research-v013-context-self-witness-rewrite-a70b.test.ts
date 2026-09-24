import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import {
  materializeExactSequence,
  readExactSequence,
} from "../src/exact-sequence.js";
import { Memory, ensureRootBasis, type LinkHandle } from "../src/memory.js";
import { defineContext, readContext } from "../src/state.js";

function assert(c:unknown,m:string):asserts c{
  if(!c)throw new Error(`v0.13 A70b context self-witness rewrite: ${m}`);
}
function same<T>(a:T,e:T,m:string):void{
  assert(Object.is(a,e),`${m}: values differ`);
}
function setSame(actual:readonly LinkHandle[],expected:readonly LinkHandle[],m:string):void{
  same(new Set(actual).size,new Set(expected).size,`${m}: cardinality`);
  for(const x of expected)assert(actual.includes(x),`${m}: missing expected Link`);
}
function expectThrows(fn:()=>void,m:string):void{
  let threw=false;
  try{fn();}catch{threw=true;}
  assert(threw,m);
}

/**
 * Source-identical A68a rewrite core.
 */
function rewriteSelectedOne(
  memory: Memory,
  activeTruth: LinkHandle,
  selectedContinuationCarrier: LinkHandle,
): readonly LinkHandle[] {
  const active = memory.poles(activeTruth);
  const context = active.start;
  const antecedent = active.end;

  const selected = readExactSequence(memory, selectedContinuationCarrier).values;
  const targets = selected.map((continuation) => {
    const c = memory.poles(continuation);
    same(c.start, antecedent, "selected continuation starts at active antecedent");
    return c.end;
  });

  return Object.freeze(
    targets.map((target) => memory.ensure(context, target)),
  );
}

function carrier(memory:Memory,values:readonly LinkHandle[]):LinkHandle{
  return materializeExactSequence(memory,values);
}

function exercise(noise:boolean):void{
  const memory=new Memory();
  const b=ensureRootBasis(memory);
  const C=b.C;
  if(noise)memory.ensure(memory.ensure(b.U,b.C),memory.ensure(b.O,b.L));

  const fresh:LinkHandle[]=[];
  let seed=memory.ensure(b.U,b.L);
  for(let i=0;i<14;i+=1){
    seed=memory.ensure(seed,i%2===0?b.O:b.C);
    fresh.push(seed);
  }
  const at=(i:number):LinkHandle=>{
    const value=fresh[i];
    assert(value!==undefined,`fresh anchor ${i}`);
    return value;
  };

  const s0=memory.ensure(at(0),at(1));
  const s1=memory.ensure(at(2),at(3));
  const s2=memory.ensure(at(4),at(5));
  const ambient=memory.ensure(at(6),at(7));

  // K is an ordinary C-rooted execution Context.
  const K=defineContext(memory,C,s0);
  const payload=memory.ensure(C,s0);
  const kp=memory.poles(K);
  same(kp.start,K,"Context K is START-self-closed");
  same(kp.end,payload,"Context K END is exact parent->current payload");

  // This is the key identity. No separate K->payload active-truth Link exists:
  // K itself already IS K->payload through START self-closure.
  same(memory.ensure(K,payload),K,
    "Context identity is its own active K->payload witness");

  const toS1=memory.ensure(payload,s1);
  const toS2=memory.ensure(payload,s2);
  const ambientContinuation=memory.ensure(payload,ambient);

  // ZERO: same source-identical rewrite core returns no next payload and
  // therefore no child Context needs to exist.
  const beforeZero=memory.linkCount;
  const zero=rewriteSelectedOne(memory,K,carrier(memory,[]));
  same(zero.length,0,"ZERO continuation gives zero rewrite outputs");
  same(memory.linkCount,beforeZero,"ZERO rewrite writes no Links");

  // ONE: the generic A68 result K->S1 is exactly the payload whose START lift
  // is the ordinary immutable child Context(K,S1).
  assert(memory.find(K,s1)===undefined,"K->S1 absent before selected rewrite");
  const one=rewriteSelectedOne(memory,K,carrier(memory,[toS1]));
  same(one.length,1,"ONE output count");
  const q1=one[0]!;
  same(q1,memory.ensure(K,s1),"A68 output is exact K->S1 payload");
  const child1=memory.ensureStartSelfClosed(q1);
  same(child1,defineContext(memory,K,s1),
    "START(A68 output) is exact child Context(K,S1)");
  same(readContext(memory,child1).parent,K,"child1 parent");
  same(readContext(memory,child1).current,s1,"child1 current");

  // MANY: each A68 result START-lifts to one sibling child under the same K.
  const many=rewriteSelectedOne(memory,K,carrier(memory,[toS1,toS2]));
  const q2=memory.ensure(K,s2);
  setSame(many,[q1,q2],"MANY exact payload outputs");
  const children=many.map(q=>memory.ensureStartSelfClosed(q));
  const child2=defineContext(memory,K,s2);
  setSame(children,[child1,child2],"MANY START-lifts to sibling Contexts");
  same(readContext(memory,child2).parent,K,"child2 shares K parent");

  // Ambient physical continuation is inert unless selected.
  assert(memory.find(K,ambient)===undefined,
    "ambient K->target absent before selected rewrite");
  same(memory.poles(ambientContinuation).start,payload,
    "ambient continuation physically exists");
  rewriteSelectedOne(memory,K,carrier(memory,[toS1]));
  assert(memory.find(K,ambient)===undefined,
    "ambient continuation does not create child payload");

  // Selected order changes no extensional child set.
  const reverse=rewriteSelectedOne(memory,K,carrier(memory,[toS2,toS1]));
  setSame(reverse,many,"selected order preserves rewrite payload set");
  setSame(
    reverse.map(q=>memory.ensureStartSelfClosed(q)),
    children,
    "selected order preserves child Context set",
  );

  // The old K remains immutable while descendants represent persistent next
  // execution states.
  same(readContext(memory,K).parent,C,"K parent remains C");
  same(readContext(memory,K).current,s0,"K current remains original S0");

  // END result uses the exact same rewrite core and collapses BEFORE any
  // activation lift:
  //
  //   K -> END(K) = END(K)
  //
  // Unconditionally START-lifting this result would create a different Link,
  // so terminal handling must be derived from result topology, not hidden in
  // the A68 rewrite primitive.
  const endK=memory.ensureEndSelfClosed(K);
  const toEnd=memory.ensure(payload,endK);
  const terminal=rewriteSelectedOne(memory,K,carrier(memory,[toEnd]));
  setSame(terminal,[endK],"generic rewrite reaches canonical END(K)");
  const startOfEnd=memory.ensureStartSelfClosed(endK);
  assert(startOfEnd!==endK,
    "unconditional START lift would destroy exact END terminal identity");

  // Ordinary and terminal outputs may coexist in one selected rewrite.
  const mixed=rewriteSelectedOne(memory,K,carrier(memory,[toS1,toEnd]));
  setSame(mixed,[q1,endK],"ordinary payload and END terminal coexist");

  // START-side fixed-point recurrence is another non-ordinary output:
  // selecting payload->payload derives K itself.
  const stay=memory.ensure(payload,payload);
  const recurrent=rewriteSelectedOne(memory,K,carrier(memory,[stay]));
  setSame(recurrent,[K],"payload identity continuation re-derives active Context K");

  // Malformed selected authority still fails before the first output write,
  // inherited from the source-identical A68a core.
  const foreign=memory.ensure(at(8),at(9));
  const badTarget=memory.ensure(at(10),at(11));
  const bad=memory.ensure(foreign,badTarget);
  const selectedBad=carrier(memory,[toS1,bad]);
  const freshTarget=memory.ensure(at(12),at(13));
  assert(memory.find(K,freshTarget)===undefined,"negative fresh target absent");
  const beforeBad=memory.linkCount;
  expectThrows(
    ()=>rewriteSelectedOne(memory,K,selectedBad),
    "foreign continuation antecedent rejected",
  );
  same(memory.linkCount,beforeBad,"malformed selection writes no outputs");
}

function sourceSlice(source:string,start:string,end:string):string{
  const i=source.indexOf(start),j=source.indexOf(end,i+1);
  assert(i>=0&&j>i,`source slice ${start}`);
  return source.slice(i,j).replace(/\s+/g,"");
}
function staticGuards():void{
  const root=resolve(process.cwd(),"..");
  const own=readFileSync(
    join(root,"ts/test/research-v013-context-self-witness-rewrite-a70b.test.ts"),"utf8",
  );
  const a68=readFileSync(
    join(root,"ts/test/research-v013-uniform-active-rewrite-a68a.test.ts"),"utf8",
  );

  same(
    sourceSlice(own,"function rewriteSelectedOne(","\nfunction carrier("),
    sourceSlice(a68,"function rewriteSelectedOne(","\nfunction carrier("),
    "A70b rewrite kernel is source-identical A68a",
  );

  const exercise=sourceSlice(own,"function exercise(","\nfunction sourceSlice(");
  assert(exercise.includes("rewriteSelectedOne(memory,K,"),
    "Context K itself is supplied as active truth");
  assert(exercise.includes("memory.ensureStartSelfClosed(q1)"),
    "ordinary rewrite payload is START-lifted into child Context");
  assert(exercise.includes("startOfEnd!==endK"),
    "terminal result is not silently START-lifted");
}

function main():void{
  exercise(false);
  exercise(true);
  staticGuards();
  console.log([
    "MTS v0.13 A70b: CONTEXT_SELF_WITNESS_ACTIVE_REWRITE=GREEN_SCOPED_RESEARCH",
    "K=START_PAYLOAD_IMPLIES_K_TO_PAYLOAD_EQ_K",
    "SEPARATE_ACTIVE_TRUTH_LINK=0",
    "REWRITE_CORE=A68A_SOURCE_IDENTICAL",
    "ZERO=ZERO_CHILD_PAYLOADS",
    "ONE=K_TO_S_NEXT",
    "ONE_START_LIFT=CONTEXT_K_S_NEXT",
    "MANY=Sibling_CHILD_CONTEXTS_UNDER_K",
    "OLD_K=IMMUTABLE",
    "AMBIENT_CONTINUATION=INERT",
    "SELECTED_ORDER=EXTENSIONALLY_INERT",
    "END_TARGET=CANONICAL_END_K_BEFORE_ACTIVATION",
    "UNCONDITIONAL_START_AFTER_END=INVALID",
    "MIXED_ORDINARY_AND_END=COEXIST",
    "PAYLOAD_IDENTITY_CONTINUATION=REDERIVES_K",
    "OUTPUT_ASPECT_TO_ACTIVATION_POLICY=NEXT_BOUNDARY_A70C",
    "FULL_SELF_HOSTED=FALSE",
    "V013_NOT_ACCEPTED PRODUCTION_UNCHANGED",
  ].join(" "));
}
main();
