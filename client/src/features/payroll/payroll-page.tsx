import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Search, Trash2 } from "lucide-react";
import { extractErrorMessage } from "@/lib/api";
import Pagination from "@/components/ui/pagination";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { listBranches } from "@/features/branches/branches.api";
import { cancelRun, listRuns, type PayrollRunSummary, type PayrollStatus } from "./payroll.api";
import PayrollRunCreateDialog from "./payroll-run-create-dialog";
import { COMPANY_TZ } from "@/lib/timezone";

const BRAND = "#8C1515";

function fmtPeriod(start: string, end: string): string {
  const s = new Date(start.slice(0, 10) + "T00:00:00");
  const e = new Date(end.slice(0, 10) + "T00:00:00");
  const opts: Intl.DateTimeFormatOptions = { timeZone: COMPANY_TZ };
  if (
    s.getFullYear() === e.getFullYear() &&
    s.getMonth() === e.getMonth()
  ) {
    return `${s.toLocaleDateString("en-US", { ...opts, month: "short" })} ${s.getDate()}–${e.getDate()}, ${s.getFullYear()}`;
  }
  const mo: Intl.DateTimeFormatOptions = { ...opts, month: "short", day: "numeric" };
  return `${s.toLocaleDateString("en-US", mo)} – ${e.toLocaleDateString("en-US", { ...mo, year: "numeric" })}`;
}

function fmtDateFull(dateStr: string): string {
  const d = new Date(dateStr.slice(0, 10) + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: COMPANY_TZ });
}

function StatusBadge({ status }: { status: PayrollStatus }) {
  const map: Record<PayrollStatus, { bg: string; color: string; label: string }> = {
    DRAFT:      { bg: "#F3F4F6", color: "#6B7280",  label: "Draft"       },
    PROCESSING: { bg: "#FEF3C7", color: "#D97706",  label: "In Progress" },
    COMPLETED:  { bg: "#DCFCE7", color: "#16A34A",  label: "Finalized"   },
    CANCELLED:  { bg: "#FEE2E2", color: "#DC2626",  label: "Cancelled"   },
  };
  const s = map[status];
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
      style={{ backgroundColor: s.bg, color: s.color }}
    >
      {s.label}
    </span>
  );
}

export default function PayrollPage() {
  const [branchId, setBranchId] = useState("");
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; status: PayrollStatus } | null>(null);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  const qc = useQueryClient();
  const { toast } = useToast();

  const deleteMutation = useMutation({
    mutationFn: (id: string) => cancelRun(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payroll-runs"] });
      toast("Payroll run deleted", "success");
      setDeleteTarget(null);
    },
    onError: (err) => {
      toast(extractErrorMessage(err), "error");
      setDeleteTarget(null);
    },
  });

  const branchesQuery = useQuery({
    queryKey: ["branches", {}],
    queryFn: () => listBranches(),
  });

  const query = useQuery<PayrollRunSummary[]>({
    queryKey: ["payroll-runs", branchId],
    queryFn: () => listRuns({ branchId: branchId || undefined }),
  });

  const filtered = useMemo(() => {
    const data = query.data ?? [];
    if (!search) return data;
    const q = search.toLowerCase();
    return data.filter((r) => r.branch.name.toLowerCase().includes(q));
  }, [query.data, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRecords = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 md:px-8">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-3xl font-bold text-gray-900">Employee Payroll</h1>
        <button
          onClick={() => setCreateOpen(true)}
          className="flex items-center gap-1.5 rounded-lg px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:opacity-90 hover:shadow-md"
          style={{ backgroundColor: BRAND }}
        >
          + New Run
        </button>
      </div>

      {/* Filters */}
      <div className="mb-5 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-300" />
              <input
                className="w-full rounded-full border border-gray-200 bg-white py-2 pl-9 pr-4 text-sm focus:outline-none"
                placeholder="Search by branch name"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              />
            </div>
          </div>
          <div className="min-w-[180px]">
            <select
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:border-gray-400 focus:outline-none"
              value={branchId}
              onChange={(e) => { setBranchId(e.target.value); setPage(1); }}
            >
              <option value="">All Branches</option>
              {branchesQuery.data?.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/60">
              <th className="px-6 py-3.5 text-left text-[10px] font-bold uppercase tracking-widest text-gray-400">Period</th>
              <th className="px-6 py-3.5 text-left text-[10px] font-bold uppercase tracking-widest text-gray-400">Branch</th>
              <th className="px-6 py-3.5 text-left text-[10px] font-bold uppercase tracking-widest text-gray-400">Payslips</th>
              <th className="px-6 py-3.5 text-left text-[10px] font-bold uppercase tracking-widest text-gray-400">Status</th>
              <th className="px-6 py-3.5 text-left text-[10px] font-bold uppercase tracking-widest text-gray-400">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {query.isLoading && (
              <tr>
                <td colSpan={5} className="py-14 text-center">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin text-gray-300" />
                </td>
              </tr>
            )}
            {query.isError && (
              <tr>
                <td colSpan={5} className="py-14 text-center text-sm text-red-500">
                  {extractErrorMessage(query.error, "Failed to load payroll runs")}
                </td>
              </tr>
            )}
            {!query.isLoading && !query.isError && filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="py-14 text-center text-sm text-gray-400">
                  No payroll runs yet. Click "+ New Run" to get started.
                </td>
              </tr>
            )}
            {pageRecords.map((r) => (
              <tr
                key={r.id}
                className="group transition-colors hover:bg-[#FAF5F5]"
              >
                <td className="px-6 py-4">
                  <p className="font-semibold text-gray-900">
                    {fmtPeriod(r.periodStart, r.periodEnd)}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-400">
                    {fmtDateFull(r.periodStart)} – {fmtDateFull(r.periodEnd)}
                  </p>
                </td>
                <td className="px-6 py-4">
                  <span className="font-medium" style={{ color: BRAND }}>
                    {r.branch.name}
                  </span>
                </td>
                <td className="px-6 py-4 tabular-nums text-gray-600">
                  {r._count.payslips}
                </td>
                <td className="px-6 py-4">
                  <StatusBadge status={r.status} />
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <Link
                      to={`/payroll/${r.id}`}
                      className="inline-flex items-center rounded-md border border-gray-200 px-3 py-1 text-xs font-medium text-gray-500 transition-colors hover:border-gray-400 hover:text-gray-700"
                    >
                      View
                    </Link>
                    {r.status !== "CANCELLED" && (
                      <button
                        onClick={() => setDeleteTarget({ id: r.id, status: r.status })}
                        className="inline-flex items-center rounded-md border border-red-200 px-2 py-1 text-xs font-medium text-red-500 transition-colors hover:border-red-400 hover:bg-red-50"
                        title="Delete run"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <Pagination page={page} totalPages={totalPages} totalRecords={filtered.length} pageSize={PAGE_SIZE} onPageChange={setPage} />
      </div>

      <PayrollRunCreateDialog open={createOpen} onOpenChange={setCreateOpen} />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title="Delete payroll run?"
        description={
          deleteTarget?.status === "COMPLETED"
            ? "This finalized run and all its payslips will be permanently deleted. Deduction payment tracking and consumed one-time earnings will be reversed. This cannot be undone."
            : "This run and all its payslips will be permanently deleted."
        }
        confirmLabel="Delete"
        destructive
        loading={deleteMutation.isPending}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
      />
    </div>
  );
}
