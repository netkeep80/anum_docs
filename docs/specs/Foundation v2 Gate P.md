# Foundation v2 — Gate P candidate

Статус: **production/reference candidate**, не accepted release.

Главный epic: #237. Завершены exact-occurrence substrate #240/#241, state/apamemory #243/#244, source front-end #245/#246, relation replay #247/#248, persistent scoped `D` + `:` #249/#250 и local `=` #251/#252. Текущий слой: exact multistep run #253. Sequence-deserialization: #242. Persistent L4 backend: #124.

Цель Gate P — собрать **один** production/reference semantic path, затем опубликовать следующую версию МТС, которую сможет точно потреблять `aprover`.

## 1. Каноническая лестница Foundation v2

```text
binary link ontology
→ distinguished R/O/C/L/U bootstrap
→ exact-occurrence finite link networks
→ root-relative Anum descriptions where defined
→ canonical UTF-8/astring source content
→ exact source occurrence
→ selected exact segmentation
→ scoped D + explicit G/T evidence
→ explicit K/current
→ one trusted interpreter/replay engine
→ relation / : / = acts
→ exact ordered run of actual acts
→ separately admitted theory-rule/proof replay
→ accepted contract
→ aprover
```

Ключевые границы:

```text
source != semantic form
form != theory membership
structure != exact occurrence identity
read/find/replay != materialize
candidate search != trusted replay
local equality != global rewrite system
act adjacency != logical transitivity
```

## 2. Production substrate

Foundation-v2 substrate:

```text
OccurrenceRef
Link(start,end)
LinkNetwork
```

`Link` имеет только `start/end`; sharing и cycles являются native конечной структурой.

```text
X1 = a ⟼ b
X2 = a ⟼ b
X1 != X2
```

Shape/isomorphism и physical backend address не определяют semantic identity.

## 3. Source, context и actual act — тоже связи

Source content и occurrence:

```text
C0 = R
C(n+1) = Cn ⟼ B(byte_n)
S = S ⟼ C
```

Context:

```text
P = parent ⟼ current
K = K ⟼ P
↑ = current from exact active K
```

Actual act:

```text
P0 = D_roles ⟼ K_after
H  = I ⟼ P0
A  = A ⟼ H

Field = roleRef ⟼ value
A ⟼ Field
```

Host field names — checker API, а semantic role identity задаётся exact refs.

## 4. Один source front-end

```text
raw bytes
→ canonical C
→ exact S
→ untrusted candidate segmentation
→ selected exact spans
→ visible scoped-D declaration occurrences
→ ordered exact forms
→ explicit G/T admission
→ read-only replay
```

Selected slice:

```text
Span = sourcePrefix(start) ⟼ sourcePrefix(end)
SliceEvidence = Span ⟼ sliceContent
Lexeme = S ⟼ SliceEvidence
Resolution = Lexeme ⟼ form
Selection = visibleDefinitionOccurrence ⟼ Resolution
```

UTF-8 `⟼` может быть одним многобайтным selected slice. Candidate search может использовать любые эвристики, но trusted replay проверяет selected exact evidence.

## 5. Persistent scoped dictionary D

```text
ScopePayload = parentScope ⟼ localHistory
D = D ⟼ ScopePayload
```

Definition effect:

```text
Entry      = sourceContent ⟼ form
Occurrence = D_before ⟼ Entry
H_after    = H_before ⟼ Occurrence
D_after    = D_after ⟼ (sameParentScope ⟼ H_after)
```

Lookup:

```text
local first
local mapping shadows parent
local miss falls through to parent
same local source + same form = one mapping, many declaration occurrences allowed
distinct local forms = conflict
no last-write-wins
```

Arbitrary global `D_old⟼Entry` is not visible without exact history/parent reachability.

## 6. Один interpreter/replay engine

### 6.1. Relation-resolution act

```text
exact source evidence
→ selected partial F
→ exact K/current
→ binding = ↑
→ structural pole resolution
→ exact result X
→ persistent K_after
→ actual A
```

```text
F = F ⟼ e  => X = current ⟼ e
F = b ⟼ F  => X = b ⟼ current
```

Direction comes from exact form structure, not glyph/AST/opcode.

### 6.2. Persistent `:`

The same engine verifies:

```text
S = S ⟼ sourceContent
Entry = sourceContent ⟼ form
Occurrence = D_before ⟼ Entry
H_after = H_before ⟼ Occurrence
parent(D_after) = parent(D_before)
history(D_after) = H_after
```

```text
: != =
: != theorem assertion
: != recursive RHS evaluation
```

### 6.3. Local exact representative `=`

```text
K = K ⟼ (parent ⟼ current)
Pair = member ⟼ representative
Binding = K ⟼ Pair
```

```text
rep_K(x) = one explicit local representative, else x
Equal_K(a,b) iff rep_K(a) and rep_K(b) are the same exact occurrence
```

