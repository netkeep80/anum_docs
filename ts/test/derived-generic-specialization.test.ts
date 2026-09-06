import { materializeExactSequence } from "../src/exact-sequence.js";
import {
  Memory, ensureRootBasis,
  type LinkHandle, type LinkPoles, type ReadMemory,
} from "../src/memory.js";
import {
  admitStructuralRule, defineStructuralRoleDictionary, defineStructuralRule,
} from "../src/structural-rule.js";
import {
  admitStructuralDerivationRule, defineStructuralDerivationRule,
} from "../src/derivation.js";
import {
  replayStructuralDerivedDerivationSchema,
  type StructuralDerivedDerivationEvidence,
} from "../src/derived-derivation-schema.js";
import {
  StructuralDerivedDerivationSpecializationReplayError,
  replayStructuralDerivedDerivationSpecialization,
  type StructuralDerivedDerivationSpecializationEvidence,
} from "../src/derived-derivation-specialization.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}
function expectError(code: string, effect: () => unknown): void {
  try { effect(); }
  catch (error) {
    assert(error instanceof StructuralDerivedDerivationSpecializationReplayError, `${code}: wrong error type`);
    same(error.code, code, `${code}: wrong error code`);
    return;
  }
  throw new Error(`${code}: expected rejection`);
}

interface GenericFixture {
  readonly derivationRule: LinkHandle;
  readonly identity: LinkHandle;
  readonly evidence: StructuralDerivedDerivationEvidence;
}
interface TargetFixture {
  readonly derivationRule: LinkHandle;
  readonly identity: LinkHandle;
  readonly assumptions: readonly { readonly occurrence: LinkHandle; readonly template: LinkHandle }[];
  readonly targetOccurrence: LinkHandle;
}

function admittedGeneric(
  memory: Memory, theory: LinkHandle, dictionary: LinkHandle,
  premises: readonly LinkHandle[], conclusion: LinkHandle,
): GenericFixture {
  const rule = defineStructuralRule(memory, dictionary, conclusion);
  const derivationRule = defineStructuralDerivationRule(memory, rule, premises);
  const ruleAdmission = admitStructuralRule(memory, theory, rule);
  const derivationRuleAdmission = admitStructuralDerivationRule(memory, theory, derivationRule);
  const identity = memory.ensure(derivationRule, theory);
  const assumptions = premises.map((template) =>
    Object.freeze({ occurrence: memory.ensure(template, identity), template }));
  const premiseOccurrenceSequence = materializeExactSequence(
    memory, assumptions.map(({ occurrence }) => occurrence));
  const targetOccurrence = memory.ensure(derivationRule, premiseOccurrenceSequence);
  return Object.freeze({
    derivationRule, identity,
    evidence: Object.freeze({
      identity, targetOccurrence, assumptions: Object.freeze(assumptions),
      nodes: Object.freeze([Object.freeze({
        occurrence: targetOccurrence, derivationRule, ruleAdmission,
        derivationRuleAdmission, premiseOccurrenceSequence,
      })]),
    }),
  });
}

function target(
  memory: Memory, theory: LinkHandle, dictionary: LinkHandle,
  premises: readonly LinkHandle[], conclusion: LinkHandle,
): TargetFixture {
  const rule = defineStructuralRule(memory, dictionary, conclusion);
  const derivationRule = defineStructuralDerivationRule(memory, rule, premises);
  const identity = memory.ensure(derivationRule, theory);
  const byTemplate = new Map<LinkHandle, LinkHandle>();
  const assumptions: { occurrence: LinkHandle; template: LinkHandle }[] = [];
  for (const template of premises) {
    if (byTemplate.has(template)) continue;
    const occurrence = memory.ensure(template, identity);
    byTemplate.set(template, occurrence);
    assumptions.push(Object.freeze({ occurrence, template }));
  }
  const slots = premises.map((template) => {
    const occurrence = byTemplate.get(template);
    if (occurrence === undefined) throw new Error("target occurrence fixture invariant");
    return occurrence;
  });
  return Object.freeze({
    derivationRule, identity, assumptions: Object.freeze(assumptions),
    targetOccurrence: memory.ensure(derivationRule, materializeExactSequence(memory, slots)),
  });
}

