import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import {
  materializeExactSequence,
  readExactSequence,
} from "../src/exact-sequence.js";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
  type RootBasis,
} from "../src/memory.js";
import {
  defineContext,
  readContext,
} from "../src/state.js";

function assert(c:unknown,m:string):asserts c{
  if(!c)throw new Error(`v0.13 A71c rule self-authoring gap: ${m}`);
}
function same<T>(a:T,e:T,m:string):void{
  assert(Object.is(a,e),`${m}: values differ`);
}
function setSame(actual:readonly LinkHandle[],expected:readonly LinkHandle[],m:string):void{
  same(new Set(actual).size,new Set(expected).size,`${m}: cardinality`);
  for(const x of expected)assert(actual.includes(x),`${m}: missing expected Link`);
}

interface CellView{readonly previous:LinkHandle;readonly value:LinkHandle;}
function readExactCell(memory:Memory,cell:LinkHandle):CellView{
  assert(cell!==memory.root,"exact cell is not root");
  const outer=memory.poles(cell);
  same(outer.start,cell,"exact cell START-self-closed");
  const payload=memory.poles(outer.end);
  return Object.freeze({previous:payload.start,value:payload.end});
}
function definePosition(memory:Memory,sequence:LinkHandle,currentCell:LinkHandle):LinkHandle{
  return memory.ensure(sequence,currentCell);
}
interface PositionStep{
  readonly argument:LinkHandle;
  readonly doneAfter:boolean;
  readonly nextPosition?:LinkHandle;
}
function stepPosition(memory:Memory,position:LinkHandle):PositionStep{
  const p=memory.poles(position);
  const sequence=p.start;
  const current=p.end;
  const currentView=readExactCell(memory,current);
  if(current===sequence)return Object.freeze({argument:currentView.value,doneAfter:true});
  let cursor=sequence;
  const seen=new Set<LinkHandle>();
  while(cursor!==memory.root){
    assert(!seen.has(cursor),"sequence ancestry cycle");
    seen.add(cursor);
    const view=readExactCell(memory,cursor);
    if(view.previous===current){
      return Object.freeze({
        argument:currentView.value,
        doneAfter:false,
        nextPosition:definePosition(memory,sequence,cursor),
      });
    }
    cursor=view.previous;
  }
  throw new Error("selected current cell is not in selected sequence");
}
function initialPosition(memory:Memory,sequence:LinkHandle):LinkHandle{
  assert(sequence!==memory.root,"selected sequence must be non-empty");
  const seen=new Set<LinkHandle>();
  let current=sequence;
  while(true){
    assert(!seen.has(current),"selected sequence ancestry cycle");
    seen.add(current);
    const cell=readExactCell(memory,current);
    if(cell.previous===memory.root)return definePosition(memory,sequence,current);
    current=cell.previous;
  }
}
function defineFrame(memory:Memory,parent:LinkHandle,f:LinkHandle,position:LinkHandle):LinkHandle{
  return defineContext(memory,parent,memory.ensure(f,position));
}

/** Source-identical A68a rewrite core. */
function rewriteSelectedOne(
  memory: Memory,
  activeTruth: LinkHandle,
  selectedContinuationCarrier: LinkHandle,
): readonly LinkHandle[] {
  const active = memory.poles(activeTruth);
  const context = active.start;
  const antecedent = active.end;

  const selected = readExactSequence(memory, selectedContinuationCarrier).values;
  const targets = selected.map((continuation) => {
    const c = memory.poles(continuation);
    same(c.start, antecedent, "selected continuation starts at active antecedent");
    return c.end;
  });

  return Object.freeze(
    targets.map((target) => memory.ensure(context, target)),
  );
}
function carrier(memory:Memory,values:readonly LinkHandle[]):LinkHandle{
  return materializeExactSequence(memory,values);
}

/** Source-identical A70c continuation derivation. */
function deriveFrameContinuation(
  memory:Memory,
  context:LinkHandle,
  selectedResultFact:LinkHandle,
):LinkHandle{
  const k=readContext(memory,context);
  const state=memory.poles(k.current);
  const f=state.start;
  const position=state.end;

  const positionStep=stepPosition(memory,position);
  assert(!positionStep.doneAfter,"factorized step requires non-final position");
  assert(positionStep.nextPosition!==undefined,"factorized next position exists");

  const fact=memory.poles(selectedResultFact);
  const application=memory.poles(fact.start);
  same(application.start,f,"factorized result uses current F");
  same(application.end,positionStep.argument,
    "factorized result uses current ExactSequence argument");

  const nextState=memory.ensure(fact.end,positionStep.nextPosition);
  const contextPayload=memory.poles(context).end;
  return memory.ensure(contextPayload,nextState);
}

