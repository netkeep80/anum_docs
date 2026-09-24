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
  type StructuralInterpreter,
  type StructuralRoleBinding,
} from "../src/structural-rule.js";
import { unifyStructuralTemplate } from "../src/structural-unification.js";
import {
  defineContext,
  readContext,
  StateError,
} from "../src/state.js";

function assert(c:unknown,m:string):asserts c{
  if(!c)throw new Error(`v0.13 A71j entry-scoped Theory authority: ${m}`);
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

/** Source-identical A70i entry-root derivation. */
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

interface EntryInterpreterAuthority{
  readonly entry:LinkHandle;
  readonly interpreter:LinkHandle;
  readonly structure:StructuralInterpreter;
}

/**
 * Derive execution authority from the direct C-rooted entry Context:
 *
 *   E = START(C -> I)
 *   current(E) = I = D -> (G -> T)
 *
 * A nested request supplies only its own Context identity. Entry ancestry
 * supplies I; I supplies exact Theory. No Theory handle is passed by the host.
 */
function deriveEntryInterpreterAuthority(
  memory:Memory,
  contextRoot:LinkHandle,
  requestContext:LinkHandle,
):EntryInterpreterAuthority{
  const entry=entryRootOf(memory,contextRoot,requestContext);
  const entryState=readContext(memory,entry);
  same(entryState.parent,contextRoot,"entry authority is direct C child");

  const interpreter=entryState.current;
  const structure=readStructuralInterpreter(memory,interpreter);
  return Object.freeze({entry,interpreter,structure});
}

interface GroundedConstructiveRule{
  readonly authority:EntryInterpreterAuthority;
  readonly rule:LinkHandle;
  readonly admission:LinkHandle;
  readonly outputTemplate:LinkHandle;
  readonly bindings:readonly StructuralRoleBinding[];
}

/**
 * A71h discovery with Theory authority removed from the function signature.
 *
 * Candidate Rule inventory comes only from the Theory carried by the entry's
 * StructuralInterpreter.
 */
function discoverGroundedConstructiveRule(
  memory:Memory,
  contextRoot:LinkHandle,
  requestContext:LinkHandle,
):GroundedConstructiveRule{
  const authority=deriveEntryInterpreterAuthority(
    memory,
    contextRoot,
    requestContext,
  );

  const state=readContext(memory,requestContext);
  const claimed=memory.poles(requestContext).end;
  const claimedPoles=memory.poles(claimed);
  same(claimedPoles.start,state.parent,
    "active request payload starts at caller");
  same(claimedPoles.end,state.current,
    "active request payload ends at current request");

  const matches:GroundedConstructiveRule[]=[];
  for(const admission of memory.outgoing(authority.structure.theory)){
    const ap=memory.poles(admission);
    if(ap.start!==authority.structure.theory || ap.end===admission)continue;
    const ruleHandle=ap.end;

    try{
      verifyStructuralRuleAdmission(
        memory,
        authority.structure.theory,
        ruleHandle,
        admission,
      );
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
        authority,
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
    `exactly one entry-Theory Rule must match; got ${matches.length}`);
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

interface ContextNativeRuleResult{
  readonly authority:EntryInterpreterAuthority;
  readonly rule:LinkHandle;
  readonly outputTruth:LinkHandle;
  readonly closure:LinkHandle;
  readonly continuationContext:LinkHandle;
}

/**
 * Generic Rule subcall with no Theory/interpreter argument.
 */
function executeContextNativeRuleSubcall(
  memory:Memory,
  contextRoot:LinkHandle,
  requestContext:LinkHandle,
):ContextNativeRuleResult{
  const requestState=readContext(memory,requestContext);
  const grounded=discoverGroundedConstructiveRule(
    memory,
    contextRoot,
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
    authority:grounded.authority,
    rule:grounded.rule,
    outputTruth,
    closure,
    continuationContext,
  });
}

interface ExecutionTree{
  readonly interpreter:LinkHandle;
  readonly entry:LinkHandle;
  readonly bridge:LinkHandle;
  readonly caller:LinkHandle;
}
function executionTree(
  memory:Memory,
  contextRoot:LinkHandle,
  dictionary:LinkHandle,
  grammar:LinkHandle,
  theory:LinkHandle,
  bridgeState:LinkHandle,
  callerState:LinkHandle,
):ExecutionTree{
  const interpreter=defineStructuralInterpreter(
    memory,
    dictionary,
    grammar,
    theory,
  );
  const entry=defineContext(memory,contextRoot,interpreter);
  const bridge=defineContext(memory,entry,bridgeState);
  const caller=defineContext(memory,bridge,callerState);
  return Object.freeze({interpreter,entry,bridge,caller});
}

function exercise(noise:boolean):void{
  const memory=new Memory();
  const b=ensureRootBasis(memory);
  const C=b.C;
  if(noise)memory.ensure(memory.ensure(b.U,b.C),memory.ensure(b.O,b.L));

  const fresh:LinkHandle[]=[];
  let seed=memory.ensure(b.U,b.L);
  for(let i=0;i<42;i+=1){
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
  const ruleA=definePairConstructionRule(memory,theoryA,b,at(4),false);
  const ruleB=definePairConstructionRule(memory,theoryB,b,at(5),true);

  // Same request shape, different admitted semantics in two execution trees.
  // If Theory were selected ambiently/globally this fixture would be ambiguous.
  const treeA=executionTree(
    memory,C,at(6),at(7),theoryA,at(8),at(9),
  );
  const treeB=executionTree(
    memory,C,at(10),at(11),theoryB,at(12),at(13),
  );

  const x=memory.ensure(at(14),at(15));
  const y=memory.ensure(at(16),at(17));
  assert(memory.find(x,y)===undefined,"A target absent before execution");
  assert(memory.find(y,x)===undefined,"B target absent before execution");

  const requestA=pairRequestContext(memory,treeA.caller,x,y);
  const requestB=pairRequestContext(memory,treeB.caller,x,y);

  // Authority is derivable read-only from arbitrary nested request depth.
  let before=memory.linkCount;
  const authA=deriveEntryInterpreterAuthority(memory,C,requestA);
  const authB=deriveEntryInterpreterAuthority(memory,C,requestB);
  same(memory.linkCount,before,"entry authority derivation read-only");

  same(authA.entry,treeA.entry,"A request resolves own entry");
  same(authA.interpreter,treeA.interpreter,"A exact interpreter identity");
  same(authA.structure.theory,theoryA,"A Theory from entry interpreter");
  same(authB.entry,treeB.entry,"B request resolves own entry");
  same(authB.interpreter,treeB.interpreter,"B exact interpreter identity");
  same(authB.structure.theory,theoryB,"B Theory from entry interpreter");

  // Same request topology is classified differently only because each Context
  // tree carries a different StructuralInterpreter at its C-rooted entry.
  before=memory.linkCount;
  const groundedA=discoverGroundedConstructiveRule(memory,C,requestA);
  const groundedB=discoverGroundedConstructiveRule(memory,C,requestB);
  same(memory.linkCount,before,"entry-scoped Rule discovery read-only");
  same(groundedA.rule,ruleA.rule,"A discovers only Theory-A Rule");
  same(groundedB.rule,ruleB.rule,"B discovers only Theory-B Rule");

  const resultA=executeContextNativeRuleSubcall(memory,C,requestA);
  same(resultA.rule,ruleA.rule,"A executes Theory-A semantics");
  const xy=memory.find(x,y);
  assert(xy!==undefined,"Theory A materializes X->Y");
  same(memory.find(y,x),undefined,
    "Theory-B output not accidentally materialized by A");
  same(resultA.outputTruth,memory.find(treeA.caller,xy),
    "A output returns to own caller");

  const resultB=executeContextNativeRuleSubcall(memory,C,requestB);
  same(resultB.rule,ruleB.rule,"B executes Theory-B semantics");
  const yx=memory.find(y,x);
  assert(yx!==undefined,"Theory B materializes Y->X");
  same(resultB.outputTruth,memory.find(treeB.caller,yx),
    "B output returns to own caller");

  // Foreign Theory remains physically present and structurally matching but is
  // inert to the other execution tree.
  same(groundedA.authority.structure.theory,theoryA,
    "A authority never switches to foreign Theory");
  same(groundedB.authority.structure.theory,theoryB,
    "B authority never switches to foreign Theory");

  // Zero matching Rule in the entry-selected Theory fails closed.
  const ordinaryState=memory.ensure(at(18),at(19));
  const ordinaryRequest=defineContext(memory,treeA.caller,ordinaryState);
  before=memory.linkCount;
  let zero=false;
  try{
    executeContextNativeRuleSubcall(memory,C,ordinaryRequest);
  }catch{
    zero=true;
  }
  assert(zero,"zero matching Rule under entry Theory fails closed");
  same(memory.linkCount,before,"zero-match authority path writes nothing");

  // Two matching Rules admitted to the SAME entry Theory are ambiguous.
  const secondA=definePairConstructionRule(memory,theoryA,b,at(20),true);
  assert(secondA.rule!==ruleA.rule,"second A Rule distinct");

  const treeA2=executionTree(
    memory,C,at(21),at(22),theoryA,at(23),at(24),
  );
  const x2=memory.ensure(at(25),at(26));
  const y2=memory.ensure(at(27),at(28));
  const ambiguousRequest=pairRequestContext(memory,treeA2.caller,x2,y2);
  assert(memory.find(x2,y2)===undefined,"ambiguous XY target absent");
  assert(memory.find(y2,x2)===undefined,"ambiguous YX target absent");

  before=memory.linkCount;
  let ambiguous=false;
  try{
    executeContextNativeRuleSubcall(memory,C,ambiguousRequest);
  }catch{
    ambiguous=true;
  }
  assert(ambiguous,"multiple matching Rules in entry Theory fail closed");
  same(memory.find(x2,y2),undefined,"ambiguous XY remains absent");
  same(memory.find(y2,x2),undefined,"ambiguous YX remains absent");
  same(memory.linkCount,before,"ambiguity performs no semantic writes");

  // A Context tree rooted outside selected C is not allowed to borrow Theory
  // authority from an unrelated entry.
  const foreignEntry=defineContext(memory,b.R,treeA.interpreter);
  const foreignCaller=defineContext(memory,foreignEntry,at(29));
  const foreignRequest=pairRequestContext(memory,foreignCaller,x,y);
  let foreignRejected=false;
  try{
    deriveEntryInterpreterAuthority(memory,C,foreignRequest);
  }catch{
    foreignRejected=true;
  }
  assert(foreignRejected,"non-C-rooted execution cannot derive C authority");
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
      "function entryRootOf(",
      "\ninterface EntryInterpreterAuthority",
    ),
    sourceSlice(
      a70i,
      "function entryRootOf(",
      "\ninterface IntrinsicFinalProducts",
    ),
    "A71j entry-root derivation source-identical A70i/A70d",
  );
  same(
    sourceSlice(
      own,
      "function instantiateStructuralTemplate(",
      "\ninterface ContextNativeRuleResult",
    ),
    sourceSlice(
      a71h,
      "function instantiateStructuralTemplate(",
      "\ninterface GroundedSubcallResult",
    ),
    "A71j output instantiation source-identical A71h",
  );

  const authority=sourceSlice(
    own,
    "function deriveEntryInterpreterAuthority(",
    "\ninterface GroundedConstructiveRule",
  );
  for(const forbidden of [
    ".outgoing(",
    ".incoming(",
    "allLinks(",
    ".find(",
    ".ensure(",
    "selectedTheory",
    "theory:",
    "switch(",
  ]){
    assert(!authority.includes(forbidden),
      `A71j entry authority excludes external selector ${forbidden}`);
  }
  assert(authority.includes("entryRootOf(memory,contextRoot,requestContext)"),
    "authority derives exact C-rooted entry from ancestry");
  assert(authority.includes("readStructuralInterpreter(memory,interpreter)"),
    "entry state is interpreted as canonical StructuralInterpreter");

  const discovery=sourceSlice(
    own,
    "function discoverGroundedConstructiveRule(",
    "\n/** Source-identical A71h generic structural-template instantiation.",
  );
  assert(!discovery.includes("theory:LinkHandle"),
    "Rule discovery receives no Theory argument");
  assert(discovery.includes("authority.structure.theory"),
    "Rule inventory derives from entry-carried interpreter Theory");

  const executor=sourceSlice(
    own,
    "function executeContextNativeRuleSubcall(",
    "\ninterface ExecutionTree",
  );
  for(const forbidden of [
    "theory:LinkHandle",
    "interpreter:LinkHandle",
    "selectedTheory",
    "RuleKind",
    "opcode",
    "switch(",
  ]){
    assert(!executor.includes(forbidden),
      `A71j executor excludes external semantic authority ${forbidden}`);
  }
}

function main():void{
  exercise(false);
  exercise(true);
  staticGuards();

  console.log([
    "MTS v0.13 A71j: ENTRY_SCOPED_THEORY_AUTHORITY=GREEN_SCOPED_RESEARCH",
    "ENTRY=START_C_TO_STRUCTURAL_INTERPRETER",
    "ENTRY_CURRENT=DICTIONARY_TO_GRAMMAR_TO_THEORY",
    "NESTED_REQUEST_TO_ENTRY=CONTEXT_ANCESTRY",
    "THEORY_SOURCE=ENTRY_STRUCTURAL_INTERPRETER",
    "HOST_THEORY_ARGUMENT=0",
    "HOST_INTERPRETER_ARGUMENT=0",
    "GLOBAL_THEORY_REGISTRY=0",
    "THEORY_MARKER_LINK=0",
    "TWO_EXECUTION_TREES=TWO_INDEPENDENT_THEORIES",
    "SAME_REQUEST_SHAPE=DIFFERENT_ENTRY_SCOPED_SEMANTICS",
    "FOREIGN_THEORY=INERT",
    "ZERO_MATCH=FAIL_CLOSED MULTIPLE_MATCH=FAIL_CLOSED",
    "NON_C_ROOTED_CONTEXT=FAIL_CLOSED",
    "AUTHORITY_DERIVATION=READ_ONLY",
    "RULE_DISCOVERY=A71H_STYLE_THEORY_ADMISSION_PLUS_UNIFICATION",
    "GENERIC_TEMPLATE_INSTANTIATION=HOST_RESIDUAL",
    "ENTRY_INTERPRETER_SEED=INPUT_AUTHORITY_BOUNDARY",
    "RULE_AUTHORSHIP_ADMISSION=RESIDUAL",
    "NEXT=A71K_INTEGRATE_ENTRY_ENVIRONMENT_WITH_DERIVED_WORKSET",
    "FULL_SELF_HOSTED=FALSE",
    "V013_NOT_ACCEPTED PRODUCTION_UNCHANGED",
  ].join(" "));
}

main();
