import { materializeExactSequence } from "../src/exact-sequence.js";
import { Memory, ensureRootBasis, type LinkHandle } from "../src/public.js";
import { defineContext } from "../src/state.js";
import { defineActField, defineActHeader } from "../src/structural-readers.js";
import {
  admitStructuralRule,
  defineStructuralInterpreter,
  defineStructuralRoleDictionary,
  defineStructuralRule,
  type StructuralInterpreter,
} from "../src/structural-rule.js";
import {
  StructuralDerivationReplayError,
  admitStructuralDerivationRule,
  defineStructuralDerivationRule,
  defineStructuralProofOccurrence,
  defineStructuralTheorem,
  replayStructuralDerivation,
  replayStructuralDerivationWithTheorems,
  replayStructuralTheorem,
  type StructuralDerivationEvidence,
  type StructuralDerivationNodeEvidence,
  type StructuralJudgmentEvidence,
} from "../src/derivation.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}

function expectDerivationReject(effect: () => unknown, message: string): void {
  try {
    effect();
  } catch (error) {
    assert(error instanceof StructuralDerivationReplayError, `${message}: wrong error type`);
    return;
  }
  throw new Error(`${message}: expected StructuralDerivationReplayError`);
}

type Binding = readonly [LinkHandle, LinkHandle];

interface RulePack {
  readonly dictionary: LinkHandle;
  readonly rule: LinkHandle;
  readonly ruleAdmission: LinkHandle;
  readonly derivationRule: LinkHandle;
  readonly derivationRuleAdmission: LinkHandle;
}

