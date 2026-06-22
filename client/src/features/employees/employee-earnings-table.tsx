import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { extractErrorMessage } from "@/lib/api";
import { useAuthStore } from "@/features/auth/auth.store";
import {
  listEmployeeEarnings,
  addEmployeeEarning,
  removeEmployeeEarning,
  PROFILE_EARNING_TYPES,
  type ProfileEarningType,
} from "./employee-earnings.api";

const BRAND = "#8C1515";

function fmt(n: number) {
  return `₱${n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export interface PendingEarning {
  type: ProfileEarningType;
  label: string;
  amount: number;
}

interface Props {
  employeeId?: string;
  pendingEarnings?: PendingEarning[];
  onPendingChange?: (earnings: PendingEarning[]) => void;
}

export default function EmployeeEarningsTable({ employeeId, pendingEarnings, onPendingChange }: Props) {
  const isOnline = !!employeeId;
  // Recurring earnings are admin-managed; managers have read-only access.
  const canManage = useAuthStore((s) => s.user?.role) === "ADMIN";

  const qc = useQueryClient();
  const { toast } = useToast();

  const [showAddRow, setShowAddRow] = useState(false);
  const [selectedType, setSelectedType] = useState<ProfileEarningType>("ALLOWANCE");
  const [labelInput, setLabelInput] = useState("");
  const [amountInput, setAmountInput] = useState("");

  const empEarningsQuery = useQuery({
    queryKey: ["employee-earnings", employeeId],
    queryFn: () => listEmployeeEarnings(employeeId!),
    enabled: isOnline,
  });

  const onlineRows = empEarningsQuery.data ?? [];
  const offlineRows = pendingEarnings ?? [];

  function resetAddForm() {
    setSelectedType("ALLOWANCE");
    setLabelInput("");
    setAmountInput("");
    setShowAddRow(false);
  }

  function handleAddOffline() {
    if (!labelInput.trim() || !amountInput) return;
    const newItem: PendingEarning = {
      type: selectedType,
      label: labelInput.trim(),
      amount: parseFloat(amountInput),
    };
    onPendingChange?.([...offlineRows, newItem]);
    resetAddForm();
  }

  const addMutation = useMutation({
    mutationFn: () =>
      addEmployeeEarning(employeeId!, {
        type: selectedType,
        label: labelInput.trim(),
        amount: parseFloat(amountInput),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employee-earnings", employeeId] });
      toast("Earning assigned", "success");
      resetAddForm();
    },
    onError: (err) => toast(extractErrorMessage(err), "error"),
  });

  const removeMutation = useMutation({
    mutationFn: (eeId: string) => removeEmployeeEarning(employeeId!, eeId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employee-earnings", employeeId] });
      toast("Earning removed", "success");
    },
    onError: (err) => toast(extractErrorMessage(err), "error"),
  });

  const isLoading = isOnline && empEarningsQuery.isLoading;
  const noRows = isOnline ? onlineRows.length === 0 : offlineRows.length === 0;
  const canAdd = !labelInput.trim() || !amountInput || isNaN(parseFloat(amountInput));

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-bold uppercase tracking-widest" style={{ color: BRAND }}>
          Recurring Earnings
        </h3>
        {canManage && !showAddRow && (
          <button
            type="button"
            onClick={() => setShowAddRow(true)}
            className="flex items-center gap-1 text-xs font-medium rounded-md px-2 py-1 border border-gray-200 hover:bg-gray-50 transition-colors"
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
                <th className="px-3 py-2 text-left font-semibold uppercase tracking-wider text-gray-400">Type</th>
                <th className="px-3 py-2 text-left font-semibold uppercase tracking-wider text-gray-400">Label</th>
                <th className="px-3 py-2 text-right font-semibold uppercase tracking-wider text-gray-400">Amount</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {noRows && !showAddRow && (
                <tr>
                  <td colSpan={4} className="py-5 text-center text-xs text-gray-400 italic">
                    No recurring earnings assigned yet.
                  </td>
                </tr>
              )}

              {/* Offline rows (add mode) */}
              {!isOnline && offlineRows.map((e, i) => (
                <tr key={i} className="border-b last:border-b-0 hover:bg-gray-50">
                  <td className="px-3 py-2.5 text-gray-500 capitalize">
                    {PROFILE_EARNING_TYPES.find((t) => t.value === e.type)?.label ?? e.type}
                  </td>
                  <td className="px-3 py-2.5 font-medium text-gray-800">{e.label}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{fmt(e.amount)}</td>
                  <td className="px-2 py-2.5">
                    {canManage && (
                      <button
                        type="button"
                        onClick={() => onPendingChange?.(offlineRows.filter((_, idx) => idx !== i))}
                        className="rounded p-1 text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}

              {/* Online rows (edit mode) */}
              {isOnline && onlineRows.map((ee) => (
                <tr key={ee.id} className="border-b last:border-b-0 hover:bg-gray-50">
                  <td className="px-3 py-2.5 text-gray-500">
                    {PROFILE_EARNING_TYPES.find((t) => t.value === ee.type)?.label ?? ee.type}
                  </td>
                  <td className="px-3 py-2.5 font-medium text-gray-800">{ee.label}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{fmt(Number(ee.amount))}</td>
                  <td className="px-2 py-2.5">
                    {canManage && (
                      <button
                        type="button"
                        onClick={() => removeMutation.mutate(ee.id)}
                        disabled={removeMutation.isPending}
                        className="rounded p-1 text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-50"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}

              {/* Inline add row */}
              {showAddRow && (
                <tr className="border-t bg-gray-50/50">
                  <td className="px-2 py-2">
                    <select
                      value={selectedType}
                      onChange={(e) => setSelectedType(e.target.value as ProfileEarningType)}
                      className="w-full rounded border border-gray-200 bg-white px-2 py-1.5 text-xs focus:outline-none focus:border-red-400"
                    >
                      {PROFILE_EARNING_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-2 py-2">
                    <input
                      type="text"
                      placeholder="e.g. Transportation Allowance"
                      value={labelInput}
                      onChange={(e) => setLabelInput(e.target.value)}
                      autoFocus
                      className="w-full rounded border border-gray-200 bg-white px-2 py-1.5 text-xs focus:outline-none focus:border-red-400"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      value={amountInput}
                      onChange={(e) => setAmountInput(e.target.value)}
                      className="w-full rounded border border-gray-200 bg-white px-2 py-1.5 text-right text-xs tabular-nums focus:outline-none focus:border-red-400"
                    />
                  </td>
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
                        disabled={canAdd || addMutation.isPending}
                        onClick={() => (isOnline ? addMutation.mutate() : handleAddOffline())}
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
