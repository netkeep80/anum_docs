import type { LinkHandle, ReadMemory } from "./memory.js";
import {
  readSourceForm,
  replaySelectedSourceEvidence,
  replaySourceSubselection,
  type SourceFrontEndEvidence,
  type SourceSubselectionEvidence,
} from "./source.js";
import { localRepresentative, readContext } from "./state.js";
import {
  DictionaryError,
  readDictionaryScope,
  verifyVisibleDictionaryOccurrence,
} from "./dictionary.js";
import { readRequiredSingle, verifyHeader } from "./structural-readers.js";

export interface RelationRoles {
  readonly source: LinkHandle;
  readonly sourceSelection: LinkHandle;
  readonly formSequence: LinkHandle;
  readonly dictionary: LinkHandle;
  readonly grammar: LinkHandle;
  readonly theory: LinkHandle;
  readonly form: LinkHandle;
  readonly beforeContext: LinkHandle;
  readonly binding: LinkHandle;
  readonly result: LinkHandle;
  readonly afterContext: LinkHandle;
}

export interface RelationReplayEvidence {
  readonly sourceEvidence: SourceFrontEndEvidence;
  readonly act: LinkHandle;
  readonly roles: RelationRoles;
  readonly interpreter: LinkHandle;
  readonly roleDictionary: LinkHandle;
}

export class InterpreterReplayError extends Error {
  override readonly name = "InterpreterReplayError";
  constructor(readonly code: "invalid-relation-evidence" | "invalid-flat-evidence" | "invalid-colon-evidence" | "invalid-equality-evidence") { super(code); }
}

interface SelectedRelationEvidence {
  readonly selectionSequence: LinkHandle;
  readonly formSequence: LinkHandle;
  readonly grammar: LinkHandle;
  readonly theory: LinkHandle;
  readonly form: LinkHandle;
}

function invalid(): never {
  throw new InterpreterReplayError("invalid-relation-evidence");
}

function replaySelectedRelation(
  memory: ReadMemory,
  evidence: RelationReplayEvidence,
  selected: SelectedRelationEvidence,
): LinkHandle {
  const before = memory.linkCount;
  const { roles, act, sourceEvidence } = evidence;
  const field = (role: LinkHandle) => readRequiredSingle(memory, act, role);
  const source = field(roles.source);
  const sourceSelection = field(roles.sourceSelection);
  const formSequence = field(roles.formSequence);
  const dictionary = field(roles.dictionary);
  const grammar = field(roles.grammar);
  const theory = field(roles.theory);
  const form = field(roles.form);
  const beforeContextRef = field(roles.beforeContext);
  const binding = field(roles.binding);
  const result = field(roles.result);
  const afterContextRef = field(roles.afterContext);
  if (
    source !== sourceEvidence.source ||
    sourceSelection !== selected.selectionSequence ||
    formSequence !== selected.formSequence ||
    dictionary !== sourceEvidence.dictionary ||
    grammar !== selected.grammar || theory !== selected.theory || form !== selected.form
  ) invalid();

  const beforeContext = readContext(memory, beforeContextRef);
  if (binding !== beforeContext.current) invalid();

  const formPoles = memory.poles(form);
  const startSelfClosed = formPoles.start === form;
  const endSelfClosed = formPoles.end === form;
  // Exactly one self-closed pole is the accepted relation form. This also
  // excludes both ordinary complete forms and the fully self-closed root.
  if (startSelfClosed === endSelfClosed) invalid();

  const resultPoles = memory.poles(result);
  if (startSelfClosed) {
    if (resultPoles.start !== binding || resultPoles.end !== formPoles.end) invalid();
  } else if (resultPoles.start !== formPoles.start || resultPoles.end !== binding) invalid();

  const afterContext = readContext(memory, afterContextRef);
  if (afterContext.parent !== beforeContext.parent || afterContext.current !== result) invalid();
  verifyHeader(memory, act, {
    interpreter: evidence.interpreter,
    roleDictionary: evidence.roleDictionary,
    afterContext: afterContextRef,
  });
  if (memory.linkCount !== before) invalid();
  return result;
}

