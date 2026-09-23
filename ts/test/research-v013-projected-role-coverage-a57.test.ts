import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { materializeExactSequence, readExactSequence } from "../src/exact-sequence.js";
import { Memory, ensureRootBasis, type LinkHandle, type RootBasis } from "../src/memory.js";
function assert(condition:unknown,message:string):asserts condition{if(!condition)throw new Error(`v0.13 A57 projected role coverage: ${message}`);}
function same<T>(actual:T,expected:T,message:string):void{assert(Object.is(actual,expected),`${message}: values differ`);}
function freezeAuthority(memory:Memory,values:readonly LinkHandle[]):LinkHandle{let body=memory.root;for(let i=values.length-1;i>=0;i-=1)body=memory.ensure(values[i]!,body);return memory.ensureStartSelfClosed(body);}
function freezeFrontier(memory:Memory,values:readonly LinkHandle[]):LinkHandle{let body=memory.root;for(let i=values.length-1;i>=0;i-=1)body=memory.ensure(values[i]!,body);return memory.ensureStartSelfClosed(body);}
function readChain(memory:Memory,envelope:LinkHandle,kind:string):readonly LinkHandle[]{const e=memory.poles(envelope);assert(e.start===envelope&&e.end!==envelope,`A21 ${kind} envelope`);const out:LinkHandle[]=[],seen=new Set<LinkHandle>();let cursor=e.end;while(cursor!==memory.root){assert(!seen.has(cursor),`A21 ${kind} cycle`);seen.add(cursor);const p=memory.poles(cursor);out.push(p.start);cursor=p.end;}return Object.freeze(out);}
/** Exact A21 executor. */
function step(memory:Memory,executionRoot:LinkHandle,schedule:"forward"|"reverse"):LinkHandle{
  const execution=memory.poles(executionRoot),context=execution.start,frontierEnvelope=execution.end;
  const authorityEnvelope=memory.poles(context).end,continuations=[...readChain(memory,authorityEnvelope,"authority")];
  const occurrences=[...readChain(memory,frontierEnvelope,"frontier")];if(schedule==="reverse")occurrences.reverse();
  let nextBody=memory.root;
  for(const occurrence of occurrences){const truth=memory.poles(memory.poles(occurrence).end);assert(truth.start===context,"A21 occurrence carries current-context truth");const antecedent=truth.end;for(const continuation of continuations){const p=memory.poles(continuation);if(p.start!==antecedent)continue;const nextTruth=memory.ensure(context,p.end),childOccurrence=memory.ensure(occurrence,nextTruth);nextBody=memory.ensure(childOccurrence,nextBody);}}
  return memory.ensure(context,memory.ensureStartSelfClosed(nextBody));
}
function frontierTruthEnds(memory:Memory,E:LinkHandle):readonly LinkHandle[]{const ep=memory.poles(E),out:LinkHandle[]=[];for(const occurrence of readChain(memory,ep.end,"frontier")){const truth=memory.poles(memory.poles(occurrence).end);same(truth.start,ep.start,"A57 frontier context");out.push(truth.end);}return Object.freeze(out);}
interface RuleShape{readonly rule:LinkHandle;readonly roles:readonly LinkHandle[];readonly equations:readonly LinkHandle[];}
function makeRoles(memory:Memory,basis:RootBasis):readonly LinkHandle[]{const marker=memory.ensure(basis.U,basis.U);let cursor=memory.ensure(basis.O,marker);const roles:LinkHandle[]=[];for(let i=0;i<8;i+=1){cursor=memory.ensure(cursor,i%2===0?basis.L:basis.C);roles.push(cursor);}return Object.freeze(roles);}
function equation(memory:Memory,target:LinkHandle,start:LinkHandle,end:LinkHandle):LinkHandle{return memory.ensure(target,memory.ensure(start,end));}
function defineRule(memory:Memory,basis:RootBasis,reverseRoles:boolean,reverseEquations:boolean):RuleShape{
  const roles=makeRoles(memory,basis),equations=Object.freeze([equation(memory,roles[3]!,roles[1]!,roles[2]!),equation(memory,roles[6]!,roles[3]!,roles[4]!),equation(memory,roles[7]!,roles[3]!,roles[5]!)]);
  return Object.freeze({rule:memory.ensure(materializeExactSequence(memory,reverseRoles?[...roles].reverse():roles),materializeExactSequence(memory,reverseEquations?[...equations].reverse():equations)),roles,equations});
}
function realization(memory:Memory,inputRoles:readonly LinkHandle[],equations:readonly LinkHandle[]):LinkHandle{return memory.ensure(materializeExactSequence(memory,inputRoles),materializeExactSequence(memory,equations));}
function request(memory:Memory,context:LinkHandle,rule:LinkHandle,value:LinkHandle):LinkHandle{return memory.ensure(context,memory.ensure(rule,value));}
interface SequenceNode{readonly previous:LinkHandle;readonly value:LinkHandle;}
function sequenceNode(memory:Memory,cell:LinkHandle):SequenceNode{assert(cell!==memory.root,"A57 sequence node non-root");const p=memory.poles(cell);assert(p.start===cell,"A57 canonical ExactSequence cell");const payload=memory.poles(p.end);return Object.freeze({previous:payload.start,value:payload.end});}
function foldSequence<S>(memory:Memory,final:LinkHandle,state:S,visit:(state:S,value:LinkHandle)=>S):S{if(final===memory.root)return state;const node=sequenceNode(memory,final),previous=foldSequence(memory,node.previous,state,visit);return visit(previous,node.value);}
interface MatchSeed{readonly ancestry:LinkHandle;readonly body:LinkHandle;}
function appendMatch(memory:Memory,gate:LinkHandle,K:LinkHandle,state:MatchSeed,candidate:LinkHandle):MatchSeed{const query=memory.ensure(gate,candidate),truth=memory.ensure(K,query),ancestry=memory.ensure(state.ancestry,candidate),occurrence=memory.ensure(ancestry,truth);return Object.freeze({ancestry,body:memory.ensure(occurrence,state.body)});}
function finishMatch(memory:Memory,expected:LinkHandle,seed:MatchSeed,gate:LinkHandle,K:LinkHandle):LinkHandle{void expected;void gate;return step(memory,memory.ensure(K,memory.ensureStartSelfClosed(seed.body)),"forward");}
/** A45 identity matcher. */
function matchExecution(memory:Memory,expected:LinkHandle,candidateCarrier:LinkHandle):LinkHandle{
  const gate=memory.ensureStartSelfClosed(expected),authority=freezeAuthority(memory,[memory.ensure(gate,memory.root)]),K=memory.ensure(memory.ensure(expected,authority),authority);
  const seed=foldSequence<MatchSeed>(memory,candidateCarrier,Object.freeze({ancestry:memory.root,body:memory.root}),(state,candidate)=>appendMatch(memory,gate,K,state,candidate));
  return finishMatch(memory,expected,seed,gate,K);
}
/** Match one expected Rule role against inputs plus START(Equation), without a combined carrier. */
function projectedRoleMatchExecution(memory:Memory,expected:LinkHandle,inputCarrier:LinkHandle,equationCarrier:LinkHandle):LinkHandle{
  const gate=memory.ensureStartSelfClosed(expected),authority=freezeAuthority(memory,[memory.ensure(gate,memory.root)]),K=memory.ensure(memory.ensure(expected,authority),authority);
  const inputs=foldSequence<MatchSeed>(memory,inputCarrier,Object.freeze({ancestry:memory.root,body:memory.root}),(state,candidate)=>appendMatch(memory,gate,K,state,candidate));
  const all=foldSequence<MatchSeed>(memory,equationCarrier,inputs,(state,eq)=>appendMatch(memory,gate,K,state,memory.poles(eq).start));
  return finishMatch(memory,expected,all,gate,K);
}
interface OneCheck{readonly bodyGate:LinkHandle;readonly bodyQuery:LinkHandle;readonly truthGate:LinkHandle;readonly truthQuery:LinkHandle;}
function deriveOneCheck(memory:Memory,matchE:LinkHandle,stage:LinkHandle):OneCheck{
  const execution=memory.poles(matchE),matchK=execution.start,envelope=memory.poles(execution.end),body=envelope.end,bodyPoles=memory.poles(body),occurrence=bodyPoles.start,truth=memory.poles(occurrence).end;
  const bodyScope=memory.ensure(stage,memory.root),truthScope=memory.ensure(stage,bodyScope),expectedBody=memory.ensure(occurrence,memory.root),scopedBody=memory.ensure(bodyScope,body),scopedExpectedBody=memory.ensure(bodyScope,expectedBody),bodyGate=memory.ensureStartSelfClosed(scopedBody),bodyQuery=memory.ensure(bodyGate,scopedExpectedBody);
  const expectedTruth=memory.ensure(matchK,memory.root),scopedTruth=memory.ensure(truthScope,truth),scopedExpectedTruth=memory.ensure(truthScope,expectedTruth),truthGate=memory.ensureStartSelfClosed(scopedExpectedTruth),truthQuery=memory.ensure(truthGate,scopedTruth);
  return Object.freeze({bodyGate,bodyQuery,truthGate,truthQuery});
}
interface CoverageState{readonly history:LinkHandle;readonly count:number;}
function appendCheck(memory:Memory,state:CoverageState,matchE:LinkHandle):CoverageState{const stage=memory.ensure(state.history,matchE),check=deriveOneCheck(memory,matchE,stage),carrier=materializeExactSequence(memory,[check.bodyGate,check.bodyQuery,check.truthGate,check.truthQuery]);return Object.freeze({history:memory.ensure(state.history,carrier),count:state.count+1});}
function appendIdentityCoverage(memory:Memory,source:LinkHandle,candidates:LinkHandle,state:CoverageState):CoverageState{return foldSequence<CoverageState>(memory,source,state,(s,expected)=>appendCheck(memory,s,matchExecution(memory,expected,candidates)));}
function appendProjectedRoleForward(memory:Memory,ruleRoles:LinkHandle,inputs:LinkHandle,equations:LinkHandle,state:CoverageState):CoverageState{return foldSequence<CoverageState>(memory,ruleRoles,state,(s,expected)=>appendCheck(memory,s,projectedRoleMatchExecution(memory,expected,inputs,equations)));}
function appendEquationTargetReverse(memory:Memory,equations:LinkHandle,ruleRoles:LinkHandle,state:CoverageState):CoverageState{return foldSequence<CoverageState>(memory,equations,state,(s,eq)=>appendCheck(memory,s,matchExecution(memory,memory.poles(eq).start,ruleRoles)));}
function deriveDirectCoverageHistory(memory:Memory,rule:LinkHandle,value:LinkHandle):CoverageState{
  const r=memory.poles(rule),v=memory.poles(value),seed=Object.freeze({history:memory.root,count:0});
  const roleForward=appendProjectedRoleForward(memory,r.start,v.start,v.end,seed);
  const inputReverse=appendIdentityCoverage(memory,v.start,r.start,roleForward);
  const targetReverse=appendEquationTargetReverse(memory,v.end,r.start,inputReverse);
  const equationForward=appendIdentityCoverage(memory,r.end,v.end,targetReverse);
  return appendIdentityCoverage(memory,v.end,r.end,equationForward);
}
function readOneCheck(memory:Memory,carrier:LinkHandle):OneCheck{const q=readExactSequence(memory,carrier).values;same(q.length,4,"A57 OneCheck arity");return Object.freeze({bodyGate:q[0]!,bodyQuery:q[1]!,truthGate:q[2]!,truthQuery:q[3]!});}
interface Assembly{readonly seed:LinkHandle;readonly authorityBody:LinkHandle;readonly count:number;}
function assembleCoverageHistory(memory:Memory,history:LinkHandle,accepted:LinkHandle,authorityBody:LinkHandle=memory.root,count=0):Assembly{if(history===memory.root)return Object.freeze({seed:accepted,authorityBody,count});const p=memory.poles(history),check=readOneCheck(memory,p.end);let body=memory.ensure(memory.ensure(check.truthGate,accepted),authorityBody);body=memory.ensure(memory.ensure(check.bodyGate,check.truthQuery),body);return assembleCoverageHistory(memory,p.start,check.bodyQuery,body,count+1);}
interface ValidationProgram{readonly E0:LinkHandle;readonly accepted:LinkHandle;readonly depth:number;readonly checkCount:number;}
function compileSelectedValidation(memory:Memory,selectedRequest:LinkHandle):ValidationProgram{
  const selected=memory.poles(selectedRequest),parentContext=selected.start,pair=memory.poles(selected.end),rule=pair.start,value=pair.end,coverage=deriveDirectCoverageHistory(memory,rule,value);
  assert(coverage.count===22,`A57 projected direct coverage check count actual=${coverage.count}`);
  const assembled=assembleCoverageHistory(memory,coverage.history,value),authority=memory.ensureStartSelfClosed(assembled.authorityBody),K=memory.ensure(parentContext,authority),seedTruth=memory.ensure(K,assembled.seed),occurrence=memory.ensure(memory.root,seedTruth),E0=memory.ensure(K,freezeFrontier(memory,[occurrence]));
  return Object.freeze({E0,accepted:value,depth:assembled.count*2,checkCount:assembled.count});
}
function runProgram(memory:Memory,program:ValidationProgram):readonly LinkHandle[]{let current=program.E0;for(let i=0;i<program.depth;i+=1)current=step(memory,current,"forward");return frontierTruthEnds(memory,current);}
function exercise(memory:Memory,withNoise:boolean):void{
  const basis=ensureRootBasis(memory);if(withNoise)memory.ensure(memory.ensure(basis.U,basis.C),basis.L);
  const forward=defineRule(memory,basis,false,false),reverse=defineRule(memory,basis,true,true),free=Object.freeze([forward.roles[0]!,forward.roles[1]!,forward.roles[2]!,forward.roles[4]!,forward.roles[5]!]),validForward=realization(memory,free,forward.equations),validReverse=realization(memory,[...free].reverse(),[...forward.equations].reverse()),context=memory.ensure(basis.R,basis.U);
  for(const rule of [forward.rule,reverse.rule])for(const valid of [validForward,validReverse]){const p=compileSelectedValidation(memory,request(memory,context,rule,valid)),ends=runProgram(memory,p);assert(p.checkCount===22,`A57 valid check count actual=${p.checkCount}`);same(ends.length,1,"A57 valid singleton");same(ends[0],valid,"A57 valid accepted");}
  const constrainedTarget=memory.poles(forward.equations[0]!).start,foreignRole=memory.ensure(forward.rule,basis.C),eqs=forward.equations;
  const bads=[realization(memory,free.slice(0,4),eqs),realization(memory,[free[0]!,free[1]!,free[1]!,free[3]!,free[4]!],eqs),realization(memory,[free[0]!,free[1]!,free[2]!,free[3]!,foreignRole],eqs),realization(memory,[constrainedTarget,...free.slice(1)],eqs)];
  for(const bad of bads)same(runProgram(memory,compileSelectedValidation(memory,request(memory,context,forward.rule,bad))).length,0,"A57 invalid role coverage ZERO");
  const selected=request(memory,context,forward.rule,validForward),program=compileSelectedValidation(memory,selected),frozenE0=program.E0;equation(memory,foreignRole,basis.O,basis.C);same(program.E0,frozenE0,"A57 ambient equation cannot rewrite program");same(runProgram(memory,program)[0],validForward,"A57 ambient physical equation inert");
}
function staticGuards():void{
  const root=resolve(process.cwd(),".."),own=readFileSync(join(root,"ts/test/research-v013-projected-role-coverage-a57.test.ts"),"utf8"),a56=readFileSync(join(root,"ts/test/research-v013-direct-rule-coverage-a56.test.ts"),"utf8");
  const core=own.slice(own.indexOf("function projectedRoleMatchExecution("),own.indexOf("\nfunction readOneCheck(",own.indexOf("function projectedRoleMatchExecution(")));
  for(const forbidden of ["appendMappedSequence","roleCoverage","deriveSemanticContract","SemanticContract","freeRoles","constrainedTargets","new Set",".has(","sameSet","count===1","count === 1","memory.find("])assert(!core.includes(forbidden),`A57 projected core excludes ${forbidden}`);
  assert(core.includes("memory.poles(eq).start"),"A57 residual is explicit generic START projection");
  assert(a56.includes("HOST_ROLE_COVERAGE_TRANSDUCER=RESIDUAL"),"A57 attacks exact A56 residual");
  assert(a56.includes("COVERAGE_HISTORY=A45_SOURCE_IDENTICAL"),"A57 preserves A56 lower validation evidence");
}
function main():void{exercise(new Memory(),false);exercise(new Memory(),true);staticGuards();console.log(["MTS v0.13 A57: PROJECTED_ROLE_COVERAGE=GREEN_SCOPED_RESEARCH","MATERIALIZED_ROLE_COVERAGE_CARRIER=0 HOST_APPEND_MAPPED_SEQUENCE=0","ROLE_FORWARD_MATCH=INPUT_IDENTITY_PLUS_EQUATION_START_PROJECTION","REVERSE_ROLE_COVERAGE=INPUT_IDENTITY_PLUS_EQUATION_TARGETS","EQUATION_IDENTITY_COVERAGE=PRESERVED CHECKS=22","DERIVED_SEMANTIC_CONTRACT=0 HOST_SET_EQUALITY_VALIDATOR=0 HOST_EXACT_ONE_BRANCH=0","VALID_FORWARD_REVERSE_RULE_AND_REALIZATION_ORDERS=ACCEPTED","MISSING_DUPLICATE_FOREIGN_MISCLASSIFIED_INPUT=ZERO","AMBIENT_PHYSICAL_EQUATION=INERT","START_PROJECTION=HOST_GENERIC_RESIDUAL","NEXT_BOUNDARY=A58_START_PROJECTION_CLASSIFICATION_OR_PROOF_CARRIED_REMOVAL","A35_PUBLICATION_EXISTENCE=RESIDUAL GLOBAL_E2=OPEN GLOBAL_E3=OPEN GLOBAL_E4=OPEN","FULL_SELF_HOSTED=FALSE V013_NOT_ACCEPTED PRODUCTION_UNCHANGED"].join(" "));}
main();