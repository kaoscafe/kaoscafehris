import { Loader2, X } from "lucide-react";
import type { ImportPreview } from "./employees.api";

interface Props {
  preview: ImportPreview;
  isPending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const STATUS_STYLES = {
  ready: { bg: "#F0FDF4", border: "#BBF7D0", badge: "#16A34A", badgeBg: "#DCFCE7", label: "Ready" },
  skipped: { bg: "#FFFBEB", border: "#FDE68A", badge: "#D97706", badgeBg: "#FEF3C7", label: "Skip" },
  error: { bg: "#FFF1F2", border: "#FECDD3", badge: "#DC2626", badgeBg: "#FEE2E2", label: "Error" },
};

export default function ImportPreviewDialog({ preview, isPending, onConfirm, onCancel }: Props) {
  const hasReady = preview.readyCount > 0;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-5xl flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-start justify-between px-6 py-5 border-b border-gray-100">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Review Import Data</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Check the rows below before confirming. Only rows marked <span className="font-semibold text-green-700">Ready</span> will be imported.
            </p>
          </div>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600 transition-colors ml-4 shrink-0">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Summary pills */}
        <div className="flex flex-wrap gap-3 px-6 py-4 border-b border-gray-100">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-3 py-1 text-xs font-semibold text-green-700">
            ✓ {preview.readyCount} ready to import
          </span>
          {preview.skippedCount > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-yellow-50 px-3 py-1 text-xs font-semibold text-yellow-700">
              ⚠ {preview.skippedCount} will be skipped
            </span>
          )}
          {preview.errorCount > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-700">
              ✕ {preview.errorCount} have errors
            </span>
          )}
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto px-6 py-4">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[10px] font-bold uppercase tracking-widest text-gray-400 border-b border-gray-100">
                <th className="pb-2 pr-3 w-10">#</th>
                <th className="pb-2 pr-3 w-20">Status</th>
                <th className="pb-2 pr-3">Employee ID</th>
                <th className="pb-2 pr-3">Name</th>
                <th className="pb-2 pr-3">Email</th>
                <th className="pb-2 pr-3">Branch</th>
                <th className="pb-2 pr-3">Position</th>
                <th className="pb-2 pr-3">Role</th>
                <th className="pb-2 pr-3">Status</th>
                <th className="pb-2 pr-3">Date Hired</th>
                <th className="pb-2 pr-3">Pay Type</th>
                <th className="pb-2">Pay Rate</th>
              </tr>
            </thead>
            <tbody>
              {preview.rows.map((r) => {
                const s = STATUS_STYLES[r.status];
                return (
                  <tr
                    key={r.row}
                    style={{ backgroundColor: s.bg, borderBottom: `1px solid ${s.border}` }}
                  >
                    <td className="py-2 pr-3 text-gray-400 font-mono">{r.row}</td>
                    <td className="py-2 pr-3">
                      <span
                        className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold"
                        style={{ backgroundColor: s.badgeBg, color: s.badge }}
                      >
                        {s.label}
                      </span>
                    </td>
                    <td className="py-2 pr-3 font-mono font-semibold text-gray-800">{r.employeeId}</td>
                    <td className="py-2 pr-3 font-medium text-gray-800 whitespace-nowrap">
                      {r.firstName} {r.lastName}
                    </td>
                    <td className="py-2 pr-3 text-gray-600 max-w-[160px] truncate">{r.email}</td>
                    <td className="py-2 pr-3 text-gray-700">{r.branch || <span className="text-gray-400 italic">—</span>}</td>
                    <td className="py-2 pr-3 text-gray-600">{r.position}</td>
                    <td className="py-2 pr-3 text-gray-600 capitalize">{r.role.toLowerCase()}</td>
                    <td className="py-2 pr-3 text-gray-600 capitalize">{r.employmentStatus.replace("_", " ").toLowerCase()}</td>
                    <td className="py-2 pr-3 text-gray-600 whitespace-nowrap">{r.dateHired}</td>
                    <td className="py-2 pr-3 text-gray-600 whitespace-nowrap">
                      {r.payType === "HOURLY" ? "Hourly" : "Monthly"}
                    </td>
                    <td className="py-2 text-gray-600 whitespace-nowrap tabular-nums">
                      {r.rate
                        ? `₱${r.rate}${r.payType === "HOURLY" ? "/hr" : "/mo"}`
                        : "—"}
                    </td>
                  </tr>
                );
              })}
              {/* Inline error/skip notes */}
              {preview.rows.filter(r => r.reason).map((r) => {
                const s = STATUS_STYLES[r.status];
                return (
                  <tr key={`note-${r.row}`} style={{ backgroundColor: s.bg, borderBottom: `1px solid ${s.border}` }}>
                    <td />
                    <td colSpan={11} className="pb-2 pr-3 text-[10px] italic" style={{ color: s.badge }}>
                      → {r.reason}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-100 px-6 py-4 flex items-center justify-between gap-3">
          <p className="text-xs text-gray-400">
            {!hasReady && "No rows are ready to import. Fix errors in your file and re-upload."}
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onCancel}
              disabled={isPending}
              className="rounded-lg px-5 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={!hasReady || isPending}
              className="rounded-lg px-5 py-2.5 text-sm font-medium text-white flex items-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: "#8C1515" }}
            >
              {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Confirm Import ({preview.readyCount})
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
