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
import { unifyStructuralTemplate } from "../src/structural-unification.js";
import { defineContext, readContext } from "../src/state.js";

function assert(c:unknown,m:string):asserts c{
  if(!c)throw new Error(`v0.13 A71o aspect-unifier boundary: ${m}`);
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
 * Candidate universal aspect Rules. They contain no concrete source-template
 * node identity and no RuleKind/opcode tag.
 */
function defineUniversalAspectRules(
  memory:Memory,
  theory:LinkHandle,
  b:RootBasis,
  seed:LinkHandle,
):UniversalRules{
  const kr=memory.ensure(seed,b.O);
  const dr=defineStructuralRoleDictionary(memory,[kr]);
  const rootInput=memory.ensure(kr,memory.root);
  const rootOutput=memory.ensure(
    kr,
    memory.ensure(memory.root,memory.root),
  );
  const rootRule=defineStructuralRule(
    memory,dr,memory.ensure(rootInput,rootOutput),
  );
  admitStructuralRule(memory,theory,rootRule);

  const kp=memory.ensure(seed,b.C);
  const a=memory.ensure(seed,b.O);
  const bb=memory.ensure(seed,b.L);
  const ai=memory.ensure(seed,b.U);
  const bi=memory.ensure(seed,memory.root);
  const dp=defineStructuralRoleDictionary(memory,[kp,a,bb,ai,bi]);
  const sourcePair=memory.ensure(a,bb);
  const mapA=memory.ensure(a,ai);
  const mapB=memory.ensure(bb,bi);
  const pairInput=memory.ensure(
    kp,
    memory.ensure(sourcePair,memory.ensure(mapA,mapB)),
  );
  const pairOutput=memory.ensure(
    kp,
    memory.ensure(sourcePair,memory.ensure(ai,bi)),
  );
  const pairRule=defineStructuralRule(
    memory,dp,memory.ensure(pairInput,pairOutput),
  );
  admitStructuralRule(memory,theory,pairRule);

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
  const startRule=defineStructuralRule(
    memory,ds,memory.ensure(startInput,startOutput),
  );
  admitStructuralRule(memory,theory,startRule);

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

interface RuleMatch{
  readonly rule:LinkHandle;
  readonly bindings:readonly StructuralRoleBinding[];
}

function matchingRulesCurrentUnifier(
  memory:Memory,
  theory:LinkHandle,
  requestContext:LinkHandle,
):readonly RuleMatch[]{
  const state=readContext(memory,requestContext);
  const claimed=memory.poles(requestContext).end;
  const cp=memory.poles(claimed);
  same(cp.start,state.parent,"request payload caller");
  same(cp.end,state.current,"request payload current");

  const matches:RuleMatch[]=[];
  for(const admission of memory.outgoing(theory)){
    const ap=memory.poles(admission);
    if(ap.start!==theory||ap.end===admission)continue;
    const ruleHandle=ap.end;
    try{
      verifyStructuralRuleAdmission(memory,theory,ruleHandle,admission);
      const rule=readStructuralRule(memory,ruleHandle);
      const dictionary=readStructuralRoleDictionary(memory,rule.roleDictionary);
      const body=memory.poles(rule.body);
      const bindings=unifyStructuralTemplate(
        memory,body.start,claimed,dictionary.roles,
      );
      matches.push(Object.freeze({rule:ruleHandle,bindings}));
    }catch(error){
      if(error instanceof StructuralRuleError)continue;
      throw error;
    }
  }
  return Object.freeze(matches);
}

/**
 * Diagnostic control only.
 *
 * This is the current structural unifier plus one generic invariant:
 *
 *   source.startSelf == claimed.startSelf
 *   source.endSelf   == claimed.endSelf
 *
 * at every non-role node.
 *
 * There is no ROOT/START/END/PAIR branch or tag.
 */
function unifyWithSelfIncidenceParity(
  memory:Memory,
  template:LinkHandle,
  claimed:LinkHandle,
  roles:readonly LinkHandle[],
):readonly StructuralRoleBinding[]{
  assert(new Set(roles).size===roles.length,"roles unique");

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

      // The only difference from current production unification.
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
    same(memory.linkCount,before,"strict unifier is read-only");
  }
}

function matchingRulesParityControl(
  memory:Memory,
  theory:LinkHandle,
  requestContext:LinkHandle,
):readonly RuleMatch[]{
  const state=readContext(memory,requestContext);
  const claimed=memory.poles(requestContext).end;
  const cp=memory.poles(claimed);
  same(cp.start,state.parent,"parity request payload caller");
  same(cp.end,state.current,"parity request payload current");

  const matches:RuleMatch[]=[];
  for(const admission of memory.outgoing(theory)){
    const ap=memory.poles(admission);
    if(ap.start!==theory||ap.end===admission)continue;
    const ruleHandle=ap.end;
    try{
      const rule=readStructuralRule(memory,ruleHandle);
      const dictionary=readStructuralRoleDictionary(memory,rule.roleDictionary);
      const body=memory.poles(rule.body);
      const bindings=unifyWithSelfIncidenceParity(
        memory,body.start,claimed,dictionary.roles,
      );
      matches.push(Object.freeze({rule:ruleHandle,bindings}));
    }catch(error){
      if(error instanceof StructuralRuleError)continue;
      throw error;
    }
  }
  return Object.freeze(matches);
}

function rootRequest(memory:Memory,caller:LinkHandle):LinkHandle{
  return defineContext(memory,caller,memory.root);
}

function pairReadyRequest(
  memory:Memory,
  caller:LinkHandle,
  a:LinkHandle,
  b:LinkHandle,
  ai:LinkHandle,
  bi:LinkHandle,
):LinkHandle{
  const source=memory.ensure(a,b);
  const mapA=memory.ensure(a,ai);
  const mapB=memory.ensure(b,bi);
  return defineContext(
    memory,caller,memory.ensure(source,memory.ensure(mapA,mapB)),
  );
}

function startReadyRequest(
  memory:Memory,
  caller:LinkHandle,
  a:LinkHandle,
  ai:LinkHandle,
):LinkHandle{
  const source=memory.ensureStartSelfClosed(a);
  return defineContext(
    memory,caller,memory.ensure(source,memory.ensure(a,ai)),
  );
}

function endReadyRequest(
  memory:Memory,
  caller:LinkHandle,
  a:LinkHandle,
  ai:LinkHandle,
):LinkHandle{
  const source=memory.ensureEndSelfClosed(a);
  return defineContext(
    memory,caller,memory.ensure(source,memory.ensure(a,ai)),
  );
}

function exercise(noise:boolean):void{
  const memory=new Memory();
  const b=ensureRootBasis(memory);
  if(noise)memory.ensure(memory.ensure(b.U,b.C),memory.ensure(b.O,b.L));

  const fresh:LinkHandle[]=[];
  let seed=memory.ensure(b.U,b.L);
  for(let i=0;i<28;i+=1){
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
  const caller=defineContext(memory,b.C,at(3));

  const rootQ=rootRequest(memory,caller);
  const pairQ=pairReadyRequest(
    memory,caller,at(4),at(5),at(6),at(7),
  );
  const startQ=startReadyRequest(memory,caller,at(8),at(9));
  const endQ=endReadyRequest(memory,caller,at(10),at(11));

  // Current production unifier does not preserve self-incidence topology.
  // ROOT is the sharpest falsifier: every universal aspect Rule matches.
  const currentRoot=matchingRulesCurrentUnifier(memory,theory,rootQ);
  setSame(
    currentRoot.map(x=>x.rule),
    [rules.root,rules.pair,rules.start,rules.end],
    "current unifier makes ROOT ambiguous across all aspect Rules",
  );

  // Therefore universal aspect Rule classification is RED before dependency
  // parent-reaction can even be tested.
  assert(currentRoot.length!==1,
    "current unifier cannot uniquely classify ROOT aspect");

  // Diagnostic single-law control: exact two-bit self-incidence parity makes
  // all four candidate aspect Rules mutually exclusive without a kind switch.
  const strictRoot=matchingRulesParityControl(memory,theory,rootQ);
  const strictPair=matchingRulesParityControl(memory,theory,pairQ);
  const strictStart=matchingRulesParityControl(memory,theory,startQ);
  const strictEnd=matchingRulesParityControl(memory,theory,endQ);

  setSame(strictRoot.map(x=>x.rule),[rules.root],
    "self-incidence parity uniquely classifies ROOT");
  setSame(strictPair.map(x=>x.rule),[rules.pair],
    "self-incidence parity uniquely classifies PAIR");
  setSame(strictStart.map(x=>x.rule),[rules.start],
    "self-incidence parity uniquely classifies START");
  setSame(strictEnd.map(x=>x.rule),[rules.end],
    "self-incidence parity uniquely classifies END");

  // The diagnostic law is topology-only and read-only. It adds no aspect tag,
  // RuleKind, opcode or basis-name test.
  const beforeReplay=memory.linkCount;
  matchingRulesParityControl(memory,theory,rootQ);
  matchingRulesParityControl(memory,theory,pairQ);
  matchingRulesParityControl(memory,theory,startQ);
  matchingRulesParityControl(memory,theory,endQ);
  same(memory.linkCount,beforeReplay,"parity classification replay read-only");
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
  const production=readFileSync(
    join(root,"ts/src/structural-unification.ts"),
    "utf8",
  );
  const a71n=readFileSync(
    join(root,"ts/test/research-v013-rule-driven-homomorphism-dataflow-a71n.test.ts"),
    "utf8",
  );

  const parity=sourceSlice(
    own,
    "function unifyWithSelfIncidenceParity(",
    "\nfunction matchingRulesParityControl(",
  );
  for(const forbidden of [
    "ROOT",
    "START",
    "END",
    "PAIR",
    "RuleKind",
    "opcode",
    "basis",
    "switch(",
  ]){
    assert(!parity.includes(forbidden),
      `A71o parity law excludes aspect semantic selector ${forbidden}`);
  }
  assert(parity.includes("(lp.start===left)!==(rp.start===right)"),
    "parity law compares START self-incidence bit generically");
  assert(parity.includes("(lp.end===left)!==(rp.end===right)"),
    "parity law compares END self-incidence bit generically");

  assert(!production.includes("(leftPoles.start === left) !== (rightPoles.start === right)"),
    "production unifier currently lacks self-incidence parity guard");
  assert(!production.includes("(lp.start===left)!==(rp.start===right)"),
    "production unifier does not already contain A71o diagnostic law");

  assert(a71n.includes("RULE_NETWORK_AUTHORING_FROM_TEMPLATE=RESIDUAL"),
    "A71o starts from exact A71n universalization boundary");
}

function main():void{
  exercise(false);
  exercise(true);
  staticGuards();

  console.log([
    "MTS v0.13 A71o: UNIVERSAL_ASPECT_RULES_CURRENT_UNIFIER=RED_SCOPED_RESEARCH",
    "CANDIDATE_UNIVERSAL_RULES=ROOT_START_END_PAIR",
    "CURRENT_UNIFIER_SELF_INCIDENCE_PRESERVATION=NO",
    "ROOT_REQUEST_MATCHES_ALL_FOUR_RULES=YES",
    "UNIVERSAL_ASPECT_CLASSIFICATION=AMBIGUOUS",
    "SELF_INCIDENCE_PARITY_CONTROL=GREEN",
    "PARITY_CONTROL_ROOT=UNIQUE",
    "PARITY_CONTROL_START=UNIQUE",
    "PARITY_CONTROL_END=UNIQUE",
    "PARITY_CONTROL_PAIR=UNIQUE",
    "PARITY_LAW=EXACT_TWO_BOOLEAN_SELF_INCIDENCE_EQUALITY",
    "PARITY_LAW_ASPECT_SWITCH=0",
    "PARITY_LAW_WRITES=0",
    "SOURCE_PARENT_REACTION=NOT_REACHED",
    "TEMPLATE_SPECIFIC_RULE_NETWORK_AUTHORING=STILL_RESIDUAL",
    "EXACT_MISSING_CAPABILITY=ASPECT_PRESERVING_GENERIC_UNIFICATION",
    "NEXT=A71P_ASPECT_PRESERVING_UNIFIER_COMPATIBILITY",
    "FULL_SELF_HOSTED=FALSE",
    "V013_NOT_ACCEPTED PRODUCTION_UNCHANGED",
  ].join(" "));
}

main();
