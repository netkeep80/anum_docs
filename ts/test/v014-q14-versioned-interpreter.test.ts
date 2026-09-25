// mts-version-evidence: candidate-from=0.14

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import {
  QuaternaryDecodeError,
  deserializeStream,
  parseRawQuaternary,
  symbolicStackAlgebra,
  type StackAlgebra,
} from "../src/anum.js";
import {
  IncrementalV014QDecoder,
  V014QDecodeError,
  deserializeV014QStream,
  normalizeV014QForm,
  parseRawV014Q,
  transcodeLegacyQ13ToV014Canonical,
} from "../src/v014-q.js";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
  type ReadMemory,
  type RootBasis,
} from "../src/memory.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.14 Q14 versioned interpreter: ${message}`);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: values differ`);
}

function rejectsQ14(source: string): void {
  try {
    parseRawV014Q(source);
  } catch (error) {
    assert(error instanceof V014QDecodeError, `Q14 rejection type for ${JSON.stringify(source)}`);
    same(error.code, "non-abit", `Q14 rejection code for ${JSON.stringify(source)}`);
    return;
  }
  throw new Error(`Q14 must reject ${JSON.stringify(source)}`);
}

function rejectsQ13(source: string): void {
  try {
    parseRawQuaternary(source);
  } catch (error) {
    assert(error instanceof QuaternaryDecodeError, `Q13 rejection type for ${JSON.stringify(source)}`);
    same(error.code, "non-abit", `Q13 rejection code for ${JSON.stringify(source)}`);
    return;
  }
  throw new Error(`Q13 must reject ${JSON.stringify(source)}`);
}

const q14Vectors = Object.freeze([
  ["", "R"],
  ["T", "L"],
  ["F", "U"],
  ["TF", "(L⟼U)"],
  ["[]", "R"],
  ["[TF]", "(R⟼(L⟼U))"],
  ["[[TF]]", "(R⟼(R⟼(L⟼U)))"],
] as const);

for (const [source, expected] of q14Vectors) {
  same(
    deserializeV014QStream(source, symbolicStackAlgebra).denotation,
    expected,
    `Q14 denotation ${JSON.stringify(source)}`,
  );
}

// Raw Q14 keeps the accepted source envelope (comments/whitespace) but has one
// unambiguous current alphabet.
same(
  normalizeV014QForm(parseRawV014Q("  T # comment\n F  ")),
  "TF",
  "Q14 raw normalization",
);

for (const invalid of ["1", "0", "[1]", "[T0]", "A"]) rejectsQ14(invalid);
for (const invalid of ["T", "F", "[T]", "[1F]"]) rejectsQ13(invalid);

// Decoder rejection is transactional: rejected chunks do not advance the
// committed code-point offset or mutate already committed tokens.
{
  const decoder = new IncrementalV014QDecoder();
  decoder.feed("T");
  same(decoder.offset, 1, "Q14 decoder committed first token");
  try {
    decoder.feed("1");
    throw new Error("expected Q14 incremental rejection");
  } catch (error) {
    assert(error instanceof V014QDecodeError, "Q14 incremental rejection type");
    same(error.offset, 1, "Q14 incremental rejection absolute offset");
  }
  same(decoder.offset, 1, "Q14 rejected chunk does not advance offset");
  same(normalizeV014QForm(decoder.finish()), "T", "Q14 rejected chunk does not commit token");
}

const compatibilityVectors = Object.freeze([
  ["", ""],
  ["1", "T"],
  ["0", "F"],
  ["10", "TF"],
  ["[10]", "[TF]"],
  ["[[10]]", "[[TF]]"],
  ["[10][01]", "[TF][FT]"],
] as const);

for (const [legacy, current] of compatibilityVectors) {
  same(
    transcodeLegacyQ13ToV014Canonical(legacy),
    current,
    `explicit Q13->Q14 transcode ${legacy}`,
  );
  same(
    deserializeStream(legacy, symbolicStackAlgebra).denotation,
    deserializeV014QStream(current, symbolicStackAlgebra).denotation,
    `cross-version denotation ${legacy}`,
  );
}

