import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  Memory, ensureRootBasis, type LinkHandle, type RootBasis,
} from "../src/memory.js";
import {
  materializeNativeSyntaxGrammar, type NativeSyntaxGrammarRuleSpec,
} from "../src/native-syntax-grammar.js";
import { materializeSourceNamespaceProfile } from "../src/source-namespace.js";
import {
  evaluateV015LinkIdentityEquality, materializeV015LinkDefinitionProfile,
} from "../src/v015-link-definition.js";
import {
  V015_FORMAL_JSON_J2_SCHEMA, V015FormalDecodeError,
  decodeV015FormalSourceAsetJson, encodeV015FormalSourceAsetJson,
} from "../src/v015-formal-decoder.js";
import {
  compileV015FormalDefinitionsToRecursive,
  type V015FormalRecursiveCompileResult,
} from "../src/v015-formal-recursive-compiler.js";
import { materializeV012StringAnum } from "../src/v012-string-anum.js";
import { materializeExactSequence } from "../src/exact-sequence.js";
import {
  admitStructuralRule, defineStructuralInterpreter,
  defineStructuralRoleDictionary, defineStructuralRule,
} from "../src/structural-rule.js";
import {
  V013CurrentScopeCursor, defineV013WorkingScope, reactV013StructuralScope,
} from "../src/v013-structural-execution.js";

function assert(v: unknown, m: string): asserts v {
  if (!v) throw new Error(`v0.15 B10 identity equality: ${m}`);
}
function same<T>(a:T,b:T,m:string):void {
  assert(Object.is(a,b),`${m}: ${String(a)} !== ${String(b)}`);
}
function sameBytes(a:Uint8Array,b:Uint8Array,m:string):void {
  same(a.length,b.length,`${m} length`);
  for(let i=0;i<a.length;i+=1) same(a[i],b[i],`${m} byte ${i}`);
}
function rejectDecode(effect:()=>unknown,label:string):void {
  let hit=false;
  try{effect();}catch(error){
    assert(error instanceof V015FormalDecodeError,`${label}: decode error type`);
    hit=true;
  }
  assert(hit,`${label}: rejected`);
}

interface Fixture {
  readonly memory:Memory; readonly basis:RootBasis; readonly fresh:()=>LinkHandle;
  readonly grammarRoot:LinkHandle; readonly namespaceProfileRoot:LinkHandle;
  readonly definitionProfileRoot:LinkHandle;
}
function fixture(noise=0,equality=true):Fixture {
  const memory=new Memory(), basis=ensureRootBasis(memory);
  let cursor=memory.ensure(basis.U,basis.L);
  for(let i=0;i<noise;i+=1) cursor=memory.ensure(cursor,i%2===0?basis.O:basis.C);
  const fresh=()=>cursor=memory.ensure(cursor,basis.C);
  const syntaxTag=fresh(),markerSeed=fresh(),pairForm=fresh(),nameRefForm=fresh(),declarationForm=fresh(),blockForm=fresh(),sequenceForm=fresh(),equalityForm=fresh();
  const pairLeftRole=fresh(),pairRightRole=fresh(),referencedNameRole=fresh(),declarationNameRole=fresh(),declarationBodyRole=fresh(),blockItemRole=fresh(),sequenceItemRole=fresh(),equalityLeftRole=fresh(),equalityRightRole=fresh();
  const rules:NativeSyntaxGrammarRuleSpec[]=[
    {form:pairForm,fields:[{role:pairLeftRole,target:"child",min:1,max:1},{role:pairRightRole,target:"child",min:1,max:1}]},
    {form:nameRefForm,fields:[{role:referencedNameRole,target:"carrier",min:1,max:1}]},
    {form:declarationForm,fields:[{role:declarationNameRole,target:"carrier",min:1,max:1},{role:declarationBodyRole,target:"child",min:1,max:1}]},
    {form:blockForm,fields:[{role:blockItemRole,target:"child",min:0,max:null}]},
    {form:sequenceForm,fields:[{role:sequenceItemRole,target:"child",min:0,max:null}]},
  ];
  if(equality) rules.push({form:equalityForm,fields:[
    {role:equalityLeftRole,target:"child",min:1,max:1},
    {role:equalityRightRole,target:"child",min:1,max:1},
  ]});
  const grammarRoot=materializeNativeSyntaxGrammar(memory,basis,{syntaxTag,markerSeed,rules});
  const namespaceProfileRoot=materializeSourceNamespaceProfile(memory,{blockForm,declarationForm,blockItemRole,declarationNameRole,declarationBodyRole});
  const base={pairForm,nameRefForm,pairLeftRole,pairRightRole,referencedNameRole,sequenceForm,sequenceItemRole};
  const definitionProfileRoot=materializeV015LinkDefinitionProfile(memory,
    equality?{...base,equalityForm,equalityLeftRole,equalityRightRole}:base);
  return {memory,basis,fresh,grammarRoot,namespaceProfileRoot,definitionProfileRoot};
}

