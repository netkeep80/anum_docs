import { materializeExactSequence } from "../src/exact-sequence.js";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
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
  if (!value) throw new Error("v0.15 aprover P1r membership projection determinism: " + message);
}
function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), message + ": " + String(actual) + " !== " + String(expected));
}

function wire(
  memory: Memory,
  root: LinkHandle,
  link: LinkHandle,
): string {
  const basis = ensureRootBasis(memory);
  same(basis.R, root, "root identity");
  const carrier = materializeV013HierarchicalCarrierFromSemanticLink(
    memory,
    basis,
    link,
  );
  return new TextDecoder().decode(
    serializeV013HierarchicalCarrier(memory, basis, carrier),
  );
}

interface Projection {
  readonly sourceAdmissionWires: readonly string[];
  readonly runtimeRuleWires: readonly string[];
}

function build(noise: number, reverse: boolean): Projection {
  const memory = new Memory();
  const b = ensureRootBasis(memory);

  let cursor = memory.ensure(b.O, b.U);
  for (let i = 0; i < noise; i += 1) {
    cursor = memory.ensure(cursor, i % 2 === 0 ? b.C : b.O);
  }
  const fresh = (): LinkHandle => {
    cursor = memory.ensure(cursor, b.C);
    return cursor;
  };

  const objectTheory = memory.ensure(b.L, b.C);
  const executionTheory = memory.ensure(b.C, b.L);
  const MEMBER = fresh();

  const rules = [fresh(), fresh(), fresh()];
  const admissions = rules.map((rule) => memory.ensure(objectTheory, rule));
  const selected = reverse ? [...admissions].reverse() : admissions;

  const emptyDictionary = defineStructuralRoleDictionary(memory, []);

  const application = (theory: LinkHandle, rule: LinkHandle): LinkHandle =>
    memory.ensure(memory.ensure(MEMBER, theory), rule);
  const state = (
    theory: LinkHandle,
    rule: LinkHandle,
    value: LinkHandle,
  ): LinkHandle =>
    memory.ensure(application(theory, rule), value);

  const projectedRules: LinkHandle[] = [];
  for (const sourceAdmission of selected) {
    const poles = memory.poles(sourceAdmission);
    same(poles.start, objectTheory, "selected projection source Theory");
    const rule = poles.end;

    const before = state(objectTheory, rule, b.U);
    const after = state(objectTheory, rule, b.L);
    const relation = defineStructuralRule(
      memory,
      emptyDictionary,
      memory.ensure(
        before,
        materializeExactSequence(memory, [after]),
      ),
    );
    admitStructuralRule(memory, executionTheory, relation);
    projectedRules.push(relation);
  }

  return Object.freeze({
    sourceAdmissionWires: Object.freeze(
      admissions.map((x) => wire(memory, b.R, x)).sort(),
    ),
    runtimeRuleWires: Object.freeze(
      projectedRules.map((x) => wire(memory, b.R, x)).sort(),
    ),
  });
}

const baseline = build(0, false);
const reordered = build(0, true);
const noisy = build(17, true);

same(
  JSON.stringify(reordered.sourceAdmissionWires),
  JSON.stringify(baseline.sourceAdmissionWires),
  "source admission set is order independent",
);
same(
  JSON.stringify(reordered.runtimeRuleWires),
  JSON.stringify(baseline.runtimeRuleWires),
  "runtime membership projection is order independent",
);
same(
  JSON.stringify(noisy.sourceAdmissionWires),
  JSON.stringify(baseline.sourceAdmissionWires),
  "source admission wires are fresh-Memory deterministic",
);
same(
  JSON.stringify(noisy.runtimeRuleWires),
  JSON.stringify(baseline.runtimeRuleWires),
  "runtime membership relation wires are fresh-Memory deterministic",
);

same(
  baseline.runtimeRuleWires.length,
  baseline.sourceAdmissionWires.length,
  "one runtime membership relation per selected admission",
);
same(
  new Set(baseline.runtimeRuleWires).size,
  baseline.runtimeRuleWires.length,
  "projection introduces no duplicate runtime relations",
);

console.log([
  "MTS_V015_APROVER_P1R_MEMBERSHIP_PROJECTION=GREEN_RESEARCH",
  "PROJECTION_CARDINALITY=ONE_TO_ONE",
  "SOURCE_ORDER_SEMANTIC=FALSE",
  "PROJECTION_ORDER_SEMANTIC=FALSE",
  "FRESH_MEMORY_STRUCTURAL_DETERMINISM=TRUE",
  "PROOF_INPUT_DEPENDENCY=0",
  "THEOREM_ID_DEPENDENCY=0",
  "REFERENCED_RULE_SELECTION_DEPENDENCY=0",
  "OBJECT_THEORY_MUTATION=0",
  "CLASSIFICATION=DERIVED_RUNTIME_GROUNDING_OR_INDEX_CANDIDATE",
].join(" "));
