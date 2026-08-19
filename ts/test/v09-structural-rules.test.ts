import { defineDictionaryEffect, defineDictionaryScope } from "../src/dictionary.js";
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
  admitStructuralRule,
  defineStructuralInterpreter,
  defineStructuralRoleDictionary,
  defineStructuralRule,
  replayStructuralRule,
  StructuralRuleError,
  type StructuralInterpreter,
} from "../src/structural-rule.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}

function expectRuleError(
  code: StructuralRuleError["code"],
  effect: () => unknown,
): void {
  try {
    effect();
  } catch (error) {
    assert(error instanceof StructuralRuleError, `expected StructuralRuleError, got ${String(error)}`);
    same(error.code, code, "structural rule error code");
    return;
  }
  throw new Error(`expected StructuralRuleError(${code})`);
}

function anchors(memory: Memory, count: number): LinkHandle[] {
  const result: LinkHandle[] = [];
  let current = memory.root;
  for (let index = 0; index < count; index += 1) {
    current = memory.ensureStartSelfClosed(current);
    result.push(current);
  }
  return result;
}

class ReplayProbe implements ReadMemory {
  outgoingCalls = 0;

  constructor(private readonly source: ReadMemory) {}
  get root(): LinkHandle { return this.source.root; }
  get linkCount(): number { return this.source.linkCount; }
  poles(link: LinkHandle): LinkPoles { return this.source.poles(link); }
  find(): LinkHandle | undefined { throw new Error("generic rule replay must not use find"); }
  incoming(): readonly LinkHandle[] { throw new Error("generic rule replay must not use incoming"); }
  outgoing(start: LinkHandle): readonly LinkHandle[] {
    this.outgoingCalls += 1;
    return this.source.outgoing(start);
  }
}

function structuralContext(
  memory: Memory,
  parent: LinkHandle,
  current: LinkHandle,
): LinkHandle {
  return memory.ensureStartSelfClosed(memory.ensure(parent, current));
}

function defineAct(
  memory: Memory,
  interpreter: LinkHandle,
  roleDictionary: LinkHandle,
  afterContext: LinkHandle,
  fields: readonly (readonly [LinkHandle, LinkHandle])[],
): LinkHandle {
  const act = defineActHeader(memory, interpreter, roleDictionary, afterContext);
  for (const [role, value] of fields) defineActField(memory, act, role, value);
  return act;
}

interface RuleFixture {
  readonly interpreter: LinkHandle;
  readonly expectedInterpreter: StructuralInterpreter;
  readonly roleDictionary: LinkHandle;
  readonly rule: LinkHandle;
  readonly admission: LinkHandle;
}

function defineRuleFixture(
  memory: Memory,
  expectedInterpreter: StructuralInterpreter,
  roles: readonly LinkHandle[],
  body: LinkHandle,
): RuleFixture {
  const interpreter = defineStructuralInterpreter(
    memory,
    expectedInterpreter.dictionary,
    expectedInterpreter.grammar,
    expectedInterpreter.theory,
  );
  const roleDictionary = defineStructuralRoleDictionary(memory, roles);
  const rule = defineStructuralRule(memory, roleDictionary, body);
  const admission = admitStructuralRule(memory, expectedInterpreter.theory, rule);
  return Object.freeze({ interpreter, expectedInterpreter, roleDictionary, rule, admission });
}

