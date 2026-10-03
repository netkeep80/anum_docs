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

export type V015LinkDefinitionErrorCode =
  | "invalid-basis"
  | "invalid-profile"
  | "incompatible-profile"
  | "nested-namespace"
  | "unsupported-expression"
  | "unbound-name"
  | "unresolved-constraint"
  | "no-structural-solution"
  | "ambiguous-structural-solution"
  | "replay-wrote";

export class V015LinkDefinitionError extends Error {
  override readonly name = "V015LinkDefinitionError";
  constructor(readonly code: V015LinkDefinitionErrorCode) {
    super(code);
  }
}

export interface V015LinkDefinitionProfile {
  readonly pairForm: LinkHandle;
  readonly nameRefForm: LinkHandle;
  readonly pairLeftRole: LinkHandle;
  readonly pairRightRole: LinkHandle;
  readonly referencedNameRole: LinkHandle;
}

export interface V015ResolvedDefinition {
  readonly namespace: LinkHandle;
  readonly declarationOccurrence: LinkHandle;
  readonly nameCarrier: LinkHandle;
  readonly bodyOccurrence: LinkHandle;
  readonly value: LinkHandle;
}

export interface V015LinkDefinitionRead {
  readonly rootNamespace: LinkHandle;
  readonly definitions: readonly V015ResolvedDefinition[];
}

type SymbolicValue =
  | Readonly<{ kind: "link"; value: LinkHandle }>
  | Readonly<{ kind: "self" }>
  | Readonly<{ kind: "pending" }>;

function fail(code: V015LinkDefinitionErrorCode): never {
  throw new V015LinkDefinitionError(code);
}

export function materializeV015LinkDefinitionProfile(
  memory: WriteMemory,
  profile: V015LinkDefinitionProfile,
): LinkHandle {
  return materializeExactSequence(memory, [
    profile.pairForm,
    profile.nameRefForm,
    profile.pairLeftRole,
    profile.pairRightRole,
    profile.referencedNameRole,
  ]);
}

