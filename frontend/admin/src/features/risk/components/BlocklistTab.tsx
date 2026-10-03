import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react"
import type { ColumnDef } from "@tanstack/react-table"
import { toast } from "sonner"
import { PlusIcon, Unlock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DataTable } from "@/components/common/data-table"
import { ConfirmDialog } from "@/components/common/ConfirmDialog"
import { FormDialog } from "@/components/common/FormDialog"
import { CsvImportButton, type ImportField } from "@/components/common/CsvImportDialog"
import { TableActions } from "@/components/common/TableActions"
import { getApiErrorMessage, getApiFieldErrors } from "@/lib/api/client"
import type { Option } from "@/lib/types"

type Request = { abort: () => void }
type Values = Record<string, string>

export interface BlocklistFormField {
  key: string
  label: string
  type?: "text" | "tel" | "datetime-local" | "select"
  placeholder?: string
  mono?: boolean
  required?: boolean
  options?: Option[]
}

export interface BlocklistTabConfig<T extends { id: string }> {
  /** Plural noun for the CSV import ("IP blocks"). */
  entityName: string
  /** Prefix for the add form's input ids. */
  idPrefix: string
  /** Text shown left of the buttons (when there is no toggle). */
  intro?: ReactNode
  /** A switch that adds `params` to the list request (e.g. include lifted blocks). */
  toggle?: { id: string; label: string; params: Record<string, unknown> }
  state: { data: T[]; isFetchingList: boolean; isMutating: boolean; error: unknown }
  fetch: (params: Record<string, unknown> | undefined) => Request
  create: (payload: Partial<T>) => Promise<unknown>
  importFields: ImportField[]
  columns: ColumnDef<T>[]
  empty: { title: string; description: string }
  minWidth: string
  add: {
    buttonLabel: string
    title: string
    description: string
    fields: BlocklistFormField[]
    initial: Values
    toPayload: (values: Values) => Partial<T>
    success: (values: Values) => string
    errorFallback: string
  }
  action: {
    label: string
    /** Rows the action doesn't apply to render `unavailable` instead. */
    isAvailable?: (row: T) => boolean
    unavailable?: ReactNode
    confirmTitle: (row: T) => string
    confirmDescription: string
    confirmLabel: string
    withReason?: boolean
    run: (row: T, reason: string) => Promise<unknown>
    success: (row: T) => string
    errorFallback: string
    /** Reload the list afterwards (given whether the toggle is on). */
    reloadAfter?: (toggled: boolean) => boolean
  }
}

/** One blocklist tab: intro/toggle + import/add buttons, the table, an add dialog and a confirm-to-remove dialog. */
export function BlocklistTab<T extends { id: string }>({
  canManage,
  config,
}: {
  canManage: boolean
  config: BlocklistTabConfig<T>
}) {
  const { state, fetch, add, action, toggle } = config
  const [toggled, setToggled] = useState(false)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState<Values>(add.initial)
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})
  const [target, setTarget] = useState<T | null>(null)

  // `fetch` is an inline dispatch wrapper; the request depends only on the toggle.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const load = useCallback(() => fetch(toggled && toggle ? toggle.params : undefined), [toggled])
  useEffect(() => {
    const request = load()
    return () => request.abort()
  }, [load])

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault()
    setFormErrors({})
    try {
      await config.create(add.toPayload(form))
      toast.success(add.success(form))
      setAdding(false)
      setForm(add.initial)
    } catch (err) {
      const fields = getApiFieldErrors(err)
      setFormErrors(Object.keys(fields).length ? fields : { form: getApiErrorMessage(err, add.errorFallback) })
    }
  }

  const columns: ColumnDef<T>[] = [
    ...config.columns,
    ...(canManage
      ? [
          {
            id: "actions",
            header: "ACTIONS",
            cell: ({ row }) =>
              !action.isAvailable || action.isAvailable(row.original) ? (
                <TableActions
                  itemName="this entry"
                  actions={[
                    {
                      label: action.label,
                      icon: Unlock,
                      onSelect: () => setTarget(row.original),
                      disabled: state.isMutating,
                    },
                  ]}
                />
              ) : (
                action.unavailable
              ),
          } satisfies ColumnDef<T>,
        ]
      : []),
  ]

  const setField = (key: string, value: string) => setForm((f) => ({ ...f, [key]: value }))

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {toggle ? (
          <div className="flex items-center gap-2">
            <Switch id={toggle.id} checked={toggled} onCheckedChange={setToggled} />
            <Label htmlFor={toggle.id} className="text-sm">
              {toggle.label}
            </Label>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{config.intro}</p>
        )}
        {canManage && (
          <div className="flex items-center gap-3">
            <CsvImportButton
              entityName={config.entityName}
              fields={config.importFields}
              createRow={(payload) => config.create(payload as Partial<T>)}
              onComplete={() => void load()}
            />
            <Button variant="apply" size="action" onClick={() => setAdding(true)}>
              <PlusIcon className="size-5" /> {add.buttonLabel}
            </Button>
          </div>
        )}
      </div>
      <DataTable
        columns={columns}
        data={state.data}
        isLoading={state.isFetchingList}
        error={state.error}
        onRetry={load}
        emptyTitle={config.empty.title}
        emptyDescription={config.empty.description}
        minWidth={config.minWidth}
      />

      <FormDialog
        open={adding}
        onOpenChange={setAdding}
        title={add.title}
        description={add.description}
        onSubmit={handleAdd}
        submitting={state.isMutating}
        submitLabel="Block"
      >
        {add.fields.map((field) => {
          const id = `${config.idPrefix}-${field.key}`
          return (
            <div key={field.key} className="space-y-2">
              <Label htmlFor={id}>{field.label}</Label>
              {field.type === "select" ? (
                <Select value={form[field.key]} onValueChange={(value) => setField(field.key, value)}>
                  <SelectTrigger id={id}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {field.options?.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  id={id}
                  type={field.type ?? "text"}
                  placeholder={field.placeholder}
                  className={field.mono ? "font-mono" : undefined}
                  required={field.required}
                  value={form[field.key]}
                  onChange={(e) => setField(field.key, e.target.value)}
                />
              )}
              {formErrors[field.key] && <p className="text-sm text-destructive">{formErrors[field.key]}</p>}
            </div>
          )
        })}
        {formErrors.form && (
          <p role="alert" className="text-sm text-destructive">
            {formErrors.form}
          </p>
        )}
      </FormDialog>

      <ConfirmDialog
        open={!!target}
        onOpenChange={(open) => !open && setTarget(null)}
        title={target ? action.confirmTitle(target) : ""}
        description={action.confirmDescription}
        confirmLabel={action.confirmLabel}
        reason={action.withReason ? { label: "Reason" } : undefined}
        onConfirm={async (reason) => {
          if (!target) return
          try {
            await action.run(target, reason)
            toast.success(action.success(target))
            if (action.reloadAfter?.(toggled)) load()
          } catch (err) {
            toast.error(getApiErrorMessage(err, action.errorFallback))
            throw err
          }
        }}
      />
    </div>
  )
}
