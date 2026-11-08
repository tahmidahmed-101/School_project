import type { Metadata } from "next";
import { LoginView } from "@/modules/auth";

export const metadata: Metadata = {
  title: "Log In",
  description: "Log in to your School Project account.",
  robots: { index: false, follow: false },
};

export default function SchoolProjectLoginPage() {
  return <LoginView />;
}
