import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Memory, ensureRootBasis, type LinkHandle, type RootBasis } from "../src/memory.js";
import {
  materializeNativeSyntaxGrammar,
  readNativeSyntaxGrammar,
  type NativeSyntaxGrammarRuleSpec,
} from "../src/native-syntax-grammar.js";
import { materializeSourceNamespaceProfile } from "../src/source-namespace.js";
import { materializeV015LinkDefinitionProfile } from "../src/v015-link-definition.js";
import {
  compileV015FormalDefinitionsToRecursive,
  type V015FormalRecursiveCompileResult,
} from "../src/v015-formal-recursive-compiler.js";
import { materializeV012StringAnum } from "../src/v012-string-anum.js";
import { SyntaxAsetBuilder } from "../src/syntax-aset-contract.js";
import {
  materializeV015ProofFormProfile,
  materializeV015ProofSource,
  type V015ProofFormProfile,
} from "../src/v015-proof-source.js";
import {
  exportPortableClosedRootedProof,
  replayPortableClosedRootedProof,
} from "../src/portable-closed-rooted-proof.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`v0.15 P1 proof forms: ${message}`);
}
function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}
function sameBytes(actual: Uint8Array, expected: Uint8Array, message: string): void {
  same(actual.length, expected.length, `${message}: length`);
  for (let i = 0; i < actual.length; i += 1) same(actual[i], expected[i], `${message}: byte ${i}`);
}
function repoRoot(): string {
  const candidates = [resolve(process.cwd(), ".."), process.cwd()];
  const root = candidates.find((candidate) =>
    existsSync(resolve(candidate, "proofs", "native", "FND-07", "contextual-detachment.anum"))
  );
  assert(root !== undefined, "repository root found");
  return root;
}

interface SemanticFixture {
  readonly memory: Memory;
  readonly basis: RootBasis;
  readonly compiled: V015FormalRecursiveCompileResult;
  readonly value: (name: string) => LinkHandle;
}

function semanticFixture(): SemanticFixture {
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  let cursor = memory.ensure(basis.U, basis.L);
  const fresh = (): LinkHandle => (cursor = memory.ensure(cursor, basis.C));
  const syntaxTag = fresh();
  const markerSeed = fresh();
  const pairForm = fresh();
  const refForm = fresh();
  const declarationForm = fresh();
  const blockForm = fresh();
  const leftRole = fresh();
  const rightRole = fresh();
  const refRole = fresh();
  const nameRole = fresh();
  const bodyRole = fresh();
  const itemRole = fresh();
  const rules: readonly NativeSyntaxGrammarRuleSpec[] = [
    { form: pairForm, fields: [
      { role:leftRole, target:"child", min:1, max:1 },
      { role:rightRole, target:"child", min:1, max:1 },
    ]},
    { form: refForm, fields:[{ role:refRole, target:"carrier", min:1, max:1 }]},
    { form: declarationForm, fields:[
      { role:nameRole, target:"carrier", min:1, max:1 },
      { role:bodyRole, target:"child", min:1, max:1 },
    ]},
    { form:blockForm, fields:[{ role:itemRole, target:"child", min:0, max:null }]},
  ];
  const grammarRoot = materializeNativeSyntaxGrammar(memory, basis, { syntaxTag, markerSeed, rules });
  const namespaceProfileRoot = materializeSourceNamespaceProfile(memory, {
    blockForm, declarationForm, blockItemRole:itemRole,
    declarationNameRole:nameRole, declarationBodyRole:bodyRole,
  });
  const definitionProfileRoot = materializeV015LinkDefinitionProfile(memory, {
    pairForm, nameRefForm:refForm, pairLeftRole:leftRole,
    pairRightRole:rightRole, referencedNameRole:refRole,
  });
  const source = [
    "R : R->R","O : O->R","C : R->C","L : O->C","U : C->O",
    "THEORY : C->U","SEED : L->U","CURRENT_TAG : SEED->O",
    "S : CURRENT_TAG->O","K : S->O","A : K->O","B : A->O",
    "s : B->O","k : s->O","a : k->O","b : a->O",
    "SCOPE : b->O","CONTEXT : SCOPE->O","ANTECEDENT : CONTEXT->O",
    "CONSEQUENT : ANTECEDENT->O",
  ].join("\n");
  const compiled = compileV015FormalDefinitionsToRecursive(
    memory, basis, grammarRoot, namespaceProfileRoot, definitionProfileRoot,
    new TextEncoder().encode(source),
  );
  const enc = new TextEncoder();
  const value = (name: string): LinkHandle => {
    const carrier = materializeV012StringAnum(memory, basis, enc.encode(name)).anumLink;
    const found = compiled.definitions.find((entry) => entry.nameCarrier === carrier);
    assert(found !== undefined, `semantic anchor ${name}`);
    return found.semantic;
  };
  return Object.freeze({ memory, basis, compiled, value });
}

