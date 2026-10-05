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
  materializeV015ContextualNamePath,
  resolveV015ContextualNameCoordinate,
} from "../src/v015-link-definition.js";
import { materializeV012StringAnum } from "../src/v012-string-anum.js";
import { unifyStructuralRuleTemplate } from "../src/structural-unification.js";
import { instantiateV013StructuralTemplate } from "../src/v013-structural-execution.js";
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


type DirectJsonValue =
  | null
  | string
  | readonly DirectJsonValue[]
  | ReadonlyMap<string, DirectJsonValue>;

class DirectJsonError extends Error {
  override readonly name = "DirectJsonError";

  constructor(
    readonly code:
      | "invalid-json"
      | "duplicate-key"
      | "invalid-shape"
      | "invalid-null-position"
      | "unknown-name"
      | "cyclic-binding",
  ) {
    super(code);
  }
}

function directJsonFail(code: DirectJsonError["code"]): never {
  throw new DirectJsonError(code);
}

class StrictDirectJsonReader {
  private index = 0;

  constructor(private readonly text: string) {}

  read(): DirectJsonValue {
    this.space();
    const value = this.value();
    this.space();
    if (this.index !== this.text.length) directJsonFail("invalid-json");
    return value;
  }

  private space(): void {
    while (
      this.index < this.text.length &&
      /[\x20\x09\x0a\x0d]/u.test(this.text[this.index]!)
    ) {
      this.index += 1;
    }
  }

  private value(): DirectJsonValue {
    this.space();
    const ch = this.text[this.index];
    if (ch === "{") return this.object();
    if (ch === "[") return this.array();
    if (ch === "\"") return this.string();
    if (this.text.startsWith("null", this.index)) {
      this.index += 4;
      return null;
    }
    return directJsonFail("invalid-json");
  }

  private string(): string {
    const start = this.index;
    if (this.text[this.index] !== "\"") directJsonFail("invalid-json");
    this.index += 1;

    while (this.index < this.text.length) {
      const ch = this.text[this.index];
      if (ch === "\"") {
        this.index += 1;
        try {
          const decoded = JSON.parse(
            this.text.slice(start, this.index),
          ) as unknown;
          if (typeof decoded !== "string") directJsonFail("invalid-json");
          return decoded;
        } catch (error) {
          if (error instanceof DirectJsonError) throw error;
          return directJsonFail("invalid-json");
        }
      }
      if (ch === "\\") {
        this.index += 2;
      } else {
        this.index += 1;
      }
    }

    return directJsonFail("invalid-json");
  }

  private object(): ReadonlyMap<string, DirectJsonValue> {
    this.index += 1;
    this.space();
    const result = new Map<string, DirectJsonValue>();

    if (this.text[this.index] === "}") {
      this.index += 1;
      return result;
    }

    while (true) {
      this.space();
      if (this.text[this.index] !== "\"") directJsonFail("invalid-json");
      const key = this.string();
      if (result.has(key)) directJsonFail("duplicate-key");

      this.space();
      if (this.text[this.index] !== ":") directJsonFail("invalid-json");
      this.index += 1;
      result.set(key, this.value());

      this.space();
      const next = this.text[this.index];
      if (next === "}") {
        this.index += 1;
        return result;
      }
      if (next !== ",") directJsonFail("invalid-json");
      this.index += 1;
    }
  }

