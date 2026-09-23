import type { Metadata } from "next";
import { PolicyView } from "../components/PolicyView";
import { RETURN_POLICY } from "../lib/policy-content";
import { pageMetadata } from "../lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Return Policy",
  description: "Kull Mart's return policy: eligibility, timeframe, and how to start a return.",
  path: "/return-policy",
});

export default function KullMartReturnPolicyPage() {
  return <PolicyView policy={RETURN_POLICY} />;
}
