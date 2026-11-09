type UnaryFixity = "prefix" | "postfix";
type PairFixity = "prefix" | "postfix" | "infix";

type Term =
  | Readonly<{ kind: "ROOT" }>
  | Readonly<{ kind: "START"; child: Term }>
  | Readonly<{ kind: "END"; child: Term }>
  | Readonly<{ kind: "PAIR"; left: Term; right: Term }>;

interface Scheme {
  readonly start: UnaryFixity;
  readonly end: UnaryFixity;
  readonly pair: PairFixity;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.13 A7 fixity: ${message}`);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: expected ${String(expected)}, got ${String(actual)}`);
}

const ROOT: Term = Object.freeze({ kind: "ROOT" });

function start(child: Term): Term {
  return Object.freeze({ kind: "START", child });
}

function end(child: Term): Term {
  return Object.freeze({ kind: "END", child });
}

function pair(left: Term, right: Term): Term {
  return Object.freeze({ kind: "PAIR", left, right });
}

function key(term: Term): string {
  if (term.kind === "ROOT") return "R";
  if (term.kind === "START") return `S(${key(term.child)})`;
  if (term.kind === "END") return `E(${key(term.child)})`;
  return `P(${key(term.left)},${key(term.right)})`;
}

function nodeCount(term: Term): number {
  if (term.kind === "ROOT") return 1;
  if (term.kind === "START" || term.kind === "END") {
    return 1 + nodeCount(term.child);
  }
  return 1 + nodeCount(term.left) + nodeCount(term.right);
}

function encode(term: Term, scheme: Scheme): string {
  if (term.kind === "ROOT") return "8";

  if (term.kind === "START") {
    const child = encode(term.child, scheme);
    return scheme.start === "prefix" ? `9${child}` : `${child}9`;
  }

  if (term.kind === "END") {
    const child = encode(term.child, scheme);
    return scheme.end === "prefix" ? `6${child}` : `${child}6`;
  }

  const left = encode(term.left, scheme);
  const right = encode(term.right, scheme);
  if (scheme.pair === "prefix") return `1${left}${right}`;
  if (scheme.pair === "postfix") return `${left}${right}1`;
  return `${left}1${right}`;
}

const memo = new Map<number, readonly Term[]>();

function termsOfSize(size: number): readonly Term[] {
  const cached = memo.get(size);
  if (cached !== undefined) return cached;

  const result: Term[] = [];
  if (size === 1) {
    result.push(ROOT);
  } else {
    for (const child of termsOfSize(size - 1)) {
      result.push(start(child), end(child));
    }
    for (let leftSize = 1; leftSize <= size - 2; leftSize += 1) {
      const rightSize = size - 1 - leftSize;
      for (const left of termsOfSize(leftSize)) {
        for (const right of termsOfSize(rightSize)) {
          result.push(pair(left, right));
        }
      }
    }
  }

  const frozen = Object.freeze(result);
  memo.set(size, frozen);
  return frozen;
}

function boundedTerms(maxSize: number): readonly Term[] {
  const result: Term[] = [];
  for (let size = 1; size <= maxSize; size += 1) {
    result.push(...termsOfSize(size));
  }
  return Object.freeze(result);
}

interface Collision {
  readonly wire: string;
  readonly first: Term;
  readonly second: Term;
}

function firstCollision(terms: readonly Term[], scheme: Scheme): Collision | undefined {
  const seen = new Map<string, Term>();
  for (const term of terms) {
    const wire = encode(term, scheme);
    const previous = seen.get(wire);
    if (previous !== undefined && key(previous) !== key(term)) {
      return Object.freeze({ wire, first: previous, second: term });
    }
    seen.set(wire, term);
  }
  return undefined;
}

function parsePrefix(wire: string): Term {
  let offset = 0;

  const parse = (): Term => {
    assert(offset < wire.length, "prefix source ended inside a term");
    const symbol = wire[offset++]!;
    if (symbol === "8") return ROOT;
    if (symbol === "9") return start(parse());
    if (symbol === "6") return end(parse());
    if (symbol === "1") return pair(parse(), parse());
    throw new Error("v0.13 A7 fixity: invalid prefix symbol");
  };

  const result = parse();
  same(offset, wire.length, "prefix parser consumes exactly one term");
  return result;
}

function parsePostfix(wire: string): Term {
  const stack: Term[] = [];
  for (const symbol of wire) {
    if (symbol === "8") {
      stack.push(ROOT);
      continue;
    }

    if (symbol === "9" || symbol === "6") {
      const child = stack.pop();
      assert(child !== undefined, "postfix unary operator has an operand");
      stack.push(symbol === "9" ? start(child) : end(child));
      continue;
    }

    if (symbol === "1") {
      const right = stack.pop();
      const left = stack.pop();
      assert(left !== undefined && right !== undefined, "postfix PAIR has two operands");
      stack.push(pair(left, right));
      continue;
    }

    throw new Error("v0.13 A7 fixity: invalid postfix symbol");
  }

  same(stack.length, 1, "postfix parser leaves exactly one term");
  return stack[0]!;
}