const enc=new TextEncoder(), dec=new TextDecoder();
const source=[
  "R : R->R","O : O->R","C : R->C","L : O->C","U : C->O",
  "T : O->C","F : C->O","ALIAS_R : R->R",
  "EQ_TRUE : R=R","EQ_ALIAS : R=ALIAS_R","EQ_FALSE : R=O",
  "ARGS_TRUE : [EQ_TRUE]","ARGS_FALSE : [EQ_FALSE]","ARGS_TF : [EQ_TRUE,EQ_FALSE]",
  "OUT_F : [F]","OUT_T : [T]",
  "AND_SEED : R->L","AND : AND_SEED->O","NOT_SEED : U->R","NOT : NOT_SEED->O",
  "DICT : AND->NOT","GRAM : NOT->AND","THEORY : DICT->GRAM","GT : GRAM->THEORY","INTERP : DICT->GT",
].join("\n");

function compile(f:Fixture,text=source):V015FormalRecursiveCompileResult {
  return compileV015FormalDefinitionsToRecursive(
    f.memory,f.basis,f.grammarRoot,f.namespaceProfileRoot,
    f.definitionProfileRoot,enc.encode(text),
  );
}
function carrier(f:Fixture,n:string):LinkHandle {
  return materializeV012StringAnum(f.memory,f.basis,enc.encode(n)).anumLink;
}
function entry(f:Fixture,r:V015FormalRecursiveCompileResult,n:string) {
  const key=carrier(f,n), found=r.definitions.find(x=>x.nameCarrier===key);
  assert(found!==undefined,`definition ${n}`); return found;
}
function value(f:Fixture,r:V015FormalRecursiveCompileResult,n:string):LinkHandle {
  return entry(f,r,n).semantic;
}

function installGate(
  f:Fixture,theory:LinkHandle,fn:LinkHandle,args:LinkHandle,out:LinkHandle,
):void {
  const callerRole=f.fresh();
  const before=f.memory.ensure(callerRole,f.memory.ensure(f.basis.O,f.memory.ensure(fn,args)));
  const after=f.memory.ensure(callerRole,out);
  const dict=defineStructuralRoleDictionary(f.memory,[callerRole]);
  const rule=defineStructuralRule(f.memory,dict,f.memory.ensure(before,materializeExactSequence(f.memory,[after])));
  const admission=admitStructuralRule(f.memory,theory,rule);
  f.memory.ensure(f.basis.O,admission);
}
function runGate(
  f:Fixture,interpreter:LinkHandle,fn:LinkHandle,args:LinkHandle,out:LinkHandle,label:string,
):void {
  const caller=f.fresh();
  const initial=f.memory.ensure(caller,f.memory.ensure(f.basis.O,f.memory.ensure(fn,args)));
  const cursor=new V013CurrentScopeCursor(
    f.memory,defineV013WorkingScope(f.memory,f.fresh(),interpreter,[initial]),
  );
  const step=reactV013StructuralScope(f.memory,cursor,f.fresh());
  same(step.handoffCount,1,`${label} handoff`);
  same(cursor.members()[0],f.memory.ensure(caller,out),`${label} result`);
}

