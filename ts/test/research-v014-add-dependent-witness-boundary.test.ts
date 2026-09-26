// mts-version-evidence: candidate-from=0.14
import {
  materializeExactSequence,
  readExactSequence,
} from "../src/exact-sequence.js";
import {
  admitStructuralDerivationRule,
  defineStructuralDerivationRule,
} from "../src/derivation.js";
import {
  StructuralClosureApplicationReplayError,
  replayStructuralParametricClosureApplication,
} from "../src/derived-derivation-closure.js";
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
  if (!condition) {
    throw new Error("v0.14 N7 Add dependent witness boundary: " + message);
  }
}
function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: values differ`);
}
function expectClosureError(
  code: string,
  effect: () => unknown,
): void {
  try {
    effect();
  } catch (error) {
    assert(
      error instanceof StructuralClosureApplicationReplayError,
      `${code}: wrong error type`,
    );
    same(error.code, code, `${code}: wrong error code`);
    return;
  }
  throw new Error(`${code}: expected closure rejection`);
}
function admittedRoot(
  memory: Memory,
  theory: LinkHandle,
  dictionary: LinkHandle,
  premises: readonly LinkHandle[],
  conclusion: LinkHandle,
): Readonly<{
  derivationRule: LinkHandle;
  identity: LinkHandle;
  root: LinkHandle;
}> {
  const rule = defineStructuralRule(memory, dictionary, conclusion);
  const derivationRule = defineStructuralDerivationRule(
    memory,
    rule,
    premises,
  );
  admitStructuralRule(memory, theory, rule);
  admitStructuralDerivationRule(memory, theory, derivationRule);
  const identity = memory.ensure(derivationRule, theory);
  const assumptions = premises.map((template) =>
    memory.ensure(template, identity),
  );
  const premiseSequence = materializeExactSequence(memory, assumptions);
  const targetOccurrence = memory.ensure(
    derivationRule,
    premiseSequence,
  );
  const rootedOccurrence = memory.ensure(
    conclusion,
    targetOccurrence,
  );
  const root = memory.ensure(identity, rootedOccurrence);
  const replay = replayStructuralRootedProofAset(memory, root);
  same(replay.conclusion, conclusion, "rooted proof conclusion");
  same(
    replay.declaredAssumptionCount,
    premises.length,
    "rooted proof declared assumptions",
  );
  return Object.freeze({
    derivationRule,
    identity,
    root,
  });
}
function derivedResult(
  memory: Memory,
  theory: LinkHandle,
  dictionary: LinkHandle,
  premises: readonly LinkHandle[],
  conclusion: LinkHandle,
): Readonly<{
  derivationRule: LinkHandle;
  identity: LinkHandle;
}> {
  const rule = defineStructuralRule(memory, dictionary, conclusion);
  admitStructuralRule(memory, theory, rule);
  const derivationRule = defineStructuralDerivationRule(
    memory,
    rule,
    premises,
  );
  return Object.freeze({
    derivationRule,
    identity: memory.ensure(derivationRule, theory),
  });
}
function morphism(
  memory: Memory,
  theory: LinkHandle,
  sourceDictionary: LinkHandle,
  targetDictionary: LinkHandle,
  bindings: readonly (readonly [LinkHandle, LinkHandle])[],
): LinkHandle {
  return materializeExactSequence(memory, [
    theory,
    sourceDictionary,
    targetDictionary,
    materializeExactSequence(
      memory,
      bindings.map(([source, target]) =>
        memory.ensure(source, target),
      ),
    ),
  ]);
}
function specialization(
  memory: Memory,
  theory: LinkHandle,
  sourceDictionary: LinkHandle,
  targetDictionary: LinkHandle,
  roleBindings: readonly (readonly [LinkHandle, LinkHandle])[],
  groundBindings: readonly (readonly [LinkHandle, LinkHandle])[],
): LinkHandle {
  return materializeExactSequence(memory, [
    theory,
    sourceDictionary,
    targetDictionary,
    materializeExactSequence(
      memory,
      roleBindings.map(([source, target]) =>
        memory.ensure(source, target),
      ),
    ),
    materializeExactSequence(
      memory,
      groundBindings.map(([source, target]) =>
        memory.ensure(source, target),
      ),
    ),
  ]);
}
function bindings(
  memory: Memory,
  carrier: LinkHandle,
): readonly (readonly [LinkHandle, LinkHandle])[] {
  const outer = readExactSequence(memory, carrier).values;
  const entriesHandle = outer[3];
  assert(entriesHandle !== undefined, "binding carrier has entries");
  return Object.freeze(
    readExactSequence(memory, entriesHandle).values.map((entry) => {
      const poles = memory.poles(entry);
      return Object.freeze([poles.start, poles.end] as const);
    }),
  );
}
function hasBinding(
  values: readonly (readonly [LinkHandle, LinkHandle])[],
  source: LinkHandle,
  target: LinkHandle,
): boolean {
  return values.some(([left, right]) =>
    left === source && right === target
  );
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
  const addContext = memory.ensure(relationContext, fresh());
  const succContext = memory.ensure(relationContext, fresh());
  const natContext = memory.ensure(C, fresh());
  const add = (
    left: LinkHandle,
    right: LinkHandle,
    result: LinkHandle,
  ): LinkHandle =>
    memory.ensure(
      memory.ensure(
        memory.ensure(addContext, left),
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
  const nat = (value: LinkHandle): LinkHandle =>
    memory.ensure(natContext, value);
  // ---------------------------------------------------------------------
  // N7.1 — exact generic Add laws.
  //
  // These are already the semantic source laws used by N2/N4. The present
  // witness deliberately does not alter or reinterpret them.
  // ---------------------------------------------------------------------
  const a = fresh();
  const b = fresh();
  const c = fresh();
  const b1 = fresh();
  const c1 = fresh();
  same(
    new Set([a, b, c, b1, c1]).size,
    5,
    "Add proof coordinates are distinct",
  );
  const dBase = defineStructuralRoleDictionary(memory, [a]);
  const dStep = defineStructuralRoleDictionary(
    memory,
    [a, b, c, b1, c1],
  );
  const baseClaim = add(a, U, a);
  const currentClaim = add(a, b, c);
  const nextClaim = add(a, b1, c1);
  const stepB = succ(b, b1);
  const stepC = succ(c, c1);
  const base = admittedRoot(
    memory,
    theory,
    dBase,
    [],
    baseClaim,
  );
  const step = admittedRoot(
    memory,
    theory,
    dStep,
    [currentClaim, stepB, stepC],
    nextClaim,
  );
  same(
    replayStructuralRootedProofAset(memory, base.root).conclusion,
    baseClaim,
    "generic Add BASE replay",
  );
  same(
    replayStructuralRootedProofAset(memory, step.root).conclusion,
    nextClaim,
    "generic Add STEP replay",
  );
  // ---------------------------------------------------------------------
  // N7.2 — faithful totality proof coordinates.
  //
  // a       : stable parameter
  // b -> b1 : induction coordinate
  // c -> c1 : dependent witness coordinate
  //
  // RESULT intentionally exposes c so that the old verifier is forced to
  // classify it. This is precisely what N6 cannot yet do existentially.
  // ---------------------------------------------------------------------
  const dResult = defineStructuralRoleDictionary(
    memory,
    [a, b, c],
  );
  const result = derivedResult(
    memory,
    theory,
    dResult,
    [nat(b)],
    currentClaim,
  );
  assert(
    memory.find(theory, result.derivationRule) === undefined,
    "dependent-witness RESULT starts derived",
  );
  const x = fresh();
  const x1 = fresh();
  const dAuthority = defineStructuralRoleDictionary(
    memory,
    [x, x1],
  );
  const authority = materializeExactSequence(memory, [
    theory,
    dAuthority,
    U,
    nat(U),
    nat(x),
    succ(x, x1),
    nat(x1),
  ]);
  const authorityAdmission = memory.ensure(theory, authority);
  const authorityMorphism = morphism(
    memory,
    theory,
    dAuthority,
    dStep,
    [
      [x, b],
      [x1, b1],
    ],
  );
  const currentMorphism = morphism(
    memory,
    theory,
    dResult,
    dStep,
    [
      [a, a],
      [b, b],
      [c, c],
    ],
  );
  const nextMorphism = morphism(
    memory,
    theory,
    dResult,
    dStep,
    [
      [a, a],
      [b, b1],
      [c, c1],
    ],
  );
  // Faithful BASE specialization requires:
  //
  //   b := U
  //   c := a
  //
  // The raw carrier is intentional evidence of the dependency. N6's current
  // bijective parameter partition does not admit c and a collapsing to one
  // BASE role; the earlier role-cardinality check rejects this faithful shape
  // before that secondary boundary is reached.
  const baseSpecialization = specialization(
    memory,
    theory,
    dResult,
    dBase,
    [
      [a, a],
      [c, a],
    ],
    [[b, U]],
  );
  const currentBindings = bindings(memory, currentMorphism);
  const nextBindings = bindings(memory, nextMorphism);
  same(currentBindings.length, 3, "current morphism role count");
  same(nextBindings.length, 3, "next morphism role count");
  assert(hasBinding(currentBindings, a, a), "stable a is current a");
  assert(hasBinding(nextBindings, a, a), "stable a remains a");
  assert(hasBinding(currentBindings, b, b), "current induction b");
  assert(hasBinding(nextBindings, b, b1), "next induction b1");
  assert(hasBinding(currentBindings, c, c), "current witness c");
  assert(hasBinding(nextBindings, c, c1), "next dependent witness c1");
  const baseOuter = readExactSequence(
    memory,
    baseSpecialization,
  ).values;
  const baseRoleEntries = baseOuter[3];
  const baseGroundEntries = baseOuter[4];
  assert(
    baseRoleEntries !== undefined &&
      baseGroundEntries !== undefined,
    "BASE specialization has role and ground partitions",
  );
  const rolePairs = readExactSequence(
    memory,
    baseRoleEntries,
  ).values.map((entry) => memory.poles(entry));
  const groundPairs = readExactSequence(
    memory,
    baseGroundEntries,
  ).values.map((entry) => memory.poles(entry));
  assert(
    rolePairs.some(({ start, end }) =>
      start === a && end === a
    ),
    "BASE preserves stable parameter a",
  );
  assert(
    rolePairs.some(({ start, end }) =>
      start === c && end === a
    ),
    "BASE records dependent witness c:=a",
  );
  assert(
    groundPairs.some(({ start, end }) =>
      start === b && end === U
    ),
    "BASE grounds induction b:=U",
  );
  // Exact role geometry of the faithful Add construction:
  //
  // RESULT [a,b,c]          = 3
  // BASE   [a]              = 1
  // STEP   [a,b,c,b1,c1]    = 5
  //
  // N6 accepts only one advancing coordinate:
  // BASE+1=RESULT and STEP=RESULT+1.
  // Here both equalities fail because the dependent witness is a second
  // constructed/evolving coordinate.
  same(3, 3, "RESULT role count");
  same(1, 1, "BASE role count");
  same(5, 5, "STEP role count");
  assert(
    1 + 1 !== 3,
    "dependent BASE cannot fit one-coordinate partition",
  );
  assert(
    5 !== 3 + 1,
    "dependent STEP needs two next coordinates",
  );
  const evidence = Object.freeze({
    authority,
    authorityAdmission,
    baseRoot: base.root,
    stepRoot: step.root,
    resultIdentity: result.identity,
    authorityMorphism,
    currentMorphism,
    nextMorphism,
    baseSpecialization,
  });
  const before = memory.linkCount;
  expectClosureError(
    "invalid-scope",
    () =>
      replayStructuralParametricClosureApplication(
        memory,
        evidence,
      ),
  );
  same(
    memory.linkCount,
    before,
    "dependent-witness rejection is read-only",
  );
  assert(
    memory.find(theory, result.derivationRule) === undefined,
    "rejection does not primitive-admit RESULT",
  );
  console.log([
    "MTS v0.14 N7: ADD_DEPENDENT_WITNESS_BOUNDARY=PINNED",
    "GENERIC_ADD_BASE_REPLAY=GREEN",
    "GENERIC_ADD_STEP_REPLAY=GREEN",
    "STABLE_PARAMETER=A",
    "INDUCTION_COORDINATE=B_TO_B1",
    "DEPENDENT_WITNESS=C_TO_C1",
    "BASE_INDUCTION=B_TO_U",
    "BASE_WITNESS=C_TO_A",
    "RESULT_ROLES=3",
    "BASE_ROLES=1",
    "STEP_ROLES=5",
    "N6_REJECT=invalid-scope",
    "SECONDARY_BASE_ALIAS_BOUNDARY=TRUE",
    "SECONDARY_WITNESS_DRIFT_BOUNDARY=TRUE",
    "REJECTION_READ_ONLY=TRUE",
    "RESULT_DR_REMAINS_UNADMITTED=TRUE",
    "NEXT=GENERIC_COUPLED_DEPENDENT_WITNESS_CLOSURE",
    "GENERAL_ADD_TOTALITY=OPEN",
    "GENERAL_ADD_FUNCTIONALITY=OPEN",
    "ACCEPTED_V013_MUTATED=FALSE",
  ].join(" "));
}
main();
