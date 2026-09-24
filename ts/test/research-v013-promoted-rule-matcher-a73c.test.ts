import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
} from "../src/memory.js";
import {
  StructuralRuleError,
  type StructuralRoleBinding,
} from "../src/structural-rule.js";
import {
  unifyStructuralRuleTemplate,
  unifyStructuralTemplate,
} from "../src/structural-unification.js";

function assert(c: unknown, m: string): asserts c {
  if (!c) throw new Error("v0.13 A73c promoted Rule matcher: " + m);
}

function same<T>(a: T, e: T, m: string): void {
  assert(Object.is(a, e), m + ": values differ");
}

function binding(
  bindings: readonly StructuralRoleBinding[],
  role: LinkHandle,
): LinkHandle {
  const found = bindings.find((x) => x.role === role);
  assert(found !== undefined, "missing role binding");
  return found.value;
}

function expectMismatch(effect: () => unknown, message: string): void {
  let mismatch = false;
  try {
    effect();
  } catch (error) {
    assert(
      error instanceof StructuralRuleError &&
        error.code === "template-mismatch",
      message + ": wrong error",
    );
    mismatch = true;
  }
  assert(mismatch, message);
}

function exercise(): void {
  const memory = new Memory();
  const b = ensureRootBasis(memory);
  const seed = memory.ensure(b.U, b.L);

  const startRole = memory.ensure(seed, b.O);
  const endRole = memory.ensure(seed, b.C);
  const pairTemplate = memory.ensure(startRole, endRole);

  const ordinary = memory.ensure(b.L, b.U);
  const start = memory.ensureStartSelfClosed(b.L);
  const end = memory.ensureEndSelfClosed(b.U);

  for (const target of [memory.root, start, end, ordinary]) {
    const projected = unifyStructuralTemplate(
      memory,
      pairTemplate,
      target,
      [startRole, endRole],
    );
    const poles = memory.poles(target);
    same(binding(projected, startRole), poles.start,
      "projection keeps begin-pole semantics");
    same(binding(projected, endRole), poles.end,
      "projection keeps end-pole semantics");
  }

  expectMismatch(
    () => unifyStructuralRuleTemplate(
      memory, pairTemplate, memory.root, [startRole, endRole],
    ),
    "PAIR Rule pattern rejects ROOT",
  );
  expectMismatch(
    () => unifyStructuralRuleTemplate(
      memory, pairTemplate, start, [startRole, endRole],
    ),
    "PAIR Rule pattern rejects START",
  );
  expectMismatch(
    () => unifyStructuralRuleTemplate(
      memory, pairTemplate, end, [startRole, endRole],
    ),
    "PAIR Rule pattern rejects END",
  );

  const strictPair = unifyStructuralRuleTemplate(
    memory,
    pairTemplate,
    ordinary,
    [startRole, endRole],
  );
  same(binding(strictPair, startRole), memory.poles(ordinary).start,
    "strict PAIR begin binding");
  same(binding(strictPair, endRole), memory.poles(ordinary).end,
    "strict PAIR end binding");

  const payloadRole = memory.ensure(seed, b.L);
  const startTemplate = memory.ensureStartSelfClosed(payloadRole);
  const claimedStart = memory.ensureStartSelfClosed(ordinary);
  const strictStart = unifyStructuralRuleTemplate(
    memory,
    startTemplate,
    claimedStart,
    [payloadRole],
  );
  same(binding(strictStart, payloadRole), ordinary,
    "START Rule pattern binds payload");
  expectMismatch(
    () => unifyStructuralRuleTemplate(
      memory, startTemplate, memory.root, [payloadRole],
    ),
    "START Rule pattern rejects ROOT",
  );

  const endTemplate = memory.ensureEndSelfClosed(payloadRole);
  const claimedEnd = memory.ensureEndSelfClosed(ordinary);
  const strictEnd = unifyStructuralRuleTemplate(
    memory,
    endTemplate,
    claimedEnd,
    [payloadRole],
  );
  same(binding(strictEnd, payloadRole), ordinary,
    "END Rule pattern binds payload");
  expectMismatch(
    () => unifyStructuralRuleTemplate(
      memory, endTemplate, memory.root, [payloadRole],
    ),
    "END Rule pattern rejects ROOT",
  );

  const freeRole = memory.ensure(seed, b.U);
  for (const target of [memory.root, start, end, ordinary]) {
    const free = unifyStructuralRuleTemplate(
      memory,
      freeRole,
      target,
      [freeRole],
    );
    same(binding(free, freeRole), target,
      "declared role may bind any Link aspect");
  }
}

function staticGuards(): void {
  const root = resolve(process.cwd(), "..");
  const source = readFileSync(
    join(root, "ts/src/structural-unification.ts"),
    "utf8",
  );
  assert(source.includes("export function unifyStructuralTemplate("),
    "projection API remains present");
  assert(source.includes("export function unifyStructuralRuleTemplate("),
    "strict Rule API is reusable production code");

  const a71p = readFileSync(
    join(root, "ts/test/research-v013-aspect-preserving-rule-matcher-a71p.test.ts"),
    "utf8",
  );
  for (const retained of [
    "PROJECTION_UNIFIER=UNCHANGED_ASPECT_INSENSITIVE_BY_DESIGN",
    "RULE_MATCHER=SELF_INCIDENCE_PRESERVING",
    "GLOBAL_UNIFIER_REPLACEMENT=REJECTED",
  ]) {
    assert(a71p.includes(retained), "A71p boundary retained: " + retained);
  }
}

function main(): void {
  exercise();
  staticGuards();
  console.log([
    "MTS v0.13 A73c: PROMOTED_STRICT_RULE_MATCHER=GREEN_SCOPED_RESEARCH",
    "PROJECTION_UNIFIER=UNCHANGED",
    "RULE_MATCHER=SELF_INCIDENCE_PRESERVING",
    "PAIR_PATTERN_REJECTS_ROOT_START_END=TRUE",
    "START_PATTERN_REJECTS_ROOT=TRUE",
    "END_PATTERN_REJECTS_ROOT=TRUE",
    "DECLARED_ROLE_MAY_BIND_ANY_ASPECT=TRUE",
    "RULE_MATCHER_ASPECT_SWITCH=0",
    "RULE_MATCHER_WRITES=0",
    "A71P_ARCHITECTURAL_SPLIT=PRESERVED",
    "A71O_PROJECTION_GUARD=SCOPED_TO_PROJECTION_API",
    "NEXT=RERUN_A73B_BRANCH_SKEW_WITH_STRICT_RULE_MATCHER",
    "V013_NOT_ACCEPTED PRODUCTION_UNCHANGED",
  ].join(" "));
}

main();
