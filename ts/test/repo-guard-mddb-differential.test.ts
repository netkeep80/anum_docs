import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  listMarkdownAnchorIds as localListMarkdownAnchorIds,
  listOwnedMarkdownBlockIds as localListOwnedMarkdownBlockIds,
  listRepositoryMarkdownSurface,
  listMarkdownChildren as localListMarkdownChildren,
  listMarkdownSections as localListMarkdownSections,
  readMarkdownNode as localReadMarkdownNode,
  readOwnedMarkdownBlock as localReadOwnedMarkdownBlock,
  replaceOwnedMarkdownSection as localReplaceOwnedMarkdownSection,
  resolveMarkdownAnchor as localResolveMarkdownAnchor,
} from "../src/tooling/markdown-section-adapter.js";

const REPO_GUARD_SHA = "10f04af309fcb512dff3d690f595926472c52f40";
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

  // Stage A (#2115) proved exact byte-equivalence with MTS-local insertion.
  // Stage B removes that generic implementation. Keep a fixed, independently
  // specified expected fixture: no reimplementation of Markdown insertion.
  const nestedChild = { anchorId: "node-a2", title: "Node A2", payload: "Authored A2." };
  const expectedNested = source.replace(
    '<a id="node-b"></a>',
    '<a id="node-a2"></a>\n### Node A2\nAuthored A2.\n\n<a id="node-b"></a>',
  );
  assert.notEqual(expectedNested, source, "expected insertion boundary exists");
  const upstreamNested = upstream.insertMarkdownChild({
    source, mode: "hybrid", parentAnchorId: "node-a", child: nestedChild, options,
  }) as string;
  assert.equal(upstreamNested, expectedNested, "hybrid insertion matches exact accepted fixture");
  assert.deepEqual(
    normalizeNode(upstream.readMarkdownNode(upstreamNested, "node-a", options)),
    normalizeNode(localReadMarkdownNode(expectedNested, "node-a")),
    "canonical parent preserves the accepted MTS read coordinates",
  );
  assert.deepEqual(
    normalizeNode(upstream.readMarkdownNode(upstreamNested, nestedChild.anchorId, options)),
    normalizeNode(localReadMarkdownNode(expectedNested, nestedChild.anchorId)),
    "new child preserves the accepted MTS read coordinates",
  );
  assert.deepEqual(
    upstream.listMarkdownChildren(upstreamNested, "node-a", options).map((node: { anchorId: string }) => node.anchorId),
    localListMarkdownChildren(expectedNested, "node-a").map((node) => node.anchorId),
    "previous children and inserted child retain accepted IDs",
  );
  for (const id of ["root", "node-a", "node-a1", "node-b"]) {
    assert.deepEqual(upstream.resolveMarkdownAnchor(upstreamNested, id),
      upstream.resolveMarkdownAnchor(expectedNested, id),
      `original anchor ${id} remains at expected coordinates`);
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
  assert.equal(crlfNested, crlf.replace(
    '<a id="node-b"></a>',
    '<a id="node-a2"></a>\r\n### Node A2\r\nAuthored A2.\r\n\r\n<a id="node-b"></a>',
  ), "CRLF hybrid insertion matches exact expected bytes");

  assert.throws(() => upstream.insertMarkdownChild({
    source, mode: "hybrid", parentAnchorId: "node-a", child: nestedChild,
  }), /not a canonical tree node/, "omitting options must retain strict behavior");
  for (const mode of ["source", "generated"] as const) {
    assert.throws(() => upstream.insertMarkdownChild({
      source, mode, parentAnchorId: "node-a", child: nestedChild, options,
    }), /read-only|not supported/, `mode ${mode} must forbid insertion`);
  }
  assert.throws(() => upstream.insertMarkdownChild({
    source, mode: "hybrid", parentAnchorId: "node-a",
    child: { ...nestedChild, anchorId: "node-a1" }, options,
  }), /duplicated/, "existing child anchor ID cannot be reused");
  for (const invalid of [
    source.replace(endMarker, ""),
    source.replace(beginMarker, ""),
    source.replace(beginMarker, "__BEGIN__").replace(endMarker, beginMarker).replace("__BEGIN__", endMarker),
    source.replace(beginMarker, `${beginMarker}\n${beginMarker}`),
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
    resolve("node_modules/typescript/bin/tsc"),
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
  assert.equal(upstream.insertMarkdownChild({
    source, mode: "hybrid", parentAnchorId: "root", child,
  }), source + '\n<a id="node-c"></a>\n## Node C\nAuthored C.\n\n',
  "strict parent insertion matches exact accepted fixture");

  for (const badPayload of ["## hidden heading", '<a id="hidden"></a>']) {
    assert.throws(() => upstream.insertMarkdownChild({
      source, mode: "hybrid", parentAnchorId: "root",
      child: { anchorId: "invalid-payload", title: "Invalid", payload: badPayload },
    }), /payload cannot contain headings or stable anchors/);
  }
  assert.throws(() => upstream.insertMarkdownChild({
    source: '<a id="deep"></a>\n###### Depth 6\n',
    mode: "hybrid", parentAnchorId: "deep",
    child: { anchorId: "too-deep", title: "Too deep" },
  }), /heading level 6 cannot have/);

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

  // Compare the public v3.2.3 API against the actual tracked Markdown
  // corpus, not just the synthetic canonical-tree fixture above. No writes.
  const repositoryRoot = [process.cwd(), resolve(process.cwd(), "..")].find(
    (candidate) => existsSync(resolve(candidate, "repo-policy.json")),
  );
  assert.ok(repositoryRoot !== undefined, "real-document parity requires the checked-out repository");
  const realSurfaces = listRepositoryMarkdownSurface(repositoryRoot);
  assert.ok(realSurfaces.length >= 10, "real-document parity corpus must contain current reader surfaces");
  let checkedAnchors = 0;
  let checkedBlocks = 0;
  let checkedSections = 0;
  for (const path of realSurfaces) {
    const actualSource = readFileSync(resolve(repositoryRoot, path), "utf8");
    const ownedIds = localListOwnedMarkdownBlockIds(actualSource);
    const actualOptions = {
      transparentOwnedBlocks: ownedIds.map((id) => ({
        blockId: id,
        beginMarker: `<!-- мтс:требование:${id}:начало -->`,
        endMarker: `<!-- мтс:требование:${id}:конец -->`,
      })),
    };
    const localAnchors = localListMarkdownAnchorIds(actualSource);
    assert.deepEqual(upstream.listMarkdownAnchorIds(actualSource), localAnchors,
      `${path}: real stable anchor inventory differs`);
    for (const id of localAnchors) {
      assert.deepEqual(
        normalizeAddress(upstream.resolveMarkdownAnchor(actualSource, id)),
        normalizeAddress(localResolveMarkdownAnchor(actualSource, id)),
        `${path}/${id}: real anchor address differs`,
      );
      checkedAnchors += 1;
    }
    const localSections = localListMarkdownSections(actualSource).map(normalizeSection);
    const publicSections = upstream.listMarkdownSections(actualSource, actualOptions).map(normalizeSection);
    assert.deepEqual(publicSections, localSections,
      `${path}: real sections, heading paths and byte ranges differ`);
    for (const section of publicSections) {
      assert.equal(actualSource.slice(section.start, section.end), section.content,
        `${path}: reported section content differs from exact source bytes`);
    }
    checkedSections += publicSections.length;
    for (const block of actualOptions.transparentOwnedBlocks) {
      assert.deepEqual(
        upstream.readOwnedMarkdownBlock(actualSource, block),
        localReadOwnedMarkdownBlock(actualSource, block.blockId),
        `${path}/${block.blockId}: real MTS owned-block byte identity differs`,
      );
      checkedBlocks += 1;
    }
  }
  console.log(
    `MDDB_REAL_DOCS_DIFFERENTIAL=PASS files=${realSurfaces.length} anchors=${checkedAnchors} sections=${checkedSections} ownedBlocks=${checkedBlocks}`,
  );

  console.log(
    `repo-guard MDDB differential passed against exact SHA ${REPO_GUARD_SHA}`,
  );
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}