interface IntrinsicApplication {
  readonly f:LinkHandle;
  readonly argument:LinkHandle;
  readonly application:LinkHandle|undefined;
  readonly resultFacts:readonly LinkHandle[];
}

/** Source-identical A70g intrinsic result discovery. */
function intrinsicApplicationResults(
  memory:Memory,
  context:LinkHandle,
):IntrinsicApplication{
  const k=readContext(memory,context);
  const state=memory.poles(k.current);
  const f=state.start;
  const positionStep=stepPosition(memory,state.end);
  const argument=positionStep.argument;

  let application:LinkHandle|undefined;
  for(const candidate of memory.outgoing(f)){
    const p=memory.poles(candidate);
    if(p.start!==f || p.end!==argument)continue;
    assert(p.start!==candidate && p.end!==candidate,
      "current application must be an ordinary PAIR");
    assert(application===undefined || application===candidate,
      "canonical current application must be unique");
    application=candidate;
  }

  if(application===undefined){
    return Object.freeze({
      f,argument,application:undefined,resultFacts:Object.freeze([]),
    });
  }

  const resultFacts:LinkHandle[]=[];
  const seen=new Set<LinkHandle>();
  for(const candidate of memory.outgoing(application)){
    if(seen.has(candidate))continue;
    const p=memory.poles(candidate);
    if(p.start!==application)continue;
    if(p.start===candidate || p.end===candidate)continue;
    seen.add(candidate);
    resultFacts.push(candidate);
  }

  return Object.freeze({
    f,
    argument,
    application,
    resultFacts:Object.freeze(resultFacts),
  });
}

interface IntrinsicNonFinalStep{
  readonly resultFacts:readonly LinkHandle[];
  readonly children:readonly LinkHandle[];
  readonly closure?:LinkHandle;
}
function executeIntrinsicNonFinal(
  memory:Memory,
  context:LinkHandle,
):IntrinsicNonFinalStep{
  const k=readContext(memory,context);
  const state=memory.poles(k.current);
  const positionStep=stepPosition(memory,state.end);
  assert(!positionStep.doneAfter,"A70g is scoped to non-final position");
  assert(positionStep.nextPosition!==undefined,"A70g non-final next position");

  const intrinsic=intrinsicApplicationResults(memory,context);

  if(intrinsic.resultFacts.length===0){
    return Object.freeze({
      resultFacts:intrinsic.resultFacts,
      children:Object.freeze([]),
      closure:memory.ensureEndSelfClosed(context),
    });
  }

  const continuations=intrinsic.resultFacts.map(
    (fact)=>deriveFrameContinuation(memory,context,fact),
  );
  const outputs=rewriteSelectedOne(memory,context,carrier(memory,continuations));
  const children=outputs.map((output)=>memory.ensureStartSelfClosed(output));

  return Object.freeze({
    resultFacts:intrinsic.resultFacts,
    children:Object.freeze(children),
  });
}

/**
 * Minimal source-equivalent A52 construction capability.
 *
 * It is intentionally kept separate from the natural A70/A71 executor so the
 * experiment can ask whether the latter invokes it by itself.
 */
