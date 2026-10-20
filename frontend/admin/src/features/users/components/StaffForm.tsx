import { useCallback, useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useNavigate, useParams } from "react-router-dom"
import { toast } from "sonner"
import { Save, RotateCcw, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { SwitchField } from "@/components/common/FormDialog"
import { DetailPageState } from "@/components/common/DetailPageState"
import { PageHeader } from "@/components/common/PageHeader"
import { SubmitButton, StickyFormBar } from "@/components/common/FormActions"
import { TextField } from "@/components/common/form-fields"

import { useAppDispatch, useAppSelector } from "@/app/hooks"
import {
  fetchPermissionCodes,
  fetchSingle,
  patchData,
  postData,
  updateStaffPermissions,
} from "@/features/users/slices/staffSlice"
import { displayNameOf, type AdminUser, type PermissionCodeInfo, type StaffCreatePayload } from "@/features/users/types"
import { getApiErrorMessage } from "@/lib/api/client"
import { reportFormError } from "@/lib/forms"
import { resolveDetailState } from "@/lib/detailState"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { isFullAccess } from "@/hooks/use-can"
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
      reportFormError(err, {
        setError: createForm.setError,
        fields: Object.keys(values),
        fallback: "Couldn't add this staff member",
      })
    }
  }

  const handleUpdate = async (values: EditFormValues) => {
    if (!existing) return
    try {
      await dispatch(patchData({ id: existing.id, payload: values })).unwrap()
      toast.success("Staff details saved")
    } catch (err) {
      reportFormError(err, {
        setError: editForm.setError,
        fields: Object.keys(values),
        fallback: "Couldn't save staff details",
      })
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
      <PageHeader
        title={isEditing ? "Edit Staff Member" : "Add Staff Member"}
        description={existing ? existing.email : undefined}
        back={{ to: "/staffs", label: "Back to staff" }}
        actions={existing && <ResetPasswordDialog userId={existing.id} userLabel={displayNameOf(existing)} />}
      />

      {existing ? (
        <form onSubmit={editForm.handleSubmit(handleUpdate)} noValidate>
          <Card>
            <CardHeader>
              <CardTitle>Staff Details</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <TextField
                label="First Name"
                id="first_name"
                error={editForm.formState.errors.first_name}
                {...editForm.register("first_name")}
              />
              <TextField
                label="Last Name"
                id="last_name"
                error={editForm.formState.errors.last_name}
                {...editForm.register("last_name")}
              />
              <TextField
                label="Phone"
                id="phone"
                error={editForm.formState.errors.phone}
                {...editForm.register("phone")}
              />
              <SwitchField
                control={editForm.control}
                name="is_active"
                label="Status"
                onLabel="Active"
                offLabel="Inactive"
                description="Inactive staff can't sign in."
              />
            </CardContent>
            <CardFooter className="justify-end gap-3 border-t p-4">
              <SubmitButton loading={editForm.formState.isSubmitting} icon={Save} disabled={!editForm.formState.isDirty}>
                Save Details
              </SubmitButton>
            </CardFooter>
          </Card>
        </form>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Staff Details</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <TextField
              label="Email"
              id="email"
              type="email"
              autoComplete="off"
              error={createForm.formState.errors.email}
              {...createForm.register("email")}
            />
            <TextField
              label="Temporary Password"
              id="password"
              type="password"
              autoComplete="new-password"
              error={createForm.formState.errors.password}
              {...createForm.register("password")}
            />
            <TextField
              label="First Name"
              id="first_name"
              error={createForm.formState.errors.first_name}
              {...createForm.register("first_name")}
            />
            <TextField
              label="Last Name"
              id="last_name"
              error={createForm.formState.errors.last_name}
              {...createForm.register("last_name")}
            />
            <TextField
              label="Phone"
              id="phone"
              error={createForm.formState.errors.phone}
              {...createForm.register("phone")}
            />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Permissions</CardTitle>
          <CardDescription>
            {isFullAccess(existing?.permissions)
              ? "This account has full access."
              : "Choose what this staff member can see and do. Saving replaces their current permissions."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {codesError ? (
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              {codesError}
              <Button variant="outline" size="sm" onClick={() => loadCodes()}><RotateCcw className="size-4" /> Retry</Button>
            </div>
          ) : codes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Loading permissions...</p>
          ) : (
            <PermissionsEditor codes={codes} selected={selected} onChange={setSelected} disabled={savingPermissions} />
          )}
        </CardContent>
        {existing && (
          <CardFooter className="justify-end gap-3 border-t p-4">
            <SubmitButton type="button" loading={savingPermissions} icon={Save} onClick={handleSavePermissions} disabled={!permissionsDirty}>
              Save Permissions
            </SubmitButton>
          </CardFooter>
        )}
      </Card>

      {!existing && (
        <StickyFormBar>
          <Button type="button" variant="outline" onClick={() => navigate("/staffs")}>
            <X className="size-4" />
            Cancel
          </Button>
          <SubmitButton type="button" loading={createForm.formState.isSubmitting} icon={Save} onClick={createForm.handleSubmit(handleCreate)}>
            Create Staff Member
          </SubmitButton>
        </StickyFormBar>
      )}
    </div>
  )
}

export default StaffForm
