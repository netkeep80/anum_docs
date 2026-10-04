import {
  Memory,
  type LinkHandle,
} from "../src/memory.js";

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error("v0.15 DAS-A1 denoted ANet: " + message);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(
    Object.is(actual, expected),
    message + ": " + String(actual) + " !== " + String(expected),
  );
}

function setSame(
  actual: readonly LinkHandle[],
  expected: readonly LinkHandle[],
  message: string,
): void {
  const left = new Set(actual);
  const right = new Set(expected);
  assert(left.size === right.size, message + ": cardinality");
  for (const value of left) assert(right.has(value), message + ": member");
}

interface ResolvedSourceProfile {
  readonly bareTag: LinkHandle;
  readonly bindingTag: LinkHandle;
  readonly bundleTag: LinkHandle;
}

interface SourceFixture {
  readonly source: LinkHandle;
  readonly addBare: (value: LinkHandle) => void;
  readonly addBinding: (name: LinkHandle, value: LinkHandle) => void;
  readonly addBundle: (anchorName: LinkHandle, childSource: LinkHandle) => void;
}

/**
 * Research-only resolved source-ANet carrier.
 *
 * This stage is AFTER source/name/expression resolution and BEFORE publication
 * of the denoted semantic ANet. Occurrence identity remains Link-native.
 *
 *   source -> occurrence
 *   occurrence -> payload
 *
 *   payload = bareTag    -> value
 *           | bindingTag -> (name -> resolvedValue)
 *           | bundleTag  -> (anchorName -> childSource)
 *
 * Profile tags are selected Links. Host labels are explanatory only.
 * This is not proposed as final FORMAL or JSON syntax.
 */
function sourceFixture(
  memory: Memory,
  profile: ResolvedSourceProfile,
  fresh: () => LinkHandle,
): SourceFixture {
  const source = fresh();

  const addPayload = (payload: LinkHandle): void => {
    const occurrence = memory.ensure(fresh(), payload);
    memory.ensure(source, occurrence);
  };

  return Object.freeze({
    source,
    addBare(value: LinkHandle): void {
      addPayload(memory.ensure(profile.bareTag, value));
    },
    addBinding(name: LinkHandle, value: LinkHandle): void {
      addPayload(
        memory.ensure(
          profile.bindingTag,
          memory.ensure(name, value),
        ),
      );
    },
    addBundle(anchorName: LinkHandle, childSource: LinkHandle): void {
      addPayload(
        memory.ensure(
          profile.bundleTag,
          memory.ensure(anchorName, childSource),
        ),
      );
    },
  });
}

function sourcePayloads(
  memory: Memory,
  source: LinkHandle,
): readonly LinkHandle[] {
  const result: LinkHandle[] = [];
  for (const membership of memory.outgoing(source)) {
    if (membership === source) continue;
    const membershipPoles = memory.poles(membership);
    if (membershipPoles.start !== source) continue;
    const occurrencePoles = memory.poles(membershipPoles.end);
    result.push(occurrencePoles.end);
  }
  return Object.freeze(result);
}

interface BindingProjection {
  readonly coordinate: LinkHandle | null;
  readonly name: LinkHandle;
  readonly value: LinkHandle;
}

interface DenotationEvidence {
  readonly target: LinkHandle;
  readonly members: readonly LinkHandle[];
  readonly bindings: readonly BindingProjection[];
}

function targetMembers(
  memory: Memory,
  target: LinkHandle,
): readonly LinkHandle[] {
  const result: LinkHandle[] = [];
  for (const membership of memory.outgoing(target)) {
    if (membership === target) continue;
    const poles = memory.poles(membership);
    if (poles.start === target) result.push(poles.end);
  }
  return Object.freeze(result);
}

/**
 * Candidate denotation law.
 *
 * Root source:
 *   bare X       -> X is an explicit semantic ANet member
 *   Name : X     -> metamodel binding only; X is not implicit membership
 *   V : { ... }  -> define anchored sub-ANet V and publish its described Links
 *
 * Inside anchored V:
 *   bare X       -> contextual member V->X
 *   A : X        -> contextual name/member V->A + metamodel binding to X
 *   B : { ... }  -> contextual member V->B; nested anchor becomes V->B
 *
 * Final membership is Link-native:
 *
 *   x in M  iff  M->x exists.
 *
 * Returned JS arrays are read/evidence projections only.
 */
