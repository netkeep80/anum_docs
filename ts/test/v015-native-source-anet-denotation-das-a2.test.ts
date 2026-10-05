import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
} from "../src/memory.js";
import {
  materializeExactSequence,
} from "../src/exact-sequence.js";
import {
  materializeNativeSyntaxGrammar,
  readNativeSyntaxGrammar,
  type NativeSyntaxGrammarRuleSpec,
} from "../src/native-syntax-grammar.js";
import { StructuralRuleError } from "../src/structural-rule.js";
import {
  V015LinkDefinitionError,
  materializeV015ContextualNamePath,
  resolveV015ContextualNameCoordinate,
} from "../src/v015-link-definition.js";
import { materializeV012StringAnum } from "../src/v012-string-anum.js";
import { unifyStructuralRuleTemplate } from "../src/structural-unification.js";
import { instantiateV013StructuralTemplate } from "../src/v013-structural-execution.js";
import { SyntaxAsetBuilder } from "../src/syntax-aset-contract.js";
import {
  denoteV015ResolvedSourceAnet,
  materializeV015SourceAnetProfile,
  type V015SourceAnetProfile,
} from "../src/v015-source-anet.js";
import {
  V015DirectJsonSourceError,
  compileV015DirectJsonSourceAnet,
} from "../src/v015-direct-json-source.js";

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

const Theory = fresh();
const E = fresh();
const K = fresh();
const V = fresh();
const X = fresh();
const Y = fresh();
const A = fresh();
const B = fresh();
const C = fresh();

const Rule = memory.ensure(V, fresh());
const admission = memory.ensure(Theory, Rule);
const current = memory.ensure(E, K);

const RULE_NAME = fresh();
const CURRENT_ALIAS = fresh();
const EMPTY_SEQUENCE_NAME = fresh();
const EMPTY_BUNDLE_NAME = fresh();

function addBare(
  builder: SyntaxAsetBuilder,
  value: LinkHandle,
): LinkHandle {
  return builder.addOccurrence(profile.bareForm, [
    { role: profile.bareValueRole, value },
  ]);
}

function addBinding(
  builder: SyntaxAsetBuilder,
  name: LinkHandle,
  value: LinkHandle,
): LinkHandle {
  return builder.addOccurrence(profile.bindingForm, [
    { role: profile.bindingNameRole, value: name },
    { role: profile.bindingValueRole, value },
  ]);
}

function addBundle(
  builder: SyntaxAsetBuilder,
  anchor: LinkHandle,
  body: LinkHandle,
): LinkHandle {
  return builder.addOccurrence(profile.bundleForm, [
    { role: profile.bundleAnchorRole, value: anchor },
    { role: profile.bundleBodyRole, value: body },
  ]);
}

function addBlock(
  builder: SyntaxAsetBuilder,
  entries: readonly LinkHandle[],
): LinkHandle {
  return builder.addOccurrence(
    profile.blockForm,
    entries.map((value) => ({ role: profile.itemRole, value })),
  );
}

function buildSource(reverse: boolean, includeCurrent: boolean): LinkHandle {
  const builder = new SyntaxAsetBuilder(
    memory,
    readNativeSyntaxGrammar(memory, basis, grammarRoot).vocabulary,
  );

  // Deep child must be materialized before the bundle occurrence that points
  // to it, preserving native SyntaxAset child-reachability rules.
  const cBare = addBare(builder, C);
  const bBlock = addBlock(builder, [cBare]);
  const bBundle = addBundle(builder, B, bBlock);

  const aBinding = addBinding(builder, A, basis.R);
  const xBare = addBare(builder, X);
  const yBare = addBare(builder, Y);
  const vEntries = reverse
    ? [bBundle, aBinding, yBare, xBare]
    : [xBare, yBare, aBinding, bBundle];
  const vBlock = addBlock(builder, vEntries);
  const vBundle = addBundle(builder, V, vBlock);

  const emptyBlock = addBlock(builder, []);
  const emptyBundle = addBundle(builder, EMPTY_BUNDLE_NAME, emptyBlock);

  const ruleBinding = addBinding(builder, RULE_NAME, Rule);
  const currentBinding = addBinding(builder, CURRENT_ALIAS, current);
  const emptySequenceBinding = addBinding(
    builder,
    EMPTY_SEQUENCE_NAME,
    basis.R,
  );

  const admissionBare1 = addBare(builder, admission);
  const currentBare = includeCurrent ? addBare(builder, current) : null;
  const admissionBare2 = addBare(builder, admission);

  const rootEntries = reverse
    ? [
        ...(currentBare === null ? [] : [currentBare]),
        admissionBare2,
        admissionBare1,
        vBundle,
        emptyBundle,
        emptySequenceBinding,
        currentBinding,
        ruleBinding,
      ]
    : [
        ruleBinding,
        currentBinding,
        emptySequenceBinding,
        emptyBundle,
        vBundle,
        admissionBare1,
        ...(currentBare === null ? [] : [currentBare]),
        admissionBare2,
      ];

  const root = addBlock(builder, rootEntries);
  return builder.finish(root);
}

