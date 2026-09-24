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
  if(!c)throw new Error(`v0.13 A71j entry meta Theory authority: ${m}`);
}
function same<T>(a:T,e:T,m:string):void{
  assert(Object.is(a,e),`${m}: values differ`);
}

interface ConstructiveRuleFixture{
  readonly rule:LinkHandle;
  readonly admission:LinkHandle;
}

function definePairConstructionRule(
  memory:Memory,
  theory:LinkHandle,
  b:RootBasis,
  seed:LinkHandle,
  reverse:boolean,
):ConstructiveRuleFixture{
  const kRole=memory.ensure(seed,b.O);
  const xRole=memory.ensure(seed,b.C);
  const yRole=memory.ensure(seed,b.L);
  const dictionary=defineStructuralRoleDictionary(memory,[kRole,xRole,yRole]);

  const leftTruth=memory.ensure(kRole,xRole);
  const rightTruth=memory.ensure(kRole,yRole);
  const request=memory.ensure(leftTruth,rightTruth);
  const inputTemplate=memory.ensure(kRole,request);

  const targetTemplate=reverse
    ? memory.ensure(yRole,xRole)
    : memory.ensure(xRole,yRole);
  const outputTemplate=memory.ensure(kRole,targetTemplate);

  const rule=defineStructuralRule(
    memory,
    dictionary,
    memory.ensure(inputTemplate,outputTemplate),
  );
  const admission=admitStructuralRule(memory,theory,rule);
  return Object.freeze({rule,admission});
}

interface GroundedConstructiveRule{
  readonly rule:LinkHandle;
  readonly admission:LinkHandle;
  readonly outputTemplate:LinkHandle;
  readonly bindings:readonly StructuralRoleBinding[];
}

/** Source-identical A71h Rule discovery after Theory is known. */
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

/**
 * Preserve the A70a entry/call-root state and carry interpreter authority as
 * separate existing meta topology:
 *
 *   entry -> END(I)
 *   I = D -> (G -> T)
 *
 * END is already the established outward/meta direction. The authority relation
 * is not START-lifted, so it does not become execution growth.
 */
function deriveEntryInterpreterAuthority(
  memory:Memory,
  contextRoot:LinkHandle,
  requestContext:LinkHandle,
):LinkHandle{
  const entry=entryRootOf(memory,contextRoot,requestContext);
  const matches:LinkHandle[]=[];

  for(const relation of memory.outgoing(entry)){
    const rp=memory.poles(relation);
    if(rp.start!==entry || rp.end===relation)continue;

    const meta=rp.end;
    const mp=memory.poles(meta);
    if(mp.end!==meta || mp.start===meta)continue;

    const interpreter=mp.start;
    try{
      readStructuralInterpreter(memory,interpreter);
      matches.push(interpreter);
    }catch(error){
      if(error instanceof StructuralRuleError)continue;
      throw error;
    }
  }

  assert(matches.length===1,
    `exactly one entry END(interpreter) authority required; got ${matches.length}`);
  return matches[0]!;
}

function deriveEntryTheoryAuthority(
  memory:Memory,
  contextRoot:LinkHandle,
  requestContext:LinkHandle,
):LinkHandle{
  return readStructuralInterpreter(
    memory,
    deriveEntryInterpreterAuthority(memory,contextRoot,requestContext),
  ).theory;
}

interface ContextGroundedRuleResult{
  readonly theory:LinkHandle;
  readonly rule:LinkHandle;
  readonly outputTruth:LinkHandle;
  readonly closure:LinkHandle;
  readonly continuationContext:LinkHandle;
}

/**
 * A71h executor with Theory removed from its external signature.
 */
function executeContextGroundedRuleSubcall(
  memory:Memory,
  contextRoot:LinkHandle,
  requestContext:LinkHandle,
):ContextGroundedRuleResult{
  const requestState=readContext(memory,requestContext);
  const theory=deriveEntryTheoryAuthority(memory,contextRoot,requestContext);
  const grounded=discoverGroundedConstructiveRule(
    memory,
    theory,
    requestContext,
  );

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
    theory,
    rule:grounded.rule,
    outputTruth,
    closure,
    continuationContext,
  });
}

