import { describe, expect, it } from "vitest";
import type { ApiBusinessProfile } from "@/lib/api/types";
import { BRAND_INFO, mergeBrand } from "../brand";

const profile = (overrides: Partial<ApiBusinessProfile> = {}): ApiBusinessProfile => ({
  name: "",
  legal_name: "",
  tagline: "",
  logo_url: "",
  phone: "",
  whatsapp: "",
  email: "",
  website: "",
  google_maps_url: "",
  opening_hours: "",
  address: "",
  social: {},
  ...overrides,
});

describe("mergeBrand", () => {
  it("uses the contact details the business profile has", () => {
    const brand = mergeBrand(profile({ phone: "01811-222333", email: "hello@kullmart.com" }));
    expect(brand.phone).toBe("01811-222333");
    expect(brand.phoneTel).toBe("01811222333");
    expect(brand.email).toBe("hello@kullmart.com");
  });

  it("keeps the built-in details when the profile is empty or missing", () => {
    expect(mergeBrand(profile())).toEqual(BRAND_INFO);
    expect(mergeBrand(null)).toEqual(BRAND_INFO);
  });

  it("ignores the placeholders a fresh backend ships with", () => {
    const brand = mergeBrand(
      profile({ phone: "01700000000", whatsapp: "+880 1700-000000", email: "admin@example.com" }),
    );
    expect(brand.phone).toBe(BRAND_INFO.phone);
    expect(brand.whatsapp).toBe(BRAND_INFO.whatsapp);
    expect(brand.email).toBe(BRAND_INFO.email);
  });
});
