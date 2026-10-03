import {
  ExactSequenceError,
  materializeExactSequence,
  readExactSequence,
} from "./exact-sequence.js";
import {
  MemoryError,
  type LinkHandle,
  type ReadMemory,
  type RootBasis,
  type WriteMemory,
} from "./memory.js";
import {
  readNativeSyntaxGrammar,
} from "./native-syntax-grammar.js";
import {
  readSyntaxAset,
  type SyntaxAsetKindRule,
  type SyntaxAsetOccurrence,
} from "./syntax-aset-contract.js";

export type SourceNamespaceErrorCode =
  | "invalid-profile"
  | "incompatible-profile"
  | "root-not-namespace"
  | "duplicate-local-name"
  | "shared-namespace-block"
  | "replay-wrote";

export class SourceNamespaceError extends Error {
  override readonly name = "SourceNamespaceError";

  constructor(readonly code: SourceNamespaceErrorCode) {
    super(code);
  }
}

export interface SourceNamespaceProfile {
  readonly blockForm: LinkHandle;
  readonly declarationForm: LinkHandle;
  readonly blockItemRole: LinkHandle;
  readonly declarationNameRole: LinkHandle;
  readonly declarationBodyRole: LinkHandle;
}

export interface SourceDeclaration {
  readonly namespacePath: readonly LinkHandle[];
  readonly namespace: LinkHandle;
  readonly nameCarrier: LinkHandle;
  readonly declarationOccurrence: LinkHandle;
  readonly bodyOccurrence: LinkHandle;
}

export interface SourceNamespaceRead {
  readonly rootNamespace: LinkHandle;
  readonly declarations: readonly SourceDeclaration[];
}

function fail(code: SourceNamespaceErrorCode): never {
  throw new SourceNamespaceError(code);
}

export function materializeSourceNamespaceProfile(
  memory: WriteMemory,
  profile: SourceNamespaceProfile,
): LinkHandle {
  return materializeExactSequence(memory, [
    profile.blockForm,
    profile.declarationForm,
    profile.blockItemRole,
    profile.declarationNameRole,
    profile.declarationBodyRole,
  ]);
}

function exactProfile(
  memory: ReadMemory,
  carrier: LinkHandle,
): SourceNamespaceProfile {
  try {
    const values = readExactSequence(memory, carrier).values;
    if (values.length !== 5) fail("invalid-profile");
    const [
      blockForm,
      declarationForm,
      blockItemRole,
      declarationNameRole,
      declarationBodyRole,
    ] = values;
    if (
      blockForm === undefined ||
      declarationForm === undefined ||
      blockItemRole === undefined ||
      declarationNameRole === undefined ||
      declarationBodyRole === undefined ||
      blockForm === declarationForm
    ) {
      return fail("invalid-profile");
    }
    return Object.freeze({
      blockForm,
      declarationForm,
      blockItemRole,
      declarationNameRole,
      declarationBodyRole,
    });
  } catch (error) {
    if (error instanceof SourceNamespaceError) throw error;
    if (error instanceof ExactSequenceError || error instanceof MemoryError) {
      return fail("invalid-profile");
    }
    throw error;
  }
}

function ruleFor(
  rules: readonly SyntaxAsetKindRule[],
  form: LinkHandle,
): SyntaxAsetKindRule {
  return rules.find((rule) => rule.kind === form) ?? fail("incompatible-profile");
}

