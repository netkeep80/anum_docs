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
  if(!c)throw new Error(`v0.13 A71g Rule-grounded PAIR classification: ${m}`);
}
function same<T>(a:T,e:T,m:string):void{
  assert(Object.is(a,e),`${m}: values differ`);
}
function setSame(actual:readonly LinkHandle[],expected:readonly LinkHandle[],m:string):void{
  same(new Set(actual).size,new Set(expected).size,`${m}: cardinality`);
  for(const x of expected)assert(actual.includes(x),`${m}: missing expected Link`);
}

interface RuleFixture{
  readonly rule:LinkHandle;
  readonly admission:LinkHandle;
  readonly roles:readonly LinkHandle[];
}
function definePairRequestRule(
  memory:Memory,
  theory:LinkHandle,
  b:RootBasis,
  seed:LinkHandle,
):RuleFixture{
  const kRole=memory.ensure(seed,b.O);
  const xRole=memory.ensure(seed,b.C);
  const yRole=memory.ensure(seed,b.L);
  const dictionary=defineStructuralRoleDictionary(memory,[kRole,xRole,yRole]);

  // Whole request-truth template:
  //
  //   Krole -> ((Krole->Xrole) -> (Krole->Yrole))
  //
  // Matching the whole START payload grounds the repeated Krole directly to
  // the activated request Context's caller.
  const leftTruth=memory.ensure(kRole,xRole);
  const rightTruth=memory.ensure(kRole,yRole);
  const request=memory.ensure(leftTruth,rightTruth);
  const requestTruth=memory.ensure(kRole,request);

  const rule=defineStructuralRule(memory,dictionary,requestTruth);
  const admission=admitStructuralRule(memory,theory,rule);
  return Object.freeze({
    rule,
    admission,
    roles:Object.freeze([kRole,xRole,yRole]),
  });
}
function defineDecoyRule(
  memory:Memory,
  theory:LinkHandle,
  b:RootBasis,
  seed:LinkHandle,
):RuleFixture{
  const kRole=memory.ensure(seed,b.U);
  const xRole=memory.ensure(seed,b.O);
  const yRole=memory.ensure(seed,b.C);
  const dictionary=defineStructuralRoleDictionary(memory,[kRole,xRole,yRole]);

  // Reverse each contextual truth. This is structurally close but must not
  // match K -> ((K->X)->(K->Y)).
  const left=memory.ensure(xRole,kRole);
  const right=memory.ensure(yRole,kRole);
  const body=memory.ensure(kRole,memory.ensure(left,right));
  const rule=defineStructuralRule(memory,dictionary,body);
  const admission=admitStructuralRule(memory,theory,rule);
  return Object.freeze({
    rule,
    admission,
    roles:Object.freeze([kRole,xRole,yRole]),
  });
}

interface GroundedRequestRule{
  readonly rule:LinkHandle;
  readonly admission:LinkHandle;
  readonly bindings:readonly StructuralRoleBinding[];
}

/**
 * Discover one admitted Structural Rule matching the exact START payload of an
 * already-active request Context.
 *
 * No Rule handle/opcode/RuleKind is selected by the host. The active Context
 * supplies claimed structure; Theory adjacency supplies candidate authority;
 * generic structural unification supplies role bindings.
 *
 * Theory itself is still an explicit authority input at this research boundary.
 */
function discoverGroundedRequestRule(
  memory:Memory,
  theory:LinkHandle,
  requestContext:LinkHandle,
):GroundedRequestRule{
  const state=readContext(memory,requestContext);
  const claimed=memory.poles(requestContext).end;
  const claimedPoles=memory.poles(claimed);
  same(claimedPoles.start,state.parent,
    "active request START payload starts at Context parent");
  same(claimedPoles.end,state.current,
    "active request START payload ends at Context current");

  const matches:GroundedRequestRule[]=[];
  for(const admission of memory.outgoing(theory)){
    const ap=memory.poles(admission);
    if(ap.start!==theory || ap.end===admission)continue;
    const ruleHandle=ap.end;

    try{
      verifyStructuralRuleAdmission(memory,theory,ruleHandle,admission);
      const rule=readStructuralRule(memory,ruleHandle);
      const dictionary=readStructuralRoleDictionary(memory,rule.roleDictionary);
      const bindings=unifyStructuralTemplate(
        memory,
        rule.body,
        claimed,
        dictionary.roles,
      );
      matches.push(Object.freeze({
        rule:ruleHandle,
        admission,
        bindings,
      }));
    }catch(error){
      if(error instanceof StructuralRuleError)continue;
      throw error;
    }
  }

  assert(matches.length===1,
    `exactly one admitted request Rule must match; got ${matches.length}`);
  return matches[0]!;
}

