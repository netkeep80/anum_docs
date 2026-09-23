import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { materializeExactSequence, readExactSequence } from "../src/exact-sequence.js";
import { Memory, ensureRootBasis, type LinkHandle } from "../src/memory.js";

function assert(c:unknown,m:string):asserts c{if(!c)throw new Error(`v0.13 A66a sequence/cursor comparison: ${m}`);}
function same<T>(a:T,e:T,m:string):void{assert(Object.is(a,e),`${m}: values differ`);}

function forwardCursor(memory:Memory,values:readonly LinkHandle[]):LinkHandle{
  let q=memory.root;
  for(let i=values.length-1;i>=0;i-=1)q=memory.ensure(values[i]!,q);
  return q;
}

function readCursorCell(memory:Memory,q:LinkHandle):{readonly value:LinkHandle;readonly next:LinkHandle}{
  assert(q!==memory.root,"cursor cell is not exhausted");
  const p=memory.poles(q);
  return Object.freeze({value:p.start,next:p.end});
}

function readExactTail(memory:Memory,cell:LinkHandle):{readonly previous:LinkHandle;readonly value:LinkHandle;readonly payload:LinkHandle}{
  assert(cell!==memory.root,"exact tail cell is not root");
  const outer=memory.poles(cell);
  same(outer.start,cell,"ExactSequence cell is START-self-closed");
  const payload=memory.poles(outer.end);
  return Object.freeze({previous:payload.start,value:payload.end,payload:outer.end});
}

function exercise(noise:boolean):void{
  const memory=new Memory();
  const b=ensureRootBasis(memory);
  if(noise)memory.ensure(memory.ensure(b.U,b.C),b.O);

  const a1=memory.ensure(b.L,b.C);
  const a2=memory.ensure(b.C,b.L);
  assert(a1!==a2,"two sequence values distinct");

  // Existing canonical sequence is a prefix accumulator.
  const exact=materializeExactSequence(memory,[a1,a2]);
  const decoded=readExactSequence(memory,exact);
  same(decoded.values.length,2,"ExactSequence arity");
  same(decoded.values[0],a1,"ExactSequence first value");
  same(decoded.values[1],a2,"ExactSequence second value");
  same(decoded.cells.length,2,"ExactSequence cell count");
  const E1=decoded.cells[0]!;
  const E2=decoded.cells[1]!;
  same(E2,exact,"ExactSequence final handle");

  const exactTail2=readExactTail(memory,E2);
  same(exactTail2.previous,E1,"final ExactSequence cell locally points to previous prefix");
  same(exactTail2.value,a2,"final ExactSequence cell locally exposes last value");
  const exactTail1=readExactTail(memory,E1);
  same(exactTail1.previous,memory.root,"first ExactSequence cell previous prefix");
  same(exactTail1.value,a1,"first ExactSequence cell value");

  // Scoped execution cursor is a forward suffix chain.
  const beforeCursor=memory.linkCount;
  const Q0=forwardCursor(memory,decoded.values);
  assert(memory.linkCount>beforeCursor,"forward cursor requires topology not already supplied by ExactSequence");
  const Q0read=readCursorCell(memory,Q0);
  const Q1=Q0read.next;
  same(Q0read.value,a1,"Q0 locally exposes current first argument");
  const Q1read=readCursorCell(memory,Q1);
  same(Q1read.value,a2,"Q1 locally exposes next argument");
  same(Q1read.next,memory.root,"Q1 locally exposes exhaustion after second argument");

  // Same ordered values, different topology and opposite local temporal view.
  assert(Q0!==E2,"forward cursor is not ExactSequence final cell");
  assert(Q1!==E1,"forward cursor suffix is not ExactSequence prefix cell");
  same(readCursorCell(memory,Q0).value,a1,"cursor local head is earliest/current value");
  same(readExactTail(memory,E2).value,a2,"exact local head is latest accumulated value");

  // One local pole swap of the ExactSequence tail is still not the forward cursor.
  const swappedTail=memory.ensure(exactTail2.value,exactTail2.previous);
  assert(swappedTail!==Q0,"single START/END swap of exact tail does not yield Q0");
  assert(swappedTail!==Q1,"single START/END swap of exact tail does not yield Q1");

  // Full ordered-value traversal is sufficient to construct the cursor.
  const reconstructed=forwardCursor(memory,readExactSequence(memory,E2).values);
  same(reconstructed,Q0,"full ExactSequence value traversal reconstructs canonical forward cursor");
  const afterFirstReconstruction=memory.linkCount;
  same(forwardCursor(memory,decoded.values),Q0,"cursor reconstruction is canonical");
  same(memory.linkCount,afterFirstReconstruction,"repeated cursor reconstruction adds no Links");
}

function staticGuards():void{
  const root=resolve(process.cwd(),"..");
  const own=readFileSync(
    join(root,"ts/test/research-v013-sequence-cursor-comparison-a66a.test.ts"),"utf8",
  );
  const exact=readFileSync(join(root,"ts/src/exact-sequence.ts"),"utf8");
  assert(exact.includes("const payload = memory.ensure(current, value);"),
    "A66a observes existing ExactSequence prefix payload law");
  assert(exact.includes("current = memory.ensureStartSelfClosed(payload);"),
    "A66a observes existing ExactSequence START-closure law");

  const normative=own.slice(0,own.indexOf("function staticGuards():void"));
  for(const forbidden of [
    "defineContext",
    "branchOne",
    "advanceOne",
    "MetaState",
    "publication",
    "admission",
    "jsonRVM",
  ])assert(!normative.includes(forbidden),`A66a structural comparison excludes ${forbidden}`);
}

function main():void{
  exercise(false);
  exercise(true);
  staticGuards();
  console.log([
    "MTS v0.13 A66a: TWO_ELEMENT_SEQUENCE_CURSOR_COMPARISON=GREEN_SCOPED_RESEARCH",
    "ORDERED_VALUES=EQUIVALENT",
    "TOPOLOGY_IDENTITY=NO",
    "EXACT_SEQUENCE=START_CLOSED_PREFIX_ACCUMULATOR",
    "FORWARD_Q=RAW_SUFFIX_CURSOR",
    "EXACT_LOCAL_HEAD=LATEST_VALUE_PLUS_PREVIOUS_PREFIX",
    "Q_LOCAL_HEAD=CURRENT_EARLIEST_VALUE_PLUS_NEXT_SUFFIX",
    "SINGLE_POLE_SWAP_PROJECTION=NO",
    "FULL_VALUE_TRAVERSAL_CAN_RECONSTRUCT_Q=YES",
    "IDENTITY_OR_SINGLE_POLE_SWAP=NO",
    "FORMAL_DUALITY=NOT_CLAIMED",
    "EXECUTION_SEMANTICS=NOT_TESTED",
    "V013_NOT_ACCEPTED PRODUCTION_UNCHANGED",
  ].join(" "));
}

main();
