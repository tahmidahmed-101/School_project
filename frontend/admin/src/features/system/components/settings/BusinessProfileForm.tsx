import { useRef, useState, type ChangeEvent } from "react"
import { useForm, type Path } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { ImageIcon, Loader2, Save, Trash2, Upload } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Field, FieldContent, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { useAppDispatch, useAppSelector } from "@/app/hooks"
import { fetchBusinessProfile, updateBusinessProfile } from "@/features/system/slices/businessSettingsSlice"
import type { BusinessProfile } from "@/features/system/types"
import { uploadImage } from "@/features/system/files"
import { getApiErrorMessage, getApiFieldErrors } from "@/lib/api/client"
import { formatDateTime } from "@/lib/format"
import { SectionState } from "./SectionState"

const optional = (max: number) => z.string().trim().max(max, `At most ${max} characters`)

const schema = z.object({
  name: z.string().trim().min(1, "Business name is required").max(200),
  legal_name: optional(200),
  tagline: optional(200),
  logo_url: z.string(),
  phone: optional(50),
  whatsapp: optional(50),
  email: z.union([z.literal(""), z.email("Enter a valid email address")]),
  website: optional(255),
  google_maps_url: optional(500),
  opening_hours: optional(200),
  address_line: optional(255),
  district: optional(100),
  thana: optional(100),
  postcode: optional(20),
  country: optional(100),
  currency_code: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{3}$/, "Use a 3-letter ISO code, e.g. BDT"),
  currency_symbol: z.string().trim().min(1, "Required").max(8),
  tax_id: optional(50),
  trade_licence_no: optional(50),
  facebook_url: optional(500),
  instagram_url: optional(500),
  tiktok_url: optional(500),
  youtube_url: optional(500),
  linkedin_url: optional(500),
})

type FormValues = z.infer<typeof schema>
const FIELDS = Object.keys(schema.shape) as (keyof FormValues)[]

const toForm = (p: BusinessProfile): FormValues =>
  Object.fromEntries(FIELDS.map((key) => [key, p[key] ?? ""])) as FormValues

type FieldSpec = { name: keyof FormValues; label: string; type?: string; placeholder?: string; hint?: string }

const SECTIONS: { title: string; description: string; fields: FieldSpec[] }[] = [
  {
    title: "Identity",
    description: "How your business appears on invoices, receipts and the storefront.",
    fields: [
      { name: "name", label: "Business name" },
      { name: "legal_name", label: "Legal name" },
      { name: "tagline", label: "Tagline" },
    ],
  },
  {
    title: "Contact",
    description: "Shown to customers on receipts and the storefront.",
    fields: [
      { name: "phone", label: "Phone", type: "tel" },
      { name: "whatsapp", label: "WhatsApp", type: "tel" },
      { name: "email", label: "Email", type: "email" },
      { name: "website", label: "Website", placeholder: "example.com" },
      { name: "opening_hours", label: "Opening hours", placeholder: "Sat–Thu, 10am–8pm" },
      { name: "google_maps_url", label: "Google Maps link" },
    ],
  },
  {
    title: "Address",
    description: "Your registered business address.",
    fields: [
      { name: "address_line", label: "Street address" },
      { name: "thana", label: "Thana / Upazila" },
      { name: "district", label: "District" },
      { name: "postcode", label: "Postcode" },
      { name: "country", label: "Country" },
    ],
  },
  {
    title: "Currency & Tax",
    description: "The currency every amount in the dashboard is shown in.",
    fields: [
      { name: "currency_code", label: "Currency code", placeholder: "BDT", hint: "3-letter ISO 4217 code." },
      { name: "currency_symbol", label: "Currency symbol", placeholder: "৳" },
      { name: "tax_id", label: "Tax ID (BIN/TIN)" },
      { name: "trade_licence_no", label: "Trade licence no." },
    ],
  },
  {
    title: "Social",
    description: "Profile links shown on the storefront.",
    fields: [
      { name: "facebook_url", label: "Facebook" },
      { name: "instagram_url", label: "Instagram" },
      { name: "tiktok_url", label: "TikTok" },
      { name: "youtube_url", label: "YouTube" },
      { name: "linkedin_url", label: "LinkedIn" },
    ],
  },
]

