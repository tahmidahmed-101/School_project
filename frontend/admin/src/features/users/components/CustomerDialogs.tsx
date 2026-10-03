import { useEffect } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"

import { FormDialog, SwitchField } from "@/components/common/FormDialog"
import { SelectField, TextField } from "@/components/common/form-fields"
import { useAppDispatch } from "@/app/hooks"
import { reportFormError } from "@/lib/forms"

import { addUserAddress, patchData, postData, setUserRole } from "../slices/customerSlice"
import { displayNameOf, type AdminUser, type UserRole } from "../types"

// ---------------------------------------------------------------- create / edit

const customerSchema = z.object({
  first_name: z.string().trim(),
  last_name: z.string().trim(),
  phone: z.string().trim(),
  // Create only; the API identifies an account by email and needs a password of 8+ characters.
  email: z.string().trim(),
  password: z.string(),
})
type CustomerValues = z.infer<typeof customerSchema>

/**
 * Adds a customer account (POST /admin/users/ with role "customer"), or edits an existing
 * one's name and phone (PATCH /admin/users/{id}/). Email can't be changed after creation.
 */
export function CustomerFormDialog({
  open,
  onOpenChange,
  customer,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The customer being edited; null/undefined creates a new one. */
  customer?: AdminUser | null
  onSaved?: (customer: AdminUser) => void
}) {
  const dispatch = useAppDispatch()
  const {
    register,
    reset,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CustomerValues>({
    resolver: zodResolver(customerSchema),
    defaultValues: { first_name: "", last_name: "", phone: "", email: "", password: "" },
  })

  useEffect(() => {
    if (open) {
      reset({
        first_name: customer?.first_name ?? "",
        last_name: customer?.last_name ?? "",
        phone: customer?.phone ?? "",
        email: customer?.email ?? "",
        password: "",
      })
    }
  }, [open, customer, reset])

  const onSubmit = async (values: CustomerValues) => {
    if (!customer) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) return setError("email", { message: "Enter a valid email" })
      if (values.password.length < 8) return setError("password", { message: "At least 8 characters" })
    }
    try {
      const { first_name, last_name, phone } = values
      const saved = customer
        ? await dispatch(patchData({ id: customer.id, payload: { first_name, last_name, phone } })).unwrap()
        : await dispatch(
            postData({ payload: { ...values, role: "customer" } as Partial<AdminUser> & { password: string } })
          ).unwrap()
      toast.success(customer ? "Customer updated" : "Customer created")
      onSaved?.(saved as AdminUser)
      onOpenChange(false)
    } catch (err) {
      reportFormError(err, { setError, fields: Object.keys(values), fallback: "Failed to save customer" })
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={customer ? `Edit ${displayNameOf(customer)}` : "Add customer"}
      description={customer ? undefined : "Creates an account the customer can sign in to."}
      onSubmit={handleSubmit(onSubmit)}
      submitting={isSubmitting}
      submitLabel={customer ? "Save changes" : "Create customer"}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField label="First name" error={errors.first_name} {...register("first_name")} />
        <TextField label="Last name" error={errors.last_name} {...register("last_name")} />
      </div>
      <TextField label="Phone" type="tel" placeholder="01XXXXXXXXX" error={errors.phone} {...register("phone")} />
      {!customer && (
        <>
          <TextField
            label="Email *"
            type="email"
            autoComplete="off"
            placeholder="name@example.com"
            error={errors.email}
            {...register("email")}
          />
          <TextField
            label="Password *"
            type="password"
            autoComplete="new-password"
            description="At least 8 characters. The customer can change it later."
            error={errors.password}
            {...register("password")}
          />
        </>
      )}
    </FormDialog>
  )
}

// ---------------------------------------------------------------- address

const addressSchema = z.object({
  full_name: z.string().trim().min(1, "Name is required"),
  phone: z.string().trim().min(1, "Phone is required"),
  line1: z.string().trim().min(1, "Address is required"),
  line2: z.string().trim(),
  city: z.string().trim(),
  postal_code: z.string().trim(),
  address_type: z.enum(["shipping", "billing", "other"]),
  is_default: z.boolean(),
})
type AddressValues = z.infer<typeof addressSchema>

