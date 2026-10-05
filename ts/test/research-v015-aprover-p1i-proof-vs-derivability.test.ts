import {
  defineStructuralDerivationRule,
  admitStructuralDerivationRule,
} from "../src/derivation.js";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
  type LinkPoles,
  type ReadMemory,
} from "../src/memory.js";
import {
  replayClosedProofOccurrence,
  StructuralRootedProofAsetReplayError,
} from "../src/rooted-proof-aset.js";
import {
  admitStructuralRule,
  defineStructuralRoleDictionary,
  defineStructuralRule,
} from "../src/structural-rule.js";
import {
  inferStructuralSubstitution,
  StructuralSubstitutionError,
} from "../src/structural-substitution.js";
import { materializeExactSequence } from "../src/exact-sequence.js";

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error("v0.15 aprover P1i proof-vs-derivability: " + message);
}
function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), message);
}

/**
 * Semantic read view: physical topology remains readable, but Theory admission
 * queries see only the explicitly selected semantic membership.
 */
class SelectedTheoryView implements ReadMemory {
  constructor(
    private readonly source: Memory,
    private readonly theory: LinkHandle,
    private readonly selectedAdmissions: ReadonlySet<LinkHandle>,
  ) {}
  get root(): LinkHandle { return this.source.root; }
  get linkCount(): number { return this.source.linkCount; }
  poles(link: LinkHandle): LinkPoles { return this.source.poles(link); }
  find(start: LinkHandle, end: LinkHandle): LinkHandle | undefined {
    const found = this.source.find(start, end);
    if (found === undefined) return undefined;
    if (start === this.theory && !this.selectedAdmissions.has(found)) {
      return undefined;
    }
    return found;
  }

  outgoing(start: LinkHandle): readonly LinkHandle[] {
    const found = this.source.outgoing(start);
    if (start !== this.theory) return found;
    return Object.freeze(found.filter((link) => this.selectedAdmissions.has(link)));
  }

  incoming(end: LinkHandle): readonly LinkHandle[] {
    return Object.freeze(
      this.source.incoming(end).filter((link) => {
        const poles = this.source.poles(link);
        return poles.start !== this.theory || this.selectedAdmissions.has(link);
      }),
    );
  }
}

const memory = new Memory();
const b = ensureRootBasis(memory);
let cursor = memory.ensure(b.U, b.L);
const fresh = (): LinkHandle => {
  cursor = memory.ensure(cursor, b.C);
  return cursor;
};

const theory = fresh();
const claim = fresh();

// Two distinct generic zero-premise Rules. Each has its own role identity but
// can instantiate its sole role to the same concrete claim.
function makeEquivalentConstructor(): {
  readonly role: LinkHandle;
  readonly rule: LinkHandle;
  readonly derivationRule: LinkHandle;
  readonly ruleAdmission: LinkHandle;
  readonly derivationAdmission: LinkHandle;
} {
  const role = fresh();
  const dictionary = defineStructuralRoleDictionary(memory, [role]);
  const rule = defineStructuralRule(memory, dictionary, role);
  const derivationRule = defineStructuralDerivationRule(
    memory,
    rule,
    [],
  );
  const ruleAdmission = admitStructuralRule(memory, theory, rule);
  const derivationAdmission = admitStructuralDerivationRule(
    memory,
    theory,
    derivationRule,
  );
  return Object.freeze({
    role,
    rule,
    derivationRule,
    ruleAdmission,
    derivationAdmission,
  });
}

const c1 = makeEquivalentConstructor();
const c2 = makeEquivalentConstructor();

assert(c1.rule !== c2.rule, "equivalent Rules are distinct Links");
assert(
  c1.derivationRule !== c2.derivationRule,
  "equivalent DerivationRules are distinct Links",
);

// Concrete proof certificate cites c1 exactly.
const occurrence = memory.ensure(
  claim,
  memory.ensure(
    c1.derivationRule,
    materializeExactSequence(memory, []),
  ),
);

// Control: with cited constructor selected, exact ProofOccurrence replays.
{
  const selected = new SelectedTheoryView(
    memory,
    theory,
    new Set([
      c1.ruleAdmission,
      c1.derivationAdmission,
      c2.ruleAdmission,
      c2.derivationAdmission,
    ]),
  );
  const replay = replayClosedProofOccurrence(selected, theory, occurrence);
  same(replay.claim, claim, "exact cited proof certificate is valid");
}

// Remove only c1 from selected semantic Theory while keeping all physical Links
// and keeping equivalent c2 selected. The same exact ProofOccurrence must fail:
// its witness/provenance is stale even though the Claim is still derivable.
{
  const selected = new SelectedTheoryView(
    memory,
    theory,
    new Set([
      c2.ruleAdmission,
      c2.derivationAdmission,
    ]),
  );

  let rejected = false;
  try {
    replayClosedProofOccurrence(selected, theory, occurrence);
  } catch (error) {
    rejected = error instanceof StructuralRootedProofAsetReplayError;
  }
  assert(rejected, "stale exact ProofOccurrence is rejected");
}

// Independent derivability check: c2 still structurally supports the same Claim.
// This intentionally asks a different question from replaying the exact proof.
{
  let supported = false;
  try {
    inferStructuralSubstitution(
      memory,
      [c2.role],
      [Object.freeze({ template: c2.role, actual: claim })],
      { requireAll: true },
    );
    supported = true;
  } catch (error) {
    if (!(error instanceof StructuralSubstitutionError)) throw error;
  }
  assert(
    supported,
    "Claim remains derivable through another selected equivalent constructor",
  );
}

console.log([
  "MTS_V015_APROVER_P1I_PROOF_VS_DERIVABILITY=GREEN_RESEARCH",
  "EXACT_PROOF_OCCURRENCE_CITES_EXACT_DERIVATION_RULE=TRUE",
  "REMOVE_CITED_RULE_EXACT_CERTIFICATE_VALID=FALSE",
  "EQUIVALENT_SELECTED_RULE_EXISTS=TRUE",
  "CLAIM_DERIVABILITY_CAN_REMAIN_TRUE=TRUE",
  "PROOF_CERTIFICATE_VALIDITY_NE_THEOREM_DERIVABILITY=TRUE",
  "RULE_REFERENCE_ROLE=WITNESS_NOT_AUTHORITY",
  "SEARCH_MAY_REPLACE_STALE_WITNESS=TRUE",
  "CHECKER_MUST_NOT_SILENTLY_REWRITE_WITNESS=TRUE",
  "NO_CANONICAL_JSON_PROPOSED=TRUE",
].join(" "));
