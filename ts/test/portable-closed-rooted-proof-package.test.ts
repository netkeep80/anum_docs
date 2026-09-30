import {
  Memory,
  ensureRootBasis,
  exportPortableClosedRootedProof,
  replayPortableClosedRootedProof,
} from "../src/public.js";
import { materializeExactSequence } from "../src/exact-sequence.js";
import {
  admitStructuralRule,
  defineStructuralRoleDictionary,
  defineStructuralRule,
} from "../src/structural-rule.js";
import {
  admitStructuralDerivationRule,
  defineStructuralDerivationRule,
} from "../src/derivation.js";
import {
  StructuralRootedProofAsetReplayError,
  replayStructuralRootedProofAset,
} from "../src/rooted-proof-aset.js";
import {
  materializeV013HierarchicalCarrierFromSemanticLink,
  serializeV013HierarchicalCarrier,
} from "../src/v013-hierarchical-carrier.js";
import type { LinkHandle, RootBasis } from "../src/memory.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}

function sameBytes(
  actual: readonly number[] | Uint8Array,
  expected: readonly number[] | Uint8Array,
  message: string,
): void {
  same(actual.length, expected.length, `${message}: byte length`);
  for (let index = 0; index < actual.length; index += 1) {
    same(actual[index], expected[index], `${message}: byte ${index}`);
  }
}

interface Fixture {
  readonly memory: Memory;
  readonly basis: RootBasis;
  readonly theory: LinkHandle;
  readonly claim: LinkHandle;
  readonly proofRoot: LinkHandle;
}

function buildFixture(admit = true): Fixture {
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  const theory = memory.ensure(basis.C, basis.U);
  const left = memory.ensure(basis.L, basis.U);
  const right = memory.ensureEndSelfClosed(memory.ensure(basis.O, basis.C));
  const claim = memory.ensure(left, right);
  const dictionary = defineStructuralRoleDictionary(memory, []);
  const rule = defineStructuralRule(memory, dictionary, claim);
  const derivationRule = defineStructuralDerivationRule(memory, rule, []);

  if (admit) {
    admitStructuralRule(memory, theory, rule);
    admitStructuralDerivationRule(memory, theory, derivationRule);
  }

  const occurrence = memory.ensure(
    claim,
    memory.ensure(derivationRule, materializeExactSequence(memory, [])),
  );
  const targetIdentity = memory.ensure(derivationRule, theory);
  const proofRoot = memory.ensure(targetIdentity, occurrence);

  return Object.freeze({ memory, basis, theory, claim, proofRoot });
}

function semanticWire(
  memory: Memory,
  basis: RootBasis,
  semantic: LinkHandle,
): Uint8Array {
  return serializeV013HierarchicalCarrier(
    memory,
    basis,
    materializeV013HierarchicalCarrierFromSemanticLink(memory, basis, semantic),
  );
}

function expectRootedReject(effect: () => unknown, label: string): void {
  try {
    effect();
  } catch (error) {
    assert(
      error instanceof StructuralRootedProofAsetReplayError,
      `${label}: wrong error type`,
    );
    return;
  }
  throw new Error(`${label}: expected rooted K1 rejection`);
}

function main(): void {
  const source = buildFixture();
  const sourceReplay = replayStructuralRootedProofAset(source.memory, source.proofRoot);
  same(sourceReplay.conclusion, source.claim, "source proof accepts");
  same(sourceReplay.declaredAssumptionCount, 0, "source proof is CLOSED");

  const claimWire = semanticWire(source.memory, source.basis, source.claim);

  const first = exportPortableClosedRootedProof(
    source.memory,
    source.basis,
    source.proofRoot,
  );
  const second = exportPortableClosedRootedProof(
    source.memory,
    source.basis,
    source.proofRoot,
  );
  sameBytes(second, first, "portable CLOSED proof bytes are deterministic");

  const restored = replayPortableClosedRootedProof(first);
  assert(restored.proofRoot !== source.proofRoot, "proofRoot handle stays Memory-local");
  assert(restored.replay.theory !== source.theory, "Theory handle stays Memory-local");
  same(restored.replay.declaredAssumptionCount, 0, "restored proof remains CLOSED");
  sameBytes(
    semanticWire(restored.memory, restored.basis, restored.replay.conclusion),
    claimWire,
    "fresh K1 conclusion preserves recursive semantic identity",
  );

  const beforeReplay = restored.memory.linkCount;
  replayStructuralRootedProofAset(restored.memory, restored.proofRoot);
  same(restored.memory.linkCount, beforeReplay, "fresh trusted replay is read-only");

  // A reconstructed semantic proof root without its ambient Theory admissions is
  // still not proof authority. Feeding root-only bytes into the envelope API must
  // fail at rooted K1 rather than being auto-accepted after reconstruction.
  const rootOnly = semanticWire(source.memory, source.basis, source.proofRoot);
  expectRootedReject(
    () => replayPortableClosedRootedProof(rootOnly),
    "root-only transport without observed support",
  );

  // Export itself must execute trusted K1 before packaging. A structurally-shaped
  // proof whose Rule/DR were never admitted cannot be turned into portable proof.
  const unadmitted = buildFixture(false);
  expectRootedReject(
    () => exportPortableClosedRootedProof(
      unadmitted.memory,
      unadmitted.basis,
      unadmitted.proofRoot,
    ),
    "unadmitted source proof",
  );

  let malformedRejected = false;
  try {
    replayPortableClosedRootedProof(Uint8Array.from([0x31]));
  } catch {
    malformedRejected = true;
  }
  assert(malformedRejected, "malformed recursive wire rejects before proof ACCEPT");

  console.log("PORTABLE_CLOSED_ROOTED_PROOF_PACKAGE = SUPPORTED");
  console.log("FRESH_MEMORY_STRUCTURAL_ENTRY_RECOVERY = SUPPORTED");
  console.log("FRESH_MEMORY_THEORY_RECOVERY = SUPPORTED");
  console.log("FRESH_MEMORY_K1_REPLAY_REQUIRED = TRUE");
  console.log("ROOT_ONLY_AUTO_ACCEPT = FALSE");
  console.log("THEOREM_METADATA_AUTHORITY = NONE");
  console.log("accepted semantic delta = NONE");
}

main();
