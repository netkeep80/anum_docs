import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  materializeExactSequence,
  readExactSequence,
} from "../src/exact-sequence.js";
import {
  readStructuralDerivationRule,
} from "../src/derivation.js";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
  type RootBasis,
} from "../src/memory.js";
import {
  materializeNativeSyntaxGrammar,
  type NativeSyntaxGrammarRuleSpec,
} from "../src/native-syntax-grammar.js";
import {
  exportPortableClosedRootedProof,
} from "../src/portable-closed-rooted-proof.js";
import { replayStructuralRootedProofAset } from "../src/rooted-proof-aset.js";
import { materializeSourceNamespaceProfile } from "../src/source-namespace.js";
import {
  readStructuralRule,
} from "../src/structural-rule.js";
import {
  decodeV015FormalDefinitions,
  decodeV015FormalSourceAsetJson,
  encodeV015FormalSourceAsetJson,
} from "../src/v015-formal-decoder.js";
import {
  materializeV015LinkDefinitionProfile,
  materializeV015LinkDefinitions,
} from "../src/v015-link-definition.js";
import {
  materializeV015OpenProofDenotation,
} from "../src/v015-proof-source.js";
import { materializeV012StringAnum } from "../src/v012-string-anum.js";
import {
  materializeV013HierarchicalCarrierFromSemanticLink,
  serializeV013HierarchicalCarrier,
} from "../src/v013-hierarchical-carrier.js";

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(`v0.15 B14b FND-08/FND-09 OPEN proof: ${message}`);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(
    Object.is(actual, expected),
    `${message}: ${String(actual)} !== ${String(expected)}`,
  );
}

function sameMembers(
  actual: readonly LinkHandle[],
  expected: readonly LinkHandle[],
  message: string,
): void {
  same(actual.length, expected.length, `${message}: cardinality`);
  expected.forEach((value) => {
    assert(actual.includes(value), `${message}: missing expected member`);
  });
}

interface Fixture {
  readonly memory: Memory;
  readonly basis: RootBasis;
  readonly grammarRoot: LinkHandle;
  readonly namespaceProfileRoot: LinkHandle;
  readonly definitionProfileRoot: LinkHandle;
}

function fixture(): Fixture {
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  let cursor = memory.ensure(basis.U, basis.L);
  const fresh = (): LinkHandle => (
    cursor = memory.ensure(cursor, basis.C)
  );

  const syntaxTag = fresh();
  const markerSeed = fresh();
  const pairForm = fresh();
  const nameRefForm = fresh();
  const declarationForm = fresh();
  const blockForm = fresh();
  const sequenceForm = fresh();
  const pairLeftRole = fresh();
  const pairRightRole = fresh();
  const referencedNameRole = fresh();
  const declarationNameRole = fresh();
  const declarationBodyRole = fresh();
  const blockItemRole = fresh();
  const sequenceItemRole = fresh();

  const rules: readonly NativeSyntaxGrammarRuleSpec[] = [
    {
      form: pairForm,
      fields: [
        { role: pairLeftRole, target: "child", min: 1, max: 1 },
        { role: pairRightRole, target: "child", min: 1, max: 1 },
      ],
    },
    {
      form: nameRefForm,
      fields: [{ role: referencedNameRole, target: "carrier", min: 1, max: 1 }],
    },
    {
      form: declarationForm,
      fields: [
        { role: declarationNameRole, target: "carrier", min: 1, max: 1 },
        { role: declarationBodyRole, target: "child", min: 1, max: 1 },
      ],
    },
    {
      form: blockForm,
      fields: [{ role: blockItemRole, target: "child", min: 0, max: null }],
    },
    {
      form: sequenceForm,
      fields: [{ role: sequenceItemRole, target: "child", min: 0, max: null }],
    },
  ];

  const grammarRoot = materializeNativeSyntaxGrammar(
    memory,
    basis,
    { syntaxTag, markerSeed, rules },
  );
  const namespaceProfileRoot = materializeSourceNamespaceProfile(
    memory,
    {
      blockForm,
      declarationForm,
      blockItemRole,
      declarationNameRole,
      declarationBodyRole,
    },
  );
  const definitionProfileRoot = materializeV015LinkDefinitionProfile(
    memory,
    {
      pairForm,
      nameRefForm,
      pairLeftRole,
      pairRightRole,
      referencedNameRole,
      sequenceForm,
      sequenceItemRole,
    },
  );

  return Object.freeze({
    memory,
    basis,
    grammarRoot,
    namespaceProfileRoot,
    definitionProfileRoot,
  });
}

const enc = new TextEncoder();

const commonPrefix = [
  "R : R->R",
  "O : O->R",
  "C : R->C",
  "L : O->C",
  "U : C->O",

  "THEORY : C->U",
  "FOREIGN_THEORY : THEORY->U",

  "CURRENT_SCOPE : L->U",
  "NEXT_SCOPE : CURRENT_SCOPE->O",
  "K0 : NEXT_SCOPE->O",
  "SELECTED_THEORY : K0->O",
  "MATCHES_REL : SELECTED_THEORY->O",
  "EMITS_REL : MATCHES_REL->O",
  "REACTED_VALUE : EMITS_REL->O",
  "A0 : REACTED_VALUE->O",
  "A1 : A0->O",
  "B0 : A1->O",
  "B1 : B0->O",
  "B2 : B1->O",

  "SEM_TAG : B2->O",
  "BOUNDARY_TAG : SEM_TAG->O",
  "NO_MATCH_TAG : BOUNDARY_TAG->O",
  "ZERO_TAG : NO_MATCH_TAG->O",
  "ONE_TAG : ZERO_TAG->O",
  "MANY_TAG : ONE_TAG->O",
  "N_TO_ONE_TAG : MANY_TAG->O",
  "POSITIVE_TAG : N_TO_ONE_TAG->O",
  "ACTIVE_ID_TAG : POSITIVE_TAG->O",
  "LOCAL_ZERO_TAG : ACTIVE_ID_TAG->O",
];

