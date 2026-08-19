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
  if (!condition) throw new Error(`v0.10 contextual fixed-point: ${message}`);
}

function same<T>(actual: T, expected: T, vector: string): void {
  assert(Object.is(actual, expected), `${vector}: ${String(actual)} !== ${String(expected)}`);
}

class ReadProbe implements ReadMemory {
  constructor(private readonly source: ReadMemory) {}
  get root(): LinkHandle { return this.source.root; }
  get linkCount(): number { return this.source.linkCount; }
  poles(link: LinkHandle): LinkPoles { return this.source.poles(link); }
  find(): LinkHandle | undefined { throw new Error("fixed-point verification must not call find"); }
  incoming(): readonly LinkHandle[] { throw new Error("fixed-point verification must not scan incoming"); }
  outgoing(): readonly LinkHandle[] { throw new Error("fixed-point verification must not scan outgoing"); }
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
const pool = anchors(memory, 8);
const dotRole = pool[0];
const fixedRole = pool[1];
const B = pool[2];
assert(dotRole !== undefined && fixedRole !== undefined && B !== undefined, "fixtures exist");

// A:.⟼B is not a law for arbitrary A. Its semantic witness is the unique
// start-selfclosed A for the already distinguished external end B.
const startA = memory.ensureStartSelfClosed(B);
const startPoles = memory.poles(startA);
same(startPoles.start, startA, "v010-generic-start-fixed-point-law:self-start");
same(startPoles.end, B, "v010-generic-start-fixed-point-law:external-end");
same(memory.ensure(startA, B), startA, "v010-generic-start-fixed-point-law:identity");

const startContext = defineContext(memory, memory.root, startA);
const startTemplate = memory.ensure(dotRole, fixedRole);
const startBindings = contextualBindings(new ReadProbe(memory), startContext, dotRole, [
  Object.freeze({ role: fixedRole, value: B }),
]);
const beforeStartReplay = memory.linkCount;
matchStructuralTemplate(new ReadProbe(memory), startTemplate, startA, startBindings);
same(memory.linkCount, beforeStartReplay, "v010-generic-start-fixed-point-law:read-only");

// Symmetrically, A:B⟼. is witnessed by the unique end-selfclosed A for B.
const endA = memory.ensureEndSelfClosed(B);
const endPoles = memory.poles(endA);
same(endPoles.start, B, "v010-generic-end-fixed-point-law:external-start");
same(endPoles.end, endA, "v010-generic-end-fixed-point-law:self-end");
same(memory.ensure(B, endA), endA, "v010-generic-end-fixed-point-law:identity");

const endContext = defineContext(memory, memory.root, endA);
const endTemplate = memory.ensure(fixedRole, dotRole);
const endBindings = contextualBindings(new ReadProbe(memory), endContext, dotRole, [
  Object.freeze({ role: fixedRole, value: B }),
]);
const beforeEndReplay = memory.linkCount;
matchStructuralTemplate(new ReadProbe(memory), endTemplate, endA, endBindings);
same(memory.linkCount, beforeEndReplay, "v010-generic-end-fixed-point-law:read-only");

// The root case remains the unique full fixed point and is included here only
// to connect the two one-sided generic laws with the already accepted root law.
const rootContext = defineContext(memory, memory.root, basis.R);
const fullTemplate = memory.ensure(dotRole, dotRole);
const beforeRootReplay = memory.linkCount;
matchStructuralTemplate(
  new ReadProbe(memory),
  fullTemplate,
  basis.R,
  contextualBindings(new ReadProbe(memory), rootContext, dotRole),
);
same(memory.linkCount, beforeRootReplay, "v010-generic-fixed-point-laws-read-only");