const prefix: Scheme = Object.freeze({
  start: "prefix",
  end: "prefix",
  pair: "prefix",
});

const postfix: Scheme = Object.freeze({
  start: "postfix",
  end: "postfix",
  pair: "postfix",
});

// Current v0.13 foundation witnesses and their pure-postfix dual.
same(encode(ROOT, prefix), "8", "prefix R");
same(encode(start(ROOT), prefix), "98", "prefix O");
same(encode(end(ROOT), prefix), "68", "prefix C");
same(encode(pair(start(ROOT), end(ROOT)), prefix), "19868", "prefix L");

same(encode(ROOT, postfix), "8", "postfix R");
same(encode(start(ROOT), postfix), "89", "postfix O");
same(encode(end(ROOT), postfix), "86", "postfix C");
same(encode(pair(start(ROOT), end(ROOT)), postfix), "89861", "postfix L");

const terms = boundedTerms(8);

// Any static fixity assignment considered here emits exactly one natural
// ROOT/START/END/PAIR sign per constructor node. Fixity alone therefore cannot
// reduce abit count.
for (const startFixity of ["prefix", "postfix"] as const) {
  for (const endFixity of ["prefix", "postfix"] as const) {
    for (const pairFixity of ["prefix", "postfix", "infix"] as const) {
      const scheme: Scheme = Object.freeze({
        start: startFixity,
        end: endFixity,
        pair: pairFixity,
      });
      for (const term of terms) {
        same(
          encode(term, scheme).length,
          nodeCount(term),
          `${startFixity}/${endFixity}/${pairFixity} keeps one abit per constructor`,
        );
      }
    }
  }
}

// Pure prefix and pure postfix are both self-delimiting from the ranked arities.
// Bounded enumeration supplements the general recursive/stack parsing argument.
same(firstCollision(terms, prefix), undefined, "pure prefix has no bounded collision");
same(firstCollision(terms, postfix), undefined, "pure postfix has no bounded collision");

for (const term of terms) {
  same(key(parsePrefix(encode(term, prefix))), key(term), "prefix round-trip");
  same(key(parsePostfix(encode(term, postfix))), key(term), "postfix round-trip");
}

// Exhaust all other independent static fixity assignments. Every naive mixed
// assignment is already ambiguous on a tree of at most four constructor nodes.
// Additional parentheses/framing/context could disambiguate them, but then that
// additional information must itself be counted or structurally justified.
let ambiguousMixedSchemes = 0;
for (const startFixity of ["prefix", "postfix"] as const) {
  for (const endFixity of ["prefix", "postfix"] as const) {
    for (const pairFixity of ["prefix", "postfix", "infix"] as const) {
      const scheme: Scheme = Object.freeze({
        start: startFixity,
        end: endFixity,
        pair: pairFixity,
      });
      const isPurePrefix =
        startFixity === "prefix" &&
        endFixity === "prefix" &&
        pairFixity === "prefix";
      const isPurePostfix =
        startFixity === "postfix" &&
        endFixity === "postfix" &&
        pairFixity === "postfix";
      if (isPurePrefix || isPurePostfix) continue;

      const collision = firstCollision(boundedTerms(4), scheme);
      assert(
        collision !== undefined,
        `mixed ${startFixity}/${endFixity}/${pairFixity} must have a <=4-node collision`,
      );
      ambiguousMixedSchemes += 1;
    }
  }
}
same(ambiguousMixedSchemes, 10, "all ten naive mixed static fixity schemes are falsified");

// Representative collisions make the ambiguity mechanism explicit.
same(
  encode(end(start(ROOT)), { start: "prefix", end: "postfix", pair: "prefix" }),
  encode(start(end(ROOT)), { start: "prefix", end: "postfix", pair: "prefix" }),
  "opposed unary fixity collision 986",
);
same(
  encode(start(pair(ROOT, ROOT)), { start: "prefix", end: "prefix", pair: "infix" }),
  encode(pair(start(ROOT), ROOT), { start: "prefix", end: "prefix", pair: "infix" }),
  "prefix-unary/infix-pair collision 9818",
);

// This witness classifies the finite TREE CARRIER syntax only. It deliberately
// makes no claim that semantic Link topology or nested-aset containment must be
// a tree or acyclic. #1270 tracks shared/cyclic semantic topology separately.
console.log(
  "MTS v0.13 A7 static fixity classification: pure prefix/postfix are equal-length and self-delimiting; all ten naive mixed assignments are ambiguous without extra framing/context: GREEN.",
);
