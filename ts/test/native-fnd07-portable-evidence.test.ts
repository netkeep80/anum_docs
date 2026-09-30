import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
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

function repositoryRoot(): string {
  const candidates = [resolve(process.cwd(), ".."), process.cwd()];
  const root = candidates.find((candidate) =>
    existsSync(resolve(candidate, "proofs", "native", "FND-07")),
  );
  if (root === undefined) throw new Error("FND-07 native artifact root not found");
  return root;
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

// Final N5 gate: tracked artifacts, revisions and fresh replay must stay exact.
const EXPECTED_DETACHMENT_SHA256 =
  "a565b72a9caa77007f297490b5cccf3b2945388b006431395b6f117cd6375347";
const EXPECTED_TRUTH_ROLE_SHA256 =
  "8e03a22c06fe93b1e645785cbdf635347427a5f8e50d024aef6b2d6c15d1aea3";
const EXPECTED_DETACHMENT_THEORY_REVISION =
  "3606347cf99b67a3c48da83d930a42e52e40e7fd92ac4840c444e6896bc20116";
const EXPECTED_TRUTH_ROLE_THEORY_REVISION =
  "d2616afc7f358724b4abdf1fee6a0276d8db12ed571a357a8035767c253a8e58";
const EXPECTED_COMPOSITE_THEORY_REVISION =
  "fnd07-component-theories/sha-256/v0.1:d5807308da2f258d66e30443d72ed4e0b78bddc019107d5edbdfe61a205f9219";

async function main(): Promise<void> {
  const detachment = buildContextualDetachment();
  const truthRole = buildA16TruthRole();

  const generatedDetachment = exportPortableClosedRootedProof(
    detachment.memory,
    detachment.basis,
    detachment.proofRoot,
  );
  const generatedTruthRole = exportPortableClosedRootedProof(
    truthRole.memory,
    truthRole.basis,
    truthRole.proofRoot,
  );

  const root = repositoryRoot();
  const trackedDetachment = readFileSync(
    resolve(root, "proofs", "native", "FND-07", "contextual-detachment.anum"),
  );
  const trackedTruthRole = readFileSync(
    resolve(root, "proofs", "native", "FND-07", "a16-truth-role.anum"),
  );

  sameBytes(generatedDetachment, trackedDetachment, "detachment artifact is reproducible");
  sameBytes(generatedTruthRole, trackedTruthRole, "A16 truth-role artifact is reproducible");

  const decoder = new TextDecoder();
  assert(
    /^[8961]+$/.test(decoder.decode(trackedDetachment)),
    "detachment artifact remains canonical 8/9/6/1",
  );
  assert(
    /^[8961]+$/.test(decoder.decode(trackedTruthRole)),
    "truth-role artifact remains canonical 8/9/6/1",
  );

  same(
    await sha256(trackedDetachment),
    EXPECTED_DETACHMENT_SHA256,
    "detachment artifact SHA-256",
  );
  same(
    await sha256(trackedTruthRole),
    EXPECTED_TRUTH_ROLE_SHA256,
    "truth-role artifact SHA-256",
  );

  const detached = await componentTheoryRevision(trackedDetachment);
  const role = await componentTheoryRevision(trackedTruthRole);

  same(
    detached.value,
    EXPECTED_DETACHMENT_THEORY_REVISION,
    "detachment Theory revision",
  );
  same(
    role.value,
    EXPECTED_TRUTH_ROLE_THEORY_REVISION,
    "A16 truth-role Theory revision",
  );
  same(
    await compositeRevision(detached.value, role.value),
    EXPECTED_COMPOSITE_THEORY_REVISION,
    "composite component Theory revision",
  );

  same(detached.replay.replay.declaredAssumptionCount, 0, "portable detachment remains CLOSED");
  same(role.replay.replay.declaredAssumptionCount, 0, "portable A16 role remains CLOSED");

  console.log("FND07_PORTABLE_NATIVE_COMPONENTS = FRESH_REPLAY_GREEN");
  console.log("FND07_TRACKED_ARTIFACTS = REPRODUCIBLE");
  console.log("PAIR_STRUCTURE_IMPLIES_TRUTH_ROLE = FALSE");
  console.log("SYNTHETIC_CAPSTONE_RULE = NONE");
  console.log("accepted semantic delta = NONE");
}

void main();
