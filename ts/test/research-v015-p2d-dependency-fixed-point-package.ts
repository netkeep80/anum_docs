import { materializeExactSequence } from "../src/exact-sequence.js";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
  type RootBasis,
} from "../src/memory.js";
import {
  admitStructuralRule,
  defineStructuralInterpreter,
  defineStructuralRoleDictionary,
  defineStructuralRule,
} from "../src/structural-rule.js";
import {
  materializeV013HierarchicalCarrierFromSemanticLink,
  serializeV013HierarchicalCarrier,
} from "../src/v013-hierarchical-carrier.js";

function fail(message: string): never {
  throw new Error("research v0.15 P2d dependency package: " + message);
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

const memory = new Memory();
const b = ensureRootBasis(memory);
let cursor = memory.ensure(b.U, b.L);
const fresh = (): LinkHandle => {
  cursor = memory.ensure(cursor, b.O);
  return cursor;
};

// Grounded occurrence identities precede every structural placeholder role.
const occurrence = Object.freeze({
  leaf: fresh(),
  left: fresh(),
  right: fresh(),
  pair: fresh(),
  repeat: fresh(),
  root: fresh(),
  cycleA: fresh(),
  cycleB: fresh(),
});

const executionTheory = memory.ensure(fresh(), fresh());
const FOLD = fresh();
const WAIT = fresh();
const VALID = fresh();
const CERT = fresh();
const grammar = fresh();
const caller = fresh();

// Static fold roles.
const K_FOLD = fresh();
const PREV = fresh();
const DEP = fresh();
const CONT = fresh();

// Generated gate has one runtime placeholder: continuation. Its caller and
// dependency occurrence become grounded constants when the certify meta-rule
// instantiates the generated Rule.
const GATE_CONT = fresh();

// Certify meta-rule placeholders.
const K_META = fresh();
const OCC = fresh();

const authorityDictionary = defineStructuralRoleDictionary(memory, []);
const interpreter = defineStructuralInterpreter(
  memory,
  authorityDictionary,
  grammar,
  executionTheory,
);

function admitAndIndex(
  rule: LinkHandle,
  triggerKey: LinkHandle,
): LinkHandle {
  const admission = admitStructuralRule(memory, executionTheory, rule);
  return memory.ensure(triggerKey, admission);
}

// A non-empty ExactSequence cell is START(Prev->Value).
const cellTemplate = memory.ensureStartSelfClosed(
  memory.ensure(PREV, DEP),
);
const waitTemplate = memory.ensure(
  WAIT,
  memory.ensure(DEP, CONT),
);
const foldNonEmptyBefore = memory.ensure(
  K_FOLD,
  memory.ensure(
    FOLD,
    memory.ensure(cellTemplate, CONT),
  ),
);
const foldNonEmptyAfter = memory.ensure(
  K_FOLD,
  memory.ensure(
    FOLD,
    memory.ensure(PREV, waitTemplate),
  ),
);
const foldNonEmptyRule = defineStructuralRule(
  memory,
  defineStructuralRoleDictionary(
    memory,
    [K_FOLD, PREV, DEP, CONT],
  ),
  memory.ensure(
    foldNonEmptyBefore,
    materializeExactSequence(memory, [foldNonEmptyAfter]),
  ),
);
const foldNonEmptyIndex = admitAndIndex(foldNonEmptyRule, FOLD);

// Empty ExactSequence is exactly R.
const K_EMPTY = fresh();
const EMPTY_CONT = fresh();
const foldEmptyBefore = memory.ensure(
  K_EMPTY,
  memory.ensure(
    FOLD,
    memory.ensure(b.R, EMPTY_CONT),
  ),
);
const foldEmptyAfter = memory.ensure(K_EMPTY, EMPTY_CONT);
const foldEmptyRule = defineStructuralRule(
  memory,
  defineStructuralRoleDictionary(memory, [K_EMPTY, EMPTY_CONT]),
  memory.ensure(
    foldEmptyBefore,
    materializeExactSequence(memory, [foldEmptyAfter]),
  ),
);
const foldEmptyIndex = admitAndIndex(foldEmptyRule, FOLD);

// Gate Rule template generated for each positive VALID(Occurrence):
//
//   caller -> WAIT(Occurrence, Next)  ->  caller -> Next
//
// Only Next remains a placeholder in the generated Rule.
const gateDictionary = defineStructuralRoleDictionary(
  memory,
  [GATE_CONT],
);
const generatedGateBefore = memory.ensure(
  K_META,
  memory.ensure(
    WAIT,
    memory.ensure(OCC, GATE_CONT),
  ),
);
const generatedGateAfter = memory.ensure(K_META, GATE_CONT);
const generatedGateRuleTemplate = defineStructuralRule(
  memory,
  gateDictionary,
  memory.ensure(
    generatedGateBefore,
    materializeExactSequence(memory, [generatedGateAfter]),
  ),
);
const generatedGateAdmissionTemplate = memory.ensure(
  executionTheory,
  generatedGateRuleTemplate,
);
const generatedGateIndexTemplate = memory.ensure(
  WAIT,
  generatedGateAdmissionTemplate,
);
const certificateTemplate = memory.ensure(
  K_META,
  memory.ensure(CERT, OCC),
);

// Positive validity publishes a certificate and the ordinary generated
// admission/index as direct successor current members. Frozen 0.175.0 performs
// complete discovery over the old Scope before this publication phase, so the
// generated Gate cannot fire in the same generation.
const certifyBefore = memory.ensure(
  K_META,
  memory.ensure(VALID, OCC),
);
const certifyRule = defineStructuralRule(
  memory,
  defineStructuralRoleDictionary(memory, [K_META, OCC]),
  memory.ensure(
    certifyBefore,
    materializeExactSequence(memory, [
      certificateTemplate,
      generatedGateAdmissionTemplate,
      generatedGateIndexTemplate,
    ]),
  ),
);
const certifyIndex = admitAndIndex(certifyRule, VALID);

const deps = Object.freeze({
  leaf: materializeExactSequence(memory, []),
  left: materializeExactSequence(memory, [occurrence.leaf]),
  right: materializeExactSequence(memory, [occurrence.leaf]),
  pair: materializeExactSequence(memory, [
    occurrence.left,
    occurrence.right,
  ]),
  repeat: materializeExactSequence(memory, [
    occurrence.leaf,
    occurrence.leaf,
  ]),
  root: materializeExactSequence(memory, [
    occurrence.pair,
    occurrence.repeat,
  ]),
  cycleA: materializeExactSequence(memory, [occurrence.cycleB]),
  cycleB: materializeExactSequence(memory, [occurrence.cycleA]),
});

const initialFor = (
  sequence: LinkHandle,
  target: LinkHandle,
): LinkHandle =>
  memory.ensure(
    caller,
    memory.ensure(
      FOLD,
      memory.ensure(
        sequence,
        memory.ensure(VALID, target),
      ),
    ),
  );

const entries = [
  initialFor(deps.leaf, occurrence.leaf),
  initialFor(deps.left, occurrence.left),
  initialFor(deps.right, occurrence.right),
  initialFor(deps.pair, occurrence.pair),
  initialFor(deps.repeat, occurrence.repeat),
  initialFor(deps.root, occurrence.root),
  initialFor(deps.cycleA, occurrence.cycleA),
  initialFor(deps.cycleB, occurrence.cycleB),
];

const certFor = (target: LinkHandle): LinkHandle =>
  memory.ensure(caller, memory.ensure(CERT, target));

const expectedCerts = [
  certFor(occurrence.leaf),
  certFor(occurrence.left),
  certFor(occurrence.right),
  certFor(occurrence.pair),
  certFor(occurrence.repeat),
  certFor(occurrence.root),
];
const absentCerts = [
  certFor(occurrence.cycleA),
  certFor(occurrence.cycleB),
];

const packageValue = Object.freeze({
  schema: "mts-v015-p2d-dependency-fixed-point-package/v0.1",
  links: Object.freeze([
    foldNonEmptyIndex,
    foldEmptyIndex,
    certifyIndex,
  ].map((link) => wire(memory, b, link))),
  interpreter: wire(memory, b, interpreter),
  initial: wire(
    memory,
    b,
    materializeExactSequence(memory, entries),
  ),
  reversedInitial: wire(
    memory,
    b,
    materializeExactSequence(memory, [...entries].reverse()),
  ),
  expectedCerts: wire(
    memory,
    b,
    materializeExactSequence(memory, expectedCerts),
  ),
  absentCerts: wire(
    memory,
    b,
    materializeExactSequence(memory, absentCerts),
  ),
});

process.stdout.write(JSON.stringify(packageValue));
