import { Memory, type LinkHandle } from "../src/memory.js";
import {
  SyntaxAsetBuilder,
  SyntaxAsetContractError,
  materializeSyntaxAsetVocabulary,
  readSyntaxAset,
  type SyntaxAsetToolingVocabulary,
} from "../src/tooling/syntax-aset.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}

function reject(
  effect: () => unknown,
  code: SyntaxAsetContractError["code"],
): void {
  try {
    effect();
  } catch (error) {
    assert(error instanceof SyntaxAsetContractError, `expected SyntaxAsetContractError, got ${String(error)}`);
    same(error.code, code, "SyntaxAset error code");
    return;
  }
  throw new Error(`expected SyntaxAset rejection: ${code}`);
}

function fixture(): {
  readonly memory: Memory;
  readonly vocabulary: SyntaxAsetToolingVocabulary;
} {
  const memory = new Memory();
  const seed = memory.ensureEndSelfClosed(memory.root);
  return Object.freeze({
    memory,
    vocabulary: materializeSyntaxAsetVocabulary(memory, seed),
  });
}

function carrier(memory: Memory, salt: LinkHandle): LinkHandle {
  return memory.ensureStartSelfClosed(salt);
}

function triad(
  memory: Memory,
  relation: LinkHandle,
  subject: LinkHandle,
  object: LinkHandle,
): LinkHandle {
  return memory.ensure(relation, memory.ensure(subject, object));
}

function addLiteral(
  builder: SyntaxAsetBuilder,
  vocabulary: SyntaxAsetToolingVocabulary,
  value: LinkHandle,
): LinkHandle {
  return builder.addOccurrence(vocabulary.kinds.Literal, [
    { role: vocabulary.roles.value, value },
  ]);
}

// A carrier is not a syntax child merely because its poles accidentally look
// like an occurrence. Membership in a SyntaxAset, not shape resemblance, is
// what makes an occurrence a syntax occurrence.
{
  const { memory, vocabulary } = fixture();
  const occurrenceShapedCarrier = memory.ensure(vocabulary.kinds.Literal, memory.root);
  const builder = new SyntaxAsetBuilder(memory, vocabulary);
  const literal = addLiteral(builder, vocabulary, occurrenceShapedCarrier);
  const aset = builder.finish(literal);
  same(readSyntaxAset(memory, aset, vocabulary).root, literal, "shape-only carrier remains a carrier");
}

// A real occurrence owned by another SyntaxAset cannot be smuggled through a
// carrier relation. Its foreign SyntaxAset wrapper provides structural proof
// that it is syntax, even though it is not a local child.
{
  const { memory, vocabulary } = fixture();
  const foreignBuilder = new SyntaxAsetBuilder(memory, vocabulary);
  const foreign = addLiteral(
    foreignBuilder,
    vocabulary,
    carrier(memory, vocabulary.kinds.Literal),
  );
  foreignBuilder.finish(foreign);

  const localBuilder = new SyntaxAsetBuilder(memory, vocabulary);
  reject(
    () => addLiteral(localBuilder, vocabulary, foreign),
    "invalid-carrier-target",
  );
}

// A local occurrence is likewise forbidden where a carrier is required.
{
  const { memory, vocabulary } = fixture();
  const builder = new SyntaxAsetBuilder(memory, vocabulary);
  const child = addLiteral(builder, vocabulary, carrier(memory, vocabulary.tag));
  reject(() => addLiteral(builder, vocabulary, child), "invalid-carrier-target");
}

// Link has the exact ordered singleton grammar start,end. Missing, duplicate,
// reversed and wrong known roles all fail closed.
{
  const { memory, vocabulary } = fixture();
  const builder = new SyntaxAsetBuilder(memory, vocabulary);
  const a = addLiteral(builder, vocabulary, carrier(memory, vocabulary.kinds.Link));
  const b = addLiteral(builder, vocabulary, carrier(memory, vocabulary.roles.end));

  reject(
    () => builder.addOccurrence(vocabulary.kinds.Link, [
      { role: vocabulary.roles.end, value: b },
    ]),
    "invalid-grammar",
  );
  reject(
    () => builder.addOccurrence(vocabulary.kinds.Link, [
      { role: vocabulary.roles.start, value: a },
    ]),
    "invalid-grammar",
  );
  reject(
    () => builder.addOccurrence(vocabulary.kinds.Link, [
      { role: vocabulary.roles.start, value: a },
      { role: vocabulary.roles.start, value: b },
      { role: vocabulary.roles.end, value: b },
    ]),
    "invalid-grammar",
  );
  reject(
    () => builder.addOccurrence(vocabulary.kinds.Link, [
      { role: vocabulary.roles.end, value: b },
      { role: vocabulary.roles.start, value: a },
    ]),
    "invalid-grammar",
  );
  reject(
    () => builder.addOccurrence(vocabulary.kinds.Link, [
      { role: vocabulary.roles.start, value: a },
      { role: vocabulary.roles.operand, value: b },
    ]),
    "invalid-grammar",
  );

  const link = builder.addOccurrence(vocabulary.kinds.Link, [
    { role: vocabulary.roles.start, value: a },
    { role: vocabulary.roles.end, value: b },
  ]);
  same(readSyntaxAset(memory, builder.finish(link), vocabulary).root, link, "canonical Link accepted");
}

