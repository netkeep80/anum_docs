import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { materializeExactSequence } from "../src/exact-sequence.js";
import { Memory, ensureRootBasis, type LinkHandle } from "../src/memory.js";

function assert(c:unknown,m:string):asserts c{if(!c)throw new Error(`v0.13 A66b ExactSequence position: ${m}`);}
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

/**
 * Candidate position:
 *
 *   P = Sequence -> CurrentCell
 *
 * It references existing ExactSequence cells; it does not duplicate values into
 * a second suffix chain.
 */
function definePosition(memory:Memory,sequence:LinkHandle,currentCell:LinkHandle):LinkHandle{
  return memory.ensure(sequence,currentCell);
}

interface PositionStep{
  readonly argument:LinkHandle;
  readonly doneAfter:boolean;
  readonly nextPosition?:LinkHandle;
}

/**
 * Read one selected forward position.
 *
 * ExactSequence links point backward (cell -> previous prefix), so finding the
 * successor of CurrentCell requires only structural traversal from the selected
 * Sequence handle back toward root. No ambient Memory enumeration is used.
 */
function stepPosition(memory:Memory,position:LinkHandle):PositionStep{
  const p=memory.poles(position);
  const sequence=p.start;
  const current=p.end;
  const currentView=readExactCell(memory,current);

  if(current===sequence){
    return Object.freeze({argument:currentView.value,doneAfter:true});
  }

  let cursor=sequence;
  const seen=new Set<LinkHandle>();
  while(cursor!==memory.root){
    assert(!seen.has(cursor),"sequence ancestry cycle");
    seen.add(cursor);
    const view=readExactCell(memory,cursor);
    if(view.previous===current){
      return Object.freeze({
        argument:currentView.value,
        doneAfter:false,
        nextPosition:definePosition(memory,sequence,cursor),
      });
    }
    cursor=view.previous;
  }

  throw new Error("selected current cell is not in selected sequence");
}

function exercise(noise:boolean):void{
  const memory=new Memory();
  const b=ensureRootBasis(memory);
  if(noise)memory.ensure(memory.ensure(b.U,b.C),b.O);

  const a1=memory.ensure(b.L,b.C);
  const a2=memory.ensure(b.C,b.L);
  const b2=memory.ensure(b.U,b.L);
  assert(a1!==a2&&a2!==b2,"position fixture values distinct");

  const S1=materializeExactSequence(memory,[a1,a2]);
  const S2=materializeExactSequence(memory,[a1,b2]);
  assert(S1!==S2,"different second values produce distinct sequences");

  // Both sequences canonically share the first prefix cell E1.
  const S1tail=readExactCell(memory,S1);
  const S2tail=readExactCell(memory,S2);
  const E1=S1tail.previous;
  same(S2tail.previous,E1,"same first value gives shared canonical prefix cell");
  same(readExactCell(memory,E1).previous,memory.root,"E1 is first cell");
  same(readExactCell(memory,E1).value,a1,"E1 carries first value");
  same(S1tail.value,a2,"S1 final cell carries a2");
  same(S2tail.value,b2,"S2 final cell carries b2");

  // CurrentCell alone is insufficient: E1 belongs to both selected sequences.
  const P1=definePosition(memory,S1,E1);
  const P1other=definePosition(memory,S2,E1);
  assert(P1!==P1other,"sequence identity disambiguates shared current cell");

  const first=stepPosition(memory,P1);
  same(first.argument,a1,"first selected position yields a1");
  same(first.doneAfter,false,"first selected position has successor");
  assert(first.nextPosition!==undefined,"first position produces next position");
  const expectedP2=definePosition(memory,S1,S1);
  same(first.nextPosition,expectedP2,"next position selects S1 final cell");

  const firstOther=stepPosition(memory,P1other);
  same(firstOther.argument,a1,"shared prefix still yields same current argument");
  assert(firstOther.nextPosition!==undefined,"other sequence also has next position");
  same(firstOther.nextPosition,definePosition(memory,S2,S2),
    "same current cell advances according to selected sequence");
  assert(first.nextPosition!==firstOther.nextPosition,
    "current cell alone cannot determine forward successor across shared-prefix sequences");

  const second=stepPosition(memory,expectedP2);
  same(second.argument,a2,"second selected position yields a2");
  same(second.doneAfter,true,"selected final cell completes this two-element sequence");
  assert(second.nextPosition===undefined,"completed position has no next position");

  // A cell from another sequence cannot be smuggled under S1.
  const foreign=definePosition(memory,S1,S2);
  expectThrows(()=>{stepPosition(memory,foreign);},
    "foreign current cell rejected for selected sequence");

  // Position state is one Link over existing sequence/cell identities.
  const pp=memory.poles(P1);
  same(pp.start,S1,"position START is selected immutable sequence");
  same(pp.end,E1,"position END is selected current cell");
}

function staticGuards():void{
  const root=resolve(process.cwd(),"..");
  const own=readFileSync(
    join(root,"ts/test/research-v013-exact-sequence-position-a66b.test.ts"),"utf8",
  );
  const start=own.indexOf("function stepPosition(");
  const end=own.indexOf("\nfunction exercise(",start);
  assert(start>=0&&end>start,"stepPosition slice");
  const step=own.slice(start,end);

  for(const forbidden of [
    ".incoming(",
    ".outgoing(",
    ".allLinks(",
    ".find(",
    "readExactSequence(",
    "forwardCursor(",
    "defineContext(",
  ])assert(!step.includes(forbidden),`A66b position step excludes ${forbidden}`);
}

function main():void{
  exercise(false);
  exercise(true);
  staticGuards();
  console.log([
    "MTS v0.13 A66b: EXACT_SEQUENCE_SELECTED_POSITION=GREEN_SCOPED_RESEARCH",
    "POSITION=P_EQ_SEQUENCE_TO_CURRENT_CELL",
    "VALUE_DUPLICATION_IN_POSITION=0",
    "CURRENT_CELL_ALONE=INSUFFICIENT_WITH_SHARED_PREFIX",
    "SEQUENCE_PLUS_CURRENT_CELL=SUFFICIENT_FOR_TWO_ELEMENT_FORWARD_STEP",
    "SUCCESSOR=STRUCTURAL_BACKWARD_SCAN_FROM_SELECTED_SEQUENCE",
    "AMBIENT_MEMORY_ENUMERATION=0",
    "FIRST_ARGUMENT=A1 NEXT_POSITION=FINAL_CELL",
    "FINAL_ARGUMENT=A2 DONE_AFTER=YES",
    "FOREIGN_CURRENT_CELL=REJECTED",
    "GLOBAL_MINIMALITY=NOT_CLAIMED",
    "ARBITRARY_LENGTH_COST=NOT_CLASSIFIED",
    "EXECUTION_CONTEXT=NOT_TESTED",
    "V013_NOT_ACCEPTED PRODUCTION_UNCHANGED",
  ].join(" "));
}

main();
