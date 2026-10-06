import { materializeExactSequence } from "../src/exact-sequence.js";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
  type RootBasis,
} from "../src/memory.js";
import {
  admitStructuralRule,
  defineStructuralRoleDictionary,
  defineStructuralRule,
} from "../src/structural-rule.js";
import {
  materializeV013HierarchicalCarrierFromSemanticLink,
  serializeV013HierarchicalCarrier,
} from "../src/v013-hierarchical-carrier.js";

function assert(value: unknown, message: string): asserts value {
  if (!value) {
    throw new Error("v0.15 P1z execution Theory composition projection: " + message);
  }
}
function same<T>(actual: T, expected: T, message: string): void {
  assert(
    Object.is(actual, expected),
    message + ": " + String(actual) + " !== " + String(expected),
  );
}

function wire(
  memory: Memory,
  basis: RootBasis,
  link: LinkHandle,
): string {
  const carrier = materializeV013HierarchicalCarrierFromSemanticLink(
    memory,
    basis,
    link,
  );
  return new TextDecoder().decode(
    serializeV013HierarchicalCarrier(memory, basis, carrier),
  );
}

interface BuildResult {
  readonly staticSourceAdmissions: readonly string[];
  readonly objectSourceAdmissions: readonly string[];
  readonly derivedAdmissions: readonly string[];
  readonly derivedIndexes: readonly string[];
  readonly ambientObjectAdmission: string;
}

function build(
  allocationNoise: number,
  reverseSources: boolean,
  candidateNoise: number,
): BuildResult {
  const memory = new Memory();
  const b = ensureRootBasis(memory);

  let noise = memory.ensure(b.O, b.U);
  for (let i = 0; i < allocationNoise; i += 1) {
    noise = memory.ensure(
      memory.ensure(noise, i % 2 === 0 ? b.C : b.L),
      i % 3 === 0 ? b.O : b.U,
    );
  }

  const named = (depth: number): LinkHandle => {
    let value = memory.ensure(b.U, b.L);
    for (let i = 0; i < depth; i += 1) {
      value = memory.ensure(value, i % 2 === 0 ? b.C : b.O);
    }
    return value;
  };

  const objectTheory = named(1);
  const staticAproverTheory = named(2);
  const executionTheory = named(3);
  const MEMBER = named(4);

  const empty = defineStructuralRoleDictionary(memory, []);

  const pingA = named(5);
  const pongA = named(6);
  const pingB = named(7);
  const pongB = named(8);

  const staticRuleA = defineStructuralRule(
    memory,
    empty,
    memory.ensure(pingA, materializeExactSequence(memory, [pongA])),
  );
  const staticRuleB = defineStructuralRule(
    memory,
    empty,
    memory.ensure(pingB, materializeExactSequence(memory, [pongB])),
  );
  const staticAdmissionA = admitStructuralRule(
    memory,
    staticAproverTheory,
    staticRuleA,
  );
  const staticAdmissionB = admitStructuralRule(
    memory,
    staticAproverTheory,
    staticRuleB,
  );

  const objectRuleA = named(9);
  const objectRuleB = named(10);
  const objectRuleAmbient = named(11);
  const objectAdmissionA = memory.ensure(objectTheory, objectRuleA);
  const objectAdmissionB = memory.ensure(objectTheory, objectRuleB);

  // Freeze exact source authority BEFORE ambient/candidate additions.
  const pinnedStatic = Object.freeze([
    Object.freeze({ admission: staticAdmissionA, rule: staticRuleA, current: pingA }),
    Object.freeze({ admission: staticAdmissionB, rule: staticRuleB, current: pingB }),
  ]);
  const pinnedObject = Object.freeze([objectAdmissionA, objectAdmissionB]);

  // Safe candidate data may reference authority identities as END values but
  // contributes no outgoing authority Links. It is deliberately irrelevant to
  // package composition.
  let candidate = named(12);
  for (let i = 0; i < candidateNoise; i += 1) {
    candidate = memory.ensure(
      memory.ensure(candidate, named(13 + i)),
      i % 2 === 0 ? objectTheory : staticAproverTheory,
    );
  }

  // Ambient ObjectTheory mutation after pinning must not affect composition.
  const ambientObjectAdmission = memory.ensure(objectTheory, objectRuleAmbient);

  const staticInputs = reverseSources ? [...pinnedStatic].reverse() : [...pinnedStatic];
  const objectInputs = reverseSources ? [...pinnedObject].reverse() : [...pinnedObject];

  const derivedAdmissions: LinkHandle[] = [];
  const derivedIndexes: LinkHandle[] = [];

  // Generic source-program composition: copy already admitted aprover Rules to
  // the derived execution authority. No theorem/candidate identifier is read.
  for (const item of staticInputs) {
    const runtimeAdmission = admitStructuralRule(
      memory,
      executionTheory,
      item.rule,
    );
    const triggerKey = memory.poles(memory.poles(item.current).end).start;
    const index = memory.ensure(triggerKey, runtimeAdmission);
    derivedAdmissions.push(runtimeAdmission);
    derivedIndexes.push(index);
  }

  // Generic characteristic projection of the independently pinned closed
  // ObjectTheory: one exact zero-role U->L Rule per selected admission.
  const application = (rule: LinkHandle): LinkHandle =>
    memory.ensure(memory.ensure(MEMBER, objectTheory), rule);
  const state = (rule: LinkHandle, result: LinkHandle): LinkHandle =>
    memory.ensure(application(rule), result);

  for (const sourceAdmission of objectInputs) {
    const poles = memory.poles(sourceAdmission);
    same(poles.start, objectTheory, "pinned ObjectTheory admission start");
    const rule = poles.end;
    const before = state(rule, b.U);
    const after = state(rule, b.L);
    const membershipRule = defineStructuralRule(
      memory,
      empty,
      memory.ensure(
        before,
        materializeExactSequence(memory, [after]),
      ),
    );
    const runtimeAdmission = admitStructuralRule(
      memory,
      executionTheory,
      membershipRule,
    );
    const triggerKey = memory.poles(memory.poles(before).end).start;
    const index = memory.ensure(triggerKey, runtimeAdmission);
    derivedAdmissions.push(runtimeAdmission);
    derivedIndexes.push(index);
  }

  same(
    derivedAdmissions.length,
    pinnedStatic.length + pinnedObject.length,
    "derived admission cardinality is exact source sum",
  );

  // The post-freeze ambient ObjectTheory admission is intentionally not part of
  // the pinned source and therefore must not acquire a characteristic Rule.
  assert(
    !objectInputs.includes(ambientObjectAdmission),
    "ambient ObjectTheory admission excluded from pinned composition source",
  );

  return Object.freeze({
    staticSourceAdmissions: Object.freeze(
      pinnedStatic.map((x) => wire(memory, b, x.admission)).sort(),
    ),
    objectSourceAdmissions: Object.freeze(
      pinnedObject.map((x) => wire(memory, b, x)).sort(),
    ),
    derivedAdmissions: Object.freeze(
      derivedAdmissions.map((x) => wire(memory, b, x)).sort(),
    ),
    derivedIndexes: Object.freeze(
      derivedIndexes.map((x) => wire(memory, b, x)).sort(),
    ),
    ambientObjectAdmission: wire(memory, b, ambientObjectAdmission),
  });
}

