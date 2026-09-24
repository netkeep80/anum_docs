import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

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
  if(!c)throw new Error(`v0.13 A71e pair request/context reconnect: ${m}`);
}
function same<T>(a:T,e:T,m:string):void{
  assert(Object.is(a,e),`${m}: values differ`);
}
function setSame(actual:ReadonlySet<LinkHandle>,expected:readonly LinkHandle[],m:string):void{
  same(actual.size,new Set(expected).size,`${m}: cardinality`);
  for(const x of expected)assert(actual.has(x),`${m}: missing expected Link`);
}

/**
 * Source-identical A16-F4 semantic executor for Link-carried pair requests.
 *
 * Input:
 *   requestTruth = K -> Q
 *   Q            = (K -> X) -> (K -> Y)
 *
 * Output:
 *   K -> (X -> Y)
 *
 * No separate operand parameters are supplied.
 */
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

function requestBundle(
  memory:Memory,
  context:LinkHandle,
  left:LinkHandle,
  right:LinkHandle,
  path:readonly number[],
):Readonly<{
  leftTruth:LinkHandle;
  rightTruth:LinkHandle;
  request:LinkHandle;
  requestTruth:LinkHandle;
  bundle:BundleValue;
}>{
  const leftTruth=memory.ensure(context,left);
  const rightTruth=memory.ensure(context,right);
  const request=memory.ensure(leftTruth,rightTruth);
  const requestTruth=memory.ensure(context,request);
  const bundle=resolveFlatBundle(memory,Object.freeze([
    Object.freeze({
      path:Object.freeze([...path]),
      link:requestTruth,
    }),
  ]));
  return Object.freeze({leftTruth,rightTruth,request,requestTruth,bundle});
}

function exercise(noise:boolean):void{
  const memory=new Memory();
  const b=ensureRootBasis(memory);
  const C=b.C;
  if(noise)memory.ensure(memory.ensure(b.U,b.C),memory.ensure(b.O,b.L));

  const fresh:LinkHandle[]=[];
  let seed=memory.ensure(b.U,b.L);
  for(let i=0;i<18;i+=1){
    seed=memory.ensure(seed,i%2===0?b.O:b.C);
    fresh.push(seed);
  }
  const at=(i:number):LinkHandle=>{
    const value=fresh[i];
    assert(value!==undefined,`fresh anchor ${i}`);
    return value;
  };

  const s0=memory.ensure(at(0),at(1));
  const K=defineContext(memory,C,s0);
  same(readContext(memory,K).parent,C,"K is C-rooted active Context");

  const x=memory.ensure(at(2),at(3));
  const y=memory.ensure(at(4),at(5));
  assert(memory.find(x,y)===undefined,"target X->Y absent before pair request");

  const r=requestBundle(memory,K,x,y,[0]);

  // Merely carrying the request in Links does not construct X->Y.
  assert(memory.find(x,y)===undefined,
    "Link-carried request is data until pair request execution");

  const out=executePairRequests(memory,K,r.bundle);
  const pair=memory.find(x,y);
  assert(pair!==undefined,"A16-F4 request execution constructs X->Y");
  const resultTruth=memory.find(K,pair);
  assert(resultTruth!==undefined,"A16-F4 output is exact K->(X->Y) truth");
  setSame(out.links,[resultTruth],"A16-F4 result bundle exact contextual truth");
  same(out.occurrences.length,1,"one request keeps one provenance occurrence");

  // A70b Context law applies with no output adapter:
  //
  //   resultTruth = K -> pair
  //   START(resultTruth) = Context(K,pair)
  //
  const child=memory.ensureStartSelfClosed(resultTruth);
  same(child,defineContext(memory,K,pair),
    "START of pair result truth is exact generic child Context");
  const childState=readContext(memory,child);
  same(childState.parent,K,"pair-result child parent exact K");
  same(childState.current,pair,"pair-result child current exact X->Y");

  // MANY pair requests branch into distinct contextual results and therefore
  // distinct sibling child Contexts under the same parent.
  const x2=memory.ensure(at(6),at(7));
  const y2=memory.ensure(at(8),at(9));
  assert(memory.find(x2,y2)===undefined,"second target pair absent");
  const r2=requestBundle(memory,K,x2,y2,[1]);
  const many=resolveFlatBundle(memory,Object.freeze([
    ...r.bundle.occurrences,
    ...r2.bundle.occurrences,
  ]));
  const manyOut=executePairRequests(memory,K,many);
  const pair2=memory.find(x2,y2);
  assert(pair2!==undefined,"second pair constructed");
  const truth2=memory.find(K,pair2);
  assert(truth2!==undefined,"second contextual pair result exists");
  setSame(manyOut.links,[resultTruth,truth2],"MANY pair request result truths");
  const children=manyOut.occurrences.map(
    occurrence=>memory.ensureStartSelfClosed(occurrence.link),
  );
  const child2=defineContext(memory,K,pair2);
  same(new Set(children).size,2,"MANY pair requests yield two child Context identities");
  assert(children.includes(child),"MANY contains first child");
  assert(children.includes(child2),"MANY contains second child");
  same(readContext(memory,child2).parent,K,"second child same parent K");

  // Cross-context operand provenance fails closed before target construction.
  const foreignK=defineContext(memory,C,memory.ensure(at(10),at(11)));
  const badX=memory.ensure(at(12),at(13));
  const badY=memory.ensure(at(14),at(15));
  assert(memory.find(badX,badY)===undefined,"cross-context target absent");
  const localTruth=memory.ensure(K,badX);
  const foreignTruth=memory.ensure(foreignK,badY);
  const malformed=memory.ensure(localTruth,foreignTruth);
  const malformedTruth=memory.ensure(K,malformed);
  const malformedBundle=resolveFlatBundle(memory,Object.freeze([
    Object.freeze({path:Object.freeze([]),link:malformedTruth}),
  ]));
  let rejected=false;
  try{
    executePairRequests(memory,K,malformedBundle);
  }catch{
    rejected=true;
  }
  assert(rejected,"cross-context pair request rejected");
  assert(memory.find(badX,badY)===undefined,
    "cross-context rejection performs no target construction");

  // Empty selected request frontier is semantic ZERO.
  const empty=executePairRequests(
    memory,
    K,
    resolveFlatBundle(memory,Object.freeze([])),
  );
  same(empty.links.size,0,"empty selected pair-request frontier ZERO");

  // Important boundary: Context(K, X->Y) is a generic Context state. This
  // experiment does not claim that X->Y is automatically a valid A66/A70
  // function-frame state F->Position. That interpretation remains process-local.
  same(readContext(memory,child).current,pair,
    "generic Context carries pair result without extra frame interpretation");
}