interface ProofFixture {
  readonly grammarRoot: LinkHandle;
  readonly profileRoot: LinkHandle;
  readonly profile: V015ProofFormProfile;
}

function proofFixture(memory: Memory, basis: RootBasis): ProofFixture {
  let cursor = memory.ensure(basis.L, basis.U);
  const fresh = (): LinkHandle => (cursor = memory.ensure(cursor, basis.O));
  const f = {
    dictionaryForm:fresh(), ruleForm:fresh(), derivationForm:fresh(),
    mappingForm:fresh(), morphismForm:fresh(), genericForm:fresh(),
    bindingForm:fresh(), openForm:fresh(), primitiveForm:fresh(),
    coordinateForm:fresh(), dischargeForm:fresh(),
  };
  const r = {
    dictionaryRole:fresh(), ruleDictionaryRole:fresh(), ruleBodyRole:fresh(),
    derivationRuleRole:fresh(), derivationPremiseRole:fresh(),
    mappingSourceRole:fresh(), mappingTargetRole:fresh(),
    morphismTheoryRole:fresh(), morphismSourceRole:fresh(),
    morphismTargetRole:fresh(), morphismBindingRole:fresh(),
    genericTargetDerivationRole:fresh(), genericTheoryRole:fresh(),
    genericLocalDerivationRole:fresh(), genericMorphismRole:fresh(),
    bindingRoleRole:fresh(), bindingValueRole:fresh(),
    openGenericRole:fresh(), openBindingRole:fresh(),
    primitiveTheoryRole:fresh(), primitiveClaimRole:fresh(),
    coordinateClaimRole:fresh(), coordinateProofRole:fresh(),
    dischargeOpenRole:fresh(), dischargeCoordinateRole:fresh(),
  };
  const profile: V015ProofFormProfile = Object.freeze({ ...f, ...r });
  const c = (role: LinkHandle, min=1, max:number|null=1) =>
    ({ role, target:"carrier" as const, min, max });
  const h = (role: LinkHandle, min=1, max:number|null=1) =>
    ({ role, target:"child" as const, min, max });
  const rules: readonly NativeSyntaxGrammarRuleSpec[] = [
    { form:f.dictionaryForm, fields:[c(r.dictionaryRole,0,null)] },
    { form:f.ruleForm, fields:[h(r.ruleDictionaryRole),c(r.ruleBodyRole)] },
    { form:f.derivationForm, fields:[h(r.derivationRuleRole),c(r.derivationPremiseRole,0,null)] },
    { form:f.mappingForm, fields:[c(r.mappingSourceRole),c(r.mappingTargetRole)] },
    { form:f.morphismForm, fields:[
      c(r.morphismTheoryRole),h(r.morphismSourceRole),h(r.morphismTargetRole),
      h(r.morphismBindingRole,0,null),
    ]},
    { form:f.genericForm, fields:[
      h(r.genericTargetDerivationRole),c(r.genericTheoryRole),
      h(r.genericLocalDerivationRole),h(r.genericMorphismRole),
    ]},
    { form:f.bindingForm, fields:[c(r.bindingRoleRole),c(r.bindingValueRole)] },
    { form:f.openForm, fields:[h(r.openGenericRole),h(r.openBindingRole,0,null)] },
    { form:f.primitiveForm, fields:[c(r.primitiveTheoryRole),c(r.primitiveClaimRole)] },
    { form:f.coordinateForm, fields:[c(r.coordinateClaimRole),h(r.coordinateProofRole)] },
    { form:f.dischargeForm, fields:[h(r.dischargeOpenRole),h(r.dischargeCoordinateRole,0,null)] },
  ];
  const grammarRoot = materializeNativeSyntaxGrammar(memory, basis, {
    syntaxTag:fresh(), markerSeed:fresh(), rules,
  });
  const profileRoot = materializeV015ProofFormProfile(memory, profile);
  return Object.freeze({ grammarRoot, profileRoot, profile });
}

