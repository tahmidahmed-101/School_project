import { useEffect, useState } from "react"
import { toast } from "sonner"
import { ImageIcon, Loader2, Trash2 } from "lucide-react"

import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DeleteModal } from "@/components/common/DeleteModal"
import { ImageOrderGrid, ImageOrderTile } from "@/components/common/ImageOrderTile"
import { getApiErrorMessage } from "@/lib/api/client"

import { createProductImage, deleteProductImage, listProductImages, updateProductImage, uploadMedia } from "../api"
import type { ProductImage, ProductVariant } from "../types"
import { ImageDropzone } from "./ImageDropzone"

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
  const [reordering, setReordering] = useState(false)
  const [target, setTarget] = useState<string>(PRODUCT_LEVEL)
  const [reloadKey, setReloadKey] = useState(0)

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

  const byOrder = (a: ProductImage, b: ProductImage) => a.sort_order - b.sort_order
  const gallery = [...images].sort(byOrder)
  // Each variant's images are ordered among themselves, like the gallery.
  const variantGroups = variants
    .map((variant) => ({ variant, list: [...variant.images].sort(byOrder) }))
    .filter((group) => group.list.length > 0)

  const handleFiles = async (files: File[]) => {
    if (!files.length || uploading) return
    setUploading(true)
    let ok = 0
    const base = target === PRODUCT_LEVEL ? images.length : (variants.find((v) => v.id === target)?.images.length ?? 0)
    for (const [i, file] of files.entries()) {
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
    if (ok) {
      toast.success(`${ok} image${ok === 1 ? "" : "s"} added`)
      refresh()
    }
  }

  /**
   * Moves one image within its list (the gallery, or one variant's images) and renumbers that list
   * 0..n-1, saving only the images whose position changed. Same arrows as the add-product form.
   */
  const move = async (list: ProductImage[], from: number, to: number) => {
    if (reordering || to < 0 || to >= list.length) return
    const next = [...list]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    const changed = next.map((img, order) => ({ img, order })).filter(({ img, order }) => img.sort_order !== order)
    // Show the new gallery order straight away; variant images come from the parent and follow on refresh.
    const newOrder = new Map(next.map((img, order) => [img.id, order]))
    setImages((prev) => prev.map((img) => (newOrder.has(img.id) ? { ...img, sort_order: newOrder.get(img.id)! } : img)))
    setReordering(true)
    try {
      for (const { img, order } of changed) await updateProductImage(img.id, { sort_order: order })
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to reorder images"))
    } finally {
      setReordering(false)
      refresh()
    }
  }

  const saveField = async (img: ProductImage, payload: { alt_text?: string }) => {
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

  /** One saved image. `list` is the ordered list it belongs to and `index` its place in it. */
  const tile = (img: ProductImage, list: ProductImage[], index: number, sku?: string) => (
    <ImageOrderTile
      key={img.id}
      remote
      src={img.url}
      alt={img.alt_text || "Product image"}
      index={index}
      count={list.length}
      badgePrefix={sku}
      name={img.alt_text || "image"}
      onMove={canManage ? (to) => void move(list, index, to) : undefined}
      busy={reordering}
      action={
        canManage && (
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
        )
      }
    >
      {canManage ? (
        <Input
          aria-label="Alt text"
          defaultValue={img.alt_text}
          placeholder="Alt text"
          title="Alt text (click to edit)"
          // Looks like the plain caption on the add page; the field outline only appears while editing.
          className="h-6 truncate border-transparent bg-transparent px-1 py-0 text-center text-xs text-muted-foreground shadow-none dark:bg-transparent"
          onBlur={(e) => e.target.value !== img.alt_text && void saveField(img, { alt_text: e.target.value })}
        />
      ) : (
        img.alt_text && <p className="truncate text-center text-xs text-muted-foreground">{img.alt_text}</p>
      )}
    </ImageOrderTile>
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ImageIcon className="size-4" /> Images
        </CardTitle>
        <CardDescription>
          {canManage
            ? "The first image is the main one. Use the arrows to change the order."
            : "The first image is the main one."}
        </CardDescription>
        {canManage && variants.length > 1 && (
          <CardAction>
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
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {canManage && (
          <ImageDropzone onFiles={(files) => void handleFiles(files)} uploading={uploading} />
        )}
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading images…
          </div>
        ) : gallery.length === 0 && variantGroups.length === 0 ? (
          <p className="text-sm text-muted-foreground">No images yet.</p>
        ) : (
          <ImageOrderGrid>
            {gallery.map((img, i) => tile(img, gallery, i))}
            {variantGroups.map(({ variant, list }) => list.map((img, i) => tile(img, list, i, variant.sku)))}
          </ImageOrderGrid>
        )}
      </CardContent>
    </Card>
  )
}
