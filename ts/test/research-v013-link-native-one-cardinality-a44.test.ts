import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { materializeExactSequence, readExactSequence } from "../src/exact-sequence.js";
import { Memory, ensureRootBasis, type LinkHandle } from "../src/memory.js";

function assert(condition:unknown,message:string):asserts condition{
  if(!condition)throw new Error(`v0.13 A44 Link-native ONE cardinality: ${message}`);
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
    same(truth.start,ep.start,"A44 frontier context");out.push(truth.end);
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
/** A42 Rule->contract derivation remains a separately visible host residual. */
function deriveSemanticContract(memory:Memory,rule:LinkHandle):SemanticContract{
  const parts=readExactSequence(memory,rule).values;same(parts.length,2,"A44 Rule arity");
  const roles=readExactSequence(memory,parts[0]!).values,targets:LinkHandle[]=[];
  for(const encoded of readExactSequence(memory,parts[1]!).values){
    const q=readExactSequence(memory,encoded).values;same(q.length,3,"A44 constraint arity");
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

/** A43 matching: canonical collapse + one unchanged A21 step, no host equality oracle. */
function matchExecution(
  memory:Memory,
  expected:LinkHandle,
  candidates:readonly LinkHandle[],
):LinkHandle{
  const gate=memory.ensureStartSelfClosed(expected);
  const authority=freezeAuthority(memory,[memory.ensure(gate,memory.root)]);
  const K=memory.ensure(memory.ensure(expected,authority),authority);
  const occurrences:LinkHandle[]=[];let ancestry=memory.root;
  for(const candidate of candidates){
    const query=memory.ensure(gate,candidate),truth=memory.ensure(K,query);
    ancestry=memory.ensure(ancestry,candidate);
    occurrences.push(memory.ensure(ancestry,truth));
  }
  return step(memory,memory.ensure(K,freezeFrontier(memory,occurrences)),"forward");
}

interface OneCheck{
  readonly bodyGate:LinkHandle;readonly bodyQuery:LinkHandle;
  readonly truthGate:LinkHandle;readonly truthQuery:LinkHandle;
}
/**
 * Encode "match frontier has exactly ONE valid occurrence" without counting.
 *
 * ONE  => body == occurrence->R and occurrence.end == matchK->value.
 * MANY => first equality fails because body tail is another cell.
 * ZERO => first equality can collapse at R, but the distinct expected-truth gate fails.
 */
function deriveOneCheck(memory:Memory,matchE:LinkHandle):OneCheck{
  const execution=memory.poles(matchE),matchK=execution.start;
  const envelope=memory.poles(execution.end),body=envelope.end;
  const bodyPoles=memory.poles(body),occurrence=bodyPoles.start;
  const occurrencePoles=memory.poles(occurrence),truth=occurrencePoles.end;

  const expectedBody=memory.ensure(occurrence,memory.root);
  const bodyGate=memory.ensureStartSelfClosed(body);
  const bodyQuery=memory.ensure(bodyGate,expectedBody);

  // Anchor the second canonical gate on the expected contextual match truth,
  // never on the observed truth. In ZERO the observed truth is R; anchoring on
  // it would alias truthGate with bodyGate=START(R), creating two continuations
  // from one antecedent and an unauthorized/explosive branch.
  const expectedTruth=memory.ensure(matchK,memory.root);
  const truthGate=memory.ensureStartSelfClosed(expectedTruth);
  const truthQuery=memory.ensure(truthGate,truth);
  return Object.freeze({bodyGate,bodyQuery,truthGate,truthQuery});
}

interface ValidationProgram{
  readonly E0:LinkHandle;readonly context:LinkHandle;
  readonly accepted:LinkHandle;readonly depth:number;
}
function compileChecks(
  memory:Memory,
  parentContext:LinkHandle,
  checks:readonly OneCheck[],
  accepted:LinkHandle,
):ValidationProgram{
  assert(checks.length>0,"A44 non-empty validation checks");
  const transitions:LinkHandle[]=[];
  for(let i=0;i<checks.length;i+=1){
    const current=checks[i]!,next=checks[i+1];
    transitions.push(memory.ensure(current.bodyGate,current.truthQuery));
    transitions.push(memory.ensure(current.truthGate,next?.bodyQuery??accepted));
  }
  const authority=freezeAuthority(memory,transitions);
  const K=memory.ensure(parentContext,authority);
  const seedTruth=memory.ensure(K,checks[0]!.bodyQuery);
  const occurrence=memory.ensure(memory.root,seedTruth);
  const E0=memory.ensure(K,freezeFrontier(memory,[occurrence]));
  return Object.freeze({E0,context:K,accepted,depth:checks.length*2});
}

/**
 * Build all bidirectional coverage checks, but make no semantic branch on
 * match cardinality. Whether validation reaches K->Realization is determined
 * only by canonical identity and recursive A21 detachment.
 */
function compileSelectedValidation(
  memory:Memory,
  selectedRequest:LinkHandle,
):ValidationProgram{
  const selected=memory.poles(selectedRequest),parentContext=selected.start,pair=memory.poles(selected.end);
  const contract=pair.start,candidateRealization=pair.end;
  const descriptor=readExactSequence(memory,memory.poles(contract).end).values;
  same(descriptor.length,2,"A44 contract descriptor");
  const expectedFree=readExactSequence(memory,descriptor[0]!).values;
  const expectedObligations=readExactSequence(memory,descriptor[1]!).values;
  const proposed=readExactSequence(memory,candidateRealization).values;
  same(proposed.length,2,"A44 realization arity");
  const proposedFree=readExactSequence(memory,proposed[0]!).values;
  const proposedObligations=readExactSequence(memory,proposed[1]!).values;

  const checks:OneCheck[]=[];
  for(const expected of expectedFree)checks.push(deriveOneCheck(memory,matchExecution(memory,expected,proposedFree)));
  for(const proposedValue of proposedFree)checks.push(deriveOneCheck(memory,matchExecution(memory,proposedValue,expectedFree)));
  for(const expected of expectedObligations)checks.push(deriveOneCheck(memory,matchExecution(memory,expected,proposedObligations)));
  for(const proposedValue of proposedObligations)checks.push(deriveOneCheck(memory,matchExecution(memory,proposedValue,expectedObligations)));
  return compileChecks(memory,parentContext,checks,candidateRealization);
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
    const program=compileSelectedValidation(memory,request(memory,context,contract.handle,good));
    const ends=runProgram(memory,program);
    same(ends.length,1,"A44 valid realization singleton acceptance frontier");
    same(ends[0],good,"A44 valid realization reaches contextual acceptance");
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
    same(ends.length,0,"A44 invalid realization yields ZERO");
  }

  // Direct ZERO/ONE/MANY classification: only ONE reaches acceptance.
  const marker=memory.ensure(b.L,b.U);
  for(const [name,candidates,accepted] of [
    ["ZERO",[targets[1]!,targets[2]!],false],
    ["ONE",[targets[2]!,targets[0]!,targets[1]!],true],
    ["MANY",[targets[0]!,targets[1]!,targets[0]!],false],
  ] as const){
    const check=deriveOneCheck(memory,matchExecution(memory,targets[0]!,candidates));
    const ends=runProgram(memory,compileChecks(memory,context,[check],marker));
    same(ends.length,accepted?1:0,`A44 ${name} Link-native cardinality result`);
    if(accepted)same(ends[0],marker,"A44 ONE reaches marker");
  }
}

function staticGuards():void{
  const root=resolve(process.cwd(),"..");
  const own=readFileSync(join(root,"ts/test/research-v013-link-native-one-cardinality-a44.test.ts"),"utf8");
  const a37=readFileSync(join(root,"ts/test/research-v013-link-carried-admission-program-a37.test.ts"),"utf8");
  const a43=readFileSync(join(root,"ts/test/research-v013-link-native-contract-matching-a43.test.ts"),"utf8");
  const validation=own.slice(
    own.indexOf("function deriveOneCheck("),
    own.indexOf("\nfunction runProgram(",own.indexOf("function deriveOneCheck(")),
  );
  for(const forbidden of [
    "count===1","count === 1",".length!==1",".length !== 1",
    "new Set",".has(","Map<",".includes(","Object.is(","memory.find(",
  ])assert(!validation.includes(forbidden),`A44 validation excludes host cardinality/equality primitive ${forbidden}`);
  const x=own.slice(own.indexOf("function step("),own.indexOf("\nfunction frontierTruthEnds(",own.indexOf("function step(")));
  const y=a37.slice(a37.indexOf("function step("),a37.indexOf("\ninterface Program",a37.indexOf("function step(")));
  same(x.replace(/\s+/g,""),y.replace(/\s+/g,""),"A44 runtime source-identical A21/A37");
  assert(a43.includes("MATCH_CARDINALITY=ZERO_ONE_MANY"),"A44 preserves merged A43 cardinality evidence");
}

function main():void{
  exercise(new Memory(),false);exercise(new Memory(),true);staticGuards();
  console.log([
    "MTS v0.13 A44: LINK_NATIVE_ONE_CARDINALITY_GATE=GREEN_SCOPED_RESEARCH",
    "HOST_EXACT_ONE_CARDINALITY_BRANCH=0",
    "ZERO_ONE_MANY=LINK_NATIVE_CONTINUATION_TOPOLOGY",
    "ONLY_ONE_REACHES_CONTEXTUAL_ACCEPTANCE=YES",
    "MATCHING=CANONICAL_LINK_COLLAPSE_PLUS_A21",
    "ORDER_INSENSITIVE_CONTRACT=PRESERVED EXACT_TOPOLOGY_AUTHORITY=0",
    "COVERAGE_PROGRAM_ASSEMBLY=HOST_GENERIC_RESIDUAL",
    "RULE_CONTRACT_DERIVATION=HOST_STRUCTURAL_RESIDUAL",
    "NEXT_BOUNDARY=A45_LINK_CARRIED_COVERAGE_PROGRAM_GENERATION",
    "A35_PUBLICATION_EXISTENCE=RESIDUAL A36_PROBE_SCRATCH=RESIDUAL",
    "INDEPENDENT_MEMORIES=2 GLOBAL_E2=OPEN GLOBAL_E3=OPEN",
    "FULL_SELF_HOSTED=NOT_CLAIMED PRODUCTION_UNCHANGED",
  ].join(" "));
}
main();
