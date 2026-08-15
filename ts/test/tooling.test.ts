import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import {
  abitsToByte,
  anumToChar,
  anumToText,
  anumToTextVerbose,
  byteToAbits,
  charToAnum,
  extractCharAnums,
  textToAnum,
  textToAnumVerbose,
} from "../src/tooling/payload.js";
import {
  abitsToAprover,
  aproverToAbits,
  asciiToUnicode,
  unicodeToAscii,
} from "../src/tooling/notation.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function equal<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: expected ${String(expected)}, got ${String(actual)}`);
}
function throws(action: () => unknown, message: string): void {
  let thrown = false;
  try { action(); } catch { thrown = true; }
  assert(thrown, message);
}

for (let value = 0; value <= 255; value += 1) equal(abitsToByte(byteToAbits(value)), value, `byte round-trip ${value}`);
throws(() => byteToAbits(-1), "negative byte must reject");
throws(() => byteToAbits(256), "large byte must reject");
throws(() => byteToAbits(1.5), "non-integer byte must reject");
throws(() => abitsToByte("101"), "short abit byte must reject");
throws(() => abitsToByte("101x0101"), "foreign abit must reject");

equal(charToAnum("A").length, 10, "ASCII character width");
equal(charToAnum("М").length, 18, "Cyrillic character width");
equal(charToAnum("∞").length, 26, "three-byte character width");
for (const text of ["", "hello", "МТС", "hello МТС", "♂♀∞→", "0123456789", "hello, world!"]) {
  equal(anumToText(textToAnum(text)), text, `payload round-trip ${JSON.stringify(text)}`);
}
throws(() => anumToChar(""), "empty character payload must reject");
throws(() => anumToChar(byteToAbits(0x41) + byteToAbits(0x42)), "two characters in one group must reject");
throws(() => anumToChar("11111111"), "invalid UTF-8 must reject");
equal(JSON.stringify(extractCharAnums("[10101010]")), JSON.stringify(["10101010"]), "single group extraction");
equal(extractCharAnums("[11111111][00000000]").length, 2, "multiple group extraction");
throws(() => extractCharAnums("[11"), "unclosed group must reject");
throws(() => extractCharAnums("11]]"), "extra close must reject");
throws(() => extractCharAnums("1[11]"), "abit outside group must reject");
equal(extractCharAnums("[11] [00]").length, 2, "whitespace between groups is ignored");
const encodedDetail = textToAnumVerbose("A")[0];
assert(encodedDetail !== undefined, "missing encode detail");
equal(encodedDetail.codepoint, "U+0041", "codepoint formatting");
assert(encodedDetail.utf8Bytes.includes("0x41"), "UTF-8 byte detail");
throws(() => anumToTextVerbose(`[${byteToAbits(0x41)}${byteToAbits(0x42)}]`), "verbose multi-char boundary must reject");

equal(unicodeToAscii("a ⟼ b"), "a -> b", "arrow conversion");
equal(unicodeToAscii("a ¬⟼ b"), "a !-> b", "negated arrow conversion");
equal(unicodeToAscii("∞ : ∞ ⟼ ∞"), "INF : INF -> INF", "complex Unicode conversion");
equal(unicodeToAscii("♂v : ♂v ⟼ v"), "M v : M v -> v", "self-closure spacing");
equal(unicodeToAscii("♂♀"), "M F", "adjacent word token spacing");
equal(asciiToUnicode("a -> b"), "a ⟼ b", "ASCII arrow conversion");
equal(asciiToUnicode("a !-> b"), "a ¬⟼ b", "ASCII negated arrow conversion");
equal(asciiToUnicode("INF : INF -> INF"), "∞ : ∞ ⟼ ∞", "complex ASCII conversion");
for (const word of ["FORM", "MTC", "INFO", "FROM", "MODEM", "FF", "MM"]) {
  equal(asciiToUnicode(word), word, `word-boundary regression ${word}`);
}
equal(asciiToUnicode("the FORM of M"), "the FORM of ♂", "standalone token in sentence");
equal(asciiToUnicode(unicodeToAscii("♂∞♀")), "♂ ∞ ♀", "notation round-trip separators");
equal(abitsToAprover("[[][10][00]"), "[[][10][00]", "abit aprover identity");
equal(aproverToAbits("[[]][10][00]"), "[[]][10][00]", "aprover abit identity");

const directory = mkdtempSync(join(tmpdir(), "mts-tooling-"));
try {
  const cli = resolve(process.cwd(), "dist/src/tooling/cli.js");
  const run = (...args: string[]) => spawnSync(process.execPath, [cli, ...args], { encoding: "utf8" });
  const sample = join(directory, "sample.anum");
  writeFileSync(sample, "# anum-format: quaternary\n[]\n", "utf8");
  const parsed = run("parse", sample);
  equal(parsed.status, 0, "parse exit");
  assert(parsed.stdout.includes("format: quaternary") && parsed.stdout.includes("0: [") && parsed.stdout.includes("1: ]"), "parse output");

  const invalid = join(directory, "invalid.anum");
  writeFileSync(invalid, "]", "utf8");
  const validation = run("validate", invalid);
  equal(validation.status, 0, "invalid semantic validation is a reported result");
  assert(validation.stdout.includes("valid: false") && validation.stdout.includes("error: unexpected-close"), "validation output");

  const sequence = join(directory, "sequence.anum");
  writeFileSync(sequence, "1110", "utf8");
  const deserialized = run("deserialize", sequence);
  equal(deserialized.status, 0, "deserialize exit");
  assert(deserialized.stdout.includes("denotation: (((L⟼L)⟼L)⟼U)") && deserialized.stdout.includes("resolved_values: L L L U"), "deserialize output");

  const spaced = join(directory, "spaced.anum");
  writeFileSync(spaced, "# anum-format: quaternary\n[ 0 1 ] # comment\n", "utf8");
  equal(run("normalize", spaced).stdout.trim(), "[01]", "normalize output");

  const stringMode = join(directory, "string.anum");
  writeFileSync(stringMode, "# anum-format: string\na b\n", "utf8");
  for (const command of ["validate", "deserialize", "normalize"]) {
    const result = run(command, stringMode);
    assert(result.status !== 0 && result.stderr.includes(command) && result.stderr.includes("quaternary"), `${command} string mode rejection`);
  }
  for (const command of ["project", "quote", "unquote", "realize"]) {
    const result = run(command, "missing.anum");
    assert(result.status !== 0 && result.stderr.includes("invalid choice"), `${command} must remain unavailable`);
  }
} finally {
  rmSync(directory, { recursive: true, force: true });
}
