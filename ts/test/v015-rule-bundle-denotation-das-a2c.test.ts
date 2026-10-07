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
import { StructuralRuleError } from "../src/structural-rule.js";
import { materializeV015ContextualNamePath } from "../src/v015-link-definition.js";
import { materializeV012StringAnum } from "../src/v012-string-anum.js";
import { unifyStructuralRuleTemplate } from "../src/structural-unification.js";
import { instantiateV013StructuralTemplate } from "../src/v013-structural-execution.js";
import {
  denoteV015ResolvedSourceAnet,
  materializeV015SourceAnetProfile,
  type V015SourceAnetProfile,
} from "../src/v015-source-anet.js";
import { compileV015DirectJsonSourceAnet } from "../src/v015-direct-json-source.js";

// Integration split provenance: Rule/bundle execution subset of GREEN #1989 DAS-A2; generic production semantics are unchanged.

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

function compileDirectJsonToNativeSourceAnet(text: string): LinkHandle {
  return compileV015DirectJsonSourceAnet(
    memory,
    basis,
    grammarRoot,
    sourceAnetProfileRoot,
    new TextEncoder().encode(text),
  ).sourceAset;
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

console.log([
  "MTS_V015_DAS_RULE_A2C=GREEN",
  "ROLE_BUNDLE_MEMBERS=ROLES_PLUS_ADMISSION_ONLY",
  "HELPER_BINDINGS_ERASE_BEFORE_EXECUTION=TRUE",
  "GENERIC_STRUCTURAL_MATCH_BIND=GREEN",
  "CANONICAL_STRUCTURAL_OUTPUT=GREEN",
  "GROUNDED_EMPTY_ROLE_BUNDLE=ADMISSION_ONLY",
  "GROUNDED_ROLE_COUNT=0",
  "GROUNDED_EXACT_MATCH=IDENTITY",
  "GROUNDED_NONIDENTICAL_MATCH=REJECT",
].join(" "));
