import { Memory, type LinkHandle } from "../src/memory.js";
import {
  SyntaxAsetBuilder, SyntaxAsetContractError, materializeSyntaxAsetVocabulary,
  readSyntaxAset, type SyntaxAsetToolingVocabulary,
} from "../src/tooling/syntax-aset.js";
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}
function reject(effect: () => unknown, code: SyntaxAsetContractError["code"]): void {
  try { effect(); } catch (error) {
    assert(error instanceof SyntaxAsetContractError, `expected SyntaxAsetContractError, got ${String(error)}`);
    same(error.code, code, "SyntaxAset error code"); return;
  }
  throw new Error(`expected SyntaxAset rejection: ${code}`);
}
function fixture() {
  const memory = new Memory();
  return { memory, vocabulary: materializeSyntaxAsetVocabulary(memory, memory.ensureEndSelfClosed(memory.root)) };
}
function carrier(memory: Memory, salt: LinkHandle): LinkHandle { return memory.ensureStartSelfClosed(salt); }
function triad(memory: Memory, r: LinkHandle, s: LinkHandle, o: LinkHandle): LinkHandle {
  return memory.ensure(r, memory.ensure(s, o));
}
function literal(builder: SyntaxAsetBuilder, v: SyntaxAsetToolingVocabulary, value: LinkHandle): LinkHandle {
  return builder.addOccurrence(v.kinds.Literal, [{ role: v.roles.value, value }]);
}

// Carrier classification uses explicit SyntaxAset membership, never pole shape.
{
  const { memory, vocabulary: v } = fixture();
  const b = new SyntaxAsetBuilder(memory, v);
  const root = literal(b, v, memory.ensure(v.kinds.Literal, memory.root));
  same(readSyntaxAset(memory, b.finish(root), v).root, root, "shape-only carrier accepted");
}
{
  const { memory, vocabulary: v } = fixture();
  const foreignBuilder = new SyntaxAsetBuilder(memory, v);
  const foreign = literal(foreignBuilder, v, carrier(memory, v.tag));
  foreignBuilder.finish(foreign);
  const b = new SyntaxAsetBuilder(memory, v);
  reject(() => literal(b, v, foreign), "invalid-carrier-target");
  const local = literal(b, v, carrier(memory, v.kinds.Literal));
  reject(() => literal(b, v, local), "invalid-carrier-target");
}

// Fixed productions reject missing, duplicate, reversed and extra known roles.
{
  const { memory, vocabulary: v } = fixture();
  const b = new SyntaxAsetBuilder(memory, v);
  const a = literal(b, v, carrier(memory, v.roles.left));
  const c = literal(b, v, carrier(memory, v.roles.right));
  const bad = (kind: LinkHandle, fields: readonly { role: LinkHandle; value: LinkHandle }[]) =>
    reject(() => b.addOccurrence(kind, fields), "invalid-grammar");
  bad(v.kinds.Link, [{ role: v.roles.end, value: c }]);
  bad(v.kinds.Link, [{ role: v.roles.start, value: a }]);
  bad(v.kinds.Link, [
    { role: v.roles.start, value: a }, { role: v.roles.start, value: c }, { role: v.roles.end, value: c },
  ]);
  bad(v.kinds.Link, [{ role: v.roles.end, value: c }, { role: v.roles.start, value: a }]);
  bad(v.kinds.Link, [{ role: v.roles.start, value: a }, { role: v.roles.operand, value: c }]);
  for (const kind of [v.kinds.Equality, v.kinds.Inequality]) {
    bad(kind, [{ role: v.roles.left, value: a }]);
    bad(kind, [
      { role: v.roles.left, value: a }, { role: v.roles.left, value: c }, { role: v.roles.right, value: c },
    ]);
    bad(kind, [
      { role: v.roles.left, value: a }, { role: v.roles.right, value: c }, { role: v.roles.operand, value: a },
    ]);
  }
  bad(v.kinds.Definition, [{ role: v.roles.name, value: a }]);
  bad(v.kinds.Definition, [{ role: v.roles.body, value: c }, { role: v.roles.name, value: a }]);
  bad(v.kinds.Statement, []);
  bad(v.kinds.Statement, [
    { role: v.roles.expression, value: a }, { role: v.roles.expression, value: c },
  ]);
  for (const kind of [v.kinds.Not, v.kinds.Female, v.kinds.Male]) {
    bad(kind, []);
    bad(kind, [{ role: v.roles.operand, value: a }, { role: v.roles.operand, value: c }]);
  }
}

