import { describe, expect, it } from "vitest";
import { preorderStageLabel } from "../preorder-stages";

describe("preorderStageLabel", () => {
  it("names a known stage in both languages", () => {
    expect(preorderStageLabel("received_in_bd_airport")).toEqual({
      en: "Received in BD airport",
      bn: "বাংলাদেশের এয়ারপোর্টে পৌঁছেছে",
    });
  });

  it("shows an unknown stage as the backend named it", () => {
    expect(preorderStageLabel("held_at_customs")).toEqual({ en: "held at customs", bn: "" });
  });
});
