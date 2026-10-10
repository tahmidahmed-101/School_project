import { useEffect, useId, useState } from "react"
import { Link } from "react-router-dom"
import { Plus, SlidersHorizontal, Trash2, X } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { FieldDescription, FieldError } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { FormField } from "@/components/common/form-fields"
import { useDebounced } from "@/hooks/use-debounced"
import type { Kind } from "@/hooks/use-kind"

import { fetchOptionSuggestions } from "../api"
import {
  adoptKnownSpelling,
  cleanOptionText,
  combinationKey,
  combinationTitle,
  effectiveDefault,
  MAX_OPTIONS,
  optionTextKey,
  valueRefusal,
  type OptionDraft,
} from "../lib/options"
import { newOptionKey, type OptionDraftState } from "../lib/useOptionDrafts"

const MAX_SUGGESTIONS = 12

/** Names already used in the shop. A failed load just leaves the pick-list empty. */
function useNameSuggestions(enabled: boolean) {
  const [names, setNames] = useState<string[]>([])
  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    fetchOptionSuggestions()
      .then((res) => {
        if (!cancelled) setNames(res.names ?? [])
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [enabled])
  return names
}

/** Values already used in the shop under one option name, kept with the name they belong to. */
function useValueSuggestions(name: string) {
  const asked = useDebounced(cleanOptionText(name), 300)
  const [found, setFound] = useState<{ name: string; values: string[] }>({ name: "", values: [] })
  useEffect(() => {
    if (!asked) return
    let cancelled = false
    fetchOptionSuggestions(asked)
      .then((res) => {
        if (!cancelled) setFound({ name: asked, values: res.values ?? [] })
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [asked])
  return found.name === asked ? found.values : []
}

/** One value of an option: click the text to correct its spelling, the cross to remove it. */
function ValueChip({
  value,
  onRename,
  onRemove,
}: {
  value: string
  /** Returns why the new spelling is refused, or null once it is taken. */
  onRename: (next: string) => string | null
  onRemove: () => void
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const commit = () => {
    if (draft !== null && cleanOptionText(draft) && cleanOptionText(draft) !== value) onRename(draft)
    setDraft(null)
  }
  if (draft !== null) {
    return (
      <Input
        autoFocus
        aria-label={`Rename ${value}`}
        value={draft}
        className="h-7 w-32"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault()
            commit()
          }
          if (e.key === "Escape") setDraft(null)
        }}
      />
    )
  }
  return (
    <Badge variant="secondary" className="max-w-full gap-1 py-1 text-sm">
      <button type="button" className="min-w-0 truncate" title="Click to correct the spelling" onClick={() => setDraft(value)}>
        {value}
      </button>
      <button
        type="button"
        aria-label={`Remove ${value}`}
        className="rounded-full p-0.5 hover:bg-muted-foreground/20"
        onClick={onRemove}
      >
        <X className="size-3.5" />
      </button>
    </Badge>
  )
}

function OptionRow({
  option,
  index,
  nameSuggestions,
  needsDefault,
  usedValueIds,
  problem,
  onChange,
  onRemove,
}: {
  option: OptionDraft
  index: number
  nameSuggestions: string[]
  needsDefault: boolean
  usedValueIds: Set<string>
  problem?: string
  onChange: (next: OptionDraft) => void
  onRemove: () => void
}) {
  const id = useId()
  const [typed, setTyped] = useState("")
  const [notice, setNotice] = useState("")
  const known = useValueSuggestions(option.name)
  const values = option.values.map((v) => v.value)
  const unused = known.filter((k) => !values.some((v) => optionTextKey(v) === optionTextKey(k))).slice(0, MAX_SUGGESTIONS)
  const asksDefault = needsDefault && !option.id

  const add = (raw: string) => {
    const value = adoptKnownSpelling(raw, known)
    const refusal = valueRefusal(values, value)
    setNotice(refusal ?? "")
    if (refusal) return
    onChange({ ...option, values: [...option.values, { value }] })
    setTyped("")
  }

  const rename = (at: number, raw: string) => {
    const refusal = valueRefusal(
      values.filter((_, i) => i !== at),
      raw
    )
    setNotice(refusal ?? "")
    if (!refusal) {
      const next = option.values.map((v, i) => (i === at ? { ...v, value: cleanOptionText(raw) } : v))
      onChange({ ...option, values: next })
    }
    return refusal
  }

  const remove = (at: number) => {
    const target = option.values[at]
    if (target.id && usedValueIds.has(target.id)) {
      setNotice(`A variant uses "${target.value}". Delete that variant on the product page first, then remove the value.`)
      return
    }
    setNotice("")
    onChange({ ...option, values: option.values.filter((_, i) => i !== at) })
  }

  return (
    <div className="space-y-3 rounded-lg border border-border p-3">
      <div className="flex items-end gap-2">
        <FormField label={`Option ${index + 1}`} htmlFor={`${id}-name`} className="min-w-0 flex-1">
          <Input
            id={`${id}-name`}
            list={`${id}-names`}
            autoComplete="off"
            placeholder="e.g. Size"
            value={option.name}
            aria-invalid={problem ? true : undefined}
            onChange={(e) => onChange({ ...option, name: e.target.value })}
            onBlur={(e) => onChange({ ...option, name: adoptKnownSpelling(e.target.value, nameSuggestions) })}
            onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
          />
          <datalist id={`${id}-names`}>
            {nameSuggestions.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </FormField>
        {/* As tall as the input it sits beside. */}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-11 shrink-0"
          aria-label={`Remove option ${index + 1}`}
          onClick={onRemove}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>

      <FormField label="Values" htmlFor={`${id}-value`}>
        {option.values.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {option.values.map((v, i) => (
              <ValueChip
                key={v.id ?? `new-${v.value}`}
                value={v.value}
                onRename={(next) => rename(i, next)}
                onRemove={() => remove(i)}
              />
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <Input
            id={`${id}-value`}
            autoComplete="off"
            placeholder="Type a value and press Enter"
            value={typed}
            className="min-w-0 flex-1"
            onChange={(e) => {
              setTyped(e.target.value)
              setNotice("")
            }}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return
              e.preventDefault()
              add(typed)
            }}
          />
          <Button type="button" variant="outline" size="lg" className="h-11 shrink-0 px-4" onClick={() => add(typed)}>
            <Plus /> Add
          </Button>
        </div>
        {unused.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Used before:</span>
            {unused.map((value) => (
              <Button key={value} type="button" variant="outline" size="xs" onClick={() => add(value)}>
                <Plus /> {value}
              </Button>
            ))}
          </div>
        )}
        <FieldError errors={[notice ? { message: notice } : undefined]} />
      </FormField>

      {asksDefault && option.values.length > 0 && (
        <FormField
          label="Value for the variants you already have"
          htmlFor={`${id}-default`}
          description="This product is already on sale. Its existing variants get this value."
        >
          <Select value={effectiveDefault(option)} onValueChange={(value) => onChange({ ...option, default_value: value })}>
            <SelectTrigger id={`${id}-default`} className="w-full sm:w-64">
              <SelectValue placeholder="Choose a value" />
            </SelectTrigger>
            <SelectContent>
              {values.map((value) => (
                <SelectItem key={value} value={value}>
                  {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
      )}
      <FieldError errors={[problem ? { message: problem } : undefined]} />
    </div>
  )
}

/** The "Options" card of a product form: the switch, up to three options and their values. */
export function ProductOptionsCard({ state, kind }: { state: OptionDraftState; kind: Kind }) {
  const switchId = useId()
  const nameSuggestions = useNameSuggestions(state.enabled)
  const { drafts, setDrafts } = state
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <SlidersHorizontal className="size-4" /> Options
        </CardTitle>
        <CardDescription>
          Each value is typed once here. Variants are then made by ticking combinations, never by typing.
          {kind === "stock" && (
            <>
              {" "}
              A set of products sold together is a{" "}
              <Link to="/bundles/new" className="text-primary underline">
                bundle
              </Link>
              .
            </>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <Switch id={switchId} checked={state.enabled} onCheckedChange={state.setEnabled} />
          <label htmlFor={switchId} className="text-sm">
            This product comes in options, like size or colour
          </label>
        </div>
        {!state.enabled && state.hadOptions && (
          <FieldDescription>
            Saving with this off removes every option. That only works while the product has one variant.
          </FieldDescription>
        )}

        {state.enabled && (
          <>
            {drafts.map((option, i) => (
              <OptionRow
                key={option.key}
                option={option}
                index={i}
                nameSuggestions={nameSuggestions}
                needsDefault={state.needsDefault}
                usedValueIds={state.usedValueIds}
                problem={state.problems[option.key]}
                onChange={(next) => setDrafts(drafts.map((o) => (o.key === option.key ? next : o)))}
                onRemove={() => setDrafts(drafts.filter((o) => o.key !== option.key))}
              />
            ))}
            <FieldError errors={[state.emptyProblem ? { message: state.emptyProblem } : undefined]} />
            {drafts.length < MAX_OPTIONS ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setDrafts([...drafts, { key: newOptionKey(), name: "", values: [], default_value: "" }])}
              >
                <Plus /> Add another option
              </Button>
            ) : (
              <FieldDescription>A product can have up to {MAX_OPTIONS} options.</FieldDescription>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}

/** New product only: the combinations the entered options make, each with a tick. */
export function NewCombinationsCard({ state }: { state: OptionDraftState }) {
  const { combinations, ticked } = state
  if (!state.enabled || combinations.length === 0) return null
  const tickedKeys = new Set(ticked.map(combinationKey))
  return (
    <Card>
      <CardHeader>
        <CardTitle>Variants to create</CardTitle>
        <CardDescription>
          {ticked.length} of {combinations.length} will be created at the price above. Untick any you do not sell; you
          can create them later on the product page.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="max-h-64 overflow-y-auto rounded-lg border border-field-border p-2">
          {combinations.map((combination) => {
            const key = combinationKey(combination)
            return (
              <label key={key} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted">
                <Checkbox checked={tickedKeys.has(key)} onCheckedChange={() => state.toggleCombination(key)} />
                <span className="min-w-0 break-words">{combinationTitle(combination)}</span>
              </label>
            )
          })}
        </div>
        <FieldError errors={[ticked.length === 0 ? { message: "Tick at least one variant to create." } : undefined]} />
      </CardContent>
    </Card>
  )
}
