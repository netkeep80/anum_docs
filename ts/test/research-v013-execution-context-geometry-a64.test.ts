import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { Memory, ensureRootBasis, type LinkHandle } from "../src/memory.js";
import { defineContext, readContext } from "../src/state.js";

function assert(c:unknown,m:string):asserts c{if(!c)throw new Error(`v0.13 A64 execution-context geometry: ${m}`);}
function same<T>(a:T,e:T,m:string):void{assert(Object.is(a,e),`${m}: values differ`);}

interface ContextStep{
  readonly parent:LinkHandle;
  readonly value:LinkHandle;
  readonly payload:LinkHandle;
  readonly context:LinkHandle;
}
function contextStep(memory:Memory,parent:LinkHandle,value:LinkHandle):ContextStep{
  const payload=memory.ensure(parent,value);
  const context=defineContext(memory,parent,value);
  const kp=memory.poles(context),pp=memory.poles(payload),state=readContext(memory,context);
  same(kp.start,context,"A64 context is START-self-closed");
  same(kp.end,payload,"A64 context END is parent/value payload");
  same(pp.start,parent,"A64 payload START is previous context");
  same(pp.end,value,"A64 payload END is next argument/value");
  same(state.parent,parent,"A64 readContext parent");
  same(state.current,value,"A64 readContext current");
  return Object.freeze({parent,value,payload,context});
}

interface ApplicationStep{
  readonly previous:LinkHandle;
  readonly value:LinkHandle;
  readonly application:LinkHandle;
}
function applicationStep(memory:Memory,previous:LinkHandle,value:LinkHandle):ApplicationStep{
  const application=memory.ensure(previous,value),p=memory.poles(application);
  same(p.start,previous,"A64 previous application whole becomes next START");
  same(p.end,value,"A64 application value occupies END");
  return Object.freeze({previous,value,application});
}

function exercise(noise:boolean):void{
  const memory=new Memory(),b=ensureRootBasis(memory);
  if(noise)memory.ensure(memory.ensure(b.U,b.C),memory.ensure(b.O,b.L));

  const x1=memory.ensure(b.O,b.C),x2=memory.ensure(b.C,b.O);
  const xa=memory.ensure(x1,b.L),xb=memory.ensure(x1,b.U),z=memory.ensure(x2,b.L);
  const f=memory.ensure(b.L,b.U);

  // Ordinary left-fold application: (f->x1)->x2.
  const a1=applicationStep(memory,f,x1);
  const a2=applicationStep(memory,a1.application,x2);
  same(memory.poles(a2.application).start,a1.application,
    "A64 previous application whole alternates into START role");
  same(memory.poles(a2.application).start,a1.application,
    "A64 application inner Link occupies outer START");

  // Context recurrence is the START-lift of the same binary recurrence.
  const k0=contextStep(memory,memory.root,f).context;
  const k1=contextStep(memory,k0,x1);
  const k2=contextStep(memory,k1.context,x2);
  same(memory.poles(k2.payload).start,k1.context,
    "A64 previous context whole alternates into next payload START");
  same(memory.poles(k2.context).end,k2.payload,
    "A64 new context whole wraps payload through START closure");
  same(memory.poles(k2.context).end,k2.payload,
    "A64 context inner Link occupies outer END");
  assert(memory.poles(a2.application).start===a1.application&&memory.poles(k2.context).end===k2.payload,
    "A64 two-Link application/context forms place inner Link on opposite outer poles");

  // Argument order is structural, not an unordered bag.
  const k21=contextStep(memory,contextStep(memory,k0,x2).context,x1).context;
  assert(k21!==k2.context,"A64 x1/x2 and x2/x1 context histories differ");

  // A flat replacement at k0 is not the same execution history as nested application.
  const flat=contextStep(memory,k0,x2).context;
  assert(flat!==k2.context,"A64 nested execution context does not collapse to flat current value");

  // MANY: distinct results produce sibling child contexts under one selected parent.
  const ka=contextStep(memory,k2.context,xa);
  const kb=contextStep(memory,k2.context,xb);
  assert(ka.context!==kb.context,"A64 MANY produces distinct sibling contexts");
  same(readContext(memory,ka.context).parent,k2.context,"A64 branch A lexical parent");
  same(readContext(memory,kb.context).parent,k2.context,"A64 branch B lexical parent");

  // Both branches may later carry the same current value, but ancestry remains distinct.
  const kza=contextStep(memory,ka.context,z);
  const kzb=contextStep(memory,kb.context,z);
  same(readContext(memory,kza.context).current,z,"A64 converged branch A current value");
  same(readContext(memory,kzb.context).current,z,"A64 converged branch B current value");
  assert(kza.context!==kzb.context,"A64 converged value does not collapse branch contexts");
  assert(readContext(memory,kza.context).parent!==readContext(memory,kzb.context).parent,
    "A64 converged branches preserve distinct immediate ancestry");

  // Re-materialization order is non-semantic: canonical identities are stable.
  same(contextStep(memory,k2.context,xb).context,kb.context,
    "A64 branch B identity independent of later materialization order");
  same(contextStep(memory,k2.context,xa).context,ka.context,
    "A64 branch A identity independent of later materialization order");
}

