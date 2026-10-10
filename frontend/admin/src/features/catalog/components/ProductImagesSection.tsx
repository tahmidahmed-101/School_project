import { useEffect, useState } from "react"
import { toast } from "sonner"
import { ImageIcon, Loader2, Trash2 } from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { DeleteModal } from "@/components/common/DeleteModal"
import { IMAGE_OVERLAY_BUTTON_CLASS, ImageOrderGrid, ImageOrderTile } from "@/components/common/ImageOrderTile"
import { getApiErrorMessage } from "@/lib/api/client"

import { createProductImage, deleteProductImage, listProductImages, updateProductImage, uploadMedia } from "../api"
import type { ProductImage, ProductOption, ProductVariant } from "../types"
import { refusalMessage } from "../lib/options"
import { ImageDropzone } from "./ImageDropzone"

const EVERY_CHOICE = "all"

interface Props {
  productId: string
  /** The product's options; an image can be set to show for one value of one of them. */
  options: ProductOption[]
  variants: ProductVariant[]
  canManage: boolean
  onChanged: () => void
}

/** The grouped "Shows for" choices: every choice, or one value of one option. */
function ShowsForItems({ options }: { options: ProductOption[] }) {
  return (
    <>
      <SelectItem value={EVERY_CHOICE}>Every choice</SelectItem>
      {options.map((option) => (
        <SelectGroup key={option.id}>
          <SelectLabel>{option.name}</SelectLabel>
          {option.values.map((value) => (
            <SelectItem key={value.id} value={value.id}>
              {value.value}
            </SelectItem>
          ))}
        </SelectGroup>
      ))}
    </>
  )
}

/**
 * Product gallery (/products/{id}/images/) plus images attached to individual variants
 * (those come back on each variant's `images`). Files are uploaded to /admin/media/uploads/
 * first; the returned URL is then attached as an image record.
 */
export function ProductImagesSection({ productId, options, variants, canManage, onChanged }: Props) {
  const [images, setImages] = useState<ProductImage[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [reordering, setReordering] = useState(false)
  const [target, setTarget] = useState<string>(EVERY_CHOICE)
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

  const valueLabel = new Map(options.flatMap((o) => o.values.map((v) => [v.id, `${o.name}: ${v.value}`] as const)))
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
    const showsFor = options.some((o) => o.values.some((v) => v.id === target)) ? target : null
    for (const [i, file] of files.entries()) {
      try {
        const url = await uploadMedia(file)
        await createProductImage(productId, {
          url,
          alt_text: file.name.replace(/\.[^/.]+$/, ""),
          sort_order: images.length + i,
          option_value_id: showsFor,
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

  const saveField = async (img: ProductImage, payload: { alt_text?: string; option_value_id?: string | null }) => {
    try {
      await updateProductImage(img.id, payload)
      toast.success("Image updated")
      refresh()
    } catch (err) {
      toast.error(refusalMessage(err, "Failed to update image"))
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
                className={`${IMAGE_OVERLAY_BUTTON_CLASS} hover:bg-red-600`}
              >
                <Trash2 className="size-3.5" />
              </button>
            }
          />
        )
      }
    >
      {canManage ? (
        <div className="space-y-1.5">
          <Input
            aria-label="Alt text"
            defaultValue={img.alt_text}
            placeholder="Alt text"
            title="Click to edit the name"
            // Reads as a plain centred caption; the field only shows while it is being edited.
            className="h-7 cursor-pointer truncate border-transparent bg-transparent px-1.5 py-0 text-center text-xs text-muted-foreground shadow-none hover:text-foreground focus-visible:cursor-text focus-visible:bg-field-bg focus-visible:text-foreground dark:bg-transparent dark:focus-visible:bg-field-bg"
            onBlur={(e) => e.target.value !== img.alt_text && void saveField(img, { alt_text: e.target.value })}
          />
          {options.length > 0 && (
            <Select
              value={img.option_value_id ?? EVERY_CHOICE}
              onValueChange={(v) => void saveField(img, { option_value_id: v === EVERY_CHOICE ? null : v })}
            >
              <SelectTrigger className="h-8 w-full px-2.5 text-xs" aria-label="Shows for" title="Shows for">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <ShowsForItems options={options} />
              </SelectContent>
            </Select>
          )}
        </div>
      ) : (
        <>
          {img.alt_text && <p className="truncate px-0.5 text-xs text-muted-foreground">{img.alt_text}</p>}
          {valueLabel.get(img.option_value_id ?? "") && (
            <p className="truncate px-0.5 text-xs text-muted-foreground">
              Shows for {valueLabel.get(img.option_value_id ?? "")}
            </p>
          )}
        </>
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
            ? options.length > 0
              ? "The first image is the main one. Use the arrows to change the order. Under each image, choose the value it shows for, like Colour: Red."
              : "The first image is the main one. Use the arrows to change the order."
            : "The first image is the main one."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {canManage && options.length > 0 && (
          <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
            <label htmlFor="new-uploads-show-for" className="text-sm text-muted-foreground">
              New uploads show for
            </label>
            <Select value={target} onValueChange={setTarget}>
              <SelectTrigger id="new-uploads-show-for" className="h-9 w-full sm:w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <ShowsForItems options={options} />
              </SelectContent>
            </Select>
          </div>
        )}
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
