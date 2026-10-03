import {
  verifyRootBasis,
  type LinkHandle,
  type ReadMemory,
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
  readSyntaxAset,
  type SyntaxAsetOccurrence,
} from "./syntax-aset-contract.js";
import {
  readV015LinkDefinitionProfile,
  type V015LinkDefinitionProfile,
} from "./v015-link-definition.js";
import {
  materializeV012StringAnum,
  readV012StringAnum,
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

type ParsedEqualityOperand =
  | Readonly<{
      kind: "name";
      name: string;
    }>
  | Readonly<{
      kind: "pair";
      leftName: string;
      rightName: string;
    }>;

type ParsedExpression =
  | Readonly<{
      kind: "pair";
      leftName: string;
      rightName: string;
    }>
  | Readonly<{
      kind: "sequence";
      items: readonly string[];
    }>
  | Readonly<{
      kind: "equality";
      left: ParsedEqualityOperand;
      right: ParsedEqualityOperand;
    }>;

interface ParsedDefinition {
  readonly localName: string;
  readonly expression: ParsedExpression;
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

export function isV015FormalName(name: string): boolean {
  return (
    name.length > 0 &&
    !/[\t\r\n :()]/u.test(name) &&
    !name.includes("->") &&
    !name.includes("[") &&
    !name.includes("]") &&
    !name.includes(",") &&
    !name.includes("=") &&
    !name.includes("≡")
  );
}

function parseEqualityOperand(
  source: string,
): ParsedEqualityOperand {
  const [start, end] = trimAsciiBounds(source, 0, source.length);
  const value = source.slice(start, end);
  if (isV015FormalName(value)) {
    return Object.freeze({ kind: "name", name: value });
  }

  if (
    value.includes("->") ||
    value.includes("=") ||
    value.includes("≡") ||
    value.includes("[") ||
    value.includes("]")
  ) {
    return fail("invalid-expression");
  }

  const open = value.indexOf("(");
  const close = value.lastIndexOf(")");
  if (
    open <= 0 ||
    close !== value.length - 1 ||
    value.indexOf("(", open + 1) >= 0 ||
    value.indexOf(")") !== close
  ) {
    return fail("invalid-expression");
  }

  const [leftStart, leftEnd] = trimAsciiBounds(value, 0, open);
  const [rightStart, rightEnd] = trimAsciiBounds(value, open + 1, close);
  const leftName = value.slice(leftStart, leftEnd);
  const rightName = value.slice(rightStart, rightEnd);
  if (
    !isV015FormalName(leftName) ||
    !isV015FormalName(rightName)
  ) {
    return fail("invalid-name");
  }
  return Object.freeze({
    kind: "pair",
    leftName,
    rightName,
  });
}

function parseExpression(
  source: string,
): ParsedExpression {
  if (source.startsWith("[")) {
    if (!source.endsWith("]")) fail("invalid-expression");
    const inner = source.slice(1, -1);
    if (inner.includes("[") || inner.includes("]")) {
      return fail("invalid-expression");
    }
    const [contentStart, contentEnd] = trimAsciiBounds(
      inner,
      0,
      inner.length,
    );
    if (contentStart === contentEnd) {
      return Object.freeze({
        kind: "sequence",
        items: Object.freeze([]),
      });
    }
    const items = inner.split(",").map((raw) => {
      const [start, end] = trimAsciiBounds(raw, 0, raw.length);
      const name = raw.slice(start, end);
      if (!isV015FormalName(name)) fail("invalid-name");
      return name;
    });
    return Object.freeze({
      kind: "sequence",
      items: Object.freeze(items),
    });
  }

  if (source.includes("[") || source.includes("]")) {
    return fail("invalid-expression");
  }

  if (source.includes("≡")) return fail("invalid-expression");

  const equality = source.indexOf("=");
  if (equality >= 0) {
    if (
      source.indexOf("=", equality + 1) >= 0 ||
      source.includes("->")
    ) {
      return fail("invalid-expression");
    }
    return Object.freeze({
      kind: "equality",
      left: parseEqualityOperand(source.slice(0, equality)),
      right: parseEqualityOperand(source.slice(equality + 1)),
    });
  }

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
    if (!isV015FormalName(leftName) || !isV015FormalName(rightName)) fail("invalid-name");
    return Object.freeze({ kind: "pair", leftName, rightName });
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
  if (!isV015FormalName(leftName) || !isV015FormalName(rightName)) fail("invalid-name");
  return Object.freeze({ kind: "pair", leftName, rightName });
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
  if (!isV015FormalName(localName)) fail("invalid-name");
  if (body.length === 0) fail("invalid-expression");

  const expression = parseExpression(body);
  return Object.freeze({
    localName,
    expression,
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
  const reference = (name: string): LinkHandle =>
    builder.addOccurrence(definitionProfile.nameRefForm, [{
      role: definitionProfile.referencedNameRole,
      value: nameCarrier(name),
    }]);

  const equalityOperand = (operand: ParsedEqualityOperand): LinkHandle => {
    if (operand.kind === "name") return reference(operand.name);
    return builder.addOccurrence(definitionProfile.pairForm, [
      {
        role: definitionProfile.pairLeftRole,
        value: reference(operand.leftName),
      },
      {
        role: definitionProfile.pairRightRole,
        value: reference(operand.rightName),
      },
    ]);
  };

  for (const definition of parsed) {
    let body: LinkHandle;
    if (definition.expression.kind === "pair") {
      const left = reference(definition.expression.leftName);
      const right = reference(definition.expression.rightName);
      body = builder.addOccurrence(definitionProfile.pairForm, [
        { role: definitionProfile.pairLeftRole, value: left },
        { role: definitionProfile.pairRightRole, value: right },
      ]);
    } else if (definition.expression.kind === "sequence") {
      if (
        definitionProfile.sequenceForm === undefined ||
        definitionProfile.sequenceItemRole === undefined
      ) {
        return fail("invalid-expression");
      }
      body = builder.addOccurrence(
        definitionProfile.sequenceForm,
        definition.expression.items.map((name) => ({
          role: definitionProfile.sequenceItemRole!,
          value: reference(name),
        })),
      );
    } else {
      if (
        definitionProfile.equalityForm === undefined ||
        definitionProfile.equalityLeftRole === undefined ||
        definitionProfile.equalityRightRole === undefined
      ) {
        return fail("invalid-expression");
      }
      const left = equalityOperand(definition.expression.left);
      const right = equalityOperand(definition.expression.right);
      body = builder.addOccurrence(definitionProfile.equalityForm, [
        { role: definitionProfile.equalityLeftRole, value: left },
        { role: definitionProfile.equalityRightRole, value: right },
      ]);
    }

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

// Versioned strict JSON projection converges on the same native SyntaxAset.
export const V015_FORMAL_JSON_J1_SCHEMA = "mts-formal-json/v0.15-j1";
export const V015_FORMAL_JSON_J2_SCHEMA = "mts-formal-json/v0.15-j2";
export const V015_FORMAL_JSON_J3_SCHEMA = "mts-formal-json/v0.15-j3";

function jsonSchemaForProfile(
  profile: V015LinkDefinitionProfile,
  usesStructuredEqualityOperand = false,
): string {
  if (profile.equalityForm === undefined) return V015_FORMAL_JSON_J1_SCHEMA;
  return usesStructuredEqualityOperand
    ? V015_FORMAL_JSON_J3_SCHEMA
    : V015_FORMAL_JSON_J2_SCHEMA;
}

function jsonSchemaMatchesProfile(
  profile: V015LinkDefinitionProfile,
  schema: string,
): boolean {
  if (profile.equalityForm === undefined) {
    return schema === V015_FORMAL_JSON_J1_SCHEMA;
  }
  return (
    schema === V015_FORMAL_JSON_J2_SCHEMA ||
    schema === V015_FORMAL_JSON_J3_SCHEMA
  );
}

export type V015FormalJsonErrorCode =
  | "invalid-basis"
  | "invalid-utf8"
  | "invalid-json"
  | "duplicate-key"
  | "unsupported-profile"
  | "invalid-shape"
  | "invalid-name"
  | "duplicate-local-name"
  | "unsupported-source"
  | "nested-namespace"
  | "replay-wrote";

export class V015FormalJsonError extends Error {
  override readonly name = "V015FormalJsonError";
  constructor(readonly code: V015FormalJsonErrorCode) {
    super(code);
  }
}

export interface V015FormalJsonDecodeResult {
  readonly sourceAset: LinkHandle;
  readonly canonicalJson: Uint8Array;
}

type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | ReadonlyMap<string, JsonValue>;

function jsonFail(code: V015FormalJsonErrorCode): never {
  throw new V015FormalJsonError(code);
}

class StrictJsonReader {
  private index = 0;

  constructor(private readonly text: string) {}

  read(): JsonValue {
    this.space();
    const value = this.value();
    this.space();
    if (this.index !== this.text.length) jsonFail("invalid-json");
    return value;
  }

  private space(): void {
    while (
      this.index < this.text.length &&
      /[\x20\x09\x0a\x0d]/u.test(this.text[this.index]!)
    ) {
      this.index += 1;
    }
  }

  private value(): JsonValue {
    this.space();
    const ch = this.text[this.index];
    if (ch === "{") return this.object();
    if (ch === "[") return this.array();
    if (ch === "\"") return this.string();
    if (this.text.startsWith("true", this.index)) {
      this.index += 4;
      return true;
    }
    if (this.text.startsWith("false", this.index)) {
      this.index += 5;
      return false;
    }
    if (this.text.startsWith("null", this.index)) {
      this.index += 4;
      return null;
    }
    const match = this.text.slice(this.index).match(
      /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/u,
    );
    if (match?.[0] !== undefined) {
      this.index += match[0].length;
      return JSON.parse(match[0]) as number;
    }
    return jsonFail("invalid-json");
  }

  private string(): string {
    const start = this.index;
    if (this.text[this.index] !== "\"") return jsonFail("invalid-json");
    this.index += 1;
    while (this.index < this.text.length) {
      const ch = this.text[this.index];
      if (ch === "\"") {
        this.index += 1;
        try {
          const value = JSON.parse(
            this.text.slice(start, this.index),
          ) as unknown;
          if (typeof value !== "string") return jsonFail("invalid-json");
          return value;
        } catch {
          return jsonFail("invalid-json");
        }
      }
      if (ch === "\\") {
        this.index += 2;
      } else {
        this.index += 1;
      }
    }
    return jsonFail("invalid-json");
  }

  private object(): ReadonlyMap<string, JsonValue> {
    this.index += 1;
    this.space();
    const result = new Map<string, JsonValue>();
    if (this.text[this.index] === "}") {
      this.index += 1;
      return result;
    }
    while (true) {
      this.space();
      if (this.text[this.index] !== "\"") return jsonFail("invalid-json");
      const key = this.string();
      if (result.has(key)) return jsonFail("duplicate-key");
      this.space();
      if (this.text[this.index] !== ":") return jsonFail("invalid-json");
      this.index += 1;
      const value = this.value();
      result.set(key, value);
      this.space();
      const next = this.text[this.index];
      if (next === "}") {
        this.index += 1;
        return result;
      }
      if (next !== ",") return jsonFail("invalid-json");
      this.index += 1;
    }
  }

  private array(): readonly JsonValue[] {
    this.index += 1;
    this.space();
    const result: JsonValue[] = [];
    if (this.text[this.index] === "]") {
      this.index += 1;
      return Object.freeze(result);
    }
    while (true) {
      result.push(this.value());
      this.space();
      const next = this.text[this.index];
      if (next === "]") {
        this.index += 1;
        return Object.freeze(result);
      }
      if (next !== ",") return jsonFail("invalid-json");
      this.index += 1;
    }
  }
}

function object(value: JsonValue): ReadonlyMap<string, JsonValue> {
  if (!(value instanceof Map)) return jsonFail("invalid-shape");
  return value;
}

function array(value: JsonValue): readonly JsonValue[] {
  if (!Array.isArray(value)) return jsonFail("invalid-shape");
  return value;
}

function string(value: JsonValue): string {
  if (typeof value !== "string") return jsonFail("invalid-shape");
  return value;
}

function exactKeys(
  value: ReadonlyMap<string, JsonValue>,
  keys: readonly string[],
): void {
  if (
    value.size !== keys.length ||
    keys.some((key) => !value.has(key))
  ) {
    jsonFail("invalid-shape");
  }
}

function name(value: JsonValue): string {
  const result = string(value);
  if (!isV015FormalName(result)) jsonFail("invalid-name");
  return result;
}

function utf8Name(
  memory: ReadMemory,
  basis: RootBasis,
  carrier: LinkHandle,
): string {
  try {
    const bytes = readV012StringAnum(memory, basis, carrier).bytes;
    const result = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (!isV015FormalName(result)) jsonFail("invalid-name");
    return result;
  } catch (error) {
    if (error instanceof V015FormalJsonError) throw error;
    return jsonFail("unsupported-source");
  }
}

function oneField(
  occurrence: SyntaxAsetOccurrence,
  role: LinkHandle,
): LinkHandle {
  const values = occurrence.fields
    .filter((field) => field.role === role)
    .map((field) => field.value);
  if (values.length !== 1) jsonFail("unsupported-source");
  return values[0]!;
}

function nameRef(
  memory: ReadMemory,
  basis: RootBasis,
  occurrences: ReadonlyMap<LinkHandle, SyntaxAsetOccurrence>,
  profile: V015LinkDefinitionProfile,
  handle: LinkHandle,
): string {
  const occurrence = occurrences.get(handle) ?? jsonFail("unsupported-source");
  if (occurrence.kind !== profile.nameRefForm) jsonFail("unsupported-source");
  return utf8Name(
    memory,
    basis,
    oneField(occurrence, profile.referencedNameRole),
  );
}

function quote(value: string): string {
  return JSON.stringify(value);
}

export function encodeV015FormalSourceAsetJson(
  memory: ReadMemory,
  basis: RootBasis,
  grammarRoot: LinkHandle,
  sourceNamespaceProfileRoot: LinkHandle,
  definitionProfileRoot: LinkHandle,
  sourceAset: LinkHandle,
): Uint8Array {
  const before = memory.linkCount;
  try {
    let verified: RootBasis;
    try {
      verified = verifyRootBasis(memory, basis);
    } catch {
      return jsonFail("invalid-basis");
    }
    const grammar = readNativeSyntaxGrammar(memory, verified, grammarRoot);
    readSourceNamespaceProfile(
      memory,
      verified,
      grammarRoot,
      sourceNamespaceProfileRoot,
    );
    const profile = readV015LinkDefinitionProfile(
      memory,
      verified,
      grammarRoot,
      definitionProfileRoot,
    );
    const namespaces = readSourceNamespaces(
      memory,
      verified,
      grammarRoot,
      sourceNamespaceProfileRoot,
      sourceAset,
    );
    if (
      namespaces.declarations.some(
        (declaration) => declaration.namespace !== namespaces.rootNamespace,
      )
    ) {
      return jsonFail("nested-namespace");
    }
    const syntax = readSyntaxAset(
      memory,
      sourceAset,
      grammar.vocabulary,
    );
    const occurrences = new Map(
      syntax.occurrences.map((entry) => [entry.occurrence, entry]),
    );

    let usesStructuredEqualityOperand = false;
    const equalityOperand = (handle: LinkHandle): string => {
      const operand = occurrences.get(handle) ?? jsonFail("unsupported-source");
      if (operand.kind === profile.nameRefForm) {
        return quote(nameRef(
          memory,
          verified,
          occurrences,
          profile,
          handle,
        ));
      }
      if (operand.kind !== profile.pairForm) {
        return jsonFail("unsupported-source");
      }
      const left = nameRef(
        memory,
        verified,
        occurrences,
        profile,
        oneField(operand, profile.pairLeftRole),
      );
      const right = nameRef(
        memory,
        verified,
        occurrences,
        profile,
        oneField(operand, profile.pairRightRole),
      );
      usesStructuredEqualityOperand = true;
      return `{"pair":[${quote(left)},${quote(right)}]}`;
    };

    const entries = namespaces.declarations.map((declaration) => {
      const localName = utf8Name(memory, verified, declaration.nameCarrier);
      const body = occurrences.get(declaration.bodyOccurrence)
        ?? jsonFail("unsupported-source");

      let encodedValue: string;
      if (body.kind === profile.pairForm) {
        const left = nameRef(
          memory,
          verified,
          occurrences,
          profile,
          oneField(body, profile.pairLeftRole),
        );
        const right = nameRef(
          memory,
          verified,
          occurrences,
          profile,
          oneField(body, profile.pairRightRole),
        );
        encodedValue = `{"pair":[${quote(left)},${quote(right)}]}`;
      } else if (
        profile.sequenceForm !== undefined &&
        profile.sequenceItemRole !== undefined &&
        body.kind === profile.sequenceForm
      ) {
        const items = body.fields
          .filter((field) => field.role === profile.sequenceItemRole)
          .map((field) =>
            nameRef(memory, verified, occurrences, profile, field.value)
          );
        encodedValue =
          `{"sequence":[${items.map(quote).join(",")}]}`;
      } else if (
        profile.equalityForm !== undefined &&
        profile.equalityLeftRole !== undefined &&
        profile.equalityRightRole !== undefined &&
        body.kind === profile.equalityForm
      ) {
        const left = equalityOperand(
          oneField(body, profile.equalityLeftRole),
        );
        const right = equalityOperand(
          oneField(body, profile.equalityRightRole),
        );
        encodedValue =
          `{"equality":[${left},${right}]}`;
      } else {
        return jsonFail("unsupported-source");
      }
      return `{"name":${quote(localName)},"value":${encodedValue}}`;
    });

    const text =
      `{"schema":${quote(jsonSchemaForProfile(
        profile,
        usesStructuredEqualityOperand,
      ))},"entries":[${entries.join(",")}]}
`;
    return new TextEncoder().encode(text);
  } finally {
    if (memory.linkCount !== before) jsonFail("replay-wrote");
  }
}

export function decodeV015FormalSourceAsetJson(
  memory: WriteMemory,
  basis: RootBasis,
  grammarRoot: LinkHandle,
  sourceNamespaceProfileRoot: LinkHandle,
  definitionProfileRoot: LinkHandle,
  bytes: Uint8Array,
): V015FormalJsonDecodeResult {
  let verified: RootBasis;
  try {
    verified = verifyRootBasis(memory, basis);
  } catch {
    return jsonFail("invalid-basis");
  }

  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return jsonFail("invalid-utf8");
  }

  const root = object(new StrictJsonReader(text).read());
  exactKeys(root, ["schema", "entries"]);

  const grammar = readNativeSyntaxGrammar(memory, verified, grammarRoot);
  const namespaceProfile = readSourceNamespaceProfile(
    memory,
    verified,
    grammarRoot,
    sourceNamespaceProfileRoot,
  );
  const profile = readV015LinkDefinitionProfile(
    memory,
    verified,
    grammarRoot,
    definitionProfileRoot,
  );
  const schema = string(root.get("schema")!);
  if (!jsonSchemaMatchesProfile(profile, schema)) {
    jsonFail("unsupported-profile");
  }
  const allowsStructuredEqualityOperand =
    schema === V015_FORMAL_JSON_J3_SCHEMA;
  const entries = array(root.get("entries")!);
  const builder = new SyntaxAsetBuilder(memory, grammar.vocabulary);
  const nameCache = new Map<string, LinkHandle>();
  const nameCarrier = (value: string): LinkHandle => {
    const known = nameCache.get(value);
    if (known !== undefined) return known;
    const carrier = materializeV012StringAnum(
      memory,
      verified,
      new TextEncoder().encode(value),
    ).anumLink;
    nameCache.set(value, carrier);
    return carrier;
  };
  const ref = (value: string): LinkHandle =>
    builder.addOccurrence(profile.nameRefForm, [{
      role: profile.referencedNameRole,
      value: nameCarrier(value),
    }]);
  const equalityOperand = (value: JsonValue): LinkHandle => {
    if (typeof value === "string") return ref(name(value));
    if (!allowsStructuredEqualityOperand) return jsonFail("invalid-shape");
    const operand = object(value);
    exactKeys(operand, ["pair"]);
    const parts = array(operand.get("pair")!);
    if (parts.length !== 2) return jsonFail("invalid-shape");
    const left = ref(name(parts[0]!));
    const right = ref(name(parts[1]!));
    return builder.addOccurrence(profile.pairForm, [
      { role: profile.pairLeftRole, value: left },
      { role: profile.pairRightRole, value: right },
    ]);
  };

  const seenNames = new Set<string>();
  const declarations: LinkHandle[] = [];
  for (const entryValue of entries) {
    const entry = object(entryValue);
    exactKeys(entry, ["name", "value"]);
    const localName = name(entry.get("name")!);
    if (seenNames.has(localName)) jsonFail("duplicate-local-name");
    seenNames.add(localName);

    const value = object(entry.get("value")!);
    if (value.size !== 1) jsonFail("invalid-shape");
    let body: LinkHandle;
    if (value.has("pair")) {
      const parts = array(value.get("pair")!);
      if (parts.length !== 2) jsonFail("invalid-shape");
      const left = ref(name(parts[0]!));
      const right = ref(name(parts[1]!));
      body = builder.addOccurrence(profile.pairForm, [
        { role: profile.pairLeftRole, value: left },
        { role: profile.pairRightRole, value: right },
      ]);
    } else if (value.has("sequence")) {
      if (
        profile.sequenceForm === undefined ||
        profile.sequenceItemRole === undefined
      ) {
        return jsonFail("unsupported-source");
      }
      const items = array(value.get("sequence")!).map(name);
      body = builder.addOccurrence(
        profile.sequenceForm,
        items.map((item) => ({
          role: profile.sequenceItemRole!,
          value: ref(item),
        })),
      );
    } else if (value.has("equality")) {
      if (
        profile.equalityForm === undefined ||
        profile.equalityLeftRole === undefined ||
        profile.equalityRightRole === undefined
      ) {
        return jsonFail("unsupported-source");
      }
      const parts = array(value.get("equality")!);
      if (parts.length !== 2) jsonFail("invalid-shape");
      body = builder.addOccurrence(profile.equalityForm, [
        {
          role: profile.equalityLeftRole,
          value: equalityOperand(parts[0]!),
        },
        {
          role: profile.equalityRightRole,
          value: equalityOperand(parts[1]!),
        },
      ]);
    } else {
      return jsonFail("invalid-shape");
    }

    declarations.push(builder.addOccurrence(
      namespaceProfile.declarationForm,
      [
        {
          role: namespaceProfile.declarationNameRole,
          value: nameCarrier(localName),
        },
        {
          role: namespaceProfile.declarationBodyRole,
          value: body,
        },
      ],
    ));
  }

  const block = builder.addOccurrence(
    namespaceProfile.blockForm,
    declarations.map((value) => ({
      role: namespaceProfile.blockItemRole,
      value,
    })),
  );
  const sourceAset = builder.finish(block);
  readSourceNamespaces(
    memory,
    verified,
    grammarRoot,
    sourceNamespaceProfileRoot,
    sourceAset,
  );
  const canonicalJson = encodeV015FormalSourceAsetJson(
    memory,
    verified,
    grammarRoot,
    sourceNamespaceProfileRoot,
    definitionProfileRoot,
    sourceAset,
  );
  return Object.freeze({ sourceAset, canonicalJson });
}
