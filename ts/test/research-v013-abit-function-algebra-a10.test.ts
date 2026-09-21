import { readFileSync } from "node:fs";
import { resolve } from "node:path";

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
import {
  StructuralRuleError,
  matchStructuralTemplate,
} from "../src/structural-rule.js";
import { unifyStructuralTemplate } from "../src/structural-unification.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.13 A10 abit/function algebra: ${message}`);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: values differ`);
}

function expectTemplateMismatch(message: string, effect: () => unknown): void {
  try {
    effect();
  } catch (error) {
    assert(error instanceof StructuralRuleError, `${message}: expected StructuralRuleError`);
    same(error.code, "template-mismatch", `${message}: exact error`);
    return;
  }
  throw new Error(`v0.13 A10 abit/function algebra: ${message}: expected template-mismatch`);
}

class PoleOnlyProbe implements ReadMemory {
  constructor(private readonly source: ReadMemory) {}
  get root(): LinkHandle { return this.source.root; }
  get linkCount(): number { return this.source.linkCount; }
  poles(link: LinkHandle): LinkPoles { return this.source.poles(link); }
  find(): LinkHandle | undefined {
    throw new Error("A10 generic selector inference must not call find");
  }
  incoming(): readonly LinkHandle[] {
    throw new Error("A10 generic selector inference must not scan incoming");
  }
  outgoing(): readonly LinkHandle[] {
    throw new Error("A10 generic selector inference must not scan outgoing");
  }
}

function freshRole(memory: Memory, seed: LinkHandle): LinkHandle {
  const left = memory.ensureEndSelfClosed(seed);
  const right = memory.ensureStartSelfClosed(memory.ensureStartSelfClosed(seed));
  return memory.ensure(left, right);
}

const memory = new Memory();
const basis = ensureRootBasis(memory);
const { R, O, C, L, U } = basis;

const begin = (link: LinkHandle): LinkHandle => memory.poles(link).start;
const end = (link: LinkHandle): LinkHandle => memory.poles(link).end;

// ---------------------------------------------------------------------------
// A10.1 — exact pole tables for the structural quartet and Boolean L/U.
// ---------------------------------------------------------------------------
const expectedPoles = new Map<LinkHandle, readonly [LinkHandle, LinkHandle]>([
  [R, [R, R]],
  [O, [O, R]],
  [C, [R, C]],
  [L, [O, C]],
  [U, [C, O]],
]);

for (const [value, [expectedBegin, expectedEnd]] of expectedPoles) {
  same(begin(value), expectedBegin, "exact Begin table");
  same(end(value), expectedEnd, "exact End table");
  same(memory.find(expectedBegin, expectedEnd), value, "construct(Begin(X),End(X)) reconstructs X");
}

// ---------------------------------------------------------------------------
// A10.2 — the four structural abits form a closed projection algebra.
//
// In self-incidence coordinates:
//   R=11, O=10, C=01, L=00
//   Begin(s,e)=(1,e)
//   End(s,e)=(s,1)
//
// Therefore Begin/End are idempotent retractions and mixed composition
// collapses to R over exactly this quartet.
// ---------------------------------------------------------------------------
const structuralAbits = [R, O, C, L] as const;
for (const abit of structuralAbits) {
  const b = begin(abit);
  const e = end(abit);

  same(begin(b), b, "Begin is idempotent on structural abits");
  same(end(e), e, "End is idempotent on structural abits");
  same(begin(e), R, "Begin after End collapses to R on structural abits");
  same(end(b), R, "End after Begin collapses to R on structural abits");
}

// U is an ordinary PAIR Link, not a fifth structural abit. It falsifies the
// quartet-only mixed-collapse law exactly as expected.
same(begin(end(U)), O, "U: Begin(End(U))=O");
same(end(begin(U)), C, "U: End(Begin(U))=C");
assert(begin(end(U)) !== R, "U is outside the four-abit projection closure");
assert(end(begin(U)) !== R, "U is outside the four-abit projection closure");

// ---------------------------------------------------------------------------
// A10.3 — author's Boolean interpretation L=true / U=false.
//
// L=O->C and U=C->O are exact pole inverses, so Boolean NOT is the restriction
// of the general Link pole-swap operation to {L,U}.
// ---------------------------------------------------------------------------
same(begin(L), O, "TRUE L begins at O");
same(end(L), C, "TRUE L ends at C");
same(begin(U), C, "FALSE U begins at C");
same(end(U), O, "FALSE U ends at O");
same(begin(L), end(U), "TRUE begin equals FALSE end");
same(end(L), begin(U), "TRUE end equals FALSE begin");

