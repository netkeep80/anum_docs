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
  const { R, U } = ensureRootBasis(memory);
  let cursor = U;
  const fresh = (): LinkHandle => (cursor = memory.ensure(cursor, R));
  const exact = (values: readonly LinkHandle[]) => materializeExactSequence(memory, values);

  const dictionary = fresh();
  const grammar = fresh();
  const theory = fresh();
  const funDefTag = fresh();
  const mapInTag = fresh();
  const composeTag = fresh();
  const hasImageTag = fresh();

  const f = fresh();
  const g = fresh();
  const a = fresh();
  const y = fresh();
  const z = fresh();
  const wrongY = fresh();
  const wrongZ = fresh();
  const foreignF = fresh();
  const h = memory.ensure(g, f);

  const fRole = fresh();
  const gRole = fresh();
  const hRole = fresh();
  const aRole = fresh();
  const yRole = fresh();
  const zRole = fresh();
  const domainDictionary = defineStructuralRoleDictionary(
    memory,
    [fRole, gRole, hRole, aRole, yRole, zRole],
  );

  const expectedInterpreter: StructuralInterpreter = { dictionary, grammar, theory };
  const interpreter = defineStructuralInterpreter(memory, dictionary, grammar, theory);

  const argsA = exact([a]);
  const argsY = exact([y]);
  const argsWrongY = exact([wrongY]);
  const mapF = exact([argsA, y]);
  const mapG = exact([argsY, z]);
  const mapGWrongY = exact([argsWrongY, z]);
  const mapH = exact([argsA, z]);
  const mapHWrongZ = exact([argsA, wrongZ]);
  const domainF = exact([argsA]);
  const domainG = exact([argsY]);
  const domainGWrongY = exact([argsWrongY]);
  const mapsF = exact([mapF]);
  const mapsG = exact([mapG]);
  const mapsGWrongY = exact([mapGWrongY]);

  const defF = exact([funDefTag, theory, f, domainF, mapsF]);
  const defG = exact([funDefTag, theory, g, domainG, mapsG]);
  const defGWrongY = exact([funDefTag, theory, g, domainGWrongY, mapsGWrongY]);
  const defForeignF = exact([funDefTag, theory, foreignF, domainF, mapsF]);
  const composition = exact([composeTag, h, g, f]);
  const fMapClaim = exact([mapInTag, f, mapF]);
  const gMapClaim = exact([mapInTag, g, mapG]);
  const hMapClaim = exact([mapInTag, h, mapH]);
  const forgedHMapClaim = exact([mapInTag, h, mapHWrongZ]);
  const hasImageClaim = exact([hasImageTag, h, argsA]);

  const argsATemplate = exact([aRole]);
  const argsYTemplate = exact([yRole]);
  const mapFTemplate = exact([argsATemplate, yRole]);
  const mapGTemplate = exact([argsYTemplate, zRole]);
  const mapHTemplate = exact([argsATemplate, zRole]);
  const domainFTemplate = exact([argsATemplate]);
  const domainGTemplate = exact([argsYTemplate]);
  const mapsFTemplate = exact([mapFTemplate]);
  const mapsGTemplate = exact([mapGTemplate]);
  const defFTemplate = exact([funDefTag, theory, fRole, domainFTemplate, mapsFTemplate]);
  const defGTemplate = exact([funDefTag, theory, gRole, domainGTemplate, mapsGTemplate]);
  const compositionTemplate = exact([composeTag, hRole, gRole, fRole]);
  const fMapClaimTemplate = exact([mapInTag, fRole, mapFTemplate]);
  const gMapClaimTemplate = exact([mapInTag, gRole, mapGTemplate]);
  const hMapClaimTemplate = exact([mapInTag, hRole, mapHTemplate]);

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

  const defFPack = definePack(domainDictionary, defFTemplate, []);
  const defGPack = definePack(domainDictionary, defGTemplate, []);
  const compositionPack = definePack(domainDictionary, compositionTemplate, []);
  const projectFPack = definePack(domainDictionary, fMapClaimTemplate, [defFTemplate]);
  const projectGPack = definePack(domainDictionary, gMapClaimTemplate, [defGTemplate]);
  const composePack = definePack(
    domainDictionary,
    hMapClaimTemplate,
    [compositionTemplate, fMapClaimTemplate, gMapClaimTemplate],
  );

  const bindings: readonly Binding[] = [
    [fRole, f],
    [gRole, g],
    [hRole, h],
    [aRole, a],
    [yRole, y],
    [zRole, z],
  ];

  const makeNode = (
    pack: RulePack,
    selectedBindings: readonly Binding[],
    claim: LinkHandle,
    premiseOccurrences: readonly LinkHandle[],
  ) => {
    const context = defineContext(memory, fresh(), fresh());
    const act = defineActHeader(memory, interpreter, pack.dictionary, context);
    selectedBindings.forEach(([role, value]) => defineActField(memory, act, role, value));
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

  const proofFromDefinitions = (
    selectedDefF = defF,
    selectedDefG = defG,
    selectedHMapClaim = hMapClaim,
  ) => {
    const rootF = makeNode(defFPack, bindings, selectedDefF, []);
    const rootG = makeNode(defGPack, bindings, selectedDefG, []);
    const rootComposition = makeNode(compositionPack, bindings, composition, []);
    const projectedF = makeNode(projectFPack, bindings, fMapClaim, [rootF.occurrence]);
    const projectedG = makeNode(projectGPack, bindings, gMapClaim, [rootG.occurrence]);
    const composed = makeNode(
      composePack,
      bindings,
      selectedHMapClaim,
      [rootComposition.occurrence, projectedF.occurrence, projectedG.occurrence],
    );
    const evidence: StructuralDerivationEvidence = {
      theory,
      targetOccurrence: composed.occurrence,
      nodes: [composed.node, projectedG.node, rootF.node, rootComposition.node, projectedF.node, rootG.node],
    };
    return { rootF, rootG, rootComposition, projectedF, projectedG, composed, evidence };
  };

  const hasImageDictionary = defineStructuralRoleDictionary(memory, [hRole, aRole]);
  const hasImageTemplate = exact([hasImageTag, hRole, argsATemplate]);
  const hasImagePack = definePack(hasImageDictionary, hasImageTemplate, [hMapClaimTemplate]);
  const hasImageFrom = (mappingOccurrence: LinkHandle) =>
    makeNode(hasImagePack, [[hRole, h], [aRole, a]], hasImageClaim, [mappingOccurrence]);

  return {
    memory,
    theory,
    hMapClaim,
    forgedHMapClaim,
    hasImageClaim,
    defGWrongY,
    defForeignF,
    proofFromDefinitions,
    hasImageFrom,
  };
}

