import { SidebarTrigger } from "../ui/sidebar"
import {
  BellIcon,
  SunIcon,
  MoonIcon,
  LogOutIcon,
  SettingsIcon,
  UserIcon,
  Plus,
  Package,
  Ticket,
  UserPlus,
  SearchIcon,
} from "lucide-react"
import { GlobalSearch } from "./GlobalSearch"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

import { useState, useEffect, useMemo, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { useAppDispatch, useAppSelector } from "@/app/hooks"
import { logout } from "@/features/authentication/slices/authSlice"
import { hasPermission } from "@/app/modules"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

// Each entry is shown only when the user holds `permission` (see hasPermission).
const quickCreateItems = [
  { label: "New Product", icon: Package, url: "/product_form/new", permission: "catalog.manage" },
  { label: "New Coupon", icon: Ticket, url: "/coupon_form/new", permission: "orders.manage" },
  { label: "New Staff Member", icon: UserPlus, url: "/staff_form/new", permission: "*" },
]

const Navbar = () => {
  // index.html applies the saved theme class before first paint; mirror it here.
  const [theme, setTheme] = useState<"light" | "dark">(() =>
    document.documentElement.classList.contains("dark") ? "dark" : "light"
  )
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false)
  const mobileSearchTriggerRef = useRef<HTMLButtonElement>(null)
  const wasMobileSearchOpen = useRef(false)
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const user = useAppSelector((state) => state.auth.user)
  const visibleQuickCreate = quickCreateItems.filter((item) => hasPermission(user?.permissions, item.permission))

  const handleLogout = async () => {
    await dispatch(logout())
    navigate("/login", { replace: true })
  }

  const hasFullName = Boolean(user?.first_name?.trim() || user?.last_name?.trim())
  const fullName = [user?.first_name, user?.last_name].filter(Boolean).join(" ")

  const displayName = hasFullName
    ? fullName
    : user?.email
      ? user.email
          .split("@")[0]
          .replace(/[._-]/g, " ")
          .replace(/\b\w/g, (c) => c.toUpperCase())
      : "Admin"

  const initials = useMemo(() => {
    return displayName
      .split(" ")
      .filter(Boolean)
      .map((n) => n[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "AD"
  }, [displayName])

  // toggle theme
  const toggleTheme = () => {
    const newTheme = theme === "light" ? "dark" : "light"

    setTheme(newTheme)

    localStorage.setItem("theme", newTheme)

    if (newTheme === "dark") {
      document.documentElement.classList.add("dark")
    } else {
      document.documentElement.classList.remove("dark")
    }
  }

  // return focus to the mobile search trigger once the sheet closes
  useEffect(() => {
    if (wasMobileSearchOpen.current && !mobileSearchOpen) {
      mobileSearchTriggerRef.current?.focus()
    }
    wasMobileSearchOpen.current = mobileSearchOpen
  }, [mobileSearchOpen])

  return (
    <header className="bg-background">
      <nav className="flex items-center justify-between p-4 sm:p-5">
        <div className="flex items-center gap-4 flex-1 max-w-[460px]">
          <SidebarTrigger className="rounded-lg hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-900 dark:hover:text-white/90 shrink-0" />

          {/* Search */}
          <div className="relative hidden sm:flex w-full">
            <GlobalSearch
              mobileOpen={mobileSearchOpen}
              onMobileOpenChange={setMobileSearchOpen}
            />
          </div>

          <button
            ref={mobileSearchTriggerRef}
            type="button"
            aria-label="Open search"
            aria-expanded={mobileSearchOpen}
            onClick={() => setMobileSearchOpen(true)}
            className="inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-[10px] border border-gray-200 text-gray-700 shadow-xs transition-colors hover:bg-gray-50 dark:border-border dark:bg-background dark:text-gray-300 dark:hover:bg-gray-800 sm:hidden"
          >
            <SearchIcon className="size-5" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          {/* Quick create */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex h-9 cursor-pointer items-center gap-2 rounded-lg bg-primary-500 px-3.5 py-2 text-sm font-medium text-white whitespace-nowrap transition-colors hover:bg-primary-600">
                <Plus className="size-4" />
                <span className="hidden sm:block">Quick Create</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-48 p-1.5">
              <DropdownMenuGroup>
                {visibleQuickCreate.map((item) => (
                  <DropdownMenuItem
                    key={item.label}
                    className="flex items-center gap-2.5 rounded-lg py-2"
                    onClick={() => navigate(item.url)}
                  >
                    <item.icon className="size-4 text-muted-foreground" />
                    {item.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Theme */}
          <button
            onClick={toggleTheme}
            className="inline-flex size-9 cursor-pointer items-center justify-center rounded-[10px] border border-gray-200 text-gray-700 shadow-xs transition-colors hover:bg-gray-50 dark:border-border dark:bg-background dark:text-gray-300 dark:hover:bg-gray-800"
          >
            {theme === "light" ? (
              <MoonIcon className="size-5" />
            ) : (
              <SunIcon className="size-5" />
            )}
          </button>

          {/* Notification */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                aria-label="Notifications"
                className="relative inline-flex size-9 cursor-pointer items-center justify-center rounded-[10px] border border-gray-200 text-gray-700 shadow-xs transition-colors hover:bg-gray-50 dark:border-input dark:bg-background dark:text-gray-400 dark:hover:bg-gray-800"
              >
                <BellIcon className="size-5" />

                <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-red-500 ring ring-white dark:ring-gray-800" />
              </button>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end" className="w-80 max-w-[calc(100vw-2rem)] rounded-2xl">
              <DropdownMenuLabel className="border-b border-gray-100 px-4 py-4 text-lg font-semibold text-gray-800 dark:border-border dark:text-white/90">
                Notifications
              </DropdownMenuLabel>

              <DropdownMenuItem className="flex flex-col items-start gap-0.5 py-3">
                <p className="font-medium">New Order Received</p>
                <span className="text-xs text-muted-foreground">
                  Order #1024 has been placed
                </span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />

              <DropdownMenuItem className="flex flex-col items-start gap-0.5 py-3">
                <p className="font-medium">New Customer Registered</p>
                <span className="text-xs text-muted-foreground">
                  John Doe created an account
                </span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />

              <DropdownMenuItem className="flex flex-col items-start gap-0.5 py-3">
                <p className="font-medium">Inventory Alert</p>
                <span className="text-xs text-muted-foreground">
                  Product stock is running low
                </span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Profile */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                aria-label="Open user profile menu"
                className="flex size-9 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-gray-200 ring-2 ring-transparent transition-all hover:ring-primary-500/20 focus:outline-none focus-visible:ring-primary-500/40 dark:border-input"
              >
                <Avatar className="size-full">
                  {user?.profile_picture ? (
                    <AvatarImage
                      src={user.profile_picture}
                      alt={displayName}
                      className="object-cover size-full"
                    />
                  ) : null}
                  <AvatarFallback className="bg-primary-500 text-white font-semibold text-xs size-full flex items-center justify-center">
                    {initials}
                  </AvatarFallback>
                </Avatar>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 overflow-hidden">
              <DropdownMenuLabel className="flex items-center gap-3 px-4 py-3">
                <Avatar className="size-10 shrink-0 ring-2 ring-primary-500/20">
                  {user?.profile_picture ? (
                    <AvatarImage
                      src={user.profile_picture}
                      alt={displayName}
                      className="object-cover"
                    />
                  ) : null}
                  <AvatarFallback className="bg-primary-500 text-white font-bold text-sm flex items-center justify-center">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-gray-800 dark:text-white/90">
                    {displayName || "Account"}
                  </span>
                  <span className="block truncate text-xs text-gray-500 dark:text-gray-400">
                    {user?.email}
                  </span>
                </span>
              </DropdownMenuLabel>

              <DropdownMenuSeparator />

              <DropdownMenuGroup>
                <DropdownMenuItem onClick={() => navigate("/profile")} className="cursor-pointer">
                  <UserIcon /> Profile
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("/settings")}>
                  <SettingsIcon /> Settings
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-red-500 hover:text-red-600 dark:text-red-400"
                  onClick={handleLogout}
                >
                  <LogOutIcon /> Logout
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </nav>
    </header>
  )
}

export default Navbar
