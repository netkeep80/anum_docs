import { materializeExactSequence } from "../src/exact-sequence.js";
import { Memory, type LinkHandle } from "../src/memory.js";
import { ensureRootBasis } from "../src/public.js";
import {
  StructuralRuleError,
  admitStructuralRule,
  defineStructuralRoleDictionary,
  defineStructuralRule,
  matchStructuralTemplate,
  readStructuralRoleDictionary,
  type StructuralRoleBinding,
} from "../src/structural-rule.js";
import { unifyStructuralTemplate } from "../src/structural-unification.js";
import {
  admitStructuralDerivationRule,
  defineStructuralDerivationRule,
} from "../src/derivation.js";
import {
  StructuralDerivedDerivationReplayError,
  replayStructuralDerivedDerivationSchema,
} from "../src/derived-derivation-schema.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}

function expectRuleError(code: string, effect: () => unknown): void {
  try {
    effect();
  } catch (error) {
    assert(error instanceof StructuralRuleError, `${code}: wrong error type`);
    same(error.code, code, `${code}: wrong error code`);
    return;
  }
  throw new Error(`${code}: expected StructuralRuleError`);
}

function expectDerivedError(code: string, effect: () => unknown): void {
  try {
    effect();
  } catch (error) {
    assert(error instanceof StructuralDerivedDerivationReplayError, `${code}: wrong error type`);
    same(error.code, code, `${code}: wrong error code`);
    return;
  }
  throw new Error(`${code}: expected StructuralDerivedDerivationReplayError`);
}

function bindingValue(
  bindings: readonly StructuralRoleBinding[],
  role: LinkHandle,
): LinkHandle {
  const binding = bindings.find((candidate) => candidate.role === role);
  assert(binding !== undefined, "expected structural role binding");
  return binding.value;
}

