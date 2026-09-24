import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
  type RootBasis,
} from "../src/memory.js";
import {
  admitStructuralRule,
  defineStructuralRoleDictionary,
  defineStructuralRule,
  readStructuralRoleDictionary,
  readStructuralRule,
  StructuralRuleError,
  verifyStructuralRuleAdmission,
  type StructuralRoleBinding,
} from "../src/structural-rule.js";
import { unifyStructuralTemplate } from "../src/structural-unification.js";
import { defineContext, readContext } from "../src/state.js";

function assert(c:unknown,m:string):asserts c{
  if(!c)throw new Error(`v0.13 A71h Rule-carried output template: ${m}`);
}
function same<T>(a:T,e:T,m:string):void{
  assert(Object.is(a,e),`${m}: values differ`);
}

interface ConstructiveRuleFixture{
  readonly rule:LinkHandle;
  readonly admission:LinkHandle;
  readonly roles:readonly LinkHandle[];
}

/**
 * Rule body is itself a generic implication:
 *
 *   input-template -> output-template
 *
 * PAIR fixture:
 *
 *   K -> ((K->X) -> (K->Y))
 *              ->
 *   K -> (X->Y)
 *
 * The runtime never receives a PAIR opcode or named executor.
 */
function definePairConstructionRule(
  memory:Memory,
  theory:LinkHandle,
  b:RootBasis,
  seed:LinkHandle,
):ConstructiveRuleFixture{
  const kRole=memory.ensure(seed,b.O);
  const xRole=memory.ensure(seed,b.C);
  const yRole=memory.ensure(seed,b.L);
  const dictionary=defineStructuralRoleDictionary(memory,[kRole,xRole,yRole]);

  const leftTruth=memory.ensure(kRole,xRole);
  const rightTruth=memory.ensure(kRole,yRole);
  const request=memory.ensure(leftTruth,rightTruth);
  const inputTemplate=memory.ensure(kRole,request);

  const targetTemplate=memory.ensure(xRole,yRole);
  const outputTemplate=memory.ensure(kRole,targetTemplate);

  const body=memory.ensure(inputTemplate,outputTemplate);
  const rule=defineStructuralRule(memory,dictionary,body);
  const admission=admitStructuralRule(memory,theory,rule);
  return Object.freeze({
    rule,
    admission,
    roles:Object.freeze([kRole,xRole,yRole]),
  });
}

/**
 * A second, non-PAIR constructive Rule used to prove the executor is generic.
 *
 *   K -> (K->X)
 *        ->
 *   K -> X
 */
function defineProjectionRule(
  memory:Memory,
  theory:LinkHandle,
  b:RootBasis,
  seed:LinkHandle,
):ConstructiveRuleFixture{
  const kRole=memory.ensure(seed,b.U);
  const xRole=memory.ensure(seed,b.O);
  const dictionary=defineStructuralRoleDictionary(memory,[kRole,xRole]);

  const inner=memory.ensure(kRole,xRole);
  const inputTemplate=memory.ensure(kRole,inner);
  const outputTemplate=inner;
  const body=memory.ensure(inputTemplate,outputTemplate);

  const rule=defineStructuralRule(memory,dictionary,body);
  const admission=admitStructuralRule(memory,theory,rule);
  return Object.freeze({
    rule,
    admission,
    roles:Object.freeze([kRole,xRole]),
  });
}

interface GroundedConstructiveRule{
  readonly rule:LinkHandle;
  readonly admission:LinkHandle;
  readonly outputTemplate:LinkHandle;
  readonly bindings:readonly StructuralRoleBinding[];
}

/**
 * Discover one admitted Rule whose input-template matches the exact START
 * payload of the active request Context.
 *
 * The body convention is generic:
 *
 *   body.start = input-template
 *   body.end   = output-template
 *
 * No Rule identity is mapped to a semantic executor.
 */
