import type { Metadata } from "next";
import { REFUND_POLICY } from "@/modules/policies";
import { getPolicyContent, PolicyView } from "@/modules/policies/server";
import { pageMetadata } from "@/modules/seo";

export const metadata: Metadata = pageMetadata({
  title: "Refund Policy",
  description: "Kull Mart's refund policy: how refunds are processed and how long they take.",
  path: "/refund-policy",
});

export default async function KullMartRefundPolicyPage() {
  return <PolicyView policy={await getPolicyContent("refund", REFUND_POLICY)} />;
}
