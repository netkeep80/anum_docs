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
  defineStructuralInterpreter,
  defineStructuralRoleDictionary,
  defineStructuralRule,
  readStructuralInterpreter,
  readStructuralRoleDictionary,
  readStructuralRule,
  StructuralRuleError,
  verifyStructuralRuleAdmission,
  type StructuralRoleBinding,
} from "../src/structural-rule.js";
import { unifyStructuralTemplate } from "../src/structural-unification.js";
import { defineContext, readContext, StateError } from "../src/state.js";

function assert(c:unknown,m:string):asserts c{
  if(!c)throw new Error(`v0.13 A71o universal aspect dataflow: ${m}`);
}
function same<T>(a:T,e:T,m:string):void{
  assert(Object.is(a,e),`${m}: values differ`);
}
function setSame(actual:readonly LinkHandle[],expected:readonly LinkHandle[],m:string):void{
  same(new Set(actual).size,new Set(expected).size,`${m}: cardinality`);
  for(const x of expected)assert(actual.includes(x),`${m}: missing expected Link`);
}

interface UniversalRules{
  readonly root:LinkHandle;
  readonly pair:LinkHandle;
  readonly start:LinkHandle;
  readonly end:LinkHandle;
}

/**
 * One universal Rule per structural aspect. No source-template node identity
 * occurs in these Rules.
 */
function defineUniversalAspectRules(
  memory:Memory,
  theory:LinkHandle,
  b:RootBasis,
  seed:LinkHandle,
):UniversalRules{
  // ROOT:
  //   K -> R
  //      -> K -> (R -> R)
  const kr=memory.ensure(seed,b.O);
  const dr=defineStructuralRoleDictionary(memory,[kr]);
  const rootInput=memory.ensure(kr,memory.root);
  const rootMap=memory.ensure(memory.root,memory.root);
  const rootOutput=memory.ensure(kr,rootMap);
  const rootRule=defineStructuralRule(
    memory,dr,memory.ensure(rootInput,rootOutput),
  );
  admitStructuralRule(memory,theory,rootRule);

  // PAIR:
  //   K -> ((A->B) -> ((A->A') -> (B->B')))
  //      -> K -> ((A->B) -> (A'->B'))
  const kp=memory.ensure(seed,b.C);
  const a=memory.ensure(seed,b.O);
  const bb=memory.ensure(seed,b.L);
  const ai=memory.ensure(seed,b.U);
  const bi=memory.ensure(seed,memory.root);
  const dp=defineStructuralRoleDictionary(memory,[kp,a,bb,ai,bi]);

  const sourcePair=memory.ensure(a,bb);
  const mapA=memory.ensure(a,ai);
  const mapB=memory.ensure(bb,bi);
  const pairReady=memory.ensure(sourcePair,memory.ensure(mapA,mapB));
  const pairInput=memory.ensure(kp,pairReady);
  const pairImage=memory.ensure(ai,bi);
  const pairOutput=memory.ensure(kp,memory.ensure(sourcePair,pairImage));
  const pairRule=defineStructuralRule(
    memory,dp,memory.ensure(pairInput,pairOutput),
  );
  admitStructuralRule(memory,theory,pairRule);

  // START:
  //   K -> (START(A) -> (A->A'))
  //      -> K -> (START(A) -> START(A'))
  const ks=memory.ensure(seed,memory.ensure(b.O,b.C));
  const sa=memory.ensure(seed,memory.ensure(b.C,b.L));
  const sai=memory.ensure(seed,memory.ensure(b.L,b.U));
  const ds=defineStructuralRoleDictionary(memory,[ks,sa,sai]);

  const sourceStart=memory.ensureStartSelfClosed(sa);
  const startChildMap=memory.ensure(sa,sai);
  const startInput=memory.ensure(ks,memory.ensure(sourceStart,startChildMap));
  const startImage=memory.ensureStartSelfClosed(sai);
  const startOutput=memory.ensure(ks,memory.ensure(sourceStart,startImage));
  const startRule=defineStructuralRule(
    memory,ds,memory.ensure(startInput,startOutput),
  );
  admitStructuralRule(memory,theory,startRule);

  // END:
  //   K -> (END(A) -> (A->A'))
  //      -> K -> (END(A) -> END(A'))
  const ke=memory.ensure(seed,memory.ensure(b.C,b.O));
  const ea=memory.ensure(seed,memory.ensure(b.L,b.C));
  const eai=memory.ensure(seed,memory.ensure(b.U,b.L));
  const de=defineStructuralRoleDictionary(memory,[ke,ea,eai]);

  const sourceEnd=memory.ensureEndSelfClosed(ea);
  const endChildMap=memory.ensure(ea,eai);
  const endInput=memory.ensure(ke,memory.ensure(sourceEnd,endChildMap));
  const endImage=memory.ensureEndSelfClosed(eai);
  const endOutput=memory.ensure(ke,memory.ensure(sourceEnd,endImage));
  const endRule=defineStructuralRule(
    memory,de,memory.ensure(endInput,endOutput),
  );
  admitStructuralRule(memory,theory,endRule);

  return Object.freeze({
    root:rootRule,
    pair:pairRule,
    start:startRule,
    end:endRule,
  });
}

