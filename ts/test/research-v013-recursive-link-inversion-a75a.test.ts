import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import {
  decomposeV013SemanticLink,
  materializeV013HierarchicalCarrierFromSemanticLink,
  serializeV013HierarchicalCarrier,
} from "../src/v013-hierarchical-carrier.js";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
  type RootBasis,
} from "../src/memory.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.13 A75a recursive Link inversion: ${message}`);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: values differ`);
}

function distinct(left: LinkHandle, right: LinkHandle, message: string): void {
  assert(left !== right, message);
}

type Aspect = "ROOT" | "START" | "END" | "PAIR";

const invertedAspect: Readonly<Record<Aspect, Aspect>> = Object.freeze({
  ROOT: "ROOT",
  START: "END",
  END: "START",
  PAIR: "PAIR",
});

/**
 * Executable witness for the mathematical definition
 *
 *   J(A ⟼ B) = J(B) ⟼ J(A)
 *
 * on the accepted finite v0.13 semantic carrier. Self-incidence is handled by
 * the accepted structural decomposition, so a self pole is never recursively
 * traversed as a child.
 */
function invertLink(
  memory: Memory,
  basis: RootBasis,
  source: LinkHandle,
  memo = new Map<LinkHandle, LinkHandle>(),
): LinkHandle {
  const known = memo.get(source);
  if (known !== undefined) return known;

  const decomposition = decomposeV013SemanticLink(memory, basis, source);
  let result: LinkHandle;

  if (decomposition.aspect === "ROOT") {
    result = basis.R;
  } else if (decomposition.aspect === "START") {
    result = memory.ensureEndSelfClosed(
      invertLink(memory, basis, decomposition.children[0]!, memo),
    );
  } else if (decomposition.aspect === "END") {
    result = memory.ensureStartSelfClosed(
      invertLink(memory, basis, decomposition.children[0]!, memo),
    );
  } else {
    const left = invertLink(memory, basis, decomposition.children[0]!, memo);
    const right = invertLink(memory, basis, decomposition.children[1]!, memo);
    result = memory.ensure(right, left);
  }

  memo.set(source, result);
  return result;
}

function canonicalWire(
  memory: Memory,
  basis: RootBasis,
  semantic: LinkHandle,
): string {
  const carrier = materializeV013HierarchicalCarrierFromSemanticLink(
    memory,
    basis,
    semantic,
  );
  return String.fromCharCode(
    ...serializeV013HierarchicalCarrier(memory, basis, carrier),
  );
}

/**
 * Independent recursive spelling of the same inversion over the canonical
 * 8/9/6/1 carrier. It is evidence about the representation, not authority for
 * the semantic Link inversion above.
 */
function invertWire(source: string): string {
  let offset = 0;

  const visit = (): string => {
    const opcode = source[offset++];
    if (opcode === undefined) {
      throw new Error("v0.13 A75a recursive Link inversion: truncated wire");
    }
    if (opcode === "8") return "8";
    if (opcode === "9") return `6${visit()}`;
    if (opcode === "6") return `9${visit()}`;
    if (opcode === "1") {
      const left = visit();
      const right = visit();
      return `1${right}${left}`;
    }
    throw new Error(
      `v0.13 A75a recursive Link inversion: invalid wire opcode ${opcode}`,
    );
  };

  const result = visit();
  assert(offset === source.length, "wire inversion consumes the whole source");
  return result;
}

interface Fixture {
  readonly basis: RootBasis;
  readonly samples: readonly LinkHandle[];
  readonly X: LinkHandle;
  readonly startX: LinkHandle;
  readonly endX: LinkHandle;
}

function fixture(memory: Memory, noise: boolean): Fixture {
  const basis = ensureRootBasis(memory);

  if (noise) {
    const n1 = memory.ensure(basis.U, basis.L);
    const n2 = memory.ensure(basis.C, n1);
    memory.ensure(n2, basis.O);
  }

  const X = memory.ensure(basis.L, basis.U);
  const Y = memory.ensure(basis.C, basis.L);
  const Z = memory.ensure(basis.U, basis.C);

  const startX = memory.ensureStartSelfClosed(X);
  const endX = memory.ensureEndSelfClosed(X);
  const startY = memory.ensureStartSelfClosed(Y);
  const endZ = memory.ensureEndSelfClosed(Z);

  const pair = memory.ensure(startY, endZ);
  const nested = memory.ensure(
    memory.ensureStartSelfClosed(pair),
    memory.ensureEndSelfClosed(memory.ensure(endX, startX)),
  );

  return Object.freeze({
    basis,
    X,
    startX,
    endX,
    samples: Object.freeze([
      basis.R,
      basis.O,
      basis.C,
      basis.L,
      basis.U,
      X,
      Y,
      Z,
      startX,
      endX,
      startY,
      endZ,
      pair,
      nested,
    ]),
  });
}

