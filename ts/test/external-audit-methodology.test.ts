import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {EA_YAML,EA_BLOB_SHA,EA_PATHS,parseEAYaml,loadEAModel,renderEAPrompts,checkEAPrompts} from "../src/tooling/external-audit-methodology.js";
const root=resolve(".."),raw=readFileSync(resolve(root,EA_YAML),"utf8");
const model=loadEAModel(root);
assert.equal(EA_BLOB_SHA,"1de43fae61079019878fff28844e79ec7222e47f");
assert.deepEqual(model.rules.map(x=>x.id),Array.from({length:16},(_,i)=>"MTS-EA-"+String(i+1).padStart(2,"0")));
assert.deepEqual(model.prompts.map(x=>x.id),["EA-P1","EA-P2","EA-P3"]);
assert.equal(model.kinds.length,10);
assert.equal(model.criteria.length,5);
assert.ok(model.rules[8]!.statement.includes("точный"));
assert.ok(model.prompts[1]!.body.includes("какие традиционные математические теории можно установить"));
assert.ok(model.prompts[2]!.body.includes("реальные"));
const derived=renderEAPrompts(model);
assert.deepEqual(checkEAPrompts(root),[]);
for(const path of EA_PATHS){
 const text=derived[path]!;
 assert.equal(text,readFileSync(resolve(root,path),"utf8"));
 assert.ok(text.includes("**Предмет:** Метатеория Связей"));
 assert.equal((text.match(/^\- \*\*MTS-EA-\d\d /gm)??[]).length,16);
}
const reject=(needle:string,replacement:string)=>{
 assert.ok(raw.includes(needle),"missing mutation needle "+needle);
 assert.throws(()=>parseEAYaml(raw.replace(needle,replacement)),/MTS-EA-v1/);
};
reject("status: author-accepted","status: proposed");
reject("  - id: MTS-EA-01","  - id: MTS-EA-02");
reject("  - id: EA-P1","  - id: EA-P2");
reject("author_decision_comment: 6143247912","author_decision_comment: 0");
reject("NATIVE_CONTRADICTION","IMAGINARY_NATIVE_SUCCESS");
reject("Метатеор","Теор");
assert.throws(()=>parseEAYaml(raw+"status: author-accepted\n"),/MTS-EA-v1/);
console.log("MTS-EA-v1: exact accepted Git blob, 16 requirements, 3 generated prompts, 10 classes, 5 criteria, 7 negative guards: PASS.");
