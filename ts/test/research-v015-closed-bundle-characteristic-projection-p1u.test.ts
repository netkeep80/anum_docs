import { materializeExactSequence } from "../src/exact-sequence.js";
import { Memory, ensureRootBasis, type LinkHandle } from "../src/memory.js";
import {
  admitStructuralRule,
  defineStructuralInterpreter,
  defineStructuralRoleDictionary,
  defineStructuralRule,
} from "../src/structural-rule.js";
import {
  V013CurrentScopeCursor,
  defineV013WorkingScope,
  reactV013StructuralScope,
} from "../src/v013-structural-execution.js";

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error("v0.15 P1u characteristic projection exactness: " + message);
}
function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), message);
}

interface Fixture {
  readonly memory: Memory;
  readonly L: LinkHandle;
  readonly U: LinkHandle;
  readonly sourceBundle: readonly LinkHandle[];
  readonly a: LinkHandle;
  readonly b: LinkHandle;
  readonly c: LinkHandle;
  readonly evaluate: (
    projectedMembers: readonly LinkHandle[],
    query: LinkHandle,
  ) => LinkHandle;
}

function fixture(): Fixture {
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  let cursor = memory.ensure(basis.O, basis.U);
  const fresh = (): LinkHandle => {
    cursor = memory.ensure(cursor, basis.C);
    return cursor;
  };

  const CHI = fresh();
  const a = fresh();
  const b = fresh();
  const c = fresh();
  const sourceBundle = Object.freeze([a, b]);

  const application = (x: LinkHandle): LinkHandle =>
    memory.ensure(CHI, x);
  const state = (x: LinkHandle, result: LinkHandle): LinkHandle =>
    memory.ensure(application(x), result);

  const evaluate = (
    projectedMembers: readonly LinkHandle[],
    query: LinkHandle,
  ): LinkHandle => {
    // Each call gets an independent exact execution Theory so only the supplied
    // projected membership set carries authority.
    const executionTheory = fresh();
    const grammar = fresh();
    const emptyDictionary = defineStructuralRoleDictionary(memory, []);

    for (const member of projectedMembers) {
      const before = state(member, basis.U);
      const after = state(member, basis.L);
      const relation = defineStructuralRule(
        memory,
        emptyDictionary,
        memory.ensure(
          before,
          materializeExactSequence(memory, [after]),
        ),
      );
      const admission = admitStructuralRule(
        memory,
        executionTheory,
        relation,
      );
      const triggerKey = memory.poles(memory.poles(before).end).start;
      memory.ensure(triggerKey, admission);
    }

    const interpreter = defineStructuralInterpreter(
      memory,
      emptyDictionary,
      grammar,
      executionTheory,
    );
    const initial = state(query, basis.U);
    const scope = defineV013WorkingScope(
      memory,
      fresh(),
      interpreter,
      [initial],
    );
    const current = new V013CurrentScopeCursor(memory, scope);
    reactV013StructuralScope(memory, current, fresh());
    same(current.members().length, 1, "single-valued characteristic result");
    return memory.poles(current.members()[0]!).end;
  };

  return Object.freeze({
    memory,
    L: basis.L,
    U: basis.U,
    sourceBundle,
    a,
    b,
    c,
    evaluate,
  });
}

// Exact all-and-only projection refines closed-bundle membership.
{
  const f = fixture();
  same(f.evaluate(f.sourceBundle, f.a), f.L, "exact projection: a -> L");
  same(f.evaluate(f.sourceBundle, f.b), f.L, "exact projection: b -> L");
  same(f.evaluate(f.sourceBundle, f.c), f.U, "exact projection: c -> U");
}

// Incomplete projection is semantically wrong: a true member becomes U.
{
  const f = fixture();
  same(f.evaluate([f.a], f.b), f.U, "missing b yields false negative U");
}

// Unsound projection is semantically wrong: a nonmember becomes L.
{
  const f = fixture();
  same(
    f.evaluate([f.a, f.b, f.c], f.c),
    f.L,
    "extra c yields false positive L",
  );
}

// Reordering exact source members is harmless.
{
  const f = fixture();
  same(f.evaluate([f.b, f.a], f.a), f.L, "reordered exact projection: a -> L");
  same(f.evaluate([f.b, f.a], f.b), f.L, "reordered exact projection: b -> L");
  same(f.evaluate([f.b, f.a], f.c), f.U, "reordered exact projection: c -> U");
}

console.log([
  "MTS_V015_P1U_CHARACTERISTIC_PROJECTION_EXACTNESS=GREEN_RESEARCH",
  "REFINEMENT_IFF=PROJECTED_POSITIVE_DOMAIN_EQUALS_CLOSED_BUNDLE",
  "MISSING_MEMBER=FALSE_NEGATIVE_U",
  "EXTRA_MEMBER=FALSE_POSITIVE_L",
  "ORDER_SEMANTIC=FALSE",
  "COMPILER_SOUNDNESS_OBLIGATION=NO_EXTRA_MEMBERS",
  "COMPILER_COMPLETENESS_OBLIGATION=NO_MISSING_MEMBERS",
  "LEAN_ROCQ_REFINEMENT_TARGET=OPEN",
].join(" "));