function verifyStructuralDefinition(
  memory: Memory,
  basis: RootBasis,
  source: LinkHandle,
): void {
  const decomposition = decomposeV013SemanticLink(memory, basis, source);
  const inverted = invertLink(memory, basis, source);

  same(
    decomposeV013SemanticLink(memory, basis, inverted).aspect,
    invertedAspect[decomposition.aspect],
    `${decomposition.aspect} maps to its structural inverse class`,
  );

  if (decomposition.aspect === "ROOT") {
    same(inverted, basis.R, "ROOT is fixed");
    return;
  }

  if (decomposition.aspect === "START") {
    const child = invertLink(memory, basis, decomposition.children[0]!);
    same(
      inverted,
      memory.ensureEndSelfClosed(child),
      "START(X) maps exactly to END(J(X))",
    );
    return;
  }

  if (decomposition.aspect === "END") {
    const child = invertLink(memory, basis, decomposition.children[0]!);
    same(
      inverted,
      memory.ensureStartSelfClosed(child),
      "END(X) maps exactly to START(J(X))",
    );
    return;
  }

  const left = invertLink(memory, basis, decomposition.children[0]!);
  const right = invertLink(memory, basis, decomposition.children[1]!);
  same(
    inverted,
    memory.ensure(right, left),
    "PAIR(A,B) maps exactly to PAIR(J(B),J(A))",
  );
}

function exercise(noise: boolean): readonly string[] {
  const memory = new Memory();
  const { basis, samples, X, startX, endX } = fixture(memory, noise);

  // Exact root-basis image follows from recursive Link inversion.
  same(invertLink(memory, basis, basis.R), basis.R, "J(R)=R");
  same(invertLink(memory, basis, basis.O), basis.C, "J(O)=C");
  same(invertLink(memory, basis, basis.C), basis.O, "J(C)=O");
  same(invertLink(memory, basis, basis.L), basis.L, "J(L)=L");
  same(invertLink(memory, basis, basis.U), basis.U, "J(U)=U");

  // Proper START and END remain distinct while changing orientation.
  same(
    decomposeV013SemanticLink(memory, basis, invertLink(memory, basis, startX)).aspect,
    "END",
    "proper START maps to proper END",
  );
  same(
    decomposeV013SemanticLink(memory, basis, invertLink(memory, basis, endX)).aspect,
    "START",
    "proper END maps to proper START",
  );
  distinct(startX, endX, "START(X) and END(X) are structurally distinct");
  distinct(
    invertLink(memory, basis, startX),
    invertLink(memory, basis, endX),
    "recursive inversion does not collapse opposite orientations",
  );

  const fingerprints: string[] = [];

  for (const source of samples) {
    verifyStructuralDefinition(memory, basis, source);

    const inverted = invertLink(memory, basis, source);
    const restored = invertLink(memory, basis, inverted);
    same(restored, source, "J(J(X)) returns exact canonical Link identity");

    const wire = canonicalWire(memory, basis, source);
    const invertedWire = canonicalWire(memory, basis, inverted);
    same(
      invertedWire,
      invertWire(wire),
      "canonical anum wire is the recursive image of semantic inversion",
    );
    same(invertWire(invertWire(wire)), wire, "wire inversion is involutive");

    fingerprints.push(`${wire}->${invertedWire}`);
  }

  // Repeating J after all images exist is allocation-stable.
  const beforeRepeat = memory.linkCount;
  for (const source of samples) invertLink(memory, basis, source);
  same(memory.linkCount, beforeRepeat, "repeated inversion adds no semantic Links");

  // Explicit non-basis chiral witness.
  const jX = invertLink(memory, basis, X);
  same(
    canonicalWire(memory, basis, memory.ensureStartSelfClosed(X)),
    `9${canonicalWire(memory, basis, X)}`,
    "START canonical carrier is recursive",
  );
  same(
    canonicalWire(memory, basis, invertLink(memory, basis, memory.ensureStartSelfClosed(X))),
    `6${canonicalWire(memory, basis, jX)}`,
    "inverted START canonical carrier is END of recursively inverted child",
  );

  return Object.freeze(fingerprints);
}

function staticGuards(): void {
  const root = resolve(process.cwd(), "..");
  const own = readFileSync(
    join(root, "ts/test/research-v013-recursive-link-inversion-a75a.test.ts"),
    "utf8",
  );

  const semantic = own.slice(
    own.indexOf("function invertLink("),
    own.indexOf("\nfunction canonicalWire("),
  );

  for (const forbidden of [
    ".poles(",
    ".outgoing(",
    ".incoming(",
    "graph",
    '"8"',
    '"9"',
    '"6"',
    '"1"',
  ]) {
    assert(
      !semantic.includes(forbidden),
      `semantic inversion excludes representation/adjacency shortcut: ${forbidden}`,
    );
  }
}

function main(): void {
  const clean = exercise(false);
  const renamed = exercise(true);

  same(
    JSON.stringify(renamed),
    JSON.stringify(clean),
    "inversion fingerprints survive independent allocation noise",
  );

  console.log([
    "MTS v0.13 A75a: RECURSIVE_LINK_INVERSION=GREEN_SCOPED_RESEARCH",
    "INV_01_LINK_RECURSION=EXECUTABLE_WITNESS",
    "INV_02_INVOLUTION=CONFIRMED_ON_ACCEPTED_FINITE_CARRIER",
    "INV_03_ROOT=FIXED",
    "INV_04_START_END=EXCHANGED_NOT_COLLAPSED",
    "INV_05_PAIR=RECURSIVE_POLE_REVERSAL",
    "INV_06_ROOT_BASIS=R_FIXED_O_C_EXCHANGED_L_FIXED_U_FIXED",
    "INV_07_CHIRALITY=PRESERVED_UNDER_ORIENTATION_REVERSAL",
    "ANUM_INVERSION=8_FIXED_9_6_EXCHANGED_PAIR_CHILDREN_REVERSED",
    "ADDRESS_RENAMING=INVARIANT",
    "GRAPH_SEMANTIC_AUTHORITY=NONE",
    "FULL_MTS_AUTOMORPHISM=NOT_YET_CLASSIFIED",
  ].join(" "));
}

main();
