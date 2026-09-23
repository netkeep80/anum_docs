import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { materializeExactSequence, readExactSequence } from "../src/exact-sequence.js";
import { Memory, ensureRootBasis, type LinkHandle } from "../src/memory.js";

function assert(condition:unknown,message:string):asserts condition{
  if(!condition)throw new Error(`v0.13 A45 Link-carried coverage history: ${message}`);
}
function same<T>(actual:T,expected:T,message:string):void{
  assert(Object.is(actual,expected),`${message}: values differ`);
}
function freezeAuthority(memory:Memory,values:readonly LinkHandle[]):LinkHandle{
  let body=memory.root;for(let i=values.length-1;i>=0;i-=1)body=memory.ensure(values[i]!,body);
  return memory.ensureStartSelfClosed(body);
}
function freezeFrontier(memory:Memory,values:readonly LinkHandle[]):LinkHandle{
  let body=memory.root;for(let i=values.length-1;i>=0;i-=1)body=memory.ensure(values[i]!,body);
  return memory.ensureStartSelfClosed(body);
}
function readChain(memory:Memory,envelope:LinkHandle,kind:string):readonly LinkHandle[]{
  const e=memory.poles(envelope);assert(e.start===envelope&&e.end!==envelope,`A21 ${kind} envelope`);
  const out:LinkHandle[]=[],seen=new Set<LinkHandle>();let cursor=e.end;
  while(cursor!==memory.root){
    assert(!seen.has(cursor),`A21 ${kind} cycle`);seen.add(cursor);
    const p=memory.poles(cursor);out.push(p.start);cursor=p.end;
  }
  return Object.freeze(out);
}

/** Exact A21 executor. */
function step(
  memory: Memory,
  executionRoot: LinkHandle,
  schedule: "forward" | "reverse",
): LinkHandle {
  const execution = memory.poles(executionRoot);
  const context = execution.start;
  const frontierEnvelope = execution.end;

  const contextPoles = memory.poles(context);
  const authorityEnvelope = contextPoles.end;
  const continuations = [...readChain(memory, authorityEnvelope, "authority")];
  const occurrences = [...readChain(memory, frontierEnvelope, "frontier")];
  if (schedule === "reverse") occurrences.reverse();

  let nextBody = memory.root;

  for (const occurrence of occurrences) {
    const occurrencePoles = memory.poles(occurrence);
    const truth = memory.poles(occurrencePoles.end);
    assert(truth.start === context, "A21 occurrence carries current-context truth");
    const antecedent = truth.end;

    for (const continuation of continuations) {
      const p = memory.poles(continuation);
      if (p.start !== antecedent) continue;

      const nextTruth = memory.ensure(context, p.end);
      const childOccurrence = memory.ensure(occurrence, nextTruth);
      nextBody = memory.ensure(childOccurrence, nextBody);
    }
  }

  const nextFrontier = memory.ensureStartSelfClosed(nextBody);
  return memory.ensure(context, nextFrontier);
}

function frontierTruthEnds(memory:Memory,E:LinkHandle):readonly LinkHandle[]{
  const ep=memory.poles(E),out:LinkHandle[]=[];
  for(const occurrence of readChain(memory,ep.end,"frontier")){
    const truth=memory.poles(memory.poles(occurrence).end);
    same(truth.start,ep.start,"A45 frontier context");out.push(truth.end);
  }
  return Object.freeze(out);
}

