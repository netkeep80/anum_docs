import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { readExactSequence } from "../src/exact-sequence.js";
import { Memory, ensureRootBasis, type LinkHandle, type RootBasis } from "../src/memory.js";
import {
  materializeNativeSyntaxGrammar, type NativeSyntaxGrammarRuleSpec,
} from "../src/native-syntax-grammar.js";
import { materializeSourceNamespaceProfile } from "../src/source-namespace.js";
import {
  readStructuralInterpreter, readStructuralRoleDictionary, readStructuralRule,
} from "../src/structural-rule.js";
import {
  V013CurrentScopeCursor, defineV013WorkingScope, reactV013StructuralScope,
} from "../src/v013-structural-execution.js";
import {
  decodeV015FormalSourceAsetJson, encodeV015FormalSourceAsetJson,
} from "../src/v015-formal-decoder.js";
import {
  compileV015FormalDefinitionsToRecursive,
  compileV015FormalSourceAsetToRecursive,
  type V015FormalSourceAsetRecursiveCompileResult,
} from "../src/v015-formal-recursive-compiler.js";
import { materializeV015LinkDefinitionProfile } from "../src/v015-link-definition.js";
import { materializeV012StringAnum } from "../src/v012-string-anum.js";

function assert(v: unknown, m: string): asserts v {
  if (!v) throw new Error("v0.15 full AND vertical: " + m);
}
function same<T>(a:T,b:T,m:string):void {
  assert(Object.is(a,b), `${m}: ${String(a)} !== ${String(b)}`);
}
function bytes(a:Uint8Array,b:Uint8Array,m:string):void {
  same(a.length,b.length,m+" length");
  for(let i=0;i<a.length;i+=1) same(a[i],b[i],m+" byte "+i);
}
function root():string {
  const candidates=[resolve(process.cwd(),".."),process.cwd()];
  const found=candidates.find(p=>existsSync(resolve(p,"formal/v0.15/executable/and.formal")));
  assert(found!==undefined,"repository root");
  return found;
}

interface Fixture {
  memory:Memory; basis:RootBasis; grammarRoot:LinkHandle;
  namespaceProfileRoot:LinkHandle; definitionProfileRoot:LinkHandle;
  fresh:()=>LinkHandle;
}
function fixture(noise=0):Fixture {
  const memory=new Memory(),basis=ensureRootBasis(memory);
  let c=memory.ensure(basis.U,basis.L);
  for(let i=0;i<noise;i+=1)c=memory.ensure(c,i%2===0?basis.O:basis.C);
  const fresh=()=>c=memory.ensure(c,basis.C);
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
  return {memory,basis,grammarRoot,namespaceProfileRoot,definitionProfileRoot,fresh};
}

const enc=new TextEncoder();
const sourceBytes=readFileSync(resolve(root(),"formal/v0.15/executable/and.formal"));
const jsonBytes=readFileSync(resolve(root(),"formal/v0.15/executable/and.json"));

function carrier(f:Fixture,name:string):LinkHandle {
  return materializeV012StringAnum(f.memory,f.basis,enc.encode(name)).anumLink;
}
function value(
  f:Fixture,
  r:V015FormalSourceAsetRecursiveCompileResult,
  name:string,
):LinkHandle {
  const key=carrier(f,name);
  const d=r.definitions.find(x=>x.nameCarrier===key);
  assert(d!==undefined,"definition "+name);
  return d.semantic;
}
function wire(
  f:Fixture,
  r:V015FormalSourceAsetRecursiveCompileResult,
  name:string,
):Uint8Array {
  const key=carrier(f,name);
  const d=r.definitions.find(x=>x.nameCarrier===key);
  assert(d!==undefined,"wire "+name);
  return d.wire;
}
function compileJson(f:Fixture,input:Uint8Array) {
  const decoded=decodeV015FormalSourceAsetJson(
    f.memory,f.basis,f.grammarRoot,f.namespaceProfileRoot,f.definitionProfileRoot,input,
  );
  const compiled=compileV015FormalSourceAsetToRecursive(
    f.memory,f.basis,f.grammarRoot,f.namespaceProfileRoot,f.definitionProfileRoot,decoded.sourceAset,
  );
  return {decoded,compiled};
}
function run(
  f:Fixture,
  interpreter:LinkHandle,
  current:LinkHandle,
):ReturnType<typeof reactV013StructuralScope> {
  const scope=defineV013WorkingScope(f.memory,f.fresh(),interpreter,[current]);
  const cursor=new V013CurrentScopeCursor(f.memory,scope);
  return reactV013StructuralScope(f.memory,cursor,f.fresh());
}
function launch(
  f:Fixture,
  r:V015FormalSourceAsetRecursiveCompileResult,
  handle:LinkHandle,
):readonly [LinkHandle,LinkHandle,LinkHandle] {
  const xs=readExactSequence(f.memory,handle).values;
  same(xs.length,3,"launch arity");
  return [xs[0]!,xs[1]!,xs[2]!];
}

