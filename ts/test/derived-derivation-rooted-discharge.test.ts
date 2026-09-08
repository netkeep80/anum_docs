import { materializeExactSequence } from "../src/exact-sequence.js";
import {
  admitStructuralDerivationRule,
  defineStructuralDerivationRule,
  replayStructuralDerivationWithAssumptions,
} from "../src/derivation.js";
import {
  replayStructuralDerivedDerivationApplication,
} from "../src/derived-derivation-application.js";
import {
  instantiateStructuralDerivedDerivationSchema,
} from "../src/derived-derivation-instantiation.js";
import {
  replayStructuralDerivedDerivationSchema,
  type StructuralDerivedDerivationEvidence,
  type StructuralDerivedDerivationNodeEvidence,
} from "../src/derived-derivation-schema.js";
import {
  materializeStructuralDerivedDerivationRootedDischarge,
} from "../src/derived-derivation-rooted-discharge.js";
import { Memory, ensureRootBasis, type LinkHandle } from "../src/memory.js";
import {
  replayRecursiveLinkIdentityProofAset,
} from "../src/recursive-link-identity-proof.js";
import { replayStructuralRootedProofAset } from "../src/rooted-proof-aset.js";
import { defineContext } from "../src/state.js";
import {
  admitStructuralRule,
  defineStructuralInterpreter,
  defineStructuralRoleDictionary,
  defineStructuralRule,
  type StructuralRoleBinding,
} from "../src/structural-rule.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`rooted discharge: ${message}`);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: values differ`);
}

function identityProof(
  memory: Memory,
  left: LinkHandle,
  right: LinkHandle,
  children: readonly LinkHandle[],
): LinkHandle {
  const claim = memory.ensure(left, right);
  return memory.ensure(claim, materializeExactSequence(memory, children));
}

interface Schema {
  readonly rule: LinkHandle;
  readonly derivationRule: LinkHandle;
}

interface AdmittedSchema extends Schema {
  readonly ruleAdmission: LinkHandle;
  readonly derivationRuleAdmission: LinkHandle;
}

