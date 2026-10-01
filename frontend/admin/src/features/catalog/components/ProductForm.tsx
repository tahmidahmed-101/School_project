import { useEffect } from "react"
import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Link, useNavigate, useParams } from "react-router-dom"
import { toast } from "sonner"
import { ArrowLeft, Loader2, Save } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
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

import { fetchSingle } from "../slices/productSlice"
import { createProduct, updateProduct } from "../api"
import type { Product, ProductPayload } from "../types"
import { useCategoryOptions } from "../lib/useCategoryOptions"
import { usePermission } from "../lib/usePermission"

const money = z
  .string()
  .trim()
  .refine((v) => v === "" || (/^\d+(\.\d{1,2})?$/.test(v) && Number(v) >= 0), "Enter a valid amount (max 2 decimals)")

const schema = z
  .object({
    name: z.string().trim().min(1, "Name is required"),
    category_id: z.string().min(1, "Choose a category"),
    product_type: z.enum(["simple", "variant"]),
    description: z.string(),
    highlights: z.string(),
    meta_keywords: z.string(),
    price: money,
    cost_price: money,
    discount_price: money,
    sku: z.string().trim(),
    is_active: z.boolean(),
  })
  .refine((v) => !v.discount_price || (v.price !== "" && Number(v.discount_price) < Number(v.price)), {
    path: ["discount_price"],
    message: "Discount price must be lower than the price",
  })

type FormValues = z.infer<typeof schema>

