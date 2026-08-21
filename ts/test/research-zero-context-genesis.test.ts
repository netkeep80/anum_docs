import {
  materializeExactSequence,
  readExactSequence,
} from "../src/exact-sequence.js";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
  type LinkPoles,
  type ReadMemory,
} from "../src/memory.js";
import { defineContext, readContext, StateError } from "../src/state.js";
import {
  matchStructuralTemplate,
  StructuralRuleError,
} from "../src/structural-rule.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`zero-context genesis: ${message}`);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}

function expectInvalidContext(effect: () => unknown, message: string): void {
  try {
    effect();
  } catch (error) {
    assert(error instanceof StateError, `${message}: expected StateError`);
    same(error.code, "invalid-context", `${message}: error code`);
    return;
  }
  throw new Error(`zero-context genesis: ${message}: expected invalid-context`);
}

function expectTemplateMismatch(effect: () => unknown, message: string): void {
  try {
    effect();
  } catch (error) {
    assert(error instanceof StructuralRuleError, `${message}: expected StructuralRuleError`);
    same(error.code, "template-mismatch", `${message}: error code`);
    return;
  }
  throw new Error(`zero-context genesis: ${message}: expected template-mismatch`);
}

class ReadProbe implements ReadMemory {
  constructor(private readonly source: ReadMemory) {}
  get root(): LinkHandle { return this.source.root; }
  get linkCount(): number { return this.source.linkCount; }
  poles(link: LinkHandle): LinkPoles { return this.source.poles(link); }
  find(): LinkHandle | undefined { throw new Error("genesis verification must not call find"); }
  outgoing(): readonly LinkHandle[] { throw new Error("genesis verification must not scan outgoing"); }
  incoming(): readonly LinkHandle[] { throw new Error("genesis verification must not scan incoming"); }
}

const memory = new Memory();
const basis = ensureRootBasis(memory);
const R = basis.R;

// #747: the zero contextual whole and its execution-frame witness are not the
// same semantic Link. defineContext(R,R) canonically reuses START(R)=O.
const A0 = R;
const K0 = defineContext(memory, R, R);
same(K0, basis.O, "canonical root execution frame is O");
assert(A0 !== K0, "zero contextual whole R must not alias execution frame O");

// #748: two exact root-valued positions remain two positions even though their
// ordinary binary/fold result is the fully self-closed ROOT itself.
const twoRootPositions = materializeExactSequence(memory, [R, R]);
assert(twoRootPositions !== R, "ExactSequence([R,R]) must not collapse to ROOT");
const rootPair = memory.ensure(R, R);
same(rootPair, R, "Pair(R,R) is ROOT full self-closure");

const nonRoot = basis.L;
assert(nonRoot !== R, "non-root witness must differ from ROOT");
const nonRootLoop = memory.ensure(nonRoot, nonRoot);
assert(nonRootLoop !== nonRoot, "non-root Pair(A,A) must not equal A");

// #749: derive oriented internal duality and the accepted colon/dot meanings
// only from rooted forms and primitive ordered-pair construction.
const derivedO = memory.ensureStartSelfClosed(R);
const derivedC = memory.ensureEndSelfClosed(R);
const derivedL = memory.ensure(derivedO, derivedC);
same(derivedO, basis.O, "START(R) derives O");
same(derivedC, basis.C, "END(R) derives C");
same(derivedL, basis.L, "Pair(O,C) derives L");

const colonMeaning = memory.ensure(R, derivedL);
const dotMeaning = memory.ensure(derivedL, R);
assert(colonMeaning !== rootPair, "semantic colon meaning must not equal the `..` fold result");
assert(colonMeaning !== dotMeaning, "colon and dot meaning Links must stay oriented/distinct");
const colonPoles = memory.poles(colonMeaning);
const dotPoles = memory.poles(dotMeaning);
same(colonPoles.start, R, "colon meaning starts at whole ROOT");
same(colonPoles.end, derivedL, "colon meaning ends at oriented duality L");
same(dotPoles.start, derivedL, "dot meaning starts at oriented duality L");
same(dotPoles.end, R, "dot meaning ends at whole ROOT");
same(memory.ensure(colonPoles.end, colonPoles.start), dotMeaning, "pole swap of colon meaning is dot meaning");

// The occurrence-role used by contextual matching is deliberately distinct
// from the sign's own semantic meaning Link.
const dotRole = memory.ensure(basis.U, basis.L);
assert(dotRole !== dotMeaning, "dot occurrence-role must differ from dot sign meaning");
const fullDotTemplate = memory.ensure(dotRole, dotRole);

// All construction ends here. Everything below is verification through a
// ReadMemory-only probe; no hidden materialization/current/history is allowed.
const beforeRead = memory.linkCount;
const probe = new ReadProbe(memory);

const state = readContext(probe, K0);
same(state.parent, R, "root frame parent");
same(state.current, A0, "root frame carries zero contextual whole");
expectInvalidContext(() => readContext(probe, R), "ROOT is not an execution frame");

const exact = readExactSequence(probe, twoRootPositions);
same(exact.values.length, 2, "two-dot carrier preserves arity");
same(exact.values[0], R, "first dot resolves to zero whole");
same(exact.values[1], R, "second dot resolves to zero whole");

// Accepted v0.10 boundary: with no binding a dot-role stays grounded and cannot
// silently become ambient current. This is the exact observable boundary that
// a future top-level TopBind(R, S) rule would change at the interpretation edge.
expectTemplateMismatch(
  () => matchStructuralTemplate(probe, fullDotTemplate, R, []),
  "free top-level dot has no ambient binding in v0.10",
);

// Existing kernel already verifies the candidate root-bound `..` read-only once
// the canonical outer binding is supplied explicitly. No candidate runtime API
// is required to prove the structural feasibility of TopBind(R, S).
matchStructuralTemplate(
  probe,
  fullDotTemplate,
  R,
  [Object.freeze({ role: dotRole, value: A0 })],
);

// Re-check the derived semantic chain exclusively through poles.
same(probe.poles(derivedO).start, derivedO, "O is start-selfclosed");
same(probe.poles(derivedO).end, R, "O targets ROOT");
same(probe.poles(derivedC).start, R, "C starts at ROOT");
same(probe.poles(derivedC).end, derivedC, "C is end-selfclosed");
same(probe.poles(derivedL).start, derivedO, "L begins at O");
same(probe.poles(derivedL).end, derivedC, "L ends at C");
same(probe.poles(colonMeaning).start, R, "derived colon whole pole");
same(probe.poles(colonMeaning).end, derivedL, "derived colon dual pole");
same(probe.poles(dotMeaning).start, derivedL, "derived dot dual pole");
same(probe.poles(dotMeaning).end, R, "derived dot whole pole");

// #750: static accepted F1 grammar boundary. This witness deliberately does not
// build a new parser merely to restate it: Q admits only the transport alphabet.
const acceptedQGlyphs = new Set<string>(["[", "]", "1", "0"]);
assert(!acceptedQGlyphs.has("."), "dot must remain outside accepted Q alphabet");
assert(!acceptedQGlyphs.has(":"), "colon must remain outside accepted Q alphabet");

same(memory.linkCount, beforeRead, "all genesis verification is read-only");
