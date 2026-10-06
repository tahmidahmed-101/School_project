// Run with `npm run test:unit`.
import assert from "node:assert/strict"
import { describe, test } from "node:test"

import { isBlockedByStock, stockLevelsPath } from "../../src/features/catalog/deleteGuard.ts"

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

describe("stockLevelsPath", () => {
  test("links to Stock Levels searched for the product", () => {
    assert.equal(stockLevelsPath("Silk Saree"), "/inventory?search=Silk%20Saree")
    assert.equal(stockLevelsPath("Tea & Co"), "/inventory?search=Tea%20%26%20Co")
  })
})
