import { materializeExactSequence } from "../src/exact-sequence.js";
import { Memory, type LinkHandle } from "../src/memory.js";
import { ensureRootBasis } from "../src/public.js";
import { defineContext } from "../src/state.js";
import {
  admitStructuralRule,
  defineStructuralInterpreter,
  defineStructuralRoleDictionary,
  defineStructuralRule,
  type StructuralRoleBinding,
} from "../src/structural-rule.js";
import {
  admitStructuralDerivationRule,
  defineStructuralDerivationRule,
  defineStructuralProofOccurrence,
  replayStructuralDerivationWithAssumptions,
} from "../src/derivation.js";
import { defineActHeader } from "../src/structural-readers.js";
import {
  replayStructuralDerivedDerivationSchema,
  type StructuralDerivedDerivationEvidence,
  type StructuralDerivedDerivationNodeEvidence,
} from "../src/derived-derivation-schema.js";
import {
  StructuralDerivedDerivationInstantiationError,
  instantiateStructuralDerivedDerivationSchema,
  type StructuralDerivedDerivationInstantiationErrorCode,
} from "../src/derived-derivation-instantiation.js";
import { exportPortableStructuralTheory } from "../src/portable-theory.js";
import { computePortableStructuralTheoryRevision } from "../src/portable-theory-digest.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}

function expectInstantiationError(
  code: StructuralDerivedDerivationInstantiationErrorCode,
  effect: () => unknown,
): void {
  try {
    effect();
  } catch (error) {
    assert(error instanceof StructuralDerivedDerivationInstantiationError, `${code}: wrong error type`);
    same(error.code, code, `${code}: wrong error code`);
    return;
  }
  throw new Error(`${code}: expected instantiation rejection`);
}

function expectTrustedReject(effect: () => unknown, message: string): void {
  try {
    effect();
  } catch {
    return;
  }
  throw new Error(`${message}: expected trusted replay rejection`);
}

interface Schema {
  readonly rule: LinkHandle;
  readonly derivationRule: LinkHandle;
}

interface AdmittedSchema extends Schema {
  readonly ruleAdmission: LinkHandle;
  readonly derivationRuleAdmission: LinkHandle;
}

function fixture() {
  const memory = new Memory();
  const { R, L, U } = ensureRootBasis(memory);
  let cursor = memory.ensure(U, R);
  const fresh = (): LinkHandle => (cursor = memory.ensure(cursor, R));

  const theory = memory.ensure(L, U);
  const dictionary = fresh();
  const grammar = fresh();
  const interpreter = defineStructuralInterpreter(memory, dictionary, grammar, theory);
  const afterContext = defineContext(memory, R, L);

  const aRole = fresh();
  const bRole = fresh();
  const cRole = fresh();
  const roleDictionary = defineStructuralRoleDictionary(memory, [aRole, bRole, cRole]);

  const defineSchema = (body: LinkHandle, premises: readonly LinkHandle[]): Schema => {
    const rule = defineStructuralRule(memory, roleDictionary, body);
    return { rule, derivationRule: defineStructuralDerivationRule(memory, rule, premises) };
  };
  const admitSchema = (schema: Schema): AdmittedSchema => ({
    ...schema,
    ruleAdmission: admitStructuralRule(memory, theory, schema.rule),
    derivationRuleAdmission: admitStructuralDerivationRule(memory, theory, schema.derivationRule),
  });
  const makeNode = (
    schema: AdmittedSchema,
    dependencies: readonly LinkHandle[],
  ): StructuralDerivedDerivationNodeEvidence => {
    const premiseOccurrenceSequence = materializeExactSequence(memory, dependencies);
    return Object.freeze({
      occurrence: memory.ensure(schema.derivationRule, premiseOccurrenceSequence),
      derivationRule: schema.derivationRule,
      ruleAdmission: schema.ruleAdmission,
      derivationRuleAdmission: schema.derivationRuleAdmission,
      premiseOccurrenceSequence,
    });
  };
  const makeEvidence = (
    target: Schema,
    assumptionTemplates: readonly LinkHandle[],
    buildNodes: (assumptions: readonly LinkHandle[]) => readonly StructuralDerivedDerivationNodeEvidence[],
  ): StructuralDerivedDerivationEvidence => {
    const identity = memory.ensure(target.derivationRule, theory);
    const assumptions = assumptionTemplates.map((template) => ({
      occurrence: memory.ensure(template, identity),
      template,
    }));
    const nodes = buildNodes(assumptions.map((assumption) => assumption.occurrence));
    const targetNode = nodes[nodes.length - 1];
    assert(targetNode !== undefined, "generic proof must have target node");
    return Object.freeze({ identity, targetOccurrence: targetNode.occurrence, assumptions, nodes });
  };

  const r1 = admitSchema(defineSchema(bRole, [aRole]));
  const r2 = admitSchema(defineSchema(cRole, [bRole]));
  const target = defineSchema(cRole, [aRole]);
  const genericEvidence = makeEvidence(target, [aRole], ([assumption]) => {
    assert(assumption !== undefined, "simple assumption occurrence");
    const node1 = makeNode(r1, [assumption]);
    return [node1, makeNode(r2, [node1.occurrence])];
  });

  return {
    memory,
    theory,
    interpreter,
    afterContext,
    aRole,
    bRole,
    cRole,
    roleDictionary,
    target,
    genericEvidence,
    fresh,
    defineSchema,
    admitSchema,
    makeNode,
    makeEvidence,
  };
}

