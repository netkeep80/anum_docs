import { materializeExactSequence } from "../src/exact-sequence.js";
import {
  Memory,
  type LinkHandle,
  type LinkPoles,
  type ReadMemory,
} from "../src/memory.js";
import { replayRun } from "../src/run.js";
import { defineContext } from "../src/state.js";
import { defineActField, defineActHeader } from "../src/structural-readers.js";
import {
  StructuralRuleError,
  admitStructuralRule,
  defineStructuralInterpreter,
  defineStructuralRoleDictionary,
  defineStructuralRule,
  replayStructuralRule,
  type StructuralInterpreter,
} from "../src/structural-rule.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}

function rejectRule(effect: () => unknown, expected?: StructuralRuleError["code"]): void {
  try {
    effect();
  } catch (error) {
    assert(error instanceof StructuralRuleError, `expected StructuralRuleError, got ${String(error)}`);
    if (expected !== undefined) same(error.code, expected, "whole-current rule error code");
    return;
  }
  throw new Error("expected whole-current structural rule rejection");
}

function anchors(memory: Memory, count: number): LinkHandle[] {
  const result: LinkHandle[] = [];
  const seed = memory.ensureEndSelfClosed(memory.root);
  let tag = memory.ensureStartSelfClosed(memory.root);
  for (let index = 0; index < count; index += 1) {
    tag = memory.ensureStartSelfClosed(tag);
    result.push(memory.ensure(seed, tag));
  }
  return result;
}

class ReplayProbe implements ReadMemory {
  outgoingCalls = 0;

  constructor(private readonly source: ReadMemory) {}

  get root(): LinkHandle { return this.source.root; }
  get linkCount(): number { return this.source.linkCount; }
  poles(link: LinkHandle): LinkPoles { return this.source.poles(link); }
  find(): LinkHandle | undefined { throw new Error("whole-current replay must not use find"); }
  incoming(): readonly LinkHandle[] { throw new Error("whole-current replay must not use incoming"); }
  outgoing(start: LinkHandle): readonly LinkHandle[] {
    this.outgoingCalls += 1;
    return this.source.outgoing(start);
  }
}

interface Roles {
  readonly from: LinkHandle;
  readonly to: LinkHandle;
  readonly parent: LinkHandle;
  readonly beforeContext: LinkHandle;
  readonly afterContext: LinkHandle;
}

interface Harness {
  readonly memory: Memory;
  readonly roles: Roles;
  readonly expectedInterpreter: StructuralInterpreter;
  readonly interpreter: LinkHandle;
  readonly roleDictionary: LinkHandle;
  readonly rule: LinkHandle;
  readonly admission: LinkHandle;
  makeStep(
    from: LinkHandle,
    to: LinkHandle,
    parent: LinkHandle,
    beforeContext?: LinkHandle,
    afterContext?: LinkHandle,
  ): {
    readonly form: LinkHandle;
    readonly beforeContext: LinkHandle;
    readonly afterContext: LinkHandle;
    readonly act: LinkHandle;
    readonly claimedBody: LinkHandle;
  };
}

function structuralContext(memory: Memory, parent: LinkHandle, current: LinkHandle): LinkHandle {
  return memory.ensureStartSelfClosed(memory.ensure(parent, current));
}

function harness(): Harness {
  const memory = new Memory();
  const refs = anchors(memory, 8);
  const [dictionary, grammar, theory, fromRole, toRole, parentRole, beforeContextRole, afterContextRole] = refs;
  assert(
    dictionary && grammar && theory && fromRole && toRole && parentRole && beforeContextRole && afterContextRole,
    "whole-current harness refs",
  );

  const roles: Roles = Object.freeze({
    from: fromRole,
    to: toRole,
    parent: parentRole,
    beforeContext: beforeContextRole,
    afterContext: afterContextRole,
  });
  const expectedInterpreter = Object.freeze({ dictionary, grammar, theory });
  const interpreter = defineStructuralInterpreter(memory, dictionary, grammar, theory);
  const roleDictionary = defineStructuralRoleDictionary(memory, [
    roles.from,
    roles.to,
    roles.parent,
    roles.beforeContext,
    roles.afterContext,
  ]);

  // Один Rule связывает correspondence и оба K общими ролями. Две петли
  // below are equality witnesses inside the template: the bound K_before/K_after
  // must be exactly the contexts reconstructed from Parent/From/To roles.
  const templateForm = memory.ensure(roles.from, roles.to);
  const templateBefore = structuralContext(memory, roles.parent, roles.from);
  const templateAfter = structuralContext(memory, roles.parent, roles.to);
  const beforeWitness = memory.ensure(roles.beforeContext, templateBefore);
  const afterWitness = memory.ensure(roles.afterContext, templateAfter);
  const body = materializeExactSequence(memory, [templateForm, beforeWitness, afterWitness]);
  const rule = defineStructuralRule(memory, roleDictionary, body);
  const admission = admitStructuralRule(memory, theory, rule);

  function makeStep(
    from: LinkHandle,
    to: LinkHandle,
    parent: LinkHandle,
    beforeContext = defineContext(memory, parent, from),
    afterContext = defineContext(memory, parent, to),
  ) {
    const form = memory.ensure(from, to);
    const claimedBody = materializeExactSequence(memory, [
      form,
      memory.ensure(beforeContext, beforeContext),
      memory.ensure(afterContext, afterContext),
    ]);
    const act = defineActHeader(memory, interpreter, roleDictionary, afterContext);
    for (const [role, value] of [
      [roles.from, from],
      [roles.to, to],
      [roles.parent, parent],
      [roles.beforeContext, beforeContext],
      [roles.afterContext, afterContext],
    ] as const) {
      defineActField(memory, act, role, value);
    }
    return Object.freeze({ form, beforeContext, afterContext, act, claimedBody });
  }

  return Object.freeze({
    memory,
    roles,
    expectedInterpreter,
    interpreter,
    roleDictionary,
    rule,
    admission,
    makeStep,
  });
}

