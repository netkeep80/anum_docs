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

  constructor(readonly code: "invalid-relation-evidence") {
    super(code);
  }
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

function required(
  memory: ReadMemory,
  act: LinkHandle,
  role: LinkHandle,
): LinkHandle {
  return readRequiredSingle(memory, act, role);
}

function replaySelectedRelation(
  memory: ReadMemory,
  evidence: RelationReplayEvidence,
  selected: SelectedRelationEvidence,
): LinkHandle {
  const before = memory.linkCount;
  const { roles, act, sourceEvidence } = evidence;

  const source = required(memory, act, roles.source);
  const sourceSelection = required(memory, act, roles.sourceSelection);
  const formSequence = required(memory, act, roles.formSequence);
  const dictionary = required(memory, act, roles.dictionary);
  const grammar = required(memory, act, roles.grammar);
  const theory = required(memory, act, roles.theory);
  const form = required(memory, act, roles.form);
  const beforeContextRef = required(memory, act, roles.beforeContext);
  const binding = required(memory, act, roles.binding);
  const result = required(memory, act, roles.result);
  const afterContextRef = required(memory, act, roles.afterContext);

  if (
    source !== sourceEvidence.source ||
    sourceSelection !== selected.selectionSequence ||
    formSequence !== selected.formSequence ||
    dictionary !== sourceEvidence.dictionary ||
    grammar !== selected.grammar ||
    theory !== selected.theory ||
    form !== selected.form
  ) {
    invalid();
  }

  const beforeContext = readContext(memory, beforeContextRef);
  if (binding !== beforeContext.current) {
    invalid();
  }

  const formPoles = memory.poles(form);
  const startSelfClosed = formPoles.start === form;
  const endSelfClosed = formPoles.end === form;
  if (startSelfClosed === endSelfClosed) {
    // Exactly one pole must self-close. This rejects both ordinary complete
    // forms and the unique fully self-closed root-like form.
    invalid();
  }

  const resultPoles = memory.poles(result);
  if (startSelfClosed) {
    if (resultPoles.start !== binding || resultPoles.end !== formPoles.end) {
      invalid();
    }
  } else if (resultPoles.start !== formPoles.start || resultPoles.end !== binding) {
    invalid();
  }

  const afterContext = readContext(memory, afterContextRef);
  if (
    afterContext.parent !== beforeContext.parent ||
    afterContext.current !== result
  ) {
    invalid();
  }

  verifyHeader(memory, act, {
    interpreter: evidence.interpreter,
    roleDictionary: evidence.roleDictionary,
    afterContext: afterContextRef,
  });

  if (memory.linkCount !== before) {
    invalid();
  }
  return result;
}

function normalizeReplay<T>(effect: () => T): T {
  try {
    return effect();
  } catch (error) {
    if (error instanceof InterpreterReplayError) {
      throw error;
    }
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
    if (forms.length !== 1) {
      invalid();
    }
    const form = forms[0];
    if (form === undefined) {
      invalid();
    }

    const result = replaySelectedRelation(memory, evidence, {
      selectionSequence: evidence.sourceEvidence.selectionSequence,
      formSequence: evidence.sourceEvidence.formSequence,
      grammar: evidence.sourceEvidence.grammar,
      theory: evidence.sourceEvidence.theory,
      form,
    });
    if (memory.linkCount !== before) {
      invalid();
    }
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
    const forms = replaySourceSubselection(
      memory,
      byteRefs,
      evidence.sourceEvidence,
      subselection,
    );
    if (forms.length !== 1) {
      invalid();
    }
    const form = forms[0];
    if (form === undefined) {
      invalid();
    }

    const result = replaySelectedRelation(memory, evidence, {
      selectionSequence: subselection.selectionSequence,
      formSequence: subselection.formSequence,
      grammar: subselection.grammar,
      theory: subselection.theory,
      form,
    });
    if (memory.linkCount !== before) {
      invalid();
    }
    return result;
  });
}
