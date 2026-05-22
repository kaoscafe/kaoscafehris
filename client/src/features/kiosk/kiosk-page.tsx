import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, Building2, Calendar, CheckCircle2, Clock, LogOut, RefreshCw, User, XCircle } from "lucide-react";
import { extractErrorMessage } from "@/lib/api";
import {
  getKioskStatus, kioskClockIn, kioskClockOut, pingKiosk, uploadKioskSelfie, validateKioskPin,
  validateEmployeeCredentials,
  type KioskEmployee, type KioskStatusData,
} from "./kiosk.api";
import { COMPANY_TZ } from "@/lib/timezone";

const PIN_KEY    = "kiosk_pin";
const BRAND      = "#811c12";
const DARK       = "#280906";
const BLUSH      = "#f7ebeb";
const ROSE       = "#a28587";
const NEAR_BLACK = "#110200";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: COMPANY_TZ });
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: COMPANY_TZ });
}

function useLiveClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

// ─── Shared header ────────────────────────────────────────────────────────────

function KioskHeader({ name }: { name?: string }) {
  const now = useLiveClock();
  const timeStr = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: COMPANY_TZ });
  const dateStr = now.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: COMPANY_TZ });

  return (
    <header style={{ background: `linear-gradient(160deg, ${DARK} 0%, ${BRAND} 100%)`, padding: "16px 40px", flexShrink: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <img src="/kaos-logo.svg" alt="KAOS" style={{ height: 48, width: "auto", filter: "brightness(0) invert(1)", opacity: 0.9 }} />
        {name && (
          <div style={{ textAlign: "right" }}>
            <div style={{ color: "rgba(255,255,255,0.65)", fontSize: 14 }}>{greeting()},</div>
            <div style={{ color: "#fff", fontSize: 24, fontWeight: 800, letterSpacing: -0.3, marginTop: 1 }}>{name}</div>
            <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 5, justifyContent: "flex-end" }}>
              <Clock size={13} color="rgba(255,255,255,0.5)" />
              <span style={{ color: "rgba(255,255,255,0.7)", fontSize: 13, fontVariantNumeric: "tabular-nums" }}>
                {timeStr} · {dateStr}
              </span>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}

// ─── Screen 1: ID Entry ──────────────────────────────────────────────────────

function IdEntryScreen({
  onLookup, loading, error,
}: { onLookup: (id: string) => void; loading: boolean; error: string }) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);

  return (
    <div
      className="relative flex min-h-screen flex-col items-center justify-center px-6 overflow-hidden"
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
            KAOS Café Daily Time Record
          </h1>
        </div>

        {/* Form */}
        <div className="w-full max-w-[320px] space-y-3">
          <input
            ref={inputRef}
            type="text"
            placeholder="Enter ID Number"
            value={value}
            onChange={(e) => setValue(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === "Enter" && value.trim() && onLookup(value.trim())}
            className="w-full rounded-full bg-white/90 px-5 py-3.5 text-sm text-gray-700 placeholder-gray-400 outline-none transition focus:ring-2 disabled:opacity-60"
            style={{ "--tw-ring-color": "rgba(255,255,255,0.5)" } as React.CSSProperties}
          />
          <button
            onClick={() => value.trim() && onLookup(value.trim())}
            disabled={loading || !value.trim()}
            className="mt-1 w-full rounded-full py-3.5 text-sm font-bold text-white transition disabled:opacity-50"
            style={{ backgroundColor: "#5A0A0A" }}
          >
            {loading ? "Looking up…" : "Login"}
          </button>

          <div style={{ minHeight: 22, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, opacity: error ? 1 : 0, transition: "opacity .25s" }}>
            <AlertCircle size={13} color="rgba(255,255,255,0.75)" />
            <span className="text-xs text-red-300">{error || " "}</span>
          </div>
        </div>

        <div className="flex-1" />
        <p className="mt-10 pb-8 text-xs text-white/30">KAOS Café HRIS</p>
      </div>
    </div>
  );
}

function PasswordEntryScreen({ employeeId, onSubmit, loading, error, onBack }: { employeeId: string; onSubmit: (pw: string) => void; loading: boolean; error: string; onBack: () => void }) {
  const [password, setPassword] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, [employeeId]);

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center px-6 overflow-hidden" style={{ backgroundImage: "url('/login-bg.jpg')", backgroundSize: "cover", backgroundPosition: "center", fontFamily: "'Inter', sans-serif" }}>
      <div className="pointer-events-none absolute inset-0" style={{ backgroundColor: "rgba(0,0,0,0.4)" }} />
      <div className="relative z-10 flex flex-col items-center w-full">
        <div className="flex-1" />
        <div className="flex flex-col items-center gap-4 mb-10">
          <img src="/kaos-logo.svg" alt="KAOS" className="h-20 w-auto brightness-0 invert" />
          <h1 className="text-2xl font-bold tracking-wide text-white">Enter Password</h1>
          <p className="text-sm text-white/50 text-center max-w-xs">Employee ID: {employeeId}</p>
        </div>

        <div className="w-full max-w-[320px] space-y-3">
          <input
            ref={inputRef}
            type="password"
            placeholder="Enter your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && password.trim() && onSubmit(password.trim())}
            className="w-full rounded-full bg-white/90 px-5 py-3.5 text-sm text-gray-700 placeholder-gray-400 outline-none transition focus:ring-2 disabled:opacity-60"
            style={{ "--tw-ring-color": "rgba(255,255,255,0.5)" } as React.CSSProperties}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => onBack()} className="flex-1 w-full rounded-full py-3.5 text-sm font-bold text-white transition" style={{ backgroundColor: "#6b7280" }}>{"Back"}</button>
            <button onClick={() => password.trim() && onSubmit(password.trim())} disabled={loading || !password.trim()} className="flex-2 mt-0 w-full rounded-full py-3.5 text-sm font-bold text-white transition disabled:opacity-50" style={{ backgroundColor: "#5A0A0A" }}>{loading ? "Verifying…" : "Submit"}</button>
          </div>

          <div style={{ minHeight: 22, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, opacity: error ? 1 : 0, transition: "opacity .25s" }}>
            <AlertCircle size={13} color="rgba(255,255,255,0.75)" />
            <span className="text-xs text-red-300">{error || " "}</span>
          </div>
        </div>

        <div className="flex-1" />
        <p className="mt-10 pb-8 text-xs text-white/30">KAOS Café HRIS</p>
      </div>
    </div>
  );
}

