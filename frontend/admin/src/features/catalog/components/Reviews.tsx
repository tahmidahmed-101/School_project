import { useState } from "react"
import { Link } from "react-router-dom"
import type { ColumnDef } from "@tanstack/react-table"
import { toast } from "sonner"
import { BadgeCheck, MessageSquareText, Star } from "lucide-react"

import { Combobox } from "@/components/common/ComboBox"
import { DataTable } from "@/components/common/data-table"
import FilterToolbar from "@/components/common/FilterToolBar"
import { PageHeader } from "@/components/common/PageHeader"
import { SortSelect } from "@/components/common/SortSelect"
import { TableActions } from "@/components/common/TableActions"
import { DateCell } from "@/components/common/cells"
import { useAppDispatch, useAppSelector } from "@/app/hooks"
import { useCan } from "@/hooks/use-can"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { useListPage } from "@/hooks/use-list-page"
import { getApiErrorMessage } from "@/lib/api/client"
import type { Option } from "@/lib/types"
import { cn } from "@/lib/utils"

import { deleteData, fetchAll } from "../slices/reviewSlice"
import type { ProductReview } from "../types"

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

/** Product reviews left by customers on the storefront; staff can read and remove them. */
const Reviews = () => {
  useDocumentTitle("Reviews")
  const dispatch = useAppDispatch()
  const canManage = useCan("catalog.manage")
  const reviewState = useAppSelector((s) => s.catalogReviews)

  const [rating, setRating] = useState<Option | null>(null)
  const [ordering, setOrdering] = useState<Option | null>(ORDERING_OPTIONS[0])

  const list = useListPage({
    fetch: (p) => dispatch(fetchAll(p)),
    state: reviewState,
    params: { rating: rating?.value, ordering: ordering?.value ?? ORDERING_OPTIONS[0].value },
  })

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
        <Link
          to={`/product_detail/${row.original.product_id}`}
          className="block truncate text-sm font-medium text-primary hover:underline"
        >
          {row.original.product_name}
        </Link>
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
      cell: ({ row }) =>
        row.original.comment ? (
          <p className="whitespace-normal break-words text-sm">{row.original.comment}</p>
        ) : (
          <span className="text-sm text-muted-foreground">No comment</span>
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
      id: "created_at",
      header: "DATE",
      cell: ({ row }) => <DateCell value={row.original.created_at} className="text-muted-foreground" />,
    },
    ...(canManage
      ? [
          {
            id: "actions",
            header: "ACTIONS",
            cell: ({ row }) => (
              <TableActions
                itemName={`the review by ${row.original.customer_name}`}
                viewUrl={`/product_detail/${row.original.product_id}`}
                onDelete={() => handleDelete(row.original)}
              />
            ),
          } satisfies ColumnDef<ProductReview>,
        ]
      : []),
  ]

  return (
    <div className="section-container">
      <PageHeader title="Reviews" />

      <FilterToolbar
        searchPlaceholder="Search review text or product…"
        searchValue={list.search}
        onSearchChange={list.setSearch}
        filters={[
          {
            component: <Combobox placeholder="Rating" options={RATING_OPTIONS} value={rating} onValueChange={setRating} />,
          },
          { component: <SortSelect options={ORDERING_OPTIONS} value={ordering} onChange={setOrdering} /> },
        ]}
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
        emptyDescription="Reviews customers leave on the storefront appear here."
        minWidth="900px"
        columnWidths={["200px", "110px", "auto", "170px", "110px", ...(canManage ? ["80px"] : [])]}
        unlabelledColumns={["actions"]}
      />
    </div>
  )
}

export default Reviews
