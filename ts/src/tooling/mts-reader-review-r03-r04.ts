import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {parseDocument} from "yaml";
import {loadReaderR01R02} from "./mts-reader-review-r01-r02.js";

export const REVIEW_R03_R04_PATH=
 "requirements/mts-source/MTS-READER-REPRESENTATION-ARITHMETIC-R03-R04.yaml";
type Row=Record<string,unknown>;
export interface R03R04 {
 readonly representationMd:string;
 readonly arithmeticMd:string;
 readonly evidence:readonly {id:string;key:string;scope:string}[];
 readonly openObligations:readonly string[];
 readonly publication:"blocked";
}
const pin="c64b7e21340c6add248c8f380f3fef1292616ac6";
const paths={
 accepted:"contracts/mts-contract-v0.14.json",
 accepted_v015:"contracts/mts-contract-v0.15.json",
 source_spec:"docs/specs/Ачисла и сериализация.md",
 arithmetic_spec:"docs/theory/Система аксиом МТС.md",
 foundation_lean:"proofs/lean4/MtsFoundation.lean",
 foundation_rocq:"proofs/coq/MtsFoundation.v",
 q14_ts:"ts/test/v014-q14-versioned-interpreter.test.ts",
 exact_ts:"ts/src/exact-sequence.ts",
 add_ts:"ts/test/derived-nat-addition-proof.test.ts",
 order_ts:"ts/test/research-v014-order-replay-mul-scope.test.ts",
 nat_ts:"ts/test/derived-nat0-induction-closure.test.ts",
 formal_ts:"ts/test/v015-formal-exact-sequence-b7.test.ts"
} as const;
const representFields=["alphabet_ru","example_ru","theorem_ru","anum_ru",
 "q_ru","qexample_ru","transcode_ru","limits_ru"] as const;
const arithmeticFields=["nat_ru","successor_ru","count_ru","add_ru",
 "addexample_ru","order_ru","zero_ru","proof_ru","limits_ru"] as const;
const catalogue=[
 ["R03-CODE","accepted","recursivePrefixCodec","declared-contextual-finite-structure"],
 ["R03-ANUM","accepted","sequenceSemantics","rooted-sequential-carrier-not-link-grammar"],
 ["R03-Q14","accepted","q14Interpreter","strict-Q14-source-alphabet"],
 ["R03-Q13","accepted","legacyQ13Compatibility","explicit-denotation-preserving-transcode"],
 ["R03-FND05","foundation","FND_05_canonical_recursive_description_unique","Grounded-plus-A1-plus-decision"],
 ["R04-NAT","accepted","natTheory","selected-nat-evidence"],
 ["R04-DEGREE","accepted","connectivityDegreeTheory","distinct-degree-scale"],
 ["R04-COUNT","accepted","countTheory","exact-positional-sequence"],
 ["R04-ADD","accepted","addTheory","authorized-base-step"],
 ["R04-LE","accepted","orderTheory","from-canonical-add-proof"],
 ["R04-MUL","accepted","multiplicationScope","explicitly-deferred"]
] as const;
const negatives=["Q14_REJECT_1_0","Q13_REJECT_T_F","MIXED_SOURCE_REJECT",
 "Q_TRANSCODE_NOT_BYTES","RECURSIVE_CODE_NOT_ANUM","ROUNDTRIP_NOT_UNIVERSAL",
 "COUNT_NOT_FOLD","DEGREE_NOT_NAT","FORGED_ADD_REJECT","LE_REQUIRES_ADD",
 "SEMIRING_NOT_ACCEPTED"] as const;
const open=["GLOBAL_NON_GROUNDED_RECURSIVE_CODEC",
 "Q_CROSS_VERSION_BYTES_NOT_PRESERVED","NAT_ADD_LE_PAIRED_KERNEL_FORMALIZATION",
 "PRODUCTION_ARITHMETIC_REFINEMENT"] as const;