function sourceSlice(source:string,start:string,end:string):string{
  const i=source.indexOf(start),j=source.indexOf(end,i+1);
  assert(i>=0&&j>i,`source slice ${start}`);
  return source.slice(i,j).replace(/\s+/g,"");
}

function staticGuards():void{
  const root=resolve(process.cwd(),"..");
  const own=readFileSync(
    join(root,"ts/test/research-v013-pair-request-context-reconnect-a71e.test.ts"),
    "utf8",
  );
  const a16=readFileSync(
    join(root,"ts/test/research-v013-link-carried-pair-request-a16-f4.test.ts"),
    "utf8",
  );
  const a70b=readFileSync(
    join(root,"ts/test/research-v013-context-self-witness-rewrite-a70b.test.ts"),
    "utf8",
  );

  same(
    sourceSlice(
      own,
      "function executePairRequests(",
      "\nfunction requestBundle(",
    ),
    sourceSlice(
      a16,
      "function executePairRequests(",
      "\nfunction contextualTruth(",
    ),
    "A71e pair request executor source-identical A16-F4",
  );

  assert(a16.includes("PAIR_ACTUALIZATION=LINK_CARRIED_REQUEST"),
    "A71e reuses exact A16-F4 pair actualization boundary");
  assert(a16.includes("EXECUTOR_OPERAND_FRONTIER_PARAMETERS=0"),
    "A71e inherits no separate operand parameters");
  assert(a16.includes("REQUEST_PRODUCER_HOST_RESIDUAL=1"),
    "A71e keeps request production/discovery residual explicit");

  assert(a70b.includes(
    "ONE_START_LIFT=CONTEXT_K_S_NEXT"
  ),"A71e reconnects to established A70b START-lift Context law");

  const executor=sourceSlice(
    own,
    "function executePairRequests(",
    "\nfunction requestBundle(",
  );
  for(const forbidden of [
    "basis.L",
    '"PAIR"',
    "switch(",
    "evaluateV013FormalAspectProgram",
    "materializePlan(",
  ]){
    assert(!executor.includes(forbidden),
      `A71e request executor needs no opcode/formal host dispatch ${forbidden}`);
  }

  const exercise=sourceSlice(
    own,
    "function exercise(",
    "\nfunction sourceSlice(",
  );
  assert(exercise.includes("memory.ensureStartSelfClosed(resultTruth)"),
    "pair result truth connects to Context by ordinary START lift");
  assert(exercise.includes("defineContext(memory,K,pair)"),
    "START lift is compared to exact generic Context identity");
}

function main():void{
  exercise(false);
  exercise(true);
  staticGuards();

  console.log([
    "MTS v0.13 A71e: PAIR_REQUEST_CONTEXT_RECONNECT=GREEN_SCOPED_RESEARCH",
    "PAIR_REQUEST_EXECUTOR=A16_F4_SOURCE_IDENTICAL",
    "REQUEST_SHAPE=K_TO_LEFTTRUTH_TO_RIGHTTRUTH",
    "EXECUTOR_OPERAND_PARAMETERS=0",
    "PAIR_ACTUALIZATION=X_TO_Y",
    "RESULT_TRUTH=K_TO_X_TO_Y",
    "START_RESULT_TRUTH=EXACT_CONTEXT_K_PAIR",
    "OUTPUT_ADAPTER=0",
    "MANY_REQUESTS=SIBLING_GENERIC_CONTEXTS",
    "CROSS_CONTEXT_REQUEST=FAIL_CLOSED",
    "EMPTY_REQUEST_FRONTIER=ZERO",
    "ROOT_L_OPCODE_REQUIRED=NO",
    "FORMAL_PLAN_DISPATCH_REQUIRED_BY_EXECUTOR=NO",
    "PAIR_REQUEST_PRODUCTION_OR_DISCOVERY_AUTHORITY=RESIDUAL",
    "A16_F4_EXPLICIT_EXECUTOR_INVOCATION=HOST_DISPATCH_RESIDUAL",
    "GENERIC_CONTEXT_STATE_NE_A66_FRAME_INTERPRETATION=EXPLICIT_BOUNDARY",
    "NEXT=A71F_INTRINSIC_PAIR_REQUEST_AUTHORITY_FALSIFIER",
    "FULL_SELF_HOSTED=FALSE",
    "V013_NOT_ACCEPTED PRODUCTION_UNCHANGED",
  ].join(" "));
}

main();
