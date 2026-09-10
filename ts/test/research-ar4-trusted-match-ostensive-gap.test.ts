import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
  type LinkPoles,
  type ReadMemory,
} from "../src/memory.js";
import {
  StructuralRuleError,
  matchStructuralTemplate,
  type StructuralRoleBinding,
} from "../src/structural-rule.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`AR4 trusted matcher probe: ${message}`);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}

function selfStart(memory: ReadMemory, link: LinkHandle): boolean {
  return memory.poles(link).start === link;
}

function selfEnd(memory: ReadMemory, link: LinkHandle): boolean {
  return memory.poles(link).end === link;
}

// Research-only version of the existing trusted matcher with exactly one added
// foundational rule: every non-role structural node must preserve both of its
// self-incidence facts. No new Pattern/shape object participates in authority.
function matchOstensiveTemplate(
  memory: ReadMemory,
  template: LinkHandle,
  claimed: LinkHandle,
  bindings: readonly StructuralRoleBinding[],
): void {
  const before = memory.linkCount;
  const rho = new Map<LinkHandle, LinkHandle>();
  for (const item of bindings) {
    assert(!rho.has(item.role), "duplicate role");
    rho.set(item.role, item.value);
  }

  const containsMemo = new Map<LinkHandle, boolean>();
  const containsActive = new Set<LinkHandle>();
  const visited = new Map<LinkHandle, Set<LinkHandle>>();

  const containsRole = (node: LinkHandle): boolean => {
    if (rho.has(node)) return true;
    const cached = containsMemo.get(node);
    if (cached !== undefined) return cached;
    if (containsActive.has(node)) return false;
    containsActive.add(node);
    try {
      const poles = memory.poles(node);
      const result = containsRole(poles.start) || containsRole(poles.end);
      containsMemo.set(node, result);
      return result;
    } finally {
      containsActive.delete(node);
    }
  };

  const alreadyVisited = (left: LinkHandle, right: LinkHandle): boolean => {
    let rights = visited.get(left);
    if (rights === undefined) {
      rights = new Set<LinkHandle>();
      visited.set(left, rights);
    }
    if (rights.has(right)) return true;
    rights.add(right);
    return false;
  };

  const match = (left: LinkHandle, right: LinkHandle): void => {
    const replacement = rho.get(left);
    if (replacement !== undefined) {
      if (replacement !== right) throw new StructuralRuleError("template-mismatch");
      return;
    }

    if (!containsRole(left)) {
      if (left !== right) throw new StructuralRuleError("template-mismatch");
      return;
    }

    if (
      selfStart(memory, left) !== selfStart(memory, right) ||
      selfEnd(memory, left) !== selfEnd(memory, right)
    ) {
      throw new StructuralRuleError("template-mismatch");
    }

    if (alreadyVisited(left, right)) return;
    const leftPoles = memory.poles(left);
    const rightPoles = memory.poles(right);
    match(leftPoles.start, rightPoles.start);
    match(leftPoles.end, rightPoles.end);
  };

  try {
    match(template, claimed);
  } finally {
    assert(memory.linkCount === before, "trusted ostensive replay must be read-only");
  }
}

function rejects(effect: () => unknown, message: string): void {
  let didReject = false;
  try {
    effect();
  } catch (error) {
    assert(error instanceof StructuralRuleError, `${message}: expected StructuralRuleError`);
    same(error.code, "template-mismatch", `${message}: error code`);
    didReject = true;
  }
  assert(didReject, `${message}: expected rejection`);
}

class PoleOnlyProbe implements ReadMemory {
  constructor(private readonly source: ReadMemory) {}
  get root(): LinkHandle { return this.source.root; }
  get linkCount(): number { return this.source.linkCount; }
  poles(link: LinkHandle): LinkPoles { return this.source.poles(link); }
  find(): LinkHandle | undefined { throw new Error("AR4 trusted replay forbids find"); }
  outgoing(): readonly LinkHandle[] { throw new Error("AR4 trusted replay forbids outgoing"); }
  incoming(): readonly LinkHandle[] { throw new Error("AR4 trusted replay forbids incoming"); }
}

const memory = new Memory();
const basis = ensureRootBasis(memory);
const roleSeed = memory.ensure(basis.L, basis.U);
const endRole = memory.ensureStartSelfClosed(roleSeed);
const startRole = memory.ensureEndSelfClosed(roleSeed);

