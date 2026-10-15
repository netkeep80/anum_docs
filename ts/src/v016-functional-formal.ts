import {
  ExactSequenceError,
  materializeExactSequence,
  readExactSequence,
} from "./exact-sequence.js";
import {
  Memory,
  MemoryError,
  verifyRootBasis,
  type LinkHandle,
  type ReadMemory,
  type RootBasis,
  type WriteMemory,
} from "./memory.js";
import { readNativeSyntaxGrammar } from "./native-syntax-grammar.js";
import {
  SyntaxAsetBuilder,
  readSyntaxAset,
  type SyntaxAsetOccurrence,
} from "./syntax-aset-contract.js";
import {
  materializeV012StringAnum,
  readV012StringAnum,
} from "./v012-string-anum.js";
import {
  StructuralRuleError,
  type StructuralRoleBinding,
} from "./structural-rule.js";
import { unifyStructuralRuleTemplate } from "./structural-unification.js";
import { instantiateV013StructuralTemplate } from "./v013-structural-execution.js";

/** T09 v0.16 research candidate. It does not change accepted v0.15 semantics. */
export type V016FunctionalErrorCode =
  | "invalid-basis" | "invalid-profile" | "incompatible-profile"
  | "invalid-utf8" | "invalid-formal" | "invalid-head" | "invalid-name"
  | "invalid-parameter" | "duplicate-parameter" | "invalid-body"
  | "duplicate-definition" | "incomplete-definition" | "unsupported-arity"
  | "unbound-name" | "undefined-function" | "invalid-call"
  | "unsupported-sugar" | "invalid-source" | "unsupported-entry"
  | "s1-wrote" | "invalid-residual";

export class V016FunctionalError extends Error {
  override readonly name = "V016FunctionalError";
  constructor(readonly code: V016FunctionalErrorCode) { super(code); }
}
function fail(code: V016FunctionalErrorCode): never { throw new V016FunctionalError(code); }

export interface V016FunctionalSourceProfile {
  readonly documentForm: LinkHandle;
  readonly definitionForm: LinkHandle;
  readonly fiberForm: LinkHandle;
  readonly callForm: LinkHandle;
  readonly itemRole: LinkHandle;
  readonly functionRole: LinkHandle;
  readonly groupsRole: LinkHandle;
  readonly bodyStartRole: LinkHandle;
  readonly bodyEndRole: LinkHandle;
  readonly fiberAnchorRole: LinkHandle;
  readonly sourceRole: LinkHandle;
  readonly atomArgumentMarker: LinkHandle;
  readonly sequenceArgumentMarker: LinkHandle;
}

export interface V016FunctionalSourceCompileResult {
  readonly sourceContent: LinkHandle;
  readonly sourceAset: LinkHandle;
}

export interface V016FunctionalDefinition {
  readonly nameCarrier: LinkHandle;
  readonly functionAnchor: LinkHandle;
  readonly scope: LinkHandle;
  readonly binders: readonly [LinkHandle, LinkHandle];
  readonly roleBundle: LinkHandle;
  readonly genericRule: LinkHandle;
  readonly domainLaw: LinkHandle;
  readonly correspondence: LinkHandle;
  readonly branchRules: readonly LinkHandle[];
  readonly theory: LinkHandle;
  readonly context: LinkHandle;
  readonly contextUse: LinkHandle;
}

export interface V016FunctionalDenotation {
  readonly members: ReadonlySet<LinkHandle>;
  readonly definitions: readonly V016FunctionalDefinition[];
}

export interface V016CallBinding { readonly name: string; readonly value: LinkHandle; }
export interface V016FunctionalCall {
  readonly definition: V016FunctionalDefinition;
  readonly groups: readonly (readonly LinkHandle[])[];
  readonly args: readonly LinkHandle[];
  readonly exactArgs: LinkHandle;
  readonly query: LinkHandle;
}
export interface V016FunctionalPlanMatch {
  readonly rule: LinkHandle;
  readonly roles: readonly LinkHandle[];
  readonly bindings: readonly StructuralRoleBinding[];
  readonly outputTemplates: readonly LinkHandle[];
}

