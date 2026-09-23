import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { materializeExactSequence, readExactSequence } from "../src/exact-sequence.js";
import { Memory, ensureRootBasis, type LinkHandle, type RootBasis } from "../src/memory.js";
import { defineStructuralRoleDictionary, defineStructuralRule, readStructuralRoleDictionary, readStructuralRule } from "../src/structural-rule.js";

function assert(c:unknown,m:string):asserts c{if(!c)throw new Error(`v0.13 A63 Rule self-realization: ${m}`);}
function same<T>(a:T,e:T,m:string):void{assert(Object.is(a,e),`${m}: values differ`);}
function freezeChain(memory:Memory,values:readonly LinkHandle[]):LinkHandle{let body=memory.root;for(let i=values.length-1;i>=0;i-=1)body=memory.ensure(values[i]!,body);return memory.ensureStartSelfClosed(body);}
function readChain(memory:Memory,envelope:LinkHandle,kind:string):readonly LinkHandle[]{const e=memory.poles(envelope);assert(e.start===envelope&&e.end!==envelope,`A21 ${kind} envelope`);const out:LinkHandle[]=[],seen=new Set<LinkHandle>();let cursor=e.end;while(cursor!==memory.root){assert(!seen.has(cursor),`A21 ${kind} cycle`);seen.add(cursor);const p=memory.poles(cursor);out.push(p.start);cursor=p.end;}return Object.freeze(out);}
function step(
  memory: Memory,
  executionRoot: LinkHandle,
  schedule: "forward" | "reverse",
): LinkHandle {
  const execution = memory.poles(executionRoot);
  const context = execution.start;
  const frontierEnvelope = execution.end;

  const contextPoles = memory.poles(context);
  const authorityEnvelope = contextPoles.end;
  const continuations = [...readChain(memory, authorityEnvelope, "authority")];
  const occurrences = [...readChain(memory, frontierEnvelope, "frontier")];
  if (schedule === "reverse") occurrences.reverse();

  let nextBody = memory.root;

  for (const occurrence of occurrences) {
    const occurrencePoles = memory.poles(occurrence);
    const truth = memory.poles(occurrencePoles.end);
    assert(truth.start === context, "A21 occurrence carries current-context truth");
    const antecedent = truth.end;

    for (const continuation of continuations) {
      const p = memory.poles(continuation);
      if (p.start !== antecedent) continue;

      const nextTruth = memory.ensure(context, p.end);
      const childOccurrence = memory.ensure(occurrence, nextTruth);
      nextBody = memory.ensure(childOccurrence, nextBody);
    }
  }

  const nextFrontier = memory.ensureStartSelfClosed(nextBody);
  return memory.ensure(context, nextFrontier);
}
function frontierTruthEnds(memory:Memory,E:LinkHandle):readonly LinkHandle[]{const ep=memory.poles(E),out:LinkHandle[]=[];for(const occurrence of readChain(memory,ep.end,"frontier")){const truth=memory.poles(memory.poles(occurrence).end);same(truth.start,ep.start,"A63 frontier context");out.push(truth.end);}return Object.freeze(out);}

