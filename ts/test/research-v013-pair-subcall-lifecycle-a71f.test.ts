import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import {
  materializeExactSequence,
  readExactSequence,
} from "../src/exact-sequence.js";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
} from "../src/memory.js";
import {
  defineContext,
  readContext,
} from "../src/state.js";
import {
  resolveFlatBundle,
  type BundleValue,
  type ResolvedOccurrence,
} from "../src/value-bundle.js";

function assert(c:unknown,m:string):asserts c{
  if(!c)throw new Error(`v0.13 A71f PAIR subcall lifecycle: ${m}`);
}
function same<T>(a:T,e:T,m:string):void{
  assert(Object.is(a,e),`${m}: values differ`);
}
function setSameArray(actual:readonly LinkHandle[],expected:readonly LinkHandle[],m:string):void{
  same(new Set(actual).size,new Set(expected).size,`${m}: cardinality`);
  for(const x of expected)assert(actual.includes(x),`${m}: missing expected Link`);
}
function setSameBundle(actual:ReadonlySet<LinkHandle>,expected:readonly LinkHandle[],m:string):void{
  same(actual.size,new Set(expected).size,`${m}: cardinality`);
  for(const x of expected)assert(actual.has(x),`${m}: missing expected Link`);
}

/** Source-identical A68a rewrite core. */
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

/** Source-identical A16-F4 pair request executor. */
function executePairRequests(
  memory: Memory,
  context: LinkHandle,
  requestFrontier: BundleValue,
): BundleValue {
  const calls: ResolvedOccurrence[] = [];

  for (const parent of requestFrontier.occurrences) {
    const requestTruth = memory.poles(parent.link);
    assert(requestTruth.start === context, "A16-F4 request truth starts at K");

    const request = memory.poles(requestTruth.end);
    const leftWitness = memory.poles(request.start);
    const rightWitness = memory.poles(request.end);

    assert(
      leftWitness.start === context && rightWitness.start === context,
      "A16-F4 request operands are truths of the same context",
    );

    const pair = memory.ensure(leftWitness.end, rightWitness.end);
    calls.push(Object.freeze({
      path: parent.path,
      link: memory.ensure(context, pair),
    }));
  }

  return resolveFlatBundle(memory, Object.freeze(calls));
}

/** Source-identical A70e child discovery. */
function childContexts(
  memory:Memory,
  parent:LinkHandle,
):readonly LinkHandle[]{
  const out:LinkHandle[]=[];
  const seen=new Set<LinkHandle>();

  for(const payload of memory.outgoing(parent)){
    const p=memory.poles(payload);
    if(p.start!==parent || p.end===payload)continue;

    for(const candidate of memory.incoming(payload)){
      if(seen.has(candidate))continue;
      const c=memory.poles(candidate);
      if(c.start!==candidate || c.end!==payload)continue;

      const state=readContext(memory,candidate);
      same(state.parent,parent,"discovered child parent");
      same(state.current,p.end,"discovered child state");

      seen.add(candidate);
      out.push(candidate);
    }
  }

  return Object.freeze(out);
}

/** Source-identical A70e closure discovery. */
function closureOf(
  memory:Memory,
  context:LinkHandle,
):LinkHandle|undefined{
  let closure:LinkHandle|undefined;

  for(const candidate of memory.outgoing(context)){
    const p=memory.poles(candidate);
    if(p.start!==context || p.end!==candidate || p.start===candidate)continue;
    assert(closure===undefined || closure===candidate,
      "multiple proper END closures for one Context");
    closure=candidate;
  }

  return closure;
}

/** Source-identical A70e active frontier. */
function activeFrontier(
  memory:Memory,
  entry:LinkHandle,
):readonly LinkHandle[]{
  const active:LinkHandle[]=[];
  const visiting=new Set<LinkHandle>();
  const visited=new Set<LinkHandle>();

  const walk=(context:LinkHandle):void=>{
    assert(!visiting.has(context),"Context child cycle");
    if(visited.has(context))return;

    visiting.add(context);
    const children=childContexts(memory,context);
    const closure=closureOf(memory,context);

    if(children.length>0){
      assert(closure===undefined,
        "closed non-leaf Context is invalid lifecycle topology");
      for(const child of children)walk(child);
    }else if(closure===undefined){
      active.push(context);
    }

    visiting.delete(context);
    visited.add(context);
  };

  walk(entry);
  return Object.freeze(active);
}

interface PairSubcallProducts{
  readonly caller:LinkHandle;
  readonly requestContext:LinkHandle;
  readonly requestTruth:LinkHandle;
  readonly resultTruths:readonly LinkHandle[];
  readonly resultContexts:readonly LinkHandle[];
  readonly closure:LinkHandle;
}