export type V016DomainStatus = "UNKNOWN" | "IN" | "OUT_CERTIFIED";
export type V016ClosureStatus = "UNKNOWN" | "CERTIFIED";
export type V016ObservationVerdict =
  | "UNKNOWN_DOMAIN" | "OUT_OF_DOMAIN" | "UNKNOWN_CLOSURE"
  | "UNSAT" | "UNIQUE" | "FUNCTION_CONFLICT";

export interface V016ResidualDescriptor {
  readonly functionAnchor: LinkHandle;
  readonly context: LinkHandle;
  readonly domainLaw: LinkHandle;
  readonly prefix: LinkHandle;
  readonly correspondence: LinkHandle;
}

export function materializeV016FunctionalSourceProfile(
  memory: WriteMemory,
  profile: V016FunctionalSourceProfile,
): LinkHandle {
  return materializeExactSequence(memory, [
    profile.documentForm, profile.definitionForm, profile.fiberForm,
    profile.callForm, profile.itemRole, profile.functionRole,
    profile.groupsRole, profile.bodyStartRole, profile.bodyEndRole,
    profile.fiberAnchorRole, profile.sourceRole, profile.atomArgumentMarker,
    profile.sequenceArgumentMarker,
  ]);
}

function requireHandle(value: LinkHandle | undefined): LinkHandle {
  return value ?? fail("invalid-profile");
}

function readProfile(
  memory: ReadMemory,
  basis: RootBasis,
  grammarRoot: LinkHandle,
  profileRoot: LinkHandle,
): Readonly<{ profile: V016FunctionalSourceProfile; grammar: ReturnType<typeof readNativeSyntaxGrammar> }> {
  try { verifyRootBasis(memory, basis); } catch { return fail("invalid-basis"); }
  const grammar = readNativeSyntaxGrammar(memory, basis, grammarRoot);
  let values: readonly LinkHandle[];
  try { values = readExactSequence(memory, profileRoot).values; }
  catch { return fail("invalid-profile"); }
  if (values.length !== 13) fail("invalid-profile");
  const profile: V016FunctionalSourceProfile = Object.freeze({
    documentForm: requireHandle(values[0]), definitionForm: requireHandle(values[1]),
    fiberForm: requireHandle(values[2]), callForm: requireHandle(values[3]),
    itemRole: requireHandle(values[4]), functionRole: requireHandle(values[5]),
    groupsRole: requireHandle(values[6]), bodyStartRole: requireHandle(values[7]),
    bodyEndRole: requireHandle(values[8]), fiberAnchorRole: requireHandle(values[9]),
    sourceRole: requireHandle(values[10]), atomArgumentMarker: requireHandle(values[11]),
    sequenceArgumentMarker: requireHandle(values[12]),
  });
  const exact = (
    form: LinkHandle,
    fields: readonly Readonly<{ role: LinkHandle; target: "child" | "carrier"; min: number; max: number | null }>[],
  ): void => {
    const rule = grammar.vocabulary.rules.find((candidate) => candidate.kind === form);
    if (rule === undefined || rule.fields.length !== fields.length) fail("incompatible-profile");
    for (let index = 0; index < fields.length; index += 1) {
      const actual = rule.fields[index], wanted = fields[index];
      if (actual === undefined || wanted === undefined || actual.role !== wanted.role ||
          actual.target !== wanted.target || actual.min !== wanted.min || actual.max !== wanted.max) {
        fail("incompatible-profile");
      }
    }
  };
  exact(profile.documentForm, [{ role: profile.itemRole, target: "child", min: 1, max: null }]);
  exact(profile.definitionForm, [
    { role: profile.functionRole, target: "carrier", min: 1, max: 1 },
    { role: profile.groupsRole, target: "carrier", min: 1, max: 1 },
    { role: profile.bodyStartRole, target: "carrier", min: 1, max: 1 },
    { role: profile.bodyEndRole, target: "carrier", min: 1, max: 1 },
    { role: profile.sourceRole, target: "carrier", min: 1, max: 1 },
  ]);
  exact(profile.fiberForm, [
    { role: profile.functionRole, target: "carrier", min: 1, max: 1 },
    { role: profile.groupsRole, target: "carrier", min: 1, max: 1 },
    { role: profile.fiberAnchorRole, target: "carrier", min: 1, max: 1 },
    { role: profile.sourceRole, target: "carrier", min: 1, max: 1 },
  ]);
  exact(profile.callForm, [
    { role: profile.functionRole, target: "carrier", min: 1, max: 1 },
    { role: profile.groupsRole, target: "carrier", min: 1, max: 1 },
    { role: profile.sourceRole, target: "carrier", min: 1, max: 1 },
  ]);
  return Object.freeze({ profile, grammar });
}