interface Frame{readonly startRole:LinkHandle;readonly endRole:LinkHandle;}
function frame(memory:Memory,b:RootBasis):Frame{const whole=memory.ensure(b.L,b.L),startRole=memory.ensureStartSelfClosed(whole),endRole=memory.ensureEndSelfClosed(whole);assert(startRole!==endRole,"A63 frame roles distinct");return Object.freeze({startRole,endRole});}
function decompositionWitness(memory:Memory,f:Frame,node:LinkHandle,left:LinkHandle,right:LinkHandle):LinkHandle{return memory.ensure(memory.ensure(memory.ensure(f.startRole,left),memory.ensure(f.endRole,right)),node);}
interface Schema{readonly rule:LinkHandle;readonly roles:readonly LinkHandle[];readonly obligations:readonly LinkHandle[];readonly outputs:readonly LinkHandle[];}
function defineSchema(memory:Memory,f:Frame,b:RootBasis,reverse:boolean):Schema{const marker=memory.ensure(b.U,b.U),t=memory.ensure(memory.ensure(b.O,marker),marker),s=memory.ensure(t,marker),e=memory.ensure(s,marker),pair=memory.ensure(s,e),equation=memory.ensure(t,pair),sb=memory.ensure(f.startRole,t),eb=memory.ensure(f.endRole,pair),bindings=memory.ensure(sb,eb),witness=memory.ensure(bindings,equation),obligations=[decompositionWitness(memory,f,pair,s,e),decompositionWitness(memory,f,equation,t,pair),decompositionWitness(memory,f,sb,f.startRole,t),decompositionWitness(memory,f,eb,f.endRole,pair),decompositionWitness(memory,f,bindings,sb,eb),decompositionWitness(memory,f,witness,bindings,equation)],body=memory.ensure(materializeExactSequence(memory,reverse?[...obligations].reverse():obligations),materializeExactSequence(memory,[equation,witness])),dictionary=defineStructuralRoleDictionary(memory,[t,s,e]);return Object.freeze({rule:defineStructuralRule(memory,dictionary,body),roles:Object.freeze([t,s,e]),obligations:Object.freeze(obligations),outputs:Object.freeze([equation,witness])});}
interface Obligation{readonly node:LinkHandle;readonly left:LinkHandle;readonly right:LinkHandle;}
function readObligation(memory:Memory,w:LinkHandle):Obligation{const wp=memory.poles(w),bp=memory.poles(wp.start),lb=memory.poles(bp.start),rb=memory.poles(bp.end);return Object.freeze({node:wp.end,left:lb.end,right:rb.end});}
interface PairConstructor{construct(start:LinkHandle,end:LinkHandle):LinkHandle;}
function directConstructor(memory:Memory):PairConstructor{return Object.freeze({construct:(start:LinkHandle,end:LinkHandle)=>memory.ensure(start,end)});}
function noisyConstructor(memory:Memory):PairConstructor{return Object.freeze({construct(start:LinkHandle,end:LinkHandle){memory.ensure(memory.ensure(start,start),memory.ensure(end,end));return memory.ensure(start,end);}});}

interface EqualityCheck{readonly gate:LinkHandle;readonly query:LinkHandle;}
function equality(memory:Memory,stage:LinkHandle,expected:LinkHandle,actual:LinkHandle):EqualityCheck{const es=memory.ensure(stage,expected),as=memory.ensure(stage,actual),gate=memory.ensureStartSelfClosed(es);return Object.freeze({gate,query:memory.ensure(gate,as)});}
interface Candidate{readonly K:LinkHandle;readonly start:LinkHandle;readonly end:LinkHandle;readonly checks:readonly EqualityCheck[];}
function selectedApplication(memory:Memory,K:LinkHandle,f:Frame,witness:LinkHandle,leftTemplate:LinkHandle,rightTemplate:LinkHandle,leftValue:LinkHandle,rightValue:LinkHandle,node:LinkHandle):LinkHandle{const env=memory.ensure(memory.ensure(leftTemplate,leftValue),memory.ensure(rightTemplate,rightValue)),app=memory.ensure(node,env),proof=memory.ensure(env,app),truth=memory.ensure(K,app);return memory.ensure(witness,memory.ensure(proof,truth));}
function derive(memory:Memory,f:Frame,selection:LinkHandle):Candidate{const sp=memory.poles(selection),w=sp.start,inner=memory.poles(sp.end),proof=memory.poles(inner.start),truth=memory.poles(inner.end),env=proof.start,wp=memory.poles(w),wb=memory.poles(wp.start),wl=memory.poles(wb.start),wr=memory.poles(wb.end),node=wp.end,lt=wl.end,rt=wr.end,ep=memory.poles(env),lb=memory.poles(ep.start),rb=memory.poles(ep.end),expectedApp=memory.ensure(node,env),reconstructed=memory.ensure(lt,rt);let stage=memory.ensure(selection,memory.root);const check=(e:LinkHandle,a:LinkHandle)=>{stage=memory.ensure(stage,memory.ensure(e,a));return equality(memory,stage,e,a);};return Object.freeze({K:truth.start,start:lb.end,end:rb.end,checks:Object.freeze([check(proof.end,truth.end),check(expectedApp,proof.end),check(lt,lb.start),check(rt,rb.start),check(f.startRole,wl.start),check(f.endRole,wr.start),check(reconstructed,node)])});}
function executeApplication(memory:Memory,f:Frame,selection:LinkHandle,constructor:PairConstructor):LinkHandle|undefined{const c=derive(memory,f,selection),physical=constructor.construct(c.start,c.end),transitions=c.checks.map((x,i)=>memory.ensure(x.gate,c.checks[i+1]?.query??physical)),K=memory.ensure(c.K,freezeChain(memory,transitions)),seed=memory.ensure(K,c.checks[0]!.query);let E=memory.ensure(K,freezeChain(memory,[memory.ensure(memory.root,seed)]));for(let i=0;i<c.checks.length;i+=1)E=step(memory,E,"forward");const out=frontierTruthEnds(memory,E);return out.length===1?out[0]:undefined;}