interface GroundedConstructiveRule{
  readonly rule:LinkHandle;
  readonly outputTemplate:LinkHandle;
  readonly bindings:readonly StructuralRoleBinding[];
}

function entryRootOf(
  memory:Memory,
  contextRoot:LinkHandle,
  leaf:LinkHandle,
):LinkHandle{
  let current=leaf;
  const seen=new Set<LinkHandle>();
  while(true){
    assert(!seen.has(current),"entry-root ancestry cycle");
    seen.add(current);
    let state;
    try{
      state=readContext(memory,current);
    }catch(error){
      if(error instanceof StateError)throw new Error("leaf is outside Context ancestry");
      throw error;
    }
    if(state.parent===contextRoot)return current;
    current=state.parent;
  }
}

function deriveEntryTheory(
  memory:Memory,
  contextRoot:LinkHandle,
  requestContext:LinkHandle,
):LinkHandle{
  const entry=entryRootOf(memory,contextRoot,requestContext);
  return readStructuralInterpreter(memory,readContext(memory,entry).current).theory;
}

function discoverGroundedConstructiveRule(
  memory:Memory,
  contextRoot:LinkHandle,
  requestContext:LinkHandle,
):GroundedConstructiveRule{
  const theory=deriveEntryTheory(memory,contextRoot,requestContext);
  const state=readContext(memory,requestContext);
  const claimed=memory.poles(requestContext).end;
  const claimedPoles=memory.poles(claimed);
  same(claimedPoles.start,state.parent,"request payload caller");
  same(claimedPoles.end,state.current,"request payload current");

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
        memory,body.start,claimed,dictionary.roles,
      );
      matches.push(Object.freeze({
        rule:ruleHandle,
        outputTemplate:body.end,
        bindings,
      }));
    }catch(error){
      if(error instanceof StructuralRuleError)continue;
      throw error;
    }
  }
  assert(matches.length===1,
    `exactly one universal aspect Rule must match; got ${matches.length}`);
  return matches[0]!;
}

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
    if(p.start===source&&p.end===source){
      value=memory.ensureRoot();
    }else if(p.start===source){
      value=memory.ensureStartSelfClosed(clone(p.end));
    }else if(p.end===source){
      value=memory.ensureEndSelfClosed(clone(p.start));
    }else{
      visiting.add(source);
      value=memory.ensure(clone(p.start),clone(p.end));
      visiting.delete(source);
    }
    mapping.set(source,value);
    return value;
  };
  return clone(template);
}

interface RuleResult{
  readonly rule:LinkHandle;
  readonly outputTruth:LinkHandle;
  readonly continuation:LinkHandle;
}
function executeRule(
  memory:Memory,
  contextRoot:LinkHandle,
  requestContext:LinkHandle,
):RuleResult{
  const request=readContext(memory,requestContext);
  const grounded=discoverGroundedConstructiveRule(
    memory,contextRoot,requestContext,
  );
  const outputTruth=instantiateStructuralTemplate(
    memory,grounded.outputTemplate,grounded.bindings,
  );
  const output=memory.poles(outputTruth);
  same(output.start,request.parent,"output returns to request caller");
  memory.ensureEndSelfClosed(requestContext);
  const continuation=memory.ensureStartSelfClosed(outputTruth);
  return Object.freeze({rule:grounded.rule,outputTruth,continuation});
}

