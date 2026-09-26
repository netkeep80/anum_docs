// mts-version-evidence: candidate-from=0.14

import { materializeExactSequence, readExactSequence } from "../src/exact-sequence.js";
import {
  admitStructuralDerivationRule,
  defineStructuralDerivationRule,
} from "../src/derivation.js";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
} from "../src/memory.js";
import { replayStructuralRootedProofAset } from "../src/rooted-proof-aset.js";
import {
  admitStructuralRule,
  defineStructuralRoleDictionary,
  defineStructuralRule,
} from "../src/structural-rule.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error("v0.14 N9 Add constructor authority boundary: " + message);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: values differ`);
}

function admittedDerivation(
  memory: Memory,
  theory: LinkHandle,
  dictionary: LinkHandle,
  premises: readonly LinkHandle[],
  conclusion: LinkHandle,
): Readonly<{ rule: LinkHandle; derivationRule: LinkHandle }> {
  const rule = defineStructuralRule(memory, dictionary, conclusion);
  const derivationRule = defineStructuralDerivationRule(memory, rule, premises);
  admitStructuralRule(memory, theory, rule);
  admitStructuralDerivationRule(memory, theory, derivationRule);
  return Object.freeze({ rule, derivationRule });
}

function zeroPremiseRoot(
  memory: Memory,
  theory: LinkHandle,
  dictionary: LinkHandle,
  conclusion: LinkHandle,
): Readonly<{ derivationRule: LinkHandle; root: LinkHandle }> {
  const { derivationRule } = admittedDerivation(
    memory,
    theory,
    dictionary,
    [],
    conclusion,
  );
  const identity = memory.ensure(derivationRule, theory);
  const target = memory.ensure(
    derivationRule,
    materializeExactSequence(memory, []),
  );
  const occurrence = memory.ensure(conclusion, target);
  return Object.freeze({
    derivationRule,
    root: memory.ensure(identity, occurrence),
  });
}

function main(): void {
  const memory = new Memory();
  const { R, O, C, L, U } = ensureRootBasis(memory);

  let cursor = memory.ensure(U, R);
  const fresh = (): LinkHandle => (cursor = memory.ensure(cursor, R));

  const theory = memory.ensure(L, U);
  const relationContext = memory.ensure(O, C);
  const addContext = memory.ensure(relationContext, fresh());
  const succContext = memory.ensure(relationContext, fresh());

  const add = (
    left: LinkHandle,
    right: LinkHandle,
    result: LinkHandle,
  ): LinkHandle =>
    memory.ensure(memory.ensure(memory.ensure(addContext, left), right), result);

  const succ = (value: LinkHandle, next: LinkHandle): LinkHandle =>
    memory.ensure(memory.ensure(succContext, value), next);

  // Selected Add constructors.
  const a = fresh(), b = fresh(), c = fresh(), b1 = fresh(), c1 = fresh();
  const dBase = defineStructuralRoleDictionary(memory, [a]);
  const dStep = defineStructuralRoleDictionary(memory, [a, b, c, b1, c1]);

  const base = admittedDerivation(
    memory,
    theory,
    dBase,
    [],
    add(a, U, a),
  );
  const step = admittedDerivation(
    memory,
    theory,
    dStep,
    [add(a, b, c), succ(b, b1), succ(c, c1)],
    add(a, b1, c1),
  );

  // The selected constructor authority is ordinary Link-carried structure.
  const constructorAuthority = materializeExactSequence(memory, [
    theory,
    base.derivationRule,
    step.derivationRule,
  ]);
  const constructorAuthorityAdmission = memory.ensure(
    theory,
    constructorAuthority,
  );
  same(
    memory.poles(constructorAuthorityAdmission).start,
    theory,
    "constructor authority admission Theory",
  );
  same(
    memory.poles(constructorAuthorityAdmission).end,
    constructorAuthority,
    "constructor authority admission carrier",
  );

  const authorityValues = readExactSequence(memory, constructorAuthority).values;
  same(authorityValues.length, 3, "authority arity");
  same(authorityValues[0], theory, "authority Theory");
  same(authorityValues[1], base.derivationRule, "BASE constructor");
  same(authorityValues[2], step.derivationRule, "STEP constructor");

  // Concrete bounded-style functionality challenge.
  const n1 = memory.ensure(U, L);
  const n2 = memory.ensure(n1, L);
  const canonicalResult = n1;
  const forgedResult = n2;
  assert(canonicalResult !== forgedResult, "challenge results are distinct");

  const canonicalClaim = add(U, n1, canonicalResult);
  const forgedClaim = add(U, n1, forgedResult);
  assert(canonicalClaim !== forgedClaim, "second result has distinct Add claim");

  // Merely materializing the forged Add Link grants no Theory authority.
  assert(
    memory.find(theory, forgedClaim) === undefined,
    "ambient Add Link is not itself Theory authority",
  );

  // A third primitive derivation rule is admitted to Theory, but is NOT one
  // of the selected BASE/STEP constructors.
  const forgedDictionary = defineStructuralRoleDictionary(memory, []);
  const forged = zeroPremiseRoot(
    memory,
    theory,
    forgedDictionary,
    forgedClaim,
  );
  assert(
    !authorityValues.includes(forged.derivationRule),
    "forged DR is absent from selected constructor authority",
  );

  // Current rooted replay only checks primitive Theory admission. Therefore it
  // accepts the forged third-constructor proof even though the selected
  // constructor authority excludes that DR.
  const before = memory.linkCount;
  const replay = replayStructuralRootedProofAset(memory, forged.root);
  same(replay.theory, theory, "forged rooted proof Theory");
  same(replay.conclusion, forgedClaim, "forged second Add result is replayed");
  same(
    replay.targetDerivationRule,
    forged.derivationRule,
    "replay identifies exact forged DR",
  );
  same(memory.linkCount, before, "boundary replay is read-only");

  // The falsifier is exactly the N4 second-result shape:
  // same (left,right), distinct result.
  same(memory.poles(canonicalClaim).start, memory.poles(forgedClaim).start,
    "Add claims share encoded left/right prefix");
  assert(
    memory.poles(canonicalClaim).end !== memory.poles(forgedClaim).end,
    "Add claims differ only at result pole",
  );

  console.log([
    "MTS v0.14 N9: ADD_CONSTRUCTOR_AUTHORITY_BOUNDARY=PINNED",
    "SELECTED_CONSTRUCTORS=BASE_STEP",
    "CONSTRUCTOR_AUTHORITY=LINK_CARRIED_AND_THEORY_ADMITTED",
    "AMBIENT_ADD_LINK_AUTHORITY=FALSE",
    "FORGED_THIRD_DR_THEORY_ADMITTED=TRUE",
    "FORGED_THIRD_DR_IN_SELECTED_CONSTRUCTORS=FALSE",
    "CURRENT_ROOTED_REPLAY_ACCEPTS_FORGED_THIRD_DR=TRUE",
    "SECOND_RESULT_FUNCTIONALITY_FALSIFIER=GREEN",
    "EXACT_BLOCKER=MISSING_CONSTRUCTOR_SCOPED_PROOF_REPLAY",
    "NEXT=GENERIC_CONSTRUCTOR_SCOPED_ROOTED_PROOF_REPLAY",
    "GENERAL_ADD_FUNCTIONALITY_PROOF=OPEN",
    "PRODUCTION_DELTA=NONE",
    "ACCEPTED_V013_MUTATED=FALSE",
  ].join(" "));
}

main();
