import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { materializeExactSequence, readExactSequence } from "../src/exact-sequence.js";
import { Memory, ensureRootBasis, type LinkHandle } from "../src/memory.js";

function assert(condition:unknown,message:string):asserts condition{
  if(!condition)throw new Error(`v0.13 A43 Link-native contract matching: ${message}`);
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
  const e=memory.poles(envelope);
  assert(e.start===envelope&&e.end!==envelope,`A21 ${kind} envelope`);
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
  readonly handle:LinkHandle;
  readonly freeRoles:readonly LinkHandle[];
  readonly constrainedTargets:readonly LinkHandle[];
}
/** A42 Rule->contract derivation remains an explicit host structural residual. */
function deriveSemanticContract(memory:Memory,rule:LinkHandle):SemanticContract{
  const parts=readExactSequence(memory,rule).values;same(parts.length,2,"A43 Rule arity");
  const roles=readExactSequence(memory,parts[0]!).values,targets:LinkHandle[]=[];
  for(const encoded of readExactSequence(memory,parts[1]!).values){
    const q=readExactSequence(memory,encoded).values;same(q.length,3,"A43 constraint arity");
    targets.push(q[0]!);
  }
  const constrained=new Set(targets),free=roles.filter(role=>!constrained.has(role));
  const descriptor=materializeExactSequence(memory,[
    materializeExactSequence(memory,free),materializeExactSequence(memory,targets),
  ]);
  return Object.freeze({
    handle:memory.ensure(rule,descriptor),
    freeRoles:Object.freeze(free),
    constrainedTargets:Object.freeze(targets),
  });
}
function realization(
  memory:Memory,
  freeRoles:readonly LinkHandle[],
  obligations:readonly LinkHandle[],
):LinkHandle{
  return materializeExactSequence(memory,[
    materializeExactSequence(memory,freeRoles),materializeExactSequence(memory,obligations),
  ]);
}
function request(
  memory:Memory,
  context:LinkHandle,
  contract:LinkHandle,
  candidateRealization:LinkHandle,
):LinkHandle{
  return memory.ensure(context,memory.ensure(contract,candidateRealization));
}

/**
 * Count matches without comparing expected/candidate handles in host code.
 *
 * gate = gate -> expected
 * query = gate -> candidate
 *
 * Canonical Link identity gives query=gate iff candidate=expected. The unchanged
 * A21 executor therefore emits one provenance occurrence per matching candidate.
 */
function canonicalMatchCount(
  memory:Memory,
  expected:LinkHandle,
  candidates:readonly LinkHandle[],
):number{
  const gate=memory.ensureStartSelfClosed(expected);
  const continuation=memory.ensure(gate,memory.root);
  const authority=freezeAuthority(memory,[continuation]);
  const parent=memory.ensure(expected,authority),K=memory.ensure(parent,authority);
  const occurrences:LinkHandle[]=[];let ancestry=memory.root;
  for(const candidate of candidates){
    const query=memory.ensure(gate,candidate),truth=memory.ensure(K,query);
    ancestry=memory.ensure(ancestry,candidate);
    occurrences.push(memory.ensure(ancestry,truth));
  }
  const E0=memory.ensure(K,freezeFrontier(memory,occurrences));
  const E1=step(memory,E0,"forward");
  return readChain(memory,memory.poles(E1).end,"frontier").length;
}

/**
 * Bidirectional exact-one coverage rejects missing, duplicate and foreign
 * members without host Set membership or semantic Link equality.
 * Host numeric cardinality (count===1) remains the A44 residual.
 */
function exactOneCoverage(
  memory:Memory,
  expected:readonly LinkHandle[],
  proposed:readonly LinkHandle[],
):boolean{
  for(const value of expected)if(canonicalMatchCount(memory,value,proposed)!==1)return false;
  for(const value of proposed)if(canonicalMatchCount(memory,value,expected)!==1)return false;
  return true;
}
function validateSelectedByDetachment(
  memory:Memory,
  selectedRequest:LinkHandle,
):LinkHandle|undefined{
  const selected=memory.poles(selectedRequest),context=selected.start,pair=memory.poles(selected.end);
  const contract=pair.start,candidateRealization=pair.end;
  const descriptor=readExactSequence(memory,memory.poles(contract).end).values;
  same(descriptor.length,2,"A43 contract descriptor");
  const expectedFree=readExactSequence(memory,descriptor[0]!).values;
  const expectedObligations=readExactSequence(memory,descriptor[1]!).values;
  const proposed=readExactSequence(memory,candidateRealization).values;
  if(proposed.length!==2)return undefined;
  const proposedFree=readExactSequence(memory,proposed[0]!).values;
  const proposedObligations=readExactSequence(memory,proposed[1]!).values;
  if(!exactOneCoverage(memory,expectedFree,proposedFree))return undefined;
  if(!exactOneCoverage(memory,expectedObligations,proposedObligations))return undefined;
  return memory.ensure(context,candidateRealization);
}

