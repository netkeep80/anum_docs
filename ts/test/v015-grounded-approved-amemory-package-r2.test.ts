import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  materializeExactSequence,
  readExactSequence,
} from "../src/exact-sequence.js";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
  type RootBasis,
} from "../src/memory.js";
import {
  materializeNativeSyntaxGrammar,
  type NativeSyntaxGrammarRuleSpec,
} from "../src/native-syntax-grammar.js";
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
import {
  compileV015DirectFormalSourceAnet,
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
  type V015SourceAnetDenotation,
  type V015SourceAnetProfile,
} from "../src/v015-source-anet.js";
import {
  materializeV013HierarchicalCarrierFromSemanticLink,
  serializeV013HierarchicalCarrier,
} from "../src/v013-hierarchical-carrier.js";
import { materializeV012StringAnum } from "../src/v012-string-anum.js";

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error("v0.15 grounded A-memory package: " + message);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(
    Object.is(actual, expected),
    message + ": " + String(actual) + " !== " + String(expected),
  );
}

function repositoryRoot(): string {
  for (const candidate of [resolve(process.cwd(), ".."), process.cwd()]) {
    if (
      existsSync(
        resolve(
          candidate,
          "formal/v0.15/regression/grounded-zero-role.json",
        ),
      )
    ) {
      return candidate;
    }
  }
  throw new Error("v0.15 grounded A-memory package: repository root");
}

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

interface Fixture {
  readonly memory: Memory;
  readonly basis: RootBasis;
  readonly grammarRoot: LinkHandle;
  readonly sourceAnetProfileRoot: LinkHandle;
  readonly fresh: () => LinkHandle;
}

function fixture(noise = 0): Fixture {
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  let cursor = memory.ensure(basis.U, basis.L);
  for (let index = 0; index < noise; index += 1) {
    cursor = memory.ensure(cursor, index % 2 === 0 ? basis.O : basis.C);
  }
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

  const grammarRoot = materializeNativeSyntaxGrammar(
    memory,
    basis,
    { syntaxTag, markerSeed, rules },
  );
  const sourceAnetProfileRoot = materializeV015SourceAnetProfile(
    memory,
    profile,
  );
  return Object.freeze({
    memory,
    basis,
    grammarRoot,
    sourceAnetProfileRoot,
    fresh,
  });
}

function wire(
  memory: Memory,
  basis: RootBasis,
  semantic: LinkHandle,
): string {
  const carrier = materializeV013HierarchicalCarrierFromSemanticLink(
    memory,
    basis,
    semantic,
  );
  return new TextDecoder().decode(
    serializeV013HierarchicalCarrier(memory, basis, carrier),
  );
}

interface LoweredGroundedRule {
  readonly antecedent: LinkHandle;
  readonly outputs: readonly LinkHandle[];
  readonly contextRole: LinkHandle;
  readonly legacyTheory: LinkHandle;
  readonly interpreter: LinkHandle;
  readonly index: LinkHandle;
}

/**
 * Backend-only compatibility lowering.
 *
 * Canonical v0.15 semantic Rule:
 *   Rule = V0 -> (A -> ExactSequence(outputs))
 *   Theory -> Rule is the semantic admission
 *   roles(V0,M_t) = empty
 *
 * Frozen v0.13/A-memory structural executor needs one generated context role
 * K so it can preserve the caller/context around the exact grounded endpoint:
 *   K->A => [K->output...]
 *
 * No logical-element name, truth row or opcode participates in this lowering.
 */
