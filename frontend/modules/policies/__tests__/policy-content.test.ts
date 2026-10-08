import { describe, expect, it } from "vitest";
import { policyFromApi, REFUND_POLICY, RETURN_POLICY } from "../domain/policy-content";

describe("policyFromApi", () => {
  it("keeps both languages and the section order", () => {
    const content = policyFromApi({
      kind: "returns",
      title: { en: "Returns", bn: "রিটার্ন" },
      intro: { en: "Intro", bn: "ভূমিকা" },
      sections: [
        { heading: { en: "First", bn: "প্রথম" }, body: { en: "A", bn: "ক" } },
        { heading: { en: "Second", bn: "দ্বিতীয়" }, body: { en: "B", bn: "খ" } },
      ],
      effective_date: null,
    });

    expect(content.title).toEqual({ en: "Returns", bn: "রিটার্ন" });
    expect(content.sections.map((section) => section.heading.en)).toEqual(["First", "Second"]);
    expect(content.effectiveDate).toBeUndefined();
  });

  it("formats the policy's effective date in both languages", () => {
    const content = policyFromApi({
      kind: "shipping",
      title: { en: "Shipping" },
      intro: {},
      sections: [],
      effective_date: "2026-03-12",
    });

    expect(content.effectiveDate).toEqual({ en: "12 Mar 2026", bn: "১২ মার্চ, ২০২৬" });
  });

  it("shows the other language where one is missing", () => {
    const content = policyFromApi({
      kind: "refund",
      title: { en: "Refunds" },
      intro: {},
      sections: [{ heading: { bn: "শিরোনাম" }, body: { en: "Body" } }],
      effective_date: null,
    });

    expect(content.title).toEqual({ en: "Refunds", bn: "Refunds" });
    expect(content.intro).toEqual({ en: "", bn: "" });
    expect(content.sections[0].heading).toEqual({ en: "শিরোনাম", bn: "শিরোনাম" });
  });
});

describe("built-in policy copy", () => {
  it("carries no date of its own", () => {
    expect(RETURN_POLICY.effectiveDate).toBeUndefined();
    expect(REFUND_POLICY.effectiveDate).toBeUndefined();
  });
});
