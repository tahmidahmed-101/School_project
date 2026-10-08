import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublishedPolicy, PolicyView } from "@/modules/policies/server";
import { pageMetadata } from "@/modules/seo";

export const metadata: Metadata = pageMetadata({
  title: "Shipping Policy",
  description: "Kull Mart's shipping policy, as published by the store.",
  path: "/shipping-policy",
});

export default async function KullMartShippingPolicyPage() {
  const policy = await getPublishedPolicy("shipping");
  if (!policy) notFound();
  return <PolicyView policy={policy} />;
}