function requireProfileCompatibility(
  rules: readonly SyntaxAsetKindRule[],
  profile: SourceNamespaceProfile,
): void {
  const block = ruleFor(rules, profile.blockForm);
  const declaration = ruleFor(rules, profile.declarationForm);

  const item = block.fields.find((field) => field.role === profile.blockItemRole);
  if (
    item === undefined ||
    item.target !== "child" ||
    item.min !== 0 ||
    item.max !== null
  ) {
    fail("incompatible-profile");
  }

  const name = declaration.fields.find(
    (field) => field.role === profile.declarationNameRole,
  );
  const body = declaration.fields.find(
    (field) => field.role === profile.declarationBodyRole,
  );
  if (
    name === undefined ||
    name.target !== "carrier" ||
    name.min !== 1 ||
    name.max !== 1 ||
    body === undefined ||
    body.target !== "child" ||
    body.min !== 1 ||
    body.max !== 1
  ) {
    fail("incompatible-profile");
  }
}

export function readSourceNamespaceProfile(
  memory: ReadMemory,
  basis: RootBasis,
  grammarRoot: LinkHandle,
  profileRoot: LinkHandle,
): SourceNamespaceProfile {
  const grammar = readNativeSyntaxGrammar(memory, basis, grammarRoot);
  const profile = exactProfile(memory, profileRoot);
  requireProfileCompatibility(grammar.vocabulary.rules, profile);
  return profile;
}

function occurrenceMap(
  occurrences: readonly SyntaxAsetOccurrence[],
): ReadonlyMap<LinkHandle, SyntaxAsetOccurrence> {
  return new Map(occurrences.map((occurrence) => [
    occurrence.occurrence,
    occurrence,
  ]));
}

function fieldValue(
  occurrence: SyntaxAsetOccurrence,
  role: LinkHandle,
): LinkHandle {
  return occurrence.fields.find((field) => field.role === role)?.value
    ?? fail("incompatible-profile");
}

export function readSourceNamespaces(
  memory: ReadMemory,
  basis: RootBasis,
  grammarRoot: LinkHandle,
  profileRoot: LinkHandle,
  syntaxAset: LinkHandle,
): SourceNamespaceRead {
  const before = memory.linkCount;
  try {
    const grammar = readNativeSyntaxGrammar(memory, basis, grammarRoot);
    const profile = exactProfile(memory, profileRoot);
    requireProfileCompatibility(grammar.vocabulary.rules, profile);
    const syntax = readSyntaxAset(memory, syntaxAset, grammar.vocabulary);
    const byOccurrence = occurrenceMap(syntax.occurrences);
    const root = byOccurrence.get(syntax.root);
    if (root?.kind !== profile.blockForm) fail("root-not-namespace");

    const declarations: SourceDeclaration[] = [];
    const parentByBlock = new Map<LinkHandle, LinkHandle | undefined>([
      [syntax.root, undefined],
    ]);

    const walk = (
      block: SyntaxAsetOccurrence,
      path: readonly LinkHandle[],
    ): void => {
      const localNames = new Set<LinkHandle>();
      for (const field of block.fields) {
        if (field.role !== profile.blockItemRole) continue;
        const child = byOccurrence.get(field.value);
        if (child?.kind !== profile.declarationForm) continue;

        const nameCarrier = fieldValue(child, profile.declarationNameRole);
        const bodyOccurrence = fieldValue(child, profile.declarationBodyRole);
        if (localNames.has(nameCarrier)) fail("duplicate-local-name");
        localNames.add(nameCarrier);

        declarations.push(Object.freeze({
          namespacePath: Object.freeze([...path]),
          namespace: block.occurrence,
          nameCarrier,
          declarationOccurrence: child.occurrence,
          bodyOccurrence,
        }));

        const body = byOccurrence.get(bodyOccurrence);
        if (body?.kind !== profile.blockForm) continue;
        if (parentByBlock.has(body.occurrence)) fail("shared-namespace-block");
        parentByBlock.set(body.occurrence, child.occurrence);
        walk(body, Object.freeze([...path, body.occurrence]));
      }
    };

    walk(root, Object.freeze([root.occurrence]));
    return Object.freeze({
      rootNamespace: root.occurrence,
      declarations: Object.freeze(declarations),
    });
  } finally {
    if (memory.linkCount !== before) fail("replay-wrote");
  }
}