const proofProfile = [
  "PROFILE_SEED : LOCAL_ZERO_TAG->O",
  "DICT_TAG : PROFILE_SEED->O",
  "RULE_TAG : DICT_TAG->O",
  "DR_TAG : RULE_TAG->O",
  "MAP_TAG : DR_TAG->O",
  "MORPH_TAG : MAP_TAG->O",
  "GENERIC_TAG : MORPH_TAG->O",
  "BIND_TAG : GENERIC_TAG->O",
  "OPEN_TAG : BIND_TAG->O",
  "PRIM_TAG : OPEN_TAG->O",
  "COORD_TAG : PRIM_TAG->O",
  "DISCHARGE_TAG : COORD_TAG->O",
  "PROOF_PROFILE : [DICT_TAG,RULE_TAG,DR_TAG,MAP_TAG,MORPH_TAG,GENERIC_TAG,BIND_TAG,OPEN_TAG,PRIM_TAG,COORD_TAG,DISCHARGE_TAG]",
];

function claim(name: string, tag: string, args: readonly string[]): readonly string[] {
  return [
    `${name}_ARGS : [${args.join(",")}]`,
    `${name} : ${tag}->${name}_ARGS`,
  ];
}

function mappingLines(
  globalRoles: readonly string[],
  localRoles: readonly string[],
): readonly string[] {
  same(globalRoles.length, localRoles.length, "mapping role arity");
  const lines: string[] = [];
  const maps: string[] = [];
  for (let i = 0; i < globalRoles.length; i += 1) {
    const global = globalRoles[i]!;
    const local = localRoles[i]!;
    const id = `M${i}`;
    lines.push(`${id}_DATA : [${local},${global}]`);
    lines.push(`${id} : MAP_TAG->${id}_DATA`);
    maps.push(id);
  }
  lines.push(`MAPPINGS : [${maps.join(",")}]`);
  return lines;
}

function bindingLines(
  globalRoles: readonly string[],
  concrete: readonly string[],
): readonly string[] {
  same(globalRoles.length, concrete.length, "binding role arity");
  const lines: string[] = [];
  const bindings: string[] = [];
  for (let i = 0; i < globalRoles.length; i += 1) {
    const role = globalRoles[i]!;
    const value = concrete[i]!;
    const id = `BIND${i}`;
    lines.push(`${id}_DATA : [${role},${value}]`);
    lines.push(`${id} : BIND_TAG->${id}_DATA`);
    bindings.push(id);
  }
  lines.push(`BINDINGS : [${bindings.join(",")}]`);
  return lines;
}

interface ProofScaffoldSpec {
  readonly prelude: readonly string[];
  readonly globalRoles: readonly string[];
  readonly localRoles: readonly string[];
  readonly concrete: readonly string[];
  readonly targetConclusion: string;
  readonly localConclusion: string;
  readonly targetPremises: readonly string[];
  readonly localPremises: readonly string[];
}

function scaffold(spec: ProofScaffoldSpec): string {
  return [
    ...commonPrefix,
    ...proofProfile,
    ...spec.prelude,
    `GLOBAL_ROLES : [${spec.globalRoles.join(",")}]`,
    "GLOBAL_DICT : DICT_TAG->GLOBAL_ROLES",
    `TARGET_RULE_DATA : [GLOBAL_DICT,${spec.targetConclusion}]`,
    "TARGET_RULE : RULE_TAG->TARGET_RULE_DATA",
    `TARGET_PREMISES : [${spec.targetPremises.join(",")}]`,
    "TARGET_DR_DATA : [TARGET_RULE,TARGET_PREMISES]",
    "TARGET_DR : DR_TAG->TARGET_DR_DATA",
    `LOCAL_ROLES : [${spec.localRoles.join(",")}]`,
    "LOCAL_DICT : DICT_TAG->LOCAL_ROLES",
    `LOCAL_RULE_DATA : [LOCAL_DICT,${spec.localConclusion}]`,
    "LOCAL_RULE : RULE_TAG->LOCAL_RULE_DATA",
    `LOCAL_PREMISES : [${spec.localPremises.join(",")}]`,
    "LOCAL_DR_DATA : [LOCAL_RULE,LOCAL_PREMISES]",
    "LOCAL_DR : DR_TAG->LOCAL_DR_DATA",
    ...mappingLines(spec.globalRoles, spec.localRoles),
    "MORPH_DATA : [THEORY,LOCAL_DICT,GLOBAL_DICT,MAPPINGS]",
    "MORPH : MORPH_TAG->MORPH_DATA",
    "GENERIC_DATA : [TARGET_DR,THEORY,LOCAL_DR,MORPH]",
    "GENERIC : GENERIC_TAG->GENERIC_DATA",
    ...bindingLines(spec.globalRoles, spec.concrete),
    "OPEN_DATA : [GENERIC,BINDINGS]",
    "OPEN_PROOF : OPEN_TAG->OPEN_DATA",
    "ENTRY : [PROOF_PROFILE,OPEN_PROOF]",
  ].join("\n");
}

