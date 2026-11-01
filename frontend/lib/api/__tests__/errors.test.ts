import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api/client";
import { isUnexpectedError } from "@/lib/api/errors";

const api = (status: number) => new ApiError({ status, code: "x", message: "m" });

describe("isUnexpectedError", () => {
  it("ignores wrong passwords and validation answers", () => {
    expect(isUnexpectedError(api(400))).toBe(false);
    expect(isUnexpectedError(api(401))).toBe(false);
    expect(isUnexpectedError(api(429))).toBe(false);
  });

  it("flags server errors and non-API throws", () => {
    expect(isUnexpectedError(api(500))).toBe(true);
    expect(isUnexpectedError(new TypeError("x is undefined"))).toBe(true);
  });
});