function discoverGroundedConstructiveRule(
  memory:Memory,
  theory:LinkHandle,
  requestContext:LinkHandle,
):GroundedConstructiveRule{
  const state=readContext(memory,requestContext);
  const claimed=memory.poles(requestContext).end;
  const claimedPoles=memory.poles(claimed);
  same(claimedPoles.start,state.parent,
    "active request payload starts at caller");
  same(claimedPoles.end,state.current,
    "active request payload ends at current request");

  const matches:GroundedConstructiveRule[]=[];
  for(const admission of memory.outgoing(theory)){
    const ap=memory.poles(admission);
    if(ap.start!==theory || ap.end===admission)continue;
    const ruleHandle=ap.end;

    try{
      verifyStructuralRuleAdmission(memory,theory,ruleHandle,admission);
      const rule=readStructuralRule(memory,ruleHandle);
      const dictionary=readStructuralRoleDictionary(memory,rule.roleDictionary);
      const body=memory.poles(rule.body);
      const bindings=unifyStructuralTemplate(
        memory,
        body.start,
        claimed,
        dictionary.roles,
      );
      matches.push(Object.freeze({
        rule:ruleHandle,
        admission,
        outputTemplate:body.end,
        bindings,
      }));
    }catch(error){
      if(error instanceof StructuralRuleError)continue;
      throw error;
    }
  }

  assert(matches.length===1,
    `exactly one admitted constructive Rule must match; got ${matches.length}`);
  return matches[0]!;
}

/**
 * Generic recursive structural-template instantiation.
 *
 * Roles are already grounded by read-only unification. Every non-role node is
 * cloned structurally into Memory; no domain-specific semantic names occur.
 */
function instantiateStructuralTemplate(
  memory:Memory,
  template:LinkHandle,
  bindings:readonly StructuralRoleBinding[],
):LinkHandle{
  const mapping=new Map<LinkHandle,LinkHandle>();
  for(const binding of bindings){
    const previous=mapping.get(binding.role);
    if(previous!==undefined)same(previous,binding.value,"role binding consistent");
    else mapping.set(binding.role,binding.value);
  }

  const visiting=new Set<LinkHandle>();
  const clone=(source:LinkHandle):LinkHandle=>{
    const known=mapping.get(source);
    if(known!==undefined)return known;

    assert(!visiting.has(source),"unsupported non-self template cycle");
    const p=memory.poles(source);
    let value:LinkHandle;

    if(p.start===source && p.end===source){
      value=memory.ensureRoot();
    }else if(p.start===source){
      value=memory.ensureStartSelfClosed(clone(p.end));
    }else if(p.end===source){
      value=memory.ensureEndSelfClosed(clone(p.start));
    }else{
      visiting.add(source);
      const start=clone(p.start);
      const end=clone(p.end);
      visiting.delete(source);
      value=memory.ensure(start,end);
    }

    mapping.set(source,value);
    return value;
  };

  return clone(template);
}

interface GroundedSubcallResult{
  readonly rule:LinkHandle;
  readonly outputTruth:LinkHandle;
  readonly closure:LinkHandle;
  readonly continuationContext:LinkHandle;
}

/**
 * Domain-agnostic grounded Rule subcall:
 *
 *   1. discover admitted Rule by structural unification;
 *   2. instantiate its carried output-template;
 *   3. require the output to return to the request caller;
 *   4. END the request Context;
 *   5. START the returned truth as caller continuation.
 *
 * There is no Rule->executor mapping here.
 */
function executeGroundedRuleSubcall(
  memory:Memory,
  theory:LinkHandle,
  requestContext:LinkHandle,
):GroundedSubcallResult{
  const requestState=readContext(memory,requestContext);
  const grounded=discoverGroundedConstructiveRule(memory,theory,requestContext);

  const outputTruth=instantiateStructuralTemplate(
    memory,
    grounded.outputTemplate,
    grounded.bindings,
  );
  const output=memory.poles(outputTruth);
  same(output.start,requestState.parent,
    "Rule output returns to exact caller");

  const closure=memory.ensureEndSelfClosed(requestContext);
  const continuationContext=memory.ensureStartSelfClosed(outputTruth);
  const continued=readContext(memory,continuationContext);
  same(continued.parent,requestState.parent,
    "Rule continuation is sibling under caller");
  same(continued.current,output.end,
    "Rule continuation current is output value");

  return Object.freeze({
    rule:grounded.rule,
    outputTruth,
    closure,
    continuationContext,
  });
}

