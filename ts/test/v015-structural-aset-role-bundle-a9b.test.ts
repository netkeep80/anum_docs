import {
  materializeExactSequence,
  readExactSequence,
} from "../src/exact-sequence.js";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
  type ReadMemory,
} from "../src/memory.js";
import { StructuralRuleError } from "../src/structural-rule.js";
import { unifyStructuralRuleTemplate } from "../src/structural-unification.js";
import { instantiateV013StructuralTemplate } from "../src/v013-structural-execution.js";

// Integration split provenance: native role-bundle / grounded-refinement / A72r subset of GREEN #1989 A9; core Gamma execution is a separate clean-main gate.

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.15 A9 role bundle: ${message}`);
}
function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: values differ`);
}
function setSame<T>(actual: readonly T[], expected: readonly T[], message: string): void {
  assert(actual.length === expected.length, `${message}: cardinality`);
  const rest = new Set(expected);
  for (const value of actual) assert(rest.delete(value), `${message}: unexpected member`);
  assert(rest.size === 0, `${message}: missing member`);
}
interface AsetState {
  readonly members: ReadonlySet<LinkHandle>;
}
function aset(members: Iterable<LinkHandle>): AsetState {
  return Object.freeze({ members: new Set(members) });
}

interface NativeRoleBundleRuleSnapshot {
  readonly admission: LinkHandle;
  readonly rule: LinkHandle;
  readonly roleBundle: LinkHandle;
  readonly roles: readonly LinkHandle[];
  readonly antecedentTemplate: LinkHandle;
  readonly outputTemplates: readonly LinkHandle[];
}

/**
 * A9 follow-up candidate: remove the dedicated RoleDictionary wrapper.
 *
 * Candidate semantic topology:
 *
 *   V                  = role-bundle anchor
 *   every role member  = V -> name_i, and the MEMBER LINK itself is the role
 *   Body               = AntecedentTemplate -> ExactSequence(OutputTemplates)
 *   Rule               = V -> Body
 *   Admission          = Theory -> Rule
 *
 * Only V->... Links that belong to the semantic Aset M_t are roles. Merely
 * existing physically in Memory is insufficient. The Rule Link itself need not
 * be an M_t member; its Theory->Rule admission is the authority.
 *
 * This is research evidence only. It does not select the final FORMAL/JSON
 * spelling and does not redefine accepted StructuralRule.
 */
function nativeRoleBundleRuleSnapshots(
  memory: ReadMemory,
  state: AsetState,
  theory: LinkHandle,
): readonly NativeRoleBundleRuleSnapshot[] {
  const result: NativeRoleBundleRuleSnapshot[] = [];

  for (const admission of state.members) {
    const ap = memory.poles(admission);
    if (ap.start !== theory || ap.end === admission) continue;

    const rule = ap.end;
    const rp = memory.poles(rule);
    const roleBundle = rp.start;
    const body = memory.poles(rp.end);
    const outputTemplates = readExactSequence(memory, body.end).values;

    const roles: LinkHandle[] = [];
    for (const member of state.members) {
      const mp = memory.poles(member);
      if (mp.start === roleBundle) roles.push(member);
    }

    result.push(Object.freeze({
      admission,
      rule,
      roleBundle,
      roles: Object.freeze(roles),
      antecedentTemplate: body.start,
      outputTemplates,
    }));
  }

  return Object.freeze(result);
}

