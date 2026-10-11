// Run with `npm run test:unit`.
import assert from "node:assert/strict"
import { describe, test } from "node:test"

import { isBlockedByStock, isDeletable, stockTotals } from "../../src/features/catalog/deleteGuard.ts"

describe("isBlockedByStock", () => {
  test("recognises the backend's stock refusal", () => {
    assert.equal(isBlockedByStock({ status: 409, code: "product_stock_in_use", message: "…" }), true)
  })

  test("ignores other errors", () => {
    assert.equal(isBlockedByStock({ status: 404, code: "product_not_found" }), false)
    assert.equal(isBlockedByStock({ status: 403, code: "permission_denied" }), false)
    assert.equal(isBlockedByStock(new Error("network")), false)
    assert.equal(isBlockedByStock(null), false)
  })
})

describe("stockTotals", () => {
  test("sums every variant and warehouse", () => {
    const rows = [
      { quantity_on_hand: 5, quantity_reserved: 2 },
      { quantity_on_hand: 3, quantity_reserved: 0 },
    ]
    assert.deepEqual(stockTotals(rows), { onHand: 8, reserved: 2, available: 6 })
    assert.deepEqual(stockTotals([]), { onHand: 0, reserved: 0, available: 0 })
  })
})

describe("isDeletable", () => {
  test("only with no stock, nothing reserved and no active reservation", () => {
    const empty = [{ quantity_on_hand: 0, quantity_reserved: 0 }]
    assert.equal(isDeletable(empty, 0), true)
    assert.equal(isDeletable([], 0), true)
    assert.equal(isDeletable([{ quantity_on_hand: 1, quantity_reserved: 0 }], 0), false)
    // A bundle holds nothing itself; its orders hold its components.
    assert.equal(isDeletable(empty, 1), false)
  })
})