function normalizeReplay<T>(effect: () => T): T {
  try {
    return effect();
  } catch (error) {
    if (error instanceof InterpreterReplayError) throw error;
    throw new InterpreterReplayError("invalid-relation-evidence");
  }
}

export function replayRelationStep(
  memory: ReadMemory,
  evidence: RelationReplayEvidence,
): LinkHandle {
  return normalizeReplay(() => {
    const before = memory.linkCount;
    const forms = replaySelectedSourceEvidence(memory, evidence.sourceEvidence);
    const form = forms.length === 1 ? forms[0] : undefined;
    if (form === undefined) invalid();
    const result = replaySelectedRelation(memory, evidence, {
      selectionSequence: evidence.sourceEvidence.selectionSequence,
      formSequence: evidence.sourceEvidence.formSequence,
      grammar: evidence.sourceEvidence.grammar,
      theory: evidence.sourceEvidence.theory,
      form,
    });
    if (memory.linkCount !== before) invalid();
    return result;
  });
}

export function replayRelationSubselectionStep(
  memory: ReadMemory,
  evidence: RelationReplayEvidence,
  subselection: SourceSubselectionEvidence,
): LinkHandle {
  return normalizeReplay(() => {
    const before = memory.linkCount;
    const forms = replaySourceSubselection(memory, evidence.sourceEvidence, subselection);
    const form = forms.length === 1 ? forms[0] : undefined;
    if (form === undefined) invalid();
    const result = replaySelectedRelation(memory, evidence, {
      selectionSequence: subselection.selectionSequence,
      formSequence: subselection.formSequence,
      grammar: subselection.grammar,
      theory: subselection.theory,
      form,
    });
    if (memory.linkCount !== before) invalid();
    return result;
  });
}

export interface FlatReadingRoles {
  readonly source: LinkHandle;
  readonly sourceSelection: LinkHandle;
  readonly formSequence: LinkHandle;
  readonly dictionary: LinkHandle;
  readonly grammar: LinkHandle;
  readonly theory: LinkHandle;
  readonly beforeContext: LinkHandle;
  readonly result: LinkHandle;
  readonly afterContext: LinkHandle;
}

export interface FlatReadingEvidence {
  readonly sourceEvidence: SourceFrontEndEvidence;
  readonly act: LinkHandle;
  readonly roles: FlatReadingRoles;
  readonly interpreter: LinkHandle;
  readonly roleDictionary: LinkHandle;
}

interface FlatSelection {
  readonly selectionSequence: LinkHandle;
  readonly formSequence: LinkHandle;
  readonly grammar: LinkHandle;
  readonly theory: LinkHandle;
}

function invalidFlat(): never {
  throw new InterpreterReplayError("invalid-flat-evidence");
}

function verifyFold(
  memory: ReadMemory,
  forms: readonly LinkHandle[],
  result: LinkHandle,
  prefix?: LinkHandle,
): void {
  if (forms.length === 0) {
    if (result !== (prefix ?? memory.root)) invalidFlat();
    return;
  }
  if (prefix === undefined && forms.length === 1) {
    if (result !== forms[0]) invalidFlat();
    return;
  }
  let cursor = result;
  const first = prefix === undefined ? 1 : 0;
  for (let index = forms.length - 1; index >= first; index -= 1) {
    const poles = memory.poles(cursor);
    if (poles.end !== forms[index]) invalidFlat();
    cursor = poles.start;
  }
  const base = prefix ?? forms[0];
  if (cursor !== base) invalidFlat();
}

