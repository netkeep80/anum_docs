import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { materializeExactSequence } from "../src/exact-sequence.js";
import { Memory, ensureRootBasis, type LinkHandle } from "../src/memory.js";

function assert(c:unknown,m:string):asserts c{if(!c)throw new Error(`v0.13 A66c ExactSequence initial position: ${m}`);}
function same<T>(a:T,e:T,m:string):void{assert(Object.is(a,e),`${m}: values differ`);}
function expectThrows(fn:()=>void,m:string):void{let threw=false;try{fn();}catch{threw=true;}assert(threw,m);}

interface CellView{readonly previous:LinkHandle;readonly value:LinkHandle;}
function readExactCell(memory:Memory,cell:LinkHandle):CellView{
  assert(cell!==memory.root,"exact cell is not root");
  const outer=memory.poles(cell);
  same(outer.start,cell,"exact cell START-self-closed");
  const payload=memory.poles(outer.end);
  return Object.freeze({previous:payload.start,value:payload.end});
}

function definePosition(memory:Memory,sequence:LinkHandle,currentCell:LinkHandle):LinkHandle{
  return memory.ensure(sequence,currentCell);
}

/**
 * Initialization only:
 *
 *   selected non-empty ExactSequence S
 *      -> traverse S.previous ancestry
 *      -> first Cell E1, where previous(E1)=R
 *      -> P0 = S -> E1
 *
 * No host index, decoded value array, ambient Memory search or forward Q chain.
 */
function initialPosition(memory:Memory,sequence:LinkHandle):LinkHandle{
  assert(sequence!==memory.root,"selected sequence must be non-empty");
  const seen=new Set<LinkHandle>();
  let current=sequence;

  while(true){
    assert(!seen.has(current),"selected sequence ancestry cycle");
    seen.add(current);
    const cell=readExactCell(memory,current);
    if(cell.previous===memory.root)return definePosition(memory,sequence,current);
    current=cell.previous;
  }
}

function positionValue(memory:Memory,position:LinkHandle):LinkHandle{
  const p=memory.poles(position);
  return readExactCell(memory,p.end).value;
}

function exercise(noise:boolean):void{
  const memory=new Memory();
  const b=ensureRootBasis(memory);
  if(noise)memory.ensure(memory.ensure(b.U,b.C),b.O);

  const a1=memory.ensure(b.L,b.C);
  const a2=memory.ensure(b.C,b.L);
  const a3=memory.ensure(b.O,b.U);

  const S1=materializeExactSequence(memory,[a1]);
  const S2=materializeExactSequence(memory,[a1,a2]);
  const S3=materializeExactSequence(memory,[a1,a2,a3]);

  // Canonical prefix sharing is intentional.
  const E1=S1;
  same(readExactCell(memory,S2).previous,E1,"S2 previous prefix is shared E1");
  const E2=readExactCell(memory,S3).previous;
  same(E2,S2,"S3 previous prefix is shared S2");

  const P1=initialPosition(memory,S1);
  const P2=initialPosition(memory,S2);
  const P3=initialPosition(memory,S3);

  same(memory.poles(P1).start,S1,"length-1 position selects S1");
  same(memory.poles(P1).end,E1,"length-1 first cell");
  same(memory.poles(P2).start,S2,"length-2 position selects S2");
  same(memory.poles(P2).end,E1,"length-2 first cell");
  same(memory.poles(P3).start,S3,"length-3 position selects S3");
  same(memory.poles(P3).end,E1,"length-3 first cell");

  same(positionValue(memory,P1),a1,"length-1 initial argument");
  same(positionValue(memory,P2),a1,"length-2 initial argument");
  same(positionValue(memory,P3),a1,"length-3 initial argument");

  assert(P1!==P2&&P2!==P3&&P1!==P3,
    "same first cell under distinct selected sequences yields distinct positions");

  const before=memory.linkCount;
  same(initialPosition(memory,S3),P3,"initial position is canonical");
  same(memory.linkCount,before,"repeated initialization adds no Links");

  expectThrows(()=>{initialPosition(memory,memory.root);},
    "empty selected sequence rejected by non-empty initializer");

  // Malformed START-self-closed tail whose previous pole is not an ExactSequence cell.
  const badPrevious=memory.ensure(a2,a3);
  const badPayload=memory.ensure(badPrevious,a1);
  const malformed=memory.ensureStartSelfClosed(badPayload);
  expectThrows(()=>{initialPosition(memory,malformed);},
    "malformed selected sequence ancestry rejected");
}

function staticGuards():void{
  const root=resolve(process.cwd(),"..");
  const own=readFileSync(
    join(root,"ts/test/research-v013-exact-sequence-initial-position-a66c.test.ts"),"utf8",
  );
  const start=own.indexOf("function initialPosition(");
  const end=own.indexOf("\nfunction positionValue(",start);
  assert(start>=0&&end>start,"initialPosition slice");
  const init=own.slice(start,end);

  for(const forbidden of [
    "readExactSequence(",
    ".incoming(",
    ".outgoing(",
    ".allLinks(",
    ".find(",
    "forwardCursor(",
    "values[",
    "indexOf(",
    "defineContext(",
  ])assert(!init.includes(forbidden),`A66c initializer excludes ${forbidden}`);
}

function main():void{
  exercise(false);
  exercise(true);
  staticGuards();
  console.log([
    "MTS v0.13 A66c: EXACT_SEQUENCE_INITIAL_POSITION=GREEN_SCOPED_RESEARCH",
    "INPUT=ONE_SELECTED_NONEMPTY_SEQUENCE",
    "OUTPUT=P0_EQ_SEQUENCE_TO_FIRST_CELL",
    "FIRST_CELL=ANCESTRY_CELL_WITH_PREVIOUS_R",
    "HOST_INDEX=0 HOST_VALUE_ARRAY=0",
    "AMBIENT_MEMORY_SEARCH=0 FORWARD_Q_CHAIN=0",
    "LENGTHS_TESTED=1_2_3",
    "SHARED_PREFIX=SUPPORTED_SEQUENCE_IDENTITY_RETAINED",
    "EMPTY_SEQUENCE=OUT_OF_SCOPE_REJECTED",
    "MALFORMED_ANCESTRY=REJECTED",
    "INITIALIZATION_CANONICAL=YES",
    "POSITION_ADVANCEMENT=NOT_RETESTED",
    "EXECUTION_CONTEXT=NOT_TESTED",
    "V013_NOT_ACCEPTED PRODUCTION_UNCHANGED",
  ].join(" "));
}

main();