function MainScreen({
  statusData, videoRef, onCapture, onLogout, cameraReady, cameraError, actionError,
}: {
  statusData: KioskStatusData;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  onCapture: () => void;
  onLogout: () => void;
  cameraReady: boolean;
  cameraError: boolean;
  actionError: string;
}) {
  const { employee, shift, attendance, lastClockIn, staleShiftEnd } = statusData;
  const isClockedIn = !!attendance && !attendance.clockOut;
  const isDone = !!attendance?.clockOut;
  const isStale = !!staleShiftEnd && isClockedIn;
  const now = useLiveClock();
  const timeStr = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: COMPANY_TZ });
  const dateStr = now.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: COMPANY_TZ });
  const initials = `${employee.firstName} ${employee.lastName}`.split(" ").map((n) => n[0]).join("");

  const badge = isDone
    ? { bg: "#dcfce7", color: "#15803d", dot: "#15803d", label: "Timed Out" }
    : isClockedIn
    ? { bg: "#fef3c7", color: "#92400e", dot: "#f59e0b", label: "Timed In" }
    : { bg: "#fdf0e0", color: "#a06010", dot: "#f97316", label: "Not Yet Timed In" };

  const showAction = isStale || (!isDone && shift);

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "linear-gradient(180deg, #fdfbfb 0%, #faf6f6 40%, #f7efef 100%)", fontFamily: "'Inter', sans-serif" }}>
      <KioskHeader />

      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", padding: "40px" }}>
        {actionError && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 12, padding: "14px 18px", marginBottom: 24, maxWidth: 600, width: "100%" }}>
            <AlertCircle size={16} color="#dc2626" style={{ flexShrink: 0 }} />
            <span style={{ fontSize: 14, color: "#991b1b", fontWeight: 500 }}>{actionError}</span>
          </div>
        )}

        {/* Single unified card */}
        <div style={{ maxWidth: 600, width: "100%", background: "#fff", borderRadius: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(140,21,21,0.06)", border: "1px solid rgba(0,0,0,0.04)", overflow: "hidden" }}>
          {/* Accent bar */}
          <div style={{ height: 4, background: `linear-gradient(90deg, ${BRAND}, #c0392b, ${ROSE})` }} />

          <div style={{ padding: "28px 28px 0" }}>
            {/* Employee greeting */}
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 22 }}>
              <div style={{ width: 48, height: 48, borderRadius: "50%", background: `linear-gradient(135deg, ${BRAND}, ${DARK})`, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 17, fontWeight: 800, flexShrink: 0, letterSpacing: 0.5 }}>
                {initials}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ color: ROSE, fontSize: 12, fontWeight: 500 }}>{greeting()},</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: NEAR_BLACK, letterSpacing: -0.2, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{employee.firstName} {employee.lastName}</div>
                <div style={{ marginTop: 3, display: "flex", alignItems: "center", gap: 5 }}>
                  <Clock size={12} color={ROSE} />
                  <span style={{ fontSize: 12, color: "#999", fontVariantNumeric: "tabular-nums" }}>
                    {timeStr} · {dateStr}
                  </span>
                </div>
              </div>
            </div>

            <div style={{ borderTop: "1px solid #f3e8e8", marginBottom: 18 }} />
          </div>

          {/* Shift details */}
          <div style={{ padding: "0 28px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: ROSE, textTransform: "uppercase", letterSpacing: 0.5 }}>Today's Shift</span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700, background: badge.bg, color: badge.color, borderRadius: 20, padding: "4px 12px", letterSpacing: 0.2 }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: badge.dot, flexShrink: 0 }} />
                {badge.label}
              </span>
            </div>

            {shift ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, background: "#fdf8f8", borderRadius: 12, padding: "14px 16px" }}>
                  <div style={{ width: 40, height: 40, borderRadius: 12, background: BLUSH, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Clock size={18} color={BRAND} />
                  </div>
                  <div>
                    <div style={{ fontSize: 14, color: NEAR_BLACK, fontWeight: 600 }}>{shift.name}</div>
                    <div style={{ fontSize: 13, color: "#666", marginTop: 1, fontVariantNumeric: "tabular-nums" }}>{shift.startTime} – {shift.endTime}</div>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12, background: "#fdf8f8", borderRadius: 12, padding: "14px 16px" }}>
                  <div style={{ width: 40, height: 40, borderRadius: 12, background: BLUSH, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Building2 size={18} color={BRAND} />
                  </div>
                  <div>
                    <div style={{ fontSize: 14, color: NEAR_BLACK, fontWeight: 600 }}>{shift.branch.name}</div>
                    <div style={{ fontSize: 12, color: "#888", marginTop: 1 }}>Branch</div>
                  </div>
                </div>
              </div>
            ) : !isDone ? (
              <div style={{ padding: "24px 0", textAlign: "center", background: "#fdf8f8", borderRadius: 12 }}>
                <Calendar size={36} color="#ccc" style={{ margin: "0 auto 10px" }} />
                <p style={{ fontSize: 14, color: "#999", margin: 0, fontWeight: 500 }}>No shift scheduled for today.</p>
              </div>
            ) : (
              <div style={{ padding: "24px 0", textAlign: "center", background: "#fdf8f8", borderRadius: 12 }}>
                <CheckCircle2 size={36} color="#15803d" style={{ margin: "0 auto 10px" }} />
                <p style={{ fontSize: 14, color: "#999", margin: 0, fontWeight: 500 }}>
                  In {fmtTime(attendance!.clockIn)} · Out {fmtTime(attendance!.clockOut!)}
                </p>
              </div>
            )}
          </div>

          <div style={{ padding: "0 28px", marginTop: 18 }}>
            <div style={{ borderTop: "1px solid #f3e8e8", marginBottom: 18 }} />
          </div>

          {/* Camera / action */}
          <div style={{ padding: "0 28px" }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: NEAR_BLACK, marginBottom: 14 }}>Photo Attendance</div>

            {showAction ? (
              <>
                <div style={{ borderRadius: 14, overflow: "hidden", position: "relative", background: NEAR_BLACK, aspectRatio: "4/3" }}>
                  <video ref={videoRef} autoPlay playsInline muted style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                  {!cameraReady && !cameraError && (
                    <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.5)" }}>
                      <span style={{ color: "#fff", fontSize: 14 }}>Starting camera…</span>
                    </div>
                  )}
                  {cameraError && (
                    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.6)", gap: 8 }}>
                      <AlertCircle size={32} color="rgba(255,255,255,0.6)" />
                      <span style={{ color: "rgba(255,255,255,0.8)", fontSize: 14, fontWeight: 600 }}>Camera unavailable</span>
                      <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 12 }}>Check camera permissions and try again</span>
                    </div>
                  )}
                  {!cameraError && (
                    <>
                      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
                        <div style={{
                          width: 140, height: 180,
                          border: "2px solid rgba(255,255,255,0.35)",
                          borderRadius: "50% 50% 50% 50% / 60% 60% 40% 40%",
                          boxShadow: "0 0 0 9999px rgba(0,0,0,0.25)",
                        }} />
                      </div>
                      <div style={{ position: "absolute", bottom: 12, left: 0, right: 0, textAlign: "center" }}>
                        <span style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", background: "rgba(0,0,0,0.35)", borderRadius: 20, padding: "4px 14px" }}>
                          Center your face in the frame
                        </span>
                      </div>
                    </>
                  )}
                </div>

                <button
                  onClick={onCapture}
                  disabled={!cameraReady}
                  style={{
                    width: "100%", marginTop: 14, padding: "15px", borderRadius: 12,
                    background: cameraReady ? (isClockedIn ? "#b91c1c" : "#15803d") : "#9ca3af",
                    border: "none",
                    color: "#fff", fontSize: 15, fontWeight: 800,
                    cursor: cameraReady ? "pointer" : "not-allowed",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                    boxShadow: cameraReady ? (isClockedIn ? "0 4px 14px rgba(185,28,28,0.3)" : "0 4px 14px rgba(21,128,61,0.3)") : "none",
                    transition: "background 0.2s",
                  }}
                >
                  <Clock size={18} color="#fff" />
                  {cameraError ? "Camera unavailable" : cameraReady ? (isClockedIn ? "Time Out" : "Time In") : "Camera loading…"}
                </button>
              </>
            ) : (
              <div style={{ padding: "32px 0", textAlign: "center", background: "#fdf8f8", borderRadius: 12 }}>
                {isDone ? (
                  <>
                    <div style={{ width: 48, height: 48, borderRadius: "50%", background: "#dcfce7", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px" }}>
                      <CheckCircle2 size={24} color="#15803d" />
                    </div>
                    <p style={{ fontWeight: 600, color: NEAR_BLACK, fontSize: 15, margin: 0 }}>Shift complete</p>
                    <p style={{ fontSize: 13, color: "#aaa", marginTop: 4, marginBottom: 0 }}>All done for today.</p>
                  </>
                ) : (
                  <>
                    <div style={{ width: 48, height: 48, borderRadius: "50%", background: BLUSH, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px" }}>
                      <Clock size={24} color={ROSE} />
                    </div>
                    <p style={{ fontWeight: 600, color: "#666", fontSize: 15, margin: 0 }}>No action available</p>
                    <p style={{ fontSize: 13, color: "#aaa", marginTop: 4, marginBottom: 0 }}>Contact your manager if you need to clock in.</p>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div style={{ padding: "0 28px 28px" }}>
            <div style={{ borderTop: "1px solid #f3e8e8", marginTop: 18, paddingTop: 14, display: "flex", alignItems: "center", gap: 6 }}>
              <Clock size={12} color="#ccc" />
              <span style={{ fontSize: 12, color: "#aaa" }}>
                {lastClockIn
                  ? `Last clock-in: ${fmtDate(lastClockIn.date)} at ${fmtTime(lastClockIn.clockIn)}`
                  : isClockedIn
                  ? `Clocked in at ${fmtTime(attendance!.clockIn)}`
                  : "No previous clock-in on record"}
              </span>
            </div>
          </div>
        </div>

        <div style={{ marginTop: 24 }}>
          <button
            onClick={onLogout}
            style={{ background: "none", border: "none", color: ROSE, fontSize: 13, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 500, padding: "8px 16px", borderRadius: 8, transition: "background 0.15s" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = BLUSH)}
            onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
          >
            <LogOut size={14} color={ROSE} />
            Not you? Switch employee
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Screen 3: Photo Confirmation ────────────────────────────────────────────

function ConfirmScreen({
  employee, photoUrl, isClockedIn, onRetake, onConfirm, loading, clockInNote, onClockInNoteChange, clockOutNote, onClockOutNoteChange,
}: {
  employee: KioskEmployee;
  photoUrl: string;
  isClockedIn: boolean;
  onRetake: () => void;
  onConfirm: () => void;
  loading: boolean;
  clockInNote: string;
  onClockInNoteChange: (v: string) => void;
  clockOutNote: string;
  onClockOutNoteChange: (v: string) => void;
}) {
  const now = new Date();
  const timeStr = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: COMPANY_TZ });
  const dateStr = now.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: COMPANY_TZ });

  const actionBadge = isClockedIn
    ? { bg: "#fee2e2", color: "#991b1b", icon: "#dc2626", label: "Time Out" }
    : { bg: "#dcfce7", color: "#166534", icon: "#15803d", label: "Time In" };

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "linear-gradient(180deg, #fdfbfb 0%, #faf6f6 40%, #f7efef 100%)", fontFamily: "'Inter', sans-serif" }}>
      <KioskHeader />

      <div style={{ flex: 1, maxWidth: 560, margin: "0 auto", width: "100%", padding: "32px 24px", boxSizing: "border-box" }}>
        <div style={{ background: "#fff", borderRadius: 20, padding: "32px", boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 4px 20px rgba(140,21,21,0.08)", border: "1px solid rgba(0,0,0,0.04)" }}>

          <div style={{ textAlign: "center", marginBottom: 24 }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: actionBadge.bg, color: actionBadge.color, fontSize: 12, fontWeight: 700, borderRadius: 20, padding: "5px 16px", marginBottom: 12 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: actionBadge.icon }} />
              {actionBadge.label}
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, color: NEAR_BLACK }}>Confirm Your Photo</div>
            <div style={{ fontSize: 13, color: "#aaa", marginTop: 4 }}>Review carefully before submitting</div>
          </div>

          <div style={{ borderRadius: 14, overflow: "hidden", marginBottom: 24, border: "2px solid #f0e6e6" }}>
            <img src={photoUrl} alt="Selfie" style={{ width: "100%", display: "block", objectFit: "cover", maxHeight: 300 }} />
          </div>

          {!isClockedIn && (
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 12, color: "#aaa", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600, marginBottom: 8 }}>
                Note (optional)
              </div>
              <textarea
                value={clockInNote}
                onChange={(e) => onClockInNoteChange(e.target.value)}
                placeholder="e.g. Starting late, overtime expected…"
                maxLength={500}
                rows={3}
                disabled={loading}
                style={{
                  width: "100%", borderRadius: 12, border: "1.5px solid #e5e5e5",
                  padding: "12px 14px", fontSize: 14, color: NEAR_BLACK, resize: "none",
                  outline: "none", fontFamily: "inherit", boxSizing: "border-box",
                  background: loading ? "#f9f9f9" : "#fafafa", transition: "border-color 0.15s",
                }}
                onFocus={(e) => (e.currentTarget.style.borderColor = ROSE)}
                onBlur={(e) => (e.currentTarget.style.borderColor = "#e5e5e5")}
              />
            </div>
          )}

          {isClockedIn && (
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 12, color: "#aaa", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600, marginBottom: 8 }}>
                Reason for clocking out (optional)
              </div>
              <textarea
                value={clockOutNote}
                onChange={(e) => onClockOutNoteChange(e.target.value)}
                placeholder="e.g. Early dismissal, overtime approved…"
                maxLength={500}
                rows={3}
                disabled={loading}
                style={{
                  width: "100%", borderRadius: 12, border: "1.5px solid #e5e5e5",
                  padding: "12px 14px", fontSize: 14, color: NEAR_BLACK, resize: "none",
                  outline: "none", fontFamily: "inherit", boxSizing: "border-box",
                  background: loading ? "#f9f9f9" : "#fafafa", transition: "border-color 0.15s",
                }}
                onFocus={(e) => (e.currentTarget.style.borderColor = ROSE)}
                onBlur={(e) => (e.currentTarget.style.borderColor = "#e5e5e5")}
              />
            </div>
          )}

          <div style={{ display: "flex", gap: 14, marginBottom: 24 }}>
            <button
              onClick={onRetake}
              disabled={loading}
              style={{
                flex: 1, padding: "14px", borderRadius: 12, border: "1.5px solid #e5e5e5",
                background: "#fff", color: "#555", fontSize: 14, fontWeight: 600, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                opacity: loading ? 0.5 : 1, transition: "background 0.15s",
              }}
            >
              <RefreshCw size={16} color="#888" /> Retake
            </button>
            <button
              onClick={onConfirm}
              disabled={loading}
              style={{
                flex: 1.6, padding: "14px", borderRadius: 12, border: "none",
                background: isClockedIn ? "#b91c1c" : "#15803d", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                boxShadow: isClockedIn ? "0 4px 14px rgba(185,28,28,0.3)" : "0 4px 14px rgba(21,128,61,0.3)",
                opacity: loading ? 0.7 : 1, transition: "opacity 0.15s",
              }}
            >
              {loading ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <CheckCircle2 size={16} color="#fff" />
              )}
              {loading ? "Saving…" : isClockedIn ? "Confirm Time Out" : "Confirm Time In"}
            </button>
          </div>

          <div style={{ borderTop: "1px solid #f0e6e6", paddingTop: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
              <div style={{ width: 44, height: 44, borderRadius: "50%", background: `linear-gradient(135deg, ${BRAND}, ${DARK})`, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 16, fontWeight: 800 }}>
                {employee.firstName[0]}{employee.lastName[0]}
              </div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800, color: NEAR_BLACK }}>{employee.lastName}, {employee.firstName}</div>
                <div style={{ fontSize: 13, color: "#888" }}>{employee.branch.name}</div>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 20px" }}>
              <div>
                <div style={{ fontSize: 11, color: "#aaa", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600, marginBottom: 4 }}>Action</div>
                <span style={{ display: "inline-block", background: actionBadge.bg, color: actionBadge.color, fontSize: 12, fontWeight: 700, borderRadius: 20, padding: "4px 14px" }}>
                  {actionBadge.label}
                </span>
              </div>
              <div>
                <div style={{ fontSize: 11, color: "#aaa", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600, marginBottom: 4 }}>Time</div>
                <span style={{ fontSize: 14, fontWeight: 600, color: NEAR_BLACK, fontVariantNumeric: "tabular-nums" }}>{timeStr}</span>
              </div>
              <div>
                <div style={{ fontSize: 11, color: "#aaa", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600, marginBottom: 4 }}>Date</div>
                <span style={{ fontSize: 14, fontWeight: 600, color: NEAR_BLACK }}>{dateStr}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Screen 4: Success ───────────────────────────────────────────────────────

