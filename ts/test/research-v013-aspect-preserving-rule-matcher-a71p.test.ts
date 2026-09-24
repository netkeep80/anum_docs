import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import {
  Memory,
  MemoryError,
  ensureRootBasis,
  type LinkHandle,
} from "../src/memory.js";
import {
  StructuralRuleError,
  type StructuralRoleBinding,
} from "../src/structural-rule.js";
import { unifyStructuralTemplate } from "../src/structural-unification.js";

function assert(c:unknown,m:string):asserts c{
  if(!c)throw new Error(`v0.13 A71p aspect-preserving Rule matcher: ${m}`);
}
function same<T>(a:T,e:T,m:string):void{
  assert(Object.is(a,e),`${m}: values differ`);
}
function binding(
  bindings:readonly StructuralRoleBinding[],
  role:LinkHandle,
):LinkHandle{
  const found=bindings.find(x=>x.role===role);
  assert(found!==undefined,"missing binding");
  return found.value;
}

/**
 * Strict Rule matcher relation.
 *
 * It is intentionally not a replacement for projection unification.
 * The only added law is exact preservation of the two self-incidence bits at
 * every non-role template node.
 */
function unifyRuleTemplate(
  memory:Memory,
  template:LinkHandle,
  claimed:LinkHandle,
  roles:readonly LinkHandle[],
):readonly StructuralRoleBinding[]{
  if(new Set(roles).size!==roles.length){
    throw new StructuralRuleError("duplicate-role");
  }

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
    same(memory.linkCount,before,"Rule matching is read-only");
  }
}

function expectMismatch(effect:()=>unknown,m:string):void{
  let failed=false;
  try{effect();}catch(error){
    assert(error instanceof StructuralRuleError,m+": wrong error type");
    failed=true;
  }
  assert(failed,m);
}

function exerciseProjectionCompatibility(memory:Memory):void{
  const b=ensureRootBasis(memory);
  const beginRole=memory.ensure(b.O,b.O);
  const endRole=memory.ensure(b.C,b.C);
  const pairTemplate=memory.ensure(beginRole,endRole);

  const ordinary=memory.ensure(b.L,b.U);
  const start=memory.ensureStartSelfClosed(b.L);
  const end=memory.ensureEndSelfClosed(b.U);

  // Production projection unifier intentionally ignores aspect and remains
  // capable of reading the two ordered poles of every Link class.
  for(const target of [memory.root,start,end,ordinary]){
    const bindings=unifyStructuralTemplate(
      memory,pairTemplate,target,[beginRole,endRole],
    );
    const p=memory.poles(target);
    same(binding(bindings,beginRole),p.start,"projection begin pole");
    same(binding(bindings,endRole),p.end,"projection end pole");
  }

  // The stricter Rule relation is intentionally different.
  expectMismatch(
    ()=>unifyRuleTemplate(memory,pairTemplate,memory.root,[beginRole,endRole]),
    "PAIR Rule pattern must not match ROOT",
  );
  expectMismatch(
    ()=>unifyRuleTemplate(memory,pairTemplate,start,[beginRole,endRole]),
    "PAIR Rule pattern must not match START",
  );
  expectMismatch(
    ()=>unifyRuleTemplate(memory,pairTemplate,end,[beginRole,endRole]),
    "PAIR Rule pattern must not match END",
  );
  const strictOrdinary=unifyRuleTemplate(
    memory,pairTemplate,ordinary,[beginRole,endRole],
  );
  same(binding(strictOrdinary,beginRole),memory.poles(ordinary).start,
    "strict ordinary begin");
  same(binding(strictOrdinary,endRole),memory.poles(ordinary).end,
    "strict ordinary end");
}