function replaySelectedFlat(
  memory: ReadMemory,
  evidence: FlatReadingEvidence,
  selected: FlatSelection,
  forms: readonly LinkHandle[],
  continuation: boolean,
): LinkHandle {
  const before = memory.linkCount;
  const { act, roles, sourceEvidence } = evidence;
  const field = (role: LinkHandle) => readRequiredSingle(memory, act, role);
  if (
    field(roles.source) !== sourceEvidence.source ||
    field(roles.sourceSelection) !== selected.selectionSequence ||
    field(roles.formSequence) !== selected.formSequence ||
    field(roles.dictionary) !== sourceEvidence.dictionary ||
    field(roles.grammar) !== selected.grammar || field(roles.theory) !== selected.theory
  ) invalidFlat();
  const beforeContext = readContext(memory, field(roles.beforeContext));
  const result = field(roles.result);
  const afterContextRef = field(roles.afterContext);
  verifyFold(memory, forms, result, continuation ? beforeContext.current : undefined);
  const afterContext = readContext(memory, afterContextRef);
  if (afterContext.parent !== beforeContext.parent || afterContext.current !== result) invalidFlat();
  verifyHeader(memory, act, {
    interpreter: evidence.interpreter,
    roleDictionary: evidence.roleDictionary,
    afterContext: afterContextRef,
  });
  if (memory.linkCount !== before) invalidFlat();
  return result;
}

function normalizeFlat<T>(effect: () => T): T {
  try { return effect(); }
  catch (error) {
    if (error instanceof InterpreterReplayError && error.code === "invalid-flat-evidence") throw error;
    throw new InterpreterReplayError("invalid-flat-evidence");
  }
}

export function replayFlatReading(
  memory: ReadMemory,
  evidence: FlatReadingEvidence,
): LinkHandle {
  return normalizeFlat(() => replaySelectedFlat(
    memory, evidence, evidence.sourceEvidence,
    replaySelectedSourceEvidence(memory, evidence.sourceEvidence), false,
  ));
}

function replayFlatSubselection(
  memory: ReadMemory,
  evidence: FlatReadingEvidence,
  subselection: SourceSubselectionEvidence,
  continuation: boolean,
): LinkHandle {
  return normalizeFlat(() => replaySelectedFlat(
    memory, evidence, subselection,
    replaySourceSubselection(memory, evidence.sourceEvidence, subselection), continuation,
  ));
}

export function replayFlatSubselectionReading(
  memory: ReadMemory,
  evidence: FlatReadingEvidence,
  subselection: SourceSubselectionEvidence,
): LinkHandle {
  return replayFlatSubselection(memory, evidence, subselection, false);
}

export function replayFlatSubselectionContinuation(
  memory: ReadMemory,
  evidence: FlatReadingEvidence,
  subselection: SourceSubselectionEvidence,
): LinkHandle {
  return replayFlatSubselection(memory, evidence, subselection, true);
}

export interface ColonRoles {
  readonly source: LinkHandle;
  readonly sourceContent: LinkHandle;
  readonly form: LinkHandle;
  readonly beforeDictionary: LinkHandle;
  readonly entry: LinkHandle;
  readonly definitionOccurrence: LinkHandle;
  readonly historyBefore: LinkHandle;
  readonly historyAfter: LinkHandle;
  readonly afterDictionary: LinkHandle;
  readonly context: LinkHandle;
}

export interface ColonReplayEvidence {
  readonly act: LinkHandle;
  readonly roles: ColonRoles;
  readonly interpreter: LinkHandle;
  readonly roleDictionary: LinkHandle;
}

function invalidColon(): never {
  throw new InterpreterReplayError("invalid-colon-evidence");
}

