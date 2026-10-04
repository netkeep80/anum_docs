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
const fnd13Formal = formalOverlayEntry("FND-13");

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

function fnd13Source(xRoleName: string, yRoleName: string): string {
  return [
    "R : R->R",
    "O : O->R",
    "C : R->C",
    "L : O->C",
    "U : C->O",
    `${xRoleName} : U->L`,
    `${yRoleName} : L->U`,
    "LINK_DOMAIN_TAG : U->R",
    "GROUNDED_TAG : C->L",
    "START_OF_TAG : R->U",
    "FINISH_OF_TAG : O->C",
    "LINK_ID_TAG : O->U",
    "POLE_ID_TAG : C->U",
    "ORDERED_POLE_ID_TAG : L->R",
    "F2F3GroundedNormalization : R->C",
    "INTERP_DICT : L->R",
    "INTERP_GRAM : C->L",
    "THEORY : U->C",
    "CTX_PARENT : L->U",
    `X_LINK_DOMAIN : LINK_DOMAIN_TAG->${xRoleName}`,
    `Y_LINK_DOMAIN : LINK_DOMAIN_TAG->${yRoleName}`,
    `GROUNDED_X_CLAIM : GROUNDED_TAG->${xRoleName}`,
    `GROUNDED_Y_CLAIM : GROUNDED_TAG->${yRoleName}`,
    "FND13_PREMISES : [F2F3GroundedNormalization,GROUNDED_X_CLAIM,GROUNDED_Y_CLAIM]",
    `LINK_ID_ARGS : [${xRoleName},${yRoleName}]`,
    "LINK_ID_CLAIM : LINK_ID_TAG->LINK_ID_ARGS",
    `START_X : START_OF_TAG->${xRoleName}`,
    `START_Y : START_OF_TAG->${yRoleName}`,
    "START_POLE_ID_ARGS : [START_X,START_Y]",
    "START_POLE_ID_CLAIM : POLE_ID_TAG->START_POLE_ID_ARGS",
    `FINISH_X : FINISH_OF_TAG->${xRoleName}`,
    `FINISH_Y : FINISH_OF_TAG->${yRoleName}`,
    "FINISH_POLE_ID_ARGS : [FINISH_X,FINISH_Y]",
    "FINISH_POLE_ID_CLAIM : POLE_ID_TAG->FINISH_POLE_ID_ARGS",
    "ORDERED_POLE_ID_ARGS : [START_POLE_ID_CLAIM,FINISH_POLE_ID_CLAIM]",
    "ORDERED_POLE_ID_CLAIM : ORDERED_POLE_ID_TAG->ORDERED_POLE_ID_ARGS",
    "FND13_FORWARD : LINK_ID_CLAIM->ORDERED_POLE_ID_CLAIM",
    "FND13_REVERSE : ORDERED_POLE_ID_CLAIM->LINK_ID_CLAIM",
    "FND13_RULES : [FND13_FORWARD,FND13_REVERSE]",
    fnd13Formal.formalStatement,
    "KERNEL_REALIZATION_TAG13 : R->O",
    `KERNEL_REALIZATION_ARGS13 : [FND13_STATEMENT,${xRoleName},${yRoleName}]`,
    "KERNEL_REALIZATION_BOUNDARY13 : KERNEL_REALIZATION_TAG13->KERNEL_REALIZATION_ARGS13",
    `BOUND_ROLES13 : [${xRoleName},${yRoleName}]`,
    "A13 : R->L",
    "B13 : L->C",
    "C13 : C->R",
    "D13 : O->L",
  ].join("\n");
}

function fnd13FreeSameSpellingSource(): string {
  return [
    "R : R->R",
    "O : O->R",
    "C : R->C",
    "L : O->C",
    "U : C->O",
    "X : R->U",
    "Y : C->R",
    "FREE13_TAG : U->R",
    "FREE13_ARGS : [X,Y]",
    "FREE13_CLAIM : FREE13_TAG->FREE13_ARGS",
  ].join("\n");
}