/**
 * Execute one already-activated PAIR request Context.
 *
 * Authority comes from the Context activation:
 *
 *   requestContext = START(caller -> request)
 *
 * so the exact A16 requestTruth is recovered from the Context payload. No
 * caller, selected request bundle, or operands are supplied as host arguments.
 *
 * Important: this function is still the explicit semantic dispatcher for the
 * PAIR request class. A71f removes request selection/lifecycle authority, not
 * the final request-classification/dispatch residual.
 */
function executeActivePairSubcall(
  memory:Memory,
  requestContext:LinkHandle,
):PairSubcallProducts{
  const requestState=readContext(memory,requestContext);
  const caller=requestState.parent;
  const request=requestState.current;

  const requestTruth=memory.poles(requestContext).end;
  const truthPoles=memory.poles(requestTruth);
  same(truthPoles.start,caller,"active request payload starts at caller");
  same(truthPoles.end,request,"active request payload ends at request");

  const requestFrontier=resolveFlatBundle(memory,Object.freeze([
    Object.freeze({
      path:Object.freeze([]),
      link:requestTruth,
    }),
  ]));
  const result=executePairRequests(memory,caller,requestFrontier);

  // Request subcall closes through the same generic rewrite/END law used by
  // A70d. Its active witness is requestContext -> requestTruth = requestContext.
  const closure=memory.ensureEndSelfClosed(requestContext);
  const toClosure=memory.ensure(requestTruth,closure);
  const reduced=rewriteSelectedOne(
    memory,
    requestContext,
    carrier(memory,[toClosure]),
  );
  setSameArray(reduced,[closure],"request Context closes through generic rewrite");

  // Results return to caller as K->value truths. START-lifting those exact
  // truths creates sibling continuation Contexts under caller.
  const resultTruths=Object.freeze([...result.links]);
  const resultContexts=Object.freeze(
    result.occurrences.map(
      occurrence=>memory.ensureStartSelfClosed(occurrence.link),
    ),
  );

  return Object.freeze({
    caller,
    requestContext,
    requestTruth,
    resultTruths,
    resultContexts,
    closure,
  });
}

function pairRequest(
  memory:Memory,
  caller:LinkHandle,
  left:LinkHandle,
  right:LinkHandle,
):Readonly<{
  leftTruth:LinkHandle;
  rightTruth:LinkHandle;
  request:LinkHandle;
  requestTruth:LinkHandle;
}>{
  const leftTruth=memory.ensure(caller,left);
  const rightTruth=memory.ensure(caller,right);
  const request=memory.ensure(leftTruth,rightTruth);
  const requestTruth=memory.ensure(caller,request);
  return Object.freeze({leftTruth,rightTruth,request,requestTruth});
}

