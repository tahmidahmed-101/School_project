import { useEffect, useRef, useState } from "react"
import {
  Controller,
  get,
  useFieldArray,
  useForm,
  type Control,
  type FieldErrors,
  type FieldPath,
  type UseFormRegister,
} from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { AlertCircle, ArrowDown, ArrowUp, EyeOff, PlusIcon, Save, Send, Trash2Icon, Undo2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { ConfirmDialog } from "@/components/common/ConfirmDialog"
import { SubmitButton, StickyFormBar } from "@/components/common/FormActions"
import { DateField, FormField, TextField, TextareaField } from "@/components/common/form-fields"
import { StatusBadge } from "@/components/common/StatusBadge"
import { useAppDispatch } from "@/app/hooks"
import { useCategoryOptions } from "@/features/catalog/lib/useCategoryOptions"
import { updatePolicy } from "@/features/system/slices/businessSettingsSlice"
import type { PolicyLocale, StorePolicy, StorePolicyUpdate } from "@/features/system/types"
import { getApiErrorMessage, getApiFieldErrors, type ApiError } from "@/lib/api/client"
import { formatDate, formatDateTime } from "@/lib/format"
import { PolicyRevisions } from "./PolicyRevisions"

// Limits from apps/business/policy_content.py and services/policies.py.
const MAX_TITLE = 200
const MAX_INTRO = 5000
const MAX_HEADING = 200
const MAX_BODY = 10000
const MAX_SECTIONS = 30
const MAX_RETURN_WINDOW_DAYS = 365

const LOCALES: { code: PolicyLocale; label: string }[] = [
  { code: "en", label: "English" },
  { code: "bn", label: "Bangla" },
]

const localized = (max: number) => {
  const text = z.string().max(max, `At most ${max} characters`)
  return z.object({ en: text, bn: text })
}

const schema = z.object({
  content: z.object({
    title: localized(MAX_TITLE),
    intro: localized(MAX_INTRO),
    sections: z
      .array(z.object({ heading: localized(MAX_HEADING), body: localized(MAX_BODY) }))
      .max(MAX_SECTIONS, `At most ${MAX_SECTIONS} sections`),
  }),
  effective_date: z.string(),
  // Blank means no time limit.
  return_window_days: z
    .string()
    .trim()
    .refine(
      (v) => v === "" || (/^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= MAX_RETURN_WINDOW_DAYS),
      `Enter a whole number of days from 1 to ${MAX_RETURN_WINDOW_DAYS}, or leave it blank`
    ),
  non_returnable_category_ids: z.array(z.string()),
})

type FormValues = z.infer<typeof schema>
type Content = FormValues["content"]

const blank = () => ({ en: "", bn: "" })
const BLANK_SECTION = { heading: blank(), body: blank() }

const toForm = (policy: StorePolicy): FormValues => ({
  content: {
    title: { ...blank(), ...policy.content.title },
    intro: { ...blank(), ...policy.content.intro },
    sections: (policy.content.sections ?? []).map((s) => ({
      heading: { ...blank(), ...s.heading },
      body: { ...blank(), ...s.body },
    })),
  },
  effective_date: policy.effective_date ?? "",
  return_window_days: policy.return_rules?.return_window_days?.toString() ?? "",
  non_returnable_category_ids: (policy.return_rules?.non_returnable_categories ?? []).map((c) => c.id).sort(),
})

const trimmed = (text: { en: string; bn: string }) => ({ en: text.en.trim(), bn: text.bn.trim() })

/** The content as the backend stores it (normalize_policy_content): every text stripped. */
const normalize = (content: Content): Content => ({
  title: trimmed(content.title),
  intro: trimmed(content.intro),
  sections: content.sections.map((s) => ({ heading: trimmed(s.heading), body: trimmed(s.body) })),
})

/**
 * Form paths still blank that block publishing — the same rules as missing_policy_fields
 * on the backend: the title and every section heading and body, each in English or Bangla
 * (one is enough; the storefront shows it in both). The intro is optional. A text blank in
 * both languages is marked on its English box.
 */
function missingFields(content: Content): string[] {
  const blanks = (text: { en: string; bn: string }, path: string) => (text.en || text.bn ? [] : [`${path}.en`])
  const missing = blanks(content.title, "content.title")
  if (content.sections.length === 0) missing.push("content.sections")
  content.sections.forEach((section, i) => {
    missing.push(...blanks(section.heading, `content.sections.${i}.heading`))
    missing.push(...blanks(section.body, `content.sections.${i}.body`))
  })
  return missing
}

/** "content.sections[1].body.bn" (backend) → "content.sections.1.body.bn" (react-hook-form). */
const toFormPath = (path: string) => path.replace(/\[(\d+)\]/g, ".$1")

/** "content.sections[1].body.bn" → "Section 2 body (Bangla)". */
function describePath(path: string): string {
  const parts = toFormPath(path).split(".")
  if (parts.length === 2 && parts[1] === "sections") return "At least one section"
  // The backend names a text blank in both languages without a locale: "content.title".
  const locale = LOCALES.find((l) => l.code === parts[parts.length - 1])?.label
  const field =
    parts[1] === "sections"
      ? `Section ${Number(parts[2]) + 1} ${parts[3]}`
      : parts[1] === "intro"
        ? "Introduction"
        : "Title"
  return locale ? `${field} (${locale})` : field
}

// Backend rule codes (services/policies.py) and the form field each one is about.
const ERROR_FIELDS: Record<string, FieldPath<FormValues>> = {
  effective_date_required: "effective_date",
  effective_date_in_future: "effective_date",
  effective_date_backwards: "effective_date",
  invalid_return_window: "return_window_days",
  category_not_found: "non_returnable_category_ids",
}

type Intent = "save" | "publish" | "unpublish"

/** Editor for one policy: bilingual text, effective date, publication, and (returns) eligibility rules. */
export function PolicyEditor({ policy, canManage }: { policy: StorePolicy; canManage: boolean }) {
  const dispatch = useAppDispatch()
  const isReturns = policy.kind === "returns"
  const [formError, setFormError] = useState<{ message: string; scroll: boolean } | null>(null)
  const [confirmingUnpublish, setConfirmingUnpublish] = useState(false)

  const {
    control,
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: toForm(policy) })
  const sections = useFieldArray({ control, name: "content.sections" })

  // Reset the form whenever a fresh copy of the policy arrives (after a save).
  const [syncedFor, setSyncedFor] = useState(policy)
  if (policy !== syncedFor) {
    setSyncedFor(policy)
    reset(toForm(policy))
  }

  /** Marks the fields and shows the message above the form; focus goes to the first field, if any. */
  const fail = (message: string, fields: [string, string][] = []) => {
    fields.forEach(([path, text], i) =>
      setError(path as FieldPath<FormValues>, { message: text }, { shouldFocus: i === 0 })
    )
    setFormError({ message, scroll: fields.length === 0 })
    toast.error(message)
  }

  const save = async (values: FormValues, intent: Intent) => {
    setFormError(null)
    const original = toForm(policy)
    const content = normalize(values.content)
    const published = intent === "publish" || (intent === "save" && policy.is_published)

    // The backend refuses these too; checking first points at every blank field at once
    // (its message names only the first five).
    if (published) {
      const problems: [string, string][] = missingFields(content).map((path) => [
        path,
        path === "content.sections" ? "Add at least one section" : "Write this in English or Bangla before publishing",
      ])
      if (!values.effective_date) problems.push(["effective_date", "Set an effective date before publishing"])
      if (problems.length) {
        fail(
          `This policy can't be published yet: ${problems.length} ${problems.length === 1 ? "field needs" : "fields need"} attention.`,
          problems
        )
        return
      }
    }

    // Send only what changed so a concurrent edit to another field isn't overwritten.
    const patch: StorePolicyUpdate = {}
    if (JSON.stringify(content) !== JSON.stringify(original.content)) patch.content = content
    // Changing published terms needs the effective date restated, so it always goes with them.
    if (values.effective_date !== original.effective_date || published) {
      patch.effective_date = values.effective_date || null
    }
    if (isReturns) {
      const days = values.return_window_days
      if (days !== original.return_window_days) patch.return_window_days = days === "" ? null : Number(days)
      const ids = [...values.non_returnable_category_ids].sort()
      if (ids.join() !== original.non_returnable_category_ids.join()) patch.non_returnable_category_ids = ids
    }
    if (intent === "publish") patch.is_published = true
    if (intent === "unpublish") patch.is_published = false

    try {
      await dispatch(updatePolicy({ kind: policy.kind, patch })).unwrap()
      toast.success(
        intent === "publish"
          ? `${policy.label} published`
          : intent === "unpublish"
            ? `${policy.label} unpublished`
            : `${policy.label} saved`
      )
    } catch (err) {
      const { code, message } = err as Partial<ApiError>
      const fields = Object.entries(getApiFieldErrors(err)).filter(([key]) => key in original)
      // Content-shape errors read "content.sections[0].body.en: must be at most …".
      const shape = code === "invalid_policy_content" ? /^(content\.[\w.[\]]+): (.+)$/.exec(message ?? "") : null
      if (shape) fields.push([toFormPath(shape[1]), shape[2]])
      else if (code && ERROR_FIELDS[code] && message) fields.push([ERROR_FIELDS[code], message])
      fail(getApiErrorMessage(err, `Couldn't save the ${policy.label.toLowerCase()}`), fields)
    }
  }

  const submit = (intent: Intent) => handleSubmit((values) => save(values, intent))

  return (
    <form onSubmit={submit("save")} noValidate className="space-y-6">
      {formError && <FormAlert {...formError} />}

      <fieldset disabled={!canManage} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-3">
              {policy.label}
              <StatusBadge status={policy.is_published ? "published" : "draft"} />
            </CardTitle>
            <CardDescription>
              {policy.is_published
                ? `Customers see this policy on the storefront, effective ${formatDate(policy.effective_date)}.`
                : "Not on the storefront. Publishing needs a title, at least one section and an effective date. Each text can be in English, Bangla or both: a text written in one language is shown to readers of the other too."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <DateField
              label="Effective date"
              className="max-w-xs"
              description={
                policy.is_published
                  ? "Restate this when you change the published text or rules. It can't move earlier or be in the future."
                  : "The day these terms apply from. It can't be in the future when you publish."
              }
              error={errors.effective_date}
              {...register("effective_date")}
            />
            {!policy.is_published && policy.missing_fields.length > 0 && (
              <div className="text-sm">
                <p className="font-medium">Still needed before publishing (as last saved)</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted-foreground">
                  {policy.missing_fields.map((path) => (
                    <li key={path}>{describePath(path)}</li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Title & introduction</CardTitle>
            <CardDescription>
              The introduction is optional. Write in English, Bangla or both.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <LocalizedField label="Title" path="content.title" register={register} errors={errors} maxLength={MAX_TITLE} />
            <LocalizedField
              label="Introduction"
              path="content.intro"
              register={register}
              errors={errors}
              maxLength={MAX_INTRO}
              rows={4}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Sections</CardTitle>
            <CardDescription>
              Shown in this order under the introduction. Each needs a heading and body in English or Bangla.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {sections.fields.length === 0 && (
              <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                No sections yet. A policy needs at least one before it can be published.
              </p>
            )}
            {sections.fields.map((field, index) => (
              <div key={field.id} className="space-y-4 rounded-lg border border-border p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium">Section {index + 1}</p>
                  {canManage && (
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        disabled={index === 0}
                        onClick={() => sections.move(index, index - 1)}
                        aria-label={`Move section ${index + 1} up`}
                      >
                        <ArrowUp className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        disabled={index === sections.fields.length - 1}
                        onClick={() => sections.move(index, index + 1)}
                        aria-label={`Move section ${index + 1} down`}
                      >
                        <ArrowDown className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive"
                        onClick={() => sections.remove(index)}
                        aria-label={`Remove section ${index + 1}`}
                      >
                        <Trash2Icon className="size-4" />
                      </Button>
                    </div>
                  )}
                </div>
                <LocalizedField
                  label="Heading"
                  path={`content.sections.${index}.heading`}
                  register={register}
                  errors={errors}
                  maxLength={MAX_HEADING}
                />
                <LocalizedField
                  label="Body"
                  path={`content.sections.${index}.body`}
                  register={register}
                  errors={errors}
                  maxLength={MAX_BODY}
                  rows={6}
                />
              </div>
            ))}
            {/* An empty or over-long list is reported on the array itself. */}
            {(errors.content?.sections?.message || errors.content?.sections?.root?.message) && (
              <p role="alert" className="text-sm text-destructive">
                {errors.content.sections.message ?? errors.content.sections.root?.message}
              </p>
            )}
            {canManage && (
              <Button
                type="button"
                variant="outline"
                disabled={sections.fields.length >= MAX_SECTIONS}
                onClick={() => sections.append(BLANK_SECTION)}
              >
                <PlusIcon className="size-4" /> Add section
              </Button>
            )}
          </CardContent>
        </Card>

        {isReturns && (
          <Card>
            <CardHeader>
              <CardTitle>Return eligibility</CardTitle>
              <CardDescription>
                Enforced when a return is requested, but only while this policy is published. Each order line follows
                the version in force on the day it was delivered.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <TextField
                label="Return window (days)"
                className="max-w-xs"
                inputMode="numeric"
                placeholder="No limit"
                description={`Days after delivery a return is accepted, 1 to ${MAX_RETURN_WINDOW_DAYS}. Leave blank for no limit.`}
                error={errors.return_window_days}
                {...register("return_window_days")}
              />
              <NonReturnableCategories
                control={control}
                saved={policy.return_rules?.non_returnable_categories ?? []}
                error={errors.non_returnable_category_ids}
                disabled={!canManage}
              />
            </CardContent>
          </Card>
        )}
      </fieldset>

      <PolicyRevisions kind={policy.kind} reloadKey={policy.updated_at} />

      {canManage && (
        <StickyFormBar className="flex-wrap justify-between">
          <p className="text-xs text-muted-foreground">Last updated {formatDateTime(policy.updated_at)}</p>
          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              variant="outline"
              disabled={!isDirty || isSubmitting}
              onClick={() => {
                reset(toForm(policy))
                setFormError(null)
              }}
            >
              <Undo2 className="size-4" />
              Discard
            </Button>
            {policy.is_published ? (
              <>
                <Button type="button" variant="outline" disabled={isSubmitting} onClick={() => setConfirmingUnpublish(true)}>
                  <EyeOff className="size-4" />
                  Unpublish
                </Button>
                <SubmitButton loading={isSubmitting} icon={Save} disabled={!isDirty}>
                  Save changes
                </SubmitButton>
              </>
            ) : (
              <>
                <SubmitButton variant="outline" loading={isSubmitting} icon={Save} disabled={!isDirty}>
                  Save draft
                </SubmitButton>
                <SubmitButton type="button" loading={isSubmitting} icon={Send} onClick={submit("publish")}>
                  Publish
                </SubmitButton>
              </>
            )}
          </div>
        </StickyFormBar>
      )}

      <ConfirmDialog
        open={confirmingUnpublish}
        onOpenChange={setConfirmingUnpublish}
        title={`Unpublish the ${policy.label.toLowerCase()}?`}
        description={
          isReturns
            ? "Customers will no longer see it on the storefront, and its return eligibility rules stop being enforced. Your text is kept as a draft."
            : "Customers will no longer see it on the storefront. Your text is kept as a draft."
        }
        confirmLabel="Unpublish"
        destructive
        icon={<EyeOff />}
        onConfirm={() => submit("unpublish")()}
      />
    </form>
  )
}

/** The reason a save was refused. Scrolls into view when no field could take the focus instead. */
function FormAlert({ message, scroll }: { message: string; scroll: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (scroll) ref.current?.scrollIntoView({ block: "center" })
  }, [message, scroll])
  return (
    <div
      ref={ref}
      role="alert"
      className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive"
    >
      <AlertCircle className="mt-0.5 size-4 shrink-0" />
      <p>{message}</p>
    </div>
  )
}

/** One piece of policy text, written side by side in each language. */
function LocalizedField({
  label,
  path,
  register,
  errors,
  maxLength,
  rows,
}: {
  label: string
  path: string
  register: UseFormRegister<FormValues>
  errors: FieldErrors<FormValues>
  maxLength: number
  /** Renders a textarea with this many rows instead of a single-line input. */
  rows?: number
}) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {LOCALES.map(({ code, label: language }) => {
        const name = `${path}.${code}` as FieldPath<FormValues>
        const props = {
          label: `${label} (${language})`,
          lang: code,
          maxLength,
          error: get(errors, name),
          ...register(name),
        }
        return rows ? <TextareaField key={code} rows={rows} {...props} /> : <TextField key={code} {...props} />
      })}
    </div>
  )
}

/** Tick-list of categories whose products can't be returned. */
function NonReturnableCategories({
  control,
  saved,
  error,
  disabled,
}: {
  control: Control<FormValues>
  saved: { id: string; name: string }[]
  error?: { message?: string }
  disabled: boolean
}) {
  const { options, isLoading } = useCategoryOptions("stock")
  // A saved category that has since been deleted is no longer an option; list it so it can be unticked.
  const known = new Set(options.map((o) => o.value))
  const rows = [
    ...options.map((o) => ({ id: o.value, name: o.label, depth: o.depth })),
    ...(isLoading ? [] : saved.filter((c) => !known.has(c.id)).map((c) => ({ ...c, depth: 0 }))),
  ]

  return (
    <Controller
      control={control}
      name="non_returnable_category_ids"
      render={({ field }) => {
        const selected: string[] = field.value
        return (
          <FormField
            label={`Non-returnable categories${selected.length ? ` (${selected.length})` : ""}`}
            description="Products directly in a ticked category can't be returned. Sub-categories are not included, so tick each one that applies."
            error={error}
          >
            <div className="max-h-64 overflow-y-auto rounded-lg border border-field-border p-2">
              {rows.length === 0 ? (
                <p className="p-2 text-sm text-muted-foreground">
                  {isLoading ? "Loading categories..." : "No categories yet."}
                </p>
              ) : (
                rows.map((row) => (
                  <label
                    key={row.id}
                    className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
                    style={{ paddingLeft: `${0.5 + row.depth * 1.25}rem` }}
                  >
                    <Checkbox
                      checked={selected.includes(row.id)}
                      disabled={disabled}
                      onCheckedChange={(checked) =>
                        field.onChange(checked ? [...selected, row.id].sort() : selected.filter((id) => id !== row.id))
                      }
                    />
                    {row.name}
                  </label>
                ))
              )}
            </div>
          </FormField>
        )
      }}
    />
  )
}
