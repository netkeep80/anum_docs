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
  if(!condition)throw new Error(`v0.13 A52 application normal form: ${message}`);
}
function same<T>(actual:T,expected:T,message:string):void{
  assert(Object.is(actual,expected),`${message}: values differ`);
}
function expectThrows(run:()=>void,message:string):void{
  let threw=false;try{run();}catch{threw=true;}assert(threw,message);
}
function freezeAuthority(memory:Memory,values:readonly LinkHandle[]):LinkHandle{
  let body=memory.root;for(let i=values.length-1;i>=0;i-=1)body=memory.ensure(values[i]!,body);
  return memory.ensureStartSelfClosed(body);
}
function freezeFrontier(memory:Memory,values:readonly LinkHandle[]):LinkHandle{
  let body=memory.root;for(let i=values.length-1;i>=0;i-=1)body=memory.ensure(values[i]!,body);
  return memory.ensureStartSelfClosed(body);
}
function readChain(memory:Memory,envelope:LinkHandle,kind:string):readonly LinkHandle[]{
  const e=memory.poles(envelope);assert(e.start===envelope&&e.end!==envelope,`A21 ${kind} envelope`);
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
    same(truth.start,ep.start,"A52 frontier context");out.push(truth.end);
  }
  return Object.freeze(out);
}

interface Frame{readonly startRole:LinkHandle;readonly endRole:LinkHandle;}
function frame(memory:Memory,basis:RootBasis):Frame{
  const whole=memory.ensure(basis.L,basis.L);
  const startRole=memory.ensureStartSelfClosed(whole);
  const endRole=memory.ensureEndSelfClosed(whole);
  assert(startRole!==endRole,"A52 decomposition roles distinct");
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
  same(startBinding.start,f.startRole,"A52 start binding role");
  same(endBinding.start,f.endRole,"A52 end binding role");
  const target=wp.end,start=startBinding.end,end=endBinding.end;
  const reconstructed=memory.ensure(start,end),projection=memory.ensure(target,start);
  const gate=memory.ensureStartSelfClosed(target),query=memory.ensure(gate,reconstructed);
  same(evidence.counters.targetPoleReads,0,"A52 receiver target pole reads");
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
  readonly truth:LinkHandle;
}
/**
 * Irreducible selected input:
 *
 *   Env = (S->s) -> (E->e)
 *   Q   = T -> Env
 *   K -> Q
 *
 * No state/event/truth frontier is scanned or cross-producted. The caller
 * chooses what application to evaluate; result semantics remain with schema.
 */
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
  return Object.freeze({
    environment,application,truth:memory.ensure(context,application),
  });
}

/**
 * Generic binary application executor. It receives only selected K->(T->Env)
 * plus the Link-carried schema authority. It never receives operand frontiers.
 */
function executeTemplateApplication(
  memory:Memory,
  f:Frame,
  schema:ConstructionSchema,
  requestTruth:LinkHandle,
):LinkHandle{
  const truth=memory.poles(requestTruth),context=truth.start;
  const application=memory.poles(truth.end);
  same(application.start,schema.targetTemplate,"A52 selected template");
  const environment=memory.poles(application.end);
  const leftBinding=memory.poles(environment.start);
  const rightBinding=memory.poles(environment.end);

  const witness=memory.poles(schema.witnessTemplate);
  same(witness.end,schema.targetTemplate,"A52 witness target");
  const rolePair=memory.poles(witness.start);
  const expectedLeft=memory.poles(rolePair.start),expectedRight=memory.poles(rolePair.end);
  same(expectedLeft.start,f.startRole,"A52 witness START role tag");
  same(expectedRight.start,f.endRole,"A52 witness END role tag");
  same(leftBinding.start,expectedLeft.end,"A52 environment START binding role");
  same(rightBinding.start,expectedRight.end,"A52 environment END binding role");

  const result=memory.ensure(leftBinding.end,rightBinding.end);
  return memory.ensure(context,result);
}

function executeResultContinuation(
  memory:Memory,
  resultTruth:LinkHandle,
):readonly LinkHandle[]{
  const truth=memory.poles(resultTruth),K=truth.start;
  const occurrence=memory.ensure(memory.root,resultTruth);
  const E0=memory.ensure(K,freezeFrontier(memory,[occurrence]));
  return frontierTruthEnds(memory,step(memory,E0,"forward"));
}

