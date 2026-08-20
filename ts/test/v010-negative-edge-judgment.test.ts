import {
  ExactSequenceError,
  materializeExactSequence,
  readExactSequence,
} from "../src/exact-sequence.js";
import {
  Memory,
  ensureRootBasis,
  type LinkHandle,
  type LinkPoles,
  type ReadMemory,
} from "../src/memory.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: ${String(actual)} !== ${String(expected)}`);
}

class PolesOnlyProbe implements ReadMemory {
  constructor(private readonly source: ReadMemory) {}

  get root(): LinkHandle { return this.source.root; }
  get linkCount(): number { return this.source.linkCount; }
  poles(link: LinkHandle): LinkPoles { return this.source.poles(link); }
  find(): LinkHandle | undefined { throw new Error("closed NoEdge не должен использовать find"); }
  outgoing(): readonly LinkHandle[] { throw new Error("closed NoEdge не должен использовать outgoing"); }
  incoming(): readonly LinkHandle[] { throw new Error("closed NoEdge не должен использовать incoming"); }
}

class ClosedEdgeJudgmentError extends Error {
  override readonly name = "ClosedEdgeJudgmentError";
  constructor(readonly code: "invalid-closed-edge-definition") {
    super(code);
  }
}

function invalid(): never {
  throw new ClosedEdgeJudgmentError("invalid-closed-edge-definition");
}

function refFactory(memory: Memory): () => LinkHandle {
  const seed = memory.ensureEndSelfClosed(memory.root);
  let tag = memory.ensureStartSelfClosed(memory.root);
  return () => {
    tag = memory.ensureStartSelfClosed(tag);
    return memory.ensure(seed, tag);
  };
}

interface ClosedEdgeDefinition {
  readonly carrier: LinkHandle;
  readonly edgeCarrier: LinkHandle;
}

function materializeClosedEdgeDefinition(
  memory: Memory,
  theory: LinkHandle,
  closedMode: LinkHandle,
  context: LinkHandle,
  edges: readonly LinkHandle[],
): ClosedEdgeDefinition {
  const edgeCarrier = materializeExactSequence(memory, edges);
  const carrier = materializeExactSequence(memory, [theory, closedMode, context, edgeCarrier]);
  return Object.freeze({ carrier, edgeCarrier });
}

type EdgeJudgment = "present" | "absent";

/**
 * Производное отрицательное суждение относится только к явно закрытой
 * конечной экспозиции. Query Link не материализуется: искомая пара задаётся
 * своими полюсами, а полная последовательность предъявленных edges читается
 * структурно и исчерпывающе.
 */
function judgeClosedEdge(
  memory: ReadMemory,
  definition: LinkHandle,
  expectedTheory: LinkHandle,
  expectedClosedMode: LinkHandle,
  expectedContext: LinkHandle,
  start: LinkHandle,
  end: LinkHandle,
): EdgeJudgment {
  const before = memory.linkCount;
  try {
    const decodedDefinition = readExactSequence(memory, definition).values;
    if (decodedDefinition.length !== 4) invalid();

    const [theory, mode, context, edgeCarrier] = decodedDefinition;
    if (
      theory !== expectedTheory
      || mode !== expectedClosedMode
      || context !== expectedContext
      || edgeCarrier === undefined
    ) invalid();

    const edges = readExactSequence(memory, edgeCarrier).values;
    let result: EdgeJudgment = "absent";
    for (const edge of edges) {
      const poles = memory.poles(edge);
      if (poles.start === start && poles.end === end) {
        result = "present";
        break;
      }
    }

    if (memory.linkCount !== before) invalid();
    return result;
  } catch (error) {
    if (error instanceof ClosedEdgeJudgmentError) throw error;
    if (error instanceof ExactSequenceError) invalid();
    throw error;
  }
}

function rejectClosed(effect: () => unknown): void {
  try {
    effect();
  } catch (error) {
    assert(error instanceof ClosedEdgeJudgmentError, `ожидалась ClosedEdgeJudgmentError: ${String(error)}`);
    same(error.code, "invalid-closed-edge-definition", "код ошибки closed edge");
    return;
  }
  throw new Error("ожидалось отклонение неверного closed definition");
}

// U — существующая semantic Link, несущая смысл несвязи; это не отсутствие.
{
  const memory = new Memory();
  const basis = ensureRootBasis(memory);
  const poles = memory.poles(basis.U);
  same(poles.start, basis.C, "U начинается в C");
  same(poles.end, basis.O, "U заканчивается в O");
  same(memory.ensure(basis.C, basis.O), basis.U, "U канонически существует как C⟼O");
}

