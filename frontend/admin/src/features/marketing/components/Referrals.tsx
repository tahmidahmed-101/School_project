import { useEffect, useState } from "react"
import type { ColumnDef } from "@tanstack/react-table"
import { Combobox } from "@/components/common/ComboBox"
import { DataTable } from "@/components/common/data-table"
import FilterToolbar from "@/components/common/FilterToolBar"
import { PageHeader } from "@/components/common/PageHeader"
import { SortSelect } from "@/components/common/SortSelect"
import { StatusBadge } from "@/components/common/StatusBadge"
import { DateCell, LinkCell, MoneyCell, TextCell } from "@/components/common/cells"
import { useAppDispatch, useAppSelector } from "@/app/hooks"
import { ReferralSettingsForm } from "@/features/system/components/settings/ReferralSettingsForm"
import { fetchBusinessProfile } from "@/features/system/slices/businessSettingsSlice"
import { fetchAll } from "@/features/marketing/slices/referralSlice"
import type { Referral, ReferralStatus } from "@/features/marketing/types"
import { useCan } from "@/hooks/use-can"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { useListPage } from "@/hooks/use-list-page"
import type { Option } from "@/lib/types"

const STATUS_OPTIONS: Option[] = [
  { label: "Pending", value: "pending" },
  { label: "Rewarded", value: "rewarded" },
  { label: "Void", value: "void" },
]

const ORDERING_OPTIONS: Option[] = [
  { value: "-created_at", label: "Newest first" },
  { value: "created_at", label: "Oldest first" },
  { value: "-rewarded_at", label: "Recently rewarded" },
]

const STATUS_LABEL: Record<ReferralStatus, string> = { pending: "Pending", rewarded: "Rewarded", void: "Void" }
const STATUS_TONE = { pending: "warning", rewarded: "success", void: "secondary" } as const

const Referrals = () => {
  useDocumentTitle("Referrals")

  const dispatch = useAppDispatch()
  const canSeeSettings = useCan("settings.view")
  const canManageSettings = useCan("settings.manage")
  const referralState = useAppSelector((state) => state.referrals)

  const [statusFilter, setStatusFilter] = useState<Option | null>(null)
  const [ordering, setOrdering] = useState<Option | null>(ORDERING_OPTIONS[0])

  useEffect(() => {
    if (!canSeeSettings) return
    const request = dispatch(fetchBusinessProfile())
    return () => request.abort()
  }, [dispatch, canSeeSettings])

  const list = useListPage({
    fetch: (params) => dispatch(fetchAll(params)),
    state: referralState,
    params: { status: statusFilter?.value, ordering: ordering?.value ?? ORDERING_OPTIONS[0].value },
  })

  const columns: ColumnDef<Referral>[] = [
    {
      id: "referrer",
      header: "REFERRER",
      cell: ({ row }) => (
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{row.original.referrer_name}</div>
          <div className="truncate text-xs text-muted-foreground">{row.original.referrer_contact}</div>
        </div>
      ),
    },
    {
      id: "order",
      header: "FRIEND'S ORDER",
      cell: ({ row }) => (
        <LinkCell to={`/order_detail/${row.original.order_id}`}>{row.original.order_number}</LinkCell>
      ),
    },
    {
      id: "status",
      header: "STATUS",
      cell: ({ row }) => (
        <StatusBadge
          status={row.original.status}
          tone={STATUS_TONE[row.original.status]}
          label={STATUS_LABEL[row.original.status]}
        />
      ),
    },
    {
      accessorKey: "reward_amount",
      header: "REWARD",
      cell: ({ row }) => <MoneyCell value={row.original.reward_amount} />,
    },
    {
      id: "coupon",
      header: "REWARD COUPON",
      cell: ({ row }) => (
        <TextCell value={row.original.reward_coupon_code} className="font-mono" fallback="Not issued yet" />
      ),
    },
    {
      accessorKey: "created_at",
      header: "ORDERED",
      cell: ({ row }) => <DateCell withTime value={row.original.created_at} className="text-muted-foreground" />,
    },
    {
      accessorKey: "rewarded_at",
      header: "REWARDED",
      cell: ({ row }) =>
        row.original.rewarded_at ? (
          <DateCell withTime value={row.original.rewarded_at} className="text-muted-foreground" />
        ) : (
          <TextCell value="" />
        ),
    },
  ]

  return (
    <div className="section-container">
      <PageHeader title="Referrals" />

      {canSeeSettings && <ReferralSettingsForm canManage={canManageSettings} />}

      <FilterToolbar
        searchPlaceholder="Search by order number, phone or email..."
        searchValue={list.search}
        onSearchChange={list.setSearch}
        filters={[
          {
            component: (
              <Combobox
                options={STATUS_OPTIONS}
                placeholder="Status"
                value={statusFilter}
                onValueChange={setStatusFilter}
              />
            ),
          },
          { component: <SortSelect options={ORDERING_OPTIONS} value={ordering} onChange={setOrdering} /> },
        ]}
      />

      <DataTable
        columns={columns}
        data={referralState.data}
        {...list.tableProps}
        emptyTitle="No referrals yet"
        emptyDescription="A referral shows up here when a friend places their first order with a customer's referral code. Customers find their code on the account page once both amounts above are set."
        minWidth="980px"
      />
    </div>
  )
}

export default Referrals