function childContexts(memory:Memory,parent:LinkHandle):readonly LinkHandle[]{
  const out:LinkHandle[]=[];
  for(const payload of memory.outgoing(parent)){
    const p=memory.poles(payload);
    if(p.start!==parent||p.end===payload)continue;
    for(const candidate of memory.incoming(payload)){
      const c=memory.poles(candidate);
      if(c.start!==candidate||c.end!==payload)continue;
      if(readContext(memory,candidate).parent===parent)out.push(candidate);
    }
  }
  return Object.freeze([...new Set(out)]);
}
function closureOf(memory:Memory,context:LinkHandle):LinkHandle|undefined{
  for(const candidate of memory.outgoing(context)){
    const p=memory.poles(candidate);
    if(p.start===context&&p.end===candidate&&p.start!==candidate)return candidate;
  }
  return undefined;
}
function activeFrontier(memory:Memory,entry:LinkHandle):readonly LinkHandle[]{
  const out:LinkHandle[]=[];
  const walk=(k:LinkHandle):void=>{
    const children=childContexts(memory,k);
    const closure=closureOf(memory,k);
    if(children.length>0){
      assert(closure===undefined,"closed non-leaf invalid");
      for(const child of children)walk(child);
    }else if(closure===undefined)out.push(k);
  };
  walk(entry);
  return Object.freeze(out);
}

function pairReadyRequest(
  memory:Memory,
  caller:LinkHandle,
  sourcePair:LinkHandle,
  leftMap:LinkHandle,
  rightMap:LinkHandle,
):LinkHandle{
  return defineContext(
    memory,
    caller,
    memory.ensure(sourcePair,memory.ensure(leftMap,rightMap)),
  );
}
function unaryReadyRequest(
  memory:Memory,
  caller:LinkHandle,
  sourceParent:LinkHandle,
  childMap:LinkHandle,
):LinkHandle{
  return defineContext(memory,caller,memory.ensure(sourceParent,childMap));
}

interface TemplateChain{
  readonly xRole:LinkHandle;
  readonly yRole:LinkHandle;
  readonly pair:LinkHandle;
  readonly inner:LinkHandle;
  readonly root:LinkHandle;
  readonly innerAspect:"START"|"END";
  readonly rootAspect:"START"|"END";
}
function defineTemplateChain(
  memory:Memory,
  b:RootBasis,
  seed:LinkHandle,
  order:"START_END"|"END_START",
):TemplateChain{
  const xRole=memory.ensure(seed,b.O);
  const yRole=memory.ensure(seed,b.C);
  const pair=memory.ensure(xRole,yRole);
  if(order==="START_END"){
    const inner=memory.ensureStartSelfClosed(pair);
    const root=memory.ensureEndSelfClosed(inner);
    return Object.freeze({
      xRole,yRole,pair,inner,root,innerAspect:"START",rootAspect:"END",
    });
  }
  const inner=memory.ensureEndSelfClosed(pair);
  const root=memory.ensureStartSelfClosed(inner);
  return Object.freeze({
    xRole,yRole,pair,inner,root,innerAspect:"END",rootAspect:"START",
  });
}

function mapping(memory:Memory,source:LinkHandle,target:LinkHandle):LinkHandle{
  return memory.ensure(source,target);
}

/**
 * Diagnostic-only host promotion. This is exactly the residual A71o is trying
 * to expose: sourceParent must be supplied from outside the generic Rule tick.
 */
function promoteToParentReadyRequest(
  memory:Memory,
  mappingContext:LinkHandle,
  sourceParent:LinkHandle,
):LinkHandle{
  return unaryReadyRequest(
    memory,
    mappingContext,
    sourceParent,
    readContext(memory,mappingContext).current,
  );
}

function expectNoRule(
  memory:Memory,
  contextRoot:LinkHandle,
  context:LinkHandle,
  m:string,
):void{
  let failed=false;
  try{
    discoverGroundedConstructiveRule(memory,contextRoot,context);
  }catch{
    failed=true;
  }
  assert(failed,m);
}

