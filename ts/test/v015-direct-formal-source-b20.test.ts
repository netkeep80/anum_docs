import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
} from "../src/memory.js";
import {
  materializeNativeSyntaxGrammar,
  type NativeSyntaxGrammarRuleSpec,
} from "../src/native-syntax-grammar.js";
import {
  compileV015DirectFormalSourceAnet,
  V015DirectFormalSourceError,
} from "../src/v015-direct-formal-source.js";
import {
  compileV015DirectJsonSourceAnet,
} from "../src/v015-direct-json-source.js";
import {
  materializeV015ContextualNamePath,
} from "../src/v015-link-definition.js";
import {
  denoteV015ResolvedSourceAnet,
  materializeV015SourceAnetProfile,
  type V015SourceAnetProfile,
} from "../src/v015-source-anet.js";
import { materializeV012StringAnum } from "../src/v012-string-anum.js";
import { materializeExactSequence } from "../src/exact-sequence.js";
import { unifyStructuralRuleTemplate } from "../src/structural-unification.js";
import { instantiateV013StructuralTemplate } from "../src/v013-structural-execution.js";
import { StructuralRuleError } from "../src/structural-rule.js";

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error("v0.15 direct FORMAL source: " + message);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(
    Object.is(actual, expected),
    message + ": " + String(actual) + " !== " + String(expected),
  );
}

function setSame(
  actual: ReadonlySet<LinkHandle>,
  expected: ReadonlySet<LinkHandle>,
  message: string,
): void {
  same(actual.size, expected.size, message + " cardinality");
  for (const value of expected) assert(actual.has(value), message + " member");
}

const memory = new Memory();
const basis = ensureRootBasis(memory);
let cursor = memory.ensure(basis.U, basis.L);
const fresh = (): LinkHandle => {
  cursor = memory.ensureStartSelfClosed(cursor);
  return cursor;
};

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

const syntaxTag = fresh();
const markerSeed = fresh();
const rules: readonly NativeSyntaxGrammarRuleSpec[] = [
  {
    form: profile.blockForm,
    fields: [{ role: profile.itemRole, target: "child", min: 0, max: null }],
  },
  {
    form: profile.bareForm,
    fields: [{
      role: profile.bareValueRole,
      target: "carrier",
      min: 1,
      max: 1,
    }],
  },
  {
    form: profile.bindingForm,
    fields: [
      {
        role: profile.bindingNameRole,
        target: "carrier",
        min: 1,
        max: 1,
      },
      {
        role: profile.bindingValueRole,
        target: "carrier",
        min: 1,
        max: 1,
      },
    ],
  },
  {
    form: profile.bundleForm,
    fields: [
      {
        role: profile.bundleAnchorRole,
        target: "carrier",
        min: 1,
        max: 1,
      },
      {
        role: profile.bundleBodyRole,
        target: "child",
        min: 1,
        max: 1,
      },
    ],
  },
];

const grammarRoot = materializeNativeSyntaxGrammar(memory, basis, {
  syntaxTag,
  markerSeed,
  rules,
});
const sourceAnetProfileRoot = materializeV015SourceAnetProfile(memory, profile);
const enc = new TextEncoder();

const localCarrier = (name: string): LinkHandle =>
  materializeV012StringAnum(memory, basis, enc.encode(name)).anumLink;

const absoluteName = (name: string): LinkHandle => {
  if (name === "R") return basis.R;
  return materializeV015ContextualNamePath(
    memory,
    basis,
    basis.R,
    [localCarrier(name)],
    true,
  );
};

