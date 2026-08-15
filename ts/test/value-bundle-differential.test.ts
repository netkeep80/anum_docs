import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { Memory, type LinkHandle } from "../src/memory.js";
import {
  BUNDLE_KIND_ORDER,
  BundleElaborationError,
  ValueBundleReplayError,
  elaborateBundleRoles,
  expandResolvedBundleQuery,
  resolveFlatBundle,
  valuesEqual,
  type BundleNodeKind,
  type BundleValue,
  type ExpectedRole,
  type LinkValue,
  type MtsValue,
  type ResolvedOccurrence,
  type ValueBundleVocabulary,
} from "../src/value-bundle.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
interface BundleCase { readonly id: string; readonly operation: string; }
interface Corpus {
  readonly schema: string;
  readonly contract: string;
  readonly pythonOracleSha: string;
  readonly cases: readonly BundleCase[];
}
interface Result {
  readonly id: string;
  readonly accepted: boolean;
  readonly observable?: Json;
  readonly error?: string;
  readonly path?: readonly number[];
}

function canonical(value: Json): Json {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonical(item)]),
    );
  }
  return value;
}
function sameJson(left: Json, right: Json): boolean {
  return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
}

function staticFixture() {
  const memory = new Memory();
  const startAnchor = memory.ensureStartSelfClosed(memory.root);
  const endAnchor = memory.ensureEndSelfClosed(memory.root);
  const kindSeed = memory.ensure(startAnchor, endAnchor);
  let current = memory.root;
  const kindTags: LinkHandle[] = [];
  for (const _kind of BUNDLE_KIND_ORDER) {
    current = memory.ensure(current, kindSeed);
    kindTags.push(current);
  }
  const vocabulary: ValueBundleVocabulary = Object.freeze({
    startAnchor, endAnchor, kindSeed, kindTags: Object.freeze(kindTags),
  });
  const fold = (values: readonly LinkHandle[]): LinkHandle => {
    let prefix = memory.root;
    for (const value of values) prefix = memory.ensure(prefix, value);
    return prefix;
  };
  const node = (kind: BundleNodeKind, ...children: LinkHandle[]): LinkHandle => {
    const tag = kindTags[BUNDLE_KIND_ORDER.indexOf(kind)];
    assert(tag !== undefined, `missing ValueBundle kind tag ${kind}`);
    return memory.ensure(tag, fold(children));
  };
  const scalar = (): LinkHandle => node("scalar");
  const bundle = (...children: LinkHandle[]): LinkHandle => node("bundle", ...children);
  const comparison = (left: LinkHandle, right: LinkHandle): LinkHandle => node("comparison", left, right);
  return { memory, vocabulary, node, scalar, bundle, comparison };
}

function staticResult(
  test: BundleCase,
  f: ReturnType<typeof staticFixture>,
  carrier: LinkHandle,
  entry: ExpectedRole = "none",
): Result {
  const before = f.memory.linkCount;
  try {
    const result = elaborateBundleRoles(f.memory, carrier, f.vocabulary, entry);
    return {
      id: test.id,
      accepted: true,
      observable: {
        roles: result.roles.map((item) => ({ path: [...item.path], role: item.role })),
        readOnlyCountStable: before === f.memory.linkCount,
      },
    };
  } catch (error) {
    if (error instanceof BundleElaborationError) {
      return { id: test.id, accepted: false, error: error.code, path: [...error.path] };
    }
    if (error instanceof ValueBundleReplayError) {
      return { id: test.id, accepted: false, error: "invalid-value-bundle-evidence" };
    }
    throw error;
  }
}

function expansionFixture() {
  const memory = new Memory();
  const root = memory.root;
  const one = memory.ensureEndSelfClosed(root);
  const two = memory.ensure(one, root);
  const three = memory.ensure(one, one);
  const labels = new Map<LinkHandle, string>([
    [root, "root"], [one, "one"], [two, "two"], [three, "three"],
  ]);
  return { memory, root, one, two, three, labels };
}
function occurrence(path: readonly number[], link: LinkHandle): ResolvedOccurrence {
  return Object.freeze({ path: Object.freeze([...path]), link });
}
function scalarValue(link: LinkHandle): LinkValue {
  return Object.freeze({ kind: "link", link });
}
function bundleValue(memory: Memory, ...links: LinkHandle[]): BundleValue {
  return resolveFlatBundle(memory, links.map((link, index) => occurrence([index], link)));
}
function linkLabels(links: ReadonlySet<LinkHandle>, labels: ReadonlyMap<LinkHandle, string>): string[] {
  return [...links].map((link) => {
    const label = labels.get(link);
    assert(label !== undefined, "missing portable ValueBundle fixture label");
    return label;
  }).sort();
}