const fnd08Global = [
  "G_CUR", "G_NEXT", "G_K", "G_SEL", "G_MATCH", "G_EMIT",
  "G_REACT", "G_A", "G_B",
] as const;
const fnd08Local = [
  "l_cur", "l_next", "l_k", "l_sel", "l_match", "l_emit",
  "l_react", "l_a", "l_b",
] as const;
const fnd08Concrete = [
  "CURRENT_SCOPE", "NEXT_SCOPE", "K0", "SELECTED_THEORY", "MATCHES_REL",
  "EMITS_REL", "REACTED_VALUE", "A0", "B0",
] as const;

const fnd08Prelude = [
  "G_CUR : A0->R",
  "G_NEXT : G_CUR->R",
  "G_K : G_NEXT->R",
  "G_SEL : G_K->R",
  "G_MATCH : G_SEL->R",
  "G_EMIT : G_MATCH->R",
  "G_REACT : G_EMIT->R",
  "G_A : G_REACT->R",
  "G_B : G_A->R",
  "l_cur : G_B->R",
  "l_next : l_cur->R",
  "l_k : l_next->R",
  "l_sel : l_k->R",
  "l_match : l_sel->R",
  "l_emit : l_match->R",
  "l_react : l_emit->R",
  "l_a : l_react->R",
  "l_b : l_a->R",
  ...claim("G_SEM", "SEM_TAG", [
    "G_CUR", "G_NEXT", "G_K", "G_SEL", "G_MATCH", "G_EMIT", "G_REACT",
  ]),
  ...claim("G_BOUNDARY", "BOUNDARY_TAG", ["G_CUR", "G_K", "G_A"]),
  ...claim("G_NO_MATCH", "NO_MATCH_TAG", [
    "G_CUR", "G_NEXT", "G_K", "G_SEL", "G_MATCH", "G_A",
  ]),
  ...claim("G_IMAGE", "POSITIVE_TAG", [
    "G_CUR", "G_NEXT", "G_K", "G_SEL", "G_MATCH", "G_EMIT", "G_A", "G_B",
  ]),
  ...claim("G_REACTED", "ACTIVE_ID_TAG", [
    "G_CUR", "G_K", "G_SEL", "G_MATCH", "G_REACT", "G_A",
  ]),
  "G_RESULT : [G_BOUNDARY,G_NO_MATCH,G_IMAGE,G_REACTED]",

  ...claim("L_SEM", "SEM_TAG", [
    "l_cur", "l_next", "l_k", "l_sel", "l_match", "l_emit", "l_react",
  ]),
  ...claim("L_BOUNDARY", "BOUNDARY_TAG", ["l_cur", "l_k", "l_a"]),
  ...claim("L_NO_MATCH", "NO_MATCH_TAG", [
    "l_cur", "l_next", "l_k", "l_sel", "l_match", "l_a",
  ]),
  ...claim("L_IMAGE", "POSITIVE_TAG", [
    "l_cur", "l_next", "l_k", "l_sel", "l_match", "l_emit", "l_a", "l_b",
  ]),
  ...claim("L_REACTED", "ACTIVE_ID_TAG", [
    "l_cur", "l_k", "l_sel", "l_match", "l_react", "l_a",
  ]),
  "L_RESULT : [L_BOUNDARY,L_NO_MATCH,L_IMAGE,L_REACTED]",

  ...claim("I_SEM", "SEM_TAG", [
    "CURRENT_SCOPE", "NEXT_SCOPE", "K0", "SELECTED_THEORY", "MATCHES_REL",
    "EMITS_REL", "REACTED_VALUE",
  ]),
  ...claim("I_BOUNDARY", "BOUNDARY_TAG", ["CURRENT_SCOPE", "K0", "A0"]),
  ...claim("I_NO_MATCH", "NO_MATCH_TAG", [
    "CURRENT_SCOPE", "NEXT_SCOPE", "K0", "SELECTED_THEORY", "MATCHES_REL", "A0",
  ]),
  ...claim("I_IMAGE", "POSITIVE_TAG", [
    "CURRENT_SCOPE", "NEXT_SCOPE", "K0", "SELECTED_THEORY", "MATCHES_REL",
    "EMITS_REL", "A0", "B0",
  ]),
  ...claim("I_REACTED", "ACTIVE_ID_TAG", [
    "CURRENT_SCOPE", "K0", "SELECTED_THEORY", "MATCHES_REL", "REACTED_VALUE", "A0",
  ]),
  "I_RESULT : [I_BOUNDARY,I_NO_MATCH,I_IMAGE,I_REACTED]",
];

const fnd08Source = scaffold({
  prelude: fnd08Prelude,
  globalRoles: fnd08Global,
  localRoles: fnd08Local,
  concrete: fnd08Concrete,
  targetConclusion: "G_RESULT",
  localConclusion: "L_RESULT",
  targetPremises: ["G_SEM", "G_BOUNDARY"],
  localPremises: ["L_SEM", "L_BOUNDARY"],
});

