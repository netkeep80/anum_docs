import {
  buildSelectedSourceEvidence,
  defineSourceForm,
  materializeSourceContent,
  replaySelectedSourceEvidence,
  type SourceFrontEndEvidence,
} from "../src/source.js";
import {
  defineDictionaryEffect,
  defineDictionaryScope,
} from "../src/dictionary.js";
import {
  materializeExactSequence,
  readExactSequence,
} from "../src/exact-sequence.js";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
  type LinkPoles,
  type ReadMemory,
  type WriteMemory,
} from "../src/memory.js";
import {
  admitStructuralRule,
  defineStructuralRoleDictionary,
  defineStructuralRule,
  matchStructuralTemplate,
  readStructuralRoleDictionary,
  readStructuralRule,
  verifyStructuralRuleAdmission,
  type StructuralRoleBinding,
} from "../src/structural-rule.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`AR6 integrated probe: ${message}`);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}

class IntegratedError extends Error {
  override readonly name = "IntegratedError";
}

interface RevisionState {
  readonly parent: LinkHandle;
  readonly history: LinkHandle;
}

interface RevisionEffect {
  readonly fact: LinkHandle;
  readonly occurrence: LinkHandle;
  readonly afterRevision: LinkHandle;
}

interface ContextSnapshot {
  readonly parent: LinkHandle;
  readonly current: LinkHandle;
  readonly bindingHistory: LinkHandle;
}

interface FixedAuthority {
  readonly dictionary: LinkHandle;
  readonly grammar: LinkHandle;
  readonly theory: LinkHandle;
  readonly supportRevision: LinkHandle;
  readonly context: LinkHandle;
}

interface IntegratedEvidence {
  readonly source: SourceFrontEndEvidence;
  readonly entry: LinkHandle;
  readonly useRule: LinkHandle;
  readonly useFact: LinkHandle;
  readonly useOccurrence: LinkHandle;
  readonly ruleAdmission: LinkHandle;
  readonly target: LinkHandle;
}

type TemplateMatcher = (
  memory: ReadMemory,
  template: LinkHandle,
  claimed: LinkHandle,
  bindings: readonly StructuralRoleBinding[],
) => void;

function anchors(memory: Memory, count: number): readonly LinkHandle[] {
  const result: LinkHandle[] = [];
  let current = ensureRootBasis(memory).C;
  for (let index = 0; index < count; index += 1) {
    current = memory.ensureStartSelfClosed(current);
    result.push(current);
  }
  return Object.freeze(result);
}

function defineRevision(
  memory: WriteMemory,
  parent: LinkHandle,
  history: LinkHandle,
): LinkHandle {
  return memory.ensureStartSelfClosed(memory.ensure(parent, history));
}

function readRevision(memory: ReadMemory, revision: LinkHandle): RevisionState {
  const wrapper = memory.poles(revision);
  if (wrapper.start !== revision || wrapper.end === revision) {
    throw new IntegratedError("invalid revision wrapper");
  }
  const payload = memory.poles(wrapper.end);
  return Object.freeze({ parent: payload.start, history: payload.end });
}

function appendRevisionFact(
  memory: WriteMemory,
  beforeRevision: LinkHandle,
  fact: LinkHandle,
): RevisionEffect {
  const before = readRevision(memory, beforeRevision);
  const occurrence = memory.ensure(beforeRevision, fact);
  const historyAfter = memory.ensure(before.history, occurrence);
  const afterRevision = defineRevision(memory, before.parent, historyAfter);
  return Object.freeze({ fact, occurrence, afterRevision });
}