// Statement and unary forms are exact single-child productions.
{
  const { memory, vocabulary } = fixture();
  const builder = new SyntaxAsetBuilder(memory, vocabulary);
  const child = addLiteral(builder, vocabulary, carrier(memory, vocabulary.kinds.Statement));
  reject(() => builder.addOccurrence(vocabulary.kinds.Statement, []), "invalid-grammar");
  reject(
    () => builder.addOccurrence(vocabulary.kinds.Statement, [
      { role: vocabulary.roles.expression, value: child },
      { role: vocabulary.roles.expression, value: child },
    ]),
    "invalid-grammar",
  );
  for (const kind of [vocabulary.kinds.Not, vocabulary.kinds.Female, vocabulary.kinds.Male]) {
    reject(() => builder.addOccurrence(kind, []), "invalid-grammar");
    reject(
      () => builder.addOccurrence(kind, [
        { role: vocabulary.roles.operand, value: child },
        { role: vocabulary.roles.operand, value: child },
      ]),
      "invalid-grammar",
    );
  }
  const statement = builder.addOccurrence(vocabulary.kinds.Statement, [
    { role: vocabulary.roles.expression, value: child },
  ]);
  same(readSyntaxAset(memory, builder.finish(statement), vocabulary).root, statement, "Statement accepted");
}

// Definition name and body are both syntax children. Equality/Inequality are
// exact ordered left/right child pairs.
{
  const { memory, vocabulary } = fixture();
  const builder = new SyntaxAsetBuilder(memory, vocabulary);
  const left = addLiteral(builder, vocabulary, carrier(memory, vocabulary.kinds.Equality));
  const right = addLiteral(builder, vocabulary, carrier(memory, vocabulary.kinds.Inequality));

  reject(
    () => builder.addOccurrence(vocabulary.kinds.Definition, [
      { role: vocabulary.roles.name, value: left },
    ]),
    "invalid-grammar",
  );
  reject(
    () => builder.addOccurrence(vocabulary.kinds.Definition, [
      { role: vocabulary.roles.body, value: right },
      { role: vocabulary.roles.name, value: left },
    ]),
    "invalid-grammar",
  );

  for (const kind of [vocabulary.kinds.Equality, vocabulary.kinds.Inequality]) {
    reject(
      () => builder.addOccurrence(kind, [
        { role: vocabulary.roles.left, value: left },
      ]),
      "invalid-grammar",
    );
    reject(
      () => builder.addOccurrence(kind, [
        { role: vocabulary.roles.left, value: left },
        { role: vocabulary.roles.left, value: right },
        { role: vocabulary.roles.right, value: right },
      ]),
      "invalid-grammar",
    );
    reject(
      () => builder.addOccurrence(kind, [
        { role: vocabulary.roles.left, value: left },
        { role: vocabulary.roles.right, value: right },
        { role: vocabulary.roles.operand, value: left },
      ]),
      "invalid-grammar",
    );
  }

  const definition = builder.addOccurrence(vocabulary.kinds.Definition, [
    { role: vocabulary.roles.name, value: left },
    { role: vocabulary.roles.body, value: right },
  ]);
  same(readSyntaxAset(memory, builder.finish(definition), vocabulary).root, definition, "Definition accepted");
}