const fnd09Global = [
  "Q_CUR", "Q_NEXT", "Q_K", "Q_SEL", "Q_MATCH", "Q_EMIT", "Q_REACT",
  "Q_A", "Q_A2", "Q_B", "Q_B1", "Q_B2",
] as const;
const fnd09Local = [
  "q_cur", "q_next", "q_k", "q_sel", "q_match", "q_emit", "q_react",
  "q_a", "q_a2", "q_b", "q_b1", "q_b2",
] as const;
const fnd09Concrete = [
  "CURRENT_SCOPE", "NEXT_SCOPE", "K0", "SELECTED_THEORY", "MATCHES_REL",
  "EMITS_REL", "REACTED_VALUE", "A0", "A1", "B0", "B1", "B2",
] as const;

const fnd09Prelude = [
  "Q_CUR : A0->C",
  "Q_NEXT : Q_CUR->C",
  "Q_K : Q_NEXT->C",
  "Q_SEL : Q_K->C",
  "Q_MATCH : Q_SEL->C",
  "Q_EMIT : Q_MATCH->C",
  "Q_REACT : Q_EMIT->C",
  "Q_A : Q_REACT->C",
  "Q_A2 : Q_A->C",
  "Q_B : Q_A2->C",
  "Q_B1 : Q_B->C",
  "Q_B2 : Q_B1->C",
  "q_cur : Q_B2->C",
  "q_next : q_cur->C",
  "q_k : q_next->C",
  "q_sel : q_k->C",
  "q_match : q_sel->C",
  "q_emit : q_match->C",
  "q_react : q_emit->C",
  "q_a : q_react->C",
  "q_a2 : q_a->C",
  "q_b : q_a2->C",
  "q_b1 : q_b->C",
  "q_b2 : q_b1->C",

  ...claim("Q_SEM", "SEM_TAG", [
    "Q_CUR", "Q_NEXT", "Q_K", "Q_SEL", "Q_MATCH", "Q_EMIT", "Q_REACT",
  ]),
  ...claim("Q_NO_MATCH", "NO_MATCH_TAG", [
    "Q_CUR", "Q_NEXT", "Q_K", "Q_SEL", "Q_MATCH", "Q_A",
  ]),
  ...claim("Q_ZERO", "ZERO_TAG", [
    "Q_CUR", "Q_K", "Q_SEL", "Q_MATCH", "Q_EMIT", "Q_REACT", "Q_A",
  ]),
  ...claim("Q_ONE", "ONE_TAG", [
    "Q_CUR", "Q_NEXT", "Q_K", "Q_SEL", "Q_MATCH", "Q_EMIT", "Q_A", "Q_B",
  ]),
  ...claim("Q_MANY", "MANY_TAG", [
    "Q_CUR", "Q_NEXT", "Q_K", "Q_SEL", "Q_MATCH", "Q_EMIT", "Q_A", "Q_B1", "Q_B2",
  ]),
  ...claim("Q_N1", "N_TO_ONE_TAG", [
    "Q_CUR", "Q_NEXT", "Q_K", "Q_SEL", "Q_MATCH", "Q_EMIT", "Q_A", "Q_A2", "Q_B",
  ]),
  ...claim("Q_POS", "POSITIVE_TAG", [
    "Q_CUR", "Q_NEXT", "Q_K", "Q_SEL", "Q_MATCH", "Q_EMIT", "Q_A", "Q_B",
  ]),
  ...claim("Q_ID", "ACTIVE_ID_TAG", [
    "Q_CUR", "Q_NEXT", "Q_K", "Q_SEL", "Q_MATCH", "Q_EMIT", "Q_REACT", "Q_A",
  ]),
  ...claim("Q_LOCAL_ZERO", "LOCAL_ZERO_TAG", [
    "Q_CUR", "Q_NEXT", "Q_K", "Q_SEL", "Q_MATCH", "Q_EMIT", "Q_A", "Q_A2", "Q_B",
  ]),
  "Q_RESULT : [Q_NO_MATCH,Q_ZERO,Q_ONE,Q_MANY,Q_N1,Q_POS,Q_ID,Q_LOCAL_ZERO]",

  ...claim("q_SEM", "SEM_TAG", [
    "q_cur", "q_next", "q_k", "q_sel", "q_match", "q_emit", "q_react",
  ]),
  ...claim("q_NO_MATCH", "NO_MATCH_TAG", [
    "q_cur", "q_next", "q_k", "q_sel", "q_match", "q_a",
  ]),
  ...claim("q_ZERO", "ZERO_TAG", [
    "q_cur", "q_k", "q_sel", "q_match", "q_emit", "q_react", "q_a",
  ]),
  ...claim("q_ONE", "ONE_TAG", [
    "q_cur", "q_next", "q_k", "q_sel", "q_match", "q_emit", "q_a", "q_b",
  ]),
  ...claim("q_MANY", "MANY_TAG", [
    "q_cur", "q_next", "q_k", "q_sel", "q_match", "q_emit", "q_a", "q_b1", "q_b2",
  ]),
  ...claim("q_N1", "N_TO_ONE_TAG", [
    "q_cur", "q_next", "q_k", "q_sel", "q_match", "q_emit", "q_a", "q_a2", "q_b",
  ]),
  ...claim("q_POS", "POSITIVE_TAG", [
    "q_cur", "q_next", "q_k", "q_sel", "q_match", "q_emit", "q_a", "q_b",
  ]),
  ...claim("q_ID", "ACTIVE_ID_TAG", [
    "q_cur", "q_next", "q_k", "q_sel", "q_match", "q_emit", "q_react", "q_a",
  ]),
  ...claim("q_LOCAL_ZERO", "LOCAL_ZERO_TAG", [
    "q_cur", "q_next", "q_k", "q_sel", "q_match", "q_emit", "q_a", "q_a2", "q_b",
  ]),
  "q_RESULT : [q_NO_MATCH,q_ZERO,q_ONE,q_MANY,q_N1,q_POS,q_ID,q_LOCAL_ZERO]",

  ...claim("J_SEM", "SEM_TAG", [
    "CURRENT_SCOPE", "NEXT_SCOPE", "K0", "SELECTED_THEORY", "MATCHES_REL",
    "EMITS_REL", "REACTED_VALUE",
  ]),
  ...claim("J_NO_MATCH", "NO_MATCH_TAG", [
    "CURRENT_SCOPE", "NEXT_SCOPE", "K0", "SELECTED_THEORY", "MATCHES_REL", "A0",
  ]),
  ...claim("J_ZERO", "ZERO_TAG", [
    "CURRENT_SCOPE", "K0", "SELECTED_THEORY", "MATCHES_REL", "EMITS_REL",
    "REACTED_VALUE", "A0",
  ]),
  ...claim("J_ONE", "ONE_TAG", [
    "CURRENT_SCOPE", "NEXT_SCOPE", "K0", "SELECTED_THEORY", "MATCHES_REL",
    "EMITS_REL", "A0", "B0",
  ]),
  ...claim("J_MANY", "MANY_TAG", [
    "CURRENT_SCOPE", "NEXT_SCOPE", "K0", "SELECTED_THEORY", "MATCHES_REL",
    "EMITS_REL", "A0", "B1", "B2",
  ]),
  ...claim("J_N1", "N_TO_ONE_TAG", [
    "CURRENT_SCOPE", "NEXT_SCOPE", "K0", "SELECTED_THEORY", "MATCHES_REL",
    "EMITS_REL", "A0", "A1", "B0",
  ]),
  ...claim("J_POS", "POSITIVE_TAG", [
    "CURRENT_SCOPE", "NEXT_SCOPE", "K0", "SELECTED_THEORY", "MATCHES_REL",
    "EMITS_REL", "A0", "B0",
  ]),
  ...claim("J_ID", "ACTIVE_ID_TAG", [
    "CURRENT_SCOPE", "NEXT_SCOPE", "K0", "SELECTED_THEORY", "MATCHES_REL",
    "EMITS_REL", "REACTED_VALUE", "A0",
  ]),
  ...claim("J_LOCAL_ZERO", "LOCAL_ZERO_TAG", [
    "CURRENT_SCOPE", "NEXT_SCOPE", "K0", "SELECTED_THEORY", "MATCHES_REL",
    "EMITS_REL", "A0", "A1", "B0",
  ]),
  "J_RESULT : [J_NO_MATCH,J_ZERO,J_ONE,J_MANY,J_N1,J_POS,J_ID,J_LOCAL_ZERO]",
];

