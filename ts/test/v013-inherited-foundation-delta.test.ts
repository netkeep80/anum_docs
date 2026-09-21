import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { Memory, ensureRootBasis, type LinkHandle, type RootBasis } from "../src/memory.js";
import { decomposeV013SemanticLink } from "../src/v013-hierarchical-carrier.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.13 inherited foundation delta: ${message}`);
}
function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: values differ`);
}
function sameJson(actual: unknown, expected: unknown, message: string): void {
  same(JSON.stringify(actual), JSON.stringify(expected), message);
}

const repoRoot = resolve(process.cwd(), "..");
const theory = readFileSync(join(repoRoot, "docs/theory/Система аксиом МТС.md"), "utf8");
const contract12 = JSON.parse(readFileSync(join(repoRoot, "contracts/mts-contract-v0.12.json"), "utf8"));
const contract13 = JSON.parse(readFileSync(join(repoRoot, "contracts/mts-contract-v0.13.json"), "utf8"));
const conformance13 = JSON.parse(readFileSync(join(repoRoot, "contracts/mts-conformance-v0.13.json"), "utf8"));

const expectedIds = [
  ...Array.from({ length: 21 }, (_, index) => `A${index}`),
  "F2/F3", "F4", "F5", "F6",
];
const theoryIds = [...theory.matchAll(/^## (?:А|A)(\d+)\./gm)].map((match) => `A${match[1]}`);
for (const id of ["F2/F3", "F4", "F5", "F6"]) {
  assert(theory.includes(`## ${id}.`), `normative theory contains ${id}`);
  theoryIds.push(id);
}
same([...new Set(theoryIds)].sort().join("\n"), [...expectedIds].sort().join("\n"), "normative scope");

const audit = contract13.inheritedFoundationDeltaAudit;
assert(audit, "candidate declares inherited foundation delta audit");
sameJson(audit.baseline.scope, expectedIds, "exact inherited scope");
same(Object.keys(audit.entries).sort().join("\n"), [...expectedIds].sort().join("\n"), "all inherited clauses mapped");

const replacements = Object.entries(audit.entries).filter(([, entry]) => (entry as any).classification === "REPLACED_MINIMAL_FOUNDATION_DELTA");
same(replacements.length, 1, "exactly one semantic replacement");
same(replacements[0]?.[0], "A5", "A5 is the only replacement");
for (const id of ["A1", "A18", "F2/F3"]) {
  same(audit.entries[id].classification, "PRESERVED_CLARIFIED", `${id} is clarification only`);
}
for (const id of expectedIds.filter((value) => !["A1", "A5", "A18", "F2/F3"].includes(value))) {
  same(audit.entries[id].classification, "INHERITED_UNCHANGED", `${id} remains inherited`);
}

same(audit.minimalFoundationDelta.semanticReplacementCount, 1, "minimal replacement count");
same(audit.minimalFoundationDelta.addedIndependentOntologyEntities, 0, "no ontology entity added");
same(audit.minimalFoundationDelta.oldQFunctionalityRemoved, false, "legacy Q functionality retained");
same(audit.minimalFoundationDelta.additiveOnlyExtensionSufficient, false, "second additive foundation alphabet is insufficient");

assert(theory.includes("[ ] 1 0` — ровно четыре абита"), "accepted A5 declares old four-abit alphabet");
assert(theory.includes("`∞` не является пятым абитом"), "accepted A5 excludes infinity as fifth abit");
sameJson(contract12.foundation.qAlphabet, ["[", "]", "1", "0"], "accepted v0.12 Q alphabet");
same(contract12.foundation.qAlphabetCount, 4, "accepted v0.12 Q cardinality");

const a5 = audit.entries.A5;
sameJson(a5.candidateReplacement.structuralAspectSigns, ["R", "O", "C", "L"], "candidate aspect signs");
sameJson(a5.candidateReplacement.structuralAspects, ["ROOT", "START", "END", "PAIR"], "candidate aspect classes");
sameJson(a5.candidateReplacement.physicalSpellings, ["8", "9", "6", "1"], "candidate physical spellings");
sameJson(a5.candidateReplacement.legacyQAlphabet, ["[", "]", "1", "0"], "legacy Q retained");

function classes(memory: Memory, basis: RootBasis, links: readonly LinkHandle[]): readonly string[] {
  return links.map((link) => decomposeV013SemanticLink(memory, basis, link).selfIncidence);
}
{
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  const oldClasses = classes(memory, basis, [basis.O, basis.C, basis.L, basis.U]);
  sameJson(oldClasses, ["10", "01", "00", "00"], "old O/C/L/U class projection");
  same(new Set(oldClasses).size, 3, "old signs cover only three classes");
  const newClasses = classes(memory, basis, [basis.R, basis.O, basis.C, basis.L]);
  sameJson(newClasses, ["11", "10", "01", "00"], "new R/O/C/L class projection");
  same(new Set(newClasses).size, 4, "new signs cover all four classes");
}

same(contract13.cycleSemanticsBoundary.inheritedFoundation, "A18", "cycle boundary inherits A18");
same(contract13.cycleSemanticsBoundary.rootedDistinguishableCyclesOntologicallyRejected, false, "rooted cycles remain ontologically open");
same(contract13.cycleSemanticsBoundary.finiteGroundingDoesNotMeanAcyclicOntology, true, "grounding is not acyclicity");
same(contract13.cycleSemanticsBoundary.currentCanonicalTreeCarrierSupportsGraphCycles, false, "tree carrier graph-cycle limitation explicit");

same(contract13.candidateState.functionalParityAuditComplete, true, "functional parity complete");
same(contract13.candidateState.foundationSuperiorityAuditComplete, true, "foundation superiority complete");
same(conformance13.inheritedFoundationParity.status, "green-complete", "inherited parity status");
same(conformance13.inheritedFoundationParity.regressionCount, 0, "inherited regression count");
same(conformance13.foundationSuperiorityAudit.status, "green-complete-a5c", "superiority status");
same(contract13.accepted, false, "candidate remains unaccepted");
same(contract13.acceptanceReady, true, "candidate is acceptance-ready after independent audit");
same(contract13.candidateState.explicitAuthorAcceptanceRecorded, false, "author acceptance remains absent");

console.log("MTS v0.13 inherited foundation A5c: A0-A20/F2-F6 mapped; only A5 alphabet role replaced; A1/A18/F2-F3 clarified; old Q retained; zero regressions; candidate remains unaccepted: GREEN.");
