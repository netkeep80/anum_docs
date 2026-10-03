import {
  ExactSequenceError,
  materializeExactSequence,
  readExactSequence,
} from "./exact-sequence.js";
import {
  MemoryError,
  verifyRootBasis,
  type LinkHandle,
  type ReadMemory,
  type RootBasis,
  type WriteMemory,
} from "./memory.js";
import { readNativeSyntaxGrammar } from "./native-syntax-grammar.js";
import {
  readSourceNamespaces,
  type SourceDeclaration,
} from "./source-namespace.js";
import {
  readSyntaxAset,
  type SyntaxAsetKindRule,
  type SyntaxAsetOccurrence,
} from "./syntax-aset-contract.js";

export type V015RootBootstrapErrorCode =
  | "invalid-basis"
  | "invalid-profile"
  | "incompatible-profile"
  | "nested-namespace"
  | "unsupported-bootstrap-form"
  | "unbound-name"
  | "missing-root-structure"
  | "replay-wrote";

export class V015RootBootstrapError extends Error {
  override readonly name = "V015RootBootstrapError";
  constructor(readonly code: V015RootBootstrapErrorCode) {
    super(code);
  }
}

export interface V015RootBootstrapProfile {
  readonly rootForm: LinkHandle;
  readonly startForm: LinkHandle;
  readonly endForm: LinkHandle;
  readonly pairForm: LinkHandle;
  readonly nameRefForm: LinkHandle;
  readonly startChildRole: LinkHandle;
  readonly endChildRole: LinkHandle;
  readonly pairLeftRole: LinkHandle;
  readonly pairRightRole: LinkHandle;
  readonly referencedNameRole: LinkHandle;
}

export interface V015RootBootstrapBinding {
  readonly namespace: LinkHandle;
  readonly declarationOccurrence: LinkHandle;
  readonly nameCarrier: LinkHandle;
  readonly bodyOccurrence: LinkHandle;
  readonly value: LinkHandle;
}

export interface V015RootBootstrapRead {
  readonly rootNamespace: LinkHandle;
  readonly bindings: readonly V015RootBootstrapBinding[];
}

function fail(code: V015RootBootstrapErrorCode): never {
  throw new V015RootBootstrapError(code);
}

export function materializeV015RootBootstrapProfile(
  memory: WriteMemory,
  profile: V015RootBootstrapProfile,
): LinkHandle {
  return materializeExactSequence(memory, [
    profile.rootForm,
    profile.startForm,
    profile.endForm,
    profile.pairForm,
    profile.nameRefForm,
    profile.startChildRole,
    profile.endChildRole,
    profile.pairLeftRole,
    profile.pairRightRole,
    profile.referencedNameRole,
  ]);
}

function readProfile(
  memory: ReadMemory,
  root: LinkHandle,
): V015RootBootstrapProfile {
  try {
    const values = readExactSequence(memory, root).values;
    if (values.length !== 10) fail("invalid-profile");
    const [
      rootForm,
      startForm,
      endForm,
      pairForm,
      nameRefForm,
      startChildRole,
      endChildRole,
      pairLeftRole,
      pairRightRole,
      referencedNameRole,
    ] = values;
    if (
      rootForm === undefined ||
      startForm === undefined ||
      endForm === undefined ||
      pairForm === undefined ||
      nameRefForm === undefined ||
      startChildRole === undefined ||
      endChildRole === undefined ||
      pairLeftRole === undefined ||
      pairRightRole === undefined ||
      referencedNameRole === undefined ||
      new Set([
        rootForm,
        startForm,
        endForm,
        pairForm,
        nameRefForm,
      ]).size !== 5
    ) {
      return fail("invalid-profile");
    }
    return Object.freeze({
      rootForm,
      startForm,
      endForm,
      pairForm,
      nameRefForm,
      startChildRole,
      endChildRole,
      pairLeftRole,
      pairRightRole,
      referencedNameRole,
    });
  } catch (error) {
    if (error instanceof V015RootBootstrapError) throw error;
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
      field.min !== 1 ||
      field.max !== 1
    ) {
      fail("incompatible-profile");
    }
  }
}

function requireProfileCompatibility(
  rules: readonly SyntaxAsetKindRule[],
  profile: V015RootBootstrapProfile,
): void {
  const root = rule(rules, profile.rootForm);
  if (root.fields.length !== 0) fail("incompatible-profile");
  exactRule(rules, profile.startForm, [
    { role: profile.startChildRole, target: "child" },
  ]);
  exactRule(rules, profile.endForm, [
    { role: profile.endChildRole, target: "child" },
  ]);
  exactRule(rules, profile.pairForm, [
    { role: profile.pairLeftRole, target: "child" },
    { role: profile.pairRightRole, target: "child" },
  ]);
  exactRule(rules, profile.nameRefForm, [
    { role: profile.referencedNameRole, target: "carrier" },
  ]);
}