const notL = memory.find(end(L), begin(L));
const notU = memory.find(end(U), begin(U));
same(notL, U, "NOT(L)=Inv(L)=U without materialization");
same(notU, L, "NOT(U)=Inv(U)=L without materialization");

// Do not overclaim NOT=Inv as a closed operation on the whole root basis.
same(memory.find(end(O), begin(O)), undefined, "Inv(O)=R->O is outside current root basis");
same(memory.find(end(C), begin(C)), undefined, "Inv(C)=C->R is outside current root basis");

// ---------------------------------------------------------------------------
// A10.4 — canonical collapse when abits are used directly as raw function
// argument/value records.
//
// If a raw mapping row were encoded merely as Pair(argument,value), five of
// the sixteen possible rows over R/O/C/L already ARE existing root-basis Links.
// This is an observable identity effect, not a host alias.
// ---------------------------------------------------------------------------
const expectedRawCollapses = new Map<string, LinkHandle>([
  ["R/R", R],
  ["O/R", O],
  ["R/C", C],
  ["O/C", L],
  ["C/O", U],
]);
const labels = new Map<LinkHandle, string>([
  [R, "R"], [O, "O"], [C, "C"], [L, "L"], [U, "U"],
]);

let rawCollapseCount = 0;
for (const argument of structuralAbits) {
  for (const value of structuralAbits) {
    const key = `${labels.get(argument)}/${labels.get(value)}`;
    const existing = memory.find(argument, value);
    const expected = expectedRawCollapses.get(key);

    if (expected !== undefined) {
      same(existing, expected, `raw mapping collapse ${key}`);
      rawCollapseCount += 1;
    } else {
      same(existing, undefined, `raw mapping ${key} is not pre-existing basis identity`);
    }
  }
}
same(rawCollapseCount, 5, "five of sixteen raw abit/abit mapping rows collapse to root-basis Links");

// In contrast, the accepted ExactSequence record carrier preserves all 16
// argument/value rows as distinct, exactly decodable records.
const exactRecords = new Set<LinkHandle>();
for (const argument of structuralAbits) {
  for (const value of structuralAbits) {
    const record = materializeExactSequence(memory, [argument, value]);
    const read = readExactSequence(memory, record);
    same(read.values.length, 2, "ExactSequence mapping record has two positions");
    same(read.values[0], argument, "ExactSequence mapping preserves argument");
    same(read.values[1], value, "ExactSequence mapping preserves value");
    assert(!exactRecords.has(record), "distinct abit argument/value rows have distinct ExactSequence records");
    exactRecords.add(record);
  }
}
same(exactRecords.size, 16, "ExactSequence insulates all sixteen abit/abit mapping rows");

// ---------------------------------------------------------------------------
// A10.5 — historical contextual-function vocabulary already exhibits exact
// basis collisions. This explains why special Links cannot be treated as
// opaque labels inside a function encoding.
// ---------------------------------------------------------------------------
const beforeHistoricalCollapse = memory.linkCount;
const functionKind = O;
const logicalKind = C;
const functionLogical = memory.ensure(functionKind, logicalKind);
const notName = U;
const historicalZero = memory.ensure(C, O);
same(functionLogical, L, "historical Function->Logical prefix collapses exactly to L");
same(historicalZero, U, "historical zero C->O collapses exactly to U");
same(historicalZero, notName, "historical zero and NOT-name roles alias when both are U");
same(memory.linkCount, beforeHistoricalCollapse, "historical basis collapses require no new Links");

// ---------------------------------------------------------------------------
// A10.6 — the old #660 internal Begin/End selector gap can now be revisited
// through generic structural unification introduced later.
//
// Pair(S,E) is an ordinary Link template. Generic unification against X=A->B
// infers S:=A and E:=B with no dedicated Begin/End selector opcode.
// ---------------------------------------------------------------------------
const roleSeed = memory.ensure(L, U);
const startRole = freshRole(memory, roleSeed);
const endRole = freshRole(memory, startRole);
assert(startRole !== endRole, "selector roles are distinct ordinary Links");

const pairTemplate = memory.ensure(startRole, endRole);
const beginRelationTemplate = materializeExactSequence(memory, [pairTemplate, startRole]);
const endRelationTemplate = materializeExactSequence(memory, [pairTemplate, endRole]);
const probe = new PoleOnlyProbe(memory);

