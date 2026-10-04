import {
  materializeExactSequence,
} from "../src/exact-sequence.js";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
} from "../src/memory.js";
import {
  defineV013GroundedExecutionScope,
  reactV013GroundedScope,
  V013GroundedScopeCursor,
} from "../src/v013-grounded-execution.js";

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error("v0.15 M6B S0 self-host opacity: " + message);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(
    Object.is(actual, expected),
    `${message}: ${String(actual)} !== ${String(expected)}`,
  );
}

function sameMembers(
  actual: readonly LinkHandle[],
  expected: readonly LinkHandle[],
  message: string,
): void {
  same(actual.length, expected.length, message + " cardinality");
  for (const member of expected) {
    assert(actual.includes(member), message + " missing member");
  }
}

interface Fixture {
  readonly memory: Memory;
  readonly theory: LinkHandle;
  readonly K: LinkHandle;
  readonly payloadK: LinkHandle;
  readonly control: LinkHandle;
  readonly step: LinkHandle;
  readonly X: LinkHandle;
  readonly Y: LinkHandle;
  readonly template: LinkHandle;
  readonly swapTemplate: LinkHandle;
  readonly packedTemplate: LinkHandle;
  readonly fresh: () => LinkHandle;
}

function fixtureBeforeFreshRuntimeInput(): Fixture {
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  let cursor = memory.ensure(basis.U, basis.L);
  const fresh = (): LinkHandle => (
    cursor = memory.ensure(cursor, cursor === basis.U ? basis.C : basis.O)
  );

  const theory = fresh();
  const K = fresh();
  const payloadK = fresh();
  const control = fresh();
  const step = fresh();
  const X = fresh();
  const Y = fresh();

  // Parameteric source rule represented only as ordinary pre-authored Links.
  // Under S0, X/Y have no placeholder authority.
  const template = memory.ensure(X, Y);
  const swapTemplate = memory.ensure(Y, X);
  const parametericImage = materializeExactSequence(memory, [swapTemplate]);
  memory.ensure(theory, memory.ensure(template, parametericImage));

  // A finite exact control program can advance fixed control atoms.
  const controlImage = materializeExactSequence(memory, [step]);
  memory.ensure(theory, memory.ensure(control, controlImage));

  // A generic-looking packed state remains exact under S0:
  //   CONTROL -> X
  // is not a pattern for CONTROL -> arbitraryFreshPayload.
  const packedTemplate = memory.ensure(control, X);
  const packedImage = materializeExactSequence(memory, [swapTemplate]);
  memory.ensure(theory, memory.ensure(packedTemplate, packedImage));

  return Object.freeze({
    memory,
    theory,
    K,
    payloadK,
    control,
    step,
    X,
    Y,
    template,
    swapTemplate,
    packedTemplate,
    fresh,
  });
}

function run(
  f: Fixture,
  members: readonly LinkHandle[],
): {
  readonly members: readonly LinkHandle[];
  readonly matches: number;
  readonly handoff: 0 | 1;
} {
  const scope = defineV013GroundedExecutionScope(
    f.memory,
    f.fresh(),
    f.theory,
    members,
  );
  const cursor = new V013GroundedScopeCursor(f.memory, scope);
  const reaction = reactV013GroundedScope(f.memory, cursor, f.fresh());
  return Object.freeze({
    members: cursor.members(),
    matches: reaction.matchedRelations,
    handoff: reaction.handoffCount,
  });
}

const f = fixtureBeforeFreshRuntimeInput();

// Runtime data is deliberately fresh AFTER the finite exact Theory exists.
const A = f.fresh();
const C = f.fresh();
const actual = f.memory.ensure(A, C);

same(
  f.memory.find(C, A),
  undefined,
  "swapped output does not pre-exist before self-host attempt",
);

// 1. Direct S0 execution treats the parameteric template literally.
// Pair(X,Y) is not an authority to decompose fresh Pair(A,C).
{
  const current = f.memory.ensure(f.K, actual);
  const result = run(f, [current]);

  same(result.matches, 0, "fresh structured input has no exact grounded match");
  same(result.handoff, 0, "no exact match means no reaction handoff");
  sameMembers(result.members, [current], "fresh structured input survives opaque");

  same(
    f.memory.find(C, A),
    undefined,
    "direct S0 reaction does not synthesize swapped fresh sublinks",
  );
}

