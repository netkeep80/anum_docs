import { Memory, ensureRootBasis, type LinkHandle } from "../src/memory.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}

const memory = new Memory();
const { R, O, C, L, U } = ensureRootBasis(memory);

// General structural obligation first: U = C -> O, while every successor has
// right pole L. The root-basis construction must establish L != O structurally,
// rather than relying on their mnemonic names.
const rootPoles = memory.poles(R);
same(rootPoles.start, R, "R start");
same(rootPoles.end, R, "R end");

const oPoles = memory.poles(O);
same(oPoles.start, O, "O self-closed start");
same(oPoles.end, R, "O external end");

const cPoles = memory.poles(C);
same(cPoles.start, R, "C external start");
same(cPoles.end, C, "C self-closed end");
assert(C !== R, "root-basis construction keeps C distinct from R");

const lPoles = memory.poles(L);
same(lPoles.start, O, "L start is O");
same(lPoles.end, C, "L end is C");

const uPoles = memory.poles(U);
same(uPoles.start, C, "U start is C");
same(uPoles.end, O, "U end is O");

// If L were O, ordered-pole identity would force their right poles C and R to
// be equal. C != R above therefore closes the root-basis obligation L != O.
assert(L !== O, "L and O are structurally distinct by their exact poles");

// Host indices below label only the bounded falsification corpus. Nat identity
// comes exclusively from ordinary Link construction N0=U; Succ(N)=N -> L.
const nat: LinkHandle[] = [U];
for (let index = 0; index < 8; index += 1) {
  nat.push(memory.ensure(nat[nat.length - 1]!, L));
}

for (let index = 0; index < 8; index += 1) {
  const predecessor = nat[index]!;
  const successor = nat[index + 1]!;
  same(memory.ensure(predecessor, L), successor, `N${index} successor identity`);
  assert(successor !== U, `Succ(N${index}) must not collapse to U`);

  const poles = memory.poles(successor);
  same(poles.start, predecessor, `Succ(N${index}) start`);
  same(poles.end, L, `Succ(N${index}) end`);
}

// General derivation, independent of the finite corpus:
//   N -> L = U = C -> O
// ordered-pole identity would require N=C and L=O; the latter contradicts the
// root-basis result above. Therefore no arbitrary Link N can satisfy N -> L=U.
console.log("T3_FINITE_ZERO_NOT_SUCCESSOR = SUPPORTED");
console.log("T3_GENERAL_ROOT_BASIS_DERIVATION = SUPPORTED");
console.log("PRODUCTION_DELTA = NONE");
console.log("PROOF_ANET = NOT TESTED");
console.log("REUSE = NOT TESTED");
