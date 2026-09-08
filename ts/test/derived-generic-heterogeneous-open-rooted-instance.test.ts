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
import {
  replayStructuralHeterogeneousDerivedDerivationSchema,
  type StructuralHeterogeneousDerivedDerivationEvidence,
} from "../src/derived-derivation-heterogeneous.js";
import { materializeHeterogeneousDerivedOpenRootedExpansion } from "../src/derived-derivation-heterogeneous-expansion.js";
import { replayStructuralRootedProofAset } from "../src/rooted-proof-aset.js";
import { replayStructuralHeterogeneousDerivedOpenRootedInstance } from "../src/derived-derivation-heterogeneous-instance.js";

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

function main(): void {
  const memory = new Memory();
  const { R, O, C, L, U } = ensureRootBasis(memory);
  const theory = memory.ensure(C, U);

  const A = memory.ensure(L, R);
  const B = memory.ensure(R, L);
  const CRole = memory.ensure(R, U);
  same(new Set([A, B, CRole]).size, 3, "generic Roles are distinct");

  const globalDictionary = defineStructuralRoleDictionary(memory, [A, B, CRole]);
  const genericTargetRule = defineStructuralRule(memory, globalDictionary, CRole);
  const genericTargetDR = defineStructuralDerivationRule(memory, genericTargetRule, [A]);
  const genericIdentity = memory.ensure(genericTargetDR, theory);

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

  const mu1 = morphism(memory, theory, localAB, globalDictionary, [
    [A, A],
    [B, B],
  ]);
  const mu2 = morphism(memory, theory, localBC, globalDictionary, [
    [B, B],
    [CRole, CRole],
  ]);

  const genericAssumption = memory.ensure(A, genericIdentity);
  const genericN1 = memory.ensure(
    B,
    memory.ensure(r1DR, memory.ensure(mu1, materializeExactSequence(memory, [genericAssumption]))),
  );
  const genericN2 = memory.ensure(
    CRole,
    memory.ensure(r2DR, memory.ensure(mu2, materializeExactSequence(memory, [genericN1]))),
  );
  const generic: StructuralHeterogeneousDerivedDerivationEvidence = Object.freeze({
    identity: genericIdentity,
    targetOccurrence: genericN2,
  });

  const genericBefore = memory.linkCount;
  const genericReplay = replayStructuralHeterogeneousDerivedDerivationSchema(memory, generic);
  same(genericReplay.theory, theory, "generic exact Theory");
  same(genericReplay.globalRoleDictionary, globalDictionary, "generic exact RoleDictionary");
  same(memory.linkCount, genericBefore, "generic replay is read-only");

  const a = memory.ensure(O, R);
  const b = memory.ensure(O, C);
  const c = memory.ensure(O, U);
  same(new Set([a, b, c]).size, 3, "concrete values are distinct");

  const concreteDictionary = defineStructuralRoleDictionary(memory, []);
  const concreteTargetRule = defineStructuralRule(memory, concreteDictionary, c);
  const concreteTargetDR = defineStructuralDerivationRule(memory, concreteTargetRule, [a]);
  const concreteIdentity = memory.ensure(concreteTargetDR, theory);

  const concreteAssumption = memory.ensure(a, concreteIdentity);
  const concreteN1 = memory.ensure(
    b,
    memory.ensure(r1DR, materializeExactSequence(memory, [concreteAssumption])),
  );
  const concreteN2 = memory.ensure(
    c,
    memory.ensure(r2DR, materializeExactSequence(memory, [concreteN1])),
  );
  const concreteRoot = memory.ensure(concreteIdentity, concreteN2);

  assert(
    memory.find(theory, concreteTargetRule) === undefined,
    "concrete target Rule stays unadmitted by construction",
  );
  assert(
    memory.find(theory, concreteTargetDR) === undefined,
    "concrete target DR stays unadmitted by construction",
  );

  const rootedBefore = memory.linkCount;
  const rootedReplay = replayStructuralRootedProofAset(memory, concreteRoot);
  same(rootedReplay.theory, theory, "concrete exact Theory");
  same(rootedReplay.conclusion, c, "concrete rooted conclusion");
  same(rootedReplay.declaredAssumptionCount, 1, "one concrete target premise");
  same(rootedReplay.usedAssumptionCount, 1, "one concrete target premise used");
  same(memory.linkCount, rootedBefore, "concrete rooted replay is read-only");

  const before = memory.linkCount;
  const replay = replayStructuralHeterogeneousDerivedOpenRootedInstance(memory, {
    generic,
    concreteRoot,
  });
  same(replay.theory, theory, "instance exact Theory");
  same(replay.genericIdentity, genericIdentity, "instance exact generic identity");
  same(replay.concreteRoot, concreteRoot, "instance exact concrete root");
  same(replay.genericTargetOccurrence, genericN2, "instance exact generic target occurrence");
  same(replay.concreteTargetOccurrence, concreteN2, "instance exact concrete target occurrence");
  same(replay.globalRoleDictionary, globalDictionary, "instance exact global RoleDictionary");
  same(replay.bindings.length, 3, "complete global binding count");
  same(replay.bindings[0]?.role, A, "binding[0] Role A");
  same(replay.bindings[0]?.value, a, "binding[0] value a");
  same(replay.bindings[1]?.role, B, "binding[1] Role B");
  same(replay.bindings[1]?.value, b, "binding[1] value b");
  same(replay.bindings[2]?.role, CRole, "binding[2] Role C");
  same(replay.bindings[2]?.value, c, "binding[2] value c");
  same(memory.linkCount, before, "instance binding is read-only");

  const expanded = materializeHeterogeneousDerivedOpenRootedExpansion(memory, generic, [
    Object.freeze({ role: A, value: a }),
    Object.freeze({ role: B, value: b }),
    Object.freeze({ role: CRole, value: c }),
  ]);
  same(expanded.concreteRoot, concreteRoot, "constructor materializes canonical manual root");
  replayStructuralRootedProofAset(memory, expanded.concreteRoot);
  const expandedReplay = replayStructuralHeterogeneousDerivedOpenRootedInstance(memory, {
    generic,
    concreteRoot: expanded.concreteRoot,
  });
  same(expandedReplay.bindings[0]?.value, a, "expanded A binding");
  same(expandedReplay.bindings[1]?.value, b, "expanded B binding");
  same(expandedReplay.bindings[2]?.value, c, "expanded C binding");

  console.log("HETEROGENEOUS_GENERIC_OPEN_ROOTED_INSTANCE_BINDING = SUPPORTED");
  console.log("GLOBAL_ROLE_INSTANCE_OBSERVABILITY = SUPPORTED");
  console.log("EXPLICIT_RHO_AUTHORITY = NOT REQUIRED");
  console.log("CONSTRUCTION_ONLY_OPEN_ROOTED_EXPANSION = SUPPORTED");
  console.log("accepted semantic delta = NONE");
}

main();
