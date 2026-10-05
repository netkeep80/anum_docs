import {
  Memory,
  type EnumerableReadMemory,
  type LinkHandle,
  type LinkPoles,
} from "../src/memory.js";
import {
  expandResolvedBundleQuery,
  resolveFlatBundle,
  type BundleValue,
  type LinkValue,
  type ResolvedOccurrence,
} from "../src/value-bundle.js";

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error("v0.15 aprover P1h semantic bundle query: " + message);
}
function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), message);
}
function occurrence(link: LinkHandle): ResolvedOccurrence {
  return Object.freeze({ path: Object.freeze([0]), link });
}
function scalar(link: LinkHandle): LinkValue {
  return Object.freeze({ kind: "link", link });
}
function singleton(memory: Memory, link: LinkHandle): BundleValue {
  return resolveFlatBundle(memory, [occurrence(link)]);
}

/**
 * Read view over one selected semantic ANet M_t.
 *
 * Structural pole reads remain available for selected/referenced Links, but all
 * relation-discovery operations are filtered by semantic membership. Thus a
 * physically existing Link outside M_t is invisible to bundle queries.
 *
 * This is a test-side view/projection, not a second ontology object.
 */
class SemanticAsetReadView implements EnumerableReadMemory {
  constructor(
    private readonly physical: Memory,
    private readonly selected: ReadonlySet<LinkHandle>,
  ) {}

  get root(): LinkHandle { return this.physical.root; }
  get linkCount(): number { return this.physical.linkCount; }

  poles(link: LinkHandle): LinkPoles {
    return this.physical.poles(link);
  }

  find(start: LinkHandle, end: LinkHandle): LinkHandle | undefined {
    const found = this.physical.find(start, end);
    return found !== undefined && this.selected.has(found) ? found : undefined;
  }

  outgoing(start: LinkHandle): readonly LinkHandle[] {
    return this.physical.outgoing(start).filter((link) => this.selected.has(link));
  }

  incoming(end: LinkHandle): readonly LinkHandle[] {
    return this.physical.incoming(end).filter((link) => this.selected.has(link));
  }

  allLinks(): readonly LinkHandle[] {
    return Object.freeze([...this.selected]);
  }
}

const memory = new Memory();
const R = memory.root;
const O = memory.ensureStartSelfClosed(R);
const C = memory.ensureEndSelfClosed(R);
const L = memory.ensure(O, C);
let cursor = memory.ensure(C, O);
const fresh = (): LinkHandle => {
  cursor = memory.ensure(cursor, L);
  return cursor;
};

const theory = fresh();
const ruleA = fresh();
const ruleB = fresh();

const admissionA = memory.ensure(theory, ruleA);
const admissionB = memory.ensure(theory, ruleB);

// Both admissions physically exist.
same(memory.find(theory, ruleA), admissionA, "physical A admission exists");
same(memory.find(theory, ruleB), admissionB, "physical B admission exists");

// Query is specified by the two poles, not by presenting the TARGET admission.
// The singleton bundle is only the query-domain role required by the retained
// bundle-query surface: Theory{RuleB}.
const right = singleton(memory, ruleB);

// Selected M_t includes B -> exact query returns the admission.
{
  const view = new SemanticAsetReadView(
    memory,
    new Set([admissionA, admissionB]),
  );
  const before = memory.linkCount;
  const result = expandResolvedBundleQuery(view, scalar(theory), right);
  same(result.links.size, 1, "selected Theory{RuleB} yields singleton");
  assert(result.links.has(admissionB), "selected exact admission returned");
  same(memory.linkCount, before, "selected exact query is read-only");
}

// Same physical Memory, but B omitted from selected semantic M_t -> empty.
{
  const view = new SemanticAsetReadView(
    memory,
    new Set([admissionA]),
  );
  const before = memory.linkCount;
  const result = expandResolvedBundleQuery(view, scalar(theory), right);
  same(result.links.size, 0, "unselected Theory{RuleB} yields empty bundle");
  same(memory.find(theory, ruleB), admissionB, "physical B still exists");
  same(memory.linkCount, before, "unselected exact query is read-only");
}

// Foreign Theory cannot satisfy the same pole query.
{
  const foreignTheory = fresh();
  const foreignAdmission = memory.ensure(foreignTheory, ruleB);
  const view = new SemanticAsetReadView(
    memory,
    new Set([foreignAdmission]),
  );
  const result = expandResolvedBundleQuery(view, scalar(theory), right);
  same(result.links.size, 0, "foreign Theory admission does not satisfy query");
}

// General outgoing bundle view is the same semantic mechanism and sees only M_t.
{
  const view = new SemanticAsetReadView(
    memory,
    new Set([admissionA]),
  );
  const emptyBundle = resolveFlatBundle(memory, []);
  const result = expandResolvedBundleQuery(
    view,
    scalar(theory),
    emptyBundle,
  );
  same(result.links.size, 1, "Theory{} sees one selected outgoing admission");
  assert(result.links.has(admissionA), "Theory{} returns selected A admission");
  assert(!result.links.has(admissionB), "Theory{} hides physical unselected B");
}

console.log([
  "MTS_V015_APROVER_P1H_SEMANTIC_BUNDLE_QUERY=GREEN_RESEARCH",
  "QUERY_SHAPE=THEORY_SINGLETON_RULE_BUNDLE",
  "TARGET_ADMISSION_PRESENTED_AS_QUERY_INPUT=FALSE",
  "QUERY_INPUTS=THEORY_AND_RULE_POLES",
  "QUERY_ENGINE=RETAINED_READ_ONLY_BUNDLE_QUERY",
  "SEARCH_DOMAIN=SELECTED_SEMANTIC_M_T",
  "PHYSICAL_EXISTENCE_AUTHORITY=0",
  "SELECTED_EXACT_PAIR=SINGLETON_BUNDLE",
  "UNSELECTED_EXACT_PAIR=EMPTY_BUNDLE",
  "FOREIGN_THEORY=EMPTY_BUNDLE",
  "OUTGOING_THEORY_VIEW=SAME_MECHANISM",
  "QUERY_WRITES=0",
  "NEW_ADDRESS_PROTOCOL_REQUIRED=FALSE_FOR_THIS_VECTOR",
  "NEW_MEMBERSHIP_OPCODE_REQUIRED=FALSE_FOR_THIS_VECTOR",
  "EMPTY_SINGLETON_TO_L_U_PROJECTION=OPEN",
  "NATIVE_AMEMORY_EXECUTION_OF_BUNDLE_QUERY=OPEN",
].join(" "));
