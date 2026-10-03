import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
} from "../src/memory.js";
import {
  V013CurrentScopeCursor,
  defineV013WorkingScope,
} from "../src/v013-structural-execution.js";
import {
  discoverV013TriggeredRuleImages,
  reactV013StructuralScope,
} from "../src/v013-structural-execution.js";
import {
  defineStructuralInterpreter,
  defineStructuralRoleDictionary,
} from "../src/structural-rule.js";
import {
  V015FormalEvaluationError,
  defineV015GroundedUnaryEvaluationRule,
  defineV015UnaryEvaluationLifecycle,
  materializeV015ApplicationTerm,
  materializeV015CompletedValue,
  materializeV015EvaluationProfile,
  materializeV015EvaluationRequest,
  materializeV015RootEvaluationBoundary,
  readV015EvaluationProfile,
} from "../src/v015-formal-evaluation.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.15 evaluation: ${message}`);
}
function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}
function reject(
  code: V015FormalEvaluationError["code"],
  effect: () => unknown,
  label: string,
): void {
  try { effect(); } catch (error) {
    assert(error instanceof V015FormalEvaluationError, `${label}: wrong error type`);
    same(error.code, code, `${label}: exact code`);
    return;
  }
  throw new Error(`v0.15 evaluation: ${label}: expected rejection`);
}

interface Fixture {
  readonly memory: Memory;
  readonly profileRoot: LinkHandle;
  readonly theory: LinkHandle;
  readonly interpreter: LinkHandle;
  readonly K: LinkHandle;
  readonly F: LinkHandle;
  readonly T: LinkHandle;
  readonly FALSE: LinkHandle;
  readonly fresh: () => LinkHandle;
}

function fixture(): Fixture {
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  let cursor = memory.ensure(basis.U, basis.L);
  const fresh = (): LinkHandle => (cursor = memory.ensure(cursor, basis.C));
  const callTag = fresh();
  const doneTag = fresh();
  const profileRoot = materializeV015EvaluationProfile(memory, callTag, doneTag);
  const theory = fresh();
  const dictionary = defineStructuralRoleDictionary(memory, []);
  const interpreter = defineStructuralInterpreter(memory, dictionary, profileRoot, theory);
  const K = fresh();
  const F = fresh();
  const T = fresh();
  const FALSE = fresh();

  defineV015UnaryEvaluationLifecycle(memory, theory, profileRoot, fresh());
  defineV015GroundedUnaryEvaluationRule(
    memory, theory, profileRoot, fresh(), F, T, FALSE,
  );
  defineV015GroundedUnaryEvaluationRule(
    memory, theory, profileRoot, fresh(), F, FALSE, T,
  );
  return Object.freeze({ memory, profileRoot, theory, interpreter, K, F, T, FALSE, fresh });
}

function request(f: Fixture, arg: LinkHandle): LinkHandle {
  return materializeV015EvaluationRequest(f.memory, f.profileRoot, f.F, arg);
}

function run(
  f: Fixture,
  program: LinkHandle,
  expected: LinkHandle,
  label: string,
): { readonly initial: LinkHandle; readonly final: LinkHandle; readonly reactions: number } {
  const boundary = materializeV015RootEvaluationBoundary(f.memory, f.K);
  const initial = f.memory.ensure(boundary, program);
  const scope = defineV013WorkingScope(
    f.memory, f.fresh(), f.interpreter, [initial],
  );
  const cursor = new V013CurrentScopeCursor(f.memory, scope);
  let reactions = 0;

  while (true) {
    const result = reactV013StructuralScope(f.memory, cursor, f.fresh());
    if (result.quiescent) break;
    same(result.handoffCount, 1, `${label}: active reaction publishes atomically`);
    reactions += 1;
    assert(reactions < 20, `${label}: reaches fixed point`);
  }

  const members = cursor.members();
  same(members.length, 1, `${label}: one final stable member`);
  const stable = f.memory.ensure(f.K, expected);
  same(members[0], stable, `${label}: stable K->value`);
  return Object.freeze({ initial, final: stable, reactions });
}

