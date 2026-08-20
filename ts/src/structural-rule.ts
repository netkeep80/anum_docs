import {
  ExactSequenceError,
  materializeExactSequence,
  readExactSequence,
} from "./exact-sequence.js";
import {
  MemoryError,
  type LinkHandle,
  type ReadMemory,
  type WriteMemory,
} from "./memory.js";
import {
  readActHeader,
  StructuralReadError,
} from "./structural-readers.js";

export type StructuralRuleErrorCode =
  | "invalid-interpreter"
  | "interpreter-mismatch"
  | "invalid-role-dictionary"
  | "duplicate-role"
  | "invalid-rule"
  | "rule-role-dictionary-mismatch"
  | "rule-not-admitted"
  | "invalid-act"
  | "missing-role-binding"
  | "multiple-role-bindings"
  | "undeclared-role-binding"
  | "template-mismatch"
  | "after-context-mismatch"
  | "replay-wrote";

export class StructuralRuleError extends Error {
  override readonly name = "StructuralRuleError";

  constructor(readonly code: StructuralRuleErrorCode) {
    super(code);
  }
}

export interface StructuralInterpreter {
  readonly dictionary: LinkHandle;
  readonly grammar: LinkHandle;
  readonly theory: LinkHandle;
}

export interface StructuralRoleDictionary {
  readonly roleSequence: LinkHandle;
  readonly roles: readonly LinkHandle[];
}

export interface StructuralRule {
  readonly roleDictionary: LinkHandle;
  readonly body: LinkHandle;
}

export interface StructuralRoleBinding {
  readonly role: LinkHandle;
  readonly value: LinkHandle;
}

export interface StructuralRuleReplayEvidence {
  readonly act: LinkHandle;
  readonly rule: LinkHandle;
  readonly ruleAdmission: LinkHandle;
  readonly claimedBody: LinkHandle;
  /** Grounded D/G/T evidence selected by the surrounding source/context path. */
  readonly expectedInterpreter: StructuralInterpreter;
  /** Grounded K_after expected by the surrounding transition. */
  readonly expectedAfterContext: LinkHandle;
}

export interface StructuralRuleReplayResult {
  readonly interpreter: LinkHandle;
  readonly interpreterStructure: StructuralInterpreter;
  readonly roleDictionary: LinkHandle;
  readonly roles: readonly LinkHandle[];
  readonly bindings: readonly StructuralRoleBinding[];
  readonly rule: LinkHandle;
  readonly body: LinkHandle;
  readonly claimedBody: LinkHandle;
  readonly afterContext: LinkHandle;
}

export function defineStructuralInterpreter(
  memory: WriteMemory,
  dictionary: LinkHandle,
  grammar: LinkHandle,
  theory: LinkHandle,
): LinkHandle {
  return memory.ensure(dictionary, memory.ensure(grammar, theory));
}

export function readStructuralInterpreter(
  memory: ReadMemory,
  interpreter: LinkHandle,
): StructuralInterpreter {
  try {
    const outer = memory.poles(interpreter);
    const grammarAndTheory = memory.poles(outer.end);
    return Object.freeze({
      dictionary: outer.start,
      grammar: grammarAndTheory.start,
      theory: grammarAndTheory.end,
    });
  } catch (error) {
    if (error instanceof MemoryError) {
      throw new StructuralRuleError("invalid-interpreter");
    }
    throw error;
  }
}

export function verifyStructuralInterpreter(
  memory: ReadMemory,
  interpreter: LinkHandle,
  expected: StructuralInterpreter,
): void {
  const actual = readStructuralInterpreter(memory, interpreter);
  if (
    actual.dictionary !== expected.dictionary ||
    actual.grammar !== expected.grammar ||
    actual.theory !== expected.theory
  ) {
    throw new StructuralRuleError("interpreter-mismatch");
  }
}

