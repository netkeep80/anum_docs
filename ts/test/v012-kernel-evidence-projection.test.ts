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

const gate = "ts/test/v012-ostensive-self-incidence-matching.test.ts";
assert(
  conformance.requiredExecutableGates?.includes(gate) === true,
  `merged mandatory kernel evidence is not projected into requiredExecutableGates: ${gate}`,
);

// Consuming a real kernel gate does not itself promote the candidate lifecycle.
assert(conformance.status === "candidate", "v0.12 must remain candidate");
assert(conformance.accepted === false, "v0.12 must remain not accepted");
assert(conformance.acceptanceReady === false, "v0.12 must remain not acceptance-ready");
assert(conformance.coverageState === "incomplete", "v0.12 must remain coverage-incomplete");
