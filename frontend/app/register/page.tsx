import type { Metadata } from "next";
import { RegisterView } from "@/modules/auth";

export const metadata: Metadata = {
  title: "Register",
  description: "Create your Kull Mart account.",
  robots: { index: false, follow: false },
};

export default function KullMartRegisterPage() {
  return <RegisterView />;
}