function pairRequestContext(
  memory:Memory,
  caller:LinkHandle,
  x:LinkHandle,
  y:LinkHandle,
):LinkHandle{
  const leftTruth=memory.ensure(caller,x);
  const rightTruth=memory.ensure(caller,y);
  const request=memory.ensure(leftTruth,rightTruth);
  const requestTruth=memory.ensure(caller,request);
  return memory.ensureStartSelfClosed(requestTruth);
}

function projectionRequestContext(
  memory:Memory,
  caller:LinkHandle,
  value:LinkHandle,
):LinkHandle{
  const inner=memory.ensure(caller,value);
  const requestTruth=memory.ensure(caller,inner);
  return memory.ensureStartSelfClosed(requestTruth);
}

function exercise(noise:boolean):void{
  const memory=new Memory();
  const b=ensureRootBasis(memory);
  if(noise)memory.ensure(memory.ensure(b.U,b.C),memory.ensure(b.O,b.L));

  const fresh:LinkHandle[]=[];
  let seed=memory.ensure(b.U,b.L);
  for(let i=0;i<32;i+=1){
    seed=memory.ensure(seed,i%2===0?b.O:b.C);
    fresh.push(seed);
  }
  const at=(i:number):LinkHandle=>{
    const value=fresh[i];
    assert(value!==undefined,`fresh anchor ${i}`);
    return value;
  };

  const theory=memory.ensure(at(0),at(1));
  const pairRule=definePairConstructionRule(memory,theory,b,at(2));
  const projectionRule=defineProjectionRule(memory,theory,b,at(3));

  const caller=defineContext(memory,b.C,memory.ensure(at(4),at(5)));
  const x=memory.ensure(at(6),at(7));
  const y=memory.ensure(at(8),at(9));

  assert(memory.find(x,y)===undefined,
    "PAIR target absent before grounded Rule execution");
  const requestContext=pairRequestContext(memory,caller,x,y);

  const beforeDiscovery=memory.linkCount;
  const grounded=discoverGroundedConstructiveRule(
    memory,
    theory,
    requestContext,
  );
  same(memory.linkCount,beforeDiscovery,
    "constructive Rule discovery is read-only");
  same(grounded.rule,pairRule.rule,
    "PAIR request discovers exact constructive Rule");

  const executed=executeGroundedRuleSubcall(memory,theory,requestContext);
  same(executed.rule,pairRule.rule,"PAIR Rule executed generically");

  const target=memory.find(x,y);
  assert(target!==undefined,"Rule output template materializes X->Y");
  const expectedTruth=memory.find(caller,target);
  same(executed.outputTruth,expectedTruth,
    "Rule output is exact caller->(X->Y)");
  same(executed.continuationContext,
    defineContext(memory,caller,target),
    "generic START output is exact Context(caller,X->Y)");
  same(executed.closure,memory.ensureEndSelfClosed(requestContext),
    "generic subcall closes request Context");

  const beforeOracle=memory.linkCount;
  same(memory.ensure(x,y),target,"post-hoc PAIR oracle exact");
  same(memory.ensure(caller,target),executed.outputTruth,
    "post-hoc contextual result oracle exact");
  same(memory.linkCount,beforeOracle,
    "post-hoc PAIR semantic oracle adds zero Links");

  // The same executor handles a non-PAIR Rule. This is the main guard against
  // merely hiding a Rule->PAIR-executor map behind generic discovery.
  const projectedValue=memory.ensure(at(10),at(11));
  const projectionContext=projectionRequestContext(
    memory,
    caller,
    projectedValue,
  );
  const projection=executeGroundedRuleSubcall(
    memory,
    theory,
    projectionContext,
  );
  same(projection.rule,projectionRule.rule,
    "same executor discovers non-PAIR projection Rule");
  const projectedTruth=memory.ensure(caller,projectedValue);
  same(projection.outputTruth,projectedTruth,
    "projection Rule output template realized exactly");
  same(projection.continuationContext,
    defineContext(memory,caller,projectedValue),
    "projection output reconnects to same Context lifecycle");

  // A matching Rule admitted only under a foreign Theory is inert.
  const foreignTheory=memory.ensure(at(12),at(13));
  definePairConstructionRule(memory,foreignTheory,b,at(14));
  const stillPair=discoverGroundedConstructiveRule(
    memory,
    theory,
    requestContext,
  );
  same(stillPair.rule,pairRule.rule,
    "foreign-Theory constructive Rule is inert");

  // Zero match fails closed and materializes no semantic result.
  const ordinary=defineContext(
    memory,
    caller,
    memory.ensure(at(15),at(16)),
  );
  const beforeZero=memory.linkCount;
  let zeroMatch=false;
  try{
    executeGroundedRuleSubcall(memory,theory,ordinary);
  }catch{
    zeroMatch=true;
  }
  assert(zeroMatch,"zero matching constructive Rules fail closed");
  same(memory.linkCount,beforeZero,
    "zero-match classification writes no result topology");

  // A second admitted Rule with the same input pattern creates semantic
  // ambiguity. The runtime must not choose by admission/order.
  const secondPair=definePairConstructionRule(memory,theory,b,at(17));
  assert(secondPair.rule!==pairRule.rule,
    "second PAIR Rule has distinct role dictionary identity");

  const caller2=defineContext(memory,b.C,memory.ensure(at(18),at(19)));
  const x2=memory.ensure(at(20),at(21));
  const y2=memory.ensure(at(22),at(23));
  assert(memory.find(x2,y2)===undefined,
    "ambiguous target absent before execution");
  const ambiguousRequest=pairRequestContext(memory,caller2,x2,y2);
  const beforeAmbiguous=memory.linkCount;
  let ambiguous=false;
  try{
    executeGroundedRuleSubcall(memory,theory,ambiguousRequest);
  }catch{
    ambiguous=true;
  }
  assert(ambiguous,"multiple matching constructive Rules fail closed");
  same(memory.find(x2,y2),undefined,
    "ambiguous Rule set does not materialize target");
  same(memory.linkCount,beforeAmbiguous,
    "ambiguous classification performs no semantic writes");

  // The Rule body itself is the only mapping from matched request topology to
  // output topology. No executor identity is encoded outside the Rule.
}