function carrier(
  memory: Memory, theory: LinkHandle, sourceDictionary: LinkHandle,
  targetDictionary: LinkHandle,
  roleBindings: readonly (readonly [LinkHandle, LinkHandle])[],
  groundBindings: readonly (readonly [LinkHandle, LinkHandle])[],
): LinkHandle {
  const entries = (bindings: readonly (readonly [LinkHandle, LinkHandle])[]) =>
    materializeExactSequence(memory, bindings.map(([source, value]) => memory.ensure(source, value)));
  return materializeExactSequence(memory, [
    theory, sourceDictionary, targetDictionary, entries(roleBindings), entries(groundBindings),
  ]);
}

function evidence(
  source: StructuralDerivedDerivationEvidence, specialization: LinkHandle, fixture: TargetFixture,
): StructuralDerivedDerivationSpecializationEvidence {
  return Object.freeze({
    source, specialization, targetIdentity: fixture.identity,
    targetAssumptions: fixture.assumptions, targetOccurrence: fixture.targetOccurrence,
  });
}

class MutatingReadMemory implements ReadMemory {
  private mutated = false;
  constructor(
    private readonly source: Memory,
    private readonly writeStart: LinkHandle,
    private readonly writeEnd: LinkHandle,
  ) {}
  get root(): LinkHandle { return this.source.root; }
  get linkCount(): number { return this.source.linkCount; }
  private mutate(): void {
    if (this.mutated) return;
    this.mutated = true;
    this.source.ensure(this.writeStart, this.writeEnd);
  }
  poles(link: LinkHandle): LinkPoles { this.mutate(); return this.source.poles(link); }
  find(start: LinkHandle, end: LinkHandle): LinkHandle | undefined { return this.source.find(start, end); }
  outgoing(start: LinkHandle): readonly LinkHandle[] { return this.source.outgoing(start); }
  incoming(end: LinkHandle): readonly LinkHandle[] { return this.source.incoming(end); }
}

