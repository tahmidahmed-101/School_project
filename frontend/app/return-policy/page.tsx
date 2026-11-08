import type { Metadata } from "next";
import { RETURN_POLICY } from "@/modules/policies";
import { getPolicyContent, PolicyView } from "@/modules/policies/server";
import { pageMetadata } from "@/modules/seo";

export const metadata: Metadata = pageMetadata({
  title: "Return Policy",
  description: "School Project's return policy: eligibility, timeframe, and how to start a return.",
  path: "/return-policy",
});

export default async function SchoolProjectReturnPolicyPage() {
  return <PolicyView policy={await getPolicyContent("returns", RETURN_POLICY)} path="/return-policy" />;
}