function denoteResolvedSourceAnet(
  memory: Memory,
  profile: ResolvedSourceProfile,
  source: LinkHandle,
  target: LinkHandle,
): DenotationEvidence {
  const bindings: BindingProjection[] = [];

  const publish = (member: LinkHandle): void => {
    memory.ensure(target, member);
  };

  const walk = (
    sourceRoot: LinkHandle,
    contextAnchor: LinkHandle | null,
  ): void => {
    for (const payload of sourcePayloads(memory, sourceRoot)) {
      const poles = memory.poles(payload);

      if (poles.start === profile.bareTag) {
        const member = contextAnchor === null
          ? poles.end
          : memory.ensure(contextAnchor, poles.end);
        publish(member);
        continue;
      }

      if (poles.start === profile.bindingTag) {
        const definition = memory.poles(poles.end);
        const name = definition.start;
        const value = definition.end;
        const coordinate = contextAnchor === null
          ? null
          : memory.ensure(contextAnchor, name);

        if (coordinate !== null) publish(coordinate);
        bindings.push(Object.freeze({ coordinate, name, value }));
        continue;
      }

      if (poles.start === profile.bundleTag) {
        const declaration = memory.poles(poles.end);
        const localAnchor = declaration.start;
        const childSource = declaration.end;
        const nestedAnchor = contextAnchor === null
          ? localAnchor
          : memory.ensure(contextAnchor, localAnchor);

        if (contextAnchor !== null) publish(nestedAnchor);
        walk(childSource, nestedAnchor);
        continue;
      }

      throw new Error(
        "v0.15 DAS-A1 denoted ANet: unsupported resolved-source payload",
      );
    }
  };

  walk(source, null);

  return Object.freeze({
    target,
    members: targetMembers(memory, target),
    bindings: Object.freeze(bindings),
  });
}

const memory = new Memory();
const R = memory.ensureRoot();
let cursor = memory.ensure(
  R,
  memory.ensureStartSelfClosed(R),
);
const fresh = (): LinkHandle => {
  cursor = memory.ensureStartSelfClosed(cursor);
  return cursor;
};

const profile = Object.freeze({
  bareTag: fresh(),
  bindingTag: fresh(),
  bundleTag: fresh(),
});
assert(
  profile.bareTag !== profile.bindingTag &&
    profile.bindingTag !== profile.bundleTag &&
    profile.bareTag !== profile.bundleTag,
  "profile tags are distinct",
);

const Theory = fresh();
const E = fresh();
const K = fresh();
const V = fresh();
const X = fresh();
const Y = fresh();
const B = fresh();
const C = fresh();
const A = fresh();

const ruleBody = fresh();
const Rule = memory.ensure(V, ruleBody);
const admission = memory.ensure(Theory, Rule);
const current = memory.ensure(E, K);

// Physical existence is deliberately established before semantic membership.
const physicalNoise = fresh();
memory.ensure(physicalNoise, Rule);

const vChildren = sourceFixture(memory, profile, fresh);
vChildren.addBare(X);
vChildren.addBare(Y);
vChildren.addBinding(A, R);

const bChildren = sourceFixture(memory, profile, fresh);
bChildren.addBare(C);
vChildren.addBundle(B, bChildren.source);

const emptyChildren = sourceFixture(memory, profile, fresh);
const EMPTY_BUNDLE_NAME = fresh();

const source = sourceFixture(memory, profile, fresh);
const RULE_NAME = fresh();
const CURRENT_ALIAS = fresh();
const EMPTY_SEQUENCE_NAME = fresh();

// Root definitions are metamodel bindings, not implicit target membership.
source.addBinding(RULE_NAME, Rule);
source.addBinding(CURRENT_ALIAS, current);
source.addBinding(EMPTY_SEQUENCE_NAME, R); // [] = R after element denotation.
source.addBundle(EMPTY_BUNDLE_NAME, emptyChildren.source);
source.addBundle(V, vChildren.source);

// Bare root entries explicitly publish semantic membership.
source.addBare(admission);
source.addBare(current);

// Distinct source occurrences, same denotation.
source.addBare(admission);

const M = fresh();

assert(
  !targetMembers(memory, M).includes(admission),
  "physical admission exists before membership publication",
);

const result = denoteResolvedSourceAnet(memory, profile, source.source, M);

const VX = memory.ensure(V, X);
const VY = memory.ensure(V, Y);
const VA = memory.ensure(V, A);
const VB = memory.ensure(V, B);
const VBC = memory.ensure(VB, C);

