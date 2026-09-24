import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

function assert(c: unknown, m: string): asserts c {
  if (!c) throw new Error("v0.13 A73p self-hosted program semantics: " + m);
}
function same<T>(a: T, e: T, m: string): void {
  assert(Object.is(a, e), m + ": values differ");
}
function read(root: string, path: string): string {
  return readFileSync(join(root, path), "utf8");
}
function slice(source: string, begin: string, end: string): string {
  const i = source.indexOf(begin);
  const j = source.indexOf(end, i + begin.length);
  assert(i >= 0 && j > i, "source slice " + begin);
  return source.slice(i, j);
}

function main(): void {
  const root = resolve(process.cwd(), "..");
  const contract = JSON.parse(read(root, "contracts/mts-contract-v0.13.json"));
  const projection = JSON.parse(
    read(root, "traceability/mts-v0.13-semantic-dependency-projection.json"),
  );
  const grounded = read(root, "ts/src/v013-grounded-execution.ts");
  const exactSequence = read(root, "ts/src/exact-sequence.ts");
  const a73k = read(
    root,
    "ts/test/research-v013-self-activation-schedule-invariance-a73k.test.ts",
  );
  const a73n = read(
    root,
    "ts/test/research-v013-execution-floor-boundary-a73n.test.ts",
  );

  const kernelFiles = contract.implementation.candidateKernelFiles as string[];
  assert(kernelFiles.includes("ts/src/v013-grounded-execution.ts"),
    "grounded executor belongs to candidate kernel");
  assert(!kernelFiles.includes("ts/src/v013-structural-execution.ts"),
    "A73o structural meta executor is outside candidate execution floor");

  const discover = slice(
    grounded,
    "export function discoverV013GroundedTheoryImages(",
    "\nexport interface V013GroundedScopeReaction",
  );
  const react = slice(
    grounded,
    "export function reactV013GroundedScope(",
    "\n}",
  );

  // Executable authority is entirely Link-carried:
  //
  //   current Scope -> Theory
  //   Theory -> relation
  //   relation = A -> exactSequence(B...)
  //   current truth = K -> A
  //
  // No function/operator identity is selected by host code.
  assert(discover.includes("memory.outgoing(theory)"),
    "current Theory is relation authority frontier");
  assert(discover.includes("relationPoles.start !== antecedent"),
    "relation triggering is exact antecedent Link identity");
  assert(discover.includes("readExactSequence(memory, relationPoles.end)"),
    "relation result fanout is Link-carried exact sequence");

  assert(react.includes("memory.ensure(truth.start, output)"),
    "one generic context-preserving relational transition");
  assert(react.includes("if (images.length === 0)"),
    "absence of relation preserves current truth");
  assert(react.includes("if (matchedRelations === 0)"),
    "quiescence is generic no-relation fixed point");

  for (const forbidden of [
    "StructuralRule",
    "RoleDictionary",
    "unifyStructural",
    "instantiateV013StructuralTemplate",
    "RuleKind",
    "opcode",
    "selectedRule",
    "selectedBranch",
    "NOT",
    "ALL",
    "CHOICE",
    "TRUE",
    "FALSE",
  ]) {
    assert(!grounded.includes(forbidden),
      "candidate execution floor has no program-specific semantic selector: " + forbidden);
  }

  // ExactSequence is treated as carrier mechanics, not program authority. Its
  // reader knows only root termination, self-closed Cell shape and poles.
  const sequenceReader = slice(
    exactSequence,
    "export function readExactSequence(",
    "\n}",
  );
  for (const forbidden of [
    "Theory",
    "StructuralRule",
    "Dictionary",
    "Grammar",
    "opcode",
    "selectedRule",
    "selectedBranch",
  ]) {
    assert(!sequenceReader.includes(forbidden),
      "ExactSequence carrier reader has no program authority: " + forbidden);
  }

  // A73k proves that live-Memory scheduling can change propagation timing but
  // not the tested extensional fixed point.
  assert(a73k.includes("GENERATOR_FIRST_MATCHES=2_0"),
    "generator-first temporal schedule retained");
  assert(a73k.includes("TARGET_FIRST_MATCHES=1_1_0"),
    "target-first temporal schedule retained");
  assert(a73k.includes("FINAL_EXTENTIONAL_FIXED_POINT=SAME"),
    "opposite schedules converge extensionally");

  // A73n preserves the important architecture split.
  assert(a73n.includes("GROUNDED_EXECUTOR=SELF_ACTIVATING_EXECUTION_FLOOR"),
    "grounded execution floor boundary retained");
  assert(a73n.includes("STRUCTURAL_EXECUTOR=SEPARABLE_GROUNDING_META_LAYER"),
    "structural grounding/meta layer remains separable");

  // Non-overclaim: generating/compiling arbitrary high-level Rule/template
  // descriptions into the grounded relation network remains a different layer.
  same(
    projection.coverage.genericRuleGroundingSelfHostedProven,
    false,
    "generic meta-grounding is not silently declared solved",
  );

  console.log([
    "MTS v0.13 A73p: SELF_HOSTED_PROGRAM_SEMANTICS=GREEN_SCOPED_RESEARCH",
    "PROGRAM_SEMANTIC_AUTHORITY=LINK_CARRIED_THEORY_RELATIONS",
    "EXECUTION_LAW=GENERALIZED_GROUNDED_RELATIONAL_REACTION",
    "FUNCTION_OR_OPERATOR_SPECIFIC_HOST_DISPATCH=0",
    "HOST_REGISTRATION_PASS=0",
    "ANTECEDENT_LOCAL_ACTIVATION_INDEX=0",
    "SELF_MODIFYING_EXECUTABLE_RELATION_SET=GREEN_A73J",
    "SCHEDULE_CHANGES_TIMING_NOT_TESTED_FIXED_POINT=GREEN_A73K",
    "CURRENT_ROOT=OPAQUE_AMEMORY_SUBSTRATE",
    "EXACT_SEQUENCE=GENERIC_CARRIER_SUBSTRATE",
    "AMEMORY_DYNAMIC_LAW=IRREDUCIBLE_SUBSTRATE_CANDIDATE_NOT_PROVEN_MINIMAL",
    "STRUCTURAL_RULE_GROUNDING=SEPARATE_META_LAYER",
    "GENERIC_META_GROUNDING_SELF_HOSTED=FALSE",
    "FULL_SELF_HOSTED_SYSTEM=NOT_CLAIMED",
    "V013_NOT_ACCEPTED",
  ].join(" "));
}

main();
