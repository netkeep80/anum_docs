import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.12 C8 normative convergence: ${message}`);
}

const repoRoot = resolve(process.cwd(), "..");
const read = (path: string): string => readFileSync(join(repoRoot, path), "utf8");
const contract = JSON.parse(read("contracts/mts-contract-v0.12.json")) as any;
const conformance = JSON.parse(read("contracts/mts-conformance-v0.12.json")) as any;
const traceabilityPath = join(repoRoot, "traceability/mts-v0.12.json");

const candidateLifecycle = contract.status === "candidate" && contract.accepted === false;
const acceptedLifecycle = contract.status === "accepted" && contract.accepted === true;
assert(candidateLifecycle || acceptedLifecycle, "v0.12 is the documented candidate or accepted release");
assert(contract.implementation?.candidateRuntimeSelectable === false, "no alternate candidate runtime is selectable");
assert(contract.candidateState?.documentationComplete === true, "canonical documentation is complete");
assert(contract.candidateState?.traceabilityComplete === true, "traceability projection is complete");

assert(
  conformance.status === contract.status && conformance.accepted === contract.accepted,
  "contract and conformance lifecycle stay aligned",
);
assert(conformance.evidenceState?.documentationC8 === "green-confirmed", "C8 is green-confirmed");

assert(existsSync(traceabilityPath), "v0.12 traceability manifest exists");
const traceability = JSON.parse(readFileSync(traceabilityPath, "utf8")) as any;
assert(traceability.schema === "mts-traceability/v0.2", "v0.12 uses traceability schema v0.2");
assert(
  Object.keys(traceability.invariants ?? {}).sort().join("|") ===
    Object.keys(contract.requiredSemanticLaws ?? {}).sort().join("|"),
  "traceability invariant IDs exactly match contract semantic laws",
);

const docs: readonly (readonly [string, string])[] = candidateLifecycle
  ? [
      ["docs/theory/Основания МТС.md", "## Кандидатная нормативная граница МТС v0.12"],
      ["docs/theory/Система аксиом МТС.md", "## Кандидатная нормативная граница МТС v0.12"],
      ["docs/specs/Формальная нотация МТС.md", "## Кандидат МТС v0.12: интерпретационные контексты и полномочия"],
      ["docs/specs/Ачисла и сериализация.md", "## Кандидат МТС v0.12: укоренённое ачисло и один корневой срез"],
    ]
  : [
      ["docs/theory/Основания МТС.md", "## Нормативная граница МТС v0.12"],
      ["docs/theory/Система аксиом МТС.md", "## Нормативная граница МТС v0.12"],
      ["docs/specs/Формальная нотация МТС.md", "## МТС v0.12: интерпретационные контексты и полномочия"],
      ["docs/specs/Ачисла и сериализация.md", "## МТС v0.12: укоренённое ачисло и один корневой срез"],
    ];

for (const [path, marker] of docs) {
  assert(read(path).includes(marker), `${path} contains the v0.12 normative marker`);
}

const formal = read("docs/specs/Формальная нотация МТС.md");
for (const statement of [
  "FORMAL [...] → I_STRING",
  "Q [...] → I_Q",
  "FORMAL (...) → I_FORMAL",
  "replayV012SelectedSourceEvidence ≠ семантическое полномочие",
]) {
  assert(formal.includes(statement), `formal notation contains: ${statement}`);
}

const anum = read("docs/specs/Ачисла и сериализация.md");
for (const statement of [
  "каждое локальное ачисло начинается с R",
  "Resolve = один корневой срез только для чтения",
  "MATERIALIZE_TARGET = один разрешённый корневой срез с записью",
  "UNINTERPRETABLE ≠ NOT_FOUND ≠ FOUND",
  "Byte_v012(p) = Anum(bits8(p))",
]) {
  assert(anum.includes(statement), `Anum specification contains: ${statement}`);
}

const contributing = read("docs/CONTRIBUTING.md");
assert(contributing.includes("C8 = завершён"), "contributing lifecycle reflects completed C8");

console.log("MTS v0.12 C8 normative documentation and traceability convergence: GREEN.");
