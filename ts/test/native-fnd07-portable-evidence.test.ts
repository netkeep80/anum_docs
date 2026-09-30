import {
  Memory,
  computePortableStructuralTheoryRevision,
  ensureRootBasis,
  exportPortableClosedRootedProof,
  exportPortableStructuralTheory,
  replayPortableClosedRootedProof,
  type LinkHandle,
  type RootBasis,
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
  type StructuralHeterogeneousDerivedDerivationEvidence,
} from "../src/derived-derivation-heterogeneous.js";
import {
  materializeHeterogeneousDerivedOpenRootedExpansion,
} from "../src/derived-derivation-heterogeneous-expansion.js";
import {
  materializeHeterogeneousDerivedClosedRootedDischarge,
} from "../src/derived-derivation-heterogeneous-discharge-materialize.js";
import {
  replayRecursiveLinkIdentityProofClosure,
} from "../src/recursive-link-identity-proof.js";
import {
  replayStructuralRootedProofAset,
} from "../src/rooted-proof-aset.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}

function morphism(
  memory: Memory,
  theory: LinkHandle,
  sourceDictionary: LinkHandle,
  targetDictionary: LinkHandle,
  bindings: readonly (readonly [LinkHandle, LinkHandle])[],
): LinkHandle {
  return materializeExactSequence(memory, [
    theory,
    sourceDictionary,
    targetDictionary,
    materializeExactSequence(
      memory,
      bindings.map(([sourceRole, targetRole]) => memory.ensure(sourceRole, targetRole)),
    ),
  ]);
}

function primitiveClaimProof(
  memory: Memory,
  theory: LinkHandle,
  claim: LinkHandle,
): {
  readonly derivationRule: LinkHandle;
  readonly occurrence: LinkHandle;
} {
  const dictionary = defineStructuralRoleDictionary(memory, []);
  const rule = defineStructuralRule(memory, dictionary, claim);
  const derivationRule = defineStructuralDerivationRule(memory, rule, []);
  admitStructuralRule(memory, theory, rule);
  admitStructuralDerivationRule(memory, theory, derivationRule);
  const occurrence = memory.ensure(
    claim,
    memory.ensure(derivationRule, materializeExactSequence(memory, [])),
  );
  return Object.freeze({ derivationRule, occurrence });
}

interface PortableFixture {
  readonly memory: Memory;
  readonly basis: RootBasis;
  readonly theory: LinkHandle;
  readonly proofRoot: LinkHandle;
  readonly conclusion: LinkHandle;
}

