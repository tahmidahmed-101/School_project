import type { ReactNode } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"

/** Grid that lays out <ImageOrderTile>s; the order shown is the order saved. */
export function ImageOrderGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(160px,190px))]">{children}</div>
}

/** Badge text for an image's place in its list: "1 · Main", "2", … or "SKU · 2" with a prefix. */
function imagePositionLabel(index: number, prefix?: string) {
  if (prefix) return `${prefix} · ${index + 1}`
  return index === 0 ? "1 · Main" : String(index + 1)
}

/** Round control drawn over the picture: the earlier / later arrows and the tile's corner action. */
export const IMAGE_OVERLAY_BUTTON_CLASS =
  "flex size-7 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition-colors hover:bg-black/80 disabled:invisible"

interface ImageOrderTileProps {
  src: string
  alt: string
  /** Place of this image in its list, starting at 0, and the list's length. */
  index: number
  count: number
  /** Shown before the position, e.g. a variant SKU. Without it the first image is marked "Main". */
  badgePrefix?: string
  /** Name used in the arrows' accessible labels ("Move photo.jpg earlier"). */
  name: string
  /** Called with the position to move to. Leave out for a read-only tile (no arrows). */
  onMove?: (to: number) => void
  /** Disables the arrows, e.g. while a reorder is being saved. */
  busy?: boolean
  /** Top-right control, usually a remove button (or a confirm dialog wrapping one). */
  action?: ReactNode
  /** What sits under the image: a file name, an alt-text input, … */
  children?: ReactNode
  /** Already-saved images load lazily and hide themselves if the file is missing. */
  remote?: boolean
}

/**
 * One image in an ordered gallery: the picture with its position badge, an optional action in
 * the corner and earlier / later arrows on it, then a caption underneath. Shared by the product image pickers on
 * the add, edit and detail pages so ordering looks and works the same everywhere.
 */
export function ImageOrderTile({
  src,
  alt,
  index,
  count,
  badgePrefix,
  name,
  onMove,
  busy = false,
  action,
  children,
  remote = false,
}: ImageOrderTileProps) {
  const isMain = index === 0 && !badgePrefix
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="relative aspect-square bg-muted">
        <img
          src={src}
          alt={alt}
          className="size-full object-cover"
          {...(remote && {
            loading: "lazy" as const,
            decoding: "async" as const,
            onError: (e) => ((e.target as HTMLElement).style.visibility = "hidden"),
          })}
        />
        {/* Position in its list; the first gallery image is the product's main image. */}
        <span
          className={`absolute left-2 top-2 rounded-full px-2 py-0.5 text-[11px] font-medium text-white ${
            isMain ? "bg-primary" : "bg-black/60 backdrop-blur-sm"
          }`}
        >
          {imagePositionLabel(index, badgePrefix)}
        </span>
        {action && <div className="absolute right-2 top-2">{action}</div>}
        {/* The arrows sit on the picture, so the caption below keeps the tile's full width. */}
        {onMove && (
          <div className="absolute inset-x-2 bottom-2 flex justify-between">
            <button
              type="button"
              aria-label={`Move ${name} earlier`}
              disabled={index === 0 || busy}
              onClick={() => onMove(index - 1)}
              className={IMAGE_OVERLAY_BUTTON_CLASS}
            >
              <ChevronLeft className="size-4" />
            </button>
            <button
              type="button"
              aria-label={`Move ${name} later`}
              disabled={index === count - 1 || busy}
              onClick={() => onMove(index + 1)}
              className={IMAGE_OVERLAY_BUTTON_CLASS}
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        )}
      </div>

      {children && <div className="p-2">{children}</div>}
    </div>
  )
}