Only one hop is used. Duplicate same-representative occurrences are unambiguous provenance; distinct representatives conflict.

No automatic transitivity, substitution, congruence, global rewrite or graph-shape equality is imported. Equality evaluation is itself an actual `A`; host boolean is only convenience.

Relation decomposition is not built into `=` and may only appear later as a separately admitted one-step `T` rule.

## 7. Exact multistep run

Gate #253 adds the production run-continuity layer needed by `aprover` without inventing a new proof calculus.

### 7.1. Ordered run container

```text
Run_0 = R
Run_(i+1) = Run_i ⟼ A_i
```

The final exact `Run_n` identifies the selected run. Host array order is not semantic authority: trusted replay walks the exact run links backwards and confirms every exact `A_i` in order.

### 7.2. Generic act boundaries

Each selected step supplies exact role refs for:

```text
A ⟼ (beforeRole ⟼ K_before)
A ⟼ (afterRole  ⟼ K_after)
```

and the Gate-R act header must also select the same exact `K_after`.

For an observational/no-context-change act:

```text
K_before = K_after
```

This permits relation, `:`, `=` and later admitted theory-rule acts to share one run protocol without the run checker reimplementing their operator semantics.

### 7.3. Exact continuity

The semantic invariant is:

```text
A_i.after = K_(i+1)
A_(i+1).before = K_(i+1)
```

using **the same exact occurrence ref**.

Two contexts with the same parent/current topology are not interchangeable:

```text
K1  = K1  ⟼ (P ⟼ X)
K1' = K1' ⟼ (P ⟼ X)
K1 != K1'
```

So:

```text
A0.after = K1
A1.before = K1'
```

is a broken run even though the snapshots look the same.

### 7.4. Cycles, branches and repeated acts

Finite returns are ordinary finite runs:

```text
K0 --A0--> K1 --A1--> K0
```

No recursive graph unfolding is needed.

Two candidate branches may coexist:

```text
          A1 → K1
K0 ──────┤
          A2 → K2
```

Trusted replay validates only the exact selected run. Branch discovery/ranking belongs to untrusted proof search.

Otherwise-identical no-op acts can remain different exact occurrences:

```text
K0 --A0--> K0 --A1--> K0
A0 != A1
```

and the run chain preserves their exact order.

### 7.5. What adjacency does not mean

From:

```text
K0 --A0--> K1 --A1--> K2
```

the run checker does **not** infer or materialize:

```text
K0 → K2
```

and does not derive:

```text
logical transitivity
modus ponens
theorem status
substitution
congruence
```

Run continuity is execution/provenance structure, not a logical rule.

### 7.6. Layered trust boundary for aprover

```text
untrusted proof search
→ selected exact acts + Run_n
→ replay each act with the unified interpreter engine
→ replay exact run continuity
→ replay separately admitted T rules
```

This separation means the algorithm that *found* a proof does not need to be trusted if the chosen proof can be replayed deterministically.

## 8. Апамять как controller сети

Подробно: [Апамять и управление сетью связей](Апамять%20и%20управление%20сетью%20связей.md).

```text
read / find / enumerate / replay != materialize / delete
```

Therefore:

```text
source carrier != result network
query description != queried fact
replay evidence != application effect
```

Context, dictionary scopes, local equality bindings, actual acts and run containers are all ordinary link-network evidence. This is the practical value of apamemory: program state and proof provenance can live in the same exact relational substrate as application data without becoming hidden host metadata.

## 9. Ачисло и future sequence deserialization

Recursive Anum is already a root-relative structural description on its occurrence-tree domain, but full sequence materialization remains #242.

Candidate historical principle:

```text
∞ A B C
```

may explicitly materialize:

```text
A ⟼ B
B ⟼ C
```

with nested-context semantics, but only after executable #242 acceptance.

We keep separate:

```text
source front-end   = read/resolve source evidence
interpreter replay = validate selected semantic act
run replay         = validate exact act order/K continuity
Anum→апамять       = explicit result-network materialization
```

## 10. Next proof gate

After #253, the next step toward `aprover` is **separately admitted theory-rule replay**, not another global operator semantics.

In particular, relation decomposition may be represented as an explicit `T`-admitted one-step rule that emits local pole constraints, but it must not become a hidden built-in consequence of `=` and must not recurse automatically.

## 11. Remaining release path

```text
exact multistep run #253
→ separately admitted theory-rule/proof replay
→ sequence-to-apamemory #242
→ persistent L4 boundary #124
→ historical compatibility classification
→ integrated end-to-end conformance
→ explicit acceptance decision
→ atomic production cutover
→ publish next MTS version
→ repin aprover
```

Forbidden final state:

```text
legacy semantics + Foundation-v2 semantics selectable by flag
```

After acceptance the active production tree must contain one canonical semantic path; Git preserves history.
