import { createBrowserRouter, Navigate } from "react-router-dom"
import DashboardLayout from "@/layouts/DashboardLayout"
import Loader from "@/components/common/Loader"
import RequireAuth from "@/routes/RequireAuth"
import RouteError from "@/routes/RouteError"
import NotFound from "@/routes/NotFound"
import { DEV_AUTH_BYPASS } from "@/features/authentication/devAuth"
import { page } from "@/app/moduleTypes"
import { dashboardRoutes } from "@/app/modules"

// Pages are registered per domain in src/features/<domain>/module.ts (see src/app/modules.ts).
export const router = createBrowserRouter([
  // With the dev bypass on there is no session to establish, so the sign-in
  // screen would only ever dead-end. Send it straight to the dashboard.
  DEV_AUTH_BYPASS
    ? { path: "/login", element: <Navigate to="/" replace /> }
    : {
        path: "/login",
        lazy: page(() => import("@/features/authentication/components/SignInForm")),
        hydrateFallbackElement: <Loader />,
        errorElement: <RouteError />,
      },
  {
    path: "/",
    element: <RequireAuth />,
    hydrateFallbackElement: <Loader />,
    errorElement: <RouteError />,
    children: [
      {
        element: <DashboardLayout />,
        // Errors inside a page render within the layout, so the sidebar stays usable.
        errorElement: <RouteError />,
        children: [...dashboardRoutes, { path: "*", element: <NotFound /> }],
      },
    ],
  },
])