function expectedFnd13Statement(
  f: Fixture,
  result: V015FormalRecursiveCompileResult,
  x: LinkHandle,
  y: LinkHandle,
): LinkHandle {
  const groundedX = f.memory.ensure(value(f, result, "GROUNDED_TAG"), x);
  const groundedY = f.memory.ensure(value(f, result, "GROUNDED_TAG"), y);
  const premises = materializeExactSequence(f.memory, [
    value(f, result, "F2F3GroundedNormalization"),
    groundedX,
    groundedY,
  ]);

  const linkIdArgs = materializeExactSequence(f.memory, [x, y]);
  const linkId = f.memory.ensure(value(f, result, "LINK_ID_TAG"), linkIdArgs);

  const startX = f.memory.ensure(value(f, result, "START_OF_TAG"), x);
  const startY = f.memory.ensure(value(f, result, "START_OF_TAG"), y);
  const startArgs = materializeExactSequence(f.memory, [startX, startY]);
  const startId = f.memory.ensure(value(f, result, "POLE_ID_TAG"), startArgs);

  const finishX = f.memory.ensure(value(f, result, "FINISH_OF_TAG"), x);
  const finishY = f.memory.ensure(value(f, result, "FINISH_OF_TAG"), y);
  const finishArgs = materializeExactSequence(f.memory, [finishX, finishY]);
  const finishId = f.memory.ensure(value(f, result, "POLE_ID_TAG"), finishArgs);

  const orderedArgs = materializeExactSequence(f.memory, [startId, finishId]);
  const ordered = f.memory.ensure(value(f, result, "ORDERED_POLE_ID_TAG"), orderedArgs);
  const forward = f.memory.ensure(linkId, ordered);
  const reverse = f.memory.ensure(ordered, linkId);
  const rules = materializeExactSequence(f.memory, [forward, reverse]);
  return f.memory.ensure(premises, rules);
}

function inspectFnd13Statement(
  f: Fixture,
  result: V015FormalRecursiveCompileResult,
  statement: LinkHandle,
  x: LinkHandle,
  y: LinkHandle,
  label: string,
): void {
  const theorem = f.memory.poles(statement);
  const premises = readExactSequence(f.memory, theorem.start).values;
  same(premises.length, 3, `${label} three exact FND-13 premises`);
  same(
    premises[0],
    value(f, result, "F2F3GroundedNormalization"),
    `${label} grounded normalization premise`,
  );
  same(
    premises[1],
    f.memory.ensure(value(f, result, "GROUNDED_TAG"), x),
    `${label} Grounded:x premise`,
  );
  same(
    premises[2],
    f.memory.ensure(value(f, result, "GROUNDED_TAG"), y),
    `${label} Grounded:y premise`,
  );

  const rules = readExactSequence(f.memory, theorem.end).values;
  same(rules.length, 2, `${label} biconditional direction count`);
  const forward = f.memory.poles(rules[0]!);
  const reverse = f.memory.poles(rules[1]!);
  same(forward.start, reverse.end, `${label} shared Link-identity claim`);
  same(forward.end, reverse.start, `${label} shared ordered-pole claim`);

  const linkId = f.memory.poles(forward.start);
  same(linkId.start, value(f, result, "LINK_ID_TAG"), `${label} Link-identity tag`);
  const linkArgs = readExactSequence(f.memory, linkId.end).values;
  same(linkArgs.length, 2, `${label} Link-identity arity`);
  same(linkArgs[0], x, `${label} Link-identity x`);
  same(linkArgs[1], y, `${label} Link-identity y`);

  const ordered = f.memory.poles(forward.end);
  same(
    ordered.start,
    value(f, result, "ORDERED_POLE_ID_TAG"),
    `${label} ordered-pole identity tag`,
  );
  const poleClaims = readExactSequence(f.memory, ordered.end).values;
  same(poleClaims.length, 2, `${label} ordered start/finish claim count`);

  for (const [poleLabel, claim, projectionTag] of [
    ["start", poleClaims[0]!, value(f, result, "START_OF_TAG")],
    ["finish", poleClaims[1]!, value(f, result, "FINISH_OF_TAG")],
  ] as const) {
    const poleId = f.memory.poles(claim);
    same(poleId.start, value(f, result, "POLE_ID_TAG"), `${label} ${poleLabel} identity tag`);
    const poleArgs = readExactSequence(f.memory, poleId.end).values;
    same(poleArgs.length, 2, `${label} ${poleLabel} identity arity`);
    const leftProjection = f.memory.poles(poleArgs[0]!);
    const rightProjection = f.memory.poles(poleArgs[1]!);
    same(leftProjection.start, projectionTag, `${label} ${poleLabel} left projection tag`);
    same(leftProjection.end, x, `${label} ${poleLabel} left subject`);
    same(rightProjection.start, projectionTag, `${label} ${poleLabel} right projection tag`);
    same(rightProjection.end, y, `${label} ${poleLabel} right subject`);
  }
}