const IDENTIFIER = /^[\p{L}_][\p{L}\p{N}_]*$/u;
interface ParsedHead { readonly name: string; readonly groups: readonly string[]; }
type ParsedDefinition =
  | Readonly<{ kind: "definition"; name: string; groups: readonly string[]; start: string; end: string }>
  | Readonly<{ kind: "fiber"; name: string; groups: readonly string[]; anchor: string }>;
type CallArgumentSource =
  | Readonly<{ kind: "atom"; name: string }>
  | Readonly<{ kind: "sequence"; names: readonly string[] }>;

function splitColon(line: string): readonly [string, string] {
  let depth = 0;
  for (let index = 0; index < line.length; index += 1) {
    const ch = line[index];
    if (ch === "(") depth += 1;
    else if (ch === ")") depth -= 1;
    else if (ch === ":" && depth === 0) return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
  }
  return fail("invalid-formal");
}

function parseHead(source: string, allowCall: boolean): ParsedHead {
  const first = source.indexOf("(");
  if (first < 1) fail("invalid-head");
  const name = source.slice(0, first).trim();
  if (!IDENTIFIER.test(name)) fail("invalid-name");
  const groups: string[] = [];
  let index = first;
  while (index < source.length) {
    while (/\s/u.test(source[index] ?? "")) index += 1;
    if (source[index] !== "(") fail("invalid-head");
    let cursor = index + 1, round = 1, square = 0;
    for (; cursor < source.length; cursor += 1) {
      const ch = source[cursor];
      if (ch === "[") square += 1;
      else if (ch === "]") square -= 1;
      else if (square === 0 && ch === "(") round += 1;
      else if (square === 0 && ch === ")" && --round === 0) break;
    }
    if (round !== 0 || square !== 0) fail("invalid-head");
    const body = source.slice(index + 1, cursor).trim();
    if (!allowCall && !IDENTIFIER.test(body)) fail("invalid-parameter");
    groups.push(body);
    index = cursor + 1;
  }
  if (groups.length === 0) fail("invalid-head");
  return Object.freeze({ name, groups: Object.freeze(groups) });
}

function parseDefinitionLine(line: string): ParsedDefinition {
  const [lhs, rhs] = splitColon(line);
  const head = parseHead(lhs, false);
  if (new Set(head.groups).size !== head.groups.length) fail("duplicate-parameter");
  const arrow = rhs.indexOf("->");
  if (arrow >= 0) {
    if (rhs.indexOf("->", arrow + 2) >= 0) fail("invalid-body");
    const start = rhs.slice(0, arrow).trim(), end = rhs.slice(arrow + 2).trim();
    if (!IDENTIFIER.test(start) || !IDENTIFIER.test(end)) fail("invalid-body");
    return Object.freeze({ kind: "definition", name: head.name, groups: head.groups, start, end });
  }
  const match = /^([\p{L}_][\p{L}\p{N}_]*)\{\}$/u.exec(rhs);
  if (match?.[1] === undefined) fail("invalid-body");
  return Object.freeze({ kind: "fiber", name: head.name, groups: head.groups, anchor: match[1] });
}

