import { useRef, useState, type ChangeEvent, type FormEvent } from "react"
import { Camera, KeyRound, Loader2, Lock, Mail, Save, Shield, Trash2, User } from "lucide-react"
import { toast } from "sonner"
import { useAppDispatch, useAppSelector } from "@/app/hooks"
import { changePassword, updateProfile } from "@/features/authentication/slices/authSlice"
import { uploadImage } from "@/features/system/files"
import { getApiErrorMessage } from "@/lib/api/client"
import { humanize } from "@/lib/format"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { PageHeading } from "@/components/common/PageHeading"
import { useDocumentTitle } from "@/hooks/use-document-title"

const Profile = () => {
  useDocumentTitle("Profile")

  const dispatch = useAppDispatch()
  const user = useAppSelector((state) => state.auth.user)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [firstName, setFirstName] = useState(user?.first_name ?? "")
  const [lastName, setLastName] = useState(user?.last_name ?? "")
  const [phone, setPhone] = useState(user?.phone ?? "")
  const [isSaving, setIsSaving] = useState(false)
  const [isUploading, setIsUploading] = useState(false)

  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [isChangingPassword, setIsChangingPassword] = useState(false)

  // Re-sync the form when the stored user changes (e.g. after a save), during render.
  const [syncedUser, setSyncedUser] = useState(user)
  if (user && user !== syncedUser) {
    setSyncedUser(user)
    setFirstName(user.first_name ?? "")
    setLastName(user.last_name ?? "")
    setPhone(user.phone ?? "")
  }

  if (!user) return null

  const displayName = [user.first_name, user.last_name].filter(Boolean).join(" ") || user.email
  const initials =
    displayName
      .split(/[\s@.]+/)
      .filter(Boolean)
      .map((part) => part[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "U"
  const isDirty =
    firstName !== (user.first_name ?? "") || lastName !== (user.last_name ?? "") || phone !== (user.phone ?? "")
  const fullAccess = user.permissions.includes("*")

  const savePicture = async (url: string, success: string) => {
    await dispatch(updateProfile({ profile_picture: url })).unwrap()
    toast.success(success)
  }

  const handlePhotoUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    setIsUploading(true)
    try {
      const url = await uploadImage(file)
      await savePicture(url, "Profile photo updated")
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Couldn't upload the photo."))
    } finally {
      setIsUploading(false)
    }
  }

  const handleRemovePhoto = async () => {
    setIsUploading(true)
    try {
      await savePicture("", "Profile photo removed")
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Couldn't remove the photo."))
    } finally {
      setIsUploading(false)
    }
  }

  const handleSaveProfile = async (e: FormEvent) => {
    e.preventDefault()
    setIsSaving(true)
    try {
      await dispatch(updateProfile({ first_name: firstName.trim(), last_name: lastName.trim(), phone: phone.trim() })).unwrap()
      toast.success("Profile saved")
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Couldn't update your profile."))
    } finally {
      setIsSaving(false)
    }
  }

  const handleChangePassword = async (e: FormEvent) => {
    e.preventDefault()
    setPasswordError(null)
    if (!currentPassword) return setPasswordError("Enter your current password.")
    if (newPassword.length < 8) return setPasswordError("New password must be at least 8 characters.")
    if (newPassword !== confirmPassword) return setPasswordError("New password and confirmation don't match.")
    setIsChangingPassword(true)
    try {
      await dispatch(changePassword({ old_password: currentPassword, new_password: newPassword })).unwrap()
      toast.success("Password changed")
      setCurrentPassword("")
      setNewPassword("")
      setConfirmPassword("")
    } catch (err) {
      setPasswordError(getApiErrorMessage(err, "Couldn't change your password."))
    } finally {
      setIsChangingPassword(false)
    }
  }

  return (
    <div className="section-container space-y-6">
      <PageHeading title="My Profile" description="Manage your personal details and password." />

      <Card>
        <CardContent className="flex flex-col items-center gap-5 p-6 sm:flex-row">
          <div className="relative">
            <Avatar className="h-24 w-24 border">
              <AvatarImage src={user.profile_picture || undefined} alt="" className="object-cover" />
              <AvatarFallback className="text-2xl font-semibold">{initials}</AvatarFallback>
            </Avatar>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              aria-label="Upload a new profile photo"
              className="absolute -bottom-1 -right-1 flex h-9 w-9 items-center justify-center rounded-full border bg-background shadow-sm hover:bg-accent disabled:opacity-60"
            >
              {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif,image/avif,image/heic"
              className="hidden"
              onChange={handlePhotoUpload}
            />
          </div>
          <div className="flex-1 text-center sm:text-left">
            <h2 className="text-xl font-semibold">{displayName}</h2>
            <p className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground sm:justify-start">
              <Mail className="h-4 w-4" /> {user.email}
            </p>
            <div className="mt-2 flex flex-wrap justify-center gap-2 sm:justify-start">
              <Badge variant="secondary">{humanize(user.role)}</Badge>
              {user.is_email_verified && <Badge variant="outline">Email verified</Badge>}
            </div>
          </div>
          {user.profile_picture && (
            <Button variant="outline" size="action" onClick={handleRemovePhoto} disabled={isUploading}>
              <Trash2 className="size-4" /> Remove photo
            </Button>
          )}
        </CardContent>
      </Card>

      <Tabs defaultValue="general" className="space-y-4">
        <TabsList className="w-full md:w-fit bg-muted p-1">
          <TabsTrigger value="general" className="min-w-max gap-2">
            <User className="h-4 w-4" /> General
          </TabsTrigger>
          <TabsTrigger value="security" className="min-w-max gap-2">
            <Lock className="h-4 w-4" /> Password
          </TabsTrigger>
          <TabsTrigger value="access" className="min-w-max gap-2">
            <Shield className="h-4 w-4" /> Access
          </TabsTrigger>
        </TabsList>

        <TabsContent value="general">
          <form onSubmit={handleSaveProfile}>
            <Card>
              <CardHeader>
                <CardTitle>Personal Information</CardTitle>
                <CardDescription>Your email address is your sign-in and can't be changed here.</CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="profile-first-name">First name</Label>
                  <Input id="profile-first-name" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="profile-last-name">Last name</Label>
                  <Input id="profile-last-name" value={lastName} onChange={(e) => setLastName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="profile-email">Email</Label>
                  <Input id="profile-email" value={user.email} readOnly disabled />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="profile-phone">Phone</Label>
                  <Input id="profile-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
                </div>
              </CardContent>
              <CardFooter className="justify-end border-t p-4">
                <Button type="submit" disabled={isSaving || !isDirty}>
                  {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Save changes
                </Button>
              </CardFooter>
            </Card>
          </form>
        </TabsContent>

        <TabsContent value="security">
          <form onSubmit={handleChangePassword}>
            <Card>
              <CardHeader>
                <CardTitle>Change Password</CardTitle>
                <CardDescription>Use at least 8 characters.</CardDescription>
              </CardHeader>
              <CardContent className="grid max-w-xl grid-cols-1 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="current-password">Current password</Label>
                  <Input
                    id="current-password"
                    type="password"
                    autoComplete="current-password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-password">New password</Label>
                  <Input
                    id="new-password"
                    type="password"
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm-password">Confirm new password</Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                </div>
                {passwordError && (
                  <p role="alert" className="text-sm text-destructive">
                    {passwordError}
                  </p>
                )}
              </CardContent>
              <CardFooter className="justify-end border-t p-4">
                <Button type="submit" disabled={isChangingPassword}>
                  {isChangingPassword ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                  Update password
                </Button>
              </CardFooter>
            </Card>
          </form>
        </TabsContent>

        <TabsContent value="access">
          <Card>
            <CardHeader>
              <CardTitle>Your Access</CardTitle>
              <CardDescription>
                {fullAccess
                  ? "You're an administrator with access to every part of the dashboard."
                  : "Permissions are granted by an administrator."}
              </CardDescription>
            </CardHeader>
            {!fullAccess && (
              <CardContent className="flex flex-wrap gap-2">
                {user.permissions.length ? (
                  user.permissions.map((code) => (
                    <Badge key={code} variant="outline" className="font-mono">
                      {code}
                    </Badge>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">No permissions granted.</p>
                )}
              </CardContent>
            )}
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

export default Profile
