import { useEffect, useMemo, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { ImageIcon, Images } from "lucide-react"
import { ProductCell, Thumbnail } from "@/components/common/cells"
import { FormDialog, SwitchField } from "@/components/common/FormDialog"
import { FormField, TextField } from "@/components/common/form-fields"
import { ImagePicker } from "@/components/common/ImagePicker"
import { useAppDispatch, useAppSelector } from "@/app/hooks"
import { deleteHeroSlide, fetchHeroSlides, saveHeroSlide } from "@/features/system/slices/businessSettingsSlice"
import type { HeroSlide, ShopPlacement } from "@/features/system/types"
import { getApiFieldErrors } from "@/lib/api/client"
import { reportFormError } from "@/lib/forms"
import { ContentListCard } from "./ContentListCard"
import { onShop } from "./placement"

const CARD_COPY: Record<ShopPlacement, { title: string; description: string }> = {
  home: {
    title: "Hero Slides",
    description:
      "The large banners at the top of the storefront. The storefront shows its built-in slides until at least one active slide exists.",
  },
  preorder: {
    title: "Pre-order Hero Slides",
    description: "The large banners at the top of the pre-order shop.",
  },
}

const slideName = (slide: HeroSlide) => slide.title_en || slide.alt_text || "Untitled slide"

export function HeroSlidesCard({ canManage, placement }: { canManage: boolean; placement: ShopPlacement }) {
  const dispatch = useAppDispatch()
  const { data: allSlides, status, error } = useAppSelector((state) => state.businessSettings.heroSlides)
  const data = useMemo(() => onShop(allSlides, placement), [allSlides, placement])

  return (
    <ContentListCard<HeroSlide>
      title={CARD_COPY[placement].title}
      description={CARD_COPY[placement].description}
      addLabel="Add slide"
      canManage={canManage}
      items={data}
      status={status}
      error={error}
      onRetry={() => dispatch(fetchHeroSlides())}
      contentColumn={{
        id: "slide",
        header: "SLIDE",
        cell: ({ row }) => (
          <div className="flex min-w-0 items-center gap-3">
            <Thumbnail src={row.original.image} icon={ImageIcon} className="w-16" />
            <ProductCell name={slideName(row.original)} sub={row.original.link_url} />
          </div>
        ),
      }}
      itemName={slideName}
      switchLabel={(slide) => `Show ${slideName(slide)} on the storefront`}
      onToggle={(slide, is_active) => dispatch(saveHeroSlide({ id: slide.id, values: { is_active } })).unwrap()}
      toggledMessage={(slide, isActive) => `${slideName(slide)} ${isActive ? "shown" : "hidden"}`}
      toggleError="Couldn't update the slide"
      onDelete={(slide) => dispatch(deleteHeroSlide(slide.id)).unwrap()}
      deletedMessage={(slide) => `${slideName(slide)} deleted`}
      deleteError="Failed to delete slide"
      emptyIcon={Images}
      emptyTitle="No hero slides"
      emptyDescription={placement === "home" ? "The storefront is showing its built-in slides." : undefined}
      renderForm={(form) => (
        <HeroSlideFormDialog
          open={form.open}
          onOpenChange={form.onOpenChange}
          slide={form.editing}
          placement={placement}
          nextSortOrder={form.nextSortOrder}
        />
      )}
    />
  )
}

const schema = z.object({
  alt_text: z.string().trim(),
  tag_en: z.string().trim(),
  tag_bn: z.string().trim(),
  title_en: z.string().trim(),
  title_bn: z.string().trim(),
  link_url: z.string().trim(),
  sort_order: z.string().trim().regex(/^\d+$/, "Enter a whole number"),
  is_active: z.boolean(),
})
type FormValues = z.infer<typeof schema>

function HeroSlideFormDialog({
  open,
  onOpenChange,
  slide,
  placement,
  nextSortOrder,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  slide: HeroSlide | null
  placement: ShopPlacement
  nextSortOrder: number
}) {
  const dispatch = useAppDispatch()
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imageError, setImageError] = useState<string | null>(null)
  const {
    control,
    register,
    reset,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      alt_text: "",
      tag_en: "",
      tag_bn: "",
      title_en: "",
      title_bn: "",
      link_url: "",
      sort_order: "0",
      is_active: true,
    },
  })

  useEffect(() => {
    if (!open) return
    reset({
      alt_text: slide?.alt_text ?? "",
      tag_en: slide?.tag_en ?? "",
      tag_bn: slide?.tag_bn ?? "",
      title_en: slide?.title_en ?? "",
      title_bn: slide?.title_bn ?? "",
      link_url: slide?.link_url ?? "",
      sort_order: String(slide?.sort_order ?? nextSortOrder),
      is_active: slide?.is_active ?? true,
    })
  }, [open, slide, nextSortOrder, reset])

  const close = (next: boolean) => {
    if (!next) {
      setImageFile(null)
      setImageError(null)
    }
    onOpenChange(next)
  }

  const onSubmit = async (values: FormValues) => {
    if (!slide && !imageFile) {
      setImageError("Choose an image for the slide")
      return
    }
    try {
      await dispatch(
        saveHeroSlide({
          id: slide?.id,
          values: { ...values, ...(slide ? {} : { placement }), sort_order: Number(values.sort_order) },
          image: imageFile,
        })
      ).unwrap()
      toast.success(`Slide ${slide ? "updated" : "added"}`)
      close(false)
    } catch (err) {
      const imageMessage = getApiFieldErrors(err).image
      if (imageMessage) setImageError(imageMessage)
      reportFormError(err, { setError, fields: Object.keys(values), fallback: "Failed to save slide" })
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={close}
      title={slide ? "Edit slide" : "Add slide"}
      description="Tag and title are shown over the image, in the language the shopper is browsing in."
      onSubmit={handleSubmit(onSubmit)}
      submitting={isSubmitting}
      submitLabel={slide ? "Save slide" : "Add slide"}
      size="lg"
    >
      <FormField
        label="Image"
        htmlFor="slide-image"
        description="Uploaded when you save."
        error={imageError ? { message: imageError } : undefined}
      >
        <ImagePicker
          id="slide-image"
          src={slide?.image}
          onSelect={(file) => {
            setImageFile(file)
            setImageError(null)
          }}
        />
      </FormField>
      <TextField
        label="Alt text"
        id="slide-alt"
        description="Describes the image for screen readers and search engines."
        error={errors.alt_text}
        {...register("alt_text")}
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField label="Tag (English)" id="slide-tag-en" error={errors.tag_en} {...register("tag_en")} />
        <TextField label="Tag (Bangla)" id="slide-tag-bn" lang="bn" error={errors.tag_bn} {...register("tag_bn")} />
        <TextField label="Title (English)" id="slide-title-en" error={errors.title_en} {...register("title_en")} />
        <TextField
          label="Title (Bangla)"
          id="slide-title-bn"
          lang="bn"
          error={errors.title_bn}
          {...register("title_bn")}
        />
      </div>
      <TextField
        label="Link"
        id="slide-link"
        placeholder="/shop?type=normal"
        description="Where the slide takes the shopper: a site path like /shop?type=normal."
        error={errors.link_url}
        {...register("link_url")}
      />
      <TextField
        label="Sort order"
        id="slide-sort-order"
        type="number"
        min={0}
        step={1}
        description="Lower numbers come first."
        error={errors.sort_order}
        {...register("sort_order")}
      />
      <SwitchField control={control} name="is_active" label="Status" onLabel="Active" offLabel="Inactive" description="Inactive slides stay off the storefront." />
    </FormDialog>
  )
}
