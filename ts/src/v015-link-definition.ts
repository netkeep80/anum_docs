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
  readonly sequenceForm?: LinkHandle;
  readonly sequenceItemRole?: LinkHandle;
  readonly equalityForm?: LinkHandle;
  readonly equalityLeftRole?: LinkHandle;
  readonly equalityRightRole?: LinkHandle;
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
  const hasSequenceForm = profile.sequenceForm !== undefined;
  const hasSequenceItemRole = profile.sequenceItemRole !== undefined;
  if (hasSequenceForm !== hasSequenceItemRole) fail("invalid-profile");

  const equalityParts = [
    profile.equalityForm,
    profile.equalityLeftRole,
    profile.equalityRightRole,
  ];
  const equalityCount = equalityParts.filter((value) => value !== undefined).length;
  if (equalityCount !== 0 && equalityCount !== 3) fail("invalid-profile");

  const values: LinkHandle[] = [
    profile.pairForm,
    profile.nameRefForm,
    profile.pairLeftRole,
    profile.pairRightRole,
    profile.referencedNameRole,
  ];
  if (
    profile.sequenceForm !== undefined &&
    profile.sequenceItemRole !== undefined
  ) {
    values.push(profile.sequenceForm, profile.sequenceItemRole);
  }
  if (
    profile.equalityForm !== undefined &&
    profile.equalityLeftRole !== undefined &&
    profile.equalityRightRole !== undefined
  ) {
    values.push(
      profile.equalityForm,
      profile.equalityLeftRole,
      profile.equalityRightRole,
    );
  }
  return materializeExactSequence(memory, values);
}

