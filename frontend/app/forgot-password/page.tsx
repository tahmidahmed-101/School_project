import type { Metadata } from "next";
import { ForgotPasswordView } from "@/modules/auth";

export const metadata: Metadata = {
  title: "Reset password",
  description: "Reset your School Project account password.",
  robots: { index: false, follow: false },
};

export default function SchoolProjectForgotPasswordPage() {
  return <ForgotPasswordView />;
}
