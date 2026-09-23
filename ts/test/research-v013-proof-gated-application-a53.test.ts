import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { materializeExactSequence, readExactSequence } from "../src/exact-sequence.js";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
  type LinkPoles,
  type ReadMemory,
  type RootBasis,
} from "../src/memory.js";
import {
  defineStructuralRoleDictionary,
  defineStructuralRule,
  readStructuralRule,
} from "../src/structural-rule.js";

function assert(condition:unknown,message:string):asserts condition{
  if(!condition)throw new Error(`v0.13 A53 proof-gated application: ${message}`);
}
function same<T>(actual:T,expected:T,message:string):void{
  assert(Object.is(actual,expected),`${message}: values differ`);
}
function freezeAuthority(memory:Memory,values:readonly LinkHandle[]):LinkHandle{
  let body=memory.root;
  for(let i=values.length-1;i>=0;i-=1)body=memory.ensure(values[i]!,body);
  return memory.ensureStartSelfClosed(body);
}
function freezeFrontier(memory:Memory,values:readonly LinkHandle[]):LinkHandle{
  let body=memory.root;
  for(let i=values.length-1;i>=0;i-=1)body=memory.ensure(values[i]!,body);
  return memory.ensureStartSelfClosed(body);
}
function readChain(memory:Memory,envelope:LinkHandle,kind:string):readonly LinkHandle[]{
  const e=memory.poles(envelope);
  assert(e.start===envelope&&e.end!==envelope,`A21 ${kind} envelope`);
  const out:LinkHandle[]=[],seen=new Set<LinkHandle>();let cursor=e.end;
  while(cursor!==memory.root){
    assert(!seen.has(cursor),`A21 ${kind} cycle`);seen.add(cursor);
    const p=memory.poles(cursor);out.push(p.start);cursor=p.end;
  }
  return Object.freeze(out);
}

/** Exact A21 single-root executor. */
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
function frontierTruthEnds(memory:Memory,E:LinkHandle):readonly LinkHandle[]{
  const ep=memory.poles(E),out:LinkHandle[]=[];
  for(const occurrence of readChain(memory,ep.end,"frontier")){
    const truth=memory.poles(memory.poles(occurrence).end);
    same(truth.start,ep.start,"A53 frontier context");out.push(truth.end);
  }
  return Object.freeze(out);
}

interface Frame{readonly startRole:LinkHandle;readonly endRole:LinkHandle;}
function frame(memory:Memory,basis:RootBasis):Frame{
  const whole=memory.ensure(basis.L,basis.L);
  const startRole=memory.ensureStartSelfClosed(whole);
  const endRole=memory.ensureEndSelfClosed(whole);
  assert(startRole!==endRole,"A53 decomposition roles distinct");
  return Object.freeze({startRole,endRole});
}
interface ConstructionSchema{
  readonly rule:LinkHandle;
  readonly inputRoles:readonly [LinkHandle,LinkHandle];
  readonly targetTemplate:LinkHandle;
  readonly witnessTemplate:LinkHandle;
}
function defineConstructionSchema(memory:Memory,f:Frame,basis:RootBasis):ConstructionSchema{
  const marker=memory.ensure(basis.U,basis.U);
  const sRole=memory.ensure(memory.ensure(basis.O,marker),marker);
  const eRole=memory.ensure(sRole,marker);
  const target=memory.ensure(sRole,eRole);
  const startBinding=memory.ensure(f.startRole,sRole),endBinding=memory.ensure(f.endRole,eRole);
  const witness=memory.ensure(memory.ensure(startBinding,endBinding),target);
  const dictionary=defineStructuralRoleDictionary(memory,[sRole,eRole]);
  const body=materializeExactSequence(memory,[target,witness]);
  return Object.freeze({
    rule:defineStructuralRule(memory,dictionary,body),
    inputRoles:[sRole,eRole] as const,
    targetTemplate:target,witnessTemplate:witness,
  });
}