function exerciseChain(
  memory:Memory,
  C:LinkHandle,
  entry:LinkHandle,
  rules:UniversalRules,
  source:TemplateChain,
  x:LinkHandle,
  y:LinkHandle,
):LinkHandle{
  const caller=defineContext(memory,entry,memory.ensure(x,y));
  const mapX=mapping(memory,source.xRole,x);
  const mapY=mapping(memory,source.yRole,y);

  const pairRequest=pairReadyRequest(
    memory,caller,source.pair,mapX,mapY,
  );
  const pairStep=executeRule(memory,C,pairRequest);
  same(pairStep.rule,rules.pair,"universal PAIR Rule selected");
  const pairTarget=memory.ensure(x,y);
  const pairMap=mapping(memory,source.pair,pairTarget);
  same(readContext(memory,pairStep.continuation).current,pairMap,
    "PAIR Rule yields exact source-pair mapping");

  // Critical RED boundary: source.inner physically exists in Memory, but the
  // active mapping fact does not carry that parent identity. No universal Rule
  // can fire until a parent-ready request is explicitly produced.
  expectNoRule(
    memory,C,pairStep.continuation,
    "mapping fact alone does not select its source parent",
  );

  if(source.innerAspect==="START"){
    assert(memory.incoming(source.pair).includes(source.inner),
      "START source parent is physically adjacent to pair child");
  }else{
    assert(memory.outgoing(source.pair).includes(source.inner),
      "END source parent is physically adjacent to pair child");
  }

  const innerRequest=promoteToParentReadyRequest(
    memory,pairStep.continuation,source.inner,
  );
  const innerStep=executeRule(memory,C,innerRequest);
  same(
    innerStep.rule,
    source.innerAspect==="START"?rules.start:rules.end,
    "universal inner aspect Rule selected",
  );

  const innerTarget=source.innerAspect==="START"
    ? memory.ensureStartSelfClosed(pairTarget)
    : memory.ensureEndSelfClosed(pairTarget);
  const innerMap=mapping(memory,source.inner,innerTarget);
  same(readContext(memory,innerStep.continuation).current,innerMap,
    "inner universal Rule yields exact mapping");

  expectNoRule(
    memory,C,innerStep.continuation,
    "inner mapping still does not autonomously discover source root parent",
  );

  if(source.rootAspect==="START"){
    assert(memory.incoming(source.inner).includes(source.root),
      "START root parent physically adjacent to inner child");
  }else{
    assert(memory.outgoing(source.inner).includes(source.root),
      "END root parent physically adjacent to inner child");
  }

  const rootRequest=promoteToParentReadyRequest(
    memory,innerStep.continuation,source.root,
  );
  const rootStep=executeRule(memory,C,rootRequest);
  same(
    rootStep.rule,
    source.rootAspect==="START"?rules.start:rules.end,
    "universal root aspect Rule selected",
  );

  const finalTarget=source.rootAspect==="START"
    ? memory.ensureStartSelfClosed(innerTarget)
    : memory.ensureEndSelfClosed(innerTarget);
  const finalMap=mapping(memory,source.root,finalTarget);
  same(readContext(memory,rootStep.continuation).current,finalMap,
    "universal Rule chain yields exact final homomorphic mapping");

  return finalTarget;
}

function exercise(noise:boolean):void{
  const memory=new Memory();
  const b=ensureRootBasis(memory);
  const C=b.C;
  if(noise)memory.ensure(memory.ensure(b.U,b.C),memory.ensure(b.O,b.L));

  const fresh:LinkHandle[]=[];
  let seed=memory.ensure(b.U,b.L);
  for(let i=0;i<44;i+=1){
    seed=memory.ensure(seed,i%2===0?b.O:b.C);
    fresh.push(seed);
  }
  const at=(i:number):LinkHandle=>{
    const value=fresh[i];
    assert(value!==undefined,`fresh anchor ${i}`);
    return value;
  };

  const theory=memory.ensure(at(0),at(1));
  const rules=defineUniversalAspectRules(memory,theory,b,at(2));
  const interpreter=defineStructuralInterpreter(memory,at(3),at(4),theory);
  const entry=defineContext(memory,C,interpreter);

  // ROOT universal Rule is independent of any template-specific node identity.
  const rootCaller=defineContext(memory,entry,at(5));
  const rootRequest=defineContext(memory,rootCaller,memory.root);
  const rootStep=executeRule(memory,C,rootRequest);
  same(rootStep.rule,rules.root,"universal ROOT Rule selected");
  same(
    readContext(memory,rootStep.continuation).current,
    memory.ensure(memory.root,memory.root),
    "ROOT Rule yields exact ROOT mapping fact",
  );
  memory.ensureEndSelfClosed(rootStep.continuation);

  // Same universal Rule set handles two distinct source templates with opposite
  // START/END wrapper order.
  const sourceA=defineTemplateChain(memory,b,at(6),"START_END");
  const sourceB=defineTemplateChain(memory,b,at(7),"END_START");

  const xA=memory.ensure(at(8),at(9));
  const yA=memory.ensure(at(10),at(11));
  const xB=memory.ensure(at(12),at(13));
  const yB=memory.ensure(at(14),at(15));

  const finalA=exerciseChain(memory,C,entry,rules,sourceA,xA,yA);
  const finalB=exerciseChain(memory,C,entry,rules,sourceB,xB,yB);

  const expectedA=memory.ensureEndSelfClosed(
    memory.ensureStartSelfClosed(memory.ensure(xA,yA)),
  );
  const expectedB=memory.ensureStartSelfClosed(
    memory.ensureEndSelfClosed(memory.ensure(xB,yB)),
  );
  same(finalA,expectedA,"template A exact homomorphic target");
  same(finalB,expectedB,"template B exact homomorphic target");

  // Universal Rule definitions are shared; no source-specific Rule was added.
  const admitted=[...memory.outgoing(theory)].filter(link=>{
    const p=memory.poles(link);
    return p.start===theory&&p.end!==link;
  });
  same(admitted.length,4,"exactly four universal aspect Rules admitted");

  // The diagnostic parent-promotion calls, not Rule semantics, are now the
  // remaining template-specific orchestration.
}

