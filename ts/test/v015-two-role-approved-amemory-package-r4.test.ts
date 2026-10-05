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
  if (!value) throw new Error("v0.15 two-role A-memory package: " + message);
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
          "formal/v0.15/regression/two-role-meta-rule.json",
        ),
      )
    ) return candidate;
  }
  throw new Error("v0.15 two-role A-memory package: repository root");
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
    { form: profile.blockForm, fields: [
      { role: profile.itemRole, target: "child", min: 0, max: null },
    ] },
    { form: profile.bareForm, fields: [
      { role: profile.bareValueRole, target: "carrier", min: 1, max: 1 },
    ] },
    { form: profile.bindingForm, fields: [
      { role: profile.bindingNameRole, target: "carrier", min: 1, max: 1 },
      { role: profile.bindingValueRole, target: "carrier", min: 1, max: 1 },
    ] },
    { form: profile.bundleForm, fields: [
      { role: profile.bundleAnchorRole, target: "carrier", min: 1, max: 1 },
      { role: profile.bundleBodyRole, target: "child", min: 1, max: 1 },
    ] },
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

function wire(memory: Memory, basis: RootBasis, semantic: LinkHandle): string {
  const carrier = materializeV013HierarchicalCarrierFromSemanticLink(
    memory,
    basis,
    semantic,
  );
  return new TextDecoder().decode(
    serializeV013HierarchicalCarrier(memory, basis, carrier),
  );
}

interface LoweredMetaRule {
  readonly contextRole: LinkHandle;
  readonly canonicalRoles: readonly LinkHandle[];
  readonly antecedentTemplate: LinkHandle;
  readonly outputTemplates: readonly LinkHandle[];
  readonly legacyTheory: LinkHandle;
  readonly interpreter: LinkHandle;
  readonly index: LinkHandle;
}

/**
 * Backend-only compatibility lowering for the Author-approved native
 * role-bundle Rule.  Canonical roles remain ordinary semantic members V->X/Y.
 * Frozen A-memory's legacy StructuralRule representation gets one extra
 * generated context role K so current K->Antecedent can preserve K.
 */
function lowerNativeRoleBundleToLegacy(
  memory: Memory,
  members: ReadonlySet<LinkHandle>,
  theory: LinkHandle,
  rule: LinkHandle,
): LoweredMetaRule {
  const admission = memory.find(theory, rule);
  assert(
    admission !== undefined && members.has(admission),
    "canonical Theory->Rule admission is a semantic member",
  );

  const rulePoles = memory.poles(rule);
  const roleAnchor = rulePoles.start;
  const canonicalRoles = [...members]
    .filter((member) => memory.poles(member).start === roleAnchor);
  same(canonicalRoles.length, 2, "two canonical role members");

  const body = memory.poles(rulePoles.end);
  const antecedentTemplate = body.start;
  const outputTemplates = readExactSequence(memory, body.end).values;
  same(outputTemplates.length, 1, "approved two-role artifact has one output");

  const compatibilitySeed = memory.ensure(rule, theory);
  const contextRole = memory.ensureStartSelfClosed(compatibilitySeed);
  const legacyTheory = memory.ensureEndSelfClosed(compatibilitySeed);
  const grammar = memory.ensure(compatibilitySeed, contextRole);

  const roleDictionary = defineStructuralRoleDictionary(
    memory,
    [contextRole, ...canonicalRoles],
  );
  const before = memory.ensure(contextRole, antecedentTemplate);
  const legacyOutputs = outputTemplates.map(
    (output) => memory.ensure(contextRole, output),
  );
  const legacyImage = materializeExactSequence(memory, legacyOutputs);
  const legacyBody = memory.ensure(before, legacyImage);
  const legacyRule = defineStructuralRule(memory, roleDictionary, legacyBody);
  const legacyAdmission = admitStructuralRule(
    memory,
    legacyTheory,
    legacyRule,
  );
  const triggerKey = memory.poles(antecedentTemplate).start;
  const index = memory.ensure(triggerKey, legacyAdmission);
  const interpreter = defineStructuralInterpreter(
    memory,
    roleDictionary,
    grammar,
    legacyTheory,
  );

  return Object.freeze({
    contextRole,
    canonicalRoles: Object.freeze(canonicalRoles),
    antecedentTemplate,
    outputTemplates: Object.freeze([...outputTemplates]),
    legacyTheory,
    interpreter,
    index,
  });
}

interface CompiledPackage {
  readonly packageJson: string;
  readonly packageDigest: string;
}