function main(): void {
  const memory = new Memory();
  const { R, O, C, L, U } = ensureRootBasis(memory);
  let cursor = memory.ensure(U, R);
  const fresh = (): LinkHandle => (cursor = memory.ensure(cursor, R));
  const theory = memory.ensure(L, U);
  const unaryContext = memory.ensure(O, fresh());
  const ternaryContext = memory.ensure(C, fresh());
  const transitionContext = memory.ensure(memory.ensure(O, C), fresh());
  const unary = (x: LinkHandle): LinkHandle => memory.ensure(unaryContext, x);
  const tri = (x: LinkHandle, y: LinkHandle, z: LinkHandle): LinkHandle =>
    memory.ensure(memory.ensure(memory.ensure(ternaryContext, x), y), z);
  const transition = (x: LinkHandle, y: LinkHandle): LinkHandle =>
    memory.ensure(memory.ensure(transitionContext, x), y);

  // Pure Role->Role with repeated/nested source-role use.
  const x = fresh(), n = fresh();
  const dx = defineStructuralRoleDictionary(memory, [x]);
  const dn = defineStructuralRoleDictionary(memory, [n]);
  const sourceRole = admittedGeneric(memory, theory, dx, [unary(x)], tri(x, x, x));
  const targetRole = target(memory, theory, dn, [unary(n)], tri(n, n, n));
  const roleCarrier = carrier(memory, theory, dx, dn, [[x, n]], []);
  same(replayStructuralDerivedDerivationSchema(memory, sourceRole.evidence).theory, theory, "source control");
  const roleBefore = memory.linkCount;
  const roleReplay = replayStructuralDerivedDerivationSpecialization(
    memory, evidence(sourceRole.evidence, roleCarrier, targetRole));
  same(roleReplay.theory, theory, "pure role Theory");
  same(roleReplay.targetConclusionTemplate, tri(n, n, n), "repeated role target");
  same(memory.linkCount, roleBefore, "pure role replay read-only");

  // Pure grounding into an empty target RoleDictionary.
  const ground = fresh();
  const dEmpty = defineStructuralRoleDictionary(memory, []);
  const sourceGround = admittedGeneric(memory, theory, dx, [], unary(x));
  const targetGround = target(memory, theory, dEmpty, [], unary(ground));
  const groundReplay = replayStructuralDerivedDerivationSpecialization(memory, evidence(
    sourceGround.evidence, carrier(memory, theory, dx, dEmpty, [], [[x, ground]]), targetGround));
  same(groundReplay.targetConclusionTemplate, unary(ground), "pure grounding target");

  // Mixed non-injective Role mapping plus one grounded role; two slots alias one assumption.
  const a = fresh(), b = fresh(), c = fresh(), b1 = fresh(), c1 = fresh(), n1 = fresh();
  const dSource = defineStructuralRoleDictionary(memory, [a, b, c, b1, c1]);
  const dTarget = defineStructuralRoleDictionary(memory, [n, n1]);
  const source = admittedGeneric(memory, theory, dSource, [
    tri(a, b, c), transition(b, b1), transition(c, c1),
  ], tri(a, b1, c1));
  const mappedCurrent = tri(ground, n, n);
  const mappedStep = transition(n, n1);
  const mappedNext = tri(ground, n1, n1);
  const mixedTarget = target(memory, theory, dTarget,
    [mappedCurrent, mappedStep, mappedStep], mappedNext);
  const mixedCarrier = carrier(memory, theory, dSource, dTarget, [
    [b, n], [c, n], [b1, n1], [c1, n1],
  ], [[a, ground]]);
  const mixedEvidence = evidence(source.evidence, mixedCarrier, mixedTarget);
  const mixedBefore = memory.linkCount;
  const mixedReplay = replayStructuralDerivedDerivationSpecialization(memory, mixedEvidence);
  same(mixedReplay.targetAssumptionCount, 2, "exact semantic assumption image");
  same(mixedReplay.premiseSlotCount, 3, "ordered slot multiplicity");
  same(mixedReplay.targetConclusionTemplate, mappedNext, "mixed target conclusion");
  same(memory.linkCount, mixedBefore, "mixed replay read-only");
  assert(memory.find(theory, mixedTarget.derivationRule) === undefined, "target DR unadmitted");

  // Host decorations cannot add authority.
  const decorated = { ...mixedEvidence, cached: true, weakening: true, name: "trusted", callback: () => true };
  same(replayStructuralDerivedDerivationSpecialization(memory, decorated).targetConclusionTemplate,
    mappedNext, "host decorations inert");

  const wrongDictionary = defineStructuralRoleDictionary(memory, [fresh()]);
  const foreignTheory = fresh(), extra = fresh();
  const bad = (
    expected: string,
    spec: LinkHandle,
    targetFixture: TargetFixture = mixedTarget,
  ): void => expectError(expected, () => replayStructuralDerivedDerivationSpecialization(
    memory, evidence(source.evidence, spec, targetFixture)));

  bad("invalid-specialization-carrier",
    materializeExactSequence(memory, [theory, dSource, dTarget, extra]));
  bad("theory-mismatch", carrier(memory, foreignTheory, dSource, dTarget,
    [[b, n], [c, n], [b1, n1], [c1, n1]], [[a, ground]]));
  bad("source-dictionary-mismatch", carrier(memory, theory, wrongDictionary, dTarget, [], []));
  bad("target-dictionary-mismatch", carrier(memory, theory, dSource, wrongDictionary,
    [[b, n], [c, n], [b1, n1], [c1, n1]], [[a, ground]]));
  bad("missing-source-role", carrier(memory, theory, dSource, dTarget,
    [[b, n], [c, n], [b1, n1]], [[a, ground]]));
  bad("duplicate-source-role-binding", carrier(memory, theory, dSource, dTarget,
    [[b, n], [b, n1], [c, n], [b1, n1], [c1, n1]], [[a, ground]]));
  expectError("duplicate-source-role-binding", () =>
    replayStructuralDerivedDerivationSpecialization(memory, evidence(
      sourceGround.evidence,
      carrier(memory, theory, dx, dEmpty, [], [[x, ground], [x, ground]]),
      targetGround,
    )));
  bad("binding-partition-overlap", carrier(memory, theory, dSource, dTarget,
    [[a, n], [b, n], [c, n], [b1, n1], [c1, n1]], [[a, ground]]));
  bad("undeclared-source-role", carrier(memory, theory, dSource, dTarget,
    [[extra, n], [b, n], [c, n], [b1, n1], [c1, n1]], [[a, ground]]));
  bad("target-role-not-member", carrier(memory, theory, dSource, dTarget,
    [[b, n], [c, n], [b1, n1], [c1, extra]], [[a, ground]]));
  bad("grounded-target-role-capture", carrier(memory, theory, dSource, dTarget,
    [[b, n], [c, n], [b1, n1], [c1, n1]], [[a, n]]));

  // A source-grounded constant may not become generic merely because it is active in Ddst.
  const captureDictionary = defineStructuralRoleDictionary(memory, [L, n1]);
  const captureSource = admittedGeneric(memory, theory, dx, [], memory.ensure(L, x));
  const captureTarget = target(memory, theory, captureDictionary, [], memory.ensure(L, n1));
  expectError("grounded-target-role-capture", () =>
    replayStructuralDerivedDerivationSpecialization(memory, evidence(
      captureSource.evidence,
      carrier(memory, theory, dx, captureDictionary, [[x, n1]], []),
      captureTarget,
    )));

  const wrongConclusion = target(memory, theory, dTarget,
    [mappedCurrent, mappedStep, mappedStep], tri(ground, n1, n));
  bad("conclusion-mismatch", mixedCarrier, wrongConclusion);
  expectError("invalid-target-identity", () =>
    replayStructuralDerivedDerivationSpecialization(memory, { ...mixedEvidence, targetIdentity: extra }));
  expectError("assumption-image-mismatch", () =>
    replayStructuralDerivedDerivationSpecialization(memory, {
      ...mixedEvidence,
      targetAssumptions: Object.freeze([...mixedTarget.assumptions,
        Object.freeze({ occurrence: extra, template: extra })]),
    }));
  expectError("assumption-image-mismatch", () =>
    replayStructuralDerivedDerivationSpecialization(memory, {
      ...mixedEvidence, targetAssumptions: Object.freeze(mixedTarget.assumptions.slice(0, 1)),
    }));

  const targetOccurrencePoles = memory.poles(mixedTarget.targetOccurrence);
  const wrongOrder = materializeExactSequence(memory, [
    mixedTarget.assumptions[1]!.occurrence,
    mixedTarget.assumptions[0]!.occurrence,
    mixedTarget.assumptions[1]!.occurrence,
  ]);
  expectError("premise-slot-mismatch", () =>
    replayStructuralDerivedDerivationSpecialization(memory, {
      ...mixedEvidence,
      targetOccurrence: memory.ensure(targetOccurrencePoles.start, wrongOrder),
    }));
  const wrongMultiplicity = materializeExactSequence(memory, [
    mixedTarget.assumptions[0]!.occurrence, mixedTarget.assumptions[1]!.occurrence,
  ]);
  expectError("premise-slot-mismatch", () =>
    replayStructuralDerivedDerivationSpecialization(memory, {
      ...mixedEvidence,
      targetOccurrence: memory.ensure(targetOccurrencePoles.start, wrongMultiplicity),
    }));
  expectError("invalid-assumption-occurrence", () =>
    replayStructuralDerivedDerivationSpecialization(memory, {
      ...mixedEvidence,
      targetAssumptions: Object.freeze([
        mixedTarget.assumptions[0]!,
        Object.freeze({ occurrence: mixedTarget.assumptions[0]!.occurrence, template: mappedStep }),
      ]),
    }));

  memory.ensure(theory, mixedTarget.derivationRule);
  expectError("target-primitive-admission", () =>
    replayStructuralDerivedDerivationSpecialization(memory, mixedEvidence));

  // Mutation uses handles from the same memory and a previously absent pair.
  const writeStart = fresh(), writeEnd = fresh();
  const mutating = new MutatingReadMemory(memory, writeStart, writeEnd);
  expectError("specialization-wrote", () =>
    replayStructuralDerivedDerivationSpecialization(mutating, mixedEvidence));
}

main();