function exercise(memory:Memory,withNoise:boolean):void{
  const b=ensureRootBasis(memory);if(withNoise)memory.ensure(memory.ensure(b.U,b.C),b.L);
  const rule=defineRule(memory),contract=deriveSemanticContract(memory,rule);
  same(contract.freeRoles.length,5,"A43 free-role obligations");
  same(contract.constrainedTargets.length,3,"A43 constrained-target obligations");
  const context=memory.ensure(b.R,b.U);
  const forward=realization(memory,contract.freeRoles,contract.constrainedTargets);
  const reverse=realization(memory,contract.freeRoles,[...contract.constrainedTargets].reverse());
  assert(validateSelectedByDetachment(memory,request(memory,context,contract.handle,forward))!==undefined,
    "A43 forward accepted");
  assert(validateSelectedByDetachment(memory,request(memory,context,contract.handle,reverse))!==undefined,
    "A43 reverse accepted");

  const targets=contract.constrainedTargets,free=contract.freeRoles;
  const foreignValue=memory.ensure(contract.handle,b.C);
  const bads=[
    realization(memory,free,targets.slice(0,2)),
    realization(memory,free,[targets[0]!,targets[1]!,targets[1]!]),
    realization(memory,free,[targets[0]!,targets[1]!,foreignValue]),
    realization(memory,free.slice(0,4),targets),
    realization(memory,[free[0]!,free[1]!,free[1]!,free[3]!,free[4]!],targets),
  ];
  for(const bad of bads){
    same(validateSelectedByDetachment(memory,request(memory,context,contract.handle,bad)),undefined,
      "A43 invalid realization yields ZERO");
    same(memory.find(context,bad),undefined,"A43 invalid realization has no contextual acceptance witness");
  }

  // Direct probes expose ZERO/ONE/MANY through provenance cardinality.
  same(canonicalMatchCount(memory,targets[0]!,[targets[1]!,targets[2]!]),0,"A43 ZERO match");
  same(canonicalMatchCount(memory,targets[0]!,[targets[2]!,targets[0]!,targets[1]!]),1,"A43 ONE match");
  same(canonicalMatchCount(memory,targets[0]!,[targets[0]!,targets[1]!,targets[0]!]),2,"A43 MANY match");
}

function staticGuards():void{
  const root=resolve(process.cwd(),"..");
  const own=readFileSync(join(root,"ts/test/research-v013-link-native-contract-matching-a43.test.ts"),"utf8");
  const a37=readFileSync(join(root,"ts/test/research-v013-link-carried-admission-program-a37.test.ts"),"utf8");
  const a42=readFileSync(join(root,"ts/test/research-v013-rule-semantic-schema-contract-a42.test.ts"),"utf8");
  const validation=own.slice(
    own.indexOf("function canonicalMatchCount("),
    own.indexOf("\nfunction exercise(",own.indexOf("function canonicalMatchCount(")),
  );
  for(const forbidden of ["new Set",".has(","Map<",".includes(","Object.is(","memory.find("])
    assert(!validation.includes(forbidden),`A43 validator removes host semantic membership primitive ${forbidden}`);
  const x=own.slice(own.indexOf("function step("),own.indexOf("\nfunction defineRule(",own.indexOf("function step(")));
  const y=a37.slice(a37.indexOf("function step("),a37.indexOf("\ninterface Program",a37.indexOf("function step(")));
  same(x.replace(/\s+/g,""),y.replace(/\s+/g,""),"A43 matcher runtime source-identical A21/A37");
  assert(a42.includes("EXACT_TOPOLOGY_AUTHORITY_IN_CONTRACT=0"),"A43 preserves A42 no-exact-topology contract");
}

function main():void{
  exercise(new Memory(),false);exercise(new Memory(),true);staticGuards();
  console.log([
    "MTS v0.13 A43: LINK_NATIVE_CONTRACT_MATCHING=GREEN_SCOPED_RESEARCH",
    "HOST_SET_MEMBERSHIP_VALIDATION=0 HOST_SEMANTIC_LINK_EQUALITY_VALIDATION=0",
    "MATCHING=CANONICAL_LINK_COLLAPSE_PLUS_A21_DETACHMENT",
    "ORDER_INSENSITIVE_CONTRACT=PRESERVED EXACT_TOPOLOGY_AUTHORITY=0",
    "FORWARD_REVERSE=ACCEPTED INVALID_REALIZATIONS=ZERO",
    "MATCH_CARDINALITY=ZERO_ONE_MANY",
    "HOST_EXACT_ONE_CARDINALITY_BRANCH=RESIDUAL",
    "RULE_CONTRACT_DERIVATION=HOST_STRUCTURAL_RESIDUAL",
    "NEXT_BOUNDARY=A44_LINK_NATIVE_ONE_CARDINALITY_GATE",
    "A35_PUBLICATION_EXISTENCE=RESIDUAL A36_PROBE_SCRATCH=RESIDUAL",
    "INDEPENDENT_MEMORIES=2 GLOBAL_E2=OPEN GLOBAL_E3=OPEN",
    "FULL_SELF_HOSTED=NOT_CLAIMED PRODUCTION_UNCHANGED",
  ].join(" "));
}
main();