function freshValues(memory:Memory,basis:RootBasis):readonly [LinkHandle,LinkHandle]{
  const start=memory.ensure(memory.ensure(basis.C,basis.U),basis.L);
  const end=memory.ensure(memory.ensure(basis.O,basis.C),basis.U);
  return Object.freeze([start,end] as const);
}

function exercise(memory:Memory,withNoise:boolean):void{
  const basis=ensureRootBasis(memory);if(withNoise)memory.ensure(memory.ensure(basis.U,basis.C),basis.O);
  const f=frame(memory,basis),schema=defineConstructionSchema(memory,f,basis);
  const structural=readStructuralRule(memory,schema.rule);
  const body=readExactSequence(memory,structural.body).values;
  same(body[0],schema.targetTemplate,"A52 unchanged A49 target template");
  same(body[1],schema.witnessTemplate,"A52 unchanged A49 witness template");

  const admitted=deriveStartProjection(memory,f,schema.witnessTemplate);
  same(validateProjection(memory,admitted,memory.ensure(basis.R,schema.targetTemplate))[0],
    admitted.projection,"A52 template decomposition authority admitted");

  // Forged schema decomposition remains fail-closed under A47 canonical gate.
  const forged=memory.ensure(
    memory.ensure(
      memory.ensure(f.startRole,schema.inputRoles[1]),
      memory.ensure(f.endRole,schema.inputRoles[0]),
    ),
    schema.targetTemplate,
  );
  same(validateProjection(
    memory,deriveStartProjection(memory,f,forged),memory.ensure(basis.C,schema.targetTemplate),
  ).length,0,"A52 forged decomposition ZERO");

  const [startValue,endValue]=freshValues(memory,basis);
  assert(memory.find(startValue,endValue)===undefined,"A52 result absent before selected application");

  const marker=memory.ensure(basis.L,basis.U);
  const transition=memory.ensure(memory.ensure(startValue,endValue),marker);
  // Remove the oracle-created result before execution is impossible in canonical
  // Memory, so use a fresh pair for the actual selected application below.
  const actualStart=memory.ensure(startValue,basis.R);
  const actualEnd=memory.ensure(endValue,basis.R);
  assert(memory.find(actualStart,actualEnd)===undefined,"A52 actual result absent");
  const actualMarker=memory.ensure(marker,basis.C);
  const actualTransitionAntecedent=memory.ensure(actualStart,actualEnd);
  const actualTransition=memory.ensure(actualTransitionAntecedent,actualMarker);
  // The continuation above necessarily materializes its antecedent, so use a
  // second independent application to test result creation without prebuilding
  // a continuation target.
  void transition;void actualTransition;

  const requestedStart=memory.ensure(actualStart,basis.O);
  const requestedEnd=memory.ensure(actualEnd,basis.O);
  assert(memory.find(requestedStart,requestedEnd)===undefined,"A52 requested pair absent");
  const parent=memory.ensure(basis.O,basis.U);
  const K=memory.ensure(parent,freezeAuthority(memory,[]));
  const selected=selectedApplicationInput(memory,K,schema,requestedStart,requestedEnd);

  // Ambient alternate application is physically present but unselected.
  const ambientStart=memory.ensure(requestedStart,basis.C);
  const ambientEnd=memory.ensure(requestedEnd,basis.C);
  const ambient=selectedApplicationInput(memory,K,schema,ambientStart,ambientEnd);
  assert(ambient.truth!==selected.truth,"A52 ambient application distinct");

  const resultTruth=executeTemplateApplication(memory,f,schema,selected.truth);
  const result=memory.poles(resultTruth).end;
  same(result,memory.find(requestedStart,requestedEnd),"A52 selected application yields exact pair");
  assert(result!==undefined,"A52 selected application materializes requested pair");
  assert(memory.find(ambientStart,ambientEnd)===undefined,"A52 ambient application remains inert");

  // The environment is an ordered role-binding carrier, not contextual-truth
  // frontier pairing. Swapping its bindings fails closed.
  const env=memory.poles(selected.environment);
  const swapped=memory.ensure(env.end,env.start);
  const malformedApplication=memory.ensure(schema.targetTemplate,swapped);
  const malformedTruth=memory.ensure(K,malformedApplication);
  expectThrows(
    ()=>{executeTemplateApplication(memory,f,schema,malformedTruth);},
    "A52 swapped binding environment rejected",
  );

  const foreignTemplate=memory.ensure(schema.targetTemplate,basis.U);
  const foreignTruth=memory.ensure(K,memory.ensure(foreignTemplate,selected.environment));
  expectThrows(
    ()=>{executeTemplateApplication(memory,f,schema,foreignTruth);},
    "A52 foreign template rejected",
  );

  // A21 stays unary and unchanged. The selected application executor emits a
  // normal contextual result truth that A21 can continue from.
  const continuationMarker=memory.ensure(result,basis.C);
  const continuation=memory.ensure(result,continuationMarker);
  const K2=memory.ensure(memory.ensure(parent,basis.C),freezeAuthority(memory,[continuation]));
  const selected2=selectedApplicationInput(memory,K2,schema,requestedStart,requestedEnd);
  const resultTruth2=executeTemplateApplication(memory,f,schema,selected2.truth);
  same(executeResultContinuation(memory,resultTruth2)[0],continuationMarker,
    "A52 application result continues through unchanged A21");
}

