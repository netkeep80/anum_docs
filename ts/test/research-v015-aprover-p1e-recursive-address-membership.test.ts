import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
  type ReadMemory,
  type RootBasis,
} from "../src/memory.js";
import {
  decomposeV013SemanticLink,
  materializeV013HierarchicalCarrier,
  materializeV013HierarchicalCarrierFromSemanticLink,
  serializeV013HierarchicalCarrier,
} from "../src/v013-hierarchical-carrier.js";

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error("v0.15 aprover P1e recursive address: " + message);
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
 * Read-only canonical recursive structural address of one Grounded semantic
 * Link.  This is the semantic 8/9/6/1 description itself; unlike the
 * hierarchical carrier builder it allocates no representation Links.
 */
function recursiveAddressOf(
  memory: ReadMemory,
  basis: RootBasis,
  semantic: LinkHandle,
): string {
  const active = new Set<LinkHandle>();

  const walk = (link: LinkHandle): string => {
    if (active.has(link)) throw new Error("non-grounded recursive cycle");
    const d = decomposeV013SemanticLink(memory, basis, link);

    if (d.aspect === "ROOT") return "8";

    active.add(link);
    try {
      if (d.aspect === "START") return "9" + walk(d.children[0]!);
      if (d.aspect === "END") return "6" + walk(d.children[0]!);
      return "1" + walk(d.children[0]!) + walk(d.children[1]!);
    } finally {
      active.delete(link);
    }
  };

  return walk(semantic);
}

function queryAddress(
  memory: ReadMemory,
  basis: RootBasis,
  carrier: LinkHandle,
): string {
  return new TextDecoder().decode(
    serializeV013HierarchicalCarrier(memory, basis, carrier),
  );
}

/**
 * Research semantic oracle:
 *
 *   ExistsByRecursiveAddress(M_t, q)
 *     = L  iff exists x in M_t with RecursiveAddress(x) = q
 *     = U  otherwise
 *
 * The query DESCRIPTION is distinct from every candidate TARGET.  Search is
 * over selected semantic ANet membership, not over ambient physical Memory.
 * Therefore physical representation Links / stale Links / duplicate technical
 * representatives have no authority merely because they exist.
 *
 * This host loop is evidence only. A production backend may use indexing,
 * hashing, tries or another equivalent lookup; iteration order is nonsemantic.
 */
function existsByRecursiveAddress(
  memory: ReadMemory,
  basis: RootBasis,
  state: AsetState,
  carrier: LinkHandle,
): LinkHandle {
  const wanted = queryAddress(memory, basis, carrier);

  for (const member of state.members) {
    if (recursiveAddressOf(memory, basis, member) === wanted) {
      return basis.L;
    }
  }
  return basis.U;
}

// ---------------------------------------------------------------------------
// Sender: derive a canonical 8/9/6/1 DESCRIPTION from semantic topology.
// ---------------------------------------------------------------------------

const sender = new Memory();
const sb = ensureRootBasis(sender);

const senderTheory = sender.ensureStartSelfClosed(sender.ensure(sb.C, sb.L));
const senderRule = sender.ensureEndSelfClosed(sender.ensure(sb.O, sb.U));
const senderAdmission = sender.ensure(senderTheory, senderRule);

const senderCarrier = materializeV013HierarchicalCarrierFromSemanticLink(
  sender,
  sb,
  senderAdmission,
);
const wire = serializeV013HierarchicalCarrier(sender, sb, senderCarrier);
const wanted = new TextDecoder().decode(wire);
assert(wanted.length > 0, "recursive address wire exists");
same(
  recursiveAddressOf(sender, sb, senderAdmission),
  wanted,
  "carrier wire equals direct read-only structural address",
);

// ---------------------------------------------------------------------------
// Receiver/query memory: materialize DESCRIPTION only. The semantic TARGET and
// its non-basis children deliberately do not exist yet.
// ---------------------------------------------------------------------------