const fnd09Source = scaffold({
  prelude: fnd09Prelude,
  globalRoles: fnd09Global,
  localRoles: fnd09Local,
  concrete: fnd09Concrete,
  targetConclusion: "Q_RESULT",
  localConclusion: "q_RESULT",
  targetPremises: ["Q_SEM"],
  localPremises: ["q_SEM"],
});

interface ResolvedProof {
  readonly f: Fixture;
  readonly decodedSourceAset: LinkHandle;
  readonly value: (name: string) => LinkHandle;
  readonly profileRoot: LinkHandle;
  readonly sourceRoot: LinkHandle;
  readonly openRoot: LinkHandle;
  readonly theory: LinkHandle;
  readonly targetBody: LinkHandle;
  readonly targetPremises: readonly LinkHandle[];
  readonly declaredAssumptions: number;
  readonly usedAssumptions: number;
}

function resolveOpen(text: string): ResolvedProof {
  const f = fixture();
  const decoded = decodeV015FormalDefinitions(
    f.memory,
    f.basis,
    f.grammarRoot,
    f.namespaceProfileRoot,
    f.definitionProfileRoot,
    enc.encode(text),
  );
  const definitions = materializeV015LinkDefinitions(
    f.memory,
    f.basis,
    f.grammarRoot,
    f.namespaceProfileRoot,
    f.definitionProfileRoot,
    decoded.sourceAset,
  );
  const carrier = (name: string): LinkHandle => materializeV012StringAnum(
    f.memory,
    f.basis,
    enc.encode(name),
  ).anumLink;
  const value = (name: string): LinkHandle => {
    const found = definitions.definitions.find(
      (entry) => entry.nameCarrier === carrier(name),
    );
    assert(found !== undefined, `definition ${name}`);
    return found.value;
  };

  const entry = definitions.definitions[definitions.definitions.length - 1];
  assert(entry !== undefined, "explicit proof ENTRY");
  const entryValues = readExactSequence(f.memory, entry.value).values;
  same(entryValues.length, 2, "proof ENTRY arity");
  const profileRoot = entryValues[0];
  const sourceRoot = entryValues[1];
  assert(profileRoot !== undefined && sourceRoot !== undefined, "proof ENTRY coordinates");

  const open = materializeV015OpenProofDenotation(
    f.memory,
    profileRoot,
    sourceRoot,
  );
  const rooted = replayStructuralRootedProofAset(f.memory, open.openRoot);
  const genericIdentity = f.memory.poles(open.generic.identity);
  const targetSchema = readStructuralDerivationRule(
    f.memory,
    genericIdentity.start,
  );
  const targetRule = readStructuralRule(
    f.memory,
    targetSchema.structuralRule,
  );

  return Object.freeze({
    f,
    decodedSourceAset: decoded.sourceAset,
    value,
    profileRoot,
    sourceRoot,
    openRoot: open.openRoot,
    theory: genericIdentity.end,
    targetBody: targetRule.body,
    targetPremises: targetSchema.premiseTemplates,
    declaredAssumptions: rooted.declaredAssumptionCount,
    usedAssumptions: rooted.usedAssumptionCount,
  });
}

