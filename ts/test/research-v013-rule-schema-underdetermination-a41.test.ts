import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { materializeExactSequence, readExactSequence } from "../src/exact-sequence.js";
import { Memory, ensureRootBasis, type LinkHandle, type RootBasis } from "../src/memory.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.13 A41 rule/schema underdetermination: ${message}`);
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
    same(truth.start, ep.start, "A41 frontier context");
    out.push(truth.end);
  }
  return Object.freeze(out);
}
function runToDepth(memory: Memory, E0: LinkHandle, depth: number): readonly LinkHandle[] {
  const out: LinkHandle[] = [];
  let e = E0;
  for (let i = 0; i < depth; i += 1) {
    e = step(memory, e, "forward");
    out.push(...frontierTruthEnds(memory, e));
  }
  return Object.freeze(out);
}

interface PlanExecution {
  readonly candidate: LinkHandle;
  readonly publication: LinkHandle;
  readonly ordinary: number;
  readonly startSelf: number;
  readonly endSelf: number;
  readonly fullSelf: number;
}
/** Source-identical generic F5-F4 construction executor. */
function executeConstructionPlan(memory:Memory,plan:LinkHandle):PlanExecution{
  const parts=readExactSequence(memory,plan).values;
  same(parts.length,3,"plan arity");
  const [seedSequence,constraintSequence,outputSequence]=parts;
  assert(seedSequence!==undefined&&constraintSequence!==undefined&&outputSequence!==undefined,"plan complete");
  const values=new Map<LinkHandle,LinkHandle>();
  for(const binding of readExactSequence(memory,seedSequence).values){
    const p=memory.poles(binding);
    assert(!values.has(p.start),"seed role unique");
    values.set(p.start,p.end);
  }
  let ordinary=0,startSelf=0,endSelf=0,fullSelf=0;
  for(const encoded of readExactSequence(memory,constraintSequence).values){
    const q=readExactSequence(memory,encoded).values;
    same(q.length,3,"constraint arity");
    const [targetRole,startRole,endRole]=q;
    assert(targetRole!==undefined&&startRole!==undefined&&endRole!==undefined,"constraint complete");
    let value:LinkHandle;
    if(targetRole===startRole&&targetRole===endRole){
      value=memory.ensureRoot(); fullSelf+=1;
    }else if(targetRole===startRole){
      const end=values.get(endRole);assert(end!==undefined,"start-self end bound");
      value=memory.ensureStartSelfClosed(end);startSelf+=1;
    }else if(targetRole===endRole){
      const start=values.get(startRole);assert(start!==undefined,"end-self start bound");
      value=memory.ensureEndSelfClosed(start);endSelf+=1;
    }else{
      const start=values.get(startRole),end=values.get(endRole);
      assert(start!==undefined&&end!==undefined,"ordinary poles bound");
      value=memory.ensure(start,end);ordinary+=1;
    }
    const previous=values.get(targetRole);
    if(previous!==undefined)same(previous,value,"target role stable");else values.set(targetRole,value);
  }
  const outputs=readExactSequence(memory,outputSequence).values;
  same(outputs.length,2,"output arity");
  const candidate=outputs[0]===undefined?undefined:values.get(outputs[0]);
  const publication=outputs[1]===undefined?undefined:values.get(outputs[1]);
  assert(candidate!==undefined&&publication!==undefined,"outputs constructed");
  return Object.freeze({candidate,publication,ordinary,startSelf,endSelf,fullSelf});
}

function makeRoles(memory: Memory, count: number): readonly LinkHandle[] {
  const b = ensureRootBasis(memory), marker = memory.ensure(b.U, b.U);
  let current = memory.ensure(b.L, marker);
  const roles: LinkHandle[] = [];
  for (let i = 0; i < count; i += 1) {
    current = memory.ensure(current, marker);
    roles.push(current);
  }
  same(new Set(roles).size, count, "A41 plan roles distinct");
  return Object.freeze(roles);
}

