import Link from "next/link";
import { Compass } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex min-h-[70vh] w-full flex-col items-center justify-center gap-5 bg-white px-4 text-center">
      <div className="relative flex h-16 w-16 items-center justify-center rounded-full border-4 border-gold-100">
        <Compass className="h-7 w-7 text-gold-500" />
      </div>
      <div className="space-y-1.5">
        <h1 className="ts-display text-xl font-bold text-ink-900 sm:text-2xl">Page not found</h1>
        <p className="max-w-sm text-sm text-ink-600">
          The page you&apos;re looking for doesn&apos;t exist or may have been moved.
        </p>
      </div>
      <Link
        href="/"
        className="inline-flex items-center gap-2 rounded-full bg-brand-700 px-6 py-3 text-xs font-bold text-white shadow-md transition-colors hover:bg-brand-800"
      >
        Back to home
      </Link>
    </div>
  );
}
