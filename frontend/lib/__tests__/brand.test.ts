import { describe, expect, it } from "vitest";
import type { ApiBusinessProfile } from "@/lib/api/types";
import { BRAND_INFO, mergeBrand } from "../brand";

describe("mergeBrand free delivery", () => {
  it("keeps the threshold as the API's decimal string", () => {
    expect(mergeBrand(profile({ free_delivery_min_amount: "1500.00" })).freeDeliveryMinAmount).toBe("1500.00");
  });

  it("is off for null, zero or a missing field", () => {
    expect(mergeBrand(profile({ free_delivery_min_amount: null })).freeDeliveryMinAmount).toBeNull();
    expect(mergeBrand(profile({ free_delivery_min_amount: "0" })).freeDeliveryMinAmount).toBeNull();
    expect(mergeBrand(profile({ free_delivery_min_amount: "0.00" })).freeDeliveryMinAmount).toBeNull();
    expect(mergeBrand(profile()).freeDeliveryMinAmount).toBeNull();
  });
});

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
    const brand = mergeBrand(profile({ phone: "01811-222333", email: "hello@schoolproject.com" }));
    expect(brand.phone).toBe("01811-222333");
    expect(brand.phoneTel).toBe("01811222333");
    expect(brand.email).toBe("hello@schoolproject.com");
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

  it("takes the social profiles and the map link from the profile", () => {
    const brand = mergeBrand(
      profile({
        google_maps_url: " https://maps.app.goo.gl/abc ",
        social: { instagram: "https://instagram.com/schoolprojectbd", tiktok: "" },
      }),
    );
    expect(brand.mapsUrl).toBe("https://maps.app.goo.gl/abc");
    expect(brand.social).toEqual({
      instagram: "https://instagram.com/schoolprojectbd",
      tiktok: "",
      youtube: "",
      linkedin: "",
    });
  });

  it("takes the store name and legal name from the profile", () => {
    const brand = mergeBrand(profile({ name: " School Project BD ", legal_name: "School Project Trading" }));
    expect(brand.name).toBe("School Project BD");
    expect(brand.legalName).toBe("School Project Trading");
  });

  it("ignores the store name a fresh backend ships with", () => {
    const brand = mergeBrand(profile({ name: "LaunchCart", legal_name: "LaunchCart Ltd" }));
    expect(brand.name).toBe(BRAND_INFO.name);
    expect(brand.legalName).toBe(BRAND_INFO.legalName);
  });

  it("takes the opening hours and the about text from the profile", () => {
    const brand = mergeBrand(profile({ opening_hours: " Sat-Thu, 10am-8pm ", about: { bn: " আমাদের কথা " } }));
    expect(brand.openingHours).toBe("Sat-Thu, 10am-8pm");
    expect(brand.about).toEqual({ en: "", bn: "আমাদের কথা" });
  });

  it("leaves the about text empty while the API does not send it", () => {
    expect(mergeBrand(profile({ phone: "01811-222333" })).about).toEqual({ en: "", bn: "" });
  });

  it("does not take the tagline from the profile", () => {
    expect(mergeBrand(profile({ tagline: "#schoolproject" })).tagline).toEqual(BRAND_INFO.tagline);
  });

  it("shows a logo uploaded in the dashboard in place of the built-in one", () => {
    const brand = mergeBrand(profile({ logo_url: " https://cdn.test/logo.png " }));
    expect(brand.logo).toBe("https://cdn.test/logo.png");
    expect(brand.logoCart).toBe("https://cdn.test/logo.png");
    expect(brand.logoMark).toBe(BRAND_INFO.logoMark);
  });

  it("keeps the built-in logo while none is uploaded", () => {
    const brand = mergeBrand(profile({ logo_url: "" }));
    expect(brand.logo).toBe(BRAND_INFO.logo);
    expect(brand.logoCart).toBe(BRAND_INFO.logoCart);
  });
});

describe("mergeBrand contact (floating button)", () => {
  it("is empty without a dashboard value, even though the static phone and Facebook exist", () => {
    expect(mergeBrand(null).contact).toEqual({ phoneTel: "", whatsapp: "", messenger: "" });
    expect(mergeBrand(profile({ phone: "01700000000", whatsapp: "01700000000" })).contact).toEqual({
      phoneTel: "",
      whatsapp: "",
      messenger: "",
    });
  });

  it("takes the phone, WhatsApp and a Messenger link from the Facebook page", () => {
    const brand = mergeBrand(
      profile({
        phone: "01811-222 333",
        whatsapp: "+880 1811-222333",
        social: { facebook: "https://www.facebook.com/schoolprojectbd/" },
      }),
    );
    expect(brand.contact).toEqual({
      phoneTel: "01811222333",
      whatsapp: "8801811222333",
      messenger: "https://m.me/schoolprojectbd",
    });
  });

  it("has no Messenger link for a URL that is not a Facebook page", () => {
    expect(mergeBrand(profile({ social: { facebook: "https://example.com/kull" } })).contact.messenger).toBe("");
    expect(
      mergeBrand(profile({ social: { facebook: "https://www.facebook.com/profile.php?id=1" } })).contact.messenger,
    ).toBe("");
  });
});