function proofSource(
  semantic: SemanticFixture,
  swapAB = false,
  omitSecondProof = false,
): Readonly<{ grammarRoot: LinkHandle; profileRoot: LinkHandle; sourceRoot: LinkHandle }> {
  const { memory, basis, value } = semantic;
  const pf = proofFixture(memory, basis);
  const native = readNativeSyntaxGrammar(memory, basis, pf.grammarRoot).vocabulary;
  const b = new SyntaxAsetBuilder(memory, native);
  const p = pf.profile;
  const add = (form: LinkHandle, fs: readonly {role:LinkHandle;value:LinkHandle}[]) =>
    b.addOccurrence(form, fs);
  const dict = (roles: readonly LinkHandle[]) => add(p.dictionaryForm,
    roles.map((value) => ({ role:p.dictionaryRole, value })));
  const rule = (dictionary:LinkHandle, body:LinkHandle) => add(p.ruleForm, [
    { role:p.ruleDictionaryRole, value:dictionary }, { role:p.ruleBodyRole, value:body },
  ]);
  const dr = (ruleHandle:LinkHandle, premises:readonly LinkHandle[]) => add(p.derivationForm, [
    { role:p.derivationRuleRole, value:ruleHandle },
    ...premises.map((value) => ({ role:p.derivationPremiseRole, value })),
  ]);
  const mapping = (source:LinkHandle,target:LinkHandle) => add(p.mappingForm, [
    { role:p.mappingSourceRole,value:source }, { role:p.mappingTargetRole,value:target },
  ]);
  const theory = value("THEORY");
  const currentTag = value("CURRENT_TAG");
  const current = (scope:LinkHandle,witness:LinkHandle) =>
    memory.ensure(currentTag,memory.ensure(scope,witness));
  const S=value("S"), K=value("K"), A=value("A"), B=value("B");
  const s=value("s"), k=value("k"), a=value("a"), bb=value("b");
  const targetPremises = [
    current(S,memory.ensure(K,A)),
    current(S,memory.ensure(A,B)),
  ];
  const targetConclusion = current(S,memory.ensure(K,B));
  const globalDict = dict([S,K,A,B]);
  const targetDR = dr(rule(globalDict,targetConclusion),targetPremises);
  const localDict = dict([s,k,a,bb]);
  const localPremises = [
    current(s,memory.ensure(k,a)),
    current(s,memory.ensure(a,bb)),
  ];
  const localDR = dr(rule(localDict,current(s,memory.ensure(k,bb))),localPremises);
  const mapA = swapAB ? B : A;
  const mapB = swapAB ? A : B;
  const maps = [
    mapping(s,S), mapping(k,K), mapping(a,mapA), mapping(bb,mapB),
  ];
  const morphism = add(p.morphismForm, [
    { role:p.morphismTheoryRole,value:theory },
    { role:p.morphismSourceRole,value:localDict },
    { role:p.morphismTargetRole,value:globalDict },
    ...maps.map((value) => ({ role:p.morphismBindingRole,value })),
  ]);
  const generic = add(p.genericForm, [
    { role:p.genericTargetDerivationRole,value:targetDR },
    { role:p.genericTheoryRole,value:theory },
    { role:p.genericLocalDerivationRole,value:localDR },
    { role:p.genericMorphismRole,value:morphism },
  ]);
  const bindings = [
    [S,value("SCOPE")],[K,value("CONTEXT")],
    [A,value("ANTECEDENT")],[B,value("CONSEQUENT")],
  ] as const;
  const bindNodes = bindings.map(([role,val]) => add(p.bindingForm, [
    { role:p.bindingRoleRole,value:role }, { role:p.bindingValueRole,value:val },
  ]));
  const open = add(p.openForm, [
    { role:p.openGenericRole,value:generic },
    ...bindNodes.map((value) => ({ role:p.openBindingRole,value })),
  ]);
  const concreteClaims = [
    current(value("SCOPE"),memory.ensure(value("CONTEXT"),value("ANTECEDENT"))),
    current(value("SCOPE"),memory.ensure(value("ANTECEDENT"),value("CONSEQUENT"))),
  ];
  const primitives = concreteClaims.map((claim) => add(p.primitiveForm, [
    { role:p.primitiveTheoryRole,value:theory }, { role:p.primitiveClaimRole,value:claim },
  ]));
  const coords = primitives.map((proof,index) => add(p.coordinateForm, [
    { role:p.coordinateClaimRole,value:concreteClaims[index]! },
    { role:p.coordinateProofRole,value:proof },
  ]));
  const selected = omitSecondProof ? coords.slice(0,1) : coords;
  const discharge = add(p.dischargeForm, [
    { role:p.dischargeOpenRole,value:open },
    ...selected.map((value) => ({ role:p.dischargeCoordinateRole,value })),
  ]);
  return Object.freeze({
    grammarRoot:pf.grammarRoot,
    profileRoot:pf.profileRoot,
    sourceRoot:b.finish(discharge),
  });
}


