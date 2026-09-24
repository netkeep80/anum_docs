import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import {
  Memory,
  MemoryError,
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
import { defineContext, readContext } from "../src/state.js";

function assert(c:unknown,m:string):asserts c{
  if(!c)throw new Error("v0.13 A71r occurrence-driven unary reaction: "+m);
}
function same<T>(a:T,e:T,m:string):void{
  assert(Object.is(a,e),m+": values differ");
}
/**
 * Source-identical A71p strict Rule matcher.
 *
 * Projection unification remains unchanged; Rule matching preserves both
 * self-incidence bits at every non-role template node.
 */
function unifyRuleTemplate(
  memory:Memory,
  template:LinkHandle,
  claimed:LinkHandle,
  roles:readonly LinkHandle[],
):readonly StructuralRoleBinding[]{
  if(new Set(roles).size!==roles.length){
    throw new StructuralRuleError("duplicate-role");
  }

  const before=memory.linkCount;
  const roleSet=new Set(roles);
  const inferred=new Map<LinkHandle,LinkHandle>();
  const containsMemo=new Map<LinkHandle,boolean>();
  const containsActive=new Set<LinkHandle>();

  const containsRole=(node:LinkHandle):boolean=>{
    if(roleSet.has(node))return true;
    const cached=containsMemo.get(node);
    if(cached!==undefined)return cached;
    if(containsActive.has(node))return false;
    containsActive.add(node);
    try{
      const p=memory.poles(node);
      const result=containsRole(p.start)||containsRole(p.end);
      containsMemo.set(node,result);
      return result;
    }finally{
      containsActive.delete(node);
    }
  };

  const visited=new Map<LinkHandle,Set<LinkHandle>>();
  const markVisited=(left:LinkHandle,right:LinkHandle):boolean=>{
    let rights=visited.get(left);
    if(rights===undefined){
      rights=new Set<LinkHandle>();
      visited.set(left,rights);
    }
    if(rights.has(right))return true;
    rights.add(right);
    return false;
  };

  const unify=(left:LinkHandle,right:LinkHandle):void=>{
    if(roleSet.has(left)){
      const previous=inferred.get(left);
      if(previous!==undefined&&previous!==right){
        throw new StructuralRuleError("template-mismatch");
      }
      inferred.set(left,right);
      return;
    }

    if(!containsRole(left)){
      if(left!==right)throw new StructuralRuleError("template-mismatch");
      return;
    }

    if(markVisited(left,right))return;

    try{
      const lp=memory.poles(left);
      const rp=memory.poles(right);

      if(
        (lp.start===left)!==(rp.start===right) ||
        (lp.end===left)!==(rp.end===right)
      ){
        throw new StructuralRuleError("template-mismatch");
      }

      unify(lp.start,rp.start);
      unify(lp.end,rp.end);
    }catch(error){
      if(error instanceof StructuralRuleError)throw error;
      if(error instanceof MemoryError){
        throw new StructuralRuleError("template-mismatch");
      }
      throw error;
    }
  };

  try{
    unify(template,claimed);
    return Object.freeze(roles.map((role)=>{
      const value=inferred.get(role);
      if(value===undefined)throw new StructuralRuleError("missing-role-binding");
      return Object.freeze({role,value});
    }));
  }finally{
    same(memory.linkCount,before,"Rule matching is read-only");
  }
}

interface OccurrencePath{
  readonly rootOccurrence:LinkHandle;
  readonly parentOccurrence:LinkHandle;
  readonly childOccurrence:LinkHandle;
  readonly mappingContext:LinkHandle;
}

function carrySourceOccurrence(
  memory:Memory,
  contextRoot:LinkHandle,
  templateRoot:LinkHandle,
  selectedParent:LinkHandle,
  selectedChild:LinkHandle,
  mappingFact:LinkHandle,
):OccurrencePath{
  const rootOccurrence=defineContext(memory,contextRoot,templateRoot);
  const parentOccurrence=defineContext(memory,rootOccurrence,selectedParent);
  const childOccurrence=defineContext(memory,parentOccurrence,selectedChild);
  const mappingContext=defineContext(memory,childOccurrence,mappingFact);

  return Object.freeze({
    rootOccurrence,
    parentOccurrence,
    childOccurrence,
    mappingContext,
  });
}

interface SelectedParent{
  readonly child:LinkHandle;
  readonly parent:LinkHandle;
  readonly mappingFact:LinkHandle;
}

/**
 * Source-identical A71q occurrence authority.
 *
 * No incoming/outgoing/global scan participates.
 */
function selectedParentFromOccurrence(
  memory:Memory,
  mappingContext:LinkHandle,
):SelectedParent{
  const mappingState=readContext(memory,mappingContext);
  const childOccurrence=mappingState.parent;
  const childState=readContext(memory,childOccurrence);
  const parentOccurrence=childState.parent;
  const parentState=readContext(memory,parentOccurrence);

  const child=childState.current;
  const parent=parentState.current;
  const p=memory.poles(parent);

  assert(
    p.start===child || p.end===child,
    "Context-selected parent is structurally adjacent to selected child",
  );

  return Object.freeze({
    child,
    parent,
    mappingFact:mappingState.current,
  });
}

interface ParentReadyRequest{
  readonly parentOccurrence:LinkHandle;
  readonly parent:LinkHandle;
  readonly child:LinkHandle;
  readonly image:LinkHandle;
  readonly mappingFact:LinkHandle;
  readonly requestCurrent:LinkHandle;
  readonly requestContext:LinkHandle;
}

/**
 * Lift one grounded child mapping to the selected unary parent occurrence.
 *
 * Authority is only the current mapping Context ancestry. The source parent is
 * not supplied by the host and is never searched through ambient adjacency.
 */
function deriveParentReadyRequest(
  memory:Memory,
  mappingContext:LinkHandle,
):ParentReadyRequest{
  const selected=selectedParentFromOccurrence(memory,mappingContext);
  const mappingState=readContext(memory,mappingContext);
  const childOccurrence=mappingState.parent;
  const childState=readContext(memory,childOccurrence);
  const parentOccurrence=childState.parent;

  const map=memory.poles(selected.mappingFact);
  same(map.start,selected.child,"mapping fact source is selected child");

  const requestCurrent=memory.ensure(selected.parent,selected.mappingFact);
  const requestContext=defineContext(memory,parentOccurrence,requestCurrent);

  return Object.freeze({
    parentOccurrence,
    parent:selected.parent,
    child:selected.child,
    image:map.end,
    mappingFact:selected.mappingFact,
    requestCurrent,
    requestContext,
  });
}

interface UniversalUnaryRules{
  readonly start:LinkHandle;
  readonly end:LinkHandle;
}

/**
 * Universal unary homomorphism Rules:
 *
 *   K -> (START(A) -> (A -> A'))  => K -> (START(A) -> START(A'))
 *   K -> (END(A)   -> (A -> A'))  => K -> (END(A)   -> END(A'))
 *
 * No concrete source-template identity is embedded in either Rule.
 */
function defineUniversalUnaryRules(
  memory:Memory,
  theory:LinkHandle,
  b:RootBasis,
  seed:LinkHandle,
):UniversalUnaryRules{
  const ks=memory.ensure(seed,memory.ensure(b.O,b.C));
  const sa=memory.ensure(seed,memory.ensure(b.C,b.L));
  const sai=memory.ensure(seed,memory.ensure(b.L,b.U));
  const ds=defineStructuralRoleDictionary(memory,[ks,sa,sai]);
  const sourceStart=memory.ensureStartSelfClosed(sa);
  const startInput=memory.ensure(
    ks,
    memory.ensure(sourceStart,memory.ensure(sa,sai)),
  );
  const startOutput=memory.ensure(
    ks,
    memory.ensure(sourceStart,memory.ensureStartSelfClosed(sai)),
  );
  const start=defineStructuralRule(
    memory,ds,memory.ensure(startInput,startOutput),
  );
  admitStructuralRule(memory,theory,start);

  const ke=memory.ensure(seed,memory.ensure(b.C,b.O));
  const ea=memory.ensure(seed,memory.ensure(b.L,b.C));
  const eai=memory.ensure(seed,memory.ensure(b.U,b.L));
  const de=defineStructuralRoleDictionary(memory,[ke,ea,eai]);
  const sourceEnd=memory.ensureEndSelfClosed(ea);
  const endInput=memory.ensure(
    ke,
    memory.ensure(sourceEnd,memory.ensure(ea,eai)),
  );
  const endOutput=memory.ensure(
    ke,
    memory.ensure(sourceEnd,memory.ensureEndSelfClosed(eai)),
  );
  const end=defineStructuralRule(
    memory,de,memory.ensure(endInput,endOutput),
  );
  admitStructuralRule(memory,theory,end);

  return Object.freeze({start,end});
}

interface GroundedUnaryRule{
  readonly rule:LinkHandle;
  readonly outputTemplate:LinkHandle;
  readonly bindings:readonly StructuralRoleBinding[];
}

function discoverGroundedUnaryRule(
  memory:Memory,
  theory:LinkHandle,
  requestContext:LinkHandle,
):GroundedUnaryRule{
  const state=readContext(memory,requestContext);
  const claimed=memory.poles(requestContext).end;
  const cp=memory.poles(claimed);
  same(cp.start,state.parent,"parent-ready request caller");
  same(cp.end,state.current,"parent-ready request current");

  const matches:GroundedUnaryRule[]=[];
  for(const admission of memory.outgoing(theory)){
    const ap=memory.poles(admission);
    if(ap.start!==theory||ap.end===admission)continue;
    const ruleHandle=ap.end;

    try{
      verifyStructuralRuleAdmission(memory,theory,ruleHandle,admission);
      const rule=readStructuralRule(memory,ruleHandle);
      const dictionary=readStructuralRoleDictionary(memory,rule.roleDictionary);
      const body=memory.poles(rule.body);
      const bindings=unifyRuleTemplate(
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

  same(matches.length,1,"exactly one universal unary Rule matches occurrence request");
  return matches[0]!;
}

function instantiateStructuralTemplate(
  memory:Memory,
  template:LinkHandle,
  bindings:readonly StructuralRoleBinding[],
):LinkHandle{
  const mapping=new Map<LinkHandle,LinkHandle>();
  for(const item of bindings){
    const previous=mapping.get(item.role);
    if(previous!==undefined)same(previous,item.value,"role binding consistent");
    else mapping.set(item.role,item.value);
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

interface UnaryReactionResult{
  readonly rule:LinkHandle;
  readonly outputTruth:LinkHandle;
  readonly continuationContext:LinkHandle;
}

function executeUnaryParentReaction(
  memory:Memory,
  theory:LinkHandle,
  requestContext:LinkHandle,
):UnaryReactionResult{
  const request=readContext(memory,requestContext);
  const grounded=discoverGroundedUnaryRule(memory,theory,requestContext);
  const outputTruth=instantiateStructuralTemplate(
    memory,grounded.outputTemplate,grounded.bindings,
  );
  const output=memory.poles(outputTruth);
  same(output.start,request.parent,"Rule output returns to selected parent occurrence");

  const continuationContext=memory.ensureStartSelfClosed(outputTruth);
  const state=readContext(memory,continuationContext);
  same(state.parent,request.parent,"parent mapping keeps recursive occurrence caller");
  same(state.current,output.end,"parent mapping becomes continuation current");

  return Object.freeze({
    rule:grounded.rule,
    outputTruth,
    continuationContext,
  });
}

function exercise(noise:boolean):void{
  const memory=new Memory();
  const b=ensureRootBasis(memory);
  const C=b.C;
  if(noise)memory.ensure(memory.ensure(b.U,b.C),memory.ensure(b.O,b.L));

  const fresh:LinkHandle[]=[];
  let seed=memory.ensure(b.U,b.L);
  for(let i=0;i<28;i+=1){
    seed=memory.ensure(seed,i%2===0?b.O:b.C);
    fresh.push(seed);
  }
  const at=(i:number):LinkHandle=>{
    const value=fresh[i];
    assert(value!==undefined,"fresh anchor "+i);
    return value;
  };

  const theory=memory.ensure(at(0),at(1));
  const rules=defineUniversalUnaryRules(memory,theory,b,at(2));

  // Same physical child/mapping fact participates in two source templates.
  const sharedChild=memory.ensure(at(3),at(4));
  const startParent=memory.ensureStartSelfClosed(sharedChild);
  const endParent=memory.ensureEndSelfClosed(sharedChild);
  const templateRootA=memory.ensureEndSelfClosed(startParent);
  const templateRootB=memory.ensureStartSelfClosed(endParent);
  const image=memory.ensure(at(5),at(6));
  const mappingFact=memory.ensure(sharedChild,image);

  const pathA=carrySourceOccurrence(
    memory,C,templateRootA,startParent,sharedChild,mappingFact,
  );
  const pathB=carrySourceOccurrence(
    memory,C,templateRootB,endParent,sharedChild,mappingFact,
  );

  const readyA=deriveParentReadyRequest(memory,pathA.mappingContext);
  const readyB=deriveParentReadyRequest(memory,pathB.mappingContext);

  same(readyA.parent,startParent,"A occurrence derives START parent");
  same(readyB.parent,endParent,"B occurrence derives END parent");
  same(readyA.parentOccurrence,pathA.parentOccurrence,"A exact parent occurrence");
  same(readyB.parentOccurrence,pathB.parentOccurrence,"B exact parent occurrence");
  same(readyA.mappingFact,mappingFact,"A carries exact child mapping");
  same(readyB.mappingFact,mappingFact,"B carries same child mapping");

  // Ambient third parent is deliberately added after request derivation. It is
  // not consulted by occurrence reaction and must not perturb results.
  memory.ensure(sharedChild,at(7));

  const resultA=executeUnaryParentReaction(memory,theory,readyA.requestContext);
  const resultB=executeUnaryParentReaction(memory,theory,readyB.requestContext);

  same(resultA.rule,rules.start,"strict topology selects universal START Rule");
  same(resultB.rule,rules.end,"strict topology selects universal END Rule");

  const startImage=memory.ensureStartSelfClosed(image);
  const endImage=memory.ensureEndSelfClosed(image);
  const startFact=memory.ensure(startParent,startImage);
  const endFact=memory.ensure(endParent,endImage);

  same(readContext(memory,resultA.continuationContext).current,startFact,
    "START parent maps to START child image");
  same(readContext(memory,resultB.continuationContext).current,endFact,
    "END parent maps to END child image");

  // A distinct source template proves the START Rule is not tied to template A.
  const otherChild=memory.ensure(at(8),at(9));
  const otherStartParent=memory.ensureStartSelfClosed(otherChild);
  const otherTemplateRoot=memory.ensureEndSelfClosed(otherStartParent);
  const otherImage=memory.ensure(at(10),at(11));
  const otherMappingFact=memory.ensure(otherChild,otherImage);
  const pathC=carrySourceOccurrence(
    memory,C,otherTemplateRoot,otherStartParent,otherChild,otherMappingFact,
  );
  const readyC=deriveParentReadyRequest(memory,pathC.mappingContext);
  const resultC=executeUnaryParentReaction(memory,theory,readyC.requestContext);

  same(resultC.rule,rules.start,"same universal START Rule serves second template");
  const otherStartFact=memory.ensure(
    otherStartParent,memory.ensureStartSelfClosed(otherImage),
  );
  same(readContext(memory,resultC.continuationContext).current,otherStartFact,
    "second template receives exact START parent image");

  // The continuation Context has the same recursive shape required to use the
  // newly mapped parent as the selected child occurrence of the next level.
  same(readContext(memory,resultA.continuationContext).parent,pathA.parentOccurrence,
    "A parent mapping continuation is attached to parent occurrence");
  same(readContext(memory,resultB.continuationContext).parent,pathB.parentOccurrence,
    "B parent mapping continuation is attached to parent occurrence");
}

function sourceSlice(source:string,start:string,end:string):string{
  const i=source.indexOf(start),j=source.indexOf(end,i+1);
  assert(i>=0&&j>i,"source slice "+start);
  return source.slice(i,j).replace(/\s+/g,"");
}

function staticGuards():void{
  const root=resolve(process.cwd(),"..");
  const own=readFileSync(
    join(root,"ts/test/research-v013-occurrence-driven-unary-parent-reaction-a71r.test.ts"),
    "utf8",
  );
  const a71p=readFileSync(
    join(root,"ts/test/research-v013-aspect-preserving-rule-matcher-a71p.test.ts"),
    "utf8",
  );
  const a71q=readFileSync(
    join(root,"ts/test/research-v013-source-occurrence-authority-a71q.test.ts"),
    "utf8",
  );

  same(
    sourceSlice(own,"function unifyRuleTemplate(","\ninterface OccurrencePath"),
    sourceSlice(a71p,"function unifyRuleTemplate(","\nfunction expectMismatch("),
    "A71r Rule matching source-identical A71p",
  );
  same(
    sourceSlice(own,"function selectedParentFromOccurrence(","\ninterface ParentReadyRequest"),
    sourceSlice(a71q,"function selectedParentFromOccurrence(","\nfunction exercise("),
    "A71r occurrence authority source-identical A71q",
  );

  const derive=sourceSlice(
    own,"function deriveParentReadyRequest(","\ninterface UniversalUnaryRules",
  );
  for(const forbidden of [
    ".outgoing(",
    ".incoming(",
    "allLinks(",
    ".find(",
    "sourceParent",
    "templateRoot",
    "switch(",
  ]){
    assert(!derive.includes(forbidden),
      "A71r parent-ready derivation excludes host/ambient selector "+forbidden);
  }
  assert(derive.includes("selectedParentFromOccurrence(memory,mappingContext)"),
    "A71r derives source parent from Context occurrence authority");

  const universal=sourceSlice(
    own,"function defineUniversalUnaryRules(","\ninterface GroundedUnaryRule",
  );
  for(const forbidden of [
    "templateRoot",
    "selectedParent",
    "RuleKind",
    "opcode",
    "switch(",
  ]){
    assert(!universal.includes(forbidden),
      "A71r universal unary Rules exclude template-specific selector "+forbidden);
  }

  const discovery=sourceSlice(
    own,"function discoverGroundedUnaryRule(","\nfunction instantiateStructuralTemplate(",
  );
  assert(discovery.includes("memory.outgoing(theory)"),
    "A71r Rule candidates come from Theory admissions");
  assert(discovery.includes("unifyRuleTemplate("),
    "A71r Rule choice uses strict aspect-preserving matching");
  assert(!discovery.includes("rules.start")&&!discovery.includes("rules.end"),
    "A71r executor does not host-select START versus END Rule");

  assert(a71p.includes("PROJECTION_VS_RULE_MATCHING_SPLIT=GREEN_SCOPED_RESEARCH"),
    "A71r starts after A71p strict Rule matching GREEN");
  assert(a71q.includes("CONTEXT_ANCESTRY_SELECTS_EXACT_PARENT=GREEN_CONTROL"),
    "A71r starts after A71q occurrence authority GREEN");
}

function main():void{
  exercise(false);
  exercise(true);
  staticGuards();

  console.log([
    "MTS v0.13 A71r: OCCURRENCE_DRIVEN_UNARY_PARENT_REACTION=GREEN_SCOPED_RESEARCH",
    "HOST_SOURCE_PARENT_ARGUMENT=0",
    "AMBIENT_PARENT_SCAN=0",
    "CONTEXT_ANCESTRY=CAUSAL_OCCURRENCE_AUTHORITY",
    "PARENT_READY_REQUEST=DERIVED_FROM_MAPPING_CONTEXT",
    "STRICT_ASPECT_RULE_MATCHING=GREEN",
    "UNIVERSAL_START_END_RULES=SHARED_ACROSS_TEMPLATES",
    "START_PARENT_REACTION=GREEN",
    "END_PARENT_REACTION=GREEN",
    "SAME_START_RULE_ACROSS_DISTINCT_TEMPLATES=GREEN",
    "AMBIENT_PARENT_NOISE=INERT",
    "PARENT_MAPPING_CONTINUATION=RECURSIVE_OCCURRENCE_SHAPE",
    "GLOBAL_PROPAGATE_ALL=0",
    "PAIR_BINARY_JOIN=OPEN_NOT_CLAIMED",
    "FULL_SELF_HOSTED=FALSE",
    "NEXT=A71S_PAIR_BINARY_CAUSAL_JOIN",
    "V013_NOT_ACCEPTED PRODUCTION_UNCHANGED",
  ].join(" "));
}

main();
