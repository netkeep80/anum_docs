import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { materializeExactSequence } from "../src/exact-sequence.js";
import { Memory, ensureRootBasis, type LinkHandle, type RootBasis } from "../src/memory.js";
import { defineStructuralRule, readStructuralRoleDictionary } from "../src/structural-rule.js";

function assert(c:unknown,m:string):asserts c{if(!c)throw new Error(`v0.13 A64 lifecycle provenance: ${m}`);}
function same<T>(a:T,e:T,m:string):void{assert(Object.is(a,e),`${m}: values differ`);}
function expectThrows(fn:()=>void,m:string):void{let threw=false;try{fn();}catch{threw=true;}assert(threw,m);}
function freezeChain(memory:Memory,values:readonly LinkHandle[]):LinkHandle{let body=memory.root;for(let i=values.length-1;i>=0;i-=1)body=memory.ensure(values[i]!,body);return memory.ensureStartSelfClosed(body);}
function readChain(memory:Memory,envelope:LinkHandle,kind:string):readonly LinkHandle[]{const e=memory.poles(envelope);assert(e.start===envelope&&e.end!==envelope,`A21 ${kind} envelope`);const out:LinkHandle[]=[],seen=new Set<LinkHandle>();let cursor=e.end;while(cursor!==memory.root){assert(!seen.has(cursor),`A21 ${kind} cycle`);seen.add(cursor);const p=memory.poles(cursor);out.push(p.start);cursor=p.end;}return Object.freeze(out);}
function step(memory:Memory,executionRoot:LinkHandle,schedule:"forward"|"reverse"):LinkHandle{const execution=memory.poles(executionRoot),context=execution.start,frontierEnvelope=execution.end,authorityEnvelope=memory.poles(context).end,continuations=[...readChain(memory,authorityEnvelope,"authority")],occurrences=[...readChain(memory,frontierEnvelope,"frontier")];if(schedule==="reverse")occurrences.reverse();let nextBody=memory.root;for(const occurrence of occurrences){const truth=memory.poles(memory.poles(occurrence).end);assert(truth.start===context,"A21 occurrence carries current-context truth");for(const continuation of continuations){const p=memory.poles(continuation);if(p.start!==truth.end)continue;const nextTruth=memory.ensure(context,p.end),childOccurrence=memory.ensure(occurrence,nextTruth);nextBody=memory.ensure(childOccurrence,nextBody);}}return memory.ensure(context,memory.ensureStartSelfClosed(nextBody));}
function frontierTruthEnds(memory:Memory,E:LinkHandle):readonly LinkHandle[]{const ep=memory.poles(E),out:LinkHandle[]=[];for(const occurrence of readChain(memory,ep.end,"frontier")){const truth=memory.poles(memory.poles(occurrence).end);same(truth.start,ep.start,"A64 frontier context");out.push(truth.end);}return Object.freeze(out);}

function malformedRule(memory:Memory,b:RootBasis):LinkHandle{const marker=memory.ensure(b.U,b.C),role=memory.ensure(marker,b.O),badDictionary=memory.ensureStartSelfClosed(materializeExactSequence(memory,[role,role])),body=materializeExactSequence(memory,[memory.ensure(role,b.L)]);const rule=defineStructuralRule(memory,badDictionary,body);expectThrows(()=>{readStructuralRoleDictionary(memory,badDictionary);},"A64 malformed Rule rejected by structural reader");return rule;}

function initialCatalog(memory:Memory,context:LinkHandle):LinkHandle{return memory.ensure(context,memory.root);}
function publishVersion(memory:Memory,catalog:LinkHandle,rule:LinkHandle):LinkHandle{const cp=memory.poles(catalog),membership=memory.ensure(cp.start,rule),occurrence=memory.ensure(cp.end,membership);return memory.ensure(cp.start,occurrence);}
function selectedRequest(memory:Memory,context:LinkHandle,catalog:LinkHandle,rule:LinkHandle):LinkHandle{return memory.ensure(context,memory.ensure(catalog,rule));}
interface EqualityCheck{readonly gate:LinkHandle;readonly query:LinkHandle;}
function equalityCheck(memory:Memory,stage:LinkHandle,expected:LinkHandle,actual:LinkHandle):EqualityCheck{const es=memory.ensure(stage,expected),as=memory.ensure(stage,actual),gate=memory.ensureStartSelfClosed(es);return Object.freeze({gate,query:memory.ensure(gate,as)});}
interface PublicationProgram{readonly E0:LinkHandle;readonly depth:number;readonly accepted:LinkHandle;}
function compilePublicationHistoryProof(memory:Memory,requestTruth:LinkHandle):PublicationProgram{const truth=memory.poles(requestTruth),parentContext=truth.start,request=memory.poles(truth.end),catalog=request.start,requestedRule=request.end,cp=memory.poles(catalog);assert(cp.end!==memory.root,"A64 selected catalog contains publication occurrence");const head=memory.poles(cp.end),membership=memory.poles(head.end),publishedRule=membership.end;let stage=memory.ensure(requestTruth,memory.root);const check=(e:LinkHandle,a:LinkHandle):EqualityCheck=>{stage=memory.ensure(stage,memory.ensure(e,a));return equalityCheck(memory,stage,e,a);};const checks=[check(cp.start,membership.start),check(requestedRule,publishedRule)],transitions=checks.map((x,i)=>memory.ensure(x.gate,checks[i+1]?.query??requestedRule)),K=memory.ensure(parentContext,freezeChain(memory,transitions)),seed=memory.ensure(K,checks[0]!.query);return Object.freeze({E0:memory.ensure(K,freezeChain(memory,[memory.ensure(memory.root,seed)])),depth:checks.length,accepted:requestedRule});}
function runPublicationProof(memory:Memory,requestTruth:LinkHandle):readonly LinkHandle[]{const p=compilePublicationHistoryProof(memory,requestTruth);let current=p.E0;for(let i=0;i<p.depth;i+=1)current=step(memory,current,"forward");return frontierTruthEnds(memory,current);}

