import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.13 FORMAL F4a law audit: ${message}`);
}
function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: values differ`);
}

const root=resolve(process.cwd(),"..");
const read=(path:string):string=>readFileSync(join(root,path),"utf8");
const projection=JSON.parse(
  read("traceability/mts-v0.13-semantic-dependency-projection.json"),
);
const audit=projection.formalKernelAudit.fixedEvaluatorLawReassessmentAfterF4;

same(audit.status,"EXECUTED_GREEN_CLASSIFICATION_AUDIT","F4a audit status");
same(audit.observed.productionHostDefinedFamilies,3,"fixed production families unchanged");
same(
  audit.observed.genericReceiverDependenciesOnFixedEvaluatorFamilies,
  0,
  "generic receiver fixed-evaluator dependencies",
);
same(audit.observed.genericReceiverReplacedFamilies,2,"two receiver laws replaced");
same(
  audit.observed.bypassedNotProducerReplacedFamilies,
  1,
  "one producer law remains only bypassed",
);

type FamilyAudit = {
  readonly id: string;
  readonly genericPathClassification: string;
};
const byId = new Map<string, FamilyAudit>(
  (audit.families as readonly FamilyAudit[]).map((x) => [x.id, x]),
);
same(
  byId.get("formal-operator-grounding-law")?.genericPathClassification,
  "REPLACED_FOR_GENERIC_RECEIVER",
  "operator grounding generic status",
);
same(
  byId.get("formal-prefix-composition-law")?.genericPathClassification,
  "REPLACED_FOR_GENERIC_RECEIVER",
  "prefix composition generic status",
);
same(
  byId.get("formal-plan-materialization-law")?.genericPathClassification,
  "BYPASSED_NOT_REPLACED_FOR_PRODUCER",
  "plan materialization remains producer gap",
);

const production=read("ts/src/v013-formal-aspect-evaluator.ts");
for(const symbol of ["function operatorAspect(","function parsePlan(","function materializePlan("]){
  assert(production.includes(symbol), `${symbol} still exists in fixed production evaluator`);
}

const f4=read("ts/test/research-v013-formal-self-extension-f4.test.ts");
assert(
  !f4.includes('from "../src/v013-formal-aspect-evaluator.js"'),
  "F4 does not import fixed FORMAL evaluator",
);
assert(
  !f4.includes('from "../src/structural-unification.js"'),
  "F4 does not import structural unification",
);

same(
  projection.coverage.formalKernelSelfExtensionProven,
  true,
  "generic self-extension remains GREEN",
);
same(
  projection.formalKernelAudit.currentGaps.definePreviouslyUnknownNamedFormFromFormalSource,
  false,
  "source-level self-generation is still not demonstrated",
);

const fixedFamilies=new Map(
  projection.semanticSourceAuthorityAudit.authorityFamilies.map(
    (x:{id:string;currentClassification:string})=>[x.id,x.currentClassification],
  ),
);
for(const id of [
  "formal-operator-grounding-law",
  "formal-prefix-composition-law",
  "formal-plan-materialization-law",
]){
  same(fixedFamilies.get(id),"HOST_DEFINED",`${id} production classification preserved`);
}

console.log([
  "MTS v0.13 FORMAL F4a:",
  "FIXED_EVALUATOR_HOST_DEFINED=3",
  "GENERIC_RECEIVER_FIXED_DEPENDENCIES=0",
  "GENERIC_REPLACED=OPERATOR_GROUNDING_PREFIX_COMPOSITION",
  "PRODUCER_GAP=PLAN_MATERIALIZATION",
  "SELF_EXTENSIBLE=GREEN",
  "SELF_GENERATED=OPEN",
  "PRODUCTION_UNCHANGED",
].join(" "));
