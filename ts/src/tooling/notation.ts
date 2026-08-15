const UNICODE_TO_ASCII = [
  ["¬⟼", "!->"],
  ["⟼", "->"],
  ["≠", "!="],
  ["¬", "!"],
  ["♂", "M"],
  ["♀", "F"],
  ["∞", "INF"],
] as const;

const ASCII_SYMBOL_TOKENS = [
  ["!->", "¬⟼"],
  ["->", "⟼"],
  ["!=", "≠"],
  ["!", "¬"],
] as const;

const ASCII_WORD_TOKENS = new Map<string, string>([
  ["INF", "∞"],
  ["M", "♂"],
  ["F", "♀"],
]);

function isWordChar(symbol: string): boolean {
  return /^[\p{L}\p{N}_]$/u.test(symbol);
}

function isPlainAlnum(symbol: string): boolean {
  return /^[\p{L}\p{N}]$/u.test(symbol) && !"♂♀∞⟼¬≠".includes(symbol);
}

export function unicodeToAscii(formula: string): string {
  const replacements = new Map<string, string>(UNICODE_TO_ASCII);
  const patterns = [...replacements.keys()].sort((left, right) => right.length - left.length);
  const parts: string[] = [];

  for (let index = 0; index < formula.length;) {
    let token: string | undefined;
    for (const pattern of patterns) {
      if (formula.startsWith(pattern, index)) {
        token = pattern;
        break;
      }
    }
    const source = token ?? formula[index]!;
    const replacement = replacements.get(source) ?? source;
    const previous = parts.at(-1);
    if (previous && replacement && isPlainAlnum(previous.at(-1)!) && isPlainAlnum(replacement[0]!)) {
      parts.push(" ");
    }
    parts.push(replacement);
    index += source.length;
  }
  return parts.join("");
}

export function asciiToUnicode(formula: string): string {
  const result: string[] = [];
  for (let index = 0; index < formula.length;) {
    let matched = false;
    for (const [source, replacement] of ASCII_SYMBOL_TOKENS) {
      if (formula.startsWith(source, index)) {
        result.push(replacement);
        index += source.length;
        matched = true;
        break;
      }
    }
    if (matched) continue;

    const symbol = formula[index]!;
    if (isWordChar(symbol)) {
      let end = index + 1;
      while (end < formula.length && isWordChar(formula[end]!)) end += 1;
      const word = formula.slice(index, end);
      result.push(ASCII_WORD_TOKENS.get(word) ?? word);
      index = end;
      continue;
    }
    result.push(symbol);
    index += 1;
  }
  return result.join("");
}

export function abitsToAprover(anum: string): string {
  return anum;
}

export function aproverToAbits(anum: string): string {
  return anum;
}
