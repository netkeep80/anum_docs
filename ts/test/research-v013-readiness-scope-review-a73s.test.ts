import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

function assert(c: unknown, m: string): asserts c {
  if (!c) throw new Error("v0.13 A73s readiness scope review: " + m);
}
function same<T>(a: T, e: T, m: string): void {
  assert(Object.is(a, e), m + ": expected=" + String(e) + " actual=" + String(a));
}
function setSame(actual: readonly string[], expected: readonly string[], m: string): void {
  const a = [...actual].sort();
  const e = [...expected].sort();
  assert(
    a.length === e.length && a.every((x, i) => x === e[i]),
    m + ": expected=[" + e.join(",") + "] actual=[" + a.join(",") + "]",
  );
}

const root = resolve(process.cwd(), "..");
const readJson = (path: string): any =>
  JSON.parse(readFileSync(join(root, path), "utf8"));

function main(): void {
  const contract = readJson("contracts/mts-contract-v0.13.json");
  const conformance = readJson("contracts/mts-conformance-v0.13.json");
  const projection = readJson("traceability/mts-v0.13-semantic-dependency-projection.json");

  // Declared v0.13 acceptance scope remains internally complete apart from the
  // post-readiness stronger A9/self-proof reopening and author decision.
  for (let i = 1; i <= 10; i += 1) {
    same(contract.acceptanceCriteria["AC" + i], "green", "AC" + i + " remains GREEN");
  }
  same(contract.candidateState.researchEvidenceComplete, true, "research evidence complete");
  same(contract.candidateState.acceptanceCriteriaComplete, true, "acceptance criteria complete");
  same(contract.candidateState.contractBoundaryEstablished, true, "contract boundary established");
  same(contract.candidateState.conformanceObligationsDeclared, true, "conformance declared");
  same(contract.candidateState.traceabilityComplete, true, "traceability complete");
  same(contract.candidateState.documentationComplete, true, "documentation complete");
  same(contract.candidateState.functionalParityAuditComplete, true, "functional parity complete");
  same(contract.candidateState.rootFormalDialectComplete, true, "root FORMAL dialect complete");
  same(contract.candidateState.publicFacadeComplete, true, "public facade complete");
  same(contract.implementation.implementationComplete, true, "declared candidate implementation complete");
  same(contract.implementation.candidateKernelBehaviorImplemented, true, "candidate behavior implemented");
  same(contract.implementation.candidateRuntimeSelectable, false, "candidate remains non-selectable");
  same(contract.accepted, false, "candidate remains unaccepted");

  same(conformance.coverageState, "complete", "declared conformance coverage complete");
  same(conformance.inheritedFoundationParity.status, "green-complete", "inherited foundation parity");
  same(conformance.inheritedFoundationParity.regressionCount, 0, "inherited regressions");
  same(conformance.inheritedFoundationParity.unresolvedCount, 0, "inherited unresolved count");
  same(conformance.readinessAudit.status, "green-confirmed", "historical independent readiness audit remains GREEN");
  same(conformance.readinessAudit.requiredExecutableGateCount, 39, "readiness gate count");
  same(conformance.requiredExecutableGates.length, 39, "current required gate count");
  same(conformance.plannedExecutableGates.length, 0, "no planned executable acceptance gates");

  // Current candidate execution floor after A73o/A73p.
  assert(
    contract.implementation.candidateKernelFiles.includes("ts/src/v013-grounded-execution.ts"),
    "self-activating grounded executor is candidate-bound",
  );
  assert(
    !contract.implementation.candidateKernelFiles.includes("ts/src/v013-structural-execution.ts"),
    "structural Rule/template executor is no longer candidate execution floor",
  );

  same(projection.coverage.candidateKernelDirectDependencyCoverageComplete, true,
    "candidate direct dependency coverage complete");
  same(projection.metrics.directUndocumentedDependencyCount, 0,
    "candidate direct undocumented dependency count");
  same(projection.metrics.objectSpecificHostSemanticShortcutCount, 0,
    "candidate object-specific host shortcut count");

  for (const key of [
    "packageDirectSemanticWriteAuditComplete",
    "packageInterpretationEntrypointAuditComplete",
    "packageStaticSemanticDecisionAuditComplete",
    "packageTypedMemoryReadAuditComplete",
    "packageTypedMemoryWriteCrossCheckComplete",
  ]) {
    same(projection.coverage[key], true, key);
  }

  same(projection.coverage.selfHostedProgramSemanticsA73pComplete, true,
    "A73p scoped self-hosted program semantics complete");
  same(projection.coverage.selfHostedProgramSemanticAuthorityLinkCarried, true,
    "program semantic authority is Link-carried");

  // The still-open A9 quantities are explicitly stronger/global quantities.
  // They are not a concrete REGRESSION or an undocumented candidate-kernel
  // dependency discovered by the current audit.
  same(projection.coverage.globalTrustBoundaryComplete, false,
    "full package global trust closure remains open");
  same(projection.metrics.globalUndocumentedSemanticPathCount, null,
    "global undocumented-path count is unmeasured, not a positive defect count");
  same(projection.coverage.semanticSourceReconstructionProven, false,
    "global semantic-source reconstruction remains open");
  same(projection.coverage.genericRuleGroundingSelfHostedProven, false,
    "generic meta-grounding remains open");

  // A9's eight UNKNOWN bootstrap capabilities are the physical Memory/carrier
  // boundary itself. UNKNOWN here means irreducibility has not been classified;
  // it does not establish eight extra ontology primitives.
  const unknownBootstrap = projection.capabilities
    .filter((x: any) => x.layer === "semantic-bootstrap" && x.primitiveStatus === "UNKNOWN")
    .map((x: any) => x.id);
  setSame(unknownBootstrap, [
    "bootstrap.link-identity",
    "bootstrap.root-anchor",
    "bootstrap.pole-read",
    "bootstrap.pair-lookup",
    "bootstrap.ensure-pair",
    "bootstrap.ensure-start-selfclosed",
    "bootstrap.ensure-end-selfclosed",
    "bootstrap.outgoing-query",
  ], "exact UNKNOWN bootstrap boundary");
  same(projection.metrics.unknownPrimitiveStatusCount, 8, "unknown bootstrap count");
  same(projection.metrics.confirmedIndependentPrimitiveCount, 0,
    "no UNKNOWN bootstrap operation has been promoted to independent foundation primitive");

  // The original foundation claim itself remains green on every local/formal
  // criterion except the two criteria expanded by #1346 to whole-runtime
  // minimality/trust closure.
  const superiority = conformance.foundationSuperiorityAudit;
  same(superiority.criteria.sufficiency.status, "green-for-foundation-aspect-classification",
    "foundation aspect sufficiency remains green");
  same(superiority.criteria.derivability.status, "green",
    "foundation aspect derivability remains green");
  same(superiority.criteria.closure.status, "green",
    "foundation closure remains green");
  same(superiority.criteria.unambiguity.status, "green",
    "foundation unambiguity remains green");
  same(superiority.comparativeFinding.status, "green",
    "comparative foundation finding remains green");
  same(superiority.minimalDelta.status, "green",
    "minimal semantic delta remains green");
  same(superiority.criteria.necessity.status, "reopened-pending-minimality",
    "necessity was reopened only under stronger whole-bootstrap minimality scope");
  same(superiority.criteria.hostAuthorityBoundary.status, "reopened-pending-global-trust-closure",
    "host authority was reopened only under package-wide trust scope");

  setSame(conformance.acceptanceBlockers, [
    "foundation necessity/minimality remains open under A9 elimination and self-proof criteria",
    "global host semantic trust boundary remains open until package-wide decision/runtime path audit closes",
    "explicit author acceptance of the exact candidate artifacts has not yet been recorded",
  ], "current three blockers are explicit");

  // Research conclusion only. This test deliberately does not mutate readiness:
  //
  // - first two blockers are candidates for RECLASSIFICATION from acceptance
  //   blockers to stronger full-system/fundamentality research obligations;
  // - explicit author acceptance remains a true lifecycle blocker;
  // - independent readiness must be rerun on the exact current candidate after
  //   any such governance reclassification.
  same(contract.acceptanceReady, false, "A73s does not change readiness");
  same(contract.candidateState.explicitAuthorAcceptanceRecorded, false,
    "A73s does not invent author acceptance");

  console.log([
    "MTS v0.13 A73s: READINESS_SCOPE_REVIEW=GREEN_SCOPED_RESEARCH",
    "AC1_AC10=GREEN",
    "DECLARED_CANDIDATE_IMPLEMENTATION=COMPLETE",
    "INHERITED_PARITY_REGRESSIONS=0",
    "PLANNED_EXECUTABLE_GATES=0",
    "HISTORICAL_INDEPENDENT_READINESS=GREEN_CONFIRMED",
    "CANDIDATE_DIRECT_UNDOCUMENTED_DEPENDENCIES=0",
    "CANDIDATE_OBJECT_SPECIFIC_HOST_SHORTCUTS=0",
    "SELF_HOSTED_PROGRAM_SEMANTICS=GREEN_SCOPED_A73P",
    "GLOBAL_TRUST_CLOSURE=OPEN_STRONGER_SCOPE",
    "GENERIC_META_GROUNDING=OPEN_STRONGER_SCOPE",
    "UNKNOWN_BOOTSTRAP_OPERATIONS=8_AMEMORY_SUBSTRATE_BOUNDARY",
    "CONFIRMED_EXTRA_INDEPENDENT_PRIMITIVES=0",
    "CONCRETE_ACCEPTANCE_REGRESSION_FOUND=0",
    "TECHNICAL_BLOCKERS_RECLASSIFICATION=CANDIDATE_FOR_GOVERNANCE_REVIEW",
    "AUTHOR_ACCEPTANCE=STILL_REQUIRED_SEPARATELY",
    "NEXT=BOUNDED_READINESS_GOVERNANCE_RECLASSIFICATION_THEN_EXACT_CANDIDATE_RERUN",
    "A72U_A72V=RETAINED_DEFERRED",
    "V013_NOT_ACCEPTED",
  ].join(" "));
}

main();