function sourceSlice(source:string,start:string,end:string):string{
  const i=source.indexOf(start),j=source.indexOf(end,i+1);
  assert(i>=0&&j>i,`source slice ${start}`);
  return source.slice(i,j).replace(/\s+/g,"");
}

function staticGuards():void{
  const root=resolve(process.cwd(),"..");
  const own=readFileSync(
    join(root,"ts/test/research-v013-rule-carried-output-template-a71h.test.ts"),
    "utf8",
  );
  const a71g=readFileSync(
    join(root,"ts/test/research-v013-rule-grounded-pair-classification-a71g.test.ts"),
    "utf8",
  );
  const a50=readFileSync(
    join(root,"ts/test/research-v013-direct-structural-schema-a50.test.ts"),
    "utf8",
  );

  const discovery=sourceSlice(
    own,
    "function discoverGroundedConstructiveRule(",
    "\n/**\n * Generic recursive structural-template instantiation.",
  );
  for(const forbidden of [
    "RuleKind",
    "opcode",
    "basis.L",
    "selectedRule",
    "expectedRule",
    "executePair",
    "switch(",
  ]){
    assert(!discovery.includes(forbidden),
      `A71h Rule discovery excludes semantic selector ${forbidden}`);
  }
  assert(discovery.includes("memory.outgoing(theory)"),
    "A71h Rule candidates derive from Theory admissions");
  assert(discovery.includes("unifyStructuralTemplate("),
    "A71h input matching uses generic structural unification");
  assert(discovery.includes("matches.length===1"),
    "A71h fails closed on zero/many matching Rules");

  const instantiation=sourceSlice(
    own,
    "function instantiateStructuralTemplate(",
    "\ninterface GroundedSubcallResult",
  );
  for(const forbidden of [
    "requestContext",
    "theory",
    "RuleKind",
    "opcode",
    "PAIR",
    "pair",
    "leftTruth",
    "rightTruth",
  ]){
    assert(!instantiation.includes(forbidden),
      `A71h template instantiator remains domain-agnostic: ${forbidden}`);
  }

  const executor=sourceSlice(
    own,
    "function executeGroundedRuleSubcall(",
    "\nfunction pairRequestContext(",
  );
  for(const forbidden of [
    "executePair",
    "RuleKind",
    "opcode",
    "basis.L",
    "switch(",
  ]){
    assert(!executor.includes(forbidden),
      `A71h executor excludes Rule-to-executor mapping ${forbidden}`);
  }
  assert(executor.includes("grounded.outputTemplate"),
    "semantic effect is carried by selected Rule output template");

  assert(a71g.includes("RULE_TO_SEMANTIC_EXECUTOR_MAPPING=RESIDUAL"),
    "A71h attacks exact A71g executor-mapping residual");
  assert(a50.includes("GENERIC_RECURSIVE_TEMPLATE_INSTANTIATION=HOST_RESIDUAL"),
    "A71h explicitly reuses the historical generic template-instantiation boundary");
}

