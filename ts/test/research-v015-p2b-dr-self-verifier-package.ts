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
import { defineStructuralDerivationRule } from "../src/derivation.js";
import {
  materializeV013HierarchicalCarrierFromSemanticLink,
  serializeV013HierarchicalCarrier,
} from "../src/v013-hierarchical-carrier.js";

function fail(message: string): never {
  throw new Error("research v0.15 P2b DR self-verifier package: " + message);
}
function same<T>(actual: T, expected: T, message: string): void {
  if (!Object.is(actual, expected)) {
    fail(message + ": " + String(actual) + " !== " + String(expected));
  }
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

interface CaseSpec {
  readonly label: string;
  readonly premiseTemplates: (
    memory: Memory,
    X: LinkHandle,
    Y: LinkHandle,
  ) => readonly LinkHandle[];
  readonly actualPremises: (
    memory: Memory,
    A: LinkHandle,
    B: LinkHandle,
  ) => readonly LinkHandle[];
}

const memory = new Memory();
const b = ensureRootBasis(memory);
let cursor = memory.ensure(b.O, b.U);
const fresh = (): LinkHandle => {
  cursor = memory.ensure(cursor, b.C);
  return cursor;
};

const executionTheory = memory.ensure(b.C, b.L);
const ADMISSIONS_OK = fresh();
const MAKE_VERIFIER = fresh();
const PACKET_ENTRY = fresh();
const CHECK_APPLICATION = fresh();
const READY = fresh();
const SUBST_OK = fresh();
const grammar = fresh();

// One generic meta-program for every DR arity.
const D_ROLE = fresh();
const BODY_ROLE = fresh();
const PREMISES_ROLE = fresh();
const PACKET_ROLE = fresh();
const metaDictionary = defineStructuralRoleDictionary(
  memory,
  [D_ROLE, BODY_ROLE, PREMISES_ROLE, PACKET_ROLE],
);

const drTemplate = memory.ensure(
  memory.ensure(D_ROLE, BODY_ROLE),
  PREMISES_ROLE,
);
const metaAntecedent = memory.ensure(
  ADMISSIONS_OK,
  memory.ensure(
    MAKE_VERIFIER,
    memory.ensure(drTemplate, PACKET_ROLE),
  ),
);

const constraintTemplate = memory.ensure(BODY_ROLE, PREMISES_ROLE);
const verifierAntecedentTemplate = memory.ensure(
  PACKET_ENTRY,
  memory.ensure(CHECK_APPLICATION, constraintTemplate),
);
const successImage = materializeExactSequence(memory, [SUBST_OK]);
const verifierBodyTemplate = memory.ensure(
  verifierAntecedentTemplate,
  successImage,
);
const generatedVerifierTemplate = memory.ensure(
  D_ROLE,
  verifierBodyTemplate,
);
const generatedAdmissionTemplate = memory.ensure(
  executionTheory,
  generatedVerifierTemplate,
);
const generatedIndexTemplate = memory.ensure(
  CHECK_APPLICATION,
  generatedAdmissionTemplate,
);

// The frozen one-current-member harness requires one result per launch.
// Therefore generation 1 returns one aggregate READY Link. Materializing that
// aggregate recursively still materializes the generated admission/index Links
// in the frozen 0.175.0 store. This is backend-compatibility evidence only;
// normative v0.15 Aset membership/publication is tested by P2a.
const generatedReadyTemplate = memory.ensure(
  READY,
  memory.ensure(
    generatedAdmissionTemplate,
    memory.ensure(generatedIndexTemplate, PACKET_ROLE),
  ),
);

const metaRule = defineStructuralRule(
  memory,
  metaDictionary,
  memory.ensure(
    metaAntecedent,
    materializeExactSequence(memory, [generatedReadyTemplate]),
  ),
);
const metaAdmission = admitStructuralRule(
  memory,
  executionTheory,
  metaRule,
);
const metaIndex = memory.ensure(MAKE_VERIFIER, metaAdmission);

const interpreter = defineStructuralInterpreter(
  memory,
  metaDictionary,
  grammar,
  executionTheory,
);

const packageLinks: LinkHandle[] = [metaIndex];
const launches: LinkHandle[] = [];

function launch(
  current: LinkHandle,
  expected: LinkHandle,
): LinkHandle {
  return materializeExactSequence(
    memory,
    [interpreter, current, expected],
  );
}

function addCase(spec: CaseSpec): void {
  const X = fresh();
  const Y = fresh();
  const sourceDictionary = defineStructuralRoleDictionary(memory, [X, Y]);
  const bodyTemplate = memory.ensure(X, Y);
  const premises = spec.premiseTemplates(memory, X, Y);
  const premiseTemplateSequence = materializeExactSequence(memory, premises);
  const sourceRule = defineStructuralRule(
    memory,
    sourceDictionary,
    bodyTemplate,
  );
  const sourceDR = defineStructuralDerivationRule(
    memory,
    sourceRule,
    premises,
  );

  const A = fresh();
  const B = fresh();
  const actualClaim = memory.ensure(A, B);
  const actualPremises = spec.actualPremises(memory, A, B);
  same(
    actualPremises.length,
    premises.length,
    spec.label + " arity",
  );
  const dependencyClaimSequence =
    materializeExactSequence(memory, actualPremises);
  const positivePacket = memory.ensure(
    PACKET_ENTRY,
    memory.ensure(
      CHECK_APPLICATION,
      memory.ensure(actualClaim, dependencyClaimSequence),
    ),
  );

  const request = memory.ensure(
    ADMISSIONS_OK,
    memory.ensure(
      MAKE_VERIFIER,
      memory.ensure(sourceDR, positivePacket),
    ),
  );

  const generatedConstraint =
    memory.ensure(bodyTemplate, premiseTemplateSequence);
  const generatedAntecedent = memory.ensure(
    PACKET_ENTRY,
    memory.ensure(CHECK_APPLICATION, generatedConstraint),
  );
  const generatedBody = memory.ensure(
    generatedAntecedent,
    successImage,
  );
  const generatedRule = memory.ensure(sourceDictionary, generatedBody);
  const generatedAdmission =
    memory.ensure(executionTheory, generatedRule);
  const generatedIndex =
    memory.ensure(CHECK_APPLICATION, generatedAdmission);
  const expectedReady = memory.ensure(
    READY,
    memory.ensure(
      generatedAdmission,
      memory.ensure(generatedIndex, positivePacket),
    ),
  );

  // Generation 1 dynamically materializes the verifier topology.
  launches.push(launch(request, expectedReady));

  // Next launch sees the newly materialized verifier in the same frozen store.
  launches.push(launch(positivePacket, SUBST_OK));

  // Generic negative: wrong Claim structural aspect while keeping dependency
  // carrier unchanged. Body=X->Y cannot structurally match ROOT.
  const badPacket = memory.ensure(
    PACKET_ENTRY,
    memory.ensure(
      CHECK_APPLICATION,
      memory.ensure(memory.root, dependencyClaimSequence),
    ),
  );
  launches.push(launch(badPacket, badPacket));
}

const specs = Object.freeze([
  {
    label: "arity0",
    premiseTemplates: () => [],
    actualPremises: () => [],
  },
  {
    label: "arity1",
    premiseTemplates: (m: Memory, X: LinkHandle, Y: LinkHandle) => [
      m.ensure(Y, X),
    ],
    actualPremises: (m: Memory, A: LinkHandle, B: LinkHandle) => [
      m.ensure(B, A),
    ],
  },
  {
    label: "arity2",
    premiseTemplates: (m: Memory, X: LinkHandle, Y: LinkHandle) => [
      X,
      m.ensure(Y, X),
    ],
    actualPremises: (m: Memory, A: LinkHandle, B: LinkHandle) => [
      A,
      m.ensure(B, A),
    ],
  },
  {
    label: "arity3",
    premiseTemplates: (m: Memory, X: LinkHandle, Y: LinkHandle) => [
      X,
      Y,
      m.ensure(X, Y),
    ],
    actualPremises: (m: Memory, A: LinkHandle, B: LinkHandle) => [
      A,
      B,
      m.ensure(A, B),
    ],
  },
] satisfies readonly CaseSpec[]);

for (const spec of specs) addCase(spec);

const entry = materializeExactSequence(memory, launches);
const packageValue = Object.freeze({
  schema: "mts-v015-recursive-execution-package/v0.1",
  links: Object.freeze(
    packageLinks.map((link) => wire(memory, b, link)),
  ),
  entry: wire(memory, b, entry),
});

process.stdout.write(JSON.stringify(packageValue));
