import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
} from "../src/memory.js";
import type { StructuralRoleBinding } from "../src/structural-rule.js";

function assert(c:unknown,m:string):asserts c{
  if(!c)throw new Error(`v0.13 A71m template homomorphism: ${m}`);
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

/**
 * Exact local A71l reconstruction law.
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

interface HomomorphicInstantiation{
  readonly output:LinkHandle;
  readonly mapping:ReadonlyMap<LinkHandle,LinkHandle>;
}

function instantiateHomomorphically(
  memory:Memory,
  template:LinkHandle,
  declaredRoles:readonly LinkHandle[],
  bindings:readonly StructuralRoleBinding[],
  schedule:"forward"|"reverse",
):HomomorphicInstantiation{
  const mapping=new Map<LinkHandle,LinkHandle>();
  for(const binding of bindings){
    const previous=mapping.get(binding.role);
    if(previous!==undefined)same(previous,binding.value,"binding consistent");
    else mapping.set(binding.role,binding.value);
  }

  const roles=new Set(declaredRoles);
  same(roles.size,declaredRoles.length,"declared roles unique");
  for(const role of declaredRoles){
    assert(mapping.has(role),"all declared roles have bindings");
  }
  for(const role of mapping.keys()){
    assert(roles.has(role),"binding role is declared");
  }

  let pending=[...collectTemplateNodes(memory,template,roles)];

  while(pending.length>0){
    const scan=schedule==="forward"?pending:[...pending].reverse();
    const done=new Set<LinkHandle>();
    let progress=false;

    for(const node of scan){
      if(dependencies(memory,node).some(dep=>!mapping.has(dep)))continue;
      const step=instantiateLocalNode(memory,node,mapping);
      mapping.set(node,step.value);
      done.add(node);
      progress=true;
    }

    assert(progress,"finite acyclic homomorphism makes progress");
    pending=pending.filter(x=>!done.has(x));
  }

  const output=mapping.get(template);
  assert(output!==undefined,"template root instantiated");
  return Object.freeze({
    output,
    mapping:new Map(mapping),
  });
}

interface TemplateFixture{
  readonly root:LinkHandle;
  readonly roles:readonly LinkHandle[];
}

function defineTemplate(memory:Memory,seed:LinkHandle):TemplateFixture{
  const b=ensureRootBasis(memory);
  const xRole=memory.ensure(seed,b.O);
  const yRole=memory.ensure(seed,b.C);

  const pairXY=memory.ensure(xRole,yRole);
  const startPair=memory.ensureStartSelfClosed(pairXY);
  const endX=memory.ensureEndSelfClosed(xRole);
  const pairWithRoot=memory.ensure(memory.root,endX);
  const middle=memory.ensure(startPair,pairWithRoot);
  const outerEnd=memory.ensureEndSelfClosed(middle);
  const root=memory.ensure(startPair,outerEnd);

  return Object.freeze({
    root,
    roles:Object.freeze([xRole,yRole]),
  });
}

function makeBindings(
  roles:readonly LinkHandle[],
  x:LinkHandle,
  y:LinkHandle,
):readonly StructuralRoleBinding[]{
  assert(roles.length===2,"two role fixture");
  return Object.freeze([
    Object.freeze({role:roles[0]!,value:x}),
    Object.freeze({role:roles[1]!,value:y}),
  ]);
}

function verifyHomomorphism(
  memory:Memory,
  template:TemplateFixture,
  result:HomomorphicInstantiation,
):void{
  const roleSet=new Set(template.roles);
  for(const source of collectTemplateNodes(memory,template.root,roleSet)){
    const target=result.mapping.get(source);
    assert(target!==undefined,"every source node has target image");

    const sourceAspect=aspect(memory,source);
    same(aspect(memory,target),sourceAspect,
      "homomorphism preserves local aspect");

    const s=memory.poles(source);
    const t=memory.poles(target);

    if(sourceAspect==="ROOT"){
      same(target,memory.root,"ROOT maps to ROOT");
      continue;
    }

    if(sourceAspect==="START"){
      same(t.start,target,"START target self incidence");
      same(t.end,result.mapping.get(s.end),
        "START child image preserved");
      continue;
    }

    if(sourceAspect==="END"){
      same(t.end,target,"END target self incidence");
      same(t.start,result.mapping.get(s.start),
        "END child image preserved");
      continue;
    }

    same(t.start,result.mapping.get(s.start),
      "PAIR start image preserved");
    same(t.end,result.mapping.get(s.end),
      "PAIR end image preserved");
  }
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

  const template=defineTemplate(memory,at(0));
  const x=memory.ensure(at(1),at(2));
  const y=memory.ensure(at(3),at(4));
  const directBindings=makeBindings(template.roles,x,y);

  const forward=instantiateHomomorphically(
    memory,template.root,template.roles,directBindings,"forward",
  );
  const reverse=instantiateHomomorphically(
    memory,template.root,template.roles,directBindings,"reverse",
  );
  same(forward.output,reverse.output,
    "forward/reverse schedules yield exact same homomorphic extension");
  verifyHomomorphism(memory,template,forward);
  verifyHomomorphism(memory,template,reverse);

  // Identity substitution extends to exact identity on the whole template.
  const identity=instantiateHomomorphically(
    memory,
    template.root,
    template.roles,
    makeBindings(template.roles,template.roles[0]!,template.roles[1]!),
    "reverse",
  );
  same(identity.output,template.root,
    "identity role substitution extends to identity template homomorphism");

  // Composition law:
  //
  //   h_sigma(h_rho(template)) = h_(sigma o rho)(template)
  //
  // First map roles to intermediate values, then treat those intermediate
  // values as the roles of the grounded output and map them again.
  const midX=memory.ensure(at(5),at(6));
  const midY=memory.ensure(at(7),at(8));
  const finalX=memory.ensure(at(9),at(10));
  const finalY=memory.ensure(at(11),at(12));

  const first=instantiateHomomorphically(
    memory,
    template.root,
    template.roles,
    makeBindings(template.roles,midX,midY),
    "forward",
  );
  const second=instantiateHomomorphically(
    memory,
    first.output,
    Object.freeze([midX,midY]),
    makeBindings(Object.freeze([midX,midY]),finalX,finalY),
    "reverse",
  );
  const direct=instantiateHomomorphically(
    memory,
    template.root,
    template.roles,
    makeBindings(template.roles,finalX,finalY),
    "reverse",
  );
  same(second.output,direct.output,
    "homomorphic instantiation obeys substitution composition");

  // Physical substrate boundary: ordinary PAIR construction is not enough to
  // create fresh self-incidence. START/END are distinct canonical constructors.
  const child=memory.ensure(at(13),at(14));
  const ordinary=memory.ensure(child,child);
  same(aspect(memory,ordinary),"PAIR",
    "ordinary ensure(child,child) remains PAIR");

  const start=memory.ensureStartSelfClosed(child);
  const end=memory.ensureEndSelfClosed(child);
  same(aspect(memory,start),"START","START physical constructor");
  same(aspect(memory,end),"END","END physical constructor");
  assert(start!==ordinary,"START is not reducible to ordinary equal-pole PAIR");
  assert(end!==ordinary,"END is not reducible to ordinary equal-pole PAIR");
  same(memory.poles(start).start,start,
    "fresh START requires output identity as its own pole");
  same(memory.poles(end).end,end,
    "fresh END requires output identity as its own pole");
  same(memory.ensureRoot(),memory.root,"ROOT constructor is canonical root");

  // Post-hoc direct shape of direct(finalX,finalY).
  const pair=memory.ensure(finalX,finalY);
  const startPair=memory.ensureStartSelfClosed(pair);
  const endX=memory.ensureEndSelfClosed(finalX);
  const pairWithRoot=memory.ensure(memory.root,endX);
  const middle=memory.ensure(startPair,pairWithRoot);
  const outerEnd=memory.ensureEndSelfClosed(middle);
  const expected=memory.ensure(startPair,outerEnd);
  same(direct.output,expected,"direct structural oracle exact");
}

function sourceSlice(source:string,start:string,end:string):string{
  const i=source.indexOf(start),j=source.indexOf(end,i+1);
  assert(i>=0&&j>i,`source slice ${start}`);
  return source.slice(i,j).replace(/\s+/g,"");
}

function staticGuards():void{
  const root=resolve(process.cwd(),"..");
  const own=readFileSync(
    join(root,"ts/test/research-v013-template-homomorphism-a71m.test.ts"),
    "utf8",
  );
  const a71l=readFileSync(
    join(root,"ts/test/research-v013-template-local-kernel-a71l.test.ts"),
    "utf8",
  );
  const cycle=readFileSync(
    join(root,"ts/test/research-v013-finite-recursive-description-boundary.test.ts"),
    "utf8",
  );

  same(
    sourceSlice(
      own,
      "function instantiateLocalNode(",
      "\ninterface HomomorphicInstantiation",
    ),
    sourceSlice(
      a71l,
      "function instantiateLocalNode(",
      "\ninterface IterativeInstantiation",
    ),
    "A71m local reconstruction is source-identical A71l",
  );

  const verify=sourceSlice(
    own,
    "function verifyHomomorphism(",
    "\nfunction exercise(",
  );
  for(const required of [
    'same(aspect(memory,target),sourceAspect',
    'same(target,memory.root',
    'same(t.end,result.mapping.get(s.end)',
    'same(t.start,result.mapping.get(s.start)',
  ]){
    assert(verify.includes(required),
      `A71m homomorphism verifies ${required}`);
  }

  const local=sourceSlice(
    own,
    "function instantiateLocalNode(",
    "\ninterface HomomorphicInstantiation",
  );
  for(const forbidden of [
    "RuleKind",
    "opcode",
    "theory",
    "interpreter",
    "request",
    "Context",
  ]){
    assert(!local.includes(forbidden),
      `A71m local law excludes semantic selector ${forbidden}`);
  }

  assert(cycle.includes(
    "current tree projection cannot give them a finite carrier"
  ),"A71m does not erase distinct-node cycle boundary");
}

function main():void{
  exercise(false);
  exercise(true);
  staticGuards();

  console.log([
    "MTS v0.13 A71m: TEMPLATE_INSTANTIATION_IS_STRUCTURAL_HOMOMORPHISM=GREEN_SCOPED_RESEARCH",
    "ROLE_SUBSTITUTION=GENERATOR_MAPPING",
    "UNIQUE_FINITE_ACYCLIC_EXTENSION=ROOT_START_END_PAIR_PRESERVING",
    "IDENTITY_SUBSTITUTION=IDENTITY_HOMOMORPHISM",
    "SUBSTITUTION_COMPOSITION=GREEN",
    "FORWARD_REVERSE_SCHEDULE=SAME_EXTENSION",
    "LOCAL_ASPECT=PRESERVED_FOR_EVERY_INSTANTIATED_NODE",
    "ORDINARY_PAIR_CONSTRUCTOR_DOES_NOT_SUBSUME_START_END",
    "ROOT_START_END_PAIR_CONSTRUCTORS=PHYSICAL_SELF_INCIDENCE_KERNEL",
    "HOST_ASPECT_BRANCHING=IMPLEMENTATION_OF_HOMOMORPHISM_NOT_DOMAIN_SEMANTICS",
    "HOST_DEPENDENCY_PROPAGATION=RESIDUAL",
    "ROLE_BINDING_SEED=AUTHORITY_INPUT",
    "CYCLIC_GRAPH_HOMOMORPHISM=NOT_SOLVED",
    "NEXT=A71N_CONNECT_HOMOMORPHIC_DEPENDENCY_PROPAGATION_TO_APAMEMORY_DYNAMICS",
    "FULL_SELF_HOSTED=FALSE",
    "V013_NOT_ACCEPTED PRODUCTION_UNCHANGED",
  ].join(" "));
}

main();
