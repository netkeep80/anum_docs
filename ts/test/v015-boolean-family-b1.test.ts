// mts-version-evidence: candidate-v0.15-boolean-family-b1
// owner: #1980
//
// One generic execution harness for AND/NOT/OR/XOR.
// Operator identity and truth rows are data only; no operator-specific dispatch.

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
import { StructuralRuleError } from "../src/structural-rule.js";
import { unifyStructuralRuleTemplate } from "../src/structural-unification.js";
import { instantiateV013StructuralTemplate } from "../src/v013-structural-execution.js";
import { compileV015DirectFormalSourceAnet } from "../src/v015-direct-formal-source.js";
import { compileV015DirectJsonSourceAnet } from "../src/v015-direct-json-source.js";
import { materializeV015ContextualNamePath } from "../src/v015-link-definition.js";
import {
  denoteV015ResolvedSourceAnet,
  materializeV015SourceAnetProfile,
  type V015SourceAnetDenotation,
  type V015SourceAnetProfile,
} from "../src/v015-source-anet.js";
import { materializeV012StringAnum } from "../src/v012-string-anum.js";

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error("v0.15 Boolean family B1: " + message);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), message + ": " + String(actual) + " !== " + String(expected));
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

function repositoryRoot(): string {
  for (const candidate of [resolve(process.cwd(), ".."), process.cwd()]) {
    if (existsSync(resolve(candidate, "formal/v0.15/regression/compact-not.formal"))) {
      return candidate;
    }
  }
  throw new Error("v0.15 Boolean family: repository root");
}

interface Compiled {
  readonly denotation: V015SourceAnetDenotation;
  readonly absolute: (name: string) => LinkHandle;
  readonly binding: (name: string) => LinkHandle;
}

