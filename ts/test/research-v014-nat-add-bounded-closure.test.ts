// mts-version-evidence: candidate-from=0.14

import { materializeExactSequence } from "../src/exact-sequence.js";
import {
  admitStructuralDerivationRule,
  defineStructuralDerivationRule,
} from "../src/derivation.js";
import {
  replayStructuralDerivedDerivationSchema,
  type StructuralDerivedDerivationEvidence,
} from "../src/derived-derivation-schema.js";
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

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error("v0.14 N4 bounded Add closure: " + message);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: values differ`);
}

interface GenericFixture {
  readonly derivationRule: LinkHandle;
  readonly evidence: StructuralDerivedDerivationEvidence;
}

function admittedGeneric(
  memory: Memory,
  theory: LinkHandle,
  dictionary: LinkHandle,
  premises: readonly LinkHandle[],
  conclusion: LinkHandle,
): GenericFixture {
  const rule = defineStructuralRule(memory, dictionary, conclusion);
  const derivationRule = defineStructuralDerivationRule(memory, rule, premises);
  const ruleAdmission = admitStructuralRule(memory, theory, rule);
  const derivationRuleAdmission =
    admitStructuralDerivationRule(memory, theory, derivationRule);
  const identity = memory.ensure(derivationRule, theory);
  const assumptions = premises.map((template) =>
    Object.freeze({
      occurrence: memory.ensure(template, identity),
      template,
    }),
  );
  const premiseOccurrenceSequence = materializeExactSequence(
    memory,
    assumptions.map(({ occurrence }) => occurrence),
  );
  const targetOccurrence = memory.ensure(
    derivationRule,
    premiseOccurrenceSequence,
  );

  return Object.freeze({
    derivationRule,
    evidence: Object.freeze({
      identity,
      targetOccurrence,
      assumptions: Object.freeze(assumptions),
      nodes: Object.freeze([
        Object.freeze({
          occurrence: targetOccurrence,
          derivationRule,
          ruleAdmission,
          derivationRuleAdmission,
          premiseOccurrenceSequence,
        }),
      ]),
    }),
  });
}

interface AddFact {
  readonly left: LinkHandle;
  readonly right: LinkHandle;
  readonly result: LinkHandle;
  readonly claim: LinkHandle;
}

function hasExactFact(
  facts: readonly AddFact[],
  left: LinkHandle,
  right: LinkHandle,
  result: LinkHandle,
): boolean {
  return facts.some((fact) =>
    fact.left === left &&
    fact.right === right &&
    fact.result === result
  );
}

function hasAnyResult(
  facts: readonly AddFact[],
  left: LinkHandle,
  right: LinkHandle,
): boolean {
  return facts.some((fact) =>
    fact.left === left &&
    fact.right === right
  );
}

function functional(facts: readonly AddFact[]): boolean {
  for (let i = 0; i < facts.length; i += 1) {
    const left = facts[i]!;
    for (let j = i + 1; j < facts.length; j += 1) {
      const right = facts[j]!;
      if (
        left.left === right.left &&
        left.right === right.right &&
        left.result !== right.result
      ) {
        return false;
      }
    }
  }
  return true;
}

function main(): void {
  const memory = new Memory();
  const { R, O, C, L, U } = ensureRootBasis(memory);

  let cursor = memory.ensure(U, R);
  const fresh = (): LinkHandle => {
    cursor = memory.ensure(cursor, R);
    return cursor;
  };

  const theory = memory.ensure(L, U);
  const relationContext = memory.ensure(O, C);
  const plusContext = memory.ensure(relationContext, fresh());
  const succContext = memory.ensure(relationContext, fresh());

  const add = (
    left: LinkHandle,
    right: LinkHandle,
    result: LinkHandle,
  ): LinkHandle =>
    memory.ensure(
      memory.ensure(
        memory.ensure(plusContext, left),
        right,
      ),
      result,
    );

  const succ = (
    value: LinkHandle,
    next: LinkHandle,
  ): LinkHandle =>
    memory.ensure(
      memory.ensure(succContext, value),
      next,
    );

  // -----------------------------------------------------------------------
  // N4.1 — exact generic Add source laws.
  // -----------------------------------------------------------------------

  const a = fresh();
  const b = fresh();
  const c = fresh();
  const b1 = fresh();
  const c1 = fresh();

  const dBase = defineStructuralRoleDictionary(memory, [a]);
  const dStep = defineStructuralRoleDictionary(
    memory,
    [a, b, c, b1, c1],
  );

  const baseTemplate = add(a, U, a);
  const stepTemplate = add(a, b1, c1);

  const genericBase = admittedGeneric(
    memory,
    theory,
    dBase,
    [],
    baseTemplate,
  );
  const genericStep = admittedGeneric(
    memory,
    theory,
    dStep,
    [
      add(a, b, c),
      succ(b, b1),
      succ(c, c1),
    ],
    stepTemplate,
  );

  same(
    replayStructuralDerivedDerivationSchema(
      memory,
      genericBase.evidence,
    ).conclusionTemplate,
    baseTemplate,
    "generic right-zero/base law",
  );
  same(
    replayStructuralDerivedDerivationSchema(
      memory,
      genericStep.evidence,
    ).conclusionTemplate,
    stepTemplate,
    "generic recursive Add law",
  );

  // -----------------------------------------------------------------------
  // N4.2 — bounded canonical zero-rooted Nat challenge.
  //
  // Host arrays below are only an exhaustive finite falsification harness.
  // Semantic identities remain ordinary canonical Links.
  // -----------------------------------------------------------------------

  const nat: LinkHandle[] = [U];
  for (let index = 0; index < 7; index += 1) {
    nat.push(memory.ensure(nat[nat.length - 1]!, L));
  }
  const natSet = new Set<LinkHandle>(nat);

  const successorPairs: Array<readonly [LinkHandle, LinkHandle]> = [];
  for (let index = 0; index + 1 < nat.length; index += 1) {
    successorPairs.push(
      Object.freeze([nat[index]!, nat[index + 1]!] as const),
    );
  }

  const nextOf = (value: LinkHandle): LinkHandle | undefined =>
    successorPairs.find(([current]) => current === value)?.[1];

  for (const [value, next] of successorPairs) {
    same(next, memory.ensure(value, L), "Nat successor is N⟼L");
    succ(value, next);
  }

  // -----------------------------------------------------------------------
  // N4.3 — least bounded Add closure generated only by base + recursive step.
  // -----------------------------------------------------------------------

  const closeAdd = (
    includeBase: boolean,
    includeStep: boolean,
  ): readonly AddFact[] => {
    const facts: AddFact[] = [];

    const insert = (
      left: LinkHandle,
      right: LinkHandle,
      result: LinkHandle,
    ): boolean => {
      if (hasExactFact(facts, left, right, result)) return false;
      facts.push(Object.freeze({
        left,
        right,
        result,
        claim: add(left, right, result),
      }));
      return true;
    };

    if (includeBase) {
      for (const left of nat) insert(left, U, left);
    }

    if (includeStep) {
      let changed = true;
      while (changed) {
        changed = false;
        for (const fact of [...facts]) {
          const nextRight = nextOf(fact.right);
          const nextResult = nextOf(fact.result);
          if (nextRight === undefined || nextResult === undefined) continue;
          if (insert(fact.left, nextRight, nextResult)) changed = true;
        }
      }
    }

    return Object.freeze(facts);
  };

  const facts = closeAdd(true, true);

  // Expected domain is constructed by the same structural walk:
  // start from (A,U,A), then advance right and result through canonical Succ.
  const expected: AddFact[] = [];
  for (const left of nat) {
    let right = U;
    let result = left;
    while (true) {
      expected.push(Object.freeze({
        left,
        right,
        result,
        claim: add(left, right, result),
      }));
      const nextRight = nextOf(right);
      const nextResult = nextOf(result);
      if (nextRight === undefined || nextResult === undefined) break;
      right = nextRight;
      result = nextResult;
    }
  }

  same(facts.length, expected.length, "bounded closure has no extra Add facts");
  same(facts.length, 36, "N0..N7 triangular Add challenge cardinality");

  for (const fact of expected) {
    assert(
      hasExactFact(facts, fact.left, fact.right, fact.result),
      "every structurally reachable bounded Add fact exists",
    );
    same(
      fact.claim,
      add(fact.left, fact.right, fact.result),
      "Add claim has canonical Link identity",
    );
  }

  for (const fact of facts) {
    assert(
      natSet.has(fact.result),
      "bounded Add result stays inside canonical Nat",
    );
    assert(
      expected.some((candidate) =>
        candidate.left === fact.left &&
        candidate.right === fact.right &&
        candidate.result === fact.result
      ),
      "closure contains no non-derived extra result",
    );
  }

  // -----------------------------------------------------------------------
  // N4.4 — bounded right-zero, left-zero, totality and functionality.
  // -----------------------------------------------------------------------

  for (const left of nat) {
    assert(
      hasExactFact(facts, left, U, left),
      "right-zero/base Add(A,U,A)",
    );
  }

  for (const right of nat) {
    assert(
      hasExactFact(facts, U, right, right),
      "left-zero bounded consistency with N2",
    );
  }

  for (const challenge of expected) {
    assert(
      hasAnyResult(facts, challenge.left, challenge.right),
      "bounded Add totality on structurally closed challenge pair",
    );
  }

  assert(functional(facts), "bounded Add is functional");

  // -----------------------------------------------------------------------
  // N4.5 — negative controls.
  // -----------------------------------------------------------------------

  const noBase = closeAdd(false, true);
  assert(
    !hasAnyResult(noBase, U, U),
    "removing base law destroys totality",
  );

  const noStep = closeAdd(true, false);
  const N1 = nat[1]!;
  const N2 = nat[2]!;
  assert(
    !hasAnyResult(noStep, U, N1),
    "removing recursive step destroys positive-right-argument totality",
  );

  const forgedSecond: readonly AddFact[] = Object.freeze([
    ...facts,
    Object.freeze({
      left: U,
      right: N1,
      result: N2,
      claim: add(U, N1, N2),
    }),
  ]);
  assert(
    !functional(forgedSecond),
    "second distinct result falsifies functionality",
  );

  const rogue = memory.ensure(R, U);
  assert(!natSet.has(rogue), "rogue challenge result is not canonical Nat");
  const forgedNonNat: readonly AddFact[] = Object.freeze([
    ...facts,
    Object.freeze({
      left: U,
      right: U,
      result: rogue,
      claim: add(U, U, rogue),
    }),
  ]);
  assert(
    forgedNonNat.some((fact) => !natSet.has(fact.result)),
    "non-Nat injected result falsifies Nat closure",
  );

  console.log([
    "MTS v0.14 N4: ADD_BOUNDED_CLOSURE=GREEN_RESEARCH",
    "GENERIC_ADD_BASE_REPLAY=GREEN",
    "GENERIC_ADD_STEP_REPLAY=GREEN",
    "NAT_CHALLENGE=N0_TO_N7",
    "BOUNDED_ADD_FACTS=36",
    "RIGHT_ZERO_BOUNDED=GREEN",
    "LEFT_ZERO_BOUNDED=GREEN",
    "NAT_RESULT_CLOSURE_BOUNDED=GREEN",
    "TOTALITY_BOUNDED=GREEN",
    "FUNCTIONALITY_BOUNDED=GREEN",
    "MISSING_BASE_FALSIFIER=GREEN",
    "MISSING_STEP_FALSIFIER=GREEN",
    "SECOND_RESULT_FALSIFIER=GREEN",
    "NON_NAT_RESULT_FALSIFIER=GREEN",
    "GENERAL_TOTALITY_PROOF=OPEN",
    "GENERAL_FUNCTIONALITY_PROOF=OPEN",
    "PRODUCTION_DELTA=NONE",
    "ACCEPTED_V013_MUTATED=FALSE",
  ].join(" "));
}

main();
