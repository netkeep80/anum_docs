#!/usr/bin/env node
import { readFileSync } from "node:fs";
import {
  StreamError,
  deserializeAnum,
  normalizeRawForm,
  parseRawQuaternary,
  symbolicStackAlgebra,
} from "../anum.js";
import { anumToText, textToAnum } from "./payload.js";
import { asciiToUnicode, unicodeToAscii } from "./notation.js";

function fail(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function usage(): never {
  return fail("usage: mts <parse|validate|deserialize|normalize|text-to-anum|anum-to-text|to-ascii|to-unicode> <value-or-file>");
}

function readAnumFile(path: string): { readonly mode: "quaternary" | "string"; readonly text: string } {
  const text = readFileSync(path, "utf8");
  const mode = /^\s*#\s*anum-format:\s*string\b/m.test(text) ? "string" : "quaternary";
  return { mode, text };
}

function requireQuaternary(command: string, path: string): string {
  const source = readAnumFile(path);
  if (source.mode !== "quaternary") fail(`${command} поддерживает только quaternary *.anum`);
  return source.text;
}

function main(argv: readonly string[]): void {
  const command = argv[0];
  const value = argv[1];
  if (!command || value === undefined || argv.length !== 2) usage();

  if (command === "parse") {
    const source = readAnumFile(value);
    if (source.mode === "string") {
      process.stdout.write(`format: string\ntext:\n${source.text.replace(/^\s*#\s*anum-format:\s*string\s*\r?\n/m, "")}\n`);
      return;
    }
    const form = parseRawQuaternary(source.text);
    process.stdout.write("format: quaternary\ntokens:\n");
    form.tokens.forEach((token, index) => process.stdout.write(`  ${index}: ${token.abit}\n`));
    return;
  }

  if (command === "validate") {
    const source = requireQuaternary(command, value);
    try {
      const form = parseRawQuaternary(source);
      deserializeAnum(form, symbolicStackAlgebra);
      process.stdout.write("valid: true\n");
    } catch (error) {
      if (error instanceof StreamError) {
        process.stdout.write(`valid: false\nerror: ${error.code}\n`);
        return;
      }
      throw error;
    }
    return;
  }

  if (command === "deserialize") {
    const form = parseRawQuaternary(requireQuaternary(command, value));
    const result = deserializeAnum(form, symbolicStackAlgebra);
    process.stdout.write(`input: ${normalizeRawForm(form)}\n`);
    process.stdout.write(`denotation: ${result.denotation}\n`);
    process.stdout.write(`resolved_values: ${result.resolvedValues.join(" ")}\n`);
    process.stdout.write(`operations: ${result.operations.join(" ")}\n`);
    return;
  }

  if (command === "normalize") {
    const form = parseRawQuaternary(requireQuaternary(command, value));
    process.stdout.write(`${normalizeRawForm(form)}\n`);
    return;
  }

  if (command === "text-to-anum") {
    process.stdout.write(`${textToAnum(value)}\n`);
    return;
  }
  if (command === "anum-to-text") {
    process.stdout.write(`${anumToText(value)}\n`);
    return;
  }
  if (command === "to-ascii") {
    process.stdout.write(`${unicodeToAscii(value)}\n`);
    return;
  }
  if (command === "to-unicode") {
    process.stdout.write(`${asciiToUnicode(value)}\n`);
    return;
  }

  fail(`invalid choice: ${command}`);
}

try {
  main(process.argv.slice(2));
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
