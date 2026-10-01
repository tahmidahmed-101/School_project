import Link from "next/link";
import { buttonClass } from "@/design-system/ui/Button";
import { PAGE_TITLE_CLASS } from "@/design-system/ui/PageHeader";
import { Compass } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex min-h-[70vh] w-full flex-col items-center justify-center gap-5 bg-white px-4 text-center">
      <div className="relative flex h-16 w-16 items-center justify-center rounded-full border-4 border-gold-100">
        <Compass className="h-7 w-7 text-gold-500" />
      </div>
      <div className="space-y-1.5">
        <h1 className={PAGE_TITLE_CLASS}>Page not found</h1>
        <p className="max-w-sm text-sm text-ink-600">
          The page you&apos;re looking for doesn&apos;t exist or may have been moved.
        </p>
      </div>
      <Link href="/" className={buttonClass()}>
        Back to home
      </Link>
    </div>
  );
}
