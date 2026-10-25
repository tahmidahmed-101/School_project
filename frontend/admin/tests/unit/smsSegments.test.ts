// Run with `npm run test:unit`.
import assert from "node:assert/strict"
import { describe, test } from "node:test"

import { smsLength } from "../../src/features/marketing/lib/smsSegments.ts"

describe("smsLength", () => {
  test("an empty message is no segments", () => {
    assert.deepEqual(smsLength(""), { encoding: "GSM-7", units: 0, segments: 0, remaining: 160 })
  })

  test("plain English fits 160 in one segment and 153 per part after that", () => {
    assert.equal(smsLength("a".repeat(160)).segments, 1)
    assert.equal(smsLength("a".repeat(161)).segments, 2)
    assert.equal(smsLength("a".repeat(306)).segments, 2)
    assert.equal(smsLength("a".repeat(307)).segments, 3)
  })

  test("extended GSM characters count twice", () => {
    const result = smsLength("{}")
    assert.equal(result.encoding, "GSM-7")
    assert.equal(result.units, 4)
  })

  test("Bangla is Unicode: 70 in one segment and 67 per part after that", () => {
    const one = smsLength("অ".repeat(70))
    assert.equal(one.encoding, "Unicode")
    assert.equal(one.segments, 1)
    assert.equal(smsLength("অ".repeat(71)).segments, 2)
    assert.equal(smsLength("অ".repeat(134)).segments, 2)
    assert.equal(smsLength("অ".repeat(135)).segments, 3)
  })

  test("one Bangla letter makes the whole message Unicode", () => {
    const result = smsLength("a".repeat(100) + "অ")
    assert.equal(result.encoding, "Unicode")
    assert.equal(result.segments, 2)
  })

  test("an emoji takes two units", () => {
    assert.equal(smsLength("😀").units, 2)
  })

  test("remaining counts down to the end of the current segment", () => {
    assert.equal(smsLength("a".repeat(150)).remaining, 10)
    assert.equal(smsLength("a".repeat(160)).remaining, 0)
    assert.equal(smsLength("a".repeat(161)).remaining, 145)
  })
})
