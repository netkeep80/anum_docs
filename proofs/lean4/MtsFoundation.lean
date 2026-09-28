namespace MTS.External

/--
Minimal external embedding interface for the accepted MTS Link foundation.

This file intentionally states no theorem from the P0 inventory.  In
particular it does not enumerate self-incidence cases and does not assume
uniqueness of full self-closure.  Those obligations belong to the reviewed
model/proof phases.
-/
structure Foundation where
  Link : Type
  form : Link → Link → Link
  start : Link → Link
  finish : Link → Link
  R : Link

  form_start : ∀ a b, start (form a b) = a
  form_finish : ∀ a b, finish (form a b) = b

  /--
  Accepted historical dependency order forbids pole extensionality here:
  A2/unique ROOT is derived from A1 + F2/F3 finite grounding first;
  A6/identity by ordered poles is downstream of that result.
  -/
  root_self : form R R = R

end MTS.External