function attachEntryInterpreterAuthority(
  memory:Memory,
  entry:LinkHandle,
  interpreter:LinkHandle,
):LinkHandle{
  return memory.ensure(entry,memory.ensureEndSelfClosed(interpreter));
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
  return memory.ensureStartSelfClosed(memory.ensure(caller,request));
}

function exercise(noise:boolean):void{
  const memory=new Memory();
  const b=ensureRootBasis(memory);
  const C=b.C;
  if(noise)memory.ensure(memory.ensure(b.U,b.C),memory.ensure(b.O,b.L));

  const fresh:LinkHandle[]=[];
  let seed=memory.ensure(b.U,b.L);
  for(let i=0;i<52;i+=1){
    seed=memory.ensure(seed,i%2===0?b.O:b.C);
    fresh.push(seed);
  }
  const at=(i:number):LinkHandle=>{
    const value=fresh[i];
    assert(value!==undefined,`fresh anchor ${i}`);
    return value;
  };

  const theoryA=memory.ensure(at(0),at(1));
  const theoryB=memory.ensure(at(2),at(3));
  const interpreterA=defineStructuralInterpreter(memory,at(4),at(5),theoryA);
  const interpreterB=defineStructuralInterpreter(memory,at(6),at(7),theoryB);

  const ruleA=definePairConstructionRule(memory,theoryA,b,at(8),false);
  const ruleB=definePairConstructionRule(memory,theoryB,b,at(9),true);

  // Keep direct C-rooted entries as ordinary execution states, preserving A70a.
  const stateA=memory.ensure(at(10),at(11));
  const stateB=memory.ensure(at(12),at(13));
  const entryA=defineContext(memory,C,stateA);
  const entryB=defineContext(memory,C,stateB);

  attachEntryInterpreterAuthority(memory,entryA,interpreterA);
  attachEntryInterpreterAuthority(memory,entryB,interpreterB);

  same(readContext(memory,entryA).current,stateA,
    "entry A execution state is not replaced by interpreter");
  same(readContext(memory,entryB).current,stateB,
    "entry B execution state is not replaced by interpreter");

  const x=memory.ensure(at(14),at(15));
  const y=memory.ensure(at(16),at(17));
  const requestA=pairRequestContext(memory,entryA,x,y);
  const requestB=pairRequestContext(memory,entryB,x,y);

  const beforeAuthority=memory.linkCount;
  same(deriveEntryInterpreterAuthority(memory,C,requestA),interpreterA,
    "request A derives its own entry interpreter");
  same(deriveEntryTheoryAuthority(memory,C,requestA),theoryA,
    "request A derives Theory A");
  same(deriveEntryInterpreterAuthority(memory,C,requestB),interpreterB,
    "request B derives its own entry interpreter");
  same(deriveEntryTheoryAuthority(memory,C,requestB),theoryB,
    "request B derives Theory B");
  same(memory.linkCount,beforeAuthority,
    "Theory authority derivation is read-only");

  assert(memory.find(x,y)===undefined,"X->Y absent before Theory A");
  assert(memory.find(y,x)===undefined,"Y->X absent before Theory B");

  const resultA=executeContextGroundedRuleSubcall(memory,C,requestA);
  same(resultA.theory,theoryA,"A executor uses derived Theory A");
  same(resultA.rule,ruleA.rule,"A selects only Theory-A Rule");
  const xy=memory.find(x,y);
  assert(xy!==undefined,"Theory A materializes X->Y");
  same(memory.find(y,x),undefined,
    "Theory B semantics remain inert during A execution");

  const resultB=executeContextGroundedRuleSubcall(memory,C,requestB);
  same(resultB.theory,theoryB,"B executor uses derived Theory B");
  same(resultB.rule,ruleB.rule,"B selects only Theory-B Rule");
  const yx=memory.find(y,x);
  assert(yx!==undefined,"Theory B materializes Y->X");

  same(resultA.outputTruth,memory.find(entryA,xy),
    "A result returns under exact entry A");
  same(resultB.outputTruth,memory.find(entryB,yx),
    "B result returns under exact entry B");

  // Zero authority fails before semantic writes.
  const entryZero=defineContext(memory,C,memory.ensure(at(18),at(19)));
  const xZero=memory.ensure(at(20),at(21));
  const yZero=memory.ensure(at(22),at(23));
  const requestZero=pairRequestContext(memory,entryZero,xZero,yZero);
  const beforeZero=memory.linkCount;
  let zero=false;
  try{
    executeContextGroundedRuleSubcall(memory,C,requestZero);
  }catch{
    zero=true;
  }
  assert(zero,"zero Theory authority fails closed");
  same(memory.find(xZero,yZero),undefined,
    "zero-authority target remains absent");
  same(memory.linkCount,beforeZero,
    "zero-authority failure writes nothing");

  // Multiple entry meta-authorities are ambiguous.
  const theoryOther=memory.ensure(at(24),at(25));
  const interpreterOther=defineStructuralInterpreter(
    memory,at(26),at(27),theoryOther,
  );
  attachEntryInterpreterAuthority(memory,entryA,interpreterOther);

  const xAmb=memory.ensure(at(28),at(29));
  const yAmb=memory.ensure(at(30),at(31));
  const requestAmb=pairRequestContext(memory,entryA,xAmb,yAmb);
  const beforeAmb=memory.linkCount;
  let ambiguous=false;
  try{
    executeContextGroundedRuleSubcall(memory,C,requestAmb);
  }catch{
    ambiguous=true;
  }
  assert(ambiguous,"multiple entry Theory authorities fail closed");
  same(memory.find(xAmb,yAmb),undefined,
    "ambiguous authority target remains absent");
  same(memory.linkCount,beforeAmb,
    "ambiguous authority failure writes nothing");

  // Foreign non-C-rooted execution cannot borrow a C-scoped authority.
  const foreignEntry=defineContext(memory,b.R,memory.ensure(at(32),at(33)));
  attachEntryInterpreterAuthority(
    memory,
    foreignEntry,
    defineStructuralInterpreter(memory,at(34),at(35),theoryA),
  );
  const foreignCaller=defineContext(memory,foreignEntry,memory.ensure(at(36),at(37)));
  const foreignRequest=pairRequestContext(
    memory,
    foreignCaller,
    memory.ensure(at(38),at(39)),
    memory.ensure(at(40),at(41)),
  );
  const beforeForeign=memory.linkCount;
  let foreign=false;
  try{
    executeContextGroundedRuleSubcall(memory,C,foreignRequest);
  }catch{
    foreign=true;
  }
  assert(foreign,"non-C-rooted request fails authority derivation");
  same(memory.linkCount,beforeForeign,
    "foreign authority failure writes nothing");
}

