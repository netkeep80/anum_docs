import {
  Memory, ensureRootBasis, type LinkHandle, type RootBasis,
} from "../src/memory.js";
import {
  materializeNativeSyntaxGrammar, type NativeSyntaxGrammarRuleSpec,
} from "../src/native-syntax-grammar.js";
import { materializeSourceNamespaceProfile } from "../src/source-namespace.js";
import {
  materializeV015LinkDefinitionProfile, materializeV015LinkDefinitions,
} from "../src/v015-link-definition.js";
import {
  V015_FORMAL_JSON_J2_SCHEMA, V015_FORMAL_JSON_J3_SCHEMA,
  V015FormalDecodeError, V015FormalJsonError,
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
  if (!v) throw new Error(`v0.15 B11 equality construction: ${m}`);
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
function rejectJson(
  effect:()=>unknown,
  code:V015FormalJsonError["code"],
  label:string,
):void {
  let hit=false;
  try{effect();}catch(error){
    assert(error instanceof V015FormalJsonError,`${label}: JSON error type`);
    same(error.code,code,label);
    hit=true;
  }
  assert(hit,`${label}: rejected`);
}

interface Fixture {
  readonly memory:Memory; readonly basis:RootBasis; readonly fresh:()=>LinkHandle;
  readonly grammarRoot:LinkHandle; readonly namespaceProfileRoot:LinkHandle;
  readonly definitionProfileRoot:LinkHandle;
}
function fixture(noise=0):Fixture {
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
    {form:equalityForm,fields:[
      {role:equalityLeftRole,target:"child",min:1,max:1},
      {role:equalityRightRole,target:"child",min:1,max:1},
    ]},
  ];
  const grammarRoot=materializeNativeSyntaxGrammar(memory,basis,{syntaxTag,markerSeed,rules});
  const namespaceProfileRoot=materializeSourceNamespaceProfile(memory,{blockForm,declarationForm,blockItemRole,declarationNameRole,declarationBodyRole});
  const definitionProfileRoot=materializeV015LinkDefinitionProfile(memory,{
    pairForm,nameRefForm,pairLeftRole,pairRightRole,referencedNameRole,
    sequenceForm,sequenceItemRole,equalityForm,equalityLeftRole,equalityRightRole,
  });
  return {memory,basis,fresh,grammarRoot,namespaceProfileRoot,definitionProfileRoot};
}

const enc=new TextEncoder(), dec=new TextDecoder();
const source=[
  "R : R->R","O : O->R","C : R->C","L : O->C","U : C->O",
  "EQ_R : R=R(R)","EQ_O : O=O(R)","EQ_C : C=R(C)",
  "EQ_L : L=O(C)","EQ_U : U=C(O)","EQ_FALSE : L=C(O)",
  "EQ_PAIR_PAIR : R(R)=R(R)",
  "ARGS_EQ_R : [EQ_R]","ARGS_EQ_FALSE : [EQ_FALSE]",
  "ARGS_EQ_RF : [EQ_R,EQ_FALSE]","OUT_U : [U]","OUT_L : [L]",
  "AND_SEED : R->L","AND : AND_SEED->O",
  "NOT_SEED : U->R","NOT : NOT_SEED->O",
  "DICT : AND->NOT","GRAM : NOT->AND","THEORY : DICT->GRAM",
  "GT : GRAM->THEORY","INTERP : DICT->GT",
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
  const rule=defineStructuralRule(
    f.memory,dict,f.memory.ensure(before,materializeExactSequence(f.memory,[after])),
  );
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
  for(const name of ["EQ_R","EQ_O","EQ_C","EQ_L","EQ_U","EQ_PAIR_NAME","EQ_PAIR_PAIR"]) {
    same(value(f,r,name),f.basis.L,`${name} returns exact L`);
  }
  same(value(f,r,"EQ_FALSE"),f.basis.U,"EQ_FALSE returns exact U");

  const json=encodeV015FormalSourceAsetJson(
    f.memory,f.basis,f.grammarRoot,f.namespaceProfileRoot,
    f.definitionProfileRoot,r.source.sourceAset,
  );
  const jsonText=dec.decode(json);
  assert(
    jsonText.includes(`"schema":"${V015_FORMAL_JSON_J3_SCHEMA}"`),
    "structured equality selects JSON J3",
  );
  assert(
    jsonText.includes('"equality":["R",{"pair":["R","R"]}]'),
    "J3 carries structured right equality operand",
  );
  assert(
    jsonText.includes('"equality":[{"pair":["R","R"]},{"pair":["R","R"]}]'),
    "J3 carries two structured equality operands",
  );
  const round=decodeV015FormalSourceAsetJson(
    f.memory,f.basis,f.grammarRoot,f.namespaceProfileRoot,
    f.definitionProfileRoot,json,
  );
  same(round.sourceAset,r.source.sourceAset,"J3 round-trip exact native source Aset");
  sameBytes(round.canonicalJson,json,"J3 canonical bytes");

  const resolved=materializeV015LinkDefinitions(
    f.memory,f.basis,f.grammarRoot,f.namespaceProfileRoot,
    f.definitionProfileRoot,round.sourceAset,
  );
  const eqR=resolved.definitions.find(x=>x.nameCarrier===carrier(f,"EQ_R"));
  const eqFalse=resolved.definitions.find(x=>x.nameCarrier===carrier(f,"EQ_FALSE"));
  assert(eqR!==undefined && eqFalse!==undefined,"J3 resolved equality definitions");
  same(eqR.value,f.basis.L,"J3 replay EQ_R exact L");
  same(eqFalse.value,f.basis.U,"J3 replay EQ_FALSE exact U");

  const theory=value(f,r,"THEORY");
  const interpreter=defineStructuralInterpreter(
    f.memory,value(f,r,"DICT"),value(f,r,"GRAM"),theory,
  );
  same(interpreter,value(f,r,"INTERP"),"interpreter topology");
  const NOT=value(f,r,"NOT"), AND=value(f,r,"AND");
  installGate(f,theory,NOT,value(f,r,"ARGS_EQ_R"),value(f,r,"OUT_U"));
  installGate(f,theory,NOT,value(f,r,"ARGS_EQ_FALSE"),value(f,r,"OUT_L"));
  installGate(f,theory,AND,value(f,r,"ARGS_EQ_RF"),value(f,r,"OUT_U"));
  runGate(f,interpreter,NOT,value(f,r,"ARGS_EQ_R"),value(f,r,"OUT_U"),"NOT(EQ_R)");
  runGate(f,interpreter,NOT,value(f,r,"ARGS_EQ_FALSE"),value(f,r,"OUT_L"),"NOT(EQ_FALSE)");
  runGate(f,interpreter,AND,value(f,r,"ARGS_EQ_RF"),value(f,r,"OUT_U"),"AND(EQ_R,EQ_FALSE)");
}