const forwardSource = buildSource(false, true);
const forward = denoteV015ResolvedSourceAnet(
  memory,
  basis,
  grammarRoot,
  sourceAnetProfileRoot,
  forwardSource,
);

const VX = memory.ensure(V, X);
const VY = memory.ensure(V, Y);
const VA = memory.ensure(V, A);
const VB = memory.ensure(V, B);
const VBC = memory.ensure(VB, C);

setSame(
  forward.members,
  [VX, VY, VA, VB, VBC, admission, current],
  "canonical native source ANet denotation",
);

assert(!forward.members.has(Rule), "Rule binding is not implicit membership");
assert(!forward.members.has(basis.R), "[] = R binding is not implicit membership");
assert(
  !forward.members.has(EMPTY_BUNDLE_NAME),
  "empty root bundle contributes zero members",
);
same(forward.members.size, 7, "duplicate bare denotation converges extensionally");

assert(
  forward.bindings.some((binding) =>
    binding.coordinate === null &&
    binding.name === RULE_NAME &&
    binding.value === Rule
  ),
  "root Rule binding preserved as metamodel projection",
);
assert(
  forward.bindings.some((binding) =>
    binding.coordinate === VA &&
    binding.name === A &&
    binding.value === basis.R
  ),
  "nested binding coordinate and RHS remain separate",
);

const reverseSource = buildSource(true, true);
const reverse = denoteV015ResolvedSourceAnet(
  memory,
  basis,
  grammarRoot,
  sourceAnetProfileRoot,
  reverseSource,
);
setSame(reverse.members, [...forward.members], "source order is nonsemantic");

const noCurrentSource = buildSource(false, false);
const noCurrent = denoteV015ResolvedSourceAnet(
  memory,
  basis,
  grammarRoot,
  sourceAnetProfileRoot,
  noCurrentSource,
);
assert(
  !noCurrent.members.has(current),
  "named/physical E->K without bare membership is not current",
);
const currentPoles = memory.poles(current);
same(currentPoles.start, E, "physical current Link start remains E");
same(currentPoles.end, K, "physical current Link end remains K");


const contextualNameCarrierCache = new Map<string, LinkHandle>();

/**
 * Host Map is cache only. Semantic identity comes from:
 * UTF-8 source carrier + explicit contextual Link coordinate.
 */
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
  // R is selected RootBasis authority, not a host-global atom binding.
  if (name === "R") return basis.R;
  return materializeV015ContextualNamePath(
    memory,
    basis,
    basis.R,
    [localNameCarrier(name)],
    true,
  );
}

