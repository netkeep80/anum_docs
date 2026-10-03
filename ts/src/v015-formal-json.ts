import {
  verifyRootBasis,
  type LinkHandle,
  type ReadMemory,
  type RootBasis,
  type WriteMemory,
} from "./memory.js";
import { readNativeSyntaxGrammar } from "./native-syntax-grammar.js";
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
import { isV015FormalName } from "./v015-formal-decoder.js";

export const V015_FORMAL_JSON_J1_SCHEMA = "mts-formal-json/v0.15-j1";

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

function fail(code: V015FormalJsonErrorCode): never {
  throw new V015FormalJsonError(code);
}

class StrictJsonReader {
  private index = 0;

  constructor(private readonly text: string) {}

  read(): JsonValue {
    this.space();
    const value = this.value();
    this.space();
    if (this.index !== this.text.length) fail("invalid-json");
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
    if (ch === """) return this.string();
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
    return fail("invalid-json");
  }

  private string(): string {
    const start = this.index;
    if (this.text[this.index] !== """) return fail("invalid-json");
    this.index += 1;
    while (this.index < this.text.length) {
      const ch = this.text[this.index];
      if (ch === """) {
        this.index += 1;
        try {
          const value = JSON.parse(
            this.text.slice(start, this.index),
          ) as unknown;
          if (typeof value !== "string") return fail("invalid-json");
          return value;
        } catch {
          return fail("invalid-json");
        }
      }
      if (ch === "\\") {
        this.index += 2;
      } else {
        this.index += 1;
      }
    }
    return fail("invalid-json");
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
      if (this.text[this.index] !== """) return fail("invalid-json");
      const key = this.string();
      if (result.has(key)) return fail("duplicate-key");
      this.space();
      if (this.text[this.index] !== ":") return fail("invalid-json");
      this.index += 1;
      const value = this.value();
      result.set(key, value);
      this.space();
      const next = this.text[this.index];
      if (next === "}") {
        this.index += 1;
        return result;
      }
      if (next !== ",") return fail("invalid-json");
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
      if (next !== ",") return fail("invalid-json");
      this.index += 1;
    }
  }
}

function object(value: JsonValue): ReadonlyMap<string, JsonValue> {
  if (!(value instanceof Map)) return fail("invalid-shape");
  return value;
}

function array(value: JsonValue): readonly JsonValue[] {
  if (!Array.isArray(value)) return fail("invalid-shape");
  return value;
}

function string(value: JsonValue): string {
  if (typeof value !== "string") return fail("invalid-shape");
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
    fail("invalid-shape");
  }
}

function name(value: JsonValue): string {
  const result = string(value);
  if (!isV015FormalName(result)) fail("invalid-name");
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
    if (!isV015FormalName(result)) fail("invalid-name");
    return result;
  } catch (error) {
    if (error instanceof V015FormalJsonError) throw error;
    return fail("unsupported-source");
  }
}

function oneField(
  occurrence: SyntaxAsetOccurrence,
  role: LinkHandle,
): LinkHandle {
  const values = occurrence.fields
    .filter((field) => field.role === role)
    .map((field) => field.value);
  if (values.length !== 1) fail("unsupported-source");
  return values[0]!;
}

function nameRef(
  memory: ReadMemory,
  basis: RootBasis,
  occurrences: ReadonlyMap<LinkHandle, SyntaxAsetOccurrence>,
  profile: V015LinkDefinitionProfile,
  handle: LinkHandle,
): string {
  const occurrence = occurrences.get(handle) ?? fail("unsupported-source");
  if (occurrence.kind !== profile.nameRefForm) fail("unsupported-source");
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
      return fail("invalid-basis");
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
      return fail("nested-namespace");
    }
    const syntax = readSyntaxAset(
      memory,
      sourceAset,
      grammar.vocabulary,
    );
    const occurrences = new Map(
      syntax.occurrences.map((entry) => [entry.occurrence, entry]),
    );

    const entries = namespaces.declarations.map((declaration) => {
      const localName = utf8Name(memory, verified, declaration.nameCarrier);
      const body = occurrences.get(declaration.bodyOccurrence)
        ?? fail("unsupported-source");

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
      } else {
        return fail("unsupported-source");
      }
      return `{"name":${quote(localName)},"value":${encodedValue}}`;
    });

    const text =
      `{"schema":${quote(V015_FORMAL_JSON_J1_SCHEMA)},"entries":[${entries.join(",")}]}
`;
    return new TextEncoder().encode(text);
  } finally {
    if (memory.linkCount !== before) fail("replay-wrote");
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
    return fail("invalid-basis");
  }

  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return fail("invalid-utf8");
  }

  const root = object(new StrictJsonReader(text).read());
  exactKeys(root, ["schema", "entries"]);
  if (string(root.get("schema")!) !== V015_FORMAL_JSON_J1_SCHEMA) {
    fail("unsupported-profile");
  }
  const entries = array(root.get("entries")!);

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

  const seenNames = new Set<string>();
  const declarations: LinkHandle[] = [];
  for (const entryValue of entries) {
    const entry = object(entryValue);
    exactKeys(entry, ["name", "value"]);
    const localName = name(entry.get("name")!);
    if (seenNames.has(localName)) fail("duplicate-local-name");
    seenNames.add(localName);

    const value = object(entry.get("value")!);
    if (value.size !== 1) fail("invalid-shape");
    let body: LinkHandle;
    if (value.has("pair")) {
      const parts = array(value.get("pair")!);
      if (parts.length !== 2) fail("invalid-shape");
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
        return fail("unsupported-source");
      }
      const items = array(value.get("sequence")!).map(name);
      body = builder.addOccurrence(
        profile.sequenceForm,
        items.map((item) => ({
          role: profile.sequenceItemRole!,
          value: ref(item),
        })),
      );
    } else {
      return fail("invalid-shape");
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