function guard(x:unknown,m:string):asserts x{if(!x)throw Error("review-R03-R04: "+m);}
function record(x:unknown,m:string):Row{guard(x!==null&&typeof x==="object"&&!Array.isArray(x),m+" map");return x as Row;}
function shape(x:Row,keys:readonly string[],m:string){
 guard(Object.keys(x).sort().join("|")===[...keys].sort().join("|"),m+" exact fields");
}
function equal(x:unknown,y:unknown,m:string){guard(JSON.stringify(x)===JSON.stringify(y),m);}
function text(x:unknown,m:string,min=130):string{guard(typeof x==="string"&&x.trim().length>=min,m+" full Russian proof-boundary explanation");return x;}
function read(root:string,p:string){return readFileSync(resolve(root,p),"utf8");}
function href(p:string){return "https://github.com/netkeep80/anum_docs/blob/"+pin+"/"+p;}
function acceptedEvidence(root:string){
 const c=record(JSON.parse(read(root,paths.accepted)),"accepted v0.14");
 guard(c.status==="accepted"&&c.accepted===true,"accepted baseline authority");
 const v15=record(JSON.parse(read(root,paths.accepted_v015)),"accepted v0.15");
 guard(v15.accepted===true,"current v0.15 accepted authority");
 const code=record(c.recursivePrefixCodec,"8/9/6/1");
 guard(code.grammar==="S ::= 8 | 9 S | 6 S | 1 S S","structural grammar changed");
 const seq=record(c.sequenceSemantics,"Anum");
 guard(seq.rootOrigin==="R"&&seq.exactSequenceDistinctFromFoldDenotation===true,"Anum vs ExactSequence vs fold");
 const q=record(c.q14Interpreter,"Q14"),legacy=record(c.legacyQ13Compatibility,"Q13");
 equal(q.alphabet,["[","]","T","F"],"Q14 source tokens");
 equal(legacy.alphabet,["[","]","1","0"],"Q13 source tokens");
 guard(q.acceptsLegacy10===false&&q.mixedSourceAllowed===false&&
  legacy.immutable===true&&legacy.acceptsTF===false&&
  legacy.explicitVersionedTranscodeAllowed===true&&
  legacy.transcodePreservesDenotation===true&&
  legacy.transcodePreservesExactStringIdentity===false,"Q version/denotation boundary");
 const nat=record(c.natTheory,"Nat");
 guard(nat.zero==="N0 = U"&&nat.successor==="Succ(N) = N ⟼ L"&&
  nat.oneEqualsDegreeOne===false&&nat.successorInjective===true&&
  nat.zeroNotSuccessor===true&&nat.uniquePredecessor===true,"Nat assumptions/scope");
 const degree=record(c.connectivityDegreeTheory,"Degree");
 guard(degree.one==="D1 = L"&&degree.successor==="NextDegree(D) = D ⟼ L",
  "Degree independent scale");
 const count=record(c.countTheory,"Count");
 guard(count.domain==="canonical ExactSequence"&&count.codomain==="Nat"&&
  count.empty==="N0"&&count.positionSensitive===true,"Count exact-positional");
 const add=record(c.addTheory,"Add"),le=record(c.orderTheory,"Le");
 guard(add.base==="Add(A,U,A)"&&
  add.canonicalProofAuthority==="selected BASE/STEP constructor authority"&&
  add.ambientAddIsAuthority===false&&le.canonicalAddProofRequired===true&&
  le.ambientAddCanWitnessLe===false,"canonical Add/Le proof-authority boundary");
 const mul=record(c.multiplicationScope,"deferred multiplication");
 guard(mul.status==="EXPLICITLY_DEFERRED"&&mul.requiredForV014Acceptance===false,
  "semiring scope cannot be promoted");
 const lean=read(root,paths.foundation_lean),rocq=read(root,paths.foundation_rocq);
 for(const symbol of ["FND_05_recursive_description_total","recursive_description_functional",
  "FND_05_canonical_recursive_description_unique"]){
  guard(lean.includes(symbol)&&rocq.includes(symbol),"missing paired proof: "+symbol);
 }
 const checks=[
  [paths.q14_ts,["q14Vectors","compatibilityVectors","rejectsQ14","rejectsQ13",
   "transcodeLegacyQ13ToV014Canonical","deserializeV014QStream"]],
  [paths.exact_ts,["materializeExactSequence","readExactSequence"]],
  [paths.add_ts,["expectDerivationReject","foreign theory","ruleKind"]],
  [paths.order_ts,["replayLe","leFromAdd","expectReplayReject"]],
  [paths.nat_ts,["least","successor"]],
  [paths.formal_ts,["PAIR_FT","DUP_FF","readExactSequence"]]
 ] as const;
 for(const [path,symbols] of checks){
  const source=read(root,path);
  for(const s of symbols)guard(source.toLowerCase().includes(s.toLowerCase()),
   "accepted executable regression missing "+path+"/"+s);
 }
 for(const path of [paths.source_spec,paths.arithmetic_spec])
  guard(read(root,path).length>4500,"accepted Russian source owner missing: "+path);
 return c;
}
export function parseReaderR03R04(raw:string,root:string):R03R04 {
 const earlier=loadReaderR01R02(root);
 guard(earlier.publication==="blocked"&&earlier.catalog.length===9,"R01/R02 scientific prerequisite");
 const ast=parseDocument(raw,{strict:true,uniqueKeys:true});
 guard(ast.errors.length===0&&ast.warnings.length===0,"invalid/duplicate YAML");
 const d=record(ast.toJS({maxAliasCount:0}),"R03/R04");
 shape(d,["schema","status","author_approval","publication","semantic_change",
  "accepted_main_sha","master_issue","upstream_review","review_packages",
  "source_paths","representation","arithmetic","evidence","negative_cases",
  "open_obligations"],"root");
 guard(d.schema==="mts-v015-review-representation-arithmetic-r03-r04/v0.1"&&
  d.status==="proposed"&&d.author_approval==="not-recorded"&&
  d.publication==="blocked"&&d.semantic_change===false&&
  d.accepted_main_sha===pin&&d.master_issue===2217&&
  d.upstream_review==="requirements/mts-source/MTS-READER-ANET-EXACTSEQUENCE-R01-R02.yaml",
  "no acceptance or publication authority");
 equal(d.review_packages,["R03","R04"],"R03/R04 package order");
 const refs=record(d.source_paths,"source references");
 shape(refs,Object.keys(paths),"source reference closure");
 for(const [k,p] of Object.entries(paths))guard(refs[k]===p,"source ref changed "+k);
 const accepted=acceptedEvidence(root);
 const rep=record(d.representation,"R03"),ar=record(d.arithmetic,"R04");
 shape(rep,["heading_ru",...representFields],"R03");
 shape(ar,["heading_ru",...arithmeticFields],"R04");
 const repTitle=text(rep.heading_ru,"R03 heading",45),arTitle=text(ar.heading_ru,"R04 heading",45);
 guard(repTitle.startsWith("R03.")&&arTitle.startsWith("R04."),"package first-use title");
 const ev=d.evidence;
 guard(Array.isArray(ev)&&ev.length===catalogue.length,"11 explicit source-to-claim bindings");
 const evidence=ev.map((rawRow,i)=>{
  const row=record(rawRow,"evidence"),v=catalogue[i]!;
  shape(row,["id","origin","key","scope"],"evidence schema");
  guard(row.id===v[0]&&row.origin===v[1]&&row.key===v[2]&&row.scope===v[3],
   "source/scope drift "+v[0]);
  if(v[1]==="accepted")guard(accepted[v[2]]!==undefined,"missing accepted contract key "+v[2]);
  return {id:v[0] as string,key:v[2] as string,scope:v[3] as string};
 });
 equal(d.negative_cases,negatives,"11 distinct negative tests/overclaim guards");
 equal(d.open_obligations,open,"4 unresolved proof gaps");
 const paragraphs=(r:Row,keys:readonly string[],section:string)=>
  keys.flatMap(k=>[text(r[k],section+"."+k,190),""]);
 const table=["| Пакет | Проверяемый источник | Точная область |",
  "|---|---|---|",...evidence.map(e=>
   "| "+e.id+" | "+e.key+" | "+e.scope+" |")];
 const repMd=["### "+repTitle,"",...paragraphs(rep,representFields,"R03"),
  "#### Принятые основания и пределы свидетельств","",
  ...table,"","[Канонический контракт v0.14]("+href(paths.accepted)+") · "+
  "[исторический Q13/Q14 исполняемый корпус]("+href(paths.q14_ts)+") · "+
  "[FND-05 Lean4]("+href(paths.foundation_lean)+") · [Rocq]("+href(paths.foundation_rocq)+").","",
  "**Отрицательные проверки:** "+negatives.slice(0,6).join("; ")+".",""].join("\n");
 const arMd=["### "+arTitle,"",...paragraphs(ar,arithmeticFields,"R04"),
  "#### Проверяемая граница арифметики","",
  "**Исполняемые свидетельства:** [Nat]("+href(paths.nat_ts)+") · "+
  "[Add]("+href(paths.add_ts)+") · [Le]("+href(paths.order_ts)+") · "+
  "[контракт V14-L6…L10]("+href(paths.accepted)+").","",
  "**Не объявлять формальным kernel-доказательством:** перечисленные арифметические "+
  "TypeScript-векторы являются исполняемым evidence; paired Lean4/Rocq-refinement "+
  "всей Nat/Add/Le схемы ещё открыт.","",
  "**Отрицательные проверки:** "+negatives.slice(6).join("; ")+".","",
  "**Открытые обязательства:** "+open.join("; ")+".","",
  "**Статус:** proposed, без Author ACCEPT и без публикации.",""].join("\n");
 guard(repMd.includes("S ::= 8 | 9 S | 6 S | 1 S S")&&
  repMd.includes("FND_05_canonical_recursive_description_unique")&&
  arMd.includes("Count([])=N₀")&&arMd.includes("EXPLICITLY_DEFERRED"),
  "essential boundary omitted");
 return {representationMd:repMd,arithmeticMd:arMd,evidence,
  openObligations:[...open],publication:"blocked"};
}
export function loadReaderR03R04(root:string):R03R04 {
 return parseReaderR03R04(read(root,REVIEW_R03_R04_PATH),root);
}