interface Candidate { readonly values: readonly LinkHandle[]; readonly handle: LinkHandle; }
function candidate(memory: Memory, b: RootBasis, seed: LinkHandle): Candidate {
  let x = seed;
  const fresh = (): LinkHandle => { x = memory.ensure(x, b.C); return x; };
  const name = fresh(), fnStart = fresh(), fnEnd = fresh(), fn = memory.ensure(fnStart, fnEnd);
  const arg = fresh(), app = memory.ensure(fn, arg), r1 = fresh(), r2 = fresh();
  const c1 = memory.ensure(app, r1), c2 = memory.ensure(app, r2);
  const values = Object.freeze([name, fn, arg, app, r1, r2, c1, c2]);
  return Object.freeze({ values, handle: materializeExactSequence(memory, values) });
}
function forge(memory: Memory, valid: Candidate, index: 0 | 1 | 2): Candidate {
  const v = [...valid.values];
  if (index === 0) {
    const x = memory.ensure(v[2]!, v[1]!);
    v[3] = x; v[6] = memory.ensure(x, v[4]!); v[7] = memory.ensure(x, v[5]!);
  } else if (index === 1) v[6] = memory.ensure(v[4]!, v[3]!);
  else v[7] = memory.ensure(v[5]!, v[3]!);
  const values = Object.freeze(v);
  return Object.freeze({ values, handle: materializeExactSequence(memory, values) });
}
function defineRule(memory: Memory): LinkHandle {
  const b = ensureRootBasis(memory), roles: LinkHandle[] = [];
  let x = memory.ensure(b.O, b.U);
  for (let i = 0; i < 8; i += 1) {
    x = memory.ensure(x, i % 2 === 0 ? b.L : b.C);
    roles.push(x);
  }
  return materializeExactSequence(memory, [
    materializeExactSequence(memory, roles),
    materializeExactSequence(memory, [
      materializeExactSequence(memory, [roles[3]!, roles[1]!, roles[2]!]),
      materializeExactSequence(memory, [roles[6]!, roles[3]!, roles[4]!]),
      materializeExactSequence(memory, [roles[7]!, roles[3]!, roles[5]!]),
    ]),
  ]);
}

interface RuleShape {
  readonly roles: readonly LinkHandle[];
  readonly freeRoles: readonly LinkHandle[];
  readonly constrainedTargets: readonly LinkHandle[];
}
function deriveRuleShape(memory: Memory, rule: LinkHandle): RuleShape {
  const parts = readExactSequence(memory, rule).values;
  same(parts.length, 2, "A41 rule parts");
  const roles = readExactSequence(memory, parts[0]!).values;
  const targets: LinkHandle[] = [];
  for (const encoded of readExactSequence(memory, parts[1]!).values) {
    const q = readExactSequence(memory, encoded).values;
    same(q.length, 3, "A41 rule constraint triple");
    targets.push(q[0]!);
  }
  const targetSet = new Set(targets);
  return Object.freeze({
    roles,
    freeRoles: Object.freeze(roles.filter(role => !targetSet.has(role))),
    constrainedTargets: Object.freeze(targets),
  });
}

