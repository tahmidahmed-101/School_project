import { useEffect, useMemo, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useNavigate, useParams } from "react-router-dom"
import { toast } from "sonner"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldContent, FieldError, FieldLabel } from "@/components/ui/field"
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
  const listPath = "/categories"

  const title = isEditing ? "Edit category" : "Add category"
  useDocumentTitle(isEditing && existing?.name ? `Edit ${existing.name}` : title)

  const {
    control,
    register,
    reset,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", parent_id: NO_PARENT, description: "", is_active: true },
  })

  useEffect(() => {
    if (isEditing && id) dispatch(fetchSingle(id))
  }, [dispatch, id, isEditing])

  useEffect(() => {
    if (isEditing && existing && existing.id === id) {
      reset({
        name: existing.name,
        parent_id: existing.parent_id ?? NO_PARENT,
        description: existing.description ?? "",
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

  if (!canManage) {
    return (
      <NoPermission message="You don't have permission to edit categories." backTo={listPath} backLabel="Back to categories" />
    )
  }

  const pageState = isEditing ? resolveDetailState(singleStatus, singleError, existing?.id === id) : null
  if (pageState) {
    return (
      <DetailPageState
        state={pageState}
        entity="Category"
        backTo={listPath}
        backLabel="Back to categories"
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
      is_active: values.is_active,
    }
    // A subcategory takes its parent's type on the server; only a new root category is told it.
    if (!isEditing && payload.parent_id === null) payload.category_type = "stock"
    try {
      let saved: Category
      if (isEditing && id) {
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
      navigate(listPath)
    } catch (err) {
      reportFormError(err, { setError, fields: Object.keys(values), fallback: "Failed to save category" })
    }
  }


  return (
    <div className="section-container">
      <PageHeader
        title={title}
        description={isEditing ? `Editing ${existing?.name ?? ""}` : undefined}
        back={{ to: listPath, label: "Back" }}
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

            <TextareaField
              className="md:col-span-2"
              label="Description"
              id="description"
              rows={3}
              error={errors.description}
              {...register("description")}
            />

            {/* The image and the status share the last row. */}
            <FormField label="Image" htmlFor="category-image" description="Uploaded when you save.">
              <ImagePicker id="category-image" src={existing?.image} onSelect={setImageFile} />
            </FormField>

            <SwitchField
              control={control}
              name="is_active"
              label="Status"
              onLabel="Active"
              offLabel="Inactive"
              className="self-start"
            />
          </CardContent>
        </Card>
        <FormActions
          sticky
          onCancel={() => navigate(listPath)}
          submitLabel={isEditing ? "Save changes" : "Create category"}
          submitting={isSubmitting}
        />
      </form>
    </div>
  )
}

export default CategoryForm
