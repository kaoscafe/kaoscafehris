import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import Pagination from "@/components/ui/pagination";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { extractErrorMessage } from "@/lib/api";
import {
  createDeduction,
  deleteDeduction,
  listDeductions,
  updateDeduction,
  type Deduction,
} from "./deductions.api";

const BRAND = "#8C1515";

const GOV_TYPE_LABELS: Record<string, string> = {
  SSS: "SSS",
  PHILHEALTH: "PhilHealth",
  PAGIBIG: "Pag-IBIG",
  BIR_TAX: "Withholding Tax",
};

interface FormState {
  name: string;
  amount: string;
  type: string;
}

const DEFAULT_FORM: FormState = { name: "", amount: "", type: "" };

export default function DeductionsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Deduction | null>(null);
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [confirmDelete, setConfirmDelete] = useState<Deduction | null>(null);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  const query = useQuery({ queryKey: ["deductions"], queryFn: listDeductions });

  const data = query.data ?? [];
  const totalPages = Math.max(1, Math.ceil(data.length / PAGE_SIZE));
  const pageRecords = data.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function openAdd() {
    setEditing(null);
    setForm(DEFAULT_FORM);
    setShowForm(true);
  }

  function openEdit(d: Deduction) {
    setEditing(d);
    setForm({ name: d.name, amount: String(d.amount), type: d.type ?? "" });
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditing(null);
    setForm(DEFAULT_FORM);
  }

  const saveMut = useMutation({
    mutationFn: () => {
      const payload = { name: form.name.trim(), amount: Number(form.amount), type: form.type || null };
      return editing
        ? updateDeduction(editing.id, payload)
        : createDeduction(payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["deductions"] });
      toast(editing ? "Deduction updated" : "Deduction added", "success");
      closeForm();
    },
    onError: (err) => toast(extractErrorMessage(err), "error"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteDeduction(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["deductions"] });
      toast("Deduction deleted", "success");
      setConfirmDelete(null);
    },
    onError: (err) => toast(extractErrorMessage(err), "error"),
  });

  const canSubmit = form.name.trim().length > 0 && form.amount !== "" && Number(form.amount) >= 0;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 md:px-8">
      <h1 className="mb-6 font-heading text-3xl font-bold text-gray-900">Deductions Management</h1>

      <div className="rounded-2xl bg-white p-6 shadow-sm">
        {/* Header */}
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-gray-800">Deductions</h2>
            <p className="text-xs text-gray-400">Manage company-wide deduction items</p>
          </div>
          <button
            type="button"
            onClick={openAdd}
            className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-white transition-all hover:shadow-md"
            style={{ backgroundColor: BRAND }}
          >
            <Plus className="h-4 w-4" />
            Add Deduction
          </button>
        </div>

        {/* Inline form */}
        {showForm && (
          <div className="mb-5 rounded-xl border border-gray-100 bg-gray-50 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-700">
                {editing ? "Edit Deduction" : "New Deduction"}
              </h3>
              <button type="button" onClick={closeForm} className="text-gray-400 hover:text-gray-600">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-gray-500">Deduction Name</label>
                <input
                  type="text"
                  placeholder="e.g. Uniform, Cash Advance"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-gray-500">Deduction Amount (₱)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                  value={form.amount}
                  onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-gray-500">Gov. Contribution Type</label>
                <select
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none"
                  value={form.type}
                  onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
                >
                  <option value="">Custom / None</option>
                  <option value="SSS">SSS</option>
                  <option value="PHILHEALTH">PhilHealth</option>
                  <option value="PAGIBIG">Pag-IBIG</option>
                  <option value="BIR_TAX">Withholding Tax</option>
                </select>
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => saveMut.mutate()}
                disabled={saveMut.isPending || !canSubmit}
                className="flex items-center gap-1.5 rounded-lg px-5 py-2 text-sm font-medium text-white transition-all hover:shadow-md disabled:opacity-50"
                style={{ backgroundColor: BRAND }}
              >
                {saveMut.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {editing ? "Save Changes" : "Add"}
              </button>
              <button
                type="button"
                onClick={closeForm}
                className="rounded-lg border border-gray-200 px-5 py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Table */}
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">
                Deduction Name
              </th>
              <th className="py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">
                Type
              </th>
              <th className="py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">
                Amount
              </th>
              <th className="py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">
                Action
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {query.isLoading && (
              <tr>
                <td colSpan={4} className="py-10 text-center">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin text-gray-300" />
                </td>
              </tr>
            )}
            {!query.isLoading && data.length === 0 && (
              <tr>
                <td colSpan={4} className="py-10 text-center text-sm text-gray-400">
                  No deductions yet. Click "Add Deduction" to create one.
                </td>
              </tr>
            )}
            {pageRecords.map((d) => (
              <tr key={d.id} className="hover:bg-gray-50/60">
                <td className="py-3 font-medium text-gray-800">{d.name}</td>
                <td className="py-3 text-gray-500 text-xs">
                  {d.type ? (GOV_TYPE_LABELS[d.type] ?? d.type) : <span className="text-gray-300">—</span>}
                </td>
                <td className="py-3 tabular-nums text-gray-600">
                  ₱{Number(d.amount).toLocaleString("en-PH", { minimumFractionDigits: 2 })}
                </td>
                <td className="py-3">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => openEdit(d)}
                      className="text-gray-400 hover:text-gray-700 transition-colors"
                      title="Edit"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(d)}
                      className="text-gray-400 hover:text-red-500 transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <Pagination page={page} totalPages={totalPages} totalRecords={data.length} pageSize={PAGE_SIZE} onPageChange={setPage} />
      </div>

      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
        title="Delete deduction?"
        description={confirmDelete ? `Delete "${confirmDelete.name}"? This cannot be undone.` : ""}
        confirmLabel="Delete"
        destructive
        onConfirm={() => confirmDelete && deleteMut.mutate(confirmDelete.id)}
        loading={deleteMut.isPending}
      />
    </div>
  );
}