export function defineStructuralRoleDictionary(
  memory: WriteMemory,
  roles: readonly LinkHandle[],
): LinkHandle {
  if (new Set(roles).size !== roles.length) {
    throw new StructuralRuleError("duplicate-role");
  }
  const roleSequence = materializeExactSequence(memory, roles);
  return memory.ensureStartSelfClosed(roleSequence);
}

export function readStructuralRoleDictionary(
  memory: ReadMemory,
  roleDictionary: LinkHandle,
): StructuralRoleDictionary {
  try {
    const dictionary = memory.poles(roleDictionary);
    // DR имеет именно форму START(RoleSequence); ROOT не является вторым
    // представлением пустого словаря ролей.
    if (dictionary.start !== roleDictionary || dictionary.end === roleDictionary) {
      throw new StructuralRuleError("invalid-role-dictionary");
    }
    const sequence = readExactSequence(memory, dictionary.end);
    if (new Set(sequence.values).size !== sequence.values.length) {
      throw new StructuralRuleError("duplicate-role");
    }
    return Object.freeze({
      roleSequence: dictionary.end,
      roles: Object.freeze([...sequence.values]),
    });
  } catch (error) {
    if (error instanceof StructuralRuleError) throw error;
    if (error instanceof ExactSequenceError || error instanceof MemoryError) {
      throw new StructuralRuleError("invalid-role-dictionary");
    }
    throw error;
  }
}

export function defineStructuralRule(
  memory: WriteMemory,
  roleDictionary: LinkHandle,
  body: LinkHandle,
): LinkHandle {
  return memory.ensure(roleDictionary, body);
}

export function readStructuralRule(
  memory: ReadMemory,
  rule: LinkHandle,
): StructuralRule {
  try {
    const poles = memory.poles(rule);
    return Object.freeze({
      roleDictionary: poles.start,
      body: poles.end,
    });
  } catch (error) {
    if (error instanceof MemoryError) {
      throw new StructuralRuleError("invalid-rule");
    }
    throw error;
  }
}

export function admitStructuralRule(
  memory: WriteMemory,
  theory: LinkHandle,
  rule: LinkHandle,
): LinkHandle {
  return memory.ensure(theory, rule);
}

export function verifyStructuralRuleAdmission(
  memory: ReadMemory,
  theory: LinkHandle,
  rule: LinkHandle,
  admission: LinkHandle,
): void {
  try {
    const poles = memory.poles(admission);
    if (poles.start !== theory || poles.end !== rule) {
      throw new StructuralRuleError("rule-not-admitted");
    }
  } catch (error) {
    if (error instanceof StructuralRuleError) throw error;
    if (error instanceof MemoryError) {
      throw new StructuralRuleError("rule-not-admitted");
    }
    throw error;
  }
}

function readExactActBindings(
  memory: ReadMemory,
  act: LinkHandle,
  roles: readonly LinkHandle[],
): readonly StructuralRoleBinding[] {
  const roleSet = new Set(roles);
  const values = new Map<LinkHandle, LinkHandle[]>();
  for (const role of roles) values.set(role, []);

  try {
    for (const attachment of memory.outgoing(act)) {
      // The start-selfclosed Act itself carries ActHeader and is not a field.
      if (attachment === act) continue;
      const attachmentPoles = memory.poles(attachment);
      if (attachmentPoles.start !== act) {
        throw new StructuralRuleError("invalid-act");
      }
      const field = memory.poles(attachmentPoles.end);
      if (!roleSet.has(field.start)) {
        throw new StructuralRuleError("undeclared-role-binding");
      }
      values.get(field.start)?.push(field.end);
    }
  } catch (error) {
    if (error instanceof StructuralRuleError) throw error;
    if (error instanceof MemoryError) {
      throw new StructuralRuleError("invalid-act");
    }
    throw error;
  }

  const bindings: StructuralRoleBinding[] = [];
  for (const role of roles) {
    const matches = values.get(role) ?? [];
    if (matches.length === 0) {
      throw new StructuralRuleError("missing-role-binding");
    }
    if (matches.length !== 1) {
      throw new StructuralRuleError("multiple-role-bindings");
    }
    const value = matches[0];
    if (value === undefined) {
      throw new Error("internal structural role cardinality invariant violated");
    }
    bindings.push(Object.freeze({ role, value }));
  }
  return Object.freeze(bindings);
}

