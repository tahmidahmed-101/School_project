// Run with `npm run test:unit`.
import assert from "node:assert/strict"
import { describe, test } from "node:test"

import {
  adoptKnownSpelling,
  buildCombinations,
  cleanOptionText,
  combinationKey,
  effectiveDefault,
  optionProblems,
  optionsBody,
  optionsChanged,
  refusalMessage,
  valueRefusal,
  type OptionDraft,
} from "../../src/features/catalog/lib/options.ts"

const option = (name: string, values: string[], extra: Partial<OptionDraft> = {}): OptionDraft => ({
  key: name || "blank",
  name,
  values: values.map((value) => ({ value })),
  default_value: "",
  ...extra,
})

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

describe("optionProblems", () => {
  test("a complete set has none", () => {
    assert.deepEqual(optionProblems([option("Size", ["S", "M"]), option("Colour", ["Red"])], false), {})
  })

  test("names must be present and different, and every option needs a value", () => {
    const problems = optionProblems([option("Size", ["S"]), option("size ", ["M"], { key: "b" }), option("", ["x"])], false)
    assert.match(problems.b, /already an option called "size"/)
    assert.match(problems.blank, /name/)
    assert.match(optionProblems([option("Size", [])], false).Size, /at least one value/)
  })

  test("a new option on a product with variants needs the value they get", () => {
    assert.match(optionProblems([option("Size", ["S", "M"])], true).Size, /existing variants/)
    assert.deepEqual(optionProblems([option("Size", ["S", "M"], { default_value: "M" })], true), {})
    assert.deepEqual(optionProblems([option("Size", ["S", "M"], { id: "saved" })], true), {})
  })

  test("the only value is the default without asking", () => {
    assert.equal(effectiveDefault(option("Size", ["One size"])), "One size")
    assert.equal(effectiveDefault(option("Size", ["S", "M"], { default_value: "L" })), "")
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

describe("optionsBody", () => {
  test("keeps ids, sends the default only for a new option", () => {
    const saved = option("Colour", [], { id: "o1", values: [{ id: "v1", value: "Red" }, { value: "Blue" }] })
    const added = option(" Size ", ["S", "M"], { default_value: "M" })
    assert.deepEqual(optionsBody([saved, added], true), {
      options: [
        { id: "o1", name: "Colour", values: [{ id: "v1", value: "Red" }, { value: "Blue" }] },
        { name: "Size", default_value: "M", values: [{ value: "S" }, { value: "M" }] },
      ],
    })
    assert.equal("default_value" in optionsBody([added], false).options[0], false)
  })
})

describe("optionsChanged", () => {
  const saved = [{ id: "o1", name: "Colour", values: [{ id: "v1", value: "Red" }] }]
  const draft = option("Colour", [], { id: "o1", values: [{ id: "v1", value: "Red" }] })

  test("false while nothing differs", () => {
    assert.equal(optionsChanged(saved, [draft]), false)
  })

  test("true after a rename, a new value or a removal", () => {
    assert.equal(optionsChanged(saved, [{ ...draft, name: "Color" }]), true)
    assert.equal(optionsChanged(saved, [{ ...draft, values: [...draft.values, { value: "Blue" }] }]), true)
    assert.equal(optionsChanged(saved, []), true)
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