function parseCall(source: string): Readonly<{ name: string; groups: readonly (readonly CallArgumentSource[])[] }> {
  const head = parseHead(source.trim(), true);
  const groups = head.groups.map((group): readonly CallArgumentSource[] => {
    if (group === "") return Object.freeze([]);
    if (group.startsWith("[")) {
      if (!group.endsWith("]")) fail("invalid-call");
      const body = group.slice(1, -1).trim();
      const names = body === "" ? [] : body.split(",").map((value) => value.trim());
      if (names.some((value) => !IDENTIFIER.test(value))) fail("invalid-call");
      return Object.freeze([Object.freeze({ kind: "sequence" as const, names: Object.freeze(names) })]);
    }
    if (group.includes(",")) fail("unsupported-sugar");
    if (!IDENTIFIER.test(group)) fail("invalid-call");
    return Object.freeze([Object.freeze({ kind: "atom" as const, name: group })]);
  });
  return Object.freeze({ name: head.name, groups: Object.freeze(groups) });
}

function stringCarrier(memory: WriteMemory, basis: RootBasis, source: string): LinkHandle {
  return materializeV012StringAnum(memory, basis, new TextEncoder().encode(source)).anumLink;
}
function definitionGroupsCarrier(memory: WriteMemory, basis: RootBasis, groups: readonly string[]): LinkHandle {
  return materializeExactSequence(memory, groups.map((name) =>
    materializeExactSequence(memory, [stringCarrier(memory, basis, name)])));
}

export function compileV016FunctionalDefinitions(
  memory: WriteMemory, basis: RootBasis, grammarRoot: LinkHandle,
  profileRoot: LinkHandle, bytes: Uint8Array,
): V016FunctionalSourceCompileResult {
  const { profile, grammar } = readProfile(memory, basis, grammarRoot, profileRoot);
  let text: string;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { return fail("invalid-utf8"); }
  const builder = new SyntaxAsetBuilder(memory, grammar.vocabulary), items: LinkHandle[] = [];
  for (const rawLine of text.split(/\r?\n/u)) {
    if (rawLine.trim() === "") continue;
    const parsed = parseDefinitionLine(rawLine.trim());
    const common = [
      { role: profile.functionRole, value: stringCarrier(memory, basis, parsed.name) },
      { role: profile.groupsRole, value: definitionGroupsCarrier(memory, basis, parsed.groups) },
    ];
    const source = stringCarrier(memory, basis, rawLine);
    if (parsed.kind === "definition") {
      items.push(builder.addOccurrence(profile.definitionForm, [
        ...common,
        { role: profile.bodyStartRole, value: stringCarrier(memory, basis, parsed.start) },
        { role: profile.bodyEndRole, value: stringCarrier(memory, basis, parsed.end) },
        { role: profile.sourceRole, value: source },
      ]));
    } else {
      items.push(builder.addOccurrence(profile.fiberForm, [
        ...common,
        { role: profile.fiberAnchorRole, value: stringCarrier(memory, basis, parsed.anchor) },
        { role: profile.sourceRole, value: source },
      ]));
    }
  }
  if (items.length === 0) fail("invalid-formal");
  const root = builder.addOccurrence(profile.documentForm, items.map((value) => ({ role: profile.itemRole, value })));
  return Object.freeze({
    sourceContent: materializeV012StringAnum(memory, basis, bytes).anumLink,
    sourceAset: builder.finish(root),
  });
}

