"use client";

import dynamic from "next/dynamic";
import { useLazyMount } from "@/design-system/patterns/useLazyMount";
import { usePreOrderModal } from "../context";

const PreOrderConfirmationModal = dynamic(
  () => import("./PreOrderConfirmationModal").then((m) => m.PreOrderConfirmationModal),
  { ssr: false },
);

/** The pre-order confirmation modal as its own chunk, kept out of the first load (see useLazyMount). */
export function LazyPreOrderConfirmationModal() {
  const { isOpen } = usePreOrderModal();
  return useLazyMount(isOpen) ? <PreOrderConfirmationModal /> : null;
}
