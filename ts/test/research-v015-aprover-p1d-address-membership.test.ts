import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
} from "../src/memory.js";
import {
  materializeQuaternaryAnum,
  resolveQuaternaryAnum,
  type QuaternaryAnumHierarchy,
} from "../src/quaternary-anum.js";

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error("v0.15 aprover P1d address membership: " + message);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(
    Object.is(actual, expected),
    message + ": " + String(actual) + " !== " + String(expected),
  );
}

interface AsetState {
  readonly members: ReadonlySet<LinkHandle>;
}

function aset(members: Iterable<LinkHandle>): AsetState {
  return Object.freeze({ members: new Set(members) });
}

/**
 * Research oracle only.
 *
 * The query is an exact rooted Anum/address DESCRIPTION, not the TARGET Link.
 * Resolve is read-only and may return NOT_FOUND.  Only after resolving a target
 * identity do we test extensional membership in the selected semantic ANet M_t.
 *
 * This host function is deliberately NOT proposed as aprover authority.  It
 * states the semantic predicate that a future ordinary ANet/Γ realization must
 * reproduce:
 *
 *   MemberByAddress(M_t, description) -> L | U
 */
function memberByAddress(
  memory: Memory,
  basis: ReturnType<typeof ensureRootBasis>,
  state: AsetState,
  address: QuaternaryAnumHierarchy,
): LinkHandle {
  const target = resolveQuaternaryAnum(memory, basis, address);
  return target !== undefined && state.members.has(target)
    ? basis.L
    : basis.U;
}

const memory = new Memory();
const basis = ensureRootBasis(memory);

// Retained Q/Anum address example:
//   exact rooted description "01" is distinct from its one-root-cut target U->L.
const address = materializeQuaternaryAnum(memory, basis, "01");
const addressLink = address.anumLink;

// Crucial non-circularity: the DESCRIPTION exists before the TARGET.
const beforeResolve = memory.linkCount;
same(
  resolveQuaternaryAnum(memory, basis, address),
  undefined,
  "address resolves NOT_FOUND before target exists",
);
same(
  memory.linkCount,
  beforeResolve,
  "NOT_FOUND resolve performs no hidden materialization",
);

// Materialize the semantic TARGET independently, as if it were already present
// in the loaded A-network.
const target = memory.ensure(basis.U, basis.L);
assert(addressLink !== target, "DESCRIPTION is not TARGET");
same(
  resolveQuaternaryAnum(memory, basis, address),
  target,
  "same rooted address resolves the existing target",
);

// Selected semantic ANet contains TARGET -> predicate is L.
const selected = aset([target]);
same(
  memberByAddress(memory, basis, selected, address),
  basis.L,
  "target membership in selected M_t returns L",
);

// The physical TARGET still exists, but selected semantic ANet omits it -> U.
const omitted = aset([]);
same(
  resolveQuaternaryAnum(memory, basis, address),
  target,
  "target remains physically resolvable",
);
same(
  memberByAddress(memory, basis, omitted, address),
  basis.U,
  "physical existence without selected M_t membership returns U",
);

// Unrelated semantic membership cannot satisfy the query.
const other = memory.ensure(basis.L, basis.U);
const foreign = aset([other]);
same(
  memberByAddress(memory, basis, foreign, address),
  basis.U,
  "different selected Link does not satisfy addressed membership",
);

console.log([
  "MTS_V015_APROVER_P1D_ADDRESS_MEMBERSHIP=GREEN_RESEARCH",
  "QUERY=ROOTED_ANUM_DESCRIPTION",
  "DESCRIPTION_NE_TARGET=TRUE",
  "DESCRIPTION_CAN_PREEXIST_TARGET=TRUE",
  "RESOLVE=READ_ONLY",
  "NOT_FOUND_MATERIALIZES=FALSE",
  "FOUND_TARGET_THEN_SELECTED_M_T_MEMBERSHIP=L",
  "FOUND_TARGET_BUT_NOT_SELECTED_M_T=U",
  "PHYSICAL_EXISTENCE_AUTHORITY=0",
  "HOST_MEMBERSHIP_PREDICATE=RESEARCH_ORACLE_ONLY",
  "NATIVE_ANET_GAMMA_REALIZATION=OPEN",
  "ADDRESS_PROTOCOL=RETAINED_Q_ANUM_EXAMPLE",
  "V015_CANONICAL_ADDRESS_CARRIER=OPEN",
].join(" "));