{
  const f=fixture(), r=compile(f);
  const canonicalRootDefinitions = source.split("\n").slice(0, 5).join("\n");
  const foundationDoc = readFileSync(resolve(process.cwd(), "..", "docs/theory/Основания МТС.md"), "utf8");
  assert(
    foundationDoc.includes("```text\n" + canonicalRootDefinitions + "\n```"),
    "the current foundation document includes the exact native FORMAL root-basis source compiled by B10",
  );
  for (const [name,expected] of [
    ["R", "8"], ["O", "98"], ["C", "68"], ["L", "19868"], ["U", "16898"],
  ] as const) {
    same(dec.decode(entry(f,r,name).wire),expected, name + " root basis wire matches documented codec");
  }
  same(value(f,r,"EQ_TRUE"),f.basis.L,"R=R returns exact L");
  same(value(f,r,"EQ_ALIAS"),f.basis.L,"different names same Link return L");
  same(value(f,r,"EQ_FALSE"),f.basis.U,"distinct Links return exact U");
  same(dec.decode(entry(f,r,"EQ_TRUE").wire),"19868","equality true recursive wire is L");
  same(dec.decode(entry(f,r,"EQ_FALSE").wire),"16898","equality false recursive wire is U");

  const before=f.memory.linkCount;
  same(
    evaluateV015LinkIdentityEquality(f.memory,f.basis,f.basis.R,f.basis.R),
    f.basis.L,
    "direct equality true",
  );
  same(
    evaluateV015LinkIdentityEquality(f.memory,f.basis,f.basis.R,f.basis.O),
    f.basis.U,
    "direct equality false",
  );
  same(f.memory.linkCount,before,"equality evaluation creates no Links");

  const json=encodeV015FormalSourceAsetJson(
    f.memory,f.basis,f.grammarRoot,f.namespaceProfileRoot,
    f.definitionProfileRoot,r.source.sourceAset,
  );
  assert(
    dec.decode(json).includes(`"schema":"${V015_FORMAL_JSON_J2_SCHEMA}"`),
    "equality-enabled source uses JSON J2 schema",
  );
  assert(
    dec.decode(json).includes('"equality":["R","O"]'),
    "JSON carries equality source form",
  );
  const round=decodeV015FormalSourceAsetJson(
    f.memory,f.basis,f.grammarRoot,f.namespaceProfileRoot,
    f.definitionProfileRoot,json,
  );
  same(round.sourceAset,r.source.sourceAset,"JSON equality round-trip exact source Aset");
  sameBytes(round.canonicalJson,json,"JSON J2 canonical bytes");

  const theory=value(f,r,"THEORY");
  const interpreter=defineStructuralInterpreter(
    f.memory,value(f,r,"DICT"),value(f,r,"GRAM"),theory,
  );
  same(interpreter,value(f,r,"INTERP"),"interpreter topology");
  const NOT=value(f,r,"NOT"), AND=value(f,r,"AND");
  installGate(f,theory,NOT,value(f,r,"ARGS_TRUE"),value(f,r,"OUT_F"));
  installGate(f,theory,NOT,value(f,r,"ARGS_FALSE"),value(f,r,"OUT_T"));
  installGate(f,theory,AND,value(f,r,"ARGS_TF"),value(f,r,"OUT_F"));
  runGate(f,interpreter,NOT,value(f,r,"ARGS_TRUE"),value(f,r,"OUT_F"),"NOT(Eq(R,R))");
  runGate(f,interpreter,NOT,value(f,r,"ARGS_FALSE"),value(f,r,"OUT_T"),"NOT(Eq(R,O))");
  runGate(f,interpreter,AND,value(f,r,"ARGS_TF"),value(f,r,"OUT_F"),"AND(Eq true, Eq false)");
}

{
  const a=fixture(0),b=fixture(17),ar=compile(a),br=compile(b);
  for(const name of ["EQ_TRUE","EQ_ALIAS","EQ_FALSE"]) {
    sameBytes(entry(a,ar,name).wire,entry(b,br,name).wire,`${name} deterministic wire`);
  }
}

{
  const legacy=fixture(0,false);
  rejectDecode(()=>compile(legacy,[
    "R : R->R","O : O->R","C : R->C","L : O->C","U : C->O","EQ : R=R",
  ].join("\n")),"legacy profile rejects equality source");
}
for(const bad of [
  "X : R=R=R","X : R=O->C","X : R->O=C",
  "X : R=(O=C)","X : (R=O)=C","X : R≡R",
]) {
  const f=fixture();
  rejectDecode(()=>compile(f,[
    "R : R->R","O : O->R","C : R->C","L : O->C","U : C->O",bad,
  ].join("\n")),bad);
}

console.log([
  "MTS v0.15 B10 identity equality:",
  "EQUALS=LINK_IDENTITY",
  "TRUE_RESULT=L",
  "FALSE_RESULT=U",
  "ALIASES=GREEN",
  "READ_ONLY=GREEN",
  "EQUIV_SIGN=DEFERRED",
  "CHAIN_PRECEDENCE=REJECT",
  "JSON_J2_ROUNDTRIP=EXACT",
  "AMEMORY_NOT_AND_DIFFERENTIAL=GREEN",
  "PROOF_AUTHORITY=UNCHANGED",
].join(" "));