function staticGuards():void{
  const root=resolve(process.cwd(),"..");
  const state=readFileSync(join(root,"ts/src/state.ts"),"utf8");
  const a13=readFileSync(join(root,"ts/test/research-v013-meta-interpreter-frontier-a13.test.ts"),"utf8");
  const own=readFileSync(join(root,"ts/test/research-v013-execution-context-geometry-a64.test.ts"),"utf8");

  assert(state.includes("const payload = memory.ensure(parent, current);"),
    "A64 current MTS context payload is parent->current");
  assert(state.includes("return memory.ensureStartSelfClosed(payload);"),
    "A64 current MTS context is START(payload)");
  assert(a13.includes("A13 branch contexts differ"),
    "A64 inherits prior branch-local context evidence");
  assert(a13.includes("A13 convergence preserves two branches"),
    "A64 inherits convergence provenance evidence");
  for(const forbidden of ["jsonRVM","$sub","$obj","$rel","parent_ref","ctx_ref"])
    assert(!own.includes(forbidden),`A64 normative test excludes imported historical semantics ${forbidden}`);
}

function main():void{
  exercise(false);
  exercise(true);
  staticGuards();
  console.log([
    "MTS v0.13 A64: EXECUTION_CONTEXT_GEOMETRY=GREEN_SCOPED_RESEARCH",
    "APPLICATION_RECURRENCE=F_PREV_TO_VALUE",
    "CONTEXT_PAYLOAD_RECURRENCE=K_PREV_TO_VALUE",
    "CONTEXT_WHOLE=START_OF_PAYLOAD",
    "CONTEXT_NORMAL_FORM=K_SELF_TO_(PARENT_TO_CURRENT)",
    "ROLE_ALTERNATION=PREVIOUS_WHOLE_BECOMES_NEXT_START",
    "INNER_LINK_ROLE_APPLICATION=OUTER_START",
    "INNER_LINK_ROLE_CONTEXT=OUTER_END",
    "TWO_LINK_CHIRAL_PLACEMENT=CONFIRMED",
    "MULTI_ARGUMENT_CONTEXT=NESTED_NOT_FLAT",
    "ARGUMENT_ORDER=STRUCTURAL",
    "MANY_RESULT=CHILD_CONTEXT_SPLIT",
    "CONVERGED_CURRENT_VALUE=PRESERVES_DISTINCT_CONTEXT_ANCESTRY",
    "APPLICATION_CONTEXT_FORMAL_DUALITY=HYPOTHESIS_NOT_CLAIMED",
    "JSONRVM=NORMATIVE_AUTHORITY_0",
    "A64_OLD_FLAT_PROVENANCE_PR=SUPERSEDED",
    "NEXT=A65_TEST_LIFECYCLE_AS_CONTEXT_ANCESTRY_BEFORE_SEPARATE_PROVENANCE_OBJECT",
    "GLOBAL_E2=OPEN GLOBAL_E3=OPEN GLOBAL_E4=OPEN FULL_SELF_HOSTED=FALSE",
    "V013_NOT_ACCEPTED PRODUCTION_UNCHANGED",
  ].join(" "));
}
main();
