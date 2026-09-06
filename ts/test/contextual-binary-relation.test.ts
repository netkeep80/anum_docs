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
  const { O, C, L, U } = ensureRootBasis(memory);

  // Research vocabulary is ordinary MTS topology. Host variable names only
  // explain the intended context and are not semantic authority.
  const functionKind = O;
  const logicalKind = C;
  const binaryKind = memory.ensure(U, C);
  const andName = memory.ensure(C, L);
  const zero = memory.ensure(C, O);
  const one = memory.ensure(L, C);

  assert(binaryKind !== andName, "binary kind and AND name must be distinct Links");
  assert(zero !== one, "Boolean witnesses must have distinct Link identity");

  // Function -> logical -> binary -> AND
  const functionLogical = memory.ensure(functionKind, logicalKind);
  const binaryLogicalFunction = memory.ensure(functionLogical, binaryKind);
  const andContext = memory.ensure(binaryLogicalFunction, andName);

  // First application is itself the stable partially-applied relation identity.
  const and0 = memory.ensure(andContext, zero);
  const and1 = memory.ensure(andContext, one);
  same(memory.find(andContext, zero), and0, "AND(0) partial application is exact Link identity");
  same(memory.find(andContext, one), and1, "AND(1) partial application is exact Link identity");
  same(memory.poles(and0).start, andContext, "AND(0) retains AND context");
  same(memory.poles(and0).end, zero, "AND(0) retains first argument");

  // The partial-application Link directly accepts the second argument.
  const and00 = memory.ensure(and0, zero);
  const and01 = memory.ensure(and0, one);
  const and10 = memory.ensure(and1, zero);
  const and11 = memory.ensure(and1, one);

  same(memory.find(and0, zero), and00, "AND(0)(0) is found from partial application");
  same(memory.find(and0, one), and01, "AND(0)(1) is found from partial application");
  same(memory.find(and1, zero), and10, "AND(1)(0) is found from partial application");
  same(memory.find(and1, one), and11, "AND(1)(1) is found from partial application");
  assert(and01 !== and10, "argument order must remain structural");

  // Truth-table correspondence facts. This is finite representation evidence,
  // not a generic proof of commutativity.
  const and00Is0 = memory.ensure(and00, zero);
  const and01Is0 = memory.ensure(and01, zero);
  const and10Is0 = memory.ensure(and10, zero);
  const and11Is1 = memory.ensure(and11, one);

  same(memory.poles(and00Is0).start, and00, "AND(0)(0)=0 starts from full application prefix");
  same(memory.poles(and00Is0).end, zero, "AND(0)(0)=0 value");
  same(memory.poles(and01Is0).start, and01, "AND(0)(1)=0 starts from full application prefix");
  same(memory.poles(and10Is0).start, and10, "AND(1)(0)=0 starts from full application prefix");
  same(memory.poles(and11Is1).end, one, "AND(1)(1)=1 value");

  // Full absolute ancestry retains both argument positions and binary context.
  const fact01 = memory.poles(and01Is0);
  same(fact01.start, and01, "value fact ancestry: full application");
  same(fact01.end, zero, "value fact ancestry: result");

  const app01 = memory.poles(fact01.start);
  same(app01.start, and0, "full application ancestry: partial application");
  same(app01.end, one, "full application ancestry: second argument");

  const partial0 = memory.poles(app01.start);
  same(partial0.start, andContext, "partial ancestry: AND context");
  same(partial0.end, zero, "partial ancestry: first argument");

  const andContextPoles = memory.poles(partial0.start);
  same(andContextPoles.start, binaryLogicalFunction, "AND context ancestry: binary logical function");
  same(andContextPoles.end, andName, "AND context ancestry: AND identity");

  const binaryPoles = memory.poles(andContextPoles.start);
  same(binaryPoles.start, functionLogical, "binary context ancestry: function/logical prefix");
  same(binaryPoles.end, binaryKind, "binary context ancestry: arity-2 classification");

  const functionLogicalPoles = memory.poles(binaryPoles.start);
  same(functionLogicalPoles.start, functionKind, "function/logical ancestry: function kind");
  same(functionLogicalPoles.end, logicalKind, "function/logical ancestry: logical kind");

  // A context-free pair/tuple orientation is a different topology and cannot
  // replace curried application by host interpretation.
  const pair01 = memory.ensure(zero, one);
  const tupleLike = memory.ensure(andContext, pair01);
  assert(tupleLike !== and01, "AND -> (0 -> 1) must differ from (AND -> 0) -> 1");
  same(memory.poles(tupleLike).end, pair01, "tuple-like candidate ends at context-free pair");
  same(memory.poles(and01).start, and0, "curried application starts at AND(0)");

  // The two swapped finite applications both happen to map to 0, but their
  // application identities remain distinct. Equality of results is not identity
  // of applications and is not yet a universal commutativity theorem.
  same(memory.poles(and01Is0).end, memory.poles(and10Is0).end, "finite swapped AND cases share value 0");
  assert(and01 !== and10, "swapped applications remain distinct despite equal finite result");

  // A completed correspondence fact may be linked into wider provenance without
  // becoming another value of the fully-applied prefix.
  const provenance = memory.ensure(and01Is0, functionKind);
  includes(memory.outgoing(and01Is0), provenance, "complete AND fact may have broader structure");
  excludes(memory.outgoing(and01), provenance, "fact provenance is not another AND(0)(1) value");

  const beforeReadOnlyAudit = memory.linkCount;
  memory.find(andContext, zero);
  memory.find(and0, one);
  memory.poles(and01Is0);
  memory.poles(and01);
  memory.poles(and0);
  memory.poles(andContext);
  memory.outgoing(and01);
  same(memory.linkCount, beforeReadOnlyAudit, "binary contextual inspection is read-only");

  console.log("contextual binary relation falsifier: BINARY_CURRIED_CONTEXT_SURVIVES");
}

main();