function defineRule(memory:Memory):LinkHandle{
  const b=ensureRootBasis(memory),roles:LinkHandle[]=[];let x=memory.ensure(b.O,b.U);
  for(let i=0;i<8;i+=1){x=memory.ensure(x,i%2===0?b.L:b.C);roles.push(x);}
  return materializeExactSequence(memory,[
    materializeExactSequence(memory,roles),
    materializeExactSequence(memory,[
      materializeExactSequence(memory,[roles[3]!,roles[1]!,roles[2]!]),
      materializeExactSequence(memory,[roles[6]!,roles[3]!,roles[4]!]),
      materializeExactSequence(memory,[roles[7]!,roles[3]!,roles[5]!]),
    ]),
  ]);
}
interface SemanticContract{
  readonly handle:LinkHandle;readonly freeRoles:readonly LinkHandle[];
  readonly constrainedTargets:readonly LinkHandle[];
}
function deriveSemanticContract(memory:Memory,rule:LinkHandle):SemanticContract{
  const parts=readExactSequence(memory,rule).values;same(parts.length,2,"A45 Rule arity");
  const roles=readExactSequence(memory,parts[0]!).values,targets:LinkHandle[]=[];
  for(const encoded of readExactSequence(memory,parts[1]!).values){
    const q=readExactSequence(memory,encoded).values;same(q.length,3,"A45 constraint arity");
    targets.push(q[0]!);
  }
  const constrained=new Set(targets),free=roles.filter(role=>!constrained.has(role));
  const descriptor=materializeExactSequence(memory,[
    materializeExactSequence(memory,free),materializeExactSequence(memory,targets),
  ]);
  return Object.freeze({
    handle:memory.ensure(rule,descriptor),
    freeRoles:Object.freeze(free),constrainedTargets:Object.freeze(targets),
  });
}
function realization(memory:Memory,free:readonly LinkHandle[],obligations:readonly LinkHandle[]):LinkHandle{
  return materializeExactSequence(memory,[
    materializeExactSequence(memory,free),materializeExactSequence(memory,obligations),
  ]);
}
function request(memory:Memory,context:LinkHandle,contract:LinkHandle,value:LinkHandle):LinkHandle{
  return memory.ensure(context,memory.ensure(contract,value));
}

interface SequenceNode{readonly previous:LinkHandle;readonly value:LinkHandle;}
function sequenceNode(memory:Memory,cell:LinkHandle):SequenceNode{
  assert(cell!==memory.root,"A45 sequence node is non-root");
  const p=memory.poles(cell);assert(p.start===cell,"A45 canonical ExactSequence cell");
  const payload=memory.poles(p.end);
  return Object.freeze({previous:payload.start,value:payload.end});
}
function foldSequence<S>(
  memory:Memory,
  final:LinkHandle,
  state:S,
  visit:(state:S,value:LinkHandle)=>S,
):S{
  if(final===memory.root)return state;
  const node=sequenceNode(memory,final);
  const previous=foldSequence(memory,node.previous,state,visit);
  return visit(previous,node.value);
}
function zipSequence<S>(
  memory:Memory,
  left:LinkHandle,
  right:LinkHandle,
  state:S,
  visit:(state:S,leftValue:LinkHandle,rightValue:LinkHandle)=>S,
):S{
  if(left===memory.root||right===memory.root){
    assert(left===memory.root&&right===memory.root,"A45 descriptor carrier arity mismatch");
    return state;
  }
  const l=sequenceNode(memory,left),r=sequenceNode(memory,right);
  const previous=zipSequence(memory,l.previous,r.previous,state,visit);
  return visit(previous,l.value,r.value);
}

/** A43 matching, but candidates are consumed directly from a Link carrier. */
function matchExecution(
  memory:Memory,
  expected:LinkHandle,
  candidateCarrier:LinkHandle,
):LinkHandle{
  const gate=memory.ensureStartSelfClosed(expected);
  const authority=freezeAuthority(memory,[memory.ensure(gate,memory.root)]);
  const K=memory.ensure(memory.ensure(expected,authority),authority);
  interface Seed{readonly ancestry:LinkHandle;readonly body:LinkHandle;}
  const seed=foldSequence<Seed>(
    memory,candidateCarrier,Object.freeze({ancestry:memory.root,body:memory.root}),
    (state,candidate)=>{
      const query=memory.ensure(gate,candidate),truth=memory.ensure(K,query);
      const ancestry=memory.ensure(state.ancestry,candidate);
      const occurrence=memory.ensure(ancestry,truth);
      return Object.freeze({ancestry,body:memory.ensure(occurrence,state.body)});
    },
  );
  return step(memory,memory.ensure(K,memory.ensureStartSelfClosed(seed.body)),"forward");
}

