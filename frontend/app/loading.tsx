import { Loader } from "@/design-system/patterns/Loader";

/** Shown by Next.js while any route segment below the shell is loading. */
export default function Loading() {
  return <Loader variant="page" />;
}