function readProfile(
  memory: ReadMemory,
  root: LinkHandle,
): V015LinkDefinitionProfile {
  try {
    const values = readExactSequence(memory, root).values;
    if (values.length !== 5) fail("invalid-profile");
    const [pairForm, nameRefForm, pairLeftRole, pairRightRole, referencedNameRole] = values;
    if (
      pairForm === undefined ||
      nameRefForm === undefined ||
      pairLeftRole === undefined ||
      pairRightRole === undefined ||
      referencedNameRole === undefined ||
      pairForm === nameRefForm ||
      pairLeftRole === pairRightRole
    ) {
      return fail("invalid-profile");
    }
    return Object.freeze({
      pairForm,
      nameRefForm,
      pairLeftRole,
      pairRightRole,
      referencedNameRole,
    });
  } catch (error) {
    if (error instanceof V015LinkDefinitionError) throw error;
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

function requireProfileCompatibility(
  rules: readonly SyntaxAsetKindRule[],
  profile: V015LinkDefinitionProfile,
): void {
  const pair = rule(rules, profile.pairForm);
  const ref = rule(rules, profile.nameRefForm);
  if (
    pair.fields.length !== 2 ||
    pair.fields[0]?.role !== profile.pairLeftRole ||
    pair.fields[0]?.target !== "child" ||
    pair.fields[0]?.min !== 1 ||
    pair.fields[0]?.max !== 1 ||
    pair.fields[1]?.role !== profile.pairRightRole ||
    pair.fields[1]?.target !== "child" ||
    pair.fields[1]?.min !== 1 ||
    pair.fields[1]?.max !== 1 ||
    ref.fields.length !== 1 ||
    ref.fields[0]?.role !== profile.referencedNameRole ||
    ref.fields[0]?.target !== "carrier" ||
    ref.fields[0]?.min !== 1 ||
    ref.fields[0]?.max !== 1
  ) {
    fail("incompatible-profile");
  }
}

export function readV015LinkDefinitionProfile(
  memory: ReadMemory,
  basis: RootBasis,
  grammarRoot: LinkHandle,
  profileRoot: LinkHandle,
): V015LinkDefinitionProfile {
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

function requireFlatDefinitions(
  declarations: readonly SourceDeclaration[],
  rootNamespace: LinkHandle,
): void {
  for (const declaration of declarations) {
    if (declaration.namespace !== rootNamespace) fail("nested-namespace");
  }
}

function selfStartCandidates(
  memory: ReadMemory,
  end: LinkHandle,
): readonly LinkHandle[] {
  return memory.incoming(end).filter((candidate) => {
    const poles = memory.poles(candidate);
    return poles.start === candidate && poles.end === end;
  });
}

function selfEndCandidates(
  memory: ReadMemory,
  start: LinkHandle,
): readonly LinkHandle[] {
  return memory.outgoing(start).filter((candidate) => {
    const poles = memory.poles(candidate);
    return poles.start === start && poles.end === candidate;
  });
}

function oneCandidate(candidates: readonly LinkHandle[]): LinkHandle {
  const unique = [...new Set(candidates)];
  if (unique.length === 0) fail("no-structural-solution");
  if (unique.length !== 1) fail("ambiguous-structural-solution");
  return unique[0]!;
}

function solvePair(
  memory: ReadMemory,
  left: SymbolicValue,
  right: SymbolicValue,
): SymbolicValue {
  if (left.kind === "pending" || right.kind === "pending") {
    return Object.freeze({ kind: "pending" });
  }
  if (left.kind === "link" && right.kind === "link") {
    const found = memory.find(left.value, right.value);
    if (found === undefined) fail("no-structural-solution");
    return Object.freeze({ kind: "link", value: found });
  }
  if (left.kind === "self" && right.kind === "self") {
    const root = memory.root;
    const poles = memory.poles(root);
    if (poles.start !== root || poles.end !== root) {
      return fail("no-structural-solution");
    }
    return Object.freeze({ kind: "link", value: root });
  }
  if (left.kind === "self" && right.kind === "link") {
    return Object.freeze({
      kind: "link",
      value: oneCandidate(selfStartCandidates(memory, right.value)),
    });
  }
  if (left.kind === "link" && right.kind === "self") {
    return Object.freeze({
      kind: "link",
      value: oneCandidate(selfEndCandidates(memory, left.value)),
    });
  }
  return fail("unsupported-expression");
}

function resolveExpression(
  memory: ReadMemory,
  profile: V015LinkDefinitionProfile,
  occurrences: ReadonlyMap<LinkHandle, SyntaxAsetOccurrence>,
  declaredNames: ReadonlySet<LinkHandle>,
  resolved: ReadonlyMap<LinkHandle, LinkHandle>,
  targetName: LinkHandle,
  expression: LinkHandle,
): SymbolicValue {
  const occurrence = occurrences.get(expression) ?? fail("unsupported-expression");
  if (occurrence.kind === profile.nameRefForm) {
    const name = fieldValue(occurrence, profile.referencedNameRole);
    if (name === targetName) return Object.freeze({ kind: "self" });
    const value = resolved.get(name);
    if (value !== undefined) return Object.freeze({ kind: "link", value });
    if (!declaredNames.has(name)) fail("unbound-name");
    return Object.freeze({ kind: "pending" });
  }
  if (occurrence.kind !== profile.pairForm) return fail("unsupported-expression");
  const left = resolveExpression(
    memory, profile, occurrences, declaredNames, resolved, targetName,
    fieldValue(occurrence, profile.pairLeftRole),
  );
  const right = resolveExpression(
    memory, profile, occurrences, declaredNames, resolved, targetName,
    fieldValue(occurrence, profile.pairRightRole),
  );
  return solvePair(memory, left, right);
}

export function resolveV015LinkDefinitions(
  memory: ReadMemory,
  basis: RootBasis,
  grammarRoot: LinkHandle,
  sourceNamespaceProfileRoot: LinkHandle,
  definitionProfileRoot: LinkHandle,
  syntaxAset: LinkHandle,
): V015LinkDefinitionRead {
  const before = memory.linkCount;
  try {
    let verified: RootBasis;
    try {
      verified = verifyRootBasis(memory, basis);
    } catch {
      return fail("invalid-basis");
    }
    const grammar = readNativeSyntaxGrammar(memory, verified, grammarRoot);
    const profile = readProfile(memory, definitionProfileRoot);
    requireProfileCompatibility(grammar.vocabulary.rules, profile);

    const namespaces = readSourceNamespaces(
      memory,
      verified,
      grammarRoot,
      sourceNamespaceProfileRoot,
      syntaxAset,
    );
    requireFlatDefinitions(namespaces.declarations, namespaces.rootNamespace);
    const syntax = readSyntaxAset(memory, syntaxAset, grammar.vocabulary);
    const occurrences = occurrenceMap(syntax.occurrences);
    const declaredNames = new Set(
      namespaces.declarations.map((declaration) => declaration.nameCarrier),
    );
    const resolved = new Map<LinkHandle, LinkHandle>();

    let progress = true;
    while (progress && resolved.size < namespaces.declarations.length) {
      progress = false;
      for (const declaration of namespaces.declarations) {
        if (resolved.has(declaration.nameCarrier)) continue;
        const candidate = resolveExpression(
          memory,
          profile,
          occurrences,
          declaredNames,
          resolved,
          declaration.nameCarrier,
          declaration.bodyOccurrence,
        );
        if (candidate.kind !== "link") continue;
        resolved.set(declaration.nameCarrier, candidate.value);
        progress = true;
      }
    }
    if (resolved.size !== namespaces.declarations.length) {
      fail("unresolved-constraint");
    }

    const definitions = namespaces.declarations.map((declaration) =>
      Object.freeze({
        namespace: declaration.namespace,
        declarationOccurrence: declaration.declarationOccurrence,
        nameCarrier: declaration.nameCarrier,
        bodyOccurrence: declaration.bodyOccurrence,
        value: resolved.get(declaration.nameCarrier)!,
      }),
    );
    return Object.freeze({
      rootNamespace: namespaces.rootNamespace,
      definitions: Object.freeze(definitions),
    });
  } finally {
    if (memory.linkCount !== before) fail("replay-wrote");
  }
}

export function evaluateV015LinkIdentityEquality(
  memory: ReadMemory,
  basis: RootBasis,
  left: LinkHandle,
  right: LinkHandle,
): LinkHandle {
  const before = memory.linkCount;
  try {
    let verified: RootBasis;
    try {
      verified = verifyRootBasis(memory, basis);
      memory.poles(left);
      memory.poles(right);
    } catch {
      return fail("invalid-basis");
    }
    return left === right ? verified.L : verified.U;
  } finally {
    if (memory.linkCount !== before) fail("replay-wrote");
  }
}
