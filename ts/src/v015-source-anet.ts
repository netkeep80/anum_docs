import {
  ExactSequenceError,
  materializeExactSequence,
  readExactSequence,
} from "./exact-sequence.js";
import {
  MemoryError,
  verifyRootBasis,
  type LinkHandle,
  type RootBasis,
  type WriteMemory,
  type ReadMemory,
} from "./memory.js";
import { readNativeSyntaxGrammar } from "./native-syntax-grammar.js";
import {
  readSyntaxAset,
  type SyntaxAsetKindRule,
  type SyntaxAsetOccurrence,
} from "./syntax-aset-contract.js";

export type V015SourceAnetErrorCode =
  | "invalid-basis"
  | "invalid-profile"
  | "incompatible-profile"
  | "invalid-source"
  | "unsupported-entry";

export class V015SourceAnetError extends Error {
  override readonly name = "V015SourceAnetError";

  constructor(readonly code: V015SourceAnetErrorCode) {
    super(code);
  }
}

export interface V015SourceAnetProfile {
  readonly blockForm: LinkHandle;
  readonly bareForm: LinkHandle;
  readonly bindingForm: LinkHandle;
  readonly bundleForm: LinkHandle;
  readonly itemRole: LinkHandle;
  readonly bareValueRole: LinkHandle;
  readonly bindingNameRole: LinkHandle;
  readonly bindingValueRole: LinkHandle;
  readonly bundleAnchorRole: LinkHandle;
  readonly bundleBodyRole: LinkHandle;
}

export interface V015SourceAnetBindingProjection {
  readonly coordinate: LinkHandle | null;
  readonly name: LinkHandle;
  readonly value: LinkHandle;
}

export interface V015SourceAnetDenotation {
  readonly members: ReadonlySet<LinkHandle>;
  readonly bindings: readonly V015SourceAnetBindingProjection[];
}

function fail(code: V015SourceAnetErrorCode): never {
  throw new V015SourceAnetError(code);
}

export function materializeV015SourceAnetProfile(
  memory: WriteMemory,
  profile: V015SourceAnetProfile,
): LinkHandle {
  return materializeExactSequence(memory, [
    profile.blockForm,
    profile.bareForm,
    profile.bindingForm,
    profile.bundleForm,
    profile.itemRole,
    profile.bareValueRole,
    profile.bindingNameRole,
    profile.bindingValueRole,
    profile.bundleAnchorRole,
    profile.bundleBodyRole,
  ]);
}

function readProfile(
  memory: ReadMemory,
  root: LinkHandle,
): V015SourceAnetProfile {
  try {
    const values = readExactSequence(memory, root).values;
    if (values.length !== 10) fail("invalid-profile");

    const [
      blockForm,
      bareForm,
      bindingForm,
      bundleForm,
      itemRole,
      bareValueRole,
      bindingNameRole,
      bindingValueRole,
      bundleAnchorRole,
      bundleBodyRole,
    ] = values;

    if (
      blockForm === undefined ||
      bareForm === undefined ||
      bindingForm === undefined ||
      bundleForm === undefined ||
      itemRole === undefined ||
      bareValueRole === undefined ||
      bindingNameRole === undefined ||
      bindingValueRole === undefined ||
      bundleAnchorRole === undefined ||
      bundleBodyRole === undefined ||
      new Set([blockForm, bareForm, bindingForm, bundleForm]).size !== 4
    ) {
      return fail("invalid-profile");
    }

    return Object.freeze({
      blockForm,
      bareForm,
      bindingForm,
      bundleForm,
      itemRole,
      bareValueRole,
      bindingNameRole,
      bindingValueRole,
      bundleAnchorRole,
      bundleBodyRole,
    });
  } catch (error) {
    if (error instanceof V015SourceAnetError) throw error;
    if (error instanceof ExactSequenceError || error instanceof MemoryError) {
      return fail("invalid-profile");
    }
    throw error;
  }
}

function rule(
  rules: readonly SyntaxAsetKindRule[],
  form: LinkHandle,
): SyntaxAsetKindRule {
  return rules.find((candidate) => candidate.kind === form)
    ?? fail("incompatible-profile");
}

function exactRule(
  rules: readonly SyntaxAsetKindRule[],
  form: LinkHandle,
  expected: readonly Readonly<{
    role: LinkHandle;
    target: "child" | "carrier";
    min: number;
    max: number | null;
  }>[],
): void {
  const selected = rule(rules, form);
  if (selected.fields.length !== expected.length) fail("incompatible-profile");

  for (let index = 0; index < expected.length; index += 1) {
    const field = selected.fields[index];
    const wanted = expected[index];
    if (
      field === undefined ||
      wanted === undefined ||
      field.role !== wanted.role ||
      field.target !== wanted.target ||
      field.min !== wanted.min ||
      field.max !== wanted.max
    ) {
      fail("incompatible-profile");
    }
  }
}

