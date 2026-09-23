import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { materializeExactSequence, readExactSequence } from "../src/exact-sequence.js";
import { Memory, ensureRootBasis, type LinkHandle } from "../src/memory.js";

function assert(condition:unknown,message:string):asserts condition{
  if(!condition)throw new Error(`v0.13 A42 semantic schema contract: ${message}`);
}
function same<T>(actual:T,expected:T,message:string):void{
  assert(Object.is(actual,expected),`${message}: values differ`);
}
function setEqual(a:readonly LinkHandle[],b:readonly LinkHandle[]):boolean{
  if(a.length!==b.length)return false;
  const x=new Set(a),y=new Set(b);
  if(x.size!==a.length||y.size!==b.length)return false;
  for(const value of x)if(!y.has(value))return false;
  return true;
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
/**
 * Rule is the only semantic source.
 * ExactSequence is only a carrier: contract validation treats both collections
 * extensionally and does not privilege their stored order.
 */
function deriveSemanticContract(memory:Memory,rule:LinkHandle):SemanticContract{
  const parts=readExactSequence(memory,rule).values;
  same(parts.length,2,"A42 Rule arity");
  const roles=readExactSequence(memory,parts[0]!).values;
  const targets:LinkHandle[]=[];
  for(const encoded of readExactSequence(memory,parts[1]!).values){
    const q=readExactSequence(memory,encoded).values;
    same(q.length,3,"A42 constraint arity");
    targets.push(q[0]!);
  }
  const constrained=new Set(targets);
  const free=roles.filter(role=>!constrained.has(role));
  const descriptor=materializeExactSequence(memory,[
    materializeExactSequence(memory,free),
    materializeExactSequence(memory,targets),
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
  obligationOrder:readonly LinkHandle[],
):LinkHandle{
  return materializeExactSequence(memory,[
    materializeExactSequence(memory,freeRoles),
    materializeExactSequence(memory,obligationOrder),
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
 * A42 residual: host extensional membership validates a Link-carried contract.
 * It creates K->Realization only on success. This is contextual truth witness,
 * not an assertion that the Realization Link itself equals TRUE=L.
 */
function validateSelectedContract(memory:Memory,selectedRequest:LinkHandle):LinkHandle|undefined{
  const selected=memory.poles(selectedRequest),context=selected.start,pair=memory.poles(selected.end);
  const contract=pair.start,candidateRealization=pair.end;
  const contractPoles=memory.poles(contract);
  const descriptor=readExactSequence(memory,contractPoles.end).values;
  same(descriptor.length,2,"A42 contract descriptor");
  const expectedFree=readExactSequence(memory,descriptor[0]!).values;
  const expectedObligations=readExactSequence(memory,descriptor[1]!).values;
  const proposed=readExactSequence(memory,candidateRealization).values;
  if(proposed.length!==2)return undefined;
  const proposedFree=readExactSequence(memory,proposed[0]!).values;
  const proposedObligations=readExactSequence(memory,proposed[1]!).values;
  if(!setEqual(expectedFree,proposedFree))return undefined;
  if(!setEqual(expectedObligations,proposedObligations))return undefined;
  return memory.ensure(context,candidateRealization);
}

function exercise(memory:Memory,withNoise:boolean):void{
  const b=ensureRootBasis(memory);
  if(withNoise)memory.ensure(memory.ensure(b.U,b.C),b.L);
  const rule=defineRule(memory),contract=deriveSemanticContract(memory,rule);
  same(contract.freeRoles.length,5,"A42 free-role obligation count");
  same(contract.constrainedTargets.length,3,"A42 constrained-target obligation count");

  const context=memory.ensure(b.R,b.U);
  const forward=realization(memory,contract.freeRoles,contract.constrainedTargets);
  const reverse=realization(memory,contract.freeRoles,[...contract.constrainedTargets].reverse());
  assert(forward!==reverse,"A42 distinct exact realizations");
  const forwardWitness=validateSelectedContract(memory,request(memory,context,contract.handle,forward));
  const reverseWitness=validateSelectedContract(memory,request(memory,context,contract.handle,reverse));
  assert(forwardWitness!==undefined&&reverseWitness!==undefined,"A42 both orderings accepted");
  same(memory.poles(forwardWitness).start,context,"A42 forward contextual witness");
  same(memory.poles(reverseWitness).start,context,"A42 reverse contextual witness");

  const targets=contract.constrainedTargets,free=contract.freeRoles;
  const missing=realization(memory,free,targets.slice(0,2));
  const duplicate=realization(memory,free,[targets[0]!,targets[1]!,targets[1]!]);
  const foreign=realization(memory,free,[targets[0]!,targets[1]!,free[0]!]);
  const shortFree=realization(memory,free.slice(0,4),targets);
  for(const [name,bad] of [
    ["missing",missing],["duplicate",duplicate],["foreign",foreign],["short-free",shortFree],
  ] as const){
    same(validateSelectedContract(memory,request(memory,context,contract.handle,bad)),undefined,
      `A42 ${name} realization rejected`);
    same(memory.find(context,bad),undefined,`A42 ${name} creates no accepted contextual witness`);
  }

  // Ambient invalid realization cannot alter an already selected good witness.
  request(memory,context,contract.handle,foreign);
  same(memory.poles(forwardWitness).end,forward,"A42 ambient alternate realization inert");

  // The contract contains Rule-derived obligations only, never an exact schema/plan.
  const cp=memory.poles(contract.handle);
  same(cp.start,rule,"A42 contract bound to Rule");
  const d=readExactSequence(memory,cp.end).values;
  same(d.length,2,"A42 contract has only free-role and constraint-obligation carriers");
}

function staticGuards():void{
  const root=resolve(process.cwd(),"..");
  const own=readFileSync(join(root,"ts/test/research-v013-rule-semantic-schema-contract-a42.test.ts"),"utf8");
  const a41=readFileSync(join(root,"ts/test/research-v013-rule-schema-underdetermination-a41.test.ts"),"utf8");
  const derive=own.slice(
    own.indexOf("function deriveSemanticContract("),
    own.indexOf("\nfunction realization(",own.indexOf("function deriveSemanticContract(")),
  );
  for(const forbidden of [
    "TemplatePlan","TemplateE0","authorPlan(","gateOrder","executeConstructionPlan(","function step(",
  ])assert(!derive.includes(forbidden),`A42 contract excludes exact-topology authority ${forbidden}`);

  // A42 is layered on merged A41 evidence; it does not replace lower execution proofs.
  for(const required of [
    "both topology variants reach ACCEPT",
    "both topology variants reject forged constraint",
    "construction executor source-identical F5-F4",
    "runtime source-identical A21/A37",
  ])assert(a41.includes(required),`A42 preserves merged A41 lower-boundary evidence: ${required}`);
}

function main():void{
  exercise(new Memory(),false);
  exercise(new Memory(),true);
  staticGuards();
  console.log([
    "MTS v0.13 A42: RULE_DERIVED_SEMANTIC_SCHEMA_CONTRACT=GREEN_SCOPED_RESEARCH",
    "EXACT_TOPOLOGY_AUTHORITY_IN_CONTRACT=0",
    "FREE_ROLE_OBLIGATIONS=5 CONSTRAINED_TARGET_OBLIGATIONS=3",
    "FORWARD_REVERSE_REALIZATIONS=ACCEPTED",
    "MISSING_DUPLICATE_FOREIGN_SHORT_FREE=ZERO",
    "CONTEXTUAL_ACCEPTANCE_WITNESS=K_TO_REALIZATION",
    "LOWER_EXECUTION_EVIDENCE=A41_UNCHANGED",
    "HOST_SET_VALIDATION=RESIDUAL HOST_RULE_CONTRACT_DERIVATION=RESIDUAL",
    "NEXT_BOUNDARY=A43_LINK_NATIVE_CONTRACT_VALIDATION",
    "A35_PUBLICATION_EXISTENCE=RESIDUAL A36_PROBE_SCRATCH=RESIDUAL",
    "INDEPENDENT_MEMORIES=2 GLOBAL_E2=OPEN GLOBAL_E3=OPEN",
    "FULL_SELF_HOSTED=NOT_CLAIMED PRODUCTION_UNCHANGED",
  ].join(" "));
}
main();