const memory = new Memory();
const basis = ensureRootBasis(memory);
const carrier = materializeV013HierarchicalCarrier(memory, basis, wire);

const beforeAbsent = memory.linkCount;
same(
  existsByRecursiveAddress(memory, basis, aset([]), carrier),
  basis.U,
  "description with no selected semantic target returns U",
);
same(
  memory.linkCount,
  beforeAbsent,
  "absent membership lookup performs zero writes",
);

// Build the same semantic topology independently, simulating a loaded ANet.
const theory = memory.ensureStartSelfClosed(memory.ensure(basis.C, basis.L));
const rule = memory.ensureEndSelfClosed(memory.ensure(basis.O, basis.U));
const admission = memory.ensure(theory, rule);

same(
  recursiveAddressOf(memory, basis, admission),
  wanted,
  "independently built TARGET has the same canonical recursive address",
);

const beforeFound = memory.linkCount;
same(
  existsByRecursiveAddress(memory, basis, aset([admission]), carrier),
  basis.L,
  "selected member with queried recursive address returns L",
);
same(
  memory.linkCount,
  beforeFound,
  "found membership lookup performs zero writes",
);

// Physical existence alone has no authority.
same(
  existsByRecursiveAddress(memory, basis, aset([]), carrier),
  basis.U,
  "physically existing TARGET outside selected M_t returns U",
);

// Search is extensional/order-independent.
const other = memory.ensure(rule, theory);
const forward = aset([other, admission]);
const reverse = aset([admission, other]);
same(
  existsByRecursiveAddress(memory, basis, forward, carrier),
  basis.L,
  "forward selected membership finds target",
);
same(
  existsByRecursiveAddress(memory, basis, reverse, carrier),
  basis.L,
  "membership order does not change result",
);

// A physically present representation carrier is deliberately not a semantic
// TARGET merely because its recursive physical topology happens to exist.
same(
  existsByRecursiveAddress(memory, basis, aset([other]), carrier),
  basis.U,
  "unrelated selected Link returns U",
);

// Two independent Memories derive the same absolute address without sharing
// local handles.
const rebuiltCarrier = materializeV013HierarchicalCarrierFromSemanticLink(
  memory,
  basis,
  admission,
);
same(
  new TextDecoder().decode(
    serializeV013HierarchicalCarrier(memory, basis, rebuiltCarrier),
  ),
  wanted,
  "cross-memory recursive address is structural",
);

console.log([
  "MTS_V015_APROVER_P1E_RECURSIVE_ADDRESS=GREEN_RESEARCH",
  "PREDICATE=EXISTS_MEMBER_BY_CANONICAL_RECURSIVE_ADDRESS",
  "ADDRESS_ALPHABET=8_9_6_1",
  "ADDRESS_DERIVED_FROM_LINK_TOPOLOGY=TRUE",
  "DESCRIPTION_NE_TARGET=TRUE",
  "DESCRIPTION_PREEXISTS_TARGET=TRUE",
  "SEARCH_DOMAIN=SELECTED_SEMANTIC_M_T",
  "AMBIENT_PHYSICAL_MEMORY_AUTHORITY=0",
  "ABSENT_LOOKUP_WRITES=0",
  "FOUND_LOOKUP_WRITES=0",
  "CROSS_MEMORY_ADDRESS_IDENTITY=STRUCTURAL",
  "FOUND_SELECTED=L",
  "NOT_SELECTED=U",
  "MEMBER_ORDER_SEMANTIC=FALSE",
  "Q_PROTOCOL_REQUIRED=FALSE_FOR_THIS_VECTOR",
  "Q_PROTOCOL_REJECTED=FALSE",
  "GROUNDABLE_RECURSIVE_DOMAIN_ONLY=TRUE",
  "HOST_SCAN=RESEARCH_ORACLE_NOT_SEMANTIC_ALGORITHM",
  "NATIVE_GAMMA_OR_SUBSTRATE_REALIZATION=OPEN",
].join(" "));
