import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { readExactSequence } from "../src/exact-sequence.js";
import { readStructuralDerivationRule } from "../src/derivation.js";
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
import { exportPortableClosedRootedProof } from "../src/portable-closed-rooted-proof.js";
import { replayStructuralRootedProofAset } from "../src/rooted-proof-aset.js";
import { materializeSourceNamespaceProfile } from "../src/source-namespace.js";
import { readStructuralRule } from "../src/structural-rule.js";
import {
  decodeV015FormalDefinitions,
  decodeV015FormalSourceAsetJson,
  encodeV015FormalSourceAsetJson,
} from "../src/v015-formal-decoder.js";
import {
  materializeV015LinkDefinitionProfile,
  materializeV015LinkDefinitions,
} from "../src/v015-link-definition.js";
import { materializeV015OpenProofDenotation } from "../src/v015-proof-source.js";
import { materializeV012StringAnum } from "../src/v012-string-anum.js";
import {
  materializeV013HierarchicalCarrierFromSemanticLink,
  serializeV013HierarchicalCarrier,
} from "../src/v013-hierarchical-carrier.js";

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(`v0.15 B14b2 FND-09 OPEN proof: ${message}`);
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
  for (const value of expected) {
    assert(actual.includes(value), `${message}: missing expected member`);
  }
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

interface FormalOverlayEntry {
  readonly id: string;
  readonly migrationStatus: string;
  readonly proofClosure: string;
  readonly formalStatement: string;
  readonly formalPremises: readonly string[];
  readonly formalSourcePath: string;
  readonly aproverStatus: string;
}

function repositoryRoot(): string {
  const roots = [resolve(process.cwd(), ".."), process.cwd()];
  const root = roots.find((candidate) =>
    existsSync(resolve(candidate, "theorems/formal-v0.15.json"))
  );
  assert(root !== undefined, "repository root");
  return root;
}

function formalOverlayEntry(id: string): FormalOverlayEntry {
  const overlay = JSON.parse(
    readFileSync(resolve(repositoryRoot(), "theorems/formal-v0.15.json"), "utf8"),
  ) as { entries?: FormalOverlayEntry[] };
  const entry = overlay.entries?.find((candidate) => candidate.id === id);
  assert(entry !== undefined, `FORMAL overlay entry ${id}`);
  return entry;
}

const fnd09Formal = formalOverlayEntry("FND-09");
same(
  fnd09Formal.formalSourcePath,
  "ts/test/v015-fnd09-open-formal-b14b2.test.ts",
  "FND-09 overlay source path",
);
same(fnd09Formal.proofClosure, "OPEN_CONDITIONAL", "FND-09 overlay closure");
same(fnd09Formal.aproverStatus, "NOT_RECORDED", "FND-09 aprover status");

function pairChain(name: string, items: readonly string[]): readonly string[] {
  assert(items.length >= 2, `${name}: pair chain needs at least two items`);
  const lines: string[] = [];
  let current = items[0]!;
  for (let index = 1; index < items.length; index += 1) {
    const final = index === items.length - 1;
    const nextName = final ? name : `${name}_P${index}`;
    lines.push(`${nextName} : ${current}->${items[index]!}`);
    current = nextName;
  }
  return lines;
}

function claim(name: string, tag: string, args: readonly string[]): readonly string[] {
  return [
    ...pairChain(`${name}_ARGS`, args),
    `${name} : ${tag}->${name}_ARGS`,
  ];
}

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

  "SEM_TAG : B1->O",
  "NO_MATCH_TAG : SEM_TAG->O",
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

