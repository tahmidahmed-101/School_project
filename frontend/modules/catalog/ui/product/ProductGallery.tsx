"use client";

import { useState } from "react";
import Image from "next/image";
import type { Product } from "@/lib/types";
import { useLang } from "@/lib/i18n";
import { photo } from "@/lib/photo";
import { getDiscountPercent } from "@/lib/product";
import { PreOrderBadge } from "@/design-system/patterns/PreOrderBadge";

export function ProductGallery({ product }: { product: Product }) {
  const { t, ui, n } = useLang();
  const [activeImage, setActiveImage] = useState(product.image);
  const discountPercent = getDiscountPercent(product);

  return (
    <div className="flex w-full flex-col-reverse gap-4 sm:flex-row">
      {product.gallery.length > 1 && (
        <div className="flex flex-shrink-0 gap-3 overflow-x-auto sm:w-20 sm:flex-col sm:overflow-y-auto">
          {product.gallery.map((img, i) => (
            <button
              key={img}
              type="button"
              onClick={() => setActiveImage(img)}
              className={`relative h-20 w-16 flex-shrink-0 cursor-pointer overflow-hidden rounded-md border-2 transition-all sm:h-24 sm:w-20 ${
                img === activeImage ? "shadow-xs border-gold-500" : "border-ink-200 opacity-70 hover:opacity-100"
              }`}
            >
              <Image
                src={photo(img)}
                alt={`${t(product.name)} thumbnail ${i + 1}`}
                fill
                sizes="80px"
                className="object-cover"
              />
            </button>
          ))}
        </div>
      )}

      <div className="relative aspect-[4/5] w-full flex-1 overflow-hidden rounded-xl border border-ink-200 bg-ink-50">
        <Image
          src={photo(activeImage)}
          alt={t(product.name)}
          fill
          priority
          sizes="(max-width: 1024px) 100vw, 50vw"
          className="object-cover object-center"
        />

        {(product.isPreOrder || product.badge || discountPercent) && (
          <div className="pointer-events-none absolute left-3 top-3 z-10 flex flex-col items-start gap-1.5 sm:left-4 sm:top-4">
            {product.isPreOrder ? (
              <PreOrderBadge status={product.preorderStatus || "available"} />
            ) : product.badge ? (
              <span className="shadow-2xs rounded bg-gold-500 px-2 py-0.5 text-[10px] font-bold tracking-wide text-ink-950 sm:text-xs">
                {t(product.badge)}
              </span>
            ) : null}
            {discountPercent && (
              <span className="shadow-2xs rounded bg-red-600 px-2 py-0.5 text-[10px] font-bold tracking-wide text-white sm:text-xs">
                {n(discountPercent)}% {ui("off")}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