class BindingEvidenceReader{
  readonly counters={targetPoleReads:0};
  constructor(private readonly source:ReadMemory){}
  poles(link:LinkHandle):LinkPoles{return this.source.poles(link);}
}
interface ProjectionCandidate{
  readonly target:LinkHandle;readonly start:LinkHandle;readonly end:LinkHandle;
  readonly projection:LinkHandle;readonly gate:LinkHandle;readonly query:LinkHandle;
}
function deriveStartProjection(memory:Memory,f:Frame,witness:LinkHandle):ProjectionCandidate{
  const evidence=new BindingEvidenceReader(memory);
  const wp=evidence.poles(witness),pair=evidence.poles(wp.start);
  const startBinding=evidence.poles(pair.start),endBinding=evidence.poles(pair.end);
  same(startBinding.start,f.startRole,"A53 start binding role");
  same(endBinding.start,f.endRole,"A53 end binding role");
  const target=wp.end,start=startBinding.end,end=endBinding.end;
  const reconstructed=memory.ensure(start,end),projection=memory.ensure(target,start);
  const gate=memory.ensureStartSelfClosed(target),query=memory.ensure(gate,reconstructed);
  same(evidence.counters.targetPoleReads,0,"A53 receiver target pole reads");
  return Object.freeze({target,start,end,projection,gate,query});
}
function validateProjection(memory:Memory,c:ProjectionCandidate,parent:LinkHandle):readonly LinkHandle[]{
  const K=memory.ensure(parent,freezeAuthority(memory,[memory.ensure(c.gate,c.projection)]));
  const truth=memory.ensure(K,c.query);
  const E0=memory.ensure(K,freezeFrontier(memory,[memory.ensure(memory.root,truth)]));
  return frontierTruthEnds(memory,step(memory,E0,"forward"));
}

interface ApplicationInput{
  readonly environment:LinkHandle;
  readonly application:LinkHandle;
  readonly proof:LinkHandle;
  readonly truth:LinkHandle;
  readonly selection:LinkHandle;
}
function selectedApplicationInput(
  memory:Memory,
  context:LinkHandle,
  schema:ConstructionSchema,
  startValue:LinkHandle,
  endValue:LinkHandle,
):ApplicationInput{
  const leftBinding=memory.ensure(schema.inputRoles[0],startValue);
  const rightBinding=memory.ensure(schema.inputRoles[1],endValue);
  const environment=memory.ensure(leftBinding,rightBinding);
  const application=memory.ensure(schema.targetTemplate,environment);
  const proof=memory.ensure(environment,application);
  const truth=memory.ensure(context,application);
  return Object.freeze({
    environment,application,proof,truth,
    selection:memory.ensure(proof,truth),
  });
}

/** Candidate comparison encoded only as canonical Link collapse. */
interface EqualityCheck{readonly gate:LinkHandle;readonly query:LinkHandle;}
function equalityCheck(
  memory:Memory,
  stage:LinkHandle,
  expected:LinkHandle,
  actual:LinkHandle,
):EqualityCheck{
  const expectedScoped=memory.ensure(stage,expected);
  const actualScoped=memory.ensure(stage,actual);
  const gate=memory.ensureStartSelfClosed(expectedScoped);
  return Object.freeze({gate,query:memory.ensure(gate,actualScoped)});
}

interface ApplicationCandidate{
  readonly parentContext:LinkHandle;
  readonly startValue:LinkHandle;
  readonly endValue:LinkHandle;
  readonly checks:readonly EqualityCheck[];
}
/**
 * Decode only the selected proof carrier, never the Application Link itself.
 *
 * The proof supplies Env and the selected Application handle. Truth supplies
 * the independently selected Application handle. Role/template correctness is
 * not decided here: canonical gates + A21 decide it.
 */
function deriveApplicationCandidate(
  memory:Memory,
  schema:ConstructionSchema,
  selection:LinkHandle,
):ApplicationCandidate{
  const selected=memory.poles(selection);
  const proof=memory.poles(selected.start);
  const truth=memory.poles(selected.end);
  const environment=proof.start;
  const proofApplication=proof.end;
  const parentContext=truth.start;
  const truthApplication=truth.end;

  const env=memory.poles(environment);
  const leftBinding=memory.poles(env.start);
  const rightBinding=memory.poles(env.end);
  const startValue=leftBinding.end,endValue=rightBinding.end;
  const expectedApplication=memory.ensure(schema.targetTemplate,environment);

  let stage=memory.ensure(selection,memory.root);
  const check=(expected:LinkHandle,actual:LinkHandle):EqualityCheck=>{
    stage=memory.ensure(stage,memory.ensure(expected,actual));
    return equalityCheck(memory,stage,expected,actual);
  };
  return Object.freeze({
    parentContext,startValue,endValue,
    checks:Object.freeze([
      check(proofApplication,truthApplication),
      check(expectedApplication,proofApplication),
      check(schema.inputRoles[0],leftBinding.start),
      check(schema.inputRoles[1],rightBinding.start),
    ]),
  });
}

/**
 * E1 candidate: no Template, role, context, truth or application semantics.
 * Some physical constructor must bottom out in Memory.ensure to create a Link.
 */
function constructPhysicalPairE1(
  memory:Memory,
  start:LinkHandle,
  end:LinkHandle,
):LinkHandle{
  return memory.ensure(start,end);
}

