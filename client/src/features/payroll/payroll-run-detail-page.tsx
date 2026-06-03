import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  Download,
  FileSpreadsheet,
  FileText,
  Loader2,
  Pencil,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { extractErrorMessage } from "@/lib/api";
import Pagination from "@/components/ui/pagination";
import {
  cancelRun,
  completeRun,
  downloadPayslipPdf,
  downloadRunPdf,
  downloadRunXlsx,
  formatCurrency,
  getRun,
  processRun,
  type FullyPaidDeduction,
  type PayrollStatus,
} from "./payroll.api";
import PayslipEditDialog from "./payslip-edit-dialog";
import PayslipViewDialog from "./payslip-view-dialog";
import { COMPANY_TZ } from "@/lib/timezone";

const BRAND = "#8C1515";

function StatusPill({ status }: { status: PayrollStatus }) {
  const map: Record<PayrollStatus, { bg: string; color: string; label: string }> = {
    DRAFT:      { bg: "#F3F4F6", color: "#6B7280", label: "Draft" },
    PROCESSING: { bg: "#FEF3C7", color: "#D97706", label: "In Progress" },
    COMPLETED:  { bg: "#DCFCE7", color: "#16A34A", label: "Finalized" },
    CANCELLED:  { bg: "#FEE2E2", color: "#DC2626", label: "Cancelled" },
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

export default function PayrollRunDetailPage() {
  const { runId } = useParams<{ runId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { toast } = useToast();

  const [editPayslipId, setEditPayslipId] = useState<string | null>(null);
  const [viewPayslipId, setViewPayslipId] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [finalizeOpen, setFinalizeOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [settledDeductions, setSettledDeductions] = useState<FullyPaidDeduction[]>([]);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;
  const exportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!exportOpen) return;
    function handleClick(e: MouseEvent) {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
        setExportOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [exportOpen]);

  const runQuery = useQuery({
    queryKey: ["payroll-run", runId],
    queryFn: () => getRun(runId!),
    enabled: !!runId,
  });

  const reprocess = useMutation({
    mutationFn: () => processRun(runId!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payroll-run", runId] });
      qc.invalidateQueries({ queryKey: ["payroll-runs"] });
      toast("Payslips regenerated", "success");
    },
    onError: (err) => toast(extractErrorMessage(err), "error"),
  });

  const finalize = useMutation({
    mutationFn: () => completeRun(runId!),
    onSuccess: ({ fullyPaidDeductions }) => {
      qc.invalidateQueries({ queryKey: ["payroll-run", runId] });
      qc.invalidateQueries({ queryKey: ["payroll-runs"] });
      toast("Payroll run finalized", "success");
      setFinalizeOpen(false);
      if (fullyPaidDeductions.length > 0) {
        setSettledDeductions(fullyPaidDeductions);
      }
    },
    onError: (err) => {
      toast(extractErrorMessage(err), "error");
      setFinalizeOpen(false);
    },
  });

  const cancel = useMutation({
    mutationFn: () => cancelRun(runId!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payroll-runs"] });
      toast("Payroll run deleted", "success");
      navigate("/payroll");
    },
    onError: (err) => {
      toast(extractErrorMessage(err), "error");
      setCancelOpen(false);
    },
  });

  const pdfExport = useMutation({
    mutationFn: (filename: string) => downloadRunPdf(runId!, filename),
    onError: (err) => toast(extractErrorMessage(err), "error"),
  });

  const xlsxExport = useMutation({
    mutationFn: (filename: string) => downloadRunXlsx(runId!, filename),
    onError: (err) => toast(extractErrorMessage(err), "error"),
  });

  const payslipPdf = useMutation({
    mutationFn: ({ id, filename }: { id: string; filename: string }) =>
      downloadPayslipPdf(id, filename),
    onError: (err) => toast(extractErrorMessage(err), "error"),
  });

  if (runQuery.isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!runQuery.data) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10 text-center">
        <p className="text-destructive">
          {extractErrorMessage(runQuery.error, "Payroll run not found")}
        </p>
        <Link
          to="/payroll"
          className="mt-4 inline-flex items-center gap-1 text-sm text-primary underline"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to payroll
        </Link>
      </div>
    );
  }

  const run = runQuery.data;
  const isFinalized = run.status === "COMPLETED";
  const isCancelled = run.status === "CANCELLED";
  const canReprocess = run.status === "PROCESSING" || run.status === "DRAFT";
  const canFinalize = run.status === "PROCESSING";
  const canDelete = !isCancelled;
  const canEdit = !isFinalized && !isCancelled;
  const canExport = run.payslips.length > 0;
  const filenameBase = `payroll_${run.branch.name.replace(/[^\w-]+/g, "-")}_${run.periodStart.slice(0, 10)}_to_${run.periodEnd.slice(0, 10)}`;

  const totals = run.payslips.reduce(
    (acc, p) => {
      acc.gross += Number(p.grossPay);
      acc.deductions += Number(p.totalDeductions);
      acc.net += Number(p.netPay);
      return acc;
    },
    { gross: 0, deductions: 0, net: 0 }
  );

  const totalPages = Math.max(1, Math.ceil(run.payslips.length / PAGE_SIZE));
  const pageRecords = run.payslips.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 md:px-8">
      {/* Back */}
      <Link
        to="/payroll"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to payroll
      </Link>

      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{run.branch.name}</h1>
            <StatusPill status={run.status} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {run.periodStart.slice(0, 10)} → {run.periodEnd.slice(0, 10)}
            {run.processedAt &&
              ` · finalized ${new Date(run.processedAt).toLocaleDateString("en-US", { timeZone: COMPANY_TZ })}`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canReprocess && (
            <Button
              variant="outline"
              onClick={() => reprocess.mutate()}
              disabled={reprocess.isPending}
              title="Regenerate payslips from attendance data"
            >
              {reprocess.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Regenerate
            </Button>
          )}
          {canFinalize && (
            <Button
              onClick={() => setFinalizeOpen(true)}
              disabled={finalize.isPending}
              style={{ backgroundColor: BRAND }}
              className="text-white hover:opacity-90"
            >
              <CheckCircle2 className="h-4 w-4" />
              Finalize
            </Button>
          )}
          {canExport && (
            <div className="relative" ref={exportRef}>
              <Button
                onClick={() => setExportOpen((v) => !v)}
                disabled={pdfExport.isPending || xlsxExport.isPending}
                style={{ backgroundColor: BRAND }}
                className="text-white hover:opacity-90"
              >
                {pdfExport.isPending || xlsxExport.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                Export
                <ChevronDown className="h-3.5 w-3.5 ml-1" />
              </Button>
              {exportOpen && (
                <div className="absolute right-0 top-full mt-1 z-10 w-36 rounded-lg border bg-white shadow-md py-1">
                  <button
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                    onClick={() => { pdfExport.mutate(`${filenameBase}.pdf`); setExportOpen(false); }}
                    disabled={pdfExport.isPending}
                  >
                    <FileText className="h-4 w-4 text-gray-400" />
                    PDF
                  </button>
                  <button
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                    onClick={() => { xlsxExport.mutate(`${filenameBase}.xlsx`); setExportOpen(false); }}
                    disabled={xlsxExport.isPending}
                  >
                    <FileSpreadsheet className="h-4 w-4 text-gray-400" />
                    Excel
                  </button>
                </div>
              )}
            </div>
          )}
          {canDelete && (
            <Button
              variant="outline"
              onClick={() => setCancelOpen(true)}
              disabled={cancel.isPending}
              className="text-destructive hover:text-destructive border-destructive/30 hover:border-destructive/60"
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </Button>
          )}
        </div>
      </div>

      {/* Totals */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <div className="text-xs font-medium text-muted-foreground">Total Gross</div>
          <div className="mt-1 text-xl font-bold tabular-nums">{formatCurrency(totals.gross)}</div>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <div className="text-xs font-medium text-muted-foreground">Total Deductions</div>
          <div className="mt-1 text-xl font-bold tabular-nums text-destructive">
            {formatCurrency(totals.deductions)}
          </div>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm" style={{ borderLeftWidth: 4, borderLeftColor: "#16A34A" }}>
          <div className="text-xs font-medium text-muted-foreground">Total Net Pay</div>
          <div className="mt-1 text-xl font-bold tabular-nums" style={{ color: "#16A34A" }}>
            {formatCurrency(totals.net)}
          </div>
        </div>
      </div>

      {/* Payslips table */}
      <div className="overflow-x-auto rounded-2xl bg-white shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Employee</TableHead>
              <TableHead className="text-right">Basic</TableHead>
              <TableHead className="text-right">Gross</TableHead>
              <TableHead className="text-right">Earnings</TableHead>
              <TableHead className="text-right">Deductions</TableHead>
              <TableHead className="text-right">Net Pay</TableHead>
              <TableHead className="w-0" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {run.payslips.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                  No payslips yet.
                </TableCell>
              </TableRow>
            )}
            {pageRecords.map((p) => (
              <TableRow key={p.id}>
                <TableCell>
                  <div className="font-medium">
                    {p.employee.firstName} {p.employee.lastName}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {p.employee.employeeId} · {p.employee.position}
                  </div>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCurrency(p.basicPay)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCurrency(p.grossPay)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCurrency(
                    Number(p.overtimePay) +
                    Number(p.bonuses) +
                    Number(p.allowances) +
                    Number(p.holidayPay)
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums text-destructive">
                  {formatCurrency(p.totalDeductions)}
                </TableCell>
                <TableCell className="text-right font-semibold tabular-nums text-green-600">
                  {formatCurrency(p.netPay)}
                </TableCell>
                <TableCell className="space-x-1 whitespace-nowrap text-right">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      payslipPdf.mutate({
                        id: p.id,
                        filename: `payslip_${p.employee.employeeId}_${run.periodStart.slice(0, 10)}.pdf`,
                      })
                    }
                    disabled={payslipPdf.isPending}
                    title="Download payslip PDF"
                  >
                    <Download className="h-3.5 w-3.5" />
                  </Button>
                  {canEdit ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setEditPayslipId(p.id)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Edit
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setViewPayslipId(p.id)}
                    >
                      View
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <Pagination page={page} totalPages={totalPages} totalRecords={run.payslips.length} pageSize={PAGE_SIZE} onPageChange={setPage} />
      </div>

      <PayslipEditDialog
        open={!!editPayslipId}
        onOpenChange={(open) => !open && setEditPayslipId(null)}
        payslipId={editPayslipId}
      />

      <PayslipViewDialog
        open={!!viewPayslipId}
        onOpenChange={(open) => !open && setViewPayslipId(null)}
        payslipId={viewPayslipId}
      />

      <ConfirmDialog
        open={finalizeOpen}
        onOpenChange={setFinalizeOpen}
        title="Finalize payroll run?"
        description="All payslips will be locked and made visible to employees. This cannot be undone."
        confirmLabel="Finalize"
        loading={finalize.isPending}
        onConfirm={() => finalize.mutate()}
      />

      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title="Delete payroll run?"
        description={
          isFinalized
            ? "This finalized run and all its payslips will be permanently deleted. Deduction payment tracking and consumed one-time earnings will be reversed. This cannot be undone."
            : "This run and all its payslips will be permanently deleted."
        }
        confirmLabel="Delete"
        destructive
        loading={cancel.isPending}
        onConfirm={() => cancel.mutate()}
      />

      {/* Settled deductions notification */}
      <Dialog
        open={settledDeductions.length > 0}
        onOpenChange={(open) => { if (!open) setSettledDeductions([]); }}
      >
        <DialogHeader>
          <DialogTitle>Deductions Fully Paid</DialogTitle>
          <DialogDescription>
            The following deductions have reached their total balance and were fully settled
            in this payroll run. Remove them from the employee profiles so they won't be
            included in the next cycle.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 space-y-2">
          {settledDeductions.map((d) => (
            <div
              key={d.employeeDeductionId}
              className="flex items-center justify-between rounded-md border border-amber-200 bg-amber-50 px-3 py-2"
            >
              <div>
                <div className="text-sm font-medium">{d.employeeName}</div>
                <div className="text-xs text-muted-foreground">
                  {d.deductionName} — ₱{d.totalBalance.toLocaleString()} fully paid
                </div>
              </div>
              <Link
                to="/employees"
                className="text-xs font-medium text-primary underline-offset-2 hover:underline"
                onClick={() => setSettledDeductions([])}
              >
                Go to Employees
              </Link>
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button onClick={() => setSettledDeductions([])}>Got it</Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
