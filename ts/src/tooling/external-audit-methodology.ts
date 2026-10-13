import {createHash} from "node:crypto";
import {existsSync, mkdirSync, readFileSync, writeFileSync} from "node:fs";
import {dirname, resolve} from "node:path";

export const EA_YAML="requirements/publication/MTS-EA-v1.yaml";
export const EA_BLOB_SHA="1de43fae61079019878fff28844e79ec7222e47f";
export const EA_PATHS=["docs/reviews/MTS-EA-P1.md","docs/reviews/MTS-EA-P2.md","docs/reviews/MTS-EA-P3.md"] as const;
const EA_KINDS=["NATIVE_CONTRADICTION","NATIVE_DEFINITION_GAP","NATIVE_PROOF_GAP","EXTERNAL_MODEL_INADEQUACY","EXTERNAL_INTERFACE_INSUFFICIENCY","RECONSTRUCTION_GAP","ASSURANCE_SCOPE_GAP","READER_EXPOSITION_DEFECT","OPEN_COMPARISON","AUTHOR_DECISION_REQUIRED"] as const;
export interface EARule {id:string; title:string; statement:string; falsifier:string}
export interface EAPrompt {id:string; title:string; body:string}
export interface EAModel {rules:EARule[]; prompts:EAPrompt[]; kinds:string[]; criteria:string[]}
const fail=(s:string):never=>{throw new Error("MTS-EA-v1: "+s);};
function parseQuoted(line:string,prefix:string):string {
 if(!line.startsWith(prefix))fail("expected "+prefix);
 const value=line.slice(prefix.length);
 let parsed:unknown;
 try{parsed=JSON.parse(value);}catch{fail("bad quoted YAML scalar "+prefix);}
 if(typeof parsed!=="string"||JSON.stringify(parsed)!==value)fail("noncanonical YAML scalar "+prefix);
 return parsed as string;
}
export function parseEAYaml(raw:string):EAModel {
 if(raw.includes("\r")||!raw.endsWith("\n"))fail("LF and final newline required");
 const bytes=Buffer.from(raw,"utf8");
 const gitSha=createHash("sha1").update("blob "+bytes.length+"\0").update(bytes).digest("hex");
 if(gitSha!==EA_BLOB_SHA)fail("accepted content changed without author approval");
 const rows=raw.split("\n");rows.pop();let i=0;
 const take=()=>rows[i++]??"";
 const exact=(s:string)=>{if(take()!==s)fail("schema, identity, authority or section changed: "+s);};
 [
 "schema: mts-external-audit-methodology/v1","id: MTS-EA-v1","kind: review-methodology",
 "status: author-accepted","authority_scope: independent-review-methodology-only",
 "accepted_mts_semantics_unchanged: true","source_proposal_issue: 2132",
 "source_proposal_comment: 6143150188","author_decision_issue: 2132",
 "author_decision_comment: 6143247912","language: ru","requirements:"
 ].forEach(exact);
 const rules:EARule[]=[];
 for(let n=1;n<=16;n++){
  const id="MTS-EA-"+String(n).padStart(2,"0");exact("  - id: "+id);
  const title=parseQuoted(take(),"    title_ru: ");
  const statement=parseQuoted(take(),"    statement_ru: ");
  const falsifier=parseQuoted(take(),"    falsifier_ru: ");
  if(!title||!statement)fail("empty requirement "+id);
  rules.push({id,title,statement,falsifier});
 }
 exact("prompts:");
 const prompts:EAPrompt[]=[];
 for(let n=1;n<=3;n++){
  const id="EA-P"+n;exact("  - id: "+id);
  const title=parseQuoted(take(),"    title_ru: ");
  const body=parseQuoted(take(),"    text_ru: ");
  if(!title||body.length<250||!body.includes("МТС"))fail("missing approved prompt "+id);
  prompts.push({id,title,body});
 }
 exact("finding_kinds:");
 const kinds=EA_KINDS.map(()=>parseQuoted(take(),"  - "));
 if(kinds.join("|")!==EA_KINDS.join("|"))fail("finding classification drift");
 exact("quality_criteria:");
 const criteria=Array.from({length:5},()=>parseQuoted(take(),"  - "));
 if(criteria.some(c=>!c)||i!==rows.length)fail("quality criteria or unknown YAML fields");
 return {rules,prompts,kinds,criteria};
}
export function loadEAModel(root:string):EAModel{
 return parseEAYaml(readFileSync(resolve(root,EA_YAML),"utf8"));
}
export function renderEAPrompts(model:EAModel):Record<string,string>{
 const docs:Record<string,string>={};
 for(let index=0;index<model.prompts.length;index++){
  const p=model.prompts[index]!;
  docs[EA_PATHS[index]!]=[
   "# "+p.id+" — "+p.title,"",
   "**Предмет:** Метатеория Связей (МТС). **Статус:** утверждённая автором методология внешнего аудита; семантика v0.15 не изменена.","",
   "**Решение автора:** https://github.com/netkeep80/anum_docs/issues/2132#issuecomment-6143247912",
   "**Первичная редакция:** https://github.com/netkeep80/anum_docs/issues/2132#issuecomment-6143150188","",
   "## Задание","",p.body,"",
   "## Обязательные метатребования","",
   ...model.rules.map(r=>"- **"+r.id+" — "+r.title+".** "+r.statement+(r.falsifier?" **Фальсификатор:** "+r.falsifier:"")),"",
   "## Типы замечаний","",model.kinds.map(x=>String.fromCharCode(96)+x+String.fromCharCode(96)).join(", "),"",
   "## Требования к результату","",
   ...model.criteria.map((s,i)=>(i+1)+". "+s),"",
   "_Автоматически формируемое представление утверждённого "+String.fromCharCode(96)+"requirements/publication/MTS-EA-v1.yaml"+String.fromCharCode(96)+"; не редактировать вручную._",""
  ].join("\n");
 }
 return docs;
}
export function checkEAPrompts(root:string):string[]{
 const docs=renderEAPrompts(loadEAModel(root));
 return Object.entries(docs).filter(([p,s])=>!existsSync(resolve(root,p))||readFileSync(resolve(root,p),"utf8")!==s).map(([p])=>p);
}
export function syncEAPrompts(root:string):string[]{
 const docs=renderEAPrompts(loadEAModel(root));const changed:string[]=[];
 for(const [path,content] of Object.entries(docs)){
  const full=resolve(root,path);
  if(!existsSync(full)||readFileSync(full,"utf8")!==content){
   mkdirSync(dirname(full),{recursive:true});writeFileSync(full,content,"utf8");changed.push(path);
  }
 }
 return changed;
}
