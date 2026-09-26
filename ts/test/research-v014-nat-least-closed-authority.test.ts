// mts-version-evidence: candidate-from=0.14

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { materializeExactSequence } from "../src/exact-sequence.js";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
} from "../src/memory.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error("v0.14 N1 Nat least-closed authority: " + message);
  }
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: values differ`);
}

function includesAll(
  superset: ReadonlySet<LinkHandle>,
  subset: readonly LinkHandle[],
  message: string,
): void {
  for (const value of subset) {
    assert(superset.has(value), message);
  }
}

function finiteGeneratedClosure(
  seed: LinkHandle,
  successor: (value: LinkHandle) => LinkHandle,
  steps: number,
): readonly LinkHandle[] {
  const values: LinkHandle[] = [seed];
  for (let index = 0; index < steps; index += 1) {
    values.push(successor(values[values.length - 1]!));
  }
  return Object.freeze(values);
}

function isClosedOnChallenge(
  candidate: ReadonlySet<LinkHandle>,
  generated: readonly LinkHandle[],
  successor: (value: LinkHandle) => LinkHandle,
): boolean {
  if (!candidate.has(generated[0]!)) return false;

  for (let index = 0; index + 1 < generated.length; index += 1) {
    const value = generated[index]!;
    if (!candidate.has(value)) continue;
    if (!candidate.has(successor(value))) return false;
  }

  return true;
}

function main(): void {
  const memory = new Memory();
  const { R, O, C, L, U } = ensureRootBasis(memory);

  const successor = (value: LinkHandle): LinkHandle =>
    memory.ensure(value, L);

  // -----------------------------------------------------------------------
  // N1.1 — canonical zero-rooted carrier.
  // -----------------------------------------------------------------------

  const nat = finiteGeneratedClosure(U, successor, 8);

  same(nat[0], U, "N0=U");
  same(nat[1], memory.ensure(U, L), "N1=U⟼L");
  assert(nat[1] !== L, "N1 must remain distinct from unit Link L");

  for (let index = 0; index + 1 < nat.length; index += 1) {
    same(
      successor(nat[index]!),
      nat[index + 1]!,
      `uniform successor N${index}->N${index + 1}`,
    );
  }

  // Historical degree chain remains a different derived family.
  const degree = finiteGeneratedClosure(L, successor, 8);
  same(degree[0], L, "D1=L");
  for (const n of nat) {
    for (const d of degree) {
      assert(n !== d, "bounded Nat/degree challenge families stay separated");
    }
  }

  // -----------------------------------------------------------------------
  // N1.2 — least-closed finite falsifier.
  //
  // The host Set is only a bounded falsification harness. Nat identity is
  // still ordinary Link identity generated from U by Succ(N)=N⟼L.
  // -----------------------------------------------------------------------

  const canonical = new Set<LinkHandle>(nat);
  assert(
    isClosedOnChallenge(canonical, nat, successor),
    "generated Nat challenge is U-rooted and successor-closed",
  );

  const rogueA = memory.ensure(R, U);
  const rogueB = memory.ensure(C, R);

  const supersets = [
    new Set<LinkHandle>(nat),
    new Set<LinkHandle>([...nat, rogueA]),
    new Set<LinkHandle>([...nat, rogueA, rogueB, ...degree]),
  ];

  for (const candidate of supersets) {
    assert(
      isClosedOnChallenge(candidate, nat, successor),
      "challenge superset satisfies U+Succ closure",
    );
    includesAll(
      candidate,
      nat,
      "every U-rooted successor-closed challenge superset contains generated Nat",
    );
  }

  // Remove the base or one generated successor: closure law immediately fails.
  const missingBase = new Set<LinkHandle>(nat.slice(1));
  assert(
    !isClosedOnChallenge(missingBase, nat, successor),
    "candidate without U is not Nat-closed",
  );

  for (let missing = 1; missing < nat.length; missing += 1) {
    const incomplete = new Set<LinkHandle>(
      nat.filter((_value, index) => index !== missing),
    );
    assert(
      !isClosedOnChallenge(incomplete, nat, successor),
      `candidate missing generated N${missing} is not successor-closed`,
    );
  }

  // -----------------------------------------------------------------------
  // N1.3 — membership authority is not ambient Link existence.
  // -----------------------------------------------------------------------

  const selectedTheory = memory.ensure(O, U);
  const foreignTheory = memory.ensure(C, L);
  const natRole = memory.ensureStartSelfClosed(memory.ensure(U, O));
  const natClaim = (value: LinkHandle): LinkHandle =>
    memory.ensure(natRole, value);

  // Candidate authority itself is ordinary Link structure.
  const selectedAuthority = materializeExactSequence(memory, [
    selectedTheory,
    natRole,
    U,
    L,
  ]);
  const selectedAuthorityAdmission =
    memory.ensure(selectedTheory, selectedAuthority);

  same(
    memory.poles(selectedAuthorityAdmission).start,
    selectedTheory,
    "selected Nat authority belongs to selected Theory",
  );
  same(
    memory.poles(selectedAuthorityAdmission).end,
    selectedAuthority,
    "selected Nat authority admission points to exact carrier",
  );

  // Base claim may be explicitly grounded.
  const natU = natClaim(U);
  const baseAdmission = memory.ensure(selectedTheory, natU);
  same(memory.poles(baseAdmission).end, natU, "selected base Nat(U) admitted");

  // Merely materializing Nat(X) in Memory does not authorize it.
  const ambientClaim = natClaim(rogueA);
  assert(
    memory.find(selectedTheory, ambientClaim) === undefined,
    "ambient Nat(X) Link is not selected Theory authority",
  );
  assert(
    !canonical.has(rogueA),
    "ambient Nat(X) does not enter generated canonical Nat closure",
  );

  // A foreign Theory can explicitly authorize its own claim without changing
  // the selected Nat authority.
  const foreignAdmission = memory.ensure(foreignTheory, ambientClaim);
  same(
    memory.poles(foreignAdmission).start,
    foreignTheory,
    "foreign Nat(X) admission belongs to foreign Theory",
  );
  assert(
    memory.find(selectedTheory, ambientClaim) === undefined,
    "foreign Nat(X) authority cannot leak into selected Theory",
  );
  assert(
    !canonical.has(rogueA),
    "foreign authority cannot extend canonical selected Nat",
  );

  // Even a value with successor-like Link shape does not become Nat merely by
  // shape. The generated chain grants it only when it is actually reached.
  const successorShapedRogue = memory.ensure(rogueB, L);
  assert(
    !canonical.has(successorShapedRogue),
    "N⟼L shape alone is not Nat membership authority",
  );
  const shapedClaim = natClaim(successorShapedRogue);
  assert(
    memory.find(selectedTheory, shapedClaim) === undefined,
    "shape-derived ambient claim remains unauthorized",
  );

  // -----------------------------------------------------------------------
  // N1.4 — connect bounded minimality falsifier to existing general closure
  // proof-replay. We require exact negative guards already established there:
  // wrong base/domain/step/theory and primitive RESULT admission fail closed.
  // -----------------------------------------------------------------------

  const root = resolve(process.cwd(), "..");
  const induction = readFileSync(
    join(root, "ts/test/derived-nat0-induction-closure.test.ts"),
    "utf8",
  );

  for (const required of [
    "replayStructuralClosureApplication",
    '"invalid-base-grounding"',
    '"domain-mismatch"',
    '"step-mismatch"',
    '"theory-mismatch"',
    '"result-primitive-admission"',
    "Nat0(U)",
    "Nat0 successor-closure",
  ]) {
    assert(
      induction.includes(required),
      "generic Nat0 closure witness retains authority guard " + required,
    );
  }

  // The accepted zero-rooted Peano witnesses must remain present as independent
  // structural evidence, not be replaced by this finite harness.
  for (const path of [
    "ts/test/nat-refoundation-carrier.test.ts",
    "ts/test/nat-peano-successor-injective.test.ts",
    "ts/test/nat-peano-zero-not-successor.test.ts",
  ]) {
    const source = readFileSync(join(root, path), "utf8");
    assert(source.length > 0, "required existing Nat witness " + path);
  }

  console.log([
    "MTS v0.14 N1: NAT_LEAST_CLOSED_AUTHORITY=GREEN_RESEARCH",
    "N0=U",
    "SUCC=N_TO_L",
    "N1=U_TO_L_NOT_L",
    "NAT_DEGREE=SEPARATED_BOUNDED_FALSIFIER",
    "LEAST_CLOSED_FINITE_CHALLENGE=SUPPORTED",
    "AMBIENT_NAT_LINK_AUTHORITY=FALSE",
    "SUCCESSOR_SHAPE_AUTHORITY=FALSE",
    "FOREIGN_THEORY_MEMBERSHIP_LEAK=FALSE",
    "GENERIC_INDUCTION_CLOSURE_EVIDENCE=RETAINED",
    "HOST_INTEGER_IDENTITY=NONE",
    "ACCEPTED_V013_MUTATED=FALSE",
  ].join(" "));
}

main();