  private array(): readonly DirectJsonValue[] {
    this.index += 1;
    this.space();
    const result: DirectJsonValue[] = [];

    if (this.text[this.index] === "]") {
      this.index += 1;
      return Object.freeze(result);
    }

    while (true) {
      const value = this.value();
      if (value === null) directJsonFail("invalid-null-position");
      result.push(value);

      this.space();
      const next = this.text[this.index];
      if (next === "]") {
        this.index += 1;
        return Object.freeze(result);
      }
      if (next !== ",") directJsonFail("invalid-json");
      this.index += 1;
    }
  }
}

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
  if (compact.length === 0) directJsonFail("invalid-shape");

  if (compact.startsWith(":")) {
    const segments = compact.slice(1).split(":");
    if (segments.some((segment) => segment.length === 0)) {
      directJsonFail("invalid-shape");
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
    directJsonFail("invalid-shape");
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

const DIRECT_RULE_NAME = absoluteName("Rule");
const DIRECT_CURRENT_ALIAS = absoluteName("Current");
const DIRECT_EMPTY_SEQUENCE_NAME = absoluteName("Empty");
const DIRECT_ONE_R_NAME = absoluteName("OneR");
const DIRECT_TWO_R_NAME = absoluteName("TwoR");
const DIRECT_NESTED_EMPTY_NAME = absoluteName("NestedEmpty");
const DIRECT_ROLE_X_NAME = absoluteName("RoleX");
const DIRECT_ROLE_Y_NAME = absoluteName("RoleY");
const DIRECT_PAIR_XY_NAME = absoluteName("PairXY");
const DIRECT_ANTECEDENT_NAME = absoluteName("Antecedent");
const DIRECT_OUTPUT_NAME = absoluteName("Output");
const DIRECT_IMAGE_NAME = absoluteName("Image");
const DIRECT_META_BODY_NAME = absoluteName("MetaBody");
const DIRECT_META_RULE_NAME = absoluteName("MetaRule");
const DIRECT_GROUND_ANTECEDENT_NAME = absoluteName("GroundAntecedent");
const DIRECT_GROUND_OUTPUT_NAME = absoluteName("GroundOutput");
const DIRECT_GROUND_IMAGE_NAME = absoluteName("GroundImage");
const DIRECT_GROUND_BODY_NAME = absoluteName("GroundBody");
const DIRECT_GROUND_RULE_NAME = absoluteName("GroundRule");

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

function compileDirectJsonToNativeSourceAnet(text: string): LinkHandle {
  const parsed = new StrictDirectJsonReader(text).read();
  if (!(parsed instanceof Map)) directJsonFail("invalid-shape");

  const rawBindings = new Map<string, DirectJsonValue>();
  for (const [key, value] of parsed) {
    if (typeof value === "string" || Array.isArray(value)) {
      rawBindings.set(key, value);
    }
  }

  const resolvedBindings = new Map<string, LinkHandle>();
  const resolving = new Set<string>();

  const resolveName = (name: string): LinkHandle => {
    const bound = resolvedBindings.get(name);
    if (bound !== undefined) return bound;

    const raw = rawBindings.get(name);
    if (raw !== undefined) {
      if (resolving.has(name)) directJsonFail("cyclic-binding");
      resolving.add(name);
      const resolved = resolveRhs(raw);
      resolving.delete(name);
      resolvedBindings.set(name, resolved);
      return resolved;
    }

    return absoluteName(name);
  };

  const resolveEndpoint = (source: string): LinkHandle => {
    const trimmed = source.trim();
    if (trimmed.includes(":")) return contextualPath(trimmed);
    return resolveName(trimmed);
  };

  const resolveExpr = (source: string): LinkHandle => {
    const parts = source.split("->").map((part) => part.trim());
    if (parts.length === 0 || parts.some((part) => part.length === 0)) {
      directJsonFail("invalid-shape");
    }

    let currentValue = resolveEndpoint(parts[0]!);
    for (let index = 1; index < parts.length; index += 1) {
      currentValue = memory.ensure(
        currentValue,
        resolveEndpoint(parts[index]!),
      );
    }
    return currentValue;
  };

  function resolveRhs(value: DirectJsonValue): LinkHandle {
    if (typeof value === "string") return resolveExpr(value);

    if (Array.isArray(value)) {
      const elements = value.map((item) => {
        if (typeof item === "string") return resolveExpr(item);
        if (Array.isArray(item)) return resolveRhs(item);
        return directJsonFail("invalid-shape");
      });
      return materializeExactSequence(memory, elements);
    }

    return directJsonFail("invalid-shape");
  }

  for (const key of rawBindings.keys()) resolveName(key);

  const builder = new SyntaxAsetBuilder(
    memory,
    readNativeSyntaxGrammar(memory, basis, grammarRoot).vocabulary,
  );

  const compileObject = (
    object: ReadonlyMap<string, DirectJsonValue>,
  ): LinkHandle => {
    const entries: LinkHandle[] = [];

    for (const [key, value] of object) {
      if (value instanceof Map) {
        const body = compileObject(value);
        entries.push(addBundle(builder, resolveExpr(key), body));
        continue;
      }

      if (value === null) {
        entries.push(addBare(builder, resolveExpr(key)));
        continue;
      }

      if (typeof value === "string" || Array.isArray(value)) {
        entries.push(
          addBinding(builder, absoluteName(key), resolveRhs(value)),
        );
        continue;
      }

      directJsonFail("invalid-shape");
    }

    return addBlock(builder, entries);
  };

  return builder.finish(compileObject(parsed));
}

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
const direct = denoteNativeResolvedSourceAnet(
  memory,
  grammarRoot,
  profile,
  directSource,
);

setSame(
  direct.members,
  [VX, VY, admission, current],
  "direct JSON -> native source ANet -> semantic ANet",
);

assert(
  !direct.members.has(Rule),
  "direct JSON Rule binding is metamodel-only",
);
assert(
  !direct.members.has(basis.R),
  "direct JSON Empty:[] binds R without implicit membership",
);

assert(
  direct.bindings.some((binding) =>
    binding.coordinate === null &&
    binding.name === RULE_NAME &&
    binding.value === Rule
  ),
  "direct JSON preserves Rule binding",
);

assert(
  direct.bindings.some((binding) =>
    binding.coordinate === null &&
    binding.name === CURRENT_ALIAS &&
    binding.value === current
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
    binding.name === ONE_R_NAME &&
    binding.value === oneRCarrier
  ),
  "direct JSON OneR uses ExactSequence",
);
assert(
  direct.bindings.some((binding) =>
    binding.coordinate === null &&
    binding.name === TWO_R_NAME &&
    binding.value === twoRCarrier
  ),
  "direct JSON TwoR preserves second R position",
);
assert(
  direct.bindings.some((binding) =>
    binding.coordinate === null &&
    binding.name === NESTED_EMPTY_NAME &&
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
const reverseDirect = denoteNativeResolvedSourceAnet(
  memory,
  grammarRoot,
  profile,
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

const noCurrentDirect = denoteNativeResolvedSourceAnet(
  memory,
  grammarRoot,
  profile,
  compileDirectJsonToNativeSourceAnet(noCurrentDirectJson),
);
assert(
  !noCurrentDirect.members.has(current),
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
    rejected = error instanceof DirectJsonError &&
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
const metaRuleDenotation = denoteNativeResolvedSourceAnet(
  memory,
  grammarRoot,
  profile,
  metaRuleSource,
);

const roleX = memory.ensure(V, X);
const roleY = memory.ensure(V, Y);
const pairXY = memory.ensure(roleX, roleY);
const antecedent = memory.ensure(DIRECT_TAG, pairXY);
const output = memory.ensure(roleY, roleX);
const image = materializeExactSequence(memory, [output]);
const metaBody = memory.ensure(antecedent, image);
const metaRule = memory.ensure(V, metaBody);
const metaAdmission = memory.ensure(Theory, metaRule);

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
  memory.poles(member).start === V
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
const groundedRuleDenotation = denoteNativeResolvedSourceAnet(
  memory,
  grammarRoot,
  profile,
  groundedRuleSource,
);

const groundedImage = materializeExactSequence(memory, [DIRECT_GB]);
const groundedBody = memory.ensure(DIRECT_GA, groundedImage);
const groundedRule = memory.ensure(DIRECT_V0, groundedBody);
const groundedAdmission = memory.ensure(Theory, groundedRule);

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
    rejected = error instanceof DirectJsonError &&
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
  "JSON_GROUNDED_EMPTY_ROLE_RULE=GREEN_RESEARCH",
  "GROUNDED_SEMANTIC_MEMBERS=ADMISSION_ONLY",
  "GROUNDED_ROLE_COUNT=0",
  "GROUNDED_EXACT_MATCH=IDENTITY",
  "GROUNDED_NONIDENTICAL_MATCH=REJECT",
  "GROUNDED_RULE_ARTIFACT_APPROVAL=AUTHOR_REVIEW_REQUIRED",
  "CONCRETE_LOGIC_ARTIFACT_APPROVAL=STILL_REQUIRED",
  "FINAL_JSON_SURFACE=AUTHOR_APPROVED_DESIGN_PROOF_PENDING",
].join(" "));
