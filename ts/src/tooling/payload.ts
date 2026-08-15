export interface TextToAnumDetail {
  readonly char: string;
  readonly codepoint: string;
  readonly utf8Bytes: readonly string[];
  readonly utf8Binary: readonly string[];
  readonly anum: string;
}

export interface AnumToTextDetail {
  readonly anum: string;
  readonly abits: string;
  readonly utf8Bytes: readonly string[];
  readonly codepoint: string;
  readonly char: string;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

function hexByte(value: number): string {
  return `0x${value.toString(16).toUpperCase().padStart(2, "0")}`;
}

function codepoint(value: string): string {
  const point = value.codePointAt(0);
  if (point === undefined) throw new Error("empty character");
  return `U+${point.toString(16).toUpperCase().padStart(4, "0")}`;
}

export function byteToAbits(value: number): string {
  if (!Number.isInteger(value) || value < 0 || value > 255) {
    throw new RangeError(`Ожидается значение байта 0–255, получено: ${String(value)}`);
  }
  return value.toString(2).padStart(8, "0");
}

export function abitsToByte(abits: string): number {
  if (abits.length !== 8) {
    throw new RangeError(`Ожидается 8 абитов, получено ${abits.length}: ${JSON.stringify(abits)}`);
  }
  if (!/^[01]{8}$/.test(abits)) {
    throw new RangeError(`Недопустимая абитовая восьмёрка: ${JSON.stringify(abits)}`);
  }
  return Number.parseInt(abits, 2);
}

export function charToAnum(char: string): string {
  if ([...char].length !== 1) throw new RangeError("Ожидается ровно один Unicode-символ");
  const bytes = encoder.encode(char);
  return `[${Array.from(bytes, byteToAbits).join("")}]`;
}

export function textToAnum(text: string): string {
  return [...text].map(charToAnum).join("");
}

export function textToAnumVerbose(text: string): readonly TextToAnumDetail[] {
  return Object.freeze([...text].map((char) => {
    const bytes = [...encoder.encode(char)];
    return Object.freeze({
      char,
      codepoint: codepoint(char),
      utf8Bytes: Object.freeze(bytes.map(hexByte)),
      utf8Binary: Object.freeze(bytes.map(byteToAbits)),
      anum: charToAnum(char),
    });
  }));
}

export function extractCharAnums(anum: string): readonly string[] {
  const groups: string[] = [];
  let depth = 0;
  let current = "";

  for (const symbol of anum) {
    if (symbol === "[") {
      depth += 1;
      if (depth > 1) current += symbol;
      continue;
    }
    if (symbol === "]") {
      depth -= 1;
      if (depth < 0) throw new RangeError("Лишняя закрывающая скобка ]");
      if (depth === 0) {
        groups.push(current);
        current = "";
      } else {
        current += symbol;
      }
      continue;
    }
    if (symbol === "0" || symbol === "1") {
      if (depth === 0) throw new RangeError(`Абит ${JSON.stringify(symbol)} вне контекста`);
      current += symbol;
      continue;
    }
    if (/\s/u.test(symbol)) continue;
    throw new RangeError(`Недопустимый символ: ${JSON.stringify(symbol)}`);
  }

  if (depth !== 0) throw new RangeError(`Незакрытые скобки []: глубина = ${depth}`);
  return Object.freeze(groups);
}

export function anumToChar(abits: string): string {
  if (abits.length === 0 || abits.length % 8 !== 0) {
    throw new RangeError(`Длина абитов (${abits.length}) должна быть ненулевой и кратной 8`);
  }
  const bytes: number[] = [];
  for (let index = 0; index < abits.length; index += 8) {
    bytes.push(abitsToByte(abits.slice(index, index + 8)));
  }
  let value: string;
  try {
    value = decoder.decode(Uint8Array.from(bytes));
  } catch {
    throw new RangeError("Ачисло символа содержит некорректную UTF-8 последовательность");
  }
  if ([...value].length !== 1) {
    throw new RangeError(`Ожидается ровно один UTF-8 символ, декодировано: ${[...value].length}`);
  }
  return value;
}

export function anumToText(anum: string): string {
  return extractCharAnums(anum).map(anumToChar).join("");
}

export function anumToTextVerbose(anum: string): readonly AnumToTextDetail[] {
  return Object.freeze(extractCharAnums(anum).map((abits) => {
    const bytes: number[] = [];
    for (let index = 0; index < abits.length; index += 8) {
      bytes.push(abitsToByte(abits.slice(index, index + 8)));
    }
    const char = anumToChar(abits);
    return Object.freeze({
      anum: `[${abits}]`,
      abits,
      utf8Bytes: Object.freeze(bytes.map(hexByte)),
      codepoint: codepoint(char),
      char,
    });
  }));
}
