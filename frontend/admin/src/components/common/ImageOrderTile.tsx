import type { ReactNode } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"

/** Grid that lays out <ImageOrderTile>s; the order shown is the order saved. */
export function ImageOrderGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">{children}</div>
}

/** Badge text for an image's place in its list: "1 · Main", "2", … or "SKU · 2" with a prefix. */
function imagePositionLabel(index: number, prefix?: string) {
  if (prefix) return `${prefix} · ${index + 1}`
  return index === 0 ? "1 · Main" : String(index + 1)
}

const MOVE_BUTTON_CLASS =
  "rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30"

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
  /** What sits under the image, between the arrows: a file name, an alt-text input, … */
  children?: ReactNode
  /** Already-saved images load lazily and hide themselves if the file is missing. */
  remote?: boolean
}

/**
 * One image in an ordered gallery: the picture with its position badge, an optional action in
 * the corner, and earlier / later arrows around a caption. Shared by the product image pickers on
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
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
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
        <span className="absolute left-1.5 top-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
          {imagePositionLabel(index, badgePrefix)}
        </span>
        {action && <div className="absolute right-1.5 top-1.5">{action}</div>}
      </div>

      {onMove ? (
        <div className="flex items-center gap-1 p-1.5">
          <button
            type="button"
            aria-label={`Move ${name} earlier`}
            disabled={index === 0 || busy}
            onClick={() => onMove(index - 1)}
            className={MOVE_BUTTON_CLASS}
          >
            <ChevronLeft className="size-4" />
          </button>
          <div className="min-w-0 flex-1">{children}</div>
          <button
            type="button"
            aria-label={`Move ${name} later`}
            disabled={index === count - 1 || busy}
            onClick={() => onMove(index + 1)}
            className={MOVE_BUTTON_CLASS}
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      ) : (
        children && <div className="p-2">{children}</div>
      )}
    </div>
  )
}