function bindings(
  fx: ReturnType<typeof fixture>,
  a: LinkHandle,
  b: LinkHandle,
  c: LinkHandle,
): readonly StructuralRoleBinding[] {
  return [
    { role: fx.aRole, value: a },
    { role: fx.bRole, value: b },
    { role: fx.cRole, value: c },
  ];
}

function instantiateAndReplay(
  fx: ReturnType<typeof fixture>,
  genericEvidence: StructuralDerivedDerivationEvidence,
  selectedBindings: readonly StructuralRoleBinding[],
  afterContext: LinkHandle,
  expectedAssumptions: readonly LinkHandle[],
  expectedConclusion: LinkHandle,
  expectedNodes: number,
) {
  replayStructuralDerivedDerivationSchema(fx.memory, genericEvidence);
  const expansion = instantiateStructuralDerivedDerivationSchema(
    fx.memory,
    genericEvidence,
    fx.interpreter,
    afterContext,
    selectedBindings,
  );
  same(expansion.assumptionClaims.length, expectedAssumptions.length, "concrete assumption count");
  expansion.assumptionClaims.forEach((claim, index) =>
    same(claim, expectedAssumptions[index], `concrete assumption ${index}`),
  );
  same(expansion.targetClaim, expectedConclusion, "concrete target claim");

  const beforeReplay = fx.memory.linkCount;
  const replay = replayStructuralDerivationWithAssumptions(fx.memory, expansion.evidence);
  same(replay.derivation.theory, fx.theory, "ordinary replay stays under T0");
  same(replay.derivation.target.judgment.claim, expectedConclusion, "ordinary target claim");
  same(replay.derivation.occurrenceCount, expectedNodes, "ordinary replay verifies expanded DAG");
  same(fx.memory.linkCount, beforeReplay, "ordinary replay is read-only");
  return expansion;
}

