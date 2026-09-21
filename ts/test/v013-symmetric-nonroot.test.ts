import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
} from "../src/memory.js";
import { defineContext } from "../src/state.js";
import {
  materializeRelativePoleContext,
} from "../src/v013-relative-pole-context.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.13 symmetric non-root: ${message}`);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: values differ`);
}

function aspectFixed(
  memory: Memory,
  whole: LinkHandle,
): boolean {
  const poles = memory.poles(whole);
  return poles.start === whole && poles.end === whole;
}

const memory = new Memory();
const basis = ensureRootBasis(memory);

// Pick a concrete non-root Link and build a symmetric Whole S=a->a.
const a = memory.ensureStartSelfClosed(basis.L);
assert(a !== basis.R, "fixture pole a must be non-root");

const S = memory.ensure(a, a);
assert(S !== basis.R, "symmetric S=a->a must remain non-root");
same(memory.poles(S).start, a, "start(S)=a");
same(memory.poles(S).end, a, "end(S)=a");

// Value inversion is fixed solely because the two poles coincide.
const inverseS = memory.ensure(
  memory.poles(S).end,
  memory.poles(S).start,
);
same(inverseS, S, "-S=S for equal-pole non-root link");

// But S is not the root fixed point of its own aspects.
assert(!aspectFixed(memory, S), "non-root S is not start/end fixed");
assert(aspectFixed(memory, basis.R), "R is start/end fixed");

// Relative forms remain structurally distinct even when their results coincide.
const P = memory.ensureStartSelfClosed(S);
const Q = memory.ensureEndSelfClosed(S);
const D = memory.ensure(P, Q);
const I = memory.ensure(Q, P);

assert(P !== Q, "START_FORM(S) and END_FORM(S) remain distinct");
assert(D !== I, "DIRECT_FORM(S) and INVERSE_FORM(S) remain distinct");

const base = defineContext(memory, basis.R, S);
const startPosition = materializeRelativePoleContext(memory, base, P);
const endPosition = materializeRelativePoleContext(memory, base, Q);

same(startPosition.whole, S, "START form carries exact S");
same(endPosition.whole, S, "END form carries exact S");
same(startPosition.selected, a, "START_FORM(S) resolves to a");
same(endPosition.selected, a, "END_FORM(S) resolves to the same a");

same(memory.poles(D).start, P, "DIRECT form starts at P");
same(memory.poles(D).end, Q, "DIRECT form ends at Q");
same(memory.poles(I).start, Q, "INVERSE form starts at Q");
same(memory.poles(I).end, P, "INVERSE form ends at P");

// #1282 already proves the generic result laws D(S)⇓S and I(S)⇓-S.
// For this equal-pole substitution -S=S, so both orientation forms have the
// same semantic result while retaining different Link identity.
same(inverseS, S, "DIRECT/INVERSE result law specializes to S on both sides");

// Root is stronger than inversion symmetry: both of its poles are itself.
same(memory.poles(basis.R).start, basis.R, "start(R)=R");
same(memory.poles(basis.R).end, basis.R, "end(R)=R");

// Representative root-derived non-roots do not satisfy the stronger property.
for (const [name, link] of [
  ["O", basis.O],
  ["C", basis.C],
  ["L", basis.L],
  ["U", basis.U],
  ["S", S],
] as const) {
  assert(!aspectFixed(memory, link), `${name} is not the both-aspect fixed point`);
}

console.log(
  "MTS v0.13 symmetric non-root inversion/root distinction: GREEN.",
);