// Closed finite function data derives one composed extension mapping through a
// genuinely branching proof. nodes[] order is transport only; replay is read-only.
{
  const fx = fixture();
  const proof = fx.proofFromDefinitions();
  const before = fx.memory.linkCount;
  const result = replayStructuralDerivation(fx.memory, proof.evidence);
  same(result.target.judgment.claim, fx.hMapClaim, "composed mapping target");
  same(result.occurrenceCount, 6, "three roots + two projections + composition");
  same(fx.memory.linkCount, before, "composition replay must be read-only");

  const reordered = replayStructuralDerivation(fx.memory, {
    ...proof.evidence,
    nodes: [proof.rootG.node, proof.projectedF.node, proof.composed.node, proof.rootF.node, proof.projectedG.node, proof.rootComposition.node],
  });
  same(reordered.target.judgment.claim, fx.hMapClaim, "host order is non-semantic");
  same(fx.memory.linkCount, before, "reordered replay must be read-only");
}

// The composed mapping is proof-carrying theorem data and can be expanded as a lemma.
{
  const fx = fixture();
  const proof = fx.proofFromDefinitions();
  const theorem = defineStructuralTheorem(fx.memory, fx.hMapClaim, fx.theory);
  const beforeTheorem = fx.memory.linkCount;
  const checked = replayStructuralTheorem(fx.memory, { theorem, proof: proof.evidence });
  same(checked.identity.claim, fx.hMapClaim, "composition theorem claim");
  same(checked.proof.occurrenceCount, 6, "composition theorem carries full proof");
  same(fx.memory.linkCount, beforeTheorem, "theorem replay must be read-only");

  const hasImage = fx.hasImageFrom(proof.composed.occurrence);
  const beforeReuse = fx.memory.linkCount;
  const reused = replayStructuralDerivationWithTheorems(fx.memory, {
    derivation: {
      theory: fx.theory,
      targetOccurrence: hasImage.occurrence,
      nodes: [hasImage.node],
    },
    theorems: [{ theorem, proof: proof.evidence }],
  });
  same(reused.derivation.target.judgment.claim, fx.hasImageClaim, "HasImage lemma target");
  same(reused.derivation.occurrenceCount, 7, "lemma reuse expands the composition proof closure");
  same(fx.memory.linkCount, beforeReuse, "theorem reuse must be read-only");
}

// The extensional join fails closed when source data or target mapping is forged.
{
  const fx = fixture();
  expectDerivationReject(
    () => replayStructuralDerivation(fx.memory, fx.proofFromDefinitions(undefined, fx.defGWrongY).evidence),
    "wrong intermediate Y",
  );
  expectDerivationReject(
    () => replayStructuralDerivation(fx.memory, fx.proofFromDefinitions(undefined, undefined, fx.forgedHMapClaim).evidence),
    "wrong final Z",
  );
  expectDerivationReject(
    () => replayStructuralDerivation(fx.memory, fx.proofFromDefinitions(fx.defForeignF).evidence),
    "wrong closed function role",
  );
}

// Missing mapping dependencies, foreign theory and a host rule name grant no authority.
{
  const fx = fixture();
  const valid = fx.proofFromDefinitions();
  expectDerivationReject(
    () => replayStructuralDerivation(fx.memory, {
      ...valid.evidence,
      nodes: valid.evidence.nodes.filter((node) => node.occurrence !== valid.projectedF.occurrence),
    }),
    "missing F mapping premise",
  );
  expectDerivationReject(
    () => replayStructuralDerivation(fx.memory, {
      ...valid.evidence,
      nodes: valid.evidence.nodes.filter((node) => node.occurrence !== valid.projectedG.occurrence),
    }),
    "missing G mapping premise",
  );
  expectDerivationReject(
    () => replayStructuralDerivation(fx.memory, { ...valid.evidence, theory: new Memory().root }),
    "foreign theory",
  );

  const forged = fx.proofFromDefinitions(undefined, undefined, fx.forgedHMapClaim);
  const hostNamedCompose = {
    ...forged.composed.node,
    judgment: {
      ...forged.composed.node.judgment,
      application: { ...forged.composed.node.judgment.application, ruleKind: "compose" },
    },
  };
  expectDerivationReject(
    () => replayStructuralDerivation(fx.memory, {
      ...forged.evidence,
      nodes: forged.evidence.nodes.map((node) =>
        node.occurrence === forged.composed.occurrence ? hostNamedCompose : node,
      ),
    }),
    "host ruleKind cannot rescue forged composition",
  );
}
