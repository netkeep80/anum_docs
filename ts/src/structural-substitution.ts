import { MemoryError, type LinkHandle, type ReadMemory } from "./memory.js";

export interface StructuralSubstitutionConstraint {
  readonly template: LinkHandle;
  readonly actual: LinkHandle;
}

export interface StructuralSubstitutionBinding {
  readonly role: LinkHandle;
  readonly value: LinkHandle;
}

export type StructuralSubstitutionErrorCode =
  | "duplicate-role"
  | "template-mismatch"
  | "missing-role-binding"
  | "replay-wrote";

export class StructuralSubstitutionError extends Error {
  override readonly name = "StructuralSubstitutionError";

  constructor(readonly code: StructuralSubstitutionErrorCode) {
    super(code);
  }
}

function fail(code: StructuralSubstitutionErrorCode): never {
  throw new StructuralSubstitutionError(code);
}

/**
 * Trusted read-only structural substitution inference across multiple
 * template/actual constraints.
 *
 * Returned bindings are an operational projection only. Authority comes from
 * the supplied MTS topology. Binding order is exactly the declared Role order.
 */
export function inferStructuralSubstitution(
  memory: ReadMemory,
  roles: readonly LinkHandle[],
  constraints: readonly StructuralSubstitutionConstraint[],
  options: Readonly<{ requireAll?: boolean }> = {},
): readonly StructuralSubstitutionBinding[] {
  const before = memory.linkCount;
  try {
    const roleSet = new Set(roles);
    if (roleSet.size !== roles.length) fail("duplicate-role");

    const rho = new Map<LinkHandle, LinkHandle>();
    const containsMemo = new Map<LinkHandle, boolean>();
    const containsActive = new Set<LinkHandle>();

    const containsRole = (link: LinkHandle): boolean => {
      if (roleSet.has(link)) return true;
      const cached = containsMemo.get(link);
      if (cached !== undefined) return cached;
      if (containsActive.has(link)) return false;
      containsActive.add(link);
      try {
        const poles = memory.poles(link);
        const result = containsRole(poles.start) || containsRole(poles.end);
        containsMemo.set(link, result);
        return result;
      } catch (error) {
        if (error instanceof MemoryError) fail("template-mismatch");
        throw error;
      } finally {
        containsActive.delete(link);
      }
    };

    const visited = new Map<LinkHandle, Set<LinkHandle>>();
    const alreadyVisited = (template: LinkHandle, actual: LinkHandle): boolean => {
      let actuals = visited.get(template);
      if (actuals === undefined) {
        actuals = new Set<LinkHandle>();
        visited.set(template, actuals);
      }
      if (actuals.has(actual)) return true;
      actuals.add(actual);
      return false;
    };

    const unify = (template: LinkHandle, actual: LinkHandle): void => {
      if (roleSet.has(template)) {
        const existing = rho.get(template);
        if (existing !== undefined && existing !== actual) fail("template-mismatch");
        rho.set(template, actual);
        return;
      }

      if (!containsRole(template)) {
        if (template !== actual) fail("template-mismatch");
        return;
      }

      if (alreadyVisited(template, actual)) return;
      try {
        const source = memory.poles(template);
        const target = memory.poles(actual);
        unify(source.start, target.start);
        unify(source.end, target.end);
      } catch (error) {
        if (error instanceof StructuralSubstitutionError) throw error;
        if (error instanceof MemoryError) fail("template-mismatch");
        throw error;
      }
    };

    for (const constraint of constraints) {
      unify(constraint.template, constraint.actual);
    }

    const requireAll = options.requireAll ?? true;
    if (requireAll) {
      for (const role of roles) {
        if (!rho.has(role)) fail("missing-role-binding");
      }
    }

    const bindings: StructuralSubstitutionBinding[] = [];
    for (const role of roles) {
      const value = rho.get(role);
      if (value === undefined) {
        if (requireAll) fail("missing-role-binding");
        continue;
      }
      bindings.push(Object.freeze({ role, value }));
    }
    return Object.freeze(bindings);
  } finally {
    if (memory.linkCount !== before) fail("replay-wrote");
  }
}