interface OneCheck{
  readonly bodyGate:LinkHandle;readonly bodyQuery:LinkHandle;
  readonly truthGate:LinkHandle;readonly truthQuery:LinkHandle;
}
function deriveOneCheck(
  memory:Memory,
  matchE:LinkHandle,
  stage:LinkHandle,
):OneCheck{
  const execution=memory.poles(matchE),matchK=execution.start;
  const envelope=memory.poles(execution.end),body=envelope.end;
  const bodyPoles=memory.poles(body),occurrence=bodyPoles.start;
  const occurrencePoles=memory.poles(occurrence),truth=occurrencePoles.end;

  // Scope both canonical equality probes to this immutable validation stage.
  // Equal semantic checks can occur twice in bidirectional coverage. Without
  // stage scoping they share antecedent gates but have different successors,
  // so ordinary A21 detachment correctly branches and can grow exponentially.
  // The scope does not decide equality: because both compared values have the
  // same prefix, scopedActual===scopedExpected iff actual===expected.
  const bodyScope=memory.ensure(stage,memory.root);
  const truthScope=memory.ensure(stage,bodyScope);

  const expectedBody=memory.ensure(occurrence,memory.root);
  const scopedBody=memory.ensure(bodyScope,body);
  const scopedExpectedBody=memory.ensure(bodyScope,expectedBody);
  const bodyGate=memory.ensureStartSelfClosed(scopedBody);
  const bodyQuery=memory.ensure(bodyGate,scopedExpectedBody);

  // ZERO still needs a second distinct failing gate: observed truth is R, but
  // expected contextual match truth is matchK->R. Stage scoping additionally
  // prevents this truth gate from aliasing any repeated coverage occurrence.
  const expectedTruth=memory.ensure(matchK,memory.root);
  const scopedTruth=memory.ensure(truthScope,truth);
  const scopedExpectedTruth=memory.ensure(truthScope,expectedTruth);
  const truthGate=memory.ensureStartSelfClosed(scopedExpectedTruth);
  const truthQuery=memory.ensure(truthGate,scopedTruth);
  return Object.freeze({bodyGate,bodyQuery,truthGate,truthQuery});
}