function contextualPath(source: string): LinkHandle {
  const compact = source.replace(/[()]/gu, "").trim();
  if (compact.length === 0) (() => { throw new Error("v0.15 DAS-A2 native source ANet: invalid contextual path"); })();

  if (compact.startsWith(":")) {
    const segments = compact.slice(1).split(":");
    if (segments.some((segment) => segment.length === 0)) {
      (() => { throw new Error("v0.15 DAS-A2 native source ANet: invalid contextual path"); })();
    }
    return materializeV015ContextualNamePath(
      memory,
      basis,
      basis.R,
      segments.map(localNameCarrier),
      true,
    );
  }

  const segments = compact.split(":");
  if (segments.some((segment) => segment.length === 0)) {
    (() => { throw new Error("v0.15 DAS-A2 native source ANet: invalid contextual path"); })();
  }
  if (segments[0] === "R") {
    if (segments.length === 1) return basis.R;
    return materializeV015ContextualNamePath(
      memory,
      basis,
      basis.R,
      segments.slice(1).map(localNameCarrier),
      true,
    );
  }
  return materializeV015ContextualNamePath(
    memory,
    basis,
    basis.R,
    segments.map(localNameCarrier),
    false,
  );
}

const DIRECT_THEORY = absoluteName("Theory");
const DIRECT_TAG = absoluteName("Tag");
const DIRECT_A = absoluteName("A");
const DIRECT_B = absoluteName("B");
const DIRECT_V0 = absoluteName("V0");
const DIRECT_GA = absoluteName("GA");
const DIRECT_GB = absoluteName("GB");
const DIRECT_OTHER = absoluteName("Other");
const DIRECT_V = absoluteName("V");
const DIRECT_X = absoluteName("X");
const DIRECT_Y = absoluteName("Y");
const DIRECT_BODY = absoluteName("Body");
const DIRECT_E = absoluteName("E");
const DIRECT_K = absoluteName("K");

const DIRECT_V_COLON_X = contextualPath("V:X");
const DIRECT_V_ARROW_X = memory.ensure(DIRECT_V, DIRECT_X);
assert(
  DIRECT_V_COLON_X !== DIRECT_V_ARROW_X,
  "contextual qualification V:X must not collapse into Link construction V->X",
);

const DIRECT_RULE_NAME = absoluteName("Rule");
const DIRECT_CURRENT_ALIAS = absoluteName("Current");
const DIRECT_ONE_R_NAME = absoluteName("OneR");
const DIRECT_TWO_R_NAME = absoluteName("TwoR");
const DIRECT_NESTED_EMPTY_NAME = absoluteName("NestedEmpty");

const absoluteTheoryByColon = contextualPath(":Theory");
const absoluteTheoryByExplicitRoot = contextualPath("R:Theory");
same(
  absoluteTheoryByColon,
  DIRECT_THEORY,
  ":Theory resolves relative to Root R",
);
same(
  absoluteTheoryByExplicitRoot,
  DIRECT_THEORY,
  "R:Theory equals :Theory",
);

const nameResolveCount = memory.linkCount;
same(
  resolveV015ContextualNameCoordinate(
    memory,
    basis.R,
    localNameCarrier("Theory"),
  ),
  DIRECT_THEORY,
  "contextual-name Resolve reads existing root-qualified name",
);
same(memory.linkCount, nameResolveCount, "contextual-name Resolve is read-only");

const MISSING_NAME_CARRIER = localNameCarrier("DefinitelyMissingContextualName");
const missingResolveCount = memory.linkCount;
let missingContextualNameRejected = false;
try {
  resolveV015ContextualNameCoordinate(
    memory,
    basis.R,
    MISSING_NAME_CARRIER,
  );
} catch (error) {
  missingContextualNameRejected =
    error instanceof V015LinkDefinitionError &&
    error.code === "unbound-name";
}
assert(
  missingContextualNameRejected,
  "missing contextual name fails closed instead of becoming a host atom",
);
same(
  memory.linkCount,
  missingResolveCount,
  "failed contextual-name Resolve does not materialize",
);

const PATH_K = absoluteName("PathK");
const PATH_K2 = absoluteName("PathK2");
const PATH_A_CARRIER = localNameCarrier("PathA");
const PATH_B_CARRIER = localNameCarrier("PathB");
const PATH_C_CARRIER = localNameCarrier("PathC");
const PATH_KA = materializeV015ContextualNamePath(
  memory,
  basis,
  PATH_K,
  [PATH_A_CARRIER],
);
const PATH_K2A = materializeV015ContextualNamePath(
  memory,
  basis,
  PATH_K2,
  [PATH_A_CARRIER],
);
const PATH_KB = materializeV015ContextualNamePath(
  memory,
  basis,
  PATH_K,
  [PATH_B_CARRIER],
);
const PATH_KBC = materializeV015ContextualNamePath(
  memory,
  basis,
  PATH_KB,
  [PATH_C_CARRIER],
);
assert(PATH_KA !== PATH_K2A, "same spelling in different contexts stays distinct");
same(
  PATH_KBC,
  memory.ensure(PATH_KB, PATH_C_CARRIER),
  "(K:B):C is a Link-native contextual-name path",
);

