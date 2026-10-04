import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import type { ColumnDef } from "@tanstack/react-table"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { Eye, EyeOff, MessageCircleQuestion } from "lucide-react"

import { Combobox } from "@/components/common/ComboBox"
import { DataTable } from "@/components/common/data-table"
import FilterToolbar from "@/components/common/FilterToolBar"
import { FormDialog, SwitchField } from "@/components/common/FormDialog"
import { TextareaField } from "@/components/common/form-fields"
import { PageHeader } from "@/components/common/PageHeader"
import { SortSelect } from "@/components/common/SortSelect"
import { StatusBadge } from "@/components/common/StatusBadge"
import { TableActions } from "@/components/common/TableActions"
import { DateCell } from "@/components/common/cells"
import { useAppDispatch, useAppSelector } from "@/app/hooks"
import { useCan } from "@/hooks/use-can"
import { useLastValue } from "@/hooks/use-dialog-presence"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { useListPage } from "@/hooks/use-list-page"
import { getApiErrorMessage } from "@/lib/api/client"
import { reportFormError } from "@/lib/forms"
import type { Option } from "@/lib/types"

import { deleteData, fetchAll, patchData } from "../slices/questionSlice"
import type { ProductQuestion, ProductQuestionStatus } from "../types"

// QUESTION_STATUSES on the backend: pending = no answer, answered = answered but hidden,
// published = answered and shown on the storefront.
const STATUS_OPTIONS: Option[] = [
  { label: "Pending", value: "pending" },
  { label: "Answered", value: "answered" },
  { label: "Published", value: "published" },
]

// AdminProductQuestionListView ordering_fields: created_at, answered_at.
const ORDERING_OPTIONS: Option[] = [
  { label: "Newest first", value: "-created_at" },
  { label: "Oldest first", value: "created_at" },
  { label: "Recently answered", value: "-answered_at" },
]

const questionStatus = (q: ProductQuestion): ProductQuestionStatus =>
  q.is_published ? "published" : q.answer ? "answered" : "pending"

/**
 * Questions customers ask on a product page. A question stays private until staff answer
 * it and publish it; only then does it show on the storefront.
 */
const Questions = () => {
  useDocumentTitle("Questions")
  const dispatch = useAppDispatch()
  const canManage = useCan("catalog.manage")
  const questionState = useAppSelector((s) => s.catalogQuestions)

  const [status, setStatus] = useState<Option | null>(null)
  const [ordering, setOrdering] = useState<Option | null>(ORDERING_OPTIONS[0])
  const [answering, setAnswering] = useState<ProductQuestion | null>(null)

  const list = useListPage({
    fetch: (p) => dispatch(fetchAll(p)),
    state: questionState,
    params: { status: status?.value, ordering: ordering?.value ?? ORDERING_OPTIONS[0].value },
  })

  const handlePublish = async (question: ProductQuestion, is_published: boolean) => {
    try {
      await dispatch(patchData({ id: question.id, payload: { is_published } })).unwrap()
      toast.success(is_published ? "Question published" : "Question hidden from the storefront")
      // With a status filter on, the row may no longer belong in the list.
      if (status) list.reload()
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to update question"))
    }
  }

  const handleDelete = async (question: ProductQuestion) => {
    try {
      await dispatch(deleteData(question.id)).unwrap()
      toast.success("Question deleted")
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to delete question"))
    }
  }

  const columns: ColumnDef<ProductQuestion>[] = [
    {
      id: "product",
      header: "PRODUCT",
      cell: ({ row }) => (
        <Link
          to={`/product_detail/${row.original.product_id}`}
          className="block truncate text-sm font-medium text-primary hover:underline"
          data-no-row-click="true"
        >
          {row.original.product_name}
        </Link>
      ),
    },
    {
      id: "question",
      header: "QUESTION",
      // Questions and answers are read in full here, so the text wraps instead of being cut off.
      cell: ({ row }) => (
        <div className="space-y-1 whitespace-normal break-words text-sm">
          <p>{row.original.question}</p>
          {row.original.answer ? (
            <p className="text-muted-foreground">
              <span className="font-medium text-foreground">Answer:</span> {row.original.answer}
            </p>
          ) : (
            <p className="text-muted-foreground">Not answered yet</p>
          )}
        </div>
      ),
    },
    {
      id: "customer",
      header: "CUSTOMER",
      cell: ({ row }) => <p className="truncate text-sm">{row.original.customer_name}</p>,
    },
    {
      id: "status",
      header: "STATUS",
      cell: ({ row }) => <StatusBadge status={questionStatus(row.original)} />,
    },
    {
      id: "created_at",
      header: "ASKED",
      cell: ({ row }) => <DateCell value={row.original.created_at} className="text-muted-foreground" />,
    },
    ...(canManage
      ? [
          {
            id: "actions",
            header: "ACTIONS",
            cell: ({ row }) => {
              const question = row.original
              return (
                <TableActions
                  itemName={`the question by ${question.customer_name}`}
                  onEdit={() => setAnswering(question)}
                  actions={
                    question.is_published
                      ? [{ label: "Unpublish", icon: EyeOff, onSelect: () => handlePublish(question, false) }]
                      : question.answer
                        ? [{ label: "Publish", icon: Eye, onSelect: () => handlePublish(question, true) }]
                        : []
                  }
                  onDelete={() => handleDelete(question)}
                />
              )
            },
          } satisfies ColumnDef<ProductQuestion>,
        ]
      : []),
  ]

  return (
    <div className="section-container">
      <PageHeader title="Questions" />

      {/* ?search= matches the question, the answer and the product name. */}
      <FilterToolbar
        searchPlaceholder="Search question, answer or product…"
        searchValue={list.search}
        onSearchChange={list.setSearch}
        filters={[
          {
            component: <Combobox placeholder="Status" options={STATUS_OPTIONS} value={status} onValueChange={setStatus} />,
          },
          { component: <SortSelect options={ORDERING_OPTIONS} value={ordering} onChange={setOrdering} /> },
        ]}
      />

      <DataTable
        columns={columns}
        bulk={
          canManage
            ? { noun: "question", deleteRow: (q) => dispatch(deleteData(q.id)).unwrap(), onDone: list.reload }
            : undefined
        }
        data={questionState.data}
        {...list.tableProps}
        onRowClick={canManage ? setAnswering : undefined}
        emptyIcon={MessageCircleQuestion}
        emptyTitle="No questions"
        emptyDescription={
          list.debouncedSearch || status
            ? "Try adjusting the search or filters."
            : "Questions customers ask on a product page appear here."
        }
        minWidth="960px"
        columnWidths={["200px", "auto", "160px", "120px", "110px", ...(canManage ? ["80px"] : [])]}
        unlabelledColumns={["actions"]}
      />

      {canManage && (
        <AnswerDialog
          question={answering}
          onClose={() => setAnswering(null)}
          onSaved={() => {
            if (status) list.reload()
          }}
        />
      )}
    </div>
  )
}

