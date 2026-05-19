import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, Building2, Calendar, CheckCircle2, Clock, LogOut, RefreshCw, User, XCircle } from "lucide-react";
import { extractErrorMessage } from "@/lib/api";
import {
  getKioskStatus, kioskClockIn, kioskClockOut, pingKiosk, uploadKioskSelfie, validateKioskPin,
  type KioskAttendance, type KioskEmployee, type KioskShift, type KioskStatusData,
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

function KioskHeader({ name }: { name: string }) {
  const now = useLiveClock();
  const timeStr = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: COMPANY_TZ });
  const dateStr = now.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: COMPANY_TZ });

  return (
    <header style={{ background: `linear-gradient(160deg, ${DARK} 0%, ${BRAND} 100%)`, padding: "20px 32px", flexShrink: 0 }}>
      <div style={{ maxWidth: 960, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ color: "rgba(255,255,255,0.65)", fontSize: 14 }}>{greeting()},</div>
          <div style={{ color: "#fff", fontSize: 24, fontWeight: 800, letterSpacing: -0.3, marginTop: 1 }}>{name}</div>
          <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 5 }}>
            <Clock size={13} color="rgba(255,255,255,0.5)" />
            <span style={{ color: "rgba(255,255,255,0.7)", fontSize: 13, fontVariantNumeric: "tabular-nums" }}>
              {timeStr} · {dateStr}
            </span>
          </div>
        </div>
        <img src="/kaos-logo.svg" alt="KAOS" style={{ height: 44, width: "auto", filter: "brightness(0) invert(1)", opacity: 0.9 }} />
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
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Inter',sans-serif", background: BLUSH, padding: "40px 24px" }}>
      <div style={{ width: "100%", maxWidth: 440, background: "#fff", borderRadius: 20, padding: "40px 36px", boxShadow: "0 4px 24px rgba(140,21,21,0.10)", textAlign: "center" }}>
        <img src="/kaos-logo.svg" alt="KAOS" style={{ height: 52, width: "auto" }} />
        <div style={{ color: NEAR_BLACK, fontSize: 20, fontWeight: 800, marginTop: 14, letterSpacing: 0.2 }}>KAOS Café Daily Time Record</div>
        <div style={{ color: "#999", fontSize: 13, marginTop: 4 }}>Enter your employee ID to continue</div>

        <div style={{ marginTop: 28, display: "flex", flexDirection: "column", gap: 12 }}>
          <input
            ref={inputRef}
            type="text"
            placeholder="Enter ID Number"
            value={value}
            onChange={(e) => setValue(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === "Enter" && value.trim() && onLookup(value.trim())}
            style={{
              width: "100%", padding: "14px 20px", borderRadius: 12,
              border: "1.5px solid #e5e5e5", background: "#fafafa",
              color: "#333", fontSize: 15, outline: "none", letterSpacing: 0.5,
              boxSizing: "border-box",
            }}
          />
          <button
            onClick={() => value.trim() && onLookup(value.trim())}
            disabled={loading || !value.trim()}
            style={{
              width: "100%", padding: "14px 20px", borderRadius: 12,
              border: "none", background: BRAND,
              color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer",
              opacity: loading || !value.trim() ? 0.5 : 1,
            }}
          >
            {loading ? "Looking up…" : "Login"}
          </button>
        </div>

        <div style={{ marginTop: 16, minHeight: 22, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, opacity: error ? 1 : 0, transition: "opacity .25s" }}>
          <AlertCircle size={13} color="#dc2626" />
          <span style={{ fontSize: 13, color: "#dc2626" }}>{error || "ID does not exist"}</span>
        </div>
      </div>
    </div>
  );
}

// ─── Screen 2: Main (Shift + Camera) ─────────────────────────────────────────

