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
  if(!c)throw new Error(`v0.13 A71k authority-neutral workset: ${m}`);
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
  return memory.ensureStartSelfClosed(memory.ensure(caller,request));
}

/** Source-identical A68d entry discovery. */
function discoverEntryContexts(
  memory: Memory,
  contextRoot: LinkHandle,
): readonly LinkHandle[] {
  const discovered: LinkHandle[] = [];
  const seen = new Set<LinkHandle>();

  for (const payload of memory.outgoing(contextRoot)) {
    const p = memory.poles(payload);
    if (p.start !== contextRoot) continue;

    for (const candidate of memory.incoming(payload)) {
      if (seen.has(candidate)) continue;
      const c = memory.poles(candidate);
      if (c.start !== candidate || c.end !== payload) continue;

      const state = readContext(memory, candidate);
      same(state.parent, contextRoot, "discovered entry parent");
      same(state.current, p.end, "discovered entry state");

      seen.add(candidate);
      discovered.push(candidate);
    }
  }

  return Object.freeze(discovered);
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

    // Proper child payload is ordinary on its END side. END(parent) is also
    // outgoing(parent), but p.end===payload and must not be treated as state.
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

/** Source-identical A70f derived global workset. */
function currentWorkset(
  memory:Memory,
  contextRoot:LinkHandle,
):readonly LinkHandle[]{
  const work:LinkHandle[]=[];
  const seen=new Set<LinkHandle>();

  for(const entry of discoverEntryContexts(memory,contextRoot)){
    for(const leaf of activeFrontier(memory,entry)){
      assert(!seen.has(leaf),"active leaf belongs to more than one entry tree");
      seen.add(leaf);
      work.push(leaf);
    }
  }

  return Object.freeze(work);
}

/** Source-identical A70i/A71j entry-root derivation. */
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

/** Source-identical A71j entry-scoped authority derivation. */
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

/** Source-identical A71j Rule discovery. */
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

/** Source-identical A71h/A71j generic template instantiation. */
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

/** Source-identical A71j context-native Rule execution. */
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

interface PlannedWork{
  readonly leaf:LinkHandle;
  readonly entry:LinkHandle;
  readonly theory:LinkHandle;
  readonly rule:LinkHandle;
}

/**
 * Read-only planner over the authority-neutral A70f workset.
 *
 * The scheduler gives only leaf identities. Each leaf then derives its own
 * entry/interpreter/Theory and matching Rule independently.
 */
function planCurrentRuleWork(
  memory:Memory,
  contextRoot:LinkHandle,
):readonly PlannedWork[]{
  const before=memory.linkCount;
  const plan=currentWorkset(memory,contextRoot).map((leaf)=>{
    const grounded=discoverGroundedConstructiveRule(
      memory,
      contextRoot,
      leaf,
    );
    return Object.freeze({
      leaf,
      entry:grounded.authority.entry,
      theory:grounded.authority.structure.theory,
      rule:grounded.rule,
    });
  });
  same(memory.linkCount,before,"work planning is read-only");
  return Object.freeze(plan);
}

interface WorksetExecution{
  readonly results:readonly ContextNativeRuleResult[];
  readonly nextWorkset:readonly LinkHandle[];
}

/**
 * Execute one already-frozen workset. Order is deliberately variable.
 */
function executePlannedWork(
  memory:Memory,
  contextRoot:LinkHandle,
  plan:readonly PlannedWork[],
  order:"forward"|"reverse",
):WorksetExecution{
  const scheduled=order==="forward"?[...plan]:[...plan].reverse();
  const results=scheduled.map((item)=>
    executeContextNativeRuleSubcall(memory,contextRoot,item.leaf)
  );
  return Object.freeze({
    results:Object.freeze(results),
    nextWorkset:currentWorkset(memory,contextRoot),
  });
}

interface ExecutionTree{
  readonly interpreter:LinkHandle;
  readonly entry:LinkHandle;
  readonly caller:LinkHandle;
  readonly request:LinkHandle;
}
function executionTree(
  memory:Memory,
  contextRoot:LinkHandle,
  dictionary:LinkHandle,
  grammar:LinkHandle,
  theory:LinkHandle,
  callerState:LinkHandle,
  x:LinkHandle,
  y:LinkHandle,
):ExecutionTree{
  const interpreter=defineStructuralInterpreter(
    memory,
    dictionary,
    grammar,
    theory,
  );
  const entry=defineContext(memory,contextRoot,interpreter);
  const caller=defineContext(memory,entry,callerState);
  const request=pairRequestContext(memory,caller,x,y);
  return Object.freeze({interpreter,entry,caller,request});
}

function exercise(noise:boolean):void{
  const memory=new Memory();
  const b=ensureRootBasis(memory);
  const C=b.C;
  if(noise)memory.ensure(memory.ensure(b.U,b.C),memory.ensure(b.O,b.L));

  const fresh:LinkHandle[]=[];
  let seed=memory.ensure(b.U,b.L);
  for(let i=0;i<36;i+=1){
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

  const x=memory.ensure(at(6),at(7));
  const y=memory.ensure(at(8),at(9));

  const treeA=executionTree(
    memory,C,at(10),at(11),theoryA,at(12),x,y,
  );
  const treeB=executionTree(
    memory,C,at(13),at(14),theoryB,at(15),x,y,
  );

  // Scheduler sees only two active leaf identities. It receives no Theory,
  // interpreter, Rule, entry registry or per-tree dispatcher.
  let before=memory.linkCount;
  setSame(currentWorkset(memory,C),[treeA.request,treeB.request],
    "global workset contains both request leaves");
  same(memory.linkCount,before,"scheduler discovery read-only");

  const plan=planCurrentRuleWork(memory,C);
  same(plan.length,2,"two planned leaves");
  const plannedA=plan.find(x=>x.leaf===treeA.request);
  const plannedB=plan.find(x=>x.leaf===treeB.request);
  assert(plannedA!==undefined&&plannedB!==undefined,"both leaves planned");
  same(plannedA.entry,treeA.entry,"A leaf derives A entry");
  same(plannedA.theory,theoryA,"A leaf derives A Theory");
  same(plannedA.rule,ruleA.rule,"A leaf derives A Rule");
  same(plannedB.entry,treeB.entry,"B leaf derives B entry");
  same(plannedB.theory,theoryB,"B leaf derives B Theory");
  same(plannedB.rule,ruleB.rule,"B leaf derives B Rule");

  assert(memory.find(x,y)===undefined,"XY absent before workset execution");
  assert(memory.find(y,x)===undefined,"YX absent before workset execution");

  const forward=executePlannedWork(memory,C,plan,"forward");
  const xy=memory.find(x,y);
  const yx=memory.find(y,x);
  assert(xy!==undefined&&yx!==undefined,
    "two authority-local leaves materialize both distinct results");

  const resultA=forward.results.find(x=>x.rule===ruleA.rule);
  const resultB=forward.results.find(x=>x.rule===ruleB.rule);
  assert(resultA!==undefined&&resultB!==undefined,"both Rules executed");
  same(resultA.authority.entry,treeA.entry,"A result keeps A authority");
  same(resultB.authority.entry,treeB.entry,"B result keeps B authority");
  same(resultA.outputTruth,memory.find(treeA.caller,xy),
    "A output returns under A caller");
  same(resultB.outputTruth,memory.find(treeB.caller,yx),
    "B output returns under B caller");

  // A70f naturally replaces both closed request leaves with their result
  // continuations. It still does not inspect Theory.
  setSame(
    forward.nextWorkset,
    [resultA.continuationContext,resultB.continuationContext],
    "global workset advances both execution trees independently",
  );

  // Replay the same frozen plan in reverse order. Canonical execution makes it
  // extensionally inert even though schedule order differs.
  const afterForward=memory.linkCount;
  const reverse=executePlannedWork(memory,C,plan,"reverse");
  same(memory.linkCount,afterForward,
    "reverse replay of frozen workset adds no Links");
  setSame(
    reverse.results.map(x=>x.continuationContext),
    forward.results.map(x=>x.continuationContext),
    "forward/reverse continuation sets equal",
  );
  setSame(reverse.nextWorkset,forward.nextWorkset,
    "forward/reverse next workset equal");

  // Closing one result branch removes only that tree from the common workset.
  memory.ensureEndSelfClosed(resultA.continuationContext);
  setSame(currentWorkset(memory,C),[resultB.continuationContext],
    "branch-local END removes only A tree work");

  memory.ensureEndSelfClosed(resultB.continuationContext);
  setSame(currentWorkset(memory,C),[],
    "closing both result branches yields empty common workset");

  // Physical meta-entry/interpreter history remains present after quiescence.
  same(readContext(memory,treeA.entry).current,treeA.interpreter,
    "A entry interpreter persists");
  same(readContext(memory,treeB.entry).current,treeB.interpreter,
    "B entry interpreter persists");
}

function sourceSlice(source:string,start:string,end:string):string{
  const i=source.indexOf(start),j=source.indexOf(end,i+1);
  assert(i>=0&&j>i,`source slice ${start}`);
  return source.slice(i,j).replace(/\s+/g,"");
}

function staticGuards():void{
  const root=resolve(process.cwd(),"..");
  const own=readFileSync(
    join(root,"ts/test/research-v013-authority-neutral-workset-a71k.test.ts"),
    "utf8",
  );
  const a70f=readFileSync(
    join(root,"ts/test/research-v013-derived-workset-a70f.test.ts"),
    "utf8",
  );
  const a71j=readFileSync(
    join(root,"ts/test/research-v013-entry-scoped-theory-authority-a71j.test.ts"),
    "utf8",
  );

  same(
    sourceSlice(
      own,
      "function currentWorkset(",
      "\n/** Source-identical A70i/A71j entry-root derivation.",
    ),
    sourceSlice(
      a70f,
      "function currentWorkset(",
      "\nfunction exercise(",
    ),
    "A71k scheduler source-identical A70f",
  );
  same(
    sourceSlice(
      own,
      "function entryRootOf(",
      "\ninterface EntryInterpreterAuthority",
    ),
    sourceSlice(
      a71j,
      "function entryRootOf(",
      "\ninterface EntryInterpreterAuthority",
    ),
    "A71k entry-root source-identical A71j",
  );
  same(
    sourceSlice(
      own,
      "function deriveEntryInterpreterAuthority(",
      "\ninterface GroundedConstructiveRule",
    ),
    sourceSlice(
      a71j,
      "function deriveEntryInterpreterAuthority(",
      "\ninterface GroundedConstructiveRule",
    ),
    "A71k authority derivation source-identical A71j",
  );
  same(
    sourceSlice(
      own,
      "function discoverGroundedConstructiveRule(",
      "\n/** Source-identical A71h/A71j generic template instantiation.",
    ),
    sourceSlice(
      a71j,
      "function discoverGroundedConstructiveRule(",
      "\n/** Source-identical A71h generic structural-template instantiation.",
    ),
    "A71k Rule discovery source-identical A71j",
  );
  same(
    sourceSlice(
      own,
      "function instantiateStructuralTemplate(",
      "\ninterface ContextNativeRuleResult",
    ),
    sourceSlice(
      a71j,
      "function instantiateStructuralTemplate(",
      "\ninterface ContextNativeRuleResult",
    ),
    "A71k template instantiation source-identical A71j",
  );
  same(
    sourceSlice(
      own,
      "function executeContextNativeRuleSubcall(",
      "\ninterface PlannedWork",
    ),
    sourceSlice(
      a71j,
      "function executeContextNativeRuleSubcall(",
      "\ninterface ExecutionTree",
    ),
    "A71k Rule executor source-identical A71j",
  );

  const scheduler=sourceSlice(
    own,
    "function currentWorkset(",
    "\n/** Source-identical A70i/A71j entry-root derivation.",
  );
  for(const forbidden of [
    "theory",
    "interpreter",
    "Rule",
    "selected",
    "registry",
    "queue",
  ]){
    assert(!scheduler.includes(forbidden),
      `A71k global scheduler remains authority-neutral: ${forbidden}`);
  }

  const planner=sourceSlice(
    own,
    "function planCurrentRuleWork(",
    "\ninterface WorksetExecution",
  );
  assert(planner.includes("currentWorkset(memory,contextRoot)"),
    "planner consumes only derived global workset");
  assert(planner.includes("discoverGroundedConstructiveRule("),
    "each leaf derives semantic authority after scheduling");
}

function main():void{
  exercise(false);
  exercise(true);
  staticGuards();

  console.log([
    "MTS v0.13 A71k: AUTHORITY_NEUTRAL_GLOBAL_WORKSET=GREEN_SCOPED_RESEARCH",
    "GLOBAL_WORKSET=A70F_SOURCE_IDENTICAL",
    "WORKSET_INPUT=MEMORY_PLUS_C_ONLY",
    "SCHEDULER_THEORY_AWARE=NO",
    "SCHEDULER_INTERPRETER_AWARE=NO",
    "TWO_ENTRIES=TWO_ENTRY_SCOPED_THEORIES",
    "SAME_REQUEST_SHAPE=TWO_LOCAL_SEMANTICS",
    "PER_LEAF_AUTHORITY=DERIVED_FROM_ENTRY_ANCESTRY",
    "HOST_PER_ENTRY_DISPATCH=0",
    "HOST_THEORY_ARGUMENT=0",
    "FORWARD_REVERSE_FROZEN_WORKSET=EXTENSIONALLY_EQUIVALENT",
    "REQUEST_TO_RESULT_FRONTIER_ADVANCE=AUTOMATIC",
    "BRANCH_LOCAL_END=LOCAL_WORK_REMOVAL",
    "QUIESCENCE=EMPTY_COMMON_WORKSET",
    "ENTRY_INTERPRETER_HISTORY=PERSISTENT",
    "GENERIC_TEMPLATE_INSTANTIATION=HOST_RESIDUAL",
    "ENTRY_INTERPRETER_SEED=INPUT_AUTHORITY_BOUNDARY",
    "RULE_AUTHORSHIP_ADMISSION=RESIDUAL",
    "NEXT=A71L_REMOVE_HOST_GENERIC_TEMPLATE_INSTANTIATION_OR_LOCALIZE_MINIMUM_KERNEL",
    "FULL_SELF_HOSTED=FALSE",
    "V013_NOT_ACCEPTED PRODUCTION_UNCHANGED",
  ].join(" "));
}

main();