interface ConstructionFrame{
  readonly startRole:LinkHandle;
  readonly endRole:LinkHandle;
}
function constructionFrame(memory:Memory,basis:RootBasis):ConstructionFrame{
  const whole=memory.ensure(basis.L,basis.L);
  const startRole=memory.ensureStartSelfClosed(whole);
  const endRole=memory.ensureEndSelfClosed(whole);
  assert(startRole!==endRole,"construction roles distinct");
  return Object.freeze({startRole,endRole});
}
interface ConstructionSchema{
  readonly inputRoles:readonly [LinkHandle,LinkHandle];
  readonly targetTemplate:LinkHandle;
  readonly witnessTemplate:LinkHandle;
}
function constructionSchema(
  memory:Memory,
  f:ConstructionFrame,
  basis:RootBasis,
):ConstructionSchema{
  const marker=memory.ensure(basis.U,basis.U);
  const sRole=memory.ensure(memory.ensure(basis.O,marker),marker);
  const eRole=memory.ensure(sRole,marker);
  const target=memory.ensure(sRole,eRole);
  const startBinding=memory.ensure(f.startRole,sRole);
  const endBinding=memory.ensure(f.endRole,eRole);
  const witness=memory.ensure(memory.ensure(startBinding,endBinding),target);
  return Object.freeze({
    inputRoles:[sRole,eRole] as const,
    targetTemplate:target,
    witnessTemplate:witness,
  });
}
interface ApplicationInput{
  readonly environment:LinkHandle;
  readonly application:LinkHandle;
  readonly truth:LinkHandle;
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
  return Object.freeze({
    environment,application,truth:memory.ensure(context,application),
  });
}
function executeTemplateApplication(
  memory:Memory,
  f:ConstructionFrame,
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

function frameFunction(memory:Memory,context:LinkHandle):LinkHandle{
  const k=readContext(memory,context);
  return memory.poles(k.current).start;
}

function exercise(noise:boolean):void{
  const memory=new Memory();
  const b=ensureRootBasis(memory);
  const C=b.C;
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

  // Desired new executable rule is absent:
  //
  //   futureApplication = F_future -> a_future
  //   wantedRule        = futureApplication -> Y_future
  //
  const fFuture=memory.ensure(at(0),at(1));
  const aFuture=memory.ensure(at(2),at(3));
  const yFuture=memory.ensure(at(4),at(5));
  const futureApplication=memory.ensure(fFuture,aFuture);
  assert(memory.find(futureApplication,yFuture)===undefined,
    "wanted executable rule absent before request");

  // Build a valid Link-carried A52 construction request for exactly that pair,
  // but do not invoke its construction executor.
  const cf=constructionFrame(memory,b);
  const cs=constructionSchema(memory,cf,b);
  const constructionContext=memory.ensure(at(6),at(7));
  const request=selectedApplicationInput(
    memory,
    constructionContext,
    cs,
    futureApplication,
    yFuture,
  );
  assert(memory.find(futureApplication,yFuture)===undefined,
    "encoding valid construction request does not materialize wanted rule");

  // A70/A71 natural dynamics receives the valid construction request as an
  // ordinary function result.
  const trigger=memory.ensure(at(8),at(9));
  const nextArg=memory.ensure(at(10),at(11));
  const sequence=materializeExactSequence(memory,[trigger,nextArg]);
  const p0=initialPosition(memory,sequence);
  const p1=stepPosition(memory,p0).nextPosition!;
  same(stepPosition(memory,p1).doneAfter,true,"p1 final control");

  const f0=memory.ensure(at(12),at(13));
  const app0=memory.ensure(f0,trigger);
  const toRequest=memory.ensure(app0,request.truth);
  const k0=defineFrame(memory,C,f0,p0);

  const first=executeIntrinsicNonFinal(memory,k0);
  setSame(first.resultFacts,[toRequest],
    "natural dynamics selects exact request-valued result");
  same(first.children.length,1,"request-valued result creates one child");

  const child=first.children[0]!;
  same(frameFunction(memory,child),request.truth,
    "valid construction request becomes ordinary next function identity");
  assert(memory.find(futureApplication,yFuture)===undefined,
    "natural transition does not dispatch request to pair constructor");

  // At the next generation the intrinsic machine treats request.truth as F.
  // With no request.truth->nextArg application, it derives ZERO and closes the
  // branch rather than interpreting the function handle as a construction act.
  const childRead=intrinsicApplicationResults(memory,child);
  same(childRead.f,request.truth,"request carried as current F");
  same(childRead.argument,nextArg,"request-function next argument");
  same(childRead.application,undefined,
    "no semantic dispatch from request shape to construction executor");
  setSame(childRead.resultFacts,[],"request-function has intrinsic ZERO values");

  // Do not execute final handler; the key self-authoring falsifier is already
  // observable before any final publication.
  assert(memory.find(futureApplication,yFuture)===undefined,
    "wanted executable rule still absent after natural request propagation");

  // A probe Context confirms the future application currently has no value.
  const probeSequence=materializeExactSequence(memory,[aFuture]);
  const probePosition=initialPosition(memory,probeSequence);
  const probeParent=memory.ensure(at(14),at(15));
  const probe=defineFrame(memory,probeParent,fFuture,probePosition);
  setSame(intrinsicApplicationResults(memory,probe).resultFacts,[],
    "A70g cannot discover absent future rule before explicit construction");

  // Historical A52 capability can materialize exactly the requested pair when
  // explicitly invoked. This isolates the missing bridge to orchestration /
  // interpretation of the request, not physical Link construction.
  const explicitResultTruth=executeTemplateApplication(memory,cf,cs,request.truth);
  const wantedRule=memory.find(futureApplication,yFuture);
  assert(wantedRule!==undefined,
    "explicit A52 construction executor materializes wanted rule");
  same(memory.poles(explicitResultTruth).end,wantedRule,
    "A52 result truth carries exact constructed rule");

  setSame(intrinsicApplicationResults(memory,probe).resultFacts,[wantedRule],
    "newly constructed pair is immediately intrinsic A70g rule authority");

  // Thus the substrate already supports executable rule creation; the natural
  // A70/A71 cycle does not yet recognize/dispatch its own construction request.
}

function sourceSlice(source:string,start:string,end:string):string{
  const i=source.indexOf(start),j=source.indexOf(end,i+1);
  assert(i>=0&&j>i,`source slice ${start}`);
  return source.slice(i,j).replace(/\s+/g,"");
}

function staticGuards():void{
  const root=resolve(process.cwd(),"..");
  const own=readFileSync(
    join(root,"ts/test/research-v013-rule-self-authoring-gap-a71c.test.ts"),"utf8",
  );
  const a70g=readFileSync(
    join(root,"ts/test/research-v013-intrinsic-application-results-a70g.test.ts"),"utf8",
  );
  const a52=readFileSync(
    join(root,"ts/test/research-v013-application-normal-form-a52.test.ts"),"utf8",
  );

  same(
    sourceSlice(own,"function intrinsicApplicationResults(","\ninterface IntrinsicNonFinalStep"),
    sourceSlice(a70g,"function intrinsicApplicationResults(","\ninterface IntrinsicNonFinalStep"),
    "A71c natural rule discovery source-identical A70g",
  );
  same(
    sourceSlice(own,"function executeIntrinsicNonFinal(","\n/**\n * Minimal source-equivalent A52"),
    sourceSlice(a70g,"function executeIntrinsicNonFinal(","\nfunction exercise("),
    "A71c natural executor source-identical A70g",
  );
  same(
    sourceSlice(own,"function selectedApplicationInput(","\nfunction executeTemplateApplication("),
    sourceSlice(a52,"function selectedApplicationInput(","\n/**\n * Generic binary application executor"),
    "A71c construction request source-identical A52",
  );
  same(
    sourceSlice(
      own,
      "function executeTemplateApplication(",
      "\nfunction frameFunction(",
    ).replaceAll("ConstructionFrame","Frame"),
    sourceSlice(
      a52,
      "function executeTemplateApplication(",
      "\nfunction executeResultContinuation(",
    ),
    "A71c explicit construction oracle source-equivalent A52 modulo local frame type name",
  );

  const natural=sourceSlice(
    own,
    "const first=executeIntrinsicNonFinal(memory,k0)",
    "\n  // Historical A52 capability",
  );
  assert(!natural.includes("executeTemplateApplication("),
    "natural A70/A71 path contains no hidden A52 dispatch");
  assert(!natural.includes("memory.ensure(futureApplication,yFuture)"),
    "natural path does not directly author wanted rule");
}

function main():void{
  exercise(false);
  exercise(true);
  staticGuards();

  console.log([
    "MTS v0.13 A71c: RULE_TOPOLOGY_SELF_AUTHORING=RED_SCOPED_RESEARCH",
    "VALID_LINK_CARRIED_CONSTRUCTION_REQUEST=YES",
    "NATURAL_A70_A71_RESULT_CAN_CARRY_REQUEST=YES",
    "REQUEST_RESULT=BECOMES_NEXT_FUNCTION",
    "AUTOMATIC_REQUEST_DISPATCH_TO_CONSTRUCTOR=NO",
    "WANTED_APPLICATION_TO_VALUE_RULE_AFTER_NATURAL_STEP=ABSENT",
    "A52_EXPLICIT_CONSTRUCTION=GREEN",
    "CONSTRUCTED_PAIR=IMMEDIATELY_VISIBLE_TO_A70G_AS_RULE_AUTHORITY",
    "PHYSICAL_PAIR_CONSTRUCTION_CAPABILITY=MISSING_NO",
    "MISSING_BRIDGE=CONTEXT_NATIVE_REQUEST_INTERPRETATION_OR_ORCHESTRATION",
    "META_LAW_SELF_RECONFIGURING_RULE_AUTHORING=NOT_YET_PROVEN",
    "A60_E4_ORCHESTRATION_RESIDUAL=RECONFIRMED_IN_NEW_DYNAMIC_MODEL",
    "NEXT=A71D_CONTEXT_NATIVE_CONSTRUCTION_REQUEST_DISPATCH",
    "FULL_SELF_HOSTED=FALSE",
    "V013_NOT_ACCEPTED PRODUCTION_UNCHANGED",
  ].join(" "));
}

main();
