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
    throw new IntegratedError(unique.size === 0 ? "missing contextual binding" : "contextual binding conflict");
  }
  const value = values[0];
  if (value === undefined) throw new IntegratedError("missing contextual binding");
  return value;
}

function verifyIntegratedCurrent(
  memory: ReadMemory,
  authority: FixedAuthority,
  evidence: IntegratedEvidence,
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
  const dictionary = readStructuralRoleDictionary(memory, rule.roleDictionary);
  const bindings: readonly StructuralRoleBinding[] = Object.freeze(
    dictionary.roles.map((role) => Object.freeze({
      role,
      value: bindingAtSnapshot(memory, authority.context, role),
    })),
  );

  // Deliberately current trusted matcher: AR6 RED asks whether the complete
  // source/authority path is enough to reject a wrong ostensive target today.
  matchStructuralTemplate(memory, rule.body, evidence.target, bindings);

  if (memory.linkCount !== before) throw new IntegratedError("integrated replay wrote to Memory");
  return evidence.target;
}

function expectRejected(effect: () => unknown, message: string): void {
  try {
    effect();
  } catch {
    return;
  }
  throw new Error(`AR6 integrated probe: ${message}: expected rejection`);
}

const memory = new Memory();
const basis = ensureRootBasis(memory);
const pool = anchors(memory, 10);
const bracketEntry = pool[0];
const grammarParent = pool[1];
const theory = pool[2];
const contextParent = pool[3];
const contextCurrent = pool[4];
assert(
  bracketEntry !== undefined && grammarParent !== undefined && theory !== undefined &&
  contextParent !== undefined && contextCurrent !== undefined,
  "fixture anchors",
);

// Use is a rooted structural Rule carrying query shape and its open role list.
const roleSeed = memory.ensure(basis.L, basis.U);
const endRole = memory.ensureStartSelfClosed(roleSeed);
const startRootTemplate = memory.ensureStartSelfClosed(endRole); // ♂E
const roleDictionary = defineStructuralRoleDictionary(memory, [endRole]);
const useRule = defineStructuralRule(memory, roleDictionary, startRootTemplate);

// Grammar authority explicitly admits Entry '[' -> this Use/Rule in a
// persistent rooted revision.
const grammarBase = defineRevision(memory, grammarParent, memory.root);
const useFact = memory.ensure(bracketEntry, useRule);
const useEffect = appendRevisionFact(memory, grammarBase, useFact);
const grammar = useEffect.afterRevision;

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

// Theory support is independently frozen as one exact rooted revision.
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

same(
  verifyIntegratedCurrent(memory, authority, good),
  basis.O,
  "faithful source -> Entry -> Use -> K -> fixed Theory -> O",
);

// TDD RED / F01: R is internally well-formed, and all authority roots are
// exactly unchanged. The current trusted matcher is expected to reject it.
// AR4 predicts it will NOT reject, making this test fail for the right reason.
expectRejected(
  () => verifyIntegratedCurrent(memory, authority, wrongTarget),
  "same source/support/K must reject well-formed wrong target R",
);

console.log("MTS AR6 source-to-result authority: expected RED if current matcher collapses O into R.");