function lowerZeroRoleRuleToLegacy(
  memory: Memory,
  members: ReadonlySet<LinkHandle>,
  theory: LinkHandle,
  rule: LinkHandle,
): LoweredGroundedRule {
  const admission = memory.find(theory, rule);
  assert(
    admission !== undefined && members.has(admission),
    "canonical Theory->Rule admission is a semantic member",
  );

  const rulePoles = memory.poles(rule);
  const roleAnchor = rulePoles.start;
  const roleMembers = [...members].filter(
    (member) => memory.poles(member).start === roleAnchor,
  );
  same(roleMembers.length, 0, "compatibility lowering accepts zero-role Rule only");

  const body = memory.poles(rulePoles.end);
  const antecedent = body.start;
  const outputs = readExactSequence(memory, body.end).values;

  const compatibilitySeed = memory.ensure(rule, theory);
  const contextRole = memory.ensureStartSelfClosed(compatibilitySeed);
  const legacyTheory = memory.ensureEndSelfClosed(compatibilitySeed);
  const grammar = memory.ensure(compatibilitySeed, contextRole);

  const roleDictionary = defineStructuralRoleDictionary(memory, [contextRole]);
  const before = memory.ensure(contextRole, antecedent);
  const outputTemplates = outputs.map(
    (output) => memory.ensure(contextRole, output),
  );
  const legacyImage = materializeExactSequence(memory, outputTemplates);
  const legacyBody = memory.ensure(before, legacyImage);
  const legacyRule = defineStructuralRule(memory, roleDictionary, legacyBody);
  const legacyAdmission = admitStructuralRule(
    memory,
    legacyTheory,
    legacyRule,
  );
  const triggerKey = memory.poles(antecedent).start;
  const index = memory.ensure(triggerKey, legacyAdmission);
  const interpreter = defineStructuralInterpreter(
    memory,
    roleDictionary,
    grammar,
    legacyTheory,
  );

  return Object.freeze({
    antecedent,
    outputs: Object.freeze([...outputs]),
    contextRole,
    legacyTheory,
    interpreter,
    index,
  });
}

interface CompiledPackage {
  readonly packageJson: string;
  readonly packageDigest: string;
  readonly positiveCurrentWire: string;
  readonly positiveExpectedWire: string;
  readonly negativeCurrentWire: string;
}

