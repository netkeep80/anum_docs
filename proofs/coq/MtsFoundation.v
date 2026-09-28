Module Type MTS_FOUNDATION.

Parameter Link : Type.
Parameter form : Link -> Link -> Link.
Parameter start : Link -> Link.
Parameter finish : Link -> Link.
Parameter R : Link.

Axiom form_start :
  forall a b : Link, start (form a b) = a.

Axiom form_finish :
  forall a b : Link, finish (form a b) = b.

(* Pole extensionality/A6 is deliberately absent here.
   Accepted proof order is A1 + F2/F3 -> A2 unique ROOT -> A6. *)
Axiom root_self :
  form R R = R.

End MTS_FOUNDATION.
