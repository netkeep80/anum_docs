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
same(projection.coverage.formalKernelSelfExtensionProven, false,
  "self-extension is not falsely claimed");
same(projection.metrics.formalKernelHostDefinedSemanticLawCount, 3,
  "three scoped FORMAL E2 law families remain host-defined");
same(projection.metrics.formalKernelSelfExtensionWitnessCount, 0,
  "no self-extension witness exists yet");

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
same(audit.currentGaps.useNewFormWithoutHostSemanticBranch, false,
  "host-branch-free extension is not yet demonstrated");
same(audit.selfExtensionFalsifier.status, "EXECUTED_RED_FIXED_KERNEL",
  "self-extension falsifier records the executed RED boundary");
assert(
  typeof audit.selfExtensionFalsifier.currentResult === "string" &&
    audit.selfExtensionFalsifier.currentResult.startsWith("RED:"),
  "self-extension falsifier records the executable RED result",
);
same(audit.selfExtensionFalsifier.attemptCount, 4,
  "self-extension falsifier records four independent attempts");
same(audit.selfExtensionFalsifier.successfulWitnessCount, 0,
  "self-extension falsifier has no successful witness");
same(audit.selfExtensionFalsifier.independentMemoryCount, 2,
  "self-extension falsifier is reproduced in two independent Memories");
same(audit.selfExtensionFalsifier.productionChanged, false,
  "self-extension RED does not change production");

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
  "MTS v0.13 FORMAL kernel audit: A10b self-template validation exists, B3/B4/B10 remain open, and F-KERNEL-SELF-EXTENSION is now EXECUTED_RED_FIXED_KERNEL with zero successful witnesses: GREEN.",
);