const json = [
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

const formal = [
  "{",
  "  V0 : {},",
  "  GroundAntecedent : GA,",
  "  GroundOutput : GB,",
  "  GroundImage : [GroundOutput],",
  "  GroundBody : GroundAntecedent->GroundImage,",
  "  GroundRule : V0->GroundBody,",
  "  Theory->GroundRule",
  "}",
].join("\n");

const jsonCompiled = compileV015DirectJsonSourceAnet(
  memory,
  basis,
  grammarRoot,
  sourceAnetProfileRoot,
  enc.encode(json),
);
const formalCompiled = compileV015DirectFormalSourceAnet(
  memory,
  basis,
  grammarRoot,
  sourceAnetProfileRoot,
  enc.encode(formal),
);

assert(
  jsonCompiled.sourceContent !== formalCompiled.sourceContent,
  "physical JSON and FORMAL source bytes remain distinct evidence",
);
same(
  formalCompiled.sourceAset,
  jsonCompiled.sourceAset,
  "Author-approved grounded JSON and direct FORMAL reconstruct exact same native source ANet",
);

const jsonDenotation = denoteV015ResolvedSourceAnet(
  memory,
  basis,
  grammarRoot,
  sourceAnetProfileRoot,
  jsonCompiled.sourceAset,
);
const formalDenotation = denoteV015ResolvedSourceAnet(
  memory,
  basis,
  grammarRoot,
  sourceAnetProfileRoot,
  formalCompiled.sourceAset,
);
setSame(
  formalDenotation.members,
  jsonDenotation.members,
  "JSON/FORMAL semantic ANet parity",
);

const Theory = absoluteName("Theory");
const V0 = absoluteName("V0");
const GA = absoluteName("GA");
const GB = absoluteName("GB");
const GroundOutput = GB;
const GroundImage = materializeExactSequence(memory, [GroundOutput]);
const GroundBody = memory.ensure(GA, GroundImage);
const GroundRule = memory.ensure(V0, GroundBody);
const admission = memory.ensure(Theory, GroundRule);

same(formalDenotation.members.size, 1, "grounded FORMAL publishes one member");
assert(
  formalDenotation.members.has(admission),
  "grounded FORMAL publishes Theory->GroundRule admission",
);

const roles = [...formalDenotation.members].filter((member) =>
  memory.poles(member).start === V0
);
same(roles.length, 0, "FORMAL V0:{} has zero bindable roles");

const bindings = unifyStructuralRuleTemplate(memory, GA, GA, roles);
same(bindings.length, 0, "grounded FORMAL exact match has zero bindings");
same(
  instantiateV013StructuralTemplate(memory, GB, bindings),
  GB,
  "grounded FORMAL output is identity instantiation",
);

let mismatch = false;
try {
  unifyStructuralRuleTemplate(
    memory,
    GA,
    absoluteName("Other"),
    roles,
  );
} catch (error) {
  mismatch =
    error instanceof StructuralRuleError &&
    error.code === "template-mismatch";
}
assert(mismatch, "grounded FORMAL rejects non-identical antecedent");

const parityCases = [
  ["{}", "{}"],
  ["{ A }", "{\"A\":null}"],
  ["{ A : {} }", "{\"A\":{}}"],
  ["{ A : [] }", "{\"A\":[]}"],
  ["{ V : { X, Y } }", "{\"V\":{\"X\":null,\"Y\":null}}"],
] as const;

const sourceIdentities: LinkHandle[] = [];
for (const [formalCase, jsonCase] of parityCases) {
  const f = compileV015DirectFormalSourceAnet(
    memory,
    basis,
    grammarRoot,
    sourceAnetProfileRoot,
    enc.encode(formalCase),
  );
  const j = compileV015DirectJsonSourceAnet(
    memory,
    basis,
    grammarRoot,
    sourceAnetProfileRoot,
    enc.encode(jsonCase),
  );
  same(
    f.sourceAset,
    j.sourceAset,
    "FORMAL/JSON source-role parity for " + formalCase,
  );
  sourceIdentities.push(f.sourceAset);
}
same(
  new Set(sourceIdentities).size,
  sourceIdentities.length,
  "{}, bare, empty bundle, empty sequence and populated bundle retain distinct source identities",
);

{
  const empty = compileV015DirectFormalSourceAnet(
    memory,basis,grammarRoot,sourceAnetProfileRoot,enc.encode("{}"),
  );
  const bare = compileV015DirectFormalSourceAnet(
    memory,basis,grammarRoot,sourceAnetProfileRoot,enc.encode("{ A }"),
  );
  const emptyBundle = compileV015DirectFormalSourceAnet(
    memory,basis,grammarRoot,sourceAnetProfileRoot,enc.encode("{ A : {} }"),
  );
  const emptySequence = compileV015DirectFormalSourceAnet(
    memory,basis,grammarRoot,sourceAnetProfileRoot,enc.encode("{ A : [] }"),
  );

  same(
    denoteV015ResolvedSourceAnet(
      memory,basis,grammarRoot,sourceAnetProfileRoot,empty.sourceAset,
    ).members.size,
    0,
    "empty FORMAL bundle has zero semantic members",
  );
  const bareDenotation = denoteV015ResolvedSourceAnet(
    memory,basis,grammarRoot,sourceAnetProfileRoot,bare.sourceAset,
  );
  same(bareDenotation.members.size, 1, "bare FORMAL A has one semantic member");
  assert(bareDenotation.members.has(absoluteName("A")), "bare A publishes A");
  same(
    denoteV015ResolvedSourceAnet(
      memory,basis,grammarRoot,sourceAnetProfileRoot,emptyBundle.sourceAset,
    ).members.size,
    0,
    "root A:{} contributes no member by itself",
  );
  same(
    denoteV015ResolvedSourceAnet(
      memory,basis,grammarRoot,sourceAnetProfileRoot,emptySequence.sourceAset,
    ).members.size,
    0,
    "root A:[] is a binding and does not publish R",
  );
}

for (const invalid of [
  "{ A, A }",
  "{ A : }",
  "{ A, }",
  "{ A : [B,] }",
]) {
  let rejected = false;
  try {
    compileV015DirectFormalSourceAnet(
      memory,
      basis,
      grammarRoot,
      sourceAnetProfileRoot,
      enc.encode(invalid),
    );
  } catch (error) {
    rejected = error instanceof V015DirectFormalSourceError;
  }
  assert(rejected, "invalid FORMAL fails closed: " + invalid);
}

console.log([
  "MTS_V015_DIRECT_FORMAL_SOURCE=GREEN_RESEARCH",
  "FORMAL_JSON_NATIVE_SOURCE_ANET=EXACT_SAME",
  "GROUND_JSON_ARTIFACT=AUTHOR_APPROVED",
  "GROUND_FORMAL_PARITY=GREEN",
  "V0_EMPTY_BUNDLE_ROLE_COUNT=0",
  "GROUNDED_MATCH=EXACT",
  "GROUNDED_MISMATCH=REJECT",
  "EMPTY_BUNDLE_NE_BARE_NE_EMPTY_SEQUENCE=SOURCE_IDENTITY",
  "FORMAL_DIRECT_SOURCE_ROLES=BLOCK_BARE_BINDING_BUNDLE",
  "SEMANTIC_MEMBERSHIP_PATH=COMMON_DAS",
].join(" "));
