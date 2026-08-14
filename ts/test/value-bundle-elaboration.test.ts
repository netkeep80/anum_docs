import { Memory, type LinkHandle, type LinkPoles, type ReadMemory } from "../src/memory.js";
import {
  BUNDLE_KIND_ORDER,
  BundleElaborationError,
  ValueBundleReplayError,
  bundleRoleAt,
  elaborateBundleRoles,
  type BundleNodeKind,
  type ExpectedRole,
  type ValueBundleVocabulary,
} from "../src/value-bundle.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}
function rejectCode(effect: () => unknown, code: string, path: readonly number[]): void {
  try { effect(); }
  catch (error) {
    assert(error instanceof BundleElaborationError, `expected BundleElaborationError, got ${String(error)}`);
    same(error.code, code, "bundle elaboration error code");
    same(error.path.join(","), path.join(","), "bundle elaboration error path");
    return;
  }
  throw new Error(`expected ${code}`);
}
function rejectReplay(effect: () => unknown): void {
  try { effect(); }
  catch (error) {
    assert(error instanceof ValueBundleReplayError, `expected ValueBundleReplayError, got ${String(error)}`);
    return;
  }
  throw new Error("expected invalid value bundle evidence");
}

function fixture() {
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
    assert(tag, `missing tag ${kind}`);
    return memory.ensure(tag, fold(children));
  };
  const scalar = (): LinkHandle => node("scalar");
  const bundle = (...children: LinkHandle[]): LinkHandle => node("bundle", ...children);
  const comparison = (left: LinkHandle, right: LinkHandle): LinkHandle => node("comparison", left, right);
  return { memory, vocabulary, node, scalar, bundle, comparison, fold };
}

function role(
  carrierFactory: (f: ReturnType<typeof fixture>) => LinkHandle,
  expected: "ConstraintBundle" | "ValueBundle",
  entry: ExpectedRole = "none",
  path: readonly number[] = [],
): void {
  const f = fixture();
  const carrier = carrierFactory(f);
  const before = f.memory.linkCount;
  same(bundleRoleAt(elaborateBundleRoles(f.memory, carrier, f.vocabulary, entry), path), expected, "bundle role");
  same(f.memory.linkCount, before, "elaboration read-only");
}

role(
  (f) => f.bundle(f.comparison(f.scalar(), f.scalar()), f.comparison(f.scalar(), f.scalar())),
  "ConstraintBundle",
);
role((f) => f.bundle(f.scalar(), f.scalar()), "ValueBundle");
role((f) => f.bundle(), "ConstraintBundle", "constraint");
role((f) => f.comparison(f.bundle(), f.scalar()), "ValueBundle", "none", [0]);
role((f) => f.node("definition", f.scalar(), f.bundle()), "ConstraintBundle", "none", [1]);

{
  const f = fixture();
  rejectCode(
    () => elaborateBundleRoles(
      f.memory,
      f.bundle(f.scalar(), f.comparison(f.scalar(), f.scalar())),
      f.vocabulary,
    ),
    "mixed-bundle-role-evidence", [],
  );
}
{
  const f = fixture();
  rejectCode(
    () => elaborateBundleRoles(f.memory, f.bundle(f.bundle()), f.vocabulary),
    "ambiguous-empty-bundle-role", [],
  );
}
{
  const f = fixture();
  rejectCode(
    () => elaborateBundleRoles(
      f.memory,
      f.comparison(f.bundle(f.bundle(f.scalar(), f.scalar())), f.scalar()),
      f.vocabulary,
    ),
    "nested-value-bundle-not-supported", [0],
  );
}
{
  const f = fixture();
  rejectCode(
    () => elaborateBundleRoles(f.memory, f.bundle(f.scalar(), f.scalar()), f.vocabulary, "constraint"),
    "bundle-role-mismatch", [],
  );
}
{
  const f = fixture();
  rejectCode(
    () => elaborateBundleRoles(
      f.memory,
      f.node("definition", f.scalar(), f.bundle(f.scalar(), f.scalar())),
      f.vocabulary,
    ),
    "bundle-valued-definition-deferred", [1],
  );
}
for (const kind of ["link", "unary"] as const) {
  const f = fixture();
  const carrier = kind === "link"
    ? f.node("link", f.bundle(f.scalar(), f.scalar()), f.scalar())
    : f.node("unary", f.bundle(f.scalar(), f.scalar()));
  rejectCode(
    () => elaborateBundleRoles(f.memory, carrier, f.vocabulary),
    "bundle-not-supported-in-scalar-operator", [0],
  );
}
{
  const f = fixture();
  const carrier = f.node(
    "link",
    f.node("sequence", f.scalar(), f.bundle(f.scalar(), f.scalar())),
    f.scalar(),
  );
  rejectCode(
    () => elaborateBundleRoles(f.memory, carrier, f.vocabulary),
    "bundle-not-supported-in-scalar-operator", [0],
  );
}

{
  const f = fixture();
  rejectReplay(() => elaborateBundleRoles(f.memory, f.node("comparison", f.scalar()), f.vocabulary));
  rejectReplay(() => elaborateBundleRoles(f.memory, f.node("sequence", f.scalar()), f.vocabulary));
  rejectReplay(() => elaborateBundleRoles(f.memory, f.node("scalar", f.scalar()), f.vocabulary));
}

{
  const f = fixture();
  rejectReplay(() => elaborateBundleRoles(f.memory, f.scalar(), Object.freeze({
    ...f.vocabulary,
    kindTags: Object.freeze(f.vocabulary.kindTags.slice(0, -1)),
  })));
  const aliases = [...f.vocabulary.kindTags];
  aliases[1] = aliases[0]!;
  rejectReplay(() => elaborateBundleRoles(f.memory, f.scalar(), Object.freeze({
    ...f.vocabulary,
    kindTags: Object.freeze(aliases),
  })));
}

{
  const f = fixture();
  const other = new Memory();
  const foreign = other.ensureStartSelfClosed(other.root);
  const tags = [...f.vocabulary.kindTags];
  tags[0] = foreign;
  rejectReplay(() => elaborateBundleRoles(f.memory, f.scalar(), Object.freeze({
    ...f.vocabulary,
    kindTags: Object.freeze(tags),
  })));
}

{
  const f = fixture();
  const shared = f.bundle();
  const carrier = f.comparison(shared, shared);
  const result = elaborateBundleRoles(f.memory, carrier, f.vocabulary);
  same(bundleRoleAt(result, [0]), "ValueBundle", "shared subtree first path role");
  same(bundleRoleAt(result, [1]), "ValueBundle", "shared subtree second path role");
}

class Probe implements ReadMemory {
  constructor(private readonly source: ReadMemory) {}
  get root(): LinkHandle { return this.source.root; }
  get linkCount(): number { return this.source.linkCount; }
  poles(link: LinkHandle): LinkPoles { return this.source.poles(link); }
  find(): LinkHandle | undefined { throw new Error("static ValueBundle replay must not use find"); }
  outgoing(): readonly LinkHandle[] { throw new Error("static ValueBundle replay must not use outgoing"); }
  incoming(): readonly LinkHandle[] { throw new Error("static ValueBundle replay must not use incoming"); }
}

{
  const f = fixture();
  const carrier = f.bundle(f.scalar(), f.scalar());
  const before = f.memory.linkCount;
  same(
    bundleRoleAt(elaborateBundleRoles(new Probe(f.memory), carrier, f.vocabulary), []),
    "ValueBundle",
    "ReadMemory-only elaboration",
  );
  same(f.memory.linkCount, before, "probe leaves linkCount unchanged");
}