setSame(
  result.members,
  [VX, VY, VA, VB, VBC, admission, current],
  "exact denoted semantic ANet members",
);

assert(
  !result.members.includes(Rule),
  "named Rule binding is not implicit membership",
);
assert(
  !result.members.includes(R),
  "empty-sequence binding []=R is not implicit membership",
);
assert(
  !result.members.includes(EMPTY_BUNDLE_NAME),
  "root empty bundle contributes zero members",
);
assert(
  !result.members.includes(physicalNoise),
  "unrelated physical Link is not semantic membership",
);

same(
  result.members.filter((member) => member === admission).length,
  1,
  "duplicate denotation converges extensionally",
);

for (const member of result.members) {
  const witness = memory.ensure(M, member);
  assert(
    memory.outgoing(M).includes(witness),
    "membership authority is ordinary M->member Link",
  );
}

assert(
  result.bindings.some((binding) =>
    binding.coordinate === null &&
    binding.name === RULE_NAME &&
    binding.value === Rule
  ),
  "root Rule binding remains metamodel evidence",
);
assert(
  result.bindings.some((binding) =>
    binding.coordinate === VA &&
    binding.name === A &&
    binding.value === R
  ),
  "nested binding retains contextual coordinate + RHS",
);

// Same resolved meanings in reverse presentation order.
const reverseVChildren = sourceFixture(memory, profile, fresh);
const reverseBChildren = sourceFixture(memory, profile, fresh);
reverseBChildren.addBare(C);
reverseVChildren.addBundle(B, reverseBChildren.source);
reverseVChildren.addBinding(A, R);
reverseVChildren.addBare(Y);
reverseVChildren.addBare(X);

const reverseEmpty = sourceFixture(memory, profile, fresh);
const reverse = sourceFixture(memory, profile, fresh);
reverse.addBare(current);
reverse.addBare(admission);
reverse.addBundle(V, reverseVChildren.source);
reverse.addBundle(EMPTY_BUNDLE_NAME, reverseEmpty.source);
reverse.addBinding(EMPTY_SEQUENCE_NAME, R);
reverse.addBinding(CURRENT_ALIAS, current);
reverse.addBinding(RULE_NAME, Rule);

const M2 = fresh();
const reversed = denoteResolvedSourceAnet(
  memory,
  profile,
  reverse.source,
  M2,
);
setSame(
  reversed.members,
  result.members,
  "source entry order is nonsemantic",
);

// Current Link remains physical and named, but loses currentness if no bare
// membership is published.
const noCurrent = sourceFixture(memory, profile, fresh);
noCurrent.addBinding(RULE_NAME, Rule);
noCurrent.addBinding(CURRENT_ALIAS, current);
noCurrent.addBundle(V, reverseVChildren.source);
noCurrent.addBare(admission);

const M3 = fresh();
const withoutCurrent = denoteResolvedSourceAnet(
  memory,
  profile,
  noCurrent.source,
  M3,
);
assert(
  !withoutCurrent.members.includes(current),
  "physical/current alias without membership is not current",
);
const currentPoles = memory.poles(current);
same(currentPoles.start, E, "current start remains physical");
same(currentPoles.end, K, "current end remains physical");

console.log([
  "MTS_V015_DAS_A1=GREEN_RESEARCH",
  "TERMINOLOGY=ANET",
  "SOURCE_STAGE=POST_RESOLUTION_PRE_MEMBERSHIP",
  "ROOT_BINDING_IMPLIES_MEMBERSHIP=FALSE",
  "ROOT_BARE_IMPLIES_DIRECT_MEMBERSHIP=TRUE",
  "NESTED_BUNDLE=ANCHORED_CONTEXTUAL_LINKS",
  "NESTED_BINDING_COORDINATE_IS_MEMBER=TRUE",
  "EMPTY_ROOT_BUNDLE_MEMBER_COUNT=0",
  "EMPTY_SEQUENCE_DENOTATION=R",
  "PHYSICAL_EXISTENCE_IMPLIES_MEMBERSHIP=FALSE",
  "SEMANTIC_MEMBERSHIP_WITNESS=M_TO_MEMBER",
  "DUPLICATE_DENOTATION=CANONICAL_CONVERGENCE",
  "SOURCE_ENTRY_ORDER_SEMANTIC=FALSE",
  "CURRENTNESS_REQUIRES_MEMBERSHIP=TRUE",
  "FINAL_JSON_SURFACE=AUTHOR_REVIEW_PENDING",
].join(" "));