function compilePackage(noise = 0): CompiledPackage {
  const f = fixture(noise);
  const root = repositoryRoot();
  const formalBytes = Uint8Array.from(readFileSync(
    resolve(root, "formal/v0.15/regression/two-role-meta-rule.formal"),
  ));
  const jsonBytes = Uint8Array.from(readFileSync(
    resolve(root, "formal/v0.15/regression/two-role-meta-rule.json"),
  ));

  const formal = compileV015DirectFormalSourceAnet(
    f.memory, f.basis, f.grammarRoot, f.sourceAnetProfileRoot, formalBytes,
  );
  const json = compileV015DirectJsonSourceAnet(
    f.memory, f.basis, f.grammarRoot, f.sourceAnetProfileRoot, jsonBytes,
  );
  same(
    formal.sourceAset,
    json.sourceAset,
    "FORMAL/JSON native source ANet parity before backend lowering",
  );

  const denotation: V015SourceAnetDenotation = denoteV015ResolvedSourceAnet(
    f.memory, f.basis, f.grammarRoot, f.sourceAnetProfileRoot, json.sourceAset,
  );
  same(denotation.members.size, 3, "canonical semantic member count");

  const enc = new TextEncoder();
  const carrier = (name: string): LinkHandle =>
    materializeV012StringAnum(f.memory, f.basis, enc.encode(name)).anumLink;
  const absolute = (name: string): LinkHandle =>
    materializeV015ContextualNamePath(
      f.memory, f.basis, f.basis.R, [carrier(name)], true,
    );

  const theory = absolute("Theory");
  const V = absolute("V");
  const metaRuleName = absolute("MetaRule");
  const ruleBinding = denotation.bindings.find(
    (binding) => binding.coordinate === null && binding.name === metaRuleName,
  );
  assert(ruleBinding !== undefined, "MetaRule root binding");
  const rule = ruleBinding.value;

  const lowered = lowerNativeRoleBundleToLegacy(
    f.memory,
    denotation.members,
    theory,
    rule,
  );

  const A = absolute("A");
  const B = absolute("B");
  const Tag = absolute("Tag");
  const actualAntecedent = f.memory.ensure(Tag, f.memory.ensure(A, B));
  const expectedOutput = f.memory.ensure(B, A);

  const caller = f.memory.ensureStartSelfClosed(lowered.interpreter);
  const current = f.memory.ensure(caller, actualAntecedent);
  const expected = f.memory.ensure(caller, expectedOutput);
  const launch = materializeExactSequence(
    f.memory,
    [lowered.interpreter, current, expected],
  );
  const entry = materializeExactSequence(f.memory, [launch]);

  // Same Tag but ROOT in the payload position. ROOT has both-self incidence
  // and therefore cannot satisfy the ordinary PAIR(roleX,roleY) template.
  const negativeAntecedent = f.memory.ensure(Tag, f.basis.R);
  const negativeCurrent = f.memory.ensure(caller, negativeAntecedent);
  const negativeLaunch = materializeExactSequence(
    f.memory,
    [lowered.interpreter, negativeCurrent, negativeCurrent],
  );

  const positiveScope = defineV013WorkingScope(
    f.memory, f.fresh(), lowered.interpreter, [current],
  );
  const positiveCursor = new V013CurrentScopeCursor(f.memory, positiveScope);
  const positive = reactV013StructuralScope(
    f.memory, positiveCursor, f.fresh(),
  );
  same(positive.rawRuleMatches, 1, "legacy compatibility positive match count");
  same(positive.nextMembers.length, 1, "legacy compatibility one result");
  same(positive.nextMembers[0], expected, "legacy compatibility swaps A/B");

  const negativeScope = defineV013WorkingScope(
    f.memory, f.fresh(), lowered.interpreter, [negativeCurrent],
  );
  const negativeCursor = new V013CurrentScopeCursor(f.memory, negativeScope);
  const negative = reactV013StructuralScope(
    f.memory, negativeCursor, f.fresh(),
  );
  same(negative.rawRuleMatches, 0, "wrong-shape negative is inert");
  same(negative.nextMembers[0], negativeCurrent, "negative preserves current");

  // Preserve all three canonical semantic members as provenance. The generated
  // index is the only disconnected backend scaffold needed by old discovery.
  const canonicalMembers = [...denotation.members]
    .map((member) => wire(f.memory, f.basis, member))
    .sort();
  const packageValue = Object.freeze({
    schema: "mts-v015-recursive-execution-package/v0.1",
    links: [
      ...canonicalMembers,
      wire(f.memory, f.basis, lowered.index),
    ],
    entry: wire(f.memory, f.basis, entry),
    negativeEntry: wire(f.memory, f.basis, negativeLaunch),
  });
  const packageJson = JSON.stringify(packageValue);

  // Explicitly verify V remains the canonical role anchor, not a generated
  // RoleDictionary identity.
  const canonicalRoles = [...denotation.members].filter(
    (member) => f.memory.poles(member).start === V,
  );
  same(canonicalRoles.length, 2, "canonical V has exactly two roles");

  return Object.freeze({
    packageJson,
    packageDigest: sha256(packageJson),
  });
}

const first = compilePackage();
const noisy = compilePackage(13);
same(
  noisy.packageJson,
  first.packageJson,
  "two-role A-memory execution package is two-Memory deterministic",
);

console.log([
  "MTS_V015_TWO_ROLE_AMEMORY_PACKAGE=GREEN",
  "PACKAGE_SHA256=" + first.packageDigest,
  "AMEMORY_PACKAGE=" + first.packageJson,
  "LOCAL_LEGACY_DIFFERENTIAL=GREEN",
  "CANONICAL_ROLE_BUNDLE=UNCHANGED",
  "PROGRAM_SPECIFIC_DISPATCH=0",
  "REAL_AMEMORY_REPLAY=PENDING",
].join(" "));
