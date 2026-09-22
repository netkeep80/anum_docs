import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
  type LinkPoles,
  type ReadMemory,
  type RootBasis,
} from "../src/memory.js";
import {
  StructuralRuleError,
  type StructuralRoleBinding,
} from "../src/structural-rule.js";
import { unifyStructuralTemplate } from "../src/structural-unification.js";
import {
  resolveFlatBundle,
  type BundleValue,
  type ResolvedOccurrence,
} from "../src/value-bundle.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.13 A11f self-continuation: ${message}`);
}
function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: values differ`);
}

class PoleOnlyProbe implements ReadMemory {
  constructor(private readonly source: ReadMemory) {}
  get root(): LinkHandle { return this.source.root; }
  get linkCount(): number { return this.source.linkCount; }
  poles(link: LinkHandle): LinkPoles { return this.source.poles(link); }
  find(): LinkHandle | undefined {
    throw new Error("A11f unification must not use find");
  }
  outgoing(): readonly LinkHandle[] {
    throw new Error("A11f unification must not use outgoing");
  }
  incoming(): readonly LinkHandle[] {
    throw new Error("A11f unification must not use incoming");
  }
}

interface RootFrame {
  readonly startRole: LinkHandle;
  readonly endRole: LinkHandle;
  readonly directMethod: LinkHandle;
  readonly inverseMethod: LinkHandle;
}

function rootFrame(memory: Memory, basis: RootBasis): RootFrame {
  const startRole = memory.ensureStartSelfClosed(basis.R);
  const endRole = memory.ensureEndSelfClosed(basis.R);
  const directMethod = memory.ensure(startRole, endRole);
  const inverseMethod = memory.ensure(endRole, startRole);

  same(startRole, basis.O, "START(R)=O");
  same(endRole, basis.C, "END(R)=C");
  same(directMethod, basis.L, "Direct(R)=L");
  same(inverseMethod, basis.U, "Inverse(R)=U");

  return Object.freeze({
    startRole,
    endRole,
    directMethod,
    inverseMethod,
  });
}

function bindingsMap(
  memory: Memory,
  frame: RootFrame,
  target: LinkHandle,
): ReadonlyMap<LinkHandle, LinkHandle> {
  const bindings = unifyStructuralTemplate(
    new PoleOnlyProbe(memory),
    frame.directMethod,
    target,
    Object.freeze([frame.startRole, frame.endRole]),
  );
  return new Map(bindings.map((x) => [x.role, x.value]));
}

function exactlyOne(
  bindings: ReadonlyMap<LinkHandle, LinkHandle>,
  role: LinkHandle,
): LinkHandle {
  const value = bindings.get(role);
  assert(value !== undefined, "A11f expected structural role binding");
  return value;
}

function orientation(
  memory: Memory,
  frame: RootFrame,
  method: LinkHandle,
): Readonly<{ fromRole: LinkHandle; toRole: LinkHandle }> {
  const map = bindingsMap(memory, frame, method);
  const fromRole = exactlyOne(map, frame.startRole);
  const toRole = exactlyOne(map, frame.endRole);
  const roles = new Set([frame.startRole, frame.endRole]);

  assert(roles.has(fromRole) && roles.has(toRole), "method maps within root role frame");
  assert(fromRole !== toRole, "method orientation is bijective");
  return Object.freeze({ fromRole, toRole });
}

/**
 * Generic self-continuation probe.
 *
 * The selected Link is simultaneously:
 *   - the application key being queried;
 *   - the only candidate continuation occurrence.
 *
 * No aspect name/enum participates. The selected method Link determines which
 * structural role is FROM and which is TO.
 */
function selfContinuation(
  memory: Memory,
  frame: RootFrame,
  method: LinkHandle,
  application: LinkHandle,
): BundleValue {
  const oriented = orientation(memory, frame, method);

  let values: ReadonlyMap<LinkHandle, LinkHandle>;
  try {
    values = bindingsMap(memory, frame, application);
  } catch (error) {
    if (error instanceof StructuralRuleError) {
      throw new Error("A11f selected application must decode through root Dual template");
    }
    throw error;
  }

  const from = values.get(oriented.fromRole);
  const to = values.get(oriented.toRole);
  assert(from !== undefined && to !== undefined, "self-continuation roles resolve");

  const occurrences: ResolvedOccurrence[] =
    from === application
      ? [Object.freeze({ path: Object.freeze([0]), link: to })]
      : [];

  return resolveFlatBundle(memory, Object.freeze(occurrences));
}

function bit(result: BundleValue): "0" | "1" {
  assert(result.links.size <= 1, "A11f self-continuation is at most singleton");
  return result.links.size === 1 ? "1" : "0";
}

function singleton(
  result: BundleValue,
  expected: LinkHandle,
  message: string,
): void {
  same(result.links.size, 1, `${message}: singleton`);
  assert(result.links.has(expected), `${message}: exact result`);
}

function empty(result: BundleValue, message: string): void {
  same(result.links.size, 0, `${message}: empty`);
}

function exercise(memory: Memory, withNoise: boolean): void {
  const basis = ensureRootBasis(memory);
  if (withNoise) {
    const n0 = memory.ensure(basis.U, basis.C);
    const n1 = memory.ensure(n0, basis.L);
    memory.ensure(basis.O, n1);
  }

  const frame = rootFrame(memory, basis);

  // A11a fixed structural identities remain the invocation keys.
  same(memory.ensure(basis.R, basis.R), basis.R, "R(R)=R key");
  same(memory.ensure(basis.O, basis.R), basis.O, "O(R)=O key");
  same(memory.ensure(basis.R, basis.C), basis.C, "R(C)=C key");
  same(memory.ensure(basis.O, basis.C), basis.L, "O(C)=L key");
  same(memory.ensure(basis.C, basis.O), basis.U, "C(O)=U key");

  const cases = [
    Object.freeze({
      name: "R",
      link: basis.R,
      signature: "11",
      directExpected: basis.R,
      inverseExpected: basis.R,
    }),
    Object.freeze({
      name: "O",
      link: basis.O,
      signature: "10",
      directExpected: basis.R,
      inverseExpected: undefined,
    }),
    Object.freeze({
      name: "C",
      link: basis.C,
      signature: "01",
      directExpected: undefined,
      inverseExpected: basis.R,
    }),
    Object.freeze({
      name: "L",
      link: basis.L,
      signature: "00",
      directExpected: undefined,
      inverseExpected: undefined,
    }),
    Object.freeze({
      name: "U",
      link: basis.U,
      signature: "00",
      directExpected: undefined,
      inverseExpected: undefined,
    }),
  ] as const;

  const signatures = new Set<string>();

  for (const item of cases) {
    const direct = selfContinuation(
      memory,
      frame,
      frame.directMethod,
      item.link,
    );
    const inverse = selfContinuation(
      memory,
      frame,
      frame.inverseMethod,
      item.link,
    );

    const signature = `${bit(direct)}${bit(inverse)}`;
    same(signature, item.signature, `${item.name} method-oriented signature`);
    signatures.add(signature);

    if (item.directExpected === undefined) {
      empty(direct, `${item.name} direct`);
    } else {
      singleton(direct, item.directExpected, `${item.name} direct`);
    }

    if (item.inverseExpected === undefined) {
      empty(inverse, `${item.name} inverse`);
    } else {
      singleton(inverse, item.inverseExpected, `${item.name} inverse`);
    }
  }

  same(signatures.size, 4, "exactly four self-continuation signatures");

  // Strong fixed-point reading: R(R) returns R under either orientation,
  // with no ROOT-specific branch in selfContinuation().
  singleton(
    selfContinuation(memory, frame, frame.directMethod, basis.R),
    basis.R,
    "R(R) direct fixed point",
  );
  singleton(
    selfContinuation(memory, frame, frame.inverseMethod, basis.R),
    basis.R,
    "R(R) inverse fixed point",
  );
}

function main(): void {
  exercise(new Memory(), false);
  exercise(new Memory(), true);

  console.log([
    "MTS v0.13 A11f:",
    "SELF_CONTINUATION_SIGNATURES=GREEN_SCOPED_RESEARCH",
    "R=11",
    "O=10",
    "C=01",
    "L=00",
    "U=00",
    "DISTINCT_ASPECT_SIGNATURES=4",
    "R_OF_R_RETURNS_R=DIRECT_AND_INVERSE",
    "HOST_ASPECT_BRANCHES=0",
    "HOST_DIRECTION_BRANCHES=0",
    "INDEPENDENT_MEMORIES=2",
    "GENERIC_UNIFICATION=HOST_RESIDUAL",
    "SEMANTIC_CLOSURE=OPEN",
    "PRODUCTION_UNCHANGED",
  ].join(" "));
}

main();
