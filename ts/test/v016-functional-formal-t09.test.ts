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
  materializeNativeSyntaxGrammar,
  type NativeSyntaxGrammarRuleSpec,
} from "../src/native-syntax-grammar.js";
import {
  materializeV013HierarchicalCarrierFromSemanticLink,
  serializeV013HierarchicalCarrier,
} from "../src/v013-hierarchical-carrier.js";
import {
  V016FunctionalError,
  applyV016FunctionalPlan,
  classifyV016Observation,
  compileV016FunctionalCall,
  compileV016FunctionalDefinitions,
  denoteV016FunctionalCall,
  denoteV016FunctionalDefinitions,
  materializeV016FunctionalSourceProfile,
  materializeV016ResidualDescriptor,
  planV016FunctionalCall,
  readV016ResidualDescriptor,
  type V016FunctionalSourceProfile,
} from "../src/v016-functional-formal.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`T09 v0.16 functional FORMAL: ${message}`);
}
function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: values differ`);
}
function reject(code: V016FunctionalError["code"], effect: () => unknown, label: string): void {
  try { effect(); } catch (error) {
    assert(error instanceof V016FunctionalError, `${label}: exact error type`);
    same(error.code, code, `${label}: exact code`);
    return;
  }
  throw new Error(`T09 v0.16 functional FORMAL: ${label}: expected rejection`);
}

interface Fixture {
  readonly memory: Memory;
  readonly basis: RootBasis;
  readonly profile: V016FunctionalSourceProfile;
  readonly grammarRoot: LinkHandle;
  readonly profileRoot: LinkHandle;
  readonly fresh: () => LinkHandle;
}
function fixture(noise = 0): Fixture {
  const memory = new Memory(), basis = ensureRootBasis(memory);
  let cursor = memory.ensure(basis.U, basis.L);
  for (let index = 0; index < noise; index += 1) cursor = memory.ensure(cursor, index % 2 === 0 ? basis.O : basis.C);
  const fresh = (): LinkHandle => (cursor = memory.ensure(cursor, basis.C));
  const profile: V016FunctionalSourceProfile = Object.freeze({
    documentForm: fresh(), definitionForm: fresh(), fiberForm: fresh(), callForm: fresh(),
    itemRole: fresh(), functionRole: fresh(), groupsRole: fresh(), bodyStartRole: fresh(),
    bodyEndRole: fresh(), fiberAnchorRole: fresh(), sourceRole: fresh(),
    atomArgumentMarker: fresh(), sequenceArgumentMarker: fresh(),
  });
  const rules: readonly NativeSyntaxGrammarRuleSpec[] = [
    { form: profile.definitionForm, fields: [
      { role: profile.functionRole, target: "carrier", min: 1, max: 1 },
      { role: profile.groupsRole, target: "carrier", min: 1, max: 1 },
      { role: profile.bodyStartRole, target: "carrier", min: 1, max: 1 },
      { role: profile.bodyEndRole, target: "carrier", min: 1, max: 1 },
      { role: profile.sourceRole, target: "carrier", min: 1, max: 1 },
    ] },
    { form: profile.fiberForm, fields: [
      { role: profile.functionRole, target: "carrier", min: 1, max: 1 },
      { role: profile.groupsRole, target: "carrier", min: 1, max: 1 },
      { role: profile.fiberAnchorRole, target: "carrier", min: 1, max: 1 },
      { role: profile.sourceRole, target: "carrier", min: 1, max: 1 },
    ] },
    { form: profile.callForm, fields: [
      { role: profile.functionRole, target: "carrier", min: 1, max: 1 },
      { role: profile.groupsRole, target: "carrier", min: 1, max: 1 },
      { role: profile.sourceRole, target: "carrier", min: 1, max: 1 },
    ] },
    { form: profile.documentForm, fields: [{ role: profile.itemRole, target: "child", min: 1, max: null }] },
  ];
  const grammarRoot = materializeNativeSyntaxGrammar(memory, basis, { syntaxTag: fresh(), markerSeed: fresh(), rules });
  return Object.freeze({ memory, basis, profile, grammarRoot, profileRoot: materializeV016FunctionalSourceProfile(memory, profile), fresh });
}
const encode = (source: string): Uint8Array => new TextEncoder().encode(source);

{
  const f = fixture(), theory = f.fresh(), context = f.fresh();
  const literal = compileV016FunctionalDefinitions(f.memory, f.basis, f.grammarRoot, f.profileRoot,
    encode("form(a) : a{}\nform(a)(b) : a->b\n"));
  const denotation = denoteV016FunctionalDefinitions(f.memory, f.basis, f.grammarRoot, f.profileRoot,
    literal.sourceAset, theory, context);
  same(denotation.definitions.length, 1, "two author surfaces lower to one Definition");
  same(denotation.definitions[0]!.branchRules.length, 9, "bounded current-carrier elaboration has nine oracle branches");

  const alpha = compileV016FunctionalDefinitions(f.memory, f.basis, f.grammarRoot, f.profileRoot,
    encode(" form(x):x{}\nform(x)(y):x->y\n"));
  const alphaDenotation = denoteV016FunctionalDefinitions(f.memory, f.basis, f.grammarRoot, f.profileRoot,
    alpha.sourceAset, theory, context);
  same(alphaDenotation.definitions[0]!.genericRule, denotation.definitions[0]!.genericRule,
    "alpha-renaming and presentation bytes preserve semantic Definition");
  assert(alpha.sourceAset !== literal.sourceAset, "source occurrence/provenance remains distinct from denotation");

  const x = f.fresh(), pair = f.memory.ensure(f.basis.R, x), start = f.memory.ensureStartSelfClosed(pair);
  const values = [f.basis.R, f.basis.O, f.basis.C, f.basis.L, f.basis.U, x, f.fresh(), pair, start,
    f.memory.ensureEndSelfClosed(f.basis.O), f.memory.ensureEndSelfClosed(f.memory.ensureStartSelfClosed(f.basis.C)),
    f.memory.ensureEndSelfClosed(start), denotation.definitions[0]!.functionAnchor,
    materializeExactSequence(f.memory, [f.basis.R]), materializeExactSequence(f.memory, [f.basis.R, f.basis.C])];
  const branches = new Set<LinkHandle>();
  for (const left of values) for (const right of values) {
    const existed = f.memory.find(left, right);
    const callSource = compileV016FunctionalCall(f.memory, f.basis, f.grammarRoot, f.profileRoot, encode("form(A)(B)"));
    const call = denoteV016FunctionalCall(f.memory, f.basis, f.grammarRoot, f.profileRoot, callSource.sourceAset,
      denotation.definitions, [{ name: "A", value: left }, { name: "B", value: right }]);
    if (existed === undefined) same(f.memory.find(left, right), undefined, "source/call denotation does not form result");
    const before = f.memory.linkCount, plan = planV016FunctionalCall(f.memory, call, denotation.members, theory, context);
    same(f.memory.linkCount, before, "S1 is read-only"); same(plan.length, 1, "one branch matches");
    branches.add(plan[0]!.rule);
    const outputs = applyV016FunctionalPlan(f.memory, plan);
    same(outputs.length, 1, "one S2 output"); same(outputs[0], f.memory.ensure(left, right), "output is canonical left->right");
  }
  same(branches.size, 9, "bounded differential reaches all nine T02 oracle branches");

  const freshA = f.fresh(), freshB = f.fresh();
  const sequenceCallSource = compileV016FunctionalCall(f.memory, f.basis, f.grammarRoot, f.profileRoot, encode("form([A,B])"));
  const sequenceCall = denoteV016FunctionalCall(f.memory, f.basis, f.grammarRoot, f.profileRoot,
    sequenceCallSource.sourceAset, denotation.definitions, [{ name: "A", value: freshA }, { name: "B", value: freshB }]);
  same(sequenceCall.args.length, 1, "F([a,b]) is one argument");
  same(readExactSequence(f.memory, sequenceCall.args[0]!).values.length, 2, "one argument is the exact two-value sequence");
  same(planV016FunctionalCall(f.memory, sequenceCall, denotation.members, theory, context).length, 0,
    "F([a,b]) does not match binary F(a)(b)");
  reject("unsupported-sugar", () => compileV016FunctionalCall(f.memory, f.basis, f.grammarRoot, f.profileRoot,
    encode("form(A,B)")), "comma sugar requires an explicit future rule");
  assert(materializeExactSequence(f.memory, []) !== materializeExactSequence(f.memory, [f.basis.R]),
    "Seq([]) differs from Seq([R])");
  same(readExactSequence(f.memory, materializeExactSequence(f.memory, [freshA, freshA])).values.length, 2,
    "repeated arguments retain two positions");

  const negativeSource = compileV016FunctionalCall(f.memory, f.basis, f.grammarRoot, f.profileRoot, encode("form(A)(B)"));
  const negativeCall = denoteV016FunctionalCall(f.memory, f.basis, f.grammarRoot, f.profileRoot, negativeSource.sourceAset,
    denotation.definitions, [{ name: "A", value: f.fresh() }, { name: "B", value: f.fresh() }]);
  same(planV016FunctionalCall(f.memory, negativeCall, denotation.members, f.fresh(), context).length, 0, "wrong Theory rejects");
  same(planV016FunctionalCall(f.memory, negativeCall, denotation.members, theory, f.fresh()).length, 0, "wrong Context rejects");
  const noAdmissions = new Set([...denotation.members].filter((member) => f.memory.poles(member).start !== theory));
  same(planV016FunctionalCall(f.memory, negativeCall, noAdmissions, theory, context).length, 0,
    "physical rules without positive admission membership do not execute");

  const prefix = materializeExactSequence(f.memory, [freshA]);
  const residual = readV016ResidualDescriptor(f.memory, materializeV016ResidualDescriptor(f.memory,
    denotation.definitions[0]!.functionAnchor, context, denotation.definitions[0]!.domainLaw,
    prefix, denotation.definitions[0]!.correspondence));
  same(residual.prefix, prefix, "residual preserves exact prefix");
  same(residual.domainLaw, denotation.definitions[0]!.domainLaw, "residual preserves domain law");
  same(residual.correspondence, denotation.definitions[0]!.genericRule, "residual preserves correspondence, not image only");

  same(classifyV016Observation("UNKNOWN", "UNKNOWN", []), "UNKNOWN_DOMAIN", "unknown domain stays unknown");
  same(classifyV016Observation("OUT_CERTIFIED", "CERTIFIED", []), "OUT_OF_DOMAIN", "closed outside domain");
  same(classifyV016Observation("IN", "UNKNOWN", []), "UNKNOWN_CLOSURE", "no match without closure is not UNSAT");
  same(classifyV016Observation("IN", "CERTIFIED", []), "UNSAT", "certified closed no-value is UNSAT");
  same(classifyV016Observation("IN", "CERTIFIED", [freshA, freshA]), "UNIQUE", "identical canonical values deduplicate");
  same(classifyV016Observation("IN", "CERTIFIED", [freshA, freshB]), "FUNCTION_CONFLICT", "two distinct values conflict");
}

{
  const f = fixture(17), theory = f.fresh(), context = f.fresh();
  const source = compileV016FunctionalDefinitions(f.memory, f.basis, f.grammarRoot, f.profileRoot, encode([
    "f(a):a{}", "f(a)(b):a->b", "g(a):a{}", "g(a)(b):a->b",
  ].join("\n")));
  const denotation = denoteV016FunctionalDefinitions(f.memory, f.basis, f.grammarRoot, f.profileRoot,
    source.sourceAset, theory, context);
  same(denotation.definitions.length, 2, "two functions remain two Definitions");
  assert(denotation.definitions[0]!.binders[0] !== denotation.definitions[1]!.binders[0],
    "same parameter spelling in different scopes does not capture");
  reject("duplicate-parameter", () => compileV016FunctionalDefinitions(f.memory, f.basis, f.grammarRoot, f.profileRoot,
    encode("f(a):a{}\nf(a)(a):a->a")), "duplicate parameter");
  const bad = compileV016FunctionalDefinitions(f.memory, f.basis, f.grammarRoot, f.profileRoot,
    encode("h(a):a{}\nh(a)(b):a->c"));
  reject("unbound-name", () => denoteV016FunctionalDefinitions(f.memory, f.basis, f.grammarRoot, f.profileRoot,
    bad.sourceAset, theory, context), "undefined body reference");
}

{
  const run = (noise: number): string => {
    const f = fixture(noise), theory = f.fresh(), context = f.fresh();
    const source = compileV016FunctionalDefinitions(f.memory, f.basis, f.grammarRoot, f.profileRoot, encode("form(a):a{}\nform(a)(b):a->b"));
    const defs = denoteV016FunctionalDefinitions(f.memory, f.basis, f.grammarRoot, f.profileRoot, source.sourceAset, theory, context);
    const callSource = compileV016FunctionalCall(f.memory, f.basis, f.grammarRoot, f.profileRoot, encode("form(L)(U)"));
    const call = denoteV016FunctionalCall(f.memory, f.basis, f.grammarRoot, f.profileRoot, callSource.sourceAset, defs.definitions);
    const output = applyV016FunctionalPlan(f.memory, planV016FunctionalCall(f.memory, call, defs.members, theory, context))[0];
    assert(output !== undefined, "allocation-noise run produces one result");
    return new TextDecoder().decode(serializeV013HierarchicalCarrier(f.memory, f.basis, materializeV013HierarchicalCarrierFromSemanticLink(f.memory, f.basis, output)));
  };
  same(run(0), run(31), "allocation noise preserves structural result wire");
}

console.log([
  "MTS_T09_V016_FUNCTIONAL_FORMAL=PASS",
  "LITERAL_AUTHOR_SYNTAX=PASS",
  "ONE_DEFINITION_TWO_SURFACES=PASS",
  "SOURCE_TO_NATIVE_ANET_TO_SEMANTIC_ANET=PASS",
  "ROLE_BUNDLE_POSITIVE_MEMBERSHIP=PASS",
  "BOUNDED_9_BRANCH_DIFFERENTIAL=PASS",
  "S1_READ_ONLY_S2_FORMATION=PASS",
  "PRODUCTION_AMEMORY=NOT_RUN",
  "KERNEL=NOT_RUN",
].join(" "));
