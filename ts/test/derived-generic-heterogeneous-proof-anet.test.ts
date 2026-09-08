import { materializeExactSequence } from "../src/exact-sequence.js";
import { Memory, ensureRootBasis, type LinkHandle } from "../src/memory.js";
import {
  admitStructuralRule,
  defineStructuralRoleDictionary,
  defineStructuralRule,
} from "../src/structural-rule.js";
import {
  admitStructuralDerivationRule,
  defineStructuralDerivationRule,
} from "../src/derivation.js";
import { replayStructuralHeterogeneousDerivedDerivationSchema } from "../src/derived-derivation-heterogeneous.js";

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
  const entries = bindings.map(([sourceRole, targetRole]) => memory.ensure(sourceRole, targetRole));
  return materializeExactSequence(memory, [
    theory,
    sourceDictionary,
    targetDictionary,
    materializeExactSequence(memory, entries),
  ]);
}

function main(): void {
  const memory = new Memory();
  const { R, C, L, U } = ensureRootBasis(memory);
  const theory = memory.ensure(C, U);

  const A = memory.ensure(L, R);
  const B = memory.ensure(R, L);
  const CRole = memory.ensure(R, U);
  same(new Set([A, B, CRole]).size, 3, "global Role identities");

  const globalDictionary = defineStructuralRoleDictionary(memory, [A, B, CRole]);
  const targetRule = defineStructuralRule(memory, globalDictionary, CRole);
  const targetDR = defineStructuralDerivationRule(memory, targetRule, [A]);
  const targetIdentity = memory.ensure(targetDR, theory);

  const localAB = defineStructuralRoleDictionary(memory, [A, B]);
  const r1Rule = defineStructuralRule(memory, localAB, B);
  const r1DR = defineStructuralDerivationRule(memory, r1Rule, [A]);
  admitStructuralRule(memory, theory, r1Rule);
  admitStructuralDerivationRule(memory, theory, r1DR);

  const localBC = defineStructuralRoleDictionary(memory, [B, CRole]);
  const r2Rule = defineStructuralRule(memory, localBC, CRole);
  const r2DR = defineStructuralDerivationRule(memory, r2Rule, [B]);
  admitStructuralRule(memory, theory, r2Rule);
  admitStructuralDerivationRule(memory, theory, r2DR);

  const mu1 = morphism(memory, theory, localAB, globalDictionary, [[A, A], [B, B]]);
  const mu2 = morphism(memory, theory, localBC, globalDictionary, [[B, B], [CRole, CRole]]);

  const assumptionA = memory.ensure(A, targetIdentity);
  const n1Dependencies = materializeExactSequence(memory, [assumptionA]);
  const n1 = memory.ensure(B, memory.ensure(r1DR, memory.ensure(mu1, n1Dependencies)));
  const n2Dependencies = materializeExactSequence(memory, [n1]);
  const n2 = memory.ensure(CRole, memory.ensure(r2DR, memory.ensure(mu2, n2Dependencies)));

  assert(memory.find(theory, targetRule) === undefined, "derived target Rule stays unadmitted");
  assert(memory.find(theory, targetDR) === undefined, "derived target DR stays unadmitted");

  const before = memory.linkCount;
  const replay = replayStructuralHeterogeneousDerivedDerivationSchema(memory, {
    identity: targetIdentity,
    targetOccurrence: n2,
  });
  same(replay.theory, theory, "exact Theory");
  same(replay.targetDerivationRule, targetDR, "exact target DR");
  same(replay.globalRoleDictionary, globalDictionary, "exact global RoleDictionary");
  same(replay.conclusionTemplate, CRole, "target C template");
  same(replay.occurrenceCount, 2, "two heterogeneous primitive nodes");
  same(replay.declaredAssumptionCount, 1, "one declared assumption");
  same(replay.usedAssumptionCount, 1, "one used assumption");
  same(memory.linkCount, before, "heterogeneous replay is read-only");

  assert(memory.find(theory, targetRule) === undefined, "replay does not admit target Rule");
  assert(memory.find(theory, targetDR) === undefined, "replay does not admit target DR");

  console.log("HETEROGENEOUS_GENERIC_PROOF_ANET = SUPPORTED");
  console.log("LOCAL_ROLE_OBSERVABILITY = SUPPORTED");
  console.log("MAPPED_GLOBAL_PRIMITIVE_ADMISSION = NOT REQUIRED");
  console.log("accepted semantic delta = NONE");
}

main();
