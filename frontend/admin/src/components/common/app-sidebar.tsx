import { useMemo, useState } from "react"
import { NavLink, useLocation } from "react-router-dom"
import { useSidebar } from "@/components/ui/sidebar"
import { useAppSelector } from "@/app/hooks"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
} from "@/components/ui/sidebar"

import { ChevronDown, Store } from "lucide-react"
import { getNavGroups } from "@/app/modules"
import type { NavItem } from "@/app/moduleTypes"

// Detail/form routes (e.g. /order_detail/:id) don't appear in the nav; a link stays
// active for its own path and anything nested under it.
const isItemActive = (item: NavItem, pathname: string) =>
  item.url === "/" ? pathname === "/" : pathname === item.url || pathname.startsWith(`${item.url}/`)

export function AppSidebar() {
  const location = useLocation()
  const { state, isMobile, setOpenMobile, setOpen } = useSidebar()
  const user = useAppSelector((state) => state.auth.user)
  const permissions = user?.permissions
  const navGroups = useMemo(() => getNavGroups(permissions), [permissions])
  const sidebarItems = useMemo(() => navGroups.flatMap((g) => g.sections), [navGroups])

  const isCollapsed = state === "collapsed"

  const hasFullName = Boolean(user?.first_name?.trim() || user?.last_name?.trim())
  const fullName = [user?.first_name, user?.last_name].filter(Boolean).join(" ")

  const displayName = hasFullName
    ? fullName
    : user?.email
      ? user.email
          .split("@")[0]
          .replace(/[._-]/g, " ")
          .replace(/\b\w/g, (c) => c.toUpperCase())
      : "Admin Workspace"

  const userEmail = user?.email || ""
  const userRole = user?.role ? user.role.replace(/_/g, " ").toUpperCase() : "ADMIN"

  const initials = user
    ? hasFullName
      ? `${user.first_name?.[0] ?? ""}${user.last_name?.[0] ?? ""}`.toUpperCase()
      : (user.email?.[0] ?? "A").toUpperCase()
    : "AD"

  const [openSections, setOpenSections] = useState<string[]>([])

  const handleLinkClick = () => {
    if (isMobile) {
      setOpenMobile(false)
    }
  }

  // Close all sections when collapsed, and auto-open the active route's section when
  // the route changes or the sidebar expands. Adjusted during render rather than in
  // effects, which would paint once with stale sections and then re-render.
  const [syncedWith, setSyncedWith] = useState({ pathname: "", isCollapsed: !isCollapsed })
  if (syncedWith.pathname !== location.pathname || syncedWith.isCollapsed !== isCollapsed) {
    setSyncedWith({ pathname: location.pathname, isCollapsed })

    if (isCollapsed) {
      setOpenSections([])
    } else {
      const active = sidebarItems.find((section) =>
        section.items.some((item) => isItemActive(item, location.pathname)),
      )
      if (active) {
        setOpenSections((prev) =>
          prev.includes(active.label) ? prev : [...prev, active.label],
        )
      }
    }
  }

  const toggleSection = (label: string) => {
    if (isCollapsed) {
      setOpen(true)
      setOpenSections([label])
      return
    }

    setOpenSections((prev) =>
      prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label],
    )
  }

  return (
    <Sidebar variant="floating" collapsible="icon" className="z-30">
      {/* HEADER */}
      <SidebarHeader className="mb-6 mt-2 flex items-center px-4 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
        <NavLink
          to="/"
          onClick={handleLinkClick}
          className="flex w-full items-center gap-3 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0 group-data-[collapsible=icon]:w-auto"
        >
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary-400 to-primary-600 text-white shadow-primary-500/20 group-data-[collapsible=icon]:size-9">
            <Store className="size-5" />
          </span>
          <span className="min-w-0 group-data-[collapsible=icon]:hidden">
            <span className="block truncate text-sm font-semibold text-gray-900 dark:text-white">
              NestmartIT
            </span>
            <span className="block truncate text-xs font-medium text-gray-500 dark:text-gray-400">
              Admin Workspace
            </span>
          </span>
        </NavLink>
      </SidebarHeader>

      {/* CONTENT */}
      <SidebarContent className="overflow-x-hidden px-3 group-data-[collapsible=icon]:px-0">
        {navGroups.map((group) => (
          <div key={group.label} className="mb-4 last:mb-0">
            <p className="mb-2 px-3 text-xs font-normal uppercase text-gray-400 dark:text-gray-500 group-data-[collapsible=icon]:hidden">
              {group.label}
            </p>

            <div className="space-y-1">
              {group.sections.map((section) => {

                const isOpen = openSections.includes(section.label)
                const isActive = section.items.some(
                  (item) => isItemActive(item, location.pathname),
                )

                return (
                  <div key={section.label}>
                    {/* HEADER */}
                    <button
                      onClick={() => toggleSection(section.label)}
                      className={`flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-200 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:size-9 group-data-[collapsible=icon]:mx-auto ${
                        isActive
                          ? "text-primary-500"
                          : "text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
                      }`}
                    >
                      <span className="flex items-center gap-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0">
                        <section.icon className="size-5 shrink-0" />
                        <span className="group-data-[collapsible=icon]:hidden">
                          {section.label}
                        </span>
                      </span>

                      <ChevronDown
                        className={`h-4 w-4 transition-transform duration-300 group-data-[collapsible=icon]:hidden ${
                          isOpen ? "rotate-180" : ""
                        }`}
                      />
                    </button>

                    {/* SUBMENU */}
                    <div
                      className={`grid transition-all duration-200 ease-in-out ${
                        isOpen
                          ? "grid-rows-[1fr] opacity-100"
                          : "grid-rows-[0fr] opacity-0"
                      }`}
                    >
                      <div className="overflow-hidden">
                        <div className="flex flex-col gap-0.5 py-1">
                          {section.items.map((item) => (
                            <NavLink
                              key={item.title}
                              to={item.url}
                              end
                              onClick={handleLinkClick}
                              className={({ isActive: itemActive }) =>
                                `flex items-center rounded-lg px-3 py-2 pl-6 text-sm transition-colors duration-200 ${
                                  itemActive
                                    ? "bg-primary-500/10 font-medium text-primary-500"
                                    : "text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
                                }`
                              }
                            >
                              {item.title}
                            </NavLink>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </SidebarContent>

      {/* FOOTER — profile */}
      <SidebarFooter className="p-3 group-data-[collapsible=icon]:p-0 group-data-[collapsible=icon]:py-2 group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:justify-center">
        <NavLink
          to="/profile"
          title={`Profile: ${displayName}`}
          className="hidden items-center justify-center group-data-[collapsible=icon]:flex rounded-lg transition-transform hover:scale-105"
        >
          <Avatar className="size-9 ring-2 ring-primary/20">
            {user?.profile_picture ? (
              <AvatarImage src={user.profile_picture} alt={displayName} />
            ) : null}
            <AvatarFallback className="bg-primary text-primary-foreground font-semibold text-xs">
              {initials}
            </AvatarFallback>
          </Avatar>
        </NavLink>

        <NavLink
          to="/profile"
          title="View profile & account settings"
          className="flex items-center gap-2.5 rounded-xl border border-border bg-card px-2.5 py-2 group-data-[collapsible=icon]:hidden transition-colors hover:bg-muted/60 hover:border-primary/40 cursor-pointer"
        >
          {/* Compact: avatar, then name + role on one line and the email on the next. The
              role sits on the name line so the email gets the full text width. */}
          <Avatar className="size-8 shrink-0 ring-2 ring-primary/20">
            {user?.profile_picture ? (
              <AvatarImage src={user.profile_picture} alt={displayName} />
            ) : null}
            <AvatarFallback className="bg-primary text-primary-foreground font-bold text-xs">
              {initials}
            </AvatarFallback>
          </Avatar>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <p className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground leading-tight" title={displayName}>
                {displayName}
              </p>
              <span className="shrink-0 rounded bg-primary/10 px-1 py-px text-[9px] font-semibold uppercase tracking-wide text-primary">
                {userRole}
              </span>
            </div>
            {userEmail && (
              <p className="truncate text-[11px] leading-tight text-muted-foreground mt-0.5" title={userEmail}>
                {userEmail}
              </p>
            )}
          </div>
        </NavLink>
      </SidebarFooter>
    </Sidebar>
  )
}
