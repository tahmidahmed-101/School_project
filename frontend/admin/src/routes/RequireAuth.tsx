import { Navigate, Outlet, useLocation } from "react-router-dom"
import { useAppSelector } from "@/app/hooks"
import Loader from "@/components/common/Loader"
import { DEV_AUTH_BYPASS } from "@/features/authentication/devAuth"

const RequireAuth = () => {
  const { isAuthenticated, bootstrapped } = useAppSelector((state) => state.auth)
  const location = useLocation()

  if (!bootstrapped && !DEV_AUTH_BYPASS) {
    return <Loader />
  }

  if (!isAuthenticated && !DEV_AUTH_BYPASS) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  return <Outlet />
}

export default RequireAuth