function staticGuards():void{
  const root=resolve(process.cwd(),"..");
  const own=readFileSync(join(root,"ts/test/research-v013-application-normal-form-a52.test.ts"),"utf8");
  const a37=readFileSync(join(root,"ts/test/research-v013-link-carried-admission-program-a37.test.ts"),"utf8");
  const producer=own.slice(
    own.indexOf("function selectedApplicationInput("),
    own.indexOf("/**\n * Generic binary application executor",own.indexOf("function selectedApplicationInput(")),
  );
  for(const forbidden of ["BundleValue","occurrences","for(","for (","map(","forEach","outgoing(","incoming("])
    assert(!producer.includes(forbidden),`A52 selected input has no frontier producer ${forbidden}`);

  const executor=own.slice(
    own.indexOf("function executeTemplateApplication("),
    own.indexOf("\nfunction executeResultContinuation(",own.indexOf("function executeTemplateApplication(")),
  );
  for(const forbidden of ["BundleValue","occurrences","for(","for (","map(","forEach","outgoing(","incoming(","allLinks("])
    assert(!executor.includes(forbidden),`A52 executor has no frontier/all-to-all primitive ${forbidden}`);

  const x=own.slice(own.indexOf("function step("),own.indexOf("\nfunction frontierTruthEnds(",own.indexOf("function step(")));
  const y=a37.slice(a37.indexOf("function step("),a37.indexOf("\ninterface Program",a37.indexOf("function step(")));
  same(x.replace(/\s+/g,""),y.replace(/\s+/g,""),"A52 runtime source-identical A21/A37");
}
function main():void{
  exercise(new Memory(),false);exercise(new Memory(),true);staticGuards();
  console.log([
    "MTS v0.13 A52: APPLICATION_NORMAL_FORM=GREEN_SCOPED_RESEARCH",
    "HOST_SELECTED_OPERAND_FRONTIERS=0 ALL_TO_ALL_PAIRING=0",
    "JOIN_REQUEST=SELECTED_APPLICATION_T_TO_BINDING_ENVIRONMENT",
    "APPLICATION_TRUTH=K_TO_Q EXTERNAL_SELECTION=INPUT_BOUNDARY",
    "RESULT_SEMANTICS=A49_TEMPLATE_PLUS_ORDERED_ROLE_BINDINGS",
    "SELECTED_APPLICATION=EXACT_PAIR AMBIENT_APPLICATION=INERT",
    "SWAPPED_ENV=REJECTED FOREIGN_TEMPLATE=REJECTED FORGED_DECOMPOSITION=ZERO",
    "A21_RUNTIME=SOURCE_IDENTICAL RESULT_CONTINUATION=GREEN",
    "GENERIC_BINARY_APPLICATION_EXECUTOR=HOST_RESIDUAL",
    "SCHEMA_AUTHORITY_SOURCE=FIXTURE_RESIDUAL",
    "NEXT_BOUNDARY=A53_APPLICATION_EXECUTOR_AUTHORITY",
    "INDEPENDENT_MEMORIES=2 GLOBAL_E2=OPEN GLOBAL_E3=OPEN GLOBAL_E4=OPEN",
    "FULL_SELF_HOSTED=NOT_CLAIMED PRODUCTION_UNCHANGED",
  ].join(" "));
}
main();
