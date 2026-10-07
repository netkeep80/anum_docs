// mts-version-evidence: v0.15-boolean-package-replay-a2
// owner: #2007 / approval owner #1980
//
// Canonical Boolean AND/NOT/OR/XOR package/replay gate.
// All source artifacts are the Author-approved regression/* corpus.
// Generated compatibility topology has no MTS semantic authority.
// Integration boundary: canonical source comes exclusively from regression/*; candidate copies are historical research only.

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

function repositoryRoot(): string {
  for (const candidate of [resolve(process.cwd(), ".."), process.cwd()]) {
    if (
      existsSync(
        resolve(candidate, "formal/v0.15/regression/compact-and.formal"),
      )
    ) return candidate;
  }
  throw new Error("v0.15 compact AND: repository root");
}

const repoRoot = repositoryRoot();
const andFormal = readFileSync(
  resolve(repoRoot, "formal/v0.15/regression/compact-and.formal"),
  "utf8",
);
const andJson = readFileSync(
  resolve(repoRoot, "formal/v0.15/regression/compact-and.json"),
  "utf8",
);
same(
  createHash("sha256").update(andFormal, "utf8").digest("hex"),
  "4a5bc92e661ee1d4e0c2c5d51769805b5406651bb491345200d088c9ad23e5f3",
  "exact approved FORMAL digest",
);
same(
  createHash("sha256").update(andJson, "utf8").digest("hex"),
  "cf5028f68500bba04ee10e06ac5512eec223078d8b428f4d5de1de6433ba5941",
  "exact approved JSON digest",
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

function compile(
  f: Fixture,
  formalSource = andFormal,
  jsonSource = andJson,
): Compiled {
  const enc = new TextEncoder();
  const ff = compileV015DirectFormalSourceAnet(
    f.memory,
    f.basis,
    f.grammarRoot,
    f.sourceAnetProfileRoot,
    enc.encode(formalSource),
  );
  const jj = compileV015DirectJsonSourceAnet(
    f.memory,
    f.basis,
    f.grammarRoot,
    f.sourceAnetProfileRoot,
    enc.encode(jsonSource),
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
  readonly semanticWires: readonly string[];
  readonly backendIndexWires: readonly string[];
}

interface GroundedPackageSpec {
  readonly id: "AND" | "NOT" | "OR" | "XOR";
  readonly formal: string;
  readonly json: string;
  readonly rows: readonly BooleanRowSpec[];
  readonly negative: readonly string[];
}

function packageSpec(id: GroundedPackageSpec["id"]): GroundedPackageSpec {
  if (id === "AND") {
    return Object.freeze({
      id,
      formal: andFormal,
      json: andJson,
      rows: Object.freeze([
        { args: ["F", "F"], expected: "F", label: "FF" },
        { args: ["F", "T"], expected: "F", label: "FT" },
        { args: ["T", "F"], expected: "F", label: "TF" },
        { args: ["T", "T"], expected: "T", label: "TT" },
      ]),
      negative: Object.freeze(["T", "X"]),
    });
  }
  const lower = id.toLowerCase();
  const formalSource = readFileSync(
    resolve(repoRoot, "formal/v0.15/regression/compact-" + lower + ".formal"),
    "utf8",
  );
  const jsonSource = readFileSync(
    resolve(repoRoot, "formal/v0.15/regression/compact-" + lower + ".json"),
    "utf8",
  );
  if (id === "NOT") {
    return Object.freeze({
      id,
      formal: formalSource,
      json: jsonSource,
      rows: Object.freeze([
        { args: ["F"], expected: "T", label: "F" },
        { args: ["T"], expected: "F", label: "T" },
      ]),
      negative: Object.freeze(["X"]),
    });
  }
  if (id === "OR") {
    return Object.freeze({
      id,
      formal: formalSource,
      json: jsonSource,
      rows: Object.freeze([
        { args: ["F", "F"], expected: "F", label: "FF" },
        { args: ["F", "T"], expected: "T", label: "FT" },
        { args: ["T", "F"], expected: "T", label: "TF" },
        { args: ["T", "T"], expected: "T", label: "TT" },
      ]),
      negative: Object.freeze(["T", "X"]),
    });
  }
  return Object.freeze({
    id,
    formal: formalSource,
    json: jsonSource,
    rows: Object.freeze([
      { args: ["F", "F"], expected: "F", label: "FF" },
      { args: ["F", "T"], expected: "T", label: "FT" },
      { args: ["T", "F"], expected: "T", label: "TF" },
      { args: ["T", "T"], expected: "F", label: "TT" },
    ]),
    negative: Object.freeze(["T", "X"]),
  });
}

function discoverAdmittedRules(
  f: Fixture,
  compiled: Compiled,
  theory: LinkHandle,
): readonly LinkHandle[] {
  const rules: LinkHandle[] = [];
  for (const member of compiled.denotation.members) {
    const poles = f.memory.poles(member);
    if (poles.start === theory) rules.push(poles.end);
  }
  assert(rules.length > 0, "semantic Theory has admitted Rules");
  return Object.freeze(rules);
}

interface BooleanRowSpec {
  readonly args: readonly string[];
  readonly expected: string;
  readonly label: string;
}

function exerciseGroundedBooleanCandidate(
  formalPath: string,
  jsonPath: string,
  operatorName: string,
  rows: readonly BooleanRowSpec[],
): void {
  const formalSource = readFileSync(resolve(repoRoot, formalPath), "utf8");
  const jsonSource = readFileSync(resolve(repoRoot, jsonPath), "utf8");
  const f = fixture();
  const compiled = compile(f, formalSource, jsonSource);
  const theory = compiled.absolute("Theory");
  const rules = discoverAdmittedRules(f, compiled, theory);
  const compatibility = lowerRules(f, compiled, theory, rules);

  same(
    compiled.denotation.members.size,
    rows.length,
    operatorName + " semantic member/rule count",
  );
  same(rules.length, rows.length, operatorName + " discovered Rule count");

  const op = compiled.binding(operatorName);
  const F = compiled.binding("F");
  const T = compiled.binding("T");
  const value = (bit: string): LinkHandle => {
    assert(bit === "F" || bit === "T", operatorName + " row bit is F/T");
    return bit === "F" ? F : T;
  };
  const caller = f.memory.ensureStartSelfClosed(compatibility.interpreter);

  for (const row of rows) {
    const antecedent = f.memory.ensure(
      op,
      materializeExactSequence(f.memory, row.args.map(value)),
    );
    const current = f.memory.ensure(caller, antecedent);
    const expected = f.memory.ensure(caller, value(row.expected));
    const scope = defineV013WorkingScope(
      f.memory,
      f.fresh(),
      compatibility.interpreter,
      [current],
    );
    const cursor = new V013CurrentScopeCursor(f.memory, scope);
    const local = reactV013StructuralScope(f.memory, cursor, f.fresh());
    same(local.rawRuleMatches, 1, operatorName + " " + row.label + " match");
    same(local.transitionedMembers, 1, operatorName + " " + row.label + " transition");
    same(local.nextMembers.length, 1, operatorName + " " + row.label + " result count");
    same(local.nextMembers[0], expected, operatorName + " " + row.label + " result");
  }

  const X = compiled.absolute("NonBooleanOperand");
  const invalidValues = rows[0]?.args.length === 1 ? [X] : [F, X];
  assert(invalidValues !== undefined, operatorName + " negative input");
  const invalidAntecedent = f.memory.ensure(
    op,
    materializeExactSequence(f.memory, invalidValues),
  );
  const negativeCurrent = f.memory.ensure(caller, invalidAntecedent);
  const negativeScope = defineV013WorkingScope(
    f.memory,
    f.fresh(),
    compatibility.interpreter,
    [negativeCurrent],
  );
  const negativeCursor = new V013CurrentScopeCursor(f.memory, negativeScope);
  const negative = reactV013StructuralScope(f.memory, negativeCursor, f.fresh());
  same(negative.rawRuleMatches, 0, operatorName + " non-Boolean NO_MATCH");
  same(negative.nextMembers[0], negativeCurrent, operatorName + " negative preserves current");
}

function buildPackage(
  noise = 0,
  selectedId: GroundedPackageSpec["id"] = "AND",
): PackageResult {
  const spec = packageSpec(selectedId);
  const f = fixture(noise);
  const compiled = compile(f, spec.formal, spec.json);

  const theory = compiled.absolute("Theory");
  const rules = discoverAdmittedRules(f, compiled, theory);
  const compatibility = lowerRules(f, compiled, theory, rules);

  const admissions = rules.map((rule) => f.memory.ensure(theory, rule));
  same(compiled.denotation.members.size, spec.rows.length, selectedId + " canonical member count");
  same(rules.length, spec.rows.length, selectedId + " discovered Rule count");
  for (const admission of admissions) {
    assert(
      compiled.denotation.members.has(admission),
      selectedId + " grounded Rule admission is canonical semantic membership",
    );
  }

  const op = compiled.binding(selectedId);
  const F = compiled.binding("F");
  const T = compiled.binding("T");
  const value = (bit: string): LinkHandle => {
    assert(bit === "F" || bit === "T", selectedId + " package bit is F/T");
    return bit === "F" ? F : T;
  };
  const caller = f.memory.ensureStartSelfClosed(compatibility.interpreter);

  const launches: LinkHandle[] = [];
  for (const row of spec.rows) {
    const antecedent = f.memory.ensure(
      op,
      materializeExactSequence(f.memory, row.args.map(value)),
    );
    const current = f.memory.ensure(caller, antecedent);
    const result = f.memory.ensure(caller, value(row.expected));

    const scope = defineV013WorkingScope(
      f.memory,
      f.fresh(),
      compatibility.interpreter,
      [current],
    );
    const cursor = new V013CurrentScopeCursor(f.memory, scope);
    const local = reactV013StructuralScope(f.memory, cursor, f.fresh());
    same(local.rawRuleMatches, 1, selectedId + " " + row.label + " local match");
    same(local.transitionedMembers, 1, selectedId + " " + row.label + " local transition");
    same(local.nextMembers.length, 1, selectedId + " " + row.label + " local result count");
    same(local.nextMembers[0], result, selectedId + " " + row.label + " local result");

    launches.push(
      materializeExactSequence(
        f.memory,
        [compatibility.interpreter, current, result],
      ),
    );
  }

  const X = compiled.absolute("NonBooleanOperand");
  const negativeValues = spec.negative.map(
    (item): LinkHandle => {
      assert(item === "F" || item === "T" || item === "X", selectedId + " negative symbol");
      return item === "X" ? X : value(item);
    },
  );
  const invalidAntecedent = f.memory.ensure(
    op,
    materializeExactSequence(f.memory, negativeValues),
  );
  const negativeCurrent = f.memory.ensure(caller, invalidAntecedent);
  const negativeScope = defineV013WorkingScope(
    f.memory,
    f.fresh(),
    compatibility.interpreter,
    [negativeCurrent],
  );
  const negativeCursor = new V013CurrentScopeCursor(f.memory, negativeScope);
  const negative = reactV013StructuralScope(f.memory, negativeCursor, f.fresh());
  same(negative.rawRuleMatches, 0, selectedId + " non-Boolean negative no match");
  same(negative.nextMembers[0], negativeCurrent, selectedId + " negative preserves current");
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
    negativeEntry: wire(f.memory, f.basis, negativeLaunch),
  });
  return Object.freeze({
    json: JSON.stringify(packageValue),
    semanticWires: Object.freeze(canonicalWires),
    backendIndexWires: Object.freeze(indexWires),
  });
}