same(
  contextualPath("PathK:PathA"),
  PATH_KA,
  "relative K:A surface resolves through the contextual path",
);
same(
  contextualPath("(PathK:PathB):PathC"),
  PATH_KBC,
  "parenthesized (K:B):C resolves to the same Link-native path",
);

function compileDirectJsonToNativeSourceAnet(text: string): LinkHandle {
  return compileV015DirectJsonSourceAnet(
    memory,
    basis,
    grammarRoot,
    sourceAnetProfileRoot,
    new TextEncoder().encode(text),
  ).sourceAset;
}

const absoluteLinkLawJson = [
  "{",
  "  \":Theory->:GroundRule\": null,",
  "  \"R:Theory->R:GroundRule\": null",
  "}",
].join("\n");
const absoluteLinkLaw = denoteV015ResolvedSourceAnet(
  memory,
  basis,
  grammarRoot,
  sourceAnetProfileRoot,
  compileDirectJsonToNativeSourceAnet(absoluteLinkLawJson),
);
const DIRECT_GROUND_RULE_ABSOLUTE = contextualPath(":GroundRule");
const ABSOLUTE_ADMISSION = memory.ensure(
  DIRECT_THEORY,
  DIRECT_GROUND_RULE_ABSOLUTE,
);
setSame(
  absoluteLinkLaw.members,
  [ABSOLUTE_ADMISSION],
  ":Theory->:GroundRule equals R:Theory->R:GroundRule",
);

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
  let rejected = false;
  try {
    compileDirectJsonToNativeSourceAnet(bad);
  } catch (error) {
    rejected = error instanceof V015DirectJsonSourceError &&
      error.code === "duplicate-key";
  }
  assert(rejected, "duplicate decoded JSON key fails closed");
}



const metaRuleJson = [
  "{",
  "  \"V\": {",
  "    \"X\": null,",
  "    \"Y\": null",
  "  },",
  "  \"RoleX\": \"V->X\",",
  "  \"RoleY\": \"V->Y\",",
  "  \"PairXY\": \"RoleX->RoleY\",",
  "  \"Antecedent\": \"Tag->PairXY\",",
  "  \"Output\": \"RoleY->RoleX\",",
  "  \"Image\": [\"Output\"],",
  "  \"MetaBody\": \"Antecedent->Image\",",
  "  \"MetaRule\": \"V->MetaBody\",",
  "  \"Theory->MetaRule\": null",
  "}",
].join("\n");

const metaRuleSource = compileDirectJsonToNativeSourceAnet(metaRuleJson);
const metaRuleDenotation = denoteV015ResolvedSourceAnet(
  memory,
  basis,
  grammarRoot,
  sourceAnetProfileRoot,
  metaRuleSource,
);

const roleX = memory.ensure(DIRECT_V, DIRECT_X);
const roleY = memory.ensure(DIRECT_V, DIRECT_Y);
const pairXY = memory.ensure(roleX, roleY);
const antecedent = memory.ensure(DIRECT_TAG, pairXY);
const output = memory.ensure(roleY, roleX);
const image = materializeExactSequence(memory, [output]);
const metaBody = memory.ensure(antecedent, image);
const metaRule = memory.ensure(DIRECT_V, metaBody);
const metaAdmission = memory.ensure(DIRECT_THEORY, metaRule);

setSame(
  metaRuleDenotation.members,
  [roleX, roleY, metaAdmission],
  "meta-rule JSON erases helper bindings and keeps roles + admission",
);

for (const helper of [
  pairXY,
  antecedent,
  output,
  image,
  metaBody,
  metaRule,
]) {
  assert(
    !metaRuleDenotation.members.has(helper),
    "meta-rule helper/model Link is not implicit semantic membership",
  );
}