const baseline = build(0, false, 0);
const reversed = build(0, true, 0);
const noisy = build(19, true, 7);

for (const [label, actual] of [
  ["reversed", reversed],
  ["noisy", noisy],
] as const) {
  same(
    JSON.stringify(actual.staticSourceAdmissions),
    JSON.stringify(baseline.staticSourceAdmissions),
    label + ": static AproverTheory source is stable",
  );
  same(
    JSON.stringify(actual.objectSourceAdmissions),
    JSON.stringify(baseline.objectSourceAdmissions),
    label + ": ObjectTheory source is stable",
  );
  same(
    JSON.stringify(actual.derivedAdmissions),
    JSON.stringify(baseline.derivedAdmissions),
    label + ": derived ExecutionTheory admissions are deterministic",
  );
  same(
    JSON.stringify(actual.derivedIndexes),
    JSON.stringify(baseline.derivedIndexes),
    label + ": derived trigger indexes are deterministic",
  );
  same(
    actual.ambientObjectAdmission,
    baseline.ambientObjectAdmission,
    label + ": ambient post-pin admission identity is stable",
  );
}

same(
  new Set(baseline.derivedAdmissions).size,
  baseline.derivedAdmissions.length,
  "derived ExecutionTheory has no duplicate admissions",
);
same(
  new Set(baseline.derivedIndexes).size,
  baseline.derivedIndexes.length,
  "derived trigger index set has no duplicates",
);

console.log([
  "MTS_V015_P1Z_EXECUTION_THEORY_COMPOSITION=GREEN_RESEARCH",
  "INPUT_STATIC_APROVER_THEORY=PINNED",
  "INPUT_OBJECT_THEORY=PINNED_CLOSED",
  "OUTPUT_EXECUTION_THEORY=DERIVED",
  "OUTPUT_CARDINALITY=STATIC_RULES_PLUS_SELECTED_MEMBERSHIP_RELATIONS",
  "SOURCE_ORDER_SEMANTIC=FALSE",
  "ALLOCATION_HANDLE_ORDER_SEMANTIC=FALSE",
  "SAFE_CANDIDATE_DATA_DEPENDENCY=0",
  "POST_PIN_OBJECTTHEORY_MUTATION_DEPENDENCY=0",
  "THEOREM_ID_DEPENDENCY=0",
  "REFERENCED_RULE_SELECTION_DEPENDENCY=0",
  "COMPOSITION_CLASS=GENERIC_PACKAGE_METACOMPILATION",
  "PROOF_VALIDITY_DECISION_IN_HOST=0",
  "FROZEN_AMEMORY_CHANGE_REQUIRED=FALSE",
].join(" "));