function selfRealize(memory:Memory,f:Frame,rule:LinkHandle,admissionContext:LinkHandle,schedule:"forward"|"reverse",constructor:PairConstructor):LinkHandle|undefined{try{const structural=readStructuralRule(memory,rule),dictionary=readStructuralRoleDictionary(memory,structural.roleDictionary),body=memory.poles(structural.body),obligations=[...readExactSequence(memory,body.start).values],outputs=readExactSequence(memory,body.end).values,values=new Map<LinkHandle,LinkHandle>(dictionary.roles.map(role=>[role,role] as const)),derived=new Set(obligations.map(w=>readObligation(memory,w).node));let pending=obligations;while(pending.length>0){let progress=false;const scan=schedule==="forward"?pending:[...pending].reverse(),done=new Set<LinkHandle>();for(const w of scan){const o=readObligation(memory,w),left=values.get(o.left)??(dictionary.roles.includes(o.left)||derived.has(o.left)?undefined:o.left),right=values.get(o.right)??(dictionary.roles.includes(o.right)||derived.has(o.right)?undefined:o.right);if(left===undefined||right===undefined)continue;const result=executeApplication(memory,f,selectedApplication(memory,rule,f,w,o.left,o.right,left,right,o.node),constructor);if(result===undefined)return undefined;const prior=values.get(o.node);if(prior!==undefined&&prior!==result)return undefined;values.set(o.node,result);done.add(w);progress=true;}if(!progress)return undefined;pending=pending.filter(x=>!done.has(x));}for(const output of outputs)if(values.get(output)!==output)return undefined;return memory.ensure(admissionContext,rule);}catch{return undefined;}}
function forgedRule(memory:Memory,f:Frame,s:Schema):LinkHandle{const structural=readStructuralRule(memory,s.rule),body=memory.poles(structural.body),first=readObligation(memory,s.obligations[0]!),forged=decompositionWitness(memory,f,first.node,first.right,first.left),carrier=materializeExactSequence(memory,[forged,...s.obligations.slice(1)]);return defineStructuralRule(memory,structural.roleDictionary,memory.ensure(carrier,body.end));}
function cyclicRule(memory:Memory,f:Frame,b:RootBasis,s:Schema):LinkHandle{const structural=readStructuralRule(memory,s.rule),constant=memory.ensure(b.C,b.U),cycle=memory.ensureStartSelfClosed(constant),w=decompositionWitness(memory,f,cycle,cycle,constant),body=memory.ensure(materializeExactSequence(memory,[w]),materializeExactSequence(memory,[cycle,cycle]));return defineStructuralRule(memory,structural.roleDictionary,body);}
function foreignOutputRule(memory:Memory,s:Schema,b:RootBasis):LinkHandle{const structural=readStructuralRule(memory,s.rule),body=memory.poles(structural.body),foreign=memory.ensure(s.rule,b.C);return defineStructuralRule(memory,structural.roleDictionary,memory.ensure(body.start,materializeExactSequence(memory,[s.outputs[0]!,foreign])));}
function duplicateDictionaryRule(memory:Memory,s:Schema):LinkHandle{const structural=readStructuralRule(memory,s.rule),bad=memory.ensureStartSelfClosed(materializeExactSequence(memory,[s.roles[0]!,s.roles[0]!,s.roles[2]!]));return defineStructuralRule(memory,bad,structural.body);}