async function main(): Promise<void> {
  const fx = fixture();
  const pinnedRevision = await computePortableStructuralTheoryRevision(
    exportPortableStructuralTheory(fx.memory, fx.theory),
  );

  const x = fx.fresh();
  const bx = fx.fresh();
  const cx = fx.fresh();
  const expansionX = instantiateAndReplay(
    fx,
    fx.genericEvidence,
    bindings(fx, x, bx, cx),
    fx.afterContext,
    [x],
    cx,
    2,
  );

  const y = fx.fresh();
  const by = fx.fresh();
  const cy = fx.fresh();
  const secondContext = defineContext(fx.memory, fx.afterContext, fx.fresh());
  instantiateAndReplay(
    fx,
    fx.genericEvidence,
    bindings(fx, y, by, cy),
    secondContext,
    [y],
    cy,
    2,
  );

  const invalidBefore = fx.memory.linkCount;
  expectInstantiationError("missing-role-binding", () =>
    instantiateStructuralDerivedDerivationSchema(
      fx.memory,
      fx.genericEvidence,
      fx.interpreter,
      fx.afterContext,
      bindings(fx, x, bx, cx).slice(0, 2),
    ),
  );
  same(fx.memory.linkCount, invalidBefore, "partial rho rejected before expansion writes");
  expectInstantiationError("duplicate-role-binding", () =>
    instantiateStructuralDerivedDerivationSchema(
      fx.memory,
      fx.genericEvidence,
      fx.interpreter,
      fx.afterContext,
      [...bindings(fx, x, bx, cx), { role: fx.aRole, value: y }],
    ),
  );
  expectInstantiationError("undeclared-role-binding", () =>
    instantiateStructuralDerivedDerivationSchema(
      fx.memory,
      fx.genericEvidence,
      fx.interpreter,
      fx.afterContext,
      [...bindings(fx, x, bx, cx), { role: fx.fresh(), value: y }],
    ),
  );
  expectInstantiationError("role-valued-binding", () =>
    instantiateStructuralDerivedDerivationSchema(
      fx.memory,
      fx.genericEvidence,
      fx.interpreter,
      fx.afterContext,
      bindings(fx, fx.bRole, bx, cx),
    ),
  );

  const targetNode = expansionX.evidence.derivation.nodes.find(
    (node) => node.occurrence === expansionX.evidence.derivation.targetOccurrence,
  );
  assert(targetNode !== undefined, "expanded target node exists");
  const forgedClaim = fx.fresh();
  const forgedTarget = {
    ...targetNode,
    judgment: {
      ...targetNode.judgment,
      application: { ...targetNode.judgment.application, claimedBody: forgedClaim },
      judgment: { ...targetNode.judgment.judgment, claim: forgedClaim },
    },
  };
  expectTrustedReject(
    () => replayStructuralDerivationWithAssumptions(fx.memory, {
      ...expansionX.evidence,
      derivation: {
        ...expansionX.evidence.derivation,
        nodes: expansionX.evidence.derivation.nodes.map((node) =>
          node.occurrence === targetNode.occurrence ? forgedTarget : node,
        ),
      },
    }),
    "host-only claim retargeting",
  );

  const foreignTheory = fx.memory.ensure(fx.fresh(), fx.fresh());
  expectTrustedReject(
    () => replayStructuralDerivationWithAssumptions(fx.memory, {
      ...expansionX.evidence,
      derivation: { ...expansionX.evidence.derivation, theory: foreignTheory },
    }),
    "foreign Theory retargeting",
  );

  const wrongDictionary = defineStructuralRoleDictionary(
    fx.memory,
    [fx.aRole, fx.bRole, fx.fresh()],
  );
  const wrongAct = defineActHeader(fx.memory, fx.interpreter, wrongDictionary, fx.afterContext);
  const wrongOccurrence = defineStructuralProofOccurrence(fx.memory, wrongAct, expansionX.targetClaim);
  const wrongTarget = {
    ...targetNode,
    occurrence: wrongOccurrence,
    judgment: {
      ...targetNode.judgment,
      application: { ...targetNode.judgment.application, act: wrongAct },
    },
  };
  expectTrustedReject(
    () => replayStructuralDerivationWithAssumptions(fx.memory, {
      ...expansionX.evidence,
      derivation: {
        ...expansionX.evidence.derivation,
        targetOccurrence: wrongOccurrence,
        nodes: expansionX.evidence.derivation.nodes.map((node) =>
          node.occurrence === targetNode.occurrence ? wrongTarget : node,
        ),
      },
    }),
    "wrong RoleDictionary Act",
  );

  assert(
    fx.memory.find(fx.theory, fx.target.derivationRule) === undefined,
    "expansion must not self-admit the derived DR",
  );
  const afterRevision = await computePortableStructuralTheoryRevision(
    exportPortableStructuralTheory(fx.memory, fx.theory),
  );
  same(afterRevision.value, pinnedRevision.value, "generic replay/expansion/concrete replay preserve T0");

  const nested = fixture();
  const grounded = nested.theory;
  const aa = nested.memory.ensure(nested.aRole, nested.aRole);
  const bk = nested.memory.ensure(nested.bRole, grounded);
  const ck = nested.memory.ensure(nested.cRole, grounded);
  const nr1 = nested.admitSchema(nested.defineSchema(bk, [aa]));
  const nr2 = nested.admitSchema(nested.defineSchema(ck, [bk]));
  const nestedTarget = nested.defineSchema(ck, [aa]);
  const nestedEvidence = nested.makeEvidence(nestedTarget, [aa], ([assumption]) => {
    assert(assumption !== undefined, "nested assumption occurrence");
    const node1 = nested.makeNode(nr1, [assumption]);
    return [node1, nested.makeNode(nr2, [node1.occurrence])];
  });
  const nx = nested.fresh();
  const nb = nested.fresh();
  const nc = nested.fresh();
  const nestedExpansion = instantiateAndReplay(
    nested,
    nestedEvidence,
    bindings(nested, nx, nb, nc),
    nested.afterContext,
    [nested.memory.ensure(nx, nx)],
    nested.memory.ensure(nc, grounded),
    2,
  );
  const repeated = nested.memory.poles(nestedExpansion.assumptionClaims[0]!);
  same(repeated.start, nx, "repeated A first occurrence uses exact rho(A)");
  same(repeated.end, nx, "repeated A second occurrence uses exact rho(A)");
  const nestedConclusion = nested.memory.poles(nestedExpansion.targetClaim);
  same(nestedConclusion.start, nc, "nested role occurrence instantiated");
  same(nestedConclusion.end, grounded, "grounded constant identity preserved");

  const branching = fixture();
  const cc = branching.memory.ensure(branching.cRole, branching.cRole);
  const toB = branching.admitSchema(branching.defineSchema(branching.bRole, [branching.aRole]));
  const toC = branching.admitSchema(branching.defineSchema(branching.cRole, [branching.aRole]));
  const join = branching.admitSchema(
    branching.defineSchema(cc, [branching.bRole, branching.cRole]),
  );
  const branchingTarget = branching.defineSchema(cc, [branching.aRole]);
  const branchingEvidence = branching.makeEvidence(branchingTarget, [branching.aRole], ([assumption]) => {
    assert(assumption !== undefined, "branching assumption occurrence");
    const left = branching.makeNode(toB, [assumption]);
    const right = branching.makeNode(toC, [assumption]);
    return [left, right, branching.makeNode(join, [left.occurrence, right.occurrence])];
  });
  const ba = branching.fresh();
  const bb = branching.fresh();
  const bc = branching.fresh();
  instantiateAndReplay(
    branching,
    branchingEvidence,
    bindings(branching, ba, bb, bc),
    branching.afterContext,
    [ba],
    branching.memory.ensure(bc, bc),
    3,
  );
}

await main();
