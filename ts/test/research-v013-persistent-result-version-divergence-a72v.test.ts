import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
} from "../src/memory.js";
import { defineContext, readContext } from "../src/state.js";

function assert(c: unknown, m: string): asserts c {
  if (!c) throw new Error("v0.13 A72v persistent Result version divergence: " + m);
}

function same<T>(a: T, e: T, m: string): void {
  assert(Object.is(a, e), m + ": values differ");
}

interface VersionTree {
  readonly root: LinkHandle;
  readonly right: LinkHandle;
  readonly left: LinkHandle;
  readonly middle: LinkHandle;
  readonly deep: LinkHandle;
}

function readVersionTree(
  memory: Memory,
  root: LinkHandle,
): VersionTree {
  const rp = memory.poles(root);
  const right = rp.end;
  const rightPoles = memory.poles(right);

  return Object.freeze({
    root,
    right,
    left: rp.start,
    middle: rightPoles.start,
    deep: rightPoles.end,
  });
}

function buildVersionTree(
  memory: Memory,
  left: LinkHandle,
  middle: LinkHandle,
  deep: LinkHandle,
): VersionTree {
  const right = memory.ensure(middle, deep);
  const root = memory.ensure(left, right);
  return readVersionTree(memory, root);
}

function replaceLeft(
  memory: Memory,
  base: VersionTree,
  value: LinkHandle,
): VersionTree {
  return buildVersionTree(
    memory,
    value,
    base.middle,
    base.deep,
  );
}

function replaceDeep(
  memory: Memory,
  base: VersionTree,
  value: LinkHandle,
): VersionTree {
  return buildVersionTree(
    memory,
    base.left,
    base.middle,
    value,
  );
}

/**
 * Experimental persistent-version reference:
 *
 *   Context -> (BASE_ROLE   -> versionRoot)
 *   Context -> (TARGET_ROLE -> targetSlot)
 *
 * Both roles are test vocabulary only.
 */
function bindReference(
  memory: Memory,
  context: LinkHandle,
  role: LinkHandle,
  value: LinkHandle,
): LinkHandle {
  readContext(memory, context);
  return memory.ensure(context, memory.ensure(role, value));
}

function readReference(
  memory: Memory,
  context: LinkHandle,
  role: LinkHandle,
): LinkHandle {
  readContext(memory, context);

  const matches: LinkHandle[] = [];

  for (const attachment of memory.outgoing(context)) {
    if (attachment === context) continue;

    const a = memory.poles(attachment);
    if (a.start !== context) continue;

    const ref = memory.poles(a.end);
    if (ref.start !== role) continue;

    if (!matches.includes(ref.end)) matches.push(ref.end);
  }

  same(matches.length, 1, "Context structural reference cardinality");
  return matches[0]!;
}

function exercise(): void {
  const memory = new Memory();
  const b = ensureRootBasis(memory);

  let seed = memory.ensure(b.U, b.L);
  const fresh: LinkHandle[] = [];

  for (let i = 0; i < 48; i += 1) {
    seed = memory.ensure(seed, i % 2 === 0 ? b.O : b.C);
    fresh.push(seed);
  }

  const at = (i: number): LinkHandle => {
    const value = fresh[i];
    assert(value !== undefined, "fresh anchor " + i);
    return value;
  };

  const ROOT_PARENT = memory.ensure(at(0), at(1));

  const EMPTY_LEFT = memory.ensure(at(2), at(3));
  const EMPTY_MIDDLE = memory.ensure(at(4), at(5));
  const EMPTY_DEEP = memory.ensure(at(6), at(7));

  const TRUE = memory.ensure(at(8), at(9));

  const BASE_ROLE = memory.ensure(at(10), at(11));
  const TARGET_ROLE = memory.ensure(at(12), at(13));

  const base = buildVersionTree(
    memory,
    EMPTY_LEFT,
    EMPTY_MIDDLE,
    EMPTY_DEEP,
  );

  const rootContext =
    defineContext(memory, ROOT_PARENT, base.root);

  const leftContext =
    defineContext(memory, rootContext, TRUE);

  const deepContext =
    defineContext(memory, rootContext, TRUE);

  bindReference(memory, leftContext, BASE_ROLE, base.root);
  bindReference(memory, leftContext, TARGET_ROLE, EMPTY_LEFT);

  bindReference(memory, deepContext, BASE_ROLE, base.root);
  bindReference(memory, deepContext, TARGET_ROLE, EMPTY_DEEP);

  same(readReference(memory, leftContext, BASE_ROLE), base.root,
    "left sibling starts from base version");
  same(readReference(memory, deepContext, BASE_ROLE), base.root,
    "deep sibling starts from same base version");

  same(readReference(memory, leftContext, TARGET_ROLE), EMPTY_LEFT,
    "left sibling targets left placeholder");
  same(readReference(memory, deepContext, TARGET_ROLE), EMPTY_DEEP,
    "deep sibling targets deep placeholder");

  const leftBase =
    readVersionTree(memory, readReference(memory, leftContext, BASE_ROLE));
  const deepBase =
    readVersionTree(memory, readReference(memory, deepContext, BASE_ROLE));

  const leftVersion = replaceLeft(memory, leftBase, TRUE);
  const deepVersion = replaceDeep(memory, deepBase, TRUE);

  assert(leftVersion.root !== base.root,
    "left path-copy creates a new root version");
  assert(deepVersion.root !== base.root,
    "deep path-copy creates a new root version");
  assert(leftVersion.root !== deepVersion.root,
    "independent sibling path-copies diverge");

  same(leftVersion.left, TRUE,
    "left version contains left update");
  same(leftVersion.deep, EMPTY_DEEP,
    "left version does not contain sibling deep update");

  same(deepVersion.left, EMPTY_LEFT,
    "deep version does not contain sibling left update");
  same(deepVersion.deep, TRUE,
    "deep version contains deep update");

  same(leftVersion.middle, EMPTY_MIDDLE,
    "left version preserves middle subtree value");
  same(deepVersion.middle, EMPTY_MIDDLE,
    "deep version preserves middle subtree value");

  const merged = buildVersionTree(
    memory,
    TRUE,
    EMPTY_MIDDLE,
    TRUE,
  );

  assert(merged.root !== leftVersion.root,
    "merged state is a third immutable root");
  assert(merged.root !== deepVersion.root,
    "neither sibling version is automatically authoritative");
  same(merged.left, TRUE, "merged root contains left result");
  same(merged.deep, TRUE, "merged root contains deep result");

  // Canonicality preserves equal structures but does not infer merge intent.
  same(
    buildVersionTree(memory, TRUE, EMPTY_MIDDLE, TRUE).root,
    merged.root,
    "canonicality deduplicates the same merged structure",
  );

  assert(
    memory.find(leftVersion.left, leftVersion.right) === leftVersion.root,
    "left version remains canonical and addressable",
  );
  assert(
    memory.find(deepVersion.left, deepVersion.right) === deepVersion.root,
    "deep version remains canonical and addressable",
  );
  assert(
    memory.find(merged.left, merged.right) === merged.root,
    "merged version remains canonical and addressable",
  );

  // The sibling Context references remain pinned to the old base unless some
  // additional mechanism explicitly rebases or merges them.
  same(readReference(memory, leftContext, BASE_ROLE), base.root,
    "left Context base reference remains old immutable version");
  same(readReference(memory, deepContext, BASE_ROLE), base.root,
    "deep Context base reference remains old immutable version");

  // This is the central falsifier: pure path-copy plus canonicality does not
  // establish a unique current root after independent sibling updates.
  const candidateRoots = [
    leftVersion.root,
    deepVersion.root,
  ];

  same(candidateRoots.length, 2,
    "two sibling completions yield two incomparable candidate roots");
  assert(!candidateRoots.includes(merged.root),
    "correct merged root is not produced automatically");

  // A host-side "current root" pointer or an explicit structural merge/rebase
  // law would be needed to choose/build the combined version.
}

