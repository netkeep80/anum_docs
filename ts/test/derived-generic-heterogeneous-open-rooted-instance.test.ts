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
import {
  StructuralHeterogeneousDerivedOpenRootedInstanceReplayError,
  replayStructuralHeterogeneousDerivedOpenRootedInstance,
} from "../src/derived-derivation-heterogeneous-instance.js";
import { replayStructuralRootedProofAset } from "../src/rooted-proof-aset.js";
import {
  StructuralSubstitutionError,
  inferStructuralSubstitution,
} from "../src/structural-substitution.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}

function expectInstanceError(code: string, effect: () => unknown): void {
  try {
    effect();
  } catch (error) {
    assert(error instanceof StructuralHeterogeneousDerivedOpenRootedInstanceReplayError, `${code}: wrong error type`);
    same(error.code, code, `${code}: wrong error code`);
    return;
  }
  throw new Error(`${code}: expected instance error`);
}

function expectSubstitutionError(code: string, effect: () => unknown): void {
  try {
    effect();
  } catch (error) {
    assert(error instanceof StructuralSubstitutionError, `${code}: wrong substitution error type`);
    same(error.code, code, `${code}: wrong substitution error code`);
    return;
  }
  throw new Error(`${code}: expected substitution error`);
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

  const mu1 = morphism(memory, theory, localAB, globalDictionary, [[A, A], [B, B]]);
  const mu2 = morphism(memory, theory, localBC, globalDictionary, [[B, B], [CRole, CRole]]);
  const genericAssumption = memory.ensure(A, genericIdentity);
  const genericN1 = memory.ensure(B, memory.ensure(r1DR, memory.ensure(mu1, materializeExactSequence(memory, [genericAssumption]))));
  const genericN2 = memory.ensure(CRole, memory.ensure(r2DR, memory.ensure(mu2, materializeExactSequence(memory, [genericN1]))));
  const generic: StructuralHeterogeneousDerivedDerivationEvidence = Object.freeze({ identity: genericIdentity, targetOccurrence: genericN2 });

  const genericBefore = memory.linkCount;
  const genericReplay = replayStructuralHeterogeneousDerivedDerivationSchema(memory, generic);
  same(genericReplay.theory, theory, "generic exact Theory");
  same(genericReplay.globalRoleDictionary, globalDictionary, "generic exact RoleDictionary");
  same(memory.linkCount, genericBefore, "generic replay is read-only");

  const a = memory.ensure(O, R);
  const b = memory.ensure(O, C);
  const c = memory.ensure(O, U);
  const concreteDictionary = defineStructuralRoleDictionary(memory, []);
  const concreteTargetRule = defineStructuralRule(memory, concreteDictionary, c);
  const concreteTargetDR = defineStructuralDerivationRule(memory, concreteTargetRule, [a]);
  const concreteIdentity = memory.ensure(concreteTargetDR, theory);
  const concreteAssumption = memory.ensure(a, concreteIdentity);
  const concreteN1 = memory.ensure(b, memory.ensure(r1DR, materializeExactSequence(memory, [concreteAssumption])));
  const concreteN2 = memory.ensure(c, memory.ensure(r2DR, materializeExactSequence(memory, [concreteN1])));
  const concreteRoot = memory.ensure(concreteIdentity, concreteN2);

  assert(memory.find(theory, concreteTargetRule) === undefined, "constructor-free target Rule starts unadmitted");
  assert(memory.find(theory, concreteTargetDR) === undefined, "constructor-free target DR starts unadmitted");
  const rootedBefore = memory.linkCount;
  const rootedReplay = replayStructuralRootedProofAset(memory, concreteRoot);
  same(rootedReplay.conclusion, c, "concrete rooted conclusion");
  same(memory.linkCount, rootedBefore, "concrete rooted replay is read-only");

  const before = memory.linkCount;
  const replay = replayStructuralHeterogeneousDerivedOpenRootedInstance(memory, { generic, concreteRoot });
  same(replay.theory, theory, "instance exact Theory");
  same(replay.bindings.length, 3, "complete global binding count");
  same(replay.bindings[0]?.role, A, "binding order A");
  same(replay.bindings[0]?.value, a, "binding A=a");
  same(replay.bindings[1]?.role, B, "binding order B");
  same(replay.bindings[1]?.value, b, "binding B=b");
  same(replay.bindings[2]?.role, CRole, "binding order C");
  same(replay.bindings[2]?.value, c, "binding C=c");
  same(memory.linkCount, before, "instance binding is read-only");

  const expanded = materializeHeterogeneousDerivedOpenRootedExpansion(memory, generic, [
    { role: A, value: a }, { role: B, value: b }, { role: CRole, value: c },
  ]);
  same(expanded.concreteRoot, concreteRoot, "constructor materializes canonical manual root");
  replayStructuralRootedProofAset(memory, expanded.concreteRoot);
  replayStructuralHeterogeneousDerivedOpenRootedInstance(memory, { generic, concreteRoot: expanded.concreteRoot });

  // Shared substitution law: cumulative, ordered, complete, and no role-valued veto.
  const ordered = inferStructuralSubstitution(memory, [B, A], [{ template: A, actual: a }, { template: B, actual: b }]);
  same(ordered[0]?.role, B, "substitution declaration order B");
  same(ordered[0]?.value, b, "substitution B=b");
  same(ordered[1]?.role, A, "substitution declaration order A");
  inferStructuralSubstitution(memory, [A], [{ template: A, actual: a }, { template: A, actual: a }]);
  expectSubstitutionError("template-mismatch", () =>
    inferStructuralSubstitution(memory, [A], [{ template: A, actual: a }, { template: A, actual: b }]),
  );
  expectSubstitutionError("missing-role-binding", () => inferStructuralSubstitution(memory, [A, B], [{ template: A, actual: a }]));
  same(inferStructuralSubstitution(memory, [A], [{ template: A, actual: B }])[0]?.value, B, "Role Link may be a concrete value");

  expectInstanceError("invalid-generic-certificate", () =>
    replayStructuralHeterogeneousDerivedOpenRootedInstance(memory, { generic: { ...generic, targetOccurrence: memory.root }, concreteRoot }),
  );
  expectInstanceError("invalid-concrete-rooted-proof", () =>
    replayStructuralHeterogeneousDerivedOpenRootedInstance(memory, { generic, concreteRoot: memory.root }),
  );

  // K1 may accept a still-generic target coordinate; K1d3 must reject it as non-concrete.
  const nonConcreteDictionary = defineStructuralRoleDictionary(memory, [A]);
  const nonConcreteTargetRule = defineStructuralRule(memory, nonConcreteDictionary, c);
  const nonConcreteTargetDR = defineStructuralDerivationRule(memory, nonConcreteTargetRule, [a]);
  const nonConcreteIdentity = memory.ensure(nonConcreteTargetDR, theory);
  const nonConcreteAssumption = memory.ensure(a, nonConcreteIdentity);
  const nonConcreteN1 = memory.ensure(b, memory.ensure(r1DR, materializeExactSequence(memory, [nonConcreteAssumption])));
  const nonConcreteN2 = memory.ensure(c, memory.ensure(r2DR, materializeExactSequence(memory, [nonConcreteN1])));
  const nonConcreteRoot = memory.ensure(nonConcreteIdentity, nonConcreteN2);
  replayStructuralRootedProofAset(memory, nonConcreteRoot);
  expectInstanceError("non-concrete-target", () => replayStructuralHeterogeneousDerivedOpenRootedInstance(memory, { generic, concreteRoot: nonConcreteRoot }));

  // Same target theorem through a different valid primitive path is not this certificate's expansion.
  const D = memory.ensure(C, L);
  const altDictionary = defineStructuralRoleDictionary(memory, [A, D]);
  const altRule = defineStructuralRule(memory, altDictionary, D);
  const altDR = defineStructuralDerivationRule(memory, altRule, [A]);
  admitStructuralRule(memory, theory, altRule);
  admitStructuralDerivationRule(memory, theory, altDR);
  const altN1 = memory.ensure(b, memory.ensure(altDR, materializeExactSequence(memory, [concreteAssumption])));
  const altN2 = memory.ensure(c, memory.ensure(r2DR, materializeExactSequence(memory, [altN1])));
  const altRoot = memory.ensure(concreteIdentity, altN2);
  replayStructuralRootedProofAset(memory, altRoot);
  expectInstanceError("derivation-rule-mismatch", () => replayStructuralHeterogeneousDerivedOpenRootedInstance(memory, { generic, concreteRoot: altRoot }));

  // A global Role nowhere evidenced by target or reachable primitive expansion stays unobservable.
  const V = memory.ensure(U, L);
  const vacuousDictionary = defineStructuralRoleDictionary(memory, [A, B, CRole, V]);
  const vacuousTargetRule = defineStructuralRule(memory, vacuousDictionary, CRole);
  const vacuousTargetDR = defineStructuralDerivationRule(memory, vacuousTargetRule, [A]);
  const vacuousIdentity = memory.ensure(vacuousTargetDR, theory);
  const vacuousMu1 = morphism(memory, theory, localAB, vacuousDictionary, [[A, A], [B, B]]);
  const vacuousMu2 = morphism(memory, theory, localBC, vacuousDictionary, [[B, B], [CRole, CRole]]);
  const vacuousA = memory.ensure(A, vacuousIdentity);
  const vacuousN1 = memory.ensure(B, memory.ensure(r1DR, memory.ensure(vacuousMu1, materializeExactSequence(memory, [vacuousA]))));
  const vacuousN2 = memory.ensure(CRole, memory.ensure(r2DR, memory.ensure(vacuousMu2, materializeExactSequence(memory, [vacuousN1]))));
  const vacuousGeneric = { identity: vacuousIdentity, targetOccurrence: vacuousN2 };
  replayStructuralHeterogeneousDerivedDerivationSchema(memory, vacuousGeneric);
  expectInstanceError("global-role-not-observable", () => replayStructuralHeterogeneousDerivedOpenRootedInstance(memory, { generic: vacuousGeneric, concreteRoot }));

  // Role-handle-as-value remains legal at the construction boundary and trusted replay.
  const roleValued = materializeHeterogeneousDerivedOpenRootedExpansion(memory, generic, [
    { role: A, value: B }, { role: B, value: b }, { role: CRole, value: c },
  ]);
  replayStructuralRootedProofAset(memory, roleValued.concreteRoot);
  same(replayStructuralHeterogeneousDerivedOpenRootedInstance(memory, { generic, concreteRoot: roleValued.concreteRoot }).bindings[0]?.value, B, "role-valued concrete A");

  // Non-injective mu: equal lifted values accept; unequal values reject as one inconsistent global instance.
  const K1 = memory.ensureStartSelfClosed(O);
  const K2 = memory.ensureEndSelfClosed(C);
  const G = memory.ensure(L, O);
  const H = memory.ensure(U, O);
  const X = memory.ensure(C, R);
  const Y = memory.ensure(U, R);
  const Z = memory.ensure(L, C);
  const niGlobal = defineStructuralRoleDictionary(memory, [G, H]);
  const gp1 = memory.ensure(K1, G);
  const gp2 = memory.ensure(K2, G);
  const niTargetRule = defineStructuralRule(memory, niGlobal, H);
  const niTargetDR = defineStructuralDerivationRule(memory, niTargetRule, [gp1, gp2]);
  const niIdentity = memory.ensure(niTargetDR, theory);
  const niLocal = defineStructuralRoleDictionary(memory, [X, Y, Z]);
  const lp1 = memory.ensure(K1, X);
  const lp2 = memory.ensure(K2, Y);
  const niRule = defineStructuralRule(memory, niLocal, Z);
  const niDR = defineStructuralDerivationRule(memory, niRule, [lp1, lp2]);
  admitStructuralRule(memory, theory, niRule);
  admitStructuralDerivationRule(memory, theory, niDR);
  const niMu = morphism(memory, theory, niLocal, niGlobal, [[X, G], [Y, G], [Z, H]]);
  const niA1 = memory.ensure(gp1, niIdentity);
  const niA2 = memory.ensure(gp2, niIdentity);
  const niNode = memory.ensure(H, memory.ensure(niDR, memory.ensure(niMu, materializeExactSequence(memory, [niA1, niA2]))));
  const niGeneric = { identity: niIdentity, targetOccurrence: niNode };
  replayStructuralHeterogeneousDerivedDerivationSchema(memory, niGeneric);
  const x = memory.ensure(C, O);
  const z = memory.ensure(U, C);
  const niEqual = materializeHeterogeneousDerivedOpenRootedExpansion(memory, niGeneric, [{ role: G, value: x }, { role: H, value: z }]);
  replayStructuralRootedProofAset(memory, niEqual.concreteRoot);
  replayStructuralHeterogeneousDerivedOpenRootedInstance(memory, { generic: niGeneric, concreteRoot: niEqual.concreteRoot });
  const y = memory.ensure(U, L);
  const p1x = memory.ensure(K1, x);
  const p2y = memory.ensure(K2, y);
  const niConcreteDictionary = defineStructuralRoleDictionary(memory, []);
  const niConcreteRule = defineStructuralRule(memory, niConcreteDictionary, z);
  const niConcreteDR = defineStructuralDerivationRule(memory, niConcreteRule, [p1x, p2y]);
  const niConcreteIdentity = memory.ensure(niConcreteDR, theory);
  const niH1 = memory.ensure(p1x, niConcreteIdentity);
  const niH2 = memory.ensure(p2y, niConcreteIdentity);
  const niConcreteNode = memory.ensure(z, memory.ensure(niDR, materializeExactSequence(memory, [niH1, niH2])));
  const niUnequalRoot = memory.ensure(niConcreteIdentity, niConcreteNode);
  replayStructuralRootedProofAset(memory, niUnequalRoot);
  expectInstanceError("inconsistent-instance", () => replayStructuralHeterogeneousDerivedOpenRootedInstance(memory, { generic: niGeneric, concreteRoot: niUnequalRoot }));

  // Two distinct generic premise positions may canonically ground to one concrete assumption occurrence.
  const collapseMemory = new Memory();
  const basis = ensureRootBasis(collapseMemory);
  const collapseTheory = collapseMemory.ensure(basis.C, basis.U);
  const A2 = collapseMemory.ensure(basis.L, basis.R);
  const B2 = collapseMemory.ensure(basis.R, basis.L);
  const C2 = collapseMemory.ensure(basis.R, basis.U);
  const X2 = collapseMemory.ensure(basis.C, basis.R);
  const Y2 = collapseMemory.ensure(basis.U, basis.R);
  const Z2 = collapseMemory.ensure(basis.L, basis.C);
  const dg = defineStructuralRoleDictionary(collapseMemory, [A2, B2, C2]);
  const targetR = defineStructuralRule(collapseMemory, dg, C2);
  const targetD = defineStructuralDerivationRule(collapseMemory, targetR, [A2, B2]);
  const targetI = collapseMemory.ensure(targetD, collapseTheory);
  const dl = defineStructuralRoleDictionary(collapseMemory, [X2, Y2, Z2]);
  const primitiveR = defineStructuralRule(collapseMemory, dl, Z2);
  const primitiveD = defineStructuralDerivationRule(collapseMemory, primitiveR, [X2, Y2]);
  admitStructuralRule(collapseMemory, collapseTheory, primitiveR);
  admitStructuralDerivationRule(collapseMemory, collapseTheory, primitiveD);
  const mu = morphism(collapseMemory, collapseTheory, dl, dg, [[X2, A2], [Y2, B2], [Z2, C2]]);
  const hA = collapseMemory.ensure(A2, targetI);
  const hB = collapseMemory.ensure(B2, targetI);
  const gNode = collapseMemory.ensure(C2, collapseMemory.ensure(primitiveD, collapseMemory.ensure(mu, materializeExactSequence(collapseMemory, [hA, hB]))));
  const collapseGeneric = { identity: targetI, targetOccurrence: gNode };
  const xv = collapseMemory.ensure(basis.O, basis.R);
  const zv = collapseMemory.ensure(basis.O, basis.U);
  const collapseRoot = materializeHeterogeneousDerivedOpenRootedExpansion(collapseMemory, collapseGeneric, [
    { role: A2, value: xv }, { role: B2, value: xv }, { role: C2, value: zv },
  ]).concreteRoot;
  const collapseReplay = replayStructuralHeterogeneousDerivedOpenRootedInstance(collapseMemory, { generic: collapseGeneric, concreteRoot: collapseRoot });
  same(collapseReplay.bindings[0]?.value, xv, "collapsed A2=x");
  same(collapseReplay.bindings[1]?.value, xv, "collapsed B2=x");
  same(collapseReplay.pairedOccurrenceCount, 3, "two generic assumptions + node remain three generic occurrences");

  // Unreachable rho-like data and ambient target admissions grant no authority and do not perturb validity.
  materializeExactSequence(memory, [memory.ensure(A, a), memory.ensure(B, b), memory.ensure(CRole, c)]);
  admitStructuralRule(memory, theory, concreteTargetRule);
  admitStructuralDerivationRule(memory, theory, concreteTargetDR);
  const afterDecoration = replayStructuralHeterogeneousDerivedOpenRootedInstance(memory, { generic, concreteRoot });
  same(afterDecoration.bindings[0]?.value, a, "ambient/unreachable decoration leaves A unchanged");
  same(afterDecoration.bindings[1]?.value, b, "ambient/unreachable decoration leaves B unchanged");
  same(afterDecoration.bindings[2]?.value, c, "ambient/unreachable decoration leaves C unchanged");

  console.log("HETEROGENEOUS_GENERIC_OPEN_ROOTED_INSTANCE_BINDING = SUPPORTED");
  console.log("GLOBAL_ROLE_INSTANCE_OBSERVABILITY = SUPPORTED");
  console.log("EXPLICIT_RHO_AUTHORITY = NOT REQUIRED");
  console.log("CONSTRUCTION_ONLY_OPEN_ROOTED_EXPANSION = SUPPORTED");
  console.log("FUNCTIONAL_GENERIC_TO_CONCRETE_COLLAPSE = SUPPORTED");
  console.log("ROOTED_K1_SEMANTICS = UNCHANGED");
  console.log("K1D3_SECURITY_CORPUS = GREEN");
  console.log("accepted semantic delta = NONE");
}

main();