function main():void{
  exercise(false);
  exercise(true);
  staticGuards();

  console.log([
    "MTS v0.13 A71h: RULE_CARRIED_OUTPUT_TEMPLATE_EXECUTION=GREEN_SCOPED_RESEARCH",
    "RULE_BODY=INPUT_TEMPLATE_TO_OUTPUT_TEMPLATE",
    "INPUT_CLASSIFICATION=THEORY_ADMISSION_PLUS_GENERIC_UNIFICATION",
    "OUTPUT_REALIZATION=GENERIC_STRUCTURAL_TEMPLATE_INSTANTIATION",
    "PAIR_RULE_OUTPUT=CALLER_TO_X_TO_Y",
    "PAIR_TARGET=X_TO_Y_MATERIALIZED_BY_RULE_TEMPLATE",
    "POST_HOC_PAIR_ORACLE=ZERO_NEW_LINKS",
    "SECOND_NON_PAIR_RULE=SAME_GENERIC_EXECUTOR",
    "RULE_TO_SEMANTIC_EXECUTOR_MAPPING=0",
    "HOST_RULE_KIND=0 HOST_OPCODE=0 HOST_SELECTED_RULE=0",
    "ZERO_MATCH=FAIL_CLOSED MULTIPLE_MATCH=FAIL_CLOSED",
    "FOREIGN_THEORY_RULE=INERT",
    "REQUEST_LIFECYCLE=GENERIC_END_REQUEST_PLUS_START_OUTPUT",
    "THEORY_AUTHORITY_ARGUMENT=RESIDUAL",
    "GENERIC_TEMPLATE_INSTANTIATION=HOST_RESIDUAL",
    "REQUEST_Q_PRODUCTION=RESIDUAL",
    "RULE_AUTHORSHIP_ADMISSION=RESIDUAL",
    "NEXT=A71I_THEORY_AUTHORITY_AND_REQUEST_PRODUCTION",
    "FULL_SELF_HOSTED=FALSE",
    "V013_NOT_ACCEPTED PRODUCTION_UNCHANGED",
  ].join(" "));
}

main();