function exerciseA71hCompatibility(memory:Memory):void{
  const b=ensureRootBasis(memory);
  const seed=memory.ensure(b.U,b.L);

  // A71h PAIR request pattern:
  //   K -> ((K->X) -> (K->Y))
  const k=memory.ensure(seed,b.O);
  const x=memory.ensure(seed,b.C);
  const y=memory.ensure(seed,b.L);
  const left=memory.ensure(k,x);
  const right=memory.ensure(k,y);
  const template=memory.ensure(k,memory.ensure(left,right));

  const caller=memory.ensure(b.L,b.C);
  const actualX=memory.ensure(b.O,b.U);
  const actualY=memory.ensure(b.C,b.L);
  const claimed=memory.ensure(
    caller,
    memory.ensure(
      memory.ensure(caller,actualX),
      memory.ensure(caller,actualY),
    ),
  );

  const projection=unifyStructuralTemplate(memory,template,claimed,[k,x,y]);
  const strict=unifyRuleTemplate(memory,template,claimed,[k,x,y]);

  for(const role of [k,x,y]){
    same(binding(strict,role),binding(projection,role),
      "A71h PAIR bindings preserved under strict Rule matcher");
  }

  // A71h projection Rule:
  //   K -> (K->X)
  const pk=memory.ensure(seed,b.U);
  const px=memory.ensure(seed,memory.root);
  const projectionTemplate=memory.ensure(pk,memory.ensure(pk,px));
  const projectedValue=memory.ensure(b.U,b.C);
  const projectionClaim=memory.ensure(
    caller,
    memory.ensure(caller,projectedValue),
  );

  const oldProjection=unifyStructuralTemplate(
    memory,projectionTemplate,projectionClaim,[pk,px],
  );
  const newProjection=unifyRuleTemplate(
    memory,projectionTemplate,projectionClaim,[pk,px],
  );
  same(binding(newProjection,pk),binding(oldProjection,pk),
    "projection Rule K binding unchanged");
  same(binding(newProjection,px),binding(oldProjection,px),
    "projection Rule X binding unchanged");
}

interface AspectTemplates{
  readonly root:LinkHandle;
  readonly pair:LinkHandle;
  readonly start:LinkHandle;
  readonly end:LinkHandle;
  readonly roles:ReadonlyMap<LinkHandle,readonly LinkHandle[]>;
}
function defineAspectTemplates(memory:Memory):AspectTemplates{
  const b=ensureRootBasis(memory);
  const seed=memory.ensure(b.U,b.L);
  const roles=new Map<LinkHandle,readonly LinkHandle[]>();

  const kr=memory.ensure(seed,b.O);
  const root=memory.ensure(kr,memory.root);
  roles.set(root,Object.freeze([kr]));

  const kp=memory.ensure(seed,b.C);
  const a=memory.ensure(seed,b.O);
  const bb=memory.ensure(seed,b.L);
  const ai=memory.ensure(seed,b.U);
  const bi=memory.ensure(seed,memory.root);
  const pair=memory.ensure(
    kp,
    memory.ensure(
      memory.ensure(a,bb),
      memory.ensure(memory.ensure(a,ai),memory.ensure(bb,bi)),
    ),
  );
  roles.set(pair,Object.freeze([kp,a,bb,ai,bi]));

  const ks=memory.ensure(seed,memory.ensure(b.O,b.C));
  const sa=memory.ensure(seed,memory.ensure(b.C,b.L));
  const sai=memory.ensure(seed,memory.ensure(b.L,b.U));
  const start=memory.ensure(
    ks,
    memory.ensure(
      memory.ensureStartSelfClosed(sa),
      memory.ensure(sa,sai),
    ),
  );
  roles.set(start,Object.freeze([ks,sa,sai]));

  const ke=memory.ensure(seed,memory.ensure(b.C,b.O));
  const ea=memory.ensure(seed,memory.ensure(b.L,b.C));
  const eai=memory.ensure(seed,memory.ensure(b.U,b.L));
  const end=memory.ensure(
    ke,
    memory.ensure(
      memory.ensureEndSelfClosed(ea),
      memory.ensure(ea,eai),
    ),
  );
  roles.set(end,Object.freeze([ke,ea,eai]));

  return Object.freeze({root,pair,start,end,roles});
}

function matches(
  memory:Memory,
  templates:AspectTemplates,
  claimed:LinkHandle,
):readonly LinkHandle[]{
  const result:LinkHandle[]=[];
  for(const candidate of [
    templates.root,templates.pair,templates.start,templates.end,
  ]){
    try{
      unifyRuleTemplate(
        memory,
        candidate,
        claimed,
        templates.roles.get(candidate)??[],
      );
      result.push(candidate);
    }catch(error){
      if(error instanceof StructuralRuleError)continue;
      throw error;
    }
  }
  return Object.freeze(result);
}