function wire(proof: ResolvedProof): string {
  const carrier = materializeV013HierarchicalCarrierFromSemanticLink(
    proof.f.memory,
    proof.f.basis,
    proof.openRoot,
  );
  return new TextDecoder().decode(
    serializeV013HierarchicalCarrier(
      proof.f.memory,
      proof.f.basis,
      carrier,
    ),
  );
}

function differentOrReject(
  effect: () => ResolvedProof,
  baseline: string,
  label: string,
): void {
  try {
    assert(wire(effect()) !== baseline, `${label}: mutation reproduced baseline`);
  } catch {
    return;
  }
}

function verifyJsonRoundTrip(text: string, label: string): void {
  const r = resolveOpen(text);
  const json = encodeV015FormalSourceAsetJson(
    r.f.memory,
    r.f.basis,
    r.f.grammarRoot,
    r.f.namespaceProfileRoot,
    r.f.definitionProfileRoot,
    r.decodedSourceAset,
  );
  const round = decodeV015FormalSourceAsetJson(
    r.f.memory,
    r.f.basis,
    r.f.grammarRoot,
    r.f.namespaceProfileRoot,
    r.f.definitionProfileRoot,
    json,
  );
  same(round.sourceAset, r.decodedSourceAset, `${label}: exact source-Aset round-trip`);

  const definitions = materializeV015LinkDefinitions(
    r.f.memory,
    r.f.basis,
    r.f.grammarRoot,
    r.f.namespaceProfileRoot,
    r.f.definitionProfileRoot,
    round.sourceAset,
  );
  const entry = definitions.definitions[definitions.definitions.length - 1];
  assert(entry !== undefined, `${label}: round ENTRY`);
  const values = readExactSequence(r.f.memory, entry.value).values;
  const reopened = materializeV015OpenProofDenotation(
    r.f.memory,
    values[0]!,
    values[1]!,
  );
  same(reopened.openRoot, r.openRoot, `${label}: OPEN root after J1`);
}

function closedExportRejects(proof: ResolvedProof, label: string): void {
  const before = proof.f.memory.linkCount;
  let rejected = false;
  try {
    exportPortableClosedRootedProof(
      proof.f.memory,
      proof.f.basis,
      proof.openRoot,
    );
  } catch {
    rejected = true;
  }
  assert(rejected, `${label}: OPEN must not export CLOSED`);
  same(proof.f.memory.linkCount, before, `${label}: failed CLOSED export writes nothing`);
}

const fnd08 = resolveOpen(fnd08Source);
same(fnd08.theory, fnd08.value("THEORY"), "FND-08 exact Theory");
same(fnd08.targetBody, fnd08.value("G_RESULT"), "FND-08 generic target result");
sameMembers(
  fnd08.targetPremises,
  [fnd08.value("G_SEM"), fnd08.value("G_BOUNDARY")],
  "FND-08 explicit premises",
);
same(fnd08.declaredAssumptions, 2, "FND-08 declared assumptions");
same(fnd08.usedAssumptions, 2, "FND-08 used assumptions");
const fnd08Replay = replayStructuralRootedProofAset(
  fnd08.f.memory,
  fnd08.openRoot,
);
same(fnd08Replay.conclusion, fnd08.value("I_RESULT"), "FND-08 concrete result");
sameMembers(
  fnd08Replay.assumptionClaims,
  [fnd08.value("I_SEM"), fnd08.value("I_BOUNDARY")],
  "FND-08 concrete premise claims",
);
closedExportRejects(fnd08, "FND-08");
verifyJsonRoundTrip(fnd08Source, "FND-08");