function verifyRevisionOccurrence(
  memory: ReadMemory,
  selectedRevision: LinkHandle,
  expectedOccurrence: LinkHandle,
  expectedFact: LinkHandle,
): void {
  const selected = readRevision(memory, selectedRevision);
  const visited = new Set<LinkHandle>();
  let history = selected.history;
  while (history !== memory.root) {
    if (visited.has(history)) throw new IntegratedError("revision history cycle");
    visited.add(history);
    const cell = memory.poles(history);
    const previousHistory = cell.start;
    const occurrence = cell.end;
    const occurrencePoles = memory.poles(occurrence);
    const beforeRevision = occurrencePoles.start;
    const fact = occurrencePoles.end;
    const before = readRevision(memory, beforeRevision);
    if (before.parent !== selected.parent || before.history !== previousHistory) {
      throw new IntegratedError("invalid revision predecessor");
    }
    if (occurrence === expectedOccurrence && fact === expectedFact) return;
    history = previousHistory;
  }
  throw new IntegratedError("fact outside selected revision");
}

function defineSupportRevision(
  memory: WriteMemory,
  admissions: readonly LinkHandle[],
): LinkHandle {
  if (new Set(admissions).size !== admissions.length) {
    throw new IntegratedError("duplicate support admission");
  }
  return memory.ensureStartSelfClosed(materializeExactSequence(memory, admissions));
}

function requireSupportAdmission(
  memory: ReadMemory,
  supportRevision: LinkHandle,
  admission: LinkHandle,
): void {
  const wrapper = memory.poles(supportRevision);
  if (wrapper.start !== supportRevision || wrapper.end === supportRevision) {
    throw new IntegratedError("invalid support revision");
  }
  if (!readExactSequence(memory, wrapper.end).values.includes(admission)) {
    throw new IntegratedError("admission outside fixed support");
  }
}

function defineContextSnapshot(
  memory: WriteMemory,
  parent: LinkHandle,
  current: LinkHandle,
  bindingHistory: LinkHandle,
): LinkHandle {
  const frame = memory.ensure(parent, current);
  return memory.ensureStartSelfClosed(memory.ensure(frame, bindingHistory));
}

function readContextSnapshot(memory: ReadMemory, context: LinkHandle): ContextSnapshot {
  const wrapper = memory.poles(context);
  if (wrapper.start !== context || wrapper.end === context) {
    throw new IntegratedError("invalid context snapshot");
  }
  const payload = memory.poles(wrapper.end);
  const frame = memory.poles(payload.start);
  return Object.freeze({
    parent: frame.start,
    current: frame.end,
    bindingHistory: payload.end,
  });
}

function appendContextBinding(
  memory: WriteMemory,
  beforeContext: LinkHandle,
  role: LinkHandle,
  value: LinkHandle,
): LinkHandle {
  const before = readContextSnapshot(memory, beforeContext);
  const pair = memory.ensure(role, value);
  const occurrence = memory.ensure(beforeContext, pair);
  const historyAfter = memory.ensure(before.bindingHistory, occurrence);
  return defineContextSnapshot(memory, before.parent, before.current, historyAfter);
}

function bindingAtSnapshot(
  memory: ReadMemory,
  context: LinkHandle,
  role: LinkHandle,
): LinkHandle {
  const selected = readContextSnapshot(memory, context);
  const values: LinkHandle[] = [];
  const visited = new Set<LinkHandle>();
  let history = selected.bindingHistory;
  while (history !== memory.root) {
    if (visited.has(history)) throw new IntegratedError("binding history cycle");
    visited.add(history);
    const cell = memory.poles(history);
    const previousHistory = cell.start;
    const occurrence = memory.poles(cell.end);
    const beforeContext = occurrence.start;
    const pair = memory.poles(occurrence.end);
    const before = readContextSnapshot(memory, beforeContext);
    if (
      before.parent !== selected.parent ||
      before.current !== selected.current ||
      before.bindingHistory !== previousHistory
    ) {
      throw new IntegratedError("invalid binding predecessor");
    }
    if (pair.start === role) values.push(pair.end);
    history = previousHistory;
  }
  const unique = new Set(values);
  if (unique.size !== 1) {
    throw new IntegratedError(
      unique.size === 0 ? "missing contextual binding" : "contextual binding conflict",
    );
  }
  const value = values[0];
  if (value === undefined) throw new IntegratedError("missing contextual binding");
  return value;
}

