import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Memory, ensureRootBasis, type LinkHandle, type RootBasis } from "../src/memory.js";
import {
  materializeNativeSyntaxGrammar,
  type NativeSyntaxGrammarRuleSpec,
} from "../src/native-syntax-grammar.js";
import { materializeSourceNamespaceProfile } from "../src/source-namespace.js";
import {
  materializeV015LinkDefinitionProfile,
  materializeV015LinkDefinitions,
} from "../src/v015-link-definition.js";
import {
  decodeV015FormalDefinitions,
  decodeV015FormalSourceAsetJson,
  encodeV015FormalSourceAsetJson,
} from "../src/v015-formal-decoder.js";
import { materializeV012StringAnum } from "../src/v012-string-anum.js";
import { readExactSequence } from "../src/exact-sequence.js";
import { materializeV015ProofDenotation } from "../src/v015-proof-source.js";
import {
  exportPortableClosedRootedProof,
  replayPortableClosedRootedProof,
} from "../src/portable-closed-rooted-proof.js";
import { replayStructuralRootedProofAset } from "../src/rooted-proof-aset.js";

function assert(v: unknown, m: string): asserts v {
  if (!v) throw new Error(`v0.15 P2 ordinary FORMAL proof: ${m}`);
}
function same<T>(a:T,b:T,m:string):void {
  assert(Object.is(a,b),`${m}: ${String(a)} !== ${String(b)}`);
}
function sameBytes(a:Uint8Array,b:Uint8Array,m:string):void {
  same(a.length,b.length,`${m}: length`);
  for(let i=0;i<a.length;i+=1) same(a[i],b[i],`${m}: byte ${i}`);
}
function differentOrReject(effect:()=>Uint8Array,golden:Uint8Array,m:string):void {
  try {
    const actual=effect();
    if(actual.length!==golden.length) return;
    for(let i=0;i<actual.length;i+=1) if(actual[i]!==golden[i]) return;
    throw new Error(`v0.15 P2 ordinary FORMAL proof: ${m}: unexpectedly golden`);
  } catch (error) {
    if(error instanceof Error && error.message.includes("unexpectedly golden")) throw error;
  }
}
function repoRoot():string {
  const roots=[resolve(process.cwd(),".."),process.cwd()];
  const root=roots.find(x=>existsSync(resolve(x,"proofs/native/FND-07/contextual-detachment.anum")));
  assert(root!==undefined,"repository root");
  return root;
}

interface Fixture {
  memory:Memory; basis:RootBasis; grammarRoot:LinkHandle;
  namespaceProfileRoot:LinkHandle; definitionProfileRoot:LinkHandle;
}
function fixture():Fixture {
  const memory=new Memory(),basis=ensureRootBasis(memory);
  let c=memory.ensure(basis.U,basis.L); const fresh=()=>c=memory.ensure(c,basis.C);
  const syntaxTag=fresh(),markerSeed=fresh(),pairForm=fresh(),nameRefForm=fresh();
  const declarationForm=fresh(),blockForm=fresh(),sequenceForm=fresh();
  const pairLeftRole=fresh(),pairRightRole=fresh(),referencedNameRole=fresh();
  const declarationNameRole=fresh(),declarationBodyRole=fresh(),blockItemRole=fresh(),sequenceItemRole=fresh();
  const rules:readonly NativeSyntaxGrammarRuleSpec[]=[
    {form:pairForm,fields:[
      {role:pairLeftRole,target:"child",min:1,max:1},
      {role:pairRightRole,target:"child",min:1,max:1},
    ]},
    {form:nameRefForm,fields:[{role:referencedNameRole,target:"carrier",min:1,max:1}]},
    {form:declarationForm,fields:[
      {role:declarationNameRole,target:"carrier",min:1,max:1},
      {role:declarationBodyRole,target:"child",min:1,max:1},
    ]},
    {form:blockForm,fields:[{role:blockItemRole,target:"child",min:0,max:null}]},
    {form:sequenceForm,fields:[{role:sequenceItemRole,target:"child",min:0,max:null}]},
  ];
  const grammarRoot=materializeNativeSyntaxGrammar(memory,basis,{syntaxTag,markerSeed,rules});
  const namespaceProfileRoot=materializeSourceNamespaceProfile(memory,{
    blockForm,declarationForm,blockItemRole,declarationNameRole,declarationBodyRole,
  });
  const definitionProfileRoot=materializeV015LinkDefinitionProfile(memory,{
    pairForm,nameRefForm,pairLeftRole,pairRightRole,referencedNameRole,
    sequenceForm,sequenceItemRole,
  });
  return {memory,basis,grammarRoot,namespaceProfileRoot,definitionProfileRoot};
}

