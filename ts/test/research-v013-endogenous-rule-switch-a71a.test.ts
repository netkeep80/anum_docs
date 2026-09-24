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
} from "../src/memory.js";
import {
  defineContext,
  readContext,
} from "../src/state.js";

function assert(c:unknown,m:string):asserts c{
  if(!c)throw new Error(`v0.13 A71a endogenous rule switch: ${m}`);
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

/**
 * Source-identical A68a rewrite core.
 */
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

/**
 * Source-identical A70c continuation derivation.
 */
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

/**
 * Source-identical A70g intrinsic application result discovery.
 */
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

/**
 * Source-identical A70g non-final execution.
 */
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
  for(let i=0;i<34;i+=1){
    seed=memory.ensure(seed,i%2===0?b.O:b.C);
    fresh.push(seed);
  }
  const at=(i:number):LinkHandle=>{
    const value=fresh[i];
    assert(value!==undefined,`fresh anchor ${i}`);
    return value;
  };

  const a1=memory.ensure(at(0),at(1));
  const a2=memory.ensure(at(2),at(3));
  const a3=memory.ensure(at(4),at(5));
  const sequence=materializeExactSequence(memory,[a1,a2,a3]);
  const p0=initialPosition(memory,sequence);
  const p1=stepPosition(memory,p0).nextPosition!;
  const p2=stepPosition(memory,p1).nextPosition!;
  same(stepPosition(memory,p2).doneAfter,true,"P2 final");

  const f0=memory.ensure(at(6),at(7));
  const f1=memory.ensure(at(8),at(9));
  const f2=memory.ensure(at(10),at(11));
  const g1=memory.ensure(at(12),at(13));
  const g2=memory.ensure(at(14),at(15));
  const ambient=memory.ensure(at(16),at(17));

  // Rule field generation 0:
  //
  //   F0(a1) -> F1
  //   F0(a1) -> F2
  //
  // Returned values are themselves function identities for the next Context.
  const app0=memory.ensure(f0,a1);
  const toF1=memory.ensure(app0,f1);
  const toF2=memory.ensure(app0,f2);

  // Distinct pre-existing rule fields for generation 1.
  const app1=memory.ensure(f1,a2);
  const f1ToG1=memory.ensure(app1,g1);
  const f1ToG2=memory.ensure(app1,g2); // F1 has MANY.

  const app2=memory.ensure(f2,a2); // F2 has ZERO.

  // Ambient old-function rule for the same next argument must be inert after
  // the execution has switched away from F0.
  const oldFieldApp=memory.ensure(f0,a2);
  const oldFieldFact=memory.ensure(oldFieldApp,ambient);

  const k0=defineFrame(memory,C,f0,p0);
  const firstRead=intrinsicApplicationResults(memory,k0);
  same(firstRead.f,f0,"generation0 current function F0");
  same(firstRead.argument,a1,"generation0 argument a1");
  setSame(firstRead.resultFacts,[toF1,toF2],"generation0 intrinsic MANY");

  const first=executeIntrinsicNonFinal(memory,k0);
  setSame(first.resultFacts,[toF1,toF2],"generation0 executed result set");
  same(first.children.length,2,"generation0 creates two branches");

  const k1=first.children.find(k=>frameFunction(memory,k)===f1);
  const k2=first.children.find(k=>frameFunction(memory,k)===f2);
  assert(k1!==undefined&&k2!==undefined,
    "returned F1/F2 become exact next Context functions");
  same(readContext(memory,k1).parent,k0,"F1 branch parent");
  same(readContext(memory,k2).parent,k0,"F2 branch parent");

  // No host-selected rule-field identifier is passed. The current function
  // carried by each child Context determines which application adjacency is
  // consulted in generation 1.
  const read1=intrinsicApplicationResults(memory,k1);
  const read2=intrinsicApplicationResults(memory,k2);
  same(read1.f,f1,"branch1 effective function switched to F1");
  same(read1.argument,a2,"branch1 next argument a2");
  same(read1.application,app1,"branch1 consults F1(a2)");
  setSame(read1.resultFacts,[f1ToG1,f1ToG2],"F1 effective field is MANY");

  same(read2.f,f2,"branch2 effective function switched to F2");
  same(read2.argument,a2,"branch2 next argument a2");
  same(read2.application,app2,"branch2 consults F2(a2)");
  setSame(read2.resultFacts,[],"F2 effective field is ZERO");

  assert(!read1.resultFacts.includes(oldFieldFact),
    "old F0 rule field is inert after branch1 switches to F1");
  assert(!read2.resultFacts.includes(oldFieldFact),
    "old F0 rule field is inert after branch2 switches to F2");

  // Same unchanged executor now produces qualitatively different dynamics only
  // because each branch carries a different current function/rule field.
  const second1=executeIntrinsicNonFinal(memory,k1);
  const second2=executeIntrinsicNonFinal(memory,k2);

  setSame(second1.resultFacts,[f1ToG1,f1ToG2],"F1 branch executes MANY");
  same(second1.children.length,2,"F1 branch splits again");
  assert(second1.closure===undefined,"F1 MANY branch remains open");

  setSame(second2.resultFacts,[],"F2 branch executes ZERO");
  same(second2.children.length,0,"F2 ZERO creates no child");
  same(second2.closure,memory.ensureEndSelfClosed(k2),
    "F2 rule field closes its branch");

  const nextFunctions=second1.children.map(k=>frameFunction(memory,k));
  setSame(nextFunctions,[g1,g2],
    "generation1 returned G1/G2 become generation2 functions");

  // Rule topology itself was pre-existing. The experiment proves endogenous
  // switching/selection of effective rule fields, not physical authoring of
  // new application->value rules.
  same(memory.poles(app1).start,f1,"F1 rule application remains physical");
  same(memory.poles(app2).start,f2,"F2 rule application remains physical");
  same(memory.poles(oldFieldFact).start,oldFieldApp,
    "ambient old F0 rule remains physical but ineffective");

  // Exact replay is canonical: the same current Context and same rule field
  // produce the same child/closure identities, not a hidden temporal copy.
  const replay1=executeIntrinsicNonFinal(memory,k1);
  const replay2=executeIntrinsicNonFinal(memory,k2);
  setSame(replay1.children,second1.children,"F1 replay child set canonical");
  same(replay2.closure,second2.closure,"F2 replay closure canonical");
}