function SuccessScreen({
  actionWasClockIn, recordedTime, statusData, onReturnNow,
}: {
  actionWasClockIn: boolean;
  recordedTime: string;
  statusData: KioskStatusData;
  onReturnNow: () => void;
}) {
  const [seconds, setSeconds] = useState(5);
  const now = useLiveClock();
  const timeStr = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: COMPANY_TZ });
  const dateStr = now.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: COMPANY_TZ });

  useEffect(() => {
    const id = setInterval(() => setSeconds((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (seconds === 0) onReturnNow();
  }, [seconds, onReturnNow]);

  const { employee, shift } = statusData;

  return (
    <div style={{
      minHeight: "100vh", display: "flex", flexDirection: "column",
      background: `linear-gradient(160deg, ${DARK} 0%, ${BRAND} 55%, #a01818 100%)`,
      fontFamily: "'Inter', sans-serif",
    }}>
      <div style={{ padding: "28px 40px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <img src="/kaos-logo.svg" alt="KAOS" style={{ height: 48, width: "auto", filter: "brightness(0) invert(1)" }} />
        <span style={{ fontSize: 14, color: "rgba(255,255,255,0.5)", fontVariantNumeric: "tabular-nums" }}>{timeStr} · {dateStr}</span>
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 40px", maxWidth: 560, margin: "0 auto", width: "100%", boxSizing: "border-box" }}>
        <div style={{ width: 112, height: 112, borderRadius: "50%", background: "rgba(255,255,255,0.12)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20, border: "2px solid rgba(255,255,255,0.2)", backdropFilter: "blur(4px)" }}>
          <CheckCircle2 size={56} color="#fff" />
        </div>

        <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 15, letterSpacing: 0.5, textTransform: "uppercase", fontWeight: 600 }}>Time Recorded</div>
        <div style={{ color: "#fff", fontSize: 64, fontWeight: 900, letterSpacing: -1.5, fontVariantNumeric: "tabular-nums", marginTop: 4 }}>{recordedTime}</div>
        <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 16, marginTop: 6 }}>
          {now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: COMPANY_TZ })}
        </div>

        <div style={{ marginTop: 32, background: "rgba(255,255,255,0.08)", borderRadius: 18, padding: "24px 28px", width: "100%", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,0.12)", boxSizing: "border-box" }}>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600, marginBottom: 16 }}>Shift Summary</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {shift && (
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(255,255,255,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Clock size={15} color="rgba(255,255,255,0.6)" />
                </div>
                <span style={{ fontSize: 14, color: "#fff", fontWeight: 600 }}>{shift.startTime} – {shift.endTime}</span>
              </div>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(255,255,255,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Building2 size={15} color="rgba(255,255,255,0.6)" />
              </div>
              <span style={{ fontSize: 14, color: "rgba(255,255,255,0.8)" }}>{employee.branch.name}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(255,255,255,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <User size={15} color="rgba(255,255,255,0.6)" />
              </div>
              <span style={{ fontSize: 14, color: "rgba(255,255,255,0.8)" }}>{employee.firstName} {employee.lastName}</span>
            </div>
          </div>
        </div>

        <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 15, marginTop: 20, textAlign: "center" }}>
          {actionWasClockIn ? `Have a great shift, ${employee.firstName}! ☕` : `Have a great rest, ${employee.firstName}!`}
        </div>
      </div>

      <div style={{ padding: "0 40px 56px", display: "flex", flexDirection: "column", alignItems: "center", gap: 16, maxWidth: 560, margin: "0 auto", width: "100%", boxSizing: "border-box" }}>
        <div style={{ fontSize: 14, color: "rgba(255,255,255,0.4)", textAlign: "center" }}>
          Returning to login in{" "}
          <span style={{ fontWeight: 800, color: "rgba(255,255,255,0.8)", fontVariantNumeric: "tabular-nums" }}>{seconds}</span>
          {" "}seconds
        </div>
        <div style={{ width: "100%", height: 3, background: "rgba(255,255,255,0.12)", borderRadius: 4, overflow: "hidden" }}>
          <div style={{ height: "100%", background: "rgba(255,255,255,0.5)", borderRadius: 4, width: `${(seconds / 5) * 100}%`, transition: "width 1s linear" }} />
        </div>
        <button
          onClick={onReturnNow}
          style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.18)", borderRadius: 10, padding: "12px 32px", color: "rgba(255,255,255,0.7)", fontSize: 14, fontWeight: 600, cursor: "pointer", backdropFilter: "blur(4px)" }}
        >
          Return to Login Now
        </button>
      </div>
    </div>
  );
}

// ─── Blocked / PIN Setup ──────────────────────────────────────────────────────

function BlockedScreen() {
  return (
    <div
      className="relative flex min-h-screen flex-col items-center justify-center px-6 overflow-hidden"
      style={{
        backgroundImage: "url('/login-bg.jpg')",
        backgroundSize: "cover",
        backgroundPosition: "center",
        fontFamily: "'Inter', sans-serif",
      }}
    >
      <div className="pointer-events-none absolute inset-0" style={{ backgroundColor: "rgba(0,0,0,0.4)" }} />
      <div className="relative z-10 flex flex-col items-center gap-5">
        <div style={{ width: 80, height: 80, borderRadius: "50%", background: "rgba(255,255,255,0.1)", display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid rgba(255,255,255,0.15)" }}>
          <XCircle size={40} color="rgba(255,255,255,0.7)" />
        </div>
        <h1 className="text-2xl font-bold text-white">Unauthorized Terminal</h1>
        <p className="text-sm text-white/50 text-center max-w-xs">
          This device is not authorized to access the kiosk. Please contact your administrator.
        </p>
      </div>
    </div>
  );
}

function PinSetupScreen({ onDone }: { onDone: (pin: string) => void }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    const trimmed = pin.trim();
    if (trimmed.length < 4) { setError("PIN must be at least 4 characters"); return; }
    setLoading(true);
    setError("");
    const valid = await validateKioskPin(trimmed);
    setLoading(false);
    if (!valid) { setError("Incorrect PIN. Please try again."); return; }
    localStorage.setItem(PIN_KEY, trimmed);
    onDone(trimmed);
  }

  return (
    <div
      className="relative flex min-h-screen flex-col items-center justify-center px-6 overflow-hidden"
      style={{
        backgroundImage: "url('/login-bg.jpg')",
        backgroundSize: "cover",
        backgroundPosition: "center",
        fontFamily: "'Inter', sans-serif",
      }}
    >
      <div className="pointer-events-none absolute inset-0" style={{ backgroundColor: "rgba(0,0,0,0.4)" }} />

      <div className="relative z-10 flex flex-col items-center w-full">
        <div className="flex-1" />

        <div className="flex flex-col items-center gap-4 mb-10">
          <img src="/kaos-logo.svg" alt="KAOS" className="h-20 w-auto brightness-0 invert" />
          <h1 className="text-2xl font-bold text-white">Kiosk Setup</h1>
          <p className="text-sm text-white/50 text-center max-w-xs">
            Enter the kiosk PIN set by your administrator. It will be saved on this device.
          </p>
        </div>

        <div className="w-full max-w-[320px] space-y-3">
          <input
            type="password" placeholder="Enter kiosk PIN" value={pin}
            onChange={(e) => setPin(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !loading && submit()}
            disabled={loading}
            className="w-full rounded-full bg-white/90 px-5 py-3.5 text-sm text-gray-700 placeholder-gray-400 text-center outline-none transition focus:ring-2 disabled:opacity-60"
            style={{ "--tw-ring-color": "rgba(255,255,255,0.5)" } as React.CSSProperties}
          />
          {error && <p className="text-center text-xs text-red-300">{error}</p>}
          <button onClick={submit} disabled={loading}
            className="mt-1 w-full rounded-full py-3.5 text-sm font-bold text-white transition disabled:opacity-50"
            style={{ backgroundColor: "#5A0A0A" }}
          >
            {loading ? "Verifying…" : "Confirm PIN"}
          </button>
        </div>

        <div className="flex-1" />
        <p className="mt-10 pb-8 text-xs text-white/30">KAOS Café HRIS</p>
      </div>
    </div>
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────

type Screen = "loading" | "blocked" | "pin-setup" | "id-entry" | "main" | "confirm" | "success";

// new screen type for password entry
type ExtendedScreen = Screen | "password-entry";

export default function KioskPage() {
  const [screen, setScreen] = useState<ExtendedScreen>("loading");
  const [pin, setPin] = useState("");
  const [pendingEmployeeId, setPendingEmployeeId] = useState<string | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState("");
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [confirmError, setConfirmError] = useState("");
  const [statusData, setStatusData] = useState<KioskStatusData | null>(null);
  const [photoBlob, setPhotoBlob] = useState<Blob | null>(null);
  const [photoUrl, setPhotoUrl] = useState("");
  const [actionWasClockIn, setActionWasClockIn] = useState(false);
  const [recordedTime, setRecordedTime] = useState("");
  const [clockInNote, setClockInNote] = useState("");
  const [clockOutNote, setClockOutNote] = useState("");

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraReady, setCameraReady] = useState(false);

  const cameraTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [cameraError, setCameraError] = useState(false);

  const startCamera = useCallback(async () => {
    setCameraReady(false);
    setCameraError(false);
    cameraTimeoutRef.current = setTimeout(() => {
      const v = videoRef.current;
      if (v && v.readyState >= 2 && v.videoWidth > 0) {
        setCameraReady(true);
      } else {
        setCameraError(true);
      }
    }, 10_000);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        if (videoRef.current.readyState >= 2) {
          clearTimeout(cameraTimeoutRef.current!);
          setCameraReady(true);
        } else {
          videoRef.current.oncanplay = () => {
            clearTimeout(cameraTimeoutRef.current!);
            setCameraReady(true);
          };
          videoRef.current.play().catch(() => {});
        }
      }
    } catch {
      clearTimeout(cameraTimeoutRef.current!);
      setCameraError(true);
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (cameraTimeoutRef.current) { clearTimeout(cameraTimeoutRef.current); cameraTimeoutRef.current = null; }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraReady(false);
    setCameraError(false);
  }, []);

  useEffect(() => {
    pingKiosk()
      .then(() => {
        const saved = localStorage.getItem(PIN_KEY) ?? "";
        if (saved) { setPin(saved); setScreen("id-entry"); }
        else setScreen("pin-setup");
      })
      .catch(() => setScreen("blocked"));
  }, []);

  useEffect(() => {
    if (screen === "main") startCamera();
    else stopCamera();
  }, [screen, startCamera, stopCamera]);

  async function handleLookup(empId: string) {
    // After entering ID, prompt for employee password before fetching status
    setLookupError("");
    setPendingEmployeeId(empId);
    setScreen("password-entry");
  }

  async function handlePasswordSubmit(password: string) {
    if (!pendingEmployeeId) return;
    setLookupLoading(true);
    setLookupError("");
    try {
      const ok = await validateEmployeeCredentials(pendingEmployeeId, password, pin);
      if (!ok) throw new Error("Invalid credentials");
      const data = await getKioskStatus(pendingEmployeeId, pin);
      setStatusData(data);
      setScreen("main");
    } catch (err: any) {
      if (err?.response?.status === 401) {
        localStorage.removeItem(PIN_KEY);
        setPin("");
        setScreen("pin-setup");
        return;
      }
      setLookupError(extractErrorMessage(err, "Invalid ID or password"));
      // keep on password screen for retry
      setScreen("password-entry");
    } finally {
      setLookupLoading(false);
    }
  }

  function handleCapture() {
    const video = videoRef.current;
    if (!video || video.readyState < 2 || video.videoWidth === 0) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) return;
      setPhotoBlob(blob);
      // Use FileReader to convert blob to data URL — more reliable than blob URLs
      // which can break under Content-Security-Policy restrictions.
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotoUrl(reader.result as string);
        setConfirmError("");
        setClockOutNote("");
        const isClockedIn = !!statusData?.attendance && !statusData.attendance.clockOut;
        setActionWasClockIn(!isClockedIn);
        setScreen("confirm");
      };
      reader.readAsDataURL(blob);
    }, "image/jpeg", 0.85);
  }

  async function handleConfirm() {
    if (!statusData) return;
    setConfirmLoading(true);
    setConfirmError("");
    try {
      let selfieUrl: string | undefined;
      if (photoBlob) selfieUrl = await uploadKioskSelfie(photoBlob, pin);
      const isClockedIn = !!statusData.attendance && !statusData.attendance.clockOut;
      if (isClockedIn && statusData.attendance) {
        await kioskClockOut(statusData.attendance.id, selfieUrl, pin, undefined, clockOutNote.trim() || undefined);
      } else {
        await kioskClockIn(statusData.employee.employeeId, selfieUrl, pin, clockInNote.trim() || undefined);
      }
      setRecordedTime(
        new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: COMPANY_TZ })
      );
      setScreen("success");
    } catch (err) {
      const msg = extractErrorMessage(err, "Action failed. Please try again.");
      try {
        const fresh = await getKioskStatus(statusData.employee.employeeId, pin);
        setStatusData(fresh);
      } catch {
        // If refresh also fails, keep the stale data — error is still shown.
      }
      setConfirmError(msg);
      setScreen("main");
    } finally {
      setConfirmLoading(false);
    }
  }

  function handleLogout() {
    setStatusData(null);
    setPhotoBlob(null);
    setPhotoUrl("");
    setClockInNote("");
    setClockOutNote("");
    setScreen("id-entry");
  }

  const handleReturnNow = useCallback(() => {
    setStatusData(null);
    setPhotoBlob(null);
    setPhotoUrl("");
    setClockInNote("");
    setClockOutNote("");
    setScreen("id-entry");
  }, []);

  if (screen === "loading") {
    return (
      <div style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", background: `linear-gradient(160deg, ${DARK} 0%, ${BRAND} 100%)` }}>
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white border-t-transparent" />
      </div>
    );
  }
  if (screen === "blocked") return <BlockedScreen />;
  if (screen === "pin-setup") return <PinSetupScreen onDone={(p) => { setPin(p); setScreen("id-entry"); }} />;
  if (screen === "password-entry" && pendingEmployeeId) {
    return (
      <PasswordEntryScreen
        employeeId={pendingEmployeeId}
        onSubmit={handlePasswordSubmit}
        loading={lookupLoading}
        error={lookupError}
        onBack={() => { setPendingEmployeeId(null); setScreen("id-entry"); setLookupError(""); }}
      />
    );
  }
  if (screen === "id-entry") {
    return <IdEntryScreen onLookup={handleLookup} loading={lookupLoading} error={lookupError} />;
  }
  if (screen === "main" && statusData) {
    return (
      <MainScreen
        statusData={statusData}
        videoRef={videoRef}
        onCapture={handleCapture}
        onLogout={handleLogout}
        cameraReady={cameraReady}
        cameraError={cameraError}
        actionError={confirmError}
      />
    );
  }
  if (screen === "confirm" && statusData && photoUrl) {
    const isClockedIn = !!statusData.attendance && !statusData.attendance.clockOut;
    return (
      <ConfirmScreen
        employee={statusData.employee}
        photoUrl={photoUrl}
        isClockedIn={isClockedIn}
        onRetake={() => setScreen("main")}
        onConfirm={handleConfirm}
        loading={confirmLoading}
        clockInNote={clockInNote}
        onClockInNoteChange={setClockInNote}
        clockOutNote={clockOutNote}
        onClockOutNoteChange={setClockOutNote}
      />
    );
  }
  if (screen === "success" && statusData) {
    return (
      <SuccessScreen
        actionWasClockIn={actionWasClockIn}
        recordedTime={recordedTime}
        statusData={statusData}
        onReturnNow={handleReturnNow}
      />
    );
  }

  return null;
}