function exercise(noise:boolean):void{
  const memory=new Memory();
  const b=ensureRootBasis(memory);
  const C=b.C;
  if(noise)memory.ensure(memory.ensure(b.U,b.C),memory.ensure(b.O,b.L));

  const fresh:LinkHandle[]=[];
  let seed=memory.ensure(b.U,b.L);
  for(let i=0;i<20;i+=1){
    seed=memory.ensure(seed,i%2===0?b.O:b.C);
    fresh.push(seed);
  }
  const at=(i:number):LinkHandle=>{
    const value=fresh[i];
    assert(value!==undefined,`fresh anchor ${i}`);
    return value;
  };

  const callerState=memory.ensure(at(0),at(1));
  const K=defineContext(memory,C,callerState);
  setSameArray(activeFrontier(memory,K),[K],"fresh caller is active");

  const x=memory.ensure(at(2),at(3));
  const y=memory.ensure(at(4),at(5));
  const request=pairRequest(memory,K,x,y);
  assert(memory.find(x,y)===undefined,"target pair absent before activation");

  // Bare K->Q is not enough. A70e sees no child until START(K->Q) exists.
  setSameArray(activeFrontier(memory,K),[K],
    "bare pair request truth is lifecycle-inert");
  assert(memory.find(x,y)===undefined,
    "bare request truth performs no pair construction");

  // START activation is the request-selection/lifetime event.
  const R=memory.ensureStartSelfClosed(request.requestTruth);
  same(R,defineContext(memory,K,request.request),
    "activated request is exact Context(K,Q)");
  same(readContext(memory,R).parent,K,"request Context parent is caller K");
  same(readContext(memory,R).current,request.request,
    "request Context current is exact pair request Q");
  setSameArray(activeFrontier(memory,K),[R],
    "START request child replaces caller on active frontier");

  // An ambient second K->Q2 request is structurally valid but remains inert
  // because it is not START-activated as a child Context.
  const ambientX=memory.ensure(at(6),at(7));
  const ambientY=memory.ensure(at(8),at(9));
  const ambient=pairRequest(memory,K,ambientX,ambientY);
  assert(memory.find(ambientX,ambientY)===undefined,"ambient target absent");
  setSameArray(activeFrontier(memory,K),[R],
    "ambient non-activated request does not enter frontier");

  const products=executeActivePairSubcall(memory,R);
  same(products.caller,K,"subcall derives exact caller from Context parent");
  same(products.requestContext,R,"subcall exact request Context");
  same(products.requestTruth,request.requestTruth,
    "subcall derives exact A16 request truth from Context payload");

  const pair=memory.find(x,y);
  assert(pair!==undefined,"active PAIR subcall materializes X->Y");
  const resultTruth=memory.find(K,pair);
  assert(resultTruth!==undefined,"PAIR result publishes exact K->pair");
  setSameArray(products.resultTruths,[resultTruth],"one exact return truth");

  same(products.closure,memory.ensureEndSelfClosed(R),
    "request Context closes with exact END(R)");
  same(closureOf(memory,R),products.closure,
    "request closure visible to generic frontier reader");

  const S=memory.ensureStartSelfClosed(resultTruth);
  same(S,defineContext(memory,K,pair),
    "returned K->pair START-lifts to exact sibling continuation Context");
  setSameArray(products.resultContexts,[S],
    "subcall returns one exact sibling continuation Context");
  same(readContext(memory,S).parent,K,"result Context parent is caller K");
  assert(readContext(memory,S).parent!==R,
    "result continuation is sibling of request Context, not its child");

  // Caller K now has two children: closed request R and active result S.
  // Generic A70e lifecycle therefore derives S as the sole frontier.
  setSameArray(childContexts(memory,K),[R,S],
    "caller child history contains request and result siblings");
  setSameArray(activeFrontier(memory,K),[S],
    "closed request plus active result yields exact continuation frontier");

  // Ambient request remains physically present but still not executed.
  assert(memory.find(ambientX,ambientY)===undefined,
    "ambient non-activated request remains unconstructed after subcall");
  assert(!childContexts(memory,K).includes(
    memory.find(K,ambient.request) ?? memory.root
  ),"bare ambient truth is not itself a child Context");

  // Closing the result continuation yields quiescence for this caller tree.
  const endS=memory.ensureEndSelfClosed(S);
  same(closureOf(memory,S),endS,"result Context closure visible");
  setSameArray(activeFrontier(memory,K),[],
    "request closed + result closed yields empty caller frontier");

  // Cross-context request operands are still rejected by the source-identical
  // A16 executor even when their malformed request truth is START-activated.
  const foreignK=defineContext(memory,C,memory.ensure(at(10),at(11)));
  const badX=memory.ensure(at(12),at(13));
  const badY=memory.ensure(at(14),at(15));
  assert(memory.find(badX,badY)===undefined,"bad target absent");
  const localTruth=memory.ensure(K,badX);
  const foreignTruth=memory.ensure(foreignK,badY);
  const badRequest=memory.ensure(localTruth,foreignTruth);
  const badTruth=memory.ensure(K,badRequest);
  const badContext=memory.ensureStartSelfClosed(badTruth);
  let rejected=false;
  try{
    executeActivePairSubcall(memory,badContext);
  }catch{
    rejected=true;
  }
  assert(rejected,"activated cross-context request fails closed");
  assert(memory.find(badX,badY)===undefined,
    "failed cross-context subcall creates no target pair");
}

function sourceSlice(source:string,start:string,end:string):string{
  const i=source.indexOf(start),j=source.indexOf(end,i+1);
  assert(i>=0&&j>i,`source slice ${start}`);
  return source.slice(i,j).replace(/\s+/g,"");
}

