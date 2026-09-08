import { materializeExactSequence, readExactSequence } from "../src/exact-sequence.js";
import {
  StructuralDerivationReplayError,
  type StructuralDerivationReplayErrorCode,
  admitStructuralDerivationRule,
  defineStructuralDerivationRule,
  replayStructuralDerivation,
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
import { Memory, type LinkHandle } from "../src/memory.js";
import { ensureRootBasis } from "../src/public.js";
import {
  replayRecursiveLinkIdentityProofAset,
} from "../src/recursive-link-identity-proof.js";
import { defineContext } from "../src/state.js";
import {
  admitStructuralRule,
  defineStructuralInterpreter,
  defineStructuralRoleDictionary,
  defineStructuralRule,
  type StructuralRoleBinding,
} from "../src/structural-rule.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`identity proof discharge falsifier: ${message}`);
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
  const childSequence = materializeExactSequence(memory, children);
  return memory.ensure(claim, childSequence);
}

interface Schema {
  readonly rule: LinkHandle;
  readonly derivationRule: LinkHandle;
}

interface AdmittedSchema extends Schema {
  readonly ruleAdmission: LinkHandle;
  readonly derivationRuleAdmission: LinkHandle;
}

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
  "derived target DR must remain outside primitive Theory",
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

// G1: accepted generic certificate remains independently replay-valid.
const genericBefore = memory.linkCount;
const genericReplay = replayStructuralDerivedDerivationSchema(memory, genericEvidence);
same(genericReplay.theory, theory, "G1 generic Theory");
same(memory.linkCount, genericBefore, "G1 generic replay read-only");

// Build an arbitrary finite ROOT-grounded complete relation X, unrelated to Nat/Succ/T4.
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

// G2: ordinary rho instantiation creates the expected open assumption claim.
const concrete = instantiateStructuralDerivedDerivationSchema(
  memory,
  genericEvidence,
  interpreter,
  afterContext,
  rho,
);
same(concrete.assumptionClaims.length, 1, "G2 one concrete assumption");
same(concrete.assumptionClaims[0], assumptionClaim, "G2 exact concrete assumption claim");
same(concrete.targetClaim, cValue, "G2 concrete target claim");

// G3: the instantiated proof is valid while the assumption remains explicitly open.
const conditionalBefore = memory.linkCount;
const conditionalReplay = replayStructuralDerivationWithAssumptions(memory, concrete.evidence);
same(conditionalReplay.derivation.target.judgment.claim, cValue, "G3 conditional target");
same(conditionalReplay.usedAssumptionOccurrences.length, 1, "G3 exact open assumption used");
same(memory.linkCount, conditionalBefore, "G3 conditional replay read-only");

// G4: existing generic/application binding is independently valid as well.
const applicationBefore = memory.linkCount;
const applicationReplay = replayStructuralDerivedDerivationApplication(
  memory,
  genericEvidence,
  concrete.evidence,
  rho,
);
same(applicationReplay.concrete.derivation.target.judgment.claim, cValue, "G4 application target");
same(memory.linkCount, applicationBefore, "G4 application replay read-only");

// G5: construct the complete recursive identity proof Anet for exactly X=X.
const rootProof = identityProof(memory, R, R, []);
const oProof = identityProof(memory, O, O, [rootProof]);
const cProof = identityProof(memory, C, C, [rootProof]);
const arbitraryStartProof = identityProof(memory, arbitraryStart, arbitraryStart, [cProof]);
const arbitraryEndProof = identityProof(memory, arbitraryEnd, arbitraryEnd, [oProof]);
const xProof = identityProof(memory, x, x, [arbitraryStartProof, arbitraryEndProof]);

const identityBefore = memory.linkCount;
const identityReplay = replayRecursiveLinkIdentityProofAset(memory, xProof);
same(identityReplay.left, x, "G5 identity left");
same(identityReplay.right, x, "G5 identity right");
same(memory.poles(xProof).start, assumptionClaim, "G5 proof root carries exact assumption claim");
same(memory.linkCount, identityBefore, "G5 identity replay read-only");

const openAssumptionOccurrence = memory.find(
  concrete.evidence.assumptionContext,
  assumptionClaim,
);
assert(openAssumptionOccurrence !== undefined, "concrete open assumption occurrence exists");

// Closure candidate: preserve every concrete node and replace only the exact
// open-assumption dependency reference by the independently valid proof Anet root.
let replacementCount = 0;
const closedNodes = concrete.evidence.derivation.nodes.map((node) => {
  const dependencies = readExactSequence(memory, node.premiseOccurrenceSequence).values;
  const closedDependencies = dependencies.map((dependency) => {
    if (dependency !== openAssumptionOccurrence) return dependency;
    replacementCount += 1;
    return xProof;
  });
  if (closedDependencies.every((dependency, index) => dependency === dependencies[index])) {
    return node;
  }
  return Object.freeze({
    ...node,
    premiseOccurrenceSequence: materializeExactSequence(memory, closedDependencies),
  });
});
same(replacementCount, 1, "closure replaces exactly one open dependency");
for (const node of closedNodes) {
  const dependencies = readExactSequence(memory, node.premiseOccurrenceSequence).values;
  assert(
    !dependencies.includes(openAssumptionOccurrence),
    "closed candidate contains no open assumption dependency",
  );
}
assert(
  memory.find(theory, target.derivationRule) === undefined,
  "closure candidate must not self-admit derived DR",
);

let reject: StructuralDerivationReplayErrorCode | undefined;
const closedReplayBefore = memory.linkCount;
try {
  replayStructuralDerivation(memory, {
    theory,
    targetOccurrence: concrete.evidence.derivation.targetOccurrence,
    nodes: closedNodes,
  });
} catch (error) {
  assert(error instanceof StructuralDerivationReplayError, "stable closed replay error type");
  reject = error.code;
}
same(memory.linkCount, closedReplayBefore, "closed replay attempt read-only");

if (reject === undefined) {
  console.log("PROOF_ANET_ASSUMPTION_DISCHARGE_ALREADY_EXPRESSIBLE");
} else {
  throw new Error(`GAP(PROOF_ANET_ASSUMPTION_DISCHARGE:${reject})`);
}
