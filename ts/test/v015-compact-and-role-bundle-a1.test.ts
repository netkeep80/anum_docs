// mts-version-evidence: candidate-v0.15-compact-and-a1
// owner: #1980
//
// Research candidate only. Exact JSON/FORMAL is NOT Author-approved by this
// test and MUST NOT enter the approved corpus without explicit Author review.

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
  StructuralRuleError,
} from "../src/structural-rule.js";
import {
  unifyStructuralRuleTemplate,
} from "../src/structural-unification.js";
import {
  instantiateV013StructuralTemplate,
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
import { materializeV012StringAnum } from "../src/v012-string-anum.js";

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error("v0.15 compact AND A1: " + message);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), message + ": " + String(actual) + " !== " + String(expected));
}

function setSame(
  actual: ReadonlySet<LinkHandle>,
  expected: readonly LinkHandle[],
  message: string,
): void {
  assert(actual.size === new Set(expected).size, message + " cardinality");
  for (const value of expected) assert(actual.has(value), message + " member");
}

interface Fixture {
  readonly memory: Memory;
  readonly basis: RootBasis;
  readonly grammarRoot: LinkHandle;
  readonly sourceAnetProfileRoot: LinkHandle;
}

function fixture(): Fixture {
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
  const sourceAnetProfileRoot = materializeV015SourceAnetProfile(memory, profile);
  return Object.freeze({ memory, basis, grammarRoot, sourceAnetProfileRoot });
}

const repoRoot = resolve(process.cwd(), "..");
const canonicalFormal = readFileSync(
  resolve(repoRoot, "formal/v0.15/candidates/compact-and.formal"),
  "utf8",
);
const canonicalJson = readFileSync(
  resolve(repoRoot, "formal/v0.15/candidates/compact-and.json"),
  "utf8",
);
same(
  createHash("sha256").update(canonicalFormal, "utf8").digest("hex"),
  "16fddc9f8245fd7237a67424364d9b1991fa256287d0101509f038158c64edd6",
  "exact candidate FORMAL digest",
);
same(
  createHash("sha256").update(canonicalJson, "utf8").digest("hex"),
  "efc4d9a04897903b05f5a37b77d5cf12848987049fbb31cb3624756f0bd7eab1",
  "exact candidate JSON digest",
);

function compileCandidate(
  f: Fixture,
  formal = canonicalFormal,
  json = canonicalJson,
): Readonly<{
  sourceAset: LinkHandle;
  denotation: V015SourceAnetDenotation;
  absolute: (name: string) => LinkHandle;
  binding: (name: string) => LinkHandle;
}> {
  const enc = new TextEncoder();
  const fromFormal = compileV015DirectFormalSourceAnet(
    f.memory, f.basis, f.grammarRoot, f.sourceAnetProfileRoot, enc.encode(formal),
  );
  const fromJson = compileV015DirectJsonSourceAnet(
    f.memory, f.basis, f.grammarRoot, f.sourceAnetProfileRoot, enc.encode(json),
  );
  same(fromFormal.sourceAset, fromJson.sourceAset, "FORMAL/JSON source ANet parity");

  const denotation = denoteV015ResolvedSourceAnet(
    f.memory, f.basis, f.grammarRoot, f.sourceAnetProfileRoot, fromJson.sourceAset,
  );

  const carrier = (name: string): LinkHandle =>
    materializeV012StringAnum(f.memory, f.basis, enc.encode(name)).anumLink;
  const absolute = (name: string): LinkHandle =>
    name === "R"
      ? f.basis.R
      : materializeV015ContextualNamePath(
          f.memory, f.basis, f.basis.R, [carrier(name)], true,
        );
  const binding = (name: string): LinkHandle => {
    const coordinate = absolute(name);
    const found = denotation.bindings.find(
      (entry) => entry.coordinate === null && entry.name === coordinate,
    );
    assert(found !== undefined, "root binding " + name);
    return found.value;
  };

  return Object.freeze({
    sourceAset: fromJson.sourceAset,
    denotation,
    absolute,
    binding,
  });
}

function reactGeneric(
  f: Fixture,
  denotation: V015SourceAnetDenotation,
  theory: LinkHandle,
  current: LinkHandle,
): readonly LinkHandle[] {
  const outputs = new Set<LinkHandle>();

  for (const member of denotation.members) {
    const admission = f.memory.poles(member);
    if (admission.start !== theory || admission.end === member) continue;

    const rule = admission.end;
    const rulePoles = f.memory.poles(rule);
    const roleAnchor = rulePoles.start;
    const body = f.memory.poles(rulePoles.end);
    const roles = [...denotation.members].filter(
      (candidate) => f.memory.poles(candidate).start === roleAnchor,
    );

    try {
      const bindings = unifyStructuralRuleTemplate(
        f.memory,
        body.start,
        current,
        roles,
      );
      const groundedImage = instantiateV013StructuralTemplate(
        f.memory,
        body.end,
        bindings,
      );
      for (const output of readExactSequence(f.memory, groundedImage).values) {
        outputs.add(output);
      }
    } catch (error) {
      if (error instanceof StructuralRuleError) continue;
      throw error;
    }
  }

  return Object.freeze([...outputs]);
}

