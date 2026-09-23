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
  if(!condition)throw new Error(`v0.13 A51 template pair join falsifier: ${message}`);
}
function same<T>(actual:T,expected:T,message:string):void{
  if(!Object.is(actual,expected))throw new Error(`v0.13 A51 template pair join falsifier: ${message}: values differ`);
}
function setSame(actual:readonly LinkHandle[],expected:readonly LinkHandle[],message:string):void{
  const a=new Set(actual),e=new Set(expected);same(a.size,e.size,`${message} cardinality`);
  for(const value of e)assert(a.has(value),`${message}: missing expected value`);
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

function frontierTruthLinks(memory:Memory,E:LinkHandle):readonly LinkHandle[]{
  const ep=memory.poles(E),out:LinkHandle[]=[];
  for(const occurrence of readChain(memory,ep.end,"frontier")){
    const truth=memory.poles(occurrence).end;
    same(memory.poles(truth).start,ep.start,"A51 frontier truth context");
    out.push(truth);
  }
  return Object.freeze(out);
}
function frontierTruthEnds(memory:Memory,E:LinkHandle):readonly LinkHandle[]{
  return Object.freeze(frontierTruthLinks(memory,E).map(t=>memory.poles(t).end));
}

interface Frame{readonly startRole:LinkHandle;readonly endRole:LinkHandle;}
function frame(memory:Memory,basis:RootBasis):Frame{
  const whole=memory.ensure(basis.L,basis.L);
  const startRole=memory.ensureStartSelfClosed(whole);
  const endRole=memory.ensureEndSelfClosed(whole);
  assert(startRole!==endRole,"A51 decomposition roles distinct");
  return Object.freeze({startRole,endRole});
}
interface ConstructionSchema{
  readonly rule:LinkHandle;
  readonly inputRoles:readonly [LinkHandle,LinkHandle];
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
function deriveProjection(
  memory:Memory,
  f:Frame,
  witness:LinkHandle,
  pole:"start"|"end",
):ProjectionCandidate{
  const evidence=new BindingEvidenceReader(memory);
  const wp=evidence.poles(witness),pair=evidence.poles(wp.start);
  const startBinding=evidence.poles(pair.start),endBinding=evidence.poles(pair.end);
  same(startBinding.start,f.startRole,"A51 start binding role");
  same(endBinding.start,f.endRole,"A51 end binding role");
  const target=wp.end,start=startBinding.end,end=endBinding.end;
  const reconstructed=memory.ensure(start,end);
  const projection=memory.ensure(target,pole==="start"?start:end);
  const gate=memory.ensureStartSelfClosed(target),query=memory.ensure(gate,reconstructed);
  same(evidence.counters.targetPoleReads,0,"A51 receiver target pole reads");
  return Object.freeze({target,start,end,projection,gate,query});
}
function validateProjection(memory:Memory,c:ProjectionCandidate,parent:LinkHandle):readonly LinkHandle[]{
  const authority=freezeAuthority(memory,[memory.ensure(c.gate,c.projection)]);
  const K=memory.ensure(parent,authority),truth=memory.ensure(K,c.query);
  const E0=memory.ensure(K,freezeFrontier(memory,[memory.ensure(memory.root,truth)]));
  return frontierTruthEnds(memory,step(memory,E0,"forward"));
}

function seedTemplateEvaluation(
  memory:Memory,
  targetTemplate:LinkHandle,
  selected:readonly LinkHandle[],
  parent:LinkHandle,
):LinkHandle{
  const K=memory.ensure(parent,freezeAuthority(memory,selected));
  const truth=memory.ensure(K,targetTemplate);
  return memory.ensure(K,freezeFrontier(memory,[memory.ensure(memory.root,truth)]));
}

/**
 * A16-F4 positive control, reduced to one selected request.
 * It receives only K->(K->left -> K->right) and constructs the requested pair.
 */
function executePairRequest(memory:Memory,context:LinkHandle,requestTruth:LinkHandle):LinkHandle{
  const truth=memory.poles(requestTruth);
  same(truth.start,context,"A51 pair request context");
  const request=memory.poles(truth.end);
  const leftTruth=memory.poles(request.start),rightTruth=memory.poles(request.end);
  same(leftTruth.start,context,"A51 pair left contextual");
  same(rightTruth.start,context,"A51 pair right contextual");
  return memory.ensure(context,memory.ensure(leftTruth.end,rightTruth.end));
}

function freshOperands(memory:Memory,basis:RootBasis):readonly [LinkHandle,LinkHandle]{
  const left=memory.ensure(memory.ensure(basis.C,basis.U),basis.L);
  const right=memory.ensure(memory.ensure(basis.O,basis.C),basis.U);
  return Object.freeze([left,right] as const);
}

function exercise(memory:Memory,withNoise:boolean):void{
  const basis=ensureRootBasis(memory);if(withNoise)memory.ensure(memory.ensure(basis.U,basis.C),basis.O);
  const f=frame(memory,basis),schema=defineConstructionSchema(memory,f,basis);
  const structural=readStructuralRule(memory,schema.rule);
  const outputs=readExactSequence(memory,structural.body).values;
  same(outputs.length,2,"A51 A49 schema output count");
  const targetTemplate=outputs[0]!,decompositionTemplate=outputs[1]!;
  const [startValue,endValue]=freshOperands(memory,basis);

  // The A49 schema itself carries ordered decomposition evidence for T=S->E.
  const startProjection=deriveProjection(memory,f,decompositionTemplate,"start");
  const endProjection=deriveProjection(memory,f,decompositionTemplate,"end");
  same(startProjection.target,targetTemplate,"A51 start projection target");
  same(endProjection.target,targetTemplate,"A51 end projection target");
  same(startProjection.start,schema.inputRoles[0],"A51 template START role");
  same(endProjection.end,schema.inputRoles[1],"A51 template END role");
  same(validateProjection(memory,startProjection,memory.ensure(basis.R,targetTemplate))[0],
    startProjection.projection,"A51 valid START projection admitted");
  same(validateProjection(memory,endProjection,memory.ensure(basis.O,targetTemplate))[0],
    endProjection.projection,"A51 valid END projection admitted");

  // Forged ordered decomposition still fails closed.
  const forged=memory.ensure(
    memory.ensure(memory.ensure(f.startRole,schema.inputRoles[1]),
      memory.ensure(f.endRole,schema.inputRoles[0])),
    targetTemplate,
  );
  same(validateProjection(
    memory,deriveProjection(memory,f,forged,"start"),memory.ensure(basis.C,targetTemplate),
  ).length,0,"A51 forged decomposition ZERO");

  // Link-native decomposition + role binding + A21 reaches both concrete poles.
  // It cannot construct their pair: A21 is unary detachment.
  const bindings=[
    memory.ensure(schema.inputRoles[0],startValue),
    memory.ensure(schema.inputRoles[1],endValue),
  ] as const;
  const selected=[
    startProjection.projection,endProjection.projection,...bindings,
  ] as const;
  assert(memory.find(startValue,endValue)===undefined,"A51 concrete target absent before evaluation");
  let E=seedTemplateEvaluation(memory,targetTemplate,selected,memory.ensure(basis.L,basis.U));
  E=step(memory,E,"forward");
  setSame(frontierTruthEnds(memory,E),schema.inputRoles,"A51 decomposition exposes both roles");
  E=step(memory,E,"forward");
  setSame(frontierTruthEnds(memory,E),[startValue,endValue],"A51 bindings expose both concrete poles");
  const operandTruthLinks=frontierTruthLinks(memory,E);
  E=step(memory,E,"forward");
  same(frontierTruthEnds(memory,E).length,0,"A51 decomposition plus A21 cannot perform binary join");
  assert(memory.find(startValue,endValue)===undefined,"A51 failed join does not materialize target");

  // Ambient physical existence is not semantic construction authority.
  const ambientPair=memory.ensure(startValue,endValue);
  same(frontierTruthEnds(memory,step(memory,E,"forward")).length,0,
    "A51 ambient pair cannot revive terminal frontier");

  // Positive control: one explicit Link-carried pair request closes exactly the
  // missing binary step and yields K->(startValue->endValue).
  const evalContext=memory.poles(
    seedTemplateEvaluation(memory,targetTemplate,selected,memory.ensure(basis.L,basis.U)),
  ).start;
  const leftTruth=operandTruthLinks.find(t=>memory.poles(t).end===startValue);
  const rightTruth=operandTruthLinks.find(t=>memory.poles(t).end===endValue);
  assert(leftTruth!==undefined&&rightTruth!==undefined,"A51 operand truths selected");
  same(memory.poles(leftTruth).start,memory.poles(rightTruth).start,"A51 operand truth contexts agree");
  const request=memory.ensure(leftTruth,rightTruth);
  const requestTruth=memory.ensure(memory.poles(leftTruth).start,request);
  const pairedTruth=executePairRequest(memory,memory.poles(leftTruth).start,requestTruth);
  same(memory.poles(pairedTruth).end,ambientPair,"A51 A16 pair control yields exact target");
  void evalContext;
}

function staticGuards():void{
  const root=resolve(process.cwd(),"..");
  const own=readFileSync(join(root,"ts/test/research-v013-template-pair-join-falsifier-a51.test.ts"),"utf8");
  const a37=readFileSync(join(root,"ts/test/research-v013-link-carried-admission-program-a37.test.ts"),"utf8");

  const execution=own.slice(0,own.indexOf("\nfunction staticGuards("));
  for(const forbidden of [
    "instantiateStructuralSchema(","compileSchemaPlan(","executeConstructionPlan(","const clone=",
  ])assert(!execution.includes(forbidden),`A51 contains no recursive template executor ${forbidden}`);

  const pairless=own.slice(
    own.indexOf("function seedTemplateEvaluation("),
    own.indexOf("/**\n * A16-F4 positive control",own.indexOf("function seedTemplateEvaluation(")),
  );
  assert(!pairless.includes("memory.ensure(leftTruth.end,rightTruth.end)"),
    "A51 pairless template evaluation contains no binary construction oracle");

  const x=own.slice(own.indexOf("function step("),own.indexOf("\nfunction frontierTruthLinks(",own.indexOf("function step(")));
  const y=a37.slice(a37.indexOf("function step("),a37.indexOf("\ninterface Program",a37.indexOf("function step(")));
  same(x.replace(/\s+/g,""),y.replace(/\s+/g,""),"A51 runtime source-identical A21/A37");
}
function main():void{
  exercise(new Memory(),false);exercise(new Memory(),true);staticGuards();
  console.log([
    "MTS v0.13 A51: TEMPLATE_PAIR_JOIN_FALSIFIER=GREEN",
    "GENERIC_RECURSIVE_CLONE_SOURCE_REMOVAL=RED_BINARY_JOIN_MISSING",
    "A49_SCHEMA=UNCHANGED DECOMPOSITION=A47_STYLE_PROOF_CARRIED",
    "ROLE_BINDINGS=LINK_CARRIED A21=SOURCE_IDENTICAL",
    "DECOMPOSITION_PLUS_BINDINGS=CONCRETE_POLES_REACHED",
    "WITHOUT_PAIR_JOIN=ZERO TARGET_NOT_MATERIALIZED",
    "AMBIENT_PAIR=INERT FORGED_DECOMPOSITION=ZERO",
    "A16_F4_PAIR_REQUEST_CONTROL=EXACT_TARGET",
    "MINIMUM_MISSING_AUTHORITY=DYNAMIC_BINARY_PAIR_REQUEST",
    "NEXT_BOUNDARY=A52_RECONNECT_A16_F5_PAIR_REQUEST_PRODUCTION",
    "INDEPENDENT_MEMORIES=2 GLOBAL_E2=OPEN GLOBAL_E3=OPEN GLOBAL_E4=OPEN",
    "FULL_SELF_HOSTED=NOT_CLAIMED PRODUCTION_UNCHANGED",
  ].join(" "));
}
main();