function sourceSlice(source:string,start:string,end:string):string{
  const i=source.indexOf(start),j=source.indexOf(end,i+1);
  assert(i>=0&&j>i,`source slice ${start}`);
  return source.slice(i,j).replace(/\s+/g,"");
}

function staticGuards():void{
  const root=resolve(process.cwd(),"..");
  const own=readFileSync(
    join(root,"ts/test/research-v013-entry-scoped-theory-authority-a71j.test.ts"),
    "utf8",
  );
  const a71h=readFileSync(
    join(root,"ts/test/research-v013-rule-carried-output-template-a71h.test.ts"),
    "utf8",
  );
  const a70i=readFileSync(
    join(root,"ts/test/research-v013-intrinsic-final-results-a70i.test.ts"),
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
    "A71j Rule discovery source-identical A71h",
  );
  same(
    sourceSlice(
      own,
      "function instantiateStructuralTemplate(",
      "\nfunction entryRootOf(",
    ),
    sourceSlice(
      a71h,
      "function instantiateStructuralTemplate(",
      "\ninterface GroundedSubcallResult",
    ),
    "A71j output instantiation source-identical A71h",
  );
  same(
    sourceSlice(
      own,
      "function entryRootOf(",
      "\n/**\n * Preserve the A70a entry/call-root state",
    ),
    sourceSlice(
      a70i,
      "function entryRootOf(",
      "\ninterface IntrinsicFinalProducts",
    ),
    "A71j entry-root derivation source-identical A70i/A70d",
  );

  const authority=sourceSlice(
    own,
    "function deriveEntryInterpreterAuthority(",
    "\nfunction deriveEntryTheoryAuthority(",
  );
  for(const forbidden of [
    ".ensure(",
    "defineContext(",
    "selectedTheory",
    "expectedTheory",
    "registry",
    "allLinks(",
    "switch(",
  ]){
    assert(!authority.includes(forbidden),
      `A71j authority derivation excludes host selector ${forbidden}`);
  }
  assert(authority.includes("entryRootOf(memory,contextRoot,requestContext)"),
    "A71j authority is scoped by Context ancestry");
  assert(authority.includes("memory.outgoing(entry)"),
    "A71j authority reads only entry-local meta topology");
  assert(authority.includes("mp.end!==meta||mp.start===meta"),
    "A71j authority requires proper END meta wrapper");
  assert(authority.includes("matches.length===1"),
    "A71j zero/multiple authorities fail closed");

  const executor=sourceSlice(
    own,
    "function executeContextGroundedRuleSubcall(",
    "\nfunction attachEntryInterpreterAuthority(",
  );
  assert(!executor.includes("theory:LinkHandle"),
    "A71j executor receives no Theory argument");
  assert(!executor.includes("interpreter:LinkHandle"),
    "A71j executor receives no interpreter argument");
  assert(executor.includes("deriveEntryTheoryAuthority("),
    "A71j executor derives Theory from Context/meta topology");
}