const discoveredRoles = [...metaRuleDenotation.members].filter((member) =>
  memory.poles(member).start === DIRECT_V
);
setSame(
  new Set(discoveredRoles),
  [roleX, roleY],
  "meta-rule JSON exposes exactly the two bindable role members",
);

const actualPair = memory.ensure(DIRECT_A, DIRECT_B);
const actualAntecedent = memory.ensure(DIRECT_TAG, actualPair);
const bindings = unifyStructuralRuleTemplate(
  memory,
  antecedent,
  actualAntecedent,
  discoveredRoles,
);
same(bindings.length, 2, "meta-rule JSON produces two structural bindings");

const instantiated = instantiateV013StructuralTemplate(
  memory,
  output,
  bindings,
);
same(
  instantiated,
  memory.ensure(DIRECT_B, DIRECT_A),
  "meta-rule JSON structural output swaps the matched pair",
);

assert(
  metaRuleDenotation.members.has(metaAdmission),
  "meta-rule JSON publishes Theory->Rule admission",
);



const groundedRuleJson = [
  "{",
  "  \"V0\": {},",
  "  \"GroundAntecedent\": \"GA\",",
  "  \"GroundOutput\": \"GB\",",
  "  \"GroundImage\": [\"GroundOutput\"],",
  "  \"GroundBody\": \"GroundAntecedent->GroundImage\",",
  "  \"GroundRule\": \"V0->GroundBody\",",
  "  \"Theory->GroundRule\": null",
  "}",
].join("\n");

const groundedRuleSource =
  compileDirectJsonToNativeSourceAnet(groundedRuleJson);
const groundedRuleDenotation = denoteV015ResolvedSourceAnet(
  memory,
  basis,
  grammarRoot,
  sourceAnetProfileRoot,
  groundedRuleSource,
);

const groundedImage = materializeExactSequence(memory, [DIRECT_GB]);
const groundedBody = memory.ensure(DIRECT_GA, groundedImage);
const groundedRule = memory.ensure(DIRECT_V0, groundedBody);
const groundedAdmission = memory.ensure(DIRECT_THEORY, groundedRule);

setSame(
  groundedRuleDenotation.members,
  [groundedAdmission],
  "grounded JSON semantic ANet contains admission only",
);

const groundedRoles = [...groundedRuleDenotation.members].filter((member) =>
  memory.poles(member).start === DIRECT_V0
);
same(groundedRoles.length, 0, "empty V0 yields zero bindable roles");

const groundedBindings = unifyStructuralRuleTemplate(
  memory,
  DIRECT_GA,
  DIRECT_GA,
  groundedRoles,
);
same(
  groundedBindings.length,
  0,
  "grounded exact match produces no variable bindings",
);

const groundedInstantiated = instantiateV013StructuralTemplate(
  memory,
  DIRECT_GB,
  groundedBindings,
);
same(
  groundedInstantiated,
  DIRECT_GB,
  "grounded exact output is identity instantiation",
);

let groundedMismatch = false;
try {
  unifyStructuralRuleTemplate(
    memory,
    DIRECT_GA,
    DIRECT_OTHER,
    groundedRoles,
  );
} catch (error) {
  groundedMismatch = error instanceof StructuralRuleError &&
    error.code === "template-mismatch";
}
assert(
  groundedMismatch,
  "zero-role grounded rule rejects non-identical antecedent",
);