function compilePackage(noise = 0): CompiledPackage {
  const f = fixture(noise);
  const root = repositoryRoot();
  const formalBytes = Uint8Array.from(
    readFileSync(
      resolve(root, "formal/v0.15/regression/grounded-zero-role.formal"),
    ),
  );
  const jsonBytes = Uint8Array.from(
    readFileSync(
      resolve(root, "formal/v0.15/regression/grounded-zero-role.json"),
    ),
  );

  const fromFormal = compileV015DirectFormalSourceAnet(
    f.memory,
    f.basis,
    f.grammarRoot,
    f.sourceAnetProfileRoot,
    formalBytes,
  );
  const fromJson = compileV015DirectJsonSourceAnet(
    f.memory,
    f.basis,
    f.grammarRoot,
    f.sourceAnetProfileRoot,
    jsonBytes,
  );
  same(
    fromFormal.sourceAset,
    fromJson.sourceAset,
    "FORMAL/JSON native source ANet parity before backend lowering",
  );

  const denotation: V015SourceAnetDenotation = denoteV015ResolvedSourceAnet(
    f.memory,
    f.basis,
    f.grammarRoot,
    f.sourceAnetProfileRoot,
    fromJson.sourceAset,
  );
  same(denotation.members.size, 1, "canonical semantic member count");

  const enc = new TextEncoder();
  const carrier = (name: string): LinkHandle =>
    materializeV012StringAnum(
      f.memory,
      f.basis,
      enc.encode(name),
    ).anumLink;
  const absolute = (name: string): LinkHandle =>
    materializeV015ContextualNamePath(
      f.memory,
      f.basis,
      f.basis.R,
      [carrier(name)],
      true,
    );

  const theory = absolute("Theory");
  const ruleName = absolute("GroundRule");
  const ruleBinding = denotation.bindings.find(
    (binding) =>
      binding.coordinate === null &&
      binding.name === ruleName
  );
  assert(ruleBinding !== undefined, "GroundRule root binding");
  const rule = ruleBinding.value;

  const lowered = lowerZeroRoleRuleToLegacy(
    f.memory,
    denotation.members,
    theory,
    rule,
  );
  same(lowered.outputs.length, 1, "approved grounded artifact has one output");
  const output = lowered.outputs[0]!;

  // Deterministic backend caller derived from the generated interpreter.
  const caller = f.memory.ensureStartSelfClosed(lowered.interpreter);
  const current = f.memory.ensure(caller, lowered.antecedent);
  const expected = f.memory.ensure(caller, output);
  const launch = materializeExactSequence(
    f.memory,
    [lowered.interpreter, current, expected],
  );
  const entry = materializeExactSequence(f.memory, [launch]);

  // Negative vector uses an existing canonical Link as a non-identical
  // antecedent, avoiding any extra named program constant.
  assert(theory !== lowered.antecedent, "Theory differs from grounded antecedent");
  const negativeCurrent = f.memory.ensure(caller, theory);
  const negativeLaunch = materializeExactSequence(
    f.memory,
    [lowered.interpreter, negativeCurrent, negativeCurrent],
  );

  // Local differential before external A-memory replay.
  const positiveScope = defineV013WorkingScope(
    f.memory,
    f.fresh(),
    lowered.interpreter,
    [current],
  );
  const positiveCursor = new V013CurrentScopeCursor(f.memory, positiveScope);
  same(positiveCursor.members().length, 1, "local positive Scope has one member");
  const positive = reactV013StructuralScope(
    f.memory,
    positiveCursor,
    f.fresh(),
  );
  same(positive.rawRuleMatches, 1, "legacy compatibility positive match count");
  same(positive.nextMembers.length, 1, "legacy compatibility positive result count");
  same(positive.nextMembers[0], expected, "legacy compatibility positive result");

  const negativeScope = defineV013WorkingScope(
    f.memory,
    f.fresh(),
    lowered.interpreter,
    [negativeCurrent],
  );
  const negativeCursor = new V013CurrentScopeCursor(f.memory, negativeScope);
  same(negativeCursor.members().length, 1, "local negative Scope has one member");
  const negative = reactV013StructuralScope(
    f.memory,
    negativeCursor,
    f.fresh(),
  );
  same(negative.rawRuleMatches, 0, "legacy compatibility mismatch is inert");
  same(
    negative.nextMembers[0],
    negativeCurrent,
    "legacy compatibility mismatch preserves current member",
  );

  const canonicalAdmission = [...denotation.members][0]!;
  const packageValue = Object.freeze({
    schema: "mts-v015-recursive-execution-package/v0.1",
    // Canonical semantic admission is loaded as provenance; generated index is
    // the only backend execution scaffold selected by the legacy interpreter.
    links: [
      wire(f.memory, f.basis, canonicalAdmission),
      wire(f.memory, f.basis, lowered.index),
    ],
    entry: wire(f.memory, f.basis, entry),
    negativeEntry: wire(f.memory, f.basis, negativeLaunch),
  });
  const packageJson = JSON.stringify(packageValue);

  return Object.freeze({
    packageJson,
    packageDigest: sha256(packageJson),
    positiveCurrentWire: wire(f.memory, f.basis, current),
    positiveExpectedWire: wire(f.memory, f.basis, expected),
    negativeCurrentWire: wire(f.memory, f.basis, negativeCurrent),
  });
}

const first = compilePackage();
const noisy = compilePackage(13);
same(
  noisy.packageJson,
  first.packageJson,
  "A-memory recursive execution package is two-Memory deterministic",
);

const persistedPackage = readFileSync(
  resolve(
    repositoryRoot(),
    "formal/v0.15/regression/grounded-zero-role.amemory-package.json",
  ),
  "utf8",
);
same(
  first.packageJson,
  persistedPackage,
  "persisted frozen A-memory package is exact generated package",
);
same(
  first.packageDigest,
  "354be494b42c78d310a868144f5c63fec915fec932a01d1d36b274d79258fce4",
  "frozen A-memory package digest",
);

console.log([
  "MTS_V015_GROUNDED_AMEMORY_PACKAGE=GREEN",
  "PACKAGE_SHA256=" + first.packageDigest,
  "POSITIVE_CURRENT=" + first.positiveCurrentWire,
  "POSITIVE_EXPECTED=" + first.positiveExpectedWire,
  "NEGATIVE_CURRENT=" + first.negativeCurrentWire,
  "AMEMORY_PACKAGE_ARTIFACT=formal/v0.15/regression/grounded-zero-role.amemory-package.json",
  "LOCAL_LEGACY_DIFFERENTIAL=GREEN",
  "PROGRAM_SPECIFIC_DISPATCH=0",
  "REAL_AMEMORY_REPLAY=PENDING",
].join(" "));
