import assert from "node:assert/strict"
import { describe, test } from "node:test"

import { AMOUNT_PATTERN, parseAmount, sumTyped } from "../../src/lib/moneyInput.ts"

const BANGLA_TWELVE = "১২"
const BAD = ["1,23", "abc", BANGLA_TWELVE, "-5", "1.234", ".5", "1.", "1e3"]

describe("parseAmount", () => {
  test("blank is 0", () => {
    for (const text of ["", "   ", null, undefined]) assert.equal(parseAmount(text), BigInt(0))
  })

  test("a valid amount is paisa", () => {
    assert.equal(parseAmount(" 12.5 "), BigInt(1250))
    assert.equal(parseAmount("0.01"), BigInt(1))
  })

  test("text that is not an amount is null and never throws", () => {
    for (const text of BAD) assert.equal(parseAmount(text), null, text)
  })

  test("agrees with AMOUNT_PATTERN", () => {
    for (const text of [...BAD, "1", "1.5", "1.55"]) assert.equal(parseAmount(text) !== null, AMOUNT_PATTERN.test(text), text)
  })
})

describe("PaymentDetail refund amount", () => {
  const outstanding = BigInt(5000)
  const amountError = (amount: string) => {
    const typed = parseAmount(amount)
    const paisa = amount.trim() === "" ? outstanding : (typed ?? BigInt(0))
    return amount.trim() !== "" && (typed === null || !(paisa > 0) || paisa > outstanding)
  }

  test("blank refunds everything, a partial amount is accepted", () => {
    assert.equal(amountError(""), false)
    assert.equal(amountError("20.5"), false)
  })

  test("bad text, zero and too much show the field error", () => {
    for (const text of ["1,23", BANGLA_TWELVE, "1.234", "0", "50.01"]) assert.equal(amountError(text), true, text)
  })
})

describe("VendorBills payment amount", () => {
  const outstanding = BigInt(10000)
  const amountValid = (amount: string) => {
    const paisa = parseAmount(amount)
    return paisa !== null && paisa > 0 && paisa <= outstanding
  }

  test("accepts up to the outstanding balance", () => {
    assert.equal(amountValid("100"), true)
    assert.equal(amountValid("100.01"), false)
  })

  test("blank, zero and bad text are invalid", () => {
    for (const text of ["", "0", "1,23", "abc"]) assert.equal(amountValid(text), false, text)
  })
})

describe("CouponForm max discount", () => {
  const zeroIssue = (text: string) => parseAmount(text) === BigInt(0)

  test("only a typed zero is flagged here; bad text is left to the field's own error", () => {
    assert.equal(zeroIssue("0"), true)
    assert.equal(zeroIssue("0.00"), true)
    assert.equal(zeroIssue("10"), false)
    assert.equal(zeroIssue("1,23"), false)
  })
})

describe("discount against price (ProductVariantsSection, GenerateVariantsDialog)", () => {
  const tooHigh = (price: string, discount: string) => {
    const priceBound = parseAmount(price)
    const discountBound = parseAmount(discount)
    return price !== "" && discount !== "" && priceBound !== null && discountBound !== null && discountBound >= priceBound
  }

  test("flags a discount at or above the price", () => {
    assert.equal(tooHigh("100", "100"), true)
    assert.equal(tooHigh("100", "99.99"), false)
  })

  test("a bad price or discount does not throw", () => {
    assert.equal(tooHigh("1,23", "5"), false)
    assert.equal(tooHigh("100", "abc"), false)
    assert.equal(tooHigh("", "5"), false)
  })
})

describe("JournalEntryFormDialog totals", () => {
  test("sumTyped skips text that is not an amount", () => {
    assert.equal(sumTyped(["10", "2.5", "", null]), "12.50")
    assert.equal(sumTyped(["10", "1,23", "abc", BANGLA_TWELVE]), "10.00")
  })

  test("a line is a debit xor a credit, bad text is skipped", () => {
    const lineIssue = (debit: string, credit: string) => {
      const d = parseAmount(debit)
      const c = parseAmount(credit)
      if (d === null || c === null) return false
      return (d > 0) === (c > 0)
    }
    assert.equal(lineIssue("10", ""), false)
    assert.equal(lineIssue("10", "5"), true)
    assert.equal(lineIssue("", ""), true)
    assert.equal(lineIssue("1,23", ""), false)
  })
})