function exercise(memory:Memory,noise:boolean):void{const b=ensureRootBasis(memory);if(noise)memory.ensure(memory.ensure(b.U,b.C),b.O);const bad=malformedRule(memory,b),admissionContext=memory.ensure(b.R,b.L),catalogContext=memory.ensure(b.O,b.U),executionContext=memory.ensure(b.C,b.L);

const forgedAdmissionTruthBefore=memory.ensure(admissionContext,bad);
const forgedAdmissionTruthAfter=memory.ensure(admissionContext,bad);
same(forgedAdmissionTruthBefore,forgedAdmissionTruthAfter,"A64 canonical K->Rule erases producer provenance");
same(memory.poles(forgedAdmissionTruthBefore).end,bad,"A64 forged truth carries exact malformed Rule");

const c0=initialCatalog(memory,catalogContext),c1=publishVersion(memory,c0,bad),requestTruth=memory.ensure(executionContext,memory.poles(selectedRequest(memory,executionContext,c1,bad)).end),accepted=runPublicationProof(memory,requestTruth);
same(accepted.length,1,"A64 A62 history authorizes physically published malformed Rule");
same(accepted[0],bad,"A64 publication proof returns exact malformed Rule");

const lateGood=memory.ensure(bad,b.C),oldRequest=memory.ensure(executionContext,memory.poles(selectedRequest(memory,executionContext,c1,bad)).end),c2=publishVersion(memory,c1,lateGood);
same(runPublicationProof(memory,oldRequest)[0],bad,"A64 old selected publication remains immutable");
same(runPublicationProof(memory,memory.ensure(executionContext,memory.poles(selectedRequest(memory,executionContext,c2,lateGood)).end))[0],lateGood,"A64 later version can authorize later Rule independently");

memory.ensure(catalogContext,memory.ensure(admissionContext,bad));
same(runPublicationProof(memory,requestTruth)[0],bad,"A64 ambient admission-shaped scratch does not change selected A62 history");
}

function staticGuards():void{const root=resolve(process.cwd(),".."),own=readFileSync(join(root,"ts/test/research-v013-lifecycle-admission-provenance-a64.test.ts"),"utf8"),a62=readFileSync(join(root,"ts/test/research-v013-rule-publication-history-a62.test.ts"),"utf8"),a63=readFileSync(join(root,"ts/test/research-v013-rule-self-realization-admission-a63.test.ts"),"utf8"),trace=readFileSync(join(root,"traceability/mts-v0.13-semantic-dependency-projection.json"),"utf8");
assert(a63.includes("return truths.length===1?truths[0]:undefined"),"A64 A63 downstream handoff is a truth Link, not occurrence/version provenance");
assert(a63.includes("RULE_SELF_REALIZATION_ADMISSION=GREEN_SCOPED_RESEARCH"),"A64 consumes A63 scoped admission result");
assert(a62.includes("function publishVersion(memory:Memory,catalog:LinkHandle,rule:LinkHandle)"),"A64 A62 publication stores Rule directly");
assert(a62.includes("PUBLICATION_EXISTENCE_SOURCE_REMOVED=YES_SCOPED_RULE_AUTHORITY"),"A64 preserves A62 prior-publication result");
const pub=own.slice(own.indexOf("function publishVersion("),own.indexOf("\nfunction selectedRequest("));for(const x of ["admission","selfRealize","RuleKind","whitelist"])assert(!pub.includes(x),`A64 current publication event carries no ${x} provenance`);
assert(trace.includes("A64: build an end-to-end selected Rule lifecycle closure experiment"),"A64 attacks exact scheduled lifecycle boundary");
}
function main():void{exercise(new Memory(),false);exercise(new Memory(),true);staticGuards();console.log(["MTS v0.13 A64: END_TO_END_RULE_LIFECYCLE_FALSIFIER=GREEN","END_TO_END_LIFECYCLE_CLOSURE=RED_ADMISSION_PROVENANCE_GAP","A63_OUTPUT_HANDOFF=CANONICAL_CONTEXTUAL_RULE_TRUTH_LINK","CANONICAL_TRUTH_LINK_PRODUCER_PROVENANCE=DISTINGUISHABLE_NO","A62_PUBLICATION_RECORD=CARRIES_RULE_NOT_A63_ADMISSION_HISTORY","STRUCTURALLY_INVALID_RULE_CAN_BE_PHYSICALLY_PUBLISHED=YES","A62_SELECTED_HISTORY_CAN_AUTHORIZE_THAT_PUBLISHED_INVALID_RULE=YES","AMBIENT_ADMISSION_SHAPED_SCRATCH=INERT_BUT_DOES_NOT_FIX_PROVENANCE","OLD_PUBLICATION_VERSION=IMMUTABLE LATE_VERSION=SEPARATE","E2_LIFECYCLE_SOURCE_REMOVAL=RED","NEXT_BOUNDARY=A65_CARRY_IMMUTABLE_ADMISSION_HISTORY_INTO_PUBLICATION","GLOBAL_E2=OPEN GLOBAL_E3=OPEN GLOBAL_E4=OPEN FULL_SELF_HOSTED=FALSE","V013_NOT_ACCEPTED PRODUCTION_UNCHANGED"].join(" "));}
main();