function inferredPoles(selected: LinkHandle): readonly [LinkHandle, LinkHandle] {
  const before = memory.linkCount;
  const inferred = unifyStructuralTemplate(
    probe,
    pairTemplate,
    selected,
    [startRole, endRole],
  );
  same(memory.linkCount, before, "generic pole inference is read-only");

  const map = new Map(inferred.map(({ role, value }) => [role, value]));
  const inferredStart = map.get(startRole);
  const inferredEnd = map.get(endRole);
  assert(inferredStart !== undefined, "generic unifier infers start role");
  assert(inferredEnd !== undefined, "generic unifier infers end role");
  return [inferredStart, inferredEnd];
}

const arbitraryLeft = memory.ensure(U, L);
const arbitraryRight = memory.ensure(L, arbitraryLeft);
const arbitraryPair = memory.ensure(arbitraryLeft, arbitraryRight);
const arbitraryStart = memory.ensureStartSelfClosed(arbitraryPair);
const arbitraryEnd = memory.ensureEndSelfClosed(arbitraryPair);

const selectorCorpus = [
  R, O, C, L, U,
  arbitraryPair,
  arbitraryStart,
  arbitraryEnd,
] as const;

for (const selected of selectorCorpus) {
  const actual = memory.poles(selected);
  const [inferredStart, inferredEnd] = inferredPoles(selected);
  same(inferredStart, actual.start, "generic unifier returns exact start pole");
  same(inferredEnd, actual.end, "generic unifier returns exact end pole");
}

// ---------------------------------------------------------------------------
// A10.7 — Link-defined selector relations.
//
// BeginRelation = ExactSequence([Pair(S,E), S])
// EndRelation   = ExactSequence([Pair(S,E), E])
//
// The repeated Role occurrence is the semantic constraint. The host unifier is
// generic: it has no Begin/End branch and merely unifies Link topology.
// ---------------------------------------------------------------------------
function verifySelectorRelation(
  selected: LinkHandle,
  expectedResult: LinkHandle,
  template: LinkHandle,
  relationName: string,
): void {
  const claim = materializeExactSequence(memory, [selected, expectedResult]);
  const [actualStart, actualEnd] = [begin(selected), end(selected)];
  const bindings = Object.freeze([
    Object.freeze({ role: startRole, value: actualStart }),
    Object.freeze({ role: endRole, value: actualEnd }),
  ]);

  const before = memory.linkCount;
  matchStructuralTemplate(probe, template, claim, bindings);
  same(memory.linkCount, before, `${relationName} relation replay is read-only`);
}

for (const selected of selectorCorpus) {
  verifySelectorRelation(selected, begin(selected), beginRelationTemplate, "Begin");
  verifySelectorRelation(selected, end(selected), endRelationTemplate, "End");

  const wrongBegin = end(selected) === begin(selected) ? U : end(selected);
  const forgedBeginClaim = materializeExactSequence(memory, [selected, wrongBegin]);
  const actual = memory.poles(selected);
  const bindings = Object.freeze([
    Object.freeze({ role: startRole, value: actual.start }),
    Object.freeze({ role: endRole, value: actual.end }),
  ]);
  expectTemplateMismatch(
    "Begin relation rejects forged result",
    () => matchStructuralTemplate(probe, beginRelationTemplate, forgedBeginClaim, bindings),
  );

  const wrongEnd = end(selected) === begin(selected) ? U : begin(selected);
  const forgedEndClaim = materializeExactSequence(memory, [selected, wrongEnd]);
  expectTemplateMismatch(
    "End relation rejects forged result",
    () => matchStructuralTemplate(probe, endRelationTemplate, forgedEndClaim, bindings),
  );
}

// ---------------------------------------------------------------------------
// A10.8 — no production/lifecycle mutation is hidden in this research witness.
// Static scope assertion: this file is the only A10 implementation artifact.
// ---------------------------------------------------------------------------
const packageText = readFileSync(resolve(process.cwd(), "src", "public.ts"), "utf8");
assert(!packageText.includes("readBegin("), "A10 adds no dedicated public readBegin runtime helper");
assert(!packageText.includes("readEnd("), "A10 adds no dedicated public readEnd runtime helper");

console.log([
  "MTS v0.13 A10:",
  "ABIT_FUNCTION_ALGEBRA_SUPPORTED",
  "GENERIC_POLE_SELECTOR_RELATION_SUPPORTED",
  "BOOLEAN_NOT_IS_LINK_INVERSION",
  "RAW_ABIT_FUNCTION_RECORD_COLLAPSE=5/16",
  "EXACT_SEQUENCE_ABIT_RECORDS=16/16_DISTINCT",
  "FORMAL_LINK_FUNCTION_INTERPRETER_HYPOTHESIS_READY",
].join(" "));