// Полная finite exposition различает наличие и отсутствие именно в выбранном C.
// Глобально существующая связь может отсутствовать в этом закрытом контексте.
{
  const memory = new Memory();
  const next = refFactory(memory);
  const theory = next();
  const closedMode = next();
  const contextA = next();
  const contextB = next();
  const A = next();
  const B = next();
  const D = next();

  const AB = memory.ensure(A, B);
  const AD = memory.ensure(A, D);
  const closedA = materializeClosedEdgeDefinition(memory, theory, closedMode, contextA, [AB]);
  const closedB = materializeClosedEdgeDefinition(memory, theory, closedMode, contextB, [AD]);

  const before = memory.linkCount;
  const probe = new PolesOnlyProbe(memory);
  same(judgeClosedEdge(probe, closedA.carrier, theory, closedMode, contextA, A, B), "present", "A⟼B есть в contextA");
  same(judgeClosedEdge(probe, closedA.carrier, theory, closedMode, contextA, A, D), "absent", "A⟼D отсутствует в contextA");
  same(judgeClosedEdge(probe, closedB.carrier, theory, closedMode, contextB, A, D), "present", "A⟼D есть в contextB");
  same(memory.linkCount, before, "closed edge judgments read-only");

  // Особенно важно: AD существует в общей Memory, но closedA всё равно доказывает
  // только локальное NoEdge_contextA(A,D), а не глобальное несуществование AD.
  same(memory.ensure(A, D), AD, "глобально существующий AD не исчезает из-за локального NoEdge");
}

// Пустая закрытая экспозиция — положительное evidence пустоты, а не not-found.
{
  const memory = new Memory();
  const next = refFactory(memory);
  const theory = next();
  const closedMode = next();
  const context = next();
  const A = next();
  const B = next();
  const definition = materializeClosedEdgeDefinition(memory, theory, closedMode, context, []);

  same(definition.edgeCarrier, memory.root, "пустой ExactSequence edges представлен R");
  const before = memory.linkCount;
  same(
    judgeClosedEdge(new PolesOnlyProbe(memory), definition.carrier, theory, closedMode, context, A, B),
    "absent",
    "закрытая пустая экспозиция доказывает локальное отсутствие A⟼B",
  );
  same(memory.linkCount, before, "пустое negative judgment read-only");
}

// Повтор semantic edge создаёт две позиции evidence, но не две semantic Links.
{
  const memory = new Memory();
  const next = refFactory(memory);
  const theory = next();
  const closedMode = next();
  const context = next();
  const A = next();
  const B = next();
  const AB = memory.ensure(A, B);
  const definition = materializeClosedEdgeDefinition(memory, theory, closedMode, context, [AB, AB]);
  const decoded = readExactSequence(memory, definition.edgeCarrier).values;

  same(decoded.length, 2, "две occurrence-позиции AB сохранены");
  same(decoded[0], AB, "первая occurrence указывает на один semantic AB");
  same(decoded[1], AB, "вторая occurrence указывает на тот же semantic AB");
  same(judgeClosedEdge(memory, definition.carrier, theory, closedMode, context, A, B), "present", "multiplicity не меняет membership");
  same(memory.ensure(A, B), AB, "повтор occurrence не создаёт второй semantic AB");
}

// Closed judgment обязан быть привязан к exact theory/mode/context.
{
  const memory = new Memory();
  const next = refFactory(memory);
  const theory = next();
  const otherTheory = next();
  const closedMode = next();
  const otherMode = next();
  const context = next();
  const otherContext = next();
  const A = next();
  const B = next();
  const AB = memory.ensure(A, B);
  const definition = materializeClosedEdgeDefinition(memory, theory, closedMode, context, [AB]);

  rejectClosed(() => judgeClosedEdge(memory, definition.carrier, otherTheory, closedMode, context, A, B));
  rejectClosed(() => judgeClosedEdge(memory, definition.carrier, theory, otherMode, context, A, B));
  rejectClosed(() => judgeClosedEdge(memory, definition.carrier, theory, closedMode, otherContext, A, B));
}

// Произвольная Link или definition с не-ExactSequence edge carrier не дают
// closed-world authority. Нельзя получить отрицание из открытой Memory.
{
  const memory = new Memory();
  const next = refFactory(memory);
  const theory = next();
  const closedMode = next();
  const context = next();
  const A = next();
  const B = next();
  const randomLink = memory.ensure(A, B);

  rejectClosed(() => judgeClosedEdge(memory, randomLink, theory, closedMode, context, A, B));

  const malformedEdgeCarrier = memory.ensure(next(), next());
  const malformedDefinition = materializeExactSequence(memory, [
    theory,
    closedMode,
    context,
    malformedEdgeCarrier,
  ]);
  rejectClosed(() => judgeClosedEdge(memory, malformedDefinition, theory, closedMode, context, A, B));
}

// Open-memory not-found остаётся лишь результатом поиска. Сам по себе он не
// является аргументом judgeClosedEdge, которому обязательно нужен closed Def.
{
  const memory = new Memory();
  const next = refFactory(memory);
  const A = next();
  const B = next();
  same(memory.find(A, B), undefined, "open Memory действительно может не найти A⟼B");

  const theory = next();
  const closedMode = next();
  const context = next();
  const definition = materializeClosedEdgeDefinition(memory, theory, closedMode, context, []);
  same(
    judgeClosedEdge(new PolesOnlyProbe(memory), definition.carrier, theory, closedMode, context, A, B),
    "absent",
    "отрицательное суждение появляется только после предъявления closed Def",
  );
}