function pairRequestContext(
  memory:Memory,
  caller:LinkHandle,
  x:LinkHandle,
  y:LinkHandle,
):Readonly<{
  requestTruth:LinkHandle;
  requestContext:LinkHandle;
}>{
  const leftTruth=memory.ensure(caller,x);
  const rightTruth=memory.ensure(caller,y);
  const request=memory.ensure(leftTruth,rightTruth);
  const requestTruth=memory.ensure(caller,request);
  return Object.freeze({
    requestTruth,
    requestContext:memory.ensureStartSelfClosed(requestTruth),
  });
}

function exercise(noise:boolean):void{
  const memory=new Memory();
  const b=ensureRootBasis(memory);
  if(noise)memory.ensure(memory.ensure(b.U,b.C),memory.ensure(b.O,b.L));

  const fresh:LinkHandle[]=[];
  let seed=memory.ensure(b.U,b.L);
  for(let i=0;i<30;i+=1){
    seed=memory.ensure(seed,i%2===0?b.O:b.C);
    fresh.push(seed);
  }
  const at=(i:number):LinkHandle=>{
    const value=fresh[i];
    assert(value!==undefined,`fresh anchor ${i}`);
    return value;
  };

  const theory=memory.ensure(at(0),at(1));
  const pairRule=definePairRequestRule(memory,theory,b,at(2));
  defineDecoyRule(memory,theory,b,at(3));

  const caller=defineContext(memory,b.C,memory.ensure(at(4),at(5)));
  const x=memory.ensure(at(6),at(7));
  const y=memory.ensure(at(8),at(9));
  const request=pairRequestContext(memory,caller,x,y);
  same(readContext(memory,request.requestContext).parent,caller,
    "PAIR request Context caller");
  same(memory.poles(request.requestContext).end,request.requestTruth,
    "PAIR request Context exposes exact request truth payload");

  // Discovery is read-only and does not receive the expected Rule.
  const before=memory.linkCount;
  const match=discoverGroundedRequestRule(
    memory,
    theory,
    request.requestContext,
  );
  same(memory.linkCount,before,"Rule-grounded request discovery is read-only");
  same(match.rule,pairRule.rule,"exact admitted PAIR request Rule discovered");
  same(match.admission,pairRule.admission,"exact PAIR Rule admission discovered");

  // The three inferred values are caller/X/Y. The classifier does not receive
  // any of them as semantic operands.
  const values=match.bindings.map(binding=>binding.value);
  setSame(values,[caller,x,y],"generic unification infers caller and operands");

  // A structurally matching Rule that is physically present but not admitted
  // to the selected Theory is not semantic authority.
  const unadmitted=definePairRequestRule(
    memory,
    memory.ensure(at(10),at(11)),
    b,
    at(12),
  );
  same(readStructuralRule(memory,unadmitted.rule).body!==memory.root,true,
    "unadmitted matching Rule physically exists");
  const still=discoverGroundedRequestRule(memory,theory,request.requestContext);
  same(still.rule,pairRule.rule,"foreign-Theory matching Rule is inert");

  // An active Context whose current structure does not match any admitted Rule
  // fails closed instead of falling back to shape-specific host semantics.
  const ordinary=defineContext(
    memory,
    caller,
    memory.ensure(at(13),at(14)),
  );
  let noMatch=false;
  try{
    discoverGroundedRequestRule(memory,theory,ordinary);
  }catch{
    noMatch=true;
  }
  assert(noMatch,"ordinary active Context with no admitted Rule fails closed");

  // Literal L remains irrelevant. Rule meaning comes from Theory admission +
  // structural template, not from comparing a runtime value to root L.
  const lContext=defineContext(memory,caller,b.L);
  let lRejected=false;
  try{
    discoverGroundedRequestRule(memory,theory,lContext);
  }catch{
    lRejected=true;
  }
  assert(lRejected,"literal L current state has no magic PAIR classification");

  // Add a second separately-authored admitted Rule with the same request shape.
  // Generic discovery must fail ambiguity rather than choose by order.
  const secondMatching=definePairRequestRule(memory,theory,b,at(15));
  assert(secondMatching.rule!==pairRule.rule,
    "second matching Rule has distinct role dictionary identity");
  let ambiguous=false;
  try{
    discoverGroundedRequestRule(memory,theory,request.requestContext);
  }catch{
    ambiguous=true;
  }
  assert(ambiguous,"two admitted matching Rules fail closed as ambiguous");

  // The Rule itself does not yet say which semantic executor to invoke. This
  // experiment stops at grounded classification/binding on purpose.
}

