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
  if(!c)throw new Error(`v0.13 A71i Rule-produced request chain: ${m}`);
}
function same<T>(a:T,e:T,m:string):void{
  assert(Object.is(a,e),`${m}: values differ`);
}
function setSame(actual:readonly LinkHandle[],expected:readonly LinkHandle[],m:string):void{
  same(new Set(actual).size,new Set(expected).size,`${m}: cardinality`);
  for(const x of expected)assert(actual.includes(x),`${m}: missing expected Link`);
}

interface ConstructiveRuleFixture{
  readonly rule:LinkHandle;
  readonly admission:LinkHandle;
  readonly roles:readonly LinkHandle[];
}

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

  const rule=defineStructuralRule(
    memory,
    dictionary,
    memory.ensure(inputTemplate,outputTemplate),
  );
  const admission=admitStructuralRule(memory,theory,rule);
  return Object.freeze({
    rule,
    admission,
    roles:Object.freeze([kRole,xRole,yRole]),
  });
}

/**
 * Rule A does not construct X->Y. It constructs the exact request topology
 * consumed by the PAIR Rule:
 *
 * input:
 *   K -> ((X->K) -> (Y->K))
 *
 * output:
 *   K -> ((K->X) -> (K->Y))
 */
function definePairRequestProducerRule(
  memory:Memory,
  theory:LinkHandle,
  b:RootBasis,
  seed:LinkHandle,
):ConstructiveRuleFixture{
  const kRole=memory.ensure(seed,b.U);
  const xRole=memory.ensure(seed,b.O);
  const yRole=memory.ensure(seed,b.C);
  const dictionary=defineStructuralRoleDictionary(memory,[kRole,xRole,yRole]);

  const triggerLeft=memory.ensure(xRole,kRole);
  const triggerRight=memory.ensure(yRole,kRole);
  const trigger=memory.ensure(triggerLeft,triggerRight);
  const inputTemplate=memory.ensure(kRole,trigger);

  const leftTruth=memory.ensure(kRole,xRole);
  const rightTruth=memory.ensure(kRole,yRole);
  const request=memory.ensure(leftTruth,rightTruth);
  const outputTemplate=memory.ensure(kRole,request);

  const rule=defineStructuralRule(
    memory,
    dictionary,
    memory.ensure(inputTemplate,outputTemplate),
  );
  const admission=admitStructuralRule(memory,theory,rule);
  return Object.freeze({
    rule,
    admission,
    roles:Object.freeze([kRole,xRole,yRole]),
  });
}

interface GroundedConstructiveRule{
  readonly rule:LinkHandle;
  readonly admission:LinkHandle;
  readonly outputTemplate:LinkHandle;
  readonly bindings:readonly StructuralRoleBinding[];
}

/** Source-identical A71h grounded Rule discovery. */
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

/** Source-identical A71h generic structural-template instantiation. */
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

/** Source-identical A71h generic grounded Rule subcall. */
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

function seedProducerRequest(
  memory:Memory,
  caller:LinkHandle,
  x:LinkHandle,
  y:LinkHandle,
):LinkHandle{
  const triggerLeft=memory.ensure(x,caller);
  const triggerRight=memory.ensure(y,caller);
  const trigger=memory.ensure(triggerLeft,triggerRight);
  return memory.ensureStartSelfClosed(memory.ensure(caller,trigger));
}

