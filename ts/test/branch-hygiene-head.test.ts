import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const workflow = readFileSync(resolve("..", ".github/workflows/branch-hygiene.yml"), "utf8");
const jobAt = workflow.indexOf("      - name: Ensure open draft PR");
const runAt = workflow.indexOf("        run: |\n", jobAt);
const endAt = workflow.indexOf("\n  delete-merged-head:", runAt);
assert.ok(jobAt >= 0 && runAt > jobAt && endAt > runAt);
const shell = workflow.slice(runAt + "        run: |\n".length, endAt)
  .split("\n").map(line => line.startsWith("          ") ? line.slice(10) : line).join("\n");
assert.ok(shell.includes("--paginate --method GET"));
assert.ok(shell.includes('-f head="$OWNER:$BRANCH"'));
assert.ok(!shell.includes('-f head="$OWNER:$BRANCH" -f base="$BASE"'));
assert.ok(workflow.includes("cancel-in-progress: false"));
const stub = [
  "#!/usr/bin/env bash",
  "set -euo pipefail",
  'echo "$*" >> "$MOCK_LOG"',
  'if [[ "$*" == *"--method GET"* && "$*" == *"/pulls"* ]]; then',
  '  if [[ "$MOCK_GET_FAIL" == 1 ]]; then echo "API GET failed" >&2; exit 1; fi',
  '  n="$(cat "$MOCK_COUNT_FILE")"; n=$((n+1)); echo "$n" > "$MOCK_COUNT_FILE"',
  '  case "$n" in',
  '    1) total="$MOCK_COUNT1";;',
  '    2) total="$MOCK_COUNT2";;',
  '    *) total="$MOCK_COUNT3";;',
  '  esac',
  '  for ((i=1;i<=total;i++)); do echo "$i"; done',
  'elif [[ "$*" == *"/compare/"* ]]; then',
  '  echo "{\\"ahead_by\\":$MOCK_AHEAD}"',
  'elif [[ "$*" == *"--method POST"* && "$*" == *"/pulls"* ]]; then',
  '  echo 1 >> "$MOCK_POST_FILE"',
  '  if [[ "$MOCK_POST_FAIL" == 1 ]]; then echo "HTTP 422 Validation Failed" >&2; exit 1; fi',
  'else echo "Unexpected gh call: $*" >&2; exit 1; fi',
].join("\n") + "\n";

function check(label: string, counts: [number,number,number], expectedPosts: number,
  options: { ahead?: number; getFail?: boolean; postFail?: boolean; success?: boolean }={}): void {
  if(process.platform==="win32") return;
  const directory=mkdtempSync(join(tmpdir(),"mts-branch-head-"));
  try {
    const mock=join(directory,"gh"), scriptFile=join(directory,"policy.sh");
    const counter=join(directory,"queries"), postFile=join(directory,"posts"),logFile=join(directory,"log");
    writeFileSync(mock,stub);chmodSync(mock,0o755);
    writeFileSync(scriptFile,shell);writeFileSync(counter,"0");
    writeFileSync(postFile,"");writeFileSync(logFile,"");
    const result=spawnSync("bash",[scriptFile],{encoding:"utf8",env:{
      ...process.env,GH_TOKEN:"fixture",REPO:"netkeep80/anum_docs",
      OWNER:"netkeep80",BRANCH:"side-feature",BASE:"main",
      MOCK_COUNT1:String(counts[0]),MOCK_COUNT2:String(counts[1]),
      MOCK_COUNT3:String(counts[2]),MOCK_GET_FAIL:options.getFail?"1":"0",
      MOCK_POST_FAIL:options.postFail?"1":"0",MOCK_AHEAD:String(options.ahead??1),
      MOCK_COUNT_FILE:counter,MOCK_POST_FILE:postFile,MOCK_LOG:logFile,
      PATH:directory+":"+(process.env.PATH??""),
    }});
    const requests=readFileSync(logFile,"utf8").split("\n").filter(Boolean);
    const posts=readFileSync(postFile,"utf8").trim().split("\n").filter(Boolean);
    assert.equal(posts.length,expectedPosts,label+": "+result.stderr+" / "+result.stdout);
    assert.equal(result.status===0,options.success!==false,label+": "+result.stderr);
    for(const q of requests.filter(x=>x.includes("--method GET")&&x.includes("/pulls"))){
      assert.ok(q.includes("--paginate"),label+": no pagination");
      assert.ok(q.includes("head=netkeep80:side-feature"),label+": wrong owner/head");
      assert.ok(!q.includes("base=main"),label+": base wrongly filters stacked PRs");
    }
  } finally { rmSync(directory,{recursive:true,force:true}); }
}
check("existing main-based PR",[1,1,1],0);
check("existing stacked PR",[1,1,1],0);
check("multiple PRs same head",[2,2,2],0);
check("no PR, one post",[0,0,0],1);
check("existing PR appears during compare",[0,1,1],0);
check("create race, concurrent PR wins",[0,0,1],1,{postFail:true});
check("failed POST with no concurrent PR",[0,0,0],1,{postFail:true,success:false});
check("compare no unique commits",[0,0,0],0,{ahead:0});
check("GET API error fails closed",[0,0,0],0,{getFail:true,success:false});
console.log("Branch hygiene regression: head-only, stacked, race and pagination guards checked.");
