// mts-version-evidence: candidate-v0.15-compact-and-a2
// owner: #1980
//
// Temporary research package only. It deliberately emits no canonical AND
// source artifact and confers no Author approval.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
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
  if (!value) throw new Error("v0.15 compact AND A2: " + message);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(
    Object.is(actual, expected),
    message + ": " + String(actual) + " !== " + String(expected),
  );
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
  for (let i = 0; i < noise; i += 1) {
    cursor = memory.ensure(cursor, i % 2 === 0 ? basis.O : basis.C);
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

  const grammarRoot = materializeNativeSyntaxGrammar(memory, basis, {
    syntaxTag: fresh(),
    markerSeed: fresh(),
    rules,
  });
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

const repoRoot = resolve(process.cwd(), "..");
const formal = readFileSync(
  resolve(repoRoot, "formal/v0.15/candidates/compact-and.formal"),
  "utf8",
);
const json = readFileSync(
  resolve(repoRoot, "formal/v0.15/candidates/compact-and.json"),
  "utf8",
);
same(
  createHash("sha256").update(formal, "utf8").digest("hex"),
  "16fddc9f8245fd7237a67424364d9b1991fa256287d0101509f038158c64edd6",
  "exact candidate FORMAL digest",
);
same(
  createHash("sha256").update(json, "utf8").digest("hex"),
  "efc4d9a04897903b05f5a37b77d5cf12848987049fbb31cb3624756f0bd7eab1",
  "exact candidate JSON digest",
);

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

interface Compiled {
  readonly denotation: V015SourceAnetDenotation;
  readonly absolute: (name: string) => LinkHandle;
  readonly binding: (name: string) => LinkHandle;
}

function compile(f: Fixture): Compiled {
  const enc = new TextEncoder();
  const ff = compileV015DirectFormalSourceAnet(
    f.memory,
    f.basis,
    f.grammarRoot,
    f.sourceAnetProfileRoot,
    enc.encode(formal),
  );
  const jj = compileV015DirectJsonSourceAnet(
    f.memory,
    f.basis,
    f.grammarRoot,
    f.sourceAnetProfileRoot,
    enc.encode(json),
  );
  same(ff.sourceAset, jj.sourceAset, "FORMAL/JSON source ANet parity");

  const denotation = denoteV015ResolvedSourceAnet(
    f.memory,
    f.basis,
    f.grammarRoot,
    f.sourceAnetProfileRoot,
    jj.sourceAset,
  );

  const nameCarrier = (name: string): LinkHandle =>
    materializeV012StringAnum(
      f.memory,
      f.basis,
      enc.encode(name),
    ).anumLink;
  const absolute = (name: string): LinkHandle =>
    name === "R"
      ? f.basis.R
      : materializeV015ContextualNamePath(
          f.memory,
          f.basis,
          f.basis.R,
          [nameCarrier(name)],
          true,
        );
  const binding = (name: string): LinkHandle => {
    const id = absolute(name);
    const found = denotation.bindings.find(
      (entry) => entry.coordinate === null && entry.name === id,
    );
    assert(found !== undefined, "root binding " + name);
    return found.value;
  };

  return Object.freeze({ denotation, absolute, binding });
}

interface Compatibility {
  readonly interpreter: LinkHandle;
  readonly indexes: readonly LinkHandle[];
}

function lowerRules(
  f: Fixture,
  compiled: Compiled,
  theory: LinkHandle,
  rules: readonly LinkHandle[],
): Compatibility {
  const ruleSequence = materializeExactSequence(f.memory, rules);
  const seed = f.memory.ensure(theory, ruleSequence);
  const contextRole = f.memory.ensureStartSelfClosed(seed);
  const legacyTheory = f.memory.ensureEndSelfClosed(seed);
  const grammar = f.memory.ensure(seed, contextRole);
  const kernelDictionary = defineStructuralRoleDictionary(
    f.memory,
    [contextRole],
  );
  const interpreter = defineStructuralInterpreter(
    f.memory,
    kernelDictionary,
    grammar,
    legacyTheory,
  );

  const indexes: LinkHandle[] = [];
  for (const rule of rules) {
    const canonicalAdmission = f.memory.find(theory, rule);
    assert(
      canonicalAdmission !== undefined &&
        compiled.denotation.members.has(canonicalAdmission),
      "canonical rule admission is semantic membership",
    );

    const rulePoles = f.memory.poles(rule);
    const roleAnchor = rulePoles.start;
    const canonicalRoles = [...compiled.denotation.members].filter(
      (member) => f.memory.poles(member).start === roleAnchor,
    );

    const body = f.memory.poles(rulePoles.end);
    const antecedent = body.start;
    const outputs = readExactSequence(f.memory, body.end).values;

    const roleDictionary = defineStructuralRoleDictionary(
      f.memory,
      [contextRole, ...canonicalRoles],
    );
    const before = f.memory.ensure(contextRole, antecedent);
    const legacyOutputs = outputs.map(
      (output) => f.memory.ensure(contextRole, output),
    );
    const image = materializeExactSequence(f.memory, legacyOutputs);
    const legacyBody = f.memory.ensure(before, image);
    const legacyRule = defineStructuralRule(
      f.memory,
      roleDictionary,
      legacyBody,
    );
    const legacyAdmission = admitStructuralRule(
      f.memory,
      legacyTheory,
      legacyRule,
    );
    const triggerKey = f.memory.poles(antecedent).start;
    indexes.push(f.memory.ensure(triggerKey, legacyAdmission));
  }

  return Object.freeze({
    interpreter,
    indexes: Object.freeze(indexes),
  });
}

interface PackageResult {
  readonly json: string;
}

function buildPackage(noise = 0): PackageResult {
  const f = fixture(noise);
  const compiled = compile(f);

  const theory = compiled.absolute("Theory");
  const ruleF = compiled.binding("RuleF");
  const ruleT = compiled.binding("RuleT");
  const compatibility = lowerRules(
    f,
    compiled,
    theory,
    [ruleF, ruleT],
  );

  const roleY = compiled.binding("RoleY");
  const canonicalAdmissionF = f.memory.ensure(theory, ruleF);
  const canonicalAdmissionT = f.memory.ensure(theory, ruleT);
  same(compiled.denotation.members.size, 3, "canonical member count");
  assert(compiled.denotation.members.has(roleY), "one canonical role member");
  assert(compiled.denotation.members.has(canonicalAdmissionF), "RuleF admission");
  assert(compiled.denotation.members.has(canonicalAdmissionT), "RuleT admission");

  const AND = compiled.binding("AND");
  const F = compiled.binding("F");
  const T = compiled.binding("T");
  const caller = f.memory.ensureStartSelfClosed(compatibility.interpreter);

  const launches: LinkHandle[] = [];
  for (const [left, right, expected, label] of [
    [F, F, F, "FF"],
    [F, T, F, "FT"],
    [T, F, F, "TF"],
    [T, T, T, "TT"],
  ] as const) {
    const antecedent = f.memory.ensure(
      AND,
      materializeExactSequence(f.memory, [left, right]),
    );
    const current = f.memory.ensure(caller, antecedent);
    const result = f.memory.ensure(caller, expected);

    const scope = defineV013WorkingScope(
      f.memory,
      f.fresh(),
      compatibility.interpreter,
      [current],
    );
    const cursor = new V013CurrentScopeCursor(f.memory, scope);
    const local = reactV013StructuralScope(
      f.memory,
      cursor,
      f.fresh(),
    );
    same(local.rawRuleMatches, 1, label + " local match");
    same(local.transitionedMembers, 1, label + " local transition");
    same(local.nextMembers.length, 1, label + " local result count");
    same(local.nextMembers[0], result, label + " local result");

    launches.push(
      materializeExactSequence(
        f.memory,
        [compatibility.interpreter, current, result],
      ),
    );
  }

  const malformedAntecedent = f.memory.ensure(AND, f.basis.R);
  const negativeCurrent = f.memory.ensure(caller, malformedAntecedent);
  const negativeScope = defineV013WorkingScope(
    f.memory,
    f.fresh(),
    compatibility.interpreter,
    [negativeCurrent],
  );
  const negativeCursor = new V013CurrentScopeCursor(f.memory, negativeScope);
  const negative = reactV013StructuralScope(
    f.memory,
    negativeCursor,
    f.fresh(),
  );
  same(negative.rawRuleMatches, 0, "negative no match");
  same(negative.nextMembers[0], negativeCurrent, "negative preserves current");
  const negativeLaunch = materializeExactSequence(
    f.memory,
    [compatibility.interpreter, negativeCurrent, negativeCurrent],
  );

  const canonicalWires = [...compiled.denotation.members]
    .map((member) => wire(f.memory, f.basis, member))
    .sort();
  const indexWires = compatibility.indexes
    .map((index) => wire(f.memory, f.basis, index))
    .sort();

  const packageValue = Object.freeze({
    schema: "mts-v015-recursive-execution-package/v0.1",
    links: [...canonicalWires, ...indexWires],
    entry: wire(
      f.memory,
      f.basis,
      materializeExactSequence(f.memory, launches),
    ),
    negativeEntry: wire(
      f.memory,
      f.basis,
      negativeLaunch,
    ),
  });
  return Object.freeze({ json: JSON.stringify(packageValue) });
}

const first = buildPackage(0);
const second = buildPackage(19);
same(
  first.json,
  second.json,
  "compact AND compatibility package is allocation-order deterministic",
);
process.stdout.write(first.json);
