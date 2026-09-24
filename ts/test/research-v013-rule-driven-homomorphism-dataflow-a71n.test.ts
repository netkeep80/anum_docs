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
  if(!c)throw new Error(`v0.13 A71n Rule-driven homomorphism dataflow: ${m}`);
}
function same<T>(a:T,e:T,m:string):void{
  assert(Object.is(a,e),`${m}: values differ`);
}
function setSame(actual:readonly LinkHandle[],expected:readonly LinkHandle[],m:string):void{
  same(new Set(actual).size,new Set(expected).size,`${m}: cardinality`);
  for(const x of expected)assert(actual.includes(x),`${m}: missing expected Link`);
}

interface TemplateNodes{
  readonly xRole:LinkHandle;
  readonly yRole:LinkHandle;
  readonly pair:LinkHandle;
  readonly start:LinkHandle;
  readonly end:LinkHandle;
}
function defineSourceTemplate(
  memory:Memory,
  b:RootBasis,
  seed:LinkHandle,
):TemplateNodes{
  const xRole=memory.ensure(seed,b.O);
  const yRole=memory.ensure(seed,b.C);
  const pair=memory.ensure(xRole,yRole);
  const start=memory.ensureStartSelfClosed(pair);
  const end=memory.ensureEndSelfClosed(start);
  return Object.freeze({xRole,yRole,pair,start,end});
}

interface DataflowRules{
  readonly pair:LinkHandle;
  readonly start:LinkHandle;
  readonly end:LinkHandle;
}

/**
 * Template-specific Rule network encoding dependency propagation.
 *
 * Stage 0:
 *   K -> ((xRole->X) -> (yRole->Y))
 *      -> K -> (pairSource -> (X->Y))
 *
 * Stage 1:
 *   K -> (pairSource->P)
 *      -> K -> (startSource -> START(P))
 *
 * Stage 2:
 *   K -> (startSource->S)
 *      -> K -> (endSource -> END(S))
 *
 * The host never chooses a stage Rule. Current active Context topology does.
 */
function defineDataflowRules(
  memory:Memory,
  theory:LinkHandle,
  b:RootBasis,
  source:TemplateNodes,
  seed:LinkHandle,
):DataflowRules{
  // Rule 0: binding environment -> PAIR image.
  const k0=memory.ensure(seed,b.O);
  const x=memory.ensure(seed,b.C);
  const y=memory.ensure(seed,b.L);
  const d0=defineStructuralRoleDictionary(memory,[k0,x,y]);

  const bx=memory.ensure(source.xRole,x);
  const by=memory.ensure(source.yRole,y);
  const input0=memory.ensure(k0,memory.ensure(bx,by));
  const pairImage=memory.ensure(x,y);
  const output0=memory.ensure(k0,memory.ensure(source.pair,pairImage));
  const r0=defineStructuralRule(memory,d0,memory.ensure(input0,output0));
  admitStructuralRule(memory,theory,r0);

  // Rule 1: PAIR image -> START image.
  const k1=memory.ensure(seed,b.U);
  const p=memory.ensure(seed,b.O);
  const d1=defineStructuralRoleDictionary(memory,[k1,p]);

  const input1=memory.ensure(k1,memory.ensure(source.pair,p));
  const startImage=memory.ensureStartSelfClosed(p);
  const output1=memory.ensure(k1,memory.ensure(source.start,startImage));
  const r1=defineStructuralRule(memory,d1,memory.ensure(input1,output1));
  admitStructuralRule(memory,theory,r1);

  // Rule 2: START image -> END image.
  const k2=memory.ensure(seed,b.C);
  const s=memory.ensure(seed,b.O);
  const d2=defineStructuralRoleDictionary(memory,[k2,s]);

  const input2=memory.ensure(k2,memory.ensure(source.start,s));
  const endImage=memory.ensureEndSelfClosed(s);
  const output2=memory.ensure(k2,memory.ensure(source.end,endImage));
  const r2=defineStructuralRule(memory,d2,memory.ensure(input2,output2));
  admitStructuralRule(memory,theory,r2);

  return Object.freeze({pair:r0,start:r1,end:r2});
}

