# Referral program

A customer shares a code; a friend uses it on their first order; when that order is delivered the customer earns a reward coupon.

## Settings

Two amounts in taka on the business profile (dashboard, same place as the free-delivery minimum):

- `referral_friend_discount`: fixed discount the friend gets on their first order.
- `referral_reward_amount`: value of the coupon the referrer earns.

The program is off while either is unset or 0. No default amounts exist.

## Flow

1. `GET /api/v1/customer/referral/` makes (on first call) and returns the customer's share code, the amounts, and earned reward coupons. The code is a `Coupon` row with `referrer` set. Its discount is read from the setting each time, so changing the amount applies to every shared code.
2. The storefront stores `?ref=CODE` for 30 days and pre-fills the checkout coupon box. The code goes through the normal coupon paths (`/customer/orders/cart/coupon/`, `/public/checkout/coupon/`, guest checkout), so errors look the same.
3. `checkout()` calls `record_referral`: a `Referral` row (`pending`) with the reward amount fixed at that moment.
4. The delivered transition (`set_order_status` and the shipment completion rule) calls `reward_referral`. Under a row lock, a pending referral becomes `rewarded` and a single-use `RW-` coupon is issued (usage limit 1, valid 180 days). A repeat call does nothing.
5. `cancel_order` marks a pending referral `void`. An order that never reaches delivered never rewards.

## Rules

- Not for the referrer's own account, phone or email (`referral_own_code`). A self-referral that only shows after checkout is voided at delivery.
- First order only: refused when the customer or phone/email already has a non-cancelled placed order (`referral_not_first_order`).
- One coupon per order, so a referral code never stacks with another coupon.
- Pre-order baskets refuse coupons already.
- Referral share codes are hidden from the staff coupon list.

## Staff

Marketing > Referrals lists every referral (referrer, order, status, reward coupon, dates). It is read-only and uses the coupon view permission.
