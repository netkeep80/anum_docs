import {
  materializeExactSequence,
  readExactSequence,
} from "../src/exact-sequence.js";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
  type ReadMemory,
  type RootBasis,
} from "../src/memory.js";
import {
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

function readCarrierValues(
  memory: ReadMemory,
  basis: RootBasis,
  carrier: LinkHandle,
): readonly LinkHandle[] {
  if (carrier === basis.R) return Object.freeze([]);

  const values = readExactSequence(memory, carrier).values;
  assert(values.length > 0, "non-root recursive carrier node is nonempty");

  let namespace: LinkHandle | undefined;
  const unquoted = values.map((quoted) => {
    const p = memory.poles(quoted);
    const ns = p.start;
    const nsp = memory.poles(ns);
    assert(
      nsp.start === basis.L && nsp.end === basis.L,
      "carrier quote namespace has L->L topology",
    );
    if (namespace === undefined) namespace = ns;
    same(ns, namespace, "one quote namespace per recursive carrier node");
    return p.end;
  });
  return Object.freeze(unquoted);
}

/**
 * Read-only lookup of an already existing semantic TARGET from a canonical
 * recursive 8/9/6/1 DESCRIPTION carrier.
 *
 * No semantic Link is constructed here:
 * - ROOT resolves to selected R;
 * - START(child) searches existing links incident by END=child and requires
 *   start-self-incidence;
 * - END(child) searches existing links incident by START=child and requires
 *   end-self-incidence;
 * - PAIR(left,right) uses exact existing-pair lookup.
 *
 * This is research-only executable semantics, not yet a production API.
 */
function resolveRecursiveDescription(
  memory: ReadMemory,
  basis: RootBasis,
  carrier: LinkHandle,
): LinkHandle | undefined {
  const active = new Set<LinkHandle>();

  const resolve = (node: LinkHandle): LinkHandle | undefined => {
    if (node === basis.R) return basis.R;
    if (active.has(node)) throw new Error("cyclic recursive description");

    active.add(node);
    try {
      const values = readCarrierValues(memory, basis, node);

      if (values.length === 2 && values[0] === basis.O) {
        const child = resolve(values[1]!);
        if (child === undefined) return undefined;

        const found = memory.incoming(child).filter((candidate) => {
          const p = memory.poles(candidate);
          return p.start === candidate && p.end === child;
        });
        assert(found.length <= 1, "canonical START target is unique");
        return found[0];
      }

      if (values.length === 2 && values[0] === basis.C) {
        const child = resolve(values[1]!);
        if (child === undefined) return undefined;

        const found = memory.outgoing(child).filter((candidate) => {
          const p = memory.poles(candidate);
          return p.start === child && p.end === candidate;
        });
        assert(found.length <= 1, "canonical END target is unique");
        return found[0];
      }

      if (values.length === 3 && values[0] === basis.L) {
        const left = resolve(values[1]!);
        if (left === undefined) return undefined;
        const right = resolve(values[2]!);
        if (right === undefined) return undefined;
        return memory.find(left, right);
      }

      throw new Error("uninterpretable recursive description");
    } finally {
      active.delete(node);
    }
  };

  return resolve(carrier);
}

function memberByRecursiveAddress(
  memory: ReadMemory,
  basis: RootBasis,
  state: AsetState,
  carrier: LinkHandle,
): LinkHandle {
  const target = resolveRecursiveDescription(memory, basis, carrier);
  return target !== undefined && state.members.has(target)
    ? basis.L
    : basis.U;
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
assert(wire.length > 0, "recursive address wire exists");

// ---------------------------------------------------------------------------
// Receiver/query memory: materialize DESCRIPTION only.  The semantic TARGET and
// its non-basis children deliberately do not exist yet.
// ---------------------------------------------------------------------------

const memory = new Memory();
const basis = ensureRootBasis(memory);
const carrier = materializeV013HierarchicalCarrier(memory, basis, wire);

const beforeAbsentLookup = memory.linkCount;
same(
  resolveRecursiveDescription(memory, basis, carrier),
  undefined,
  "canonical recursive description returns NOT_FOUND before TARGET exists",
);
same(
  memory.linkCount,
  beforeAbsentLookup,
  "recursive NOT_FOUND lookup performs zero writes",
);

// Build the same semantic topology independently, simulating a selected loaded
// ANet rather than materializing from the DESCRIPTION.
const theory = memory.ensureStartSelfClosed(memory.ensure(basis.C, basis.L));
const rule = memory.ensureEndSelfClosed(memory.ensure(basis.O, basis.U));
const admission = memory.ensure(theory, rule);

const beforeFoundLookup = memory.linkCount;
same(
  resolveRecursiveDescription(memory, basis, carrier),
  admission,
  "same recursive description finds independently existing TARGET",
);
same(
  memory.linkCount,
  beforeFoundLookup,
  "recursive FOUND lookup performs zero writes",
);

// Canonical topology-derived address is allocation-independent.
const rebuiltCarrier = materializeV013HierarchicalCarrierFromSemanticLink(
  memory,
  basis,
  admission,
);
const rebuiltWire = serializeV013HierarchicalCarrier(memory, basis, rebuiltCarrier);
same(
  new TextDecoder().decode(rebuiltWire),
  new TextDecoder().decode(wire),
  "same semantic Link has same recursive address in independent Memories",
);

// Semantic membership remains separate from physical existence.
same(
  memberByRecursiveAddress(memory, basis, aset([admission]), carrier),
  basis.L,
  "resolved TARGET in selected M_t returns L",
);
same(
  memberByRecursiveAddress(memory, basis, aset([]), carrier),
  basis.U,
  "physically existing TARGET outside selected M_t returns U",
);

// Wrong selected member cannot satisfy the same absolute structural address.
const other = memory.ensure(rule, theory);
same(
  memberByRecursiveAddress(memory, basis, aset([other]), carrier),
  basis.U,
  "different selected Link returns U",
);

// Explicit malformed DESCRIPTION is neither TRUE nor FALSE: it is
// uninterpretable.  This preserves U != UNINTERPRETABLE.
const namespace = memory.find(basis.L, basis.L);
assert(namespace !== undefined, "recursive carrier quote namespace exists");
const quote = (value: LinkHandle): LinkHandle => memory.ensure(namespace, value);
const malformed = materializeExactSequence(memory, [quote(basis.U)]);
let malformedRejected = false;
try {
  memberByRecursiveAddress(memory, basis, aset([admission]), malformed);
} catch {
  malformedRejected = true;
}
assert(malformedRejected, "malformed recursive address is UNINTERPRETABLE, not U");

console.log([
  "MTS_V015_APROVER_P1E_RECURSIVE_ADDRESS=GREEN_RESEARCH",
  "ADDRESS_ALPHABET=8_9_6_1",
  "ADDRESS_DERIVED_FROM_TARGET_TOPOLOGY=TRUE",
  "DESCRIPTION_NE_TARGET=TRUE",
  "DESCRIPTION_PREEXISTS_TARGET=TRUE",
  "NOT_FOUND_LOOKUP_WRITES=0",
  "FOUND_LOOKUP_WRITES=0",
  "PAIR_LOOKUP=EXACT_FIND",
  "START_LOOKUP=READ_ONLY_END_INCIDENCE",
  "END_LOOKUP=READ_ONLY_START_INCIDENCE",
  "CROSS_MEMORY_ADDRESS_IDENTITY=STRUCTURAL",
  "FOUND_AND_SELECTED=L",
  "FOUND_BUT_NOT_SELECTED=U",
  "U_NE_UNINTERPRETABLE=TRUE",
  "Q_PROTOCOL_REQUIRED=FALSE_FOR_THIS_VECTOR",
  "Q_PROTOCOL_REJECTED=FALSE",
  "GROUNDABLE_RECURSIVE_DOMAIN_ONLY=TRUE",
  "NATIVE_GAMMA_PREDICATE=OPEN",
].join(" "));