function bindingMap(
  bindings: readonly StructuralRoleBinding[],
): ReadonlyMap<LinkHandle, LinkHandle> {
  const result = new Map<LinkHandle, LinkHandle>();
  for (const binding of bindings) {
    if (result.has(binding.role)) {
      throw new StructuralRuleError("duplicate-role");
    }
    result.set(binding.role, binding.value);
  }
  return result;
}

/**
 * Generic Rule matcher. Only Links declared by DR are placeholders. Any
 * template subtree with no declared role is a grounded constant and therefore
 * uses the current canonical Memory identity rather than importing a new
 * recursive equality theory ahead of #582/#583.
 */
export function matchStructuralTemplate(
  memory: ReadMemory,
  template: LinkHandle,
  claimed: LinkHandle,
  bindings: readonly StructuralRoleBinding[],
): void {
  const rho = bindingMap(bindings);
  const containsMemo = new Map<LinkHandle, boolean>();
  const containsActive = new Set<LinkHandle>();

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

  const match = (left: LinkHandle, right: LinkHandle): void => {
    const replacement = rho.get(left);
    if (replacement !== undefined) {
      if (replacement !== right) {
        throw new StructuralRuleError("template-mismatch");
      }
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
      match(leftPoles.start, rightPoles.start);
      match(leftPoles.end, rightPoles.end);
    } catch (error) {
      if (error instanceof StructuralRuleError) throw error;
      if (error instanceof MemoryError) {
        throw new StructuralRuleError("template-mismatch");
      }
      throw error;
    }
  };

  match(template, claimed);
}

/**
 * Read-only generic replay: semantic selection comes from structural I/DR/Rule
 * and explicit T ⟼ Rule admission. No callback name, RuleKind/opcode or TS role
 * property participates in rule identity.
 */
export function replayStructuralRule(
  memory: ReadMemory,
  evidence: StructuralRuleReplayEvidence,
): StructuralRuleReplayResult {
  const before = memory.linkCount;
  try {
    const header = readActHeader(memory, evidence.act);
    verifyStructuralInterpreter(memory, header.interpreter, evidence.expectedInterpreter);
    if (header.afterContext !== evidence.expectedAfterContext) {
      throw new StructuralRuleError("after-context-mismatch");
    }

    const interpreter = readStructuralInterpreter(memory, header.interpreter);
    const rule = readStructuralRule(memory, evidence.rule);
    if (rule.roleDictionary !== header.roleDictionary) {
      throw new StructuralRuleError("rule-role-dictionary-mismatch");
    }

    verifyStructuralRuleAdmission(
      memory,
      interpreter.theory,
      evidence.rule,
      evidence.ruleAdmission,
    );

    const roleDictionary = readStructuralRoleDictionary(memory, header.roleDictionary);
    const bindings = readExactActBindings(memory, evidence.act, roleDictionary.roles);
    matchStructuralTemplate(memory, rule.body, evidence.claimedBody, bindings);

    if (memory.linkCount !== before) {
      throw new StructuralRuleError("replay-wrote");
    }

    return Object.freeze({
      interpreter: header.interpreter,
      interpreterStructure: interpreter,
      roleDictionary: header.roleDictionary,
      roles: roleDictionary.roles,
      bindings,
      rule: evidence.rule,
      body: rule.body,
      claimedBody: evidence.claimedBody,
      afterContext: header.afterContext,
    });
  } catch (error) {
    if (error instanceof StructuralRuleError) throw error;
    if (error instanceof StructuralReadError || error instanceof MemoryError) {
      throw new StructuralRuleError("invalid-act");
    }
    throw error;
  } finally {
    if (memory.linkCount !== before) {
      throw new StructuralRuleError("replay-wrote");
    }
  }
}
