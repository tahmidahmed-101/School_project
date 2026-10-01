import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/common/app-sidebar";
import { useEffect } from "react";
import { Outlet, useNavigation } from "react-router-dom";
import { useAppDispatch, useAppSelector } from "@/app/hooks";
import { hasPermission } from "@/app/modules";
import { fetchBusinessProfile } from "@/features/system/slices/businessSettingsSlice";
import Navbar from "@/components/common/Navbar";
import ScrollToTop from "@/components/common/ScrollToTop";

const DashboardLayout = () => {
  // Pages are lazy route modules; React Router keeps the old page up while the next
  // one loads, so show a slim progress bar instead of a frozen-looking screen.
  const isNavigating = useNavigation().state === "loading";

  // Load the store profile once per session: it sets the app-wide currency (formatCurrency).
  const dispatch = useAppDispatch();
  const permissions = useAppSelector((state) => state.auth.user?.permissions);
  const canViewSettings = hasPermission(permissions, "settings.view");
  useEffect(() => {
    if (canViewSettings) dispatch(fetchBusinessProfile());
  }, [dispatch, canViewSettings]);

  return (
    <SidebarProvider>
      <div className="flex h-screen w-full overflow-hidden bg-background">
        <AppSidebar />

        <div className="flex min-w-0 flex-1 flex-col">
          {/* sticky navbar — same surface as sidebar, no border */}
          <div className="sticky top-0 z-10 bg-background">
            {isNavigating && (
              <div
                role="progressbar"
                aria-label="Loading page"
                className="absolute inset-x-0 top-0 h-0.5 animate-pulse bg-primary-500"
              />
            )}
            <Navbar />
          </div>

          {/* floating content panel */}
          <main
            data-scroll-container
            className="m-3 flex-1 overflow-y-auto rounded-xl border border-border bg-muted p-0 mt-0 dark:bg-background"
          >
            <ScrollToTop />
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default DashboardLayout;
