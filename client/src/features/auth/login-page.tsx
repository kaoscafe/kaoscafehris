import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { extractErrorMessage } from "@/lib/api";
import { useLogin } from "./use-login";
import { useAuthStore } from "./auth.store";

const loginSchema = z.object({
  employeeId: z.string().trim().min(1, "Employee ID is required"),
  password: z.string().min(1, "Password is required"),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuthStore((s) => s.user);
  const login = useLogin();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const redirectTo = (location.state as { from?: string } | null)?.from || "/";

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { employeeId: "", password: "" },
  });

  if (user) {
    const dest = user.role === "EMPLOYEE" ? "/portal" : redirectTo;
    return <Navigate to={dest} replace />;
  }

  async function onSubmit(values: LoginFormValues) {
    setSubmitError(null);
    try {
      const loggedInUser = await login.mutateAsync(values);
      const dest = loggedInUser.role === "EMPLOYEE" ? "/portal" : redirectTo;
      navigate(dest, { replace: true });
    } catch (err) {
      setSubmitError(extractErrorMessage(err, "Login failed. Please try again."));
    }
  }

  const busy = isSubmitting || login.isPending;
  const errorMsg =
    submitError || errors.employeeId?.message || errors.password?.message;

  return (
    <div
      className="relative min-h-screen flex flex-col items-center justify-center px-6 overflow-hidden"
      style={{
        backgroundImage: "url('/login-bg.jpg')",
        backgroundSize: "cover",
        backgroundPosition: "center",
        fontFamily: "'Inter', sans-serif",
      }}
    >
      {/* Dark overlay */}
      <div className="pointer-events-none absolute inset-0" style={{ backgroundColor: "rgba(0,0,0,0.4)" }} />

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center w-full">
        <div className="flex-1" />

        {/* Logo + title */}
        <div className="flex flex-col items-center gap-4 mb-10">
          <img
            src="/kaos-logo.svg"
            alt="KAOS"
            className="h-20 w-auto brightness-0 invert"
          />
          <h1 className="text-2xl font-bold tracking-wide text-white">
            KAOS Portal
          </h1>
        </div>

        {/* Form */}
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="w-full max-w-[320px] space-y-3"
          noValidate
        >
          <input
            type="text"
            placeholder="ID Number"
            autoComplete="username"
            disabled={busy}
            className="w-full rounded-full bg-white/90 px-5 py-3.5 text-sm text-gray-700 placeholder-gray-400 outline-none transition focus:ring-2 disabled:opacity-60"
            style={{ "--tw-ring-color": "rgba(255,255,255,0.5)" } as React.CSSProperties}
            {...register("employeeId")}
          />
          <input
            type="password"
            placeholder="Enter Password"
            autoComplete="current-password"
            disabled={busy}
            className="w-full rounded-full bg-white/90 px-5 py-3.5 text-sm text-gray-700 placeholder-gray-400 outline-none transition focus:ring-2 disabled:opacity-60"
            style={{ "--tw-ring-color": "rgba(255,255,255,0.5)" } as React.CSSProperties}
            {...register("password")}
          />

          {errorMsg && (
            <p className="text-center text-xs text-red-300 pt-1">{errorMsg}</p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="mt-1 w-full rounded-full py-3.5 text-sm font-bold text-white transition disabled:opacity-50"
            style={{ backgroundColor: "#5A0A0A" }}
          >
            {busy ? (
              <Loader2 className="mx-auto h-4 w-4 animate-spin" />
            ) : (
              "Login"
            )}
          </button>
        </form>

        <div className="flex-1" />
        <p className="mt-10 pb-8 text-xs text-white/30">KAOS Café HRIS</p>
      </div>
    </div>
  );
}
