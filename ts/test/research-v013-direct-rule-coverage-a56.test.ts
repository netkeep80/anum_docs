import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { materializeExactSequence, readExactSequence } from "../src/exact-sequence.js";
import { Memory, ensureRootBasis, type LinkHandle, type RootBasis } from "../src/memory.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.13 A56 direct Rule coverage: ${message}`);
}
function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: values differ`);
}
function freezeAuthority(memory: Memory, values: readonly LinkHandle[]): LinkHandle {
  let body = memory.root;
  for (let i = values.length - 1; i >= 0; i -= 1) body = memory.ensure(values[i]!, body);
  return memory.ensureStartSelfClosed(body);
}
function freezeFrontier(memory: Memory, values: readonly LinkHandle[]): LinkHandle {
  let body = memory.root;
  for (let i = values.length - 1; i >= 0; i -= 1) body = memory.ensure(values[i]!, body);
  return memory.ensureStartSelfClosed(body);
}
function readChain(memory: Memory, envelope: LinkHandle, kind: string): readonly LinkHandle[] {
  const e = memory.poles(envelope);
  assert(e.start === envelope && e.end !== envelope, `A21 ${kind} envelope`);
  const out: LinkHandle[] = [], seen = new Set<LinkHandle>();
  let cursor = e.end;
  while (cursor !== memory.root) {
    assert(!seen.has(cursor), `A21 ${kind} cycle`);
    seen.add(cursor);
    const p = memory.poles(cursor);
    out.push(p.start);
    cursor = p.end;
  }
  return Object.freeze(out);
}

/** Exact A21 executor. */
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
function frontierTruthEnds(memory: Memory, E: LinkHandle): readonly LinkHandle[] {
  const ep = memory.poles(E), out: LinkHandle[] = [];
  for (const occurrence of readChain(memory, ep.end, "frontier")) {
    const truth = memory.poles(memory.poles(occurrence).end);
    same(truth.start, ep.start, "A56 frontier context");
    out.push(truth.end);
  }
  return Object.freeze(out);
}

interface RuleShape {
  readonly rule: LinkHandle;
  readonly roles: readonly LinkHandle[];
  readonly equations: readonly LinkHandle[];
}
function makeRoles(memory: Memory, basis: RootBasis): readonly LinkHandle[] {
  const marker = memory.ensure(basis.U, basis.U);
  let cursor = memory.ensure(basis.O, marker);
  const roles: LinkHandle[] = [];
  for (let i = 0; i < 8; i += 1) {
    cursor = memory.ensure(cursor, i % 2 === 0 ? basis.L : basis.C);
    roles.push(cursor);
  }
  return Object.freeze(roles);
}
function equation(
  memory: Memory,
  target: LinkHandle,
  start: LinkHandle,
  end: LinkHandle,
): LinkHandle {
  return memory.ensure(target, memory.ensure(start, end));
}
function defineRule(
  memory: Memory,
  basis: RootBasis,
  reverseRoles: boolean,
  reverseEquations: boolean,
): RuleShape {
  const roles = makeRoles(memory, basis);
  const equations = Object.freeze([
    equation(memory, roles[3]!, roles[1]!, roles[2]!),
    equation(memory, roles[6]!, roles[3]!, roles[4]!),
    equation(memory, roles[7]!, roles[3]!, roles[5]!),
  ]);
  const roleCarrier = materializeExactSequence(memory, reverseRoles ? [...roles].reverse() : roles);
  const equationCarrier = materializeExactSequence(
    memory,
    reverseEquations ? [...equations].reverse() : equations,
  );
  return Object.freeze({
    rule: memory.ensure(roleCarrier, equationCarrier),
    roles,
    equations,
  });
}
function realization(
  memory: Memory,
  inputRoles: readonly LinkHandle[],
  equations: readonly LinkHandle[],
): LinkHandle {
  return memory.ensure(
    materializeExactSequence(memory, inputRoles),
    materializeExactSequence(memory, equations),
  );
}
function request(
  memory: Memory,
  context: LinkHandle,
  rule: LinkHandle,
  value: LinkHandle,
): LinkHandle {
  return memory.ensure(context, memory.ensure(rule, value));
}

interface SequenceNode { readonly previous: LinkHandle; readonly value: LinkHandle; }
function sequenceNode(memory:Memory,cell:LinkHandle):SequenceNode{
  assert(cell!==memory.root,"A45 sequence node is non-root");
  const p=memory.poles(cell);assert(p.start===cell,"A45 canonical ExactSequence cell");
  const payload=memory.poles(p.end);
  return Object.freeze({previous:payload.start,value:payload.end});
}
function foldSequence<S>(
  memory:Memory,
  final:LinkHandle,
  state:S,
  visit:(state:S,value:LinkHandle)=>S,
):S{
  if(final===memory.root)return state;
  const node=sequenceNode(memory,final);
  const previous=foldSequence(memory,node.previous,state,visit);
  return visit(previous,node.value);
}
function zipSequence<S>(
  memory:Memory,
  left:LinkHandle,
  right:LinkHandle,
  state:S,
  visit:(state:S,leftValue:LinkHandle,rightValue:LinkHandle)=>S,
):S{
  if(left===memory.root||right===memory.root){
    assert(left===memory.root&&right===memory.root,"A45 descriptor carrier arity mismatch");
    return state;
  }
  const l=sequenceNode(memory,left),r=sequenceNode(memory,right);
  const previous=zipSequence(memory,l.previous,r.previous,state,visit);
  return visit(previous,l.value,r.value);
}

/** A43 matching, but candidates are consumed directly from a Link carrier. */
function matchExecution(
  memory:Memory,
  expected:LinkHandle,
  candidateCarrier:LinkHandle,
):LinkHandle{
  const gate=memory.ensureStartSelfClosed(expected);
  const authority=freezeAuthority(memory,[memory.ensure(gate,memory.root)]);
  const K=memory.ensure(memory.ensure(expected,authority),authority);
  interface Seed{readonly ancestry:LinkHandle;readonly body:LinkHandle;}
  const seed=foldSequence<Seed>(
    memory,candidateCarrier,Object.freeze({ancestry:memory.root,body:memory.root}),
    (state,candidate)=>{
      const query=memory.ensure(gate,candidate),truth=memory.ensure(K,query);
      const ancestry=memory.ensure(state.ancestry,candidate);
      const occurrence=memory.ensure(ancestry,truth);
      return Object.freeze({ancestry,body:memory.ensure(occurrence,state.body)});
    },
  );
  return step(memory,memory.ensure(K,memory.ensureStartSelfClosed(seed.body)),"forward");
}

interface OneCheck{
  readonly bodyGate:LinkHandle;readonly bodyQuery:LinkHandle;
  readonly truthGate:LinkHandle;readonly truthQuery:LinkHandle;
}
function deriveOneCheck(
  memory:Memory,
  matchE:LinkHandle,
  stage:LinkHandle,
):OneCheck{
  const execution=memory.poles(matchE),matchK=execution.start;
  const envelope=memory.poles(execution.end),body=envelope.end;
  const bodyPoles=memory.poles(body),occurrence=bodyPoles.start;
  const occurrencePoles=memory.poles(occurrence),truth=occurrencePoles.end;

  const bodyScope=memory.ensure(stage,memory.root);
  const truthScope=memory.ensure(stage,bodyScope);

  const expectedBody=memory.ensure(occurrence,memory.root);
  const scopedBody=memory.ensure(bodyScope,body);
  const scopedExpectedBody=memory.ensure(bodyScope,expectedBody);
  const bodyGate=memory.ensureStartSelfClosed(scopedBody);
  const bodyQuery=memory.ensure(bodyGate,scopedExpectedBody);

  const expectedTruth=memory.ensure(matchK,memory.root);
  const scopedTruth=memory.ensure(truthScope,truth);
  const scopedExpectedTruth=memory.ensure(truthScope,expectedTruth);
  const truthGate=memory.ensureStartSelfClosed(scopedExpectedTruth);
  const truthQuery=memory.ensure(truthGate,scopedTruth);
  return Object.freeze({bodyGate,bodyQuery,truthGate,truthQuery});
}

interface CoverageState{readonly history:LinkHandle;readonly count:number;}
function appendCoverage(
  memory:Memory,
  sourceCarrier:LinkHandle,
  candidateCarrier:LinkHandle,
  initial:CoverageState,
):CoverageState{
  return foldSequence<CoverageState>(memory,sourceCarrier,initial,(state,expected)=>{
    const matchE=matchExecution(memory,expected,candidateCarrier);
    const stage=memory.ensure(state.history,matchE);
    const check=deriveOneCheck(memory,matchE,stage);
    const carrier=materializeExactSequence(memory,[
      check.bodyGate,check.bodyQuery,check.truthGate,check.truthQuery,
    ]);
    return Object.freeze({history:memory.ensure(state.history,carrier),count:state.count+1});
  });
}
function deriveCoverageHistory(
  memory:Memory,
  contractDescriptor:LinkHandle,
  realizationDescriptor:LinkHandle,
):CoverageState{
  return zipSequence<CoverageState>(
    memory,contractDescriptor,realizationDescriptor,
    Object.freeze({history:memory.root,count:0}),
    (state,expectedCarrier,proposedCarrier)=>{
      const forward=appendCoverage(memory,expectedCarrier,proposedCarrier,state);
      return appendCoverage(memory,proposedCarrier,expectedCarrier,forward);
    },
  );
}
function readOneCheck(memory:Memory,carrier:LinkHandle):OneCheck{
  const q=readExactSequence(memory,carrier).values;same(q.length,4,"A45 OneCheck carrier arity");
  return Object.freeze({bodyGate:q[0]!,bodyQuery:q[1]!,truthGate:q[2]!,truthQuery:q[3]!});
}
interface Assembly{
  readonly seed:LinkHandle;readonly authorityBody:LinkHandle;readonly count:number;
}
function assembleCoverageHistory(
  memory:Memory,
  history:LinkHandle,
  accepted:LinkHandle,
  authorityBody:LinkHandle=memory.root,
  count=0,
):Assembly{
  if(history===memory.root)return Object.freeze({seed:accepted,authorityBody,count});
  const p=memory.poles(history),check=readOneCheck(memory,p.end);
  let body=memory.ensure(memory.ensure(check.truthGate,accepted),authorityBody);
  body=memory.ensure(memory.ensure(check.bodyGate,check.truthQuery),body);
  return assembleCoverageHistory(memory,p.start,check.bodyQuery,body,count+1);
}

function appendMappedSequence(
  memory: Memory,
  source: LinkHandle,
  base: LinkHandle,
  map: (value: LinkHandle) => LinkHandle,
): LinkHandle {
  if (source === memory.root) return base;
  const node = sequenceNode(memory, source);
  const previous = appendMappedSequence(memory, node.previous, base, map);
  return memory.ensureStartSelfClosed(memory.ensure(previous, map(node.value)));
}
function equationTarget(memory: Memory, value: LinkHandle): LinkHandle {
  return memory.poles(value).start;
}

interface ValidationProgram{
  readonly E0:LinkHandle;readonly accepted:LinkHandle;
  readonly depth:number;readonly coverageHistory:LinkHandle;readonly checkCount:number;
  readonly roleCoverage:LinkHandle;
}
function compileSelectedValidation(memory: Memory, selectedRequest: LinkHandle): ValidationProgram {
  const selected = memory.poles(selectedRequest);
  const parentContext = selected.start;
  const pair = memory.poles(selected.end);
  const rule = memory.poles(pair.start);
  const candidateRealization = pair.end;
  const proposed = memory.poles(candidateRealization);

  const roleCoverage = appendMappedSequence(
    memory,
    proposed.end,
    proposed.start,
    value => equationTarget(memory, value),
  );

  const ruleDescriptor = materializeExactSequence(memory,[rule.start,rule.end]);
  const realizationDescriptor = materializeExactSequence(memory,[roleCoverage,proposed.end]);
  const coverage = deriveCoverageHistory(memory,ruleDescriptor,realizationDescriptor);
  assert(coverage.count>0,"A56 non-empty direct Rule coverage history");

  const assembled=assembleCoverageHistory(memory,coverage.history,candidateRealization);
  same(assembled.count,coverage.count,"A56 assembly consumes complete history");
  const authority=memory.ensureStartSelfClosed(assembled.authorityBody);
  const K=memory.ensure(parentContext,authority);
  const seedTruth=memory.ensure(K,assembled.seed);
  const occurrence=memory.ensure(memory.root,seedTruth);
  const E0=memory.ensure(K,freezeFrontier(memory,[occurrence]));
  return Object.freeze({
    E0,accepted:candidateRealization,depth:assembled.count*2,
    coverageHistory:coverage.history,checkCount:coverage.count,roleCoverage,
  });
}
function runProgram(memory:Memory,program:ValidationProgram):readonly LinkHandle[]{
  let current=program.E0;
  for(let i=0;i<program.depth;i+=1)current=step(memory,current,"forward");
  return frontierTruthEnds(memory,current);
}

function exercise(memory: Memory, withNoise: boolean): void {
  const basis = ensureRootBasis(memory);
  if (withNoise) memory.ensure(memory.ensure(basis.U,basis.C),basis.L);

  const forward = defineRule(memory,basis,false,false);
  const reverse = defineRule(memory,basis,true,true);
  assert(forward.rule!==reverse.rule,"A56 distinct exact Rule topology");

  const free = Object.freeze([
    forward.roles[0]!,forward.roles[1]!,forward.roles[2]!,forward.roles[4]!,forward.roles[5]!,
  ]);
  const validForward = realization(memory,free,forward.equations);
  const validReverse = realization(memory,[...free].reverse(),[...forward.equations].reverse());
  const context = memory.ensure(basis.R,basis.U);

  for (const rule of [forward.rule,reverse.rule]) {
    for (const valid of [validForward,validReverse]) {
      const program=compileSelectedValidation(memory,request(memory,context,rule,valid));
      same(program.checkCount,22,"A56 8+8 role plus 3+3 equation checks");
      assert(program.coverageHistory!==memory.root,"A56 Link-carried coverage history");
      const ends=runProgram(memory,program);
      same(ends.length,1,"A56 valid realization singleton acceptance");
      same(ends[0],valid,"A56 valid realization accepted");
    }
  }

  const eqs=forward.equations;
  const foreignRole=memory.ensure(forward.rule,basis.C);
  const foreignEquation=equation(memory,eqs[0]!,basis.C,basis.U);
  const constrainedTarget=equationTarget(memory,eqs[0]!);
  const bads=[
    realization(memory,free.slice(0,4),eqs),
    realization(memory,[free[0]!,free[1]!,free[1]!,free[3]!,free[4]!],eqs),
    realization(memory,[free[0]!,free[1]!,free[2]!,free[3]!,foreignRole],eqs),
    realization(memory,[constrainedTarget,...free.slice(1)],eqs),
    realization(memory,free,eqs.slice(0,2)),
    realization(memory,free,[eqs[0]!,eqs[1]!,eqs[1]!]),
    realization(memory,free,[eqs[0]!,eqs[1]!,foreignEquation]),
  ];
  for(const bad of bads){
    const ends=runProgram(memory,compileSelectedValidation(
      memory,request(memory,context,forward.rule,bad),
    ));
    same(ends.length,0,"A56 invalid realization ZERO");
  }

  const selected=request(memory,context,forward.rule,validForward);
  const frozen=compileSelectedValidation(memory,selected);
  const frozenE0=frozen.E0;
  const ambient=equation(memory,foreignRole,basis.O,basis.C);
  request(memory,context,forward.rule,realization(memory,free,[eqs[0]!,eqs[1]!,ambient]));
  same(frozen.E0,frozenE0,"A56 ambient alternate request cannot rewrite selected program");
  same(runProgram(memory,frozen)[0],validForward,"A56 ambient physical equation inert");
}

function staticGuards(): void {
  const root=resolve(process.cwd(),"..");
  const own=readFileSync(join(root,"ts/test/research-v013-direct-rule-coverage-a56.test.ts"),"utf8");
  const a45=readFileSync(join(root,"ts/test/research-v013-link-carried-coverage-history-a45.test.ts"),"utf8");

  const compile=own.slice(
    own.indexOf("function compileSelectedValidation("),
    own.indexOf("\nfunction runProgram(",own.indexOf("function compileSelectedValidation(")),
  );
  for(const forbidden of [
    "deriveSemanticContract","SemanticContract","freeRoles","constrainedTargets",
    "new Set",".has(","sameSet","count===1","count === 1","memory.find(",
  ])assert(!compile.includes(forbidden),`A56 direct Rule compiler excludes ${forbidden}`);
  assert(!compile.toLowerCase().includes("contract"),"A56 compiler contains no derived Contract concept");

  const d1=own.slice(
    own.indexOf("function deriveCoverageHistory("),
    own.indexOf("\nfunction readOneCheck(",own.indexOf("function deriveCoverageHistory(")),
  );
  const d2=a45.slice(
    a45.indexOf("function deriveCoverageHistory("),
    a45.indexOf("\nfunction readOneCheck(",a45.indexOf("function deriveCoverageHistory(")),
  );
  same(d1.replace(/\s+/g,""),d2.replace(/\s+/g,""),"A56 coverage history source-identical A45");

  const o1=own.slice(
    own.indexOf("function deriveOneCheck("),
    own.indexOf("\ninterface CoverageState",own.indexOf("function deriveOneCheck(")),
  );
  const o2=a45.slice(
    a45.indexOf("function deriveOneCheck("),
    a45.indexOf("\ninterface CoverageState",a45.indexOf("function deriveOneCheck(")),
  );
  same(o1.replace(/\s+/g,""),o2.replace(/\s+/g,""),"A56 ONE gate source-identical A45/A44");

  const s1=own.slice(own.indexOf("function step("),own.indexOf("\nfunction frontierTruthEnds(",own.indexOf("function step(")));
  const s2=a45.slice(a45.indexOf("function step("),a45.indexOf("\nfunction frontierTruthEnds(",a45.indexOf("function step(")));
  same(s1.replace(/\s+/g,""),s2.replace(/\s+/g,""),"A56 runtime source-identical A21/A45");
}
function main():void{
  exercise(new Memory(),false);exercise(new Memory(),true);staticGuards();
  console.log([
    "MTS v0.13 A56: DIRECT_RULE_LINK_NATIVE_COVERAGE=GREEN_SCOPED_RESEARCH",
    "DERIVED_SEMANTIC_CONTRACT=0 HOST_SET_EQUALITY_VALIDATOR=0 HOST_EXACT_ONE_BRANCH=0",
    "SELECTED_AUTHORITY=K_TO_RULE_TO_REALIZATION",
    "ROLE_COVERAGE=INPUT_ROLES_PLUS_EQUATION_TARGETS",
    "EQUATION_TARGET=START_POLE_OF_RULE_NATIVE_EQUATION",
    "COVERAGE_HISTORY=A45_SOURCE_IDENTICAL ONE_GATE=A44_STYLE RUNTIME=A21",
    "CHECKS=22 VALID_FORWARD_REVERSE_RULE_AND_REALIZATION_ORDERS=ACCEPTED",
    "MISSING_DUPLICATE_FOREIGN_MISCLASSIFIED_INPUT_OR_EQUATION=ZERO",
    "AMBIENT_PHYSICAL_EQUATION=INERT",
    "HOST_ROLE_COVERAGE_TRANSDUCER=RESIDUAL",
    "NEXT_BOUNDARY=A57_ROLE_COVERAGE_SOURCE_CLASSIFICATION_OR_REMOVAL",
    "A35_PUBLICATION_EXISTENCE=RESIDUAL GLOBAL_E2=OPEN GLOBAL_E3=OPEN GLOBAL_E4=OPEN",
    "FULL_SELF_HOSTED=FALSE V013_NOT_ACCEPTED PRODUCTION_UNCHANGED",
  ].join(" "));
}
main();
