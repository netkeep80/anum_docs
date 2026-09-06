import { Memory, type LinkHandle } from "../src/memory.js";
import { ensureRootBasis } from "../src/public.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}

function includes(
  links: readonly LinkHandle[],
  expected: LinkHandle,
  message: string,
): void {
  assert(links.includes(expected), message);
}

function excludes(
  links: readonly LinkHandle[],
  unexpected: LinkHandle,
  message: string,
): void {
  assert(!links.includes(unexpected), message);
}

function main(): void {
  const memory = new Memory();
  const { R, O, C, L, U } = ensureRootBasis(memory);

  // Explanatory vocabulary only. The semantic witness is ordinary Link topology.
  const relationKind = O;
  const binaryKind = C;
  const relationName = L;

  const relationBinary = memory.ensure(relationKind, binaryKind);
  const relationContext = memory.ensure(relationBinary, relationName);

  // Distinct argument/value witnesses built from ordinary Links.
  const a0 = U;
  const a1 = memory.ensure(U, O);
  const aN = memory.ensure(U, C);
  const b0 = memory.ensure(C, U);
  const b1 = memory.ensure(L, U);
  const bN = memory.ensure(O, U);
  const c1 = memory.ensure(C, O);
  const c2 = memory.ensure(L, C);
  assert(c1 !== c2, "multiple values require distinct Link identities");

  // Three fully-applied prefixes with identical left-associated binary shape.
  const zeroPartial = memory.ensure(relationContext, a0);
  const zeroPrefix = memory.ensure(zeroPartial, b0);

  const onePartial = memory.ensure(relationContext, a1);
  const onePrefix = memory.ensure(onePartial, b1);

  const manyPartial = memory.ensure(relationContext, aN);
  const manyPrefix = memory.ensure(manyPartial, bN);

  same(memory.outgoing(zeroPrefix).length, 0, "fully-applied relation may have zero values");

  const oneValueFact = memory.ensure(onePrefix, c1);
  const oneValues = memory.outgoing(onePrefix);
  same(oneValues.length, 1, "fully-applied relation may have exactly one value");
  includes(oneValues, oneValueFact, "single value fact leaves exact application prefix");
  same(memory.poles(oneValueFact).end, c1, "single value fact retains its value");

  const manyValueFact1 = memory.ensure(manyPrefix, c1);
  const manyValueFact2 = memory.ensure(manyPrefix, c2);
  assert(manyValueFact1 !== manyValueFact2, "distinct values produce distinct correspondence facts");

  const manyValues = memory.outgoing(manyPrefix);
  same(manyValues.length, 2, "fully-applied relation may have multiple values");
  includes(manyValues, manyValueFact1, "first multivalue fact leaves exact application prefix");
  includes(manyValues, manyValueFact2, "second multivalue fact leaves exact application prefix");
  same(memory.poles(manyValueFact1).end, c1, "first multivalue fact retains c1");
  same(memory.poles(manyValueFact2).end, c2, "second multivalue fact retains c2");

  // Cardinality does not change the application representation. Every prefix is
  // relationContext -> firstArgument -> secondArgument and differs only by data.
  same(memory.poles(zeroPrefix).start, zeroPartial, "zero-value prefix keeps partial application");
  same(memory.poles(onePrefix).start, onePartial, "one-value prefix keeps partial application");
  same(memory.poles(manyPrefix).start, manyPartial, "many-value prefix keeps partial application");
  same(memory.poles(zeroPartial).start, relationContext, "zero-value case keeps relation context");
  same(memory.poles(onePartial).start, relationContext, "one-value case keeps relation context");
  same(memory.poles(manyPartial).start, relationContext, "many-value case keeps relation context");

  // The same absolute contextual relation identity is recoverable in every case.
  const contextPoles = memory.poles(relationContext);
  same(contextPoles.start, relationBinary, "relation context keeps binary classification prefix");
  same(contextPoles.end, relationName, "relation context keeps relation identity");
  const binaryPoles = memory.poles(relationBinary);
  same(binaryPoles.start, relationKind, "binary relation keeps relation kind");
  same(binaryPoles.end, binaryKind, "binary relation keeps arity classification");

  // Broader structure attaches to the complete correspondence fact, not the
  // application prefix, and therefore cannot become an extra value continuation.
  const provenance = memory.ensure(manyValueFact1, R);
  includes(memory.outgoing(manyValueFact1), provenance, "value fact may participate in broader structure");
  excludes(memory.outgoing(manyPrefix), provenance, "fact provenance is not a third relation value");
  same(memory.outgoing(manyPrefix).length, 2, "provenance does not change value cardinality");

  // No uniqueness or totality follows from ordinary Link construction itself.
  same(memory.outgoing(zeroPrefix).length, 0, "zero-value case remains valid after other cases materialize");
  same(memory.outgoing(onePrefix).length, 1, "single-valued case remains ordinary data");
  same(memory.outgoing(manyPrefix).length, 2, "multivalued case remains ordinary data");

  const beforeReadOnlyAudit = memory.linkCount;
  memory.poles(relationContext);
  memory.poles(zeroPrefix);
  memory.poles(onePrefix);
  memory.poles(manyPrefix);
  memory.outgoing(zeroPrefix);
  memory.outgoing(onePrefix);
  memory.outgoing(manyPrefix);
  memory.find(relationContext, aN);
  memory.find(manyPartial, bN);
  same(memory.linkCount, beforeReadOnlyAudit, "value-cardinality inspection is read-only");

  console.log("contextual multivalued relation falsifier: ZERO_ONE_MANY_SURVIVES");
}

main();
