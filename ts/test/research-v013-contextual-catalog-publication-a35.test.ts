import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { materializeExactSequence, readExactSequence } from "../src/exact-sequence.js";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
} from "../src/memory.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.13 A35 contextual catalog publication: ${message}`);
}
function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: values differ`);
}
function expectThrows(run: () => void, message: string): void {
  let threw = false;
  try { run(); } catch { threw = true; }
  assert(threw, message);
}

interface Template {
  readonly candidate: LinkHandle;
  readonly M: LinkHandle;
  readonly publication: LinkHandle;
}

function producerTemplate(
  memory: Memory,
  metaParent: LinkHandle,
  executions: readonly LinkHandle[],
): Template {
  assert(executions.length > 1, "A35 producer template has at least one transition");
  const transitions = executions.slice(0, -1).map(
    (execution, index) => memory.ensure(execution, executions[index + 1]!),
  );

  let tail = memory.root;
  const cells: LinkHandle[] = [];
  for (let index = transitions.length - 1; index >= 0; index -= 1) {
    tail = memory.ensure(transitions[index]!, tail);
    cells.unshift(tail);
  }

  const envelope = memory.ensureStartSelfClosed(cells[0]!);
  const meta = memory.ensure(metaParent, envelope);
  const candidate = materializeExactSequence(memory, [
    memory.root,
    metaParent,
    ...executions,
    ...transitions,
    ...[...cells].reverse(),
    envelope,
    meta,
  ]);

  return Object.freeze({
    candidate,
    M: meta,
    publication: memory.ensure(candidate, meta),
  });
}

/**
 * These three readers are intentionally kept source-equivalent to A34.
 * A35 removes only the external publication invocation/argument boundary.
 * Structural source publication remains an explicit residual for A36+.
 */
function deriveProducerSeeds(
  memory: Memory,
  candidate: LinkHandle,
): readonly LinkHandle[] {
  const values = readExactSequence(memory, candidate).values;
  const members = new Set(values);
  const matches: LinkHandle[][] = [];
  for (const possibleMeta of values) {
    const mp = memory.poles(possibleMeta);
    if (!members.has(mp.start) || !members.has(mp.end)) continue;
    const envelope = mp.end;
    const ep = memory.poles(envelope);
    if (ep.start !== envelope || ep.end === envelope) continue;
    const transitions: LinkHandle[] = [];
    const seen = new Set<LinkHandle>();
    let cursor = ep.end;
    let valid = true;
    while (cursor !== memory.root) {
      if (seen.has(cursor) || !members.has(cursor)) { valid = false; break; }
      seen.add(cursor);
      const cell = memory.poles(cursor);
      if (!members.has(cell.start)) { valid = false; break; }
      transitions.push(cell.start);
      cursor = cell.end;
    }
    if (!valid || transitions.length === 0) continue;
    const executions: LinkHandle[] = [];
    for (let index = 0; index < transitions.length; index += 1) {
      const tp = memory.poles(transitions[index]!);
      if (!members.has(tp.start) || !members.has(tp.end)) { valid = false; break; }
      if (index === 0) executions.push(tp.start);
      else if (executions[executions.length - 1] !== tp.start) { valid = false; break; }
      executions.push(tp.end);
    }
    if (!valid) continue;
    matches.push([mp.start, ...executions]);
  }
  same(matches.length, 1, "A35 exactly one structural producer seed path");
  return Object.freeze(matches[0]!);
}

function readCatalog(memory: Memory, catalog: LinkHandle): readonly LinkHandle[] {
  const cp = memory.poles(catalog);
  const context = cp.start;
  const out: LinkHandle[] = [];
  const seen = new Set<LinkHandle>();
  let cursor = cp.end;

  while (cursor !== memory.root) {
    assert(!seen.has(cursor), "A35 catalog occurrence cycle");
    seen.add(cursor);
    const occurrence = memory.poles(cursor);
    const publication = memory.poles(occurrence.end);
    same(publication.start, context, "A35 catalog publication keeps catalog context");
    out.push(publication.end);
    cursor = occurrence.start;
  }

  out.reverse();
  return Object.freeze(out);
}

function sourcePublishable(memory: Memory, candidate: LinkHandle): boolean {
  try {
    deriveProducerSeeds(memory, candidate);
    const values = readExactSequence(memory, candidate).values;
    let publications = 0;
    for (const value of values) {
      if (memory.find(candidate, value) !== undefined) publications += 1;
    }
    return publications === 1;
  } catch {
    return false;
  }
}

/**
 * One selected contextual publication request:
 *
 *   Q = Catalog -> Candidate
 *   K -> Q
 *
 * The executor receives ONLY K->Q. Catalog and Candidate are derived from Q.
 * The result is another contextual value:
 *
 *   K -> Catalog'
 *
 * where Catalog' immutably appends C->Candidate to the previous catalog head.
 *
 * No catalog/candidate argument, ambient candidate enumeration, or host-picked
 * "publish this candidate" callback crosses the executor boundary.
 */
function stepPublicationRequest(
  memory: Memory,
  requestTruth: LinkHandle,
): LinkHandle {
  const truth = memory.poles(requestTruth);
  const context = truth.start;
  const request = memory.poles(truth.end);
  const catalog = request.start;
  const candidate = request.end;

  assert(
    sourcePublishable(memory, candidate),
    "A35 selected source candidate structurally published before catalog admission",
  );

  const catalogPoles = memory.poles(catalog);
  const members = readCatalog(memory, catalog);
  assert(!members.includes(candidate), "A35 duplicate catalog publication rejected");

  const membership = memory.ensure(catalogPoles.start, candidate);
  const nextHead = memory.ensure(catalogPoles.end, membership);
  const nextCatalog = memory.ensure(catalogPoles.start, nextHead);
  return memory.ensure(context, nextCatalog);
}

function selectedRequest(
  memory: Memory,
  context: LinkHandle,
  catalog: LinkHandle,
  candidate: LinkHandle,
): LinkHandle {
  return memory.ensure(context, memory.ensure(catalog, candidate));
}

function executions(memory: Memory, seed: LinkHandle, count: number): readonly LinkHandle[] {
  const out: LinkHandle[] = [];
  let cursor = seed;
  for (let index = 0; index < count; index += 1) {
    cursor = memory.ensure(cursor, index % 2 === 0 ? memory.root : seed);
    out.push(cursor);
  }
  return Object.freeze(out);
}

function initialCatalog(
  memory: Memory,
  context: LinkHandle,
  candidates: readonly LinkHandle[],
): LinkHandle {
  let head = memory.root;
  for (const candidate of candidates) {
    const membership = memory.ensure(context, candidate);
    head = memory.ensure(head, membership);
  }
  return memory.ensure(context, head);
}

function exercise(withNoise: boolean): void {
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  if (withNoise) memory.ensure(memory.ensure(basis.L, basis.U), basis.C);

  const p1 = producerTemplate(
    memory,
    memory.ensure(basis.O, basis.L),
    executions(memory, memory.ensure(basis.U, basis.C), 4),
  );
  const p2 = producerTemplate(
    memory,
    memory.ensure(basis.C, basis.U),
    executions(memory, memory.ensure(basis.L, basis.O), 4),
  );
  const p3 = producerTemplate(
    memory,
    memory.ensure(basis.U, basis.O),
    executions(memory, memory.ensure(basis.C, basis.L), 5),
  );
  const p4 = producerTemplate(
    memory,
    memory.ensure(basis.L, basis.C),
    executions(memory, memory.ensure(basis.O, basis.U), 3),
  );

  assert(
    [p1, p2, p3, p4].every((item) => sourcePublishable(memory, item.candidate)),
    "A35 source candidates structurally publishable",
  );

  const catalogContext = memory.ensure(basis.O, basis.C);
  const catalog0 = initialCatalog(memory, catalogContext, [p1.candidate, p2.candidate]);
  same(readCatalog(memory, catalog0).length, 2, "A35 initial catalog size");

  const publicationContext = memory.ensure(basis.R, basis.U);

  // Two valid ambient candidates exist, but neither has semantic effect merely
  // by existing. Only the selected request truth is executed.
  const request3 = selectedRequest(memory, publicationContext, catalog0, p3.candidate);
  const request4 = selectedRequest(memory, publicationContext, catalog0, p4.candidate);
  assert(request3 !== request4, "A35 independent ambient publication requests");

  same(readCatalog(memory, catalog0).length, 2, "A35 ambient requests do not mutate catalog");

  const result3 = stepPublicationRequest(memory, request3);
  const resultPoles = memory.poles(result3);
  same(resultPoles.start, publicationContext, "A35 publication result keeps context");
  const catalog1 = resultPoles.end;

  same(readCatalog(memory, catalog0).length, 2, "A35 old selected catalog immutable");
  same(readCatalog(memory, catalog1).length, 3, "A35 selected request creates new catalog");
  assert(readCatalog(memory, catalog1).includes(p3.candidate), "A35 selected candidate published");
  assert(!readCatalog(memory, catalog1).includes(p4.candidate), "A35 unselected ambient request inert");

  // Selecting the previously ambient request against the new catalog version
  // is a distinct next executor action.
  const request4FromCatalog1 = selectedRequest(
    memory, publicationContext, catalog1, p4.candidate,
  );
  const result4 = stepPublicationRequest(memory, request4FromCatalog1);
  const catalog2 = memory.poles(result4).end;
  same(readCatalog(memory, catalog2).length, 4, "A35 second selected request advances catalog");
  same(readCatalog(memory, catalog1).length, 3, "A35 prior catalog version remains immutable");

  // An ambient newer request does not retroactively change an already selected
  // result truth.
  const ambientReplay = selectedRequest(memory, publicationContext, catalog2, p1.candidate);
  assert(ambientReplay !== result4, "A35 ambient newer request distinct from selected result");
  same(memory.poles(result4).end, catalog2, "A35 selected result remains exact catalog2");

  expectThrows(
    () => { stepPublicationRequest(memory, selectedRequest(
      memory, publicationContext, catalog2, p1.candidate,
    )); },
    "A35 duplicate candidate publication rejected",
  );

  // Malformed/self-asserted candidate cannot use request truth as admission.
  const forged = materializeExactSequence(memory, [memory.root, basis.O, basis.C]);
  memory.ensure(forged, forged);
  assert(!sourcePublishable(memory, forged), "A35 malformed self-asserted source not publishable");
  expectThrows(
    () => { stepPublicationRequest(memory, selectedRequest(
      memory, publicationContext, catalog2, forged,
    )); },
    "A35 malformed self-asserted request rejected",
  );

  // A catalog whose occurrence carries a foreign C->Candidate membership is
  // structurally invalid and fails closed when selected.
  const foreignContext = memory.ensure(basis.C, basis.U);
  const foreignMembership = memory.ensure(foreignContext, p3.candidate);
  const badHead = memory.ensure(memory.poles(catalog0).end, foreignMembership);
  const badCatalog = memory.ensure(catalogContext, badHead);
  expectThrows(
    () => { stepPublicationRequest(memory, selectedRequest(
      memory, publicationContext, badCatalog, p4.candidate,
    )); },
    "A35 foreign catalog-context membership rejected",
  );
}

function staticGuards(): void {
  const root = resolve(process.cwd(), "..");
  const own = readFileSync(
    join(root, "ts/test/research-v013-contextual-catalog-publication-a35.test.ts"),
    "utf8",
  );
  const prior = readFileSync(
    join(root, "ts/test/research-v013-admitted-source-catalog-a34.test.ts"),
    "utf8",
  );

  const step = own.slice(
    own.indexOf("function stepPublicationRequest("),
    own.indexOf("\nfunction selectedRequest(", own.indexOf("function stepPublicationRequest(")),
  );
  assert(step.includes("sourcePublishable(memory, candidate)"),
    "A35 keeps A34 structural publication gate");
  assert(step.includes("const catalog = request.start"),
    "A35 derives catalog from contextual request Link");
  assert(step.includes("const candidate = request.end"),
    "A35 derives candidate from contextual request Link");
  for (const forbidden of [
    ".outgoing(", ".incoming(", "allLinks(", "switch(",
    "publishCatalog(", "catalog: LinkHandle", "candidate: LinkHandle",
  ]) {
    assert(!step.includes(forbidden), `A35 publication executor excludes external selector ${forbidden}`);
  }

  const ownGate = own.slice(
    own.indexOf("function sourcePublishable("),
    own.indexOf("\n/**\n * One selected contextual publication request:", own.indexOf("function sourcePublishable(")),
  );
  assert(ownGate.includes("memory.find(candidate, value)"),
    "A35 intentionally leaves sourcePublishable host identity check residual");

  const oldPublisher = prior.slice(
    prior.indexOf("function publishCatalog("),
    prior.indexOf("\nfunction runGenerationRequest(", prior.indexOf("function publishCatalog(")),
  );
  assert(oldPublisher.includes("catalog:LinkHandle") || oldPublisher.includes("catalog: LinkHandle"),
    "A35 targets A34 direct catalog argument");
  assert(oldPublisher.includes("candidate:LinkHandle") || oldPublisher.includes("candidate: LinkHandle"),
    "A35 targets A34 direct candidate argument");
}

function main(): void {
  exercise(false);
  exercise(true);
  staticGuards();

  console.log([
    "MTS v0.13 A35: CONTEXTUAL_CATALOG_PUBLICATION=GREEN_SCOPED_RESEARCH",
    "PUBLICATION_REQUEST=K_TO_CATALOG_TO_CANDIDATE",
    "DIRECT_CATALOG_HOST_ARGUMENT=0 DIRECT_CANDIDATE_HOST_ARGUMENT=0",
    "AMBIENT_PUBLISHABLE_CANDIDATE=INERT",
    "AMBIENT_UNSELECTED_REQUEST=INERT",
    "SELECTED_REQUEST_CREATES_NEW_CATALOG_VERSION=YES",
    "OLD_CATALOG_VERSION_IMMUTABLE=YES",
    "DUPLICATE_PUBLICATION=REJECTED",
    "MALFORMED_SELF_ASSERTED_SOURCE=REJECTED",
    "FOREIGN_CATALOG_CONTEXT=REJECTED",
    "SOURCE_PUBLISHABLE_INTERPRETER=HOST_RESIDUAL",
    "CURRENT_REQUEST_TRUTH=EXECUTOR_STATE_BOUNDARY_SCOPED",
    "INDEPENDENT_MEMORIES=2 GLOBAL_E2=OPEN GLOBAL_E3=OPEN",
    "FULL_SELF_HOSTED=NOT_CLAIMED PRODUCTION_UNCHANGED",
  ].join(" "));
}

main();
