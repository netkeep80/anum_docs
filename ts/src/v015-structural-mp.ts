import {
  materializeExactSequence,
  readExactSequence,
} from "./exact-sequence.js";
import {
  Memory,
  type LinkHandle,
} from "./memory.js";
import {
  admitStructuralRule,
  defineStructuralRule,
  readStructuralRoleDictionary,
  readStructuralRule,
  StructuralRuleError,
  verifyStructuralRuleAdmission,
  type StructuralRoleBinding,
} from "./structural-rule.js";
import {
  unifyStructuralRuleTemplate,
} from "./structural-unification.js";
import {
  instantiateV013StructuralTemplate,
} from "./v013-structural-execution.js";
import {
  defineV013GroundedExecutionScope,
  readV013GroundedExecutionScopeAuthority,
  V013GroundedScopeCursor,
} from "./v013-grounded-execution.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error("v0.15 structural MP: " + message);
}

export interface V015StructuralMpRuleDefinition {
  readonly relation: LinkHandle;
  readonly rule: LinkHandle;
  readonly admission: LinkHandle;
}

export function defineV015StructuralMpRule(
  memory: Memory,
  theory: LinkHandle,
  roleDictionary: LinkHandle,
  antecedentTemplate: LinkHandle,
  outputTemplates: readonly LinkHandle[],
): V015StructuralMpRuleDefinition {
  const outputBundleTemplate =
    materializeExactSequence(memory, outputTemplates);
  const relation = memory.ensure(antecedentTemplate, outputBundleTemplate);
  const rule = defineStructuralRule(memory, roleDictionary, relation);
  const admission = admitStructuralRule(memory, theory, rule);
  return Object.freeze({ relation, rule, admission });
}

export interface V015StructuralMpRuleSnapshot {
  readonly admission: LinkHandle;
  readonly rule: LinkHandle;
  readonly roleDictionary: LinkHandle;
  readonly roles: readonly LinkHandle[];
  readonly antecedentTemplate: LinkHandle;
  readonly outputBundleTemplate: LinkHandle;
}

/**
 * Read the selected Theory once at reaction start.
 *
 * There is deliberately no antecedent-local trigger index. The selected Theory
 * itself is the complete source-rule authority frontier for this candidate.
 */
export function readV015StructuralMpTheorySnapshot(
  memory: Memory,
  theory: LinkHandle,
): readonly V015StructuralMpRuleSnapshot[] {
  const rules: V015StructuralMpRuleSnapshot[] = [];

  for (const admission of memory.outgoing(theory)) {
    if (admission === theory) continue;
    const admissionPoles = memory.poles(admission);
    if (
      admissionPoles.start !== theory ||
      admissionPoles.end === admission
    ) continue;

    try {
      const rule = admissionPoles.end;
      verifyStructuralRuleAdmission(memory, theory, rule, admission);
      const structure = readStructuralRule(memory, rule);
      const dictionary =
        readStructuralRoleDictionary(memory, structure.roleDictionary);
      const relation = memory.poles(structure.body);

      // The body is one structural relation:
      // antecedentTemplate -> ExactSequence(outputTemplates...)
      //
      // Validate the image carrier now so malformed admitted Rules do not
      // become partial runtime semantics later in the reaction.
      readExactSequence(memory, relation.end);

      rules.push(Object.freeze({
        admission,
        rule,
        roleDictionary: structure.roleDictionary,
        roles: dictionary.roles,
        antecedentTemplate: relation.start,
        outputBundleTemplate: relation.end,
      }));
    } catch (error) {
      if (error instanceof StructuralRuleError) continue;
      throw error;
    }
  }

  return Object.freeze(rules);
}

export interface V015StructuralMpRuleImage {
  readonly admission: LinkHandle;
  readonly rule: LinkHandle;
  readonly bindings: readonly StructuralRoleBinding[];
  readonly outputBundleTemplate: LinkHandle;
}