// Evaluation profile is structural and replay is read-only.
{
  const f = fixture();
  const before = f.memory.linkCount;
  const profile = readV015EvaluationProfile(f.memory, f.profileRoot);
  same(f.memory.linkCount, before, "profile replay performs zero writes");
  assert(profile.callTag !== profile.doneTag, "CALL and DONE roles are distinct");
  reject(
    "invalid-evaluation-profile",
    () => materializeV015EvaluationProfile(f.memory, profile.callTag, profile.callTag),
    "collapsed CALL/DONE profile",
  );
}

// F->x is only a constructed Link. It remains passive under a Theory whose
// executable rules are indexed by the selected CALL/DONE profile.
{
  const f = fixture();
  const term = materializeV015ApplicationTerm(f.memory, f.F, f.T);
  const boundary = materializeV015RootEvaluationBoundary(f.memory, f.K);
  const active = f.memory.ensure(boundary, term);
  const scope = defineV013WorkingScope(f.memory, f.fresh(), f.interpreter, [active]);
  const cursor = new V013CurrentScopeCursor(f.memory, scope);
  same(
    discoverV013TriggeredRuleImages(f.memory, f.theory, active).length,
    0,
    "plain F->x has no evaluation Rule match",
  );
  const reaction = reactV013StructuralScope(f.memory, cursor, f.fresh());
  same(reaction.quiescent, true, "plain construction is quiescent data");
  same(reaction.handoffCount, 0, "plain construction performs no handoff");
  same(cursor.members()[0], active, "plain constructed Link remains current unchanged");
}

// Explicit evaluation request executes and publishes a completed stable result.
{
  const f = fixture();
  const program = request(f, f.T);
  const result = run(f, program, f.FALSE, "F(T)");
  same(result.reactions, 2, "depth-1 = function Rule + PUBLISH");
  const done = materializeV015CompletedValue(f.memory, f.profileRoot, f.FALSE);
  assert(result.final !== program, "stable result is not request");
  assert(result.final !== done, "stable result is not DONE carrier");
  assert(result.final !== result.initial, "stable result is not initial active member");
}

// Mandatory falsifier: outer F must not consume the inner Request Link.
// The initial nested state has exactly one match: generic OPEN.
{
  const f = fixture();
  const inner = request(f, f.T);
  const outer = request(f, inner);
  const boundary = materializeV015RootEvaluationBoundary(f.memory, f.K);
  const active = f.memory.ensure(boundary, outer);
  same(
    discoverV013TriggeredRuleImages(f.memory, f.theory, active).length,
    1,
    "nested initial state matches OPEN only, not grounded F(input) Rule",
  );
  const result = run(f, outer, f.T, "F(F(T))");
  same(result.reactions, 5, "depth-2 = OPEN + inner + RESUME + outer + PUBLISH");
}

// The same nested lifecycle works for the other truth value and therefore is
// structural rather than a special-case expected-result branch.
{
  const f = fixture();
  const inner = request(f, f.FALSE);
  const outer = request(f, inner);
  const result = run(f, outer, f.FALSE, "F(F(FALSE))");
  same(result.reactions, 5, "second depth-2 path uses identical lifecycle");
}

// A source-like constructed nested pair and an execution-request tree are exact
// different Links. Existence of the former cannot implicitly execute the latter.
{
  const f = fixture();
  const innerTerm = materializeV015ApplicationTerm(f.memory, f.F, f.T);
  const nestedTerm = materializeV015ApplicationTerm(f.memory, f.F, innerTerm);
  const nestedRequest = request(f, request(f, f.T));
  assert(nestedTerm !== nestedRequest, "construction != nested evaluation request");
}

console.log([
  "MTS v0.15 G0 evaluation boundary:",
  "CONSTRUCTION_NE_EVALUATION=TRUE",
  "TERM_F_X=PASSIVE_LINK",
  "EVALUATION_REQUEST=STRUCTURAL_PROFILE_ROLE",
  "DONE=STRUCTURAL_PROFILE_ROLE",
  "NESTED_F_F_T=GREEN",
  "OUTER_RECEIVES_COMPLETED_INNER_VALUE=TRUE",
  "OPEN_RESUME_PUBLISH=RULE_DRIVEN",
  "HOST_FUNCTION_DISPATCH=0",
  "HOST_LIFECYCLE_DISPATCH=0",
].join(" "));
