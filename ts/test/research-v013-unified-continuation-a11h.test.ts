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
  if (!condition) throw new Error(`v0.13 A11h unified continuation: ${message}`);
}
function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: values differ`);
}

class PoleOnlyProbe implements ReadMemory {
  constructor(private readonly source: ReadMemory) {}
  get root(): LinkHandle { return this.source.root; }
  get linkCount(): number { return this.source.linkCount; }
  poles(link: LinkHandle): LinkPoles { return this.source.poles(link); }
  find(): LinkHandle | undefined { throw new Error("A11h must not use find"); }
  outgoing(): readonly LinkHandle[] { throw new Error("A11h must not use outgoing"); }
  incoming(): readonly LinkHandle[] { throw new Error("A11h must not use incoming"); }
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
  return Object.freeze({ startRole, endRole, directMethod, inverseMethod });
}

function decode(
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

function one(
  map: ReadonlyMap<LinkHandle, LinkHandle>,
  role: LinkHandle,
): LinkHandle {
  const value = map.get(role);
  assert(value !== undefined, "A11h structural role binding exists");
  return value;
}

function orientation(
  memory: Memory,
  frame: RootFrame,
  method: LinkHandle,
): Readonly<{ fromRole: LinkHandle; toRole: LinkHandle }> {
  const values = decode(memory, frame, method);
  const fromRole = one(values, frame.startRole);
  const toRole = one(values, frame.endRole);
  const roles = new Set([frame.startRole, frame.endRole]);
  assert(roles.has(fromRole) && roles.has(toRole), "method maps inside root roles");
  assert(fromRole !== toRole, "method orientation is bijective");
  return Object.freeze({ fromRole, toRole });
}

/**
 * One kernel for BOTH ordinary and self-incidence application.
 *
 * Crucially there is no:
 *   if (candidate === application) skip;
 *   switch(aspect);
 *   if (selfIncidence) ...
 *
 * A candidate contributes solely when its method-oriented FROM value equals the
 * application Link. For an ordinary continuation candidate P->b this is normal
 * adjacency. For R/O/C the application Link itself may satisfy the same law.
 */
function readUnified(
  memory: Memory,
  frame: RootFrame,
  method: LinkHandle,
  application: LinkHandle,
  candidates: readonly LinkHandle[],
): BundleValue {
  const oriented = orientation(memory, frame, method);
  const occurrences: ResolvedOccurrence[] = [];
  let index = 0;

  for (const candidate of candidates) {
    let values: ReadonlyMap<LinkHandle, LinkHandle>;
    try {
      values = decode(memory, frame, candidate);
    } catch (error) {
      if (error instanceof StructuralRuleError) continue;
      throw error;
    }

    const from = values.get(oriented.fromRole);
    const to = values.get(oriented.toRole);
    assert(from !== undefined && to !== undefined, "candidate roles resolve");
    if (from !== application) continue;

    occurrences.push(Object.freeze({
      path: Object.freeze([index]),
      link: to,
    }));
    index += 1;
  }

  return resolveFlatBundle(memory, Object.freeze(occurrences));
}

function setSame(
  actual: ReadonlySet<LinkHandle>,
  expected: readonly LinkHandle[],
  message: string,
): void {
  same(actual.size, new Set(expected).size, `${message}: cardinality`);
  for (const x of expected) assert(actual.has(x), `${message}: missing result`);
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

  // -------------------------------------------------------------------------
  // Ordinary application: explicit selected continuations.
  // The application Link itself is deliberately included in candidates.
  // It contributes nothing naturally because it is not self-incident.
  // -------------------------------------------------------------------------
  const fn = memory.ensure(basis.U, basis.L);
  const arg = memory.ensure(basis.L, basis.U);
  const application = memory.ensure(fn, arg);

  const d1 = memory.ensure(basis.O, fn);
  const d2 = memory.ensure(basis.C, arg);
  const i1 = memory.ensure(d1, basis.C);
  const i2 = memory.ensure(d2, basis.O);

  const direct1 = memory.ensure(application, d1);
  const direct2 = memory.ensure(application, d2);
  const inverse1 = memory.ensure(i1, application);
  const inverse2 = memory.ensure(i2, application);

  const ordinaryCandidates = Object.freeze([
    application,
    direct1,
    direct2,
    inverse1,
    inverse2,
  ]);

  const ordinaryDirect = readUnified(
    memory, frame, frame.directMethod, application, ordinaryCandidates,
  );
  const ordinaryInverse = readUnified(
    memory, frame, frame.inverseMethod, application, ordinaryCandidates,
  );

  setSame(ordinaryDirect.links, [d1, d2], "ordinary direct many");
  setSame(ordinaryInverse.links, [i1, i2], "ordinary inverse many");
  assert(!ordinaryDirect.links.has(arg), "ordinary application Link does not self-contribute");
  assert(!ordinaryInverse.links.has(fn), "ordinary application Link does not inverse-self-contribute");

  // -------------------------------------------------------------------------
  // Self-incidence applications: the SAME kernel and the SAME single-candidate
  // shape [application]. No explicit P->b edge is added.
  // -------------------------------------------------------------------------
  {
    const direct = readUnified(memory, frame, frame.directMethod, basis.R, [basis.R]);
    const inverse = readUnified(memory, frame, frame.inverseMethod, basis.R, [basis.R]);
    setSame(direct.links, [basis.R], "R direct self");
    setSame(inverse.links, [basis.R], "R inverse self");
  }
  {
    const direct = readUnified(memory, frame, frame.directMethod, basis.O, [basis.O]);
    const inverse = readUnified(memory, frame, frame.inverseMethod, basis.O, [basis.O]);
    setSame(direct.links, [basis.R], "O direct self");
    empty(inverse, "O inverse self");
  }
  {
    const direct = readUnified(memory, frame, frame.directMethod, basis.C, [basis.C]);
    const inverse = readUnified(memory, frame, frame.inverseMethod, basis.C, [basis.C]);
    empty(direct, "C direct self");
    setSame(inverse.links, [basis.R], "C inverse self");
  }
  for (const [label, applicationLink] of [
    ["L", basis.L],
    ["U", basis.U],
  ] as const) {
    empty(
      readUnified(memory, frame, frame.directMethod, applicationLink, [applicationLink]),
      `${label} direct self`,
    );
    empty(
      readUnified(memory, frame, frame.inverseMethod, applicationLink, [applicationLink]),
      `${label} inverse self`,
    );
  }

  // Zero-valued ordinary application uses the same kernel: selected candidate
  // set contains only the non-self-incident application Link.
  const zeroFn = memory.ensure(fn, d1);
  const zeroArg = memory.ensure(arg, d2);
  const zeroApplication = memory.ensure(zeroFn, zeroArg);
  empty(
    readUnified(
      memory,
      frame,
      frame.directMethod,
      zeroApplication,
      Object.freeze([zeroApplication]),
    ),
    "ordinary defined zero",
  );
}

function main(): void {
  exercise(new Memory(), false);
  exercise(new Memory(), true);

  console.log([
    "MTS v0.13 A11h:",
    "UNIFIED_CONTINUATION_KERNEL=GREEN_SCOPED_RESEARCH",
    "APPLICATION_CLASSES=ORDINARY_AND_SELF_INCIDENCE",
    "RESULT_CARDINALITY=ZERO_ONE_MANY",
    "ORDINARY_DIRECT_INVERSE=MANY_PRESERVED",
    "R_SELF=DIRECT_AND_INVERSE",
    "O_SELF=DIRECT_ONLY",
    "C_SELF=INVERSE_ONLY",
    "L_U_SELF=NEITHER",
    "CANDIDATE_SELF_EXCLUSION=0",
    "ASPECT_SPECIAL_CASE_BRANCHES=0",
    "INDEPENDENT_MEMORIES=2",
    "GENERIC_UNIFICATION=HOST_RESIDUAL",
    "PRODUCTION_UNCHANGED",
  ].join(" "));
}

main();
