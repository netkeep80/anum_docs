import {
  InterpreterReplayError,
  replayEqualityEvaluation,
  type EqualityReplayEvidence,
  type EqualityRoles,
} from "../src/interpreter.js";
import {
  defineContext,
  defineLocalRepresentativeBinding,
} from "../src/state.js";
import { defineActField, defineActHeader } from "../src/structural-readers.js";
import { Memory, type LinkHandle, type LinkPoles, type ReadMemory } from "../src/memory.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}
function reject(effect: () => unknown): void {
  try { effect(); }
  catch (error) {
    assert(error instanceof InterpreterReplayError, `expected InterpreterReplayError, got ${String(error)}`);
    same(error.code, "invalid-equality-evidence", "equality error code");
    return;
  }
  throw new Error("expected invalid-equality-evidence");
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

interface ActValues {
  readonly context: LinkHandle;
  readonly left: LinkHandle;
  readonly right: LinkHandle;
  readonly leftRepresentative: LinkHandle;
  readonly rightRepresentative: LinkHandle;
}
interface Fixture {
  readonly memory: Memory;
  readonly roles: EqualityRoles;
  readonly interpreter: LinkHandle;
  readonly roleDictionary: LinkHandle;
  readonly context: LinkHandle;
  readonly left: LinkHandle;
  readonly right: LinkHandle;
  readonly other: LinkHandle;
  makeEvidence(values: ActValues, headerContext?: LinkHandle): EqualityReplayEvidence;
}

function fixture(): Fixture {
  const memory = new Memory();
  const refs = anchors(memory, 8);
  const parent = refs[0]!;
  const current = refs[1]!;
  const left = refs[2]!;
  const right = refs[3]!;
  const other = refs[4]!;
  const interpreter = refs[5]!;
  const roleDictionary = refs[6]!;
  const context = defineContext(memory, parent, current);
  const roleRefs = anchors(memory, 5);
  const roles: EqualityRoles = Object.freeze({
    context: roleRefs[0]!, left: roleRefs[1]!, right: roleRefs[2]!,
    leftRepresentative: roleRefs[3]!, rightRepresentative: roleRefs[4]!,
  });

  function makeEvidence(values: ActValues, headerContext = values.context): EqualityReplayEvidence {
    const act = defineActHeader(memory, interpreter, roleDictionary, headerContext);
    const fields: readonly [LinkHandle, LinkHandle][] = [
      [roles.context, values.context], [roles.left, values.left], [roles.right, values.right],
      [roles.leftRepresentative, values.leftRepresentative],
      [roles.rightRepresentative, values.rightRepresentative],
    ];
    for (const [role, value] of fields) defineActField(memory, act, role, value);
    return Object.freeze({ act, roles, interpreter, roleDictionary });
  }
  return { memory, roles, interpreter, roleDictionary, context, left, right, other, makeEvidence };
}

class Probe implements ReadMemory {
  outgoingCalls = 0;
  constructor(private readonly source: ReadMemory) {}
  get root(): LinkHandle { return this.source.root; }
  get linkCount(): number { return this.source.linkCount; }
  poles(link: LinkHandle): LinkPoles { return this.source.poles(link); }
  find(): LinkHandle | undefined { throw new Error("equality replay must not use find"); }
  outgoing(start: LinkHandle): readonly LinkHandle[] {
    this.outgoingCalls += 1;
    return this.source.outgoing(start);
  }
  incoming(): readonly LinkHandle[] { throw new Error("equality replay must not use incoming"); }
}

{
  const f = fixture();
  const evidence = f.makeEvidence({
    context: f.context, left: f.left, right: f.left,
    leftRepresentative: f.left, rightRepresentative: f.left,
  });
  const probe = new Probe(f.memory);
  const before = f.memory.linkCount;
  same(replayEqualityEvaluation(probe, evidence), true, "identical unbound members");
  same(f.memory.linkCount, before, "equality replay must be read-only");
  assert(probe.outgoingCalls >= 2, "representatives use indexed outgoing(context)");
}
{
  const f = fixture();
  const evidence = f.makeEvidence({
    context: f.context, left: f.left, right: f.right,
    leftRepresentative: f.left, rightRepresentative: f.right,
  });
  same(replayEqualityEvaluation(f.memory, evidence), false, "distinct unbound members");
}
{
  const f = fixture();
  defineLocalRepresentativeBinding(f.memory, f.context, f.left, f.other);
  defineLocalRepresentativeBinding(f.memory, f.context, f.right, f.other);
  const evidence = f.makeEvidence({
    context: f.context, left: f.left, right: f.right,
    leftRepresentative: f.other, rightRepresentative: f.other,
  });
  same(replayEqualityEvaluation(f.memory, evidence), true, "two members share one local representative");
}
{
  const f = fixture();
  defineLocalRepresentativeBinding(f.memory, f.context, f.left, f.right);
  const evidence = f.makeEvidence({
    context: f.context, left: f.left, right: f.right,
    leftRepresentative: f.right, rightRepresentative: f.right,
  });
  same(replayEqualityEvaluation(f.memory, evidence), true, "one-hop member maps to compared representative");
}
{
  const f = fixture();
  defineLocalRepresentativeBinding(f.memory, f.context, f.left, f.right);
  defineLocalRepresentativeBinding(f.memory, f.context, f.right, f.other);
  const evidence = f.makeEvidence({
    context: f.context, left: f.left, right: f.right,
    leftRepresentative: f.right, rightRepresentative: f.other,
  });
  same(replayEqualityEvaluation(f.memory, evidence), false, "representatives remain one-hop, not transitive");
}

// Forged/destructive act vectors use fresh fixtures because canonical act role
// facts are additive and intentionally cannot be removed from a Memory.
{
  const f = fixture();
  reject(() => replayEqualityEvaluation(f.memory, f.makeEvidence({
    context: f.context, left: f.left, right: f.right,
    leftRepresentative: f.other, rightRepresentative: f.right,
  })));
}
{
  const f = fixture();
  reject(() => replayEqualityEvaluation(f.memory, f.makeEvidence({
    context: f.context, left: f.left, right: f.right,
    leftRepresentative: f.left, rightRepresentative: f.other,
  })));
}
{
  const f = fixture();
  defineLocalRepresentativeBinding(f.memory, f.context, f.left, f.right);
  defineLocalRepresentativeBinding(f.memory, f.context, f.left, f.other);
  reject(() => replayEqualityEvaluation(f.memory, f.makeEvidence({
    context: f.context, left: f.left, right: f.right,
    leftRepresentative: f.right, rightRepresentative: f.right,
  })));
}
{
  const f = fixture();
  const malformed = f.memory.ensure(f.left, f.right);
  reject(() => replayEqualityEvaluation(f.memory, f.makeEvidence({
    context: malformed, left: f.left, right: f.right,
    leftRepresentative: f.left, rightRepresentative: f.right,
  }, malformed)));
}
{
  const f = fixture();
  const evidence = f.makeEvidence({
    context: f.context, left: f.left, right: f.right,
    leftRepresentative: f.left, rightRepresentative: f.right,
  });
  defineActField(f.memory, evidence.act, f.roles.left, f.other);
  reject(() => replayEqualityEvaluation(f.memory, evidence));
}
{
  const f = fixture();
  const act = defineActHeader(f.memory, f.interpreter, f.roleDictionary, f.context);
  defineActField(f.memory, act, f.roles.context, f.context);
  defineActField(f.memory, act, f.roles.right, f.right);
  defineActField(f.memory, act, f.roles.leftRepresentative, f.left);
  defineActField(f.memory, act, f.roles.rightRepresentative, f.right);
  reject(() => replayEqualityEvaluation(f.memory, Object.freeze({
    act, roles: f.roles, interpreter: f.interpreter, roleDictionary: f.roleDictionary,
  })));
}
{
  const f = fixture();
  const wrongContext = defineContext(f.memory, f.other, f.left);
  const evidence = f.makeEvidence({
    context: f.context, left: f.left, right: f.right,
    leftRepresentative: f.left, rightRepresentative: f.right,
  }, wrongContext);
  reject(() => replayEqualityEvaluation(f.memory, evidence));
}
{
  const f = fixture();
  const evidence = f.makeEvidence({
    context: f.context, left: f.left, right: f.right,
    leftRepresentative: f.left, rightRepresentative: f.right,
  });
  reject(() => replayEqualityEvaluation(f.memory, Object.freeze({
    ...evidence, interpreter: f.other,
  })));
}
{
  const f = fixture();
  const evidence = f.makeEvidence({
    context: f.context, left: f.left, right: f.right,
    leftRepresentative: f.left, rightRepresentative: f.right,
  });
  reject(() => replayEqualityEvaluation(f.memory, Object.freeze({
    ...evidence, roleDictionary: f.other,
  })));
}
{
  const f = fixture();
  let noise = f.other;
  for (let index = 0; index < 40; index += 1) noise = f.memory.ensureStartSelfClosed(noise);
  const evidence = f.makeEvidence({
    context: f.context, left: f.left, right: f.right,
    leftRepresentative: f.left, rightRepresentative: f.right,
  });
  same(replayEqualityEvaluation(f.memory, evidence), false, "unrelated topology does not affect equality");
}