const ProductForm = () => {
  const { id } = useParams<{ id: string }>()
  const isEditing = Boolean(id && id !== "new")
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const canManage = usePermission("catalog.manage")
  const { singleData, singleStatus, singleError } = useAppSelector((s) => s.products)
  const product = singleData as Product | null
  const { options: categoryOptions } = useCategoryOptions()

  useDocumentTitle(isEditing ? (product?.name ? `Edit ${product.name}` : "Edit Product") : "Add Product")

  const {
    control,
    register,
    reset,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting, dirtyFields },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      category_id: "",
      product_type: "simple",
      description: "",
      highlights: "",
      meta_keywords: "",
      price: "",
      cost_price: "",
      discount_price: "",
      sku: "",
      is_active: true,
    },
  })

  useEffect(() => {
    if (isEditing && id) dispatch(fetchSingle(id))
  }, [dispatch, id, isEditing])

  useEffect(() => {
    if (isEditing && product && product.id === id) {
      reset({
        name: product.name,
        category_id: product.category_id,
        product_type: product.product_type === "variant" ? "variant" : "simple",
        description: product.description ?? "",
        highlights: (product.highlights ?? []).join("\n"),
        meta_keywords: product.meta_keywords ?? "",
        price: product.price ?? "",
        cost_price: product.cost_price ?? "",
        discount_price: product.discount_price ?? "",
        sku: "",
        is_active: product.is_active,
      })
    }
  }, [product, id, isEditing, reset])

  if (!canManage) {
    return (
      <div className="section-container py-16 text-center text-sm text-muted-foreground">
        You don't have permission to edit products.{" "}
        <Link className="text-primary underline" to="/products">
          Back to products
        </Link>
      </div>
    )
  }

  const pageState = isEditing ? resolveDetailState(singleStatus, singleError, product?.id === id) : null
  if (pageState) {
    return (
      <DetailPageState
        state={pageState}
        entity="Product"
        backTo="/products"
        backLabel="Back to Products"
        error={singleError}
        onRetry={() => id && dispatch(fetchSingle(id))}
      />
    )
  }

  if (isEditing && product?.product_type === "bundle") {
    const bundleId = product.variants[0]?.id
    return (
      <div className="section-container py-16 text-center text-sm text-muted-foreground">
        Bundles are edited from the Bundles page.{" "}
        <Link className="text-primary underline" to={bundleId ? `/bundles/${bundleId}` : "/bundles"}>
          Open bundle editor
        </Link>
      </div>
    )
  }

  const onSubmit = async (values: FormValues) => {
    const payload: ProductPayload = {
      name: values.name,
      category_id: values.category_id,
      product_type: values.product_type,
      description: values.description,
      highlights: values.highlights
        .split("\n")
        .map((h) => h.trim())
        .filter(Boolean),
      meta_keywords: values.meta_keywords,
    }
    // On edit, pricing fans out to every variant server-side — only send what was changed.
    const touched = (f: "price" | "cost_price" | "discount_price") => !isEditing || Boolean(dirtyFields[f])
    if (values.price && touched("price")) payload.price = values.price
    if (values.cost_price && touched("cost_price")) payload.cost_price = values.cost_price
    if (touched("discount_price")) payload.discount_price = values.discount_price || null

    try {
      if (isEditing && id) {
        payload.is_active = values.is_active
        await updateProduct(id, payload)
        toast.success(`${values.name} updated`)
        navigate(`/product_detail/${id}`)
      } else {
        if (values.sku) payload.sku = values.sku
        if (!values.price) delete payload.discount_price
        const created = await createProduct(payload)
        toast.success(`${values.name} created`)
        navigate(`/product_detail/${created.id}`)
      }
    } catch (err) {
      const fieldErrors = getApiFieldErrors(err)
      for (const [field, message] of Object.entries(fieldErrors)) {
        if (field in values) setError(field as keyof FormValues, { message })
      }
      toast.error(getApiErrorMessage(err, "Failed to save product"))
    }
  }

  const backTo = isEditing ? `/product_detail/${id}` : "/products"

  return (
    <div className="section-container">
      <div className="flex items-center gap-4">
        <Button variant="back" size="icon" aria-label="Back" onClick={() => navigate(backTo)}>
          <ArrowLeft className="size-4" />
        </Button>
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
            {isEditing ? "Edit Product" : "Add Product"}
          </h1>
          <p className="text-muted-foreground text-sm">
            {isEditing ? `Editing ${product?.name ?? ""}` : "Create a product; add images and variants after saving"}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Basic information</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field className="md:col-span-2">
              <FieldLabel htmlFor="name">Product name</FieldLabel>
              <FieldContent>
                <Input id="name" placeholder="e.g. Oversized Graphic Tee" {...register("name")} />
                <FieldError errors={[errors.name]} />
              </FieldContent>
            </Field>

            <Field>
              <FieldLabel htmlFor="category_id">Category</FieldLabel>
              <FieldContent>
                <Controller
                  control={control}
                  name="category_id"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="category_id" className="w-full">
                        <SelectValue placeholder="Choose a category" />
                      </SelectTrigger>
                      <SelectContent>
                        {categoryOptions.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {"  ".repeat(o.depth)}
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <FieldError errors={[errors.category_id]} />
              </FieldContent>
            </Field>

            <Field>
              <FieldLabel htmlFor="product_type">Product type</FieldLabel>
              <FieldContent>
                <Controller
                  control={control}
                  name="product_type"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="product_type" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="simple">Simple — one sellable SKU</SelectItem>
                        <SelectItem value="variant">Variant — colours / sizes</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
                <FieldDescription>
                  Bundles are created from <Link to="/bundles/new" className="text-primary underline">Bundles</Link>.
                </FieldDescription>
                <FieldError errors={[errors.product_type]} />
              </FieldContent>
            </Field>

            <Field className="md:col-span-2">
              <FieldLabel htmlFor="description">Description</FieldLabel>
              <FieldContent>
                <Textarea id="description" rows={4} {...register("description")} />
                <FieldError errors={[errors.description]} />
              </FieldContent>
            </Field>

            <Field>
              <FieldLabel htmlFor="highlights">Highlights</FieldLabel>
              <FieldContent>
                <Textarea id="highlights" rows={4} placeholder="One highlight per line" {...register("highlights")} />
                <FieldError errors={[errors.highlights]} />
              </FieldContent>
            </Field>

            <Field>
              <FieldLabel htmlFor="meta_keywords">Meta keywords</FieldLabel>
              <FieldContent>
                <Input id="meta_keywords" placeholder="comma, separated, keywords" {...register("meta_keywords")} />
                <FieldError errors={[errors.meta_keywords]} />
              </FieldContent>
            </Field>

            {isEditing && (
              <Field orientation="horizontal">
                <FieldContent>
                  <FieldLabel htmlFor="is_active">Active</FieldLabel>
                  <FieldDescription>Inactive products are hidden from the storefront.</FieldDescription>
                </FieldContent>
                <Controller
                  control={control}
                  name="is_active"
                  render={({ field }) => (
                    <Switch id="is_active" checked={field.value} onCheckedChange={field.onChange} />
                  )}
                />
              </Field>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Pricing</CardTitle>
            <CardDescription>
              {isEditing
                ? "Price changes apply to every live variant of this product."
                : "Setting a price creates the product's first variant now, so it can be stocked and sold immediately."}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Field>
              <FieldLabel htmlFor="price">Price (BDT)</FieldLabel>
              <FieldContent>
                <Input id="price" inputMode="decimal" placeholder="0.00" {...register("price")} />
                <FieldError errors={[errors.price]} />
              </FieldContent>
            </Field>
            <Field>
              <FieldLabel htmlFor="discount_price">Discount price</FieldLabel>
              <FieldContent>
                <Input id="discount_price" inputMode="decimal" placeholder="Optional" {...register("discount_price")} />
                <FieldError errors={[errors.discount_price]} />
              </FieldContent>
            </Field>
            <Field>
              <FieldLabel htmlFor="cost_price">Cost price</FieldLabel>
              <FieldContent>
                <Input id="cost_price" inputMode="decimal" placeholder="0.00" {...register("cost_price")} />
                <FieldError errors={[errors.cost_price]} />
              </FieldContent>
            </Field>
            {!isEditing && (
              <Field>
                <FieldLabel htmlFor="sku">SKU</FieldLabel>
                <FieldContent>
                  <Input id="sku" placeholder="Auto-generated if blank" {...register("sku")} />
                  <FieldError errors={[errors.sku]} />
                </FieldContent>
              </Field>
            )}
          </CardContent>
          <CardFooter className="justify-end gap-3 border-t p-4">
            <Button type="button" variant="outline" onClick={() => navigate(backTo)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              {isEditing ? "Save changes" : "Create product"}
            </Button>
          </CardFooter>
        </Card>
      </form>
    </div>
  )
}

export default ProductForm
