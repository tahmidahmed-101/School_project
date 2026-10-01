import { useCallback, useEffect, useState, type FormEvent } from "react"
import { useSearchParams } from "react-router-dom"
import type { ColumnDef } from "@tanstack/react-table"
import { toast } from "sonner"
import { Globe, Loader2, Phone, PlusIcon, Unlock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { DataTable } from "@/components/common/data-table"
import { PageHeading } from "@/components/common/PageHeading"
import { StatusBadge } from "@/components/common/StatusBadge"
import { useAppDispatch, useAppSelector } from "@/app/hooks"
import { fetchAll as fetchIPBlocks, postData as blockIP, unblockIP } from "@/features/risk/slices/ipBlockSlice"
import {
  fetchAll as fetchPhoneBlocks,
  liftPhoneBlock,
  postData as blockPhone,
} from "@/features/risk/slices/phoneBlockSlice"
import { selectIPBlocks, selectPhoneBlocks } from "@/features/risk/selectors"
import { PHONE_STRENGTH_LABELS, type IPBlock, type PhoneBlock, type PhoneBlockStrength } from "@/features/risk/types"
import { useCan } from "@/features/system/permissions"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { getApiErrorMessage, getApiFieldErrors } from "@/lib/api/client"
import { formatDateTime, fromDatetimeLocal } from "@/lib/format"
import { CsvImportButton, type ImportField } from "@/components/common/CsvImportDialog"

/** "YYYY-MM-DD" (end of that day) or "YYYY-MM-DD HH:mm", in local time → ISO string. */
function parseImportDateTime(raw: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2}))?$/.exec(raw.trim())
  if (!m) throw new Error(`"${raw}" is not a date like 2026-12-31 or 2026-12-31 23:59`)
  const [, y, mo, d, h, mi] = m
  const date = h
    ? new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi))
    : new Date(Number(y), Number(mo) - 1, Number(d), 23, 59, 59)
  if (Number.isNaN(date.getTime()) || date.getMonth() !== Number(mo) - 1) throw new Error(`"${raw}" is not a valid date`)
  return date.toISOString()
}

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

