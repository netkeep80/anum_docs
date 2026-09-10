// mts-version-evidence: required-from=0.12

import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
  type LinkPoles,
  type ReadMemory,
} from "../src/memory.js";
import {
  matchStructuralTemplate,
  StructuralRuleError,
  type StructuralRoleBinding,
} from "../src/structural-rule.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.12 ostensive self-incidence: ${message}`);
}

function expectTemplateMismatch(id: string, effect: () => void): void {
  try {
    effect();
  } catch (error) {
    assert(error instanceof StructuralRuleError, `${id}: expected StructuralRuleError`);
    assert(error.code === "template-mismatch", `${id}: expected template-mismatch, got ${error.code}`);
    return;
  }
  throw new Error(`v0.12 ostensive self-incidence: ${id}: expected template mismatch`);
}

class PoleOnlyProbe implements ReadMemory {
  constructor(private readonly source: ReadMemory) {}
  get root(): LinkHandle { return this.source.root; }
  get linkCount(): number { return this.source.linkCount; }
  poles(link: LinkHandle): LinkPoles { return this.source.poles(link); }
  find(): LinkHandle | undefined { throw new Error("ostensive matching must not call find"); }
  incoming(): readonly LinkHandle[] { throw new Error("ostensive matching must not scan incoming"); }
  outgoing(): readonly LinkHandle[] { throw new Error("ostensive matching must not scan outgoing"); }
}

function freshRole(memory: Memory): LinkHandle {
  const seed = memory.ensureEndSelfClosed(memory.root);
  const tag = memory.ensureStartSelfClosed(memory.ensureStartSelfClosed(memory.root));
  return memory.ensure(seed, tag);
}

function replay(
  memory: Memory,
  template: LinkHandle,
  claimed: LinkHandle,
  bindings: readonly StructuralRoleBinding[],
): void {
  const before = memory.linkCount;
  matchStructuralTemplate(new PoleOnlyProbe(memory), template, claimed, bindings);
  assert(memory.linkCount === before, "successful replay must be read-only");
}

function reject(
  memory: Memory,
  id: string,
  template: LinkHandle,
  claimed: LinkHandle,
  bindings: readonly StructuralRoleBinding[],
): void {
  const before = memory.linkCount;
  expectTemplateMismatch(id, () => {
    matchStructuralTemplate(new PoleOnlyProbe(memory), template, claimed, bindings);
  });
  assert(memory.linkCount === before, `${id}: rejected replay must be read-only`);
}

const memory = new Memory();
const basis = ensureRootBasis(memory);
const role = freshRole(memory);
assert(
  role !== basis.R && role !== basis.O && role !== basis.C && role !== basis.L && role !== basis.U,
  "fixture role must be distinct from root basis",
);

const binding = Object.freeze([
  Object.freeze({ role, value: basis.R }),
]) satisfies readonly StructuralRoleBinding[];

// Exact ostensive START-form: template itself is ♂E, not an external Pattern AST.
// Under E:=R the canonical positive result is O=♂R.
const startTemplate = memory.ensureStartSelfClosed(role);
const startTemplatePoles = memory.poles(startTemplate);
assert(startTemplatePoles.start === startTemplate, "START template must self-close at start");
assert(startTemplatePoles.end === role, "START template must expose the role at end");
assert(startTemplatePoles.end !== startTemplate, "START template must not be full self-closure");
replay(memory, startTemplate, basis.O, binding);

// F01: R=R⟼R is internally well-formed and shares the requested external end R,
// but it is full self-closure rather than the exact one-pole form ♂R.
reject(
  memory,
  "v012-start-form-rejects-full-selfclosure",
  startTemplate,
  basis.R,
  binding,
);

// Exact ostensive END-form: template itself is B♀. Under B:=R the canonical
// positive result is C=R♀.
const endTemplate = memory.ensureEndSelfClosed(role);
const endTemplatePoles = memory.poles(endTemplate);
assert(endTemplatePoles.start === role, "END template must expose the role at start");
assert(endTemplatePoles.end === endTemplate, "END template must self-close at end");
assert(endTemplatePoles.start !== endTemplate, "END template must not be full self-closure");
replay(memory, endTemplate, basis.C, binding);

reject(
  memory,
  "v012-end-form-rejects-full-selfclosure",
  endTemplate,
  basis.R,
  binding,
);

console.log("MTS v0.12 ostensive self-incidence matcher gate: START/END forms preserve own self-closure shape.");