// FORMAL relation pilot: one admitted structural Rule derives form/result/K shapes.
{
  const memory = new Memory();
  const refs = anchors(memory, 12);
  const [dictionary, grammar, theory, fixed, binding, parent, fixedRole, bindingRole, parentRole, other] = refs;
  assert(dictionary && grammar && theory && fixed && binding && parent && fixedRole && bindingRole && parentRole && other, "relation refs");

  const expectedInterpreter = Object.freeze({ dictionary, grammar, theory });
  const templateForm = memory.ensureStartSelfClosed(fixedRole);
  const templateResult = memory.ensure(bindingRole, fixedRole);
  const templateBefore = structuralContext(memory, parentRole, bindingRole);
  const templateAfter = structuralContext(memory, parentRole, templateResult);
  const body = materializeExactSequence(memory, [templateForm, templateResult, templateBefore, templateAfter]);
  const fixture = defineRuleFixture(memory, expectedInterpreter, [fixedRole, bindingRole, parentRole], body);

  const form = memory.ensureStartSelfClosed(fixed);
  const result = memory.ensure(binding, fixed);
  const beforeContext = defineContext(memory, parent, binding);
  const afterContext = defineContext(memory, parent, result);
  const claimedBody = materializeExactSequence(memory, [form, result, beforeContext, afterContext]);
  const act = defineAct(memory, fixture.interpreter, fixture.roleDictionary, afterContext, [
    [fixedRole, fixed],
    [bindingRole, binding],
    [parentRole, parent],
  ]);

  const before = memory.linkCount;
  const probe = new ReplayProbe(memory);
  const replayed = replayStructuralRule(probe, {
    act,
    rule: fixture.rule,
    ruleAdmission: fixture.admission,
    claimedBody,
    expectedInterpreter,
    expectedAfterContext: afterContext,
  });
  same(replayed.body, body, "relation structural body");
  same(replayed.afterContext, afterContext, "relation K_after");
  same(replayed.bindings.length, 3, "relation exact role binding count");
  same(memory.linkCount, before, "relation generic replay is read-only");
  assert(probe.outgoingCalls > 0, "generic replay reads Act fields structurally");

  const wrongResult = memory.ensure(other, fixed);
  const wrongClaim = materializeExactSequence(memory, [form, wrongResult, beforeContext, afterContext]);
  expectRuleError("template-mismatch", () => replayStructuralRule(memory, {
    act,
    rule: fixture.rule,
    ruleAdmission: fixture.admission,
    claimedBody: wrongClaim,
    expectedInterpreter,
    expectedAfterContext: afterContext,
  }));

  const wrongAfter = defineContext(memory, other, result);
  const wrongHeaderAct = defineAct(memory, fixture.interpreter, fixture.roleDictionary, wrongAfter, [
    [fixedRole, fixed],
    [bindingRole, binding],
    [parentRole, parent],
  ]);
  expectRuleError("after-context-mismatch", () => replayStructuralRule(memory, {
    act: wrongHeaderAct,
    rule: fixture.rule,
    ruleAdmission: fixture.admission,
    claimedBody,
    expectedInterpreter,
    expectedAfterContext: afterContext,
  }));

  const forgedInterpreter = defineStructuralInterpreter(memory, other, grammar, theory);
  const forgedInterpreterAct = defineAct(memory, forgedInterpreter, fixture.roleDictionary, afterContext, [
    [fixedRole, fixed],
    [bindingRole, binding],
    [parentRole, parent],
  ]);
  expectRuleError("interpreter-mismatch", () => replayStructuralRule(memory, {
    act: forgedInterpreterAct,
    rule: fixture.rule,
    ruleAdmission: fixture.admission,
    claimedBody,
    expectedInterpreter,
    expectedAfterContext: afterContext,
  }));

  const missingRoleAct = defineAct(memory, fixture.interpreter, fixture.roleDictionary, afterContext, [
    [fixedRole, fixed],
    [bindingRole, binding],
  ]);
  expectRuleError("missing-role-binding", () => replayStructuralRule(memory, {
    act: missingRoleAct,
    rule: fixture.rule,
    ruleAdmission: fixture.admission,
    claimedBody,
    expectedInterpreter,
    expectedAfterContext: afterContext,
  }));

  const multipleRoleAct = defineAct(memory, fixture.interpreter, fixture.roleDictionary, afterContext, [
    [fixedRole, fixed],
    [fixedRole, other],
    [bindingRole, binding],
    [parentRole, parent],
  ]);
  expectRuleError("multiple-role-bindings", () => replayStructuralRule(memory, {
    act: multipleRoleAct,
    rule: fixture.rule,
    ruleAdmission: fixture.admission,
    claimedBody,
    expectedInterpreter,
    expectedAfterContext: afterContext,
  }));

  const [undeclaredRole] = anchors(memory, 1);
  assert(undeclaredRole, "undeclared role");
  const extraRoleAct = defineAct(memory, fixture.interpreter, fixture.roleDictionary, afterContext, [
    [fixedRole, fixed],
    [bindingRole, binding],
    [parentRole, parent],
    [undeclaredRole, other],
  ]);
  expectRuleError("undeclared-role-binding", () => replayStructuralRule(memory, {
    act: extraRoleAct,
    rule: fixture.rule,
    ruleAdmission: fixture.admission,
    claimedBody,
    expectedInterpreter,
    expectedAfterContext: afterContext,
  }));

  const forgedRoleDictionary = defineStructuralRoleDictionary(memory, [fixedRole, bindingRole, undeclaredRole]);
  const forgedRoleAct = defineAct(memory, fixture.interpreter, forgedRoleDictionary, afterContext, [
    [fixedRole, fixed],
    [bindingRole, binding],
    [undeclaredRole, parent],
  ]);
  expectRuleError("rule-role-dictionary-mismatch", () => replayStructuralRule(memory, {
    act: forgedRoleAct,
    rule: fixture.rule,
    ruleAdmission: fixture.admission,
    claimedBody,
    expectedInterpreter,
    expectedAfterContext: afterContext,
  }));

  const forgedAdmission = memory.ensure(other, fixture.rule);
  expectRuleError("rule-not-admitted", () => replayStructuralRule(memory, {
    act,
    rule: fixture.rule,
    ruleAdmission: forgedAdmission,
    claimedBody,
    expectedInterpreter,
    expectedAfterContext: afterContext,
  }));

  const wrongBody = materializeExactSequence(memory, [templateForm, templateBefore]);
  const wrongRule = defineStructuralRule(memory, fixture.roleDictionary, wrongBody);
  const wrongRuleAdmission = admitStructuralRule(memory, theory, wrongRule);
  expectRuleError("template-mismatch", () => replayStructuralRule(memory, {
    act,
    rule: wrongRule,
    ruleAdmission: wrongRuleAdmission,
    claimedBody,
    expectedInterpreter,
    expectedAfterContext: afterContext,
  }));

  expectRuleError("duplicate-role", () => defineStructuralRoleDictionary(memory, [fixedRole, fixedRole]));
}