function identityProof(
  memory: Memory,
  left: LinkHandle,
  right: LinkHandle,
  children: readonly LinkHandle[],
): LinkHandle {
  const claim = memory.ensure(left, right);
  return memory.ensure(claim, materializeExactSequence(memory, children));
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

{
  same(fnd13Formal.migrationStatus, "FORMAL_MIGRATED", "FND-13 migration status");
  same(fnd13Formal.proofClosure, "N_A_FOR_KERNEL_REALIZATION", "FND-13 closure boundary");
  same(
    fnd13Formal.formalStatement,
    "FND13_STATEMENT : FND13_PREMISES->FND13_RULES",
    "FND-13 canonical FORMAL statement",
  );
  same(fnd13Formal.formalPremises.length, 3, "FND-13 exact premise count");
  same(fnd13Formal.formalPremises[0], "F2F3GroundedNormalization", "FND-13 grounded normalization");
  same(fnd13Formal.formalPremises[1], "Grounded:x", "FND-13 Grounded:x");
  same(fnd13Formal.formalPremises[2], "Grounded:y", "FND-13 Grounded:y");
  same(fnd13Formal.formalDomain?.length, 2, "FND-13 bound Link domain arity");
  same(fnd13Formal.formalDomain?.[0], "x : Link", "FND-13 x domain");
  same(fnd13Formal.formalDomain?.[1], "y : Link", "FND-13 y domain");
  assert(fnd13Formal.formalNonPremises?.includes("FND-02"), "FND-02 explicitly non-premise");
  assert(fnd13Formal.formalNonPremises?.includes("F2F3Normalization"), "global normalization explicitly non-premise");
  assert(
    fnd13Formal.formalNonPremises?.includes("arbitrary non-grounded Link extensionality"),
    "arbitrary non-grounded extensionality explicitly excluded",
  );
  same(fnd13Formal.nativeClassification, "KERNEL_REALIZED_NOT_INDEPENDENT", "FND-13 native classification");
  same(fnd13Formal.kernelLaw, "recursive-link-identity/ordered-pole-grounded-closure", "FND-13 kernel law");
  same(fnd13Formal.nativeIndependent, false, "FND-13 native realization is not independent");
  same(fnd13Formal.aproverStatus, "NOT_RECORDED", "FND-13 aprover boundary");

  const f = fixture();
  const source = fnd13Source("X", "Y");
  assert(!source.includes("="), "B16 theorem source must not use eager runtime equality");
  assert(!source.includes("FND-02"), "B16 theorem source must not depend on FND-02");
  assert(!source.includes("F2F3Normalization"), "B16 theorem source must not widen to global normalization");

  const result = compile(f, source);
  const xRole = value(f, result, "X");
  const yRole = value(f, result, "Y");
  assert(xRole !== yRole, "FND-13 binds two distinct role Links");

  for (const [domainName, role, label] of [
    ["X_LINK_DOMAIN", xRole, "x"],
    ["Y_LINK_DOMAIN", yRole, "y"],
  ] as const) {
    const domain = f.memory.poles(value(f, result, domainName));
    same(domain.start, value(f, result, "LINK_DOMAIN_TAG"), `${label} Link-domain tag`);
    same(domain.end, role, `${label} Link-domain exact role identity`);
  }

  const roleValues = readExactSequence(f.memory, value(f, result, "BOUND_ROLES13")).values;
  same(roleValues.length, 2, "FND-13 role dictionary arity");
  same(roleValues[0], xRole, "FND-13 first role is x");
  same(roleValues[1], yRole, "FND-13 second role is y");
  const roleDictionary = defineStructuralRoleDictionary(f.memory, roleValues);
  const dictionary = readStructuralRoleDictionary(f.memory, roleDictionary);
  same(dictionary.roles.length, 2, "generic RoleDictionary carries two roles");

  const template = value(f, result, "FND13_STATEMENT");
  const kernelBoundary = f.memory.poles(value(f, result, "KERNEL_REALIZATION_BOUNDARY13"));
  same(
    kernelBoundary.start,
    value(f, result, "KERNEL_REALIZATION_TAG13"),
    "FND-13 kernel boundary tag",
  );
  const kernelArgs = readExactSequence(f.memory, kernelBoundary.end).values;
  same(kernelArgs.length, 3, "FND-13 kernel boundary arity");
  same(kernelArgs[0], template, "FND-13 kernel boundary references exact statement");
  same(kernelArgs[1], xRole, "FND-13 kernel boundary references x role");
  same(kernelArgs[2], yRole, "FND-13 kernel boundary references y role");

  const rootProof = identityProof(f.memory, f.basis.R, f.basis.R, []);
  const oProof = identityProof(f.memory, f.basis.O, f.basis.O, [rootProof]);
  const cProof = identityProof(f.memory, f.basis.C, f.basis.C, [rootProof]);
  const lProof = identityProof(f.memory, f.basis.L, f.basis.L, [oProof, cProof]);
  const kernelBefore = f.memory.linkCount;
  const kernelReplay = replayRecursiveLinkIdentityProofAset(f.memory, lProof);
  same(kernelReplay.left, f.basis.L, "finite Grounded ordered-pole kernel left");
  same(kernelReplay.right, f.basis.L, "finite Grounded ordered-pole kernel right");
  same(f.memory.linkCount, kernelBefore, "FND-13 kernel replay remains read-only");

  const wrongChildProof = identityProof(f.memory, f.basis.L, f.basis.L, [cProof, oProof]);
  const wrongChildBefore = f.memory.linkCount;
  expectKernelError(
    "child-claim-mismatch",
    () => replayRecursiveLinkIdentityProofAset(f.memory, wrongChildProof),
    "ordered pole child mismatch",
  );
  same(f.memory.linkCount, wrongChildBefore, "failed ordered-pole replay remains read-only");

  const synthetic = (): LinkHandle => Object.freeze({}) as unknown as LinkHandle;
  const sr = synthetic();
  const aCycle = synthetic();
  const bCycle = synthetic();
  const claimAA = synthetic();
  const claimBB = synthetic();
  const pCycle = synthetic();
  const qCycle = synthetic();
  const seqQ = synthetic();
  const payloadQ = synthetic();
  const seqP = synthetic();
  const payloadP = synthetic();
  const cyclicMemory = new SyntheticReadMemory(sr, new Map<LinkHandle, LinkPoles>([
    [sr, Object.freeze({ start: sr, end: sr })],
    [aCycle, Object.freeze({ start: aCycle, end: bCycle })],
    [bCycle, Object.freeze({ start: bCycle, end: aCycle })],
    [claimAA, Object.freeze({ start: aCycle, end: aCycle })],
    [claimBB, Object.freeze({ start: bCycle, end: bCycle })],
    [payloadQ, Object.freeze({ start: sr, end: qCycle })],
    [seqQ, Object.freeze({ start: seqQ, end: payloadQ })],
    [payloadP, Object.freeze({ start: sr, end: pCycle })],
    [seqP, Object.freeze({ start: seqP, end: payloadP })],
    [pCycle, Object.freeze({ start: claimAA, end: seqQ })],
    [qCycle, Object.freeze({ start: claimBB, end: seqP })],
  ]));
  const cycleBefore = cyclicMemory.linkCount;
  expectKernelError(
    "cyclic-grounding",
    () => replayRecursiveLinkIdentityProofAset(cyclicMemory, pCycle),
    "rootless cyclic grounding",
  );
  same(cyclicMemory.linkCount, cycleBefore, "cyclic rejection remains read-only");

  const a = value(f, result, "A13");
  const b = value(f, result, "B13");
  const c = value(f, result, "C13");
  const d = value(f, result, "D13");
  assert(
    new Set([a, b, c, d, xRole, yRole]).size === 6,
    "FND-13 concrete values and roles are distinct",
  );

  const abStatement = instantiateV013StructuralTemplate(
    f.memory,
    template,
    [{ role: xRole, value: a }, { role: yRole, value: b }],
  );
  const cdStatement = instantiateV013StructuralTemplate(
    f.memory,
    template,
    [{ role: xRole, value: c }, { role: yRole, value: d }],
  );
  same(abStatement, expectedFnd13Statement(f, result, a, b), "FND-13 A/B exact statement");
  same(cdStatement, expectedFnd13Statement(f, result, c, d), "FND-13 C/D exact statement");
  assert(abStatement !== cdStatement, "two-role substitutions change the theorem instance");
  inspectFnd13Statement(f, result, abStatement, a, b, "A/B");
  inspectFnd13Statement(f, result, cdStatement, c, d, "C/D");

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
  const afterContext = defineContext(f.memory, value(f, result, "CTX_PARENT"), a);
  const act = defineActHeader(f.memory, interpreter, roleDictionary, afterContext);
  defineActField(f.memory, act, xRole, a);
  defineActField(f.memory, act, yRole, b);
  const replay = replayStructuralRule(f.memory, {
    act,
    rule,
    ruleAdmission: admission,
    claimedBody: abStatement,
    expectedInterpreter,
    expectedAfterContext: afterContext,
  });
  same(replay.bindings.length, 2, "FND-13 two exact structural bindings");
  same(replay.bindings[0]?.role, xRole, "FND-13 first binding role");
  same(replay.bindings[0]?.value, a, "FND-13 first binding value");
  same(replay.bindings[1]?.role, yRole, "FND-13 second binding role");
  same(replay.bindings[1]?.value, b, "FND-13 second binding value");

  // Act headers are canonical Links. Give each negative case its own
  // after-Context so a previously attached field cannot be inherited by
  // reusing the same semantic Act header.
  const missingAfterContext = defineContext(
    f.memory,
    value(f, result, "CTX_PARENT"),
    c,
  );
  const missing = defineActHeader(
    f.memory,
    interpreter,
    roleDictionary,
    missingAfterContext,
  );
  defineActField(f.memory, missing, xRole, a);
  expectRuleError(
    "missing-role-binding",
    () => replayStructuralRule(f.memory, {
      act: missing,
      rule,
      ruleAdmission: admission,
      claimedBody: abStatement,
      expectedInterpreter,
      expectedAfterContext: missingAfterContext,
    }),
    "FND-13 missing y binding",
  );

  const duplicateAfterContext = defineContext(
    f.memory,
    value(f, result, "CTX_PARENT"),
    d,
  );
  const duplicate = defineActHeader(
    f.memory,
    interpreter,
    roleDictionary,
    duplicateAfterContext,
  );
  defineActField(f.memory, duplicate, xRole, a);
  defineActField(f.memory, duplicate, xRole, c);
  defineActField(f.memory, duplicate, yRole, b);
  expectRuleError(
    "multiple-role-bindings",
    () => replayStructuralRule(f.memory, {
      act: duplicate,
      rule,
      ruleAdmission: admission,
      claimedBody: abStatement,
      expectedInterpreter,
      expectedAfterContext: duplicateAfterContext,
    }),
    "FND-13 duplicate x binding",
  );

  const json = encodeV015FormalSourceAsetJson(
    f.memory,
    f.basis,
    f.grammarRoot,
    f.namespaceProfileRoot,
    f.definitionProfileRoot,
    result.source.sourceAset,
  );
  const round = decodeV015FormalSourceAsetJson(
    f.memory,
    f.basis,
    f.grammarRoot,
    f.namespaceProfileRoot,
    f.definitionProfileRoot,
    json,
  );
  same(round.sourceAset, result.source.sourceAset, "FND-13 J1 exact source-Aset round-trip");

  const alpha = compile(f, fnd13Source("P", "Q"));
  same(value(f, alpha, "P"), xRole, "FND-13 alpha-renamed x role identity");
  same(value(f, alpha, "Q"), yRole, "FND-13 alpha-renamed y role identity");
  same(
    value(f, alpha, "FND13_STATEMENT"),
    template,
    "FND-13 alpha rename preserves statement topology",
  );

  const free = compile(f, fnd13FreeSameSpellingSource());
  const freeX = value(f, free, "X");
  const freeY = value(f, free, "Y");
  assert(freeX !== xRole && freeY !== yRole, "FND-13 same spelling resolves distinct free Links");
  const freeClaim = value(f, free, "FREE13_CLAIM");
  const untouchedFree = instantiateV013StructuralTemplate(
    f.memory,
    freeClaim,
    [{ role: xRole, value: a }, { role: yRole, value: b }],
  );
  same(untouchedFree, freeClaim, "FND-13 same-spelling free Links are not captured");
}

console.log([
  "MTS v0.15 B12 bound Link role:",
  "BOUNDNESS=CONTEXTUAL_ROLE_DICTIONARY",
  "INTRINSIC_VARIABLE_LINK_KIND=0",
  "NEW_BINDER_SYNTAX=0",
  "JSON_PROFILE=DIRECT_BUNDLE",
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
  "FND13_BOUNDARY=GROUNDED_ORDERED_POLE_IDENTITY",
  "FND13_BOUND_ROLES=2",
  "FND13_PREMISES=F2F3_GROUNDED_NORMALIZATION+GROUNDED_X+GROUNDED_Y",
  "FND13_FND02_DEPENDENCY=0",
  "FND13_GLOBAL_NORMALIZATION=0",
  "FND13_KERNEL_CLASSIFICATION=KERNEL_REALIZED_NOT_INDEPENDENT",
  "FND13_FINITE_GROUNDED=ACCEPT",
  "FND13_ORDERED_POLE_MISMATCH=REJECT",
  "FND13_ROOTLESS_CYCLE=REJECT",
  "FND13_REPLAY_READ_ONLY=GREEN",
].join(" "));