interface CoverageState{readonly history:LinkHandle;readonly count:number;}
function appendCoverage(
  memory:Memory,
  sourceCarrier:LinkHandle,
  candidateCarrier:LinkHandle,
  initial:CoverageState,
):CoverageState{
  return foldSequence<CoverageState>(memory,sourceCarrier,initial,(state,expected)=>{
    const matchE=matchExecution(memory,expected,candidateCarrier);
    const stage=memory.ensure(state.history,matchE);
    const check=deriveOneCheck(memory,matchE,stage);
    const carrier=materializeExactSequence(memory,[
      check.bodyGate,check.bodyQuery,check.truthGate,check.truthQuery,
    ]);
    return Object.freeze({history:memory.ensure(state.history,carrier),count:state.count+1});
  });
}
function deriveCoverageHistory(
  memory:Memory,
  contractDescriptor:LinkHandle,
  realizationDescriptor:LinkHandle,
):CoverageState{
  return zipSequence<CoverageState>(
    memory,contractDescriptor,realizationDescriptor,
    Object.freeze({history:memory.root,count:0}),
    (state,expectedCarrier,proposedCarrier)=>{
      const forward=appendCoverage(memory,expectedCarrier,proposedCarrier,state);
      return appendCoverage(memory,proposedCarrier,expectedCarrier,forward);
    },
  );
}
function readOneCheck(memory:Memory,carrier:LinkHandle):OneCheck{
  const q=readExactSequence(memory,carrier).values;same(q.length,4,"A45 OneCheck carrier arity");
  return Object.freeze({bodyGate:q[0]!,bodyQuery:q[1]!,truthGate:q[2]!,truthQuery:q[3]!});
}
interface Assembly{
  readonly seed:LinkHandle;readonly authorityBody:LinkHandle;readonly count:number;
}
function assembleCoverageHistory(
  memory:Memory,
  history:LinkHandle,
  accepted:LinkHandle,
  authorityBody:LinkHandle=memory.root,
  count=0,
):Assembly{
  if(history===memory.root)return Object.freeze({seed:accepted,authorityBody,count});
  const p=memory.poles(history),check=readOneCheck(memory,p.end);
  let body=memory.ensure(memory.ensure(check.truthGate,accepted),authorityBody);
  body=memory.ensure(memory.ensure(check.bodyGate,check.truthQuery),body);
  return assembleCoverageHistory(memory,p.start,check.bodyQuery,body,count+1);
}
interface ValidationProgram{
  readonly E0:LinkHandle;readonly accepted:LinkHandle;
  readonly depth:number;readonly coverageHistory:LinkHandle;readonly checkCount:number;
}
function compileSelectedValidation(memory:Memory,selectedRequest:LinkHandle):ValidationProgram{
  const selected=memory.poles(selectedRequest),parentContext=selected.start,pair=memory.poles(selected.end);
  const contract=pair.start,candidateRealization=pair.end;
  const contractDescriptor=memory.poles(contract).end;
  const coverage=deriveCoverageHistory(memory,contractDescriptor,candidateRealization);
  assert(coverage.count>0,"A45 non-empty Link-carried coverage history");
  const assembled=assembleCoverageHistory(memory,coverage.history,candidateRealization);
  same(assembled.count,coverage.count,"A45 assembly consumes complete history");
  const authority=memory.ensureStartSelfClosed(assembled.authorityBody);
  const K=memory.ensure(parentContext,authority);
  const seedTruth=memory.ensure(K,assembled.seed);
  const occurrence=memory.ensure(memory.root,seedTruth);
  const E0=memory.ensure(K,freezeFrontier(memory,[occurrence]));
  return Object.freeze({
    E0,accepted:candidateRealization,depth:assembled.count*2,
    coverageHistory:coverage.history,checkCount:coverage.count,
  });
}
function runProgram(memory:Memory,program:ValidationProgram):readonly LinkHandle[]{
  let current=program.E0;
  for(let i=0;i<program.depth;i+=1)current=step(memory,current,"forward");
  return frontierTruthEnds(memory,current);
}

function exercise(memory:Memory,withNoise:boolean):void{
  const b=ensureRootBasis(memory);if(withNoise)memory.ensure(memory.ensure(b.U,b.C),b.L);
  const rule=defineRule(memory),contract=deriveSemanticContract(memory,rule);
  const context=memory.ensure(b.R,b.U),targets=contract.constrainedTargets,free=contract.freeRoles;
  const forward=realization(memory,free,targets);
  const reverse=realization(memory,free,[...targets].reverse());
  for(const good of [forward,reverse]){
    const selected=request(memory,context,contract.handle,good);
    const program=compileSelectedValidation(memory,selected);
    assert(program.coverageHistory!==memory.root,"A45 coverage program is Link-carried history");
    same(program.checkCount,16,"A45 5+5+3+3 carrier-derived checks");
    const ends=runProgram(memory,program);
    same(ends.length,1,"A45 valid realization singleton acceptance");
    same(ends[0],good,"A45 valid realization accepted");
    const frozenE0=program.E0;
    request(memory,context,contract.handle,good===forward?reverse:forward);
    same(program.E0,frozenE0,"A45 ambient alternate request cannot rewrite selected program");
  }
  const foreign=memory.ensure(contract.handle,b.C);
  const bads=[
    realization(memory,free,targets.slice(0,2)),
    realization(memory,free,[targets[0]!,targets[1]!,targets[1]!]),
    realization(memory,free,[targets[0]!,targets[1]!,foreign]),
    realization(memory,free.slice(0,4),targets),
    realization(memory,[free[0]!,free[1]!,free[1]!,free[3]!,free[4]!],targets),
  ];
  for(const bad of bads){
    const ends=runProgram(memory,compileSelectedValidation(
      memory,request(memory,context,contract.handle,bad),
    ));
    same(ends.length,0,"A45 invalid realization yields ZERO");
  }
}

