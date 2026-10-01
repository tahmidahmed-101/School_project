import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { ImageIcon, Loader2, Trash2, UploadCloud } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DeleteModal } from "@/components/common/DeleteModal"
import { getApiErrorMessage } from "@/lib/api/client"

import { createProductImage, deleteProductImage, listProductImages, updateProductImage, uploadMedia } from "../api"
import type { ProductImage, ProductVariant } from "../types"

const PRODUCT_LEVEL = "product"

interface Props {
  productId: string
  variants: ProductVariant[]
  canManage: boolean
  onChanged: () => void
}

/**
 * Product gallery (/products/{id}/images/) plus images attached to individual variants
 * (those come back on each variant's `images`). Files are uploaded to /admin/media/uploads/
 * first; the returned URL is then attached as an image record.
 */
export function ProductImagesSection({ productId, variants, canManage, onChanged }: Props) {
  const [images, setImages] = useState<ProductImage[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [target, setTarget] = useState<string>(PRODUCT_LEVEL)
  const [reloadKey, setReloadKey] = useState(0)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      try {
        const items = await listProductImages(productId)
        if (!cancelled) setImages(items)
      } catch (err) {
        if (!cancelled) toast.error(getApiErrorMessage(err, "Couldn't load product images"))
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [productId, reloadKey])

  const refresh = () => {
    setReloadKey((k) => k + 1)
    onChanged()
  }

  const variantImages = variants.flatMap((v) => v.images.map((img) => ({ img, variant: v })))

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return
    setUploading(true)
    let ok = 0
    const base = target === PRODUCT_LEVEL ? images.length : (variants.find((v) => v.id === target)?.images.length ?? 0)
    for (const [i, file] of Array.from(files).entries()) {
      try {
        const url = await uploadMedia(file)
        await createProductImage(productId, {
          url,
          alt_text: file.name.replace(/\.[^/.]+$/, ""),
          sort_order: base + i,
          variant_id: target === PRODUCT_LEVEL ? null : target,
        })
        ok += 1
      } catch (err) {
        toast.error(`${file.name}: ${getApiErrorMessage(err, "upload failed")}`)
      }
    }
    setUploading(false)
    if (fileRef.current) fileRef.current.value = ""
    if (ok) {
      toast.success(`${ok} image${ok === 1 ? "" : "s"} added`)
      refresh()
    }
  }

  const saveField = async (img: ProductImage, payload: { alt_text?: string; sort_order?: number }) => {
    try {
      await updateProductImage(img.id, payload)
      toast.success("Image updated")
      refresh()
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to update image"))
    }
  }

  const remove = async (img: ProductImage) => {
    try {
      await deleteProductImage(img.id)
      toast.success("Image removed")
      refresh()
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to remove image"))
    }
  }

  const tile = (img: ProductImage, caption?: string) => (
    <div key={img.id} className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="relative aspect-square bg-muted">
        <img
          src={img.url}
          alt={img.alt_text || "Product image"}
          className="size-full object-cover"
          onError={(e) => ((e.target as HTMLElement).style.visibility = "hidden")}
        />
        {caption && (
          <span className="absolute left-1.5 top-1.5 rounded bg-black/60 px-1.5 py-0.5 font-mono text-[10px] text-white">
            {caption}
          </span>
        )}
        {canManage && (
          <div className="absolute right-1.5 top-1.5">
            <DeleteModal
              title="Remove image?"
              description="The image record is deleted; the uploaded file is left in storage."
              onConfirm={() => void remove(img)}
              trigger={
                <button
                  type="button"
                  aria-label="Remove image"
                  className="rounded-full bg-red-600/90 p-1.5 text-white hover:bg-red-700"
                >
                  <Trash2 className="size-3.5" />
                </button>
              }
            />
          </div>
        )}
      </div>
      {canManage ? (
        <div className="grid grid-cols-[1fr_64px] gap-1.5 p-2">
          <Input
            aria-label="Alt text"
            defaultValue={img.alt_text}
            placeholder="Alt text"
            className="h-7 text-xs"
            onBlur={(e) => e.target.value !== img.alt_text && void saveField(img, { alt_text: e.target.value })}
          />
          <Input
            aria-label="Sort order"
            type="number"
            defaultValue={img.sort_order}
            className="h-7 text-xs"
            onBlur={(e) => {
              const n = Number(e.target.value)
              if (Number.isInteger(n) && n !== img.sort_order) void saveField(img, { sort_order: n })
            }}
          />
        </div>
      ) : (
        img.alt_text && <p className="truncate p-2 text-xs text-muted-foreground">{img.alt_text}</p>
      )}
    </div>
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ImageIcon className="size-4" /> Images
        </CardTitle>
        <CardDescription>Lowest sort order shows first. JPG, PNG, WEBP, GIF, AVIF or HEIC.</CardDescription>
        {canManage && (
          <CardAction className="flex flex-wrap items-center gap-2">
            {variants.length > 1 && (
              <Select value={target} onValueChange={setTarget}>
                <SelectTrigger className="h-7 w-44 text-xs" aria-label="Attach uploads to">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={PRODUCT_LEVEL}>Product gallery</SelectItem>
                  {variants.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.sku}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => void handleFiles(e.target.files)}
            />
            <Button size="sm" disabled={uploading} onClick={() => fileRef.current?.click()}>
              {uploading ? <Loader2 className="animate-spin" /> : <UploadCloud />}
              {uploading ? "Uploading…" : "Upload"}
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading images…
          </div>
        ) : images.length === 0 && variantImages.length === 0 ? (
          <p className="text-sm text-muted-foreground">No images yet.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {[...images]
              .sort((a, b) => a.sort_order - b.sort_order)
              .map((img) => tile(img))}
            {variantImages.map(({ img, variant }) => tile(img, variant.sku))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