export function compileV016FunctionalCall(
  memory: WriteMemory, basis: RootBasis, grammarRoot: LinkHandle,
  profileRoot: LinkHandle, bytes: Uint8Array,
): V016FunctionalSourceCompileResult {
  const { profile, grammar } = readProfile(memory, basis, grammarRoot, profileRoot);
  let text: string;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { return fail("invalid-utf8"); }
  const parsed = parseCall(text), builder = new SyntaxAsetBuilder(memory, grammar.vocabulary);
  const groups = materializeExactSequence(memory, parsed.groups.map((group) =>
    materializeExactSequence(memory, group.map((argument) => {
      const value = argument.kind === "atom"
        ? stringCarrier(memory, basis, argument.name)
        : materializeExactSequence(memory, argument.names.map((name) => stringCarrier(memory, basis, name)));
      return materializeExactSequence(memory, [
        argument.kind === "atom" ? profile.atomArgumentMarker : profile.sequenceArgumentMarker,
        value,
      ]);
    }))));
  const call = builder.addOccurrence(profile.callForm, [
    { role: profile.functionRole, value: stringCarrier(memory, basis, parsed.name) },
    { role: profile.groupsRole, value: groups },
    { role: profile.sourceRole, value: materializeV012StringAnum(memory, basis, bytes).anumLink },
  ]);
  const root = builder.addOccurrence(profile.documentForm, [{ role: profile.itemRole, value: call }]);
  return Object.freeze({ sourceContent: materializeV012StringAnum(memory, basis, bytes).anumLink, sourceAset: builder.finish(root) });
}

function oneField(occurrence: SyntaxAsetOccurrence, role: LinkHandle): LinkHandle {
  const values = occurrence.fields.filter((field) => field.role === role);
  if (values.length !== 1) fail("invalid-source");
  return values[0]!.value;
}
function exactValues(memory: ReadMemory, carrier: LinkHandle): readonly LinkHandle[] {
  try { return readExactSequence(memory, carrier).values; }
  catch (error) {
    if (error instanceof ExactSequenceError || error instanceof MemoryError) return fail("invalid-source");
    throw error;
  }
}
function sourceEntries(
  memory: ReadMemory,
  grammar: ReturnType<typeof readNativeSyntaxGrammar>,
  profile: V016FunctionalSourceProfile,
  sourceAset: LinkHandle,
): readonly SyntaxAsetOccurrence[] {
  const source = readSyntaxAset(memory, sourceAset, grammar.vocabulary);
  const byHandle = new Map(source.occurrences.map((entry) => [entry.occurrence, entry]));
  const root = byHandle.get(source.root);
  if (root?.kind !== profile.documentForm) fail("invalid-source");
  return Object.freeze(root.fields.filter((field) => field.role === profile.itemRole).map((field) =>
    byHandle.get(field.value) ?? fail("invalid-source")));
}
function decodedGroups(memory: ReadMemory, carrier: LinkHandle): readonly (readonly LinkHandle[])[] {
  return Object.freeze(exactValues(memory, carrier).map((group) => Object.freeze([...exactValues(memory, group)])));
}

