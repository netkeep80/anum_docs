import {
  verifyRootBasis,
  type LinkHandle,
  type RootBasis,
  type WriteMemory,
} from "./memory.js";
import {
  readNativeSyntaxGrammar,
} from "./native-syntax-grammar.js";
import {
  readSourceNamespaceProfile,
  readSourceNamespaces,
} from "./source-namespace.js";
import {
  SyntaxAsetBuilder,
} from "./syntax-aset-contract.js";
import {
  readV015LinkDefinitionProfile,
} from "./v015-link-definition.js";
import {
  materializeV012StringAnum,
} from "./v012-string-anum.js";

export type V015FormalDecodeErrorCode =
  | "invalid-basis"
  | "invalid-utf8"
  | "invalid-line-ending"
  | "empty-document"
  | "empty-definition"
  | "invalid-definition"
  | "invalid-name"
  | "invalid-expression"
  | "duplicate-local-name";

export class V015FormalDecodeError extends Error {
  override readonly name = "V015FormalDecodeError";
  constructor(readonly code: V015FormalDecodeErrorCode) {
    super(code);
  }
}

export interface V015FormalDefinitionSpan {
  readonly line: number;
  readonly startByte: number;
  readonly endByte: number;
  readonly nameStartByte: number;
  readonly nameEndByte: number;
  readonly bodyStartByte: number;
  readonly bodyEndByte: number;
}

export interface V015FormalDecodeResult {
  readonly sourceContent: LinkHandle;
  readonly sourceAset: LinkHandle;
  readonly definitionSpans: readonly V015FormalDefinitionSpan[];
}

interface PhysicalLine {
  readonly number: number;
  readonly startByte: number;
  readonly endByte: number;
  readonly bytes: Uint8Array;
}

interface ParsedDefinition {
  readonly localName: string;
  readonly leftName: string;
  readonly rightName: string;
  readonly span: V015FormalDefinitionSpan;
}

function fail(code: V015FormalDecodeErrorCode): never {
  throw new V015FormalDecodeError(code);
}

function splitPhysicalLines(bytes: Uint8Array): readonly PhysicalLine[] {
  if (bytes.length === 0) fail("empty-document");
  const result: PhysicalLine[] = [];
  let start = 0;
  let line = 1;
  for (let index = 0; index < bytes.length; index += 1) {
    const value = bytes[index];
    if (value === 0x0d) {
      if (bytes[index + 1] !== 0x0a) fail("invalid-line-ending");
      continue;
    }
    if (value !== 0x0a) continue;
    const end = index > start && bytes[index - 1] === 0x0d
      ? index - 1
      : index;
    result.push(Object.freeze({
      number: line,
      startByte: start,
      endByte: end,
      bytes: bytes.slice(start, end),
    }));
    start = index + 1;
    line += 1;
  }
  if (start < bytes.length) {
    result.push(Object.freeze({
      number: line,
      startByte: start,
      endByte: bytes.length,
      bytes: bytes.slice(start),
    }));
  }
  if (result.length === 0) fail("empty-document");
  return Object.freeze(result);
}

function decodeLine(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return fail("invalid-utf8");
  }
}

function trimAsciiBounds(
  text: string,
  start: number,
  end: number,
): readonly [number, number] {
  let left = start;
  let right = end;
  while (left < right && (text[left] === " " || text[left] === "\t")) left += 1;
  while (right > left && (text[right - 1] === " " || text[right - 1] === "\t")) right -= 1;
  return Object.freeze([left, right]);
}

function byteOffset(text: string, charOffset: number): number {
  return new TextEncoder().encode(text.slice(0, charOffset)).length;
}

function validName(name: string): boolean {
  return (
    name.length > 0 &&
    !/[\t\r\n :()]/u.test(name) &&
    !name.includes("->")
  );
}

function parseExpression(
  source: string,
): Readonly<{ leftName: string; rightName: string }> {
  const direct = source.indexOf("->");
  if (direct >= 0) {
    if (
      source.indexOf("->", direct + 2) >= 0 ||
      source.includes("(") ||
      source.includes(")")
    ) {
      return fail("invalid-expression");
    }
    const [leftStart, leftEnd] = trimAsciiBounds(source, 0, direct);
    const [rightStart, rightEnd] = trimAsciiBounds(source, direct + 2, source.length);
    const leftName = source.slice(leftStart, leftEnd);
    const rightName = source.slice(rightStart, rightEnd);
    if (!validName(leftName) || !validName(rightName)) fail("invalid-name");
    return Object.freeze({ leftName, rightName });
  }

  const open = source.indexOf("(");
  const close = source.lastIndexOf(")");
  if (
    open <= 0 ||
    close < open ||
    source.indexOf("(", open + 1) >= 0 ||
    source.indexOf(")") !== close
  ) {
    return fail("invalid-expression");
  }
  const [tailStart, tailEnd] = trimAsciiBounds(source, close + 1, source.length);
  if (tailStart !== tailEnd) fail("invalid-expression");

  const [leftStart, leftEnd] = trimAsciiBounds(source, 0, open);
  const [rightStart, rightEnd] = trimAsciiBounds(source, open + 1, close);
  const leftName = source.slice(leftStart, leftEnd);
  const rightName = source.slice(rightStart, rightEnd);
  if (!validName(leftName) || !validName(rightName)) fail("invalid-name");
  return Object.freeze({ leftName, rightName });
}