/** Adds an address to a customer's address book (POST /admin/users/{id}/addresses/). */
export function AddressFormDialog({
  open,
  onOpenChange,
  customer,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  customer: AdminUser
  onSaved: () => void
}) {
  const dispatch = useAppDispatch()
  const {
    control,
    register,
    reset,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<AddressValues>({
    resolver: zodResolver(addressSchema),
    defaultValues: {
      full_name: "",
      phone: "",
      line1: "",
      line2: "",
      city: "",
      postal_code: "",
      address_type: "shipping",
      is_default: false,
    },
  })

  useEffect(() => {
    if (open) {
      reset({
        full_name: displayNameOf(customer),
        phone: customer.contact_phone || customer.phone || "",
        line1: "",
        line2: "",
        city: "",
        postal_code: "",
        address_type: "shipping",
        is_default: false,
      })
    }
  }, [open, customer, reset])

  const onSubmit = async (values: AddressValues) => {
    try {
      await dispatch(addUserAddress({ id: customer.id, payload: { ...values, country: "Bangladesh" } })).unwrap()
      toast.success("Address added")
      onSaved()
      onOpenChange(false)
    } catch (err) {
      reportFormError(err, { setError, fields: Object.keys(values), fallback: "Failed to add address" })
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Add address"
      description={`For ${displayNameOf(customer)}.`}
      onSubmit={handleSubmit(onSubmit)}
      submitting={isSubmitting}
      submitLabel="Add address"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField label="Recipient name *" error={errors.full_name} {...register("full_name")} />
        <TextField label="Phone *" type="tel" error={errors.phone} {...register("phone")} />
      </div>
      <TextField
        label="Address *"
        placeholder="House, road, village, area, thana"
        error={errors.line1}
        {...register("line1")}
      />
      <TextField label="Delivery note" placeholder="Optional" error={errors.line2} {...register("line2")} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField label="District / city" error={errors.city} {...register("city")} />
        <TextField label="Postal code" placeholder="Optional" error={errors.postal_code} {...register("postal_code")} />
      </div>
      <SelectField
        control={control}
        name="address_type"
        label="Type"
        options={[
          { label: "Shipping", value: "shipping" },
          { label: "Billing", value: "billing" },
          { label: "Other", value: "other" },
        ]}
      />
      <SwitchField control={control} name="is_default" label="Make this the default address" />
    </FormDialog>
  )
}

// ---------------------------------------------------------------- role

const roleSchema = z.object({ role: z.enum(["customer", "staff", "admin"]) })
type RoleValues = z.infer<typeof roleSchema>

/** Changes an account's role (POST /admin/users/{id}/set-role/), e.g. promotes a customer to staff. */
export function SetRoleDialog({
  open,
  onOpenChange,
  user,
  onChanged,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  user: AdminUser
  onChanged?: (role: UserRole) => void
}) {
  const dispatch = useAppDispatch()
  const {
    control,
    reset,
    handleSubmit,
    setError,
    formState: { isSubmitting },
  } = useForm<RoleValues>({ resolver: zodResolver(roleSchema), defaultValues: { role: "customer" } })

  useEffect(() => {
    if (open) reset({ role: user.role as RoleValues["role"] })
  }, [open, user, reset])

  const onSubmit = async (values: RoleValues) => {
    try {
      await dispatch(setUserRole({ id: user.id, role: values.role })).unwrap()
      toast.success(`${displayNameOf(user)} is now ${values.role === "admin" ? "an admin" : `a ${values.role}`}`)
      onChanged?.(values.role)
      onOpenChange(false)
    } catch (err) {
      reportFormError(err, { setError, fields: ["role"], fallback: "Failed to change the role" })
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Change role for ${displayNameOf(user)}`}
      description="Staff and admins can sign in to this dashboard. Staff see only what their permissions allow; admins see everything."
      onSubmit={handleSubmit(onSubmit)}
      submitting={isSubmitting}
      submitLabel="Change role"
    >
      <SelectField
        control={control}
        name="role"
        label="Role"
        options={[
          { label: "Customer", value: "customer" },
          { label: "Staff", value: "staff" },
          { label: "Admin", value: "admin" },
        ]}
      />
    </FormDialog>
  )
}
