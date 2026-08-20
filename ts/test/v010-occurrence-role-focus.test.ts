import { materializeExactSequence } from "../src/exact-sequence.js";
import {
  Memory,
  type LinkHandle,
  type LinkPoles,
  type ReadMemory,
} from "../src/memory.js";
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
    if (expected !== undefined) same(error.code, expected, "occurrence-focus rule error code");
    return;
  }
  throw new Error("expected occurrence-focus structural rule rejection");
}

function refFactory(memory: Memory): () => LinkHandle {
  const seed = memory.ensureEndSelfClosed(memory.root);
  let tag = memory.ensureStartSelfClosed(memory.root);
  return () => {
    tag = memory.ensureStartSelfClosed(tag);
    return memory.ensure(seed, tag);
  };
}

class ReplayProbe implements ReadMemory {
  outgoingCalls = 0;

  constructor(private readonly source: ReadMemory) {}

  get root(): LinkHandle { return this.source.root; }
  get linkCount(): number { return this.source.linkCount; }
  poles(link: LinkHandle): LinkPoles { return this.source.poles(link); }
  find(): LinkHandle | undefined { throw new Error("occurrence-focus replay must not use find"); }
  incoming(): readonly LinkHandle[] { throw new Error("occurrence-focus replay must not use incoming"); }
  outgoing(start: LinkHandle): readonly LinkHandle[] {
    this.outgoingCalls += 1;
    return this.source.outgoing(start);
  }
}

interface FocusRoles {
  readonly selected: LinkHandle;
  readonly replacement: LinkHandle;
  readonly untouched: LinkHandle;
  readonly parent: LinkHandle;
  readonly beforeContext: LinkHandle;
  readonly afterContext: LinkHandle;
}

type FocusSide = "left" | "right";

interface FocusRule {
  readonly roles: FocusRoles;
  readonly expectedInterpreter: StructuralInterpreter;
  readonly interpreter: LinkHandle;
  readonly roleDictionary: LinkHandle;
  readonly rule: LinkHandle;
  readonly admission: LinkHandle;
  current(selected: LinkHandle, replacement: LinkHandle, untouched: LinkHandle): {
    readonly before: LinkHandle;
    readonly after: LinkHandle;
  };
}

function structuralContext(memory: Memory, parent: LinkHandle, current: LinkHandle): LinkHandle {
  return memory.ensureStartSelfClosed(memory.ensure(parent, current));
}

function defineFocusRule(memory: Memory, next: () => LinkHandle, side: FocusSide): FocusRule {
  const dictionary = next();
  const grammar = next();
  const theory = next();
  const roles: FocusRoles = Object.freeze({
    selected: next(),
    replacement: next(),
    untouched: next(),
    parent: next(),
    beforeContext: next(),
    afterContext: next(),
  });
  const expectedInterpreter = Object.freeze({ dictionary, grammar, theory });
  const interpreter = defineStructuralInterpreter(memory, dictionary, grammar, theory);
  const roleDictionary = defineStructuralRoleDictionary(memory, [
    roles.selected,
    roles.replacement,
    roles.untouched,
    roles.parent,
    roles.beforeContext,
    roles.afterContext,
  ]);

  const beforeCurrent = side === "left"
    ? memory.ensure(roles.selected, roles.untouched)
    : memory.ensure(roles.untouched, roles.selected);
  const afterCurrent = side === "left"
    ? memory.ensure(roles.replacement, roles.untouched)
    : memory.ensure(roles.untouched, roles.replacement);
  const templateBefore = structuralContext(memory, roles.parent, beforeCurrent);
  const templateAfter = structuralContext(memory, roles.parent, afterCurrent);
  const correspondence = memory.ensure(roles.selected, roles.replacement);
  const body = materializeExactSequence(memory, [
    correspondence,
    memory.ensure(roles.beforeContext, templateBefore),
    memory.ensure(roles.afterContext, templateAfter),
  ]);
  const rule = defineStructuralRule(memory, roleDictionary, body);
  const admission = admitStructuralRule(memory, theory, rule);

  function current(selected: LinkHandle, replacement: LinkHandle, untouched: LinkHandle) {
    return side === "left"
      ? Object.freeze({
          before: memory.ensure(selected, untouched),
          after: memory.ensure(replacement, untouched),
        })
      : Object.freeze({
          before: memory.ensure(untouched, selected),
          after: memory.ensure(untouched, replacement),
        });
  }

  return Object.freeze({
    roles,
    expectedInterpreter,
    interpreter,
    roleDictionary,
    rule,
    admission,
    current,
  });
}