interface AuthoredPlan { readonly plan: LinkHandle; readonly free: LinkHandle; }
function authorPlan(
  memory: Memory,
  rule: LinkHandle,
  proposed: Candidate,
  gateOrder: readonly (0 | 1 | 2)[],
): AuthoredPlan {
  same(gateOrder.length, 3, "A41 gate order arity");
  same(new Set(gateOrder).size, 3, "A41 gate order permutation");
  const b = ensureRootBasis(memory), v = proposed.values;
  const roles = makeRoles(memory, 72);
  let n = 0;
  const role = (): LinkHandle => roles[n++]!;
  const rRoot = role(), rO = role(), rL = role(), rRule = role();
  const rName = role(), rFn = role(), rArg = role(), rR1 = role(), rR2 = role();
  const seeds = [
    memory.ensure(rRoot, memory.root), memory.ensure(rO, b.O), memory.ensure(rL, b.L),
    memory.ensure(rRule, rule), memory.ensure(rName, v[0]!), memory.ensure(rFn, v[1]!),
    memory.ensure(rArg, v[2]!), memory.ensure(rR1, v[4]!), memory.ensure(rR2, v[5]!),
  ];
  const triples: LinkHandle[][] = [];
  const ordinary = (start: LinkHandle, end: LinkHandle): LinkHandle => {
    const target = role(); triples.push([target, start, end]); return target;
  };
  const startSelf = (end: LinkHandle): LinkHandle => {
    const target = role(); triples.push([target, target, end]); return target;
  };
  const sequence = (items: readonly LinkHandle[]): LinkHandle => {
    let current = rRoot;
    for (const item of items) {
      const payload = ordinary(current, item);
      current = startSelf(payload);
    }
    return current;
  };

  const rApp = ordinary(rFn, rArg), rC1 = ordinary(rApp, rR1), rC2 = ordinary(rApp, rR2);
  const rCandidate = sequence([rName, rFn, rArg, rApp, rR1, rR2, rC1, rC2]);
  const rFreeSeeds = sequence([rName, rFn, rArg, rR1, rR2]);
  const rAccept = ordinary(rL, rCandidate);
  const gates = [startSelf(rApp), startSelf(rC1), startSelf(rC2)] as const;
  const ordered = gateOrder.map(i => gates[i]);

  const transitions = ordered.map((gate, index) =>
    ordinary(gate, ordered[index + 1] ?? rAccept)
  );
  let authorityBody = rRoot;
  for (let i = transitions.length - 1; i >= 0; i -= 1) {
    authorityBody = ordinary(transitions[i]!, authorityBody);
  }
  const authority = startSelf(authorityBody), parent = ordinary(rCandidate, rO);
  const K = ordinary(parent, authority), truth = ordinary(K, ordered[0]!);
  const occurrence = ordinary(rRoot, truth), frontier = startSelf(ordinary(occurrence, rRoot));
  const E0 = ordinary(K, frontier);
  const descriptor = sequence([rCandidate, E0, rFreeSeeds]), pack = ordinary(rRule, descriptor);
  const plan = materializeExactSequence(memory, [
    materializeExactSequence(memory, seeds),
    materializeExactSequence(memory, triples.map(q => materializeExactSequence(memory, q))),
    materializeExactSequence(memory, [rCandidate, pack]),
  ]);
  return Object.freeze({ plan, free: rFreeSeeds });
}

function producerSchema(
  memory: Memory,
  rule: LinkHandle,
  template: Candidate,
  gateOrder: readonly (0 | 1 | 2)[],
): LinkHandle {
  const authored = authorPlan(memory, rule, template, gateOrder);
  const free = materializeExactSequence(memory, [
    template.values[0]!, template.values[1]!, template.values[2]!,
    template.values[4]!, template.values[5]!,
  ]);
  return memory.ensure(rule, materializeExactSequence(memory, [template.handle, authored.plan, free]));
}
function schemaRequest(
  memory: Memory,
  context: LinkHandle,
  schema: LinkHandle,
  rule: LinkHandle,
  proposed: LinkHandle,
): LinkHandle {
  return memory.ensure(context, memory.ensure(schema, memory.ensure(rule, proposed)));
}

function instantiatePlanFromSchema(memory: Memory, requestTruth: LinkHandle): LinkHandle {
  const truth = memory.poles(requestTruth), context = truth.start, request = memory.poles(truth.end);
  const schema = memory.poles(request.start), target = memory.poles(request.end);
  same(schema.start, target.start, "A41 schema Rule authority");
  const d = readExactSequence(memory, schema.end).values;
  same(d.length, 3, "A41 schema descriptor arity");
  const templateCandidate = d[0], templatePlan = d[1], freeSequence = d[2];
  assert(templateCandidate !== undefined && templatePlan !== undefined && freeSequence !== undefined,
    "A41 schema complete");
  const from = readExactSequence(memory, templateCandidate).values;
  const to = readExactSequence(memory, target.end).values;
  same(from.length, to.length, "A41 candidate correspondence cardinality");
  const free = new Set(readExactSequence(memory, freeSequence).values);
  const mapping = new Map<LinkHandle, LinkHandle>([[memory.root, memory.root]]);
  let mapped = 0;
  from.forEach((value, index) => {
    if (!free.has(value)) return;
    const next = to[index];
    assert(next !== undefined, "A41 target free seed");
    mapping.set(value, next);
    mapped += 1;
  });
  same(mapped, free.size, "A41 all schema free seeds mapped");
  const visiting = new Set<LinkHandle>();
  const clone = (source: LinkHandle): LinkHandle => {
    const known = mapping.get(source);
    if (known !== undefined) return known;
    assert(!visiting.has(source), "A41 unsupported non-self cycle");
    const p = memory.poles(source);
    let value: LinkHandle;
    if (p.start === source && p.end === source) value = memory.ensureRoot();
    else if (p.start === source) value = memory.ensureStartSelfClosed(clone(p.end));
    else if (p.end === source) value = memory.ensureEndSelfClosed(clone(p.start));
    else {
      visiting.add(source);
      value = memory.ensure(clone(p.start), clone(p.end));
      visiting.delete(source);
    }
    mapping.set(source, value);
    return value;
  };
  return memory.ensure(context, clone(templatePlan));
}

