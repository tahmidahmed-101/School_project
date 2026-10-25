import { useEffect, useState } from "react"
import type { ColumnDef } from "@tanstack/react-table"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import { BadgeCheck, Eye, EyeOff, MessageSquareText, Star } from "lucide-react"

import { DataTable } from "@/components/common/data-table"
import FilterToolbar from "@/components/common/FilterToolBar"
import { FormDialog } from "@/components/common/FormDialog"
import { TextareaField } from "@/components/common/form-fields"
import { PageHeader } from "@/components/common/PageHeader"
import { StatusBadge } from "@/components/common/StatusBadge"
import { TableActions } from "@/components/common/TableActions"
import { DateCell, LinkCell, Thumbnail } from "@/components/common/cells"
import { useAppDispatch, useAppSelector } from "@/app/hooks"
import { useCan } from "@/hooks/use-can"
import { useLastValue } from "@/hooks/use-dialog-presence"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { useKind, type Kind, withKind } from "@/hooks/use-kind"
import { getApiErrorMessage } from "@/lib/api/client"
import type { Option } from "@/lib/types"
import { cn } from "@/lib/utils"

import { deleteData, fetchAll, moderateReview } from "../slices/reviewSlice"
import { useModerationList } from "../lib/useModerationList"
import type { ProductReview } from "../types"

// ProductReview.Status: pending waits for approval (when the shop approves reviews before they
// show), published is on the storefront, hidden was taken down by staff.
const STATUS_OPTIONS: Option[] = [
  { label: "Pending approval", value: "pending" },
  { label: "Published", value: "published" },
  { label: "Hidden", value: "hidden" },
]

const RATING_OPTIONS: Option[] = [5, 4, 3, 2, 1].map((n) => ({ label: `${n} star${n === 1 ? "" : "s"}`, value: String(n) }))

// AdminProductReviewListView ordering_fields: created_at, rating.
const ORDERING_OPTIONS: Option[] = [
  { label: "Newest first", value: "-created_at" },
  { label: "Oldest first", value: "created_at" },
  { label: "Lowest rating", value: "rating" },
  { label: "Highest rating", value: "-rating" },
]

