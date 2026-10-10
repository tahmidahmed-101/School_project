import { ImageIcon, X } from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { IMAGE_OVERLAY_BUTTON_CLASS, ImageOrderGrid, ImageOrderTile } from "@/components/common/ImageOrderTile"

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
          <ImageOrderGrid>
            {images.map((img, i) => (
              <ImageOrderTile
                key={img.preview}
                src={img.preview}
                alt={img.file.name}
                index={i}
                count={images.length}
                name={img.file.name}
                onMove={(to) => onMove(i, to)}
                action={
                  <button
                    type="button"
                    aria-label={`Remove ${img.file.name}`}
                    onClick={() => onRemove(i)}
                    className={`${IMAGE_OVERLAY_BUTTON_CLASS} hover:bg-red-600`}
                  >
                    <X className="size-3.5" />
                  </button>
                }
              >
                <p className="truncate px-0.5 text-xs text-muted-foreground" title={img.file.name}>
                  {img.file.name}
                </p>
              </ImageOrderTile>
            ))}
          </ImageOrderGrid>
        )}
      </CardContent>
    </Card>
  )
}