{
  const f=fixture();
  const j2Source=[
    "R : R->R","O : O->R","C : R->C","L : O->C","U : C->O",
    "EQ : R=O",
  ].join("\n");
  const r=compile(f,j2Source);
  const json=encodeV015FormalSourceAsetJson(
    f.memory,f.basis,f.grammarRoot,f.namespaceProfileRoot,
    f.definitionProfileRoot,r.source.sourceAset,
  );
  const expected=
    `{"schema":"${V015_FORMAL_JSON_J2_SCHEMA}","entries":[`+
    '{"name":"R","value":{"pair":["R","R"]}},'+
    '{"name":"O","value":{"pair":["O","R"]}},'+
    '{"name":"C","value":{"pair":["R","C"]}},'+
    '{"name":"L","value":{"pair":["O","C"]}},'+
    '{"name":"U","value":{"pair":["C","O"]}},'+
    '{"name":"EQ","value":{"equality":["R","O"]}}]}\n';
  same(dec.decode(json),expected,"J2 canonical bytes unchanged");
  const round=decodeV015FormalSourceAsetJson(
    f.memory,f.basis,f.grammarRoot,f.namespaceProfileRoot,
    f.definitionProfileRoot,json,
  );
  same(round.sourceAset,r.source.sourceAset,"J2 still decodes exact source Aset");
  sameBytes(round.canonicalJson,json,"J2 canonical round-trip");

  const illegalJ2=enc.encode(
    `{"schema":"${V015_FORMAL_JSON_J2_SCHEMA}","entries":[`+
    '{"name":"X","value":{"equality":["R",{"pair":["R","R"]}]}}]}\n',
  );
  rejectJson(
    ()=>decodeV015FormalSourceAsetJson(
      f.memory,f.basis,f.grammarRoot,f.namespaceProfileRoot,
      f.definitionProfileRoot,illegalJ2,
    ),
    "invalid-shape",
    "J2 does not silently widen to structured equality",
  );
}

for(const bad of [
  "X : R=R->R","X : R->R=R","X : R=R=R",
  "X : R=(R->R)","X : (R->R)=R","X : R=R(R(R))","X : R≡R(R)",
]) {
  const f=fixture();
  rejectDecode(()=>compile(f,[
    "R : R->R","O : O->R","C : R->C","L : O->C","U : C->O",bad,
  ].join("\n")),bad);
}

{
  const a=fixture(0),b=fixture(23),ar=compile(a),br=compile(b);
  for(const name of ["EQ_R","EQ_O","EQ_C","EQ_L","EQ_U","EQ_FALSE"]) {
    sameBytes(entry(a,ar,name).wire,entry(b,br,name).wire,`${name} deterministic wire`);
  }
}

console.log([
  "MTS v0.15 B11 equality construction:",
  "ROOT_IDENTITIES=5/5",
  "FALSE_CASE=U",
  "PAIR_IS_CONSTRUCTION",
  "JSON_J2_BYTES=STABLE",
  "JSON_J3_ROUNDTRIP=EXACT",
  "MIXED_PRECEDENCE=REJECT",
  "NESTED_PAIR=REJECT",
  "AMEMORY_NOT_AND_DIFFERENTIAL=GREEN",
].join(" "));