function staticGuards(): void {
  const root = resolve(process.cwd(), "..");
  const own = readFileSync(
    join(
      root,
      "ts/test/research-v013-persistent-result-version-divergence-a72v.test.ts",
    ),
    "utf8",
  );

  const executable = own.slice(
    0,
    own.indexOf("function staticGuards(): void {"),
  );

  for (const forbidden of [
    "currentResult",
    "current_root",
    "currentRoot",
    "hostCurrent",
    "switch(",
  ]) {
    assert(!executable.includes(forbidden),
      "A72v does not solve divergence by host current-root pointer: " + forbidden);
  }

  assert(executable.includes("leftVersion = replaceLeft"),
    "left sibling uses immutable path-copy");
  assert(executable.includes("deepVersion = replaceDeep"),
    "deep sibling uses immutable path-copy");
  assert(executable.includes("leftVersion.root !== deepVersion.root"),
    "independent sibling versions must diverge");
  assert(executable.includes("correct merged root is not produced automatically"),
    "test retains explicit merge falsifier");

  const a72u = readFileSync(
    join(root, "ts/test/research-v013-dual-tree-result-slots-a72u.test.ts"),
    "utf8",
  );
  assert(
    a72u.includes("DUAL_TREE_SINGLE_ASSIGNMENT_RESULT_SLOTS=GREEN_SCOPED_RESEARCH"),
    "A72u stable-root slot variant remains retained",
  );
}

function main(): void {
  exercise();
  staticGuards();

  console.log([
    "MTS v0.13 A72v: PERSISTENT_RESULT_VERSION_SIBLING_DIVERGENCE=GREEN_SCOPED_FALSIFIER",
    "VARIANT=PERSISTENT_IMMUTABLE_PATH_COPY",
    "SIBLING_CONTEXTS_SHARE_BASE_VERSION=TRUE",
    "LEFT_UPDATE_CREATES_NEW_ROOT=TRUE",
    "DEEP_UPDATE_CREATES_NEW_ROOT=TRUE",
    "SIBLING_RESULT_ROOTS_DIVERGE=TRUE",
    "CANONICALITY_AUTOMATICALLY_MERGES_SIBLINGS=FALSE",
    "CORRECT_COMBINED_RESULT_REQUIRES_THIRD_ROOT=TRUE",
    "CONTEXT_BASE_REFERENCES_REMAIN_OLD_VERSION=TRUE",
    "CURRENT_RESULT_AUTHORITY=UNRESOLVED",
    "REQUIRED_EXTRA_MECHANISM=MERGE_OR_REBASE_OR_CURRENT_ROOT_AUTHORITY",
    "HOST_CURRENT_ROOT_POINTER_USED=FALSE",
    "TARGET_ROLE=EXPERIMENTAL_REFERENCE_VOCABULARY",
    "BASE_ROLE=EXPERIMENTAL_REFERENCE_VOCABULARY",
    "A72U_STABLE_SINGLE_ASSIGNMENT_ROOT=STRONGER_FOR_MONOTONE_CONSTRUCTION",
    "NEXT=A72W_FRAGMENT_RETURN_PARENT_COMPOSITION",
    "FULL_SELF_HOSTED=FALSE",
    "V013_NOT_ACCEPTED PRODUCTION_UNCHANGED",
  ].join(" "));
}

main();
