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
  const { R, O, C, L, U } = ensureRootBasis(memory);
  let cursor = U;
  const fresh = (): LinkHandle => (cursor = memory.ensure(cursor, R));
  const exact = (values: readonly LinkHandle[]) => materializeExactSequence(memory, values);

  // Grounded contextual relation vocabulary is materialized before generic roles.
  const relationKind = fresh();
  const unaryKind = fresh();
  const binaryKind = fresh();
  const posName = fresh();
  const succName = fresh();
  const plusName = fresh();
  const leName = fresh();

  const unaryRelationContext = memory.ensure(relationKind, unaryKind);
  const binaryRelationContext = memory.ensure(relationKind, binaryKind);
  const posContext = memory.ensure(unaryRelationContext, posName);
  const succContext = memory.ensure(unaryRelationContext, succName);
  const plusContext = memory.ensure(binaryRelationContext, plusName);
  const leContext = memory.ensure(binaryRelationContext, leName);

  const pos = (d: LinkHandle): LinkHandle => memory.ensure(posContext, d);
  const succ = (d: LinkHandle, d1: LinkHandle): LinkHandle =>
    memory.ensure(memory.ensure(succContext, d), d1);
  const add = (a: LinkHandle, b: LinkHandle, c: LinkHandle): LinkHandle =>
    memory.ensure(memory.ensure(memory.ensure(plusContext, a), b), c);
  const le = (a: LinkHandle, b: LinkHandle): LinkHandle =>
    memory.ensure(memory.ensure(leContext, a), b);

  const dictionary = fresh();
  const grammar = fresh();
  const theory = fresh();

  // Roles are independent basis-only Links so no role identity accidentally
  // contains another role as topology.
  const dRole = memory.ensure(O, O);
  const aRole = memory.ensure(O, U);
  const bRole = memory.ensure(C, C);
  const cRole = memory.ensure(C, U);
  const b1Role = memory.ensure(U, O);
  const c1Role = memory.ensure(U, C);

  const roleSet = new Set([dRole, aRole, bRole, cRole, b1Role, c1Role]);
  same(roleSet.size, 6, "generic arithmetic roles must be distinct Link identities");

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

  // Concrete arithmetic claims are ordinary contextual Links.
  const posLClaim = pos(L);
  const posL2Claim = pos(l2);
  const succZeroClaim = succ(U, L);
  const succLClaim = succ(L, l2);
  const succL2Claim = succ(l2, l3);
  const forgedZeroSuccClaim = succ(U, uniformZeroPair);
  const addBaseClaim = add(L, U, L);
  const addL1Claim = add(L, L, l2);
  const addTargetClaim = add(L, l2, l3);
  const forgedAddClaim = add(L, l2, rawAddPair);
  const wrongBindingClaim = add(L, l3, l3);
  const leClaim = le(L, l3);

  // Generic rule templates use the same contextual relation topology with Roles.
  const posTemplate = pos(dRole);
  const nextDegreeTemplate = memory.ensure(dRole, L);
  const posNextTemplate = pos(nextDegreeTemplate);
  const succPositiveTemplate = succ(dRole, nextDegreeTemplate);
  const addBaseTemplate = add(aRole, U, aRole);
  const addPremiseTemplate = add(aRole, bRole, cRole);
  const succBTemplate = succ(bRole, b1Role);
  const succCTemplate = succ(cRole, c1Role);
  const addNextTemplate = add(aRole, b1Role, c1Role);
  const lePremiseTemplate = add(aRole, cRole, bRole);
  const leTemplate = le(aRole, bRole);

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
      // ExactSequence remains proof-dependency ordering only, never arithmetic claim authority.
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
      nodes: [
        addTarget.node,
        succL2.node,
        posL.node,
        addBase.node,
        succZero.node,
        addL1.node,
        posL2.node,
        succL.node,
      ],
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
    plusContext,
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

