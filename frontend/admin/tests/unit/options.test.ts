// Run with `npm run test:unit`.
import assert from "node:assert/strict"
import { describe, test } from "node:test"

import {
  adoptKnownSpelling,
  buildCombinations,
  cleanOptionText,
  combinationKey,
  refusalMessage,
  valueRefusal,
} from "../../src/features/catalog/lib/options.ts"

describe("value normalising", () => {
  test("trims and collapses inner spaces, keeping the casing typed", () => {
    assert.equal(cleanOptionText("  Navy   Blue "), "Navy Blue")
  })

  test("takes the spelling the shop already uses", () => {
    assert.equal(adoptKnownSpelling(" red ", ["Red", "Blue"]), "Red")
    assert.equal(adoptKnownSpelling("Teal", ["Red", "Blue"]), "Teal")
  })
})

describe("valueRefusal", () => {
  test("refuses an empty value", () => {
    assert.equal(valueRefusal(["S"], "   "), "Type a value first.")
  })

  test("refuses a duplicate whatever its case or spacing", () => {
    assert.equal(valueRefusal(["Red", "Navy Blue"], "red"), '"Red" is already in this list.')
    assert.equal(valueRefusal(["Red", "Navy Blue"], " navy  blue"), '"Navy Blue" is already in this list.')
  })

  test("accepts a new value", () => {
    assert.equal(valueRefusal(["Red"], "Green"), null)
  })
})

describe("buildCombinations", () => {
  test("lists every combination in option order", () => {
    assert.deepEqual(buildCombinations([["Red", "Blue"], ["S", "M"]]), [
      ["Red", "S"],
      ["Red", "M"],
      ["Blue", "S"],
      ["Blue", "M"],
    ])
  })

  test("three options multiply", () => {
    assert.equal(buildCombinations([["a", "b"], ["1", "2", "3"], ["x", "y"]]).length, 12)
  })

  test("nothing until every option has a value", () => {
    assert.deepEqual(buildCombinations([]), [])
    assert.deepEqual(buildCombinations([["Red"], []]), [])
  })

  test("keys tell combinations apart", () => {
    assert.equal(combinationKey(["Red", "S"]), combinationKey(["red ", "s"]))
    assert.notEqual(combinationKey(["Red", "S"]), combinationKey(["S", "Red"]))
  })
})

describe("refusalMessage", () => {
  test("puts a known refusal code in plain words", () => {
    assert.match(refusalMessage({ code: "last_variant", message: "x" }, "fallback"), /at least one variant/)
    assert.match(refusalMessage({ code: "variant_in_use", message: "x" }, "fallback"), /on an order/)
  })

  test("falls back to the server's message, then to the given text", () => {
    assert.equal(refusalMessage({ code: "other", message: "Server said no" }, "fallback"), "Server said no")
    assert.equal(refusalMessage(new Error(""), "fallback"), "fallback")
  })
})