function sourceSlice(source:string,start:string,end:string):string{
  const i=source.indexOf(start),j=source.indexOf(end,i+1);
  assert(i>=0&&j>i,`source slice ${start}`);
  return source.slice(i,j).replace(/\s+/g,"");
}

function staticGuards():void{
  const root=resolve(process.cwd(),"..");
  const own=readFileSync(
    join(root,"ts/test/research-v013-rule-grounded-pair-classification-a71g.test.ts"),
    "utf8",
  );
  const unification=readFileSync(
    join(root,"ts/src/structural-unification.ts"),
    "utf8",
  );
  const a63=readFileSync(
    join(root,"ts/test/research-v013-rule-self-realization-admission-a63.test.ts"),
    "utf8",
  );
  const contract=JSON.parse(readFileSync(
    join(root,"contracts/mts-contract-v0.13.json"),
    "utf8",
  ));

  const discovery=sourceSlice(
    own,
    "function discoverGroundedRequestRule(",
    "\nfunction pairRequestContext(",
  );
  for(const forbidden of [
    "RuleKind",
    "opcode",
    "basis.L",
    "switch(",
    "selectedRule",
    "expectedRule",
    "executePairRequests",
  ]){
    assert(!discovery.includes(forbidden),
      `A71g classifier excludes host semantic selector ${forbidden}`);
  }
  assert(discovery.includes("memory.outgoing(theory)"),
    "candidate Rules derive from selected Theory admissions");
  assert(discovery.includes("unifyStructuralTemplate("),
    "classification uses generic structural unification");
  assert(discovery.includes("matches.length===1"),
    "classification fails closed on zero/many admitted matches");

  assert(unification.includes(
    "This is deliberately projection-only. It does not find, ensure, materialize"
  ),"generic unification remains read-only projection");
  assert(a63.includes("HOST_RULE_KIND=0 HOST_OPCODE=0 HOST_WHITELIST=0"),
    "A71g inherits A63 Rule identity discipline");
  same(contract.rootAspectQuartet.operatorIsRootLinkAlias,false,
    "A71g preserves operator-not-root-link-alias law");
}

function main():void{
  exercise(false);
  exercise(true);
  staticGuards();

  console.log([
    "MTS v0.13 A71g: RULE_GROUNDED_PAIR_REQUEST_CLASSIFICATION=GREEN_SCOPED_RESEARCH",
    "ACTIVE_REQUEST_CLAIM=START_CONTEXT_PAYLOAD",
    "RULE_AUTHORITY=THEORY_TO_RULE_ADMISSION",
    "RULE_DISCOVERY=THEORY_INVENTORY_PLUS_GENERIC_UNIFICATION",
    "HOST_SELECTED_RULE=0",
    "HOST_RULE_KIND=0 HOST_OPCODE=0 HOST_WHITELIST=0",
    "ROOT_L_MAGIC_CLASSIFICATION=0",
    "ROLE_BINDINGS=CALLER_X_Y_INFERRED",
    "UNADMITTED_MATCHING_RULE=INERT",
    "ZERO_MATCH=FAIL_CLOSED",
    "MULTIPLE_ADMITTED_MATCHES=FAIL_CLOSED",
    "CLASSIFICATION_WRITES=0",
    "THEORY_AUTHORITY_ARGUMENT=RESIDUAL",
    "RULE_TO_SEMANTIC_EXECUTOR_MAPPING=RESIDUAL",
    "RULE_OUTPUT_REALIZATION=RESIDUAL",
    "REQUEST_Q_PRODUCTION=RESIDUAL",
    "NEXT=A71H_RULE_GROUNDED_PAIR_EXECUTOR_BINDING",
    "FULL_SELF_HOSTED=FALSE",
    "V013_NOT_ACCEPTED PRODUCTION_UNCHANGED",
  ].join(" "));
}

main();
