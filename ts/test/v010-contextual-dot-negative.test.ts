import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
  type LinkPoles,
  type ReadMemory,
} from "../src/memory.js";
import { defineContext, readContext } from "../src/state.js";
import {
  matchStructuralTemplate,
  StructuralRuleError,
  type StructuralRoleBinding,
} from "../src/structural-rule.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.10 contextual dot negative: ${message}`);
}

function vector(id: string, condition: boolean): void {
  assert(condition, `vector failed: ${id}`);
}

function expectMismatch(id: string, effect: () => void): void {
  try {
    effect();
  } catch (error) {
    assert(error instanceof StructuralRuleError, `${id}: expected StructuralRuleError`);
    assert(error.code === "template-mismatch", `${id}: expected template-mismatch, got ${error.code}`);
    return;
  }
  throw new Error(`${id}: expected template mismatch`);
}

class ReadProbe implements ReadMemory {
  constructor(private readonly source: ReadMemory) {}
  get root(): LinkHandle { return this.source.root; }
  get linkCount(): number { return this.source.linkCount; }
  poles(link: LinkHandle): LinkPoles { return this.source.poles(link); }
  find(): LinkHandle | undefined { throw new Error("dot verification must not call find"); }
  incoming(): readonly LinkHandle[] { throw new Error("dot verification must not scan incoming"); }
  outgoing(): readonly LinkHandle[] { throw new Error("dot verification must not scan outgoing"); }
}

function anchors(memory: Memory, count: number): readonly LinkHandle[] {
  const result: LinkHandle[] = [];
  const seed = memory.ensureEndSelfClosed(memory.root);
  let tag = memory.ensureStartSelfClosed(memory.root);
  for (let index = 0; index < count; index += 1) {
    tag = memory.ensureStartSelfClosed(tag);
    result.push(memory.ensure(seed, tag));
  }
  return Object.freeze(result);
}

function contextualBindings(
  memory: ReadMemory,
  context: LinkHandle,
  dotRole: LinkHandle,
  rest: readonly StructuralRoleBinding[] = [],
): readonly StructuralRoleBinding[] {
  return Object.freeze([
    Object.freeze({ role: dotRole, value: readContext(memory, context).current }),
    ...rest,
  ]);
}

const memory = new Memory();
const basis = ensureRootBasis(memory);
const pool = anchors(memory, 20);
let cursor = 0;
function next(name: string): LinkHandle {
  const value = pool[cursor++];
  assert(value !== undefined, `missing ${name}`);
  return value;
}

const dotRole = next("dot-role");
const rightRole = next("right-role");
const A = next("A");
const B = next("B");
const D = next("D");
const parentMarker = next("parent-marker");
const storageLike = next("storage-like-marker");
const dotMeaning = memory.ensure(basis.L, basis.R);
assert(dotRole !== dotMeaning, "occurrence role must remain distinct from glyph meaning");
assert(A !== basis.L && A !== basis.R, "fixture A must differ from dot meaning poles");

const genericTemplate = memory.ensure(dotRole, rightRole);
const rightBinding = Object.freeze({ role: rightRole, value: B });
const expected = memory.ensure(A, B);

// A free dot has no implicit ambient value. Without an explicit binding the dot
// role is a grounded Link and cannot silently become A.
expectMismatch("v010-free-dot-has-no-ambient-current", () => {
  matchStructuralTemplate(new ReadProbe(memory), genericTemplate, expected, [rightBinding]);
});
vector("v010-free-dot-has-no-ambient-current", true);

// The binder reads K.current, never K.parent.
const context = defineContext(memory, parentMarker, A);
const bindings = contextualBindings(new ReadProbe(memory), context, dotRole, [rightBinding]);
const beforePositive = memory.linkCount;
matchStructuralTemplate(new ReadProbe(memory), genericTemplate, expected, bindings);
assert(memory.linkCount === beforePositive, "positive boundary replay must be read-only");
const parentClaim = memory.ensure(parentMarker, B);
expectMismatch("v010-dot-is-not-parent-navigation", () => {
  matchStructuralTemplate(new ReadProbe(memory), genericTemplate, parentClaim, bindings);
});
vector("v010-dot-is-not-parent-navigation", true);

