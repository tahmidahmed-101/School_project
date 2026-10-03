import { ChevronLeft, ChevronRight, ImageIcon, X } from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

import type { StagedImage } from "../lib/stagedImages"
import { ImageDropzone } from "./ImageDropzone"

/** The "Images" card of a create form: a drop zone plus removable previews of what was picked. */
export function StagedImagesCard({
  images,
  onAdd,
  onRemove,
  onMove,
  description = "Uploaded when you save. The first image is the main one.",
}: {
  images: StagedImage[]
  onAdd: (files: File[]) => void
  onRemove: (index: number) => void
  /** Reorders the picked images; they are saved in the order shown. */
  onMove: (from: number, to: number) => void
  description?: string
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ImageIcon className="size-4" /> Images
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ImageDropzone onFiles={onAdd} />
        {images.length > 0 && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {images.map((img, i) => (
              <div key={img.preview} className="overflow-hidden rounded-lg border border-border bg-card">
                <div className="relative aspect-square bg-muted">
                  <img src={img.preview} alt={img.file.name} className="size-full object-cover" />
                  {/* Position in the gallery; the first image is the product's main image. */}
                  <span className="absolute left-1.5 top-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
                    {i === 0 ? "1 · Main" : i + 1}
                  </span>
                  <button
                    type="button"
                    aria-label={`Remove ${img.file.name}`}
                    onClick={() => onRemove(i)}
                    className="absolute right-1.5 top-1.5 rounded-full bg-red-600/90 p-1.5 text-white hover:bg-red-700"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
                <div className="flex items-center gap-1 p-1.5">
                  <button
                    type="button"
                    aria-label={`Move ${img.file.name} earlier`}
                    disabled={i === 0}
                    onClick={() => onMove(i, i - 1)}
                    className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
                  >
                    <ChevronLeft className="size-4" />
                  </button>
                  <p className="min-w-0 flex-1 truncate text-center text-xs text-muted-foreground" title={img.file.name}>
                    {img.file.name}
                  </p>
                  <button
                    type="button"
                    aria-label={`Move ${img.file.name} later`}
                    disabled={i === images.length - 1}
                    onClick={() => onMove(i, i + 1)}
                    className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
                  >
                    <ChevronRight className="size-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
