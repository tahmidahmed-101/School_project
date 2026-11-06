import { describe, expect, it } from "vitest";
import { DICT } from "@/lib/dictionary";

const BN_SCRIPT = /[ঀ-৿]/;
const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

const entries = Object.entries(DICT) as [string, { en: string; bn: string }][];

describe("DICT en/bn parity", () => {
  it("has both languages filled for every key", () => {
    const empty = entries.filter(([, v]) => !v.en?.trim() || !v.bn?.trim()).map(([k]) => k);
    expect(empty).toEqual([]);
  });

  it("writes bn in its own script unless the text equals en (emails, brand names)", () => {
    const leaked = entries.filter(([, v]) => v.bn !== v.en && !BN_SCRIPT.test(v.bn)).map(([k]) => k);
    expect(leaked).toEqual([]);
  });

  it("keeps the same {placeholders} in both languages", () => {
    const mismatched = entries
      .filter(([, v]) => placeholders(v.en).join() !== placeholders(v.bn).join())
      .map(([k]) => k);
    expect(mismatched).toEqual([]);
  });
});
