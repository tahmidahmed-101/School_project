# Payment methods

`Payment.method` was a free-text `CharField` — no registry, no toggle, no
validation. Anything a client sent was stored, so `Card`, `card` and `CARD`
were three different methods to every report that grouped by it.

## Where the truth lives

`apps/orders/constants.py` holds `PaymentMethodKey` and
`PAYMENT_METHOD_REGISTRY`: the key, label, description, and whether the method
may be withdrawn. `PaymentMethodSetting` records only the operator's choice,
the same split the module registry uses.

`manual` carries `can_disable=False`. Staff need somewhere to record a payment
that fits no other method, and a system where every method is off cannot take
money at all.

## Enforcement

`capture_payment` refuses an unknown key (`unknown_payment_method`) and a
withdrawn one (`payment_method_disabled`). The serializers are `ChoiceField`s
over the same registry, so a bad value is a 400 rather than a stored string.

Withdrawing a method does not touch payments already recorded against it —
history is what happened, not what is currently on offer.

## Legacy values

Migration `orders/0013_normalize_payment_methods` maps the free text written
before the registry onto keys via `normalize_payment_method`. Anything still
unrecognised becomes `manual`: a payment that happened is not erased by a
naming cleanup. There is no reverse — the original spelling is not recoverable.

## Surfaces

| Surface | Path |
| --- | --- |
| Admin list / toggle | `/admin/settings/payment-methods/` |
| Storefront offer | `/public/payment-methods/` — enabled rows only, no operator reasons |
| UI | Settings → Operations → Payment methods |