// Mirrors AdminProductQuestionUpdateSerializer (answer max_length 5000).
const answerSchema = z
  .object({
    answer: z.string().trim().max(5000, "At most 5000 characters"),
    is_published: z.boolean(),
  })
  .refine((v) => !v.is_published || v.answer.length > 0, {
    path: ["answer"],
    message: "Write an answer before publishing the question",
  })
type AnswerValues = z.infer<typeof answerSchema>

function AnswerDialog({
  question: selected,
  onClose,
  onSaved,
}: {
  question: ProductQuestion | null
  onClose: () => void
  onSaved: () => void
}) {
  const dispatch = useAppDispatch()
  const question = useLastValue(selected)
  const {
    control,
    register,
    reset,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<AnswerValues>({
    resolver: zodResolver(answerSchema),
    defaultValues: { answer: "", is_published: false },
  })

  useEffect(() => {
    if (selected) reset({ answer: selected.answer, is_published: selected.is_published })
  }, [selected, reset])

  const onSubmit = async (values: AnswerValues) => {
    if (!question) return
    try {
      await dispatch(
        patchData({
          id: question.id,
          // Clearing the answer unpublishes on the backend; publishing without one is refused.
          payload: { answer: values.answer, is_published: values.answer ? values.is_published : false },
        })
      ).unwrap()
      toast.success(values.answer ? (values.is_published ? "Answer published" : "Answer saved") : "Answer removed")
      onSaved()
      onClose()
    } catch (err) {
      reportFormError(err, { setError, fields: ["answer", "is_published"], fallback: "Failed to save answer" })
    }
  }

  return (
    <FormDialog
      open={!!selected}
      onOpenChange={(open) => !open && onClose()}
      title={question?.answer ? "Edit answer" : "Answer question"}
      description={question ? `${question.customer_name} asked about ${question.product_name}` : undefined}
      onSubmit={handleSubmit(onSubmit)}
      submitting={isSubmitting}
      submitLabel="Save"
      size="lg"
    >
      <p className="whitespace-pre-wrap break-words rounded-lg border border-border bg-muted/50 p-3 text-sm">
        {question?.question}
      </p>
      <TextareaField
        label="Answer"
        rows={5}
        placeholder="Write the answer customers will read…"
        error={errors.answer}
        {...register("answer")}
      />
      <SwitchField
        control={control}
        name="is_published"
        label="Show on the storefront"
        description="The question and its answer appear on the product page. Until then only the customer who asked can see it."
      />
    </FormDialog>
  )
}

export default Questions
