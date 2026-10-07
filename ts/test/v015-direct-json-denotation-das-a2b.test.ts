import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
} from "../src/memory.js";
import { materializeExactSequence } from "../src/exact-sequence.js";
import {
  materializeNativeSyntaxGrammar,
  type NativeSyntaxGrammarRuleSpec,
} from "../src/native-syntax-grammar.js";
import { materializeV015ContextualNamePath } from "../src/v015-link-definition.js";
import { materializeV012StringAnum } from "../src/v012-string-anum.js";
import {
  denoteV015ResolvedSourceAnet,
  materializeV015SourceAnetProfile,
  type V015SourceAnetProfile,
} from "../src/v015-source-anet.js";
import {
  V015DirectJsonSourceError,
  compileV015DirectJsonSourceAnet,
} from "../src/v015-direct-json-source.js";

// Integration split provenance: direct-JSON/denotation subset of GREEN #1989 DAS-A2; no production semantics are changed.

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error("v0.15 DAS-A2 native source ANet: " + message);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(
    Object.is(actual, expected),
    message + ": " + String(actual) + " !== " + String(expected),
  );
}

function setSame(
  actual: ReadonlySet<LinkHandle>,
  expected: readonly LinkHandle[],
  message: string,
): void {
  assert(actual.size === new Set(expected).size, message + ": cardinality");
  for (const value of expected) assert(actual.has(value), message + ": member");
}

const memory = new Memory();
const basis = ensureRootBasis(memory);

let cursor = memory.ensure(basis.U, basis.L);
const fresh = (): LinkHandle => {
  cursor = memory.ensureStartSelfClosed(cursor);
  return cursor;
};

const syntaxTag = fresh();
const markerSeed = fresh();

const profile: V015SourceAnetProfile = Object.freeze({
  blockForm: fresh(),
  bareForm: fresh(),
  bindingForm: fresh(),
  bundleForm: fresh(),
  itemRole: fresh(),
  bareValueRole: fresh(),
  bindingNameRole: fresh(),
  bindingValueRole: fresh(),
  bundleAnchorRole: fresh(),
  bundleBodyRole: fresh(),
});

const rules: readonly NativeSyntaxGrammarRuleSpec[] = [
  {
    form: profile.blockForm,
    fields: [
      { role: profile.itemRole, target: "child", min: 0, max: null },
    ],
  },
  {
    form: profile.bareForm,
    fields: [
      { role: profile.bareValueRole, target: "carrier", min: 1, max: 1 },
    ],
  },
  {
    form: profile.bindingForm,
    fields: [
      { role: profile.bindingNameRole, target: "carrier", min: 1, max: 1 },
      { role: profile.bindingValueRole, target: "carrier", min: 1, max: 1 },
    ],
  },
  {
    form: profile.bundleForm,
    fields: [
      { role: profile.bundleAnchorRole, target: "carrier", min: 1, max: 1 },
      { role: profile.bundleBodyRole, target: "child", min: 1, max: 1 },
    ],
  },
];

const grammarRoot = materializeNativeSyntaxGrammar(memory, basis, {
  syntaxTag,
  markerSeed,
  rules,
});

const sourceAnetProfileRoot = materializeV015SourceAnetProfile(
  memory,
  profile,
);


const contextualNameCarrierCache = new Map<string, LinkHandle>();

function localNameCarrier(name: string): LinkHandle {
  const known = contextualNameCarrierCache.get(name);
  if (known !== undefined) return known;
  const carrier = materializeV012StringAnum(
    memory,
    basis,
    new TextEncoder().encode(name),
  ).anumLink;
  contextualNameCarrierCache.set(name, carrier);
  return carrier;
}

function absoluteName(name: string): LinkHandle {
  if (name === "R") return basis.R;
  return materializeV015ContextualNamePath(
    memory,
    basis,
    basis.R,
    [localNameCarrier(name)],
    true,
  );
}

const DIRECT_THEORY = absoluteName("Theory");
const DIRECT_A = absoluteName("A");
const DIRECT_V = absoluteName("V");
const DIRECT_X = absoluteName("X");
const DIRECT_Y = absoluteName("Y");
const DIRECT_BODY = absoluteName("Body");
const DIRECT_E = absoluteName("E");
const DIRECT_K = absoluteName("K");
const DIRECT_RULE_NAME = absoluteName("Rule");
const DIRECT_CURRENT_ALIAS = absoluteName("Current");
const DIRECT_ONE_R_NAME = absoluteName("OneR");
const DIRECT_TWO_R_NAME = absoluteName("TwoR");
const DIRECT_NESTED_EMPTY_NAME = absoluteName("NestedEmpty");

