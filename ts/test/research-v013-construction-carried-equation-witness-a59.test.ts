import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { materializeExactSequence, readExactSequence } from "../src/exact-sequence.js";
import { Memory, ensureRootBasis, type LinkHandle, type RootBasis } from "../src/memory.js";
function assert(c:unknown,m:string):asserts c{if(!c)throw new Error(`v0.13 A59 construction-carried equation witness: ${m}`);}
function same<T>(a:T,e:T,m:string):void{assert(Object.is(a,e),`${m}: values differ`);}
interface Frame{readonly startRole:LinkHandle;readonly endRole:LinkHandle;}
function frame(memory:Memory,b:RootBasis):Frame{const whole=memory.ensure(b.L,b.L),startRole=memory.ensureStartSelfClosed(whole),endRole=memory.ensureEndSelfClosed(whole);assert(startRole!==endRole,"A59 frame roles distinct");return Object.freeze({startRole,endRole});}
function makeRoles(memory:Memory,count:number,b:RootBasis):readonly LinkHandle[]{const marker=memory.ensure(b.U,b.U);let x=memory.ensure(b.L,marker);const out:LinkHandle[]=[];for(let i=0;i<count;i+=1){x=memory.ensure(x,marker);out.push(x);}same(new Set(out).size,count,"A59 construction roles distinct");return Object.freeze(out);}
interface PlanResult{readonly equation:LinkHandle;readonly witness:LinkHandle;readonly ordinary:number;}
function executeConstructionPlan(memory:Memory,plan:LinkHandle):PlanResult{
  const parts=readExactSequence(memory,plan).values;same(parts.length,3,"A59 plan arity");const [seeds,constraints,outputs]=parts;assert(seeds&&constraints&&outputs,"A59 plan complete");
  const values=new Map<LinkHandle,LinkHandle>();
  for(const binding of readExactSequence(memory,seeds).values){const p=memory.poles(binding);assert(!values.has(p.start),"A59 seed unique");values.set(p.start,p.end);}
  let ordinary=0;
  for(const encoded of readExactSequence(memory,constraints).values){const q=readExactSequence(memory,encoded).values;same(q.length,3,"A59 constraint arity");const [t,s,e]=q;assert(t&&s&&e,"A59 constraint complete");const sv=values.get(s),ev=values.get(e);assert(sv!==undefined&&ev!==undefined,"A59 constraint operands bound");const v=memory.ensure(sv,ev);ordinary+=1;const old=values.get(t);if(old!==undefined)same(old,v,"A59 target stable");else values.set(t,v);}
  const os=readExactSequence(memory,outputs).values;same(os.length,2,"A59 output arity");const equation=os[0]===undefined?undefined:values.get(os[0]),witness=os[1]===undefined?undefined:values.get(os[1]);assert(equation!==undefined&&witness!==undefined,"A59 outputs constructed");return Object.freeze({equation,witness,ordinary});
}
interface Template{readonly targetSeed:LinkHandle;readonly startSeed:LinkHandle;readonly endSeed:LinkHandle;readonly plan:LinkHandle;}
function defineTemplate(memory:Memory,f:Frame,b:RootBasis):Template{
  const targetSeed=memory.ensure(b.U,b.L),startSeed=memory.ensure(targetSeed,b.C),endSeed=memory.ensure(startSeed,b.O),rs=makeRoles(memory,11,b);let i=0;const role=()=>rs[i++]!;
  const rT=role(),rS=role(),rE=role(),rSR=role(),rER=role(),rPair=role(),rEquation=role(),rSB=role(),rEB=role(),rBindings=role(),rWitness=role();
  const seeds=materializeExactSequence(memory,[memory.ensure(rT,targetSeed),memory.ensure(rS,startSeed),memory.ensure(rE,endSeed),memory.ensure(rSR,f.startRole),memory.ensure(rER,f.endRole)]);
  const constraints=materializeExactSequence(memory,[
    materializeExactSequence(memory,[rPair,rS,rE]),
    materializeExactSequence(memory,[rEquation,rT,rPair]),
    materializeExactSequence(memory,[rSB,rSR,rT]),
    materializeExactSequence(memory,[rEB,rER,rPair]),
    materializeExactSequence(memory,[rBindings,rSB,rEB]),
    materializeExactSequence(memory,[rWitness,rBindings,rEquation]),
  ]);
  return Object.freeze({targetSeed,startSeed,endSeed,plan:materializeExactSequence(memory,[seeds,constraints,materializeExactSequence(memory,[rEquation,rWitness])])});
}
function instantiatePlan(memory:Memory,t:Template,target:LinkHandle,start:LinkHandle,end:LinkHandle):LinkHandle{
  const map=new Map<LinkHandle,LinkHandle>([[memory.root,memory.root],[t.targetSeed,target],[t.startSeed,start],[t.endSeed,end]]),visiting=new Set<LinkHandle>();
  const clone=(x:LinkHandle):LinkHandle=>{const known=map.get(x);if(known!==undefined)return known;assert(!visiting.has(x),"A59 unsupported non-self cycle");const p=memory.poles(x);let v:LinkHandle;if(p.start===x&&p.end===x)v=memory.ensureRoot();else if(p.start===x)v=memory.ensureStartSelfClosed(clone(p.end));else if(p.end===x)v=memory.ensureEndSelfClosed(clone(p.start));else{visiting.add(x);v=memory.ensure(clone(p.start),clone(p.end));visiting.delete(x);}map.set(x,v);return v;};
  return clone(t.plan);
}
interface Generated{readonly equation:LinkHandle;readonly witness:LinkHandle;}
function generate(memory:Memory,t:Template,target:LinkHandle,start:LinkHandle,end:LinkHandle):Generated{
  const beforeEquation=memory.find(target,memory.find(start,end)??memory.root);
  const plan=instantiatePlan(memory,t,target,start,end);
  const built=executeConstructionPlan(memory,plan);
  if(beforeEquation===undefined){const pair=memory.find(start,end);assert(pair!==undefined,"A59 pair constructed");same(memory.find(target,pair),built.equation,"A59 equation constructed canonically");}
  return Object.freeze({equation:built.equation,witness:built.witness});
}
function directOracle(memory:Memory,f:Frame,target:LinkHandle,start:LinkHandle,end:LinkHandle):Generated{const pair=memory.ensure(start,end),equation=memory.ensure(target,pair),sb=memory.ensure(f.startRole,target),eb=memory.ensure(f.endRole,pair),witness=memory.ensure(memory.ensure(sb,eb),equation);return Object.freeze({equation,witness});}
interface Evidence{readonly target:LinkHandle;readonly equation:LinkHandle;readonly pair:LinkHandle;}
function readA58Evidence(memory:Memory,f:Frame,witness:LinkHandle):Evidence{const wp=memory.poles(witness),bp=memory.poles(wp.start),sb=memory.poles(bp.start),eb=memory.poles(bp.end);same(sb.start,f.startRole,"A59 A58 START role");same(eb.start,f.endRole,"A59 A58 END role");const reconstructed=memory.ensure(sb.end,eb.end);same(reconstructed,wp.end,"A59 A58 reconstructed equation");return Object.freeze({target:sb.end,equation:wp.end,pair:eb.end});}
function fresh(memory:Memory,b:RootBasis):readonly [LinkHandle,LinkHandle,LinkHandle][]{const a=memory.ensure(b.C,b.U),d=memory.ensure(b.O,b.L);return Object.freeze([[memory.ensure(a,b.L),a,d],[memory.ensure(d,b.C),d,a],[memory.ensure(a,d),b.O,b.C]] as const);}
function exercise(memory:Memory,noise:boolean):void{
  const b=ensureRootBasis(memory);if(noise)memory.ensure(memory.ensure(b.U,b.C),b.O);const f=frame(memory,b),t=defineTemplate(memory,f,b),inputs=fresh(memory,b);
  const generated=inputs.map(([target,start,end])=>generate(memory,t,target,start,end));
  for(let i=0;i<inputs.length;i+=1){const [target,start,end]=inputs[i]!,g=generated[i]!,before=memory.linkCount,o=directOracle(memory,f,target,start,end);same(memory.linkCount,before,"A59 post-hoc oracle adds no Links");same(g.equation,o.equation,"A59 generated equation exact");same(g.witness,o.witness,"A59 generated witness exact");const e=readA58Evidence(memory,f,g.witness);same(e.target,target,"A59 A58 target");same(e.equation,g.equation,"A59 A58 equation");}
  same(generated.length,3,"A59 three independent generated witnesses");
  const t2=defineTemplate(memory,f,b),g2=generate(memory,t2,...inputs[0]!);same(g2.equation,generated[0]!.equation,"A59 equivalent reusable template converges equation");same(g2.witness,generated[0]!.witness,"A59 equivalent reusable template converges witness");
}
function staticGuards():void{
  const root=resolve(process.cwd(),".."),own=readFileSync(join(root,"ts/test/research-v013-construction-carried-equation-witness-a59.test.ts"),"utf8"),a48=readFileSync(join(root,"ts/test/research-v013-construction-carried-decomposition-a48.test.ts"),"utf8"),a58=readFileSync(join(root,"ts/test/research-v013-proof-carried-equation-start-a58.test.ts"),"utf8");
  const per=own.slice(own.indexOf("function generate("),own.indexOf("\nfunction directOracle(",own.indexOf("function generate(")));for(const x of ["memory.ensure(f.startRole","memory.ensure(f.endRole","startBinding","endBinding","directOracle"])assert(!per.includes(x),`A59 per-equation path excludes witness authoring ${x}`);
  const inst=own.slice(own.indexOf("function instantiatePlan("),own.indexOf("\ninterface Generated",own.indexOf("function instantiatePlan(")));for(const x of ["witness","equation","startRole","endRole","memory.find("])assert(!inst.includes(x),`A59 instantiator domain-agnostic ${x}`);
  assert(a48.includes("CONSTRUCTION_TEMPLATE_COUNT=1 PER_TARGET_WITNESS_AUTHORING=0"),"A59 reuses A48 construction-carried lesson");assert(a58.includes("WITNESS_SOURCE=CONSTRUCTION_TIME_RESIDUAL"),"A59 attacks exact A58 residual");
}
function main():void{exercise(new Memory(),false);exercise(new Memory(),true);staticGuards();console.log(["MTS v0.13 A59: CONSTRUCTION_CARRIED_EQUATION_WITNESS=GREEN_SCOPED_RESEARCH","CONSTRUCTION_TEMPLATE_COUNT=1 PER_EQUATION_WITNESS_AUTHORING=0","PER_INSTANCE_INPUTS=TARGET_START_END_ONLY","OUTPUTS=EQUATION_PLUS_ORDERED_DECOMPOSITION_WITNESS","GENERIC_PLAN_INSTANTIATION=DOMAIN_AGNOSTIC","A58_EVIDENCE_COMPATIBILITY=EXACT POST_HOC_DIRECT_ORACLE_ADDS_NO_LINKS","EQUIVALENT_REUSABLE_TEMPLATES=CANONICAL_CONVERGENCE","TEMPLATE_AUTHORING=RESIDUAL GENERIC_TOPOLOGY_SUBSTITUTION=HISTORICAL_RESIDUAL","NEXT_BOUNDARY=A60_RECONNECT_WITNESSED_EQUATION_TEMPLATE_TO_A49_A54_LINE","GLOBAL_E2=OPEN GLOBAL_E3=OPEN GLOBAL_E4=OPEN FULL_SELF_HOSTED=FALSE","V013_NOT_ACCEPTED PRODUCTION_UNCHANGED"].join(" "));}
main();