import {
  materializeExactSequence,
  readExactSequence,
} from "../src/exact-sequence.js";
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

function boundSource(roleName: string, roleDefinition = "U->L"): string {
  return [
    "R : R->R",
    "O : O->R",
    "C : R->C",
    "L : O->C",
    "U : C->O",
    `${roleName} : ${roleDefinition}`,
    "FULL_SELF_TAG : R->U",
    "ROOT_ID_TAG : O->U",
    "INTERP_DICT : L->R",
    "INTERP_GRAM : C->L",
    "THEORY : U->C",
    "CTX_PARENT : L->U",
    `FULL_SELF_PAIR : ${roleName}(${roleName})`,
    `FULL_SELF_ARGS : [${roleName},FULL_SELF_PAIR]`,
    "FULL_SELF_CLAIM : FULL_SELF_TAG->FULL_SELF_ARGS",
    `ROOT_ID_ARGS : [${roleName},R]`,
    "ROOT_ID_CLAIM : ROOT_ID_TAG->ROOT_ID_ARGS",
    "FND02_STATEMENT : FULL_SELF_CLAIM->ROOT_ID_CLAIM",
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
  return f.memory.ensure(fullSelfClaim, rootIdClaim);
}

function inspectInstantiatedStatement(
  f: Fixture,
  result: V015FormalRecursiveCompileResult,
  statement: LinkHandle,
  candidate: LinkHandle,
  label: string,
): void {
  const statementPoles = f.memory.poles(statement);
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
  const f = fixture();
  const source = boundSource("X");
  assert(!source.includes("="), "B12 theorem template must not use eager runtime equality");

  const result = compile(f, source);
  const xRole = value(f, result, "X");
  const roleValues = readExactSequence(
    f.memory,
    value(f, result, "BOUND_ROLES"),
  ).values;
  same(roleValues.length, 1, "one admitted bound role");
  same(roleValues[0], xRole, "bound role comes from FORMAL source");

  const roleDictionary = defineStructuralRoleDictionary(f.memory, roleValues);
  const dictionary = readStructuralRoleDictionary(f.memory, roleDictionary);
  same(dictionary.roles.length, 1, "role dictionary arity");
  same(dictionary.roles[0], xRole, "role dictionary binds exact Link identity");

  const template = value(f, result, "FND02_STATEMENT");
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
  "NEW_BINDER_SYNTAX=0",
  "JSON_PROFILE=J1_UNCHANGED",
  "FND02_BOUNDARY=FORALL_LINK_FULLSELF_IMPLIES_ROOT",
  "EXTERNAL_GROUNDED_PREMISE=0",
  "RUNTIME_EQUALITY_IN_TEMPLATE=0",
  "TWO_INSTANTIATIONS=GREEN",
  "CONSISTENT_SUBSTITUTION=GREEN",
  "MISSING_BINDING=REJECT",
  "DUPLICATE_BINDING=REJECT",
  "ALPHA_RENAME=SEMANTICALLY_STABLE",
  "SAME_SPELLING_FREE_CAPTURE=REJECTED_BY_IDENTITY",
  "UNIVERSAL_PROOF=NOT_CLAIMED",
].join(" "));
