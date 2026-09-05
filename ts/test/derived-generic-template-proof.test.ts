import { materializeExactSequence } from "../src/exact-sequence.js";
import { Memory, ensureRootBasis, type LinkHandle, type ReadMemory } from "../src/public.js";
import {
  admitStructuralRule,
  defineStructuralRoleDictionary,
  defineStructuralRule,
} from "../src/structural-rule.js";
import {
  admitStructuralDerivationRule,
  defineStructuralDerivationRule,
} from "../src/derivation.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

interface GenericAssumptionEvidence {
  readonly occurrence: LinkHandle;
  readonly template: LinkHandle;
}

interface GenericTemplateNodeEvidence {
  readonly occurrence: LinkHandle;
  readonly derivationRule: LinkHandle;
  readonly ruleAdmission: LinkHandle;
  readonly derivationRuleAdmission: LinkHandle;
  readonly premiseOccurrenceSequence: LinkHandle;
}

interface GenericTemplateDerivationEvidence {
  readonly identity: LinkHandle;
  readonly targetOccurrence: LinkHandle;
  readonly assumptions: readonly GenericAssumptionEvidence[];
  readonly nodes: readonly GenericTemplateNodeEvidence[];
}

interface GenericTemplateReplayResult {
  readonly theory: LinkHandle;
  readonly derivationRule: LinkHandle;
  readonly conclusionTemplate: LinkHandle;
}

function replayGenericTemplateDerivation(
  _memory: ReadMemory,
  _evidence: GenericTemplateDerivationEvidence,
): GenericTemplateReplayResult {
  throw new Error("generic-template-replay-not-implemented");
}

function fixture() {
  const memory = new Memory();
  const { R, L, U } = ensureRootBasis(memory);
  let cursor = memory.ensure(U, R);
  const fresh = (): LinkHandle => (cursor = memory.ensure(cursor, R));

  const theory = memory.ensure(L, U);
  const aRole = fresh();
  const bRole = fresh();
  const cRole = fresh();
  const roleDictionary = defineStructuralRoleDictionary(memory, [aRole, bRole, cRole]);

  const defineSchema = (body: LinkHandle, premises: readonly LinkHandle[]) => {
    const rule = defineStructuralRule(memory, roleDictionary, body);
    const derivationRule = defineStructuralDerivationRule(memory, rule, premises);
    return { rule, derivationRule };
  };

  const r1 = defineSchema(bRole, [aRole]);
  const r2 = defineSchema(cRole, [bRole]);
  const r3 = defineSchema(cRole, [aRole]);

  const r1Pack = {
    ...r1,
    ruleAdmission: admitStructuralRule(memory, theory, r1.rule),
    derivationRuleAdmission: admitStructuralDerivationRule(memory, theory, r1.derivationRule),
  };
  const r2Pack = {
    ...r2,
    ruleAdmission: admitStructuralRule(memory, theory, r2.rule),
    derivationRuleAdmission: admitStructuralDerivationRule(memory, theory, r2.derivationRule),
  };

  // Proof-carrying identity deliberately points DR -> Theory, never Theory -> DR.
  const identity = memory.ensure(r3.derivationRule, theory);

  // Generic assumption and nodes are ordinary Link identities. No Act, Context,
  // concrete role value, or symbolic concrete eigen-Link exists in this proof.
  const assumptionOccurrence = memory.ensure(aRole, identity);
  const node1Premises = materializeExactSequence(memory, [assumptionOccurrence]);
  const node1Occurrence = memory.ensure(r1.derivationRule, node1Premises);
  const node2Premises = materializeExactSequence(memory, [node1Occurrence]);
  const node2Occurrence = memory.ensure(r2.derivationRule, node2Premises);

  const evidence: GenericTemplateDerivationEvidence = {
    identity,
    targetOccurrence: node2Occurrence,
    assumptions: [{ occurrence: assumptionOccurrence, template: aRole }],
    nodes: [
      {
        occurrence: node1Occurrence,
        derivationRule: r1.derivationRule,
        ruleAdmission: r1Pack.ruleAdmission,
        derivationRuleAdmission: r1Pack.derivationRuleAdmission,
        premiseOccurrenceSequence: node1Premises,
      },
      {
        occurrence: node2Occurrence,
        derivationRule: r2.derivationRule,
        ruleAdmission: r2Pack.ruleAdmission,
        derivationRuleAdmission: r2Pack.derivationRuleAdmission,
        premiseOccurrenceSequence: node2Premises,
      },
    ],
  };

  return { memory, theory, cRole, r3, evidence };
}

function main(): void {
  const fx = fixture();
  const before = fx.memory.linkCount;
  const result = replayGenericTemplateDerivation(fx.memory, fx.evidence);
  assert(result.theory === fx.theory, "template proof must remain under exact T0");
  assert(result.derivationRule === fx.r3.derivationRule, "template proof must certify DR3");
  assert(result.conclusionTemplate === fx.cRole, "template proof must derive C");
  assert(fx.memory.linkCount === before, "template replay must be read-only");
}

main();
