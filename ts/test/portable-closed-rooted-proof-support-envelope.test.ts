import {
  materializeExactSequence,
} from "../src/exact-sequence.js";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
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
  exportObservedReplaySupportTopology,
} from "../src/replay-support-topology.js";
import {
  materializeV013HierarchicalCarrier,
  materializeV013HierarchicalCarrierFromSemanticLink,
  materializeV013SemanticLinkFromHierarchicalCarrier,
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

interface ClosedFixture {
  readonly memory: Memory;
  readonly basis: RootBasis;
  readonly theory: LinkHandle;
  readonly rule: LinkHandle;
  readonly derivationRule: LinkHandle;
  readonly ruleAdmission: LinkHandle;
  readonly derivationRuleAdmission: LinkHandle;
  readonly claim: LinkHandle;
  readonly proofRoot: LinkHandle;
}

function buildClosedFixture(): ClosedFixture {
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  const theory = memory.ensure(basis.C, basis.U);

  const left = memory.ensure(basis.L, basis.U);
  const right = memory.ensureEndSelfClosed(memory.ensure(basis.O, basis.C));
  const claim = memory.ensure(left, right);

  const dictionary = defineStructuralRoleDictionary(memory, []);
  const rule = defineStructuralRule(memory, dictionary, claim);
  const derivationRule = defineStructuralDerivationRule(memory, rule, []);
  const ruleAdmission = admitStructuralRule(memory, theory, rule);
  const derivationRuleAdmission = admitStructuralDerivationRule(
    memory,
    theory,
    derivationRule,
  );

  assert(ruleAdmission !== derivationRuleAdmission, "Rule/DR admissions stay distinct");

  const occurrence = memory.ensure(
    claim,
    memory.ensure(derivationRule, materializeExactSequence(memory, [])),
  );
  const targetIdentity = memory.ensure(derivationRule, theory);
  const proofRoot = memory.ensure(targetIdentity, occurrence);

  const replay = replayStructuralRootedProofAset(memory, proofRoot);
  same(replay.conclusion, claim, "sender CLOSED proof conclusion");
  same(replay.declaredAssumptionCount, 0, "sender proof is CLOSED");

  return Object.freeze({
    memory,
    basis,
    theory,
    rule,
    derivationRule,
    ruleAdmission,
    derivationRuleAdmission,
    claim,
    proofRoot,
  });
}

function wireForSemantic(
  memory: Memory,
  basis: RootBasis,
  semantic: LinkHandle,
): Uint8Array {
  const carrier = materializeV013HierarchicalCarrierFromSemanticLink(
    memory,
    basis,
    semantic,
  );
  return serializeV013HierarchicalCarrier(memory, basis, carrier);
}

function importSemantic(
  memory: Memory,
  basis: RootBasis,
  wire: Uint8Array,
): LinkHandle {
  const carrier = materializeV013HierarchicalCarrier(memory, basis, wire);
  return materializeV013SemanticLinkFromHierarchicalCarrier(
    memory,
    basis,
    carrier,
  );
}

function transportEnvelope(
  source: ClosedFixture,
  support: readonly LinkHandle[],
): {
  readonly wire: Uint8Array;
  readonly envelope: LinkHandle;
} {
  const supportSequence = materializeExactSequence(source.memory, support);
  const envelope = source.memory.ensure(source.proofRoot, supportSequence);
  return Object.freeze({
    wire: wireForSemantic(source.memory, source.basis, envelope),
    envelope,
  });
}

function replayImportedEnvelope(
  wire: Uint8Array,
): {
  readonly memory: Memory;
  readonly basis: RootBasis;
  readonly envelope: LinkHandle;
  readonly proofRoot: LinkHandle;
  readonly conclusion: LinkHandle;
} {
  const memory = new Memory();
  const basis = ensureRootBasis(memory);

  // Deliberately perturb local allocation history.
  let noise = memory.ensure(basis.U, basis.L);
  noise = memory.ensureStartSelfClosed(noise);
  memory.ensure(noise, basis.C);

  const envelope = importSemantic(memory, basis, wire);
  const proofRoot = memory.poles(envelope).start;
  const before = memory.linkCount;
  const replay = replayStructuralRootedProofAset(memory, proofRoot);
  same(memory.linkCount, before, "fresh K1 replay is read-only");

  return Object.freeze({
    memory,
    basis,
    envelope,
    proofRoot,
    conclusion: replay.conclusion,
  });
}

function main(): void {
  const source = buildClosedFixture();

  // The same trusted K1 replay is traced. The tracer is transport observation
  // only: it does not bless any Link that K1 did not actually read.
  const observed = exportObservedReplaySupportTopology(
    source.memory,
    (memory) => replayStructuralRootedProofAset(memory, source.proofRoot),
    [source.proofRoot],
  );

  same(observed.replay.conclusion, source.claim, "observed replay conclusion");
  assert(
    observed.links.includes(source.ruleAdmission),
    "observed support contains exact Rule admission returned by K1 find",
  );
  assert(
    observed.links.includes(source.derivationRuleAdmission),
    "observed support contains exact DR admission returned by K1 find",
  );

  const claimWire = wireForSemantic(source.memory, source.basis, source.claim);

  // -----------------------------------------------------------------------
  // Negative control: recursive topology of proofRoot alone is insufficient.
  // Theory admissions are ambient authority Links, not proofRoot pole children.
  // -----------------------------------------------------------------------
  {
    const memory = new Memory();
    const basis = ensureRootBasis(memory);
    const rootOnly = importSemantic(
      memory,
      basis,
      wireForSemantic(source.memory, source.basis, source.proofRoot),
    );
    expectRootedReject(
      () => replayStructuralRootedProofAset(memory, rootOnly),
      "proof root without observed Theory admissions",
    );
  }

  // -----------------------------------------------------------------------
  // Positive: ordinary Link envelope carries proof root + exact observed
  // support. Import reconstructs all support Links, then K1 decides proof truth.
  // -----------------------------------------------------------------------
  const canonical = transportEnvelope(source, observed.links);
  const imported = replayImportedEnvelope(canonical.wire);

  assert(
    imported.proofRoot !== source.proofRoot,
    "proof root handles remain Memory-local across transport",
  );
  sameBytes(
    wireForSemantic(imported.memory, imported.basis, imported.conclusion),
    claimWire,
    "fresh K1 conclusion preserves structural identity",
  );

  // The envelope itself is transport scaffolding; its support sequence order is
  // not proof authority. Reversing all support slots changes the envelope
  // representation but must not change K1's verdict.
  const reversed = transportEnvelope(source, [...observed.links].reverse());
  assert(
    new TextDecoder().decode(reversed.wire) !== new TextDecoder().decode(canonical.wire),
    "reversing support changes transport envelope identity",
  );
  const reversedImported = replayImportedEnvelope(reversed.wire);
  sameBytes(
    wireForSemantic(
      reversedImported.memory,
      reversedImported.basis,
      reversedImported.conclusion,
    ),
    claimWire,
    "support order grants zero proof authority",
  );

  // Missing one observed admission must fail closed even though proofRoot and
  // every other transported support Link remain present.
  const withoutRuleAdmission = observed.links.filter(
    (link) => link !== source.ruleAdmission,
  );
  assert(
    withoutRuleAdmission.length + 1 === observed.links.length,
    "negative removes exactly one required admission",
  );
  const missing = transportEnvelope(source, withoutRuleAdmission);
  {
    const memory = new Memory();
    const basis = ensureRootBasis(memory);
    const envelope = importSemantic(memory, basis, missing.wire);
    const proofRoot = memory.poles(envelope).start;
    expectRootedReject(
      () => replayStructuralRootedProofAset(memory, proofRoot),
      "missing observed Rule admission",
    );
  }

  // Extra ambient support may alter transport representation but cannot create
  // a different theorem verdict.
  const unrelated = source.memory.ensure(source.basis.U, source.basis.C);
  assert(!observed.links.includes(unrelated), "extra Link is outside observed support");
  const withExtra = transportEnvelope(source, [...observed.links, unrelated]);
  const extraImported = replayImportedEnvelope(withExtra.wire);
  sameBytes(
    wireForSemantic(extraImported.memory, extraImported.basis, extraImported.conclusion),
    claimWire,
    "unrelated transported Link grants zero proof authority",
  );

  console.log("CLOSED_PROOF_LINK_NATIVE_SUPPORT_ENVELOPE = SUPPORTED");
  console.log("OBSERVED_K1_SUPPORT_TRANSPORT = SUPPORTED");
  console.log("ROOT_ONLY_WITHOUT_THEORY_ADMISSIONS = REJECTED");
  console.log("MISSING_REQUIRED_ADMISSION = REJECTED");
  console.log("SUPPORT_SEQUENCE_ORDER_AUTHORITY = NONE");
  console.log("UNRELATED_SUPPORT_AUTHORITY = NONE");
  console.log("FRESH_MEMORY_K1_REPLAY = ACCEPT");
  console.log("NEXT_GAP = PACKAGE_ROOT_ENVELOPE_EXPORT_REPLAY_API");
  console.log("accepted semantic delta = NONE");
}

main();