function staticGuards():void{
  const root=resolve(process.cwd(),"..");
  const own=readFileSync(join(root,"ts/test/research-v013-link-carried-coverage-history-a45.test.ts"),"utf8");
  const a44=readFileSync(join(root,"ts/test/research-v013-link-native-one-cardinality-a44.test.ts"),"utf8");
  const a37=readFileSync(join(root,"ts/test/research-v013-link-carried-admission-program-a37.test.ts"),"utf8");
  const core=own.slice(
    own.indexOf("function sequenceNode("),
    own.indexOf("\nfunction runProgram(",own.indexOf("function sequenceNode(")),
  );
  for(const forbidden of [
    "for(","for (",".map(",".forEach(","checks:OneCheck[]",
    "expectedFree","expectedObligations","proposedFree","proposedObligations",
    "count===1","count === 1","new Set",".has(","memory.find(",
  ])assert(!core.includes(forbidden),`A45 generator excludes host coverage assembly primitive ${forbidden}`);
  const a=own.slice(own.indexOf("function deriveOneCheck("),own.indexOf("\ninterface CoverageState",own.indexOf("function deriveOneCheck(")));
  const z=a44.slice(a44.indexOf("function deriveOneCheck("),a44.indexOf("\ninterface ValidationProgram",a44.indexOf("function deriveOneCheck(")));
  same(a.replace(/\s+/g,""),z.replace(/\s+/g,""),"A45 ONE gate source-identical A44");
  const x=own.slice(own.indexOf("function step("),own.indexOf("\nfunction frontierTruthEnds(",own.indexOf("function step(")));
  const y=a37.slice(a37.indexOf("function step("),a37.indexOf("\ninterface Program",a37.indexOf("function step(")));
  same(x.replace(/\s+/g,""),y.replace(/\s+/g,""),"A45 runtime source-identical A21/A37");
}
function main():void{
  exercise(new Memory(),false);exercise(new Memory(),true);staticGuards();
  console.log([
    "MTS v0.13 A45: LINK_CARRIED_COVERAGE_HISTORY=GREEN_SCOPED_RESEARCH",
    "DOMAIN_COVERAGE_LOOPS=0 JS_CHECK_ARRAY=0",
    "COVERAGE_SOURCE=CONTRACT_REALIZATION_LINK_CARRIERS",
    "DESCRIPTOR_ZIP=GENERIC_RECURSIVE STRUCTURAL_FOLD=GENERIC_RECURSIVE",
    "CHECK_HISTORY=LINK_NATIVE IMMUTABLE_STAGE=HISTORY_DERIVED",
    "ONE_GATE=A44_SOURCE_IDENTICAL RUNTIME=A21_SOURCE_IDENTICAL",
    "FORWARD_REVERSE=ACCEPTED INVALID_REALIZATIONS=ZERO",
    "GENERIC_RECURSIVE_CARRIER_TRANSDUCER=HOST_RESIDUAL",
    "RULE_CONTRACT_DERIVATION=HOST_STRUCTURAL_RESIDUAL",
    "A35_PUBLICATION_EXISTENCE=RESIDUAL A36_PROBE_SCRATCH=RESIDUAL",
    "INDEPENDENT_MEMORIES=2 GLOBAL_E2=OPEN GLOBAL_E3=OPEN",
    "FULL_SELF_HOSTED=NOT_CLAIMED PRODUCTION_UNCHANGED",
  ].join(" "));
}
main();