// Literal root-genealogy falsifier for the old ambiguous equation:
//   O = ♂R must satisfy ♂E with E:=R
//   R = ∞ must NOT satisfy the same ostensive query.
const startTemplate = memory.ensureStartSelfClosed(endRole);
const bindEndToRoot: readonly StructuralRoleBinding[] = Object.freeze([
  Object.freeze({ role: endRole, value: basis.R }),
]);
matchStructuralTemplate(memory, startTemplate, basis.O, bindEndToRoot);

// Current trusted matcher also accepts R. This is the exact recursive-collapse
// gap that a naked y = y⟼R reading cannot distinguish.
matchStructuralTemplate(memory, startTemplate, basis.R, bindEndToRoot);

// Shape-preserving replay keeps the intended O witness and rejects R.
matchOstensiveTemplate(memory, startTemplate, basis.O, bindEndToRoot);
rejects(
  () => matchOstensiveTemplate(memory, startTemplate, basis.R, bindEndToRoot),
  "♂R query must reject ∞",
);

// Symmetric root genealogy: C = R♀ is END, while R is FULL.
const endTemplate = memory.ensureEndSelfClosed(startRole);
const bindStartToRoot: readonly StructuralRoleBinding[] = Object.freeze([
  Object.freeze({ role: startRole, value: basis.R }),
]);
matchStructuralTemplate(memory, endTemplate, basis.C, bindStartToRoot);
matchStructuralTemplate(memory, endTemplate, basis.R, bindStartToRoot);
matchOstensiveTemplate(memory, endTemplate, basis.C, bindStartToRoot);
rejects(
  () => matchOstensiveTemplate(memory, endTemplate, basis.R, bindStartToRoot),
  "R♀ query must reject ∞",
);

// Ordinary role-role form has the same gap today: without the incidence law it
// can collapse onto a one-sided or fully self-closed claim. The candidate keeps
// b⟼e ordinary while still allowing its roles themselves to bind arbitrary
// Links when the claimed node has ordinary shape.
const ordinaryTemplate = memory.ensure(startRole, endRole);
const bindOrdinary: readonly StructuralRoleBinding[] = Object.freeze([
  Object.freeze({ role: startRole, value: basis.O }),
  Object.freeze({ role: endRole, value: basis.C }),
]);
matchStructuralTemplate(memory, ordinaryTemplate, basis.L, bindOrdinary);
matchOstensiveTemplate(memory, ordinaryTemplate, basis.L, bindOrdinary);

const bindBothToRoot: readonly StructuralRoleBinding[] = Object.freeze([
  Object.freeze({ role: startRole, value: basis.R }),
  Object.freeze({ role: endRole, value: basis.R }),
]);
matchStructuralTemplate(memory, ordinaryTemplate, basis.R, bindBothToRoot);
rejects(
  () => matchOstensiveTemplate(memory, ordinaryTemplate, basis.R, bindBothToRoot),
  "ordinary B⟼E query must reject ∞",
);

// The candidate trusted check remains closure-local and pole-only.
const poleOnly = new PoleOnlyProbe(memory);
matchOstensiveTemplate(poleOnly, startTemplate, basis.O, bindEndToRoot);
rejects(
  () => matchOstensiveTemplate(poleOnly, startTemplate, basis.R, bindEndToRoot),
  "pole-only ♂R query rejects ∞",
);

const classification = Object.freeze({
  currentTrustedMatcherAcceptsOForStartRootQuery: true,
  currentTrustedMatcherAlsoAcceptsRForStartRootQuery: true,
  currentTrustedMatcherAlsoCollapsesEndAndOrdinaryForms: true,
  ostensiveIncidencePreservationRejectsThoseCollapses: true,
  rootGenealogyIsDistinguishedWithoutHostDisequality: true,
  candidateReplayIsPoleOnlyAndReadOnly: true,
  verdict: "GREEN-CANDIDATE" as const,
  reason: "TRUSTED_MATCH_MUST_PRESERVE_OSTENSIVE_SELF_INCIDENCE" as const,
});

same(classification.verdict, "GREEN-CANDIDATE", "AR4 trusted matcher classification");
same(
  classification.reason,
  "TRUSTED_MATCH_MUST_PRESERVE_OSTENSIVE_SELF_INCIDENCE",
  "AR4 trusted matcher reason",
);

console.log("MTS AR4 trusted matcher: ostensive collapse reproduced and candidate rejected it.");
