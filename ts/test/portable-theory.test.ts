import { materializeExactSequence } from "../src/exact-sequence.js";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
} from "../src/memory.js";
import {
  exportPortableStructuralDerivation,
  replayPortableStructuralDerivation,
} from "../src/portable-derivation.js";
import {
  PORTABLE_STRUCTURAL_THEORY_SCHEMA,
  PortableStructuralTheoryError,
  exportPortableStructuralTheory,
  replayPortableStructuralTheory,
  verifyPortableStructuralProofTheoryRevision,
} from "../src/portable-theory.js";
import {
  PORTABLE_STRUCTURAL_THEORY_REVISION_SCHEME,
  computePortableStructuralTheoryRevision,
} from "../src/portable-theory-digest.js";
import { defineContext } from "../src/state.js";
import { defineActField, defineActHeader } from "../src/structural-readers.js";
import {
  admitStructuralRule,
  defineStructuralInterpreter,
  defineStructuralRoleDictionary,
  defineStructuralRule,
  type StructuralInterpreter,
} from "../src/structural-rule.js";
import {
  admitStructuralDerivationRule,
  defineStructuralDerivationRule,
  defineStructuralProofOccurrence,
  defineStructuralTheorem,
  type StructuralDerivationEvidence,
  type StructuralJudgmentEvidence,
} from "../src/derivation.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}

async function expectTheory(
  code: string,
  effect: () => unknown | Promise<unknown>,
): Promise<void> {
  try {
    await effect();
  } catch (error) {
    assert(error instanceof PortableStructuralTheoryError, `${code}: wrong error type`);
    const theoryError = error as { readonly code: string };
    same(theoryError.code, code, `${code}: wrong error code`);
    return;
  }
  throw new Error(`${code}: expected exact Theory boundary rejection`);
}

interface TheoryFixture {
  readonly memory: Memory;
  readonly theory: LinkHandle;
  readonly dictionary: LinkHandle;
  readonly grammar: LinkHandle;
  readonly role: LinkHandle;
  readonly value: LinkHandle;
  readonly roleDictionary: LinkHandle;
  readonly rule: LinkHandle;
  readonly ruleAdmission: LinkHandle;
  readonly derivationRule: LinkHandle;
  readonly derivationRuleAdmission: LinkHandle;
}

function theoryFixture(templateKind: "role" | "value" = "role"): TheoryFixture {
  const memory = new Memory();
  const { R, O, C, L, U } = ensureRootBasis(memory);
  const theory = memory.ensure(L, U);
  const dictionary = L;
  const grammar = C;
  const role = O;
  const value = U;
  const roleDictionary = defineStructuralRoleDictionary(memory, [role]);
  const rule = defineStructuralRule(
    memory,
    roleDictionary,
    templateKind === "role" ? role : value,
  );
  const ruleAdmission = admitStructuralRule(memory, theory, rule);
  const derivationRule = defineStructuralDerivationRule(memory, rule, []);
  const derivationRuleAdmission = admitStructuralDerivationRule(memory, theory, derivationRule);
  void R;
  return {
    memory,
    theory,
    dictionary,
    grammar,
    role,
    value,
    roleDictionary,
    rule,
    ruleAdmission,
    derivationRule,
    derivationRuleAdmission,
  };
}

function oneNodeProof(
  fixture: TheoryFixture,
  options: {
    readonly role?: LinkHandle;
    readonly value?: LinkHandle;
    readonly roleDictionary?: LinkHandle;
    readonly rule?: LinkHandle;
    readonly ruleAdmission?: LinkHandle;
    readonly derivationRule?: LinkHandle;
    readonly derivationRuleAdmission?: LinkHandle;
  } = {},
): StructuralDerivationEvidence {
  const { memory, theory, dictionary, grammar } = fixture;
  const role = options.role ?? fixture.role;
  const value = options.value ?? fixture.value;
  const roleDictionary = options.roleDictionary ?? fixture.roleDictionary;
  const rule = options.rule ?? fixture.rule;
  const ruleAdmission = options.ruleAdmission ?? fixture.ruleAdmission;
  const derivationRule = options.derivationRule ?? fixture.derivationRule;
  const derivationRuleAdmission = options.derivationRuleAdmission ?? fixture.derivationRuleAdmission;
  const interpreter = defineStructuralInterpreter(memory, dictionary, grammar, theory);
  const expectedInterpreter: StructuralInterpreter = { dictionary, grammar, theory };
  const context = defineContext(memory, grammar, value);
  const act = defineActHeader(memory, interpreter, roleDictionary, context);
  defineActField(memory, act, role, value);
  const judgment: StructuralJudgmentEvidence = {
    application: {
      act,
      rule,
      ruleAdmission,
      claimedBody: value,
      expectedInterpreter,
      expectedAfterContext: context,
    },
    judgment: { theory, context, claim: value },
  };
  const occurrence = defineStructuralProofOccurrence(memory, act, value);
  return {
    theory,
    targetOccurrence: occurrence,
    nodes: [{
      occurrence,
      judgment,
      derivationRule,
      derivationRuleAdmission,
      premiseOccurrenceSequence: materializeExactSequence(memory, []),
    }],
  };
}

