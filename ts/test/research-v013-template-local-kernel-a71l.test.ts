import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
} from "../src/memory.js";
import type { StructuralRoleBinding } from "../src/structural-rule.js";

function assert(c:unknown,m:string):asserts c{
  if(!c)throw new Error(`v0.13 A71l template local kernel: ${m}`);
}
function same<T>(a:T,e:T,m:string):void{
  assert(Object.is(a,e),`${m}: values differ`);
}

type Aspect="ROOT"|"START"|"END"|"PAIR";

function aspect(memory:Memory,link:LinkHandle):Aspect{
  const p=memory.poles(link);
  const s=p.start===link;
  const e=p.end===link;
  if(s&&e)return "ROOT";
  if(s)return "START";
  if(e)return "END";
  return "PAIR";
}

/** Source-equivalent A71h recursive oracle. */
function instantiateRecursive(
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

function collectTemplateNodes(
  memory:Memory,
  root:LinkHandle,
  roles:ReadonlySet<LinkHandle>,
):readonly LinkHandle[]{
  const out:LinkHandle[]=[];
  const seen=new Set<LinkHandle>();
  const stack=[root];

  while(stack.length>0){
    const node=stack.pop()!;
    if(roles.has(node)||seen.has(node))continue;
    seen.add(node);
    out.push(node);

    const p=memory.poles(node);
    const kind=aspect(memory,node);
    if(kind==="ROOT")continue;
    if(kind==="START"){
      stack.push(p.end);
      continue;
    }
    if(kind==="END"){
      stack.push(p.start);
      continue;
    }
    stack.push(p.start,p.end);
  }

  return Object.freeze(out);
}

function dependencies(
  memory:Memory,
  node:LinkHandle,
):readonly LinkHandle[]{
  const p=memory.poles(node);
  const kind=aspect(memory,node);
  if(kind==="ROOT")return Object.freeze([]);
  if(kind==="START")return Object.freeze([p.end]);
  if(kind==="END")return Object.freeze([p.start]);
  return Object.freeze([p.start,p.end]);
}

interface KernelCounters{
  readonly root:number;
  readonly start:number;
  readonly end:number;
  readonly pair:number;
}

/**
 * One local instantiation step.
 *
 * No recursion and no domain semantics: classify one source Link by exact
 * self-incidence and rebuild the same local aspect from already-instantiated
 * dependencies.
 */
function instantiateLocalNode(
  memory:Memory,
  source:LinkHandle,
  mapping:ReadonlyMap<LinkHandle,LinkHandle>,
):Readonly<{value:LinkHandle;aspect:Aspect}>{
  const p=memory.poles(source);
  const kind=aspect(memory,source);

  if(kind==="ROOT"){
    return Object.freeze({value:memory.ensureRoot(),aspect:kind});
  }

  if(kind==="START"){
    const child=mapping.get(p.end);
    assert(child!==undefined,"START dependency already instantiated");
    return Object.freeze({
      value:memory.ensureStartSelfClosed(child),
      aspect:kind,
    });
  }

  if(kind==="END"){
    const child=mapping.get(p.start);
    assert(child!==undefined,"END dependency already instantiated");
    return Object.freeze({
      value:memory.ensureEndSelfClosed(child),
      aspect:kind,
    });
  }

  const start=mapping.get(p.start);
  const end=mapping.get(p.end);
  assert(start!==undefined&&end!==undefined,
    "PAIR dependencies already instantiated");
  return Object.freeze({
    value:memory.ensure(start,end),
    aspect:kind,
  });
}

interface IterativeInstantiation{
  readonly output:LinkHandle;
  readonly counters:KernelCounters;
  readonly rounds:number;
}

/**
 * Host fixed-point scheduler over the local kernel.
 *
 * It is deliberately different from recursive DFS. Eligible nodes may be
 * visited forward or reverse; canonical output must not depend on that order.
 */
function instantiateByLocalKernel(
  memory:Memory,
  template:LinkHandle,
  bindings:readonly StructuralRoleBinding[],
  schedule:"forward"|"reverse",
):IterativeInstantiation{
  const mapping=new Map<LinkHandle,LinkHandle>();
  for(const binding of bindings){
    const previous=mapping.get(binding.role);
    if(previous!==undefined)same(previous,binding.value,"binding consistent");
    else mapping.set(binding.role,binding.value);
  }
  const roles=new Set(bindings.map(x=>x.role));
  let pending=[...collectTemplateNodes(memory,template,roles)];
  let root=0,start=0,end=0,pair=0;
  let rounds=0;

  while(pending.length>0){
    rounds+=1;
    const scan=schedule==="forward"?pending:[...pending].reverse();
    const done=new Set<LinkHandle>();
    let progress=false;

    for(const node of scan){
      const deps=dependencies(memory,node);
      if(deps.some(dep=>!mapping.has(dep)))continue;

      const step=instantiateLocalNode(memory,node,mapping);
      mapping.set(node,step.value);
      done.add(node);
      progress=true;

      if(step.aspect==="ROOT")root+=1;
      else if(step.aspect==="START")start+=1;
      else if(step.aspect==="END")end+=1;
      else pair+=1;
    }

    assert(progress,"acyclic template must make local-kernel progress");
    pending=pending.filter(x=>!done.has(x));
  }

  const output=mapping.get(template);
  assert(output!==undefined,"template root instantiated");
  return Object.freeze({
    output,
    counters:Object.freeze({root,start,end,pair}),
    rounds,
  });
}

interface TemplateFixture{
  readonly root:LinkHandle;
  readonly roles:readonly LinkHandle[];
}

function defineTemplate(
  memory:Memory,
  seed:LinkHandle,
):TemplateFixture{
  const b=ensureRootBasis(memory);
  const xRole=memory.ensure(seed,b.O);
  const yRole=memory.ensure(seed,b.C);

  // Deliberately exercises all four structural aspects outside role nodes:
  //
  //   pairXY = X -> Y
  //   start  = START(pairXY)
  //   end    = END(X)
  //   inner  = R -> end
  //   root   = start -> inner
  //
  // R is the ROOT aspect and is reconstructed through ensureRoot().
  const pairXY=memory.ensure(xRole,yRole);
  const start=memory.ensureStartSelfClosed(pairXY);
  const end=memory.ensureEndSelfClosed(xRole);
  const inner=memory.ensure(memory.root,end);
  const root=memory.ensure(start,inner);

  return Object.freeze({
    root,
    roles:Object.freeze([xRole,yRole]),
  });
}

function bindings(
  roles:readonly LinkHandle[],
  x:LinkHandle,
  y:LinkHandle,
):readonly StructuralRoleBinding[]{
  assert(roles.length===2,"two roles");
  return Object.freeze([
    Object.freeze({role:roles[0]!,value:x}),
    Object.freeze({role:roles[1]!,value:y}),
  ]);
}

function exercise(noise:boolean):void{
  const memory=new Memory();
  const b=ensureRootBasis(memory);
  if(noise)memory.ensure(memory.ensure(b.U,b.C),memory.ensure(b.O,b.L));

  const fresh:LinkHandle[]=[];
  let seed=memory.ensure(b.U,b.L);
  for(let i=0;i<20;i+=1){
    seed=memory.ensure(seed,i%2===0?b.O:b.C);
    fresh.push(seed);
  }
  const at=(i:number):LinkHandle=>{
    const value=fresh[i];
    assert(value!==undefined,`fresh anchor ${i}`);
    return value;
  };

  // Two isomorphic templates with different role/template identities.
  const a=defineTemplate(memory,at(0));
  const c=defineTemplate(memory,at(1));
  assert(a.root!==c.root,"source template roots distinct");

  const x=memory.ensure(at(2),at(3));
  const y=memory.ensure(at(4),at(5));
  const ba=bindings(a.roles,x,y);
  const bc=bindings(c.roles,x,y);

  // Recursive oracle establishes current A71h semantics.
  const oracleA=instantiateRecursive(memory,a.root,ba);
  const oracleC=instantiateRecursive(memory,c.root,bc);
  same(oracleA,oracleC,
    "isomorphic templates with same role values converge recursively");

  // Local-kernel realization must produce the same canonical output.
  const beforeForward=memory.linkCount;
  const forward=instantiateByLocalKernel(memory,a.root,ba,"forward");
  same(forward.output,oracleA,
    "forward local kernel equals recursive oracle");
  same(memory.linkCount,beforeForward,
    "oracle already materialized exact local-kernel output");

  const beforeReverse=memory.linkCount;
  const reverse=instantiateByLocalKernel(memory,c.root,bc,"reverse");
  same(reverse.output,oracleA,
    "reverse local kernel equals same canonical output");
  same(memory.linkCount,beforeReverse,
    "reverse schedule adds no alternative topology");

  // Every aspect is exercised by the local kernel.
  assert(forward.counters.root>0,"ROOT reconstruction exercised");
  assert(forward.counters.start>0,"START reconstruction exercised");
  assert(forward.counters.end>0,"END reconstruction exercised");
  assert(forward.counters.pair>0,"PAIR reconstruction exercised");
  same(reverse.counters.root,forward.counters.root,"ROOT count schedule invariant");
  same(reverse.counters.start,forward.counters.start,"START count schedule invariant");
  same(reverse.counters.end,forward.counters.end,"END count schedule invariant");
  same(reverse.counters.pair,forward.counters.pair,"PAIR count schedule invariant");

  // Direct expected topology, checked only after both generic realizations.
  const pair=memory.ensure(x,y);
  const start=memory.ensureStartSelfClosed(pair);
  const end=memory.ensureEndSelfClosed(x);
  const inner=memory.ensure(memory.root,end);
  const expected=memory.ensure(start,inner);
  same(oracleA,expected,"post-hoc structural oracle exact");

  // Missing role binding cannot progress to a complete output.
  let missingRejected=false;
  try{
    instantiateByLocalKernel(
      memory,
      a.root,
      Object.freeze([ba[0]!]),
      "forward",
    );
  }catch{
    missingRejected=true;
  }
  assert(missingRejected,"missing role binding fails closed");

  // The experiment is intentionally finite/acyclic. A distinct-node cycle is
  // outside this local scheduling witness and remains the historical recursive
  // description boundary.
}

function sourceSlice(source:string,start:string,end:string):string{
  const i=source.indexOf(start),j=source.indexOf(end,i+1);
  assert(i>=0&&j>i,`source slice ${start}`);
  return source.slice(i,j).replace(/\s+/g,"");
}

function staticGuards():void{
  const root=resolve(process.cwd(),"..");
  const own=readFileSync(
    join(root,"ts/test/research-v013-template-local-kernel-a71l.test.ts"),
    "utf8",
  );
  const a71h=readFileSync(
    join(root,"ts/test/research-v013-rule-carried-output-template-a71h.test.ts"),
    "utf8",
  );
  const basis=readFileSync(
    join(root,"ts/test/v013-link-native-abit-basis.test.ts"),
    "utf8",
  );
  const cycle=readFileSync(
    join(root,"ts/test/research-v013-finite-recursive-description-boundary.test.ts"),
    "utf8",
  );

  // Recursive oracle keeps the exact A71h reconstruction law.
  const oracle=sourceSlice(
    own,
    "function instantiateRecursive(",
    "\nfunction collectTemplateNodes(",
  );
  assert(oracle.includes("memory.ensureRoot()"),"recursive oracle ROOT");
  assert(oracle.includes("memory.ensureStartSelfClosed("),"recursive oracle START");
  assert(oracle.includes("memory.ensureEndSelfClosed("),"recursive oracle END");
  assert(oracle.includes("memory.ensure(start,end)"),"recursive oracle PAIR");
  assert(a71h.includes("function instantiateStructuralTemplate("),
    "A71l attacks exact A71h template-instantiation residual");

  const local=sourceSlice(
    own,
    "function instantiateLocalNode(",
    "\ninterface IterativeInstantiation",
  );
  assert(!local.includes("instantiateLocalNode(" + "memory,"),
    "local kernel does not recurse into itself");
  for(const forbidden of [
    "RuleKind",
    "opcode",
    "theory",
    "interpreter",
    "request",
    "Context",
    "templateName",
  ]){
    assert(!local.includes(forbidden),
      `local kernel excludes domain semantic selector ${forbidden}`);
  }
  assert(local.includes("memory.ensureRoot()"),"local kernel ROOT constructor");
  assert(local.includes("memory.ensureStartSelfClosed(child)"),
    "local kernel START constructor");
  assert(local.includes("memory.ensureEndSelfClosed(child)"),
    "local kernel END constructor");
  assert(local.includes("memory.ensure(start,end)"),
    "local kernel PAIR constructor");

  assert(basis.includes(
    'type StructuralClass = "ROOT" | "START" | "END" | "PAIR"'
  ),"local kernel reuses exact four-aspect foundation");
  assert(cycle.includes(
    "four local aspects themselves still"
  ),"A71l keeps cyclic-description boundary explicit");
}

function main():void{
  exercise(false);
  exercise(true);
  staticGuards();

  console.log([
    "MTS v0.13 A71l: TEMPLATE_INSTANTIATION_LOCAL_KERNEL=GREEN_SCOPED_RESEARCH",
    "RECURSIVE_A71H_SEMANTICS=LOCALIZED",
    "LOCAL_KERNEL=ROLE_SUBSTITUTION_PLUS_ROOT_START_END_PAIR_RECONSTRUCTION",
    "LOCAL_NODE_RECURSION=0",
    "ROOT_START_END_PAIR=ALL_EXERCISED",
    "FORWARD_REVERSE_DEPENDENCY_SCHEDULE=SAME_CANONICAL_OUTPUT",
    "ISOMORPHIC_TEMPLATE_IDENTITIES=SAME_GROUNDED_OUTPUT",
    "POST_HOC_STRUCTURAL_ORACLE=EXACT",
    "MISSING_ROLE_BINDING=FAIL_CLOSED",
    "HOST_RECURSIVE_DFS=NOT_SEMANTIC_FOR_FINITE_ACYCLIC_FIXTURE",
    "HOST_DEPENDENCY_DISCOVERY_AND_FIXED_POINT_SCHEDULING=RESIDUAL",
    "HOST_LOCAL_ASPECT_DISPATCH=RESIDUAL",
    "ROLE_BINDING_SEED=AUTHORITY_INPUT",
    "CYCLIC_TEMPLATE_REALIZATION=NOT_SOLVED",
    "NEXT=A71M_RULE_CARRY_LOCAL_ASPECT_RECONSTRUCTION_OR_MINIMAL_KERNEL_BOUNDARY",
    "FULL_SELF_HOSTED=FALSE",
    "V013_NOT_ACCEPTED PRODUCTION_UNCHANGED",
  ].join(" "));
}

main();
