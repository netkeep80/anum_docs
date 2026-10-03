import { materializeExactSequence, readExactSequence } from "./exact-sequence.js";
import {
  admitStructuralDerivationRule,
  defineStructuralDerivationRule,
  readStructuralDerivationRule,
} from "./derivation.js";
import {
  materializeHeterogeneousDerivedClosedRootedDischarge,
} from "./derived-derivation-heterogeneous-discharge-materialize.js";
import {
  materializeHeterogeneousDerivedOpenRootedExpansion,
} from "./derived-derivation-heterogeneous-expansion.js";
import {
  replayStructuralHeterogeneousDerivedDerivationSchema,
  type StructuralHeterogeneousDerivedDerivationEvidence,
} from "./derived-derivation-heterogeneous.js";
import {
  type LinkHandle,
  type RootBasis,
  type WriteMemory,
} from "./memory.js";
import { readNativeSyntaxGrammar } from "./native-syntax-grammar.js";
import {
  admitStructuralRule,
  defineStructuralRoleDictionary,
  defineStructuralRule,
  readStructuralRule,
} from "./structural-rule.js";
import {
  readSyntaxAset,
  type SyntaxAsetKindRule,
  type SyntaxAsetOccurrence,
} from "./syntax-aset-contract.js";

export type V015ProofFormErrorCode =
  | "invalid-profile"
  | "incompatible-profile"
  | "invalid-source"
  | "unexpected-form"
  | "invalid-reference"
  | "cyclic-source";

export class V015ProofFormError extends Error {
  override readonly name = "V015ProofFormError";
  constructor(readonly code: V015ProofFormErrorCode) { super(code); }
}

export interface V015ProofFormProfile {
  readonly dictionaryForm: LinkHandle;
  readonly ruleForm: LinkHandle;
  readonly derivationForm: LinkHandle;
  readonly mappingForm: LinkHandle;
  readonly morphismForm: LinkHandle;
  readonly genericForm: LinkHandle;
  readonly bindingForm: LinkHandle;
  readonly openForm: LinkHandle;
  readonly primitiveForm: LinkHandle;
  readonly coordinateForm: LinkHandle;
  readonly dischargeForm: LinkHandle;

  readonly dictionaryRole: LinkHandle;
  readonly ruleDictionaryRole: LinkHandle;
  readonly ruleBodyRole: LinkHandle;
  readonly derivationRuleRole: LinkHandle;
  readonly derivationPremiseRole: LinkHandle;
  readonly mappingSourceRole: LinkHandle;
  readonly mappingTargetRole: LinkHandle;
  readonly morphismTheoryRole: LinkHandle;
  readonly morphismSourceRole: LinkHandle;
  readonly morphismTargetRole: LinkHandle;
  readonly morphismBindingRole: LinkHandle;
  readonly genericTargetDerivationRole: LinkHandle;
  readonly genericTheoryRole: LinkHandle;
  readonly genericLocalDerivationRole: LinkHandle;
  readonly genericMorphismRole: LinkHandle;
  readonly bindingRoleRole: LinkHandle;
  readonly bindingValueRole: LinkHandle;
  readonly openGenericRole: LinkHandle;
  readonly openBindingRole: LinkHandle;
  readonly primitiveTheoryRole: LinkHandle;
  readonly primitiveClaimRole: LinkHandle;
  readonly coordinateClaimRole: LinkHandle;
  readonly coordinateProofRole: LinkHandle;
  readonly dischargeOpenRole: LinkHandle;
  readonly dischargeCoordinateRole: LinkHandle;
}

export interface V015ProofFormMaterializeResult {
  readonly closedRoot: LinkHandle;
}

function fail(code: V015ProofFormErrorCode): never {
  throw new V015ProofFormError(code);
}

const profileKeys = [
  "dictionaryForm", "ruleForm", "derivationForm", "mappingForm", "morphismForm",
  "genericForm", "bindingForm", "openForm", "primitiveForm", "coordinateForm",
  "dischargeForm", "dictionaryRole", "ruleDictionaryRole", "ruleBodyRole",
  "derivationRuleRole", "derivationPremiseRole", "mappingSourceRole",
  "mappingTargetRole", "morphismTheoryRole", "morphismSourceRole",
  "morphismTargetRole", "morphismBindingRole", "genericTargetDerivationRole",
  "genericTheoryRole", "genericLocalDerivationRole", "genericMorphismRole",
  "bindingRoleRole", "bindingValueRole", "openGenericRole", "openBindingRole",
  "primitiveTheoryRole", "primitiveClaimRole", "coordinateClaimRole",
  "coordinateProofRole", "dischargeOpenRole", "dischargeCoordinateRole",
] as const;

