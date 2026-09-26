import type { Metadata } from "next";
import { LoginView } from "../components/LoginView";

export const metadata: Metadata = {
  title: "Log In",
  description: "Log in to your Kull Mart account.",
  robots: { index: false, follow: false },
};

export default function KullMartLoginPage() {
  return <LoginView />;
}
