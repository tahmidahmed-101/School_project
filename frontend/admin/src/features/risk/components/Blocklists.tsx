import { useSearchParams } from "react-router-dom"
import { Globe, Phone } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { PageHeader } from "@/components/common/PageHeader"
import { StatusBadge } from "@/components/common/StatusBadge"
import { DateCell } from "@/components/common/cells"
import type { ImportField } from "@/components/common/CsvImportDialog"
import { useAppDispatch, useAppSelector } from "@/app/hooks"
import { fetchAll as fetchIPBlocks, postData as blockIP, unblockIP } from "@/features/risk/slices/ipBlockSlice"
import {
  fetchAll as fetchPhoneBlocks,
  liftPhoneBlock,
  postData as blockPhone,
} from "@/features/risk/slices/phoneBlockSlice"
import { selectIPBlocks, selectPhoneBlocks } from "@/features/risk/selectors"
import { PHONE_STRENGTH_LABELS, type IPBlock, type PhoneBlock, type PhoneBlockStrength } from "@/features/risk/types"
import { useCan } from "@/hooks/use-can"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { formatDateTime, fromDatetimeLocal, parseImportDateTime } from "@/lib/format"
import { BlocklistTab, type BlocklistTabConfig } from "./BlocklistTab"

// Mirrors BlockPhoneSerializer (POST /admin/risk/phone-blocklist/).
const PHONE_BLOCK_IMPORT_FIELDS: ImportField[] = [
  { key: "phone_number", label: "Phone Number", required: true, aliases: ["phone"], example: "+8801712345678" },
  { key: "reason", label: "Reason", required: true, example: "Refused 3 COD deliveries" },
  {
    key: "strength",
    label: "Rule",
    type: "enum",
    options: ["advance_only", "blocked"],
    aliases: ["strength"],
    example: "advance_only",
  },
]

// Mirrors IPBlockSerializer (POST /admin/risk/ip-blocklist/).
const IP_BLOCK_IMPORT_FIELDS: ImportField[] = [
  { key: "ip_address", label: "IP Address", required: true, aliases: ["ip"], example: "203.0.113.45" },
  { key: "reason", label: "Reason", required: true, example: "Repeated fake orders" },
  {
    key: "expires_at",
    label: "Expires At",
    aliases: ["expires", "expiry"],
    example: "2026-12-31 23:59",
    resolve: parseImportDateTime,
  },
]

function IPBlocklistTab({ canManage }: { canManage: boolean }) {
  const dispatch = useAppDispatch()
  const state = useAppSelector(selectIPBlocks)

  const config: BlocklistTabConfig<IPBlock> = {
    entityName: "IP blocks",
    idPrefix: "ip",
    intro: "Requests from these addresses are refused by the storefront.",
    state,
    fetch: (params) => dispatch(fetchIPBlocks(params)),
    create: (payload) => dispatch(blockIP({ payload })).unwrap(),
    importFields: IP_BLOCK_IMPORT_FIELDS,
    columns: [
      {
        accessorKey: "ip_address",
        header: "IP ADDRESS",
        cell: ({ row }) => <span className="font-mono text-sm font-medium">{row.original.ip_address}</span>,
      },
      { accessorKey: "reason", header: "REASON" },
      {
        accessorKey: "expires_at",
        header: "EXPIRES",
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">{formatDateTime(row.original.expires_at, "Never")}</span>
        ),
      },
      {
        accessorKey: "is_active",
        header: "STATUS",
        cell: ({ row }) => (
          <StatusBadge
            status={row.original.is_active ? "active" : "expired"}
            label={row.original.is_active ? "Blocking" : "Expired"}
          />
        ),
      },
      {
        accessorKey: "created_at",
        header: "ADDED",
        cell: ({ row }) => <DateCell withTime value={row.original.created_at} className="text-muted-foreground" />,
      },
    ],
    empty: {
      title: "No blocked IP addresses",
      description: "Block an address to stop it reaching the storefront.",
    },
    minWidth: "820px",
    add: {
      buttonLabel: "Block IP",
      title: "Block an IP address",
      description: "IPv4 or IPv6. Leave the expiry empty for a permanent block.",
      fields: [
        { key: "ip_address", label: "IP address", mono: true, required: true },
        { key: "reason", label: "Reason", required: true },
        { key: "expires_at", label: "Expires (optional)", type: "datetime-local" },
      ],
      initial: { ip_address: "", reason: "", expires_at: "" },
      toPayload: (form) => ({
        ip_address: form.ip_address.trim(),
        reason: form.reason.trim(),
        expires_at: fromDatetimeLocal(form.expires_at),
      }),
      success: (form) => `${form.ip_address.trim()} blocked`,
      errorFallback: "Couldn't block this IP.",
    },
    action: {
      label: "Unblock",
      confirmTitle: (block) => `Unblock ${block.ip_address}?`,
      confirmDescription: "Requests from this address will be allowed again.",
      confirmLabel: "Unblock",
      run: (block) => dispatch(unblockIP(block)).unwrap(),
      success: (block) => `${block.ip_address} unblocked`,
      errorFallback: "Couldn't unblock this IP.",
    },
  }

  return <BlocklistTab canManage={canManage} config={config} />
}

