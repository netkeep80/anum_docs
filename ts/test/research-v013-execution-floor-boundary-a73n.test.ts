import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

function assert(c: unknown, m: string): asserts c {
  if (!c) throw new Error("v0.13 A73n execution floor boundary: " + m);
}
function same<T>(a: T, e: T, m: string): void {
  assert(Object.is(a, e), m + ": values differ");
}

function read(root: string, path: string): string {
  return readFileSync(join(root, path), "utf8");
}

function main(): void {
  const root = resolve(process.cwd(), "..");
  const contract = JSON.parse(read(root, "contracts/mts-contract-v0.13.json"));
  const conformance = JSON.parse(read(root, "contracts/mts-conformance-v0.13.json"));
  const grounded = read(root, "ts/src/v013-grounded-execution.ts");
  const structural = read(root, "ts/src/v013-structural-execution.ts");
  const schedule = read(
    root,
    "ts/test/research-v013-self-activation-schedule-invariance-a73k.test.ts",
  );
  const a73h = read(
    root,
    "ts/test/research-v013-grounded-relational-execution-a73h.test.ts",
  );
  const a73i = read(
    root,
    "ts/test/research-v013-self-admission-local-index-a73i.test.ts",
  );
  const a73j = read(
    root,
    "ts/test/research-v013-self-activating-theory-relations-a73j.test.ts",
  );

  const kernelFiles = contract.implementation.candidateKernelFiles as string[];
  assert(kernelFiles.includes("ts/src/v013-grounded-execution.ts"),
    "A73m grounded executor is declared candidate kernel");
  assert(kernelFiles.includes("ts/src/v013-structural-execution.ts"),
    "structural executor remains candidate during boundary witness");

  // The self-activating execution floor is source-independent of the older
  // structural Rule/template executor.
  for (const forbidden of [
    "v013-structural-execution",
    "structural-rule",
    "structural-unification",
    "StructuralRule",
    "RoleDictionary",
    "unifyStructural",
    "instantiateV013StructuralTemplate",
  ]) {
    assert(!grounded.includes(forbidden),
      "grounded execution floor excludes structural meta-layer dependency: " + forbidden);
  }

  assert(grounded.includes("memory.outgoing(theory)"),
    "grounded authority frontier is current Theory");
  assert(grounded.includes("readExactSequence("),
    "grounded relation output carrier is ExactSequence");
  assert(grounded.includes("memory.ensure(truth.start, output)"),
    "grounded semantic transition is generic context-preserving relation composition");

  // A73k is the current dynamic execution witness and consumes only the
  // production grounded executor, not the structural executor.
  assert(schedule.includes('from "../src/v013-grounded-execution.js"'),
    "A73k consumes grounded production execution");
  assert(!schedule.includes('from "../src/v013-structural-execution.js"'),
    "A73k dynamic witness has no structural executor dependency");
  assert(schedule.includes("SAME_EXTensional_FIXED_POINT".toUpperCase()) ||
         schedule.includes("SAME_EXTENSIONAL_FIXED_POINT") ||
         schedule.includes("FIXED_POINT"),
    "A73k retains fixed-point schedule evidence");

  // Historical structural execution remains valuable research evidence. A73h
  // explicitly attacked its matcher/template residual rather than falsifying
  // the structural module as a grounding mechanism.
  assert(a73h.includes("GROUNDED_RELATIONAL_EXECUTION=GREEN_SCOPED_RESEARCH"),
    "A73h grounded reduction evidence retained");
  assert(a73h.includes("HOST_RULE_MATCHER=0"),
    "A73h execution floor source-removes Rule matcher");
  assert(a73h.includes("HOST_TEMPLATE_INSTANTIATOR=0"),
    "A73h execution floor source-removes template instantiator");
  assert(structural.includes("unifyStructuralRuleTemplate("),
    "structural executor still contains the separated grounding matcher");
  assert(structural.includes("instantiateV013StructuralTemplate("),
    "structural executor still contains the separated grounding realizer");

  // A73i/A73j establish that grounded executable authority no longer requires
  // a host-authored antecedent-local registration index.
  assert(a73i.includes("SELF_ADMISSION_LOCAL_INDEX_FALSIFIER=GREEN_FALSIFIER"),
    "A73i local-index falsifier retained");
  assert(a73j.includes("ANTECEDENT_TO_ADMISSION_LOCAL_INDEX=REMOVED"),
    "A73j local activation residual removed");

  // No mandatory executable gate names the structural execution research
  // witnesses. Demoting the module from candidate execution floor therefore
  // need not delete its historical research tests.
  const mandatory = conformance.requiredExecutableGates as string[];
  same(
    mandatory.filter((path) =>
      /structural-execution|branch-skew-strict-matcher|execution-substrate-invariance/.test(path)
    ).length,
    0,
    "mandatory acceptance gates do not bind structural execution research layer",
  );

  // Crucial non-overclaim: relation grounding/bootstrap is still open.
  const projection = JSON.parse(
    read(root, "traceability/mts-v0.13-semantic-dependency-projection.json"),
  );
  same(
    projection.coverage.genericRuleGroundingSelfHostedProven,
    false,
    "generic relation grounding/self-generation remains open",
  );

  console.log([
    "MTS v0.13 A73n: EXECUTION_FLOOR_BOUNDARY=GREEN_SCOPED_RESEARCH",
    "GROUNDED_EXECUTOR=SELF_ACTIVATING_EXECUTION_FLOOR",
    "STRUCTURAL_EXECUTOR=SEPARABLE_GROUNDING_META_LAYER",
    "GROUNDED_TO_STRUCTURAL_RUNTIME_DEPENDENCY=0",
    "A73K_DYNAMIC_WITNESS_USES_GROUNDED_EXECUTOR_ONLY=TRUE",
    "MANDATORY_ACCEPTANCE_GATE_STRUCTURAL_EXECUTOR_BINDING_COUNT=0",
    "STRUCTURAL_RESEARCH_EVIDENCE=RETAINED",
    "GENERIC_RELATION_GROUNDING_SELF_HOSTED=FALSE",
    "INITIAL_EXECUTABLE_RELATION_NETWORK_BOOTSTRAP=OPEN",
    "CANDIDATE_SCOPE_DEMOTION=SUPPORTED_NOT_APPLIED",
    "A72U_A72V=RETAINED_DEFERRED",
    "FULL_SELF_HOSTED=NOT_YET_CLAIMED",
    "V013_NOT_ACCEPTED",
  ].join(" "));
}

main();
