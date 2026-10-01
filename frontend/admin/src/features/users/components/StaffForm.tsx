import { useCallback, useEffect, useState } from "react"
import { Controller, useForm, type FieldValues, type Path, type UseFormSetError } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useNavigate, useParams } from "react-router-dom"
import { toast } from "sonner"
import { ArrowLeft, Loader2, Save } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Field, FieldContent, FieldError, FieldLabel } from "@/components/ui/field"
import { DetailPageState } from "@/components/common/DetailPageState"

import { useAppDispatch, useAppSelector } from "@/app/hooks"
import {
  fetchPermissionCodes,
  fetchSingle,
  patchData,
  postData,
  updateStaffPermissions,
} from "@/features/users/slices/staffSlice"
import { displayNameOf, type AdminUser, type PermissionCodeInfo, type StaffCreatePayload } from "@/features/users/types"
import { getApiErrorMessage, getApiFieldErrors } from "@/lib/api/client"
import { resolveDetailState } from "@/lib/detailState"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { PermissionsEditor } from "./PermissionsEditor"
import { ResetPasswordDialog } from "./ResetPasswordDialog"

const createSchema = z.object({
  email: z.email("Enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  first_name: z.string(),
  last_name: z.string(),
  phone: z.string(),
})

const editSchema = z.object({
  first_name: z.string(),
  last_name: z.string(),
  phone: z.string(),
  is_active: z.boolean(),
})

type CreateFormValues = z.infer<typeof createSchema>
type EditFormValues = z.infer<typeof editSchema>

function applyFieldErrors<T extends FieldValues>(err: unknown, setError: UseFormSetError<T>, fields: string[]) {
  const fieldErrors = getApiFieldErrors(err)
  let mapped = false
  for (const [field, message] of Object.entries(fieldErrors)) {
    if (fields.includes(field)) {
      setError(field as Path<T>, { message })
      mapped = true
    }
  }
  return mapped
}

const StaffForm = () => {
  const { id = "new" } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const { singleData, singleStatus, singleError } = useAppSelector((state) => state.staffs)
  const isEditing = id !== "new"
  const existing = isEditing && singleData?.id === id ? (singleData as AdminUser) : null

  useDocumentTitle(isEditing ? (existing ? `${displayNameOf(existing)} — Staff` : "Edit Staff") : "Add Staff")

  const [codes, setCodes] = useState<PermissionCodeInfo[]>([])
  const [codesError, setCodesError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [savingPermissions, setSavingPermissions] = useState(false)
  const [syncedFor, setSyncedFor] = useState<AdminUser | null>(null)

  const createForm = useForm<CreateFormValues>({
    resolver: zodResolver(createSchema),
    defaultValues: { email: "", password: "", first_name: "", last_name: "", phone: "" },
  })
  const editForm = useForm<EditFormValues>({
    resolver: zodResolver(editSchema),
    defaultValues: { first_name: "", last_name: "", phone: "", is_active: true },
  })

  const loadCodes = useCallback(() => {
    const request = dispatch(fetchPermissionCodes())
    request
      .unwrap()
      .then((rows) => {
        setCodes(rows)
        setCodesError(null)
      })
      .catch((err: unknown) => {
        if ((err as { name?: string })?.name === "AbortError") return
        setCodesError(getApiErrorMessage(err, "Couldn't load permission codes."))
      })
    return request
  }, [dispatch])

  useEffect(() => {
    const request = loadCodes()
    return () => request.abort()
  }, [loadCodes])

  const loadStaff = useCallback(() => dispatch(fetchSingle(id)), [dispatch, id])

  useEffect(() => {
    if (!isEditing) return
    const request = loadStaff()
    return () => request.abort()
  }, [isEditing, loadStaff])

  // Sync the form + permission checklist whenever a fresh copy of this staff member lands
  // (initial load and after saves), adjusting state during render rather than in an effect.
  if (existing && existing !== syncedFor) {
    setSyncedFor(existing)
    editForm.reset({
      first_name: existing.first_name,
      last_name: existing.last_name,
      phone: existing.phone,
      is_active: existing.is_active,
    })
    setSelected(new Set(existing.permissions.filter((p) => p !== "*")))
  }

  const pageState = isEditing ? resolveDetailState(singleStatus, singleError, !!existing) : null
  if (pageState) {
    return (
      <DetailPageState
        state={pageState}
        entity="Staff member"
        backTo="/staffs"
        backLabel="Back to Staff"
        error={singleError}
        onRetry={loadStaff}
      />
    )
  }

  const handleCreate = async (values: CreateFormValues) => {
    const payload: StaffCreatePayload = { ...values, permissions: Array.from(selected) }
    try {
      const created = await dispatch(postData({ payload: payload as unknown as Partial<AdminUser> })).unwrap()
      toast.success(`${values.email} added`)
      navigate(`/staff_form/${created.id}`, { replace: true })
    } catch (err) {
      if (!applyFieldErrors(err, createForm.setError, Object.keys(values))) {
        toast.error(getApiErrorMessage(err, "Couldn't add this staff member"))
      }
    }
  }

  const handleUpdate = async (values: EditFormValues) => {
    if (!existing) return
    try {
      await dispatch(patchData({ id: existing.id, payload: values })).unwrap()
      toast.success("Staff details saved")
    } catch (err) {
      if (!applyFieldErrors(err, editForm.setError, Object.keys(values))) {
        toast.error(getApiErrorMessage(err, "Couldn't save staff details"))
      }
    }
  }

  const handleSavePermissions = async () => {
    if (!existing) return
    setSavingPermissions(true)
    try {
      await dispatch(updateStaffPermissions({ id: existing.id, permissions: Array.from(selected) })).unwrap()
      toast.success("Permissions updated")
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Couldn't update permissions"))
    } finally {
      setSavingPermissions(false)
    }
  }

  const permissionsDirty =
    !!existing &&
    (existing.permissions.length !== selected.size || existing.permissions.some((p) => !selected.has(p)))

  return (
    <div className="section-container space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex items-center gap-4">
          <Button variant="back" size="icon" onClick={() => navigate("/staffs")} aria-label="Back to staff">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
              {isEditing ? "Edit Staff Member" : "Add Staff Member"}
            </h1>
            <p className="text-muted-foreground text-sm">
              {existing ? existing.email : "Create a dashboard account for a team member"}
            </p>
          </div>
        </div>
        {existing && <ResetPasswordDialog userId={existing.id} userLabel={displayNameOf(existing)} />}
      </div>

      {existing ? (
        <form onSubmit={editForm.handleSubmit(handleUpdate)} noValidate>
          <Card>
            <CardHeader>
              <CardTitle>Staff Details</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="first_name">First Name</FieldLabel>
                <FieldContent>
                  <Input id="first_name" {...editForm.register("first_name")} />
                  <FieldError errors={[editForm.formState.errors.first_name]} />
                </FieldContent>
              </Field>
              <Field>
                <FieldLabel htmlFor="last_name">Last Name</FieldLabel>
                <FieldContent>
                  <Input id="last_name" {...editForm.register("last_name")} />
                  <FieldError errors={[editForm.formState.errors.last_name]} />
                </FieldContent>
              </Field>
              <Field>
                <FieldLabel htmlFor="phone">Phone</FieldLabel>
                <FieldContent>
                  <Input id="phone" {...editForm.register("phone")} />
                  <FieldError errors={[editForm.formState.errors.phone]} />
                </FieldContent>
              </Field>
              <Field orientation="horizontal">
                <FieldContent>
                  <FieldLabel htmlFor="is_active">Active</FieldLabel>
                  <p className="text-xs text-muted-foreground">Inactive staff can't sign in.</p>
                </FieldContent>
                <Controller
                  control={editForm.control}
                  name="is_active"
                  render={({ field }) => (
                    <Switch id="is_active" checked={field.value} onCheckedChange={field.onChange} />
                  )}
                />
              </Field>
            </CardContent>
            <CardFooter className="justify-end gap-3 border-t p-4">
              <Button type="submit" disabled={editForm.formState.isSubmitting || !editForm.formState.isDirty}>
                {editForm.formState.isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save Details
              </Button>
            </CardFooter>
          </Card>
        </form>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Staff Details</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <FieldContent>
                <Input id="email" type="email" autoComplete="off" {...createForm.register("email")} />
                <FieldError errors={[createForm.formState.errors.email]} />
              </FieldContent>
            </Field>
            <Field>
              <FieldLabel htmlFor="password">Temporary Password</FieldLabel>
              <FieldContent>
                <Input id="password" type="password" autoComplete="new-password" {...createForm.register("password")} />
                <FieldError errors={[createForm.formState.errors.password]} />
              </FieldContent>
            </Field>
            <Field>
              <FieldLabel htmlFor="first_name">First Name</FieldLabel>
              <FieldContent>
                <Input id="first_name" {...createForm.register("first_name")} />
                <FieldError errors={[createForm.formState.errors.first_name]} />
              </FieldContent>
            </Field>
            <Field>
              <FieldLabel htmlFor="last_name">Last Name</FieldLabel>
              <FieldContent>
                <Input id="last_name" {...createForm.register("last_name")} />
                <FieldError errors={[createForm.formState.errors.last_name]} />
              </FieldContent>
            </Field>
            <Field>
              <FieldLabel htmlFor="phone">Phone</FieldLabel>
              <FieldContent>
                <Input id="phone" {...createForm.register("phone")} />
                <FieldError errors={[createForm.formState.errors.phone]} />
              </FieldContent>
            </Field>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Permissions</CardTitle>
          <CardDescription>
            {existing?.permissions.includes("*")
              ? "This account has full access."
              : "Choose what this staff member can see and do. Saving replaces their current permissions."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {codesError ? (
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              {codesError}
              <Button variant="outline" size="sm" onClick={() => loadCodes()}>Retry</Button>
            </div>
          ) : codes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Loading permissions...</p>
          ) : (
            <PermissionsEditor codes={codes} selected={selected} onChange={setSelected} disabled={savingPermissions} />
          )}
        </CardContent>
        <CardFooter className="justify-end gap-3 border-t p-4">
          {existing ? (
            <Button onClick={handleSavePermissions} disabled={savingPermissions || !permissionsDirty}>
              {savingPermissions ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save Permissions
            </Button>
          ) : (
            <>
              <Button type="button" variant="outline" onClick={() => navigate("/staffs")}>
                Cancel
              </Button>
              <Button onClick={createForm.handleSubmit(handleCreate)} disabled={createForm.formState.isSubmitting}>
                {createForm.formState.isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Create Staff Member
              </Button>
            </>
          )}
        </CardFooter>
      </Card>
    </div>
  )
}

export default StaffForm
