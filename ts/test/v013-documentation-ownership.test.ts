import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.13 documentation ownership: ${message}`);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: values differ`);
}

const repoRoot = resolve(process.cwd(), "..");
const contractPath = join(repoRoot, "contracts/mts-contract-v0.13.json");
const contract = JSON.parse(readFileSync(contractPath, "utf8")) as {
  status?: unknown;
  accepted?: unknown;
  acceptanceReady?: unknown;
  acceptedCurrent?: { contract?: unknown; conformance?: unknown };
  requiredSemanticLaws?: Record<string, unknown>;
  normativeDocumentation?: {
    ownerRule?: unknown;
    owners?: Record<string, { path?: unknown; anchor?: unknown }>;
  };
};

same(contract.status, "candidate", "documentation evidence belongs to candidate");
same(contract.accepted, false, "documentation convergence does not accept v0.13");
same(contract.acceptanceReady, false, "documentation convergence does not make v0.13 ready");
same(contract.acceptedCurrent?.contract, "mts-contract/v0.12", "accepted contract remains v0.12");
same(contract.acceptedCurrent?.conformance, "mts-conformance/v0.12", "accepted conformance remains v0.12");

function compareLawIds(left: string, right: string): number {
  return Number(left.slice(1)) - Number(right.slice(1));
}

const laws = Object.keys(contract.requiredSemanticLaws ?? {}).sort(compareLawIds);
same(laws.join(","), Array.from({ length: 13 }, (_, index) => `L${index + 1}`).join(","), "candidate law identity");

const allowedDocuments = Object.freeze([
  "docs/specs/Формальная нотация МТС.md",
  "docs/specs/Ачисла и сериализация.md",
  "docs/specs/Апамять и управление сетью связей.md",
]);

const expectedOwnerDocument = Object.freeze<Record<string, string>>({
  L1: "docs/specs/Апамять и управление сетью связей.md",
  L2: "docs/specs/Формальная нотация МТС.md",
  L3: "docs/specs/Формальная нотация МТС.md",
  L4: "docs/specs/Ачисла и сериализация.md",
  L5: "docs/specs/Ачисла и сериализация.md",
  L6: "docs/specs/Ачисла и сериализация.md",
  L7: "docs/specs/Ачисла и сериализация.md",
  L8: "docs/specs/Апамять и управление сетью связей.md",
  L9: "docs/specs/Апамять и управление сетью связей.md",
  L10: "docs/specs/Ачисла и сериализация.md",
  L11: "docs/specs/Ачисла и сериализация.md",
  L12: "docs/specs/Формальная нотация МТС.md",
  L13: "docs/specs/Ачисла и сериализация.md",
});

const ownerPattern =
  /<a id="mts-law-([A-Za-z][A-Za-z0-9]*)"><\/a>\s*<!--\s*кандидатный нормативный владелец\s*-->/g;
const owners = new Map<string, string[]>();

for (const path of allowedDocuments) {
  const source = readFileSync(join(repoRoot, path), "utf8");
  assert(source.includes("Кандидат v0.13"), `${path}: explicit candidate boundary`);

  for (const match of source.matchAll(ownerPattern)) {
    const law = match[1]!;
    if (!laws.includes(law)) continue;
    const locations = owners.get(law) ?? [];
    locations.push(path);
    owners.set(law, locations);
  }
}

for (const law of laws) {
  const locations = owners.get(law) ?? [];
  same(locations.length, 1, `${law}: exactly one normative owner`);
  same(locations[0], expectedOwnerDocument[law], `${law}: canonical owner document`);
}

const ownerMap = contract.normativeDocumentation?.owners ?? {};
same(
  Object.keys(ownerMap).sort(compareLawIds).join(","),
  laws.join(","),
  "contract owner map covers exactly L1-L13",
);
same(
  contract.normativeDocumentation?.ownerRule,
  "one candidate semantic law -> one canonical candidate normative owner anchor",
  "contract declares the ownership invariant",
);

for (const law of laws) {
  const declared = ownerMap[law];
  assert(declared !== undefined, `${law}: declared owner exists`);
  same(declared.path, expectedOwnerDocument[law], `${law}: contract path matches document owner`);
  same(declared.anchor, `mts-law-${law}`, `${law}: contract anchor identity`);
}

console.log(
  "MTS v0.13 R7d documentation ownership: L1-L13 each have exactly one canonical candidate normative owner; accepted current remains v0.12: GREEN.",
);