export function BusinessProfileForm({ canManage }: { canManage: boolean }) {
  const dispatch = useAppDispatch()
  const { data: profile, status, error } = useAppSelector((state) => state.businessSettings.profile)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    setError,
    watch,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: profile ? toForm(profile) : undefined })

  // Reset the form whenever a fresh copy of the profile arrives (initial load, after save).
  const [syncedFor, setSyncedFor] = useState<BusinessProfile | null>(null)
  if (profile && profile !== syncedFor) {
    setSyncedFor(profile)
    reset(toForm(profile))
  }

  const logoUrl = watch("logo_url")

  if (!profile) {
    return (
      <SectionState
        status={status}
        error={error}
        hasData={false}
        onRetry={() => dispatch(fetchBusinessProfile())}
        label="the business profile"
      />
    )
  }

  const handleLogo = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    setUploading(true)
    try {
      const url = await uploadImage(file)
      setValue("logo_url", url, { shouldDirty: true })
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Couldn't upload the logo."))
    } finally {
      setUploading(false)
    }
  }

  const onSubmit = async (values: FormValues) => {
    // Send only what changed so a concurrent edit to another field isn't overwritten.
    const original = toForm(profile)
    const patch = Object.fromEntries(
      FIELDS.filter((key) => values[key] !== original[key]).map((key) => [
        key,
        key === "currency_code" ? values[key].toUpperCase() : values[key],
      ])
    )
    if (!Object.keys(patch).length) return
    try {
      await dispatch(updateBusinessProfile(patch)).unwrap()
      toast.success("Business profile saved")
    } catch (err) {
      const fieldErrors = Object.entries(getApiFieldErrors(err)).filter(([key]) =>
        (FIELDS as string[]).includes(key)
      )
      fieldErrors.forEach(([key, message]) => setError(key as Path<FormValues>, { message }))
      if (!fieldErrors.length) toast.error(getApiErrorMessage(err, "Couldn't save the business profile"))
      else toast.error("Please fix the highlighted fields")
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-6">
      <fieldset disabled={!canManage} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Logo</CardTitle>
            <CardDescription>PNG, JPG, WEBP, GIF, AVIF or HEIC. Used on invoices and the storefront header.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
            <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-lg border bg-muted">
              {logoUrl ? (
                <img src={logoUrl} alt="Business logo" className="h-full w-full object-contain" />
              ) : (
                <ImageIcon className="h-8 w-8 text-muted-foreground" />
              )}
            </div>
            {canManage && (
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="action" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                  {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
                  {logoUrl ? "Replace logo" : "Upload logo"}
                </Button>
                {logoUrl && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="action"
                    onClick={() => setValue("logo_url", "", { shouldDirty: true })}
                  >
                    <Trash2 className="size-4" /> Remove
                  </Button>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif,image/avif,image/heic"
                  className="hidden"
                  onChange={handleLogo}
                />
              </div>
            )}
          </CardContent>
        </Card>

        {SECTIONS.map((section) => (
          <Card key={section.title}>
            <CardHeader>
              <CardTitle>{section.title}</CardTitle>
              <CardDescription>{section.description}</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {section.fields.map((field) => (
                <Field key={field.name}>
                  <FieldLabel htmlFor={`bp-${field.name}`}>{field.label}</FieldLabel>
                  <FieldContent>
                    <Input
                      id={`bp-${field.name}`}
                      type={field.type ?? "text"}
                      placeholder={field.placeholder}
                      aria-invalid={!!errors[field.name]}
                      {...register(field.name)}
                    />
                    {field.hint && <FieldDescription>{field.hint}</FieldDescription>}
                    <FieldError errors={[errors[field.name]]} />
                  </FieldContent>
                </Field>
              ))}
              {section.title === "Address" && profile.formatted_address && (
                <p className="text-xs text-muted-foreground md:col-span-2">
                  Printed as: <span className="text-foreground">{profile.formatted_address}</span>
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </fieldset>

      {canManage && (
        <Card className="sticky bottom-4 z-10 shadow-md">
          <CardFooter className="flex flex-col gap-3 p-4 sm:flex-row sm:justify-between">
            <p className="text-xs text-muted-foreground">Last updated {formatDateTime(profile.updated_at)}</p>
            <div className="flex gap-3">
              <Button type="button" variant="outline" disabled={!isDirty || isSubmitting} onClick={() => reset(toForm(profile))}>
                Discard
              </Button>
              <Button type="submit" disabled={!isDirty || isSubmitting || uploading}>
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save changes
              </Button>
            </div>
          </CardFooter>
        </Card>
      )}
    </form>
  )
}
