import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { exportCanonicalTopology } from "../src/canonical-topology.js";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
  type ReadMemory,
  type RootBasis,
} from "../src/memory.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.13 A14 root asymmetry/chirality: ${message}`);
}
function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: values differ`);
}
function exactJson(actual: unknown, expected: unknown, message: string): void {
  same(JSON.stringify(actual), JSON.stringify(expected), message);
}

type Bit = "0" | "1";
type Mask = `${Bit}${Bit}`;

function selfIncidenceMask(memory: ReadMemory, link: LinkHandle): Mask {
  const poles = memory.poles(link);
  const start: Bit = poles.start === link ? "1" : "0";
  const end: Bit = poles.end === link ? "1" : "0";
  return `${start}${end}`;
}

function assertQuartet(
  memory: ReadMemory,
  quartet: readonly LinkHandle[],
  message: string,
): void {
  const masks = quartet.map((link) => selfIncidenceMask(memory, link));
  same(new Set(masks).size, 4, `${message}: four distinct structural classes`);
  const expected = new Set<Mask>(["11", "10", "01", "00"]);
  for (const mask of masks) {
    assert(expected.has(mask), `${message}: unexpected self-incidence mask ${mask}`);
  }
}

interface Orientation {
  readonly from: LinkHandle;
  readonly to: LinkHandle;
  readonly method: LinkHandle;
  readonly inverse: LinkHandle;
}

function orientation(
  memory: ReadMemory,
  from: LinkHandle,
  to: LinkHandle,
): Orientation {
  assert(from !== to, "orientation requires two distinct boundary roles");
  const method = memory.find(from, to);
  const inverse = memory.find(to, from);
  assert(method !== undefined, "selected orientation Link exists");
  assert(inverse !== undefined, "inverse orientation Link exists");
  assert(method !== inverse, "direct and inverse orientation Links remain distinct");
  return Object.freeze({ from, to, method, inverse });
}

type BasisSymbol = "R" | "O" | "C" | "L" | "U";
interface Equation {
  readonly result: BasisSymbol;
  readonly start: BasisSymbol;
  readonly end: BasisSymbol;
}

const symbols: readonly BasisSymbol[] = Object.freeze(["R", "O", "C", "L", "U"]);
const rootEquations: readonly Equation[] = Object.freeze([
  Object.freeze({ result: "R", start: "R", end: "R" }),
  Object.freeze({ result: "O", start: "O", end: "R" }),
  Object.freeze({ result: "C", start: "R", end: "C" }),
  Object.freeze({ result: "L", start: "O", end: "C" }),
  Object.freeze({ result: "U", start: "C", end: "O" }),
]);

class UnionFind {
  private readonly parent = new Map<BasisSymbol, BasisSymbol>(
    symbols.map((x) => [x, x] as const),
  );

  find(x: BasisSymbol): BasisSymbol {
    const p = this.parent.get(x);
    assert(p !== undefined, "union-find symbol exists");
    if (p === x) return x;
    const root = this.find(p);
    this.parent.set(x, root);
    return root;
  }

  same(a: BasisSymbol, b: BasisSymbol): boolean {
    return this.find(a) === this.find(b);
  }

  union(a: BasisSymbol, b: BasisSymbol): boolean {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra === rb) return false;
    this.parent.set(rb, ra);
    return true;
  }

  classCount(): number {
    return new Set(symbols.map((x) => this.find(x))).size;
  }
}

/**
 * Small finite congruence closure for the root equations.
 *
 * Two structural properties are used and neither is a new MTS law:
 *
 * 1. canonical pair identity:
 *      equal start/end roles imply the same Link;
 * 2. exact Link poles:
 *      if two result identities are identified, their start/end roles
 *      must also be identified.
 *
 * This is exactly the identity discipline already implemented by Memory:
 * one canonical Link per ordered pair and one exact pair of poles per Link.
 */
function closeRootQuotient(
  initialEqualities: readonly (readonly [BasisSymbol, BasisSymbol])[],
): UnionFind {
  const uf = new UnionFind();
  for (const [left, right] of initialEqualities) uf.union(left, right);

  let changed = true;
  while (changed) {
    changed = false;

    for (let i = 0; i < rootEquations.length; i += 1) {
      const a = rootEquations[i]!;
      for (let j = i + 1; j < rootEquations.length; j += 1) {
        const b = rootEquations[j]!;

        // Same Link identity has one exact ordered pair of poles.
        if (uf.same(a.result, b.result)) {
          changed = uf.union(a.start, b.start) || changed;
          changed = uf.union(a.end, b.end) || changed;
        }

        // Canonical ordered pair has one exact Link identity.
        if (uf.same(a.start, b.start) && uf.same(a.end, b.end)) {
          changed = uf.union(a.result, b.result) || changed;
        }
      }
    }
  }

  return uf;
}

function exercise(memory: Memory): void {
  const basis: RootBasis = ensureRootBasis(memory);

  // Exact root equations.
  same(memory.find(basis.R, basis.R), basis.R, "R = R->R");
  same(memory.find(basis.O, basis.R), basis.O, "O = O->R");
  same(memory.find(basis.R, basis.C), basis.C, "C = R->C");
  same(memory.find(basis.O, basis.C), basis.L, "L = O->C");
  same(memory.find(basis.C, basis.O), basis.U, "U = C->O");

  // Both possible choices of cross-link preserve the same four structural
  // self-incidence classes. Changing direction changes chirality, not the
  // existence of orientation/asymmetry.
  assertQuartet(
    memory,
    Object.freeze([basis.R, basis.O, basis.C, basis.L]),
    "direct chirality",
  );
  assertQuartet(
    memory,
    Object.freeze([basis.R, basis.C, basis.O, basis.U]),
    "mirror chirality",
  );

  const direct = orientation(memory, basis.O, basis.C);
  const mirror = orientation(memory, basis.C, basis.O);
  same(direct.method, basis.L, "direct selected method is L");
  same(direct.inverse, basis.U, "direct inverse is U");
  same(mirror.method, basis.U, "mirror selected method is U");
  same(mirror.inverse, basis.L, "mirror inverse is L");

  // The two one-sided root forms are structurally different without consulting
  // ROOT/START/END/PAIR host tags.
  same(selfIncidenceMask(memory, basis.O), "10", "first one-sided form");
  same(selfIncidenceMask(memory, basis.C), "01", "second one-sided form");
  assert(basis.O !== basis.C, "one-sided boundary roles are distinct");

  // Baseline root algebra is non-degenerate.
  same(closeRootQuotient([]).classCount(), 5, "unquotiented root basis has five exact Links");

  // Erasing the boundary-role asymmetry forces total collapse:
  //
  // O=C=X combines X=X->R and X=R->X. Exact poles force X=R.
  // Then L=O->C and U=C->O both reduce to R->R=R.
  const eraseBoundary = closeRootQuotient([["O", "C"]]);
  same(eraseBoundary.classCount(), 1, "O=C forces universal root collapse");
  for (const x of symbols) {
    assert(eraseBoundary.same("R", x), `O=C collapse reaches ${x}`);
  }

  // Trying to identify the two opposite cross-links is no escape: exact poles
  // first force O=C and therefore the same universal collapse.
  const eraseDirection = closeRootQuotient([["L", "U"]]);
  same(eraseDirection.classCount(), 1, "L=U forces universal root collapse");
  for (const x of symbols) {
    assert(eraseDirection.same("R", x), `L=U collapse reaches ${x}`);
  }
}

function staticObserverGuard(): void {
  const repoRoot = resolve(process.cwd(), "..");
  const source = readFileSync(
    join(repoRoot, "ts/test/research-v013-root-asymmetry-chirality-a14.test.ts"),
    "utf8",
  );
  const start = source.indexOf("function selfIncidenceMask(");
  const end = source.indexOf("\nfunction assertQuartet(", start);
  assert(start >= 0 && end > start, "observer source slice exists");
  const observer = source.slice(start, end);
  for (const forbidden of ["ROOT", "START", "END", "PAIR", "switch("]) {
    assert(!observer.includes(forbidden), `observer has no semantic host label: ${forbidden}`);
  }
}

function main(): void {
  const first = new Memory();
  const second = new Memory();

  exercise(first);
  exercise(second);
  staticObserverGuard();

  exactJson(
    exportCanonicalTopology(first).topology,
    exportCanonicalTopology(second).topology,
    "independent Memories materialize byte-identical root topology",
  );

  console.log([
    "MTS v0.13 A14:",
    "ROOT_ASYMMETRY_CHIRALITY=GREEN_SCOPED_RESEARCH",
    "DIRECT_CHIRALITY_SIGNATURES=4",
    "MIRROR_CHIRALITY_SIGNATURES=4",
    "DIRECT_METHOD=L",
    "MIRROR_METHOD=U",
    "DIRECT_INVERSE_DISTINCT=YES",
    "FORCE_O_EQ_C=UNIVERSAL_COLLAPSE",
    "FORCE_L_EQ_U=UNIVERSAL_COLLAPSE",
    "ORIENTATION_FREE_NONDEGENERATE_ROOT_BASIS=REJECTED",
    "ABSOLUTE_HANDEDNESS_LABEL=NOT_CLAIMED",
    "HOST_ASPECT_BRANCHES=0",
    "INDEPENDENT_MEMORIES=2",
    "PRODUCTION_UNCHANGED",
  ].join(" "));
}

main();
