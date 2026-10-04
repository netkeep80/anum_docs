import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
} from "../src/memory.js";
import {
  materializeNativeSyntaxGrammar,
  readNativeSyntaxGrammar,
  type NativeSyntaxGrammarRuleSpec,
} from "../src/native-syntax-grammar.js";
import {
  SyntaxAsetBuilder,
  readSyntaxAset,
  type SyntaxAsetOccurrence,
} from "../src/syntax-aset-contract.js";

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

interface DenotationProfile {
  readonly blockForm: LinkHandle;
  readonly bareForm: LinkHandle;
  readonly bindingForm: LinkHandle;
  readonly bundleForm: LinkHandle;
  readonly itemRole: LinkHandle;
  readonly bareValueRole: LinkHandle;
  readonly bindingNameRole: LinkHandle;
  readonly bindingValueRole: LinkHandle;
  readonly bundleAnchorRole: LinkHandle;
  readonly bundleBodyRole: LinkHandle;
}

interface BindingProjection {
  readonly coordinate: LinkHandle | null;
  readonly name: LinkHandle;
  readonly value: LinkHandle;
}

interface DenotationRead {
  readonly members: ReadonlySet<LinkHandle>;
  readonly bindings: readonly BindingProjection[];
}

function oneField(
  occurrence: SyntaxAsetOccurrence,
  role: LinkHandle,
): LinkHandle {
  const values = occurrence.fields
    .filter((field) => field.role === role)
    .map((field) => field.value);
  assert(values.length === 1, "exactly one field for selected role");
  return values[0]!;
}

/**
 * Read one canonical native SyntaxAset and lower its already-resolved carrier
 * values into the extensional semantic ANet.
 *
 * The selected native Grammar + profile Links are source-role authority.
 * Host object labels below are only the executable reader implementation.
 */
function denoteNativeResolvedSourceAnet(
  memory: Memory,
  grammarRoot: LinkHandle,
  profile: DenotationProfile,
  sourceAnet: LinkHandle,
): DenotationRead {
  const grammar = readNativeSyntaxGrammar(
    memory,
    ensureRootBasis(memory),
    grammarRoot,
  );
  const source = readSyntaxAset(memory, sourceAnet, grammar.vocabulary);
  const occurrences = new Map(
    source.occurrences.map((entry) => [entry.occurrence, entry]),
  );
  const members = new Set<LinkHandle>();
  const bindings: BindingProjection[] = [];

  const walkBlock = (
    blockHandle: LinkHandle,
    contextAnchor: LinkHandle | null,
  ): void => {
    const block = occurrences.get(blockHandle);
    assert(block !== undefined, "block occurrence exists");
    same(block.kind, profile.blockForm, "selected block form");

    for (const field of block.fields) {
      if (field.role !== profile.itemRole) continue;
      const entry = occurrences.get(field.value);
      assert(entry !== undefined, "entry occurrence exists");

      if (entry.kind === profile.bareForm) {
        const resolved = oneField(entry, profile.bareValueRole);
        members.add(
          contextAnchor === null
            ? resolved
            : memory.ensure(contextAnchor, resolved),
        );
        continue;
      }

      if (entry.kind === profile.bindingForm) {
        const name = oneField(entry, profile.bindingNameRole);
        const value = oneField(entry, profile.bindingValueRole);
        const coordinate = contextAnchor === null
          ? null
          : memory.ensure(contextAnchor, name);
        if (coordinate !== null) members.add(coordinate);
        bindings.push(Object.freeze({ coordinate, name, value }));
        continue;
      }

      if (entry.kind === profile.bundleForm) {
        const localAnchor = oneField(entry, profile.bundleAnchorRole);
        const body = oneField(entry, profile.bundleBodyRole);
        const nestedAnchor = contextAnchor === null
          ? localAnchor
          : memory.ensure(contextAnchor, localAnchor);
        if (contextAnchor !== null) members.add(nestedAnchor);
        walkBlock(body, nestedAnchor);
        continue;
      }

      throw new Error("v0.15 DAS-A2 native source ANet: unsupported entry form");
    }
  };

  walkBlock(source.root, null);

  return Object.freeze({
    members,
    bindings: Object.freeze(bindings),
  });
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

const profile: DenotationProfile = Object.freeze({
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
const forward = denoteNativeResolvedSourceAnet(
  memory,
  grammarRoot,
  profile,
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
const reverse = denoteNativeResolvedSourceAnet(
  memory,
  grammarRoot,
  profile,
  reverseSource,
);
setSame(reverse.members, [...forward.members], "source order is nonsemantic");

const noCurrentSource = buildSource(false, false);
const noCurrent = denoteNativeResolvedSourceAnet(
  memory,
  grammarRoot,
  profile,
  noCurrentSource,
);
assert(
  !noCurrent.members.has(current),
  "named/physical E->K without bare membership is not current",
);
const currentPoles = memory.poles(current);
same(currentPoles.start, E, "physical current Link start remains E");
same(currentPoles.end, K, "physical current Link end remains K");

console.log([
  "MTS_V015_DAS_A2=GREEN_RESEARCH",
  "SOURCE_CARRIER=NATIVE_SYNTAX_ANET",
  "SOURCE_GRAMMAR=LINK_NATIVE_SELECTED_PROFILE",
  "RESOLVED_METAMODEL_TO_SEMANTIC_ANET=SUPPORTED",
  "ROOT_BINDING_IMPLIES_MEMBERSHIP=FALSE",
  "ROOT_BARE_IMPLIES_DIRECT_MEMBERSHIP=TRUE",
  "NESTED_CONTEXTUAL_PATH=SUPPORTED",
  "EMPTY_BUNDLE_MEMBER_COUNT=0",
  "EMPTY_SEQUENCE_DENOTATION=R",
  "PHYSICAL_EXISTENCE_IMPLIES_MEMBERSHIP=FALSE",
  "DUPLICATE_DENOTATION=EXTENSIONAL_CONVERGENCE",
  "SOURCE_ENTRY_ORDER_SEMANTIC=FALSE",
  "CURRENTNESS_REQUIRES_MEMBERSHIP=TRUE",
  "METAMODEL_BINDINGS_CAN_ERASE_BEFORE_EXECUTION=TRUE",
  "CUSTOM_DAS_A1_SOURCE_CARRIER_REQUIRED=FALSE",
  "FINAL_JSON_SURFACE=AUTHOR_REVIEW_PENDING",
].join(" "));