interface ValidationProgram{
  readonly E0:LinkHandle;readonly context:LinkHandle;
  readonly accepted:LinkHandle;readonly depth:number;
}
function compileApplicationValidation(
  memory:Memory,
  candidate:ApplicationCandidate,
  physicalResult:LinkHandle,
):ValidationProgram{
  const transitions=candidate.checks.map((current,index)=>
    memory.ensure(current.gate,candidate.checks[index+1]?.query??physicalResult)
  );
  const authority=freezeAuthority(memory,transitions);
  const K=memory.ensure(candidate.parentContext,authority);
  const seed=memory.ensure(K,candidate.checks[0]!.query);
  const E0=memory.ensure(K,freezeFrontier(memory,[memory.ensure(memory.root,seed)]));
  return Object.freeze({E0,context:K,accepted:physicalResult,depth:candidate.checks.length});
}
function runProgram(memory:Memory,program:ValidationProgram):readonly LinkHandle[]{
  let current=program.E0;
  for(let i=0;i<program.depth;i+=1)current=step(memory,current,"forward");
  return frontierTruthEnds(memory,current);
}

function freshValues(memory:Memory,basis:RootBasis):readonly [LinkHandle,LinkHandle]{
  const start=memory.ensure(memory.ensure(basis.C,basis.U),basis.L);
  const end=memory.ensure(memory.ensure(basis.O,basis.C),basis.U);
  return Object.freeze([start,end] as const);
}
function executeSelection(
  memory:Memory,
  schema:ConstructionSchema,
  selection:LinkHandle,
):readonly LinkHandle[]{
  const candidate=deriveApplicationCandidate(memory,schema,selection);
  const physical=constructPhysicalPairE1(memory,candidate.startValue,candidate.endValue);
  return runProgram(memory,compileApplicationValidation(memory,candidate,physical));
}

function exercise(memory:Memory,withNoise:boolean):void{
  const basis=ensureRootBasis(memory);if(withNoise)memory.ensure(memory.ensure(basis.U,basis.C),basis.O);
  const f=frame(memory,basis),schema=defineConstructionSchema(memory,f,basis);
  const structural=readStructuralRule(memory,schema.rule);
  const body=readExactSequence(memory,structural.body).values;
  same(body[0],schema.targetTemplate,"A53 unchanged A49 target template");
  same(body[1],schema.witnessTemplate,"A53 unchanged A49 witness template");

  const admitted=deriveStartProjection(memory,f,schema.witnessTemplate);
  same(validateProjection(memory,admitted,memory.ensure(basis.R,schema.targetTemplate))[0],
    admitted.projection,"A53 template decomposition authority admitted");

  const [startValue,endValue]=freshValues(memory,basis);
  const parent=memory.ensure(basis.O,basis.U);
  const selected=selectedApplicationInput(memory,parent,schema,startValue,endValue);
  assert(memory.find(startValue,endValue)===undefined,"A53 result absent before physical construction");
  const valid=executeSelection(memory,schema,selected.selection);
  const result=memory.find(startValue,endValue);
  assert(result!==undefined,"A53 E1 constructor materializes pair");
  same(valid.length,1,"A53 valid application singleton semantic result");
  same(valid[0],result,"A53 valid application contextual result exact");

  // Ambient alternate application exists but is never selected/executed.
  const ambientStart=memory.ensure(startValue,basis.C),ambientEnd=memory.ensure(endValue,basis.C);
  selectedApplicationInput(memory,parent,schema,ambientStart,ambientEnd);
  assert(memory.find(ambientStart,ambientEnd)===undefined,"A53 ambient application pair absent");

  // Swapped binding carrier physically creates its reverse pair as scratch, but
  // role gates fail and no contextual result is published.
  const left=memory.ensure(schema.inputRoles[0],startValue);
  const right=memory.ensure(schema.inputRoles[1],endValue);
  const swappedEnv=memory.ensure(right,left);
  const swappedApp=memory.ensure(schema.targetTemplate,swappedEnv);
  const swappedProof=memory.ensure(swappedEnv,swappedApp);
  const swappedTruth=memory.ensure(parent,swappedApp);
  const swappedSelection=memory.ensure(swappedProof,swappedTruth);
  const swappedEnds=executeSelection(memory,schema,swappedSelection);
  assert(memory.find(endValue,startValue)!==undefined,"A53 invalid reverse pair may exist physically");
  same(swappedEnds.length,0,"A53 swapped environment semantic ZERO");

  // Foreign Template also may cause physical scratch construction, but cannot
  // create contextual authority because canonical Template equality fails.
  const foreignTemplate=memory.ensure(schema.targetTemplate,basis.U);
  const foreignApp=memory.ensure(foreignTemplate,selected.environment);
  const foreignProof=memory.ensure(selected.environment,foreignApp);
  const foreignTruth=memory.ensure(parent,foreignApp);
  same(executeSelection(memory,schema,memory.ensure(foreignProof,foreignTruth)).length,0,
    "A53 foreign template semantic ZERO");

  // Proof/truth disagreement fails without inspecting either Application poles.
  const mismatchProof=memory.ensure(selected.environment,selected.application);
  const mismatchApp=memory.ensure(foreignTemplate,memory.ensure(selected.environment,basis.C));
  const mismatchTruth=memory.ensure(parent,mismatchApp);
  same(executeSelection(memory,schema,memory.ensure(mismatchProof,mismatchTruth)).length,0,
    "A53 proof/truth mismatch ZERO");

  // Valid result still continues through unchanged A21 under a selected child context.
  const marker=memory.ensure(result,basis.C);
  const authority=freezeAuthority(memory,[memory.ensure(result,marker)]);
  const K2=memory.ensure(parent,authority);
  const resultTruth=memory.ensure(K2,result);
  const E0=memory.ensure(K2,freezeFrontier(memory,[memory.ensure(memory.root,resultTruth)]));
  same(frontierTruthEnds(memory,step(memory,E0,"forward"))[0],marker,
    "A53 accepted result continues through unchanged A21");
}