function compileDirectJsonToNativeSourceAnet(text: string): LinkHandle {
  return compileV015DirectJsonSourceAnet(
    memory,
    basis,
    grammarRoot,
    sourceAnetProfileRoot,
    new TextEncoder().encode(text),
  ).sourceAset;

const directJson = [
  "{",
  "  \"Rule\": \"V->Body\",",
  "  \"Current\": \"E->K\",",
  "  \"Empty\": [],",
  "  \"OneR\": [\"R\"],",
  "  \"TwoR\": [\"R\",\"R\"],",
  "  \"NestedEmpty\": [[]],",
  "  \"V\": {",
  "    \"X\": null,",
  "    \"Y\": null",
  "  },",
  "  \"Theory->Rule\": null,",
  "  \"E->K\": null",
  "}",
].join("\n");

const directSource = compileDirectJsonToNativeSourceAnet(directJson);
const direct = denoteV015ResolvedSourceAnet(
  memory,
  basis,
  grammarRoot,
  sourceAnetProfileRoot,
  directSource,
);

const DIRECT_RULE = memory.ensure(DIRECT_V, DIRECT_BODY);
const DIRECT_CURRENT = memory.ensure(DIRECT_E, DIRECT_K);
const DIRECT_VX = memory.ensure(DIRECT_V, DIRECT_X);
const DIRECT_VY = memory.ensure(DIRECT_V, DIRECT_Y);
const DIRECT_ADMISSION = memory.ensure(DIRECT_THEORY, DIRECT_RULE);

setSame(
  direct.members,
  [DIRECT_VX, DIRECT_VY, DIRECT_ADMISSION, DIRECT_CURRENT],
  "direct JSON -> native source ANet -> semantic ANet",
);

assert(
  !direct.members.has(DIRECT_RULE),
  "direct JSON Rule binding is metamodel-only",
);
assert(
  !direct.members.has(basis.R),
  "direct JSON Empty:[] binds R without implicit membership",
);

assert(
  direct.bindings.some((binding) =>
    binding.coordinate === null &&
    binding.name === DIRECT_RULE_NAME &&
    binding.value === DIRECT_RULE
  ),
  "direct JSON preserves Rule binding",
);

assert(
  direct.bindings.some((binding) =>
    binding.coordinate === null &&
    binding.name === DIRECT_CURRENT_ALIAS &&
    binding.value === DIRECT_CURRENT
  ),
  "direct JSON preserves Current binding",
);

const oneRCarrier = materializeExactSequence(memory, [basis.R]);
const twoRCarrier = materializeExactSequence(memory, [basis.R, basis.R]);
assert(oneRCarrier !== basis.R, "ExactSequence [R] is distinct from []=R");
assert(twoRCarrier !== oneRCarrier, "ExactSequence [R,R] is distinct from [R]");

assert(
  direct.bindings.some((binding) =>
    binding.coordinate === null &&
    binding.name === DIRECT_ONE_R_NAME &&
    binding.value === oneRCarrier
  ),
  "direct JSON OneR uses ExactSequence",
);
assert(
  direct.bindings.some((binding) =>
    binding.coordinate === null &&
    binding.name === DIRECT_TWO_R_NAME &&
    binding.value === twoRCarrier
  ),
  "direct JSON TwoR preserves second R position",
);
assert(
  direct.bindings.some((binding) =>
    binding.coordinate === null &&
    binding.name === DIRECT_NESTED_EMPTY_NAME &&
    binding.value === oneRCarrier
  ),
  "direct JSON [[]] composes inner []=R to ExactSequence [R]",
);
assert(
  !direct.members.has(oneRCarrier) && !direct.members.has(twoRCarrier),
  "array RHS carriers remain metamodel bindings without bare membership",
);

const reverseDirectJson = [
  "{",
  "  \"E->K\": null,",
  "  \"Theory->Rule\": null,",
  "  \"V\": {",
  "    \"Y\": null,",
  "    \"X\": null",
  "  },",
  "  \"NestedEmpty\": [[]],",
  "  \"TwoR\": [\"R\",\"R\"],",
  "  \"OneR\": [\"R\"],",
  "  \"Empty\": [],",
  "  \"Current\": \"E->K\",",
  "  \"Rule\": \"V->Body\"",
  "}",
].join("\n");

const reverseDirectSource =
  compileDirectJsonToNativeSourceAnet(reverseDirectJson);
const reverseDirect = denoteV015ResolvedSourceAnet(
  memory,
  basis,
  grammarRoot,
  sourceAnetProfileRoot,
  reverseDirectSource,
);
setSame(
  reverseDirect.members,
  [...direct.members],
  "direct JSON object order is nonsemantic",
);

const noCurrentDirectJson = [
  "{",
  "  \"Rule\": \"V->Body\",",
  "  \"Current\": \"E->K\",",
  "  \"V\": {",
  "    \"X\": null,",
  "    \"Y\": null",
  "  },",
  "  \"Theory->Rule\": null",
  "}",
].join("\n");

const noCurrentDirect = denoteV015ResolvedSourceAnet(
  memory,
  basis,
  grammarRoot,
  sourceAnetProfileRoot,
  compileDirectJsonToNativeSourceAnet(noCurrentDirectJson),
);
assert(
  !noCurrentDirect.members.has(DIRECT_CURRENT),
  "direct JSON binding/physical E->K without bare member is not current",
);

for (const bad of [
  "{\"A\":null,\"A\":null}",
  "{\"A\":null,\"\\u0041\":null}",
]) {
  const beforeInvalidJson = memory.linkCount;
  let rejected = false;
  try {
    compileDirectJsonToNativeSourceAnet(bad);
  } catch (error) {
    rejected = error instanceof V015DirectJsonSourceError &&
      error.code === "duplicate-key";
  }
  assert(rejected, "duplicate decoded JSON key fails closed");
  same(
    memory.linkCount,
    beforeInvalidJson,
    "duplicate-key validation fails before source materialization",
  );
}

// DAS-03 mandatory scalar binding vectors. Bindings preserve metamodel
// evidence but do not publish their RHS as semantic membership.
const bindRootSource = compileDirectJsonToNativeSourceAnet(
  '{"A":"R"}',
);
const bindRoot = denoteV015ResolvedSourceAnet(
  memory,
  basis,
  grammarRoot,
  sourceAnetProfileRoot,
  bindRootSource,
);
same(bindRoot.members.size, 0, "A:R binding does not publish R");
assert(
  bindRoot.bindings.some((binding) =>
    binding.name === DIRECT_A && binding.value === basis.R
  ),
  "A:R preserves the explicit binding",
);

const bindCurrentSource = compileDirectJsonToNativeSourceAnet(
  '{"W":"E->K"}',
);
const bindCurrent = denoteV015ResolvedSourceAnet(
  memory,
  basis,
  grammarRoot,
  sourceAnetProfileRoot,
  bindCurrentSource,
);
same(
  bindCurrent.members.size,
  0,
  "W:E->K binding does not create currentness",
);
assert(
  bindCurrent.bindings.some((binding) =>
    binding.value === DIRECT_CURRENT
  ),
  "W:E->K preserves the resolved physical Link as binding value",
);

// DAS-01 structured binding-head boundary. Structured bare heads are supported
// as direct semantic members; structured binder identities remain outside the
// current bounded source fragment and must fail closed instead of guessing a
// host-side binder meaning.
let structuredBindingHeadRejected = false;
try {
  compileDirectJsonToNativeSourceAnet('{"A->B":"R"}');
} catch (error) {
  structuredBindingHeadRejected =
    error instanceof V015DirectJsonSourceError &&
    error.code === "invalid-shape";
}
assert(
  structuredBindingHeadRejected,
  "structured binding head fails closed in the current bounded v0.15 fragment",
);

// DAS-07 mandatory vector: distinct source/model identities may denote the
// same semantic ANet. Source identity is therefore not recoverable from
// denotation alone.
const emptyDirectSource = compileDirectJsonToNativeSourceAnet("{}");
const duplicateAliasDirectSource = compileDirectJsonToNativeSourceAnet(
  '{"A":"X","B":"X"}',
);
assert(
  emptyDirectSource !== duplicateAliasDirectSource,
  "distinct source ANets remain distinct even when denotation is equal",
);
const emptyDirectDenotation = denoteV015ResolvedSourceAnet(
  memory,
  basis,
  grammarRoot,
  sourceAnetProfileRoot,
  emptyDirectSource,
);
const duplicateAliasDenotation = denoteV015ResolvedSourceAnet(
  memory,
  basis,
  grammarRoot,
  sourceAnetProfileRoot,
  duplicateAliasDirectSource,
);
same(emptyDirectDenotation.members.size, 0, "empty source denotes no members");
same(
  duplicateAliasDenotation.members.size,
  0,
  "two aliases of one resolved Link remain metamodel-only",
);
same(
  duplicateAliasDenotation.bindings.length,
  2,
  "distinct A/B source bindings are preserved despite equal RHS denotation",
);
same(
  duplicateAliasDenotation.bindings[0]?.value,
  duplicateAliasDenotation.bindings[1]?.value,
  "A:X and B:X resolve to the same semantic Link value",
);

// DAS-08 mandatory currentness move: semantic currentness follows membership,
// not physical Link existence or an alias.
const DIRECT_K1 = absoluteName("K1");
const DIRECT_CURRENT_1 = memory.ensure(DIRECT_E, DIRECT_K1);
const movedCurrentSource = compileDirectJsonToNativeSourceAnet(
  '{"E->K1":null}',
);
const movedCurrent = denoteV015ResolvedSourceAnet(
  memory,
  basis,
  grammarRoot,
  sourceAnetProfileRoot,
  movedCurrentSource,
);
assert(
  movedCurrent.members.has(DIRECT_CURRENT_1),
  "replacement E->K1 membership becomes current",
);
assert(
  !movedCurrent.members.has(DIRECT_CURRENT),
  "old physical E->K loses currentness when its membership is absent",
);
same(
  memory.poles(DIRECT_CURRENT).start,
  DIRECT_E,
  "old E->K remains physically materialized after currentness moves",
);
same(
  memory.poles(DIRECT_CURRENT).end,
  DIRECT_K,
  "old E->K physical endpoint remains K after currentness moves",
);

// Mandatory renamed-presentation vector: adding/changing a metamodel alias
// must not change the explicit bare member set.
const renamedCurrentSource = compileDirectJsonToNativeSourceAnet(
  '{"RenamedCurrent":"E->K","E->K":null}',
);
const renamedCurrent = denoteV015ResolvedSourceAnet(
  memory,
  basis,
  grammarRoot,
  sourceAnetProfileRoot,
  renamedCurrentSource,
);
setSame(
  renamedCurrent.members,
  [DIRECT_CURRENT],
  "presentation alias rename does not change semantic member identity",
);
assert(
  renamedCurrent.bindings.some((binding) =>
    binding.value === DIRECT_CURRENT
  ),
  "renamed presentation remains explicit metamodel binding evidence",
);

for (const bad of [
  "null",
  "[null]",
]) {
  let rejected = false;
  try {
    compileDirectJsonToNativeSourceAnet(bad);
  } catch (error) {
    rejected = error instanceof V015DirectJsonSourceError &&
      (
        error.code === "invalid-shape" ||
        error.code === "invalid-null-position"
      );
  }
  assert(rejected, "null outside object-member RHS fails closed");
}

console.log([
  "MTS_V015_DAS_JSON_A2B=GREEN",
  "DIRECT_JSON_TO_NATIVE_SOURCE_ANET=GREEN",
  "ROOT_BINDING_IMPLIES_MEMBERSHIP=FALSE",
  "OBJECT_MEMBER_NULL=BARE_SOURCE_ENTRY",
  "EMPTY_ARRAY_RHS=EXACT_SEQUENCE_EMPTY_EQUALS_R",
  "NONEMPTY_ARRAY_RHS=EXACT_SEQUENCE",
  "ARRAY_BINDING_IMPLIES_MEMBERSHIP=FALSE",
  "DUPLICATE_JSON_KEY=FAIL_CLOSED_BEFORE_MATERIALIZATION",
  "STRUCTURED_BINDING_HEAD=FAIL_CLOSED_BOUNDED_FRAGMENT",
  "DISTINCT_SOURCE_SAME_DENOTATION=GREEN",
  "CURRENTNESS_MEMBERSHIP_MOVE=GREEN",
  "PRESENTATION_RENAME_MEMBERSHIP_INVARIANT=GREEN",
  "TOP_LEVEL_OR_ARRAY_NULL=FAIL_CLOSED",
].join(" "));