function seedBindingRequest(
  memory:Memory,
  caller:LinkHandle,
  source:TemplateNodes,
  x:LinkHandle,
  y:LinkHandle,
):LinkHandle{
  const bx=memory.ensure(source.xRole,x);
  const by=memory.ensure(source.yRole,y);
  return memory.ensureStartSelfClosed(
    memory.ensure(caller,memory.ensure(bx,by)),
  );
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

/** Source-identical A70f global workset. */
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

/** Source-identical A71h/A71j template realization. */
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

interface Tick{
  readonly leaf:LinkHandle;
  readonly rule:LinkHandle;
  readonly next:LinkHandle;
}

/**
 * One generic dynamics tick.
 *
 * No stage, template node, ready set or dependency queue is supplied.
 * The only executable leaf in currentWorkset chooses its Rule structurally.
 */
function tick(
  memory:Memory,
  contextRoot:LinkHandle,
):Tick{
  const work=currentWorkset(memory,contextRoot);
  same(work.length,1,"scoped dataflow fixture has one active leaf");
  const leaf=work[0]!;
  const result=executeContextNativeRuleSubcall(memory,contextRoot,leaf);
  return Object.freeze({
    leaf,
    rule:result.rule,
    next:result.continuationContext,
  });
}

function exercise(noise:boolean):void{
  const memory=new Memory();
  const b=ensureRootBasis(memory);
  const C=b.C;
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

  const source=defineSourceTemplate(memory,b,at(0));
  const theory=memory.ensure(at(1),at(2));
  const rules=defineDataflowRules(memory,theory,b,source,at(3));

  const interpreter=defineStructuralInterpreter(
    memory,
    at(4),
    at(5),
    theory,
  );
  const entry=defineContext(memory,C,interpreter);
  const caller=defineContext(memory,entry,at(6));

  const x=memory.ensure(at(7),at(8));
  const y=memory.ensure(at(9),at(10));
  const initial=seedBindingRequest(memory,caller,source,x,y);

  setSame(currentWorkset(memory,C),[initial],
    "binding environment is initial active leaf");

  // Tick 1: bindings -> PAIR image.
  const t1=tick(memory,C);
  same(t1.rule,rules.pair,"topology selects PAIR-image Rule");
  const pairTarget=memory.ensure(x,y);
  const pairFact=memory.ensure(source.pair,pairTarget);
  same(readContext(memory,t1.next).current,pairFact,
    "tick1 current state is exact PAIR image fact");
  setSame(currentWorkset(memory,C),[t1.next],
    "PAIR image fact becomes next active leaf");

  // Tick 2: PAIR image -> START image.
  const t2=tick(memory,C);
  same(t2.rule,rules.start,"PAIR image topology selects START-image Rule");
  const startTarget=memory.ensureStartSelfClosed(pairTarget);
  const startFact=memory.ensure(source.start,startTarget);
  same(readContext(memory,t2.next).current,startFact,
    "tick2 current state is exact START image fact");
  setSame(currentWorkset(memory,C),[t2.next],
    "START image fact becomes next active leaf");

  // Tick 3: START image -> END image.
  const t3=tick(memory,C);
  same(t3.rule,rules.end,"START image topology selects END-image Rule");
  const endTarget=memory.ensureEndSelfClosed(startTarget);
  const endFact=memory.ensure(source.end,endTarget);
  same(readContext(memory,t3.next).current,endFact,
    "tick3 current state is exact END image fact");
  setSame(currentWorkset(memory,C),[t3.next],
    "final mapping fact remains active output leaf");

  // No host pending set was needed to choose pair/start/end source nodes.
  // The sequence of current states itself carried readiness.
  same(closureOf(memory,t1.leaf)!==undefined,true,"tick1 input closed");
  same(closureOf(memory,t2.leaf)!==undefined,true,"tick2 input closed");
  same(closureOf(memory,t3.leaf)!==undefined,true,"tick3 input closed");

  // Post-hoc A71m homomorphic oracle for the source template's final END node.
  const directPair=memory.ensure(x,y);
  const directStart=memory.ensureStartSelfClosed(directPair);
  const directEnd=memory.ensureEndSelfClosed(directStart);
  same(endTarget,directEnd,"Rule-driven dataflow equals homomorphic target");
  same(memory.ensure(source.end,directEnd),endFact,
    "final mapping fact exact");

  // Replaying any closed tick is canonical and cannot create an alternative
  // dependency history.
  const beforeReplay=memory.linkCount;
  const replay1=executeContextNativeRuleSubcall(memory,C,t1.leaf);
  const replay2=executeContextNativeRuleSubcall(memory,C,t2.leaf);
  const replay3=executeContextNativeRuleSubcall(memory,C,t3.leaf);
  same(replay1.continuationContext,t1.next,"tick1 replay canonical");
  same(replay2.continuationContext,t2.next,"tick2 replay canonical");
  same(replay3.continuationContext,t3.next,"tick3 replay canonical");
  same(memory.linkCount,beforeReplay,"closed-tick replay adds no Links");

  // Final closure is explicit because this experiment tests dependency
  // propagation, not a ZERO/terminal Rule effect.
  memory.ensureEndSelfClosed(t3.next);
  setSame(currentWorkset(memory,C),[],
    "explicitly closing final output yields quiescent workset");
}

function sourceSlice(source:string,start:string,end:string):string{
  const i=source.indexOf(start),j=source.indexOf(end,i+1);
  assert(i>=0&&j>i,`source slice ${start}`);
  return source.slice(i,j).replace(/\s+/g,"");
}

function staticGuards():void{
  const root=resolve(process.cwd(),"..");
  const own=readFileSync(
    join(root,"ts/test/research-v013-rule-driven-homomorphism-dataflow-a71n.test.ts"),
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
  const a71m=readFileSync(
    join(root,"ts/test/research-v013-template-homomorphism-a71m.test.ts"),
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
    "A71n workset source-identical A70f",
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
    "A71n authority derivation source-identical A71j",
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
    "A71n Rule output realization source-identical A71j",
  );
  same(
    sourceSlice(
      own,
      "function executeContextNativeRuleSubcall(",
      "\ninterface Tick",
    ),
    sourceSlice(
      a71j,
      "function executeContextNativeRuleSubcall(",
      "\ninterface ExecutionTree",
    ),
    "A71n Rule executor source-identical A71j",
  );

  const tickSource=sourceSlice(
    own,
    "function tick(",
    "\nfunction exercise(",
  );
  for(const forbidden of [
    "pending",
    "ready",
    "stage",
    "pair",
    "start",
    "end",
    "template",
    "RuleKind",
    "opcode",
    "selectedRule",
  ]){
    assert(!tickSource.toLowerCase().includes(forbidden.toLowerCase()),
      `A71n generic tick excludes dependency scheduler term ${forbidden}`);
  }
  assert(tickSource.includes("currentWorkset(memory,contextRoot)"),
    "tick derives executable leaf from global workset");
  assert(tickSource.includes("executeContextNativeRuleSubcall("),
    "tick delegates Rule choice to active topology");

  assert(a71m.includes(
    "TEMPLATE_INSTANTIATION_IS_STRUCTURAL_HOMOMORPHISM=GREEN_SCOPED_RESEARCH"
  ),"A71n targets exact A71m dependency-propagation residual");
}

function main():void{
  exercise(false);
  exercise(true);
  staticGuards();

  console.log([
    "MTS v0.13 A71n: RULE_DRIVEN_HOMOMORPHISM_DATAFLOW=GREEN_SCOPED_RESEARCH",
    "SOURCE_TEMPLATE=PAIR_THEN_START_THEN_END",
    "INITIAL_AUTHORITY=ROLE_BINDING_ENVIRONMENT",
    "PAIR_IMAGE_FACT=RULE_OUTPUT",
    "START_IMAGE_FACT=RULE_OUTPUT",
    "END_IMAGE_FACT=RULE_OUTPUT",
    "NEXT_DEPENDENCY=SELECTED_BY_ACTIVE_CONTEXT_TOPOLOGY",
    "HOST_PENDING_SET=0 HOST_READY_SET=0 HOST_TEMPLATE_NODE_SELECTOR=0",
    "GENERIC_TICK=WORKSET_PLUS_CONTEXT_NATIVE_RULE_EXECUTION",
    "FINAL_IMAGE=EXACT_A71M_HOMOMORPHIC_TARGET",
    "CLOSED_HISTORY=IMMUTABLE",
    "REPLAY=CANONICAL",
    "HOST_GLOBAL_TICK_ITERATION=RESIDUAL",
    "RULE_NETWORK_AUTHORING_FROM_TEMPLATE=RESIDUAL",
    "A71J_OUTPUT_TEMPLATE_REALIZER=HOST_PHYSICAL_REALIZER_RESIDUAL",
    "FINAL_OUTPUT_CLOSURE=EXPLICIT_FIXTURE_BOUNDARY",
    "CYCLIC_GRAPH_PROPAGATION=NOT_SOLVED",
    "NEXT=A71O_GENERICIZE_TEMPLATE_TO_RULE_DATAFLOW_OR_CLASSIFY_BOOTSTRAP_BOUNDARY",
    "FULL_SELF_HOSTED=FALSE",
    "V013_NOT_ACCEPTED PRODUCTION_UNCHANGED",
  ].join(" "));
}

main();
