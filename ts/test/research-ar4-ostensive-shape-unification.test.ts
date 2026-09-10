import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
  type LinkPoles,
  type ReadMemory,
} from "../src/memory.js";
import { StructuralRuleError, type StructuralRoleBinding } from "../src/structural-rule.js";
import { unifyStructuralTemplate } from "../src/structural-unification.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`AR4 ostensive query probe: ${message}`);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}

function binding(
  bindings: readonly StructuralRoleBinding[],
  role: LinkHandle,
): LinkHandle {
  const found = bindings.find((item) => item.role === role);
  assert(found !== undefined, "expected role binding");
  return found.value;
}

type OstensiveShape = "FULL" | "START" | "END" | "ORDINARY";

function ostensiveShape(memory: ReadMemory, link: LinkHandle): OstensiveShape {
  const poles = memory.poles(link);
  const selfStart = poles.start === link;
  const selfEnd = poles.end === link;
  if (selfStart && selfEnd) return "FULL";
  if (selfStart) return "START";
  if (selfEnd) return "END";
  return "ORDINARY";
}

// Research-only candidate: current structural unification plus one foundational
// condition. Whenever the template node is structural rather than a role, its
// own ostensive self-incidence form must be preserved by the claimed node.
// The requested form is read from the Link template's own poles; there is no
// separate Pattern{start?,end?} semantic object.
function unifyOstensiveTemplate(
  memory: ReadMemory,
  template: LinkHandle,
  claimed: LinkHandle,
  roles: readonly LinkHandle[],
): readonly StructuralRoleBinding[] {
  assert(new Set(roles).size === roles.length, "roles must be unique");
  const before = memory.linkCount;
  const roleSet = new Set(roles);
  const inferred = new Map<LinkHandle, LinkHandle>();
  const containsMemo = new Map<LinkHandle, boolean>();
  const containsActive = new Set<LinkHandle>();
  const visited = new Map<LinkHandle, Set<LinkHandle>>();

  const containsRole = (node: LinkHandle): boolean => {
    if (roleSet.has(node)) return true;
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

  const unify = (left: LinkHandle, right: LinkHandle): void => {
    if (roleSet.has(left)) {
      const previous = inferred.get(left);
      if (previous !== undefined && previous !== right) {
        throw new StructuralRuleError("template-mismatch");
      }
      inferred.set(left, right);
      return;
    }

    if (!containsRole(left)) {
      if (left !== right) throw new StructuralRuleError("template-mismatch");
      return;
    }

    // Generic cyclic graph matching must not collapse one primary ostensive
    // self-incidence form into another.
    if (ostensiveShape(memory, left) !== ostensiveShape(memory, right)) {
      throw new StructuralRuleError("template-mismatch");
    }

    if (alreadyVisited(left, right)) return;
    const leftPoles = memory.poles(left);
    const rightPoles = memory.poles(right);
    unify(leftPoles.start, rightPoles.start);
    unify(leftPoles.end, rightPoles.end);
  };

  try {
    unify(template, claimed);
    return Object.freeze(roles.map((role) => {
      const value = inferred.get(role);
      if (value === undefined) throw new StructuralRuleError("missing-role-binding");
      return Object.freeze({ role, value });
    }));
  } finally {
    assert(memory.linkCount === before, "ostensive replay must be read-only");
  }
}

function rejected(effect: () => unknown, message: string): void {
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
  find(): LinkHandle | undefined { throw new Error("AR4 query replay forbids find"); }
  outgoing(): readonly LinkHandle[] { throw new Error("AR4 query replay forbids outgoing"); }
  incoming(): readonly LinkHandle[] { throw new Error("AR4 query replay forbids incoming"); }
}

const memory = new Memory();
const basis = ensureRootBasis(memory);

// Keep role identities on a branch independent from the concrete values. The
// first version of this research fixture accidentally chose startValue as
// START(endValue), so ensure(startValue,endValue) correctly canonicalized back
// to startValue. That was a fixture collision, not an ordinary-Link witness.
const roleSeed = memory.ensure(basis.L, basis.U);
const endRole = memory.ensureStartSelfClosed(roleSeed);
const startRole = memory.ensureEndSelfClosed(roleSeed);
const startValue = basis.O;
const endValue = basis.C;
const otherEnd = basis.U;
assert(endRole !== startRole, "role anchors must be distinct");
assert(startValue !== endValue && endValue !== otherEnd, "concrete values must be distinct");

// Four primary ostensive forms are exactly the four possible ways in which a
// Link can occur as its own start/end pole.
const full = basis.R;
const startSelf = memory.ensureStartSelfClosed(endValue);
const endSelf = memory.ensureEndSelfClosed(startValue);
const ordinary = memory.ensure(startValue, endValue);
same(ordinary, basis.L, "ordinary fixture is canonical L");
same(ostensiveShape(memory, full), "FULL", "∞ shape");
same(ostensiveShape(memory, startSelf), "START", "♂e shape");
same(ostensiveShape(memory, endSelf), "END", "b♀ shape");
same(ostensiveShape(memory, ordinary), "ORDINARY", "b⟼e shape");

// RED: the current generic cyclic unifier does not preserve ostensive form.
// START(endRole) can match the fully self-closed root because the recursive
// template node is revisited before role=end is bound.
const startTemplate = memory.ensureStartSelfClosed(endRole);
const currentFalsePositive = unifyStructuralTemplate(memory, startTemplate, full, [endRole]);
same(binding(currentFalsePositive, endRole), full, "current unifier collapses ♂E onto ∞");

// The candidate rejects exactly that collapse while preserving the intended
// partial query: ♂E matches a proper start-self-closed Link and binds E.
const startBindings = unifyOstensiveTemplate(memory, startTemplate, startSelf, [endRole]);
same(binding(startBindings, endRole), endValue, "♂E binds the concrete end");
rejected(() => unifyOstensiveTemplate(memory, startTemplate, full, [endRole]), "♂E must reject ∞");
rejected(
  () => unifyOstensiveTemplate(memory, startTemplate, ordinary, [endRole]),
  "♂E must reject ordinary Link",
);

// Symmetric END query.
const endTemplate = memory.ensureEndSelfClosed(startRole);
const endBindings = unifyOstensiveTemplate(memory, endTemplate, endSelf, [startRole]);
same(binding(endBindings, startRole), startValue, "B♀ binds the concrete start");
rejected(() => unifyOstensiveTemplate(memory, endTemplate, full, [startRole]), "B♀ must reject ∞");
rejected(
  () => unifyOstensiveTemplate(memory, endTemplate, ordinary, [startRole]),
  "B♀ must reject ordinary Link",
);

// Ordinary partial form with both poles as roles. Its own Link topology carries
// the query shape; no Pattern{start?,end?} object is needed.
const ordinaryTemplate = memory.ensure(startRole, endRole);
const ordinaryBindings = unifyOstensiveTemplate(
  memory,
  ordinaryTemplate,
  ordinary,
  [startRole, endRole],
);
same(binding(ordinaryBindings, startRole), startValue, "B⟼E binds start");
same(binding(ordinaryBindings, endRole), endValue, "B⟼E binds end");
rejected(
  () => unifyOstensiveTemplate(memory, ordinaryTemplate, startSelf, [startRole, endRole]),
  "ordinary template must reject START form",
);
rejected(
  () => unifyOstensiveTemplate(memory, ordinaryTemplate, endSelf, [startRole, endRole]),
  "ordinary template must reject END form",
);
rejected(
  () => unifyOstensiveTemplate(memory, ordinaryTemplate, full, [startRole, endRole]),
  "ordinary template must reject FULL form",
);

// Recursive composition works without a second pattern language. Here the end
// of a START-form candidate must itself have the ordinary structure O⟼E, and
// only E remains free.
const nestedEndTemplate = memory.ensure(startValue, endRole);
const nestedStartTemplate = memory.ensureStartSelfClosed(nestedEndTemplate);
const concreteNestedEnd = memory.ensure(startValue, otherEnd);
const concreteNestedStart = memory.ensureStartSelfClosed(concreteNestedEnd);
const nestedBindings = unifyOstensiveTemplate(
  memory,
  nestedStartTemplate,
  concreteNestedStart,
  [endRole],
);
same(binding(nestedBindings, endRole), otherEnd, "nested ostensive query binds recursively");

// A role itself remains genuinely unconstrained and may bind any Link,
// including R. Shape restriction is carried only by structural template nodes.
const wildcardRoot = unifyOstensiveTemplate(memory, endRole, full, [endRole]);
same(binding(wildcardRoot, endRole), full, "bare role may bind ∞");

// Trusted replay requires only selected Link topology.
const poleOnly = new PoleOnlyProbe(memory);
const poleOnlyBindings = unifyOstensiveTemplate(poleOnly, startTemplate, startSelf, [endRole]);
same(binding(poleOnlyBindings, endRole), endValue, "pole-only ostensive replay");

const classification = Object.freeze({
  currentGenericUnifierCollapsesStartFormIntoFull: true,
  fourOstensiveFormsAreSelfIncidenceProfiles: true,
  queryFormLivesInOrdinaryLinkTopology: true,
  rolesSupplyOnlyOpenPositions: true,
  shapePreservationRejectsDegenerateCollapse: true,
  recursivePartialQueriesComposeAsLinks: true,
  noPatternAstAuthorityRequired: true,
  replayIsPoleOnlyAndReadOnly: true,
  verdict: "GREEN-CANDIDATE" as const,
  reason: "OSTENSIVE_SHAPE_PRESERVING_UNIFICATION" as const,
});

same(classification.verdict, "GREEN-CANDIDATE", "AR4 classification");
same(classification.reason, "OSTENSIVE_SHAPE_PRESERVING_UNIFICATION", "AR4 candidate reason");

console.log("MTS AR4 ostensive structural query: RED exposed; GREEN shape-preserving candidate exercised.");