const enc=new TextEncoder();
const source=[
  "R : R->R","O : O->R","C : R->C","L : O->C","U : C->O",
  "THEORY : C->U","SEED : L->U","CURRENT_TAG : SEED->O",
  "S : CURRENT_TAG->O","K : S->O","A : K->O","B : A->O",
  "s : B->O","k : s->O","a : k->O","b : a->O",
  "SCOPE : b->O","CONTEXT : SCOPE->O","ANTECEDENT : CONTEXT->O","CONSEQUENT : ANTECEDENT->O",
  "KA : K->A","S_KA : S->KA","TARGET_P1 : CURRENT_TAG->S_KA",
  "AB : A->B","S_AB : S->AB","TARGET_P2 : CURRENT_TAG->S_AB",
  "KB : K->B","S_KB : S->KB","TARGET_CONCLUSION : CURRENT_TAG->S_KB",
  "ka : k->a","s_ka : s->ka","LOCAL_P1 : CURRENT_TAG->s_ka",
  "ab : a->b","s_ab : s->ab","LOCAL_P2 : CURRENT_TAG->s_ab",
  "kb : k->b","s_kb : s->kb","LOCAL_CONCLUSION : CURRENT_TAG->s_kb",
  "CA : CONTEXT->ANTECEDENT","SCOPE_CA : SCOPE->CA","CURRENT_TRUTH : CURRENT_TAG->SCOPE_CA",
  "AC : ANTECEDENT->CONSEQUENT","SCOPE_AC : SCOPE->AC","CURRENT_RULE : CURRENT_TAG->SCOPE_AC",
  "CC : CONTEXT->CONSEQUENT","SCOPE_CC : SCOPE->CC","CONCLUSION : CURRENT_TAG->SCOPE_CC",
  "PROFILE_SEED : U->L","DICT_TAG : PROFILE_SEED->O","RULE_TAG : DICT_TAG->O",
  "DR_TAG : RULE_TAG->O","MAP_TAG : DR_TAG->O","MORPH_TAG : MAP_TAG->O",
  "GENERIC_TAG : MORPH_TAG->O","BIND_TAG : GENERIC_TAG->O","OPEN_TAG : BIND_TAG->O",
  "PRIM_TAG : OPEN_TAG->O","COORD_TAG : PRIM_TAG->O","DISCHARGE_TAG : COORD_TAG->O",
  "PROOF_PROFILE : [DICT_TAG,RULE_TAG,DR_TAG,MAP_TAG,MORPH_TAG,GENERIC_TAG,BIND_TAG,OPEN_TAG,PRIM_TAG,COORD_TAG,DISCHARGE_TAG]",
  "GLOBAL_ROLES : [S,K,A,B]","GLOBAL_DICT : DICT_TAG->GLOBAL_ROLES",
  "TARGET_RULE_DATA : [GLOBAL_DICT,TARGET_CONCLUSION]","TARGET_RULE : RULE_TAG->TARGET_RULE_DATA",
  "TARGET_PREMISES : [TARGET_P1,TARGET_P2]","TARGET_DR_DATA : [TARGET_RULE,TARGET_PREMISES]","TARGET_DR : DR_TAG->TARGET_DR_DATA",
  "LOCAL_ROLES : [s,k,a,b]","LOCAL_DICT : DICT_TAG->LOCAL_ROLES",
  "LOCAL_RULE_DATA : [LOCAL_DICT,LOCAL_CONCLUSION]","LOCAL_RULE : RULE_TAG->LOCAL_RULE_DATA",
  "LOCAL_PREMISES : [LOCAL_P1,LOCAL_P2]","LOCAL_DR_DATA : [LOCAL_RULE,LOCAL_PREMISES]","LOCAL_DR : DR_TAG->LOCAL_DR_DATA",
  "MAP_S_DATA : [s,S]","MAP_S : MAP_TAG->MAP_S_DATA","MAP_K_DATA : [k,K]","MAP_K : MAP_TAG->MAP_K_DATA",
  "MAP_A_DATA : [a,A]","MAP_A : MAP_TAG->MAP_A_DATA","MAP_B_DATA : [b,B]","MAP_B : MAP_TAG->MAP_B_DATA",
  "MAPPINGS : [MAP_S,MAP_K,MAP_A,MAP_B]",
  "MORPH_DATA : [THEORY,LOCAL_DICT,GLOBAL_DICT,MAPPINGS]","MORPH : MORPH_TAG->MORPH_DATA",
  "GENERIC_DATA : [TARGET_DR,THEORY,LOCAL_DR,MORPH]","GENERIC : GENERIC_TAG->GENERIC_DATA",
  "BIND_S_DATA : [S,SCOPE]","BIND_S : BIND_TAG->BIND_S_DATA","BIND_K_DATA : [K,CONTEXT]","BIND_K : BIND_TAG->BIND_K_DATA",
  "BIND_A_DATA : [A,ANTECEDENT]","BIND_A : BIND_TAG->BIND_A_DATA","BIND_B_DATA : [B,CONSEQUENT]","BIND_B : BIND_TAG->BIND_B_DATA",
  "BINDINGS : [BIND_S,BIND_K,BIND_A,BIND_B]","OPEN_DATA : [GENERIC,BINDINGS]","OPEN_PROOF : OPEN_TAG->OPEN_DATA",
  "PRIM_TRUTH_DATA : [THEORY,CURRENT_TRUTH]","PRIM_TRUTH : PRIM_TAG->PRIM_TRUTH_DATA",
  "PRIM_RULE_DATA : [THEORY,CURRENT_RULE]","PRIM_RULE : PRIM_TAG->PRIM_RULE_DATA",
  "COORD_TRUTH_DATA : [CURRENT_TRUTH,PRIM_TRUTH]","COORD_TRUTH : COORD_TAG->COORD_TRUTH_DATA",
  "COORD_RULE_DATA : [CURRENT_RULE,PRIM_RULE]","COORD_RULE : COORD_TAG->COORD_RULE_DATA",
  "COORDS : [COORD_TRUTH,COORD_RULE]","DISCHARGE_DATA : [OPEN_PROOF,COORDS]","DISCHARGE : DISCHARGE_TAG->DISCHARGE_DATA",
  "ENTRY : [PROOF_PROFILE,DISCHARGE]",
].join("\n");

