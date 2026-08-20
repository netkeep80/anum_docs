import type { LinkHandle, ReadMemory, WriteMemory } from "./memory.js";

export type StructuralReadErrorCode =
  | "invalid-act-header"
  | "missing-required-field"
  | "multiple-field-values"
  | "act-header-mismatch";

export interface ActHeader {
  readonly interpreter: LinkHandle;
  readonly roleDictionary: LinkHandle;
  readonly afterContext: LinkHandle;
}

export class StructuralReadError extends Error {
  override readonly name: string = "StructuralReadError";

  constructor(readonly code: StructuralReadErrorCode) {
    super(code);
  }
}

export function defineActHeader(
  memory: WriteMemory,
  interpreter: LinkHandle,
  roleDictionary: LinkHandle,
  afterContext: LinkHandle,
): LinkHandle {
  const roleAndContext = memory.ensure(roleDictionary, afterContext);
  const header = memory.ensure(interpreter, roleAndContext);
  return memory.ensureStartSelfClosed(header);
}

export function defineActField(
  memory: WriteMemory,
  act: LinkHandle,
  role: LinkHandle,
  value: LinkHandle,
): LinkHandle {
  const field = memory.ensure(role, value);
  return memory.ensure(act, field);
}

export function readActHeader(
  memory: ReadMemory,
  act: LinkHandle,
): ActHeader {
  const actLink = memory.poles(act);
  // Act имеет именно однополюсную форму START(header). Полностью
  // самозамкнутый ROOT не является альтернативной кодировкой Act.
  if (actLink.start !== act || actLink.end === act) {
    throw new StructuralReadError("invalid-act-header");
  }

  const header = memory.poles(actLink.end);
  const roleAndContext = memory.poles(header.end);
  return Object.freeze({
    interpreter: header.start,
    roleDictionary: roleAndContext.start,
    afterContext: roleAndContext.end,
  });
}

export function readOptionalMany(
  memory: ReadMemory,
  act: LinkHandle,
  role: LinkHandle,
): readonly LinkHandle[] {
  const values: LinkHandle[] = [];

  // ReadMemory exposes the indexed outgoing surface directly. This avoids the
  // Python-era whole-network scan and keeps the reader independent of storage.
  for (const attachment of memory.outgoing(act)) {
    if (attachment === act) {
      // A is start-self-closed, therefore A itself is in outgoing(A), but it is
      // the header carrier rather than a role-field attachment.
      continue;
    }
    const attachmentLink = memory.poles(attachment);
    if (attachmentLink.start !== act) {
      continue;
    }
    const field = memory.poles(attachmentLink.end);
    if (field.start === role) {
      values.push(field.end);
    }
  }

  return Object.freeze(values);
}

export function readRequiredSingle(
  memory: ReadMemory,
  act: LinkHandle,
  role: LinkHandle,
): LinkHandle {
  const values = readOptionalMany(memory, act, role);
  if (values.length === 0) {
    throw new StructuralReadError("missing-required-field");
  }
  if (values.length !== 1) {
    throw new StructuralReadError("multiple-field-values");
  }
  const value = values[0];
  if (value === undefined) {
    throw new Error("internal structural reader cardinality invariant violated");
  }
  return value;
}

export function verifyHeader(
  memory: ReadMemory,
  act: LinkHandle,
  expected: ActHeader,
): void {
  const actual = readActHeader(memory, act);
  if (
    actual.interpreter !== expected.interpreter ||
    actual.roleDictionary !== expected.roleDictionary ||
    actual.afterContext !== expected.afterContext
  ) {
    throw new StructuralReadError("act-header-mismatch");
  }
}
