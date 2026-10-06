import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error("v0.15 source ANet closure S2: " + message);
}

const repo = resolve(process.cwd(), "..");
const evidence = JSON.parse(
  readFileSync(resolve(repo, "formal/v0.15/evidence/source-anet-1901.json"), "utf8"),
) as {
  ownerIssue: string;
  status: string;
  completion: Record<string, boolean>;
  production: string[];
  executableEvidence: string[];
  externalAssurance: {
    manifest: string;
    refinementEvidence: string;
    frm07: string;
    frm08: string;
  };
};

const requirements = JSON.parse(
  readFileSync(resolve(repo, "requirements/mts-v0.15.json"), "utf8"),
) as { requirements: Array<{ id: string; state: string; ownerIssue: string }> };
const traceability = JSON.parse(
  readFileSync(resolve(repo, "traceability/mts-v0.15.json"), "utf8"),
) as { requirements: Record<string, { state: string; ownerIssue: number }> };

assert(evidence.ownerIssue === "#1901", "owner");
assert(evidence.status === "COMPONENT_GREEN", "status");
assert(
  Object.values(evidence.completion).every(Boolean),
  "all #1901 completion conditions are explicitly green",
);
for(const path of [
  ...evidence.production,
  ...evidence.executableEvidence,
  evidence.externalAssurance.manifest,
  evidence.externalAssurance.refinementEvidence,
]){
  assert(readFileSync(resolve(repo,path),"utf8").length>0,"path exists: "+path);
}

const state=(id:string)=>requirements.requirements.find(x=>x.id===id)?.state;
assert(state("V15-NAME-01")==="COMPONENT_GREEN","NAME component green");
assert(state("V15-STRUCT-01")==="COMPONENT_GREEN","STRUCT component green");
assert(state("V15-JSON-02")==="COMPONENT_GREEN","JSON source convergence component green");
assert(
  requirements.requirements.find(x=>x.id==="V15-CTX-01")?.ownerIssue==="#1987" &&
  requirements.requirements.find(x=>x.id==="V15-CTX-02")?.ownerIssue==="#1987",
  "execution-context ownership transferred to architecture owner",
);
assert(
  traceability.requirements["V15-CTX-01"]?.ownerIssue===1987 &&
  traceability.requirements["V15-CTX-02"]?.ownerIssue===1987,
  "traceability execution-context owner",
);
assert(
  evidence.externalAssurance.frm07==="PROVED_UNDER_EXPLICIT_PRODUCTION_REFINEMENT_PREMISES" &&
  evidence.externalAssurance.frm08==="PROVED_IN_SELECTED_MATHEMATICAL_MODEL_WITH_PRODUCTION_WITNESS",
  "FRM-07/08 source/refinement bridge",
);

console.log([
  "MTS_V015_SOURCE_ANET_1901=COMPONENT_GREEN",
  "NAME01=COMPONENT_GREEN",
  "STRUCT01=COMPONENT_GREEN",
  "JSON02=COMPONENT_GREEN",
  "CTX01_OWNER=1987",
  "CTX02_OWNER=1987",
  "FRM07_08_BRIDGE=GREEN",
  "ACCEPTED_V014_UNCHANGED=TRUE",
].join(" "));
