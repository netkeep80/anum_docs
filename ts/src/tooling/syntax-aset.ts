import {
  type LinkHandle,
  type WriteMemory,
} from "../memory.js";
import {
  SyntaxAsetBuilder,
  SyntaxAsetContractError,
  readSyntaxAset,
  type SyntaxAsetField,
  type SyntaxAsetOccurrence,
  type SyntaxAsetRead,
  type SyntaxAsetVocabulary,
} from "../syntax-aset-contract.js";

export {
  SyntaxAsetBuilder,
  SyntaxAsetContractError,
  readSyntaxAset,
};
export type {
  SyntaxAsetField,
  SyntaxAsetOccurrence,
  SyntaxAsetRead,
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

const CHILD_ROLE_NAMES = [
  "item",
  "expression",
  "start",
  "end",
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

/**
 * Materialize the reusable syntax-only vocabulary relative to one explicit
 * caller-owned seed Link. Names in this TypeScript object are API labels only:
 * the Link identities are the structural forms derived below, never strings,
 * source positions, host object identities, allocation indexes or visual keys.
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
  const childRoles = Object.freeze(
    CHILD_ROLE_NAMES.map((name) => roles[name]),
  );

  return Object.freeze({
    tag,
    kinds,
    roles,
    childRoles,
  });
}