interface StepEvidence {
  readonly act: LinkHandle;
  readonly beforeContext: LinkHandle;
  readonly afterContext: LinkHandle;
  readonly claimedBody: LinkHandle;
}

function makeFocusStep(
  memory: Memory,
  focus: FocusRule,
  selected: LinkHandle,
  replacement: LinkHandle,
  untouched: LinkHandle,
  parent: LinkHandle,
  overrides: {
    readonly selectedBinding?: LinkHandle;
    readonly replacementBinding?: LinkHandle;
    readonly untouchedBinding?: LinkHandle;
    readonly beforeCurrent?: LinkHandle;
    readonly afterCurrent?: LinkHandle;
    readonly afterParent?: LinkHandle;
  } = {},
): StepEvidence {
  const canonical = focus.current(selected, replacement, untouched);
  const beforeCurrent = overrides.beforeCurrent ?? canonical.before;
  const afterCurrent = overrides.afterCurrent ?? canonical.after;
  const beforeContext = defineContext(memory, parent, beforeCurrent);
  const afterContext = defineContext(memory, overrides.afterParent ?? parent, afterCurrent);
  const correspondence = memory.ensure(selected, replacement);
  const claimedBody = materializeExactSequence(memory, [
    correspondence,
    memory.ensure(beforeContext, beforeContext),
    memory.ensure(afterContext, afterContext),
  ]);
  const act = defineActHeader(memory, focus.interpreter, focus.roleDictionary, afterContext);
  for (const [role, value] of [
    [focus.roles.selected, overrides.selectedBinding ?? selected],
    [focus.roles.replacement, overrides.replacementBinding ?? replacement],
    [focus.roles.untouched, overrides.untouchedBinding ?? untouched],
    [focus.roles.parent, parent],
    [focus.roles.beforeContext, beforeContext],
    [focus.roles.afterContext, afterContext],
  ] as const) {
    defineActField(memory, act, role, value);
  }
  return Object.freeze({ act, beforeContext, afterContext, claimedBody });
}

function replayFocus(
  memory: ReadMemory,
  focus: FocusRule,
  step: StepEvidence,
  admission = focus.admission,
) {
  return replayStructuralRule(memory, {
    act: step.act,
    rule: focus.rule,
    ruleAdmission: admission,
    claimedBody: step.claimedBody,
    expectedInterpreter: focus.expectedInterpreter,
    expectedAfterContext: step.afterContext,
  });
}

function negativeFixture() {
  const memory = new Memory();
  const next = refFactory(memory);
  const focus = defineFocusRule(memory, next, "left");
  return Object.freeze({
    memory,
    focus,
    X: next(),
    Y: next(),
    other: next(),
    parent: next(),
    otherParent: next(),
  });
}

// Two occurrences of the same semantic X are distinguishable by role position.
// The left-focused and right-focused Rules receive identical semantic values but
// derive different after states without any occurrence ID or numeric host path.
{
  const memory = new Memory();
  const next = refFactory(memory);
  const left = defineFocusRule(memory, next, "left");
  const right = defineFocusRule(memory, next, "right");
  const X = next();
  const Y = next();
  const parent = next();
  assert(X !== Y, "focus X/Y must be distinct");

  const leftStep = makeFocusStep(memory, left, X, Y, X, parent);
  const rightStep = makeFocusStep(memory, right, X, Y, X, parent);
  same(leftStep.beforeContext, rightStep.beforeContext, "both rules start from the same X⟼X context");
  assert(leftStep.afterContext !== rightStep.afterContext, "left/right focus must yield different contexts");

  const before = memory.linkCount;
  const probe = new ReplayProbe(memory);
  replayFocus(probe, left, leftStep);
  replayFocus(probe, right, rightStep);
  same(memory.linkCount, before, "left/right focus replay is read-only");
  assert(probe.outgoingCalls > 0, "focus bindings are read structurally");

  const leftAfter = memory.poles(memory.poles(leftStep.afterContext).end).end;
  const rightAfter = memory.poles(memory.poles(rightStep.afterContext).end).end;
  const leftPoles = memory.poles(leftAfter);
  const rightPoles = memory.poles(rightAfter);
  same(leftPoles.start, Y, "left-focused occurrence replaced");
  same(leftPoles.end, X, "right duplicate X remains untouched");
  same(rightPoles.start, X, "left duplicate X remains untouched");
  same(rightPoles.end, Y, "right-focused occurrence replaced");
}