const fnd09 = resolveOpen(fnd09Source);
same(fnd09.theory, fnd09.value("THEORY"), "FND-09 exact Theory");
same(fnd09.targetBody, fnd09.value("Q_RESULT"), "FND-09 generic target result");
sameMembers(
  fnd09.targetPremises,
  [fnd09.value("Q_SEM")],
  "FND-09 explicit semantics premise",
);
same(fnd09.declaredAssumptions, 1, "FND-09 declared assumptions");
same(fnd09.usedAssumptions, 1, "FND-09 used assumptions");
const fnd09Replay = replayStructuralRootedProofAset(
  fnd09.f.memory,
  fnd09.openRoot,
);
same(fnd09Replay.conclusion, fnd09.value("J_RESULT"), "FND-09 concrete result");
sameMembers(
  fnd09Replay.assumptionClaims,
  [fnd09.value("J_SEM")],
  "FND-09 concrete semantics premise",
);
const fnd09Components = readExactSequence(
  fnd09.f.memory,
  fnd09Replay.conclusion,
).values;
same(fnd09Components.length, 8, "FND-09 exact result coordinate count");
sameMembers(
  fnd09Components,
  [
    fnd09.value("J_NO_MATCH"),
    fnd09.value("J_ZERO"),
    fnd09.value("J_ONE"),
    fnd09.value("J_MANY"),
    fnd09.value("J_N1"),
    fnd09.value("J_POS"),
    fnd09.value("J_ID"),
    fnd09.value("J_LOCAL_ZERO"),
  ],
  "FND-09 exact relational result coordinates",
);
assert(
  fnd09.value("J_NO_MATCH") !== fnd09.value("J_ZERO"),
  "NO_MATCH and matched ZERO remain distinct claims",
);
closedExportRejects(fnd09, "FND-09");
verifyJsonRoundTrip(fnd09Source, "FND-09");

const fnd08Wire = wire(fnd08);
differentOrReject(
  () => resolveOpen(
    fnd08Source
      .replace("TARGET_PREMISES : [G_SEM,G_BOUNDARY]", "TARGET_PREMISES : [G_BOUNDARY]")
      .replace("LOCAL_PREMISES : [L_SEM,L_BOUNDARY]", "LOCAL_PREMISES : [L_BOUNDARY]"),
  ),
  fnd08Wire,
  "FND-08 missing selected-Theory reaction semantics",
);
differentOrReject(
  () => resolveOpen(
    fnd08Source
      .replace("TARGET_PREMISES : [G_SEM,G_BOUNDARY]", "TARGET_PREMISES : [G_SEM]")
      .replace("LOCAL_PREMISES : [L_SEM,L_BOUNDARY]", "LOCAL_PREMISES : [L_SEM]"),
  ),
  fnd08Wire,
  "FND-08 missing FND-07 boundary",
);
differentOrReject(
  () => resolveOpen(
    fnd08Source
      .replace("MORPH_DATA : [THEORY,", "MORPH_DATA : [FOREIGN_THEORY,")
      .replace("GENERIC_DATA : [TARGET_DR,THEORY,", "GENERIC_DATA : [TARGET_DR,FOREIGN_THEORY,"),
  ),
  fnd08Wire,
  "FND-08 foreign Theory",
);

const reordered08 = resolveOpen(
  fnd08Source
    .replace(
      `GLOBAL_ROLES : [${fnd08Global.join(",")}]`,
      `GLOBAL_ROLES : [${[...fnd08Global].reverse().join(",")}]`,
    )
    .replace(
      `LOCAL_ROLES : [${fnd08Local.join(",")}]`,
      `LOCAL_ROLES : [${[...fnd08Local].reverse().join(",")}]`,
    ),
);
same(wire(reordered08), fnd08Wire, "FND-08 role enumeration order is non-authority");

const fnd09Wire = wire(fnd09);
differentOrReject(
  () => resolveOpen(
    fnd09Source
      .replace("TARGET_PREMISES : [Q_SEM]", "TARGET_PREMISES : []")
      .replace("LOCAL_PREMISES : [q_SEM]", "LOCAL_PREMISES : []"),
  ),
  fnd09Wire,
  "FND-09 missing selected-Theory reaction semantics",
);
differentOrReject(
  () => resolveOpen(
    fnd09Source
      .replace("ZERO_TAG : NO_MATCH_TAG->O", "ZERO_TAG : NO_MATCH_TAG"),
  ),
  fnd09Wire,
  "FND-09 NO_MATCH/ZERO collapse",
);
differentOrReject(
  () => resolveOpen(
    fnd09Source
      .replace(
        "Q_RESULT : [Q_NO_MATCH,Q_ZERO,Q_ONE,Q_MANY,Q_N1,Q_POS,Q_ID,Q_LOCAL_ZERO]",
        "Q_RESULT : [Q_NO_MATCH,Q_ZERO,Q_ONE,Q_N1,Q_POS,Q_ID,Q_LOCAL_ZERO]",
      )
      .replace(
        "q_RESULT : [q_NO_MATCH,q_ZERO,q_ONE,q_MANY,q_N1,q_POS,q_ID,q_LOCAL_ZERO]",
        "q_RESULT : [q_NO_MATCH,q_ZERO,q_ONE,q_N1,q_POS,q_ID,q_LOCAL_ZERO]",
      ),
  ),
  fnd09Wire,
  "FND-09 missing MANY coordinate",
);
differentOrReject(
  () => resolveOpen(
    fnd09Source
      .replace(
        "Q_RESULT : [Q_NO_MATCH,Q_ZERO,Q_ONE,Q_MANY,Q_N1,Q_POS,Q_ID,Q_LOCAL_ZERO]",
        "Q_RESULT : [Q_NO_MATCH,Q_ZERO,Q_ONE,Q_MANY,Q_POS,Q_ID,Q_LOCAL_ZERO]",
      )
      .replace(
        "q_RESULT : [q_NO_MATCH,q_ZERO,q_ONE,q_MANY,q_N1,q_POS,q_ID,q_LOCAL_ZERO]",
        "q_RESULT : [q_NO_MATCH,q_ZERO,q_ONE,q_MANY,q_POS,q_ID,q_LOCAL_ZERO]",
      ),
  ),
  fnd09Wire,
  "FND-09 missing N->1 coordinate",
);
differentOrReject(
  () => resolveOpen(
    fnd09Source
      .replace(
        "Q_RESULT : [Q_NO_MATCH,Q_ZERO,Q_ONE,Q_MANY,Q_N1,Q_POS,Q_ID,Q_LOCAL_ZERO]",
        "Q_RESULT : [Q_NO_MATCH,Q_ZERO,Q_ONE,Q_MANY,Q_N1,Q_POS,Q_LOCAL_ZERO]",
      )
      .replace(
        "q_RESULT : [q_NO_MATCH,q_ZERO,q_ONE,q_MANY,q_N1,q_POS,q_ID,q_LOCAL_ZERO]",
        "q_RESULT : [q_NO_MATCH,q_ZERO,q_ONE,q_MANY,q_N1,q_POS,q_LOCAL_ZERO]",
      ),
  ),
  fnd09Wire,
  "FND-09 missing active-identity coordinate",
);
differentOrReject(
  () => resolveOpen(
    fnd09Source
      .replace(
        "Q_RESULT : [Q_NO_MATCH,Q_ZERO,Q_ONE,Q_MANY,Q_N1,Q_POS,Q_ID,Q_LOCAL_ZERO]",
        "Q_RESULT : [Q_NO_MATCH,Q_ZERO,Q_ONE,Q_MANY,Q_N1,Q_POS,Q_ID]",
      )
      .replace(
        "q_RESULT : [q_NO_MATCH,q_ZERO,q_ONE,q_MANY,q_N1,q_POS,q_ID,q_LOCAL_ZERO]",
        "q_RESULT : [q_NO_MATCH,q_ZERO,q_ONE,q_MANY,q_N1,q_POS,q_ID]",
      ),
  ),
  fnd09Wire,
  "FND-09 missing local-ZERO sibling coordinate",
);

