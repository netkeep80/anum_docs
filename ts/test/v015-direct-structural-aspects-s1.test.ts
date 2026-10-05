import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
} from "../src/memory.js";
import {
  materializeNativeSyntaxGrammar,
  type NativeSyntaxGrammarRuleSpec,
} from "../src/native-syntax-grammar.js";
import {
  compileV015DirectFormalSourceAnet,
  V015DirectFormalSourceError,
} from "../src/v015-direct-formal-source.js";
import {
  compileV015DirectJsonSourceAnet,
  V015DirectJsonSourceError,
} from "../src/v015-direct-json-source.js";
import {
  materializeV015ContextualNamePath,
} from "../src/v015-link-definition.js";
import {
  denoteV015ResolvedSourceAnet,
  materializeV015SourceAnetProfile,
  type V015SourceAnetProfile,
} from "../src/v015-source-anet.js";
import {
  materializeV013HierarchicalCarrierFromSemanticLink,
  serializeV013HierarchicalCarrier,
} from "../src/v013-hierarchical-carrier.js";
import { materializeV012StringAnum } from "../src/v012-string-anum.js";

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error("v0.15 direct structural FORMAL: " + message);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(
    Object.is(actual, expected),
    message + ": " + String(actual) + " !== " + String(expected),
  );
}

const memory = new Memory();
const basis = ensureRootBasis(memory);
let cursor = memory.ensure(basis.U, basis.L);
const fresh = (): LinkHandle => {
  cursor = memory.ensureStartSelfClosed(cursor);
  return cursor;
};

const profile: V015SourceAnetProfile = Object.freeze({
  blockForm: fresh(),
  bareForm: fresh(),
  bindingForm: fresh(),
  bundleForm: fresh(),
  itemRole: fresh(),
  bareValueRole: fresh(),
  bindingNameRole: fresh(),
  bindingValueRole: fresh(),
  bundleAnchorRole: fresh(),
  bundleBodyRole: fresh(),
});

const rules: readonly NativeSyntaxGrammarRuleSpec[] = [
  {
    form: profile.blockForm,
    fields: [{ role: profile.itemRole, target: "child", min: 0, max: null }],
  },
  {
    form: profile.bareForm,
    fields: [{ role: profile.bareValueRole, target: "carrier", min: 1, max: 1 }],
  },
  {
    form: profile.bindingForm,
    fields: [
      { role: profile.bindingNameRole, target: "carrier", min: 1, max: 1 },
      { role: profile.bindingValueRole, target: "carrier", min: 1, max: 1 },
    ],
  },
  {
    form: profile.bundleForm,
    fields: [
      { role: profile.bundleAnchorRole, target: "carrier", min: 1, max: 1 },
      { role: profile.bundleBodyRole, target: "child", min: 1, max: 1 },
    ],
  },
];

const grammarRoot = materializeNativeSyntaxGrammar(memory, basis, {
  syntaxTag: fresh(),
  markerSeed: fresh(),
  rules,
});
const sourceAnetProfileRoot = materializeV015SourceAnetProfile(memory, profile);
const enc = new TextEncoder();

const carrier = (name: string): LinkHandle =>
  materializeV012StringAnum(memory, basis, enc.encode(name)).anumLink;

const absolute = (name: string): LinkHandle => {
  if (name === "R") return basis.R;
  return materializeV015ContextualNamePath(
    memory,
    basis,
    basis.R,
    [carrier(name)],
    true,
  );
};

const formal = [
  "{",
  "  Root : ∞,",
  "  Start : ♂A,",
  "  End : A♀,",
  "  Pair : A⟼B,",
  "  PairAscii : A->B,",
  "  Chain : A->B->C,",
  "  GroupedStart : ♂(Prev->Value)",
  "}",
].join("\n");

const json = JSON.stringify({
  Root: "∞",
  Start: "♂A",
  End: "A♀",
  Pair: "A⟼B",
  PairAscii: "A->B",
  Chain: "A->B->C",
  GroupedStart: "♂(Prev->Value)",
});

const f = compileV015DirectFormalSourceAnet(
  memory,
  basis,
  grammarRoot,
  sourceAnetProfileRoot,
  enc.encode(formal),
);
const j = compileV015DirectJsonSourceAnet(
  memory,
  basis,
  grammarRoot,
  sourceAnetProfileRoot,
  enc.encode(json),
);

