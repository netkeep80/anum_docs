import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
  type LinkPoles,
  type ReadMemory,
} from "../src/memory.js";
import {
  defineStructuralRoleDictionary,
  defineStructuralRule,
  readStructuralRoleDictionary,
  readStructuralRule,
} from "../src/structural-rule.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`AR4 rooted query carrier: ${message}`);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}

class PoleOnlyProbe implements ReadMemory {
  constructor(private readonly source: ReadMemory) {}
  get root(): LinkHandle { return this.source.root; }
  get linkCount(): number { return this.source.linkCount; }
  poles(link: LinkHandle): LinkPoles { return this.source.poles(link); }
  find(): LinkHandle | undefined { throw new Error("AR4 rooted query read forbids find"); }
  outgoing(): readonly LinkHandle[] { throw new Error("AR4 rooted query read forbids outgoing"); }
  incoming(): readonly LinkHandle[] { throw new Error("AR4 rooted query read forbids incoming"); }
}

const memory = new Memory();
const basis = ensureRootBasis(memory);

// StructuralRoleDictionary already gives a rooted, ordered declaration of the
// open positions. Reuse the existing DR->body carrier topology here without
// claiming that every query is a Theory-admitted Rule. The semantic role is
// selected by its surrounding Use/support; the Link structure itself needs no
// Pattern AST or host role metadata.
const roleSeed = memory.ensure(basis.L, basis.U);
const endRole = memory.ensureStartSelfClosed(roleSeed);
const otherRole = memory.ensureEndSelfClosed(roleSeed);
const roleDictionary = defineStructuralRoleDictionary(memory, [endRole]);
const startTemplate = memory.ensureStartSelfClosed(endRole);
const query = defineStructuralRule(memory, roleDictionary, startTemplate);

const decodedQuery = readStructuralRule(memory, query);
same(decodedQuery.roleDictionary, roleDictionary, "query pins role dictionary");
same(decodedQuery.body, startTemplate, "query pins template body");
const decodedRoles = readStructuralRoleDictionary(memory, decodedQuery.roleDictionary);
same(decodedRoles.roles.length, 1, "query has one open role");
same(decodedRoles.roles[0], endRole, "open role is recovered from query closure");

// A different role declaration produces a different rooted query even when the
// visible template body is reused. Therefore the open positions are not hidden
// host metadata.
const otherRoleDictionary = defineStructuralRoleDictionary(memory, [otherRole]);
const otherQuery = defineStructuralRule(memory, otherRoleDictionary, startTemplate);
assert(otherQuery !== query, "role dictionary is part of rooted query identity");
const otherDecoded = readStructuralRule(memory, otherQuery);
const otherRoles = readStructuralRoleDictionary(memory, otherDecoded.roleDictionary);
same(otherRoles.roles[0], otherRole, "alternate rooted declaration is observable");

// The whole carrier is readable with poles only. There is no ambient role
// discovery, adjacency scan, callback, source offset or Pattern object.
const poleOnly = new PoleOnlyProbe(memory);
const poleOnlyQuery = readStructuralRule(poleOnly, query);
const poleOnlyRoles = readStructuralRoleDictionary(poleOnly, poleOnlyQuery.roleDictionary);
same(poleOnlyQuery.body, startTemplate, "pole-only query body");
same(poleOnlyRoles.roles[0], endRole, "pole-only role recovery");

const classification = Object.freeze({
  queryTemplateIsLink: true,
  openPositionsAreRootedInRoleDictionary: true,
  hostRoleListAuthorityRequired: false,
  ambientDiscoveryRequired: false,
  theoryAdmissionImpliedByCarrierShape: false,
  verdict: "GREEN-CANDIDATE" as const,
  reason: "ROOTED_ROLE_DICTIONARY_PLUS_TEMPLATE_CARRIER" as const,
});

same(classification.verdict, "GREEN-CANDIDATE", "AR4 rooted query classification");
same(
  classification.reason,
  "ROOTED_ROLE_DICTIONARY_PLUS_TEMPLATE_CARRIER",
  "AR4 rooted query reason",
);

console.log("MTS AR4 rooted structural query carrier: GREEN candidate exercised.");