function run(test: BundleCase): Result {
  if (test.operation.startsWith("role-") || test.operation.startsWith("error-")) {
    const f = staticFixture();
    let carrier: LinkHandle;
    let entry: ExpectedRole = "none";
    if (test.operation === "role-constraint") {
      carrier = f.bundle(f.comparison(f.scalar(), f.scalar()), f.comparison(f.scalar(), f.scalar()));
    } else if (test.operation === "role-value") {
      carrier = f.bundle(f.scalar(), f.scalar());
    } else if (test.operation === "role-empty-constraint") {
      carrier = f.bundle();
      entry = "constraint";
    } else if (test.operation === "role-shared-paths") {
      const shared = f.bundle();
      carrier = f.comparison(shared, shared);
    } else if (test.operation === "error-mixed") {
      carrier = f.bundle(f.scalar(), f.comparison(f.scalar(), f.scalar()));
    } else if (test.operation === "error-ambiguous") {
      carrier = f.bundle(f.bundle());
    } else if (test.operation === "error-nested-value") {
      carrier = f.comparison(f.bundle(f.bundle(f.scalar(), f.scalar())), f.scalar());
    } else if (test.operation === "error-role-mismatch") {
      carrier = f.bundle(f.scalar(), f.scalar());
      entry = "constraint";
    } else if (test.operation === "error-definition-deferred") {
      carrier = f.node("definition", f.scalar(), f.bundle(f.scalar(), f.scalar()));
    } else if (test.operation === "error-scalar-operator") {
      carrier = f.node("unary", f.bundle(f.scalar(), f.scalar()));
    } else if (test.operation === "error-malformed-arity") {
      carrier = f.node("comparison", f.scalar());
    } else {
      throw new Error(`unknown ValueBundle static operation: ${test.operation}`);
    }
    return staticResult(test, f, carrier, entry);
  }

  if (test.operation === "resolved-provenance") {
    const f = expansionFixture();
    const before = f.memory.linkCount;
    const value = resolveFlatBundle(f.memory, [
      occurrence([0], f.one), occurrence([1], f.two), occurrence([2], f.one),
    ]);
    return {
      id: test.id,
      accepted: true,
      observable: {
        links: linkLabels(value.links, f.labels),
        occurrences: value.occurrences.map((item) => {
          const label = f.labels.get(item.link);
          assert(label !== undefined, "missing occurrence label");
          return { path: [...item.path], link: label };
        }),
        readOnlyCountStable: before === f.memory.linkCount,
      },
    };
  }

  if (test.operation === "resolved-equality") {
    const f = expansionFixture();
    const value = resolveFlatBundle(f.memory, [
      occurrence([0], f.one), occurrence([1], f.two), occurrence([2], f.one),
    ]);
    const reordered = resolveFlatBundle(f.memory, [occurrence([9], f.two), occurrence([8], f.one)]);
    const duplicateOnly = resolveFlatBundle(f.memory, [occurrence([0], f.one), occurrence([1], f.one)]);
    const singleton = resolveFlatBundle(f.memory, [occurrence([0], f.one)]);
    return {
      id: test.id,
      accepted: true,
      observable: {
        reorderedEqual: valuesEqual(value, reordered),
        duplicatesIdempotent: valuesEqual(duplicateOnly, singleton),
        differentSetsUnequal: !valuesEqual(value, singleton),
        sameScalarEqual: valuesEqual(scalarValue(f.one), scalarValue(f.one)),
        differentScalarUnequal: !valuesEqual(scalarValue(f.one), scalarValue(f.two)),
        singletonNotScalar: !valuesEqual(singleton, scalarValue(f.one)),
      },
    };
  }

  if (test.operation === "resolved-foreign") {
    const f = expansionFixture();
    const foreign = new Memory().root;
    try {
      resolveFlatBundle(f.memory, [occurrence([0], foreign)]);
    } catch (error) {
      if (error instanceof ValueBundleReplayError) {
        return { id: test.id, accepted: false, error: "invalid-value-bundle-evidence" };
      }
      throw error;
    }
    throw new Error("foreign resolved occurrence unexpectedly accepted");
  }

  if (test.operation === "expansion-matrix") {
    const f = expansionFixture();
    const before = f.memory.linkCount;
    const cases: readonly [string, MtsValue, MtsValue][] = [
      ["single-to-bundle", scalarValue(f.root), bundleValue(f.memory, f.root, f.one)],
      ["bundle-to-single", bundleValue(f.memory, f.root, f.one), scalarValue(f.one)],
      ["cartesian-existing", bundleValue(f.memory, f.root, f.one), bundleValue(f.memory, f.root, f.one)],
      ["outgoing-wildcard", scalarValue(f.root), bundleValue(f.memory)],
      ["incoming-wildcard", bundleValue(f.memory), scalarValue(f.one)],
      ["all-links-wildcard", bundleValue(f.memory), bundleValue(f.memory)],
      ["missing-pair-no-realize", scalarValue(f.root), bundleValue(f.memory, f.two)],
    ];
    const outputs = cases.map(([name, left, right]) => ({
      case: name,
      links: linkLabels(expandResolvedBundleQuery(f.memory, left, right).links, f.labels),
    }));
    return {
      id: test.id,
      accepted: true,
      observable: { outputs, readOnlyCountStable: before === f.memory.linkCount },
    };
  }

  if (test.operation === "expansion-scalar-scalar") {
    const f = expansionFixture();
    try {
      expandResolvedBundleQuery(f.memory, scalarValue(f.root), scalarValue(f.one));
    } catch (error) {
      if (error instanceof ValueBundleReplayError) {
        return { id: test.id, accepted: false, error: "invalid-value-bundle-evidence" };
      }
      throw error;
    }
    throw new Error("scalar-to-scalar expansion unexpectedly accepted");
  }

  if (test.operation === "expansion-foreign") {
    const f = expansionFixture();
    const foreign = new Memory().root;
    const forged: BundleValue = Object.freeze({
      kind: "bundle",
      links: new Set([foreign]) as ReadonlySet<LinkHandle>,
      occurrences: Object.freeze([]),
    });
    try {
      expandResolvedBundleQuery(f.memory, forged, scalarValue(f.one));
    } catch (error) {
      if (error instanceof ValueBundleReplayError) {
        return { id: test.id, accepted: false, error: "invalid-value-bundle-evidence" };
      }
      throw error;
    }
    throw new Error("foreign expansion endpoint unexpectedly accepted");
  }

  throw new Error(`unknown ValueBundle differential operation: ${test.operation}`);
}

