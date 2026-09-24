import { readExactSequence } from "./exact-sequence.js";
import {
  Memory,
  type LinkHandle,
} from "./memory.js";
import {
  readStructuralInterpreter,
  readStructuralRoleDictionary,
  readStructuralRule,
  StructuralRuleError,
  verifyStructuralRuleAdmission,
  type StructuralRoleBinding,
} from "./structural-rule.js";
import { unifyStructuralRuleTemplate } from "./structural-unification.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`v0.13 structural execution: ${message}`);
  }
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), message);
}

function sameMembers(
  actual: readonly LinkHandle[],
  expected: readonly LinkHandle[],
  message: string,
): void {
  same(actual.length, expected.length, `${message}: cardinality`);
  for (const member of expected) {
    assert(actual.includes(member), `${message}: missing member`);
  }
}

export interface V013WorkingScopeAuthority {
  readonly interpreter: LinkHandle;
  readonly theory: LinkHandle;
}

export function defineV013WorkingScope(
  memory: Memory,
  seed: LinkHandle,
  interpreter: LinkHandle,
  members: readonly LinkHandle[],
): LinkHandle {
  const descriptor = memory.ensure(seed, interpreter);
  const scope = memory.ensureStartSelfClosed(descriptor);
  for (const member of members) memory.ensure(scope, member);
  return scope;
}

export function readV013WorkingScopeAuthority(
  memory: Memory,
  scope: LinkHandle,
): V013WorkingScopeAuthority {
  const header = memory.poles(scope);
  assert(
    header.start === scope && header.end !== scope,
    "working scope must have START shape",
  );

  const descriptor = memory.poles(header.end);
  const interpreter = descriptor.end;
  const structure = readStructuralInterpreter(memory, interpreter);

  return Object.freeze({
    interpreter,
    theory: structure.theory,
  });
}

export function readV013WorkingScope(
  memory: Memory,
  scope: LinkHandle,
): readonly LinkHandle[] {
  readV013WorkingScopeAuthority(memory, scope);

  const members: LinkHandle[] = [];
  for (const attachment of memory.outgoing(scope)) {
    if (attachment === scope) continue;
    const poles = memory.poles(attachment);
    if (poles.start !== scope) continue;
    if (!members.includes(poles.end)) members.push(poles.end);
  }
  return Object.freeze(members);
}

/**
 * Opaque mutable A-memory root for the current working Scope.
 *
 * This object deliberately knows nothing about function identity, Rule
 * identity, arity, Context/Result classes, truth values, or lifecycle tags.
 */
export class V013CurrentScopeCursor {
  constructor(
    private readonly memory: Memory,
    private scope: LinkHandle,
  ) {}

  currentScope(): LinkHandle {
    return this.scope;
  }

  members(): readonly LinkHandle[] {
    return readV013WorkingScope(this.memory, this.scope);
  }

  switchAtomically(expectedOld: LinkHandle, next: LinkHandle): void {
    same(this.scope, expectedOld, "current Scope root changed concurrently");
    this.scope = next;
  }
}

export interface V013GroundedRuleImage {
  readonly outputBundleTemplate: LinkHandle;
  readonly bindings: readonly StructuralRoleBinding[];
}

/**
 * Discover all Rules locally indexed by the structural start pole of the
 * active endpoint. Theory authority is supplied by the Scope-carried
 * StructuralInterpreter; Rule matching preserves Link self-incidence.
 */
export function discoverV013TriggeredRuleImages(
  memory: Memory,
  theory: LinkHandle,
  active: LinkHandle,
): readonly V013GroundedRuleImage[] {
  const endpoint = memory.poles(active).end;
  const triggerKey = memory.poles(endpoint).start;
  const matches: V013GroundedRuleImage[] = [];

  for (const trigger of memory.outgoing(triggerKey)) {
    if (trigger === triggerKey) continue;

    const triggerPoles = memory.poles(trigger);
    if (triggerPoles.start !== triggerKey) continue;

    const admission = triggerPoles.end;
    const admissionPoles = memory.poles(admission);
    if (
      admissionPoles.start !== theory ||
      admissionPoles.end === admission
    ) {
      continue;
    }

    try {
      const rule = admissionPoles.end;
      verifyStructuralRuleAdmission(memory, theory, rule, admission);
      const structuralRule = readStructuralRule(memory, rule);
      const dictionary =
        readStructuralRoleDictionary(memory, structuralRule.roleDictionary);
      const body = memory.poles(structuralRule.body);
      const bindings = unifyStructuralRuleTemplate(
        memory,
        body.start,
        active,
        dictionary.roles,
      );
      matches.push(Object.freeze({
        outputBundleTemplate: body.end,
        bindings,
      }));
    } catch (error) {
      if (error instanceof StructuralRuleError) continue;
      throw error;
    }
  }

  return Object.freeze(matches);
}