function ShiftCard({
  shift, attendance, lastClockIn,
}: { shift: KioskShift | null; attendance: KioskAttendance | null; lastClockIn: { date: string; clockIn: string } | null }) {
  const isClockedIn = !!attendance && !attendance.clockOut;
  const isDone = !!attendance?.clockOut;

  const badge = isDone
    ? { bg: "#dcfce7", color: "#15803d", label: "Timed Out" }
    : isClockedIn
    ? { bg: "#fef3c7", color: "#92400e", label: "Timed In" }
    : { bg: "#fdf0e0", color: "#a06010", label: "Not Yet Timed In" };

  return (
    <div style={{ background: "#fff", borderRadius: 16, padding: "20px 22px", boxShadow: "0 2px 10px rgba(140,21,21,0.07)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: NEAR_BLACK }}>Today's Shift</span>
        <span style={{ fontSize: 11, fontWeight: 700, background: badge.bg, color: badge.color, borderRadius: 20, padding: "4px 14px", letterSpacing: 0.3 }}>
          {badge.label}
        </span>
      </div>
      {shift ? (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <Clock size={15} color={ROSE} />
            <span style={{ fontSize: 14, color: "#222", fontWeight: 600 }}>{shift.startTime} – {shift.endTime}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <Building2 size={15} color={ROSE} />
            <span style={{ fontSize: 14, color: "#555" }}>{shift.name}</span>
          </div>
        </>
      ) : (
        <p style={{ fontSize: 14, color: "#999", marginBottom: 12 }}>No shift scheduled for today.</p>
      )}
      <div style={{ borderTop: "1px solid #f0e6e6", paddingTop: 12, fontSize: 13, color: "#aaa" }}>
        {lastClockIn
          ? `Last clock-in: ${fmtDate(lastClockIn.date)} at ${fmtTime(lastClockIn.clockIn)}`
          : isClockedIn
          ? `Clocked in at ${fmtTime(attendance!.clockIn)}`
          : "No previous clock-in on record"}
      </div>
    </div>
  );
}

function CameraView({
  videoRef, onCapture, isClockedIn, cameraReady, cameraError,
}: { videoRef: React.RefObject<HTMLVideoElement | null>; onCapture: () => void; isClockedIn: boolean; cameraReady: boolean; cameraError: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 14, fontWeight: 700, color: NEAR_BLACK, marginBottom: 12 }}>Photo Attendance</div>

      <div style={{ borderRadius: 16, overflow: "hidden", position: "relative", background: NEAR_BLACK, aspectRatio: "4/3", maxHeight: 360 }}>
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
        {/* Face guide oval */}
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
          background: cameraReady ? (isClockedIn ? "#b91c1c" : "#2d7a3a") : "#9ca3af",
          border: "none",
          color: "#fff", fontSize: 15, fontWeight: 800,
          cursor: cameraReady ? "pointer" : "not-allowed",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          boxShadow: cameraReady ? (isClockedIn ? "0 4px 14px rgba(185,28,28,0.3)" : "0 4px 14px rgba(45,122,58,0.3)") : "none",
        }}
      >
        <Clock size={18} color="#fff" />
        {cameraError ? "Camera unavailable" : cameraReady ? (isClockedIn ? "Time Out" : "Time In") : "Camera loading…"}
      </button>
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

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: BLUSH, fontFamily: "'Inter', sans-serif" }}>
      <KioskHeader name={`${employee.firstName} ${employee.lastName}`} />

      <div style={{ flex: 1, maxWidth: 960, margin: "0 auto", width: "100%", padding: "28px 24px", boxSizing: "border-box" }}>
        {actionError && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: 10, padding: "12px 16px", marginBottom: 20 }}>
            <AlertCircle size={16} color="#dc2626" style={{ flexShrink: 0 }} />
            <span style={{ fontSize: 14, color: "#991b1b", fontWeight: 500 }}>{actionError}</span>
          </div>
        )}

        {/* Two-column layout: shift info left, camera/action right */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 24 }}>
          {/* Left column: shift info */}
          <div>
            {isStale ? (
              <ShiftCard shift={shift} attendance={attendance} lastClockIn={lastClockIn} />
            ) : !isDone && shift ? (
              <ShiftCard shift={shift} attendance={attendance} lastClockIn={lastClockIn} />
            ) : !isDone && !shift ? (
              <div style={{ background: "#fff", borderRadius: 16, padding: "32px 24px", textAlign: "center", boxShadow: "0 2px 10px rgba(140,21,21,0.07)" }}>
                <Calendar size={48} color="#999" style={{ margin: "0 auto 12px", display: "block" }} />
                <p style={{ fontWeight: 600, color: NEAR_BLACK, fontSize: 16 }}>No shift scheduled</p>
                <p style={{ fontSize: 13, color: "#aaa", marginTop: 4 }}>You are not assigned to a shift today.</p>
              </div>
            ) : (
              <div style={{ background: "#fff", borderRadius: 16, padding: "28px 24px", textAlign: "center", boxShadow: "0 2px 10px rgba(140,21,21,0.07)" }}>
                <CheckCircle2 size={48} color="#15803d" style={{ margin: "0 auto 10px" }} />
                <p style={{ fontWeight: 600, color: NEAR_BLACK, fontSize: 15 }}>Shift complete</p>
                <p style={{ fontSize: 13, color: "#aaa", marginTop: 4 }}>
                  In {fmtTime(attendance!.clockIn)} · Out {fmtTime(attendance!.clockOut!)}
                </p>
              </div>
            )}
          </div>

          {/* Right column: camera / action */}
          <div>
            {isStale ? (
              <CameraView videoRef={videoRef} onCapture={onCapture} isClockedIn={true} cameraReady={cameraReady} cameraError={cameraError} />
            ) : !isDone && shift ? (
              <CameraView videoRef={videoRef} onCapture={onCapture} isClockedIn={isClockedIn} cameraReady={cameraReady} cameraError={cameraError} />
            ) : !isDone && !shift ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", minHeight: 200 }}>
                <div style={{ background: "#fff", borderRadius: 16, padding: "24px", textAlign: "center", boxShadow: "0 2px 10px rgba(140,21,21,0.07)", width: "100%" }}>
                  <p style={{ fontSize: 14, color: "#888", fontWeight: 500 }}>No action available</p>
                  <p style={{ fontSize: 12, color: "#aaa", marginTop: 4 }}>Contact your manager if you need to clock in.</p>
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", minHeight: 200 }}>
                <div style={{ background: "#fff", borderRadius: 16, padding: "24px", textAlign: "center", boxShadow: "0 2px 10px rgba(140,21,21,0.07)", width: "100%" }}>
                  <CheckCircle2 size={36} color="#15803d" style={{ margin: "0 auto 8px" }} />
                  <p style={{ fontSize: 14, color: "#666", fontWeight: 500 }}>All done for today</p>
                  <p style={{ fontSize: 12, color: "#aaa", marginTop: 4 }}>Your shift has been completed.</p>
                </div>
              </div>
            )}
          </div>
        </div>

        <div style={{ textAlign: "center" }}>
          <button
            onClick={onLogout}
            style={{ background: "none", border: "none", color: ROSE, fontSize: 13, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5, fontWeight: 500 }}
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
    ? { bg: "#fee2e2", color: "#991b1b", label: "Time Out" }
    : { bg: "#dcfce7", color: "#166534", label: "Time In" };

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: BLUSH, fontFamily: "'Inter', sans-serif" }}>
      <KioskHeader name={`${employee.firstName} ${employee.lastName}`} />

      <div style={{ flex: 1, maxWidth: 600, margin: "0 auto", width: "100%", padding: "28px 24px", boxSizing: "border-box" }}>
        <div style={{ background: "#fff", borderRadius: 18, padding: "28px", boxShadow: "0 2px 12px rgba(140,21,21,0.08)" }}>

          <div style={{ textAlign: "center", marginBottom: 20 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: NEAR_BLACK }}>Confirm Your Photo</div>
            <div style={{ fontSize: 13, color: "#aaa", marginTop: 4 }}>Review carefully before submitting</div>
          </div>

          <div style={{ borderRadius: 14, overflow: "hidden", marginBottom: 20, maxHeight: 320 }}>
            <img src={photoUrl} alt="Selfie" style={{ width: "100%", maxHeight: 320, objectFit: "cover", display: "block" }} />
          </div>

          {!isClockedIn && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, color: "#aaa", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600, marginBottom: 6 }}>
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
                  width: "100%", borderRadius: 10, border: "1.5px solid #e5e5e5",
                  padding: "10px 12px", fontSize: 14, color: NEAR_BLACK, resize: "none",
                  outline: "none", fontFamily: "inherit", boxSizing: "border-box",
                  background: loading ? "#f9f9f9" : "#fff",
                }}
              />
            </div>
          )}

          {isClockedIn && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, color: "#aaa", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600, marginBottom: 6 }}>
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
                  width: "100%", borderRadius: 10, border: "1.5px solid #e5e5e5",
                  padding: "10px 12px", fontSize: 14, color: NEAR_BLACK, resize: "none",
                  outline: "none", fontFamily: "inherit", boxSizing: "border-box",
                  background: loading ? "#f9f9f9" : "#fff",
                }}
              />
            </div>
          )}

          <div style={{ display: "flex", gap: 14, marginBottom: 22 }}>
            <button
              onClick={onRetake}
              disabled={loading}
              style={{
                flex: 1, padding: "14px", borderRadius: 12, border: "1.5px solid #ddd",
                background: "#fff", color: "#555", fontSize: 14, fontWeight: 600, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                opacity: loading ? 0.5 : 1,
              }}
            >
              <RefreshCw size={16} color="#888" /> Retake
            </button>
            <button
              onClick={onConfirm}
              disabled={loading}
              style={{
                flex: 1.4, padding: "14px", borderRadius: 12, border: "none",
                background: "#2d7a3a", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                boxShadow: "0 3px 10px rgba(45,122,58,0.25)",
                opacity: loading ? 0.7 : 1,
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

          <div style={{ borderTop: "1px solid #f0e6e6", paddingTop: 16 }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: NEAR_BLACK, marginBottom: 12 }}>
              <span style={{ fontWeight: 900 }}>{employee.lastName},</span> {employee.firstName}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 20px" }}>
              <div>
                <div style={{ fontSize: 11, color: "#aaa", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600, marginBottom: 3 }}>Action</div>
                <span style={{ display: "inline-block", background: actionBadge.bg, color: actionBadge.color, fontSize: 12, fontWeight: 700, borderRadius: 20, padding: "3px 14px" }}>
                  {actionBadge.label}
                </span>
              </div>
              <div>
                <div style={{ fontSize: 11, color: "#aaa", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600, marginBottom: 3 }}>Branch</div>
                <span style={{ fontSize: 14, fontWeight: 600, color: NEAR_BLACK }}>{employee.branch.name}</span>
              </div>
              <div>
                <div style={{ fontSize: 11, color: "#aaa", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600, marginBottom: 3 }}>Time</div>
                <span style={{ fontSize: 14, fontWeight: 600, color: NEAR_BLACK, fontVariantNumeric: "tabular-nums" }}>{timeStr}</span>
              </div>
              <div>
                <div style={{ fontSize: 11, color: "#aaa", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600, marginBottom: 3 }}>Date</div>
                <span style={{ fontSize: 14, fontWeight: 600, color: NEAR_BLACK }}>{dateStr}</span>
              </div>
            </div>
          </div>
        </div>

        <div style={{ textAlign: "center", marginTop: 16 }}>
          <button
            onClick={onRetake}
            style={{ background: "none", border: "none", color: ROSE, fontSize: 13, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5 }}
          >
            <LogOut size={13} color={ROSE} /> Cancel & switch employee
          </button>
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
      <div style={{ padding: "24px 32px", display: "flex", justifyContent: "space-between", alignItems: "center", maxWidth: 960, margin: "0 auto", width: "100%", boxSizing: "border-box" }}>
        <img src="/kaos-logo.svg" alt="KAOS" style={{ height: 44, width: "auto", filter: "brightness(0) invert(1)" }} />
        <span style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", fontVariantNumeric: "tabular-nums" }}>{timeStr} · {dateStr}</span>
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 32px", maxWidth: 500, margin: "0 auto", width: "100%", boxSizing: "border-box" }}>
        <div style={{ width: 88, height: 88, borderRadius: "50%", background: "rgba(255,255,255,0.15)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 12, border: "2px solid rgba(255,255,255,0.25)" }}>
          <CheckCircle2 size={44} color="#fff" />
        </div>

        <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 14, letterSpacing: 0.5, textTransform: "uppercase", fontWeight: 600 }}>Time Recorded</div>
        <div style={{ color: "#fff", fontSize: 48, fontWeight: 900, letterSpacing: -1, fontVariantNumeric: "tabular-nums" }}>{recordedTime}</div>
        <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 14 }}>
          {now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: COMPANY_TZ })}
        </div>

        <div style={{ marginTop: 24, background: "rgba(255,255,255,0.1)", borderRadius: 16, padding: "18px 24px", width: "100%", backdropFilter: "blur(4px)", border: "1px solid rgba(255,255,255,0.15)", boxSizing: "border-box" }}>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600, marginBottom: 12 }}>Shift Summary</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {shift && (
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Clock size={15} color="rgba(255,255,255,0.5)" />
                <span style={{ fontSize: 14, color: "#fff", fontWeight: 600 }}>{shift.startTime} – {shift.endTime}</span>
              </div>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Building2 size={15} color="rgba(255,255,255,0.5)" />
              <span style={{ fontSize: 14, color: "rgba(255,255,255,0.75)" }}>{employee.branch.name}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <User size={15} color="rgba(255,255,255,0.5)" />
              <span style={{ fontSize: 14, color: "rgba(255,255,255,0.75)" }}>{employee.firstName} {employee.lastName}</span>
            </div>
          </div>
        </div>

        <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 14, marginTop: 16, textAlign: "center" }}>
          {actionWasClockIn ? `Have a great shift, ${employee.firstName}! ☕` : `Have a great rest, ${employee.firstName}!`}
        </div>
      </div>

      <div style={{ padding: "0 32px 40px", display: "flex", flexDirection: "column", alignItems: "center", gap: 14, maxWidth: 500, margin: "0 auto", width: "100%", boxSizing: "border-box" }}>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", textAlign: "center" }}>
          Returning to login in{" "}
          <span style={{ fontWeight: 800, color: "rgba(255,255,255,0.8)", fontVariantNumeric: "tabular-nums" }}>{seconds}</span>
          {" "}seconds
        </div>
        <div style={{ width: "100%", height: 3, background: "rgba(255,255,255,0.12)", borderRadius: 4, overflow: "hidden" }}>
          <div style={{ height: "100%", background: "rgba(255,255,255,0.5)", borderRadius: 4, width: `${(seconds / 5) * 100}%`, transition: "width 1s linear" }} />
        </div>
        <button
          onClick={onReturnNow}
          style={{ background: "none", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 10, padding: "10px 24px", color: "rgba(255,255,255,0.7)", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
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
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: BLUSH, fontFamily: "'Inter', sans-serif", padding: "40px 24px" }}>
      <div style={{ maxWidth: 400, width: "100%", background: "#fff", borderRadius: 20, padding: "48px 36px", textAlign: "center", boxShadow: "0 4px 24px rgba(140,21,21,0.10)" }}>
        <XCircle size={56} color="#dc2626" style={{ margin: "0 auto 16px" }} />
        <h1 style={{ fontSize: 20, fontWeight: 800, color: NEAR_BLACK, margin: 0 }}>Unauthorized Terminal</h1>
        <p style={{ fontSize: 14, color: "#888", marginTop: 8, lineHeight: 1.5 }}>
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
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: BLUSH, fontFamily: "'Inter', sans-serif", padding: "40px 24px" }}>
      <div style={{ maxWidth: 400, width: "100%", background: "#fff", borderRadius: 20, padding: "40px 36px", textAlign: "center", boxShadow: "0 4px 24px rgba(140,21,21,0.10)" }}>
        <img src="/kaos-logo.svg" alt="KAOS" style={{ height: 48, width: "auto", margin: "0 auto" }} />
        <h1 style={{ fontSize: 20, fontWeight: 800, color: NEAR_BLACK, marginTop: 16, marginBottom: 0 }}>Kiosk Setup</h1>
        <p style={{ fontSize: 14, color: "#888", marginTop: 6, lineHeight: 1.5 }}>
          Enter the kiosk PIN set by your administrator. It will be saved on this device.
        </p>
        <div style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 12 }}>
          <input
            type="password" placeholder="Enter kiosk PIN" value={pin}
            onChange={(e) => setPin(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !loading && submit()}
            disabled={loading}
            style={{
              width: "100%", padding: "14px 18px", borderRadius: 12,
              border: "1.5px solid #e5e5e5", background: "#fafafa",
              fontSize: 15, color: "#333", outline: "none", textAlign: "center",
              boxSizing: "border-box",
            }}
          />
          {error && <p style={{ fontSize: 13, color: "#dc2626", margin: 0 }}>{error}</p>}
          <button onClick={submit} disabled={loading} style={{
            width: "100%", padding: "14px", borderRadius: 12,
            border: "none", background: BRAND, color: "#fff",
            fontSize: 15, fontWeight: 700, cursor: "pointer",
            opacity: loading ? 0.6 : 1,
          }}>
            {loading ? "Verifying…" : "Confirm PIN"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────

type Screen = "loading" | "blocked" | "pin-setup" | "id-entry" | "main" | "confirm" | "success";

export default function KioskPage() {
  const [screen, setScreen] = useState<Screen>("loading");
  const [pin, setPin] = useState("");
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
    setLookupLoading(true);
    setLookupError("");
    try {
      const data = await getKioskStatus(empId, pin);
      setStatusData(data);
      setScreen("main");
    } catch (err: any) {
      if (err?.response?.status === 401) {
        localStorage.removeItem(PIN_KEY);
        setPin("");
        setScreen("pin-setup");
        return;
      }
      setLookupError(extractErrorMessage(err, "Employee not found"));
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
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) return;
      setPhotoBlob(blob);
      setPhotoUrl(URL.createObjectURL(blob));
      setConfirmError("");
      setClockOutNote("");
      const isClockedIn = !!statusData?.attendance && !statusData.attendance.clockOut;
      setActionWasClockIn(!isClockedIn);
      setScreen("confirm");
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