const repoRoot = resolve(process.cwd(), "..");
const fixturePath = resolve(repoRoot, "differential/value-bundle-fixtures-v0.7.json");
const corpus = JSON.parse(readFileSync(fixturePath, "utf8")) as Corpus;
assert(corpus.schema === "mts-value-bundle-differential-fixtures/v0.1", "unexpected ValueBundle differential fixture schema");
assert(corpus.contract === "mts-contract/v0.7", "ValueBundle differential fixtures must select accepted v0.7 contract");
assert(corpus.pythonOracleSha === "ef42d91a868bbc5b7004acc325006ad27db3bb68", "ValueBundle fixtures must select frozen Python oracle");
const python = spawnSync(
  "python3",
  ["differential/value_bundle_python_oracle.py", "differential/value-bundle-fixtures-v0.7.json"],
  { cwd: repoRoot, encoding: "utf8" },
);
assert(python.status === 0, `frozen Python ValueBundle oracle failed: ${python.stderr || python.stdout}`);
const expected = JSON.parse(python.stdout) as Result[];
const actual = corpus.cases.map(run);
assert(expected.length === actual.length, "ValueBundle differential result cardinality mismatch");
expected.forEach((pythonResult, index) => {
  const tsResult = actual[index];
  assert(tsResult !== undefined, `missing TS ValueBundle result at ${index}`);
  assert(
    sameJson(pythonResult as unknown as Json, tsResult as unknown as Json),
    `ValueBundle differential mismatch for ${pythonResult.id}: Python=${JSON.stringify(pythonResult)} TS=${JSON.stringify(tsResult)}`,
  );
});