function buildContextualDetachment(): PortableFixture {
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  const { O, C, L, U } = basis;
  const theory = memory.ensure(C, U);

  let freshSeed = memory.ensure(L, U);
  const fresh = (): LinkHandle => {
    freshSeed = memory.ensure(freshSeed, O);
    return freshSeed;
  };

  const currentTag = fresh();
  const current = (scope: LinkHandle, witness: LinkHandle): LinkHandle =>
    memory.ensure(currentTag, memory.ensure(scope, witness));

  const S = fresh();
  const K = fresh();
  const A = fresh();
  const B = fresh();
  const globalDictionary = defineStructuralRoleDictionary(memory, [S, K, A, B]);
  const targetPremiseTruth = current(S, memory.ensure(K, A));
  const targetPremiseRule = current(S, memory.ensure(A, B));
  const targetConclusion = current(S, memory.ensure(K, B));
  const targetRule = defineStructuralRule(memory, globalDictionary, targetConclusion);
  const targetDR = defineStructuralDerivationRule(
    memory,
    targetRule,
    [targetPremiseTruth, targetPremiseRule],
  );
  const targetIdentity = memory.ensure(targetDR, theory);

  const s = fresh();
  const k = fresh();
  const a = fresh();
  const b = fresh();
  const localDictionary = defineStructuralRoleDictionary(memory, [s, k, a, b]);
  const localRule = defineStructuralRule(
    memory,
    localDictionary,
    current(s, memory.ensure(k, b)),
  );
  const localDR = defineStructuralDerivationRule(
    memory,
    localRule,
    [current(s, memory.ensure(k, a)), current(s, memory.ensure(a, b))],
  );
  assert(localRule !== targetRule && localDR !== targetDR, "target law stays unadmitted");
  admitStructuralRule(memory, theory, localRule);
  admitStructuralDerivationRule(memory, theory, localDR);
  same(memory.find(theory, targetRule), undefined, "target Rule is not admitted");
  same(memory.find(theory, targetDR), undefined, "target DR is not admitted");

  const mu = morphism(
    memory,
    theory,
    localDictionary,
    globalDictionary,
    [[s, S], [k, K], [a, A], [b, B]],
  );
  const genericTruth = memory.ensure(targetPremiseTruth, targetIdentity);
  const genericRule = memory.ensure(targetPremiseRule, targetIdentity);
  const genericTarget = memory.ensure(
    targetConclusion,
    memory.ensure(
      localDR,
      memory.ensure(mu, materializeExactSequence(memory, [genericTruth, genericRule])),
    ),
  );
  const generic: StructuralHeterogeneousDerivedDerivationEvidence = Object.freeze({
    identity: targetIdentity,
    targetOccurrence: genericTarget,
  });

  const scope = fresh();
  const context = fresh();
  const antecedent = fresh();
  const consequent = fresh();

  const currentTruth = current(scope, memory.ensure(context, antecedent));
  const currentRule = current(scope, memory.ensure(antecedent, consequent));
  const currentResult = current(scope, memory.ensure(context, consequent));

  const openRoot = materializeHeterogeneousDerivedOpenRootedExpansion(
    memory,
    generic,
    [
      { role: S, value: scope },
      { role: K, value: context },
      { role: A, value: antecedent },
      { role: B, value: consequent },
    ],
  ).concreteRoot;

  const openIdentity = memory.poles(openRoot).start;
  const truthAssumption = memory.ensure(currentTruth, openIdentity);
  const ruleAssumption = memory.ensure(currentRule, openIdentity);
  const truthProof = primitiveClaimProof(memory, theory, currentTruth);
  const ruleProof = primitiveClaimProof(memory, theory, currentRule);

  const proofRoot = materializeHeterogeneousDerivedClosedRootedDischarge(
    memory,
    { generic, concreteRoot: openRoot },
    [
      { assumptionOccurrence: truthAssumption, proofOccurrence: truthProof.occurrence },
      { assumptionOccurrence: ruleAssumption, proofOccurrence: ruleProof.occurrence },
    ],
  ).closedRoot;

  const replay = replayStructuralRootedProofAset(memory, proofRoot);
  same(replay.conclusion, currentResult, "detachment CLOSED conclusion");
  same(replay.declaredAssumptionCount, 0, "detachment proof is CLOSED");

  return Object.freeze({
    memory,
    basis,
    theory,
    proofRoot,
    conclusion: currentResult,
  });
}