same(
  f.sourceAset,
  j.sourceAset,
  "FORMAL/JSON reconstruct exact same source ANet for structural aspects",
);

const denotation = denoteV015ResolvedSourceAnet(
  memory,
  basis,
  grammarRoot,
  sourceAnetProfileRoot,
  f.sourceAset,
);

const rootBinding = (name: string): LinkHandle => {
  const binding = denotation.bindings.find(
    (candidate) =>
      candidate.coordinate === null &&
      candidate.name === absolute(name),
  );
  assert(binding !== undefined, "root binding " + name);
  return binding.value;
};

const A = absolute("A");
const B = absolute("B");
const C = absolute("C");
const Prev = absolute("Prev");
const Value = absolute("Value");

same(rootBinding("Root"), basis.R, "∞ lowers to ROOT");
same(
  rootBinding("Start"),
  memory.ensureStartSelfClosed(A),
  "♂A lowers to START(A)",
);
same(
  rootBinding("End"),
  memory.ensureEndSelfClosed(A),
  "A♀ lowers to END(A)",
);
same(rootBinding("Pair"), memory.ensure(A, B), "A⟼B lowers to PAIR(A,B)");
same(
  rootBinding("PairAscii"),
  memory.ensure(A, B),
  "ASCII A->B remains the same PAIR constructor",
);
same(
  rootBinding("Chain"),
  memory.ensure(memory.ensure(A, B), C),
  "A->B->C keeps Direct Sequential Association left fold",
);
same(
  rootBinding("GroupedStart"),
  memory.ensureStartSelfClosed(memory.ensure(Prev, Value)),
  "♂(Prev->Value) denotes one ExactSequence-style START cell pattern",
);

const recursive = (link: LinkHandle): string =>
  new TextDecoder().decode(
    serializeV013HierarchicalCarrier(
      memory,
      basis,
      materializeV013HierarchicalCarrierFromSemanticLink(memory, basis, link),
    ),
  );

same(recursive(rootBinding("Root")), "8", "ROOT recursive prefix");
assert(recursive(rootBinding("Start")).startsWith("9"), "START recursive prefix 9");
assert(recursive(rootBinding("End")).startsWith("6"), "END recursive prefix 6");
assert(recursive(rootBinding("Pair")).startsWith("1"), "PAIR recursive prefix 1");
assert(
  recursive(rootBinding("GroupedStart")).startsWith("91"),
  "START(PAIR(...)) recursive prefix 91",
);

assert(
  rootBinding("Start") !== rootBinding("End"),
  "START and END remain structurally distinct",
);

for (const [label, source] of [
  ["self", "{ A : A->B }"],
  ["mutual", "{ A : B, B : A }"],
] as const) {
  let formalRejected = false;
  try {
    compileV015DirectFormalSourceAnet(
      memory,
      basis,
      grammarRoot,
      sourceAnetProfileRoot,
      enc.encode(source),
    );
  } catch (error) {
    formalRejected =
      error instanceof V015DirectFormalSourceError &&
      error.code === "cyclic-binding";
  }
  assert(formalRejected, label + " FORMAL cyclic binding remains rejected");
}

for (const [label, source] of [
  ["self", JSON.stringify({ A: "A->B" })],
  ["mutual", JSON.stringify({ A: "B", B: "A" })],
] as const) {
  let jsonRejected = false;
  try {
    compileV015DirectJsonSourceAnet(
      memory,
      basis,
      grammarRoot,
      sourceAnetProfileRoot,
      enc.encode(source),
    );
  } catch (error) {
    jsonRejected =
      error instanceof V015DirectJsonSourceError &&
      error.code === "cyclic-binding";
  }
  assert(jsonRejected, label + " JSON cyclic binding remains rejected");
}

console.log([
  "MTS_V015_DIRECT_STRUCTURAL_ASPECTS=GREEN_RESEARCH",
  "FORMAL_JSON_NATIVE_SOURCE_PARITY=GREEN",
  "ROOT=8",
  "START_PREFIX=9",
  "END_PREFIX=6",
  "PAIR_PREFIX=1",
  "GROUPED_START_PAIR_PREFIX=91",
  "DAS_LEFT_FOLD=GREEN",
  "ARBITRARY_CYCLIC_BINDING=REJECTED",
  "PROOF_SPECIFIC_GRAMMAR=0",
].join(" "));