function executeSelectedPlan(
  memory: Memory,
  plan: LinkHandle,
  proposed: LinkHandle,
  context: LinkHandle,
): LinkHandle {
  const built = executeConstructionPlan(memory, plan);
  const gate = memory.ensureStartSelfClosed(proposed), query = memory.ensure(gate, built.candidate);
  const K = memory.ensure(context, freezeAuthority(memory, [memory.ensure(gate, built.publication)]));
  return memory.ensure(K, freezeFrontier(memory, [memory.ensure(memory.root, memory.ensure(K, query))]));
}

function publishedPackage(memory: Memory, validation: LinkHandle): LinkHandle | undefined {
  const next = step(memory, validation, "forward");
  const values = frontierTruthEnds(memory, next);
  same(values.length <= 1, true, "A41 publication cardinality");
  return values[0];
}

function exercise(memory: Memory, withNoise: boolean): void {
  const b = ensureRootBasis(memory);
  if (withNoise) memory.ensure(memory.ensure(b.U, b.C), b.L);
  const rule = defineRule(memory), shape = deriveRuleShape(memory, rule);
  same(shape.roles.length, 8, "A41 role count");
  same(shape.constrainedTargets.length, 3, "A41 constrained target count");
  same(shape.freeRoles.length, 5, "A41 Rule-derived free-role count");
  same(shape.freeRoles[0], shape.roles[0], "A41 free role 0");
  same(shape.freeRoles[1], shape.roles[1], "A41 free role 1");
  same(shape.freeRoles[2], shape.roles[2], "A41 free role 2");
  same(shape.freeRoles[3], shape.roles[4], "A41 free role 4");
  same(shape.freeRoles[4], shape.roles[5], "A41 free role 5");

  const template = candidate(memory, b, memory.ensure(b.C, b.U));
  const schemaForward = producerSchema(memory, rule, template, [0, 1, 2]);
  const schemaReverse = producerSchema(memory, rule, template, [2, 1, 0]);
  assert(schemaForward !== schemaReverse, "A41 same Rule admits distinct exact ProducerSchemas");

  const target = candidate(memory, b, memory.ensure(b.O, b.U));
  const context = memory.ensure(b.R, b.U);
  const planForward = memory.poles(
    instantiatePlanFromSchema(memory, schemaRequest(memory, context, schemaForward, rule, target.handle)),
  ).end;
  const planReverse = memory.poles(
    instantiatePlanFromSchema(memory, schemaRequest(memory, context, schemaReverse, rule, target.handle)),
  ).end;
  assert(planForward !== planReverse, "A41 exact target Plan topology differs by gate order");

  const packageForward = publishedPackage(memory, executeSelectedPlan(memory, planForward, target.handle, context));
  const packageReverse = publishedPackage(memory, executeSelectedPlan(memory, planReverse, target.handle, context));
  assert(packageForward !== undefined && packageReverse !== undefined, "A41 both schemas publish valid Package");
  assert(packageForward !== packageReverse, "A41 exact Package topology remains distinct");

  for (const pack of [packageForward, packageReverse]) {
    const descriptor = readExactSequence(memory, memory.poles(pack).end).values;
    same(descriptor[0], target.handle, "A41 Package candidate");
    const E0 = descriptor[1]!, accept = memory.ensure(b.L, target.handle);
    assert(runToDepth(memory, E0, 3).includes(accept), "A41 both topology variants reach ACCEPT");
  }

  for (const failed of [0, 1, 2] as const) {
    const bad = forge(memory, target, failed);
    for (const schema of [schemaForward, schemaReverse]) {
      const badPlan = memory.poles(
        instantiatePlanFromSchema(memory, schemaRequest(memory, context, schema, rule, bad.handle)),
      ).end;
      same(
        publishedPackage(memory, executeSelectedPlan(memory, badPlan, bad.handle, context)),
        undefined,
        `A41 both topology variants reject forged constraint ${failed}`,
      );
    }
  }

  const selectedTruth = schemaRequest(memory, context, schemaForward, rule, target.handle);
  schemaRequest(memory, context, schemaReverse, rule, target.handle);
  same(memory.poles(selectedTruth).start, context, "A41 selected schema truth context stable");
}

