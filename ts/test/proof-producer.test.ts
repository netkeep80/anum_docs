import * as core from "../src/public.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const createStructuralProofProducer = (
  core as unknown as {
    readonly createStructuralProofProducer?: unknown;
  }
).createStructuralProofProducer;

assert(
  typeof createStructuralProofProducer === "function",
  "package root must expose createStructuralProofProducer",
);

const memory = new core.Memory();
const producer = (createStructuralProofProducer as (memory: core.WriteMemory) => object)(memory);
const methods = producer as Readonly<Record<string, unknown>>;
for (const name of [
  "defineContext",
  "defineInterpreter",
  "defineRoleDictionary",
  "defineRule",
  "admitRule",
  "defineAct",
  "defineActField",
  "defineProofOccurrence",
  "defineDerivationRule",
  "admitDerivationRule",
  "definePremiseOccurrenceSequence",
  "defineAssumptionContext",
  "defineTheorem",
] as const) {
  assert(typeof methods[name] === "function", `producer must expose ${name}`);
}

for (const forbidden of ["accept", "approve", "prove", "replay"] as const) {
  assert(!(forbidden in methods), `producer must not expose privileged ${forbidden} authority`);
}