/** A small confirm-with-reason dialog used for unblocking / lifting. */
function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  withReason,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  confirmLabel: string
  withReason?: boolean
  onConfirm: (reason: string) => Promise<void>
}) {
  const [reason, setReason] = useState("")
  const [busy, setBusy] = useState(false)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      await onConfirm(reason.trim())
      setReason("")
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          {withReason && (
            <div className="space-y-2">
              <Label htmlFor="confirm-reason">Reason (optional)</Label>
              <Input id="confirm-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy && <Loader2 className="size-4 animate-spin" />}
              {confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function IPBlocklistTab({ canManage }: { canManage: boolean }) {
  const dispatch = useAppDispatch()
  const { data, isFetchingList, isMutating, error } = useAppSelector(selectIPBlocks)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ ip_address: "", reason: "", expires_at: "" })
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})
  const [unblocking, setUnblocking] = useState<IPBlock | null>(null)

  const load = useCallback(() => dispatch(fetchIPBlocks(undefined)), [dispatch])
  useEffect(() => {
    const request = load()
    return () => request.abort()
  }, [load])

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault()
    setFormErrors({})
    try {
      await dispatch(
        blockIP({
          payload: {
            ip_address: form.ip_address.trim(),
            reason: form.reason.trim(),
            expires_at: fromDatetimeLocal(form.expires_at),
          },
        })
      ).unwrap()
      toast.success(`${form.ip_address.trim()} blocked`)
      setAdding(false)
      setForm({ ip_address: "", reason: "", expires_at: "" })
    } catch (err) {
      const fields = getApiFieldErrors(err)
      setFormErrors(Object.keys(fields).length ? fields : { form: getApiErrorMessage(err, "Couldn't block this IP.") })
    }
  }

  const columns: ColumnDef<IPBlock>[] = [
    {
      accessorKey: "ip_address",
      header: "IP ADDRESS",
      cell: ({ row }) => <span className="font-mono text-sm font-medium">{row.original.ip_address}</span>,
    },
    { accessorKey: "reason", header: "REASON" },
    {
      accessorKey: "expires_at",
      header: "EXPIRES",
      cell: ({ row }) => <span className="text-sm text-muted-foreground">{formatDateTime(row.original.expires_at, "Never")}</span>,
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
      cell: ({ row }) => <span className="text-sm text-muted-foreground whitespace-nowrap">{formatDateTime(row.original.created_at)}</span>,
    },
    ...(canManage
      ? [
          {
            id: "actions",
            header: "ACTION",
            cell: ({ row }) => (
              <Button variant="outline" size="sm" onClick={() => setUnblocking(row.original)} disabled={isMutating}>
                <Unlock className="size-3.5" /> Unblock
              </Button>
            ),
          } satisfies ColumnDef<IPBlock>,
        ]
      : []),
  ]

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">Requests from these addresses are refused by the storefront.</p>
        {canManage && (
          <div className="flex items-center gap-3">
            <CsvImportButton
              entityName="IP blocks"
              fields={IP_BLOCK_IMPORT_FIELDS}
              createRow={(payload) => dispatch(blockIP({ payload: payload as Partial<IPBlock> })).unwrap()}
              onComplete={() => void load()}
            />
            <Button variant="apply" size="action" onClick={() => setAdding(true)}>
              <PlusIcon className="size-5" /> Block IP
            </Button>
          </div>
        )}
      </div>
      <DataTable
        columns={columns}
        data={data}
        isLoading={isFetchingList}
        error={error}
        onRetry={load}
        emptyTitle="No blocked IP addresses"
        emptyDescription="Block an address to stop it reaching the storefront."
        minWidth="820px"
      />

      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent>
          <form onSubmit={handleAdd} className="space-y-4">
            <DialogHeader>
              <DialogTitle>Block an IP address</DialogTitle>
              <DialogDescription>IPv4 or IPv6. Leave the expiry empty for a permanent block.</DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="ip-address">IP address</Label>
              <Input
                id="ip-address"
                className="font-mono"
                required
                value={form.ip_address}
                onChange={(e) => setForm((f) => ({ ...f, ip_address: e.target.value }))}
              />
              {formErrors.ip_address && <p className="text-sm text-destructive">{formErrors.ip_address}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="ip-reason">Reason</Label>
              <Input
                id="ip-reason"
                required
                value={form.reason}
                onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
              />
              {formErrors.reason && <p className="text-sm text-destructive">{formErrors.reason}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="ip-expires">Expires (optional)</Label>
              <Input
                id="ip-expires"
                type="datetime-local"
                value={form.expires_at}
                onChange={(e) => setForm((f) => ({ ...f, expires_at: e.target.value }))}
              />
              {formErrors.expires_at && <p className="text-sm text-destructive">{formErrors.expires_at}</p>}
            </div>
            {formErrors.form && (
              <p role="alert" className="text-sm text-destructive">
                {formErrors.form}
              </p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAdding(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isMutating}>
                {isMutating && <Loader2 className="size-4 animate-spin" />}
                Block
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!unblocking}
        onOpenChange={(open) => !open && setUnblocking(null)}
        title={`Unblock ${unblocking?.ip_address ?? ""}?`}
        description="Requests from this address will be allowed again."
        confirmLabel="Unblock"
        onConfirm={async () => {
          if (!unblocking) return
          try {
            await dispatch(unblockIP(unblocking)).unwrap()
            toast.success(`${unblocking.ip_address} unblocked`)
            setUnblocking(null)
          } catch (err) {
            toast.error(getApiErrorMessage(err, "Couldn't unblock this IP."))
          }
        }}
      />
    </div>
  )
}

function PhoneBlocklistTab({ canManage }: { canManage: boolean }) {
  const dispatch = useAppDispatch()
  const { data, isFetchingList, isMutating, error } = useAppSelector(selectPhoneBlocks)
  const [includeLifted, setIncludeLifted] = useState(false)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState<{ phone_number: string; reason: string; strength: PhoneBlockStrength }>({
    phone_number: "",
    reason: "",
    strength: "advance_only",
  })
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})
  const [lifting, setLifting] = useState<PhoneBlock | null>(null)

  const load = useCallback(
    () => dispatch(fetchPhoneBlocks(includeLifted ? { include_lifted: "true" } : undefined)),
    [dispatch, includeLifted]
  )
  useEffect(() => {
    const request = load()
    return () => request.abort()
  }, [load])

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault()
    setFormErrors({})
    try {
      await dispatch(
        blockPhone({ payload: { phone_number: form.phone_number.trim(), reason: form.reason.trim(), strength: form.strength } })
      ).unwrap()
      toast.success(`${form.phone_number.trim()} blocked`)
      setAdding(false)
      setForm({ phone_number: "", reason: "", strength: "advance_only" })
    } catch (err) {
      const fields = getApiFieldErrors(err)
      setFormErrors(Object.keys(fields).length ? fields : { form: getApiErrorMessage(err, "Couldn't block this number.") })
    }
  }

  const columns: ColumnDef<PhoneBlock>[] = [
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
        <span className="text-sm text-muted-foreground">{row.original.origin === "manual" ? "Staff" : "Automatic rule"}</span>
      ),
    },
    {
      accessorKey: "created_at",
      header: "ADDED",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground whitespace-nowrap">
          {formatDateTime(row.original.created_at)}
          {row.original.lifted_at && <span className="block text-xs">Lifted {formatDateTime(row.original.lifted_at)}</span>}
        </span>
      ),
    },
    ...(canManage
      ? [
          {
            id: "actions",
            header: "ACTION",
            cell: ({ row }) =>
              row.original.is_active ? (
                <Button variant="outline" size="sm" onClick={() => setLifting(row.original)} disabled={isMutating}>
                  <Unlock className="size-3.5" /> Lift
                </Button>
              ) : (
                <StatusBadge status="lifted" tone="secondary" label="Lifted" />
              ),
          } satisfies ColumnDef<PhoneBlock>,
        ]
      : []),
  ]

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Switch id="include-lifted" checked={includeLifted} onCheckedChange={setIncludeLifted} />
          <Label htmlFor="include-lifted" className="text-sm">
            Show lifted blocks
          </Label>
        </div>
        {canManage && (
          <div className="flex items-center gap-3">
            <CsvImportButton
              entityName="phone blocks"
              fields={PHONE_BLOCK_IMPORT_FIELDS}
              createRow={(payload) => dispatch(blockPhone({ payload: payload as Partial<PhoneBlock> })).unwrap()}
              onComplete={() => void load()}
            />
            <Button variant="apply" size="action" onClick={() => setAdding(true)}>
              <PlusIcon className="size-5" /> Block number
            </Button>
          </div>
        )}
      </div>
      <DataTable
        columns={columns}
        data={data}
        isLoading={isFetchingList}
        error={error}
        onRetry={load}
        emptyTitle="No blocked phone numbers"
        emptyDescription="Numbers with a history of refused deliveries can be limited to advance payment or blocked."
        minWidth="900px"
      />

      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent>
          <form onSubmit={handleAdd} className="space-y-4">
            <DialogHeader>
              <DialogTitle>Block a phone number</DialogTitle>
              <DialogDescription>Applies to orders placed with this contact number.</DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="phone-number">Phone number</Label>
              <Input
                id="phone-number"
                type="tel"
                placeholder="01XXXXXXXXX"
                className="font-mono"
                required
                value={form.phone_number}
                onChange={(e) => setForm((f) => ({ ...f, phone_number: e.target.value }))}
              />
              {formErrors.phone_number && <p className="text-sm text-destructive">{formErrors.phone_number}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone-strength">Rule</Label>
              <Select
                value={form.strength}
                onValueChange={(value) => setForm((f) => ({ ...f, strength: value as PhoneBlockStrength }))}
              >
                <SelectTrigger id="phone-strength">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(PHONE_STRENGTH_LABELS) as PhoneBlockStrength[]).map((key) => (
                    <SelectItem key={key} value={key}>
                      {PHONE_STRENGTH_LABELS[key]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone-reason">Reason</Label>
              <Input
                id="phone-reason"
                required
                value={form.reason}
                onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
              />
              {formErrors.reason && <p className="text-sm text-destructive">{formErrors.reason}</p>}
            </div>
            {formErrors.form && (
              <p role="alert" className="text-sm text-destructive">
                {formErrors.form}
              </p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAdding(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isMutating}>
                {isMutating && <Loader2 className="size-4 animate-spin" />}
                Block
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!lifting}
        onOpenChange={(open) => !open && setLifting(null)}
        title={`Lift the block on ${lifting?.phone_number ?? ""}?`}
        description="Orders from this number will be treated normally again."
        confirmLabel="Lift block"
        withReason
        onConfirm={async (reason) => {
          if (!lifting) return
          try {
            await dispatch(liftPhoneBlock({ phone_number: lifting.phone_number, reason })).unwrap()
            toast.success(`Block on ${lifting.phone_number} lifted`)
            setLifting(null)
            if (!includeLifted) load()
          } catch (err) {
            toast.error(getApiErrorMessage(err, "Couldn't lift this block."))
          }
        }}
      />
    </div>
  )
}

const TABS = ["ip", "phone"] as const

const Blocklists = () => {
  useDocumentTitle("Blocklists")
  const canManage = useCan()("risk.manage")
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = TABS.includes(searchParams.get("tab") as (typeof TABS)[number]) ? searchParams.get("tab")! : "phone"

  return (
    <div className="section-container space-y-6">
      <PageHeading title="Blocklists" description="Phone numbers and IP addresses that are restricted from ordering." />
      <Tabs value={tab} onValueChange={(value) => setSearchParams({ tab: value }, { replace: true })}>
        <TabsList className="w-full md:w-fit bg-muted p-1">
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
