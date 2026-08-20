import {
  Memory,
  type LinkHandle,
  type LinkPoles,
  type ReadMemory,
} from "../src/memory.js";
import {
  StructuralRuleError,
  type StructuralRoleBinding,
} from "../src/structural-rule.js";
import { unifyStructuralTemplate } from "../src/structural-unification.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}

function expectRuleError(code: StructuralRuleError["code"], effect: () => unknown): void {
  try {
    effect();
  } catch (error) {
    assert(error instanceof StructuralRuleError, `expected StructuralRuleError, got ${String(error)}`);
    same(error.code, code, "structural unification error code");
    return;
  }
  throw new Error(`expected StructuralRuleError(${code})`);
}

class ReadProbe implements ReadMemory {
  polesCalls = 0;

  constructor(private readonly source: ReadMemory) {}

  get root(): LinkHandle { return this.source.root; }
  get linkCount(): number { return this.source.linkCount; }

  poles(link: LinkHandle): LinkPoles {
    this.polesCalls += 1;
    return this.source.poles(link);
  }

  find(): LinkHandle | undefined {
    throw new Error("structural READ must not call find");
  }

  outgoing(): readonly LinkHandle[] {
    throw new Error("structural READ must not scan outgoing links");
  }

  incoming(): readonly LinkHandle[] {
    throw new Error("structural READ must not scan incoming links");
  }
}

function bindingValue(
  bindings: readonly StructuralRoleBinding[],
  role: LinkHandle,
): LinkHandle {
  const found = bindings.find((binding) => binding.role === role);
  assert(found !== undefined, "missing inferred binding");
  return found.value;
}

function distinct(memory: Memory, count: number): LinkHandle[] {
  const result: LinkHandle[] = [];
  let cursor = memory.ensureStartSelfClosed(memory.root);
  for (let index = 0; index < count; index += 1) {
    cursor = memory.ensureStartSelfClosed(cursor);
    result.push(cursor);
  }
  return result;
}

const memory = new Memory();
const refs = distinct(memory, 8);
const [beginRole, endRole, A, B, E, fixed, other, spare] = refs;
assert(beginRole && endRole && A && B && E && fixed && other && spare, "fixture refs");

const pairTemplate = memory.ensure(beginRole, endRole);
const ordinary = memory.ensure(A, B);
const startSelfClosed = memory.ensureStartSelfClosed(E);
const endSelfClosed = memory.ensureEndSelfClosed(B);
const inverse = memory.ensure(B, A);

// Generic structural READ projects the two ordered poles from an already given Link.
{
  const probe = new ReadProbe(memory);
  const before = memory.linkCount;
  const bindings = unifyStructuralTemplate(probe, pairTemplate, ordinary, [beginRole, endRole]);
  same(bindingValue(bindings, beginRole), A, "ordinary begin projection");
  same(bindingValue(bindings, endRole), B, "ordinary end projection");
  same(memory.linkCount, before, "ordinary READ is read-only");
  assert(probe.polesCalls > 0, "ordinary READ observes Link structure through poles");
}

// Full recursion is finite for READ: R=R⟼R yields the same whole at both poles.
{
  const bindings = unifyStructuralTemplate(new ReadProbe(memory), pairTemplate, memory.root, [beginRole, endRole]);
  same(bindingValue(bindings, beginRole), memory.root, "R begin is R");
  same(bindingValue(bindings, endRole), memory.root, "R end is R");
}

// One-sided recursive Links expose the self-reference as one pole without unfolding it.
{
  const startBindings = unifyStructuralTemplate(
    new ReadProbe(memory), pairTemplate, startSelfClosed, [beginRole, endRole],
  );
  same(bindingValue(startBindings, beginRole), startSelfClosed, "S=S⟼E reads S as begin");
  same(bindingValue(startBindings, endRole), E, "S=S⟼E reads E as end");

  const endBindings = unifyStructuralTemplate(
    new ReadProbe(memory), pairTemplate, endSelfClosed, [beginRole, endRole],
  );
  same(bindingValue(endBindings, beginRole), B, "T=B⟼T reads B as begin");
  same(bindingValue(endBindings, endRole), endSelfClosed, "T=B⟼T reads T as end");
}

// A grounded template component is not a wildcard. Only declared roles project values.
{
  const oneRoleTemplate = memory.ensure(fixed, beginRole);
  const matching = memory.ensure(fixed, A);
  const bindings = unifyStructuralTemplate(new ReadProbe(memory), oneRoleTemplate, matching, [beginRole]);
  same(bindingValue(bindings, beginRole), A, "single role projection");

  const mismatch = memory.ensure(other, A);
  expectRuleError("template-mismatch", () =>
    unifyStructuralTemplate(new ReadProbe(memory), oneRoleTemplate, mismatch, [beginRole]),
  );
}

// Repeated role occurrences must denote one semantic Link, not two occurrences.
{
  const repeatedTemplate = memory.ensure(beginRole, beginRole);
  const samePair = memory.ensure(A, A);
  const bindings = unifyStructuralTemplate(new ReadProbe(memory), repeatedTemplate, samePair, [beginRole]);
  same(bindingValue(bindings, beginRole), A, "repeated role reuses one binding");

  const differentPair = memory.ensure(A, B);
  expectRuleError("template-mismatch", () =>
    unifyStructuralTemplate(new ReadProbe(memory), repeatedTemplate, differentPair, [beginRole]),
  );
}

// Declared but absent roles are rejected instead of receiving ambient/runtime values.
{
  expectRuleError("missing-role-binding", () =>
    unifyStructuralTemplate(new ReadProbe(memory), beginRole, A, [beginRole, endRole]),
  );
  expectRuleError("duplicate-role", () =>
    unifyStructuralTemplate(new ReadProbe(memory), pairTemplate, ordinary, [beginRole, beginRole]),
  );
}

// WRITE/READ round-trip is semantic ordered-pole identity: projected poles are exactly X's poles.
{
  const bindings = unifyStructuralTemplate(new ReadProbe(memory), pairTemplate, ordinary, [beginRole, endRole]);
  const poles = memory.poles(ordinary);
  same(bindingValue(bindings, beginRole), poles.start, "round-trip begin equals X.start");
  same(bindingValue(bindings, endRole), poles.end, "round-trip end equals X.end");
  same(memory.ensure(bindingValue(bindings, beginRole), bindingValue(bindings, endRole)), ordinary,
    "construct(project(X)) reuses X by ordered-pair identity");
}

// Pole-swap is READ followed by the already-grounded inverse construction.
{
  const bindings = unifyStructuralTemplate(new ReadProbe(memory), pairTemplate, ordinary, [beginRole, endRole]);
  const inversePoles = memory.poles(inverse);
  same(inversePoles.start, bindingValue(bindings, endRole), "Inv start is projected end");
  same(inversePoles.end, bindingValue(bindings, beginRole), "Inv end is projected begin");
}

// Dot/context semantics are not involved: projection requires only explicit template roles and X.
{
  const before = memory.linkCount;
  const bindings = unifyStructuralTemplate(new ReadProbe(memory), pairTemplate, spare, [beginRole, endRole]);
  const sparePoles = memory.poles(spare);
  same(bindingValue(bindings, beginRole), sparePoles.start, "projection does not need contextual dot");
  same(bindingValue(bindings, endRole), sparePoles.end, "projection does not need ambient current");
  same(memory.linkCount, before, "dot-free projection stays read-only");
}