export function matchV015StructuralMpRules(
  memory: Memory,
  snapshot: readonly V015StructuralMpRuleSnapshot[],
  antecedent: LinkHandle,
): readonly V015StructuralMpRuleImage[] {
  const images: V015StructuralMpRuleImage[] = [];

  for (const candidate of snapshot) {
    try {
      const before = memory.linkCount;
      const bindings = unifyStructuralRuleTemplate(
        memory,
        candidate.antecedentTemplate,
        antecedent,
        candidate.roles,
      );
      assert(
        memory.linkCount === before,
        "structural antecedent matching must be read-only",
      );

      images.push(Object.freeze({
        admission: candidate.admission,
        rule: candidate.rule,
        bindings,
        outputBundleTemplate: candidate.outputBundleTemplate,
      }));
    } catch (error) {
      if (
        error instanceof StructuralRuleError &&
        error.code === "template-mismatch"
      ) {
        continue;
      }
      throw error;
    }
  }

  return Object.freeze(images);
}

export interface V015StructuralMpScopeReaction {
  readonly oldScope: LinkHandle;
  readonly nextScope: LinkHandle;
  readonly oldMembers: readonly LinkHandle[];
  readonly nextMembers: readonly LinkHandle[];
  readonly matchedRules: number;
  readonly transitionedMembers: number;
  readonly quiescent: boolean;
  readonly handoffCount: 0 | 1;
}

/**
 * Minimal structural generalized Modus Ponens candidate.
 *
 *   current:
 *     K -> A
 *
 *   selected source Rule:
 *     roles rho
 *     TA -> ExactSequence(TB...)
 *
 *   unify:
 *     TA ~ A  => sigma
 *
 *   reaction:
 *     K -> instantiate(TB, sigma)
 *
 * K is preserved by the law itself. It is NOT represented as a synthetic
 * caller Role inside every source Rule.
 *
 * Matching remains pointwise over one explicit current endpoint. This function
 * grants no implicit cross-current-member join.
 */
export function reactV015StructuralMpScope(
  memory: Memory,
  cursor: V013GroundedScopeCursor,
  nextScopeSeed: LinkHandle,
): V015StructuralMpScopeReaction {
  const oldScope = cursor.currentScope();
  const { theory } =
    readV013GroundedExecutionScopeAuthority(memory, oldScope);
  const before = cursor.members();

  // One immutable source-rule authority snapshot for the entire reaction.
  const snapshot = readV015StructuralMpTheorySnapshot(memory, theory);

  const after: LinkHandle[] = [];
  const add = (link: LinkHandle): void => {
    if (!after.includes(link)) after.push(link);
  };

  let matchedRules = 0;
  let transitionedMembers = 0;

  for (const member of before) {
    const truth = memory.poles(member);
    const images = matchV015StructuralMpRules(
      memory,
      snapshot,
      truth.end,
    );

    if (images.length === 0) {
      add(member);
      continue;
    }

    transitionedMembers += 1;

    for (const image of images) {
      matchedRules += 1;
      const groundedBundle = instantiateV013StructuralTemplate(
        memory,
        image.outputBundleTemplate,
        image.bindings,
      );
      const outputs = readExactSequence(memory, groundedBundle).values;
      for (const output of outputs) {
        add(memory.ensure(truth.start, output));
      }

      assert(
        cursor.currentScope() === oldScope,
        "partial successor must not become current",
      );
    }
  }

  if (matchedRules === 0) {
    return Object.freeze({
      oldScope,
      nextScope: oldScope,
      oldMembers: before,
      nextMembers: before,
      matchedRules,
      transitionedMembers,
      quiescent: true,
      handoffCount: 0,
    });
  }

  const nextScope = defineV013GroundedExecutionScope(
    memory,
    nextScopeSeed,
    theory,
    after,
  );
  cursor.switchAtomically(oldScope, nextScope);

  return Object.freeze({
    oldScope,
    nextScope,
    oldMembers: before,
    nextMembers: Object.freeze(after),
    matchedRules,
    transitionedMembers,
    quiescent: false,
    handoffCount: 1,
  });
}