function main(): void {
  const memory = new Memory();
  const { R, O, C, L, U } = ensureRootBasis(memory);

  // Role identities are deliberately constructed only from basis Links so no
  // role accidentally contains another role in its own topology. Scope tests
  // must measure declared role identity, not incidental fixture ancestry.
  const aRole = memory.ensure(L, R);
  const bRole = memory.ensure(U, R);
  const aShadowRole = memory.ensure(R, L);
  const sourceRole = memory.ensure(R, U);
  assert(aRole !== bRole, "A/B role identity");
  assert(aRole !== aShadowRole, "A/shadow role identity");
  assert(bRole !== aShadowRole, "B/shadow role identity");
  assert(sourceRole !== aRole, "source/A role identity");

  // Grounded witnesses are basis Links whose topology cannot contain the role
  // identities above. This makes groundedness a topology fact, not a host tag.
  const grounded = O;
  const otherGrounded = C;
  const undeclaredMarker = L;

  let cursor = memory.ensure(C, R);
  const fresh = (): LinkHandle => (cursor = memory.ensure(cursor, C));
  const x = fresh();
  const y = fresh();
  const z = fresh();

  const beforeDictionaries = memory.linkCount;
  const outerDictionary = defineStructuralRoleDictionary(memory, [aRole]);
  const afterOuterDefinition = memory.linkCount;
  assert(afterOuterDefinition > beforeDictionaries, "outer dictionary must materialize structural identity");

  const innerDictionary = defineStructuralRoleDictionary(memory, [aRole, bRole]);
  const shadowDictionary = defineStructuralRoleDictionary(memory, [aRole, aShadowRole]);

  assert(outerDictionary !== innerDictionary, "outer and inner dictionaries must have distinct Link identity");
  assert(innerDictionary !== shadowDictionary, "dependent and shadow scopes must have distinct Link identity");

  const beforeRead = memory.linkCount;
  const outer = readStructuralRoleDictionary(memory, outerDictionary);
  const inner = readStructuralRoleDictionary(memory, innerDictionary);
  const shadow = readStructuralRoleDictionary(memory, shadowDictionary);
  same(memory.linkCount, beforeRead, "RoleDictionary readers are read-only");

  same(outer.roles.length, 1, "outer role count");
  same(outer.roles[0], aRole, "outer role identity");
  same(inner.roles.length, 2, "inner role count");
  same(inner.roles[0], aRole, "inner scope retains outer A as exact prefix identity");
  same(inner.roles[1], bRole, "inner scope appends local B identity");
  same(shadow.roles.length, 2, "shadow role count");
  same(shadow.roles[0], aRole, "shadow scope retains outer A identity");
  same(shadow.roles[1], aShadowRole, "shadowed display-name role is a distinct semantic Link");
  assert(aRole !== aShadowRole, "shadowing must never reuse semantic Link identity");

  // A nested/dependent structural occurrence needs no dependent-binder opcode.
  // Its identity is ordinary Link topology over the active role identities.
  const nestedTemplate = memory.ensure(aRole, memory.ensure(bRole, aRole));
  const nestedXY = memory.ensure(x, memory.ensure(y, x));
  const bindingsXY: readonly StructuralRoleBinding[] = Object.freeze([
    Object.freeze({ role: aRole, value: x }),
    Object.freeze({ role: bRole, value: y }),
  ]);
  const beforeNestedMatch = memory.linkCount;
  matchStructuralTemplate(memory, nestedTemplate, nestedXY, bindingsXY);
  same(memory.linkCount, beforeNestedMatch, "nested role matching is read-only");

  const inconsistentRepeatedA = memory.ensure(x, memory.ensure(y, z));
  expectRuleError("template-mismatch", () =>
    matchStructuralTemplate(memory, nestedTemplate, inconsistentRepeatedA, bindingsXY),
  );

  // Distinct generic roles do not imply semantic inequality. Both may bind to X.
  const nestedXX = memory.ensure(x, memory.ensure(x, x));
  const nonInjective: readonly StructuralRoleBinding[] = Object.freeze([
    Object.freeze({ role: aRole, value: x }),
    Object.freeze({ role: bRole, value: x }),
  ]);
  matchStructuralTemplate(memory, nestedTemplate, nestedXX, nonInjective);

  // A genuinely grounded subtree remains exact identity when it is not declared
  // generic in the active binding environment.
  const groundedTemplate = memory.ensure(aRole, grounded);
  const groundedClaim = memory.ensure(x, grounded);
  matchStructuralTemplate(
    memory,
    groundedTemplate,
    groundedClaim,
    Object.freeze([Object.freeze({ role: aRole, value: x })]),
  );
  const changedGroundedClaim = memory.ensure(x, otherGrounded);
  expectRuleError("template-mismatch", () =>
    matchStructuralTemplate(
      memory,
      groundedTemplate,
      changedGroundedClaim,
      Object.freeze([Object.freeze({ role: aRole, value: x })]),
    ),
  );

  // Host convention cannot promote an undeclared Link marker to a role.
  const undeclaredTemplate = memory.ensure(aRole, undeclaredMarker);
  const undeclaredChanged = memory.ensure(x, y);
  expectRuleError("template-mismatch", () =>
    matchStructuralTemplate(
      memory,
      undeclaredTemplate,
      undeclaredChanged,
      Object.freeze([Object.freeze({ role: aRole, value: x })]),
    ),
  );

  // The same semantic Link identity cannot simultaneously mean "generic A"
  // and a grounded constant in one active scope. Once A is declared generic,
  // every exact occurrence of A is substituted by the same rho(A).
  const impossibleDualMeaning = memory.ensure(aRole, aRole);
  const attemptedGenericAndGrounded = memory.ensure(x, aRole);
  expectRuleError("template-mismatch", () =>
    matchStructuralTemplate(
      memory,
      impossibleDualMeaning,
      attemptedGenericAndGrounded,
      Object.freeze([Object.freeze({ role: aRole, value: x })]),
    ),
  );

  // Shadowing is identity, not spelling. Two roles may carry the same host label
  // while the matcher still binds them independently because their Links differ.
  const hostLabels = new Map<LinkHandle, string>([
    [aRole, "A"],
    [aShadowRole, "A"],
  ]);
  same(hostLabels.get(aRole), hostLabels.get(aShadowRole), "fixture uses the same host display label");
  const shadowTemplate = memory.ensure(aRole, aShadowRole);
  const shadowClaim = memory.ensure(x, y);
  matchStructuralTemplate(
    memory,
    shadowTemplate,
    shadowClaim,
    Object.freeze([
      Object.freeze({ role: aRole, value: x }),
      Object.freeze({ role: aShadowRole, value: y }),
    ]),
  );
  expectRuleError("template-mismatch", () =>
    matchStructuralTemplate(
      memory,
      shadowTemplate,
      shadowClaim,
      Object.freeze([
        Object.freeze({ role: aRole, value: x }),
        Object.freeze({ role: aShadowRole, value: x }),
      ]),
    ),
  );

  // An inner-only B is grounded when evaluated under the outer [A] environment;
  // it cannot silently become an outer generic role by host metadata or naming.
  expectRuleError("template-mismatch", () =>
    matchStructuralTemplate(
      memory,
      bRole,
      y,
      Object.freeze([Object.freeze({ role: aRole, value: x })]),
    ),
  );

  // Existing structural unification is already capable of role-to-role
  // projection. The target role Link is just the inferred Link value here; this
  // operation by itself grants no cross-scope proof authority.
  const sourceTemplate = memory.ensure(sourceRole, grounded);
  const roleValuedClaim = memory.ensure(aRole, grounded);
  const beforeUnify = memory.linkCount;
  const inferred = unifyStructuralTemplate(
    memory,
    sourceTemplate,
    roleValuedClaim,
    [sourceRole],
  );
  same(bindingValue(inferred, sourceRole), aRole, "unification can infer source role -> target role Link");
  same(memory.linkCount, beforeUnify, "role-to-role unification is read-only");

  // Reader/matcher authority comes only from exact Link topology and the
  // explicit role set/bindings. No binder/generic/forall/shadow/local host tag
  // participates in any trusted call above.
  const hostMetadata = Object.freeze({
    binder: true,
    generic: true,
    forall: true,
    shadow: true,
    local: true,
  });
  assert(hostMetadata.generic, "host metadata exists only as a non-authoritative test witness");

  // Critical locality probe: the RoleDictionary data can represent an exact
  // prefix extension [A] -> [A,B], but current generic-schema replay deliberately
  // requires one exact shared RoleDictionary. A valid admitted outer schema does
  // not thereby gain authority inside the wider generic scope.
  const theory = memory.ensure(C, U);
  const outerRule = defineStructuralRule(memory, outerDictionary, aRole);
  const outerDerivationRule = defineStructuralDerivationRule(memory, outerRule, [aRole]);
  const outerRuleAdmission = admitStructuralRule(memory, theory, outerRule);
  const outerDerivationAdmission = admitStructuralDerivationRule(
    memory,
    theory,
    outerDerivationRule,
  );

  const innerTargetRule = defineStructuralRule(memory, innerDictionary, aRole);
  const innerTargetDerivationRule = defineStructuralDerivationRule(
    memory,
    innerTargetRule,
    [aRole],
  );
  const identity = memory.ensure(innerTargetDerivationRule, theory);
  const assumptionOccurrence = memory.ensure(aRole, identity);
  const premiseOccurrenceSequence = materializeExactSequence(memory, [assumptionOccurrence]);
  const nodeOccurrence = memory.ensure(outerDerivationRule, premiseOccurrenceSequence);

  const beforeScopeProbe = memory.linkCount;
  expectDerivedError("role-dictionary-mismatch", () =>
    replayStructuralDerivedDerivationSchema(memory, {
      identity,
      targetOccurrence: nodeOccurrence,
      assumptions: Object.freeze([
        Object.freeze({ occurrence: assumptionOccurrence, template: aRole }),
      ]),
      nodes: Object.freeze([
        Object.freeze({
          occurrence: nodeOccurrence,
          derivationRule: outerDerivationRule,
          ruleAdmission: outerRuleAdmission,
          derivationRuleAdmission: outerDerivationAdmission,
          premiseOccurrenceSequence,
        }),
      ]),
    }),
  );
  same(memory.linkCount, beforeScopeProbe, "cross-dictionary rejection remains read-only");

  // N1 classification encoded by the executable corpus above:
  // - nested/dependent role identity and capture are already structural;
  // - exact-prefix dictionaries are representable as MTS data;
  // - trusted cross-scope reuse is intentionally NOT implied by prefix shape.
  // The latter is an N2 composition/authority question, not an N1 binder object.
  assert(inner.roles[0] === outer.roles[0], "N1 exact-prefix identity witness");

  assert(L !== U, "root basis sanity");
}

main();