function main():void{
  exercise(false);
  exercise(true);
  staticGuards();

  console.log([
    "MTS v0.13 A71j: ENTRY_META_THEORY_AUTHORITY=GREEN_SCOPED_RESEARCH",
    "ENTRY_EXECUTION_STATE=PRESERVED",
    "AUTHORITY_TOPOLOGY=ENTRY_TO_END_INTERPRETER",
    "STRUCTURAL_INTERPRETER=D_TO_G_TO_T",
    "THEORY_SOURCE=CONTEXT_ANCESTRY_PLUS_ENTRY_META_LINK",
    "HOST_THEORY_ARGUMENT=0 HOST_INTERPRETER_ARGUMENT=0",
    "GLOBAL_THEORY_REGISTRY=0",
    "USES_EXISTING_END_META_DIRECTION=YES",
    "TWO_ENTRIES_TWO_THEORIES=INDEPENDENT",
    "SAME_REQUEST_SHAPE=ENTRY_SCOPED_DIFFERENT_SEMANTICS",
    "ZERO_AUTHORITY=FAIL_CLOSED MULTIPLE_AUTHORITY=FAIL_CLOSED",
    "FOREIGN_NON_C_ROOTED_CONTEXT=FAIL_CLOSED",
    "AUTHORITY_DISCOVERY=READ_ONLY",
    "A70A_ENTRY_CALL_ROOT_STATE=NOT_REPURPOSED",
    "NESTED_THEORY_OVERRIDE=NOT_CLAIMED",
    "GENERIC_TEMPLATE_INSTANTIATION=HOST_RESIDUAL",
    "INITIAL_META_AUTHORITY_SEED=INPUT_BOUNDARY",
    "RULE_AUTHORSHIP_ADMISSION=RESIDUAL",
    "NEXT=A71K_GENERIC_TEMPLATE_INSTANTIATION_SELF_EXECUTION",
    "FULL_SELF_HOSTED=FALSE",
    "V013_NOT_ACCEPTED PRODUCTION_UNCHANGED",
  ].join(" "));
}

main();
