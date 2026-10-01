import { useEffect, useMemo, useState } from "react"
import { Controller, useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Link, useNavigate, useParams } from "react-router-dom"
import { toast } from "sonner"
import { ArrowLeft, ImageIcon, Loader2, Save } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Field, FieldContent, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { DetailPageState } from "@/components/common/DetailPageState"
import { useAppDispatch, useAppSelector } from "@/app/hooks"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { getApiErrorMessage, getApiFieldErrors } from "@/lib/api/client"
import { resolveDetailState } from "@/lib/detailState"

import { fetchSingle } from "../slices/categorySlice"
import { createCategory, updateCategory, uploadCategoryImage } from "../api"
import type { Category, CategoryPayload } from "../types"
import { useCategoryOptions } from "../lib/useCategoryOptions"
import { usePermission } from "../lib/usePermission"

const NO_PARENT = "none"

const schema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  parent_id: z.string(),
  description: z.string(),
  category_type: z.enum(["stock", "preorder"]),
  is_active: z.boolean(),
})
type FormValues = z.infer<typeof schema>

const CategoryForm = () => {
  const { id } = useParams<{ id: string }>()
  const isEditing = Boolean(id && id !== "new")
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const canManage = usePermission("catalog.manage")
  const { singleData, singleStatus, singleError } = useAppSelector((s) => s.categories)
  const existing = singleData as Category | null
  const { categories, options } = useCategoryOptions()
  const [imageFile, setImageFile] = useState<File | null>(null)
  const preview = useMemo(() => (imageFile ? URL.createObjectURL(imageFile) : null), [imageFile])

  useDocumentTitle(isEditing ? (existing?.name ? `Edit ${existing.name}` : "Edit Category") : "Add Category")

  const {
    control,
    register,
    reset,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", parent_id: NO_PARENT, description: "", category_type: "stock", is_active: true },
  })
  const parentId = useWatch({ control, name: "parent_id" })

  useEffect(() => {
    if (isEditing && id) dispatch(fetchSingle(id))
  }, [dispatch, id, isEditing])

  useEffect(() => {
    if (isEditing && existing && existing.id === id) {
      reset({
        name: existing.name,
        parent_id: existing.parent_id ?? NO_PARENT,
        description: existing.description ?? "",
        category_type: existing.category_type,
        is_active: existing.is_active,
      })
    }
  }, [existing, id, isEditing, reset])

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview)
  }, [preview])

  // A category can't be moved under itself or one of its own descendants.
  const parentOptions = useMemo(() => {
    if (!isEditing || !id) return options
    const blocked = new Set<string>([id])
    let grew = true
    while (grew) {
      grew = false
      for (const c of categories) {
        if (c.parent_id && blocked.has(c.parent_id) && !blocked.has(c.id)) {
          blocked.add(c.id)
          grew = true
        }
      }
    }
    return options.filter((o) => !blocked.has(o.value))
  }, [options, categories, id, isEditing])

  const parent = parentId !== NO_PARENT ? categories.find((c) => c.id === parentId) : undefined
  const isRoot = parentId === NO_PARENT

  if (!canManage) {
    return (
      <div className="section-container py-16 text-center text-sm text-muted-foreground">
        You don't have permission to edit categories.{" "}
        <Link className="text-primary underline" to="/categories">
          Back to categories
        </Link>
      </div>
    )
  }

  const pageState = isEditing ? resolveDetailState(singleStatus, singleError, existing?.id === id) : null
  if (pageState) {
    return (
      <DetailPageState
        state={pageState}
        entity="Category"
        backTo="/categories"
        backLabel="Back to Categories"
        error={singleError}
        onRetry={() => id && dispatch(fetchSingle(id))}
      />
    )
  }

  const onSubmit = async (values: FormValues) => {
    const payload: CategoryPayload = {
      name: values.name,
      parent_id: values.parent_id === NO_PARENT ? null : values.parent_id,
      description: values.description,
    }
    // A subcategory's type is locked to its parent's; only a root category may set it.
    if (isRoot) payload.category_type = values.category_type
    try {
      let saved: Category
      if (isEditing && id) {
        payload.is_active = values.is_active
        saved = await updateCategory(id, payload)
      } else {
        saved = await createCategory(payload)
      }
      if (imageFile) {
        try {
          await uploadCategoryImage(saved.id, imageFile)
        } catch (err) {
          toast.error(getApiErrorMessage(err, "Category saved, but the image upload failed"))
        }
      }
      toast.success(`${values.name} ${isEditing ? "updated" : "created"}`)
      navigate("/categories")
    } catch (err) {
      for (const [field, message] of Object.entries(getApiFieldErrors(err))) {
        if (field in values) setError(field as keyof FormValues, { message })
      }
      toast.error(getApiErrorMessage(err, "Failed to save category"))
    }
  }

  const currentImage = preview ?? existing?.image ?? null

  return (
    <div className="section-container">
      <div className="flex items-center gap-4">
        <Button variant="back" size="icon" aria-label="Back" onClick={() => navigate("/categories")}>
          <ArrowLeft className="size-4" />
        </Button>
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{isEditing ? "Edit Category" : "Add Category"}</h1>
          <p className="text-muted-foreground text-sm">
            {isEditing ? `Editing ${existing?.name ?? ""}` : "Create a category to organise your catalog"}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)}>
        <Card>
          <CardHeader>
            <CardTitle>Category details</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="name">Name</FieldLabel>
              <FieldContent>
                <Input id="name" placeholder="e.g. T-Shirts" {...register("name")} />
                <FieldError errors={[errors.name]} />
              </FieldContent>
            </Field>

            <Field>
              <FieldLabel htmlFor="parent_id">Parent category</FieldLabel>
              <FieldContent>
                <Controller
                  control={control}
                  name="parent_id"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="parent_id" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NO_PARENT}>None (root category)</SelectItem>
                        {parentOptions.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {"  ".repeat(o.depth)}
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <FieldError errors={[errors.parent_id]} />
              </FieldContent>
            </Field>

            <Field>
              <FieldLabel htmlFor="category_type">Category type</FieldLabel>
              <FieldContent>
                {isRoot ? (
                  <Controller
                    control={control}
                    name="category_type"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger id="category_type" className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="stock">Stock</SelectItem>
                          <SelectItem value="preorder">Pre-order</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  />
                ) : (
                  <Input id="category_type" disabled value={parent?.category_type === "preorder" ? "Pre-order" : "Stock"} />
                )}
                <FieldDescription>
                  {isRoot ? "Subcategories inherit this type." : "Inherited from the parent category."}
                </FieldDescription>
                <FieldError errors={[errors.category_type]} />
              </FieldContent>
            </Field>

            {isEditing && (
              <Field orientation="horizontal">
                <FieldContent>
                  <FieldLabel htmlFor="is_active">Active</FieldLabel>
                </FieldContent>
                <Controller
                  control={control}
                  name="is_active"
                  render={({ field }) => <Switch id="is_active" checked={field.value} onCheckedChange={field.onChange} />}
                />
              </Field>
            )}

            <Field className="md:col-span-2">
              <FieldLabel htmlFor="description">Description</FieldLabel>
              <FieldContent>
                <Textarea id="description" rows={3} {...register("description")} />
                <FieldError errors={[errors.description]} />
              </FieldContent>
            </Field>

            <Field className="md:col-span-2">
              <FieldLabel htmlFor="category-image">Image</FieldLabel>
              <FieldContent>
                <div className="flex items-center gap-4">
                  <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted">
                    {currentImage ? (
                      <img src={currentImage} alt="" className="size-full object-cover" />
                    ) : (
                      <ImageIcon className="size-6 text-muted-foreground" />
                    )}
                  </div>
                  <Input
                    id="category-image"
                    type="file"
                    accept="image/*"
                    className="max-w-xs"
                    onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
                  />
                </div>
                <FieldDescription>Uploaded when you save.</FieldDescription>
              </FieldContent>
            </Field>
          </CardContent>
          <CardFooter className="justify-end gap-3 border-t p-4">
            <Button type="button" variant="outline" onClick={() => navigate("/categories")}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              {isEditing ? "Save changes" : "Create category"}
            </Button>
          </CardFooter>
        </Card>
      </form>
    </div>
  )
}

export default CategoryForm