type ConstructorFactory=(memory:Memory)=>PairConstructor;
function exercise(memory:Memory,noise:boolean,factory:ConstructorFactory):void{const b=ensureRootBasis(memory);if(noise)memory.ensure(memory.ensure(b.U,b.C),b.O);const f=frame(memory,b),forward=defineSchema(memory,f,b,false),reverse=defineSchema(memory,f,b,true),K=memory.ensure(b.R,b.L);for(const s of [forward,reverse])for(const schedule of ["forward","reverse"] as const){const admission=selfRealize(memory,f,s.rule,K,schedule,factory(memory));assert(admission!==undefined,"A63 valid Rule self-realizes");const p=memory.poles(admission);same(p.start,K,"A63 admission keeps context");same(p.end,s.rule,"A63 admission carries exact Rule");}
for(const bad of [forgedRule(memory,f,forward),cyclicRule(memory,f,b,forward),foreignOutputRule(memory,forward,b),duplicateDictionaryRule(memory,forward)])same(selfRealize(memory,f,bad,K,"forward",factory(memory)),undefined,"A63 malformed Rule not admitted");
const cycle=cyclicRule(memory,f,b,forward);memory.ensure(cycle,b.L);same(selfRealize(memory,f,cycle,K,"reverse",factory(memory)),undefined,"A63 ambient physical scratch cannot rescue cyclic Rule");
}

function staticGuards():void{const root=resolve(process.cwd(),".."),own=readFileSync(join(root,"ts/test/research-v013-rule-self-realization-admission-a63.test.ts"),"utf8"),a60=readFileSync(join(root,"ts/test/research-v013-rule-proof-application-reconnect-a60.test.ts"),"utf8"),a62=readFileSync(join(root,"ts/test/research-v013-rule-publication-history-a62.test.ts"),"utf8"),a37=readFileSync(join(root,"ts/test/research-v013-link-carried-admission-program-a37.test.ts"),"utf8");const admission=own.slice(own.indexOf("function selfRealize("),own.indexOf("\nfunction forgedRule(",own.indexOf("function selfRealize(")));for(const x of ["RuleKind","opcode","whitelist","switch(","memory.find(",".outgoing(",".incoming(","allLinks("])assert(!admission.includes(x),`A63 self-realization excludes host semantic authority ${x}`);assert(a60.includes("SEMANTIC_AUTHORITY=STRUCTURAL_RULE_PLUS_PROOF_CARRIED_DECOMPOSITION"),"A63 reuses A60 Rule semantics");assert(a62.includes("PUBLICATION_EXISTENCE_SOURCE_REMOVED=YES_SCOPED_RULE_AUTHORITY"),"A63 keeps A62 history boundary");const x=own.slice(own.indexOf("function step("),own.indexOf("\nfunction frontierTruthEnds(",own.indexOf("function step("))),y=a37.slice(a37.indexOf("function step("),a37.indexOf("\ninterface Program",a37.indexOf("function step(")));same(x.replace(/\s+/g,""),y.replace(/\s+/g,""),"A63 runtime source-identical A37/A21");}
function main():void{for(const factory of [directConstructor,noisyConstructor] as const){exercise(new Memory(),false,factory);exercise(new Memory(),true,factory);}staticGuards();console.log(["MTS v0.13 A63: RULE_SELF_REALIZATION_ADMISSION=GREEN_SCOPED_RESEARCH","RULE_STRUCTURAL_ADMISSIBILITY=SELF_REALIZATION_UNDER_IDENTITY_BINDINGS","HOST_RULE_KIND=0 HOST_OPCODE=0 HOST_WHITELIST=0","SEMANTIC_EXECUTION=A60_PROOF_GATED_SELECTED_APPLICATION_PLUS_A21","VALID_FORWARD_REVERSE_RULE_AND_SCHEDULE=ADMITTED","FORGED_DECOMPOSITION=ZERO SELF_DEPENDENCY=ZERO FOREIGN_OUTPUT=ZERO DUPLICATE_ROLE_DICTIONARY=ZERO","AMBIENT_PHYSICAL_SCRATCH=CANNOT_RESCUE_INVALID_RULE","CONFORMING_A54_CONSTRUCTORS=2","RULE_CONTENT_AUTHORING=EXTERNAL_INPUT_BOUNDARY PUBLICATION_AUTHORITY=A62_HISTORY","DICTIONARY_SEQUENCE_FORMATION=E3_RESIDUAL COMPLETION_SCHEDULING=E4_RESIDUAL","GLOBAL_E2=OPEN GLOBAL_E3=OPEN GLOBAL_E4=OPEN FULL_SELF_HOSTED=FALSE","NEXT_BOUNDARY=A64_END_TO_END_RULE_LIFECYCLE_E2_REASSESSMENT","V013_NOT_ACCEPTED PRODUCTION_UNCHANGED"].join(" "));}
main();