function fixture(sameSemanticMember = false) {
  const memory = new Memory();
  const { R, L, U } = ensureRootBasis(memory);
  let cursor = U;
  const fresh = (): LinkHandle => (cursor = memory.ensure(cursor, R));
  const exact = (values: readonly LinkHandle[]) => materializeExactSequence(memory, values);

  const dictionary = fresh();
  const grammar = fresh();
  const theory = fresh();
  const seqMode = fresh();
  const otherMode = fresh();
  const countTag = fresh();
  const nonEmptyTag = fresh();
  const collection = fresh();
  const member1 = fresh();
  const member2 = sameSemanticMember ? member1 : fresh();
  const provenance1 = fresh();
  const provenance2 = fresh();
  const provenance3 = fresh();
  const member3 = fresh();

  assert(provenance1 !== provenance2, "occurrence provenance must be distinct");

  const cRole = fresh();
  const x1Role = fresh();
  const p1Role = fresh();
  const x2Role = fresh();
  const p2Role = fresh();
  const domainDictionary = defineStructuralRoleDictionary(
    memory,
    [cRole, x1Role, p1Role, x2Role, p2Role],
  );

  const expectedInterpreter: StructuralInterpreter = { dictionary, grammar, theory };
  const interpreter = defineStructuralInterpreter(memory, dictionary, grammar, theory);
  const l2 = memory.ensure(L, L);
  const l3 = memory.ensure(l2, L);

  const occ = (member: LinkHandle, provenance: LinkHandle) =>
    exact([collection, member, provenance]);
  const occurrence1 = occ(member1, provenance1);
  const occurrence2 = occ(member2, provenance2);
  const occurrence3 = occ(member3, provenance3);
  const carrier = exact([occurrence1, occurrence2]);
  const closedDefinition = exact([theory, seqMode, collection, carrier]);
  const oneOccurrenceDefinition = exact([
    theory,
    seqMode,
    collection,
    exact([occurrence1]),
  ]);
  const threeOccurrenceDefinition = exact([
    theory,
    seqMode,
    collection,
    exact([occurrence1, occurrence2, occurrence3]),
  ]);
  const wrongModeDefinition = exact([theory, otherMode, collection, carrier]);
  const countClaim = exact([countTag, collection, l2]);
  const forgedCountClaim = exact([countTag, collection, l3]);
  const nonEmptyClaim = exact([nonEmptyTag, collection]);

  const occurrence1Template = exact([cRole, x1Role, p1Role]);
  const occurrence2Template = exact([cRole, x2Role, p2Role]);
  const carrierTemplate = exact([occurrence1Template, occurrence2Template]);
  const definitionTemplate = exact([theory, seqMode, cRole, carrierTemplate]);
  const countTemplate = exact([countTag, cRole, l2]);

  const definePack = (
    selectedDictionary: LinkHandle,
    conclusionTemplate: LinkHandle,
    premiseTemplates: readonly LinkHandle[],
  ): RulePack => {
    const rule = defineStructuralRule(memory, selectedDictionary, conclusionTemplate);
    const derivationRule = defineStructuralDerivationRule(memory, rule, premiseTemplates);
    return {
      dictionary: selectedDictionary,
      rule,
      ruleAdmission: admitStructuralRule(memory, theory, rule),
      derivationRule,
      derivationRuleAdmission: admitStructuralDerivationRule(memory, theory, derivationRule),
    };
  };

  const definitionPack = definePack(domainDictionary, definitionTemplate, []);
  const project1Pack = definePack(domainDictionary, occurrence1Template, [definitionTemplate]);
  const project2Pack = definePack(domainDictionary, occurrence2Template, [definitionTemplate]);
  const countPack = definePack(
    domainDictionary,
    countTemplate,
    [definitionTemplate, occurrence1Template, occurrence2Template],
  );

  const domainBindings: readonly Binding[] = [
    [cRole, collection],
    [x1Role, member1],
    [p1Role, provenance1],
    [x2Role, member2],
    [p2Role, provenance2],
  ];

  const makeNode = (
    pack: RulePack,
    bindings: readonly Binding[],
    claim: LinkHandle,
    premiseOccurrences: readonly LinkHandle[],
  ) => {
    const context = defineContext(memory, fresh(), fresh());
    const act = defineActHeader(memory, interpreter, pack.dictionary, context);
    bindings.forEach(([role, value]) => defineActField(memory, act, role, value));
    const judgment: StructuralJudgmentEvidence = {
      application: {
        act,
        rule: pack.rule,
        ruleAdmission: pack.ruleAdmission,
        claimedBody: claim,
        expectedInterpreter,
        expectedAfterContext: context,
      },
      judgment: { theory, context, claim },
    };
    const occurrence = defineStructuralProofOccurrence(memory, act, claim);
    const node: StructuralDerivationNodeEvidence = {
      occurrence,
      judgment,
      derivationRule: pack.derivationRule,
      derivationRuleAdmission: pack.derivationRuleAdmission,
      premiseOccurrenceSequence: exact(premiseOccurrences),
    };
    return { occurrence, node };
  };

  const proofFromDefinition = (
    definitionClaim = closedDefinition,
    selectedCountClaim = countClaim,
  ) => {
    const root = makeNode(definitionPack, domainBindings, definitionClaim, []);
    const projected1 = makeNode(
      project1Pack,
      domainBindings,
      occurrence1,
      [root.occurrence],
    );
    const projected2 = makeNode(
      project2Pack,
      domainBindings,
      occurrence2,
      [root.occurrence],
    );
    const count = makeNode(
      countPack,
      domainBindings,
      selectedCountClaim,
      [root.occurrence, projected1.occurrence, projected2.occurrence],
    );
    const evidence: StructuralDerivationEvidence = {
      theory,
      targetOccurrence: count.occurrence,
      nodes: [count.node, projected2.node, root.node, projected1.node],
    };
    return { root, projected1, projected2, count, evidence };
  };

  const nonEmptyDictionary = defineStructuralRoleDictionary(memory, [cRole]);
  const nonEmptyTemplate = exact([nonEmptyTag, cRole]);
  const countPremiseTemplate = exact([countTag, cRole, l2]);
  const nonEmptyPack = definePack(nonEmptyDictionary, nonEmptyTemplate, [countPremiseTemplate]);
  const nonEmptyFrom = (countOccurrence: LinkHandle) =>
    makeNode(nonEmptyPack, [[cRole, collection]], nonEmptyClaim, [countOccurrence]);

  return {
    memory,
    fresh,
    theory,
    collection,
    member1,
    member2,
    provenance1,
    provenance2,
    l2,
    countClaim,
    forgedCountClaim,
    nonEmptyClaim,
    closedDefinition,
    oneOccurrenceDefinition,
    threeOccurrenceDefinition,
    wrongModeDefinition,
    proofFromDefinition,
    nonEmptyFrom,
  };
}

