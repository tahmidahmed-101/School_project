// Run with `npm run test:unit`.
import assert from "node:assert/strict"
import { describe, test } from "node:test"

import { formatBdt, fromPaisa, sumMoney, toPaisa } from "../../src/lib/money.ts"

const BANGLA_TWELVE = "১২"
const TAKA = String.fromCharCode(0x9f3)

describe("toPaisa", () => {
  const cases: [string | null | undefined, bigint][] = [
    ["12.345", BigInt(1235)],
    ["12.344", BigInt(1234)],
    ["0.005", BigInt(1)],
    ["0.004", BigInt(0)],
    [".5", BigInt(50)],
    ["5.", BigInt(500)],
    ["  7.5  ", BigInt(750)],
    ["-1.005", BigInt(-101)],
    ["", BigInt(0)],
    ["   ", BigInt(0)],
    [null, BigInt(0)],
    [undefined, BigInt(0)],
  ]
  for (const [text, paisa] of cases) {
    test(`${JSON.stringify(text)} is ${paisa} paisa`, () => assert.equal(toPaisa(text), paisa))
  }

  for (const text of ["1,23", "abc", "1.2.3", "--1", BANGLA_TWELVE, "1e3", `${TAKA}5`]) {
    test(`${JSON.stringify(text)} throws`, () => assert.throws(() => toPaisa(text), /not an amount/))
  }
})

describe("fromPaisa and sumMoney", () => {
  test("formats with two decimals and a sign", () => {
    assert.equal(fromPaisa(BigInt(5)), "0.05")
    assert.equal(fromPaisa(BigInt(-1235)), "-12.35")
  })

  test("adds in paisa", () => {
    assert.equal(sumMoney(["0.1", "0.2", null, ""]), "0.30")
    assert.equal(sumMoney(["1.005", "1.005"]), "2.02")
  })

  test("formatBdt uses lakh grouping", () => {
    assert.equal(formatBdt("12345678.5"), `${TAKA}1,23,45,678.50`)
  })
})