const requested = process.env.V015_BOOLEAN_OPERATOR ?? "AND";
assert(
  requested === "AND" || requested === "NOT" || requested === "OR" || requested === "XOR",
  "V015_BOOLEAN_OPERATOR is AND/NOT/OR/XOR",
);
const selectedId = requested as GroundedPackageSpec["id"];
const first = buildPackage(0, selectedId);
const second = buildPackage(19, selectedId);
same(
  first.json,
  second.json,
  selectedId + " compatibility package is allocation-order deterministic",
);

if (selectedId === "AND") {
  const persistedPackage = readFileSync(
    resolve(repoRoot, "formal/v0.15/regression/compact-and.amemory-package.json"),
    "utf8",
  );
  same(
    createHash("sha256").update(persistedPackage, "utf8").digest("hex"),
    "749f2eca71bd0e7f5d9ffb6d7d9e9e530b2aea8b3318e2a8bae25a423c347c8a",
    "pinned compact AND A-memory package digest",
  );
  same(first.json, persistedPackage, "persisted compact AND package exact bytes");
  const persistedRecursive = readFileSync(
    resolve(repoRoot, "formal/v0.15/regression/compact-and.recursive"),
    "utf8",
  );
  same(
    first.semanticWires.join("\n") + "\n",
    persistedRecursive,
    "persisted compact AND recursive semantic-member set",
  );
  const persistedEvidenceText = readFileSync(
    resolve(repoRoot, "formal/v0.15/regression/compact-and.amemory-evidence.json"),
    "utf8",
  );
  same(
    createHash("sha256").update(persistedEvidenceText, "utf8").digest("hex"),
    "9283e135f57629acef84579ff91c374b91bc390ebdc39e5449b344174d17692a",
    "pinned compact AND frozen A-memory evidence digest",
  );
  const persistedEvidence = JSON.parse(persistedEvidenceText) as {
    readonly schema: string;
    readonly runs: readonly unknown[];
    readonly negative_run: unknown;
  };
  same(
    persistedEvidence.schema,
    "mts-v015-recursive-execution-evidence/v0.1",
    "persisted compact AND A-memory evidence schema",
  );
  same(persistedEvidence.runs.length, 4, "persisted compact AND evidence rows");
}

console.error(
  "BOOLEAN_PACKAGE_OPERATOR=" + selectedId +
  " SEMANTIC_WIRES=" + JSON.stringify(first.semanticWires),
);
console.error(
  "BOOLEAN_PACKAGE_OPERATOR=" + selectedId +
  " BACKEND_INDEX_WIRES=" + JSON.stringify(first.backendIndexWires),
);
console.error(
  "BOOLEAN_PACKAGE_OPERATOR=" + selectedId +
  " PACKAGE_SHA256=" + createHash("sha256").update(first.json, "utf8").digest("hex"),
);
const selectedPackage = JSON.parse(first.json) as {
  readonly entry: string;
  readonly negativeEntry: string;
};
console.error(
  "BOOLEAN_PACKAGE_OPERATOR=" + selectedId +
  " ENTRY_WIRE=" + selectedPackage.entry,
);
console.error(
  "BOOLEAN_PACKAGE_OPERATOR=" + selectedId +
  " NEGATIVE_ENTRY_WIRE=" + selectedPackage.negativeEntry,
);
process.stdout.write(first.json);

