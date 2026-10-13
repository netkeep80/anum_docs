import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";

const root=resolve("..");
const lean=readFileSync(resolve(root,"proofs/lean4/MtsBasisFiveDistinct.lean"),"utf8");
const rocq=readFileSync(resolve(root,"proofs/coq/MtsBasisFiveDistinct.v"),"utf8");

// Exact two-language signature pins. They fix all ten named inequalities,
// the sole E hypothesis, and both ordered L=form(O,C), U=form(C,O).
const expectedLeanHeader="theorem F03_basis_five_pairwise_distinct\n    (F : Foundation)\n    (E : F2F3OneSidedExistence F) :\n    F.R ≠ E.startRoot ∧\n    F.R ≠ E.finishRoot ∧\n    F.R ≠ F.form E.startRoot E.finishRoot ∧\n    F.R ≠ F.form E.finishRoot E.startRoot ∧\n    E.startRoot ≠ E.finishRoot ∧\n    E.startRoot ≠ F.form E.startRoot E.finishRoot ∧\n    E.startRoot ≠ F.form E.finishRoot E.startRoot ∧\n    E.finishRoot ≠ F.form E.startRoot E.finishRoot ∧\n    E.finishRoot ≠ F.form E.finishRoot E.startRoot ∧\n    F.form E.startRoot E.finishRoot ≠\n      F.form E.finishRoot E.startRoot := by";
const expectedRocqHeader="Theorem F03_basis_five_pairwise_distinct\n    (F : Foundation)\n    (E : F2F3OneSidedExistence F) :\n    R F <> f2f3_start_root F E /\\\n    R F <> f2f3_finish_root F E /\\\n    R F <> form F (f2f3_start_root F E) (f2f3_finish_root F E) /\\\n    R F <> form F (f2f3_finish_root F E) (f2f3_start_root F E) /\\\n    f2f3_start_root F E <> f2f3_finish_root F E /\\\n    f2f3_start_root F E <>\n      form F (f2f3_start_root F E) (f2f3_finish_root F E) /\\\n    f2f3_start_root F E <>\n      form F (f2f3_finish_root F E) (f2f3_start_root F E) /\\\n    f2f3_finish_root F E <>\n      form F (f2f3_start_root F E) (f2f3_finish_root F E) /\\\n    f2f3_finish_root F E <>\n      form F (f2f3_finish_root F E) (f2f3_start_root F E) /\\\n    form F (f2f3_start_root F E) (f2f3_finish_root F E) <>\n      form F (f2f3_finish_root F E) (f2f3_start_root F E).\nProof.";
function theoremHeader(source:string,start:string,end:string):string{
 const i=source.indexOf(start),j=source.indexOf(end,i);
 assert.ok(i>=0&&j>=0,"F03 theorem header missing");
 return source.slice(i,j+end.length);
}
function assertF03Sources(l:string,r:string):void {
 assert.equal(theoremHeader(l,"theorem F03_basis_five_pairwise_distinct",":= by"),
  expectedLeanHeader,"Lean proof premise/pair/order drift");
 assert.equal(theoremHeader(r,"Theorem F03_basis_five_pairwise_distinct",".\nProof."),
  expectedRocqHeader,"Rocq proof premise/pair/order drift");
 assert.ok(l.includes("let O : F.Link := E.startRoot"));
 assert.ok(l.includes("let C : F.Link := E.finishRoot"));
 assert.ok(l.includes("let L : F.Link := F.form O C"));
 assert.ok(l.includes("let U : F.Link := F.form C O"),"Lean L/U orientation reversed");
 assert.ok(r.includes("set (O := f2f3_start_root F E)"));
 assert.ok(r.includes("set (C := f2f3_finish_root F E)"));
 assert.ok(r.includes("set (L := form F O C)"));
 assert.ok(r.includes("set (U := form F C O)"),"Rocq L/U orientation reversed");
 assert.ok(l.includes("fnd13_form_injective F"));
 assert.ok(r.includes("fnd13_form_injective F O C C O"));
 assert.doesNotMatch(l,/\b(?:sorry|admit)\b/);
 assert.doesNotMatch(r,/\bAdmitted\s*\./);
 for (const s of [l,r]){
  assert.ok(!s.includes("A1RecursiveSeparation")&&!s.includes("GroundedNormalization"),
   "extra A1/Normalization hypotheses are forbidden");
 }
}
assertF03Sources(lean,rocq);

// Negative mutation witnesses: losing E, altering a named pair, or
// swapping the L/U constructor order must fail the source contract.
// The actual theorem is checked separately by pinned Lean/Rocq kernels in CI.
assert.throws(()=>assertF03Sources(
 lean.replace("(E : F2F3OneSidedExistence F)","(E : Foundation)"),rocq));
assert.throws(()=>assertF03Sources(lean,
 rocq.replace("(E : F2F3OneSidedExistence F)","(E : Foundation)")));
assert.throws(()=>assertF03Sources(
 lean.replace("F.R ≠ E.startRoot ∧","F.R ≠ E.finishRoot ∧"),rocq));
assert.throws(()=>assertF03Sources(
 lean.replace("let U : F.Link := F.form C O","let U : F.Link := F.form O C"),rocq));
assert.throws(()=>assertF03Sources(lean,
 rocq.replace("set (U := form F C O)","set (U := form F O C)")));
console.log("F03 kernel candidate: exact 10 inequalities, sole E hypothesis, pinned ordered L/U, Lean/Rocq negative mutations.");