function main(): void {
  const memory = new Memory();
  const { R, O, C, U } = ensureRootBasis(memory);
  let cursor = memory.ensure(U, R);
  const fresh = (): LinkHandle => (cursor = memory.ensure(cursor, R));

  const theory = memory.ensure(U, C);
  const dictionary = fresh();
  const grammar = fresh();
  const interpreter = defineStructuralInterpreter(memory, dictionary, grammar, theory);
  const afterContext = defineContext(memory, R, O);

  const aRole = fresh();
  const bRole = fresh();
  const cRole = fresh();
  const roleDictionary = defineStructuralRoleDictionary(memory, [aRole, bRole, cRole]);

  const defineSchema = (body: LinkHandle, premises: readonly LinkHandle[]): Schema => {
    const rule = defineStructuralRule(memory, roleDictionary, body);
    return Object.freeze({
      rule,
      derivationRule: defineStructuralDerivationRule(memory, rule, premises),
    });
  };

  const admitSchema = (schema: Schema): AdmittedSchema => Object.freeze({
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

  const r1 = admitSchema(defineSchema(bRole, [aRole]));
  const r2 = admitSchema(defineSchema(cRole, [bRole]));
  const target = defineSchema(cRole, [aRole]);
  assert(
    memory.find(theory, target.derivationRule) === undefined,
    "derived target DR remains outside primitive Theory",
  );

  const genericIdentity = memory.ensure(target.derivationRule, theory);
  const genericAssumptionOccurrence = memory.ensure(aRole, genericIdentity);
  const genericNode1 = makeNode(r1, [genericAssumptionOccurrence]);
  const genericNode2 = makeNode(r2, [genericNode1.occurrence]);
  const genericEvidence: StructuralDerivedDerivationEvidence = Object.freeze({
    identity: genericIdentity,
    targetOccurrence: genericNode2.occurrence,
    assumptions: Object.freeze([
      Object.freeze({ occurrence: genericAssumptionOccurrence, template: aRole }),
    ]),
    nodes: Object.freeze([genericNode1, genericNode2]),
  });

  const genericBefore = memory.linkCount;
  const genericReplay = replayStructuralDerivedDerivationSchema(memory, genericEvidence);
  same(genericReplay.theory, theory, "G1 generic Theory");
  same(memory.linkCount, genericBefore, "G1 generic replay read-only");

  const arbitraryStart = memory.ensureStartSelfClosed(C);
  const arbitraryEnd = memory.ensureEndSelfClosed(O);
  const x = memory.ensure(arbitraryStart, arbitraryEnd);
  const assumptionClaim = memory.ensure(x, x);
  const bValue = fresh();
  const cValue = fresh();
  const rho: readonly StructuralRoleBinding[] = Object.freeze([
    Object.freeze({ role: aRole, value: assumptionClaim }),
    Object.freeze({ role: bRole, value: bValue }),
    Object.freeze({ role: cRole, value: cValue }),
  ]);

  const concrete = instantiateStructuralDerivedDerivationSchema(
    memory,
    genericEvidence,
    interpreter,
    afterContext,
    rho,
  );
  same(concrete.assumptionClaims.length, 1, "G2 one concrete assumption");
  same(concrete.assumptionClaims[0], assumptionClaim, "G2 exact concrete assumption Claim");
  same(concrete.targetClaim, cValue, "G2 target Claim");

  const conditionalBefore = memory.linkCount;
  const conditional = replayStructuralDerivationWithAssumptions(memory, concrete.evidence);
  same(conditional.usedAssumptionOccurrences.length, 1, "G3 one used assumption occurrence");
  same(memory.linkCount, conditionalBefore, "G3 conditional replay read-only");

  const applicationBefore = memory.linkCount;
  const application = replayStructuralDerivedDerivationApplication(
    memory,
    genericEvidence,
    concrete.evidence,
    rho,
  );
  same(application.concrete.derivation.target.judgment.claim, cValue, "G4 application target");
  same(memory.linkCount, applicationBefore, "G4 application replay read-only");

  const rootProof = identityProof(memory, R, R, []);
  const oProof = identityProof(memory, O, O, [rootProof]);
  const cProof = identityProof(memory, C, C, [rootProof]);
  const startProof = identityProof(memory, arbitraryStart, arbitraryStart, [cProof]);
  const endProof = identityProof(memory, arbitraryEnd, arbitraryEnd, [oProof]);
  const xProof = identityProof(memory, x, x, [startProof, endProof]);
  const identityBefore = memory.linkCount;
  const identity = replayRecursiveLinkIdentityProofAset(memory, xProof);
  same(identity.left, x, "G5 identity left");
  same(identity.right, x, "G5 identity right");
  same(memory.poles(xProof).start, assumptionClaim, "G5 exact supplied Claim");
  same(memory.linkCount, identityBefore, "G5 identity replay read-only");

  const openAssumptionOccurrence = conditional.usedAssumptionOccurrences[0];
  assert(openAssumptionOccurrence !== undefined, "used assumption occurrence exists");

  const lowered = materializeStructuralDerivedDerivationRootedDischarge(
    memory,
    concrete.evidence,
    [Object.freeze({
      assumptionOccurrence: openAssumptionOccurrence,
      proofOccurrence: xProof,
    })],
  );

  const closedBefore = memory.linkCount;
  const closed = replayStructuralRootedProofAset(memory, lowered.root);
  same(closed.theory, theory, "closed Theory");
  same(closed.conclusion, cValue, "closed target Claim");
  same(closed.occurrenceCount, 2, "two structural occurrences");
  same(closed.declaredAssumptionCount, 0, "closed proof declares no assumptions");
  same(closed.usedAssumptionCount, 0, "closed proof uses no open assumptions");
  same(memory.linkCount, closedBefore, "closed rooted replay read-only");
  console.log("ROOTED_ASSUMPTION_DISCHARGE = SUPPORTED");
}

main();
