import { Memory, ensureRootBasis, type LinkHandle } from "../src/memory.js";
import { materializeNativeSyntaxGrammar, type NativeSyntaxGrammarRuleSpec } from "../src/native-syntax-grammar.js";
import { materializeSourceNamespaceProfile } from "../src/source-namespace.js";
import { materializeV015LinkDefinitionProfile, materializeV015LinkDefinitions } from "../src/v015-link-definition.js";
import { decodeV015FormalDefinitions } from "../src/v015-formal-decoder.js";
import {
  V015_FORMAL_JSON_J1_SCHEMA, V015FormalJsonError,
  decodeV015FormalSourceAsetJson, encodeV015FormalSourceAsetJson,
} from "../src/v015-formal-decoder.js";
import { materializeExactSequence } from "../src/exact-sequence.js";
import { materializeV012StringAnum } from "../src/v012-string-anum.js";
import {
  admitStructuralRule, defineStructuralInterpreter,
  defineStructuralRoleDictionary, defineStructuralRule,
} from "../src/structural-rule.js";
import {
  V013CurrentScopeCursor, defineV013WorkingScope, reactV013StructuralScope,
} from "../src/v013-structural-execution.js";

function assert(v: unknown, m: string): asserts v { if (!v) throw new Error(`v0.15 B9 JSON J1: ${m}`); }
function same<T>(a:T,b:T,m:string):void { assert(Object.is(a,b),`${m}: ${String(a)} !== ${String(b)}`); }
function bytes(a:Uint8Array,b:Uint8Array,m:string):void { same(a.length,b.length,`${m} length`); for(let i=0;i<a.length;i+=1)same(a[i],b[i],`${m} byte ${i}`); }
function reject(f:()=>unknown, code:V015FormalJsonError["code"], m:string):void {
  let hit=false; try{f();}catch(e){assert(e instanceof V015FormalJsonError,`${m} error type`);same(e.code,code,m);hit=true;} assert(hit,`${m} rejects`);
}

function fixture(){
  const memory=new Memory(), basis=ensureRootBasis(memory);
  let cursor=memory.ensure(basis.U,basis.L); const fresh=()=>cursor=memory.ensure(cursor,basis.C);
  const syntaxTag=fresh(),markerSeed=fresh(),pairForm=fresh(),nameRefForm=fresh(),declarationForm=fresh(),blockForm=fresh(),sequenceForm=fresh();
  const pairLeftRole=fresh(),pairRightRole=fresh(),referencedNameRole=fresh(),declarationNameRole=fresh(),declarationBodyRole=fresh(),blockItemRole=fresh(),sequenceItemRole=fresh();
  const rules:readonly NativeSyntaxGrammarRuleSpec[]=[
    {form:pairForm,fields:[{role:pairLeftRole,target:"child",min:1,max:1},{role:pairRightRole,target:"child",min:1,max:1}]},
    {form:nameRefForm,fields:[{role:referencedNameRole,target:"carrier",min:1,max:1}]},
    {form:declarationForm,fields:[{role:declarationNameRole,target:"carrier",min:1,max:1},{role:declarationBodyRole,target:"child",min:1,max:1}]},
    {form:blockForm,fields:[{role:blockItemRole,target:"child",min:0,max:null}]},
    {form:sequenceForm,fields:[{role:sequenceItemRole,target:"child",min:0,max:null}]},
  ];
  const grammarRoot=materializeNativeSyntaxGrammar(memory,basis,{syntaxTag,markerSeed,rules});
  const namespaceProfileRoot=materializeSourceNamespaceProfile(memory,{blockForm,declarationForm,blockItemRole,declarationNameRole,declarationBodyRole});
  const definitionProfileRoot=materializeV015LinkDefinitionProfile(memory,{pairForm,nameRefForm,pairLeftRole,pairRightRole,referencedNameRole,sequenceForm,sequenceItemRole});
  return {memory,basis,fresh,grammarRoot,namespaceProfileRoot,definitionProfileRoot};
}
const enc=new TextEncoder(), dec=new TextDecoder();
const source=[
  "R : R->R","O : O->R","C : R->C","L : O->C","U : C->O","T : O->C","F : C->O",
  "ARGS_F : [F]","ARGS_T : [T]","ARGS_FT : [F,T]","ARGS_TT : [T,T]","OUT_F : [F]","OUT_T : [T]","LINK_FT : F->T",
  "AND_SEED : R->L","AND : AND_SEED->O","OR_SEED : R->U","OR : OR_SEED->O","NOT_SEED : U->R","NOT : NOT_SEED->O",
  "DICT : AND->OR","GRAM : NOT->AND","THEORY : DICT->GRAM","GT : GRAM->THEORY","INTERP : DICT->GT",
].join("\n");

