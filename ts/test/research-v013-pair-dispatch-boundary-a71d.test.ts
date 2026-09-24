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

function assert(c:unknown,m:string):asserts c{
  if(!c)throw new Error(`v0.13 A71d PAIR dispatch boundary: ${m}`);
}
function same<T>(a:T,e:T,m:string):void{
  assert(Object.is(a,e),`${m}: values differ`);
}
function setSame(actual:readonly LinkHandle[],expected:readonly LinkHandle[],m:string):void{
  same(new Set(actual).size,new Set(expected).size,`${m}: cardinality`);
  for(const x of expected)assert(actual.includes(x),`${m}: missing expected Link`);
}

interface CellView{readonly previous:LinkHandle;readonly value:LinkHandle;}
function readExactCell(memory:Memory,cell:LinkHandle):CellView{
  assert(cell!==memory.root,"exact cell is not root");
  const outer=memory.poles(cell);
  same(outer.start,cell,"exact cell START-self-closed");
  const payload=memory.poles(outer.end);
  return Object.freeze({previous:payload.start,value:payload.end});
}
function definePosition(memory:Memory,sequence:LinkHandle,currentCell:LinkHandle):LinkHandle{
  return memory.ensure(sequence,currentCell);
}
interface PositionStep{
  readonly argument:LinkHandle;
  readonly doneAfter:boolean;
  readonly nextPosition?:LinkHandle;
}
function stepPosition(memory:Memory,position:LinkHandle):PositionStep{
  const p=memory.poles(position);
  const sequence=p.start;
  const current=p.end;
  const currentView=readExactCell(memory,current);
  if(current===sequence)return Object.freeze({argument:currentView.value,doneAfter:true});
  let cursor=sequence;
  const seen=new Set<LinkHandle>();
  while(cursor!==memory.root){
    assert(!seen.has(cursor),"sequence ancestry cycle");
    seen.add(cursor);
    const view=readExactCell(memory,cursor);
    if(view.previous===current){
      return Object.freeze({
        argument:currentView.value,
        doneAfter:false,
        nextPosition:definePosition(memory,sequence,cursor),
      });
    }
    cursor=view.previous;
  }
  throw new Error("selected current cell is not in selected sequence");
}
function initialPosition(memory:Memory,sequence:LinkHandle):LinkHandle{
  assert(sequence!==memory.root,"selected sequence must be non-empty");
  const seen=new Set<LinkHandle>();
  let current=sequence;
  while(true){
    assert(!seen.has(current),"selected sequence ancestry cycle");
    seen.add(current);
    const cell=readExactCell(memory,current);
    if(cell.previous===memory.root)return definePosition(memory,sequence,current);
    current=cell.previous;
  }
}
function defineFrame(memory:Memory,parent:LinkHandle,f:LinkHandle,position:LinkHandle):LinkHandle{
  return defineContext(memory,parent,memory.ensure(f,position));
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

/** Source-identical A70c continuation derivation. */
function deriveFrameContinuation(
  memory:Memory,
  context:LinkHandle,
  selectedResultFact:LinkHandle,
):LinkHandle{
  const k=readContext(memory,context);
  const state=memory.poles(k.current);
  const f=state.start;
  const position=state.end;

  const positionStep=stepPosition(memory,position);
  assert(!positionStep.doneAfter,"factorized step requires non-final position");
  assert(positionStep.nextPosition!==undefined,"factorized next position exists");

  const fact=memory.poles(selectedResultFact);
  const application=memory.poles(fact.start);
  same(application.start,f,"factorized result uses current F");
  same(application.end,positionStep.argument,
    "factorized result uses current ExactSequence argument");

  const nextState=memory.ensure(fact.end,positionStep.nextPosition);
  const contextPayload=memory.poles(context).end;
  return memory.ensure(contextPayload,nextState);
}

interface IntrinsicApplication {
  readonly f:LinkHandle;
  readonly argument:LinkHandle;
  readonly application:LinkHandle|undefined;
  readonly resultFacts:readonly LinkHandle[];
}

/** Source-identical A70g intrinsic application result discovery. */
function intrinsicApplicationResults(
  memory:Memory,
  context:LinkHandle,
):IntrinsicApplication{
  const k=readContext(memory,context);
  const state=memory.poles(k.current);
  const f=state.start;
  const positionStep=stepPosition(memory,state.end);
  const argument=positionStep.argument;

  let application:LinkHandle|undefined;
  for(const candidate of memory.outgoing(f)){
    const p=memory.poles(candidate);
    if(p.start!==f || p.end!==argument)continue;
    assert(p.start!==candidate && p.end!==candidate,
      "current application must be an ordinary PAIR");
    assert(application===undefined || application===candidate,
      "canonical current application must be unique");
    application=candidate;
  }

  if(application===undefined){
    return Object.freeze({
      f,argument,application:undefined,resultFacts:Object.freeze([]),
    });
  }

  const resultFacts:LinkHandle[]=[];
  const seen=new Set<LinkHandle>();
  for(const candidate of memory.outgoing(application)){
    if(seen.has(candidate))continue;
    const p=memory.poles(candidate);
    if(p.start!==application)continue;
    if(p.start===candidate || p.end===candidate)continue;
    seen.add(candidate);
    resultFacts.push(candidate);
  }

  return Object.freeze({
    f,
    argument,
    application,
    resultFacts:Object.freeze(resultFacts),
  });
}

interface IntrinsicNonFinalStep{
  readonly resultFacts:readonly LinkHandle[];
  readonly children:readonly LinkHandle[];
  readonly closure?:LinkHandle;
}
function executeIntrinsicNonFinal(
  memory:Memory,
  context:LinkHandle,
):IntrinsicNonFinalStep{
  const k=readContext(memory,context);
  const state=memory.poles(k.current);
  const positionStep=stepPosition(memory,state.end);
  assert(!positionStep.doneAfter,"A70g is scoped to non-final position");
  assert(positionStep.nextPosition!==undefined,"A70g non-final next position");

  const intrinsic=intrinsicApplicationResults(memory,context);

  if(intrinsic.resultFacts.length===0){
    return Object.freeze({
      resultFacts:intrinsic.resultFacts,
      children:Object.freeze([]),
      closure:memory.ensureEndSelfClosed(context),
    });
  }

  const continuations=intrinsic.resultFacts.map(
    (fact)=>deriveFrameContinuation(memory,context,fact),
  );
  const outputs=rewriteSelectedOne(memory,context,carrier(memory,continuations));
  const children=outputs.map((output)=>memory.ensureStartSelfClosed(output));

  return Object.freeze({
    resultFacts:intrinsic.resultFacts,
    children:Object.freeze(children),
  });
}

function exercise(noise:boolean):void{
  const memory=new Memory();
  const b=ensureRootBasis(memory);
  if(noise)memory.ensure(memory.ensure(b.U,b.C),memory.ensure(b.O,b.L));

  // Root witness confirms the PAIR root term has exact physical pair identity:
  //
  //   L = PAIR(O,C) = O -> C.
  //
  // This is identity of the physical operation, not an opcode claim.
  same(b.L,memory.ensure(b.O,b.C),"root L is exact physical PAIR(O,C)");

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

  const left=memory.ensure(at(0),at(1));
  const right=memory.ensure(at(2),at(3));
  assert(memory.find(left,right)===undefined,
    "dynamic target pair absent before dispatch experiment");

  // Build a Link-carried operand environment without constructing left->right.
  const leftRole=memory.ensure(at(4),at(5));
  const rightRole=memory.ensure(at(6),at(7));
  const environment=memory.ensure(
    memory.ensure(leftRole,left),
    memory.ensure(rightRole,right),
  );

  // Negative control: treating the root representative L as an ordinary
  // function does NOT give it magic constructor semantics. The v0.13 contract
  // explicitly says the FORMAL operator is not a root-Link alias.
  const nextArg=memory.ensure(at(8),at(9));
  const sequence=materializeExactSequence(memory,[environment,nextArg]);
  const p0=initialPosition(memory,sequence);
  const k0=defineFrame(memory,b.C,b.L,p0);

  const read=intrinsicApplicationResults(memory,k0);
  same(read.f,b.L,"natural executor sees literal L only as current function");
  same(read.argument,environment,"natural executor sees operand environment as argument");
  setSame(read.resultFacts,[],"L application has no intrinsic result fact");
  assert(memory.find(left,right)===undefined,
    "reading L(environment) does not construct target pair");

  const step=executeIntrinsicNonFinal(memory,k0);
  setSame(step.children,[],"L-as-function does not dispatch PAIR construction");
  assert(step.closure!==undefined,"ordinary ZERO closes L-as-function branch");
  assert(memory.find(left,right)===undefined,
    "natural L-as-function execution leaves target pair absent");

  // The physical E1 operation needed by both A54 and production FORMAL PAIR is
  // exactly the canonical binary ensure. Calling it explicitly creates the
  // wanted pair, proving construction ability itself is not the missing piece.
  const explicitPair=memory.ensure(left,right);
  same(memory.find(left,right),explicitPair,
    "explicit E1 pair construction materializes exact target");

  // Canonical replay is idempotent.
  const count=memory.linkCount;
  same(memory.ensure(left,right),explicitPair,"explicit pair replay identity");
  same(memory.linkCount,count,"explicit pair replay adds no Link");
}

function sourceSlice(source:string,start:string,end:string):string{
  const i=source.indexOf(start),j=source.indexOf(end,i+1);
  assert(i>=0&&j>i,`source slice ${start}`);
  return source.slice(i,j).replace(/\s+/g,"");
}

function staticGuards():void{
  const root=resolve(process.cwd(),"..");
  const own=readFileSync(
    join(root,"ts/test/research-v013-pair-dispatch-boundary-a71d.test.ts"),"utf8",
  );
  const a70g=readFileSync(
    join(root,"ts/test/research-v013-intrinsic-application-results-a70g.test.ts"),"utf8",
  );
  const evaluator=readFileSync(
    join(root,"ts/src/v013-formal-aspect-evaluator.ts"),"utf8",
  );
  const a54=readFileSync(
    join(root,"ts/test/research-v013-raw-pair-constructor-a54.test.ts"),"utf8",
  );
  const contract=JSON.parse(readFileSync(
    join(root,"contracts/mts-contract-v0.13.json"),"utf8",
  ));

  same(
    sourceSlice(own,"function intrinsicApplicationResults(","\ninterface IntrinsicNonFinalStep"),
    sourceSlice(a70g,"function intrinsicApplicationResults(","\ninterface IntrinsicNonFinalStep"),
    "A71d natural result discovery source-identical A70g",
  );
  same(
    sourceSlice(own,"function executeIntrinsicNonFinal(","\nfunction exercise("),
    sourceSlice(a70g,"function executeIntrinsicNonFinal(","\nfunction exercise("),
    "A71d natural executor source-identical A70g",
  );

  // Production FORMAL PAIR eventually performs exactly one binary ensure over
  // recursively materialized left/right semantic values.
  const materialize=sourceSlice(
    evaluator,
    "function materializePlan(",
    "\n/**\n * Generic v0.13 FORMAL evaluator",
  );
  assert(materialize.includes(
    "returnmemory.ensure(materializePlan(memory,basis,plan.left),materializePlan(memory,basis,plan.right),);"
  ),"production FORMAL PAIR physical effect is binary memory.ensure");

  const directConstructor=sourceSlice(
    a54,
    "function directConstructor(",
    "\nfunction idempotentConstructor(",
  );
  assert(directConstructor.includes("returnmemory.ensure(start,end);"),
    "A54 E1 direct constructor is same binary physical primitive");

  same(contract.rootAspectQuartet.operatorIsRootLinkAlias,false,
    "FORMAL operator is not root-Link alias");

  // The remaining host boundary is visible directly in production: the
  // operator is converted to a host Plan and dispatched by host branches.
  assert(evaluator.includes("type Plan ="),"production evaluator has host Plan AST");
  assert(evaluator.includes("function parsePlan("),"production evaluator has host plan parser");
  assert(evaluator.includes("function materializePlan("),
    "production evaluator has host plan materializer");
  assert(evaluator.includes('plan.kind === "START"'),
    "production materializer host-dispatches structural kind");
  assert(evaluator.includes('plan.kind === "END"'),
    "production materializer host-dispatches structural kind");

  const natural=sourceSlice(
    own,
    "function intrinsicApplicationResults(",
    "\nfunction exercise(",
  );
  for(const forbidden of [
    "evaluateV013FormalAspectProgram",
    "materializePlan(",
    "parsePlan(",
    '"PAIR"',
  ]){
    assert(!natural.includes(forbidden),
      `natural A70/A71 executor has no FORMAL operator dispatcher ${forbidden}`);
  }
}

function main():void{
  exercise(false);
  exercise(true);
  staticGuards();

  console.log([
    "MTS v0.13 A71d: PAIR_DISPATCH_BOUNDARY=GREEN_SCOPED_RESEARCH",
    "PAIR_PHYSICAL_EFFECT=CANONICAL_BINARY_MEMORY_ENSURE",
    "A54_E1_PHYSICAL_EFFECT=SAME_PRIMITIVE",
    "ROOT_L=PAIR_O_C_PHYSICAL_IDENTITY",
    "FORMAL_OPERATOR_IS_ROOT_LINK_ALIAS=FALSE",
    "L_AS_MAGIC_OPCODE=REJECTED",
    "NATURAL_A70_A71_L_APPLICATION=ORDINARY_ZERO_NOT_CONSTRUCTION",
    "DYNAMIC_TARGET_PAIR_REMAINS_ABSENT_UNTIL_EXPLICIT_E1",
    "PRODUCTION_FORMAL_PAIR=HOST_PLAN_MATERIALIZATION_RESIDUAL",
    "CONSTRUCTION_PRIMITIVE_MISSING=NO",
    "CONTEXT_NATIVE_DYNAMIC_PAIR_OPERATOR_APPLICATION=RED",
    "A16_F4_LINK_CARRIED_PAIR_OPERAND_BINDING=HISTORICAL_GREEN",
    "MISSING_BRIDGE=RULE_GROUNDED_PAIR_AUTHORITY_DISPATCH_TO_EXISTING_REQUEST_EXECUTION",
    "A71C_ORCHESTRATION_RESIDUAL=SHARPENED",
    "NEXT=A71E_RECONNECT_A16_F4_PAIR_REQUEST_TO_NATURAL_DYNAMICS",
    "FULL_SELF_HOSTED=FALSE",
    "V013_NOT_ACCEPTED PRODUCTION_UNCHANGED",
  ].join(" "));
}

main();
