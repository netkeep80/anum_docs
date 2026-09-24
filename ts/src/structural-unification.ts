import {
  MemoryError,
  type LinkHandle,
  type ReadMemory,
} from "./memory.js";
import {
  StructuralRuleError,
  type StructuralRoleBinding,
} from "./structural-rule.js";

function unifyTemplate(
  memory: ReadMemory,
  template: LinkHandle,
  claimed: LinkHandle,
  roles: readonly LinkHandle[],
  preserveSelfIncidence: boolean,
): readonly StructuralRoleBinding[] {
  if (new Set(roles).size !== roles.length) {
    throw new StructuralRuleError("duplicate-role");
  }

  const before = memory.linkCount;
  const roleSet = new Set(roles);
  const inferred = new Map<LinkHandle, LinkHandle>();
  const containsMemo = new Map<LinkHandle, boolean>();
  const containsActive = new Set<LinkHandle>();

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

  const visited = new Map<LinkHandle, Set<LinkHandle>>();
  const markVisited = (left: LinkHandle, right: LinkHandle): boolean => {
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
      if (left !== right) {
        throw new StructuralRuleError("template-mismatch");
      }
      return;
    }

    if (markVisited(left, right)) return;

    try {
      const leftPoles = memory.poles(left);
      const rightPoles = memory.poles(right);

      if (
        preserveSelfIncidence &&
        (
          (leftPoles.start === left) !== (rightPoles.start === right) ||
          (leftPoles.end === left) !== (rightPoles.end === right)
        )
      ) {
        throw new StructuralRuleError("template-mismatch");
      }

      unify(leftPoles.start, rightPoles.start);
      unify(leftPoles.end, rightPoles.end);
    } catch (error) {
      if (error instanceof StructuralRuleError) throw error;
      if (error instanceof MemoryError) {
        throw new StructuralRuleError("template-mismatch");
      }
      throw error;
    }
  };

  try {
    unify(template, claimed);

    const bindings = roles.map((role): StructuralRoleBinding => {
      const value = inferred.get(role);
      if (value === undefined) {
        throw new StructuralRuleError("missing-role-binding");
      }
      return Object.freeze({ role, value });
    });

    return Object.freeze(bindings);
  } finally {
    if (memory.linkCount !== before) {
      throw new StructuralRuleError("replay-wrote");
    }
  }
}

/**
 * Read-only projection unification for already-grounded Links.
 *
 * Declared roles are placeholders. This relation intentionally projects poles
 * through ROOT/START/END/PAIR and therefore does not preserve self-incidence
 * class at role-bearing template nodes.
 *
 * This is deliberately projection-only. It does not find, ensure, materialize,
 * navigate a context, or assign semantic identity from a runtime handle.
 */
export function unifyStructuralTemplate(
  memory: ReadMemory,
  template: LinkHandle,
  claimed: LinkHandle,
  roles: readonly LinkHandle[],
): readonly StructuralRoleBinding[] {
  return unifyTemplate(memory, template, claimed, roles, false);
}

/**
 * Read-only structural Rule matching.
 *
 * This is the A71p relation: it has the same role-binding semantics as
 * projection unification but additionally preserves both self-incidence bits
 * at every non-role template node. Thus a role-bearing PAIR pattern cannot
 * match ROOT, START or END, while role values themselves remain unrestricted.
 */
export function unifyStructuralRuleTemplate(
  memory: ReadMemory,
  template: LinkHandle,
  claimed: LinkHandle,
  roles: readonly LinkHandle[],
): readonly StructuralRoleBinding[] {
  return unifyTemplate(memory, template, claimed, roles, true);
}