function staticGuards():void{
  const root=resolve(process.cwd(),"..");
  const own=readFileSync(
    join(root,"ts/test/research-v013-pair-subcall-lifecycle-a71f.test.ts"),"utf8",
  );
  const a16=readFileSync(
    join(root,"ts/test/research-v013-link-carried-pair-request-a16-f4.test.ts"),"utf8",
  );
  const a70e=readFileSync(
    join(root,"ts/test/research-v013-link-native-frontier-a70e.test.ts"),"utf8",
  );
  const a68=readFileSync(
    join(root,"ts/test/research-v013-uniform-active-rewrite-a68a.test.ts"),"utf8",
  );

  same(
    sourceSlice(own,"function executePairRequests(","\n/** Source-identical A70e"),
    sourceSlice(a16,"function executePairRequests(","\nfunction contextualTruth("),
    "A71f pair executor source-identical A16-F4",
  );
  same(
    sourceSlice(own,"function rewriteSelectedOne(","\nfunction carrier("),
    sourceSlice(a68,"function rewriteSelectedOne(","\nfunction carrier("),
    "A71f closure rewrite source-identical A68a",
  );
  same(
    sourceSlice(own,"function childContexts(","\n/** Source-identical A70e closure"),
    sourceSlice(a70e,"function childContexts(","\n/**\n * Read the unique proper END"),
    "A71f child discovery source-identical A70e",
  );
  same(
    sourceSlice(own,"function closureOf(","\n/** Source-identical A70e active"),
    sourceSlice(a70e,"function closureOf(","\n/**\n * Read the active execution frontier"),
    "A71f closure discovery source-identical A70e",
  );
  same(
    sourceSlice(own,"function activeFrontier(","\ninterface PairSubcallProducts"),
    sourceSlice(a70e,"function activeFrontier(","\nfunction exercise("),
    "A71f active frontier source-identical A70e",
  );

  const subcall=sourceSlice(
    own,
    "function executeActivePairSubcall(",
    "\nfunction pairRequest(",
  );
  assert(!subcall.includes("caller:LinkHandle"),
    "subcall receives no separate caller argument");
  assert(!subcall.includes("requestFrontier:BundleValue"),
    "subcall receives no selected request frontier argument");
  assert(!subcall.includes("left:LinkHandle"),
    "subcall receives no left operand argument");
  assert(!subcall.includes("right:LinkHandle"),
    "subcall receives no right operand argument");
  assert(subcall.includes("readContext(memory,requestContext)"),
    "caller/request authority derives from active Context");
  assert(subcall.includes("memory.poles(requestContext).end"),
    "A16 request truth derives from START Context payload");
  assert(subcall.includes("executePairRequests(memory,caller,requestFrontier)"),
    "activated Context reconnects to A16 request executor");
  assert(subcall.includes("rewriteSelectedOne("),
    "request lifetime closes through generic rewrite");
  assert(subcall.includes("memory.ensureStartSelfClosed(occurrence.link)"),
    "return truth activates sibling continuation by START");

  // Semantic classification is deliberately still explicit: the host selected
  // this executor because this research case is about PAIR subcalls.
  assert(own.includes("A16_F4_EXPLICIT_PAIR_CLASSIFICATION_DISPATCH=RESIDUAL"),
    "A71f keeps final PAIR classification dispatch residual explicit");
}

function main():void{
  exercise(false);
  exercise(true);
  staticGuards();

  console.log([
    "MTS v0.13 A71f: PAIR_SUBCALL_LIFECYCLE=GREEN_SCOPED_RESEARCH",
    "REQUEST_ACTIVATION=START_K_TO_Q",
    "REQUEST_CONTEXT=CONTEXT_K_Q",
    "BARE_K_TO_Q_REQUEST=LIFECYCLE_INERT",
    "CALLER=REQUEST_CONTEXT_PARENT",
    "REQUEST_TRUTH=REQUEST_CONTEXT_START_PAYLOAD",
    "SELECTED_REQUEST_FRONTIER_ARGUMENT=0",
    "SEPARATE_OPERAND_ARGUMENTS=0",
    "PAIR_EXECUTOR=A16_F4_SOURCE_IDENTICAL",
    "PAIR_RESULT_PUBLICATION=K_TO_PAIR",
    "REQUEST_CLOSURE=END_REQUEST_CONTEXT_VIA_A68",
    "RESULT_CONTINUATION=START_K_TO_PAIR",
    "REQUEST_AND_RESULT_CONTEXTS=SIBLINGS_UNDER_CALLER",
    "ACTIVE_FRONTIER_AFTER_RETURN=RESULT_CONTEXT_ONLY",
    "AMBIENT_NONACTIVATED_REQUEST=INERT",
    "CROSS_CONTEXT_ACTIVATED_REQUEST=FAIL_CLOSED",
    "PAIR_SUBCALL_DELIMITER=REQUEST_CONTEXT_PARENT_SCOPED_CANDIDATE",
    "PAIR_REQUEST_SELECTION_AUTHORITY=START_CONTEXT_GREEN",
    "A16_F4_EXPLICIT_PAIR_CLASSIFICATION_DISPATCH=RESIDUAL",
    "REQUEST_Q_PRODUCTION=RESIDUAL",
    "GENERAL_NESTED_CALL_LAW=NOT_YET_CLAIMED",
    "NEXT=A71G_PAIR_REQUEST_CLASSIFICATION_AUTHORITY",
    "FULL_SELF_HOSTED=FALSE",
    "V013_NOT_ACCEPTED PRODUCTION_UNCHANGED",
  ].join(" "));
}

main();
