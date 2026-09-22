import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.13 FORMAL kernel audit: ${message}`);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: values differ`);
}

const repoRoot = resolve(process.cwd(), "..");
const conformance = JSON.parse(
  readFileSync(join(repoRoot, "contracts/mts-conformance-v0.13.json"), "utf8"),
);
const projection = JSON.parse(
  readFileSync(
    join(repoRoot, "traceability/mts-v0.13-semantic-dependency-projection.json"),
    "utf8",
  ),
);

const a6 = conformance.nonBlockingComparativeResearch.formalLogicDialectA6;
const audit = projection.formalKernelAudit;

same(a6.currentBaseline.v013.stages.B3, "NOT_DEMONSTRATED_FROM_FORMAL_SOURCE",
  "FORMAL source does not yet present MTS axioms");
same(a6.currentBaseline.v013.stages.B4, "NOT_DEMONSTRATED_FROM_FORMAL_SOURCE",
  "FORMAL source does not yet present reusable rules");
same(a6.currentBaseline.v013.stages.B10, "NOT_DEMONSTRATED_FROM_FORMAL_SOURCE",
  "complete axiom system is not yet encoded through FORMAL source");

same(projection.coverage.formalKernelAuditComplete, true,
  "FORMAL kernel audit is recorded");
same(projection.coverage.formalKernelSelfExtensionProven, true,
  "generic research-kernel self-extension is proven");
same(projection.metrics.formalKernelHostDefinedSemanticLawCount, 3,
  "three scoped FORMAL E2 law families remain host-defined");
same(projection.metrics.formalKernelSelfExtensionWitnessCount, 2,
  "two generic self-extension witnesses exist");

const families = new Map(
  projection.semanticSourceAuthorityAudit.authorityFamilies.map(
    (entry: { id: string; currentClassification: string }) =>
      [entry.id, entry.currentClassification] as const,
  ),
);
for (const id of audit.e2Relation.hostDefinedFormalLawFamilies) {
  same(families.get(id), "HOST_DEFINED", `${id} remains E2 host-defined`);
}

same(audit.candidateEvidence.a10b.hostAspectEnumRequiredForValidation, false,
  "A10b already removes aspect-enum authority from read-only validation");
same(audit.candidateEvidence.a10b.writeFixedPointInstantiationProven, false,
  "A10b does not overclaim write/fixed-point closure");

same(audit.currentGaps.definePreviouslyUnknownNamedFormFromFormalSource, false,
  "new named FORMAL form is not yet demonstrated");
same(audit.currentGaps.useNewFormWithoutHostSemanticBranch, true,
  "host-branch-free extension is demonstrated on the generic research path");
same(audit.currentGaps.twoMemorySelfExtensionWitness, true,
  "two-Memory generic self-extension witness is demonstrated");
same(audit.selfExtensionFalsifier.status, "EXECUTED_RED_FIXED_KERNEL",
  "self-extension falsifier records the executed RED boundary");
assert(
  typeof audit.selfExtensionFalsifier.currentResult === "string" &&
    audit.selfExtensionFalsifier.currentResult.startsWith("RED:"),
  "self-extension falsifier records the executable RED result",
);
same(audit.selfExtensionFalsifier.attemptCount, 4,
  "historical fixed-kernel F1 records four independent attempts");
same(audit.selfExtensionFalsifier.successfulWitnessCount, 0,
  "historical fixed-kernel F1 remains zero-success RED");
same(audit.selfExtensionFalsifier.independentMemoryCount, 2,
  "self-extension falsifier is reproduced in two independent Memories");
same(audit.selfExtensionFalsifier.productionChanged, false,
  "self-extension RED does not change production");

const f4 = audit.selfExtensionF4;
same(f4.status, "EXECUTED_GREEN_SCOPED_RESEARCH",
  "F4 generic research kernel is GREEN");
same(f4.observed.unknownFunctionForms, 2,
  "F4 executes two previously unknown function forms");
same(f4.observed.genericReceiverFormBranches, 0,
  "F4 receiver has no per-form branches");
same(f4.observed.hostMatchers, 0,
  "F4 receiver has no host matchers");
same(f4.observed.negativeControls, 3,
  "F4 forged authority controls fail closed");
same(f4.observed.productionChanged, false,
  "F4 leaves fixed production FORMAL evaluator unchanged");

same(
  audit.selfExtensionFalsifier.genericKernelRerun.status,
  "EXECUTED_GREEN_SCOPED_RESEARCH",
  "strong self-extension question is rerun GREEN on generic kernel",
);

assert(
  audit.ontologyFirewall.some((x: string) => x.includes("Link is the only foundational ontology entity")),
  "ontology firewall preserves Link-only foundation",
);
assert(
  audit.ontologyFirewall.some((x: string) => x.includes("sequence/carrier != Link denotation")),
  "carrier/sequence is not conflated with semantic Link",
);
assert(
  audit.ontologyFirewall.some((x: string) => x.includes("graph theory")),
  "graph theory remains external to the foundation",
);

console.log(
  "MTS v0.13 FORMAL kernel audit: fixed production F1 remains RED, generic Link-defined F4 self-extension is GREEN with two unknown functions and three forged controls, while B3/B4/B10 and self-generation remain open: GREEN.",
);
