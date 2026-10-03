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
import { exportObservedReplaySupportTopology } from "../src/replay-support-topology.js";
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

function buildOpenFixture(useDeclaredAssumption: boolean): Fixture {
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  const theory = memory.ensure(basis.L, basis.U);
  let cursor = memory.ensure(basis.U, basis.R);
  const fresh = (): LinkHandle => (cursor = memory.ensure(cursor, basis.R));

  const a = fresh();
  const b = fresh();

  let primitiveDerivationRule: LinkHandle;
  let dependencies: readonly LinkHandle[];

  if (useDeclaredAssumption) {
    const s = fresh();
    const t = fresh();
    const sourceDictionary = defineStructuralRoleDictionary(memory, [s, t]);
    const primitiveRule = defineStructuralRule(memory, sourceDictionary, t);
    admitStructuralRule(memory, theory, primitiveRule);
    primitiveDerivationRule = defineStructuralDerivationRule(
      memory,
      primitiveRule,
      [s],
    );
    admitStructuralDerivationRule(memory, theory, primitiveDerivationRule);
  } else {
    const sourceDictionary = defineStructuralRoleDictionary(memory, []);
    const primitiveRule = defineStructuralRule(memory, sourceDictionary, b);
    admitStructuralRule(memory, theory, primitiveRule);
    primitiveDerivationRule = defineStructuralDerivationRule(
      memory,
      primitiveRule,
      [],
    );
    admitStructuralDerivationRule(memory, theory, primitiveDerivationRule);
  }

  const targetDictionary = defineStructuralRoleDictionary(memory, [a, b]);
  const targetRule = defineStructuralRule(memory, targetDictionary, b);
  admitStructuralRule(memory, theory, targetRule);
  const targetDerivationRule = defineStructuralDerivationRule(
    memory,
    targetRule,
    [a],
  );
  const targetIdentity = memory.ensure(targetDerivationRule, theory);

  if (useDeclaredAssumption) {
    dependencies = [memory.ensure(a, targetIdentity)];
  } else {
    dependencies = [];
  }

  const occurrence = memory.ensure(
    b,
    memory.ensure(
      primitiveDerivationRule,
      materializeExactSequence(memory, dependencies),
    ),
  );
  const proofRoot = memory.ensure(targetIdentity, occurrence);

  return Object.freeze({
    memory,
    basis,
    theory,
    claim: b,
    proofRoot,
  });
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

function exportUncheckedPortableRootedProof(
  memory: Memory,
  basis: RootBasis,
  proofRoot: LinkHandle,
): Uint8Array {
  const observed = exportObservedReplaySupportTopology(
    memory,
    (observedMemory) => replayStructuralRootedProofAset(observedMemory, proofRoot),
    [proofRoot],
  );
  const supportSequence = materializeExactSequence(memory, observed.links);
  const envelope = memory.ensure(proofRoot, supportSequence);
  return semanticWire(memory, basis, envelope);
}

function expectNotClosedReject(effect: () => unknown, label: string): void {
  try {
    effect();
  } catch (error) {
    assert(
      error instanceof StructuralRootedProofAsetReplayError,
      `${label}: wrong error type`,
    );
    same(error.code, "proof-not-closed", `${label}: exact rejection code`);
    return;
  }
  throw new Error(`${label}: expected CLOSED-boundary rejection`);
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
  same(restored.replay.usedAssumptionCount, 0, "restored proof uses no assumptions");
  sameBytes(
    semanticWire(restored.memory, restored.basis, restored.replay.conclusion),
    claimWire,
    "fresh K1 conclusion preserves recursive semantic identity",
  );

  const beforeReplay = restored.memory.linkCount;
  replayStructuralRootedProofAset(restored.memory, restored.proofRoot);
  same(restored.memory.linkCount, beforeReplay, "fresh trusted replay is read-only");

  // The CLOSED-labelled exporter must reject a semantically valid rooted proof
  // that still depends on a declared premise, before writing package scaffolding.
  const usedOpen = buildOpenFixture(true);
  const usedReplay = replayStructuralRootedProofAset(
    usedOpen.memory,
    usedOpen.proofRoot,
  );
  same(usedReplay.declaredAssumptionCount, 1, "open fixture declares one premise");
  same(usedReplay.usedAssumptionCount, 1, "open fixture uses one premise");
  const beforeOpenExport = usedOpen.memory.linkCount;
  expectNotClosedReject(
    () => exportPortableClosedRootedProof(
      usedOpen.memory,
      usedOpen.basis,
      usedOpen.proofRoot,
    ),
    "export rejects declared+used premise",
  );
  same(
    usedOpen.memory.linkCount,
    beforeOpenExport,
    "rejected open export writes no package scaffolding",
  );

  // Receiver validation is independent of the trusted sender. Build hostile
  // bytes through the lower transport primitives and require the CLOSED API to
  // reject after fresh rooted replay.
  const hostileUsed = exportUncheckedPortableRootedProof(
    usedOpen.memory,
    usedOpen.basis,
    usedOpen.proofRoot,
  );
  expectNotClosedReject(
    () => replayPortableClosedRootedProof(hostileUsed),
    "receiver rejects declared+used premise",
  );

  // A declared but unused premise is still not CLOSED. This prevents a package
  // from gaining CLOSED classification merely because its open premise was not
  // needed by the selected derivation.
  const unusedOpen = buildOpenFixture(false);
  const unusedReplay = replayStructuralRootedProofAset(
    unusedOpen.memory,
    unusedOpen.proofRoot,
  );
  same(unusedReplay.declaredAssumptionCount, 1, "unused fixture declares one premise");
  same(unusedReplay.usedAssumptionCount, 0, "unused fixture uses no premise");
  const beforeUnusedExport = unusedOpen.memory.linkCount;
  expectNotClosedReject(
    () => exportPortableClosedRootedProof(
      unusedOpen.memory,
      unusedOpen.basis,
      unusedOpen.proofRoot,
    ),
    "export rejects declared-but-unused premise",
  );
  same(
    unusedOpen.memory.linkCount,
    beforeUnusedExport,
    "rejected unused-premise export writes no package scaffolding",
  );
  const hostileUnused = exportUncheckedPortableRootedProof(
    unusedOpen.memory,
    unusedOpen.basis,
    unusedOpen.proofRoot,
  );
  expectNotClosedReject(
    () => replayPortableClosedRootedProof(hostileUnused),
    "receiver rejects declared-but-unused premise",
  );

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
  console.log("CLOSED_BOUNDARY_REJECTS_OPEN_PROOFS = TRUE");
  console.log("ROOT_ONLY_AUTO_ACCEPT = FALSE");
  console.log("THEOREM_METADATA_AUTHORITY = NONE");
  console.log("accepted semantic delta = NONE");
}

main();