/**
 * AR4 candidate folded into the integrated verifier. This is not a Pattern AST:
 * for every structural node whose descendants still contain roles, matching
 * preserves the two observable self-incidence facts of the Link itself.
 */
function matchOstensiveTemplate(
  memory: ReadMemory,
  template: LinkHandle,
  claimed: LinkHandle,
  bindings: readonly StructuralRoleBinding[],
): void {
  const rho = new Map<LinkHandle, LinkHandle>();
  for (const item of bindings) {
    if (rho.has(item.role)) throw new IntegratedError("duplicate role binding");
    rho.set(item.role, item.value);
  }

  const containsMemo = new Map<LinkHandle, boolean>();
  const containsActive = new Set<LinkHandle>();
  const visited = new Map<LinkHandle, Set<LinkHandle>>();

  const containsRole = (node: LinkHandle): boolean => {
    if (rho.has(node)) return true;
    const cached = containsMemo.get(node);
    if (cached !== undefined) return cached;
    if (containsActive.has(node)) return false;
    containsActive.add(node);
    try {
      const poles = memory.poles(node);
      const result = containsRole(poles.start) || containsRole(poles.end);
      containsMemo.set(node, result);
      return result;
    } finally {
      containsActive.delete(node);
    }
  };

  const markVisited = (left: LinkHandle, right: LinkHandle): boolean => {
    let rights = visited.get(left);
    if (rights === undefined) {
      rights = new Set<LinkHandle>();
      visited.set(left, rights);
    }
    if (rights.has(right)) return true;
    rights.add(right);
    return false;
  };

  const match = (left: LinkHandle, right: LinkHandle): void => {
    const replacement = rho.get(left);
    if (replacement !== undefined) {
      if (replacement !== right) throw new IntegratedError("role binding mismatch");
      return;
    }

    if (!containsRole(left)) {
      if (left !== right) throw new IntegratedError("grounded template mismatch");
      return;
    }

    const leftPoles = memory.poles(left);
    const rightPoles = memory.poles(right);
    if (
      (leftPoles.start === left) !== (rightPoles.start === right) ||
      (leftPoles.end === left) !== (rightPoles.end === right)
    ) {
      throw new IntegratedError("ostensive self-incidence mismatch");
    }

    if (markVisited(left, right)) return;
    match(leftPoles.start, rightPoles.start);
    match(leftPoles.end, rightPoles.end);
  };

  match(template, claimed);
}

function verifyIntegratedWithMatcher(
  memory: ReadMemory,
  authority: FixedAuthority,
  evidence: IntegratedEvidence,
  matcher: TemplateMatcher,
): LinkHandle {
  const before = memory.linkCount;
  if (
    evidence.source.dictionary !== authority.dictionary ||
    evidence.source.grammar !== authority.grammar ||
    evidence.source.theory !== authority.theory
  ) {
    throw new IntegratedError("source authority roots mismatch");
  }

  const entries = replaySelectedSourceEvidence(memory, evidence.source);
  if (entries.length !== 1 || entries[0] !== evidence.entry) {
    throw new IntegratedError("source occurrence resolves another Entry");
  }
  requireSupportAdmission(memory, authority.supportRevision, evidence.source.grammarMembership);
  requireSupportAdmission(memory, authority.supportRevision, evidence.source.theoryMembership);

  const useFact = memory.poles(evidence.useFact);
  if (useFact.start !== evidence.entry || useFact.end !== evidence.useRule) {
    throw new IntegratedError("invalid Entry->Use fact");
  }
  verifyRevisionOccurrence(memory, authority.grammar, evidence.useOccurrence, evidence.useFact);

  requireSupportAdmission(memory, authority.supportRevision, evidence.ruleAdmission);
  verifyStructuralRuleAdmission(memory, authority.theory, evidence.useRule, evidence.ruleAdmission);
  const rule = readStructuralRule(memory, evidence.useRule);
  const roleDictionary = readStructuralRoleDictionary(memory, rule.roleDictionary);
  const bindings: readonly StructuralRoleBinding[] = Object.freeze(
    roleDictionary.roles.map((role) => Object.freeze({
      role,
      value: bindingAtSnapshot(memory, authority.context, role),
    })),
  );
  matcher(memory, rule.body, evidence.target, bindings);

  if (memory.linkCount !== before) throw new IntegratedError("integrated replay wrote to Memory");
  return evidence.target;
}