// Forged/destructive vectors use separate Memories because an Act is canonical
// by (interpreter, role dictionary, K_after) and its role facts are additive.
{
  const f = negativeFixture();
  const step = makeFocusStep(f.memory, f.focus, f.X, f.Y, f.X, f.parent, {
    afterCurrent: f.memory.ensure(f.Y, f.Y),
  });
  rejectRule(() => replayFocus(f.memory, f.focus, step), "template-mismatch");
}
{
  const f = negativeFixture();
  const step = makeFocusStep(f.memory, f.focus, f.X, f.Y, f.X, f.parent, {
    selectedBinding: f.other,
  });
  rejectRule(() => replayFocus(f.memory, f.focus, step), "template-mismatch");
}
{
  const f = negativeFixture();
  const step = makeFocusStep(f.memory, f.focus, f.X, f.Y, f.X, f.parent, {
    untouchedBinding: f.other,
  });
  rejectRule(() => replayFocus(f.memory, f.focus, step), "template-mismatch");
}
{
  const f = negativeFixture();
  const step = makeFocusStep(f.memory, f.focus, f.X, f.Y, f.X, f.parent, {
    afterParent: f.otherParent,
  });
  rejectRule(() => replayFocus(f.memory, f.focus, step), "template-mismatch");
}
{
  const f = negativeFixture();
  const step = makeFocusStep(f.memory, f.focus, f.X, f.Y, f.X, f.parent);
  const forgedAdmission = f.memory.ensure(f.other, f.focus.rule);
  rejectRule(() => replayFocus(f.memory, f.focus, step, forgedAdmission), "rule-not-admitted");
}

// The template itself can identify a finite deep occurrence. Here the outer X
// and the selected inner X are the same semantic Link but belong to different
// roles; only the inner-start occurrence changes.
{
  const memory = new Memory();
  const next = refFactory(memory);
  const dictionary = next();
  const grammar = next();
  const theory = next();
  const selectedRole = next();
  const replacementRole = next();
  const sameXRole = next();
  const tailRole = next();
  const parentRole = next();
  const beforeContextRole = next();
  const afterContextRole = next();
  const expectedInterpreter = Object.freeze({ dictionary, grammar, theory });
  const interpreter = defineStructuralInterpreter(memory, dictionary, grammar, theory);
  const roleDictionary = defineStructuralRoleDictionary(memory, [
    selectedRole, replacementRole, sameXRole, tailRole, parentRole,
    beforeContextRole, afterContextRole,
  ]);
  const beforeCurrentTemplate = memory.ensure(sameXRole, memory.ensure(selectedRole, tailRole));
  const afterCurrentTemplate = memory.ensure(sameXRole, memory.ensure(replacementRole, tailRole));
  const beforeTemplate = structuralContext(memory, parentRole, beforeCurrentTemplate);
  const afterTemplate = structuralContext(memory, parentRole, afterCurrentTemplate);
  const body = materializeExactSequence(memory, [
    memory.ensure(selectedRole, replacementRole),
    memory.ensure(beforeContextRole, beforeTemplate),
    memory.ensure(afterContextRole, afterTemplate),
  ]);
  const rule = defineStructuralRule(memory, roleDictionary, body);
  const admission = admitStructuralRule(memory, theory, rule);

  const X = next();
  const Y = next();
  const tail = next();
  const parent = next();
  const beforeCurrent = memory.ensure(X, memory.ensure(X, tail));
  const afterCurrent = memory.ensure(X, memory.ensure(Y, tail));
  const beforeContext = defineContext(memory, parent, beforeCurrent);
  const afterContext = defineContext(memory, parent, afterCurrent);
  const act = defineActHeader(memory, interpreter, roleDictionary, afterContext);
  for (const [role, value] of [
    [selectedRole, X], [replacementRole, Y], [sameXRole, X], [tailRole, tail],
    [parentRole, parent], [beforeContextRole, beforeContext], [afterContextRole, afterContext],
  ] as const) defineActField(memory, act, role, value);
  const claimedBody = materializeExactSequence(memory, [
    memory.ensure(X, Y),
    memory.ensure(beforeContext, beforeContext),
    memory.ensure(afterContext, afterContext),
  ]);

  const before = memory.linkCount;
  replayStructuralRule(new ReplayProbe(memory), {
    act, rule, ruleAdmission: admission, claimedBody,
    expectedInterpreter, expectedAfterContext: afterContext,
  });
  same(memory.linkCount, before, "deep occurrence focus replay is read-only");
  const afterPoles = memory.poles(afterCurrent);
  same(afterPoles.start, X, "outer duplicate X remains unchanged");
  const innerPoles = memory.poles(afterPoles.end);
  same(innerPoles.start, Y, "deep selected X is replaced");
  same(innerPoles.end, tail, "deep untouched sibling remains unchanged");
}

