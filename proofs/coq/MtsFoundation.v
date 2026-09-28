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

Axiom link_ext :
  forall x y : Link,
    start x = start y ->
    finish x = finish y ->
    x = y.

Axiom root_self :
  form R R = R.

End MTS_FOUNDATION.