// Cardinality follows the actual source parser grammar.
{
  const { memory, vocabulary: v } = fixture();
  const b = new SyntaxAsetBuilder(memory, v);
  const item = literal(b, v, carrier(memory, v.kinds.Sequence));
  reject(() => b.addOccurrence(v.kinds.Sequence, []), "invalid-grammar");
  reject(() => b.addOccurrence(v.kinds.Sequence, [{ role: v.roles.item, value: item }]), "invalid-grammar");
}
for (const kindName of ["File", "Set", "Round", "Square"] as const) {
  const { memory, vocabulary: v } = fixture();
  const b = new SyntaxAsetBuilder(memory, v); const root = b.addOccurrence(v.kinds[kindName], []);
  same(readSyntaxAset(memory, b.finish(root), v).root, root, `${kindName} empty accepted`);
}
for (const kindName of ["Round", "Square"] as const) {
  const { memory, vocabulary: v } = fixture(); const b = new SyntaxAsetBuilder(memory, v);
  const child = literal(b, v, carrier(memory, v.kinds[kindName]));
  reject(() => b.addOccurrence(v.kinds[kindName], [
    { role: v.roles.expression, value: child }, { role: v.roles.expression, value: child },
  ]), "invalid-grammar");
}
for (const kindName of ["ContextPronoun", "Literal"] as const) {
  const { memory, vocabulary: v } = fixture(); const b = new SyntaxAsetBuilder(memory, v);
  const value = carrier(memory, v.kinds[kindName]);
  reject(() => b.addOccurrence(v.kinds[kindName], []), "invalid-grammar");
  reject(() => b.addOccurrence(v.kinds[kindName], [
    { role: v.roles.value, value }, { role: v.roles.value, value },
  ]), "invalid-grammar");
}

// Set preserves textual order at syntax layer; this does not order semantic membership.
{
  const { memory, vocabulary: v } = fixture(); const b = new SyntaxAsetBuilder(memory, v);
  const first = literal(b, v, carrier(memory, v.roles.start));
  const second = literal(b, v, carrier(memory, v.roles.end));
  const set = b.addOccurrence(v.kinds.Set, [
    { role: v.roles.item, value: second }, { role: v.roles.item, value: first },
  ]);
  const fields = readSyntaxAset(memory, b.finish(set), v).occurrences.at(-1)?.fields;
  same(fields?.[0]?.value, second, "Set first textual item");
  same(fields?.[1]?.value, first, "Set second textual item");
}

// Occurrence chain is owned closure; unused earlier members fail closed.
{
  const { memory, vocabulary: v } = fixture(); const b = new SyntaxAsetBuilder(memory, v);
  literal(b, v, carrier(memory, v.roles.left));
  const root = literal(b, v, carrier(memory, v.roles.right));
  reject(() => b.finish(root), "unreachable-occurrence");
}
{
  const { memory, vocabulary: v } = fixture();
  const fa = triad(memory, v.roles.value, memory.root, carrier(memory, v.roles.start));
  const unused = triad(memory, v.kinds.Literal, memory.root, fa);
  const fb = triad(memory, v.roles.value, memory.root, carrier(memory, v.roles.end));
  const root = triad(memory, v.kinds.Literal, unused, fb);
  reject(() => readSyntaxAset(memory, memory.ensure(v.tag, root), v), "unreachable-occurrence");
}

// Explicit DAG reuse remains valid when all owned occurrences are reachable.
{
  const { memory, vocabulary: v } = fixture(); const b = new SyntaxAsetBuilder(memory, v);
  const child = literal(b, v, carrier(memory, v.kinds.Link));
  const root = b.addOccurrence(v.kinds.Link, [
    { role: v.roles.start, value: child }, { role: v.roles.end, value: child },
  ]);
  same(readSyntaxAset(memory, b.finish(root), v).root, root, "shared child accepted");
}

// Untrusted topology rejects unknown/foreign vocabulary and dualized encoding.
{
  const { memory, vocabulary: v } = fixture(); const value = carrier(memory, v.tag);
  const field = triad(memory, v.roles.value, memory.root, value);
  const unknownKind = memory.ensureStartSelfClosed(value);
  reject(() => readSyntaxAset(
    memory, memory.ensure(v.tag, triad(memory, unknownKind, memory.root, field)), v,
  ), "unknown-kind");
  const unknownRole = memory.ensureEndSelfClosed(value);
  reject(() => readSyntaxAset(
    memory, memory.ensure(v.tag, triad(memory, v.kinds.Literal, memory.root,
      triad(memory, unknownRole, memory.root, value))), v,
  ), "unknown-role");
  const foreign = materializeSyntaxAsetVocabulary(memory, memory.ensureStartSelfClosed(v.tag));
  reject(() => readSyntaxAset(
    memory, memory.ensure(v.tag, triad(memory, foreign.kinds.Literal, memory.root, field)), v,
  ), "unknown-kind");
  const foreignField = triad(memory, foreign.roles.value, memory.root, value);
  reject(() => readSyntaxAset(
    memory, memory.ensure(v.tag, triad(memory, v.kinds.Literal, memory.root, foreignField)), v,
  ), "unknown-role");
  const dualized = memory.ensure(memory.ensure(memory.root, value), v.roles.value);
  reject(() => readSyntaxAset(
    memory, memory.ensure(v.tag, triad(memory, v.kinds.Literal, memory.root, dualized)), v,
  ), "unknown-role");
}
