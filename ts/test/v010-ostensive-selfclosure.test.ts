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
  if (!condition) throw new Error(`v0.10 ostensive selfclosure: ${message}`);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}

class ReadProbe implements ReadMemory {
  constructor(private readonly source: ReadMemory) {}
  get root(): LinkHandle { return this.source.root; }
  get linkCount(): number { return this.source.linkCount; }
  poles(link: LinkHandle): LinkPoles { return this.source.poles(link); }
  find(): LinkHandle | undefined { throw new Error("selfclosure verification must not call find"); }
  incoming(): readonly LinkHandle[] { throw new Error("selfclosure verification must not scan incoming"); }
  outgoing(): readonly LinkHandle[] { throw new Error("selfclosure verification must not scan outgoing"); }
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

function verifyBoundForm(
  memory: Memory,
  current: LinkHandle,
  dotRole: LinkHandle,
  template: LinkHandle,
  claimed: LinkHandle,
  otherBindings: readonly StructuralRoleBinding[] = [],
): void {
  const context = defineContext(memory, memory.root, current);
  const before = memory.linkCount;
  const probe = new ReadProbe(memory);
  const state = readContext(probe, context);
  matchStructuralTemplate(probe, template, claimed, Object.freeze([
    Object.freeze({ role: dotRole, value: state.current }),
    ...otherBindings,
  ]));
  same(memory.linkCount, before, "verification is read-only");
}

const memory = new Memory();
const basis = ensureRootBasis(memory);
const [dotRole, otherRole, e, b] = anchors(memory, 4);
assert(dotRole !== undefined && otherRole !== undefined && e !== undefined && b !== undefined, "fixture anchors");

// Ostensive `♂e` is the already existing start-selfclosed Link S=S⟼e.
// The accepted internal notation can verify the same form as `S : . ⟼ e`:
// the dot binds to S itself; no internal `♂` sign or selector operation is needed.
const startSelfClosed = memory.ensureStartSelfClosed(e);
const startPoles = memory.poles(startSelfClosed);
same(startPoles.start, startSelfClosed, "start-selfclosed begin is the whole");
same(startPoles.end, e, "start-selfclosed external end");
const startTemplate = memory.ensure(dotRole, otherRole);
verifyBoundForm(
  memory,
  startSelfClosed,
  dotRole,
  startTemplate,
  startSelfClosed,
  [Object.freeze({ role: otherRole, value: e })],
);
same(memory.ensure(startSelfClosed, e), startSelfClosed, "same ordered poles reuse start-selfclosed Link");

// Ostensive `b♀` is the already existing end-selfclosed Link E=b⟼E.
// `E : b ⟼ .` verifies the same recursive form with the accepted dot binding.
const endSelfClosed = memory.ensureEndSelfClosed(b);
const endPoles = memory.poles(endSelfClosed);
same(endPoles.start, b, "end-selfclosed external begin");
same(endPoles.end, endSelfClosed, "end-selfclosed end is the whole");
const endTemplate = memory.ensure(otherRole, dotRole);
verifyBoundForm(
  memory,
  endSelfClosed,
  dotRole,
  endTemplate,
  endSelfClosed,
  [Object.freeze({ role: otherRole, value: b })],
);
same(memory.ensure(b, endSelfClosed), endSelfClosed, "same ordered poles reuse end-selfclosed Link");

// Root O/C are not special glyph-table cases. They are exactly the same two
// generic one-sided forms when the external pole is R.
verifyBoundForm(
  memory,
  basis.O,
  dotRole,
  startTemplate,
  basis.O,
  [Object.freeze({ role: otherRole, value: basis.R })],
);
verifyBoundForm(
  memory,
  basis.C,
  dotRole,
  endTemplate,
  basis.C,
  [Object.freeze({ role: otherRole, value: basis.R })],
);
same(memory.poles(basis.O).start, basis.O, "O is generic start-selfclosure");
same(memory.poles(basis.O).end, basis.R, "O external pole is R");
same(memory.poles(basis.C).start, basis.R, "C external pole is R");
same(memory.poles(basis.C).end, basis.C, "C is generic end-selfclosure");

// The fully selfclosed case is likewise the accepted root equation. This is
// the machine boundary behind the ostensive theorem `♂♀ = ∞`; the theorem does
// not require `♂` or `♀` to become internal F1 tokens.
const rootTemplate = memory.ensure(dotRole, dotRole);
verifyBoundForm(memory, basis.R, dotRole, rootTemplate, basis.R);
same(memory.ensure(basis.R, basis.R), basis.R, "full selfclosure is canonical root");

// Distinct external poles produce ordinary one-sided selfclosures distinct
// from O/C. Thus the evidence is generic rather than a root lookup table.
assert(e !== basis.R && b !== basis.R, "fixture external poles differ from root");
assert(startSelfClosed !== basis.O, "generic start-selfclosure is not forced to O");
assert(endSelfClosed !== basis.C, "generic end-selfclosure is not forced to C");