same(
  transcodeLegacyQ13ToV014Canonical("[1 # old source\n 0]"),
  "[TF]",
  "compatibility transcode canonicalizes comments/whitespace",
);
assert(
  transcodeLegacyQ13ToV014Canonical("10") !== "10",
  "transcode preserves denotation, not exact source identity",
);

function algebra(memory: Memory, basis: RootBasis): StackAlgebra<LinkHandle> {
  return Object.freeze({
    root: basis.R,
    linked: basis.L,
    unlinked: basis.U,
    link: (start: LinkHandle, end: LinkHandle) => memory.ensure(start, end),
  });
}

function signature(
  memory: ReadMemory,
  basis: RootBasis,
  link: LinkHandle,
  memo = new Map<LinkHandle, string>(),
): string {
  if (link === basis.R) return "R";
  if (link === basis.O) return "O";
  if (link === basis.C) return "C";
  if (link === basis.L) return "L";
  if (link === basis.U) return "U";

  const cached = memo.get(link);
  if (cached !== undefined) return cached;
  const poles = memory.poles(link);
  assert(poles.start !== link && poles.end !== link, "Q14 sequence creates no new self-closed node");
  const result = `P(${signature(memory, basis, poles.start, memo)},${signature(memory, basis, poles.end, memo)})`;
  memo.set(link, result);
  return result;
}

// The explicit version boundary changes source glyphs, not sequence denotation.
{
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  const q13 = deserializeStream("[10][01]", algebra(memory, basis)).denotation;
  const q14 = deserializeV014QStream("[TF][FT]", algebra(memory, basis)).denotation;
  same(q14, q13, "Q13/Q14 same-memory denotation identity");
}

// Allocation-independent structural denotation remains unchanged.
{
  const first = new Memory();
  const firstBasis = ensureRootBasis(first);
  const firstValue = deserializeV014QStream("[TF][FT]", algebra(first, firstBasis)).denotation;

  const second = new Memory();
  const secondBasis = ensureRootBasis(second);
  second.ensure(secondBasis.U, secondBasis.C); // unrelated allocation noise
  const secondValue = deserializeV014QStream("[TF][FT]", algebra(second, secondBasis)).denotation;

  same(
    signature(first, firstBasis, firstValue),
    signature(second, secondBasis, secondValue),
    "Q14 two-memory structural denotation",
  );
}

// Static boundary: Q14 execution itself must not delegate to the Q13 parser or
// contain legacy 1/0 value dispatch. The explicit transcoder is outside kernel.
{
  const root = resolve(process.cwd(), "..");
  const source = readFileSync(join(root, "ts/src/v014-q.ts"), "utf8");
  const start = source.indexOf("export function executeV014QSigns");
  const end = source.indexOf("\nexport function deserializeV014Q", start);
  assert(start >= 0 && end > start, "Q14 execution kernel source slice");
  const kernel = source.slice(start, end);
  for (const forbidden of ["parseRawQuaternary", '"1"', '"0"']) {
    assert(!kernel.includes(forbidden), `Q14 kernel excludes legacy dependency ${forbidden}`);
  }

  const legacy = readFileSync(join(root, "ts/src/anum.ts"), "utf8");
  assert(
    legacy.includes('export type Abit = "[" | "]" | "1" | "0";'),
    "accepted legacy Q13 alphabet remains unchanged",
  );
}

console.log([
  "MTS v0.14 F1:",
  "Q14_ALPHABET=[,],T,F",
  "T=L",
  "F=U",
  "Q14_REJECTS_1_0=YES",
  "Q13_REJECTS_T_F=YES",
  "MIXED_SOURCE_REJECTED=YES",
  "EXPLICIT_TRANSCODE=GREEN",
  "CROSS_VERSION_DENOTATION=GREEN",
  "EXACT_SOURCE_IDENTITY_PRESERVED=NO",
  "NESTED_ROOT_SEQUENCE_SEMANTICS=PRESERVED",
  "TWO_MEMORY_STRUCTURE=GREEN",
  "LEGACY_Q13_MUTATED=NO",
].join(" "));
