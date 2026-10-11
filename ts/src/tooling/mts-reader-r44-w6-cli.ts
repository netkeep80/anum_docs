import {resolve} from "node:path";
import {renderReaderW6} from "./mts-reader-r44-w6.js";
// Invoke from the ts directory after npm run build; output is generated, never authoritative.
const result=renderReaderW6(resolve(".."));
if(result.publication!=="blocked")throw Error("unexpected publication state");
process.stdout.write(result.markdown+"\n");
