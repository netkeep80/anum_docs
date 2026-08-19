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
  type StructuralRoleBinding,
} from "../src/structural-rule.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.10 contextual dot: ${message}`);
}

function same<T>(actual: T, expected: T, vector: string): void {
  assert(Object.is(actual, expected), `${vector}: ${String(actual)} !== ${String(expected)}`);
}

function vector(id: string, condition: boolean): void {
  assert(condition, `vector failed: ${id}`);
}

class ReadProbe implements ReadMemory {
  constructor(private readonly source: ReadMemory) {}
  get root(): LinkHandle { return this.source.root; }
  get linkCount(): number { return this.source.linkCount; }
  poles(link: LinkHandle): LinkPoles { return this.source.poles(link); }
  find(): LinkHandle | undefined { throw new Error("contextual-dot verification must not call find"); }
  incoming(): readonly LinkHandle[] { throw new Error("contextual-dot verification must not scan incoming"); }
  outgoing(): readonly LinkHandle[] { throw new Error("contextual-dot verification must not scan outgoing"); }
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

/**
 * Candidate `A:E` verifier. The dot occurrence is a declared structural role,
 * not the meaning Link of the `.` glyph. Its only authority is the explicit
 * current field of the supplied K. Template matching itself remains the
 * accepted read-only StructuralRule kernel.
 */
function verifyContextualDot(
  memory: ReadMemory,
  context: LinkHandle,
  dotRole: LinkHandle,
  template: LinkHandle,
  claimed: LinkHandle,
  otherBindings: readonly StructuralRoleBinding[] = [],
): void {
  const before = memory.linkCount;
  const state = readContext(memory, context);
  const bindings: readonly StructuralRoleBinding[] = Object.freeze([
    Object.freeze({ role: dotRole, value: state.current }),
    ...otherBindings,
  ]);
  matchStructuralTemplate(memory, template, claimed, bindings);
  same(memory.linkCount, before, "contextual-dot replay read-only");
}

const memory = new Memory();
const basis = ensureRootBasis(memory);
const pool = anchors(memory, 16);
let cursor = 0;
function next(name: string): LinkHandle {
  const value = pool[cursor++];
  assert(value !== undefined, `missing ${name}`);
  return value;
}

const dotRole = next("dot-role");
const leftRole = next("left-role");
const rightRole = next("right-role");
const A = next("A");
const B = next("B");
const D = next("D");

// The glyph meaning from M2 and the occurrence role are deliberately distinct.
const dotMeaning = memory.ensure(basis.L, basis.R);
assert(dotRole !== dotMeaning, "dot occurrence role must differ from dot sign meaning");

const rootContext = defineContext(memory, memory.root, basis.R);
const rootTemplate = memory.ensure(dotRole, dotRole);
const rootBefore = memory.linkCount;
verifyContextualDot(new ReadProbe(memory), rootContext, dotRole, rootTemplate, basis.R);
same(memory.linkCount, rootBefore, "root contextual verification is read-only");
vector("v010-root-dot-dot-resolves-to-root", true);

const startContext = defineContext(memory, memory.root, basis.O);
const startTemplate = memory.ensure(dotRole, basis.R);
verifyContextualDot(new ReadProbe(memory), startContext, dotRole, startTemplate, basis.O);
vector("v010-start-dot-resolves-to-O", true);

const endContext = defineContext(memory, memory.root, basis.C);
const endTemplate = memory.ensure(basis.R, dotRole);
verifyContextualDot(new ReadProbe(memory), endContext, dotRole, endTemplate, basis.C);
vector("v010-end-dot-resolves-to-C", true);

const genericStartContext = defineContext(memory, memory.root, A);
const genericStartTemplate = memory.ensure(dotRole, rightRole);
const genericStartResult = memory.ensure(A, B);
verifyContextualDot(
  new ReadProbe(memory),
  genericStartContext,
  dotRole,
  genericStartTemplate,
  genericStartResult,
  [Object.freeze({ role: rightRole, value: B })],
);
vector("v010-generic-start-dot-binds-current-whole", true);

const genericEndTemplate = memory.ensure(leftRole, dotRole);
const genericEndResult = memory.ensure(B, A);
verifyContextualDot(
  new ReadProbe(memory),
  genericStartContext,
  dotRole,
  genericEndTemplate,
  genericEndResult,
  [Object.freeze({ role: leftRole, value: B })],
);
vector("v010-generic-end-dot-binds-current-whole", true);

// Lexical shadowing is structural: the inner K names the outer K as parent and
// carries its own current whole. The same dot role therefore resolves to B in
// the inner scope without mutating or consulting the outer current A.
const outerContext = defineContext(memory, memory.root, A);
const innerContext = defineContext(memory, outerContext, B);
const innerState = readContext(memory, innerContext);
same(innerState.parent, outerContext, "nested K has explicit lexical parent");
same(innerState.current, B, "nested K has its own current whole");
same(readContext(memory, outerContext).current, A, "outer K current remains A");

const nestedTemplate = memory.ensure(dotRole, rightRole);
const outerClaim = memory.ensure(A, D);
const innerClaim = memory.ensure(B, D);
assert(outerClaim !== innerClaim, "outer and inner contextual results must be structurally distinct");
verifyContextualDot(
  new ReadProbe(memory),
  innerContext,
  dotRole,
  nestedTemplate,
  innerClaim,
  [Object.freeze({ role: rightRole, value: D })],
);
vector("v010-nested-dot-uses-nearest-lexical-binding", true);

// The same template under the outer scope still resolves to A, demonstrating
// that no ambient mutable current or global dot binding participates.
verifyContextualDot(
  new ReadProbe(memory),
  outerContext,
  dotRole,
  nestedTemplate,
  outerClaim,
  [Object.freeze({ role: rightRole, value: D })],
);