function parseDefinition(line: PhysicalLine): ParsedDefinition {
  const text = decodeLine(line.bytes);
  if (text.length === 0 || /^[ \t]*$/u.test(text)) fail("empty-definition");
  const colon = text.indexOf(":");
  if (colon < 0 || text.indexOf(":", colon + 1) >= 0) fail("invalid-definition");

  const [nameStart, nameEnd] = trimAsciiBounds(text, 0, colon);
  const [bodyStart, bodyEnd] = trimAsciiBounds(text, colon + 1, text.length);
  const localName = text.slice(nameStart, nameEnd);
  const body = text.slice(bodyStart, bodyEnd);
  if (!validName(localName)) fail("invalid-name");
  if (body.length === 0) fail("invalid-expression");

  const expression = parseExpression(body);
  return Object.freeze({
    localName,
    leftName: expression.leftName,
    rightName: expression.rightName,
    span: Object.freeze({
      line: line.number,
      startByte: line.startByte,
      endByte: line.endByte,
      nameStartByte: line.startByte + byteOffset(text, nameStart),
      nameEndByte: line.startByte + byteOffset(text, nameEnd),
      bodyStartByte: line.startByte + byteOffset(text, bodyStart),
      bodyEndByte: line.startByte + byteOffset(text, bodyEnd),
    }),
  });
}

function parseDocument(bytes: Uint8Array): readonly ParsedDefinition[] {
  const parsed = splitPhysicalLines(bytes).map(parseDefinition);
  const names = new Set<string>();
  for (const definition of parsed) {
    if (names.has(definition.localName)) fail("duplicate-local-name");
    names.add(definition.localName);
  }
  return Object.freeze(parsed);
}

export function decodeV015FormalDefinitions(
  memory: WriteMemory,
  basis: RootBasis,
  grammarRoot: LinkHandle,
  sourceNamespaceProfileRoot: LinkHandle,
  definitionProfileRoot: LinkHandle,
  bytes: Uint8Array,
): V015FormalDecodeResult {
  let verified: RootBasis;
  try {
    verified = verifyRootBasis(memory, basis);
  } catch {
    return fail("invalid-basis");
  }

  const parsed = parseDocument(bytes);
  const grammar = readNativeSyntaxGrammar(memory, verified, grammarRoot);
  const namespaceProfile = readSourceNamespaceProfile(
    memory,
    verified,
    grammarRoot,
    sourceNamespaceProfileRoot,
  );
  const definitionProfile = readV015LinkDefinitionProfile(
    memory,
    verified,
    grammarRoot,
    definitionProfileRoot,
  );

  const sourceContent = materializeV012StringAnum(
    memory,
    verified,
    bytes,
  ).anumLink;
  const builder = new SyntaxAsetBuilder(memory, grammar.vocabulary);
  const cache = new Map<string, LinkHandle>();
  const nameCarrier = (name: string): LinkHandle => {
    const known = cache.get(name);
    if (known !== undefined) return known;
    const value = materializeV012StringAnum(
      memory,
      verified,
      new TextEncoder().encode(name),
    ).anumLink;
    cache.set(name, value);
    return value;
  };

  const declarations: LinkHandle[] = [];
  for (const definition of parsed) {
    const left = builder.addOccurrence(definitionProfile.nameRefForm, [{
      role: definitionProfile.referencedNameRole,
      value: nameCarrier(definition.leftName),
    }]);
    const right = builder.addOccurrence(definitionProfile.nameRefForm, [{
      role: definitionProfile.referencedNameRole,
      value: nameCarrier(definition.rightName),
    }]);
    const body = builder.addOccurrence(definitionProfile.pairForm, [
      { role: definitionProfile.pairLeftRole, value: left },
      { role: definitionProfile.pairRightRole, value: right },
    ]);
    const declaration = builder.addOccurrence(namespaceProfile.declarationForm, [
      {
        role: namespaceProfile.declarationNameRole,
        value: nameCarrier(definition.localName),
      },
      {
        role: namespaceProfile.declarationBodyRole,
        value: body,
      },
    ]);
    declarations.push(declaration);
  }

  const root = builder.addOccurrence(
    namespaceProfile.blockForm,
    declarations.map((value) => ({
      role: namespaceProfile.blockItemRole,
      value,
    })),
  );
  const sourceAset = builder.finish(root);

  readSourceNamespaces(
    memory,
    verified,
    grammarRoot,
    sourceNamespaceProfileRoot,
    sourceAset,
  );

  return Object.freeze({
    sourceContent,
    sourceAset,
    definitionSpans: Object.freeze(parsed.map((definition) => definition.span)),
  });
}