// Sequence exists only for 2+ juxtaposed source forms. Repeated equal child
// occurrences remain explicit ordered positions.
{
  const { memory, vocabulary } = fixture();
  const builder = new SyntaxAsetBuilder(memory, vocabulary);
  const item = addLiteral(builder, vocabulary, carrier(memory, vocabulary.kinds.Sequence));
  reject(() => builder.addOccurrence(vocabulary.kinds.Sequence, []), "invalid-grammar");
  reject(
    () => builder.addOccurrence(vocabulary.kinds.Sequence, [
      { role: vocabulary.roles.item, value: item },
    ]),
    "invalid-grammar",
  );
  const sequence = builder.addOccurrence(vocabulary.kinds.Sequence, [
    { role: vocabulary.roles.item, value: item },
    { role: vocabulary.roles.item, value: item },
  ]);
  const read = readSyntaxAset(memory, builder.finish(sequence), vocabulary);
  same(read.occurrences.at(-1)?.fields[0]?.value, item, "first Sequence position retained");
  same(read.occurrences.at(-1)?.fields[1]?.value, item, "second Sequence position retained");
}

// File and Set accept empty syntax. Set preserves textual order at the syntax
// layer; this is not a claim that semantic set membership is ordered.
for (const kindName of ["File", "Set"] as const) {
  const { memory, vocabulary } = fixture();
  const builder = new SyntaxAsetBuilder(memory, vocabulary);
  const empty = builder.addOccurrence(vocabulary.kinds[kindName], []);
  same(readSyntaxAset(memory, builder.finish(empty), vocabulary).root, empty, `${kindName} empty accepted`);
}

{
  const { memory, vocabulary } = fixture();
  const builder = new SyntaxAsetBuilder(memory, vocabulary);
  const first = addLiteral(builder, vocabulary, carrier(memory, vocabulary.kinds.Set));
  const second = addLiteral(builder, vocabulary, carrier(memory, vocabulary.roles.item));
  const set = builder.addOccurrence(vocabulary.kinds.Set, [
    { role: vocabulary.roles.item, value: second },
    { role: vocabulary.roles.item, value: first },
  ]);
  const fields = readSyntaxAset(memory, builder.finish(set), vocabulary).occurrences.at(-1)?.fields;
  same(fields?.[0]?.value, second, "Set first textual item retained");
  same(fields?.[1]?.value, first, "Set second textual item retained");
}

// Round/Square are optional-single-child wrappers: empty and singleton are
// valid, two expressions are not.
for (const kindName of ["Round", "Square"] as const) {
  {
    const { memory, vocabulary } = fixture();
    const builder = new SyntaxAsetBuilder(memory, vocabulary);
    const empty = builder.addOccurrence(vocabulary.kinds[kindName], []);
    same(readSyntaxAset(memory, builder.finish(empty), vocabulary).root, empty, `${kindName} empty accepted`);
  }
  {
    const { memory, vocabulary } = fixture();
    const builder = new SyntaxAsetBuilder(memory, vocabulary);
    const child = addLiteral(builder, vocabulary, carrier(memory, vocabulary.kinds[kindName]));
    reject(
      () => builder.addOccurrence(vocabulary.kinds[kindName], [
        { role: vocabulary.roles.expression, value: child },
        { role: vocabulary.roles.expression, value: child },
      ]),
      "invalid-grammar",
    );
    const wrapper = builder.addOccurrence(vocabulary.kinds[kindName], [
      { role: vocabulary.roles.expression, value: child },
    ]);
    same(readSyntaxAset(memory, builder.finish(wrapper), vocabulary).root, wrapper, `${kindName} singleton accepted`);
  }
}

// ContextPronoun and Literal are exact one-carrier leaves.
for (const kindName of ["ContextPronoun", "Literal"] as const) {
  const { memory, vocabulary } = fixture();
  const builder = new SyntaxAsetBuilder(memory, vocabulary);
  const value = carrier(memory, vocabulary.kinds[kindName]);
  reject(() => builder.addOccurrence(vocabulary.kinds[kindName], []), "invalid-grammar");
  reject(
    () => builder.addOccurrence(vocabulary.kinds[kindName], [
      { role: vocabulary.roles.value, value },
      { role: vocabulary.roles.value, value },
    ]),
    "invalid-grammar",
  );
  const leaf = builder.addOccurrence(vocabulary.kinds[kindName], [
    { role: vocabulary.roles.value, value },
  ]);
  same(readSyntaxAset(memory, builder.finish(leaf), vocabulary).root, leaf, `${kindName} carrier accepted`);
}