// Colon Entry/effect core pilot: body is structural data, not replayColonEffect callback identity.
{
  const memory = new Memory();
  const refs = anchors(memory, 14);
  const [grammar, theory, parentScope, historyBefore, sourceContent, form, sourceRole, formRole, beforeRole, parentRole, historyRole, contextCurrent] = refs;
  assert(grammar && theory && parentScope && historyBefore && sourceContent && form && sourceRole && formRole && beforeRole && parentRole && historyRole && contextCurrent, "colon refs");

  const beforeScope = defineDictionaryScope(memory, parentScope, historyBefore);
  const templateEntry = memory.ensure(sourceRole, formRole);
  const templateOccurrence = memory.ensure(beforeRole, templateEntry);
  const templateHistoryAfter = memory.ensure(historyRole, templateOccurrence);
  const templateAfterScope = memory.ensureStartSelfClosed(memory.ensure(parentRole, templateHistoryAfter));
  const body = materializeExactSequence(memory, [templateEntry, templateOccurrence, templateHistoryAfter, templateAfterScope]);
  const expectedInterpreter = Object.freeze({ dictionary: beforeScope, grammar, theory });
  const fixture = defineRuleFixture(
    memory,
    expectedInterpreter,
    [sourceRole, formRole, beforeRole, parentRole, historyRole],
    body,
  );

  const effect = defineDictionaryEffect(memory, beforeScope, parentScope, historyBefore, sourceContent, form);
  const claimedBody = materializeExactSequence(memory, [
    effect.entry,
    effect.occurrence,
    effect.historyAfter,
    effect.afterScope,
  ]);
  const afterContext = defineContext(memory, contextCurrent, effect.afterScope);
  const act = defineAct(memory, fixture.interpreter, fixture.roleDictionary, afterContext, [
    [sourceRole, sourceContent],
    [formRole, form],
    [beforeRole, beforeScope],
    [parentRole, parentScope],
    [historyRole, historyBefore],
  ]);

  const before = memory.linkCount;
  replayStructuralRule(new ReplayProbe(memory), {
    act,
    rule: fixture.rule,
    ruleAdmission: fixture.admission,
    claimedBody,
    expectedInterpreter,
    expectedAfterContext: afterContext,
  });
  same(memory.linkCount, before, "colon structural replay is read-only");

  const forgedOccurrence = memory.ensure(parentScope, effect.entry);
  const forgedBody = materializeExactSequence(memory, [
    effect.entry,
    forgedOccurrence,
    effect.historyAfter,
    effect.afterScope,
  ]);
  expectRuleError("template-mismatch", () => replayStructuralRule(memory, {
    act,
    rule: fixture.rule,
    ruleAdmission: fixture.admission,
    claimedBody: forgedBody,
    expectedInterpreter,
    expectedAfterContext: afterContext,
  }));
}

// Context-transition pilot: stable lexical parent is an ordinary Rule template obligation.
{
  const memory = new Memory();
  const refs = anchors(memory, 10);
  const [dictionary, grammar, theory, parent, beforeValue, result, parentRole, beforeRole, resultRole, otherParent] = refs;
  assert(dictionary && grammar && theory && parent && beforeValue && result && parentRole && beforeRole && resultRole && otherParent, "context refs");

  const templateBefore = structuralContext(memory, parentRole, beforeRole);
  const templateAfter = structuralContext(memory, parentRole, resultRole);
  const body = materializeExactSequence(memory, [templateBefore, templateAfter]);
  const expectedInterpreter = Object.freeze({ dictionary, grammar, theory });
  const fixture = defineRuleFixture(memory, expectedInterpreter, [parentRole, beforeRole, resultRole], body);

  const beforeContext = defineContext(memory, parent, beforeValue);
  const afterContext = defineContext(memory, parent, result);
  const claimedBody = materializeExactSequence(memory, [beforeContext, afterContext]);
  const act = defineAct(memory, fixture.interpreter, fixture.roleDictionary, afterContext, [
    [parentRole, parent],
    [beforeRole, beforeValue],
    [resultRole, result],
  ]);
  replayStructuralRule(new ReplayProbe(memory), {
    act,
    rule: fixture.rule,
    ruleAdmission: fixture.admission,
    claimedBody,
    expectedInterpreter,
    expectedAfterContext: afterContext,
  });

  const changedParentAfter = defineContext(memory, otherParent, result);
  const changedParentClaim = materializeExactSequence(memory, [beforeContext, changedParentAfter]);
  expectRuleError("template-mismatch", () => replayStructuralRule(memory, {
    act,
    rule: fixture.rule,
    ruleAdmission: fixture.admission,
    claimedBody: changedParentClaim,
    expectedInterpreter,
    expectedAfterContext: afterContext,
  }));
}
