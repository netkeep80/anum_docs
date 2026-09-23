import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { materializeExactSequence, readExactSequence } from "../src/exact-sequence.js";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
  type RootBasis,
} from "../src/memory.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.13 A38 generic admission program instantiation: ${message}`);
}
function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: values differ`);
}
function expectThrows(run: () => void, message: string): void {
  let threw = false;
  try { run(); } catch { threw = true; }
  assert(threw, message);
}

function freezeAuthority(memory: Memory, transitions: readonly LinkHandle[]): LinkHandle {
  let body = memory.root;
  for (let i = transitions.length - 1; i >= 0; i -= 1) body = memory.ensure(transitions[i]!, body);
  return memory.ensureStartSelfClosed(body);
}
function freezeFrontier(memory: Memory, occurrences: readonly LinkHandle[]): LinkHandle {
  let body = memory.root;
  for (let i = occurrences.length - 1; i >= 0; i -= 1) body = memory.ensure(occurrences[i]!, body);
  return memory.ensureStartSelfClosed(body);
}
function readChain(memory: Memory, envelope: LinkHandle, kind: string): readonly LinkHandle[] {
  const e = memory.poles(envelope);
  assert(e.start === envelope && e.end !== envelope, `A21 ${kind} envelope is proper START-self-closed`);
  const values: LinkHandle[] = [], seen = new Set<LinkHandle>();
  let cursor = e.end;
  while (cursor !== memory.root) {
    assert(!seen.has(cursor), `A21 ${kind} chain cycle`);
    seen.add(cursor);
    const cell = memory.poles(cursor);
    values.push(cell.start); cursor = cell.end;
  }
  return Object.freeze(values);
}

/** Exact A21 single-root executor; A38 must not change this runtime. */
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

interface Program {
  readonly E0: LinkHandle;
  readonly K: LinkHandle;
  readonly accept: LinkHandle;
  readonly gates: readonly LinkHandle[];
  readonly queries: readonly LinkHandle[];
}

/** Reference oracle only: this is the A37 producer that A38 removes per target. */
function compileReference(
  memory: Memory,
  rule: LinkHandle,
  candidate: LinkHandle,
  parent: LinkHandle,
  accept: LinkHandle,
): Program {
  const parts = readExactSequence(memory, rule).values;
  assert(parts.length === 2 && parts[0] !== undefined && parts[1] !== undefined, "A38 reference rule");
  const roles = readExactSequence(memory, parts[0]).values;
  const values = readExactSequence(memory, candidate).values;
  same(values.length, roles.length, "A38 reference candidate arity");
  const bindings = new Map<LinkHandle, LinkHandle>();
  roles.forEach((role, index) => bindings.set(role, values[index]!));

  const gates: LinkHandle[] = [], queries: LinkHandle[] = [];
  for (const constraint of readExactSequence(memory, parts[1]).values) {
    const q = readExactSequence(memory, constraint).values;
    same(q.length, 3, "A38 reference constraint");
    const target = bindings.get(q[0]!), start = bindings.get(q[1]!), end = bindings.get(q[2]!);
    assert(target !== undefined && start !== undefined && end !== undefined, "A38 reference bindings");
    const pair = memory.ensure(start, end), gate = memory.ensureStartSelfClosed(target);
    gates.push(gate); queries.push(memory.ensure(gate, pair));
  }
  const transitions = gates.map((gate, i) => memory.ensure(gate, queries[i + 1] ?? accept));
  const K = memory.ensure(parent, freezeAuthority(memory, transitions));
  const truth = memory.ensure(K, queries[0]!);
  const E0 = memory.ensure(K, freezeFrontier(memory, [memory.ensure(memory.root, truth)]));
  return Object.freeze({E0, K, accept, gates:Object.freeze(gates), queries:Object.freeze(queries)});
}

function frontierTruthEnds(memory: Memory, executionRoot: LinkHandle): readonly LinkHandle[] {
  const execution = memory.poles(executionRoot), context = execution.start, ends: LinkHandle[] = [];
  for (const occurrence of readChain(memory, execution.end, "frontier")) {
    const truth = memory.poles(memory.poles(occurrence).end);
    same(truth.start, context, "A38 frontier truth context");
    ends.push(truth.end);
  }
  return Object.freeze(ends);
}
function runToDepth(memory: Memory, E0: LinkHandle, depth: number): readonly LinkHandle[] {
  const ends: LinkHandle[] = []; let current = E0;
  for (let i=0;i<depth;i+=1) { current=step(memory,current,"forward"); ends.push(...frontierTruthEnds(memory,current)); }
  return Object.freeze(ends);
}

function anonymousRoles(memory: Memory): readonly LinkHandle[] {
  const b=ensureRootBasis(memory), out:LinkHandle[]=[]; let x=memory.ensure(b.O,b.U);
  for(let i=0;i<8;i+=1){x=memory.ensure(x,i%2===0?b.L:b.C);out.push(x);}
  return Object.freeze(out);
}
function defineRule(memory: Memory): LinkHandle {
  const r=anonymousRoles(memory);
  return materializeExactSequence(memory,[
    materializeExactSequence(memory,r),
    materializeExactSequence(memory,[
      materializeExactSequence(memory,[r[3]!,r[1]!,r[2]!]),
      materializeExactSequence(memory,[r[6]!,r[3]!,r[4]!]),
      materializeExactSequence(memory,[r[7]!,r[3]!,r[5]!]),
    ]),
  ]);
}

interface Candidate { readonly values:readonly LinkHandle[]; readonly handle:LinkHandle; }
function candidate(memory:Memory,b:RootBasis,seed:LinkHandle):Candidate{
  let x=seed;
  const fresh=():LinkHandle=>{x=memory.ensure(x,b.C);return x;};
  const name=fresh(),fnStart=fresh(),fnEnd=fresh(),fn=memory.ensure(fnStart,fnEnd);
  const argument=fresh(),application=memory.ensure(fn,argument),result1=fresh(),result2=fresh();
  const c1=memory.ensure(application,result1),c2=memory.ensure(application,result2);
  const values=Object.freeze([name,fn,argument,application,result1,result2,c1,c2]);
  return Object.freeze({values,handle:materializeExactSequence(memory,values)});
}
function replaceValues(memory:Memory,values:readonly LinkHandle[]):Candidate{
  const frozen=Object.freeze([...values]);
  return Object.freeze({values:frozen,handle:materializeExactSequence(memory,frozen)});
}
function forge(memory:Memory,valid:Candidate,index:0|1|2):Candidate{
  const v=[...valid.values];
  if(index===0){
    const wrong=memory.ensure(v[2]!,v[1]!);v[3]=wrong;
    v[6]=memory.ensure(wrong,v[4]!);v[7]=memory.ensure(wrong,v[5]!);
  }else if(index===1)v[6]=memory.ensure(v[4]!,v[3]!);
  else v[7]=memory.ensure(v[5]!,v[3]!);
  return replaceValues(memory,v);
}

/**
 * Frozen Link-native producer authority:
 *
 *   Descriptor = TemplateCandidate -> TemplateE0
 *   Package    = Rule -> Descriptor
 *
 * Rule is opaque to the generic target instantiator. Its exact identity is
 * only used to bind the selected package to the selected target request.
 */
function producerPackage(
  memory:Memory,
  rule:LinkHandle,
  templateCandidate:LinkHandle,
  templateE0:LinkHandle,
):LinkHandle{
  return memory.ensure(rule,memory.ensure(templateCandidate,templateE0));
}
function productionRequest(
  memory:Memory,
  context:LinkHandle,
  pack:LinkHandle,
  rule:LinkHandle,
  targetCandidate:LinkHandle,
):LinkHandle{
  return memory.ensure(context,memory.ensure(pack,memory.ensure(rule,targetCandidate)));
}

/**
 * Generic topology instantiation.
 *
 * No role, constraint, gate or schedule semantics occur here. The selected
 * package provides one frozen topology template. Candidate ExactSequences are
 * zipped only as generic seed correspondence; the entire E0 topology is cloned
 * recursively using ordinary Link construction/self-incidence.
 */
function instantiateSelectedProgram(memory:Memory,requestTruth:LinkHandle):LinkHandle{
  const truth=memory.poles(requestTruth),context=truth.start,request=memory.poles(truth.end);
  const pack=memory.poles(request.start),target=memory.poles(request.end);
  same(pack.start,target.start,"A38 selected producer authority identity");
  const descriptor=memory.poles(pack.end);
  const from=readExactSequence(memory,descriptor.start).values;
  const to=readExactSequence(memory,target.end).values;
  same(from.length,to.length,"A38 generic seed correspondence cardinality");

  const mapping=new Map<LinkHandle,LinkHandle>([[memory.root,memory.root]]);
  from.forEach((value,index)=>{
    const next=to[index];assert(next!==undefined,"A38 target seed exists");
    const previous=mapping.get(value);
    if(previous!==undefined)same(previous,next,"A38 generic seed mapping stable");
    else mapping.set(value,next);
  });

  const visiting=new Set<LinkHandle>();
  const clone=(source:LinkHandle):LinkHandle=>{
    const known=mapping.get(source);if(known!==undefined)return known;
    assert(!visiting.has(source),"A38 unsupported non-self cycle");
    const p=memory.poles(source);let value:LinkHandle;
    if(p.start===source&&p.end===source)value=memory.ensureRoot();
    else if(p.start===source)value=memory.ensureStartSelfClosed(clone(p.end));
    else if(p.end===source)value=memory.ensureEndSelfClosed(clone(p.start));
    else{
      visiting.add(source);
      const start=clone(p.start),end=clone(p.end);
      visiting.delete(source);
      value=memory.ensure(start,end);
    }
    mapping.set(source,value);return value;
  };

  return memory.ensure(context,clone(descriptor.end));
}

function exercise(memory:Memory,withNoise:boolean):void{
  const b=ensureRootBasis(memory);
  if(withNoise)memory.ensure(memory.ensure(b.C,b.U),b.L);
  const rule=defineRule(memory);

  // One frozen producer template is prepared once.
  const template=candidate(memory,b,memory.ensure(b.U,b.L));
  const templateParent=memory.ensure(template.handle,b.O);
  const templateAccept=memory.ensure(b.L,template.handle);
  const templateProgram=compileReference(memory,rule,template.handle,templateParent,templateAccept);
  const pack=producerPackage(memory,rule,template.handle,templateProgram.E0);

  // A previously unseen target gets no per-target Rule/Candidate compilation.
  const targetCandidate=candidate(memory,b,memory.ensure(b.O,b.U));
  assert(targetCandidate.handle!==template.handle,"A38 target differs from template");
  const generationContext=memory.ensure(b.R,b.U);
  const request=productionRequest(memory,generationContext,pack,rule,targetCandidate.handle);
  const generatedTruth=instantiateSelectedProgram(memory,request);
  same(memory.poles(generatedTruth).start,generationContext,"A38 generated program truth context");
  const generatedE0=memory.poles(generatedTruth).end;
  const targetAccept=memory.ensure(b.L,targetCandidate.handle);
  assert(runToDepth(memory,generatedE0,4).includes(targetAccept),"A38 generated target program reaches ACCEPT");

  // Reference compiler is invoked only after generation as an oracle. It must
  // allocate nothing: generic instantiation already produced the exact A37 E0.
  const beforeReference=memory.linkCount;
  const reference=compileReference(
    memory,rule,targetCandidate.handle,memory.ensure(targetCandidate.handle,b.O),targetAccept,
  );
  same(reference.E0,generatedE0,"A38 generic instantiation equals exact A37 target program");
  same(memory.linkCount,beforeReference,"A38 reference compiler adds no missing target topology");

  // Three different invalid targets are instantiated by the same generic
  // producer; their canonical A36 gates fail naturally under unchanged A21.
  for(const failed of [0,1,2] as const){
    const bad=forge(memory,targetCandidate,failed);
    const badRequest=productionRequest(memory,generationContext,pack,rule,bad.handle);
    const badE0=memory.poles(instantiateSelectedProgram(memory,badRequest)).end;
    const badAccept=memory.ensure(b.L,bad.handle);
    assert(!runToDepth(memory,badE0,4).includes(badAccept),`A38 forged constraint ${failed} yields ZERO`);
  }

  // Wrong or malformed producer authority fails before an execution root can
  // be returned.
  const foreignRule=memory.ensure(rule,b.U);
  expectThrows(
    ()=>{instantiateSelectedProgram(memory,productionRequest(
      memory,generationContext,pack,foreignRule,targetCandidate.handle,
    ));},
    "A38 foreign Rule/package authority rejected",
  );
  const short=materializeExactSequence(memory,targetCandidate.values.slice(0,-1));
  expectThrows(
    ()=>{instantiateSelectedProgram(memory,productionRequest(
      memory,generationContext,pack,rule,short,
    ));},
    "A38 malformed seed correspondence rejected",
  );

  // Ambient alternate request does not alter an already selected generated root.
  const alternate=candidate(memory,b,memory.ensure(b.C,b.L));
  productionRequest(memory,generationContext,pack,rule,alternate.handle);
  same(memory.poles(generatedTruth).end,generatedE0,"A38 ambient alternate request inert");
}

function staticGuards():void{
  const root=resolve(process.cwd(),"..");
  const own=readFileSync(join(root,"ts/test/research-v013-generic-admission-program-instantiation-a38.test.ts"),"utf8");
  const prior=readFileSync(join(root,"ts/test/research-v013-link-carried-admission-program-a37.test.ts"),"utf8");

  const producer=own.slice(
    own.indexOf("function instantiateSelectedProgram("),
    own.indexOf("\nfunction exercise(",own.indexOf("function instantiateSelectedProgram(")),
  );
  for(const forbidden of [
    "compileReference(", "role", "constraint", "gate", "query",
    ".find(", ".outgoing(", ".incoming(", "allLinks(", "switch(",
  ]) assert(!producer.includes(forbidden),`A38 generic producer excludes domain compiler primitive ${forbidden}`);

  const a=own.slice(own.indexOf("function step("),own.indexOf("\ninterface Program",own.indexOf("function step(")));
  const z=prior.slice(prior.indexOf("function step("),prior.indexOf("\ninterface Program",prior.indexOf("function step(")));
  same(a.replace(/\s+/g,""),z.replace(/\s+/g,""),"A38 runtime is source-identical A37/A21 step");
}

function main():void{
  exercise(new Memory(),false);exercise(new Memory(),true);staticGuards();
  console.log([
    "MTS v0.13 A38: GENERIC_ADMISSION_PROGRAM_INSTANTIATION=GREEN_SCOPED_RESEARCH",
    "TARGET_PROGRAM_PRODUCER=GENERIC_TOPOLOGY_INSTANTIATION",
    "PER_TARGET_RULE_DECODING=0 PER_TARGET_CONSTRAINT_COMPILATION=0",
    "RUNTIME_STEP=A21_SOURCE_IDENTICAL",
    "TARGET_REFERENCE_TOPOLOGY=EXACT",
    "VALID_TARGET=ACCEPT FORGED_0_1_2=ZERO",
    "FOREIGN_PRODUCER_AUTHORITY=REJECTED MALFORMED_CORRESPONDENCE=REJECTED",
    "AMBIENT_ALTERNATE_REQUEST=INERT",
    "FROZEN_TEMPLATE_PROGRAM_ORIGIN=BOOTSTRAP_RESIDUAL",
    "GENERIC_SEED_CORRESPONDENCE_EXECUTOR=HOST_RESIDUAL",
    "A35_PUBLICATION_EXISTENCE=RESIDUAL A36_PROBE_SCRATCH=RESIDUAL",
    "INDEPENDENT_MEMORIES=2 GLOBAL_E2=OPEN GLOBAL_E3=OPEN",
    "FULL_SELF_HOSTED=NOT_CLAIMED PRODUCTION_UNCHANGED",
  ].join(" "));
}
main();