const a=fixture();
const text=compileV015FormalDefinitionsToRecursive(
  a.memory,a.basis,a.grammarRoot,a.namespaceProfileRoot,a.definitionProfileRoot,sourceBytes,
);
const encoded=encodeV015FormalSourceAsetJson(
  a.memory,a.basis,a.grammarRoot,a.namespaceProfileRoot,a.definitionProfileRoot,text.source.sourceAset,
);
bytes(encoded,jsonBytes,"checked-in JSON is exact canonical projection");
const fromJson=compileJson(a,jsonBytes);
same(fromJson.decoded.sourceAset,text.source.sourceAset,"text/JSON exact same native source Aset");
same(fromJson.compiled.definitions.length,text.definitions.length,"text/JSON definition count");
for(const d of text.definitions){
  const j=fromJson.compiled.definitions.find(x=>x.nameCarrier===d.nameCarrier);
  assert(j!==undefined,"JSON definition wire exists");
  bytes(j.wire,d.wire,"JSON metacompiler wire parity");
}

const interp=value(a,fromJson.compiled,"INTERP");
const authority=readStructuralInterpreter(a.memory,interp);
same(authority.theory,value(a,fromJson.compiled,"THEORY"),"Interpreter selects source Theory");

for(const row of ["FF","FT","TF","TT"] as const){
  const dict=value(a,fromJson.compiled,`DICT_${row}`);
  const roles=readStructuralRoleDictionary(a.memory,dict).roles;
  same(roles.length,1,`${row} RoleDictionary arity`);
  same(roles[0],value(a,fromJson.compiled,`K_${row}`),`${row} role`);
  const rule=value(a,fromJson.compiled,`RULE_${row}`);
  const read=readStructuralRule(a.memory,rule);
  same(read.roleDictionary,dict,`${row} Rule dictionary`);
  same(read.body,value(a,fromJson.compiled,`BODY_${row}`),`${row} Rule body`);
  const admission=a.memory.poles(value(a,fromJson.compiled,`ADMIT_${row}`));
  same(admission.start,authority.theory,`${row} admission Theory`);
  same(admission.end,rule,`${row} admission Rule`);
  const index=a.memory.poles(value(a,fromJson.compiled,`INDEX_${row}`));
  same(index.start,a.basis.O,`${row} trigger key`);
  same(index.end,value(a,fromJson.compiled,`ADMIT_${row}`),`${row} trigger admission`);
}

const launches=readExactSequence(a.memory,value(a,fromJson.compiled,"ENTRY")).values;
same(launches.length,4,"AND launch count");
for(const l of launches){
  const [i,current,expected]=launch(a,fromJson.compiled,l);
  const reaction=run(a,i,current);
  same(reaction.rawRuleMatches,1,"exact one AND row matches");
  same(reaction.nextMembers.length,1,"one AND result");
  same(reaction.nextMembers[0],expected,"AND result from source-authored Rule");
}

{
  const [i,current,expected]=launch(
    a,fromJson.compiled,value(a,fromJson.compiled,"FOREIGN_LAUNCH_TT"),
  );
  const reaction=run(a,i,current);
  same(reaction.rawRuleMatches,0,"foreign Theory has no admitted row");
  same(reaction.nextMembers[0],expected,"foreign Theory preserves request");
}

const b=fixture(9);
const textB=compileV015FormalDefinitionsToRecursive(
  b.memory,b.basis,b.grammarRoot,b.namespaceProfileRoot,b.definitionProfileRoot,sourceBytes,
);
for(const name of ["INTERP","RULE_FF","RULE_FT","RULE_TF","RULE_TT","ENTRY"]){
  bytes(wire(a,text,name),wire(b,textB,name),"two-Memory recursive parity "+name);
}

{
  const raw=JSON.parse(new TextDecoder().decode(jsonBytes)) as {
    schema:string; entries:Array<{name:string;value:unknown}>;
  };
  raw.entries=raw.entries.filter(x=>x.name!=="INDEX_TT");
  const mutated=enc.encode(JSON.stringify(raw)+"\n");
  const f=fixture();
  const m=compileJson(f,mutated).compiled;
  const launches=readExactSequence(f.memory,value(f,m,"ENTRY")).values;
  const [i,current]=launch(f,m,launches[3]!);
  const reaction=run(f,i,current);
  same(reaction.rawRuleMatches,0,"removing JSON INDEX_TT removes TT semantics");
  same(reaction.nextMembers[0],current,"mutated TT request stays quiescent");
}

const recursivePackage = Object.freeze({
  schema: "mts-v015-recursive-execution-package/v0.1",
  links: ["INDEX_FF","INDEX_FT","INDEX_TF","INDEX_TT"].map(
    (name) => new TextDecoder().decode(wire(a,fromJson.compiled,name)),
  ),
  entry: new TextDecoder().decode(wire(a,fromJson.compiled,"ENTRY")),
  negativeEntry: new TextDecoder().decode(
    wire(a,fromJson.compiled,"FOREIGN_LAUNCH_TT"),
  ),
});
console.log("AMEMORY_RECURSIVE_PACKAGE="+JSON.stringify(recursivePackage));

console.log([
  "MTS_V015_FULL_AND=COMPONENT_GREEN",
  "FORMAL_SOURCE=TRACKED",
  "JSON_CANONICAL=EXACT",
  "JSON_TO_METACOMPILER=SHARED_SOURCE_ASET",
  "RECURSIVE_8961=DETERMINISTIC",
  "AND_ROWS=4/4",
  "HOST_AND_RULE_BUILDERS=0",
  "FOREIGN_THEORY=INERT",
  "JSON_TT_INDEX_MUTATION=CHANGES_BEHAVIOR",
  "TWO_MEMORY=GREEN",
  "REAL_AMEMORY_REPLAY=PENDING_amemory_482",
  "AUTHOR_REVIEW=PENDING"
].join(" "));