export function materializeV015ProofFormProfile(
  memory: WriteMemory,
  profile: V015ProofFormProfile,
): LinkHandle {
  return materializeExactSequence(memory, profileKeys.map((key) => profile[key]));
}

export function readV015ProofFormProfile(
  memory: WriteMemory,
  root: LinkHandle,
): V015ProofFormProfile {
  let values: readonly LinkHandle[];
  try { values = readExactSequence(memory, root).values; }
  catch { return fail("invalid-profile"); }
  if (values.length !== profileKeys.length) fail("invalid-profile");
  const out: Partial<Record<(typeof profileKeys)[number], LinkHandle>> = {};
  profileKeys.forEach((key, index) => { out[key] = values[index]; });
  for (const key of profileKeys) if (out[key] === undefined) fail("invalid-profile");
  const forms = profileKeys.slice(0, 11).map((key) => out[key]!);
  if (new Set(forms).size !== forms.length) fail("invalid-profile");
  return Object.freeze(out as unknown as V015ProofFormProfile);
}

function fields(
  occurrence: SyntaxAsetOccurrence,
  role: LinkHandle,
): readonly LinkHandle[] {
  return occurrence.fields
    .filter((field) => field.role === role)
    .map((field) => field.value);
}

function one(occurrence: SyntaxAsetOccurrence, role: LinkHandle): LinkHandle {
  const values = fields(occurrence, role);
  if (values.length !== 1) fail("invalid-source");
  return values[0]!;
}

function expectRule(
  rules: readonly SyntaxAsetKindRule[],
  form: LinkHandle,
  expected: readonly Readonly<{
    role: LinkHandle;
    target: "child" | "carrier";
    min: number;
    max: number | null;
  }>[],
): void {
  const rule = rules.find((candidate) => candidate.kind === form);
  if (rule === undefined || rule.fields.length !== expected.length) {
    fail("incompatible-profile");
  }
  expected.forEach((want, index) => {
    const actual = rule.fields[index];
    if (
      actual === undefined
      || actual.role !== want.role
      || actual.target !== want.target
      || actual.min !== want.min
      || actual.max !== want.max
    ) fail("incompatible-profile");
  });
}

function validateProfile(
  rules: readonly SyntaxAsetKindRule[],
  p: V015ProofFormProfile,
): void {
  const c = (role: LinkHandle, min = 1, max: number | null = 1) =>
    ({ role, target: "carrier" as const, min, max });
  const h = (role: LinkHandle, min = 1, max: number | null = 1) =>
    ({ role, target: "child" as const, min, max });
  expectRule(rules, p.dictionaryForm, [c(p.dictionaryRole, 0, null)]);
  expectRule(rules, p.ruleForm, [h(p.ruleDictionaryRole), c(p.ruleBodyRole)]);
  expectRule(rules, p.derivationForm, [
    h(p.derivationRuleRole), c(p.derivationPremiseRole, 0, null),
  ]);
  expectRule(rules, p.mappingForm, [c(p.mappingSourceRole), c(p.mappingTargetRole)]);
  expectRule(rules, p.morphismForm, [
    c(p.morphismTheoryRole), h(p.morphismSourceRole), h(p.morphismTargetRole),
    h(p.morphismBindingRole, 0, null),
  ]);
  expectRule(rules, p.genericForm, [
    h(p.genericTargetDerivationRole), c(p.genericTheoryRole),
    h(p.genericLocalDerivationRole), h(p.genericMorphismRole),
  ]);
  expectRule(rules, p.bindingForm, [c(p.bindingRoleRole), c(p.bindingValueRole)]);
  expectRule(rules, p.openForm, [h(p.openGenericRole), h(p.openBindingRole, 0, null)]);
  expectRule(rules, p.primitiveForm, [c(p.primitiveTheoryRole), c(p.primitiveClaimRole)]);
  expectRule(rules, p.coordinateForm, [c(p.coordinateClaimRole), h(p.coordinateProofRole)]);
  expectRule(rules, p.dischargeForm, [
    h(p.dischargeOpenRole), h(p.dischargeCoordinateRole, 0, null),
  ]);
}

