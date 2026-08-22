import { materializeExactSequence } from "../src/exact-sequence.js";
import { Memory, ensureRootBasis, type LinkHandle } from "../src/memory.js";
import {
  exportTopology,
  restoreTopology,
  type StorageTopologyImage,
} from "../src/persistence-topology.js";
import { defineContext } from "../src/state.js";
import { defineActField, defineActHeader } from "../src/structural-readers.js";
import {
  admitStructuralRule,
  defineStructuralInterpreter,
  defineStructuralRoleDictionary,
  defineStructuralRule,
  type StructuralInterpreter,
} from "../src/structural-rule.js";
import {
  StructuralDerivationReplayError,
  admitStructuralDerivationRule,
  defineStructuralDerivationRule,
  defineStructuralProofOccurrence,
  replayStructuralDerivation,
  type StructuralDerivationEvidence,
  type StructuralJudgmentEvidence,
} from "../src/derivation.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}

function expectDerivationError(
  code: StructuralDerivationReplayError["code"],
  effect: () => unknown,
): void {
  try {
    effect();
  } catch (error) {
    assert(error instanceof StructuralDerivationReplayError, `${code}: wrong error type`);
    same(error.code, code, `${code}: wrong error code`);
    return;
  }
  throw new Error(`${code}: expected StructuralDerivationReplayError`);
}

function semanticSignatures(source: StorageTopologyImage): readonly string[] {
  const signatures = new Map<number, string>([[source.root, "R"]]);
  const remaining = new Set<number>();
  for (let local = 0; local < source.links.length; local += 1) {
    if (local !== source.root) remaining.add(local);
  }

  while (remaining.size > 0) {
    let progressed = false;
    for (const local of [...remaining]) {
      const pair = source.links[local];
      assert(pair !== undefined, "signature pair exists");
      const [start, end] = pair;
      let signature: string | undefined;
      if (start === local) {
        const knownEnd = signatures.get(end);
        if (knownEnd !== undefined) signature = `S(${knownEnd})`;
      } else if (end === local) {
        const knownStart = signatures.get(start);
        if (knownStart !== undefined) signature = `E(${knownStart})`;
      } else {
        const knownStart = signatures.get(start);
        const knownEnd = signatures.get(end);
        if (knownStart !== undefined && knownEnd !== undefined) {
          signature = `L(${knownStart},${knownEnd})`;
        }
      }
      if (signature === undefined) continue;
      signatures.set(local, signature);
      remaining.delete(local);
      progressed = true;
    }
    assert(progressed, "semantic signature topology must be rooted");
  }

  return [...signatures.values()].sort();
}

function proofFixture(): {
  readonly memory: Memory;
  readonly evidence: StructuralDerivationEvidence;
} {
  const memory = new Memory();
  const { R, U } = ensureRootBasis(memory);
  let cursor = U;
  const fresh = (): LinkHandle => (cursor = memory.ensure(cursor, R));

  const dictionary = fresh();
  const grammar = fresh();
  const theory = fresh();
  const role = fresh();
  const claim = fresh();
  const context = defineContext(memory, fresh(), fresh());

  const expectedInterpreter: StructuralInterpreter = { dictionary, grammar, theory };
  const interpreter = defineStructuralInterpreter(memory, dictionary, grammar, theory);
  const roleDictionary = defineStructuralRoleDictionary(memory, [role]);
  const rule = defineStructuralRule(memory, roleDictionary, role);
  const ruleAdmission = admitStructuralRule(memory, theory, rule);
  const act = defineActHeader(memory, interpreter, roleDictionary, context);
  defineActField(memory, act, role, claim);

  const judgment: StructuralJudgmentEvidence = {
    application: {
      act,
      rule,
      ruleAdmission,
      claimedBody: claim,
      expectedInterpreter,
      expectedAfterContext: context,
    },
    judgment: { theory, context, claim },
  };
  const occurrence = defineStructuralProofOccurrence(memory, act, claim);
  const derivationRule = defineStructuralDerivationRule(memory, rule, []);
  const node = {
    occurrence,
    judgment,
    derivationRule,
    derivationRuleAdmission: admitStructuralDerivationRule(memory, theory, derivationRule),
    premiseOccurrenceSequence: materializeExactSequence(memory, []),
  };

  return {
    memory,
    evidence: {
      theory,
      targetOccurrence: occurrence,
      nodes: [node],
    },
  };
}

function siblingOrderFixture(reverse: boolean): Memory {
  const memory = new Memory();
  const { O, C } = ensureRootBasis(memory);

  let x: LinkHandle;
  let y: LinkHandle;
  if (reverse) {
    y = memory.ensure(C, C);
    x = memory.ensure(O, O);
  } else {
    x = memory.ensure(O, O);
    y = memory.ensure(C, C);
  }

  memory.ensure(x, y);
  return memory;
}

// H1 + H2: a proof replays in its source Memory and the entire topology can be
// reconstructed, but source-owned evidence handles still cannot cross into the
// fresh Memory. Structural reconstruction is therefore required for transport.
{
  const { memory, evidence } = proofFixture();
  const beforeReplay = memory.linkCount;
  same(replayStructuralDerivation(memory, evidence).occurrenceCount, 1, "source derivation replays");
  same(memory.linkCount, beforeReplay, "source replay is read-only");

  const beforeExport = memory.linkCount;
  const image = exportTopology(memory);
  same(memory.linkCount, beforeExport, "source export is read-only");

  const restored = restoreTopology(image);
  same(restored.linkCount, memory.linkCount, "full proof topology round-trips");
  const beforeReexport = restored.linkCount;
  const reexported = exportTopology(restored);
  same(restored.linkCount, beforeReexport, "re-export is read-only");
  same(JSON.stringify(reexported), JSON.stringify(image), "one storage image round-trips stably");

  const copiedEvidence: StructuralDerivationEvidence = {
    theory: evidence.theory,
    targetOccurrence: evidence.targetOccurrence,
    nodes: evidence.nodes.map((node) => ({
      ...node,
      judgment: {
        application: { ...node.judgment.application },
        judgment: { ...node.judgment.judgment },
      },
    })),
  };
  const beforeForeignReplay = restored.linkCount;
  expectDerivationError(
    "invalid-derivation-evidence",
    () => replayStructuralDerivation(restored, copiedEvidence),
  );
  same(restored.linkCount, beforeForeignReplay, "foreign-handle rejection is read-only");
}

// H3 + H4: the same semantic rooted network built with opposite allocation order
// has the same coordinate-independent signatures but different storage images.
// Therefore mts-storage-topology/v0.1 is round-trip persistence, not a canonical
// semantic proof identity or digest input.
{
  const forward = siblingOrderFixture(false);
  const reverse = siblingOrderFixture(true);
  same(forward.linkCount, reverse.linkCount, "semantic fixtures have equal size");

  const beforeForward = forward.linkCount;
  const beforeReverse = reverse.linkCount;
  const forwardImage = exportTopology(forward);
  const reverseImage = exportTopology(reverse);
  same(forward.linkCount, beforeForward, "forward export is read-only");
  same(reverse.linkCount, beforeReverse, "reverse export is read-only");

  same(
    JSON.stringify(semanticSignatures(forwardImage)),
    JSON.stringify(semanticSignatures(reverseImage)),
    "opposite sibling allocation preserves semantic topology",
  );
  assert(
    JSON.stringify(forwardImage) !== JSON.stringify(reverseImage),
    "allocation-sensitive storage coordinates must not be treated as canonical semantic bytes",
  );
}