function exerciseUniversalAspectCompatibility(memory:Memory):void{
  const b=ensureRootBasis(memory);
  const templates=defineAspectTemplates(memory);
  const caller=memory.ensure(b.L,b.U);

  const rootClaim=memory.ensure(caller,memory.root);

  const a=memory.ensure(b.O,b.L);
  const bb=memory.ensure(b.C,b.U);
  const ai=memory.ensure(b.L,b.C);
  const bi=memory.ensure(b.U,b.O);
  const pairClaim=memory.ensure(
    caller,
    memory.ensure(
      memory.ensure(a,bb),
      memory.ensure(memory.ensure(a,ai),memory.ensure(bb,bi)),
    ),
  );

  const sa=memory.ensure(b.U,b.L);
  const sai=memory.ensure(b.L,b.O);
  const startClaim=memory.ensure(
    caller,
    memory.ensure(
      memory.ensureStartSelfClosed(sa),
      memory.ensure(sa,sai),
    ),
  );

  const ea=memory.ensure(b.C,b.L);
  const eai=memory.ensure(b.O,b.U);
  const endClaim=memory.ensure(
    caller,
    memory.ensure(
      memory.ensureEndSelfClosed(ea),
      memory.ensure(ea,eai),
    ),
  );

  same(matches(memory,templates,rootClaim).length,1,
    "strict Rule matcher uniquely classifies ROOT request");
  same(matches(memory,templates,pairClaim).length,1,
    "strict Rule matcher uniquely classifies PAIR request");
  same(matches(memory,templates,startClaim).length,1,
    "strict Rule matcher uniquely classifies START request");
  same(matches(memory,templates,endClaim).length,1,
    "strict Rule matcher uniquely classifies END request");

  same(matches(memory,templates,rootClaim)[0],templates.root,"ROOT exact Rule");
  same(matches(memory,templates,pairClaim)[0],templates.pair,"PAIR exact Rule");
  same(matches(memory,templates,startClaim)[0],templates.start,"START exact Rule");
  same(matches(memory,templates,endClaim)[0],templates.end,"END exact Rule");
}

function exercise(noise:boolean):void{
  const memory=new Memory();
  const b=ensureRootBasis(memory);
  if(noise)memory.ensure(memory.ensure(b.U,b.C),memory.ensure(b.O,b.L));

  exerciseProjectionCompatibility(memory);
  exerciseA71hCompatibility(memory);
  exerciseUniversalAspectCompatibility(memory);
}

function sourceSlice(source:string,start:string,end:string):string{
  const i=source.indexOf(start),j=source.indexOf(end,i+1);
  assert(i>=0&&j>i,`source slice ${start}`);
  return source.slice(i,j).replace(/\s+/g,"");
}

function staticGuards():void{
  const root=resolve(process.cwd(),"..");
  const own=readFileSync(
    join(root,"ts/test/research-v013-aspect-preserving-rule-matcher-a71p.test.ts"),
    "utf8",
  );
  const v010=readFileSync(
    join(root,"ts/test/v010-structural-unification.test.ts"),
    "utf8",
  );
  const a71o=readFileSync(
    join(root,"ts/test/research-v013-universal-aspect-dataflow-a71o.test.ts"),
    "utf8",
  );

  const matcher=sourceSlice(
    own,
    "function unifyRuleTemplate(",
    "\nfunction expectMismatch(",
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
    assert(!matcher.includes(forbidden),
      `A71p strict Rule matcher excludes aspect selector ${forbidden}`);
  }

  assert(v010.includes("R begin is R"),
    "projection unifier historical ROOT pole projection preserved");
  assert(v010.includes("S=S⟼E reads S as begin"),
    "projection unifier historical START pole projection preserved");
  assert(v010.includes("T=B⟼T reads T as end"),
    "projection unifier historical END pole projection preserved");

  assert(a71o.includes("CURRENT_UNIFIER_SELF_INCIDENCE_PRESERVATION=NO"),
    "A71p addresses exact A71o RED");
}

function main():void{
  exercise(false);
  exercise(true);
  staticGuards();

  console.log([
    "MTS v0.13 A71p: PROJECTION_VS_RULE_MATCHING_SPLIT=GREEN_SCOPED_RESEARCH",
    "PROJECTION_UNIFIER=UNCHANGED_ASPECT_INSENSITIVE_BY_DESIGN",
    "PAIR_TEMPLATE_PROJECTS_ROOT_START_END_PAIR=YES",
    "RULE_MATCHER=SELF_INCIDENCE_PRESERVING",
    "RULE_MATCHER_ASPECT_SWITCH=0",
    "RULE_MATCHER_WRITES=0",
    "A71H_PAIR_BINDINGS=UNCHANGED",
    "A71H_PROJECTION_RULE_BINDINGS=UNCHANGED",
    "UNIVERSAL_ROOT_RULE=UNIQUE",
    "UNIVERSAL_START_RULE=UNIQUE",
    "UNIVERSAL_END_RULE=UNIQUE",
    "UNIVERSAL_PAIR_RULE=UNIQUE",
    "GLOBAL_UNIFIER_REPLACEMENT=REJECTED",
    "ARCHITECTURAL_SPLIT=PROJECTION_UNIFICATION_VS_STRUCTURAL_RULE_MATCHING",
    "NEXT=A71Q_RETURN_TO_SOURCE_PARENT_REACTION",
    "FULL_SELF_HOSTED=FALSE",
    "V013_NOT_ACCEPTED PRODUCTION_UNCHANGED",
  ].join(" "));
}

main();