function verifyIntegratedCurrent(
  memory: ReadMemory,
  authority: FixedAuthority,
  evidence: IntegratedEvidence,
): LinkHandle {
  return verifyIntegratedWithMatcher(memory, authority, evidence, matchStructuralTemplate);
}

function verifyIntegratedCandidate(
  memory: ReadMemory,
  authority: FixedAuthority,
  evidence: IntegratedEvidence,
): LinkHandle {
  return verifyIntegratedWithMatcher(memory, authority, evidence, matchOstensiveTemplate);
}

function expectRejected(effect: () => unknown, message: string): void {
  try {
    effect();
  } catch {
    return;
  }
  throw new Error(`AR6 integrated probe: ${message}: expected rejection`);
}

class PoleOnlyProbe implements ReadMemory {
  constructor(private readonly source: ReadMemory) {}
  get root(): LinkHandle { return this.source.root; }
  get linkCount(): number { return this.source.linkCount; }
  poles(link: LinkHandle): LinkPoles { return this.source.poles(link); }
  find(): LinkHandle | undefined { throw new Error("AR6 replay forbids ambient find"); }
  outgoing(): readonly LinkHandle[] { throw new Error("AR6 replay forbids ambient outgoing"); }
  incoming(): readonly LinkHandle[] { throw new Error("AR6 replay forbids ambient incoming"); }
}

const memory = new Memory();
const basis = ensureRootBasis(memory);
const pool = anchors(memory, 14);
const bracketEntry = pool[0];
const grammarParent = pool[1];
const theory = pool[2];
const contextParent = pool[3];
const contextCurrent = pool[4];
const outsiderSeed = pool[5];
const mismatchedTheory = pool[6];
assert(
  bracketEntry !== undefined && grammarParent !== undefined && theory !== undefined &&
  contextParent !== undefined && contextCurrent !== undefined && outsiderSeed !== undefined &&
  mismatchedTheory !== undefined,
  "fixture anchors",
);

// Use is a rooted structural Rule carrying query shape and its open role list.
const roleSeed = memory.ensure(basis.L, basis.U);
const endRole = memory.ensureStartSelfClosed(roleSeed);
const startRootTemplate = memory.ensureStartSelfClosed(endRole); // ♂E
const roleDictionary = defineStructuralRoleDictionary(memory, [endRole]);
const useRule = defineStructuralRule(memory, roleDictionary, startRootTemplate);

// A second well-formed Rule is Grammar-visible but deliberately excluded from
// the fixed Theory support. This isolates F05 from Grammar selection.
const unsupportedRole = memory.ensureEndSelfClosed(outsiderSeed);
const unsupportedDictionary = defineStructuralRoleDictionary(memory, [unsupportedRole]);
const unsupportedTemplate = memory.ensureEndSelfClosed(unsupportedRole);
const unsupportedRule = defineStructuralRule(memory, unsupportedDictionary, unsupportedTemplate);

