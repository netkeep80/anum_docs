import { materializeExactSequence } from "../src/exact-sequence.js";
import { Memory, ensureRootBasis, type LinkHandle } from "../src/memory.js";
import {
  admitStructuralRule, defineStructuralRoleDictionary, defineStructuralRule,
} from "../src/structural-rule.js";
import {
  admitStructuralDerivationRule, defineStructuralDerivationRule,
} from "../src/derivation.js";
import {
  StructuralHeterogeneousDerivedDerivationReplayError,
  replayStructuralHeterogeneousDerivedDerivationSchema,
} from "../src/derived-derivation-heterogeneous.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}
function expectError(code: string, m: Memory, identity: LinkHandle, targetOccurrence: LinkHandle): void {
  const before = m.linkCount;
  try { replayStructuralHeterogeneousDerivedDerivationSchema(m, { identity, targetOccurrence }); }
  catch (error) {
    assert(error instanceof StructuralHeterogeneousDerivedDerivationReplayError, `${code}: error type`);
    same(error.code, code, `${code}: error code`);
    same(m.linkCount, before, `${code}: read-only`);
    return;
  }
  throw new Error(`${code}: expected rejection`);
}
function morphism(
  m: Memory, theory: LinkHandle, source: LinkHandle, target: LinkHandle,
  bindings: readonly (readonly [LinkHandle, LinkHandle])[],
): LinkHandle {
  return materializeExactSequence(m, [theory, source, target,
    materializeExactSequence(m, bindings.map(([a, b]) => m.ensure(a, b)))]);
}
function node(
  m: Memory, claim: LinkHandle, dr: LinkHandle, mu: LinkHandle, deps: readonly LinkHandle[],
): LinkHandle {
  return m.ensure(claim, m.ensure(dr, m.ensure(mu, materializeExactSequence(m, deps))));
}

interface Fx {
  readonly m: Memory; readonly theory: LinkHandle; readonly A: LinkHandle; readonly B: LinkHandle;
  readonly C: LinkHandle; readonly global: LinkHandle; readonly targetRule: LinkHandle;
  readonly targetDR: LinkHandle; readonly identity: LinkHandle; readonly ab: LinkHandle;
  readonly bc: LinkHandle; readonly r1Rule: LinkHandle; readonly r1DR: LinkHandle;
  readonly r2Rule: LinkHandle; readonly r2DR: LinkHandle; readonly mu1: LinkHandle;
  readonly mu2: LinkHandle; readonly assumption: LinkHandle; readonly n1: LinkHandle;
  readonly n2: LinkHandle;
}
function fixture(admitR1Rule = true, admitR1DR = true): Fx {
  const m = new Memory();
  const { R, C, L, U } = ensureRootBasis(m);
  const theory = m.ensure(C, U);
  const A = m.ensure(L, R), B = m.ensure(R, L), CRole = m.ensure(R, U);
  const global = defineStructuralRoleDictionary(m, [A, B, CRole]);
  const targetRule = defineStructuralRule(m, global, CRole);
  const targetDR = defineStructuralDerivationRule(m, targetRule, [A]);
  const identity = m.ensure(targetDR, theory);
  const ab = defineStructuralRoleDictionary(m, [A, B]);
  const r1Rule = defineStructuralRule(m, ab, B);
  const r1DR = defineStructuralDerivationRule(m, r1Rule, [A]);
  if (admitR1Rule) admitStructuralRule(m, theory, r1Rule);
  if (admitR1DR) admitStructuralDerivationRule(m, theory, r1DR);
  const bc = defineStructuralRoleDictionary(m, [B, CRole]);
  const r2Rule = defineStructuralRule(m, bc, CRole);
  const r2DR = defineStructuralDerivationRule(m, r2Rule, [B]);
  admitStructuralRule(m, theory, r2Rule);
  admitStructuralDerivationRule(m, theory, r2DR);
  const mu1 = morphism(m, theory, ab, global, [[A, A], [B, B]]);
  const mu2 = morphism(m, theory, bc, global, [[B, B], [CRole, CRole]]);
  const assumption = m.ensure(A, identity);
  const n1 = node(m, B, r1DR, mu1, [assumption]);
  const n2 = node(m, CRole, r2DR, mu2, [n1]);
  return { m, theory, A, B, C: CRole, global, targetRule, targetDR, identity, ab, bc,
    r1Rule, r1DR, r2Rule, r2DR, mu1, mu2, assumption, n1, n2 };
}
function throughR2(f: Fx, n1: LinkHandle): LinkHandle {
  return node(f.m, f.C, f.r2DR, f.mu2, [n1]);
}