function materializeBranches(
  memory: WriteMemory, basis: RootBasis, functionAnchor: LinkHandle,
  scope: LinkHandle, binders: readonly [LinkHandle, LinkHandle], theory: LinkHandle,
): Readonly<{ members: ReadonlySet<LinkHandle>; rules: readonly LinkHandle[] }> {
  const members = new Set<LinkHandle>(), rules: LinkHandle[] = [];
  const branchTag = (index: number): LinkHandle => materializeExactSequence(
    memory, Array.from({ length: index + 1 }, () => basis.R));
  const emit = (
    index: number, useX: boolean, useY: boolean,
    make: (x: LinkHandle | undefined, y: LinkHandle | undefined) => readonly [LinkHandle, LinkHandle],
  ): void => {
    const roleBundle = memory.ensure(scope, branchTag(index));
    const x = useX ? memory.ensure(roleBundle, binders[0]) : undefined;
    const y = useY ? memory.ensure(roleBundle, binders[1]) : undefined;
    const [antecedent, output] = make(x, y);
    const rule = memory.ensure(roleBundle, memory.ensure(antecedent, materializeExactSequence(memory, [output])));
    if (x !== undefined) members.add(x);
    if (y !== undefined) members.add(y);
    members.add(memory.ensure(theory, rule));
    rules.push(rule);
  };
  const SR = memory.ensureStartSelfClosed(basis.R), SC = memory.ensureStartSelfClosed(basis.C);
  emit(0, false, false, () => [memory.ensure(functionAnchor, memory.ensureStartSelfClosed(SR)), basis.R]);
  emit(1, false, false, () => { const e = memory.ensureEndSelfClosed(SR); return [memory.ensure(functionAnchor, memory.ensureStartSelfClosed(e)), memory.ensure(basis.R, e)]; });
  emit(2, false, true, (_x, y) => [memory.ensure(functionAnchor, memory.ensureStartSelfClosed(memory.ensure(SR, y!))), memory.ensure(basis.R, y!)]);
  emit(3, false, false, () => [memory.ensure(functionAnchor, memory.ensureStartSelfClosed(SC)), memory.ensure(basis.C, basis.C)]);
  emit(4, false, false, () => { const e = memory.ensureEndSelfClosed(SC); return [memory.ensure(functionAnchor, memory.ensureStartSelfClosed(e)), memory.ensure(basis.C, e)]; });
  emit(5, false, true, (_x, y) => [memory.ensure(functionAnchor, memory.ensureStartSelfClosed(memory.ensure(SC, y!))), memory.ensure(basis.C, y!)]);
  emit(6, true, false, (x) => { const px = memory.ensure(basis.R, x!), sx = memory.ensureStartSelfClosed(px); return [memory.ensure(functionAnchor, memory.ensureStartSelfClosed(sx)), memory.ensure(x!, px)]; });
  emit(7, true, false, (x) => { const px = memory.ensure(basis.R, x!), sx = memory.ensureStartSelfClosed(px), e = memory.ensureEndSelfClosed(sx); return [memory.ensure(functionAnchor, memory.ensureStartSelfClosed(e)), memory.ensure(x!, e)]; });
  emit(8, true, true, (x, y) => { const px = memory.ensure(basis.R, x!), sx = memory.ensureStartSelfClosed(px); return [memory.ensure(functionAnchor, memory.ensureStartSelfClosed(memory.ensure(sx, y!))), memory.ensure(x!, y!)]; });
  return Object.freeze({ members: new Set(members), rules: Object.freeze(rules) });
}

export function denoteV016FunctionalDefinitions(
  memory: WriteMemory, basis: RootBasis, grammarRoot: LinkHandle,
  profileRoot: LinkHandle, sourceAset: LinkHandle, theory: LinkHandle, context: LinkHandle,
): V016FunctionalDenotation {
  const { profile, grammar } = readProfile(memory, basis, grammarRoot, profileRoot);
  try { memory.poles(theory); memory.poles(context); } catch { return fail("invalid-basis"); }
  const grouped = new Map<LinkHandle, { full: SyntaxAsetOccurrence[]; fiber: SyntaxAsetOccurrence[] }>();
  for (const entry of sourceEntries(memory, grammar, profile, sourceAset)) {
    if (entry.kind !== profile.definitionForm && entry.kind !== profile.fiberForm) fail("unsupported-entry");
    const name = oneField(entry, profile.functionRole), selected = grouped.get(name) ?? { full: [], fiber: [] };
    (entry.kind === profile.definitionForm ? selected.full : selected.fiber).push(entry);
    grouped.set(name, selected);
  }
  const members = new Set<LinkHandle>(), definitions: V016FunctionalDefinition[] = [];
  for (const [nameCarrier, selected] of grouped) {
    if (selected.full.length !== 1 || selected.fiber.length !== 1) {
      fail(selected.full.length > 1 || selected.fiber.length > 1 ? "duplicate-definition" : "incomplete-definition");
    }
    const full = selected.full[0]!, fiber = selected.fiber[0]!;
    const fullGroups = decodedGroups(memory, oneField(full, profile.groupsRole));
    const fiberGroups = decodedGroups(memory, oneField(fiber, profile.groupsRole));
    if (fullGroups.length !== 2 || fullGroups.some((group) => group.length !== 1) ||
        fiberGroups.length !== 1 || fiberGroups[0]?.length !== 1) fail("unsupported-arity");
    const first = fullGroups[0]![0]!, second = fullGroups[1]![0]!;
    if (first === second) fail("duplicate-parameter");
    if (oneField(full, profile.bodyStartRole) !== first || oneField(full, profile.bodyEndRole) !== second ||
        oneField(fiber, profile.fiberAnchorRole) !== fiberGroups[0]![0]) fail("unbound-name");

    // Binder identity is scope+position, not spelling. Alpha-renaming therefore preserves denotation.
    const functionAnchor = memory.ensure(basis.R, nameCarrier);
    const arity = materializeExactSequence(memory, [basis.R, basis.R]);
    const scope = memory.ensure(functionAnchor, arity);
    const binders = Object.freeze([
      memory.ensure(scope, materializeExactSequence(memory, [basis.R])),
      memory.ensure(scope, arity),
    ]) as readonly [LinkHandle, LinkHandle];
    const roleBundle = memory.ensureStartSelfClosed(scope);
    const roles = binders.map((binder) => memory.ensure(roleBundle, binder)) as [LinkHandle, LinkHandle];
    const antecedent = memory.ensure(functionAnchor, materializeExactSequence(memory, roles));
    const output = memory.ensure(roles[0], roles[1]);
    const genericRule = memory.ensure(roleBundle, memory.ensure(antecedent, materializeExactSequence(memory, [output])));
    const domainLaw = memory.ensureEndSelfClosed(scope); // opaque OPEN-domain law carrier for this candidate
    const contextUse = memory.ensure(context, scope);
    members.add(contextUse); roles.forEach((role) => members.add(role));
    const branches = materializeBranches(memory, basis, functionAnchor, scope, binders, theory);
    branches.members.forEach((member) => members.add(member));
    definitions.push(Object.freeze({
      nameCarrier, functionAnchor, scope, binders, roleBundle, genericRule,
      domainLaw, correspondence: genericRule, branchRules: branches.rules,
      theory, context, contextUse,
    }));
  }
  return Object.freeze({ members: new Set(members), definitions: Object.freeze(definitions) });
}