export function replayColonEffect(
  memory: ReadMemory,
  evidence: ColonReplayEvidence,
): LinkHandle {
  try {
    const beforeCount = memory.linkCount;
    const { act, roles } = evidence;
    const field = (role: LinkHandle) => readRequiredSingle(memory, act, role);
    const source = field(roles.source);
    const sourceContent = field(roles.sourceContent);
    const form = field(roles.form);
    const beforeDictionary = field(roles.beforeDictionary);
    const entry = field(roles.entry);
    const occurrence = field(roles.definitionOccurrence);
    const historyBefore = field(roles.historyBefore);
    const historyAfter = field(roles.historyAfter);
    const afterDictionary = field(roles.afterDictionary);
    const context = field(roles.context);

    if (readSourceForm(memory, source) !== sourceContent) invalidColon();
    const before = readDictionaryScope(memory, beforeDictionary);
    if (before.localHistory !== historyBefore) invalidColon();
    const entryPoles = memory.poles(entry);
    if (entryPoles.start !== sourceContent || entryPoles.end !== form) invalidColon();
    const occurrencePoles = memory.poles(occurrence);
    if (occurrencePoles.start !== beforeDictionary || occurrencePoles.end !== entry) invalidColon();
    const historyPoles = memory.poles(historyAfter);
    if (historyPoles.start !== historyBefore || historyPoles.end !== occurrence) invalidColon();
    const after = readDictionaryScope(memory, afterDictionary);
    if (after.parentScope !== before.parentScope || after.localHistory !== historyAfter) invalidColon();

    verifyVisibleDictionaryOccurrence(memory, afterDictionary, occurrence, sourceContent, form);
    try {
      verifyVisibleDictionaryOccurrence(memory, beforeDictionary, occurrence, sourceContent, form);
      invalidColon();
    } catch (error) {
      if (!(error instanceof DictionaryError)) throw error;
    }
    verifyHeader(memory, act, {
      interpreter: evidence.interpreter,
      roleDictionary: evidence.roleDictionary,
      afterContext: context,
    });
    if (memory.linkCount !== beforeCount) invalidColon();
    return afterDictionary;
  } catch (error) {
    if (error instanceof InterpreterReplayError && error.code === "invalid-colon-evidence") throw error;
    throw new InterpreterReplayError("invalid-colon-evidence");
  }
}

export interface EqualityRoles {
  readonly context: LinkHandle;
  readonly left: LinkHandle;
  readonly right: LinkHandle;
  readonly leftRepresentative: LinkHandle;
  readonly rightRepresentative: LinkHandle;
}

export interface EqualityReplayEvidence {
  readonly act: LinkHandle;
  readonly roles: EqualityRoles;
  readonly interpreter: LinkHandle;
  readonly roleDictionary: LinkHandle;
}

export function replayEqualityEvaluation(
  memory: ReadMemory,
  evidence: EqualityReplayEvidence,
): boolean {
  try {
    const before = memory.linkCount;
    const { act, roles } = evidence;
    const field = (role: LinkHandle) => readRequiredSingle(memory, act, role);
    const context = field(roles.context);
    const left = field(roles.left);
    const right = field(roles.right);
    const claimedLeft = field(roles.leftRepresentative);
    const claimedRight = field(roles.rightRepresentative);

    // localRepresentative owns the accepted one-hop, context-local lookup and
    // conflict detection; equality replay must not build a transitive closure.
    readContext(memory, context);
    const leftRepresentative = localRepresentative(memory, context, left);
    const rightRepresentative = localRepresentative(memory, context, right);
    if (claimedLeft !== leftRepresentative || claimedRight !== rightRepresentative) {
      throw new InterpreterReplayError("invalid-equality-evidence");
    }
    verifyHeader(memory, act, {
      interpreter: evidence.interpreter,
      roleDictionary: evidence.roleDictionary,
      afterContext: context,
    });
    if (memory.linkCount !== before) {
      throw new InterpreterReplayError("invalid-equality-evidence");
    }
    return leftRepresentative === rightRepresentative;
  } catch (error) {
    if (error instanceof InterpreterReplayError && error.code === "invalid-equality-evidence") throw error;
    throw new InterpreterReplayError("invalid-equality-evidence");
  }
}
