import { useEffect } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useSession } from "@/features/auth/use-session";
import type { Role } from "@/features/auth/auth.api";

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowed?: Role[];
}

export default function ProtectedRoute({ children, allowed }: ProtectedRouteProps) {
  const { user, isAuthenticated, isLoading } = useSession();
  const location = useLocation();

  // When the browser restores a page from its back-forward cache (bfcache),
  // React hasn't re-run yet so stale authenticated content can flash before
  // the redirect below kicks in. The pageshow event fires synchronously when
  // a cached page is shown — we check auth and hard-redirect immediately.
  useEffect(() => {
    const handler = (e: PageTransitionEvent) => {
      if (e.persisted && !isAuthenticated && !isLoading) {
        window.location.replace("/login");
      }
    };
    window.addEventListener("pageshow", handler);
    return () => window.removeEventListener("pageshow", handler);
  }, [isAuthenticated, isLoading]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (allowed && user && !allowed.includes(user.role)) {
    return <Navigate to={user.role === "EMPLOYEE" ? "/portal" : "/"} replace />;
  }

  return <>{children}</>;
}