type Built =
  | Readonly<{ kind: "dictionary"; handle: LinkHandle }>
  | Readonly<{ kind: "rule"; handle: LinkHandle }>
  | Readonly<{ kind: "derivation"; handle: LinkHandle }>
  | Readonly<{ kind: "mapping"; source: LinkHandle; target: LinkHandle }>
  | Readonly<{ kind: "morphism"; handle: LinkHandle }>
  | Readonly<{ kind: "generic"; evidence: StructuralHeterogeneousDerivedDerivationEvidence }>
  | Readonly<{ kind: "binding"; role: LinkHandle; value: LinkHandle }>
  | Readonly<{ kind: "open"; generic: StructuralHeterogeneousDerivedDerivationEvidence; root: LinkHandle }>
  | Readonly<{ kind: "primitive"; claim: LinkHandle; occurrence: LinkHandle }>
  | Readonly<{ kind: "coordinate"; claim: LinkHandle; occurrence: LinkHandle }>
  | Readonly<{ kind: "closed"; root: LinkHandle }>;

function asKind<T extends Built["kind"]>(
  value: Built,
  kind: T,
): Extract<Built, { kind: T }> {
  if (value.kind !== kind) fail("invalid-reference");
  return value as Extract<Built, { kind: T }>;
}

export function materializeV015ProofSource(
  memory: WriteMemory,
  basis: RootBasis,
  grammarRoot: LinkHandle,
  profileRoot: LinkHandle,
  sourceRoot: LinkHandle,
): V015ProofFormMaterializeResult {
  const grammar = readNativeSyntaxGrammar(memory, basis, grammarRoot);
  const profile = readV015ProofFormProfile(memory, profileRoot);
  validateProfile(grammar.vocabulary.rules, profile);
  const source = readSyntaxAset(memory, sourceRoot, grammar.vocabulary);
  const byOccurrence = new Map(source.occurrences.map((entry) => [entry.occurrence, entry]));
  const memo = new Map<LinkHandle, Built>();
  const active = new Set<LinkHandle>();

  const build = (handle: LinkHandle): Built => {
    const cached = memo.get(handle);
    if (cached !== undefined) return cached;
    if (active.has(handle)) fail("cyclic-source");
    const occurrence = byOccurrence.get(handle);
    if (occurrence === undefined) fail("invalid-reference");
    active.add(handle);
    try {
      let built: Built;
      if (occurrence.kind === profile.dictionaryForm) {
        built = Object.freeze({
          kind: "dictionary",
          handle: defineStructuralRoleDictionary(memory, fields(occurrence, profile.dictionaryRole)),
        });
      } else if (occurrence.kind === profile.ruleForm) {
        const dictionary = asKind(build(one(occurrence, profile.ruleDictionaryRole)), "dictionary");
        built = Object.freeze({
          kind: "rule",
          handle: defineStructuralRule(memory, dictionary.handle, one(occurrence, profile.ruleBodyRole)),
        });
      } else if (occurrence.kind === profile.derivationForm) {
        const rule = asKind(build(one(occurrence, profile.derivationRuleRole)), "rule");
        built = Object.freeze({
          kind: "derivation",
          handle: defineStructuralDerivationRule(
            memory,
            rule.handle,
            fields(occurrence, profile.derivationPremiseRole),
          ),
        });
      } else if (occurrence.kind === profile.mappingForm) {
        built = Object.freeze({
          kind: "mapping",
          source: one(occurrence, profile.mappingSourceRole),
          target: one(occurrence, profile.mappingTargetRole),
        });
      } else if (occurrence.kind === profile.morphismForm) {
        const sourceDictionary = asKind(build(one(occurrence, profile.morphismSourceRole)), "dictionary");
        const targetDictionary = asKind(build(one(occurrence, profile.morphismTargetRole)), "dictionary");
        const mappings = fields(occurrence, profile.morphismBindingRole)
          .map((entry) => asKind(build(entry), "mapping"));
        built = Object.freeze({
          kind: "morphism",
          handle: materializeExactSequence(memory, [
            one(occurrence, profile.morphismTheoryRole),
            sourceDictionary.handle,
            targetDictionary.handle,
            materializeExactSequence(
              memory,
              mappings.map((entry) => memory.ensure(entry.source, entry.target)),
            ),
          ]),
        });
      } else if (occurrence.kind === profile.genericForm) {
        const targetDR = asKind(build(one(occurrence, profile.genericTargetDerivationRole)), "derivation");
        const localDR = asKind(build(one(occurrence, profile.genericLocalDerivationRole)), "derivation");
        const morphism = asKind(build(one(occurrence, profile.genericMorphismRole)), "morphism");
        const theory = one(occurrence, profile.genericTheoryRole);
        const localSchema = readStructuralDerivationRule(memory, localDR.handle);
        admitStructuralRule(memory, theory, localSchema.structuralRule);
        admitStructuralDerivationRule(memory, theory, localDR.handle);
        const targetSchema = readStructuralDerivationRule(memory, targetDR.handle);
        const targetRule = readStructuralRule(memory, targetSchema.structuralRule);
        const identity = memory.ensure(targetDR.handle, theory);
        const dependencies = targetSchema.premiseTemplates.map((premise) =>
          memory.ensure(premise, identity)
        );
        const targetOccurrence = memory.ensure(
          targetRule.body,
          memory.ensure(
            localDR.handle,
            memory.ensure(morphism.handle, materializeExactSequence(memory, dependencies)),
          ),
        );
        const evidence = Object.freeze({ identity, targetOccurrence });
        replayStructuralHeterogeneousDerivedDerivationSchema(memory, evidence);
        built = Object.freeze({ kind: "generic", evidence });
      } else if (occurrence.kind === profile.bindingForm) {
        built = Object.freeze({
          kind: "binding",
          role: one(occurrence, profile.bindingRoleRole),
          value: one(occurrence, profile.bindingValueRole),
        });
      } else if (occurrence.kind === profile.openForm) {
        const generic = asKind(build(one(occurrence, profile.openGenericRole)), "generic");
        const bindings = fields(occurrence, profile.openBindingRole)
          .map((entry) => asKind(build(entry), "binding"));
        const root = materializeHeterogeneousDerivedOpenRootedExpansion(
          memory,
          generic.evidence,
          bindings.map(({ role, value }) => ({ role, value })),
        ).concreteRoot;
        built = Object.freeze({ kind: "open", generic: generic.evidence, root });
      } else if (occurrence.kind === profile.primitiveForm) {
        const theory = one(occurrence, profile.primitiveTheoryRole);
        const claim = one(occurrence, profile.primitiveClaimRole);
        const dictionary = defineStructuralRoleDictionary(memory, []);
        const rule = defineStructuralRule(memory, dictionary, claim);
        const dr = defineStructuralDerivationRule(memory, rule, []);
        admitStructuralRule(memory, theory, rule);
        admitStructuralDerivationRule(memory, theory, dr);
        built = Object.freeze({
          kind: "primitive",
          claim,
          occurrence: memory.ensure(claim, memory.ensure(dr, materializeExactSequence(memory, []))),
        });
      } else if (occurrence.kind === profile.coordinateForm) {
        const proof = asKind(build(one(occurrence, profile.coordinateProofRole)), "primitive");
        const claim = one(occurrence, profile.coordinateClaimRole);
        if (proof.claim !== claim) fail("invalid-reference");
        built = Object.freeze({ kind: "coordinate", claim, occurrence: proof.occurrence });
      } else if (occurrence.kind === profile.dischargeForm) {
        const open = asKind(build(one(occurrence, profile.dischargeOpenRole)), "open");
        const coordinates = fields(occurrence, profile.dischargeCoordinateRole)
          .map((entry) => asKind(build(entry), "coordinate"));
        const openIdentity = memory.poles(open.root).start;
        const closed = materializeHeterogeneousDerivedClosedRootedDischarge(
          memory,
          { generic: open.generic, concreteRoot: open.root },
          coordinates.map((entry) => ({
            assumptionOccurrence: memory.ensure(entry.claim, openIdentity),
            proofOccurrence: entry.occurrence,
          })),
        ).closedRoot;
        built = Object.freeze({ kind: "closed", root: closed });
      } else {
        return fail("unexpected-form");
      }
      memo.set(handle, built);
      return built;
    } finally {
      active.delete(handle);
    }
  };

  const result = asKind(build(source.root), "closed");
  return Object.freeze({ closedRoot: result.root });
}
