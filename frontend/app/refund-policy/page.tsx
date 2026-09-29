import type { Metadata } from "next";
import { PolicyView } from "@/modules/policies";
import { REFUND_POLICY } from "@/modules/policies";
import { pageMetadata } from "@/modules/seo";

export const metadata: Metadata = pageMetadata({
  title: "Refund Policy",
  description: "Kull Mart's refund policy: how refunds are processed and how long they take.",
  path: "/refund-policy",
});

export default function KullMartRefundPolicyPage() {
  return <PolicyView policy={REFUND_POLICY} />;
}
