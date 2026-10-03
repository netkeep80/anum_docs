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
import {
  readSyntaxAset,
  type SyntaxAsetFieldRule,
  type SyntaxAsetKindRule,
  type SyntaxAsetRead,
  type SyntaxAsetTargetClass,
  type SyntaxAsetVocabulary,
} from "./syntax-aset-contract.js";

export type NativeSyntaxGrammarErrorCode =
  | "invalid-root-basis"
  | "invalid-grammar-envelope"
  | "invalid-grammar-header"
  | "invalid-rule"
  | "duplicate-form-rule"
  | "duplicate-role-rule"
  | "invalid-target-class"
  | "invalid-cardinality"
  | "invalid-cardinality-order";

export class NativeSyntaxGrammarError extends Error {
  override readonly name = "NativeSyntaxGrammarError";

  constructor(readonly code: NativeSyntaxGrammarErrorCode) {
    super(code);
  }
}

export interface NativeSyntaxGrammarFieldSpec {
  readonly role: LinkHandle;
  readonly target: SyntaxAsetTargetClass;
  readonly min: number;
  readonly max: number | null;
}

export interface NativeSyntaxGrammarRuleSpec {
  readonly form: LinkHandle;
  readonly fields: readonly NativeSyntaxGrammarFieldSpec[];
}

export interface NativeSyntaxGrammarMaterializeOptions {
  readonly syntaxTag: LinkHandle;
  /**
   * Caller-owned structural seed used only to derive three local representation
   * markers carried inside the Grammar header. The seed is not a global kind or
   * semantic name.
   */
  readonly markerSeed: LinkHandle;
  readonly rules: readonly NativeSyntaxGrammarRuleSpec[];
}

export interface NativeSyntaxGrammarRead {
  readonly root: LinkHandle;
  readonly syntaxTag: LinkHandle;
  readonly childTargetMarker: LinkHandle;
  readonly carrierTargetMarker: LinkHandle;
  readonly unboundedMaxMarker: LinkHandle;
  /**
   * Derived host read/cache only. The selected Grammar root is authoritative.
   */
  readonly vocabulary: SyntaxAsetVocabulary;
}

function fail(code: NativeSyntaxGrammarErrorCode): never {
  throw new NativeSyntaxGrammarError(code);
}

