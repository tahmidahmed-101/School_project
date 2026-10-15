import { describe, expect, it } from "vitest";
import {
  acceptReviewPhotos,
  MAX_REVIEW_PHOTO_BYTES,
  MAX_REVIEW_PHOTOS,
  reviewFormData,
  toPriceReportInput,
} from "../data/product-extras";

describe("toPriceReportInput", () => {
  it("needs the expected price or a comment", () => {
    expect(toPriceReportInput("", "   ", "v1")).toEqual({ error: "required" });
  });

  it("rejects a price that is not above zero", () => {
    expect(toPriceReportInput("0", "", undefined)).toEqual({ error: "invalid_price" });
    expect(toPriceReportInput("-5", "cheaper elsewhere", undefined)).toEqual({ error: "invalid_price" });
    expect(toPriceReportInput("abc", "", undefined)).toEqual({ error: "invalid_price" });
  });

  it("sends the price as a two-decimal string with the selected variant", () => {
    expect(toPriceReportInput(" 450.5 ", " Seen at another shop ", "v1")).toEqual({
      input: { variant_id: "v1", expected_price: "450.50", comment: "Seen at another shop" },
    });
  });

  it("omits what was not given", () => {
    expect(toPriceReportInput("", "Price changed at checkout", undefined)).toEqual({
      input: { comment: "Price changed at checkout" },
    });
    expect(toPriceReportInput("300", "", undefined)).toEqual({ input: { expected_price: "300.00" } });
  });
});

const file = (name: string, type: string, size = 1000) => {
  const made = new File(["x"], name, { type });
  Object.defineProperty(made, "size", { value: size });
  return made;
};

describe("acceptReviewPhotos", () => {
  it("takes images, including ones with no MIME type", () => {
    const chosen = [file("a.jpg", "image/jpeg"), file("b.heic", "")];
    expect(acceptReviewPhotos(0, chosen)).toEqual({ accepted: chosen, refusal: null });
  });

  it("leaves out files that are not images or are too large", () => {
    const photo = file("a.png", "image/png");
    expect(acceptReviewPhotos(0, [file("notes.pdf", "application/pdf"), photo])).toEqual({
      accepted: [photo],
      refusal: "notImage",
    });
    expect(acceptReviewPhotos(0, [file("big.jpg", "image/jpeg", MAX_REVIEW_PHOTO_BYTES + 1)])).toEqual({
      accepted: [],
      refusal: "tooLarge",
    });
  });

  it("stops at the photo limit, counting the ones already added", () => {
    const chosen = [file("a.jpg", "image/jpeg"), file("b.jpg", "image/jpeg")];
    expect(acceptReviewPhotos(MAX_REVIEW_PHOTOS - 1, chosen)).toEqual({ accepted: [chosen[0]], refusal: "tooMany" });
  });
});

describe("reviewFormData", () => {
  it("sends every photo under the images field", () => {
    const photos = [file("a.jpg", "image/jpeg"), file("b.jpg", "image/jpeg")];
    const form = reviewFormData(4, "Nice", photos);
    expect(form.get("rating")).toBe("4");
    expect(form.get("comment")).toBe("Nice");
    expect(form.getAll("images")).toHaveLength(2);
  });
});