function readProfile(
  memory: ReadMemory,
  root: LinkHandle,
): V015LinkDefinitionProfile {
  try {
    const values = readExactSequence(memory, root).values;
    if (![5, 7, 8, 10].includes(values.length)) fail("invalid-profile");

    const pairForm = values[0];
    const nameRefForm = values[1];
    const pairLeftRole = values[2];
    const pairRightRole = values[3];
    const referencedNameRole = values[4];
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

    const hasSequence = values.length === 7 || values.length === 10;
    const equalityOffset = hasSequence ? 7 : 5;
    const hasEquality = values.length === 8 || values.length === 10;

    const sequenceForm = hasSequence ? values[5] : undefined;
    const sequenceItemRole = hasSequence ? values[6] : undefined;
    if (
      hasSequence &&
      (
        sequenceForm === undefined ||
        sequenceItemRole === undefined ||
        sequenceForm === pairForm ||
        sequenceForm === nameRefForm
      )
    ) {
      return fail("invalid-profile");
    }

    const equalityForm = hasEquality ? values[equalityOffset] : undefined;
    const equalityLeftRole = hasEquality ? values[equalityOffset + 1] : undefined;
    const equalityRightRole = hasEquality ? values[equalityOffset + 2] : undefined;
    if (
      hasEquality &&
      (
        equalityForm === undefined ||
        equalityLeftRole === undefined ||
        equalityRightRole === undefined ||
        equalityLeftRole === equalityRightRole ||
        equalityForm === pairForm ||
        equalityForm === nameRefForm ||
        equalityForm === sequenceForm
      )
    ) {
      return fail("invalid-profile");
    }

    return Object.freeze({
      pairForm,
      nameRefForm,
      pairLeftRole,
      pairRightRole,
      referencedNameRole,
      ...(hasSequence ? { sequenceForm, sequenceItemRole } : {}),
      ...(hasEquality
        ? { equalityForm, equalityLeftRole, equalityRightRole }
        : {}),
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
  if (
    profile.sequenceForm !== undefined ||
    profile.sequenceItemRole !== undefined
  ) {
    if (
      profile.sequenceForm === undefined ||
      profile.sequenceItemRole === undefined
    ) {
      fail("incompatible-profile");
    }
    const sequence = rule(rules, profile.sequenceForm);
    if (
      sequence.fields.length !== 1 ||
      sequence.fields[0]?.role !== profile.sequenceItemRole ||
      sequence.fields[0]?.target !== "child" ||
      sequence.fields[0]?.min !== 0 ||
      sequence.fields[0]?.max !== null
    ) {
      fail("incompatible-profile");
    }
  }

  if (
    profile.equalityForm !== undefined ||
    profile.equalityLeftRole !== undefined ||
    profile.equalityRightRole !== undefined
  ) {
    if (
      profile.equalityForm === undefined ||
      profile.equalityLeftRole === undefined ||
      profile.equalityRightRole === undefined
    ) {
      fail("incompatible-profile");
    }
    const equality = rule(rules, profile.equalityForm);
    if (
      equality.fields.length !== 2 ||
      equality.fields[0]?.role !== profile.equalityLeftRole ||
      equality.fields[0]?.target !== "child" ||
      equality.fields[0]?.min !== 1 ||
      equality.fields[0]?.max !== 1 ||
      equality.fields[1]?.role !== profile.equalityRightRole ||
      equality.fields[1]?.target !== "child" ||
      equality.fields[1]?.min !== 1 ||
      equality.fields[1]?.max !== 1
    ) {
      fail("incompatible-profile");
    }
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

function fieldValues(
  occurrence: SyntaxAsetOccurrence,
  role: LinkHandle,
): readonly LinkHandle[] {
  return Object.freeze(
    occurrence.fields
      .filter((field) => field.role === role)
      .map((field) => field.value),
  );
}

function requireFlatDefinitions(
  declarations: readonly SourceDeclaration[],
  rootNamespace: LinkHandle,
): void {
  for (const declaration of declarations) {
    if (declaration.namespace !== rootNamespace) fail("nested-namespace");
  }
}

function resolveOperand(
  profile: V015LinkDefinitionProfile,
  occurrences: ReadonlyMap<LinkHandle, SyntaxAsetOccurrence>,
  declaredNames: ReadonlySet<LinkHandle>,
  resolved: ReadonlyMap<LinkHandle, LinkHandle>,
  targetName: LinkHandle,
  operand: LinkHandle,
): SymbolicValue {
  const occurrence = occurrences.get(operand) ?? fail("unsupported-expression");
  if (occurrence.kind !== profile.nameRefForm) fail("unsupported-expression");
  const name = fieldValue(occurrence, profile.referencedNameRole);
  if (name === targetName) return Object.freeze({ kind: "self" });
  const value = resolved.get(name);
  if (value !== undefined) return Object.freeze({ kind: "link", value });
  if (!declaredNames.has(name)) fail("unbound-name");
  return Object.freeze({ kind: "pending" });
}

function materializeExpression(
  memory: WriteMemory,
  basis: RootBasis,
  profile: V015LinkDefinitionProfile,
  occurrences: ReadonlyMap<LinkHandle, SyntaxAsetOccurrence>,
  declaredNames: ReadonlySet<LinkHandle>,
  resolved: ReadonlyMap<LinkHandle, LinkHandle>,
  targetName: LinkHandle,
  expression: LinkHandle,
): SymbolicValue {
  const occurrence = occurrences.get(expression) ?? fail("unsupported-expression");

  if (
    profile.sequenceForm !== undefined &&
    profile.sequenceItemRole !== undefined &&
    occurrence.kind === profile.sequenceForm
  ) {
    const items = fieldValues(occurrence, profile.sequenceItemRole).map((item) =>
      resolveOperand(
        profile,
        occurrences,
        declaredNames,
        resolved,
        targetName,
        item,
      ),
    );
    if (items.some((item) => item.kind === "pending")) {
      return Object.freeze({ kind: "pending" });
    }
    if (items.some((item) => item.kind === "self")) {
      return fail("unsupported-expression");
    }
    return Object.freeze({
      kind: "link",
      value: materializeExactSequence(
        memory,
        items.map((item) => {
          if (item.kind !== "link") return fail("unsupported-expression");
          return item.value;
        }),
      ),
    });
  }

  if (
    profile.equalityForm !== undefined &&
    profile.equalityLeftRole !== undefined &&
    profile.equalityRightRole !== undefined &&
    occurrence.kind === profile.equalityForm
  ) {
    const left = resolveOperand(
      profile,
      occurrences,
      declaredNames,
      resolved,
      targetName,
      fieldValue(occurrence, profile.equalityLeftRole),
    );
    const right = resolveOperand(
      profile,
      occurrences,
      declaredNames,
      resolved,
      targetName,
      fieldValue(occurrence, profile.equalityRightRole),
    );
    if (left.kind === "pending" || right.kind === "pending") {
      return Object.freeze({ kind: "pending" });
    }
    if (left.kind !== "link" || right.kind !== "link") {
      return fail("unsupported-expression");
    }
    return Object.freeze({
      kind: "link",
      value: evaluateV015LinkIdentityEquality(
        memory,
        basis,
        left.value,
        right.value,
      ),
    });
  }

  if (occurrence.kind !== profile.pairForm) fail("unsupported-expression");
  const left = resolveOperand(
    profile, occurrences, declaredNames, resolved, targetName,
    fieldValue(occurrence, profile.pairLeftRole),
  );
  const right = resolveOperand(
    profile, occurrences, declaredNames, resolved, targetName,
    fieldValue(occurrence, profile.pairRightRole),
  );
  if (left.kind === "pending" || right.kind === "pending") {
    return Object.freeze({ kind: "pending" });
  }
  if (left.kind === "self" && right.kind === "self") {
    return Object.freeze({ kind: "link", value: memory.ensureRoot() });
  }
  if (left.kind === "self" && right.kind === "link") {
    return Object.freeze({
      kind: "link",
      value: memory.ensureStartSelfClosed(right.value),
    });
  }
  if (left.kind === "link" && right.kind === "self") {
    return Object.freeze({
      kind: "link",
      value: memory.ensureEndSelfClosed(left.value),
    });
  }
  if (left.kind === "link" && right.kind === "link") {
    return Object.freeze({
      kind: "link",
      value: memory.ensure(left.value, right.value),
    });
  }
  return fail("unsupported-expression");
}

export function materializeV015LinkDefinitions(
  memory: WriteMemory,
  basis: RootBasis,
  grammarRoot: LinkHandle,
  sourceNamespaceProfileRoot: LinkHandle,
  definitionProfileRoot: LinkHandle,
  syntaxAset: LinkHandle,
): V015LinkDefinitionRead {
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
        const candidate = materializeExpression(
          memory,
          verified,
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