// #586 boundaries remain exact, but the arithmetic claim is now relation-native.
{
  const fx = fixture();
  assert(fx.uniformZeroPair !== fx.L, "PAIR(U,L) must not be the zero successor L");
  assert(fx.rawAddPair !== fx.l3, "Add(L,L²)=L³ must not collapse to PAIR(L,L²)");

  // Recover ((PLUS -> L) -> L²) -> L³ directly through Link poles.
  const targetFact = fx.memory.poles(fx.addTargetClaim);
  same(targetFact.end, fx.l3, "contextual Add target retains result L³");
  const secondApplication = fx.memory.poles(targetFact.start);
  same(secondApplication.end, fx.l2, "contextual Add target retains second argument L²");
  const firstApplication = fx.memory.poles(secondApplication.start);
  same(firstApplication.start, fx.plusContext, "contextual Add target retains PLUS context");
  same(firstApplication.end, fx.L, "contextual Add target retains first argument L");

  const proof = fx.proof();
  const before = fx.memory.linkCount;
  const result = replayStructuralDerivation(fx.memory, proof.evidence);
  same(result.target.judgment.claim, fx.addTargetClaim, "contextual Add(L,L²)=L³ target");
  same(result.occurrenceCount, 8, "contextual Pos/S0/Add recursive proof closure");
  same(fx.memory.linkCount, before, "contextual addition replay must be read-only");

  const reordered = replayStructuralDerivation(fx.memory, {
    ...proof.evidence,
    nodes: [
      proof.succZero.node,
      proof.addL1.node,
      proof.posL2.node,
      proof.addTarget.node,
      proof.posL.node,
      proof.succL.node,
      proof.addBase.node,
      proof.succL2.node,
    ],
  });
  same(reordered.target.judgment.claim, fx.addTargetClaim, "host node order is non-semantic");
  same(fx.memory.linkCount, before, "reordered contextual addition replay must be read-only");
}

// The contextual Add theorem remains proof-carrying and can witness contextual Le.
{
  const fx = fixture();
  const proof = fx.proof();
  const theorem = defineStructuralTheorem(fx.memory, fx.addTargetClaim, fx.theory);
  const beforeTheorem = fx.memory.linkCount;
  const checked = replayStructuralTheorem(fx.memory, { theorem, proof: proof.evidence });
  same(checked.identity.claim, fx.addTargetClaim, "contextual addition theorem claim");
  same(checked.proof.occurrenceCount, 8, "contextual addition theorem carries full proof");
  same(fx.memory.linkCount, beforeTheorem, "contextual addition theorem replay must be read-only");

  const le = fx.leFrom(proof.addTarget.occurrence);
  const beforeReuse = fx.memory.linkCount;
  const reused = replayStructuralDerivationWithTheorems(fx.memory, {
    derivation: { theory: fx.theory, targetOccurrence: le.occurrence, nodes: [le.node] },
    theorems: [{ theorem, proof: proof.evidence }],
  });
  same(reused.derivation.target.judgment.claim, fx.leClaim, "contextual Le(L,L³) target");
  same(reused.derivation.occurrenceCount, 9, "contextual order lemma expands arithmetic proof");
  same(fx.memory.linkCount, beforeReuse, "contextual arithmetic theorem reuse must be read-only");
}

// Uniform zero successor and raw-PAIR addition both fail closed.
{
  const fx = fixture();
  expectDerivationReject(
    () => replayStructuralDerivation(fx.memory, fx.zeroSuccessorEvidence(fx.forgedZeroSuccClaim)),
    "uniform zero successor",
  );
  expectDerivationReject(
    () => replayStructuralDerivation(fx.memory, fx.proof(fx.forgedAddClaim).evidence),
    "raw PAIR as forged contextual addition",
  );
}

// Missing dependencies, wrong degree binding, foreign theory and host metadata grant no authority.
{
  const fx = fixture();
  const valid = fx.proof();
  expectDerivationReject(
    () => replayStructuralDerivation(fx.memory, {
      ...valid.evidence,
      nodes: valid.evidence.nodes.filter((node) => node.occurrence !== valid.addL1.occurrence),
    }),
    "missing recursive contextual Add premise",
  );
  expectDerivationReject(
    () => replayStructuralDerivation(fx.memory, {
      ...valid.evidence,
      nodes: valid.evidence.nodes.filter((node) => node.occurrence !== valid.succL2.occurrence),
    }),
    "missing contextual successor premise",
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
    "wrong contextual successor binding",
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
    "host ruleKind cannot rescue forged contextual addition",
  );
}

console.log("contextual Nat addition proof: CONTEXTUAL_RELATION_REPLAY_SURVIVES");