function compileCandidate(f: Fixture, formal: string, json: string): Compiled {
  const enc = new TextEncoder();
  const fromFormal = compileV015DirectFormalSourceAnet(
    f.memory, f.basis, f.grammarRoot, f.sourceAnetProfileRoot, enc.encode(formal),
  );
  const fromJson = compileV015DirectJsonSourceAnet(
    f.memory, f.basis, f.grammarRoot, f.sourceAnetProfileRoot, enc.encode(json),
  );
  same(fromFormal.sourceAset, fromJson.sourceAset, "FORMAL/JSON exact native source ANet parity");

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
  return Object.freeze({ denotation, absolute, binding });
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
        f.memory, body.start, current, roles,
      );
      const groundedImage = instantiateV013StructuralTemplate(
        f.memory, body.end, bindings,
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

type Bit = "F" | "T";
interface OperatorSpec {
  readonly id: string;
  readonly formalPath: string;
  readonly jsonPath: string;
  readonly formalSha256: string;
  readonly jsonSha256: string;
  readonly arity: 1 | 2;
  readonly ruleCount: number;
  readonly rows: readonly {
    readonly args: readonly Bit[];
    readonly expected: Bit;
    readonly label: string;
  }[];
}

const specs: readonly OperatorSpec[] = [
  {
    id: "AND",
    formalPath: "formal/v0.15/regression/compact-and.formal",
    jsonPath: "formal/v0.15/regression/compact-and.json",
    formalSha256: "4a5bc92e661ee1d4e0c2c5d51769805b5406651bb491345200d088c9ad23e5f3",
    jsonSha256: "cf5028f68500bba04ee10e06ac5512eec223078d8b428f4d5de1de6433ba5941",
    arity: 2,
    ruleCount: 4,
    rows: [
      { args: ["F","F"], expected: "F", label: "FF" },
      { args: ["F","T"], expected: "F", label: "FT" },
      { args: ["T","F"], expected: "F", label: "TF" },
      { args: ["T","T"], expected: "T", label: "TT" },
    ],
  },
  {
    id: "NOT",
    formalPath: "formal/v0.15/regression/compact-not.formal",
    jsonPath: "formal/v0.15/regression/compact-not.json",
    formalSha256: "42697be6cad8b522e1b4a7fbfd75fda5f7af5d313a995a42105c82f8ceec2c47",
    jsonSha256: "eed9bebaf4ecd34be160da3a9cdf006f7f9c1802b780da0f0fe44d2fb2487da2",
    arity: 1,
    ruleCount: 2,
    rows: [
      { args: ["F"], expected: "T", label: "F" },
      { args: ["T"], expected: "F", label: "T" },
    ],
  },
  {
    id: "OR",
    formalPath: "formal/v0.15/regression/compact-or.formal",
    jsonPath: "formal/v0.15/regression/compact-or.json",
    formalSha256: "04f794a27c26249c0eb75a5163add1a46ddb5537d6b4b783782e3044db9528ee",
    jsonSha256: "3fbcd16fb0e067fa5c84be5d86a39a964da45cf7fdcc03880d2e23c28f5b6c29",
    arity: 2,
    ruleCount: 4,
    rows: [
      { args: ["F","F"], expected: "F", label: "FF" },
      { args: ["F","T"], expected: "T", label: "FT" },
      { args: ["T","F"], expected: "T", label: "TF" },
      { args: ["T","T"], expected: "T", label: "TT" },
    ],
  },
  {
    id: "XOR",
    formalPath: "formal/v0.15/regression/compact-xor.formal",
    jsonPath: "formal/v0.15/regression/compact-xor.json",
    formalSha256: "4721b9f02400613ad05a8cc50ac0add3520c6aa72c836f95fdb4edf44bbaa038",
    jsonSha256: "1dc6cb2464f0bb1fc0d54388677ea9136d907caa174ad694388c054c57d24581",
    arity: 2,
    ruleCount: 4,
    rows: [
      { args: ["F","F"], expected: "F", label: "FF" },
      { args: ["F","T"], expected: "T", label: "FT" },
      { args: ["T","F"], expected: "T", label: "TF" },
      { args: ["T","T"], expected: "F", label: "TT" },
    ],
  },
];

const root = repositoryRoot();

for (const spec of specs) {
  const formal = readFileSync(resolve(root, spec.formalPath), "utf8");
  const json = readFileSync(resolve(root, spec.jsonPath), "utf8");
  same(
    createHash("sha256").update(formal, "utf8").digest("hex"),
    spec.formalSha256,
    spec.id + " exact FORMAL digest",
  );
  same(
    createHash("sha256").update(json, "utf8").digest("hex"),
    spec.jsonSha256,
    spec.id + " exact JSON digest",
  );

  const f = fixture();
  const compiled = compileCandidate(f, formal, json);
  const theory = compiled.absolute("Theory");
  const op = compiled.binding(spec.id);
  const F = compiled.binding("F");
  const T = compiled.binding("T");
  const byBit = (bit: Bit): LinkHandle => bit === "F" ? F : T;

  same(
    compiled.denotation.members.size,
    spec.ruleCount,
    spec.id + " semantic member count",
  );
  for (const member of compiled.denotation.members) {
    same(
      f.memory.poles(member).start,
      theory,
      spec.id + " semantic member is Theory admission",
    );
  }

  for (const row of spec.rows) {
    const args = materializeExactSequence(f.memory, row.args.map(byBit));
    const current = f.memory.ensure(op, args);
    const outputs = reactGeneric(f, compiled.denotation, theory, current);
    same(outputs.length, 1, spec.id + " " + row.label + " one output");
    same(outputs[0], byBit(row.expected), spec.id + " " + row.label + " result");
  }

  const X = compiled.absolute("NonBooleanOperand");
  const negativeInputs: readonly LinkHandle[][] = spec.arity === 1
    ? [[X]]
    : [[F, X], [X, F]];
  for (const values of negativeInputs) {
    const current = f.memory.ensure(op, materializeExactSequence(f.memory, values));
    same(
      reactGeneric(f, compiled.denotation, theory, current).length,
      0,
      spec.id + " non-Boolean operand NO_MATCH",
    );
  }

  const foreignTheory = compiled.absolute("ForeignTheory");
  const first = spec.rows[0];
  assert(first !== undefined, spec.id + " has at least one truth row");
  const firstCurrent = f.memory.ensure(
    op,
    materializeExactSequence(f.memory, first.args.map(byBit)),
  );
  same(
    reactGeneric(f, compiled.denotation, foreignTheory, firstCurrent).length,
    0,
    spec.id + " foreign Theory inert",
  );
}

console.log([
  "MTS_V015_BOOLEAN_FAMILY_B1=GREEN_RESEARCH",
  "OPERATORS=AND,NOT,OR,XOR",
  "SAME_FORMAL_JSON_COMPILER=TRUE",
  "SAME_SEMANTIC_THEORY_ADMISSION_DISCOVERY=TRUE",
  "SAME_GENERIC_REACTION_HARNESS=TRUE",
  "ZERO_ROLE_RULES_ONLY=TRUE",
  "STRICT_BOOLEAN_DOMAIN=TRUE",
  "NON_BOOLEAN=NO_MATCH",
  "PROGRAM_SPECIFIC_RUNTIME_DISPATCH=0",
  "AUTHOR_REVIEW_PENDING_NOT_OR_XOR=TRUE",
].join(" "));