function buildA16TruthRole(): PortableFixture {
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  const { O, C, L, U } = basis;
  const theory = memory.ensure(C, U);

  let fresh = memory.ensure(L, U);
  const nextFresh = (): LinkHandle => {
    fresh = memory.ensure(fresh, O);
    return fresh;
  };

  const truthRoleTag = nextFresh();
  const truthRoleClaim = memory.ensure(truthRoleTag, L);
  assert(truthRoleClaim !== L, "truth semantic role is not raw L existence");

  const proof = primitiveClaimProof(memory, theory, truthRoleClaim);
  const targetIdentity = memory.ensure(proof.derivationRule, theory);
  const proofRoot = memory.ensure(targetIdentity, proof.occurrence);
  const replay = replayStructuralRootedProofAset(memory, proofRoot);
  same(replay.conclusion, truthRoleClaim, "A16 role CLOSED conclusion");

  // Preserve the accepted N4 separation: intrinsic L structure remains a
  // different proof coordinate and never becomes the semantic role by topology.
  const rootProof = memory.root;
  const oProof = memory.ensure(memory.ensure(O, O), materializeExactSequence(memory, [rootProof]));
  const cProof = memory.ensure(memory.ensure(C, C), materializeExactSequence(memory, [rootProof]));
  const lProof = memory.ensure(memory.ensure(L, L), materializeExactSequence(memory, [oProof, cProof]));
  const structural = replayRecursiveLinkIdentityProofClosure(memory, lProof);
  same(structural.left, L, "structural L coordinate left");
  same(structural.right, L, "structural L coordinate right");
  assert(memory.poles(L).start === O && memory.poles(L).end === C, "L remains exact O->C pair");
  assert(memory.poles(lProof).start !== truthRoleClaim, "PAIR structure does not imply truth role");

  return Object.freeze({
    memory,
    basis,
    theory,
    proofRoot,
    conclusion: truthRoleClaim,
  });
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

async function componentTheoryRevision(bytes: Uint8Array): Promise<{
  readonly value: string;
  readonly replay: ReturnType<typeof replayPortableClosedRootedProof>;
}> {
  const replay = replayPortableClosedRootedProof(bytes);
  const artifact = exportPortableStructuralTheory(replay.memory, replay.replay.theory);
  const revision = await computePortableStructuralTheoryRevision(artifact);
  return Object.freeze({ value: revision.value, replay });
}

async function compositeRevision(
  detachmentRevision: string,
  truthRoleRevision: string,
): Promise<string> {
  const scheme = "fnd07-component-theories/sha-256/v0.1";
  const preimage = [
    scheme,
    `contextual-detachment=${detachmentRevision}`,
    `a16-truth-role=${truthRoleRevision}`,
  ].join("\n");
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(preimage),
  );
  const value = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return `${scheme}:${value}`;
}

async function main(): Promise<void> {
  const detachment = buildContextualDetachment();
  const truthRole = buildA16TruthRole();

  const detachmentBytes = exportPortableClosedRootedProof(
    detachment.memory,
    detachment.basis,
    detachment.proofRoot,
  );
  const truthRoleBytes = exportPortableClosedRootedProof(
    truthRole.memory,
    truthRole.basis,
    truthRole.proofRoot,
  );

  const detached = await componentTheoryRevision(detachmentBytes);
  const role = await componentTheoryRevision(truthRoleBytes);

  same(detached.replay.replay.declaredAssumptionCount, 0, "portable detachment remains CLOSED");
  same(role.replay.replay.declaredAssumptionCount, 0, "portable A16 role remains CLOSED");

  const decoder = new TextDecoder();
  const detachmentText = decoder.decode(detachmentBytes);
  const truthRoleText = decoder.decode(truthRoleBytes);
  assert(/^[8961]+$/.test(detachmentText), "detachment artifact is canonical 8/9/6/1");
  assert(/^[8961]+$/.test(truthRoleText), "truth-role artifact is canonical 8/9/6/1");

  const composite = await compositeRevision(detached.value, role.value);

  console.log(`FND07_DETACHMENT_ANUM=${detachmentText}`);
  console.log(`FND07_TRUTH_ROLE_ANUM=${truthRoleText}`);
  console.log(`FND07_DETACHMENT_SHA256=${await sha256(detachmentBytes)}`);
  console.log(`FND07_TRUTH_ROLE_SHA256=${await sha256(truthRoleBytes)}`);
  console.log(`FND07_DETACHMENT_THEORY_REVISION=${detached.value}`);
  console.log(`FND07_TRUTH_ROLE_THEORY_REVISION=${role.value}`);
  console.log(`FND07_COMPOSITE_THEORY_REVISION=${composite}`);
  console.log("FND07_PORTABLE_NATIVE_COMPONENTS = FRESH_REPLAY_GREEN");
  console.log("PAIR_STRUCTURE_IMPLIES_TRUTH_ROLE = FALSE");
  console.log("SYNTHETIC_CAPSTONE_RULE = NONE");
  console.log("accepted semantic delta = NONE");
}

void main();
