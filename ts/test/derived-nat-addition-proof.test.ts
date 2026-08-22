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

function fixture() {
  const memory = new Memory();
  const { R, L, U } = ensureRootBasis(memory);
  let cursor = U;
  const fresh = (): LinkHandle => (cursor = memory.ensure(cursor, R));
  const exact = (values: readonly LinkHandle[]) => materializeExactSequence(memory, values);

  const dictionary = fresh();
  const grammar = fresh();
  const theory = fresh();
  const posTag = fresh();
  const succTag = fresh();
  const addTag = fresh();
  const leTag = fresh();

  const dRole = fresh();
  const aRole = fresh();
  const bRole = fresh();
  const cRole = fresh();
  const b1Role = fresh();
  const c1Role = fresh();

  const groundDictionary = defineStructuralRoleDictionary(memory, []);
  const dDictionary = defineStructuralRoleDictionary(memory, [dRole]);
  const aDictionary = defineStructuralRoleDictionary(memory, [aRole]);
  const addStepDictionary = defineStructuralRoleDictionary(
    memory,
    [aRole, bRole, cRole, b1Role, c1Role],
  );
  const leDictionary = defineStructuralRoleDictionary(memory, [aRole, bRole, cRole]);

  const expectedInterpreter: StructuralInterpreter = { dictionary, grammar, theory };
  const interpreter = defineStructuralInterpreter(memory, dictionary, grammar, theory);

  const l2 = memory.ensure(L, L);
  const l3 = memory.ensure(l2, L);
  const uniformZeroPair = memory.ensure(U, L);
  const rawAddPair = memory.ensure(L, l2);

  const posLClaim = exact([posTag, L]);
  const posL2Claim = exact([posTag, l2]);
  const succZeroClaim = exact([succTag, U, L]);
  const succLClaim = exact([succTag, L, l2]);
  const succL2Claim = exact([succTag, l2, l3]);
  const forgedZeroSuccClaim = exact([succTag, U, uniformZeroPair]);
  const addBaseClaim = exact([addTag, L, U, L]);
  const addL1Claim = exact([addTag, L, L, l2]);
  const addTargetClaim = exact([addTag, L, l2, l3]);
  const forgedAddClaim = exact([addTag, L, l2, rawAddPair]);
  const wrongBindingClaim = exact([addTag, L, l3, l3]);
  const leClaim = exact([leTag, L, l3]);

  const posTemplate = exact([posTag, dRole]);
  const nextDegreeTemplate = memory.ensure(dRole, L);
  const posNextTemplate = exact([posTag, nextDegreeTemplate]);
  const succPositiveTemplate = exact([succTag, dRole, nextDegreeTemplate]);
  const addBaseTemplate = exact([addTag, aRole, U, aRole]);
  const addPremiseTemplate = exact([addTag, aRole, bRole, cRole]);
  const succBTemplate = exact([succTag, bRole, b1Role]);
  const succCTemplate = exact([succTag, cRole, c1Role]);
  const addNextTemplate = exact([addTag, aRole, b1Role, c1Role]);
  const lePremiseTemplate = exact([addTag, aRole, cRole, bRole]);
  const leTemplate = exact([leTag, aRole, bRole]);

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

  const posBasePack = definePack(groundDictionary, posLClaim, []);
  const posStepPack = definePack(dDictionary, posNextTemplate, [posTemplate]);
  const succZeroPack = definePack(groundDictionary, succZeroClaim, []);
  const succPositivePack = definePack(dDictionary, succPositiveTemplate, [posTemplate]);
  const addBasePack = definePack(aDictionary, addBaseTemplate, []);
  const addStepPack = definePack(
    addStepDictionary,
    addNextTemplate,
    [addPremiseTemplate, succBTemplate, succCTemplate],
  );
  const lePack = definePack(leDictionary, leTemplate, [lePremiseTemplate]);

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

  const validFinalBindings: readonly Binding[] = [
    [aRole, L],
    [bRole, L],
    [cRole, l2],
    [b1Role, l2],
    [c1Role, l3],
  ];

  const proof = (
    finalClaim = addTargetClaim,
    finalBindings: readonly Binding[] = validFinalBindings,
  ) => {
    const posL = makeNode(posBasePack, [], posLClaim, []);
    const posL2 = makeNode(posStepPack, [[dRole, L]], posL2Claim, [posL.occurrence]);
    const succZero = makeNode(succZeroPack, [], succZeroClaim, []);
    const succL = makeNode(succPositivePack, [[dRole, L]], succLClaim, [posL.occurrence]);
    const succL2 = makeNode(succPositivePack, [[dRole, l2]], succL2Claim, [posL2.occurrence]);
    const addBase = makeNode(addBasePack, [[aRole, L]], addBaseClaim, []);
    const addL1 = makeNode(
      addStepPack,
      [[aRole, L], [bRole, U], [cRole, L], [b1Role, L], [c1Role, l2]],
      addL1Claim,
      [addBase.occurrence, succZero.occurrence, succL.occurrence],
    );
    const addTarget = makeNode(
      addStepPack,
      finalBindings,
      finalClaim,
      [addL1.occurrence, succL.occurrence, succL2.occurrence],
    );
    const evidence: StructuralDerivationEvidence = {
      theory,
      targetOccurrence: addTarget.occurrence,
      nodes: [addTarget.node, succL2.node, posL.node, addBase.node, succZero.node, addL1.node, posL2.node, succL.node],
    };
    return { posL, posL2, succZero, succL, succL2, addBase, addL1, addTarget, evidence };
  };

  const zeroSuccessorEvidence = (claim: LinkHandle): StructuralDerivationEvidence => {
    const node = makeNode(succZeroPack, [], claim, []);
    return { theory, targetOccurrence: node.occurrence, nodes: [node.node] };
  };

  const leFrom = (addOccurrence: LinkHandle) =>
    makeNode(
      lePack,
      [[aRole, L], [bRole, l3], [cRole, l2]],
      leClaim,
      [addOccurrence],
    );

  return {
    memory,
    theory,
    L,
    U,
    l2,
    l3,
    uniformZeroPair,
    rawAddPair,
    addTargetClaim,
    forgedAddClaim,
    forgedZeroSuccClaim,
    wrongBindingClaim,
    validFinalBindings,
    aRole,
    bRole,
    cRole,
    b1Role,
    c1Role,
    leClaim,
    proof,
    zeroSuccessorEvidence,
    leFrom,
  };
}