function requireProfileCompatibility(
  rules: readonly SyntaxAsetKindRule[],
  profile: V015SourceAnetProfile,
): void {
  exactRule(rules, profile.blockForm, [{
    role: profile.itemRole,
    target: "child",
    min: 0,
    max: null,
  }]);
  exactRule(rules, profile.bareForm, [{
    role: profile.bareValueRole,
    target: "carrier",
    min: 1,
    max: 1,
  }]);
  exactRule(rules, profile.bindingForm, [
    {
      role: profile.bindingNameRole,
      target: "carrier",
      min: 1,
      max: 1,
    },
    {
      role: profile.bindingValueRole,
      target: "carrier",
      min: 1,
      max: 1,
    },
  ]);
  exactRule(rules, profile.bundleForm, [
    {
      role: profile.bundleAnchorRole,
      target: "carrier",
      min: 1,
      max: 1,
    },
    {
      role: profile.bundleBodyRole,
      target: "child",
      min: 1,
      max: 1,
    },
  ]);
}

export function readV015SourceAnetProfile(
  memory: ReadMemory,
  basis: RootBasis,
  grammarRoot: LinkHandle,
  profileRoot: LinkHandle,
): V015SourceAnetProfile {
  let verified: RootBasis;
  try {
    verified = verifyRootBasis(memory, basis);
  } catch {
    return fail("invalid-basis");
  }

  const grammar = readNativeSyntaxGrammar(memory, verified, grammarRoot);
  const profile = readProfile(memory, profileRoot);
  requireProfileCompatibility(grammar.vocabulary.rules, profile);
  return profile;
}

function oneField(
  occurrence: SyntaxAsetOccurrence,
  role: LinkHandle,
): LinkHandle {
  const values = occurrence.fields
    .filter((field) => field.role === role)
    .map((field) => field.value);
  if (values.length !== 1) fail("incompatible-profile");
  return values[0]!;
}

/**
 * Lower one already-resolved native source ANet into extensional semantic ANet
 * membership.
 *
 * The source Grammar/profile selects the role of each occurrence. Physical
 * Link existence is never treated as membership by itself.
 *
 * Root laws:
 *   bare X      -> X is a semantic member
 *   A : X       -> metamodel binding only
 *   A : {...}   -> anchored nested source ANet; A itself is not implicit root
 *                  membership
 *
 * Nested-context laws:
 *   bare X      -> context->X is a semantic member
 *   A : X       -> context->A is a semantic member; X remains the binding value
 *   A : {...}   -> context->A is a semantic member and becomes child context
 */
export function denoteV015ResolvedSourceAnet(
  memory: WriteMemory,
  basis: RootBasis,
  grammarRoot: LinkHandle,
  profileRoot: LinkHandle,
  sourceAnet: LinkHandle,
): V015SourceAnetDenotation {
  let verified: RootBasis;
  try {
    verified = verifyRootBasis(memory, basis);
  } catch {
    return fail("invalid-basis");
  }

  const grammar = readNativeSyntaxGrammar(memory, verified, grammarRoot);
  const profile = readProfile(memory, profileRoot);
  requireProfileCompatibility(grammar.vocabulary.rules, profile);

  let source;
  try {
    source = readSyntaxAset(memory, sourceAnet, grammar.vocabulary);
  } catch {
    return fail("invalid-source");
  }

  const occurrences = new Map(
    source.occurrences.map((entry) => [entry.occurrence, entry]),
  );
  const root = occurrences.get(source.root);
  if (root?.kind !== profile.blockForm) fail("invalid-source");

  const members = new Set<LinkHandle>();
  const bindings: V015SourceAnetBindingProjection[] = [];

  const walkBlock = (
    blockHandle: LinkHandle,
    contextAnchor: LinkHandle | null,
  ): void => {
    const block = occurrences.get(blockHandle);
    if (block?.kind !== profile.blockForm) fail("invalid-source");

    for (const field of block.fields) {
      if (field.role !== profile.itemRole) continue;
      const entry = occurrences.get(field.value);
      if (entry === undefined) fail("invalid-source");

      if (entry.kind === profile.bareForm) {
        const resolved = oneField(entry, profile.bareValueRole);
        members.add(
          contextAnchor === null
            ? resolved
            : memory.ensure(contextAnchor, resolved),
        );
        continue;
      }

      if (entry.kind === profile.bindingForm) {
        const name = oneField(entry, profile.bindingNameRole);
        const value = oneField(entry, profile.bindingValueRole);
        const coordinate = contextAnchor === null
          ? null
          : memory.ensure(contextAnchor, name);

        if (coordinate !== null) members.add(coordinate);
        bindings.push(Object.freeze({ coordinate, name, value }));
        continue;
      }

      if (entry.kind === profile.bundleForm) {
        const localAnchor = oneField(entry, profile.bundleAnchorRole);
        const body = oneField(entry, profile.bundleBodyRole);
        const nestedAnchor = contextAnchor === null
          ? localAnchor
          : memory.ensure(contextAnchor, localAnchor);

        if (contextAnchor !== null) members.add(nestedAnchor);
        walkBlock(body, nestedAnchor);
        continue;
      }

      return fail("unsupported-entry");
    }
  };

  walkBlock(source.root, null);

  return Object.freeze({
    members: new Set(members) as ReadonlySet<LinkHandle>,
    bindings: Object.freeze(bindings),
  });
}
