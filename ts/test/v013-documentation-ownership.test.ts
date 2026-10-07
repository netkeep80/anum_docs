import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.13 historical documentation ownership: ${message}`);
}
function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: values differ`);
}

const repoRoot = resolve(process.cwd(), "..");
const contract = JSON.parse(
  readFileSync(join(repoRoot, "contracts/mts-contract-v0.13.json"), "utf8"),
) as any;
const policy = JSON.parse(
  readFileSync(join(repoRoot, "repo-policy.json"), "utf8"),
) as any;
const acceptance13 = JSON.parse(
  readFileSync(join(repoRoot, "cutover/typescript-c1-acceptance-v0.6.json"), "utf8"),
) as any;

same(contract.status, "accepted", "v0.13 remains accepted historical evidence");
same(contract.accepted, true, "v0.13 accepted flag");
same(contract.acceptanceReady, true, "v0.13 readiness remains proven");
same(contract.acceptedCurrent?.contract, "mts-contract/v0.13", "historical acceptance current contract");
same(contract.acceptedCurrent?.conformance, "mts-conformance/v0.13", "historical acceptance current conformance");

same(
  policy.packs["contract-conformance"].current.contract.path,
  "contracts/mts-contract-v0.15.json",
  "v0.15 is current accepted release after S22",
);
same(
  policy.packs["contract-conformance"].previous.contract.path,
  "contracts/mts-contract-v0.14.json",
  "v0.14 is previous accepted release after S22",
);
assert(
  policy.packs["contract-conformance"].current.contract.path !== "contracts/mts-contract-v0.13.json"
    && policy.packs["contract-conformance"].previous.contract.path !== "contracts/mts-contract-v0.13.json",
  "v0.13 remains historical rather than current/previous selector authority",
);
same(
  acceptance13.current.contract,
  "contracts/mts-contract-v0.13.json",
  "immutable v0.6 manifest remains bound to v0.13",
);

const laws = Object.keys(contract.requiredSemanticLaws ?? {}).sort(
  (a, b) => Number(a.slice(1)) - Number(b.slice(1)),
);
same(laws.join(","), Array.from({ length: 13 }, (_, i) => `L${i + 1}`).join(","), "v0.13 law identity");

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

const ownerMap = contract.normativeDocumentation?.owners ?? {};
same(Object.keys(ownerMap).sort().length, 13, "v0.13 owner map cardinality");
same(
  contract.normativeDocumentation?.ownerRule,
  "one accepted semantic law -> one canonical accepted normative owner anchor",
  "historical owner invariant",
);

for (const law of laws) {
  const declared = ownerMap[law];
  assert(declared !== undefined, `${law}: historical owner exists`);
  same(declared.path, expectedOwnerDocument[law], `${law}: historical owner path`);
  same(declared.anchor, `mts-law-${law}`, `${law}: historical owner anchor`);
}

console.log(
  "MTS v0.13 historical documentation ownership: immutable owner map L1-L13 retained; current Markdown is free to represent accepted v0.15: GREEN.",
);