function exercise(noise:boolean):void{
  const memory=new Memory();
  const b=ensureRootBasis(memory);
  if(noise)memory.ensure(memory.ensure(b.U,b.C),memory.ensure(b.O,b.L));

  const fresh:LinkHandle[]=[];
  let seed=memory.ensure(b.U,b.L);
  for(let i=0;i<24;i+=1){
    seed=memory.ensure(seed,i%2===0?b.O:b.C);
    fresh.push(seed);
  }
  const at=(i:number):LinkHandle=>{
    const value=fresh[i];
    assert(value!==undefined,`fresh anchor ${i}`);
    return value;
  };

  const theory=memory.ensure(at(0),at(1));
  const producerRule=definePairRequestProducerRule(memory,theory,b,at(2));
  const pairRule=definePairConstructionRule(memory,theory,b,at(3));

  const caller=defineContext(memory,b.C,memory.ensure(at(4),at(5)));
  const x=memory.ensure(at(6),at(7));
  const y=memory.ensure(at(8),at(9));

  assert(memory.find(x,y)===undefined,
    "final X->Y target absent before chain starts");

  // Only the seed trigger request is authored by the fixture. The PAIR request
  // consumed in stage 2 must be produced solely by Rule A's output template.
  const producerContext=seedProducerRequest(memory,caller,x,y);
  setSame(activeFrontier(memory,caller),[producerContext],
    "seed producer request is sole active child");

  const stage1=executeGroundedRuleSubcall(
    memory,
    theory,
    producerContext,
  );
  same(stage1.rule,producerRule.rule,
    "stage1 discovers request-producer Rule");
  same(closureOf(memory,producerContext),stage1.closure,
    "stage1 request closes");

  // Rule A must not accidentally construct the final pair.
  same(memory.find(x,y),undefined,
    "stage1 request production does not construct X->Y");

  // The next request Context is discovered from lifecycle topology, not passed
  // as an authored PAIR-request fixture handle.
  const afterStage1=activeFrontier(memory,caller);
  setSame(afterStage1,[stage1.continuationContext],
    "Rule-produced request becomes sole active continuation");
  const pairRequestContext=afterStage1[0]!;

  const pairRequestTruth=memory.poles(pairRequestContext).end;
  const pairRequest=memory.poles(pairRequestTruth).end;
  const requestPoles=memory.poles(pairRequest);
  const leftTruth=memory.poles(requestPoles.start);
  const rightTruth=memory.poles(requestPoles.end);
  same(leftTruth.start,caller,"produced PAIR left truth caller");
  same(leftTruth.end,x,"produced PAIR left operand X");
  same(rightTruth.start,caller,"produced PAIR right truth caller");
  same(rightTruth.end,y,"produced PAIR right operand Y");

  // The same generic executor consumes the Rule-produced request. There is no
  // host transition from "producer" to a named PAIR handler.
  const stage2=executeGroundedRuleSubcall(
    memory,
    theory,
    pairRequestContext,
  );
  same(stage2.rule,pairRule.rule,
    "stage2 discovers PAIR Rule from produced request topology");
  same(closureOf(memory,pairRequestContext),stage2.closure,
    "stage2 request closes");

  const target=memory.find(x,y);
  assert(target!==undefined,
    "stage2 Rule output materializes final X->Y");
  const expectedTruth=memory.find(caller,target);
  same(stage2.outputTruth,expectedTruth,
    "stage2 returns exact caller->(X->Y)");
  same(stage2.continuationContext,
    defineContext(memory,caller,target),
    "stage2 continuation exact Context(caller,X->Y)");

  setSame(activeFrontier(memory,caller),[stage2.continuationContext],
    "frontier naturally moves producer request -> PAIR request -> result");

  // Both request Contexts are immutable closed history; final result remains
  // active. No mutable call stack or request queue is involved.
  assert(closureOf(memory,producerContext)!==undefined,
    "producer request remains closed history");
  assert(closureOf(memory,pairRequestContext)!==undefined,
    "PAIR request remains closed history");
  same(closureOf(memory,stage2.continuationContext),undefined,
    "result continuation remains open");

  const beforeOracle=memory.linkCount;
  same(memory.ensure(x,y),target,"post-hoc final target oracle exact");
  same(memory.ensure(caller,target),stage2.outputTruth,
    "post-hoc result truth oracle exact");
  same(memory.linkCount,beforeOracle,
    "post-hoc semantic oracle adds zero Links");

  // Exact replay of either closed stage is canonical and cannot create a
  // second temporal invocation or alternate request chain.
  const replay1=executeGroundedRuleSubcall(memory,theory,producerContext);
  const replay2=executeGroundedRuleSubcall(memory,theory,pairRequestContext);
  same(replay1.continuationContext,stage1.continuationContext,
    "stage1 replay canonical");
  same(replay2.continuationContext,stage2.continuationContext,
    "stage2 replay canonical");
}

function sourceSlice(source:string,start:string,end:string):string{
  const i=source.indexOf(start),j=source.indexOf(end,i+1);
  assert(i>=0&&j>i,`source slice ${start}`);
  return source.slice(i,j).replace(/\s+/g,"");
}

