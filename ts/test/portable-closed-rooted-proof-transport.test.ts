import { materializeExactSequence } from "../src/exact-sequence.js";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
  type ReadMemory,
  type RootBasis,
} from "../src/memory.js";
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
  decomposeV013SemanticLink,
  materializeV013HierarchicalCarrier,
  materializeV013HierarchicalCarrierFromSemanticLink,
  serializeV013HierarchicalCarrier,
} from "../src/v013-hierarchical-carrier.js";

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
  assert(actual.length === expected.length, `${message}: byte length differs`);
  for (let index = 0; index < actual.length; index += 1) {
    same(actual[index], expected[index], `${message}: byte ${index}`);
  }
}

function expectRootedReject(effect: () => unknown, message: string): void {
  try {
    effect();
  } catch (error) {
    assert(
      error instanceof StructuralRootedProofAsetReplayError,
      `${message}: wrong rejection type`,
    );
    return;
  }
  throw new Error(`${message}: expected rooted-proof rejection`);
}

function recursiveStructuralCode(
  memory: ReadMemory,
  basis: RootBasis,
  link: LinkHandle,
  active = new Set<LinkHandle>(),
): string {
  const decomposition = decomposeV013SemanticLink(memory, basis, link);
  if (decomposition.aspect === "ROOT") return "8";
  if (active.has(link)) throw new Error("test diagnostic encountered a non-grounded cycle");

  active.add(link);
  try {
    switch (decomposition.aspect) {
      case "START": {
        const child = decomposition.children[0];
        assert(child !== undefined, "START has one child");
        return `9${recursiveStructuralCode(memory, basis, child, active)}`;
      }
      case "END": {
        const child = decomposition.children[0];
        assert(child !== undefined, "END has one child");
        return `6${recursiveStructuralCode(memory, basis, child, active)}`;
      }
      case "PAIR": {
        const left = decomposition.children[0];
        const right = decomposition.children[1];
        assert(left !== undefined && right !== undefined, "PAIR has two children");
        return `1${recursiveStructuralCode(memory, basis, left, active)}${recursiveStructuralCode(memory, basis, right, active)}`;
      }
      default:
        throw new Error("unreachable structural aspect");
    }
  } finally {
    active.delete(link);
  }
}

function buildClosedProof(memory: Memory): {
  readonly basis: RootBasis;
  readonly theory: LinkHandle;
  readonly claim: LinkHandle;
  readonly proofRoot: LinkHandle;
} {
  const basis = ensureRootBasis(memory);
  const theory = memory.ensure(basis.C, basis.U);

  // Make the proof target structurally nontrivial so an imported quoted carrier
  // cannot accidentally look like one of the tiny root-basis Links.
  const left = memory.ensure(basis.L, basis.U);
  const right = memory.ensureStartSelfClosed(memory.ensure(basis.C, basis.L));
  const claim = memory.ensure(left, right);

  const dictionary = defineStructuralRoleDictionary(memory, []);
  const rule = defineStructuralRule(memory, dictionary, claim);
  const derivationRule = defineStructuralDerivationRule(memory, rule, []);
  admitStructuralRule(memory, theory, rule);
  admitStructuralDerivationRule(memory, theory, derivationRule);

  const occurrence = memory.ensure(
    claim,
    memory.ensure(derivationRule, materializeExactSequence(memory, [])),
  );
  const targetIdentity = memory.ensure(derivationRule, theory);
  const proofRoot = memory.ensure(targetIdentity, occurrence);

  const before = memory.linkCount;
  const replay = replayStructuralRootedProofAset(memory, proofRoot);
  same(replay.conclusion, claim, "sender CLOSED rooted proof conclusion");
  same(replay.declaredAssumptionCount, 0, "sender proof is CLOSED");
  same(replay.usedAssumptionCount, 0, "sender proof uses no assumptions");
  same(memory.linkCount, before, "sender trusted proof replay is read-only");

  return Object.freeze({ basis, theory, claim, proofRoot });
}

function main(): void {
  const sender = new Memory();
  const source = buildClosedProof(sender);

  // -------------------------------------------------------------------------
  // Sender: project one semantic CLOSED proof root into the accepted direct
  // recursive representation, then serialize canonical 8/9/6/1 bytes.
  // -------------------------------------------------------------------------
  const sourceProofCode = recursiveStructuralCode(
    sender,
    source.basis,
    source.proofRoot,
  );

  const carrierA = materializeV013HierarchicalCarrierFromSemanticLink(
    sender,
    source.basis,
    source.proofRoot,
  );
  const beforeSerializeA = sender.linkCount;
  const wire = serializeV013HierarchicalCarrier(sender, source.basis, carrierA);
  same(sender.linkCount, beforeSerializeA, "sender recursive serialization is read-only");
  assert(wire.length > 0, "proof carrier has non-empty recursive wire");

  // -------------------------------------------------------------------------
  // Receiver: fresh Memory, fresh local handles/allocation history.
  // Only the quoted representation is reconstructed here.
  // -------------------------------------------------------------------------
  const receiver = new Memory();
  const basisB = ensureRootBasis(receiver);

  // Allocation noise proves the wire does not depend on local handle numbering.
  let noise = receiver.ensure(basisB.U, basisB.L);
  noise = receiver.ensureEndSelfClosed(noise);
  receiver.ensure(noise, basisB.O);

  const beforeImport = receiver.linkCount;
  const carrierB = materializeV013HierarchicalCarrier(receiver, basisB, wire);
  assert(receiver.linkCount > beforeImport, "receiver materializes quoted representation");

  const beforeSerializeB = receiver.linkCount;
  const wireB = serializeV013HierarchicalCarrier(receiver, basisB, carrierB);
  same(receiver.linkCount, beforeSerializeB, "receiver recursive serialization is read-only");
  sameBytes(wireB, wire, "fresh-Memory quoted carrier wire parity");

  assert(carrierA !== carrierB, "carrier handles remain Memory-local");

  // The imported carrier is representation only. It must not become proof
  // authority merely because it encodes the proof root.
  expectRootedReject(
    () => replayStructuralRootedProofAset(receiver, carrierB),
    "quoted carrier is not a CLOSED proof root",
  );

  // Stronger diagnostic: no Link currently present in the receiver has the
  // exact semantic recursive topology of the sender proof root. The parser has
  // reconstructed the representation, not the described semantic target.
  const accidentalSemanticRoot = receiver.allLinks().find(
    (candidate) =>
      recursiveStructuralCode(receiver, basisB, candidate) === sourceProofCode,
  );
  same(
    accidentalSemanticRoot,
    undefined,
    "quoted carrier import does not silently materialize semantic proof root",
  );

  // Local sender proof remains replay-valid after representation projection.
  const senderReplay = replayStructuralRootedProofAset(sender, source.proofRoot);
  same(senderReplay.conclusion, source.claim, "sender proof authority remains exact");

  console.log("CLOSED_PROOF_REPRESENTATION_TRANSPORT = SUPPORTED");
  console.log("RECURSIVE_8_9_6_1_WIRE_PARITY = SUPPORTED");
  console.log("FRESH_MEMORY_HANDLE_INVARIANCE = SUPPORTED");
  console.log("IMPORTED_QUOTED_CARRIER_PROOF_AUTHORITY = NONE");
  console.log("SEMANTIC_PROOF_ROOT_AUTO_MATERIALIZATION = FALSE");
  console.log("NEXT_GAP = AUTHORITY_GATED_SEMANTIC_RECONSTRUCTION");
  console.log("accepted semantic delta = NONE");
}

main();