async function main(): Promise<void> {
  // Exact Theory identity is independent of proof history and unrelated topology.
  const stable = theoryFixture();
  const beforeExport = stable.memory.linkCount;
  const artifactBefore = exportPortableStructuralTheory(stable.memory, stable.theory);
  same(artifactBefore.schema, PORTABLE_STRUCTURAL_THEORY_SCHEMA, "Theory schema is versioned");
  same(artifactBefore.schema, "mts-portable-structural-theory/v0.1", "Theory schema is pinned");
  same(stable.memory.linkCount, beforeExport, "Theory export is read-only");

  const revisionBefore = await computePortableStructuralTheoryRevision(artifactBefore);
  same(
    revisionBefore.scheme,
    PORTABLE_STRUCTURAL_THEORY_REVISION_SCHEME,
    "Theory revision scheme is pinned",
  );
  assert(/^[0-9a-f]{64}$/.test(revisionBefore.value), "Theory revision is lowercase SHA-256 hex");

  const proof = oneNodeProof(stable);
  const proofArtifact = exportPortableStructuralDerivation(stable.memory, proof);
  replayPortableStructuralDerivation(proofArtifact);
  stable.memory.ensure(stable.grammar, stable.theory); // unrelated incoming Link to Theory
  defineStructuralTheorem(stable.memory, stable.value, stable.theory); // Claim-first theorem metadata
  stable.memory.ensure(stable.value, stable.dictionary); // unrelated ambient Link

  const artifactAfter = exportPortableStructuralTheory(stable.memory, stable.theory);
  const revisionAfter = await computePortableStructuralTheoryRevision(artifactAfter);
  same(JSON.stringify(artifactAfter), JSON.stringify(artifactBefore), "proof/ambient history is excluded");
  same(revisionAfter.value, revisionBefore.value, "proof/ambient history leaves Theory revision stable");

  await verifyPortableStructuralProofTheoryRevision(proofArtifact, artifactBefore, revisionBefore);

  // Portable round-trip preserves exact Theory identity and does not materialize during replay.
  const restored = replayPortableStructuralTheory(artifactBefore);
  same(restored.memory.linkCount, artifactBefore.topology.links.length, "Theory replay is read-only");
  const roundTrip = exportPortableStructuralTheory(restored.memory, restored.theory);
  same(JSON.stringify(roundTrip), JSON.stringify(artifactBefore), "Theory round-trip is byte-stable");
  const roundTripRevision = await computePortableStructuralTheoryRevision(roundTrip);
  same(roundTripRevision.value, revisionBefore.value, "Theory round-trip preserves revision");

  // Changing admitted Rule structure changes the revision.
  const structurallyChanged = theoryFixture("value");
  const changedRuleArtifact = exportPortableStructuralTheory(
    structurallyChanged.memory,
    structurallyChanged.theory,
  );
  const changedRuleRevision = await computePortableStructuralTheoryRevision(changedRuleArtifact);
  assert(changedRuleRevision.value !== revisionBefore.value, "changed admitted Rule must change revision");

  // Adding an admitted DerivationRule changes the revision.
  const derivationChanged = theoryFixture();
  const derivationBefore = await computePortableStructuralTheoryRevision(
    exportPortableStructuralTheory(derivationChanged.memory, derivationChanged.theory),
  );
  const additionalDerivationRule = defineStructuralDerivationRule(
    derivationChanged.memory,
    derivationChanged.rule,
    [derivationChanged.role],
  );
  admitStructuralDerivationRule(
    derivationChanged.memory,
    derivationChanged.theory,
    additionalDerivationRule,
  );
  const derivationAfter = await computePortableStructuralTheoryRevision(
    exportPortableStructuralTheory(derivationChanged.memory, derivationChanged.theory),
  );
  assert(derivationAfter.value !== derivationBefore.value, "extra admitted DerivationRule changes revision");

  // The authority namespace is generic: any additional outgoing(Theory) admission changes identity.
  const genericAdmission = theoryFixture();
  const genericBefore = await computePortableStructuralTheoryRevision(
    exportPortableStructuralTheory(genericAdmission.memory, genericAdmission.theory),
  );
  const futureAdmissionTarget = genericAdmission.memory.ensure(
    genericAdmission.value,
    genericAdmission.grammar,
  );
  genericAdmission.memory.ensure(genericAdmission.theory, futureAdmissionTarget);
  const genericAfter = await computePortableStructuralTheoryRevision(
    exportPortableStructuralTheory(genericAdmission.memory, genericAdmission.theory),
  );
  assert(genericAfter.value !== genericBefore.value, "new outgoing Theory admission family cannot be ignored");

  // Core attack witness: a proof under stronger self-authored T' can replay, but cannot bind to pinned T.
  const stronger = theoryFixture();
  const pinnedArtifact = exportPortableStructuralTheory(stronger.memory, stronger.theory);
  const pinnedRevision = await computePortableStructuralTheoryRevision(pinnedArtifact);
  const pinnedProof = exportPortableStructuralDerivation(stronger.memory, oneNodeProof(stronger));
  replayPortableStructuralDerivation(pinnedProof);
  await verifyPortableStructuralProofTheoryRevision(pinnedProof, pinnedArtifact, pinnedRevision);

  const extraRole = stronger.grammar;
  const extraValue = stronger.dictionary;
  const extraDictionary = defineStructuralRoleDictionary(stronger.memory, [extraRole]);
  const extraRule = defineStructuralRule(stronger.memory, extraDictionary, extraRole);
  const extraRuleAdmission = admitStructuralRule(stronger.memory, stronger.theory, extraRule);
  const extraDerivationRule = defineStructuralDerivationRule(stronger.memory, extraRule, []);
  const extraDerivationRuleAdmission = admitStructuralDerivationRule(
    stronger.memory,
    stronger.theory,
    extraDerivationRule,
  );
  const strongerEvidence = oneNodeProof(stronger, {
    role: extraRole,
    value: extraValue,
    roleDictionary: extraDictionary,
    rule: extraRule,
    ruleAdmission: extraRuleAdmission,
    derivationRule: extraDerivationRule,
    derivationRuleAdmission: extraDerivationRuleAdmission,
  });
  const strongerProof = exportPortableStructuralDerivation(stronger.memory, strongerEvidence);
  replayPortableStructuralDerivation(strongerProof); // Valid under T'.
  const strongerRevision = await computePortableStructuralTheoryRevision(
    exportPortableStructuralTheory(stronger.memory, stronger.theory),
  );
  assert(strongerRevision.value !== pinnedRevision.value, "T' must have a different exact revision");
  await expectTheory(
    "proof-theory-mismatch",
    () => verifyPortableStructuralProofTheoryRevision(strongerProof, pinnedArtifact, pinnedRevision),
  );

  // Fail closed on transport/revision forgery. A local proof coordinate is never an external revision.
  await expectTheory("unsupported-schema", () => replayPortableStructuralTheory({
    ...artifactBefore,
    schema: "mts-portable-structural-theory/v999",
  }));
  await expectTheory("unsupported-semantic-base", () => replayPortableStructuralTheory({
    ...artifactBefore,
    mtsSemanticBase: "mts-contract/v0.10",
  }));
  await expectTheory("invalid-envelope", () => replayPortableStructuralTheory({
    ...artifactBefore,
    trusted: true,
  }));
  await expectTheory("noncanonical-topology", () => replayPortableStructuralTheory({
    ...artifactBefore,
    topology: {
      ...artifactBefore.topology,
      links: [...artifactBefore.topology.links].reverse(),
    },
  }));
  await expectTheory(
    "invalid-revision",
    () => verifyPortableStructuralProofTheoryRevision(
      proofArtifact,
      artifactBefore,
      proofArtifact.theoryCoordinate as never,
    ),
  );
  await expectTheory(
    "theory-revision-mismatch",
    () => verifyPortableStructuralProofTheoryRevision(
      proofArtifact,
      artifactBefore,
      { ...revisionBefore, value: "0".repeat(64) },
    ),
  );

  // R3 classification: exact Theory selection is identity/provenance only.
  // Matching this revision never substitutes for ordinary proof replay.
}

await main();