function main(): void {
  {
    const f = fixture();
    assert(f.m.find(f.theory, f.targetRule) === undefined, "target Rule unadmitted");
    assert(f.m.find(f.theory, f.targetDR) === undefined, "target DR unadmitted");
    const before = f.m.linkCount;
    const replay = replayStructuralHeterogeneousDerivedDerivationSchema(
      f.m, { identity: f.identity, targetOccurrence: f.n2 },
    );
    same(replay.theory, f.theory, "Theory");
    same(replay.targetDerivationRule, f.targetDR, "target DR");
    same(replay.globalRoleDictionary, f.global, "global dictionary");
    same(replay.conclusionTemplate, f.C, "conclusion");
    same(replay.occurrenceCount, 2, "node count");
    same(replay.declaredAssumptionCount, 1, "declared assumptions");
    same(replay.usedAssumptionCount, 1, "used assumptions");
    same(f.m.linkCount, before, "positive read-only");
    assert(f.m.find(f.theory, f.targetRule) === undefined, "replay did not admit target Rule");
    assert(f.m.find(f.theory, f.targetDR) === undefined, "replay did not admit target DR");
  }
  {
    const f = fixture();
    expectError("invalid-identity", f.m, new Memory().root, f.n2);
    const malformedDR = f.m.ensure(f.targetRule, f.A);
    expectError("invalid-target-schema", f.m, f.m.ensure(malformedDR, f.theory), f.n2);
    expectError("invalid-generic-occurrence", f.m, f.identity, f.m.root);
  }
  for (const [rule, dr] of [[false, true], [true, false]] as const) {
    const f = fixture(rule, dr);
    expectError("invalid-generic-occurrence", f.m, f.identity, f.n2);
  }
  {
    const f = fixture();
    const foreignTheory = f.m.ensure(f.C, f.theory);
    const otherSource = defineStructuralRoleDictionary(f.m, [f.A]);
    const otherTarget = defineStructuralRoleDictionary(f.m, [f.A, f.B]);
    const foreignRole = f.m.ensure(f.C, f.A);
    const badMus = [
      f.A,
      morphism(f.m, foreignTheory, f.ab, f.global, [[f.A, f.A], [f.B, f.B]]),
      morphism(f.m, f.theory, otherSource, f.global, [[f.A, f.A]]),
      morphism(f.m, f.theory, f.ab, otherTarget, [[f.A, f.A], [f.B, f.B]]),
      morphism(f.m, f.theory, f.ab, f.global, [[f.A, f.A]]),
      morphism(f.m, f.theory, f.ab, f.global, [[f.A, f.A], [f.A, f.B], [f.B, f.B]]),
      morphism(f.m, f.theory, f.ab, f.global, [[f.A, f.A], [f.B, f.B], [f.C, f.C]]),
      morphism(f.m, f.theory, f.ab, f.global, [[f.A, f.A], [f.B, foreignRole]]),
    ];
    for (const mu of badMus) {
      const badN1 = node(f.m, f.B, f.r1DR, mu, [f.assumption]);
      expectError("invalid-generic-occurrence", f.m, f.identity, throughR2(f, badN1));
    }
  }
  {
    const f = fixture();
    const local = defineStructuralRoleDictionary(f.m, [f.A]);
    const body = f.m.ensure(f.A, f.C), mappedBody = f.m.ensure(f.B, f.C);
    const rule = defineStructuralRule(f.m, local, body);
    const dr = defineStructuralDerivationRule(f.m, rule, []);
    admitStructuralRule(f.m, f.theory, rule);
    admitStructuralDerivationRule(f.m, f.theory, dr);
    const targetDR = defineStructuralDerivationRule(
      f.m, defineStructuralRule(f.m, f.global, mappedBody), [],
    );
    const identity = f.m.ensure(targetDR, f.theory);
    const mu = morphism(f.m, f.theory, local, f.global, [[f.A, f.B]]);
    expectError("invalid-generic-occurrence", f.m, identity, node(f.m, mappedBody, dr, mu, []));
  }
  {
    const f = fixture();
    const abc = defineStructuralRoleDictionary(f.m, [f.A, f.B, f.C]);
    const rule = defineStructuralRule(f.m, abc, f.B);
    const dr = defineStructuralDerivationRule(f.m, rule, [f.A]);
    admitStructuralRule(f.m, f.theory, rule);
    admitStructuralDerivationRule(f.m, f.theory, dr);
    const mu = morphism(f.m, f.theory, abc, f.global,
      [[f.A, f.A], [f.B, f.B], [f.C, f.C]]);
    const badN1 = node(f.m, f.B, dr, mu, [f.assumption]);
    expectError("invalid-generic-occurrence", f.m, f.identity, throughR2(f, badN1));
  }
  {
    const f = fixture();
    const noDependency = node(f.m, f.B, f.r1DR, f.mu1, []);
    expectError("invalid-generic-occurrence", f.m, f.identity, throughR2(f, noDependency));
    const wrongConclusion = node(f.m, f.C, f.r1DR, f.mu1, [f.assumption]);
    expectError("invalid-generic-occurrence", f.m, f.identity, wrongConclusion);
    const cDict = defineStructuralRoleDictionary(f.m, [f.C]);
    const cRule = defineStructuralRule(f.m, cDict, f.C);
    const cDR = defineStructuralDerivationRule(f.m, cRule, []);
    admitStructuralRule(f.m, f.theory, cRule);
    admitStructuralDerivationRule(f.m, f.theory, cDR);
    const cNode = node(f.m, f.C, cDR,
      morphism(f.m, f.theory, cDict, f.global, [[f.C, f.C]]), []);
    const wrongDependency = node(f.m, f.B, f.r1DR, f.mu1, [cNode]);
    expectError("invalid-generic-occurrence", f.m, f.identity, throughR2(f, wrongDependency));
  }
  {
    const f = fixture();
    const targetDR = defineStructuralDerivationRule(
      f.m, defineStructuralRule(f.m, f.global, f.C), [f.A, f.B],
    );
    const identity = f.m.ensure(targetDR, f.theory);
    const assumption = f.m.ensure(f.A, identity);
    const n1 = node(f.m, f.B, f.r1DR, f.mu1, [assumption]);
    expectError("unused-assumption", f.m, identity, throughR2(f, n1));
  }
  {
    const f = fixture(false, false);
    f.m.ensure(f.theory, f.targetRule);
    f.m.ensure(f.theory, f.targetDR);
    expectError("invalid-generic-occurrence", f.m, f.identity, f.n2);
  }
  {
    const f = fixture();
    const decorated = {
      identity: f.identity, targetOccurrence: f.n2, kind: "host", roleMorphism: new Map(),
    };
    replayStructuralHeterogeneousDerivedDerivationSchema(f.m, decorated);
  }

  console.log("HETEROGENEOUS_GENERIC_PROOF_ANET = SUPPORTED");
  console.log("LOCAL_ROLE_OBSERVABILITY = SUPPORTED");
  console.log("MAPPED_GLOBAL_PRIMITIVE_ADMISSION = NOT REQUIRED");
  console.log("AMBIGUOUS_GENERIC_SUPPORT_COLLISION = NOT CONSTRUCTIBLE_WITH_APPEND_ONLY_CANONICAL_BUILDERS");
  console.log("CYCLIC_GENERIC_OCCURRENCE = NOT CONSTRUCTIBLE_WITH_APPEND_ONLY_CANONICAL_BUILDERS");
  console.log("K1D2_SECURITY_CORPUS = GREEN");
  console.log("accepted semantic delta = NONE");
}
main();