export function instantiateV013StructuralTemplate(
  memory: Memory,
  template: LinkHandle,
  bindings: readonly StructuralRoleBinding[],
): LinkHandle {
  const mapping = new Map<LinkHandle, LinkHandle>();
  for (const binding of bindings) mapping.set(binding.role, binding.value);

  const visiting = new Set<LinkHandle>();
  const clone = (source: LinkHandle): LinkHandle => {
    const bound = mapping.get(source);
    if (bound !== undefined) return bound;

    assert(!visiting.has(source), "unsupported non-self template cycle");
    const poles = memory.poles(source);

    let value: LinkHandle;
    if (poles.start === source && poles.end === source) {
      value = memory.ensureRoot();
    } else if (poles.start === source) {
      value = memory.ensureStartSelfClosed(clone(poles.end));
    } else if (poles.end === source) {
      value = memory.ensureEndSelfClosed(clone(poles.start));
    } else {
      visiting.add(source);
      const start = clone(poles.start);
      const end = clone(poles.end);
      visiting.delete(source);
      value = memory.ensure(start, end);
    }

    mapping.set(source, value);
    return value;
  };

  return clone(template);
}

export interface V013ScopeReaction {
  readonly oldScope: LinkHandle;
  readonly nextScope: LinkHandle;
  readonly oldMembers: readonly LinkHandle[];
  readonly nextMembers: readonly LinkHandle[];
  readonly rawRuleMatches: number;
  readonly transitionedMembers: number;
  readonly quiescent: boolean;
  readonly handoffCount: 0 | 1;
}

/**
 * One generalized fixed-point reaction over the current working Scope.
 *
 * - no matching Rule for a member: preserve it unchanged;
 * - one or more matching Rules: instantiate and union every output bundle;
 * - canonical Link identity collapses duplicate successors;
 * - no matches anywhere: quiescent, no current-root handoff;
 * - otherwise: publish the complete successor Scope atomically once.
 */
export function reactV013StructuralScope(
  memory: Memory,
  cursor: V013CurrentScopeCursor,
  nextScopeSeed: LinkHandle,
): V013ScopeReaction {
  const oldScope = cursor.currentScope();
  const authority = readV013WorkingScopeAuthority(memory, oldScope);
  const before = cursor.members();
  assert(before.length > 0, "reaction requires non-empty current Scope");

  const nextMembers: LinkHandle[] = [];
  const addNext = (link: LinkHandle): void => {
    if (!nextMembers.includes(link)) nextMembers.push(link);
  };

  let rawRuleMatches = 0;
  let transitionedMembers = 0;

  for (const active of before) {
    const images =
      discoverV013TriggeredRuleImages(memory, authority.theory, active);

    if (images.length === 0) {
      addNext(active);
      continue;
    }

    transitionedMembers += 1;

    for (const image of images) {
      rawRuleMatches += 1;
      const groundedBundle = instantiateV013StructuralTemplate(
        memory,
        image.outputBundleTemplate,
        image.bindings,
      );
      const outputs = readExactSequence(memory, groundedBundle).values;
      for (const successor of outputs) addNext(successor);

      same(
        cursor.currentScope(),
        oldScope,
        "old Scope root changed during successor derivation",
      );
      sameMembers(
        cursor.members(),
        before,
        "partial successor image became current",
      );
    }
  }

  if (rawRuleMatches === 0) {
    sameMembers(nextMembers, before, "quiescent Scope changed");
    return Object.freeze({
      oldScope,
      nextScope: oldScope,
      oldMembers: before,
      nextMembers: Object.freeze(nextMembers),
      rawRuleMatches,
      transitionedMembers,
      quiescent: true,
      handoffCount: 0,
    });
  }

  const nextScope = defineV013WorkingScope(
    memory,
    nextScopeSeed,
    authority.interpreter,
    nextMembers,
  );
  cursor.switchAtomically(oldScope, nextScope);

  return Object.freeze({
    oldScope,
    nextScope,
    oldMembers: before,
    nextMembers: Object.freeze(nextMembers),
    rawRuleMatches,
    transitionedMembers,
    quiescent: false,
    handoffCount: 1,
  });
}