function sourceSlice(source:string,start:string,end:string):string{
  const i=source.indexOf(start),j=source.indexOf(end,i+1);
  assert(i>=0&&j>i,`source slice ${start}`);
  return source.slice(i,j).replace(/\s+/g,"");
}

function staticGuards():void{
  const root=resolve(process.cwd(),"..");
  const own=readFileSync(
    join(root,"ts/test/research-v013-endogenous-rule-switch-a71a.test.ts"),"utf8",
  );
  const a70g=readFileSync(
    join(root,"ts/test/research-v013-intrinsic-application-results-a70g.test.ts"),"utf8",
  );

  same(
    sourceSlice(own,"function rewriteSelectedOne(","\nfunction carrier("),
    sourceSlice(a70g,"function rewriteSelectedOne(","\nfunction carrier("),
    "A71a rewrite kernel source-identical A70g/A68",
  );
  same(
    sourceSlice(own,"function deriveFrameContinuation(","\ninterface IntrinsicApplication"),
    sourceSlice(a70g,"function deriveFrameContinuation(","\ninterface IntrinsicApplication"),
    "A71a continuation derivation source-identical A70g/A70c",
  );
  same(
    sourceSlice(own,"function intrinsicApplicationResults(","\ninterface IntrinsicNonFinalStep"),
    sourceSlice(a70g,"function intrinsicApplicationResults(","\ninterface IntrinsicNonFinalStep"),
    "A71a rule-field discovery source-identical A70g",
  );
  same(
    sourceSlice(own,"function executeIntrinsicNonFinal(","\nfunction frameFunction("),
    sourceSlice(a70g,"function executeIntrinsicNonFinal(","\nfunction exercise("),
    "A71a executor source-identical A70g",
  );

  const exercise=sourceSlice(
    own,
    "function exercise(",
    "\nfunction sourceSlice(",
  );
  for(const forbidden of [
    "selectedRule",
    "ruleFieldId",
    "switch(",
    "case",
  ]){
    assert(!exercise.includes(forbidden),
      `A71a fixture excludes host rule-field selector ${forbidden}`);
  }
}

function main():void{
  exercise(false);
  exercise(true);
  staticGuards();

  console.log([
    "MTS v0.13 A71a: ENDOGENOUS_EFFECTIVE_RULE_SWITCH=GREEN_SCOPED_RESEARCH",
    "META_LAW=A70G_A68_SOURCE_IDENTICAL",
    "GEN0_F0_A1=MANY_TO_F1_F2",
    "RETURNED_VALUE=BECOMES_NEXT_FUNCTION",
    "GEN1_F1_A2=MANY",
    "GEN1_F2_A2=ZERO",
    "OLD_F0_A2_RULE_FIELD=PHYSICAL_BUT_INERT",
    "BRANCH_LOCAL_EFFECTIVE_RULE_FIELDS=DISTINCT",
    "F1_BRANCH=SPLITS",
    "F2_BRANCH=CLOSES",
    "GEN1_RESULTS_G1_G2=BECOME_GEN2_FUNCTIONS",
    "HOST_RULE_FIELD_SELECTOR=0",
    "META_LAW_CHANGED=FALSE",
    "EFFECTIVE_RULE_FIELD_CHANGED=TRUE",
    "PHYSICAL_RULE_TOPOLOGY_SELF_AUTHORING=NOT_PROVEN",
    "REPLAY=CANONICAL",
    "NEXT=A71B_RECURRENT_NONQUIESCENT_DYNAMICS",
    "THEN=A71C_RULE_TOPOLOGY_SELF_AUTHORING_FALSIFIER",
    "FULL_SELF_HOSTED=FALSE",
    "V013_NOT_ACCEPTED PRODUCTION_UNCHANGED",
  ].join(" "));
}

main();