function nativeRoleBundleCandidateExperiment(): void {
  const memory = new Memory();
  const b = ensureRootBasis(memory);

  let cursor = memory.ensure(b.U, b.L);
  const fresh = (): LinkHandle => {
    cursor = memory.ensure(cursor, b.C);
    return cursor;
  };

  const theory = fresh();
  const roleBundle = fresh();
  const xName = fresh();
  const yName = fresh();

  // Contextual role identities are ordinary Links. Their membership in the
  // role bundle is positive Aset data; the endpoint/name is not itself the role.
  const xRole = memory.ensure(roleBundle, xName);
  const yRole = memory.ensure(roleBundle, yName);

  const tag = fresh();
  const A = fresh();
  const B = fresh();

  //   tag -> (X -> Y)  ==>  (Y -> X)
  const antecedent = memory.ensure(
    tag,
    memory.ensure(xRole, yRole),
  );
  const outputTemplate = memory.ensure(yRole, xRole);
  const image = materializeExactSequence(memory, [outputTemplate]);
  const body = memory.ensure(antecedent, image);
  const rule = memory.ensure(roleBundle, body);
  const admission = memory.ensure(theory, rule);

  // Physical outgoing Link from V, deliberately NOT in M_t. It must not become
  // a role merely because the carrier happens to contain it.
  const ambientName = fresh();
  const ambientPhysical = memory.ensure(roleBundle, ambientName);

  const forwardState = aset([
    admission,
    xRole,
    yRole,
  ]);
  const reverseState = aset([
    admission,
    yRole,
    xRole,
  ]);

  const readOne = (state: AsetState): NativeRoleBundleRuleSnapshot => {
    const snapshots = nativeRoleBundleRuleSnapshots(memory, state, theory);
    same(snapshots.length, 1, "native role-bundle candidate: one admitted rule");
    return snapshots[0]!;
  };

  const forward = readOne(forwardState);
  const reverse = readOne(reverseState);

  setSame(
    forward.roles,
    [xRole, yRole],
    "native role-bundle candidate: exact extensional role membership",
  );
  setSame(
    reverse.roles,
    [xRole, yRole],
    "native role-bundle candidate: role order is nonsemantic",
  );
  assert(
    !forward.roles.includes(ambientPhysical),
    "native role-bundle candidate: ambient physical outgoing Link is not a role",
  );

  const actual = memory.ensure(tag, memory.ensure(A, B));
  const expected = memory.ensure(B, A);

  for (const [label, candidate] of [
    ["forward", forward],
    ["reverse", reverse],
  ] as const) {
    const bindings = unifyStructuralRuleTemplate(
      memory,
      candidate.antecedentTemplate,
      actual,
      candidate.roles,
    );
    same(bindings.length, 2, label + ": two structural bindings");

    const outputs = candidate.outputTemplates.map((template) =>
      instantiateV013StructuralTemplate(memory, template, bindings)
    );
    same(outputs.length, 1, label + ": one instantiated output");
    same(outputs[0], expected, label + ": role order does not change output");
  }

  // Grounded exact relation is the zero-role special case of the same topology.
  const groundedRoleBundle = fresh();
  const groundedAntecedent = fresh();
  const groundedOutput = fresh();
  const groundedBody = memory.ensure(
    groundedAntecedent,
    materializeExactSequence(memory, [groundedOutput]),
  );
  const groundedRule = memory.ensure(groundedRoleBundle, groundedBody);
  const groundedAdmission = memory.ensure(theory, groundedRule);
  const groundedState = aset([groundedAdmission]);

  const groundedSnapshots = nativeRoleBundleRuleSnapshots(
    memory,
    groundedState,
    theory,
  );
  same(groundedSnapshots.length, 1, "grounded native role-bundle rule discovered");
  const grounded = groundedSnapshots[0]!;
  same(grounded.roles.length, 0, "empty role bundle means exact grounded rule");

  const exactBindings = unifyStructuralRuleTemplate(
    memory,
    grounded.antecedentTemplate,
    groundedAntecedent,
    grounded.roles,
  );
  same(exactBindings.length, 0, "grounded rule needs no bindings");
  const exactOutput = instantiateV013StructuralTemplate(
    memory,
    grounded.outputTemplates[0]!,
    exactBindings,
  );
  same(exactOutput, groundedOutput, "grounded rule is the zero-role refinement");

  let mismatch = false;
  try {
    unifyStructuralRuleTemplate(
      memory,
      grounded.antecedentTemplate,
      fresh(),
      grounded.roles,
    );
  } catch (error) {
    mismatch = error instanceof StructuralRuleError &&
      error.code === "template-mismatch";
  }
  assert(mismatch, "zero-role grounded rule remains exact identity matching");

  // A72r-like recursive pressure: three contextual roles in one nested
  // positive-arity pattern. This is not the full historical A72r runtime;
  // it checks that the native role-bundle candidate carries the same generic
  // structural matching/instantiation power without an ordered RoleDictionary.
  const variadicRoleBundle = fresh();
  const kRole = memory.ensure(variadicRoleBundle, fresh());
  const headRole = memory.ensure(variadicRoleBundle, fresh());
  const restRole = memory.ensure(variadicRoleBundle, fresh());

  const ALL = fresh();
  const TRUE = fresh();

  const templateTail = memory.ensure(headRole, restRole);
  const templateArgs = memory.ensure(TRUE, templateTail);
  const templateApplication = memory.ensure(ALL, templateArgs);
  const templateBefore = memory.ensureStartSelfClosed(
    memory.ensure(kRole, templateApplication),
  );
  const templateResumed = memory.ensure(ALL, templateTail);
  const templateAfter = memory.ensureStartSelfClosed(
    memory.ensure(kRole, templateResumed),
  );
  const variadicBody = memory.ensure(
    templateBefore,
    materializeExactSequence(memory, [templateAfter]),
  );
  const variadicRule = memory.ensure(variadicRoleBundle, variadicBody);
  const variadicAdmission = memory.ensure(theory, variadicRule);

  const variadicState = aset([
    variadicAdmission,
    kRole,
    headRole,
    restRole,
  ]);
  const variadicSnapshots = nativeRoleBundleRuleSnapshots(
    memory,
    variadicState,
    theory,
  );
  same(
    variadicSnapshots.length,
    1,
    "native role-bundle candidate: A72r-like one admitted rule",
  );
  const variadic = variadicSnapshots[0]!;
  setSame(
    variadic.roles,
    [kRole, headRole, restRole],
    "native role-bundle candidate: A72r-like three-role bundle",
  );

  const actualK = fresh();
  const actualHead = fresh();
  const actualRest = fresh();
  const actualTail = memory.ensure(actualHead, actualRest);
  const actualArgs = memory.ensure(TRUE, actualTail);
  const actualApplication = memory.ensure(ALL, actualArgs);
  const actualBefore = memory.ensureStartSelfClosed(
    memory.ensure(actualK, actualApplication),
  );
  const expectedResumed = memory.ensure(ALL, actualTail);
  const expectedAfter = memory.ensureStartSelfClosed(
    memory.ensure(actualK, expectedResumed),
  );

  const variadicBindings = unifyStructuralRuleTemplate(
    memory,
    variadic.antecedentTemplate,
    actualBefore,
    variadic.roles,
  );
  same(
    variadicBindings.length,
    3,
    "native role-bundle candidate: A72r-like three bindings",
  );
  const variadicOutput = instantiateV013StructuralTemplate(
    memory,
    variadic.outputTemplates[0]!,
    variadicBindings,
  );
  same(
    variadicOutput,
    expectedAfter,
    "native role-bundle candidate: A72r-like recursive output",
  );
}

nativeRoleBundleCandidateExperiment();
console.log([
  "MTS_V015_A9_ROLE_BUNDLE=GREEN",
  "NATIVE_ROLE_BUNDLE_RULE=GREEN",
  "NATIVE_ROLE_BUNDLE_ARCHITECTURE=AUTHOR_APPROVED_GAMMA_KERNEL_PROOF_GREEN",
  "DEDICATED_ROLE_DICTIONARY_NECESSITY=FALSIFIED_FOR_TESTED_VECTOR",
  "ROLE_ORDER_SEMANTIC=FALSE",
  "AMBIENT_OUTGOING_LINK_IS_ROLE=FALSE",
  "GROUNDED_RULE=EMPTY_ROLE_BUNDLE_REFINEMENT",
  "NATIVE_ROLE_BUNDLE_A72R_SHAPE=GREEN",
  "CROSS_MEMBER_JOIN=0",
].join(" "));