const reordered09 = resolveOpen(
  fnd09Source
    .replace(
      `GLOBAL_ROLES : [${fnd09Global.join(",")}]`,
      `GLOBAL_ROLES : [${[...fnd09Global].reverse().join(",")}]`,
    )
    .replace(
      `LOCAL_ROLES : [${fnd09Local.join(",")}]`,
      `LOCAL_ROLES : [${[...fnd09Local].reverse().join(",")}]`,
    ),
);
same(wire(reordered09), fnd09Wire, "FND-09 role enumeration order is non-authority");

const renamed08 = resolveOpen(
  fnd08Source
    .replaceAll("GLOBAL_", "GG_")
    .replaceAll("TARGET_", "TT_")
    .replaceAll("LOCAL_", "LL_")
    .replaceAll("MAPPINGS", "MAPS")
    .replaceAll("MORPH", "MU")
    .replaceAll("GENERIC", "GEN")
    .replaceAll("BINDINGS", "BDS")
    .replaceAll("OPEN_PROOF", "OP")
    .replaceAll("PROOF_PROFILE", "PP")
    .replaceAll("ENTRY", "E"),
);
same(wire(renamed08), fnd08Wire, "FND-08 presentation alpha-renaming");

const renamed09 = resolveOpen(
  fnd09Source
    .replaceAll("GLOBAL_", "GG_")
    .replaceAll("TARGET_", "TT_")
    .replaceAll("LOCAL_", "LL_")
    .replaceAll("MAPPINGS", "MAPS")
    .replaceAll("MORPH", "MU")
    .replaceAll("GENERIC", "GEN")
    .replaceAll("BINDINGS", "BDS")
    .replaceAll("OPEN_PROOF", "OP")
    .replaceAll("PROOF_PROFILE", "PP")
    .replaceAll("ENTRY", "E"),
);
same(wire(renamed09), fnd09Wire, "FND-09 presentation alpha-renaming");

{
  const production = readFileSync(
    resolve(process.cwd(), "../ts/src/v015-proof-source.ts"),
    "utf8",
  );
  assert(!production.includes("FND-08"), "production has no FND-08 dispatch");
  assert(!production.includes("FND-09"), "production has no FND-09 dispatch");
}

console.log([
  "MTS v0.15 B14b FND-08/FND-09 OPEN FORMAL proof artifacts:",
  "FND08_SELECTED_THEORY_SEMANTICS=EXPLICIT_OPEN_PREMISE",
  "FND08_FND07_BOUNDARY=EXPLICIT_OPEN_PREMISE",
  "FND08_DECLARED_USED_ASSUMPTIONS=2_2",
  "FND09_SELECTED_THEORY_SEMANTICS=EXPLICIT_OPEN_PREMISE",
  "FND09_DECLARED_USED_ASSUMPTIONS=1_1",
  "FND09_RESULT_COORDINATES=8",
  "NO_MATCH_VS_ZERO=DISTINCT",
  "ROLE_ENUMERATION_ORDER=NON_AUTHORITY",
  "JSON_J1_OPEN_PROOF=EXACT",
  "ALPHA_RENAME=SEMANTICALLY_STABLE",
  "FOREIGN_THEORY=REJECT_OR_DIFF",
  "CLOSED_EXPORT=REJECT",
  "THEOREM_ID_DISPATCH=0",
  "INDEPENDENT_CLOSED_NATIVE_PROOF=NOT_CLAIMED",
  "APROVER_ACCEPT=NOT_CLAIMED",
].join(" "));
