import {
  type LinkHandle,
  type WriteMemory,
} from "../memory.js";
import {
  SyntaxAsetBuilder,
  SyntaxAsetContractError,
  readSyntaxAset,
  type SyntaxAsetField,
  type SyntaxAsetFieldRule,
  type SyntaxAsetKindRule,
  type SyntaxAsetOccurrence,
  type SyntaxAsetRead,
  type SyntaxAsetTargetClass,
  type SyntaxAsetVocabulary,
} from "../syntax-aset-contract.js";

export {
  SyntaxAsetBuilder,
  SyntaxAsetContractError,
  readSyntaxAset,
};
export type {
  SyntaxAsetField,
  SyntaxAsetFieldRule,
  SyntaxAsetKindRule,
  SyntaxAsetOccurrence,
  SyntaxAsetRead,
  SyntaxAsetTargetClass,
  SyntaxAsetVocabulary,
};

const KIND_NAMES = [
  "File",
  "Statement",
  "Link",
  "Definition",
  "Equality",
  "Inequality",
  "Sequence",
  "Set",
  "Round",
  "Square",
  "Not",
  "Female",
  "Male",
  "ContextPronoun",
  "Literal",
] as const;

const ROLE_NAMES = [
  "item",
  "expression",
  "start",
  "end",
  "name",
  "body",
  "left",
  "right",
  "operand",
  "value",
] as const;

// Derived inspection convenience only. Per-kind grammar rules below are the
// authoritative target-class contract. `name` is a child in Definition.
const CHILD_ROLE_NAMES = [
  "item",
  "expression",
  "start",
  "end",
  "name",
  "body",
  "left",
  "right",
  "operand",
] as const;

export type SyntaxAsetKindName = typeof KIND_NAMES[number];
export type SyntaxAsetRoleName = typeof ROLE_NAMES[number];
export type SyntaxAsetKindLinks = Readonly<Record<SyntaxAsetKindName, LinkHandle>>;
export type SyntaxAsetRoleLinks = Readonly<Record<SyntaxAsetRoleName, LinkHandle>>;

export interface SyntaxAsetToolingVocabulary extends SyntaxAsetVocabulary {
  readonly kinds: SyntaxAsetKindLinks;
  readonly roles: SyntaxAsetRoleLinks;
}

function materializeNamedSeries<Name extends string>(
  memory: WriteMemory,
  scope: LinkHandle,
  names: readonly Name[],
): Readonly<Record<Name, LinkHandle>> {
  let cursor = scope;
  const entries: Array<readonly [Name, LinkHandle]> = [];
  for (const name of names) {
    cursor = memory.ensure(cursor, scope);
    entries.push(Object.freeze([name, cursor]));
  }
  return Object.freeze(Object.fromEntries(entries)) as Readonly<Record<Name, LinkHandle>>;
}

function fieldRule(
  role: LinkHandle,
  target: SyntaxAsetTargetClass,
  min: number,
  max: number | null,
): SyntaxAsetFieldRule {
  return Object.freeze({ role, target, min, max });
}

function syntaxRule(
  kind: LinkHandle,
  fields: readonly SyntaxAsetFieldRule[],
): SyntaxAsetKindRule {
  return Object.freeze({ kind, fields: Object.freeze([...fields]) });
}

function materializeGrammar(
  kinds: SyntaxAsetKindLinks,
  roles: SyntaxAsetRoleLinks,
): readonly SyntaxAsetKindRule[] {
  const child = (role: LinkHandle, min: number, max: number | null) =>
    fieldRule(role, "child", min, max);
  const carrier = (role: LinkHandle, min: number, max: number | null) =>
    fieldRule(role, "carrier", min, max);

  return Object.freeze([
    syntaxRule(kinds.File, [child(roles.item, 0, null)]),
    syntaxRule(kinds.Statement, [child(roles.expression, 1, 1)]),
    syntaxRule(kinds.Link, [
      child(roles.start, 1, 1),
      child(roles.end, 1, 1),
    ]),
    syntaxRule(kinds.Definition, [
      child(roles.name, 1, 1),
      child(roles.body, 1, 1),
    ]),
    syntaxRule(kinds.Equality, [
      child(roles.left, 1, 1),
      child(roles.right, 1, 1),
    ]),
    syntaxRule(kinds.Inequality, [
      child(roles.left, 1, 1),
      child(roles.right, 1, 1),
    ]),
    syntaxRule(kinds.Sequence, [child(roles.item, 2, null)]),
    // Set retains textual/source order at the syntax layer. This does not
    // assign ordering semantics to the lowered semantic set.
    syntaxRule(kinds.Set, [child(roles.item, 0, null)]),
    syntaxRule(kinds.Round, [child(roles.expression, 0, 1)]),
    syntaxRule(kinds.Square, [child(roles.expression, 0, 1)]),
    syntaxRule(kinds.Not, [child(roles.operand, 1, 1)]),
    syntaxRule(kinds.Female, [child(roles.operand, 1, 1)]),
    syntaxRule(kinds.Male, [child(roles.operand, 1, 1)]),
    syntaxRule(kinds.ContextPronoun, [carrier(roles.value, 1, 1)]),
    syntaxRule(kinds.Literal, [carrier(roles.value, 1, 1)]),
  ]);
}

/**
 * Materialize the reusable syntax-only vocabulary relative to one explicit
 * caller-owned seed Link. Names in this TypeScript object are API labels only:
 * the Link identities are the structural forms derived below, never strings,
 * source positions, host object identities, allocation indexes or visual keys.
 *
 * The finite grammar is source-structure tooling authority only. It does not
 * assign accepted MTS semantics to kind/role Links.
 */
export function materializeSyntaxAsetVocabulary(
  memory: WriteMemory,
  seed: LinkHandle,
): SyntaxAsetToolingVocabulary {
  const seedClosure = memory.ensureStartSelfClosed(seed);
  const namespace = memory.ensure(seed, seedClosure);
  const kindScope = memory.ensureStartSelfClosed(namespace);
  const roleScope = memory.ensureEndSelfClosed(namespace);
  const tag = memory.ensure(kindScope, roleScope);
  const kinds = materializeNamedSeries(memory, kindScope, KIND_NAMES);
  const roles = materializeNamedSeries(memory, roleScope, ROLE_NAMES);
  const knownRoles = Object.freeze(ROLE_NAMES.map((name) => roles[name]));
  const childRoles = Object.freeze(CHILD_ROLE_NAMES.map((name) => roles[name]));
  const rules = materializeGrammar(kinds, roles);

  return Object.freeze({
    tag,
    kinds,
    roles,
    knownRoles,
    rules,
    childRoles,
  });
}
