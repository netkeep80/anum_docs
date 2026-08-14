import type { LinkHandle, ReadMemory } from "./memory.js";
import {
  replaySelectedSourceEvidence,
  replaySourceSubselection,
  type SourceFrontEndEvidence,
  type SourceSubselectionEvidence,
} from "./source.js";
import { readContext } from "./state.js";
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
  constructor(readonly code: "invalid-relation-evidence") { super(code); }
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
  byteRefs: readonly LinkHandle[],
  evidence: RelationReplayEvidence,
): LinkHandle {
  return normalizeReplay(() => {
    const before = memory.linkCount;
    const forms = replaySelectedSourceEvidence(memory, byteRefs, evidence.sourceEvidence);
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
  byteRefs: readonly LinkHandle[],
  evidence: RelationReplayEvidence,
  subselection: SourceSubselectionEvidence,
): LinkHandle {
  return normalizeReplay(() => {
    const before = memory.linkCount;
    const forms = replaySourceSubselection(memory, byteRefs, evidence.sourceEvidence, subselection);
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