// #586 boundaries are structural: zero uses the special U->L relation and
// derived addition is not the raw binary Link constructor.
{
  const fx = fixture();
  assert(fx.uniformZeroPair !== fx.L, "PAIR(U,L) must not be the zero successor L");
  assert(fx.rawAddPair !== fx.l3, "Add(L,L²)=L³ must not collapse to PAIR(L,L²)");

  const proof = fx.proof();
  const before = fx.memory.linkCount;
  const result = replayStructuralDerivation(fx.memory, proof.evidence);
  same(result.target.judgment.claim, fx.addTargetClaim, "Add(L,L²)=L³ target");
  same(result.occurrenceCount, 8, "Pos/S0/Add recursive proof closure");
  same(fx.memory.linkCount, before, "addition replay must be read-only");

  const reordered = replayStructuralDerivation(fx.memory, {
    ...proof.evidence,
    nodes: [proof.succZero.node, proof.addL1.node, proof.posL2.node, proof.addTarget.node, proof.posL.node, proof.succL.node, proof.addBase.node, proof.succL2.node],
  });
  same(reordered.target.judgment.claim, fx.addTargetClaim, "host node order is non-semantic");
  same(fx.memory.linkCount, before, "reordered addition replay must be read-only");
}

// The Add theorem remains proof-carrying and can witness the derived order relation.
{
  const fx = fixture();
  const proof = fx.proof();
  const theorem = defineStructuralTheorem(fx.memory, fx.addTargetClaim, fx.theory);
  const beforeTheorem = fx.memory.linkCount;
  const checked = replayStructuralTheorem(fx.memory, { theorem, proof: proof.evidence });
  same(checked.identity.claim, fx.addTargetClaim, "addition theorem claim");
  same(checked.proof.occurrenceCount, 8, "addition theorem carries full proof");
  same(fx.memory.linkCount, beforeTheorem, "addition theorem replay must be read-only");

  const le = fx.leFrom(proof.addTarget.occurrence);
  const beforeReuse = fx.memory.linkCount;
  const reused = replayStructuralDerivationWithTheorems(fx.memory, {
    derivation: { theory: fx.theory, targetOccurrence: le.occurrence, nodes: [le.node] },
    theorems: [{ theorem, proof: proof.evidence }],
  });
  same(reused.derivation.target.judgment.claim, fx.leClaim, "Le(L,L³) target");
  same(reused.derivation.occurrenceCount, 9, "order lemma expands the arithmetic proof");
  same(fx.memory.linkCount, beforeReuse, "arithmetic theorem reuse must be read-only");
}

// Uniform x->PAIR(x,L) at zero and raw-PAIR addition both fail closed.
{
  const fx = fixture();
  expectDerivationReject(
    () => replayStructuralDerivation(fx.memory, fx.zeroSuccessorEvidence(fx.forgedZeroSuccClaim)),
    "uniform zero successor",
  );
  expectDerivationReject(
    () => replayStructuralDerivation(fx.memory, fx.proof(fx.forgedAddClaim).evidence),
    "raw PAIR as forged addition",
  );
}

// Missing dependencies, wrong degree binding, foreign theory and host rule name grant no authority.
{
  const fx = fixture();
  const valid = fx.proof();
  expectDerivationReject(
    () => replayStructuralDerivation(fx.memory, {
      ...valid.evidence,
      nodes: valid.evidence.nodes.filter((node) => node.occurrence !== valid.addL1.occurrence),
    }),
    "missing recursive Add premise",
  );
  expectDerivationReject(
    () => replayStructuralDerivation(fx.memory, {
      ...valid.evidence,
      nodes: valid.evidence.nodes.filter((node) => node.occurrence !== valid.succL2.occurrence),
    }),
    "missing successor premise",
  );

  const wrongBindings: readonly Binding[] = [
    [fx.aRole, fx.L],
    [fx.bRole, fx.L],
    [fx.cRole, fx.l2],
    [fx.b1Role, fx.l3],
    [fx.c1Role, fx.l3],
  ];
  expectDerivationReject(
    () => replayStructuralDerivation(fx.memory, fx.proof(fx.wrongBindingClaim, wrongBindings).evidence),
    "wrong successor binding",
  );
  expectDerivationReject(
    () => replayStructuralDerivation(fx.memory, { ...valid.evidence, theory: new Memory().root }),
    "foreign theory",
  );

  const forged = fx.proof(fx.forgedAddClaim);
  const hostNamedAdd = {
    ...forged.addTarget.node,
    judgment: {
      ...forged.addTarget.node.judgment,
      application: { ...forged.addTarget.node.judgment.application, ruleKind: "add" },
    },
  };
  expectDerivationReject(
    () => replayStructuralDerivation(fx.memory, {
      ...forged.evidence,
      nodes: forged.evidence.nodes.map((node) =>
        node.occurrence === forged.addTarget.occurrence ? hostNamedAdd : node,
      ),
    }),
    "host ruleKind cannot rescue forged addition",
  );
}