// Grammar authority explicitly admits Entry '[' -> both Rules. Which Rule may
// actually replay is still bounded by fixed Theory support below.
const grammarBase = defineRevision(memory, grammarParent, memory.root);
const useFact = memory.ensure(bracketEntry, useRule);
const useEffect = appendRevisionFact(memory, grammarBase, useFact);
const unsupportedUseFact = memory.ensure(bracketEntry, unsupportedRule);
const unsupportedUseEffect = appendRevisionFact(memory, useEffect.afterRevision, unsupportedUseFact);
const grammar = unsupportedUseEffect.afterRevision;

// Context authority explicitly binds E := R in a new immutable K revision.
const contextBase = defineContextSnapshot(memory, contextParent, contextCurrent, memory.root);
const context = appendContextBinding(memory, contextBase, endRole, basis.R);

// Exact faithful UTF-8 source occurrence '[' resolves only to EntryBracket.
const bracketBytes = new Uint8Array([0x5b]);
let dictionary = defineDictionaryScope(memory, memory.root, memory.root);
const dictionaryEffect = defineDictionaryEffect(
  memory,
  dictionary,
  memory.root,
  memory.root,
  materializeSourceContent(memory, bracketBytes),
  bracketEntry,
);
dictionary = dictionaryEffect.afterScope;
const source = defineSourceForm(memory, materializeSourceContent(memory, bracketBytes));
const sourceEvidence = buildSelectedSourceEvidence(
  memory,
  source,
  [{
    start: 0,
    end: 1,
    form: bracketEntry,
    dictionaryOccurrence: dictionaryEffect.occurrence,
  }],
  { dictionary, grammar, theory },
);

// Theory support is independently frozen as one exact rooted revision. The
// unsupported Rule may later be admitted to T ambiently, but this selected S
// does not contain that admission.
const ruleAdmission = admitStructuralRule(memory, theory, useRule);
const supportRevision = defineSupportRevision(memory, [
  sourceEvidence.grammarMembership,
  sourceEvidence.theoryMembership,
  ruleAdmission,
]);
const authority: FixedAuthority = Object.freeze({
  dictionary,
  grammar,
  theory,
  supportRevision,
  context,
});

const good: IntegratedEvidence = Object.freeze({
  source: sourceEvidence,
  entry: bracketEntry,
  useRule,
  useFact,
  useOccurrence: useEffect.occurrence,
  ruleAdmission,
  target: basis.O,
});
const wrongTarget: IntegratedEvidence = Object.freeze({ ...good, target: basis.R });

// RED witness retained as executable evidence: the current production matcher
// accepts both the intended O=♂R and the wrong but well-formed R=∞ under the
// exact same source and authority roots.
same(verifyIntegratedCurrent(memory, authority, good), basis.O, "current good result");
same(
  verifyIntegratedCurrent(memory, authority, wrongTarget),
  basis.R,
  "current matcher exposes integrated F01 false positive",
);

// GREEN candidate: only ostensive self-incidence preservation changes the
// matching judgment. All source / D / G / T / support / K roots are identical.
same(
  verifyIntegratedCandidate(memory, authority, good),
  basis.O,
  "candidate faithful source -> Entry -> Use -> K -> fixed Theory -> O",
);
expectRejected(
  () => verifyIntegratedCandidate(memory, authority, wrongTarget),
  "candidate must reject well-formed wrong target R under unchanged authority",
);

// F06 / AR3 integration: an old-style ambient K -> (role -> C) attachment does
// not mutate the selected contextual revision. The pinned E:=R still selects O.
const ambientRebindingPair = memory.ensure(endRole, basis.C);
memory.ensure(context, ambientRebindingPair);
same(
  verifyIntegratedCandidate(memory, authority, good),
  basis.O,
  "ambient rebinding cannot mutate fixed K",
);
expectRejected(
  () => verifyIntegratedCandidate(memory, authority, wrongTarget),
  "ambient rebinding cannot make R valid",
);

