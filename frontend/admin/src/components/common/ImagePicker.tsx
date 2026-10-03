import { useEffect, useRef, useState } from "react"
import { ImageIcon, Trash2, Upload } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { SubmitButton } from "./FormActions"

interface Props {
  /** The saved image, if any. */
  src?: string | null
  onSelect: (file: File) => void
  /** Shows a Remove button next to the picker when there is an image. */
  onRemove?: () => void
  /** True while the caller uploads the picked file. */
  uploading?: boolean
  /** What the image is, for the button text: "Upload logo" / "Replace logo". */
  noun?: string
  /** `contain` keeps the whole image visible (logos); `cover` fills the thumbnail. */
  fit?: "cover" | "contain"
  /**
   * Preview the picked file straight away. Turn off when the caller uploads immediately
   * and feeds the result back through `src`, so a failed upload never looks saved.
   */
  localPreview?: boolean
  id?: string
}

/** Single-image picker: a thumbnail of the current image plus Upload / Replace (and Remove). */
export function ImagePicker({
  src,
  onSelect,
  onRemove,
  uploading = false,
  noun = "image",
  fit = "cover",
  localPreview = true,
  id,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null)

  useEffect(() => {
    if (!preview) return
    return () => URL.revokeObjectURL(preview)
  }, [preview])

  const shown = preview ?? src ?? null

  return (
    <div className="flex flex-wrap items-center gap-4">
      <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted">
        {shown ? (
          <img src={shown} alt="" className={cn("size-full", fit === "cover" ? "object-cover" : "object-contain")} />
        ) : (
          <ImageIcon className="size-6 text-muted-foreground" />
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <SubmitButton
          id={id}
          type="button"
          variant="outline"
          size="action"
          loading={uploading}
          icon={Upload}
          onClick={() => inputRef.current?.click()}
        >
          {shown ? `Replace ${noun}` : `Upload ${noun}`}
        </SubmitButton>
        {shown && onRemove && (
          <Button
            type="button"
            variant="ghost"
            size="action"
            disabled={uploading}
            onClick={() => {
              setPreview(null)
              onRemove()
            }}
          >
            <Trash2 className="size-4" /> Remove
          </Button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/avif,image/heic"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          // Reset so picking the same file again still fires a change.
          e.target.value = ""
          if (!file) return
          if (localPreview) setPreview(URL.createObjectURL(file))
          onSelect(file)
        }}
      />
    </div>
  )
}