function replayStep(h: Harness, step: ReturnType<Harness["makeStep"]>, memory: ReadMemory = h.memory) {
  return replayStructuralRule(memory, {
    act: step.act,
    rule: h.rule,
    ruleAdmission: h.admission,
    claimedBody: step.claimedBody,
    expectedInterpreter: h.expectedInterpreter,
    expectedAfterContext: step.afterContext,
  });
}

// Ordinary complete X⟼Y is already expressible as a derived whole-current Rule.
// Neither pole is self-closed; this is intentionally the case rejected by the
// narrower accepted replayRelationStep and therefore must not modify that API.
{
  const h = harness();
  const { memory } = h;
  const [X, Y, parent] = anchors(memory, 3);
  assert(X && Y && parent && X !== Y, "ordinary whole-current refs");
  const step = h.makeStep(X, Y, parent);
  const poles = memory.poles(step.form);
  assert(poles.start === X && poles.end === Y, "ordinary correspondence poles");
  assert(poles.start !== step.form && poles.end !== step.form, "ordinary correspondence has no self-closed pole");

  const before = memory.linkCount;
  const probe = new ReplayProbe(memory);
  const replayed = replayStep(h, step, probe);
  same(replayed.claimedBody, step.claimedBody, "ordinary whole-current claimed body");
  same(replayed.afterContext, step.afterContext, "ordinary whole-current K_after");
  same(memory.linkCount, before, "ordinary whole-current replay is read-only");
  assert(probe.outgoingCalls > 0, "whole-current Act bindings are read structurally");
}

// X and Y may themselves be nontrivial rooted Links; whole-current matching is
// about exact semantic values, not about leaf-like technical identifiers.
{
  const h = harness();
  const { memory } = h;
  const [a, b, c, d, parent] = anchors(memory, 5);
  assert(a && b && c && d && parent, "complex whole-current refs");
  const X = memory.ensure(a, b);
  const Y = memory.ensure(memory.ensure(c, d), memory.ensure(b, c));
  const step = h.makeStep(X, Y, parent);
  replayStep(h, step, new ReplayProbe(memory));
}

// Identity execution is permitted only as explicit Rule/Act evidence. It does
// not create a second semantic value or require a special execution primitive.
{
  const h = harness();
  const { memory } = h;
  const [X, parent] = anchors(memory, 2);
  assert(X && parent, "identity whole-current refs");
  const step = h.makeStep(X, X, parent);
  same(step.beforeContext, step.afterContext, "same parent/current canonicalizes the context");
  replayStep(h, step, new ReplayProbe(memory));
}

// The shared template roles enforce both ends of the law. A forged current or
// changed lexical parent cannot be hidden behind an otherwise valid F=X⟼Y.
{
  const h = harness();
  const { memory } = h;
  const [X, Y, parent, other, otherParent] = anchors(memory, 5);
  assert(X && Y && parent && other && otherParent, "negative whole-current refs");

  const wrongBefore = defineContext(memory, parent, other);
  rejectRule(() => replayStep(h, h.makeStep(X, Y, parent, wrongBefore)), "template-mismatch");

  const wrongAfter = defineContext(memory, parent, other);
  rejectRule(() => replayStep(h, h.makeStep(X, Y, parent, undefined, wrongAfter)), "template-mismatch");

  const changedParent = defineContext(memory, otherParent, Y);
  rejectRule(() => replayStep(h, h.makeStep(X, Y, parent, undefined, changedParent)), "template-mismatch");

  const valid = h.makeStep(X, Y, parent);
  const forgedAdmission = memory.ensure(other, h.rule);
  rejectRule(() => replayStructuralRule(memory, {
    act: valid.act,
    rule: h.rule,
    ruleAdmission: forgedAdmission,
    claimedBody: valid.claimedBody,
    expectedInterpreter: h.expectedInterpreter,
    expectedAfterContext: valid.afterContext,
  }), "rule-not-admitted");
}

// Composition is a Run of explicit states, not an automatic semantic shortcut.
// Two admitted acts X⟼Y and Y⟼Z establish K0->K1->K2 while X⟼Z remains absent.
{
  const h = harness();
  const { memory } = h;
  const [X, Y, Z, parent] = anchors(memory, 4);
  assert(X && Y && Z && parent, "composed whole-current refs");
  const first = h.makeStep(X, Y, parent);
  const second = h.makeStep(Y, Z, parent);
  same(second.beforeContext, first.afterContext, "composed whole-current contexts meet at Y");
  same(memory.find(X, Z), undefined, "no semantic X⟼Z shortcut before replay");

  const before = memory.linkCount;
  const probe = new ReplayProbe(memory);
  replayStep(h, first, probe);
  replayStep(h, second, probe);

  const runRoot = memory.ensure(memory.ensure(memory.root, first.act), second.act);
  const runBefore = memory.linkCount;
  const acts = replayRun(new ReplayProbe(memory), {
    runRoot,
    initialContext: first.beforeContext,
    terminalContext: second.afterContext,
    steps: [
      { act: first.act, beforeRole: h.roles.beforeContext, afterRole: h.roles.afterContext },
      { act: second.act, beforeRole: h.roles.beforeContext, afterRole: h.roles.afterContext },
    ],
  });
  same(acts.length, 2, "whole-current composed Run has two positions");
  same(memory.linkCount, runBefore, "Run replay is read-only");
  same(memory.find(X, Z), undefined, "composition does not materialize semantic X⟼Z shortcut");
  assert(memory.linkCount >= before, "only explicit run carrier setup may add links before replay");
}
