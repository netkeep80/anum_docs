import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.12 kernel evidence projection: ${message}`);
}

const repoRoot = resolve(process.cwd(), "..");
const conformance = JSON.parse(
  readFileSync(join(repoRoot, "contracts/mts-conformance-v0.12.json"), "utf8"),
) as {
  readonly status?: string;
  readonly accepted?: boolean;
  readonly acceptanceReady?: boolean;
  readonly coverageState?: string;
  readonly requiredExecutableGates?: readonly string[];
};

const gates = [
  "ts/test/v012-ostensive-self-incidence-matching.test.ts",
  "ts/test/quaternary-anum-hierarchical-two-memory.test.ts",
  "ts/test/v012-string-q-byte-bridge.test.ts",
  "ts/test/v012-string-utf8-boundary.test.ts",
  "ts/test/v012-formal-source-result-witness.test.ts",
  "ts/test/v012-quaternary-root-basis-boundary.test.ts",
  "ts/test/anum-two-memory-conformance.test.ts",
  "ts/test/string-anum-two-memory-conformance.test.ts",
  "ts/test/v012-public-facade-c7.test.ts",
  "ts/test/v012-source-authority.test.ts",
] as const;

for (const gate of gates) {
  assert(
    conformance.requiredExecutableGates?.includes(gate) === true,
    `merged mandatory kernel evidence is not projected into requiredExecutableGates: ${gate}`,
  );
}

// C10 acceptance consumes this already-established kernel evidence without
// changing the exact mandatory gate set.
assert(conformance.status === "accepted", "v0.12 accepted conformance consumes the projected kernel evidence");
assert(conformance.accepted === true, "v0.12 accepted flag is explicit");
assert(conformance.requiredExecutableGates?.length === 16, "accepted v0.12 retains all sixteen mandatory gates");