function carrierText(memory: ReadMemory, basis: RootBasis, carrier: LinkHandle): string {
  try { return new TextDecoder("utf-8", { fatal: true }).decode(readV012StringAnum(memory, basis, carrier).bytes); }
  catch { return fail("unbound-name"); }
}
function resolveCallAtom(
  memory: ReadMemory, basis: RootBasis, carrier: LinkHandle, bindings: readonly V016CallBinding[],
): LinkHandle {
  const name = carrierText(memory, basis, carrier);
  if (name === "R") return basis.R;
  if (name === "O") return basis.O;
  if (name === "C") return basis.C;
  if (name === "L") return basis.L;
  if (name === "U") return basis.U;
  return bindings.find((binding) => binding.name === name)?.value ?? fail("unbound-name");
}

export function denoteV016FunctionalCall(
  memory: WriteMemory, basis: RootBasis, grammarRoot: LinkHandle, profileRoot: LinkHandle,
  sourceAset: LinkHandle, definitions: readonly V016FunctionalDefinition[],
  bindings: readonly V016CallBinding[] = [],
): V016FunctionalCall {
  const { profile, grammar } = readProfile(memory, basis, grammarRoot, profileRoot);
  const entries = sourceEntries(memory, grammar, profile, sourceAset);
  if (entries.length !== 1 || entries[0]?.kind !== profile.callForm) fail("invalid-call");
  const entry = entries[0]!, nameCarrier = oneField(entry, profile.functionRole);
  const definition = definitions.find((candidate) => candidate.nameCarrier === nameCarrier) ?? fail("undefined-function");
  const groups = decodedGroups(memory, oneField(entry, profile.groupsRole)).map((group) => Object.freeze(group.map((expression) => {
    const values = exactValues(memory, expression);
    if (values.length !== 2 || values[0] === undefined || values[1] === undefined) fail("invalid-call");
    if (values[0] === profile.atomArgumentMarker) return resolveCallAtom(memory, basis, values[1], bindings);
    if (values[0] === profile.sequenceArgumentMarker) {
      return materializeExactSequence(memory, exactValues(memory, values[1]).map((carrier) => resolveCallAtom(memory, basis, carrier, bindings)));
    }
    return fail("invalid-call");
  })));
  const args = Object.freeze(groups.flat()), exactArgs = materializeExactSequence(memory, args);
  return Object.freeze({ definition, groups: Object.freeze(groups), args, exactArgs, query: memory.ensure(definition.functionAnchor, exactArgs) });
}

