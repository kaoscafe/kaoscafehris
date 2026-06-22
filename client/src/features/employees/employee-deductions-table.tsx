import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { extractErrorMessage } from "@/lib/api";
import { useAuthStore } from "@/features/auth/auth.store";
import { listDeductions } from "@/features/deductions/deductions.api";
import {
  listEmployeeDeductions,
  addEmployeeDeduction,
  removeEmployeeDeduction,
  updateEmployeeDeduction,
} from "./employee-deductions.api";

const BRAND = "#8C1515";

function toNum(v: string | number | null | undefined): number {
  if (v === null || v === undefined) return 0;
  const n = typeof v === "string" ? parseFloat(v) : v;
  return Number.isFinite(n) ? n : 0;
}

function fmt(n: number) {
  return `₱${n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export interface PendingDeduction {
  deductionId: string;
  name: string;
  defaultAmount: number;
  amount: number | null;
  totalBalance: number | null;
}

interface Props {
  employeeId?: string;
  pendingDeductions?: PendingDeduction[];
  onPendingChange?: (deductions: PendingDeduction[]) => void;
}

export default function EmployeeDeductionsTable({ employeeId, pendingDeductions, onPendingChange }: Props) {
  const isOnline = !!employeeId;
  // Managers may add and edit deductions, but only admins may remove them.
  const isAdmin = useAuthStore((s) => s.user?.role) === "ADMIN";

  const qc = useQueryClient();
  const { toast } = useToast();

  const [showAddRow, setShowAddRow] = useState(false);
  const [selectedDeductionId, setSelectedDeductionId] = useState("");
  const [amountInput, setAmountInput] = useState("");
  const [totalBalanceInput, setTotalBalanceInput] = useState("");

  // Inline edit of an existing row's amount / total payable
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editTotalBalance, setEditTotalBalance] = useState("");

  const empDeductionsQuery = useQuery({
    queryKey: ["employee-deductions", employeeId],
    queryFn: () => listEmployeeDeductions(employeeId!),
    enabled: isOnline,
  });

  const allDeductionsQuery = useQuery({
    queryKey: ["deductions"],
    queryFn: listDeductions,
  });

  const onlineAssigned = empDeductionsQuery.data ?? [];
  const offlineAssigned = pendingDeductions ?? [];

  const assignedIds = isOnline
    ? onlineAssigned.map((a) => a.deductionId)
    : offlineAssigned.map((a) => a.deductionId);

  const availableDeductions = (allDeductionsQuery.data ?? []).filter(
    (d) => !assignedIds.includes(d.id)
  );

  function resetAddForm() {
    setSelectedDeductionId("");
    setAmountInput("");
    setTotalBalanceInput("");
    setShowAddRow(false);
  }

  function handleAddOffline() {
    const deduction = availableDeductions.find((d) => d.id === selectedDeductionId);
    if (!deduction) return;
    const newItem: PendingDeduction = {
      deductionId: deduction.id,
      name: deduction.name,
      defaultAmount: Number(deduction.amount),
      amount: amountInput ? parseFloat(amountInput) : null,
      totalBalance: totalBalanceInput ? parseFloat(totalBalanceInput) : null,
    };
    onPendingChange?.([...offlineAssigned, newItem]);
    resetAddForm();
  }

  function handleRemoveOffline(deductionId: string) {
    onPendingChange?.(offlineAssigned.filter((d) => d.deductionId !== deductionId));
  }

  const addMutation = useMutation({
    mutationFn: () =>
      addEmployeeDeduction(employeeId!, {
        deductionId: selectedDeductionId,
        amount: amountInput ? parseFloat(amountInput) : null,
        totalBalance: totalBalanceInput ? parseFloat(totalBalanceInput) : null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employee-deductions", employeeId] });
      toast("Deduction assigned", "success");
      resetAddForm();
    },
    onError: (err) => toast(extractErrorMessage(err), "error"),
  });

  const removeMutation = useMutation({
    mutationFn: (edId: string) => removeEmployeeDeduction(employeeId!, edId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employee-deductions", employeeId] });
      toast("Deduction removed", "success");
    },
    onError: (err) => toast(extractErrorMessage(err), "error"),
  });

  const resetPaidMutation = useMutation({
    mutationFn: (edId: string) =>
      updateEmployeeDeduction(employeeId!, edId, { paidAmount: 0 }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employee-deductions", employeeId] });
      toast("Balance reset", "success");
    },
    onError: (err) => toast(extractErrorMessage(err), "error"),
  });

  const editMutation = useMutation({
    mutationFn: (vars: { edId: string; amount: number | null; totalBalance: number | null }) =>
      updateEmployeeDeduction(employeeId!, vars.edId, {
        amount: vars.amount,
        totalBalance: vars.totalBalance,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employee-deductions", employeeId] });
      toast("Deduction updated", "success");
      setEditingId(null);
    },
    onError: (err) => toast(extractErrorMessage(err), "error"),
  });

  function saveEdit(edId: string) {
    const amount = editAmount.trim() === "" ? null : parseFloat(editAmount);
    const totalBalance = editTotalBalance.trim() === "" ? null : parseFloat(editTotalBalance);
    if (amount !== null && !Number.isFinite(amount)) return;
    if (totalBalance !== null && !Number.isFinite(totalBalance)) return;
    editMutation.mutate({ edId, amount, totalBalance });
  }

  const isLoading = isOnline && empDeductionsQuery.isLoading;
  const noRows = isOnline ? onlineAssigned.length === 0 : offlineAssigned.length === 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-bold uppercase tracking-widest" style={{ color: BRAND }}>
          Deductions
        </h3>
        {!showAddRow && (
          <button
            type="button"
            onClick={() => setShowAddRow(true)}
            disabled={allDeductionsQuery.isSuccess && availableDeductions.length === 0}
            className="flex items-center gap-1 text-xs font-medium rounded-md px-2 py-1 border border-gray-200 hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Plus className="h-3 w-3" /> Assign
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-4">
          <Loader2 className="h-4 w-4 animate-spin text-gray-300" />
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="px-3 py-2 text-left font-semibold uppercase tracking-wider text-gray-400">Deduction</th>
                <th className="px-3 py-2 text-right font-semibold uppercase tracking-wider text-gray-400">Amount</th>
                <th className="px-3 py-2 text-right font-semibold uppercase tracking-wider text-gray-400">Total Payable</th>
                <th className="px-3 py-2 text-right font-semibold uppercase tracking-wider text-gray-400">Paid</th>
                <th className="px-3 py-2 text-right font-semibold uppercase tracking-wider text-gray-400">Balance</th>
                <th className="w-16" />
              </tr>
            </thead>
            <tbody>
              {noRows && !showAddRow && (
                <tr>
                  <td colSpan={6} className="py-5 text-center text-xs text-gray-400 italic">
                    No deductions assigned yet.
                  </td>
                </tr>
              )}

              {/* Offline rows (add mode) */}
              {!isOnline && offlineAssigned.map((d) => {
                const effectiveAmount = d.amount ?? d.defaultAmount;
                return (
                  <tr key={d.deductionId} className="border-b last:border-b-0 hover:bg-gray-50">
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-medium text-gray-800">{d.name}</span>
                        {!d.totalBalance && (
                          <span className="rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-600">Recurring</span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{fmt(effectiveAmount)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-gray-400">
                      {d.totalBalance !== null ? fmt(d.totalBalance) : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-gray-400">—</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-gray-400">—</td>
                    <td className="px-2 py-2.5">
                      <button
                        type="button"
                        onClick={() => handleRemoveOffline(d.deductionId)}
                        className="rounded p-1 text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </td>
                  </tr>
                );
              })}

              {/* Online rows (edit mode) */}
              {isOnline && onlineAssigned.map((ed) => {
                const effectiveAmount = toNum(ed.amount ?? ed.deduction.amount);
                const totalBalance = ed.totalBalance ? toNum(ed.totalBalance) : null;
                const paidAmount = toNum(ed.paidAmount);
                const remaining = totalBalance !== null ? Math.max(0, totalBalance - paidAmount) : null;
                const isSettled = totalBalance !== null && paidAmount >= totalBalance;
                const isEditingRow = editingId === ed.id;

                return (
                  <tr key={ed.id} className={`border-b last:border-b-0 ${isSettled ? "bg-amber-50" : "hover:bg-gray-50"}`}>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-medium text-gray-800">{ed.deduction.name}</span>
                        {isSettled && (
                          <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">Settled</span>
                        )}
                        {!totalBalance && (
                          <span className="rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-600">Recurring</span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {isEditingRow ? (
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={editAmount}
                          onChange={(e) => setEditAmount(e.target.value)}
                          className="w-24 rounded border border-gray-200 bg-white px-2 py-1 text-right text-xs tabular-nums focus:outline-none focus:border-red-400"
                        />
                      ) : (
                        fmt(effectiveAmount)
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-gray-400">
                      {isEditingRow ? (
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="Recurring"
                          value={editTotalBalance}
                          onChange={(e) => setEditTotalBalance(e.target.value)}
                          className="w-24 rounded border border-gray-200 bg-white px-2 py-1 text-right text-xs tabular-nums focus:outline-none focus:border-red-400"
                        />
                      ) : totalBalance !== null ? (
                        fmt(totalBalance)
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-gray-400">
                      {totalBalance !== null ? fmt(paidAmount) : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-medium">
                      {remaining !== null ? (
                        <span className={isSettled ? "text-amber-600" : "text-gray-800"}>
                          {isSettled ? "₱0.00" : fmt(remaining)}
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-2 py-2.5">
                      <div className="flex items-center justify-end gap-1">
                        {isEditingRow ? (
                          <>
                            <button
                              type="button"
                              title="Save"
                              onClick={() => saveEdit(ed.id)}
                              disabled={editMutation.isPending}
                              className="rounded p-1 text-green-600 hover:bg-green-50 transition-colors disabled:opacity-50"
                            >
                              {editMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                            </button>
                            <button
                              type="button"
                              title="Cancel"
                              onClick={() => setEditingId(null)}
                              className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </>
                        ) : (
                          <>
                            {/* Edit amount / total payable — admins and managers */}
                            <button
                              type="button"
                              title="Edit amount"
                              onClick={() => {
                                setEditingId(ed.id);
                                setEditAmount(ed.amount != null ? String(toNum(ed.amount)) : String(toNum(ed.deduction.amount)));
                                setEditTotalBalance(ed.totalBalance != null ? String(toNum(ed.totalBalance)) : "");
                              }}
                              className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
                            >
                              <Pencil className="h-3 w-3" />
                            </button>
                            {/* Reset paid amount — admin only */}
                            {isAdmin && isSettled && (
                              <button
                                type="button"
                                title="Reset paid amount"
                                onClick={() => resetPaidMutation.mutate(ed.id)}
                                disabled={resetPaidMutation.isPending}
                                className="rounded px-1.5 py-0.5 text-[10px] text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors disabled:opacity-50"
                              >
                                Reset
                              </button>
                            )}
                            {/* Remove — admin only */}
                            {isAdmin && (
                              <button
                                type="button"
                                onClick={() => removeMutation.mutate(ed.id)}
                                disabled={removeMutation.isPending}
                                className="rounded p-1 text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-50"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}

              {/* Inline add row */}
              {showAddRow && (
                <tr className="border-t bg-gray-50/50">
                  <td className="px-2 py-2">
                    <select
                      value={selectedDeductionId}
                      onChange={(e) => {
                        const id = e.target.value;
                        setSelectedDeductionId(id);
                        const deduction = availableDeductions.find((d) => d.id === id);
                        if (deduction) setAmountInput(String(Number(deduction.amount)));
                      }}
                      className="w-full rounded border border-gray-200 bg-white px-2 py-1.5 text-xs focus:outline-none focus:border-red-400"
                      autoFocus
                    >
                      <option value="" disabled>— select —</option>
                      {availableDeductions.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                      {availableDeductions.length === 0 && (
                        <option disabled>All deductions assigned</option>
                      )}
                    </select>
                  </td>
                  <td className="px-2 py-2">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder=""
                      value={amountInput}
                      onChange={(e) => setAmountInput(e.target.value)}
                      className="w-full rounded border border-gray-200 bg-white px-2 py-1.5 text-right text-xs tabular-nums focus:outline-none focus:border-red-400"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder=""
                      value={totalBalanceInput}
                      onChange={(e) => setTotalBalanceInput(e.target.value)}
                      className="w-full rounded border border-gray-200 bg-white px-2 py-1.5 text-right text-xs tabular-nums focus:outline-none focus:border-red-400"
                    />
                  </td>
                  <td className="px-3 py-2 text-right text-xs tabular-nums text-gray-400">—</td>
                  <td className="px-3 py-2 text-right text-xs tabular-nums text-gray-400">—</td>
                  <td className="px-2 py-2">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={resetAddForm}
                        className="rounded px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 transition-colors"
                      >
                        Cancel
                      </button>
                      <Button
                        type="button"
                        size="sm"
                        disabled={!selectedDeductionId || addMutation.isPending}
                        onClick={() => isOnline ? addMutation.mutate() : handleAddOffline()}
                        className="h-6 px-2 text-xs"
                      >
                        {addMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Add"}
                      </Button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
