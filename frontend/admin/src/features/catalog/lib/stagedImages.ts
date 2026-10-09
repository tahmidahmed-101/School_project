import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { getApiErrorMessage } from "@/lib/api/client"

import { createProductImage, uploadMedia } from "../api"

export interface StagedImage {
  file: File
  preview: string
}

/**
 * Images picked on a create form, before the record they belong to exists. They are held
 * locally (with object-URL previews) and uploaded with `uploadStagedImages` once it does.
 */
export function useStagedImages() {
  const [images, setImages] = useState<StagedImage[]>([])
  const latest = useRef(images)
  useEffect(() => {
    latest.current = images
  }, [images])
  // Previews are object URLs: release whatever is still held when the form goes away.
  useEffect(() => () => latest.current.forEach((img) => URL.revokeObjectURL(img.preview)), [])

  const add = (files: File[]) =>
    setImages((prev) => [...prev, ...files.map((file) => ({ file, preview: URL.createObjectURL(file) }))])
  const remove = (index: number) => {
    URL.revokeObjectURL(images[index].preview)
    setImages((prev) => prev.filter((_, i) => i !== index))
  }
  /** Moves the image at `from` to position `to`; the order here is the order they are saved in. */
  const move = (from: number, to: number) =>
    setImages((prev) => {
      if (to < 0 || to >= prev.length) return prev
      const next = [...prev]
      const [item] = next.splice(from, 1)
      next.splice(to, 0, item)
      return next
    })
  return { images, add, remove, move }
}

/** Uploads staged images to a product's gallery, in order. Returns how many failed (each is toasted). */
export async function uploadStagedImages(productId: string, images: StagedImage[]): Promise<number> {
  let failed = 0
  for (const [i, { file }] of images.entries()) {
    try {
      const url = await uploadMedia(file)
      await createProductImage(productId, {
        url,
        alt_text: file.name.replace(/\.[^/.]+$/, ""),
        sort_order: i,
      })
    } catch (err) {
      failed += 1
      toast.error(`${file.name}: ${getApiErrorMessage(err, "upload failed")}`)
    }
  }
  return failed
}
