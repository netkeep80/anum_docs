import Mathlib.Logic.Pairwise
import Lean

open Lean Elab Command

private def expectedMathlibSha : String :=
  "d6893048e0d784c43f3cf098b61299b3a4b4aed0"

private def expectedLeanToolchain : String :=
  "leanprover/lean4:v4.34.0-rc2"

private def corpusRoots : List Name := [
  ``Pairwise,
  ``Pairwise.mono,
  ``Pairwise.eq,
  ``Subsingleton.pairwise,
  ``Function.injective_iff_pairwise_ne,
  ``Function.Injective.pairwise_ne,
  ``Pairwise.comp_of_injective,
  ``Pairwise.of_comp_of_surjective,
  ``Function.Bijective.pairwise_comp_iff,
  ``pairwise_fin_succ_iff,
  ``pairwise_fin_succ_iff_of_isSymm,
  ``Set.Pairwise,
  ``Set.pairwise_of_forall,
  ``Set.Pairwise.imp_on,
  ``Set.Pairwise.imp,
  ``Set.Pairwise.eq,
  ``Set.pairwise_iff_of_refl,
  ``Set.Pairwise.forall₂,
  ``Set.Pairwise.of_forall₂,
  ``Set.Pairwise.on_injective,
  ``Pairwise.set_pairwise
]

private structure ExportNode where
  qualifiedName : Name
  dependencies : List Name
  externalDependencies : List Name
  kind : String
  typeRepr : String
  valueRepr? : Option String

private def insertName (name : Name) : List Name → List Name
  | [] => [name]
  | head :: tail =>
      if name.toString < head.toString then
        name :: head :: tail
      else if name == head then
        head :: tail
      else
        head :: insertName name tail

private def sortUniqueNames (names : List Name) : List Name :=
  names.foldl (fun acc name => insertName name acc) []

private def insertNode (node : ExportNode) : List ExportNode → List ExportNode
  | [] => [node]
  | head :: tail =>
      if node.qualifiedName.toString < head.qualifiedName.toString then
        node :: head :: tail
      else
        head :: insertNode node tail

private def sortNodes (nodes : List ExportNode) : List ExportNode :=
  nodes.foldl (fun acc node => insertNode node acc) []

private def supportedKernel
    (qualifiedName : Name)
    (info : ConstantInfo) : Except String (String × Expr × Option Expr) :=
  match info with
  | .axiomInfo value =>
      .ok ("axiom", value.type, none)
  | .thmInfo value =>
      .ok ("theorem", value.type, some value.value)
  | .defnInfo value =>
      .ok ("definition", value.type, some value.value)
  | _ =>
      .error s!"unsupported kernel form for selected declaration {qualifiedName}"

private def buildNode
    (env : Environment)
    (selected : List Name)
    (qualifiedName : Name) : Except String ExportNode := do
  let some info := env.find? qualifiedName
    | .error s!"selected declaration not found in elaborated environment: {qualifiedName}"
  let (kind, typeExpr, valueExpr?) ← supportedKernel qualifiedName info
  let exprs := typeExpr :: valueExpr?.toList
  let referenced := sortUniqueNames <| exprs.flatMap fun expr => expr.getUsedConstants.toList
  if referenced.contains qualifiedName then
    .error s!"selected declaration has a self dependency: {qualifiedName}"
  else
    let dependencies := referenced.filter fun name => selected.contains name
    let externalDependencies := referenced.filter fun name => !selected.contains name
    .ok {
      qualifiedName
      dependencies
      externalDependencies
      kind
      typeRepr := reprStr typeExpr
      valueRepr? := valueExpr?.map reprStr
    }

private def buildNodes (env : Environment) : Except String (List ExportNode) :=
  corpusRoots.mapM (buildNode env corpusRoots)

private def topoSortAux : Nat → List ExportNode → List Name → Except String (List ExportNode)
  | 0, pending, _ =>
      .error s!"dependency cycle in selected Mathlib M0 corpus ({pending.length} declarations remain)"
  | Nat.succ fuel, pending, emitted =>
      if pending.isEmpty then
        .ok []
      else
        let ready := sortNodes <| pending.filter fun node =>
          node.dependencies.all fun dependency => emitted.contains dependency
        match ready with
        | [] =>
            .error s!"dependency cycle in selected Mathlib M0 corpus ({pending.length} declarations remain)"
        | next :: _ => do
            let remaining := pending.filter fun node => node.qualifiedName != next.qualifiedName
            let tail ← topoSortAux fuel remaining (emitted ++ [next.qualifiedName])
            .ok (next :: tail)

private def topoSort (nodes : List ExportNode) : Except String (List ExportNode) :=
  topoSortAux (nodes.length + 1) nodes []

private def namesJson (names : List Name) : Json :=
  .arr <| names.toArray.map fun name => .str name.toString

private def kernelJson (node : ExportNode) : Json :=
  let fields := [
    ("kind", Json.str node.kind),
    ("type", Json.str node.typeRepr)
  ]
  match node.valueRepr? with
  | none => Json.mkObj fields
  | some value => Json.mkObj (fields ++ [("value", Json.str value)])

private def declarationJson (node : ExportNode) : Json :=
  Json.mkObj [
    ("qualifiedName", Json.str node.qualifiedName.toString),
    ("dependencies", namesJson node.dependencies),
    ("externalDependencies", namesJson node.externalDependencies),
    ("kernel", kernelJson node)
  ]

private def requireEnv (name : String) : CommandElabM String := do
  let some value ← liftIO <| IO.getEnv name
    | throwError "required exporter environment variable is missing: {name}"
  if value.isEmpty then
    throwError "required exporter environment variable is empty: {name}"
  return value

elab "#mathlib_m0_export" : command => do
  let env ← getEnv
  let outputPath ← requireEnv "MATHLIB_M0_OUTPUT"
  let mathlibSha ← requireEnv "MATHLIB_M0_MATHLIB_SHA"
  let leanToolchain ← requireEnv "MATHLIB_M0_LEAN_TOOLCHAIN"

  unless mathlibSha == expectedMathlibSha do
    throwError "unexpected mathlib SHA: {mathlibSha}"
  unless leanToolchain == expectedLeanToolchain do
    throwError "unexpected Lean toolchain: {leanToolchain}"

  let nodes ←
    match buildNodes env >>= topoSort with
    | .ok nodes => pure nodes
    | .error message => throwError message

  unless 10 ≤ nodes.length && nodes.length ≤ 100 do
    throwError "Mathlib M0 corpus size outside 10-100 declaration boundary: {nodes.length}"

  let document := Json.mkObj [
    ("schema", Json.str "mts-mathlib-m0-transport/v0.1"),
    ("upstream", Json.mkObj [
      ("mathlibSha", Json.str mathlibSha),
      ("leanToolchain", Json.str leanToolchain)
    ]),
    ("declarations", Json.arr <| nodes.toArray.map declarationJson)
  ]

  liftIO <| IO.FS.writeFile outputPath document.compress

#mathlib_m0_export