// There is no process-global/runtime-current authority: changing the explicit K
// changes the only admissible dot binding, and an old claimed result is rejected.
const otherContext = defineContext(memory, parentMarker, D);
const otherBindings = contextualBindings(new ReadProbe(memory), otherContext, dotRole, [rightBinding]);
expectMismatch("v010-dot-is-not-runtime-current", () => {
  matchStructuralTemplate(new ReadProbe(memory), genericTemplate, expected, otherBindings);
});
vector("v010-dot-is-not-runtime-current", true);

// The sign meaning m. = L⟼R is not dereferenced as either pole when an occurrence
// is resolved. Claims using readBegin(m.)=L or readEnd(m.)=R are both rejected.
const beginClaim = memory.ensure(basis.L, B);
const endClaim = memory.ensure(basis.R, B);
expectMismatch("v010-dot-is-not-read-begin", () => {
  matchStructuralTemplate(new ReadProbe(memory), genericTemplate, beginClaim, bindings);
});
expectMismatch("v010-dot-is-not-read-end", () => {
  matchStructuralTemplate(new ReadProbe(memory), genericTemplate, endClaim, bindings);
});
vector("v010-dot-is-not-read-begin", true);
vector("v010-dot-is-not-read-end", true);

// A technical/storage-like marker is just another grounded Link. Nothing in the
// resolver interprets it as an address that may replace the explicit K.current.
const storageClaim = memory.ensure(storageLike, B);
expectMismatch("v010-dot-is-not-storage-dereference", () => {
  matchStructuralTemplate(new ReadProbe(memory), genericTemplate, storageClaim, bindings);
});
vector("v010-dot-is-not-storage-dereference", true);

// Grounded subtrees are immutable constants for StructuralRule matching. Dot
// binding cannot authorize unrelated rewrites elsewhere in the form.
const groundedTemplate = memory.ensure(A, B);
const arbitraryClaim = memory.ensure(A, D);
expectMismatch("v010-dot-is-not-arbitrary-rewrite", () => {
  matchStructuralTemplate(new ReadProbe(memory), groundedTemplate, arbitraryClaim, bindings);
});
vector("v010-dot-is-not-arbitrary-rewrite", true);

// `A:.⟼.` means that both poles resolve to A. For non-root A, the resulting
// relation is Loop(A)=A⟼A, not A itself. Therefore the claimed identity A is
// rejected; only R can satisfy R=R⟼R through the existing root invariant.
const fullTemplate = memory.ensure(dotRole, dotRole);
expectMismatch("v010-nonroot-full-dot-selfclosure-rejected", () => {
  matchStructuralTemplate(new ReadProbe(memory), fullTemplate, A, contextualBindings(new ReadProbe(memory), context, dotRole));
});
const loopA = memory.ensure(A, A);
const beforeLoopReplay = memory.linkCount;
matchStructuralTemplate(
  new ReadProbe(memory),
  fullTemplate,
  loopA,
  contextualBindings(new ReadProbe(memory), context, dotRole),
);
assert(memory.linkCount === beforeLoopReplay, "non-root loop verification must be read-only");
vector("v010-nonroot-full-dot-selfclosure-rejected", loopA !== A);

// ROOT is the unique positive identity witness for the full-dot form.
const rootContext = defineContext(memory, memory.root, basis.R);
const beforeRootReplay = memory.linkCount;
matchStructuralTemplate(
  new ReadProbe(memory),
  fullTemplate,
  basis.R,
  contextualBindings(new ReadProbe(memory), rootContext, dotRole),
);
assert(memory.linkCount === beforeRootReplay, "root full-dot verification must be read-only");