function PhoneBlocklistTab({ canManage }: { canManage: boolean }) {
  const dispatch = useAppDispatch()
  const state = useAppSelector(selectPhoneBlocks)

  const config: BlocklistTabConfig<PhoneBlock> = {
    entityName: "phone blocks",
    idPrefix: "phone",
    toggle: { id: "include-lifted", label: "Show lifted blocks", params: { include_lifted: "true" } },
    state,
    fetch: (params) => dispatch(fetchPhoneBlocks(params)),
    create: (payload) => dispatch(blockPhone({ payload })).unwrap(),
    importFields: PHONE_BLOCK_IMPORT_FIELDS,
    columns: [
      {
        accessorKey: "phone_number",
        header: "PHONE",
        cell: ({ row }) => <span className="font-mono text-sm font-medium">{row.original.phone_number}</span>,
      },
      {
        accessorKey: "strength",
        header: "RULE",
        cell: ({ row }) => (
          <StatusBadge
            status={row.original.strength}
            tone={row.original.strength === "blocked" ? "destructive" : "warning"}
            label={PHONE_STRENGTH_LABELS[row.original.strength]}
          />
        ),
      },
      { accessorKey: "reason", header: "REASON" },
      {
        accessorKey: "origin",
        header: "SOURCE",
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {row.original.origin === "manual" ? "Staff" : "Automatic rule"}
          </span>
        ),
      },
      {
        accessorKey: "created_at",
        header: "ADDED",
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground whitespace-nowrap">
            {formatDateTime(row.original.created_at)}
            {row.original.lifted_at && (
              <span className="block text-xs">Lifted {formatDateTime(row.original.lifted_at)}</span>
            )}
          </span>
        ),
      },
    ],
    empty: {
      title: "No blocked phone numbers",
      description: "Numbers with a history of refused deliveries can be limited to advance payment or blocked.",
    },
    minWidth: "900px",
    add: {
      buttonLabel: "Block number",
      title: "Block a phone number",
      description: "Applies to orders placed with this contact number.",
      fields: [
        { key: "phone_number", label: "Phone number", type: "tel", placeholder: "01XXXXXXXXX", mono: true, required: true },
        {
          key: "strength",
          label: "Rule",
          type: "select",
          options: (Object.keys(PHONE_STRENGTH_LABELS) as PhoneBlockStrength[]).map((key) => ({
            value: key,
            label: PHONE_STRENGTH_LABELS[key],
          })),
        },
        { key: "reason", label: "Reason", required: true },
      ],
      initial: { phone_number: "", reason: "", strength: "advance_only" },
      toPayload: (form) => ({
        phone_number: form.phone_number.trim(),
        reason: form.reason.trim(),
        strength: form.strength as PhoneBlockStrength,
      }),
      success: (form) => `${form.phone_number.trim()} blocked`,
      errorFallback: "Couldn't block this number.",
    },
    action: {
      label: "Lift",
      isAvailable: (block) => block.is_active,
      unavailable: <StatusBadge status="lifted" tone="secondary" label="Lifted" />,
      confirmTitle: (block) => `Lift the block on ${block.phone_number}?`,
      confirmDescription: "Orders from this number will be treated normally again.",
      confirmLabel: "Lift block",
      withReason: true,
      run: (block, reason) => dispatch(liftPhoneBlock({ phone_number: block.phone_number, reason })).unwrap(),
      success: (block) => `Block on ${block.phone_number} lifted`,
      errorFallback: "Couldn't lift this block.",
      reloadAfter: (includeLifted) => !includeLifted,
    },
  }

  return <BlocklistTab canManage={canManage} config={config} />
}

const TABS = ["ip", "phone"] as const

const Blocklists = () => {
  useDocumentTitle("Blocklists")
  const canManage = useCan("risk.manage")
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = TABS.includes(searchParams.get("tab") as (typeof TABS)[number]) ? searchParams.get("tab")! : "phone"

  return (
    <div className="section-container space-y-6">
      <PageHeader title="Blocklists" />
      <Tabs value={tab} onValueChange={(value) => setSearchParams({ tab: value }, { replace: true })}>
        <TabsList className="w-full md:w-fit">
          <TabsTrigger value="phone" className="min-w-max gap-2">
            <Phone className="h-4 w-4" /> Phone numbers
          </TabsTrigger>
          <TabsTrigger value="ip" className="min-w-max gap-2">
            <Globe className="h-4 w-4" /> IP addresses
          </TabsTrigger>
        </TabsList>
        <TabsContent value="phone" className="mt-4">
          <PhoneBlocklistTab canManage={canManage} />
        </TabsContent>
        <TabsContent value="ip" className="mt-4">
          <IPBlocklistTab canManage={canManage} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

export default Blocklists
