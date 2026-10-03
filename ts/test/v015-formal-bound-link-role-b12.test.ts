import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  materializeExactSequence,
  readExactSequence,
} from "../src/exact-sequence.js";
import {
  Memory,
  MemoryError,
  ensureRootBasis,
  type LinkHandle,
  type LinkPoles,
  type ReadMemory,
  type RootBasis,
} from "../src/memory.js";
import {
  RecursiveLinkIdentityProofReplayError,
  replayRecursiveLinkIdentityProofAset,
} from "../src/recursive-link-identity-proof.js";
import {
  materializeNativeSyntaxGrammar,
  type NativeSyntaxGrammarRuleSpec,
} from "../src/native-syntax-grammar.js";
import { materializeSourceNamespaceProfile } from "../src/source-namespace.js";
import {
  V015_FORMAL_JSON_J1_SCHEMA,
  decodeV015FormalSourceAsetJson,
  encodeV015FormalSourceAsetJson,
} from "../src/v015-formal-decoder.js";
import {
  compileV015FormalDefinitionsToRecursive,
  type V015FormalRecursiveCompileResult,
} from "../src/v015-formal-recursive-compiler.js";
import { materializeV015LinkDefinitionProfile } from "../src/v015-link-definition.js";
import { materializeV012StringAnum } from "../src/v012-string-anum.js";
import { defineContext } from "../src/state.js";
import { defineActField, defineActHeader } from "../src/structural-readers.js";
import {
  StructuralRuleError,
  admitStructuralRule,
  defineStructuralInterpreter,
  defineStructuralRoleDictionary,
  defineStructuralRule,
  readStructuralRoleDictionary,
  replayStructuralRule,
  type StructuralInterpreter,
} from "../src/structural-rule.js";
import { instantiateV013StructuralTemplate } from "../src/v013-structural-execution.js";

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(`v0.15 B12 bound Link role: ${message}`);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(
    Object.is(actual, expected),
    `${message}: ${String(actual)} !== ${String(expected)}`,
  );
}

function expectRuleError(
  code: StructuralRuleError["code"],
  effect: () => unknown,
  label: string,
): void {
  try {
    effect();
  } catch (error) {
    assert(error instanceof StructuralRuleError, `${label}: structural error type`);
    same(error.code, code, label);
    return;
  }
  throw new Error(`v0.15 B12 bound Link role: ${label}: expected ${code}`);
}

function expectKernelError(
  code: RecursiveLinkIdentityProofReplayError["code"],
  effect: () => unknown,
  label: string,
): void {
  try {
    effect();
  } catch (error) {
    assert(error instanceof RecursiveLinkIdentityProofReplayError, `${label}: kernel error type`);
    same(error.code, code, label);
    return;
  }
  throw new Error(`v0.15 B15 FND-02 kernel boundary: ${label}: expected ${code}`);
}

class SyntheticReadMemory implements ReadMemory {
  constructor(
    readonly root: LinkHandle,
    private readonly cells: ReadonlyMap<LinkHandle, LinkPoles>,
  ) {}

  get linkCount(): number { return this.cells.size; }

  poles(link: LinkHandle): LinkPoles {
    const value = this.cells.get(link);
    if (value === undefined) throw new MemoryError("synthetic unknown Link");
    return value;
  }

  find(): LinkHandle | undefined { return undefined; }
  outgoing(): readonly LinkHandle[] { return []; }
  incoming(): readonly LinkHandle[] { return []; }
}

interface Fixture {
  readonly memory: Memory;
  readonly basis: RootBasis;
  readonly fresh: () => LinkHandle;
  readonly grammarRoot: LinkHandle;
  readonly namespaceProfileRoot: LinkHandle;
  readonly definitionProfileRoot: LinkHandle;
}