// 2. Adding a finite exact control program does not create a hidden join.
// The fixed CONTROL member advances; the separate fresh payload is preserved.
// Pointwise Scope lift cannot correlate them under J0.
{
  const controlTruth = f.memory.ensure(f.K, f.control);
  const payloadTruth = f.memory.ensure(f.payloadK, actual);
  const result = run(f, [controlTruth, payloadTruth]);

  same(result.matches, 1, "only fixed control atom matches");
  same(result.handoff, 1, "control reaction publishes one successor");
  sameMembers(
    result.members,
    [
      f.memory.ensure(f.K, f.step),
      payloadTruth,
    ],
    "control advances while opaque payload is preserved independently",
  );

  same(
    f.memory.find(C, A),
    undefined,
    "pointwise MP2 lift does not expose or reconstruct payload poles",
  );
}

// 3. Packing control + payload into one Link does not help exact matching.
// A pre-authored CONTROL->X carrier is one exact Link, not a structural pattern.
{
  const packedActual = f.memory.ensure(f.control, actual);
  const current = f.memory.ensure(f.K, packedActual);
  const result = run(f, [current]);

  same(result.matches, 0, "packed fresh payload still fails exact identity");
  sameMembers(result.members, [current], "packed opaque state survives");
  assert(
    packedActual !== f.packedTemplate,
    "fresh packed state is distinct from pre-authored template carrier",
  );

  same(
    f.memory.find(C, A),
    undefined,
    "packing alone supplies no structural decomposition or substitution",
  );
}

// 4. S0 may preserve an arbitrary fresh Link in K-position and advance a fixed
// control endpoint, but K-preservation is not decomposition of K.
// This rules out the loophole "carry the payload as context and inspect later".
{
  const payloadAsContext = f.memory.ensure(actual, f.control);
  const result = run(f, [payloadAsContext]);

  same(result.matches, 1, "fixed control relation fires under fresh K");
  sameMembers(
    result.members,
    [f.memory.ensure(actual, f.step)],
    "S0 preserves opaque fresh K while changing only fixed endpoint",
  );

  same(
    f.memory.find(C, A),
    undefined,
    "preserving fresh K does not expose its internal poles",
  );
}

// 5. META-A-style external grounding immediately removes the barrier:
// host structural knowledge materializes the fresh output and exact admission;
// the unchanged S0 executor then succeeds.
//
// This is intentionally NOT evidence for META-B. It isolates the missing
// authority: decomposition/binding/construction must come from somewhere other
// than exact identity MP itself.
{
  const expected = f.memory.ensure(C, A);
  const image = materializeExactSequence(f.memory, [expected]);
  const groundedRelation = f.memory.ensure(actual, image);
  f.memory.ensure(f.theory, groundedRelation);

  const current = f.memory.ensure(f.K, actual);
  const result = run(f, [current]);

  same(result.matches, 1, "externally grounded exact relation matches");
  sameMembers(
    result.members,
    [f.memory.ensure(f.K, expected)],
    "unchanged S0 executor consumes externally grounded swap",
  );
}

console.log([
  "MTS_V015_META_M6B=S0_SELFHOST_FRESHNESS_FALSIFIER_GREEN",
  "S0_MATCH_POWER=EXACT_IDENTITY",
  "FRESH_NESTED_SUBLINKS=OPAQUE_TO_S0",
  "POINTWISE_SCOPE_LIFT_DOES_NOT_JOIN_CONTROL_AND_PAYLOAD=TRUE",
  "PACKING_WITHOUT_STRUCTURAL_MATCH_DOES_NOT_BIND=TRUE",
  "K_PRESERVATION_IS_NOT_LINK_DECOMPOSITION=TRUE",
  "S0_ALONE_SYNTHESIZES_FRESH_SWAP=FALSE",
  "META_A_EXTERNAL_GROUNDING_RESCUES_UNCHANGED_S0=TRUE",
  "META_B_WITH_S0_REQUIRES_ADDITIONAL_REFLECTION_OR_CONSTRUCTION_AUTHORITY=TRUE",
  "CROSS_MEMBER_JOIN_REQUIRED=FALSE",
  "ACCEPTED_ARCHITECTURE_DECISION=OPEN",
].join(" "));