function sourceSlice(source:string,start:string,end:string):string{
  const i=source.indexOf(start),j=source.indexOf(end,i+1);
  assert(i>=0&&j>i,`source slice ${start}`);
  return source.slice(i,j).replace(/\s+/g,"");
}

function staticGuards():void{
  const root=resolve(process.cwd(),"..");
  const own=readFileSync(
    join(root,"ts/test/research-v013-universal-aspect-dataflow-a71o.test.ts"),
    "utf8",
  );
  const a71n=readFileSync(
    join(root,"ts/test/research-v013-rule-driven-homomorphism-dataflow-a71n.test.ts"),
    "utf8",
  );

  const rules=sourceSlice(
    own,
    "function defineUniversalAspectRules(",
    "\ninterface GroundedConstructiveRule",
  );
  for(const forbidden of [
    "TemplateChain",
    "sourceA",
    "sourceB",
    "pairSource",
    "startSource",
    "endSource",
    "stage",
  ]){
    assert(!rules.includes(forbidden),
      `A71o universal Rules exclude template-specific selector ${forbidden}`);
  }

  const promotion=sourceSlice(
    own,
    "function promoteToParentReadyRequest(",
    "\nfunction expectNoRule(",
  );
  assert(promotion.includes("sourceParent:LinkHandle"),
    "A71o diagnostic promotion exposes exact source-parent residual");

  const chain=sourceSlice(
    own,
    "function exerciseChain(",
    "\nfunction exercise(",
  );
  assert(chain.includes("expectNoRule("),
    "A71o proves natural mapping state stalls before parent request injection");
  assert(chain.includes("promoteToParentReadyRequest("),
    "A71o explicitly marks host parent-ready promotion boundary");

  assert(a71n.includes("HOST_TEMPLATE_NODE_SCHEDULER=0"),
    "A71o starts after A71n scheduler removal");
  assert(a71n.includes("RULE_NETWORK_AUTHORING_FROM_TEMPLATE=RESIDUAL"),
    "A71o attacks exact A71n Rule-network authoring residual");
}

function main():void{
  exercise(false);
  exercise(true);
  staticGuards();

  console.log([
    "MTS v0.13 A71o: UNIVERSAL_ASPECT_RULES_PARENT_DISCOVERY_RED=GREEN_RED_SCOPED_RESEARCH",
    "UNIVERSAL_ROOT_RULE=GREEN",
    "UNIVERSAL_PAIR_RULE=GREEN",
    "UNIVERSAL_START_RULE=GREEN",
    "UNIVERSAL_END_RULE=GREEN",
    "TWO_DISTINCT_TEMPLATES=SAME_FOUR_RULES",
    "TEMPLATE_SPECIFIC_RULE_NETWORK_AUTHORING=0",
    "FINAL_IMAGES=EXACT_HOMOMORPHIC_TARGETS",
    "ACTIVE_MAPPING_FACT_ALONE_TO_PARENT_READY_REQUEST=RED",
    "SOURCE_PARENT_PHYSICALLY_ADJACENT=YES",
    "GENERIC_RULE_EXECUTOR_READS_PARENT_ADJACENCY=NO",
    "HOST_SOURCE_PARENT_ARGUMENT_REQUIRED=YES",
    "HOST_PARENT_READY_REQUEST_PRODUCTION=RESIDUAL",
    "RULE_SEMANTICS=GENERIC",
    "SCHEDULER_READY_SET=0",
    "EXACT_RESIDUAL=SOURCE_PARENT_DEPENDENCY_DISCOVERY_REACTION",
    "NEXT=A71P_CONTEXT_NATIVE_SOURCE_PARENT_REACTION_OR_ACCEPT_SUBSTRATE_PRIMITIVE",
    "FULL_SELF_HOSTED=FALSE",
    "V013_NOT_ACCEPTED PRODUCTION_UNCHANGED",
  ].join(" "));
}

main();