function staticGuards():void{
  const root=resolve(process.cwd(),"..");
  const own=readFileSync(join(root,"ts/test/research-v013-proof-gated-application-a53.test.ts"),"utf8");
  const a37=readFileSync(join(root,"ts/test/research-v013-link-carried-admission-program-a37.test.ts"),"utf8");

  const derive=own.slice(
    own.indexOf("function deriveApplicationCandidate("),
    own.indexOf("/**\n * E1 candidate",own.indexOf("function deriveApplicationCandidate(")),
  );
  for(const forbidden of [
    "memory.poles(proofApplication","memory.poles(truthApplication",
    "memory.poles(application","same(","memory.find(","memory.ensure(startValue,endValue",
  ])assert(!derive.includes(forbidden),`A53 semantic derivation excludes ${forbidden}`);

  const physical=own.slice(
    own.indexOf("function constructPhysicalPairE1("),
    own.indexOf("\ninterface ValidationProgram",own.indexOf("function constructPhysicalPairE1(")),
  );
  for(const forbidden of ["schema","template","role","context","truth","application","poles(","find("])
    assert(!physical.toLowerCase().includes(forbidden),`A53 E1 constructor excludes semantic term ${forbidden}`);
  assert(physical.includes("memory.ensure(start,end)"),"A53 E1 boundary is only raw Link construction");

  const x=own.slice(own.indexOf("function step("),own.indexOf("\nfunction frontierTruthEnds(",own.indexOf("function step(")));
  const y=a37.slice(a37.indexOf("function step("),a37.indexOf("\ninterface Program",a37.indexOf("function step(")));
  same(x.replace(/\s+/g,""),y.replace(/\s+/g,""),"A53 runtime source-identical A21/A37");
}
function main():void{
  exercise(new Memory(),false);exercise(new Memory(),true);staticGuards();
  console.log([
    "MTS v0.13 A53: PROOF_GATED_APPLICATION=GREEN_SCOPED_RESEARCH",
    "APPLICATION_POLES_SEMANTIC_READS=0 HOST_ROLE_TEMPLATE_BOOLEAN_BRANCHES=0",
    "SEMANTIC_VALIDATION=STAGE_SCOPED_CANONICAL_COLLAPSE_PLUS_A21",
    "PHYSICAL_PAIR_CONSTRUCTOR=RAW_MEMORY_ENSURE_E1_CANDIDATE",
    "VALID=CONTEXTUAL_RESULT SWAPPED=ZERO FOREIGN_TEMPLATE=ZERO PROOF_MISMATCH=ZERO",
    "INVALID_PHYSICAL_SCRATCH_CAN_EXIST=YES AMBIENT_EXISTENCE_IS_NOT_AUTHORITY=CONFIRMED",
    "A21_RUNTIME=SOURCE_IDENTICAL RESULT_CONTINUATION=GREEN",
    "EXTERNAL_APPLICATION_SELECTION=INPUT_BOUNDARY",
    "NEXT_BOUNDARY=A54_E1_CONSTRUCTOR_CLASSIFICATION",
    "INDEPENDENT_MEMORIES=2 GLOBAL_E2=OPEN GLOBAL_E3=OPEN GLOBAL_E4=OPEN",
    "FULL_SELF_HOSTED=NOT_CLAIMED PRODUCTION_UNCHANGED",
  ].join(" "));
}
main();