// The occurrence chain is also the owned SyntaxAset closure. An otherwise valid
// earlier occurrence that is not reachable from the declared final root fails.
{
  const { memory, vocabulary } = fixture();
  const builder = new SyntaxAsetBuilder(memory, vocabulary);
  addLiteral(builder, vocabulary, carrier(memory, vocabulary.roles.left));
  const root = addLiteral(builder, vocabulary, carrier(memory, vocabulary.roles.right));
  reject(() => builder.finish(root), "unreachable-occurrence");
}

// The untrusted reader independently enforces the same reachability rule.
{
  const { memory, vocabulary } = fixture();
  const fieldA = triad(
    memory,
    vocabulary.roles.value,
    memory.root,
    carrier(memory, vocabulary.roles.start),
  );
  const unused = triad(memory, vocabulary.kinds.Literal, memory.root, fieldA);
  const fieldB = triad(
    memory,
    vocabulary.roles.value,
    memory.root,
    carrier(memory, vocabulary.roles.end),
  );
  const root = triad(memory, vocabulary.kinds.Literal, unused, fieldB);
  const aset = memory.ensure(vocabulary.tag, root);
  reject(() => readSyntaxAset(memory, aset, vocabulary), "unreachable-occurrence");
}

// DAG-like reuse is allowed when it is explicit and every owned occurrence is
// reachable. The same child can fill both Link roles without host identity.
{
  const { memory, vocabulary } = fixture();
  const builder = new SyntaxAsetBuilder(memory, vocabulary);
  const child = addLiteral(builder, vocabulary, carrier(memory, vocabulary.kinds.Link));
  const link = builder.addOccurrence(vocabulary.kinds.Link, [
    { role: vocabulary.roles.start, value: child },
    { role: vocabulary.roles.end, value: child },
  ]);
  same(readSyntaxAset(memory, builder.finish(link), vocabulary).root, link, "explicit child sharing accepted");
}

// Arbitrary/untrusted topology cannot introduce unknown kind/role Links.
{
  const { memory, vocabulary } = fixture();
  const value = carrier(memory, vocabulary.tag);
  const field = triad(memory, vocabulary.roles.value, memory.root, value);
  const unknownKind = memory.ensureStartSelfClosed(value);
  const occurrence = triad(memory, unknownKind, memory.root, field);
  reject(
    () => readSyntaxAset(memory, memory.ensure(vocabulary.tag, occurrence), vocabulary),
    "unknown-kind",
  );
}

{
  const { memory, vocabulary } = fixture();
  const value = carrier(memory, vocabulary.tag);
  const unknownRole = memory.ensureEndSelfClosed(value);
  const field = triad(memory, unknownRole, memory.root, value);
  const occurrence = triad(memory, vocabulary.kinds.Literal, memory.root, field);
  reject(
    () => readSyntaxAset(memory, memory.ensure(vocabulary.tag, occurrence), vocabulary),
    "unknown-role",
  );
}

// Kind/role Links from another explicit vocabulary seed are foreign syntax
// vocabulary even when they carry the same TypeScript display labels.
{
  const { memory, vocabulary } = fixture();
  const secondSeed = memory.ensureStartSelfClosed(vocabulary.tag);
  const foreignVocabulary = materializeSyntaxAsetVocabulary(memory, secondSeed);
  const value = carrier(memory, vocabulary.kinds.Literal);

  const localField = triad(memory, vocabulary.roles.value, memory.root, value);
  const foreignKindOccurrence = triad(
    memory,
    foreignVocabulary.kinds.Literal,
    memory.root,
    localField,
  );
  reject(
    () => readSyntaxAset(memory, memory.ensure(vocabulary.tag, foreignKindOccurrence), vocabulary),
    "unknown-kind",
  );

  const foreignField = triad(memory, foreignVocabulary.roles.value, memory.root, value);
  const localKindOccurrence = triad(memory, vocabulary.kinds.Literal, memory.root, foreignField);
  reject(
    () => readSyntaxAset(memory, memory.ensure(vocabulary.tag, localKindOccurrence), vocabulary),
    "unknown-role",
  );
}

// Swapping the nested-pair orientation is not an alternate canonical encoding.
{
  const { memory, vocabulary } = fixture();
  const value = carrier(memory, vocabulary.kinds.Literal);
  const horizontal = memory.ensure(memory.root, value);
  const dualizedField = memory.ensure(horizontal, vocabulary.roles.value);
  const occurrence = triad(memory, vocabulary.kinds.Literal, memory.root, dualizedField);
  reject(
    () => readSyntaxAset(memory, memory.ensure(vocabulary.tag, occurrence), vocabulary),
    "unknown-role",
  );
}