{
  const f=fixture();
  const text=decodeV015FormalDefinitions(f.memory,f.basis,f.grammarRoot,f.namespaceProfileRoot,f.definitionProfileRoot,enc.encode(source));
  const canonical=encodeV015FormalSourceAsetJson(f.memory,f.basis,f.grammarRoot,f.namespaceProfileRoot,f.definitionProfileRoot,text.sourceAset);
  const round=decodeV015FormalSourceAsetJson(f.memory,f.basis,f.grammarRoot,f.namespaceProfileRoot,f.definitionProfileRoot,canonical);
  same(round.sourceAset,text.sourceAset,"JSON round-trip exact native source Aset");
  bytes(round.canonicalJson,canonical,"canonical JSON byte round-trip");
  const canonicalText=dec.decode(canonical);
  const entriesFirst=canonicalText.replace(
    `{"schema":"${V015_FORMAL_JSON_J1_SCHEMA}","entries":`,
    `{"entries":`,
  );
  assert(entriesFirst.endsWith("]}\n"),"canonical JSON expected suffix");
  const swapped=enc.encode(
    entriesFirst.slice(0,-3) +
    `],"schema":"${V015_FORMAL_JSON_J1_SCHEMA}"}\n`,
  );
  const reordered=decodeV015FormalSourceAsetJson(f.memory,f.basis,f.grammarRoot,f.namespaceProfileRoot,f.definitionProfileRoot,swapped);
  same(reordered.sourceAset,text.sourceAset,"JSON object key order is not source authority");
  bytes(reordered.canonicalJson,canonical,"reordered object canonicalizes");

  const resolved=materializeV015LinkDefinitions(f.memory,f.basis,f.grammarRoot,f.namespaceProfileRoot,f.definitionProfileRoot,round.sourceAset);
  const carrier=(n:string)=>materializeV012StringAnum(f.memory,f.basis,enc.encode(n)).anumLink;
  const value=(n:string):LinkHandle=>{
    const x=resolved.definitions.find(d=>d.nameCarrier===carrier(n)); assert(x!==undefined,`resolved ${n}`); return x.value;
  };
  same(value("ARGS_FT"),materializeExactSequence(f.memory,[f.basis.U,f.basis.L]),"JSON ARGS_FT exact sequence");
  assert(value("ARGS_FT")!==value("LINK_FT"),"pair and sequence remain distinct after JSON");

  const interpreter=defineStructuralInterpreter(f.memory,value("DICT"),value("GRAM"),value("THEORY"));
  same(interpreter,value("INTERP"),"JSON-preserved interpreter topology");
  const install=(fn:LinkHandle,args:LinkHandle,out:LinkHandle)=>{
    const k=f.fresh(), before=f.memory.ensure(k,f.memory.ensure(f.basis.O,f.memory.ensure(fn,args))), after=f.memory.ensure(k,out);
    const dictionary=defineStructuralRoleDictionary(f.memory,[k]);
    const rule=defineStructuralRule(f.memory,dictionary,f.memory.ensure(before,materializeExactSequence(f.memory,[after])));
    const admission=admitStructuralRule(f.memory,value("THEORY"),rule); f.memory.ensure(f.basis.O,admission);
  };
  install(value("AND"),value("ARGS_TT"),value("OUT_T"));
  install(value("OR"),value("ARGS_FT"),value("OUT_T"));
  install(value("NOT"),value("ARGS_F"),value("OUT_T"));
  const run=(fn:LinkHandle,args:LinkHandle,out:LinkHandle,label:string)=>{
    const caller=f.fresh(), initial=f.memory.ensure(caller,f.memory.ensure(f.basis.O,f.memory.ensure(fn,args)));
    const cursor=new V013CurrentScopeCursor(f.memory,defineV013WorkingScope(f.memory,f.fresh(),interpreter,[initial]));
    const reaction=reactV013StructuralScope(f.memory,cursor,f.fresh());
    same(reaction.handoffCount,1,`${label} handoff`); same(cursor.members()[0],f.memory.ensure(caller,out),`${label} result`);
  };
  run(value("AND"),value("ARGS_TT"),value("OUT_T"),"AND(T,T)");
  run(value("OR"),value("ARGS_FT"),value("OUT_T"),"OR(F,T)");
  run(value("NOT"),value("ARGS_F"),value("OUT_T"),"NOT(F)");
}

{
  const f=fixture(), d=(s:string)=>decodeV015FormalSourceAsetJson(f.memory,f.basis,f.grammarRoot,f.namespaceProfileRoot,f.definitionProfileRoot,enc.encode(s));
  reject(()=>d(`{"schema":"${V015_FORMAL_JSON_J1_SCHEMA}","\\u0073chema":"${V015_FORMAL_JSON_J1_SCHEMA}","entries":[]}`),"duplicate-key","escaped duplicate key");
  reject(()=>d(`{"schema":"wrong","entries":[]}`),"unsupported-profile","wrong schema");
  reject(()=>d(`{"schema":"${V015_FORMAL_JSON_J1_SCHEMA}","entries":[],"extra":0}`),"invalid-shape","unknown field");
  reject(()=>d(`{"schema":"${V015_FORMAL_JSON_J1_SCHEMA}","entries":[{"name":"A","value":{"pair":["A","A"]}},{"name":"A","value":{"pair":["A","A"]}}]}`),"duplicate-local-name","duplicate local name");
  reject(()=>d(`{"schema":"${V015_FORMAL_JSON_J1_SCHEMA}","entries":[{"name":"A","value":null}]}`),"invalid-shape","null has no J1 semantics");
}

console.log("MTS v0.15 B9 JSON J1: SOURCE_ASET_ROUNDTRIP=EXACT DUPLICATE_KEYS=REJECT CANONICAL_BYTES=STABLE PAIR_NE_SEQUENCE=GREEN AMEMORY_BOOLEAN_EXECUTION=GREEN");