function staticGuards(): void {
  const root = resolve(process.cwd(), "..");
  const own = readFileSync(join(root, "ts/test/research-v013-rule-schema-underdetermination-a41.test.ts"), "utf8");
  const f5 = readFileSync(join(root, "ts/test/research-v013-generic-construction-plan-f5-f4.test.ts"), "utf8");
  const a37 = readFileSync(join(root, "ts/test/research-v013-link-carried-admission-program-a37.test.ts"), "utf8");

  const inst = own.slice(
    own.indexOf("function instantiatePlanFromSchema("),
    own.indexOf("\nfunction executeSelectedPlan(", own.indexOf("function instantiatePlanFromSchema(")),
  );
  for (const forbidden of [
    "authorPlan(", "gateOrder", "makeRoles(", "triples", "constraintSequence",
    ".find(", ".outgoing(", ".incoming(", "switch(",
  ]) assert(!inst.includes(forbidden), `A41 schema instantiator excludes recipe primitive ${forbidden}`);

  const a = own.slice(
    own.indexOf("function executeConstructionPlan("),
    own.indexOf("\nfunction makeRoles(", own.indexOf("function executeConstructionPlan(")),
  );
  const z = f5.slice(
    f5.indexOf("function executeConstructionPlan("),
    f5.indexOf("\nfunction runReference(", f5.indexOf("function executeConstructionPlan(")),
  );
  same(a.replace(/\s+/g, ""), z.replace(/\s+/g, ""), "A41 construction executor source-identical F5-F4");

  const x = own.slice(own.indexOf("function step("), own.indexOf("\nfunction frontierTruthEnds(", own.indexOf("function step(")));
  const y = a37.slice(a37.indexOf("function step("), a37.indexOf("\ninterface Program", a37.indexOf("function step(")));
  same(x.replace(/\s+/g, ""), y.replace(/\s+/g, ""), "A41 runtime source-identical A21/A37");
}

function main(): void {
  exercise(new Memory(), false);
  exercise(new Memory(), true);
  staticGuards();
  console.log([
    "MTS v0.13 A41: RULE_SCHEMA_UNDERDETERMINATION=GREEN_FALSIFIER",
    "A41_EXACT_SCHEMA_SOURCE_REMOVAL=RED_UNDERDETERMINED",
    "RULE_DERIVED_FREE_ROLE_BOUNDARY=5",
    "SAME_RULE_DISTINCT_EXACT_SCHEMAS=2",
    "EXACT_TARGET_PLANS=DISTINCT SEMANTICS=EQUIVALENT",
    "VALID_FORWARD_REVERSE=ACCEPT FORGED_0_1_2=ZERO",
    "CONSTRUCTION_EXECUTOR=F5_F4_SOURCE_IDENTICAL RUNTIME=A21_SOURCE_IDENTICAL",
    "ARBITRARY_GATE_ORDER_IS_NOT_SEMANTIC_AUTHORITY",
    "NEXT_BOUNDARY=A42_RULE_DERIVED_SEMANTIC_SCHEMA_CONTRACT",
    "A35_PUBLICATION_EXISTENCE=RESIDUAL A36_PROBE_SCRATCH=RESIDUAL",
    "INDEPENDENT_MEMORIES=2 GLOBAL_E2=OPEN GLOBAL_E3=OPEN",
    "FULL_SELF_HOSTED=NOT_CLAIMED PRODUCTION_UNCHANGED",
  ].join(" "));
}
main();
