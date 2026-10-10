import { useRef, useState } from "react"
import { toast } from "sonner"
import { Loader2, UploadCloud } from "lucide-react"

import { cn } from "@/lib/utils"

interface Props {
  /** Receives the picked or dropped image files (never empty). */
  onFiles: (files: File[]) => void
  /** Shows a spinner and blocks further picks while the caller is uploading. */
  uploading?: boolean
  /** A short one-line zone, for several on one page. */
  compact?: boolean
}

/** Drag-and-drop / click-to-browse zone for product images. */
export function ImageDropzone({ onFiles, uploading = false, compact = false }: Props) {
  const [isDragging, setIsDragging] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    // The file picker enforces accept="image/*"; a drop can carry anything.
    const dropped = Array.from(e.dataTransfer.files)
    const accepted = dropped.filter((f) => f.type.startsWith("image/"))
    if (accepted.length < dropped.length) toast.error("Only image files can be uploaded")
    if (accepted.length) onFiles(accepted)
  }

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? [])
          // Reset so picking the same file again still fires a change.
          e.target.value = ""
          if (files.length) onFiles(files)
        }}
      />
      <button
        type="button"
        disabled={uploading}
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault()
          setIsDragging(true)
        }}
        onDragLeave={(e) => {
          // Leaving for a child (the icon, the text) is not leaving the drop zone.
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setIsDragging(false)
        }}
        onDrop={handleDrop}
        className={cn(
          "flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border px-4 text-center transition-colors",
          compact ? "py-3" : "flex-col py-8",
          "hover:border-primary/60 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          "disabled:pointer-events-none disabled:opacity-70",
          isDragging && "border-primary bg-primary/5"
        )}
      >
        <span className={cn("flex items-center justify-center rounded-full bg-muted text-muted-foreground", compact ? "size-7" : "size-10")}>
          {uploading ? <Loader2 className="size-5 animate-spin" /> : <UploadCloud className="size-5" />}
        </span>
        <span className="text-sm font-medium">
          {uploading ? (
            "Uploading…"
          ) : isDragging ? (
            "Drop images to upload"
          ) : (
            <>
              {compact ? "Drag images here, or " : "Drag and drop images here, or "}<span className="text-primary underline underline-offset-2">browse</span>
            </>
          )}
        </span>
        {!compact && <span className="text-xs text-muted-foreground">JPG, PNG, WEBP, GIF, AVIF or HEIC</span>}
      </button>
    </>
  )
}