/** Read-only S1 component plan: only positive current membership supplies Context, admissions and roles. */
export function planV016FunctionalCall(
  memory: ReadMemory, call: V016FunctionalCall, members: ReadonlySet<LinkHandle>,
  theory: LinkHandle, context: LinkHandle,
): readonly V016FunctionalPlanMatch[] {
  const before = memory.linkCount;
  try {
    const use = memory.find(context, call.definition.scope);
    if (use === undefined || !members.has(use)) return Object.freeze([]);
    const result: V016FunctionalPlanMatch[] = [];
    for (const admission of members) {
      const admissionPoles = memory.poles(admission);
      if (admissionPoles.start !== theory) continue;
      const rule = admissionPoles.end, rulePoles = memory.poles(rule), roleBundle = rulePoles.start;
      const body = memory.poles(rulePoles.end), outputs = exactValues(memory, body.end);
      const roles: LinkHandle[] = [];
      for (const member of members) if (memory.poles(member).start === roleBundle) roles.push(member);
      try {
        result.push(Object.freeze({
          rule, roles: Object.freeze(roles),
          bindings: unifyStructuralRuleTemplate(memory, body.start, call.query, roles),
          outputTemplates: Object.freeze([...outputs]),
        }));
      } catch (error) {
        if (!(error instanceof StructuralRuleError)) throw error;
      }
    }
    return Object.freeze(result);
  } finally {
    if (memory.linkCount !== before) fail("s1-wrote");
  }
}

/** S2 component construction only. Publication/atomic commit remains T10/A-memory work. */
export function applyV016FunctionalPlan(
  memory: Memory,
  plans: readonly V016FunctionalPlanMatch[],
): readonly LinkHandle[] {
  return Object.freeze(plans.flatMap((plan) => plan.outputTemplates.map((template) =>
    instantiateV013StructuralTemplate(memory, template, plan.bindings))));
}

/** Five-field finite residual carrier: F, K, domain law, exact prefix, correspondence. */
export function materializeV016ResidualDescriptor(
  memory: WriteMemory, functionAnchor: LinkHandle, context: LinkHandle,
  domainLaw: LinkHandle, prefix: LinkHandle, correspondence: LinkHandle,
): LinkHandle {
  try { readExactSequence(memory, prefix); } catch { return fail("invalid-residual"); }
  return materializeExactSequence(memory, [functionAnchor, context, domainLaw, prefix, correspondence]);
}
export function readV016ResidualDescriptor(memory: ReadMemory, carrier: LinkHandle): V016ResidualDescriptor {
  let values: readonly LinkHandle[];
  try { values = readExactSequence(memory, carrier).values; }
  catch { return fail("invalid-residual"); }
  if (values.length !== 5 || values.some((value) => value === undefined)) fail("invalid-residual");
  const [functionAnchor, context, domainLaw, prefix, correspondence] = values as readonly [LinkHandle, LinkHandle, LinkHandle, LinkHandle, LinkHandle];
  try { readExactSequence(memory, prefix); } catch { return fail("invalid-residual"); }
  return Object.freeze({ functionAnchor, context, domainLaw, prefix, correspondence });
}

/** No solver: this only classifies already observed canonical values under explicit certificates. */
export function classifyV016Observation(
  domain: V016DomainStatus,
  closure: V016ClosureStatus,
  outputs: readonly LinkHandle[],
): V016ObservationVerdict {
  const distinct = new Set(outputs).size;
  if (domain === "UNKNOWN") return "UNKNOWN_DOMAIN";
  if (domain === "OUT_CERTIFIED") return "OUT_OF_DOMAIN";
  if (distinct > 1) return "FUNCTION_CONFLICT";
  if (closure === "UNKNOWN") return "UNKNOWN_CLOSURE";
  return distinct === 0 ? "UNSAT" : "UNIQUE";
}