function resolveSource(text:string){
  const f=fixture();
  const decoded=decodeV015FormalDefinitions(
    f.memory,f.basis,f.grammarRoot,f.namespaceProfileRoot,f.definitionProfileRoot,enc.encode(text),
  );
  const read=materializeV015LinkDefinitions(
    f.memory,f.basis,f.grammarRoot,f.namespaceProfileRoot,f.definitionProfileRoot,decoded.sourceAset,
  );
  const carrier=(n:string)=>materializeV012StringAnum(f.memory,f.basis,enc.encode(n)).anumLink;
  const value=(n:string):LinkHandle=>{
    const d=read.definitions.find(x=>x.nameCarrier===carrier(n));
    assert(d!==undefined,`definition ${n}`); return d.value;
  };
  const entryDefinition=read.definitions[read.definitions.length-1];
  assert(entryDefinition!==undefined,"explicit proof entry declaration");
  const entryValues=readExactSequence(f.memory,entryDefinition.value).values;
  same(entryValues.length,2,"proof entry arity");
  const profileRoot=entryValues[0];
  const sourceRoot=entryValues[1];
  assert(profileRoot!==undefined && sourceRoot!==undefined,"proof entry coordinates");
  return {f,decoded,read,value,profileRoot,sourceRoot};
}
function artifact(text:string):Uint8Array {
  const {f,profileRoot,sourceRoot}=resolveSource(text);
  const proof=materializeV015ProofDenotation(f.memory,profileRoot,sourceRoot);
  const replay=replayStructuralRootedProofAset(f.memory,proof.closedRoot);
  same(replay.declaredAssumptionCount,0,"CLOSED declared assumptions");
  same(replay.usedAssumptionCount,0,"CLOSED used assumptions");
  return exportPortableClosedRootedProof(f.memory,f.basis,proof.closedRoot);
}

