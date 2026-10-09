import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  insertMarkdownChild as localInsertMarkdownChild,
  listMarkdownAnchorIds as localListMarkdownAnchorIds,
  listMarkdownChildren as localListMarkdownChildren,
  listMarkdownSections as localListMarkdownSections,
  readMarkdownNode as localReadMarkdownNode,
  readOwnedMarkdownBlock as localReadOwnedMarkdownBlock,
  replaceOwnedMarkdownSection as localReplaceOwnedMarkdownSection,
  resolveMarkdownAnchor as localResolveMarkdownAnchor,
} from "../src/tooling/markdown-section-adapter.js";

const REPO_GUARD_SHA = "c7d50c439f3e9c9c195f7870ef17f5098d94b824";
const REPO_GUARD_URL = "https://github.com/netkeep80/repo-guard.git";
assert.match(REPO_GUARD_SHA, /^[0-9a-f]{40}$/, "repo-guard differential pin must be an exact commit SHA");

function run(command: string, args: readonly string[], cwd?: string): void {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 120_000,
  });
  if (result.error !== undefined) throw result.error;
  if (result.signal !== null) {
    throw new Error(`${command} terminated by signal ${result.signal}`);
  }
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed (${result.status})\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
    );
  }
}

function titleOf(heading: { readonly level: number; readonly title?: string; readonly text?: string }): [number, string] {
  return [heading.level, heading.title ?? heading.text ?? ""];
}

function normalizeAddress(address: {
  readonly anchorId: string;
  readonly line: number;
  readonly offset: number;
  readonly headingPath: readonly { readonly level: number; readonly title?: string; readonly text?: string }[];
}) {
  return {
    anchorId: address.anchorId,
    line: address.line,
    offset: address.offset,
    headingPath: address.headingPath.map(titleOf),
  };
}

function normalizeNode(node: {
  readonly anchorId: string;
  readonly anchorLine: number;
  readonly headingLine: number;
  readonly heading: { readonly level: number; readonly title?: string; readonly text?: string };
  readonly headingPath: readonly { readonly level: number; readonly title?: string; readonly text?: string }[];
  readonly start: number;
  readonly end: number;
  readonly subtree: string;
}) {
  return {
    anchorId: node.anchorId,
    anchorLine: node.anchorLine,
    headingLine: node.headingLine,
    heading: titleOf(node.heading),
    headingPath: node.headingPath.map(titleOf),
    start: node.start,
    end: node.end,
    subtree: node.subtree,
  };
}

function normalizeSection(section: {
  readonly diagnosticLine: number;
  readonly heading: { readonly level: number; readonly title?: string; readonly text?: string };
  readonly headingPath: readonly { readonly level: number; readonly title?: string; readonly text?: string }[];
  readonly anchorId: string | null;
  readonly start: number;
  readonly end: number;
  readonly content: string;
}) {
  return {
    diagnosticLine: section.diagnosticLine,
    heading: titleOf(section.heading),
    headingPath: section.headingPath.map(titleOf),
    anchorId: section.anchorId,
    start: section.start,
    end: section.end,
    content: section.content,
  };
}

const blockId = "REQ_A";
const beginMarker = `<!-- мтс:требование:${blockId}:начало -->`;
const endMarker = `<!-- мтс:требование:${blockId}:конец -->`;
const blockSpec = { blockId, beginMarker, endMarker };
const options = { transparentOwnedBlocks: [blockSpec] };

const source = [
  '<a id="root"></a>',
  "# Root",
  "Root payload.",
  "",
  '<a id="node-a"></a>',
  beginMarker,
  "> generated metadata",
  endMarker,
  "## Node A",
  "Authored A.",
  "",
  '<a id="node-a1"></a>',
  "### Node A1",
  "Authored A1.",
  "",
  '<a id="node-b"></a>',
  "## Node B",
  "Authored B.",
  "",
  "~~~html",
  '<a id="fake"></a>',
  beginMarker,
  endMarker,
  "~~~",
].join("\n");

const tempRoot = mkdtempSync(resolve(tmpdir(), "anum-docs-repo-guard-diff-"));
const cloneRoot = resolve(tempRoot, "repo-guard");

