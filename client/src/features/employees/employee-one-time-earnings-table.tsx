import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { extractErrorMessage } from "@/lib/api";
import {
  listEmployeeOneTimeEarnings,
  addEmployeeOneTimeEarning,
  removeEmployeeOneTimeEarning,
  PROFILE_ONE_TIME_EARNING_TYPES,
  type ProfileEarningType,
} from "./employee-one-time-earnings.api";

const BRAND = "#8C1515";

function fmt(n: number) {
  return `₱${n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}

export interface PendingOneTimeEarning {
  type: ProfileEarningType;
  label: string;
  amount: number;
  effectiveDate: string;
}

interface Props {
  employeeId?: string;
  pendingOneTimeEarnings?: PendingOneTimeEarning[];
  onPendingChange?: (earnings: PendingOneTimeEarning[]) => void;
}

export default function EmployeeOneTimeEarningsTable({
  employeeId,
  pendingOneTimeEarnings,
  onPendingChange,
}: Props) {
  const isOnline = !!employeeId;

  const qc = useQueryClient();
  const { toast } = useToast();

  const [showAddRow, setShowAddRow] = useState(false);
  const [selectedType, setSelectedType] = useState<ProfileEarningType>("ALLOWANCE");
  const [labelInput, setLabelInput] = useState("");
  const [amountInput, setAmountInput] = useState("");
  const [dateInput, setDateInput] = useState("");

  const oteQuery = useQuery({
    queryKey: ["employee-one-time-earnings", employeeId],
    queryFn: () => listEmployeeOneTimeEarnings(employeeId!),
    enabled: isOnline,
  });

  const onlineRows = oteQuery.data ?? [];
  const offlineRows = pendingOneTimeEarnings ?? [];

  function resetAddForm() {
    setSelectedType("ALLOWANCE");
    setLabelInput("");
    setAmountInput("");
    setDateInput("");
    setShowAddRow(false);
  }

  function handleAddOffline() {
    if (!labelInput.trim() || !amountInput) return;
    const newItem: PendingOneTimeEarning = {
      type: selectedType,
      label: labelInput.trim(),
      amount: parseFloat(amountInput),
      effectiveDate: dateInput,
    };
    onPendingChange?.([...offlineRows, newItem]);
    resetAddForm();
  }

  const addMutation = useMutation({
    mutationFn: () =>
      addEmployeeOneTimeEarning(employeeId!, {
        type: selectedType,
        label: labelInput.trim(),
        amount: parseFloat(amountInput),
        effectiveDate: dateInput,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employee-one-time-earnings", employeeId] });
      toast("One-time earning assigned", "success");
      resetAddForm();
    },
    onError: (err) => toast(extractErrorMessage(err), "error"),
  });

  const removeMutation = useMutation({
    mutationFn: (oteId: string) => removeEmployeeOneTimeEarning(employeeId!, oteId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employee-one-time-earnings", employeeId] });
      toast("One-time earning removed", "success");
    },
    onError: (err) => toast(extractErrorMessage(err), "error"),
  });

  const isLoading = isOnline && oteQuery.isLoading;
  const noRows = isOnline ? onlineRows.length === 0 : offlineRows.length === 0;
  const canAdd = !labelInput.trim() || !amountInput || isNaN(parseFloat(amountInput)) || !dateInput;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-bold uppercase tracking-widest" style={{ color: BRAND }}>
          One-Time Earnings
        </h3>
        {!showAddRow && (
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
                <th className="px-3 py-2 text-center font-semibold uppercase tracking-wider text-gray-400">Credit on</th>
                <th className="w-16 px-2 py-2 text-center font-semibold uppercase tracking-wider text-gray-400">Status</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {noRows && !showAddRow && (
                <tr>
                  <td colSpan={6} className="py-5 text-center text-xs text-gray-400 italic">
                    No one-time earnings assigned yet.
                  </td>
                </tr>
              )}

              {/* Offline rows (add mode) */}
              {!isOnline &&
                offlineRows.map((e, i) => (
                  <tr key={i} className="border-b last:border-b-0 hover:bg-gray-50">
                    <td className="px-3 py-2.5 text-gray-500 capitalize">
                      {PROFILE_ONE_TIME_EARNING_TYPES.find((t) => t.value === e.type)?.label ?? e.type}
                    </td>
                    <td className="px-3 py-2.5 font-medium text-gray-800">{e.label}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{fmt(e.amount)}</td>
                    <td className="px-3 py-2.5 text-center text-gray-500">{fmtDate(e.effectiveDate)}</td>
                    <td className="px-2 py-2.5 text-center">
                      <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-50 text-green-600">
                        Pending
                      </span>
                    </td>
                    <td className="px-2 py-2.5">
                      <button
                        type="button"
                        onClick={() => onPendingChange?.(offlineRows.filter((_, idx) => idx !== i))}
                        className="rounded p-1 text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </td>
                  </tr>
                ))}

              {/* Online rows (edit mode) */}
              {isOnline &&
                onlineRows.map((ote) => (
                  <tr key={ote.id} className="border-b last:border-b-0 hover:bg-gray-50">
                    <td className="px-3 py-2.5 text-gray-500">
                      {PROFILE_ONE_TIME_EARNING_TYPES.find((t) => t.value === ote.type)?.label ?? ote.type}
                    </td>
                    <td className="px-3 py-2.5 font-medium text-gray-800">{ote.label}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{fmt(Number(ote.amount))}</td>
                    <td className="px-3 py-2.5 text-center text-gray-500">{fmtDate(ote.effectiveDate)}</td>
                    <td className="px-2 py-2.5 text-center">
                      {ote.payrollRunId ? (
                        <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-400">
                          Consumed
                        </span>
                      ) : (
                        <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-50 text-green-600">
                          Pending
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-2.5">
                      {!ote.payrollRunId && (
                        <button
                          type="button"
                          onClick={() => removeMutation.mutate(ote.id)}
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
                      {PROFILE_ONE_TIME_EARNING_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-2 py-2">
                    <input
                      type="text"
                      placeholder="e.g. 13th Month Pay"
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
                    <input
                      type="date"
                      value={dateInput}
                      onChange={(e) => setDateInput(e.target.value)}
                      className="w-full rounded border border-gray-200 bg-white px-2 py-1.5 text-xs text-center focus:outline-none focus:border-red-400"
                    />
                  </td>
                  <td className="px-2 py-2" />
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