const f = fixture();
const compiled = compileCandidate(f);

const roleY = compiled.binding("RoleY");
const theory = compiled.absolute("Theory");
const ruleF = compiled.binding("RuleF");
const ruleT = compiled.binding("RuleT");
const admissionF = f.memory.ensure(theory, ruleF);
const admissionT = f.memory.ensure(theory, ruleT);
setSame(
  compiled.denotation.members,
  [roleY, admissionF, admissionT],
  "compact AND semantic ANet contains one role + two admissions only",
);

const AND = compiled.binding("AND");
const F = compiled.binding("F");
const T = compiled.binding("T");

const rows = [
  [F, F, F, "FF"],
  [F, T, F, "FT"],
  [T, F, F, "TF"],
  [T, T, T, "TT"],
] as const;

for (const [left, right, expected, label] of rows) {
  const args = materializeExactSequence(f.memory, [left, right]);
  const current = f.memory.ensure(AND, args);
  const outputs = reactGeneric(f, compiled.denotation, theory, current);
  same(outputs.length, 1, label + " one output");
  same(outputs[0], expected, label + " AND result");
}

// Delete the T-leading rule admission: F-leading rows remain valid, T-leading
// rows become NO_MATCH. The mutation changes one semantic relation only.
const mutatedValue = JSON.parse(canonicalJson) as Record<string, unknown>;
delete mutatedValue["Theory->RuleT"];
const mutatedJson = JSON.stringify(mutatedValue, null, 2);
const mutatedFormal = canonicalFormal
  .split("\n")
  .filter((line) => !line.includes("Theory->RuleT"))
  .map((line) =>
    line.includes("Theory->RuleF,")
      ? line.replace("Theory->RuleF,", "Theory->RuleF")
      : line
  )
  .join("\n");
const fm = fixture();
const mutated = compileCandidate(fm, mutatedFormal, mutatedJson);
const mAND = mutated.binding("AND");
const mF = mutated.binding("F");
const mT = mutated.binding("T");
const mTheory = mutated.absolute("Theory");

for (const [left, right, expectedCount, expectedValue, label] of [
  [mF, mF, 1, mF, "mutated FF"],
  [mF, mT, 1, mF, "mutated FT"],
  [mT, mF, 0, null, "mutated TF"],
  [mT, mT, 0, null, "mutated TT"],
] as const) {
  const current = fm.memory.ensure(
    mAND,
    materializeExactSequence(fm.memory, [left, right]),
  );
  const outputs = reactGeneric(fm, mutated.denotation, mTheory, current);
  same(outputs.length, expectedCount, label + " output count");
  if (expectedValue !== null) same(outputs[0], expectedValue, label + " output");
}

// Foreign/unselected Theory carries no admission authority.
const foreignTheory = compiled.absolute("ForeignTheory");
const tt = f.memory.ensure(AND, materializeExactSequence(f.memory, [T, T]));
same(
  reactGeneric(f, compiled.denotation, foreignTheory, tt).length,
  0,
  "foreign Theory is inert",
);

// Rename only the helper alias RoleY. Semantic member/rule topology remains
// identical because the alias resolves to the same role Link V->Y.
const renamedJson = canonicalJson
  .replaceAll('"RoleY"', '"SecondRole"')
  .replaceAll('RoleY', 'SecondRole');
const renamedFormal = canonicalFormal.replaceAll("RoleY", "SecondRole");
const renamed = compileCandidate(f, renamedFormal, renamedJson);
setSame(
  renamed.denotation.members,
  [...compiled.denotation.members],
  "presentation rename preserves semantic AND ANet",
);

console.log([
  "MTS_V015_COMPACT_AND_A1=GREEN_RESEARCH",
  "MODEL=TWO_GENERIC_ROLE_BUNDLE_RULES",
  "ROLE_COUNT=1",
  "RULE_COUNT=2",
  "SEMANTIC_MEMBER_COUNT=3",
  "TRUTH_TABLE=4_OF_4",
  "EXACTSEQUENCE_INPUTS=TRUE",
  "DELETE_RULE_T_ADMISSION=ONLY_T_LEADING_ROWS_DISABLED",
  "FOREIGN_THEORY=INERT",
  "PRESENTATION_RENAME=SEMANTIC_INVARIANT",
  "AND_SPECIFIC_RUNTIME_DISPATCH=0",
  "CANONICAL_FILES_PERSISTED=FALSE",
  "AUTHOR_REVIEW_PENDING=TRUE",
].join(" "));
