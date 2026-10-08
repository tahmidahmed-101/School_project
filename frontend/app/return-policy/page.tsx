import type { Metadata } from "next";
import { PolicyView } from "@/modules/policies";
import { RETURN_POLICY } from "@/modules/policies";
import { getPolicyContent } from "@/modules/policies/server";
import { pageMetadata } from "@/modules/seo";

export const metadata: Metadata = pageMetadata({
  title: "Return Policy",
  description: "Kull Mart's return policy: eligibility, timeframe, and how to start a return.",
  path: "/return-policy",
});

export default async function KullMartReturnPolicyPage() {
  return <PolicyView policy={await getPolicyContent("returns", RETURN_POLICY)} />;
}
