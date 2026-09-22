import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
  type RootBasis,
} from "../src/memory.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.13 A11a aspect application: ${message}`);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: values differ`);
}

/**
 * Research notation only.
 *
 * This helper adds NO semantic operation beyond ordinary Link construction.
 * It exists solely to test whether the intuitive notation F(A) can be read as
 * the already-existing Link F ⟼ A in ordinary non-self-referential cases.
 */
function structuralApplication(
  memory: Memory,
  fn: LinkHandle,
  argument: LinkHandle,
): LinkHandle {
  return memory.ensure(fn, argument);
}

function noise(memory: Memory, basis: RootBasis): void {
  const n0 = memory.ensure(basis.U, basis.L);
  const n1 = memory.ensure(n0, basis.U);
  memory.ensure(basis.L, n1);
}

function exercise(memory: Memory, addNoise: boolean): void {
  const basis = ensureRootBasis(memory);
  if (addNoise) noise(memory, basis);
  const { R, O, C, L, U } = basis;

  // Exact rooted-basis topology.
  const r = memory.poles(R);
  const o = memory.poles(O);
  const c = memory.poles(C);
  const l = memory.poles(L);
  const u = memory.poles(U);

  same(r.start, R, "R.start is R");
  same(r.end, R, "R.end is R");
  same(o.start, O, "O.start is O");
  same(o.end, R, "O.end is R");
  same(c.start, R, "C.start is R");
  same(c.end, C, "C.end is C");
  same(l.start, O, "L.start is O");
  same(l.end, C, "L.end is C");
  same(u.start, C, "U.start is C");
  same(u.end, O, "U.end is O");

  // Crucial A11a observation: the ordinary canonical two-pole constructor
  // already reuses all five existing basis Links for their exact pole pairs.
  // No Apply object/type/opcode is required to obtain these identities.
  same(structuralApplication(memory, R, R), R, "R = R(R)");
  same(structuralApplication(memory, O, R), O, "O = O(R)");
  same(structuralApplication(memory, R, C), C, "C = R(C)");
  same(structuralApplication(memory, O, C), L, "L = O(C)");
  same(structuralApplication(memory, C, O), U, "U = C(O)");

  // R is therefore an executable structural fixed point under the same ordinary
  // two-pole constructor used by non-degenerate Links.
  const beforeRootApply = memory.linkCount;
  same(structuralApplication(memory, R, R), R, "R(R) is canonically R");
  same(memory.linkCount, beforeRootApply, "R(R) allocates no extra application node");

  // No host arity metadata is needed for repeated ordinary continuation.
  // The previous result Link simply occupies the start/function pole of the
  // next Link. This tests structure only; it does not import lambda semantics.
  const a = memory.ensure(U, L);
  const b = memory.ensure(L, U);
  const cArg = memory.ensure(a, b);

  const f1 = structuralApplication(memory, R, a);
  const f2 = structuralApplication(memory, f1, b);
  const f3 = structuralApplication(memory, f2, cArg);

  const p1 = memory.poles(f1);
  const p2 = memory.poles(f2);
  const p3 = memory.poles(f3);

  same(p1.start, R, "F(a): start/function pole");
  same(p1.end, a, "F(a): argument pole");
  same(p2.start, f1, "F(a)(b): previous result becomes next start pole");
  same(p2.end, b, "F(a)(b): second argument pole");
  same(p3.start, f2, "F(a)(b)(c): previous result becomes next start pole");
  same(p3.end, cArg, "F(a)(b)(c): third argument pole");

  assert(f1 !== f2 && f2 !== f3 && f1 !== f3, "three continuation levels remain distinct Links");
}

function main(): void {
  // Two independent Memories, one with unrelated local allocation noise.
  exercise(new Memory(), false);
  exercise(new Memory(), true);

  // Cross-check the already merged F2a result without reimplementing its
  // bundle-valued rule engine here. A11a is only the structural foundation
  // candidate beneath that semantic experiment.
  const repoRoot = resolve(process.cwd(), "..");
  const projection = JSON.parse(
    readFileSync(
      join(repoRoot, "traceability/mts-v0.13-semantic-dependency-projection.json"),
      "utf8",
    ),
  );
  const f2a = projection.formalKernelAudit.genericExtensionF2a;
  same(f2a.status, "EXECUTED_GREEN_SCOPED_RESEARCH", "F2a remains executable evidence");
  same(f2a.observed.resultKind, "BundleValue", "F2a result remains bundle-valued");
  same(f2a.observed.singletonBundleEqualsLink, false, "singleton BundleValue remains distinct from Link");
  same(f2a.observed.hostFormSpecificBranches, 0, "F2a has no per-form semantic branches");

  const a11 = projection.formalKernelAudit.aspectApplicationA11;
  same(a11.status, "EXECUTED_GREEN_STRUCTURAL_CANDIDATE", "A11a classification");
  same(a11.observed.semanticClosureProven, false, "A11a does not overclaim semantic closure");
  same(a11.observed.hostArityMetadata, 0, "A11a uses no host arity metadata");

  console.log([
    "MTS v0.13 A11a:",
    "LINK_AS_APPLICATION=GREEN_STRUCTURAL_CANDIDATE",
    "R_EQ_R_OF_R=CONFIRMED",
    "O_EQ_O_OF_R=CONFIRMED",
    "C_EQ_R_OF_C=CONFIRMED",
    "L_EQ_O_OF_C=CONFIRMED",
    "U_EQ_C_OF_O=CONFIRMED",
    "LEFT_NESTED_CONTINUATION_DEPTH=3",
    "HOST_ARITY_METADATA=0",
    "F2A_BUNDLE_SEMANTICS=PRESERVED",
    "ASPECT_APPLICATION_SEMANTIC_CLOSURE=OPEN",
    "PRODUCTION_UNCHANGED",
  ].join(" "));
}

main();
