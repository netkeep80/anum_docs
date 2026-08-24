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