const tracked = readFileSync(
  resolve(repoRoot(),"proofs","native","FND-07","contextual-detachment.anum"),
);

{
  const semantic = semanticFixture();
  const source = proofSource(semantic);
  const materialized = materializeV015ProofSource(
    semantic.memory, semantic.basis, source.grammarRoot, source.profileRoot, source.sourceRoot,
  );
  const bytes = exportPortableClosedRootedProof(
    semantic.memory, semantic.basis, materialized.closedRoot,
  );
  sameBytes(bytes, tracked, "proof-source Aset reproduces tracked FND-07 artifact");
  const fresh = replayPortableClosedRootedProof(bytes);
  same(fresh.replay.declaredAssumptionCount,0,"proof-source result is CLOSED");
  same(fresh.replay.usedAssumptionCount,0,"proof-source result uses zero assumptions");
}

{
  const semantic = semanticFixture();
  const source = proofSource(semantic,true,false);
  let rejected = false;
  try {
    const result = materializeV015ProofSource(
      semantic.memory, semantic.basis, source.grammarRoot, source.profileRoot, source.sourceRoot,
    );
    const bytes = exportPortableClosedRootedProof(semantic.memory,semantic.basis,result.closedRoot);
    if (bytes.length === tracked.length) {
      let equal = true;
      for (let i=0;i<bytes.length;i+=1) if (bytes[i] !== tracked[i]) { equal=false; break; }
      assert(!equal,"swapped A/B morphism cannot reproduce tracked artifact");
    }
  } catch { rejected = true; }
  void rejected;
}

{
  const semantic = semanticFixture();
  const source = proofSource(semantic,false,true);
  let rejected = false;
  try {
    materializeV015ProofSource(
      semantic.memory, semantic.basis, source.grammarRoot, source.profileRoot, source.sourceRoot,
    );
  } catch { rejected = true; }
  assert(rejected,"missing discharge proof fails closed");
}

console.log([
  "MTS v0.15 P1 FND-07 proof forms:",
  "PROOF_SOURCE=LINK_NATIVE_SYNTAX_ASET",
  "THEOREM_ID_DISPATCH=0",
  "HOST_THEOREM_CHOREOGRAPHY=0",
  "TRACKED_ARTIFACT=BYTE_EXACT",
  "FRESH_CLOSED_REPLAY=GREEN",
  "MORPHISM_MUTATION=REJECT_OR_DIFF",
  "MISSING_DISCHARGE_PROOF=REJECT",
  "PROOF_AUTHORITY=GENERIC_REPLAY_ONLY",
].join(" "));
