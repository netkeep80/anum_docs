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

  // Research vocabulary is represented only by ordinary MTS Links. Host names
  // below are explanatory labels; Link identity is determined solely by poles.
  const functionKind = O;
  const logicalKind = C;
  const unaryKind = L;
  const notName = U;

  // Keep the Boolean witnesses independent of the vocabulary identities.
  const zero = memory.ensure(C, O);
  const one = memory.ensure(L, C);
  assert(zero !== one, "Boolean witnesses must have distinct Link identity");

  // Candidate absolute/contextual identity:
  //   Function -> logical -> unary -> NOT
  // interpreted strictly left-associatively as ordinary Link construction.
  const functionLogical = memory.ensure(functionKind, logicalKind);
  const unaryLogicalFunction = memory.ensure(functionLogical, unaryKind);
  const notContext = memory.ensure(unaryLogicalFunction, notName);

  const not0 = memory.ensure(notContext, zero);
  const not1 = memory.ensure(notContext, one);
  const not0Is1 = memory.ensure(not0, one);
  const not1Is0 = memory.ensure(not1, zero);

  // The complete function context is recoverable read-only from ordinary poles.
  const notPoles = memory.poles(notContext);
  same(notPoles.start, unaryLogicalFunction, "NOT context keeps unary logical-function prefix");
  same(notPoles.end, notName, "NOT context keeps NOT name Link");

  const unaryPoles = memory.poles(unaryLogicalFunction);
  same(unaryPoles.start, functionLogical, "unary context keeps function/logical prefix");
  same(unaryPoles.end, unaryKind, "unary context keeps arity classification");

  const functionLogicalPoles = memory.poles(functionLogical);
  same(functionLogicalPoles.start, functionKind, "function/logical context keeps function kind");
  same(functionLogicalPoles.end, logicalKind, "function/logical context keeps logical kind");

  // Application is itself an ordinary Link whose start is the full relation
  // context. No FunctionCall/Apply node or tuple carrier is required.
  same(memory.poles(not0).start, notContext, "NOT(0) starts from contextual NOT identity");
  same(memory.poles(not0).end, zero, "NOT(0) ends at argument 0");
  same(memory.poles(not1).start, notContext, "NOT(1) starts from contextual NOT identity");
  same(memory.poles(not1).end, one, "NOT(1) ends at argument 1");

  // Values continue from the application Link, preserving function context.
  same(memory.poles(not0Is1).start, not0, "NOT(0)=1 continues from NOT(0) application Link");
  same(memory.poles(not0Is1).end, one, "NOT(0)=1 ends at value 1");
  same(memory.poles(not1Is0).start, not1, "NOT(1)=0 continues from NOT(1) application Link");
  same(memory.poles(not1Is0).end, zero, "NOT(1)=0 ends at value 0");

  // The rejected orientation does not retain the application context in the
  // same structural position. It is a different Link by identity-by-poles.
  const zeroToOne = memory.ensure(zero, one);
  const rightAssociated = memory.ensure(notContext, zeroToOne);
  assert(
    rightAssociated !== not0Is1,
    "NOT -> (0 -> 1) must not collapse with (NOT -> 0) -> 1",
  );
  same(memory.poles(rightAssociated).start, notContext, "right-associated witness starts at NOT context");
  same(memory.poles(rightAssociated).end, zeroToOne, "right-associated witness ends at context-free 0->1 Link");

  // Arbitrary relations leaving 0 or 1 do not contaminate NOT application:
  // NOT(0) is selected by the exact pair (notContext, zero), not by scanning
  // outgoing Links from the raw argument Link.
  const unrelatedFromZero = memory.ensure(zero, R);
  const unrelatedFromOne = memory.ensure(one, R);
  includes(memory.outgoing(zero), unrelatedFromZero, "raw 0 may have unrelated outgoing Links");
  includes(memory.outgoing(one), unrelatedFromOne, "raw 1 may have unrelated outgoing Links");
  excludes(memory.outgoing(notContext), unrelatedFromZero, "raw 0 outgoing Link cannot become NOT application");
  excludes(memory.outgoing(notContext), unrelatedFromOne, "raw 1 outgoing Link cannot become NOT application");
  same(memory.find(notContext, zero), not0, "NOT(0) is recovered from exact contextual pair");
  same(memory.find(notContext, one), not1, "NOT(1) is recovered from exact contextual pair");

  // Multivaluedness is structurally possible and therefore uniqueness is not a
  // foundational property of application. A conventional function may impose
  // uniqueness as an additional contextual constraint later.
  const secondNot0Value = memory.ensure(not0, zero);
  includes(memory.outgoing(not0), not0Is1, "first NOT(0) value is an ordinary continuation");
  includes(memory.outgoing(not0), secondNot0Value, "second NOT(0) value is also representable");

  // A completed correspondence fact may itself participate in broader MTS
  // structure without becoming another value of the same unary application.
  // Provenance/classification therefore attaches to the fact Link, not to the
  // application prefix whose outgoing Links are the candidate value set.
  const provenance = memory.ensure(not0Is1, functionKind);
  includes(memory.outgoing(not0Is1), provenance, "correspondence fact may have broader outgoing structure");
  excludes(memory.outgoing(not0), provenance, "fact provenance is not another NOT(0) value");

  // All semantic inspection above is read-only.
  const beforeReadOnlyAudit = memory.linkCount;
  memory.poles(notContext);
  memory.poles(not0);
  memory.outgoing(not0);
  memory.find(notContext, zero);
  same(memory.linkCount, beforeReadOnlyAudit, "contextual relation inspection is read-only");

  console.log("contextual unary relation falsifier: LEFT_ASSOCIATED_CONTEXT_SURVIVES");
}

main();