// F02: a third internally well-formed Use is only ambiently attached to G, not
// present as an occurrence in the selected persistent Grammar revision.
const outsiderDictionary = defineStructuralRoleDictionary(memory, []);
const outsiderRule = defineStructuralRule(memory, outsiderDictionary, basis.O);
const outsiderUseFact = memory.ensure(bracketEntry, outsiderRule);
const outsiderAmbientOccurrence = memory.ensure(grammar, outsiderUseFact);
const outsiderAdmission = admitStructuralRule(memory, theory, outsiderRule);
const outsiderEvidence: IntegratedEvidence = Object.freeze({
  ...good,
  useRule: outsiderRule,
  useFact: outsiderUseFact,
  useOccurrence: outsiderAmbientOccurrence,
  ruleAdmission: outsiderAdmission,
});
expectRejected(
  () => verifyIntegratedCandidate(memory, authority, outsiderEvidence),
  "ambient unadmitted Use must fail under unchanged Grammar revision",
);

// F05: the second Rule really is in selected Grammar, and producer may even add
// T -> Rule after S was frozen. Fixed support still rejects it.
const unsupportedAdmission = admitStructuralRule(memory, theory, unsupportedRule);
const unsupportedEvidence: IntegratedEvidence = Object.freeze({
  ...good,
  useRule: unsupportedRule,
  useFact: unsupportedUseFact,
  useOccurrence: unsupportedUseEffect.occurrence,
  ruleAdmission: unsupportedAdmission,
});
expectRejected(
  () => verifyIntegratedCandidate(memory, authority, unsupportedEvidence),
  "producer Rule self-admission after fixed support must fail",
);

// F03: even structurally valid evidence cannot silently substitute one authority
// root. No bridge is admitted in this bounded witness.
const mismatchedSource: SourceFrontEndEvidence = Object.freeze({
  ...sourceEvidence,
  theory: mismatchedTheory,
});
expectRejected(
  () => verifyIntegratedCandidate(memory, authority, Object.freeze({ ...good, source: mismatchedSource })),
  "D/G/T root substitution without bridge must fail",
);

// All accepted/rejected verdicts above are reproducible through selected pole
// closure only; ambient discovery APIs are forbidden in the trusted replay.
const poleOnly = new PoleOnlyProbe(memory);
same(
  verifyIntegratedCandidate(poleOnly, authority, good),
  basis.O,
  "pole-only integrated positive replay",
);
expectRejected(
  () => verifyIntegratedCandidate(poleOnly, authority, wrongTarget),
  "pole-only integrated wrong target rejection",
);
expectRejected(
  () => verifyIntegratedCandidate(poleOnly, authority, unsupportedEvidence),
  "pole-only fixed-support self-admission rejection",
);

const classification = Object.freeze({
  faithfulSourceOccurrenceIsRetained: true,
  sourceResolvesEntryBeforeUseSelection: true,
  useIsSelectedByPersistentGrammarRevision: true,
  theoryRuleAdmissionIsBoundedByFixedSupportRevision: true,
  contextPinsExplicitRoleBindingRevision: true,
  currentTrustedMatcherStillViolatesIntegratedF01: true,
  ostensiveMatcherRejectsWrongTargetUnderSameAuthority: true,
  ambientContextRebindingCannotChangeOldK: true,
  ambientUnadmittedUseIsRejected: true,
  producerRuleSelfAdmissionOutsideFixedSupportIsRejected: true,
  authorityRootSubstitutionWithoutBridgeIsRejected: true,
  trustedReplayIsPoleOnlyAndReadOnly: true,
  productionDelta: "NONE" as const,
  verdict: "GREEN-CANDIDATE" as const,
  reason: "INTEGRATED_SOURCE_TO_RESULT_AUTHORITY_SURVIVES_F01_F02_F03_F05_F06" as const,
});

same(classification.verdict, "GREEN-CANDIDATE", "AR6 classification");
console.log("MTS AR6 source-to-result authority: RED retained; integrated GREEN candidate exercised.");
