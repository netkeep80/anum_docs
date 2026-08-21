import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

interface PackedFile {
  path: string;
}

interface PackResult {
  filename: string;
  files?: PackedFile[];
}

function run(command: string, args: string[], cwd: string): string {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: process.env,
  });
  if (result.error !== undefined) throw result.error;
  assert.equal(
    result.status,
    0,
    `${command} ${args.join(" ")} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
  );
  return result.stdout;
}

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function pack(packageRoot: string, destination: string): { path: string; result: PackResult } {
  mkdirSync(destination, { recursive: true });
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  const raw = run(npm, ["pack", "--json", "--pack-destination", destination], packageRoot);
  const parsed = JSON.parse(raw) as PackResult[];
  assert.equal(parsed.length, 1, "npm pack must produce exactly one artifact");
  const result = parsed[0];
  assert.ok(result !== undefined);
  assert.equal(typeof result.filename, "string");
  return { path: join(destination, result.filename), result };
}

const packageRoot = resolve(".");
const manifest = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8")) as {
  name?: unknown;
  version?: unknown;
  files?: unknown;
};

assert.equal(manifest.name, "@mts/core");
assert.equal(manifest.version, "0.10.0");
assert.deepEqual(manifest.files, ["dist/src"]);

const scratch = mkdtempSync(join(tmpdir(), "mts-core-package-"));
try {
  const first = pack(packageRoot, join(scratch, "pack-a"));
  const second = pack(packageRoot, join(scratch, "pack-b"));

  assert.equal(
    sha256(first.path),
    sha256(second.path),
    "same clean build must produce byte-identical npm tarballs",
  );

  for (const file of first.result.files ?? []) {
    assert.ok(
      file.path === "package.json" || file.path.startsWith("dist/src/"),
      `unexpected package payload outside public dist surface: ${file.path}`,
    );
  }

  const consumer = join(scratch, "consumer");
  mkdirSync(consumer, { recursive: true });
  writeFileSync(
    join(consumer, "package.json"),
    `${JSON.stringify({
      name: "mts-core-artifact-smoke",
      private: true,
      type: "module",
      dependencies: {
        "@mts/core": `file:${first.path}`,
      },
    }, null, 2)}\n`,
    "utf8",
  );

  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  run(
    npm,
    ["install", "--ignore-scripts", "--package-lock=false", "--no-audit", "--no-fund"],
    consumer,
  );

  writeFileSync(
    join(consumer, "smoke.mjs"),
    [
      'import assert from "node:assert/strict";',
      'import { Memory, ensureRootBasis } from "@mts/core";',
      "const memory = new Memory();",
      "const basis = ensureRootBasis(memory);",
      "assert.equal(memory.root, basis.R);",
      "assert.equal(memory.find(basis.O, basis.C), basis.L);",
      "assert.deepEqual(memory.poles(basis.L), { start: basis.O, end: basis.C });",
      "console.log('packed @mts/core smoke: ok');",
      "",
    ].join("\n"),
    "utf8",
  );
  run(process.execPath, ["smoke.mjs"], consumer);

  console.log(`package artifact sha256=${sha256(first.path)}`);
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