// A closed two-occurrence sequence derives Count(C)=L² through an explicit
// branching proof. Host node order is transport only and replay writes nothing.
{
  const fx = fixture();
  const proof = fx.proofFromDefinition();
  const before = fx.memory.linkCount;
  const result = replayStructuralDerivation(fx.memory, proof.evidence);
  same(result.target.judgment.claim, fx.countClaim, "Count target");
  same(result.occurrenceCount, 4, "Def + two projections + Count2");
  same(fx.memory.linkCount, before, "Count proof replay must be read-only");

  const reordered = replayStructuralDerivation(fx.memory, {
    ...proof.evidence,
    nodes: [proof.root.node, proof.count.node, proof.projected1.node, proof.projected2.node],
  });
  same(reordered.target.judgment.claim, fx.countClaim, "host order is non-semantic");
  same(fx.memory.linkCount, before, "reordered replay must be read-only");
}

// Multiplicity belongs to occurrence/provenance evidence, not semantic Link copies.
{
  const fx = fixture(true);
  same(fx.member1, fx.member2, "semantic member must be shared");
  assert(fx.provenance1 !== fx.provenance2, "two occurrences need distinct provenance");
  const proof = fx.proofFromDefinition();
  same(
    replayStructuralDerivation(fx.memory, proof.evidence).target.judgment.claim,
    fx.countClaim,
    "two occurrences of one semantic member still Count to L²",
  );
}

// The proved Count theorem is proof-carrying data and can be expanded as a lemma.
{
  const fx = fixture();
  const proof = fx.proofFromDefinition();
  const theorem = defineStructuralTheorem(fx.memory, fx.countClaim, fx.theory);
  const before = fx.memory.linkCount;
  const checked = replayStructuralTheorem(fx.memory, { theorem, proof: proof.evidence });
  same(checked.identity.claim, fx.countClaim, "Count theorem claim");
  same(checked.proof.occurrenceCount, 4, "Count theorem carries full proof");

  const nonEmpty = fx.nonEmptyFrom(proof.count.occurrence);
  const reused = replayStructuralDerivationWithTheorems(fx.memory, {
    derivation: {
      theory: fx.theory,
      targetOccurrence: nonEmpty.occurrence,
      nodes: [nonEmpty.node],
    },
    theorems: [{ theorem, proof: proof.evidence }],
  });
  same(reused.derivation.target.judgment.claim, fx.nonEmptyClaim, "NonEmpty lemma target");
  same(reused.derivation.occurrenceCount, 5, "lemma replay expands the Count proof closure");
  same(fx.memory.linkCount, before, "theorem replay/reuse must be read-only");
}

// Count2 is exact structural data: one/three occurrences and a wrong mode fail closed.
{
  const fx = fixture();
  for (const [definition, label] of [
    [fx.oneOccurrenceDefinition, "one occurrence"],
    [fx.threeOccurrenceDefinition, "three occurrences"],
    [fx.wrongModeDefinition, "wrong mode"],
  ] as const) {
    const proof = fx.proofFromDefinition(definition);
    expectDerivationReject(() => replayStructuralDerivation(fx.memory, proof.evidence), label);
  }
}

// A forged L³ conclusion, missing projection, foreign theory and host rule name grant no authority.
{
  const fx = fixture();
  const forged = fx.proofFromDefinition(fx.closedDefinition, fx.forgedCountClaim);
  expectDerivationReject(() => replayStructuralDerivation(fx.memory, forged.evidence), "forged L³");

  const valid = fx.proofFromDefinition();
  expectDerivationReject(
    () => replayStructuralDerivation(fx.memory, {
      ...valid.evidence,
      nodes: [valid.count.node, valid.root.node, valid.projected1.node],
    }),
    "missing second projection",
  );

  expectDerivationReject(
    () => replayStructuralDerivation(fx.memory, {
      ...valid.evidence,
      theory: new Memory().root,
    }),
    "foreign theory",
  );

  const hostNamedCount = {
    ...forged.count.node,
    judgment: {
      ...forged.count.node.judgment,
      application: {
        ...forged.count.node.judgment.application,
        ruleKind: "count2",
      },
    },
  };
  expectDerivationReject(
    () => replayStructuralDerivation(fx.memory, {
      ...forged.evidence,
      nodes: [hostNamedCount, forged.projected2.node, forged.root.node, forged.projected1.node],
    }),
    "host ruleKind cannot rescue forged Count",
  );
}