// Reusing one role in two template positions is intentionally a different mode:
// a single binding instantiates both occurrences simultaneously.
{
  const memory = new Memory();
  const next = refFactory(memory);
  const dictionary = next();
  const grammar = next();
  const theory = next();
  const selectedRole = next();
  const replacementRole = next();
  const parentRole = next();
  const beforeContextRole = next();
  const afterContextRole = next();
  const expectedInterpreter = Object.freeze({ dictionary, grammar, theory });
  const interpreter = defineStructuralInterpreter(memory, dictionary, grammar, theory);
  const roleDictionary = defineStructuralRoleDictionary(memory, [
    selectedRole, replacementRole, parentRole, beforeContextRole, afterContextRole,
  ]);
  const beforeCurrentTemplate = memory.ensure(selectedRole, selectedRole);
  const afterCurrentTemplate = memory.ensure(replacementRole, replacementRole);
  const beforeTemplate = structuralContext(memory, parentRole, beforeCurrentTemplate);
  const afterTemplate = structuralContext(memory, parentRole, afterCurrentTemplate);
  const body = materializeExactSequence(memory, [
    memory.ensure(selectedRole, replacementRole),
    memory.ensure(beforeContextRole, beforeTemplate),
    memory.ensure(afterContextRole, afterTemplate),
  ]);
  const rule = defineStructuralRule(memory, roleDictionary, body);
  const admission = admitStructuralRule(memory, theory, rule);

  const X = next();
  const Y = next();
  const parent = next();
  const beforeCurrent = memory.ensure(X, X);
  const afterCurrent = memory.ensure(Y, Y);
  const beforeContext = defineContext(memory, parent, beforeCurrent);
  const afterContext = defineContext(memory, parent, afterCurrent);
  const act = defineActHeader(memory, interpreter, roleDictionary, afterContext);
  for (const [role, value] of [
    [selectedRole, X], [replacementRole, Y], [parentRole, parent],
    [beforeContextRole, beforeContext], [afterContextRole, afterContext],
  ] as const) defineActField(memory, act, role, value);
  const claimedBody = materializeExactSequence(memory, [
    memory.ensure(X, Y),
    memory.ensure(beforeContext, beforeContext),
    memory.ensure(afterContext, afterContext),
  ]);

  replayStructuralRule(new ReplayProbe(memory), {
    act, rule, ruleAdmission: admission, claimedBody,
    expectedInterpreter, expectedAfterContext: afterContext,
  });
  const afterPoles = memory.poles(afterCurrent);
  same(afterPoles.start, Y, "repeated replacement role changes first position");
  same(afterPoles.end, Y, "repeated replacement role changes second position");
}