try {
  run("git", ["clone", "--quiet", "--filter=blob:none", REPO_GUARD_URL, cloneRoot]);
  run("git", ["checkout", "--quiet", "--detach", REPO_GUARD_SHA], cloneRoot);
  const checked = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: cloneRoot,
    encoding: "utf8",
  });
  assert.equal(checked.status, 0);
  assert.equal(checked.stdout.trim(), REPO_GUARD_SHA, "differential must execute the pinned repo-guard SHA");

  // projection-api.mjs is the released public consumer surface. Resolve its
  // production dependencies from the exact pinned checkout, rather than
  // reaching into an internal leaf module that happened to be dependency-free.
  run("npm", ["ci", "--ignore-scripts", "--no-audit", "--no-fund", "--omit=dev"], cloneRoot);

  const upstream = await import(
    pathToFileURL(resolve(cloneRoot, "dist/projection-api.mjs")).href
  );

  assert.deepEqual(
    upstream.listMarkdownAnchorIds(source),
    localListMarkdownAnchorIds(source),
    "stable anchor inventory must match",
  );

  for (const id of ["root", "node-a", "node-a1", "node-b"]) {
    assert.deepEqual(
      normalizeAddress(upstream.resolveMarkdownAnchor(source, id)),
      normalizeAddress(localResolveMarkdownAnchor(source, id)),
      `anchor address must match for ${id}`,
    );
  }

  for (const id of ["root", "node-a", "node-a1", "node-b"]) {
    assert.deepEqual(
      normalizeNode(upstream.readMarkdownNode(source, id, options)),
      normalizeNode(localReadMarkdownNode(source, id)),
      `canonical node must match for ${id}`,
    );
  }

  for (const id of ["root", "node-a"]) {
    assert.deepEqual(
      upstream.listMarkdownChildren(source, id, options).map((node: { anchorId: string }) => node.anchorId),
      localListMarkdownChildren(source, id).map((node) => node.anchorId),
      `child inventory must match for ${id}`,
    );
  }

  assert.deepEqual(
    upstream.listMarkdownSections(source, options).map(normalizeSection),
    localListMarkdownSections(source).map(normalizeSection),
    "section inventory and byte ranges must match",
  );

  const upstreamOwned = upstream.readOwnedMarkdownBlock(source, blockSpec);
  const localOwned = localReadOwnedMarkdownBlock(source, blockId);
  assert.deepEqual(upstreamOwned, localOwned, "owned-block byte identity must match");

  // #622: a caller-owned region precedes Node A's heading. Local MTS
  // insertion sees the region; upstream must see it only with explicit options.
  const nestedChild = { anchorId: "node-a2", title: "Node A2", payload: "Authored A2." };
  const upstreamNested = upstream.insertMarkdownChild({
    source,
    mode: "hybrid",
    parentAnchorId: "node-a",
    child: nestedChild,
    options,
  }) as string;
  const localNested = localInsertMarkdownChild({
    source,
    mode: "hybrid",
    parentAnchorId: "node-a",
    child: nestedChild,
  });
  assert.equal(upstreamNested, localNested,
    "hybrid insertion under transparent owned metadata is byte-identical");
  assert.deepEqual(
    normalizeNode(upstream.readMarkdownNode(upstreamNested, "node-a", options)),
    normalizeNode(localReadMarkdownNode(localNested, "node-a")),
    "transparent parent survives insertion",
  );
  assert.deepEqual(
    normalizeNode(upstream.readMarkdownNode(upstreamNested, nestedChild.anchorId, options)),
    normalizeNode(localReadMarkdownNode(localNested, nestedChild.anchorId)),
    "inserted child has the same canonical coordinates",
  );
  assert.deepEqual(
    upstream.listMarkdownChildren(upstreamNested, "node-a", options).map((node: { anchorId: string }) => node.anchorId),
    localListMarkdownChildren(localNested, "node-a").map((node) => node.anchorId),
    "all previous children and the new child survive",
  );
  for (const id of ["root", "node-a", "node-a1", "node-b"]) {
    assert.deepEqual(upstream.resolveMarkdownAnchor(upstreamNested, id),
      upstream.resolveMarkdownAnchor(localNested, id),
      \`original anchor \${id} remains at its expected coordinates\`);
  }
  // The source is untouched on *both* sides of the insertion, byte for byte.
  const insertionAt = localReadMarkdownNode(source, "node-a").end;
  const insertLength = Buffer.byteLength(upstreamNested) - Buffer.byteLength(source);
  assert.ok(insertLength > 0);
  const originalPrefix = Buffer.from(source.slice(0, insertionAt), "utf8");
  const originalSuffix = Buffer.from(source.slice(insertionAt), "utf8");
  const generated = Buffer.from(upstreamNested, "utf8");
  assert.ok(generated.subarray(0, originalPrefix.length).equals(originalPrefix),
    "UTF-8 prefix outside insertion remains exact");
  assert.ok(generated.subarray(originalPrefix.length + insertLength).equals(originalSuffix),
    "UTF-8 suffix outside insertion remains exact");
  assert.equal(upstream.readOwnedMarkdownBlock(upstreamNested, blockSpec)?.content,
    upstream.readOwnedMarkdownBlock(source, blockSpec)?.content,
    "owned metadata bytes remain exact");

  const crlf = source.replace(/\n/g, "\r\n");
  const crlfNested = upstream.insertMarkdownChild({
    source: crlf, mode: "hybrid", parentAnchorId: "node-a", child: nestedChild, options,
  });
  assert.equal(crlfNested, localInsertMarkdownChild({
    source: crlf, mode: "hybrid", parentAnchorId: "node-a", child: nestedChild,
  }), "CRLF hybrid insertion is byte-identical");

  assert.throws(() => upstream.insertMarkdownChild({
    source, mode: "hybrid", parentAnchorId: "node-a", child: nestedChild,
  }), /not a canonical tree node/, "omitting options must retain strict behavior");
  for (const mode of ["source", "generated"] as const) {
    assert.throws(() => upstream.insertMarkdownChild({
      source, mode, parentAnchorId: "node-a", child: nestedChild, options,
    }), /read-only|not supported/, \`mode \${mode} must forbid insertion\`);
  }
  assert.throws(() => upstream.insertMarkdownChild({
    source, mode: "hybrid", parentAnchorId: "node-a",
    child: { ...nestedChild, anchorId: "node-a1" }, options,
  }), /duplicated/, "existing child anchor ID cannot be reused");
  for (const invalid of [
    source.replace(endMarker, ""),
    source.replace(beginMarker, ""),
    source.replace(beginMarker, endMarker).replace(endMarker, beginMarker),
    source.replace(beginMarker, \`\${beginMarker}\n\${beginMarker}\`),
  ]) {
    assert.throws(() => upstream.insertMarkdownChild({
      source: invalid, mode: "hybrid", parentAnchorId: "node-a", child: nestedChild, options,
    }), /malformed owned block|end must follow begin/,
    "transparent caller-owned region must fail closed on malformed markers");
  }
  const authored = source.replace(
    [beginMarker, "> generated metadata", endMarker].join("\n"),
    "ordinary authored text",
  );
  assert.throws(() => upstream.insertMarkdownChild({
    source: authored, mode: "hybrid", parentAnchorId: "node-a", child: nestedChild, options,
  }), /not a canonical tree node/, "ordinary authored prose must not become transparent");

  // Compile a real strict NodeNext consumer of the pinned public .d.mts.
  // Dynamic JS import in this test does not by itself validate TypeScript API.
  const consumer = resolve(tempRoot, "typed-consumer.mts");
  writeFileSync(consumer, [
    'import { insertMarkdownChild, type MarkdownStructureOptions } from "./repo-guard/dist/projection-api.mjs";',
    'const options: MarkdownStructureOptions = { transparentOwnedBlocks: [{',
    '  blockId: "REQ_A", beginMarker: "<!-- begin -->", endMarker: "<!-- end -->",',
    '}] };',
    'const source: string = "<a id=\\"root\\"></a>\\n# Root\\n";',
    'const args = { source, mode: "hybrid" as const, parentAnchorId: "root",',
    '  child: { anchorId: "child", title: "Child" } };',
    'const strict: string = insertMarkdownChild(args);',
    'const transparent: string = insertMarkdownChild({ ...args, options });',
    'void [strict, transparent];',
    '// @ts-expect-error transparency must be a typed block list, not a string',
    'insertMarkdownChild({ ...args, options: { transparentOwnedBlocks: "not-an-array" } });',
  ].join("\n"));
  run(process.execPath, [
    resolve("node_modules/typescript/bin/tsc.js"),
    "--noEmit", "--strict", "--exactOptionalPropertyTypes",
    "--noUncheckedIndexedAccess", "--skipLibCheck",
    "--module", "NodeNext", "--moduleResolution", "NodeNext",
    "--target", "ES2022", consumer,
  ]);
  console.log("MDDB_INSERT_HYBRID_DIFFERENTIAL=PASS");
  console.log("MDDB_INSERT_STRICT_NODENEXT=PASS");

  const updatedLocal = localReplaceOwnedMarkdownSection({
    source,
    mode: "hybrid",
    anchorId: "node-a",
    blockId,
    generatedContent: "> generated metadata v2",
  });
  const updatedUpstream = upstream.replaceOwnedMarkdownBlock({
    source,
    mode: "hybrid",
    anchorId: "node-a",
    block: blockSpec,
    generatedContent: "> generated metadata v2",
  });
  assert.equal(updatedUpstream, updatedLocal, "owned-block replacement must be byte-identical");

  const child = { anchorId: "node-c", title: "Node C", payload: "Authored C." };
  assert.equal(
    upstream.insertMarkdownChild({
      source,
      mode: "hybrid",
      parentAnchorId: "root",
      child,
    }),
    localInsertMarkdownChild({
      source,
      mode: "hybrid",
      parentAnchorId: "root",
      child,
    }),
    "child insertion must be byte-identical for a canonical parent",
  );

  assert.throws(
    () => upstream.readMarkdownNode(source, "node-a"),
    /not a canonical tree node/,
    "upstream must require explicit consumer-owned transparency",
  );

  const ordinary = source.replace(
    [beginMarker, "> generated metadata", endMarker].join("\n"),
    "ordinary authored text",
  );
  assert.throws(() => localReadMarkdownNode(ordinary, "node-a"), /not a canonical tree node/);
  assert.throws(() => upstream.readMarkdownNode(ordinary, "node-a", options), /not a canonical tree node/);

  const malformed = source.replace(endMarker, "");
  assert.throws(() => localReadOwnedMarkdownBlock(malformed, blockId), /malformed owned block/);
  assert.throws(() => upstream.readOwnedMarkdownBlock(malformed, blockSpec), /malformed owned block/);

  assert.equal(localListMarkdownAnchorIds(source).includes("fake"), false);
  assert.equal(upstream.listMarkdownAnchorIds(source).includes("fake"), false);

  console.log(
    `repo-guard MDDB differential passed against exact SHA ${REPO_GUARD_SHA}`,
  );
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}
