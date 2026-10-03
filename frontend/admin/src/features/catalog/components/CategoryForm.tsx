import { useEffect, useMemo, useState } from "react"
import { Controller, useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useNavigate, useParams } from "react-router-dom"
import { toast } from "sonner"

import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Field, FieldContent, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { DetailPageState } from "@/components/common/DetailPageState"
import { PageHeader } from "@/components/common/PageHeader"
import { SwitchField } from "@/components/common/FormDialog"
import { FormActions } from "@/components/common/FormActions"
import { NoPermission } from "@/components/common/NoPermission"
import { FormField, TextField, TextareaField } from "@/components/common/form-fields"
import { ImagePicker } from "@/components/common/ImagePicker"
import { useAppDispatch, useAppSelector } from "@/app/hooks"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { useCan } from "@/hooks/use-can"
import { getApiErrorMessage } from "@/lib/api/client"
import { resolveDetailState } from "@/lib/detailState"
import { reportFormError } from "@/lib/forms"

import { fetchSingle } from "../slices/categorySlice"
import { createCategory, updateCategory, uploadCategoryImage } from "../api"
import type { Category, CategoryPayload } from "../types"
import { useCategoryOptions } from "../lib/useCategoryOptions"
import { CategoryTreeSelect } from "./CategoryTreeSelect"

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
  const canManage = useCan("catalog.manage")
  const { singleData, singleStatus, singleError } = useAppSelector((s) => s.categories)
  const existing = singleData as Category | null
  const { categories, options } = useCategoryOptions()
  const [imageFile, setImageFile] = useState<File | null>(null)

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
      <NoPermission message="You don't have permission to edit categories." backTo="/categories" backLabel="Back to categories" />
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
      reportFormError(err, { setError, fields: Object.keys(values), fallback: "Failed to save category" })
    }
  }


  return (
    <div className="section-container">
      <PageHeader
        title={isEditing ? "Edit Category" : "Add Category"}
        description={isEditing ? `Editing ${existing?.name ?? ""}` : undefined}
        back={{ to: "/categories", label: "Back" }}
      />

      <form onSubmit={handleSubmit(onSubmit)}>
        <Card>
          <CardHeader>
            <CardTitle>Category details</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <TextField label="Name" id="name" placeholder="e.g. T-Shirts" error={errors.name} {...register("name")} />

            <Field>
              <FieldLabel htmlFor="parent_id">Parent category</FieldLabel>
              <FieldContent>
                <CategoryTreeSelect
                  control={control}
                  name="parent_id"
                  id="parent_id"
                  options={parentOptions}
                  none={{ value: NO_PARENT, label: "None (root category)" }}
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
              <SwitchField control={control} name="is_active" label="Active" />
            )}

            <TextareaField
              className="md:col-span-2"
              label="Description"
              id="description"
              rows={3}
              error={errors.description}
              {...register("description")}
            />

            <FormField
              className="md:col-span-2"
              label="Image"
              htmlFor="category-image"
              description="Uploaded when you save."
            >
              <ImagePicker id="category-image" src={existing?.image} onSelect={setImageFile} />
            </FormField>
          </CardContent>
          <CardFooter className="justify-end border-t p-4">
            <FormActions
              onCancel={() => navigate("/categories")}
              submitLabel={isEditing ? "Save changes" : "Create category"}
              submitting={isSubmitting}
            />
          </CardFooter>
        </Card>
      </form>
    </div>
  )
}

export default CategoryForm
