// Run with `npm run test:unit`.
import assert from "node:assert/strict"
import { describe, test } from "node:test"

import { sumCostLines } from "../../src/lib/money.ts"

describe("sumCostLines", () => {
  test("sums at full precision and rounds once", () => {
    const line = { unitCost: "0.3350", quantity: 1 }
    assert.equal(sumCostLines([line]), "0.34")
    assert.equal(sumCostLines([line, line, line]), "1.01")
  })

  test("is exact where floats are not", () => {
    assert.equal(sumCostLines([{ unitCost: "1.005", quantity: 1 }]), "1.01")
    assert.equal(sumCostLines([{ unitCost: "0.1", quantity: 3 }]), "0.30")
  })

  test("skips a line that is not filled in yet", () => {
    assert.equal(sumCostLines([{ unitCost: "", quantity: 2 }, { unitCost: "12.5", quantity: 0 }]), "0.00")
    assert.equal(sumCostLines([{ unitCost: undefined, quantity: 1 }, { unitCost: "20", quantity: 2 }]), "40.00")
  })
})