export function readV015RootBootstrapProfile(
  memory: ReadMemory,
  basis: RootBasis,
  grammarRoot: LinkHandle,
  profileRoot: LinkHandle,
): V015RootBootstrapProfile {
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

function byOccurrence(
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

function existingPair(
  memory: ReadMemory,
  left: LinkHandle,
  right: LinkHandle,
): LinkHandle {
  return memory.find(left, right) ?? fail("missing-root-structure");
}

function resolveBody(
  memory: ReadMemory,
  basis: RootBasis,
  profile: V015RootBootstrapProfile,
  occurrences: ReadonlyMap<LinkHandle, SyntaxAsetOccurrence>,
  bindings: ReadonlyMap<LinkHandle, LinkHandle>,
  bodyHandle: LinkHandle,
): LinkHandle {
  const body = occurrences.get(bodyHandle)
    ?? fail("unsupported-bootstrap-form");

  if (body.kind === profile.rootForm) return basis.R;

  if (body.kind === profile.nameRefForm) {
    const name = fieldValue(body, profile.referencedNameRole);
    return bindings.get(name) ?? fail("unbound-name");
  }

  if (body.kind === profile.startForm) {
    const child = resolveBody(
      memory,
      basis,
      profile,
      occurrences,
      bindings,
      fieldValue(body, profile.startChildRole),
    );
    if (child !== basis.R) fail("unsupported-bootstrap-form");
    return basis.O;
  }

  if (body.kind === profile.endForm) {
    const child = resolveBody(
      memory,
      basis,
      profile,
      occurrences,
      bindings,
      fieldValue(body, profile.endChildRole),
    );
    if (child !== basis.R) fail("unsupported-bootstrap-form");
    return basis.C;
  }

  if (body.kind === profile.pairForm) {
    const left = resolveBody(
      memory,
      basis,
      profile,
      occurrences,
      bindings,
      fieldValue(body, profile.pairLeftRole),
    );
    const right = resolveBody(
      memory,
      basis,
      profile,
      occurrences,
      bindings,
      fieldValue(body, profile.pairRightRole),
    );
    return existingPair(memory, left, right);
  }

  return fail("unsupported-bootstrap-form");
}

function requireFlatBootstrap(
  declarations: readonly SourceDeclaration[],
  rootNamespace: LinkHandle,
): void {
  for (const declaration of declarations) {
    if (declaration.namespace !== rootNamespace) fail("nested-namespace");
  }
}

export function resolveV015RootBootstrap(
  memory: ReadMemory,
  basis: RootBasis,
  grammarRoot: LinkHandle,
  sourceNamespaceProfileRoot: LinkHandle,
  bootstrapProfileRoot: LinkHandle,
  syntaxAset: LinkHandle,
): V015RootBootstrapRead {
  const before = memory.linkCount;
  try {
    let verified: RootBasis;
    try {
      verified = verifyRootBasis(memory, basis);
    } catch {
      return fail("invalid-basis");
    }

    const grammar = readNativeSyntaxGrammar(memory, verified, grammarRoot);
    const profile = readProfile(memory, bootstrapProfileRoot);
    requireProfileCompatibility(grammar.vocabulary.rules, profile);

    const namespaces = readSourceNamespaces(
      memory,
      verified,
      grammarRoot,
      sourceNamespaceProfileRoot,
      syntaxAset,
    );
    requireFlatBootstrap(namespaces.declarations, namespaces.rootNamespace);

    const syntax = readSyntaxAset(memory, syntaxAset, grammar.vocabulary);
    const occurrences = byOccurrence(syntax.occurrences);
    const resolved = new Map<LinkHandle, LinkHandle>();
    const bindings: V015RootBootstrapBinding[] = [];

    for (const declaration of namespaces.declarations) {
      const value = resolveBody(
        memory,
        verified,
        profile,
        occurrences,
        resolved,
        declaration.bodyOccurrence,
      );
      resolved.set(declaration.nameCarrier, value);
      bindings.push(Object.freeze({
        namespace: declaration.namespace,
        declarationOccurrence: declaration.declarationOccurrence,
        nameCarrier: declaration.nameCarrier,
        bodyOccurrence: declaration.bodyOccurrence,
        value,
      }));
    }

    return Object.freeze({
      rootNamespace: namespaces.rootNamespace,
      bindings: Object.freeze(bindings),
    });
  } finally {
    if (memory.linkCount !== before) fail("replay-wrote");
  }
}