function Stars({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={`${rating} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={cn("size-3.5", n <= rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40")}
        />
      ))}
    </span>
  )
}

/**
 * Product reviews left by customers on the storefront. Staff publish the ones waiting for
 * approval, hide any from the storefront (kept, so it can be undone) or remove them.
 */
const Reviews = ({ kind }: { kind: Kind }) => {
  const title = kind === "preorder" ? "Pre-order reviews" : "Reviews"
  useDocumentTitle(title)
  const dispatch = useAppDispatch()
  const canManage = useCan("catalog.manage")
  const reviewState = useAppSelector((s) => s.catalogReviews)

  const [hiding, setHiding] = useState<ProductReview | null>(null)

  const { list, filters, isFiltered, reloadIfFiltered } = useModerationList({
    kind,
    fetch: (p) => dispatch(fetchAll(p)),
    state: reviewState,
    filter: { param: "status", placeholder: "Status", options: STATUS_OPTIONS },
    secondFilter: { param: "rating", placeholder: "Rating", options: RATING_OPTIONS },
    orderingOptions: ORDERING_OPTIONS,
  })

  const handlePublish = async (review: ProductReview) => {
    try {
      await dispatch(moderateReview({ id: review.id, payload: { status: "published" } })).unwrap()
      toast.success("Review published")
      reloadIfFiltered()
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to publish review"))
    }
  }

  const handleDelete = async (review: ProductReview) => {
    try {
      await dispatch(deleteData(review.id)).unwrap()
      toast.success("Review deleted")
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to delete review"))
    }
  }

  const columns: ColumnDef<ProductReview>[] = [
    {
      id: "product",
      header: "PRODUCT",
      cell: ({ row }) => (
        <LinkCell to={withKind(`/product_detail/${row.original.product_id}`, kind)} className="block truncate font-medium">
          {row.original.product_name}
        </LinkCell>
      ),
    },
    {
      id: "rating",
      header: "RATING",
      cell: ({ row }) => <Stars rating={row.original.rating} />,
    },
    {
      id: "comment",
      header: "REVIEW",
      // Reviews are read in full here, so the text wraps instead of being cut off.
      cell: ({ row }) => (
        <div className="space-y-1.5">
          {row.original.comment ? (
            <p className="whitespace-normal break-words text-sm">{row.original.comment}</p>
          ) : (
            <span className="text-sm text-muted-foreground">No comment</span>
          )}
          {row.original.status === "hidden" && row.original.moderation_note && (
            <p className="text-xs text-muted-foreground">
              <span className="font-medium">Hidden because:</span> {row.original.moderation_note}
            </p>
          )}
          {row.original.images.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {row.original.images.map((url, index) => (
                // Opens full size: a thumbnail is too small to moderate from.
                <a key={url} href={url} target="_blank" rel="noreferrer" aria-label={`Open picture ${index + 1}`}>
                  <Thumbnail src={url} className="size-12" />
                </a>
              ))}
            </div>
          )}
        </div>
      ),
    },
    {
      id: "customer",
      header: "CUSTOMER",
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="truncate text-sm">{row.original.customer_name}</p>
          {row.original.is_verified_purchase && (
            <p className="flex items-center gap-1 text-xs text-green-600 dark:text-green-500">
              <BadgeCheck className="size-3" /> Verified purchase
            </p>
          )}
        </div>
      ),
    },
    {
      id: "status",
      header: "STATUS",
      cell: ({ row }) => (
        <StatusBadge
          status={row.original.status}
          label={row.original.status === "pending" ? "Pending approval" : undefined}
        />
      ),
    },
    {
      id: "created_at",
      header: "DATE",
      cell: ({ row }) => <DateCell value={row.original.created_at} className="text-muted-foreground" />,
    },
    ...(canManage
      ? [
          {
            id: "actions",
            header: "ACTIONS",
            cell: ({ row }) => {
              const review = row.original
              return (
                <TableActions
                  itemName={`the review by ${review.customer_name}`}
                  viewUrl={withKind(`/product_detail/${review.product_id}`, kind)}
                  actions={[
                    ...(review.status !== "published"
                      ? [{ label: "Publish", icon: Eye, onSelect: () => handlePublish(review) }]
                      : []),
                    ...(review.status !== "hidden"
                      ? [{ label: "Hide", icon: EyeOff, onSelect: () => setHiding(review) }]
                      : []),
                  ]}
                  onDelete={() => handleDelete(review)}
                />
              )
            },
          } satisfies ColumnDef<ProductReview>,
        ]
      : []),
  ]

  return (
    <div className="section-container">
      <PageHeader title={title} />

      <FilterToolbar
        searchPlaceholder="Search code, review text or product…"
        searchValue={list.search}
        onSearchChange={list.setSearch}
        filters={filters}
      />

      <DataTable
        columns={columns}
        bulk={
          canManage
            ? { noun: "review", deleteRow: (r) => dispatch(deleteData(r.id)).unwrap(), onDone: list.reload }
            : undefined
        }
        data={reviewState.data}
        {...list.tableProps}
        emptyIcon={MessageSquareText}
        emptyTitle="No reviews"
        emptyDescription={
          isFiltered ? "Try adjusting the search or filters." : "Reviews customers leave on the storefront appear here."
        }
        minWidth="1020px"
        columnWidths={["200px", "110px", "auto", "170px", "130px", "110px", ...(canManage ? ["80px"] : [])]}
        unlabelledColumns={["actions"]}
      />

      {canManage && <HideDialog review={hiding} onClose={() => setHiding(null)} onSaved={reloadIfFiltered} />}
    </div>
  )
}

interface HideValues {
  note: string
}

/** Takes a review off the storefront. The note is internal: the customer never sees it. */
function HideDialog({
  review: selected,
  onClose,
  onSaved,
}: {
  review: ProductReview | null
  onClose: () => void
  onSaved: () => void
}) {
  const dispatch = useAppDispatch()
  const review = useLastValue(selected)
  const {
    register,
    reset,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<HideValues>({ defaultValues: { note: "" } })

  useEffect(() => {
    if (selected) reset({ note: "" })
  }, [selected, reset])

  const onSubmit = async (values: HideValues) => {
    if (!review) return
    try {
      await dispatch(
        moderateReview({ id: review.id, payload: { status: "hidden", note: values.note.trim() } })
      ).unwrap()
      toast.success("Review hidden from the storefront")
      onSaved()
      onClose()
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to hide review"))
    }
  }

  return (
    <FormDialog
      open={!!selected}
      onOpenChange={(open) => !open && onClose()}
      title="Hide review"
      description={
        review
          ? `${review.customer_name}'s review of ${review.product_name} stops showing on the storefront and no longer counts toward its rating. You can publish it again later.`
          : undefined
      }
      onSubmit={handleSubmit(onSubmit)}
      submitting={isSubmitting}
      submitLabel="Hide review"
    >
      <TextareaField
        label="Reason (optional, staff only)"
        rows={3}
        placeholder="e.g. Spam, offensive language, wrong product…"
        error={errors.note}
        {...register("note", { maxLength: { value: 255, message: "At most 255 characters" } })}
      />
    </FormDialog>
  )
}

const ReviewsPage = () => {
  const kind = useKind()
  return <Reviews key={kind} kind={kind} />
}

export default ReviewsPage