function staticGuards():void{
  const root=resolve(process.cwd(),"..");
  const own=readFileSync(
    join(root,"ts/test/research-v013-rule-produced-request-chain-a71i.test.ts"),
    "utf8",
  );
  const a71h=readFileSync(
    join(root,"ts/test/research-v013-rule-carried-output-template-a71h.test.ts"),
    "utf8",
  );
  const a70e=readFileSync(
    join(root,"ts/test/research-v013-link-native-frontier-a70e.test.ts"),
    "utf8",
  );

  same(
    sourceSlice(
      own,
      "function discoverGroundedConstructiveRule(",
      "\n/** Source-identical A71h generic structural-template instantiation.",
    ),
    sourceSlice(
      a71h,
      "function discoverGroundedConstructiveRule(",
      "\n/**\n * Generic recursive structural-template instantiation.",
    ),
    "A71i Rule discovery source-identical A71h",
  );
  same(
    sourceSlice(
      own,
      "function instantiateStructuralTemplate(",
      "\ninterface GroundedSubcallResult",
    ),
    sourceSlice(
      a71h,
      "function instantiateStructuralTemplate(",
      "\ninterface GroundedSubcallResult",
    ),
    "A71i output instantiation source-identical A71h",
  );
  same(
    sourceSlice(
      own,
      "function executeGroundedRuleSubcall(",
      "\n/** Source-identical A70e child discovery.",
    ),
    sourceSlice(
      a71h,
      "function executeGroundedRuleSubcall(",
      "\nfunction pairRequestContext(",
    ),
    "A71i generic subcall executor source-identical A71h",
  );

  const ownFrontier=sourceSlice(
    own,
    "function childContexts(",
    "\nfunction seedProducerRequest(",
  );
  const referenceFrontier=sourceSlice(
    a70e,
    "function childContexts(",
    "\nfunction exercise(",
  );
  same(ownFrontier,referenceFrontier,
    "A71i lifecycle frontier source-identical A70e");

  const exercise=sourceSlice(
    own,
    "function exercise(",
    "\nfunction sourceSlice(",
  );
  for(const forbidden of [
    "pairRequestContext(",
    "executePair",
    "selectedRule",
    "RuleKind",
    "opcode",
    "switch(",
    "requestQueue",
  ]){
    assert(!exercise.includes(forbidden),
      `A71i chain excludes host request orchestration ${forbidden}`);
  }
  assert(exercise.includes("afterStage1=activeFrontier(memory,caller)"),
    "stage2 request selected from derived frontier");
}

function main():void{
  exercise(false);
  exercise(true);
  staticGuards();

  console.log([
    "MTS v0.13 A71i: RULE_PRODUCED_REQUEST_COMPOSITION=GREEN_SCOPED_RESEARCH",
    "STAGE1_RULE=TRIGGER_TO_PAIR_REQUEST_TOPOLOGY",
    "STAGE2_RULE=PAIR_REQUEST_TO_CALLER_TO_PAIR_RESULT",
    "SAME_GENERIC_A71H_EXECUTOR_BOTH_STAGES=YES",
    "PAIR_REQUEST_FIXTURE_AUTHORING_AFTER_SEED=0",
    "PAIR_REQUEST_Q_PRODUCTION=RULE_OUTPUT_TOPOLOGY",
    "STAGE2_REQUEST_SELECTION=DERIVED_ACTIVE_FRONTIER",
    "FINAL_X_TO_Y_ABSENT_BEFORE_CHAIN=YES",
    "FINAL_X_TO_Y_ABSENT_AFTER_STAGE1=YES",
    "FINAL_X_TO_Y_MATERIALIZED_ONLY_STAGE2=YES",
    "REQUEST_LIFECYCLE=START_ACTIVE_END_CLOSED",
    "CALL_STACK=CONTEXT_ANCESTRY_AND_SIBLING_CONTINUATION",
    "HOST_REQUEST_QUEUE=0 HOST_RULE_EXECUTOR_MAP=0",
    "POST_HOC_SEMANTIC_ORACLE=ZERO_NEW_LINKS",
    "REPLAY=CANONICAL",
    "THEORY_AUTHORITY_ARGUMENT=RESIDUAL",
    "GENERIC_TEMPLATE_INSTANTIATION=HOST_RESIDUAL",
    "INITIAL_SEED_REQUEST_AUTHORING=INPUT_BOUNDARY",
    "RULE_AUTHORSHIP_ADMISSION=RESIDUAL",
    "NEXT=A71J_CONTEXT_NATIVE_THEORY_AUTHORITY",
    "FULL_SELF_HOSTED=FALSE",
    "V013_NOT_ACCEPTED PRODUCTION_UNCHANGED",
  ].join(" "));
}

main();
