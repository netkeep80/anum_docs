import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.13 A11g-F1 unifier denial: ${message}`);
}
function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: values differ`);
}

const repoRoot = resolve(process.cwd(), "..");
const read = (path: string): string =>
  readFileSync(join(repoRoot, path), "utf8");

const projection = JSON.parse(
  read("traceability/mts-v0.13-semantic-dependency-projection.json"),
);
const f1 = projection.formalKernelAudit.aspectApplicationA11g.sourceRemovalFalsifier;

// Current unified application semantics still has one exact host binding source.
const a11h = read("ts/test/research-v013-unified-continuation-a11h.test.ts");
assert(
  a11h.includes('import { unifyStructuralTemplate } from "../src/structural-unification.js";'),
  "A11h currently depends on structural-unification semantic source",
);

// The obvious proof-calculus substitute is not source removal: it is another
// host matcher.
const morphism = read("ts/src/structural-role-morphism.ts");
assert(
  morphism.includes('import { StructuralRuleError, matchStructuralTemplate } from "./structural-rule.js";'),
  "role morphism verifier delegates to host structural matcher",
);
assert(
  morphism.includes("matchStructuralTemplate("),
  "role morphism mapping uses equivalent host matching semantics",
);

// Structural Rule replay itself contains the host matching implementation.
const structuralRule = read("ts/src/structural-rule.ts");
assert(
  structuralRule.includes("export function matchStructuralTemplate("),
  "structural Rule path contains host template matcher",
);
assert(
  structuralRule.includes("match(leftPoles.start, rightPoles.start)"),
  "host matcher recursively maps start poles",
);
assert(
  structuralRule.includes("match(leftPoles.end, rightPoles.end)"),
  "host matcher recursively maps end poles",
);

// Therefore neither known substitute satisfies the anti-cheat condition.
same(
  f1.status,
  "EXECUTED_RED_CURRENT_ARCHITECTURE",
  "A11G-F1 exact status",
);
same(
  f1.successfulNativeBindingWitnessCount,
  0,
  "no MTS-native binding witness is pre-claimed",
);
same(
  projection.coverage.aspectApplicationUnifierSourceRemovalProven,
  false,
  "unifier source removal remains open",
);
same(
  projection.metrics.aspectUnifierDeniedAlternativeHostMatcherCount,
  2,
  "two known host-matcher substitutes rejected",
);

console.log([
  "MTS v0.13 A11g-F1:",
  "UNIFIER_DENIAL=RED_CURRENT_ARCHITECTURE",
  "SUCCESSFUL_MTS_NATIVE_BINDING_WITNESSES=0",
  "STRUCTURAL_RULE_MATCHER=INVALID_SUBSTITUTE",
  "ROLE_MORPHISM_MATCHER=INVALID_SUBSTITUTE",
  "EXACT_MISSING_CAPABILITY=PORTABLE_MTS_NATIVE_TWO_ROLE_BINDING_LAW",
  "SEMANTIC_CLOSURE=OPEN",
  "PRODUCTION_UNCHANGED",
].join(" "));