assert(
  groundedRuleDenotation.members.has(groundedAdmission),
  "grounded JSON publishes Theory->GroundRule admission",
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
  "MTS_V015_DAS_A2=GREEN_RESEARCH",
  "SOURCE_CARRIER=NATIVE_SYNTAX_ANET",
  "SOURCE_GRAMMAR=LINK_NATIVE_SELECTED_PROFILE",
  "RESOLVED_METAMODEL_TO_SEMANTIC_ANET=SUPPORTED",
  "ROOT_BINDING_IMPLIES_MEMBERSHIP=FALSE",
  "ROOT_BARE_IMPLIES_DIRECT_MEMBERSHIP=TRUE",
  "CONTEXTUAL_NAME_ABSOLUTE_ROOT_EQUIVALENCE=GREEN",
  "CONTEXTUAL_NAME_RESOLVE_READ_ONLY=TRUE",
  "CONTEXTUAL_NAME_MISSING_FAIL_CLOSED=TRUE",
  "CONTEXT_QUALIFICATION_NE_LINK_CONSTRUCTION=TRUE",
  "HOST_GLOBAL_ATOM_NAMESPACE_AUTHORITY=FALSE",
  "SAME_SPELLING_DIFFERENT_CONTEXT=TRUE",
  "NESTED_CONTEXTUAL_PATH=SUPPORTED",
  "EMPTY_BUNDLE_MEMBER_COUNT=0",
  "EMPTY_SEQUENCE_DENOTATION=R",
  "PHYSICAL_EXISTENCE_IMPLIES_MEMBERSHIP=FALSE",
  "DUPLICATE_DENOTATION=EXTENSIONAL_CONVERGENCE",
  "SOURCE_ENTRY_ORDER_SEMANTIC=FALSE",
  "CURRENTNESS_REQUIRES_MEMBERSHIP=TRUE",
  "METAMODEL_BINDINGS_CAN_ERASE_BEFORE_EXECUTION=TRUE",
  "CUSTOM_DAS_A1_SOURCE_CARRIER_REQUIRED=FALSE",
  "DIRECT_JSON_TO_NATIVE_SOURCE_ANET=GREEN_RESEARCH",
  "JSON_BYPASS_TO_SEMANTIC_ANET=FALSE",
  "OBJECT_MEMBER_NULL=BARE_SOURCE_ENTRY",
  "STRING_RHS=METAMODEL_BINDING",
  "EMPTY_ARRAY_RHS=EXACT_SEQUENCE_EMPTY_EQUALS_R",
  "NONEMPTY_ARRAY_RHS=EXACT_SEQUENCE",
  "ARRAY_ONE_R_DISTINCT_FROM_EMPTY=TRUE",
  "ARRAY_TWO_R_DISTINCT_FROM_ONE_R=TRUE",
  "NESTED_EMPTY_ARRAY_EQUALS_ONE_R=TRUE",
  "ARRAY_BINDING_IMPLIES_MEMBERSHIP=FALSE",
  "NESTED_OBJECT=ANCHORED_SOURCE_ANET",
  "STRUCTURED_BARE_KEY=RESOLVED_DIRECT_MEMBERSHIP",
  "DUPLICATE_JSON_KEY=FAIL_CLOSED",
  "ESCAPED_DUPLICATE_JSON_KEY=FAIL_CLOSED",
  "TOP_LEVEL_NULL=FAIL_CLOSED",
  "ARRAY_NULL=FAIL_CLOSED",
  "JSON_NATIVE_ROLE_BUNDLE_META_RULE=GREEN_RESEARCH",
  "META_RULE_SEMANTIC_MEMBERS=ROLES_PLUS_ADMISSION_ONLY",
  "META_RULE_HELPER_BINDINGS_ERASE_BEFORE_EXECUTION=TRUE",
  "META_RULE_STRUCTURAL_SWAP=GREEN",
  "META_RULE_ARTIFACT_APPROVAL=AUTHOR_APPROVED",
  "META_RULE_CONTEXTUAL_NAME_REPLAY=GREEN",
  "JSON_GROUNDED_EMPTY_ROLE_RULE=GREEN_RESEARCH",
  "GROUNDED_SEMANTIC_MEMBERS=ADMISSION_ONLY",
  "GROUNDED_ROLE_COUNT=0",
  "GROUNDED_EXACT_MATCH=IDENTITY",
  "GROUNDED_NONIDENTICAL_MATCH=REJECT",
  "GROUNDED_RULE_ARTIFACT_APPROVAL=AUTHOR_REVIEW_REQUIRED",
  "CONCRETE_LOGIC_ARTIFACT_APPROVAL=STILL_REQUIRED",
  "FINAL_JSON_SURFACE=AUTHOR_APPROVED_DESIGN_PROOF_PENDING",
].join(" "));