function mappingLines(
  globalRoles: readonly string[],
  localRoles: readonly string[],
): readonly string[] {
  same(globalRoles.length, localRoles.length, "mapping role arity");
  const lines: string[] = [];
  const maps: string[] = [];
  for (let index = 0; index < globalRoles.length; index += 1) {
    const id = `M${index}`;
    lines.push(`${id}_DATA : [${localRoles[index]!},${globalRoles[index]!}]`);
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
  for (let index = 0; index < globalRoles.length; index += 1) {
    const id = `BIND${index}`;
    lines.push(`${id}_DATA : [${globalRoles[index]!},${concrete[index]!}]`);
    lines.push(`${id} : BIND_TAG->${id}_DATA`);
    bindings.push(id);
  }
  lines.push(`BINDINGS : [${bindings.join(",")}]`);
  return lines;
}

const globalRoles = [
  "G_CUR",
  "G_NEXT",
  "G_K",
  "G_SEL",
  "G_MATCH",
  "G_EMIT",
  "G_REACT",
  "G_A",
  "G_A2",
  "G_B",
  "G_B2",
] as const;

const localRoles = [
  "l_cur",
  "l_next",
  "l_k",
  "l_sel",
  "l_match",
  "l_emit",
  "l_react",
  "l_a",
  "l_a2",
  "l_b",
  "l_b2",
] as const;

const concrete = [
  "CURRENT_SCOPE",
  "NEXT_SCOPE",
  "K0",
  "SELECTED_THEORY",
  "MATCHES_REL",
  "EMITS_REL",
  "REACTED_VALUE",
  "A0",
  "A1",
  "B0",
  "B1",
] as const;

function theoremClaims(prefix: string, roles: readonly string[]): readonly string[] {
  const [cur, next, k, selected, matches, emits, reacted, a, a2, b, b2] = roles;
  assert(
    cur !== undefined && next !== undefined && k !== undefined
      && selected !== undefined && matches !== undefined && emits !== undefined
      && reacted !== undefined && a !== undefined && a2 !== undefined
      && b !== undefined && b2 !== undefined,
    `${prefix}: complete role set`,
  );
  return [
    ...claim(`${prefix}_SEM`, "SEM_TAG", [
      cur, next, k, selected, matches, emits, reacted,
    ]),
    ...claim(`${prefix}_NO_MATCH`, "NO_MATCH_TAG", [
      cur, next, k, selected, matches, a,
    ]),
    ...claim(`${prefix}_ZERO`, "ZERO_TAG", [
      cur, k, selected, matches, emits, reacted, a,
    ]),
    ...claim(`${prefix}_ONE`, "ONE_TAG", [
      cur, next, k, selected, matches, emits, a, b,
    ]),
    ...claim(`${prefix}_MANY`, "MANY_TAG", [
      cur, next, k, selected, matches, emits, a, b, b2,
    ]),
    ...claim(`${prefix}_N_TO_ONE`, "N_TO_ONE_TAG", [
      cur, next, k, selected, matches, emits, a, a2, b,
    ]),
    ...claim(`${prefix}_POSITIVE`, "POSITIVE_TAG", [
      cur, next, k, selected, matches, emits, a, b,
    ]),
    ...claim(`${prefix}_ACTIVE_ID`, "ACTIVE_ID_TAG", [
      cur, next, k, selected, matches, emits, reacted, a,
    ]),
    ...claim(`${prefix}_LOCAL_ZERO`, "LOCAL_ZERO_TAG", [
      cur, next, k, selected, matches, emits, a, a2, b,
    ]),
    ...pairChain(`${prefix}_RESULT`, [
      `${prefix}_NO_MATCH`,
      `${prefix}_ZERO`,
      `${prefix}_ONE`,
      `${prefix}_MANY`,
      `${prefix}_N_TO_ONE`,
      `${prefix}_POSITIVE`,
      `${prefix}_ACTIVE_ID`,
      `${prefix}_LOCAL_ZERO`,
    ]),
  ];
}

const globalRoleDefinitions = [
  "G_CUR : A0->R",
  "G_NEXT : G_CUR->R",
  "G_K : G_NEXT->R",
  "G_SEL : G_K->R",
  "G_MATCH : G_SEL->R",
  "G_EMIT : G_MATCH->R",
  "G_REACT : G_EMIT->R",
  "G_A : G_REACT->R",
  "G_A2 : G_A->R",
  "G_B : G_A2->R",
  "G_B2 : G_B->R",
];

const localRoleDefinitions = [
  "l_cur : G_B2->R",
  "l_next : l_cur->R",
  "l_k : l_next->R",
  "l_sel : l_k->R",
  "l_match : l_sel->R",
  "l_emit : l_match->R",
  "l_react : l_emit->R",
  "l_a : l_react->R",
  "l_a2 : l_a->R",
  "l_b : l_a2->R",
  "l_b2 : l_b->R",
];

const source = [
  ...commonPrefix,
  ...proofProfile,
  ...globalRoleDefinitions,
  ...localRoleDefinitions,
  ...theoremClaims("G", globalRoles),
  ...theoremClaims("L", localRoles),
  ...theoremClaims("I", concrete),

  `GLOBAL_ROLES : [${globalRoles.join(",")}]`,
  "GLOBAL_DICT : DICT_TAG->GLOBAL_ROLES",
  "TARGET_RULE_DATA : [GLOBAL_DICT,G_RESULT]",
  "TARGET_RULE : RULE_TAG->TARGET_RULE_DATA",
  "TARGET_PREMISES : [G_SEM]",
  fnd09Formal.formalStatement,
  "TARGET_DR_DATA : [TARGET_RULE,TARGET_PREMISES]",
  "TARGET_DR : DR_TAG->TARGET_DR_DATA",

  `LOCAL_ROLES : [${localRoles.join(",")}]`,
  "LOCAL_DICT : DICT_TAG->LOCAL_ROLES",
  "LOCAL_RULE_DATA : [LOCAL_DICT,L_RESULT]",
  "LOCAL_RULE : RULE_TAG->LOCAL_RULE_DATA",
  "LOCAL_PREMISES : [L_SEM]",
  "LOCAL_DR_DATA : [LOCAL_RULE,LOCAL_PREMISES]",
  "LOCAL_DR : DR_TAG->LOCAL_DR_DATA",

  ...mappingLines(globalRoles, localRoles),
  "MORPH_DATA : [THEORY,LOCAL_DICT,GLOBAL_DICT,MAPPINGS]",
  "MORPH : MORPH_TAG->MORPH_DATA",
  "GENERIC_DATA : [TARGET_DR,THEORY,LOCAL_DR,MORPH]",
  "GENERIC : GENERIC_TAG->GENERIC_DATA",

  ...bindingLines(globalRoles, concrete),
  "OPEN_DATA : [GENERIC,BINDINGS]",
  "OPEN_PROOF : OPEN_TAG->OPEN_DATA",
  "ENTRY : [PROOF_PROFILE,OPEN_PROOF]",
].join("\n");

same(
  JSON.stringify(fnd09Formal.formalPremises),
  JSON.stringify(["G_SEM"]),
  "FND-09 overlay source-premise names",
);

interface Resolved {
  readonly f: Fixture;
  readonly sourceAset: LinkHandle;
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

function resolveOpen(text: string): Resolved {
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
  same(entryValues.length, 2, "ENTRY arity");
  const profileRoot = entryValues[0];
  const sourceRoot = entryValues[1];
  assert(profileRoot !== undefined && sourceRoot !== undefined, "ENTRY coordinates");

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
    sourceAset: decoded.sourceAset,
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

function wire(proof: Resolved): string {
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
  effect: () => Resolved,
  baseline: string,
  label: string,
): void {
  try {
    assert(wire(effect()) !== baseline, `${label}: mutation reproduced baseline`);
  } catch {
    return;
  }
}

function closedExportRejects(proof: Resolved): void {
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
  assert(rejected, "FND-09 OPEN proof must not export CLOSED");
  same(proof.f.memory.linkCount, before, "failed CLOSED export writes nothing");
}

function jsonRoundTrip(proof: Resolved): void {
  const json = encodeV015FormalSourceAsetJson(
    proof.f.memory,
    proof.f.basis,
    proof.f.grammarRoot,
    proof.f.namespaceProfileRoot,
    proof.f.definitionProfileRoot,
    proof.sourceAset,
  );
  const round = decodeV015FormalSourceAsetJson(
    proof.f.memory,
    proof.f.basis,
    proof.f.grammarRoot,
    proof.f.namespaceProfileRoot,
    proof.f.definitionProfileRoot,
    json,
  );
  same(round.sourceAset, proof.sourceAset, "FND-09 JSON exact source-Aset round-trip");

  const definitions = materializeV015LinkDefinitions(
    proof.f.memory,
    proof.f.basis,
    proof.f.grammarRoot,
    proof.f.namespaceProfileRoot,
    proof.f.definitionProfileRoot,
    round.sourceAset,
  );
  const entry = definitions.definitions[definitions.definitions.length - 1];
  assert(entry !== undefined, "round ENTRY");
  const values = readExactSequence(proof.f.memory, entry.value).values;
  const reopened = materializeV015OpenProofDenotation(
    proof.f.memory,
    values[0]!,
    values[1]!,
  );
  same(reopened.openRoot, proof.openRoot, "FND-09 OPEN root after JSON");
}

const fnd09 = resolveOpen(source);
same(fnd09.theory, fnd09.value("THEORY"), "FND-09 exact Theory");
same(fnd09.targetBody, fnd09.value("G_RESULT"), "FND-09 generic target");
sameMembers(
  fnd09.targetPremises,
  [fnd09.value("G_SEM")],
  "FND-09 has only SelectedTheoryReactionSemantics premise",
);
same(fnd09.declaredAssumptions, 1, "FND-09 declared assumptions");
same(fnd09.usedAssumptions, 1, "FND-09 used assumptions");

const rooted = replayStructuralRootedProofAset(
  fnd09.f.memory,
  fnd09.openRoot,
);
same(rooted.conclusion, fnd09.value("I_RESULT"), "FND-09 concrete result");
const concreteSchema = readStructuralDerivationRule(
  fnd09.f.memory,
  rooted.targetDerivationRule,
);
sameMembers(
  concreteSchema.premiseTemplates,
  [fnd09.value("I_SEM")],
  "FND-09 concrete premise",
);
closedExportRejects(fnd09);
jsonRoundTrip(fnd09);

const baseline = wire(fnd09);

differentOrReject(
  () => resolveOpen(
    source
      .replace("TARGET_PREMISES : [G_SEM]", "TARGET_PREMISES : []")
      .replace("LOCAL_PREMISES : [L_SEM]", "LOCAL_PREMISES : []"),
  ),
  baseline,
  "missing SelectedTheoryReactionSemantics",
);

differentOrReject(
  () => resolveOpen(
    source
      .replace("MORPH_DATA : [THEORY,", "MORPH_DATA : [FOREIGN_THEORY,")
      .replace("GENERIC_DATA : [TARGET_DR,THEORY,", "GENERIC_DATA : [TARGET_DR,FOREIGN_THEORY,"),
  ),
  baseline,
  "foreign Theory",
);

differentOrReject(
  () => resolveOpen(
    source
      .replace("G_RESULT_P1 : G_NO_MATCH->G_ZERO", "G_RESULT_P1 : G_NO_MATCH->G_NO_MATCH")
      .replace("L_RESULT_P1 : L_NO_MATCH->L_ZERO", "L_RESULT_P1 : L_NO_MATCH->L_NO_MATCH"),
  ),
  baseline,
  "NO_MATCH and ZERO collapsed",
);

for (const [label, globalLine, localLine] of [
  [
    "MANY coordinate removed",
    "G_RESULT_P3 : G_RESULT_P2->G_MANY\n",
    "L_RESULT_P3 : L_RESULT_P2->L_MANY\n",
  ],
  [
    "N-to-one coordinate removed",
    "G_RESULT_P4 : G_RESULT_P3->G_N_TO_ONE\n",
    "L_RESULT_P4 : L_RESULT_P3->L_N_TO_ONE\n",
  ],
  [
    "active identity coordinate removed",
    "G_RESULT_P6 : G_RESULT_P5->G_ACTIVE_ID\n",
    "L_RESULT_P6 : L_RESULT_P5->L_ACTIVE_ID\n",
  ],
  [
    "local ZERO coordinate removed",
    "G_RESULT : G_RESULT_P6->G_LOCAL_ZERO\n",
    "L_RESULT : L_RESULT_P6->L_LOCAL_ZERO\n",
  ],
] as const) {
  differentOrReject(
    () => resolveOpen(
      source
        .replace(globalLine, "")
        .replace(localLine, ""),
    ),
    baseline,
    label,
  );
}

const reordered = resolveOpen(
  source.replace(
    `GLOBAL_ROLES : [${globalRoles.join(",")}]`,
    `GLOBAL_ROLES : [${[...globalRoles].reverse().join(",")}]`,
  ),
);
same(wire(reordered), baseline, "global role enumeration order is non-authority");

const renamed = resolveOpen(
  source
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
same(wire(renamed), baseline, "presentation alpha-renaming");

{
  const production = readFileSync(
    resolve(repositoryRoot(), "ts/src/v015-proof-source.ts"),
    "utf8",
  );
  assert(!production.includes("FND-08"), "production has no FND-08 dispatch");
  assert(!production.includes("FND-09"), "production has no FND-09 dispatch");
}

{
  const lean = readFileSync(
    resolve(repositoryRoot(), "proofs/lean4/MtsFoundation.lean"),
    "utf8",
  );
  const rocq = readFileSync(
    resolve(repositoryRoot(), "proofs/coq/MtsFoundation.v"),
    "utf8",
  );
  for (const external of [lean, rocq]) {
    assert(
      external.includes("FND_09_zero_one_many_are_relational"),
      "paired external FND-09 theorem remains present",
    );
    assert(
      external.includes("SelectedTheoryReactionSemantics"),
      "paired external selected-Theory premise remains explicit",
    );
  }
}

console.log([
  "MTS v0.15 B14b2 FND-09 OPEN FORMAL proof artifact:",
  "SELECTED_THEORY_REACTION_SEMANTICS=ONLY_OPEN_PREMISE",
  "DECLARED_USED_ASSUMPTIONS=1_1",
  "NO_MATCH=SEPARATE_COORDINATE",
  "ZERO=SEPARATE_COORDINATE",
  "ONE=SEPARATE_COORDINATE",
  "MANY=SEPARATE_COORDINATE",
  "N_TO_ONE=SEPARATE_COORDINATE",
  "POSITIVE_IMAGE=SEPARATE_COORDINATE",
  "ACTIVE_IDENTITY=SEPARATE_COORDINATE",
  "LOCAL_ZERO=SEPARATE_COORDINATE",
  "ROLE_BEARING_TEMPLATES=ORDINARY_LINKS",
  "CARDINALITY_OPCODE=0",
  "ROLE_ENUMERATION_ORDER=NON_AUTHORITY",
  "JSON_J1_OPEN_PROOF=EXACT",
  "ALPHA_RENAME=SEMANTICALLY_STABLE",
  "FOREIGN_THEORY=REJECT_OR_DIFF",
  "CLOSED_EXPORT=REJECT",
  "THEOREM_ID_DISPATCH=0",
  "INDEPENDENT_CLOSED_NATIVE_PROOF=NOT_CLAIMED",
  "APROVER_ACCEPT=NOT_CLAIMED",
].join(" "));
