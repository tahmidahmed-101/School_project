import type { Metadata } from "next";
import { RegisterView } from "@/modules/auth";

export const metadata: Metadata = {
  title: "Register",
  description: "Create your School Project account.",
  robots: { index: false, follow: false },
};

export default function SchoolProjectRegisterPage() {
  return <RegisterView />;
}