const golden=readFileSync(resolve(repoRoot(),"proofs/native/FND-07/contextual-detachment.anum"));
{
  const actual=artifact(source);
  sameBytes(actual,golden,"ordinary FORMAL proof reproduces tracked FND-07");
  const fresh=replayPortableClosedRootedProof(actual);
  same(fresh.replay.declaredAssumptionCount,0,"fresh CLOSED declared assumptions");
  same(fresh.replay.usedAssumptionCount,0,"fresh CLOSED used assumptions");
}
{
  const {f,decoded,value,profileRoot,sourceRoot}=resolveSource(source);
  const json=encodeV015FormalSourceAsetJson(
    f.memory,f.basis,f.grammarRoot,f.namespaceProfileRoot,f.definitionProfileRoot,decoded.sourceAset,
  );
  const round=decodeV015FormalSourceAsetJson(
    f.memory,f.basis,f.grammarRoot,f.namespaceProfileRoot,f.definitionProfileRoot,json,
  );
  same(round.sourceAset,decoded.sourceAset,"proof source JSON J1 exact source-Aset round-trip");
  const read=materializeV015LinkDefinitions(
    f.memory,f.basis,f.grammarRoot,f.namespaceProfileRoot,f.definitionProfileRoot,round.sourceAset,
  );
  const carrier=(n:string)=>materializeV012StringAnum(f.memory,f.basis,enc.encode(n)).anumLink;
  const val=(n:string):LinkHandle=>{
    const d=read.definitions.find(x=>x.nameCarrier===carrier(n)); assert(d!==undefined,`round ${n}`); return d.value;
  };
  const roundEntry=read.definitions[read.definitions.length-1];
  assert(roundEntry!==undefined,"JSON preserves explicit proof entry");
  const roundEntryValues=readExactSequence(f.memory,roundEntry.value).values;
  same(roundEntryValues[0],profileRoot,"JSON preserves structural proof profile coordinate");
  same(roundEntryValues[1],sourceRoot,"JSON preserves structural proof root coordinate");
  const proof=materializeV015ProofDenotation(
    f.memory,
    roundEntryValues[0]!,
    roundEntryValues[1]!,
  );
  sameBytes(exportPortableClosedRootedProof(f.memory,f.basis,proof.closedRoot),golden,"JSON proof source reproduces golden");
}
{
  const renamed=source
    .replaceAll("GLOBAL_","G_").replaceAll("TARGET_","TGT_").replaceAll("LOCAL_","LOC_")
    .replaceAll("MORPH","MU").replaceAll("GENERIC","GEN").replaceAll("BIND_","BD_")
    .replaceAll("OPEN_PROOF","OP").replaceAll("PRIM_","P_").replaceAll("COORD_","CRD_")
    .replaceAll("DISCHARGE","DSG").replaceAll("PROOF_PROFILE","PP")
    .replaceAll("CONCLUSION","Z").replaceAll("ENTRY","E");
  sameBytes(artifact(renamed),golden,"proof presentation renaming preserves artifact");
}
differentOrReject(
  ()=>artifact(source.replace("MAP_A_DATA : [a,A]","MAP_A_DATA : [a,B]").replace("MAP_B_DATA : [b,B]","MAP_B_DATA : [b,A]")),
  golden,"swapped A/B morphism",
);
differentOrReject(
  ()=>artifact(source.replace("GLOBAL_ROLES : [S,K,A,B]","GLOBAL_ROLES : [S,K,B,A]")),
  golden,"reordered global roles",
);
differentOrReject(
  ()=>artifact(source.replace("COORDS : [COORD_TRUTH,COORD_RULE]","COORDS : [COORD_TRUTH]")),
  golden,"missing discharge coordinate",
);
differentOrReject(
  ()=>artifact(source.replace("GLOBAL_ROLES : [S,K,A,B]","GLOBAL_ROLES : S->K")),
  golden,"ordinary Link cannot replace role ExactSequence",
);
{
  const production=readFileSync(resolve(repoRoot(),"ts/src/v015-proof-source.ts"),"utf8");
  assert(!production.includes("FND-07"),"materializer has no theorem-id dispatch");
  assert(!production.includes("TARGET_P1"),"materializer has no theorem-specific name dispatch");
}

console.log([
  "MTS v0.15 P2 ordinary FORMAL proof:",
  "SURFACE=PAIR_PLUS_EXACT_SEQUENCE_ONLY",
  "PROOF_KEYWORDS=0",
  "PROFILE=FORMAL_EXACT_SEQUENCE",
  "TRACKED_FND07_ARTIFACT=BYTE_EXACT",
  "JSON_J1_PROOF_SOURCE=BYTE_EXACT",
  "RENAMING_INVARIANCE=GREEN",
  "MORPHISM_MUTATION=REJECT_OR_DIFF",
  "MISSING_COORDINATE=REJECT_OR_DIFF",
  "PAIR_NE_ROLE_SEQUENCE=GREEN",
  "THEOREM_ID_DISPATCH=0",
  "PROOF_AUTHORITY=GENERIC_REPLAY_ONLY",
].join(" "));