function validHostCardinality(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function requireRootBasis(memory: ReadMemory, basis: RootBasis): RootBasis {
  try {
    return verifyRootBasis(memory, basis);
  } catch {
    return fail("invalid-root-basis");
  }
}

function materializeNat(
  memory: WriteMemory,
  basis: RootBasis,
  value: number,
): LinkHandle {
  if (!validHostCardinality(value)) fail("invalid-cardinality");
  let current = basis.U;
  for (let index = 0; index < value; index += 1) {
    current = memory.ensure(current, basis.L);
  }
  return current;
}

function readNat(
  memory: ReadMemory,
  basis: RootBasis,
  carrier: LinkHandle,
): number {
  let current = carrier;
  let value = 0;
  const visited = new Set<LinkHandle>();

  try {
    while (current !== basis.U) {
      if (visited.has(current)) fail("invalid-cardinality");
      visited.add(current);
      const poles = memory.poles(current);
      if (poles.end !== basis.L) fail("invalid-cardinality");
      current = poles.start;
      value += 1;
      if (!Number.isSafeInteger(value)) fail("invalid-cardinality");
    }
  } catch (error) {
    if (error instanceof NativeSyntaxGrammarError) throw error;
    if (error instanceof MemoryError) return fail("invalid-cardinality");
    throw error;
  }

  return value;
}

function isNat(
  memory: ReadMemory,
  basis: RootBasis,
  carrier: LinkHandle,
): boolean {
  try {
    readNat(memory, basis, carrier);
    return true;
  } catch (error) {
    if (
      error instanceof NativeSyntaxGrammarError &&
      error.code === "invalid-cardinality"
    ) {
      return false;
    }
    throw error;
  }
}

function exactValues(
  memory: ReadMemory,
  carrier: LinkHandle,
  code: NativeSyntaxGrammarErrorCode,
): readonly LinkHandle[] {
  try {
    return readExactSequence(memory, carrier).values;
  } catch (error) {
    if (error instanceof ExactSequenceError || error instanceof MemoryError) {
      return fail(code);
    }
    throw error;
  }
}

function validateMaterializeSpec(
  options: NativeSyntaxGrammarMaterializeOptions,
): void {
  const forms = new Set<LinkHandle>();
  for (const rule of options.rules) {
    if (forms.has(rule.form)) fail("duplicate-form-rule");
    forms.add(rule.form);

    const roles = new Set<LinkHandle>();
    for (const field of rule.fields) {
      if (roles.has(field.role)) fail("duplicate-role-rule");
      roles.add(field.role);
      if (!validHostCardinality(field.min)) fail("invalid-cardinality");
      if (field.max !== null) {
        if (!validHostCardinality(field.max)) fail("invalid-cardinality");
        if (field.max < field.min) fail("invalid-cardinality-order");
      }
      if (field.target !== "child" && field.target !== "carrier") {
        return fail("invalid-target-class");
      }
    }
  }
}

export function materializeNativeSyntaxGrammar(
  memory: WriteMemory,
  basis: RootBasis,
  options: NativeSyntaxGrammarMaterializeOptions,
): LinkHandle {
  const verified = requireRootBasis(memory, basis);
  validateMaterializeSpec(options);

  if (options.markerSeed === memory.root) {
    return fail("invalid-grammar-header");
  }

  const markerScope = memory.ensure(options.markerSeed, options.markerSeed);
  const childTargetMarker = memory.ensureStartSelfClosed(markerScope);
  const carrierTargetMarker = memory.ensureEndSelfClosed(markerScope);
  const unboundedMaxMarker = memory.ensure(markerScope, childTargetMarker);

  const headerValues = [
    options.syntaxTag,
    childTargetMarker,
    carrierTargetMarker,
    unboundedMaxMarker,
  ] as const;
  if (new Set<LinkHandle>(headerValues).size !== headerValues.length) {
    return fail("invalid-grammar-header");
  }
  if (isNat(memory, verified, unboundedMaxMarker)) {
    return fail("invalid-grammar-header");
  }

  const ruleLinks = options.rules.map((rule) => {
    const fieldRuleLinks = rule.fields.map((field) => {
      const targetMarker =
        field.target === "child" ? childTargetMarker : carrierTargetMarker;
      const min = materializeNat(memory, verified, field.min);
      const max =
        field.max === null
          ? unboundedMaxMarker
          : materializeNat(memory, verified, field.max);
      const specification = materializeExactSequence(memory, [
        targetMarker,
        min,
        max,
      ]);
      return memory.ensure(field.role, specification);
    });
    return memory.ensure(
      rule.form,
      materializeExactSequence(memory, fieldRuleLinks),
    );
  });

  const header = materializeExactSequence(memory, headerValues);
  const rules = materializeExactSequence(memory, ruleLinks);
  const root = memory.ensure(header, rules);

  // The producer is convenience only; the emitted structural Grammar must pass
  // the same trusted reader that downstream consumers use.
  readNativeSyntaxGrammar(memory, verified, root);
  return root;
}

export function readNativeSyntaxGrammar(
  memory: ReadMemory,
  basis: RootBasis,
  root: LinkHandle,
): NativeSyntaxGrammarRead {
  const verified = requireRootBasis(memory, basis);

  let headerCarrier: LinkHandle;
  let ruleSequenceCarrier: LinkHandle;
  try {
    const poles = memory.poles(root);
    headerCarrier = poles.start;
    ruleSequenceCarrier = poles.end;
  } catch (error) {
    if (error instanceof MemoryError) return fail("invalid-grammar-envelope");
    throw error;
  }

  const header = exactValues(
    memory,
    headerCarrier,
    "invalid-grammar-header",
  );
  if (header.length !== 4) fail("invalid-grammar-header");

  const syntaxTag = header[0];
  const childTargetMarker = header[1];
  const carrierTargetMarker = header[2];
  const unboundedMaxMarker = header[3];
  if (
    syntaxTag === undefined ||
    childTargetMarker === undefined ||
    carrierTargetMarker === undefined ||
    unboundedMaxMarker === undefined ||
    new Set(header).size !== header.length
  ) {
    return fail("invalid-grammar-header");
  }
  if (isNat(memory, verified, unboundedMaxMarker)) {
    return fail("invalid-grammar-header");
  }

  const ruleLinks = exactValues(
    memory,
    ruleSequenceCarrier,
    "invalid-grammar-envelope",
  );
  const forms = new Set<LinkHandle>();
  const knownRoles: LinkHandle[] = [];
  const knownRoleSet = new Set<LinkHandle>();
  const childRoles: LinkHandle[] = [];
  const childRoleSet = new Set<LinkHandle>();
  const rules: SyntaxAsetKindRule[] = [];

  for (const ruleLink of ruleLinks) {
    let form: LinkHandle;
    let fieldSequence: LinkHandle;
    try {
      const poles = memory.poles(ruleLink);
      form = poles.start;
      fieldSequence = poles.end;
    } catch (error) {
      if (error instanceof MemoryError) return fail("invalid-rule");
      throw error;
    }
    if (forms.has(form)) fail("duplicate-form-rule");
    forms.add(form);

    const fieldLinks = exactValues(memory, fieldSequence, "invalid-rule");
    const roleSet = new Set<LinkHandle>();
    const fields: SyntaxAsetFieldRule[] = [];

    for (const fieldLink of fieldLinks) {
      let role: LinkHandle;
      let specification: LinkHandle;
      try {
        const poles = memory.poles(fieldLink);
        role = poles.start;
        specification = poles.end;
      } catch (error) {
        if (error instanceof MemoryError) return fail("invalid-rule");
        throw error;
      }

      if (roleSet.has(role)) fail("duplicate-role-rule");
      roleSet.add(role);
      if (!knownRoleSet.has(role)) {
        knownRoleSet.add(role);
        knownRoles.push(role);
      }

      const spec = exactValues(memory, specification, "invalid-rule");
      if (spec.length !== 3) fail("invalid-rule");
      const targetMarker = spec[0];
      const minCarrier = spec[1];
      const maxCarrier = spec[2];
      if (
        targetMarker === undefined ||
        minCarrier === undefined ||
        maxCarrier === undefined
      ) {
        return fail("invalid-rule");
      }

      let target: SyntaxAsetTargetClass;
      if (targetMarker === childTargetMarker) {
        target = "child";
      } else if (targetMarker === carrierTargetMarker) {
        target = "carrier";
      } else {
        return fail("invalid-target-class");
      }

      const min = readNat(memory, verified, minCarrier);
      const max =
        maxCarrier === unboundedMaxMarker
          ? null
          : readNat(memory, verified, maxCarrier);
      if (max !== null && max < min) {
        return fail("invalid-cardinality-order");
      }

      if (target === "child" && !childRoleSet.has(role)) {
        childRoleSet.add(role);
        childRoles.push(role);
      }
      fields.push(Object.freeze({ role, target, min, max }));
    }

    rules.push(Object.freeze({
      kind: form,
      fields: Object.freeze(fields),
    }));
  }

  const vocabulary: SyntaxAsetVocabulary = Object.freeze({
    tag: syntaxTag,
    knownRoles: Object.freeze(knownRoles),
    rules: Object.freeze(rules),
    childRoles: Object.freeze(childRoles),
  });

  return Object.freeze({
    root,
    syntaxTag,
    childTargetMarker,
    carrierTargetMarker,
    unboundedMaxMarker,
    vocabulary,
  });
}

export function readSyntaxAsetWithNativeGrammar(
  memory: ReadMemory,
  basis: RootBasis,
  grammarRoot: LinkHandle,
  syntaxAset: LinkHandle,
): SyntaxAsetRead {
  const grammar = readNativeSyntaxGrammar(memory, basis, grammarRoot);
  return readSyntaxAset(memory, syntaxAset, grammar.vocabulary);
}