function fixture(): Fixture {
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  let cursor = memory.ensure(basis.U, basis.L);
  const fresh = (): LinkHandle => {
    cursor = memory.ensure(cursor, basis.C);
    return cursor;
  };

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

  const rules: NativeSyntaxGrammarRuleSpec[] = [
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

  const grammarRoot = materializeNativeSyntaxGrammar(memory, basis, {
    syntaxTag,
    markerSeed,
    rules,
  });
  const namespaceProfileRoot = materializeSourceNamespaceProfile(memory, {
    blockForm,
    declarationForm,
    blockItemRole,
    declarationNameRole,
    declarationBodyRole,
  });
  const definitionProfileRoot = materializeV015LinkDefinitionProfile(memory, {
    pairForm,
    nameRefForm,
    pairLeftRole,
    pairRightRole,
    referencedNameRole,
    sequenceForm,
    sequenceItemRole,
  });

  return Object.freeze({
    memory,
    basis,
    fresh,
    grammarRoot,
    namespaceProfileRoot,
    definitionProfileRoot,
  });
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

interface FormalOverlayEntry {
  readonly id: string;
  readonly migrationStatus: string;
  readonly proofClosure: string;
  readonly formalStatement: string;
  readonly formalPremises: readonly string[];
  readonly formalDomain?: readonly string[];
  readonly formalNonPremises?: readonly string[];
  readonly formalSourcePath: string;
  readonly nativeClassification?: string;
  readonly kernelLaw?: string;
  readonly nativeIndependent?: boolean;
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

const fnd02Formal = formalOverlayEntry("FND-02");

function boundSource(roleName: string, roleDefinition = "U->L"): string {
  return [
    "R : R->R",
    "O : O->R",
    "C : R->C",
    "L : O->C",
    "U : C->O",
    `${roleName} : ${roleDefinition}`,
    "LINK_DOMAIN_TAG : U->R",
    "A1RecursiveSeparation : R->O",
    "FULL_SELF_TAG : R->U",
    "ROOT_ID_TAG : O->U",
    "INTERP_DICT : L->R",
    "INTERP_GRAM : C->L",
    "THEORY : U->C",
    "CTX_PARENT : L->U",
    `X_LINK_DOMAIN : LINK_DOMAIN_TAG->${roleName}`,
    `FULL_SELF_PAIR : ${roleName}(${roleName})`,
    `FULL_SELF_ARGS : [${roleName},FULL_SELF_PAIR]`,
    "FULL_SELF_CLAIM : FULL_SELF_TAG->FULL_SELF_ARGS",
    `ROOT_ID_ARGS : [${roleName},R]`,
    "ROOT_ID_CLAIM : ROOT_ID_TAG->ROOT_ID_ARGS",
    `FND02_PREMISES : [${fnd02Formal.formalPremises.join(",")}]`,
    "FND02_RULE : FULL_SELF_CLAIM->ROOT_ID_CLAIM",
    fnd02Formal.formalStatement,
    "KERNEL_REALIZATION_TAG : C->U",
    "KERNEL_REALIZATION_ARGS : [FND02_STATEMENT,R]",
    "KERNEL_REALIZATION_BOUNDARY : KERNEL_REALIZATION_TAG->KERNEL_REALIZATION_ARGS",
    `BOUND_ROLES : [${roleName}]`,
    "A : R->L",
    "B : L->C",
  ].join("\n");
}

function freeSameSpellingSource(): string {
  return [
    "R : R->R",
    "O : O->R",
    "C : R->C",
    "L : O->C",
    "U : C->O",
    "X : R->U",
    "FREE_TAG : C->U",
    "FREE_ARGS : [X,R]",
    "FREE_CLAIM : FREE_TAG->FREE_ARGS",
  ].join("\n");
}

function compile(
  f: Fixture,
  text: string,
): V015FormalRecursiveCompileResult {
  return compileV015FormalDefinitionsToRecursive(
    f.memory,
    f.basis,
    f.grammarRoot,
    f.namespaceProfileRoot,
    f.definitionProfileRoot,
    encoder.encode(text),
  );
}

function nameCarrier(f: Fixture, name: string): LinkHandle {
  return materializeV012StringAnum(
    f.memory,
    f.basis,
    encoder.encode(name),
  ).anumLink;
}

function value(
  f: Fixture,
  result: V015FormalRecursiveCompileResult,
  name: string,
): LinkHandle {
  const carrier = nameCarrier(f, name);
  const definition = result.definitions.find(
    (candidate) => candidate.nameCarrier === carrier,
  );
  assert(definition !== undefined, `missing definition ${name}`);
  return definition.semantic;
}

function expectedStatement(
  f: Fixture,
  result: V015FormalRecursiveCompileResult,
  candidate: LinkHandle,
): LinkHandle {
  const fullSelfArgs = materializeExactSequence(f.memory, [
    candidate,
    f.memory.ensure(candidate, candidate),
  ]);
  const fullSelfClaim = f.memory.ensure(
    value(f, result, "FULL_SELF_TAG"),
    fullSelfArgs,
  );
  const rootIdArgs = materializeExactSequence(f.memory, [
    candidate,
    f.basis.R,
  ]);
  const rootIdClaim = f.memory.ensure(
    value(f, result, "ROOT_ID_TAG"),
    rootIdArgs,
  );
  const rule = f.memory.ensure(fullSelfClaim, rootIdClaim);
  return f.memory.ensure(value(f, result, "FND02_PREMISES"), rule);
}

function inspectInstantiatedStatement(
  f: Fixture,
  result: V015FormalRecursiveCompileResult,
  statement: LinkHandle,
  candidate: LinkHandle,
  label: string,
): void {
  const theoremPoles = f.memory.poles(statement);
  same(
    theoremPoles.start,
    value(f, result, "FND02_PREMISES"),
    `${label} exact A1 premise carrier`,
  );
  const premiseValues = readExactSequence(f.memory, theoremPoles.start).values;
  same(premiseValues.length, 1, `${label} one formal premise`);
  same(
    premiseValues[0],
    value(f, result, "A1RecursiveSeparation"),
    `${label} A1 premise`,
  );
  const statementPoles = f.memory.poles(theoremPoles.end);
  const fullSelf = f.memory.poles(statementPoles.start);
  const fullSelfArgs = readExactSequence(f.memory, fullSelf.end).values;
  same(fullSelf.start, value(f, result, "FULL_SELF_TAG"), `${label} FullSelf tag`);
  same(fullSelfArgs.length, 2, `${label} FullSelf arity`);
  same(fullSelfArgs[0], candidate, `${label} FullSelf subject`);
  same(
    fullSelfArgs[1],
    f.memory.ensure(candidate, candidate),
    `${label} FullSelf construction X(X)`,
  );

  const rootIdentity = f.memory.poles(statementPoles.end);
  const rootIdentityArgs = readExactSequence(f.memory, rootIdentity.end).values;
  same(rootIdentity.start, value(f, result, "ROOT_ID_TAG"), `${label} identity tag`);
  same(rootIdentityArgs.length, 2, `${label} identity arity`);
  same(rootIdentityArgs[0], candidate, `${label} identity subject`);
  same(rootIdentityArgs[1], f.basis.R, `${label} identity root`);
}

{
  same(fnd02Formal.migrationStatus, "FORMAL_MIGRATED", "FND-02 migration status");
  same(fnd02Formal.proofClosure, "N_A_FOR_KERNEL_REALIZATION", "FND-02 closure boundary");
  same(
    fnd02Formal.formalStatement,
    "FND02_STATEMENT : FND02_PREMISES->FND02_RULE",
    "FND-02 canonical FORMAL statement",
  );
  same(fnd02Formal.formalPremises.length, 1, "FND-02 one external premise");
  same(fnd02Formal.formalPremises[0], "A1RecursiveSeparation", "FND-02 exact A1 premise");
  same(fnd02Formal.formalDomain?.length, 1, "FND-02 one bound domain");
  same(fnd02Formal.formalDomain?.[0], "X : Link", "FND-02 bound Link domain");
  assert(fnd02Formal.formalNonPremises?.includes("Grounded(X)"), "Grounded is explicitly non-premise");
  assert(fnd02Formal.formalNonPremises?.includes("F2/F3 normalization"), "F2/F3 are explicitly non-premises");
  assert(fnd02Formal.formalNonPremises?.includes("FND-13"), "FND-13 is explicitly non-premise");
  same(fnd02Formal.nativeClassification, "KERNEL_REALIZED_NOT_INDEPENDENT", "FND-02 native classification");
  same(fnd02Formal.kernelLaw, "recursive-link-identity/full-full-canonical-root-base", "FND-02 kernel law");
  same(fnd02Formal.nativeIndependent, false, "FND-02 kernel realization is not independent");
  same(fnd02Formal.aproverStatus, "NOT_RECORDED", "FND-02 aprover boundary");

  const f = fixture();
  const source = boundSource("X");
  assert(!source.includes("="), "B15 theorem template must not use eager runtime equality");
  assert(!source.includes("Grounded"), "B15 source must not add external Grounded premise");
  assert(!source.includes("F2") && !source.includes("F3"), "B15 source must not add F2/F3 normalization");
  assert(!source.includes("FND-13"), "B15 source must not add FND-13 dependency");

  const result = compile(f, source);
  const xRole = value(f, result, "X");
  const roleValues = readExactSequence(
    f.memory,
    value(f, result, "BOUND_ROLES"),
  ).values;
  same(roleValues.length, 1, "one admitted bound role");
  same(roleValues[0], xRole, "bound role comes from FORMAL source");

  const domainClaim = f.memory.poles(value(f, result, "X_LINK_DOMAIN"));
  same(domainClaim.start, value(f, result, "LINK_DOMAIN_TAG"), "bound Link domain tag");
  same(domainClaim.end, xRole, "bound Link domain targets exact role identity");

  const roleDictionary = defineStructuralRoleDictionary(f.memory, roleValues);
  const dictionary = readStructuralRoleDictionary(f.memory, roleDictionary);
  same(dictionary.roles.length, 1, "role dictionary arity");
  same(dictionary.roles[0], xRole, "role dictionary binds exact Link identity");

  const template = value(f, result, "FND02_STATEMENT");
  const kernelBoundary = f.memory.poles(value(f, result, "KERNEL_REALIZATION_BOUNDARY"));
  same(
    kernelBoundary.start,
    value(f, result, "KERNEL_REALIZATION_TAG"),
    "kernel realization boundary tag",
  );
  const kernelArgs = readExactSequence(f.memory, kernelBoundary.end).values;
  same(kernelArgs.length, 2, "kernel realization boundary arity");
  same(kernelArgs[0], template, "kernel realization boundary references exact theorem statement");
  same(kernelArgs[1], f.basis.R, "kernel realization boundary references canonical ROOT");

  const kernelBefore = f.memory.linkCount;
  const kernelReplay = replayRecursiveLinkIdentityProofAset(f.memory, f.basis.R);
  same(kernelReplay.left, f.basis.R, "canonical ROOT full/full kernel left");
  same(kernelReplay.right, f.basis.R, "canonical ROOT full/full kernel right");
  same(f.memory.linkCount, kernelBefore, "kernel replay remains read-only");

  const synthetic = (): LinkHandle => Object.freeze({}) as unknown as LinkHandle;
  const syntheticRoot = synthetic();
  const nonRootFull = synthetic();
  const nonRootClaim = synthetic();
  const nonRootProof = synthetic();
  const nonRootMemory = new SyntheticReadMemory(
    syntheticRoot,
    new Map<LinkHandle, LinkPoles>([
      [syntheticRoot, Object.freeze({ start: syntheticRoot, end: syntheticRoot })],
      [nonRootFull, Object.freeze({ start: nonRootFull, end: nonRootFull })],
      [nonRootClaim, Object.freeze({ start: nonRootFull, end: nonRootFull })],
      [nonRootProof, Object.freeze({ start: nonRootClaim, end: syntheticRoot })],
    ]),
  );
  expectKernelError(
    "invalid-root-base",
    () => replayRecursiveLinkIdentityProofAset(nonRootMemory, nonRootProof),
    "synthetic non-root full/full base",
  );

  const a = value(f, result, "A");
  const b = value(f, result, "B");
  assert(a !== b && a !== xRole && b !== xRole, "distinct concrete substitutions");

  const aStatement = instantiateV013StructuralTemplate(
    f.memory,
    template,
    [{ role: xRole, value: a }],
  );
  const bStatement = instantiateV013StructuralTemplate(
    f.memory,
    template,
    [{ role: xRole, value: b }],
  );
  same(aStatement, expectedStatement(f, result, a), "A exact instantiated statement");
  same(bStatement, expectedStatement(f, result, b), "B exact instantiated statement");
  assert(aStatement !== bStatement, "different Link bindings change instantiated claim");
  inspectInstantiatedStatement(f, result, aStatement, a, "A");
  inspectInstantiatedStatement(f, result, bStatement, b, "B");

  const expectedInterpreter: StructuralInterpreter = Object.freeze({
    dictionary: value(f, result, "INTERP_DICT"),
    grammar: value(f, result, "INTERP_GRAM"),
    theory: value(f, result, "THEORY"),
  });
  const interpreter = defineStructuralInterpreter(
    f.memory,
    expectedInterpreter.dictionary,
    expectedInterpreter.grammar,
    expectedInterpreter.theory,
  );
  const rule = defineStructuralRule(f.memory, roleDictionary, template);
  const admission = admitStructuralRule(f.memory, expectedInterpreter.theory, rule);

  for (const [label, candidate, claimedBody] of [
    ["A", a, aStatement],
    ["B", b, bStatement],
  ] as const) {
    const afterContext = defineContext(
      f.memory,
      value(f, result, "CTX_PARENT"),
      candidate,
    );
    const act = defineActHeader(
      f.memory,
      interpreter,
      roleDictionary,
      afterContext,
    );
    defineActField(f.memory, act, xRole, candidate);
    const replay = replayStructuralRule(f.memory, {
      act,
      rule,
      ruleAdmission: admission,
      claimedBody,
      expectedInterpreter,
      expectedAfterContext: afterContext,
    });
    same(replay.bindings.length, 1, `${label} exact binding count`);
    same(replay.bindings[0]?.role, xRole, `${label} bound role`);
    same(replay.bindings[0]?.value, candidate, `${label} bound value`);
  }

  {
    const afterContext = defineContext(
      f.memory,
      value(f, result, "CTX_PARENT"),
      f.basis.U,
    );
    const missing = defineActHeader(
      f.memory,
      interpreter,
      roleDictionary,
      afterContext,
    );
    expectRuleError(
      "missing-role-binding",
      () => replayStructuralRule(f.memory, {
        act: missing,
        rule,
        ruleAdmission: admission,
        claimedBody: aStatement,
        expectedInterpreter,
        expectedAfterContext: afterContext,
      }),
      "missing bound Link value",
    );
  }

  {
    const afterContext = defineContext(
      f.memory,
      value(f, result, "CTX_PARENT"),
      f.basis.L,
    );
    const duplicate = defineActHeader(
      f.memory,
      interpreter,
      roleDictionary,
      afterContext,
    );
    defineActField(f.memory, duplicate, xRole, a);
    defineActField(f.memory, duplicate, xRole, b);
    expectRuleError(
      "multiple-role-bindings",
      () => replayStructuralRule(f.memory, {
        act: duplicate,
        rule,
        ruleAdmission: admission,
        claimedBody: aStatement,
        expectedInterpreter,
        expectedAfterContext: afterContext,
      }),
      "duplicate bound Link value",
    );
  }

  const json = encodeV015FormalSourceAsetJson(
    f.memory,
    f.basis,
    f.grammarRoot,
    f.namespaceProfileRoot,
    f.definitionProfileRoot,
    result.source.sourceAset,
  );
  assert(
    decoder.decode(json).includes(`"schema":"${V015_FORMAL_JSON_J1_SCHEMA}"`),
    "contextual binder needs no new JSON syntax/profile",
  );
  const round = decodeV015FormalSourceAsetJson(
    f.memory,
    f.basis,
    f.grammarRoot,
    f.namespaceProfileRoot,
    f.definitionProfileRoot,
    json,
  );
  same(round.sourceAset, result.source.sourceAset, "J1 exact source-Aset round-trip");

  const alpha = compile(f, boundSource("Y"));
  same(value(f, alpha, "Y"), xRole, "alpha-renamed presentation resolves same role Link");
  same(
    value(f, alpha, "FND02_STATEMENT"),
    template,
    "alpha-renamed presentation preserves statement topology",
  );

  const free = compile(f, freeSameSpellingSource());
  const freeX = value(f, free, "X");
  assert(freeX !== xRole, "same spelling in independent source resolves different Link");
  const freeClaim = value(f, free, "FREE_CLAIM");
  const untouchedFreeClaim = instantiateV013StructuralTemplate(
    f.memory,
    freeClaim,
    [{ role: xRole, value: a }],
  );
  same(
    untouchedFreeClaim,
    freeClaim,
    "same-spelling free Link is not captured by another source role",
  );
}

console.log([
  "MTS v0.15 B12 bound Link role:",
  "BOUNDNESS=CONTEXTUAL_ROLE_DICTIONARY",
  "INTRINSIC_VARIABLE_LINK_KIND=0",
  "NEW_BINDER_SYNTAX=0",
  "JSON_PROFILE=J1_UNCHANGED",
  "FND02_BOUNDARY=A1_FORALL_LINK_FULLSELF_IMPLIES_ROOT",
  "A1_PREMISE=EXPLICIT",
  "LINK_DOMAIN=X:LINK",
  "EXTERNAL_GROUNDED_PREMISE=0",
  "F2_F3_PREMISE=0",
  "FND13_PREMISE=0",
  "KERNEL_CLASSIFICATION=KERNEL_REALIZED_NOT_INDEPENDENT",
  "KERNEL_ROOT_BASE=ACCEPT",
  "KERNEL_NONROOT_FULL_BASE=REJECT",
  "KERNEL_REPLAY_READ_ONLY=GREEN",
  "RUNTIME_EQUALITY_IN_TEMPLATE=0",
  "TWO_INSTANTIATIONS=GREEN",
  "CONSISTENT_SUBSTITUTION=GREEN",
  "MISSING_BINDING=REJECT",
  "DUPLICATE_BINDING=REJECT",
  "ALPHA_RENAME=SEMANTICALLY_STABLE",
  "SAME_SPELLING_FREE_CAPTURE=REJECTED_BY_IDENTITY",
  "UNIVERSAL_PROOF=NOT_CLAIMED",
].join(" "));
