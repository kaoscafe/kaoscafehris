import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { extractErrorMessage } from "@/lib/api";
import { formatCurrency, getPayslip, type PayslipDetail } from "./payroll.api";

const BRAND = "#8C1515";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payslipId: string | null;
}

function fmtShort(iso: string): string {
  const d = new Date(iso.slice(0, 10) + "T00:00:00");
  return `${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear()).slice(-2)}`;
}

function fmtEmploymentStatus(s: string): string {
  const map: Record<string, string> = {
    FULL_TIME: "Full Time",
    PART_TIME: "Part Time",
    TRAINEE: "Trainee",
    RESERVED: "Reserved",
    TERMINATED: "Terminated",
  };
  return map[s] ?? s;
}

export function PayslipPreview({ data }: { data: PayslipDetail }) {
  const isHourly = data.employee.payType === "HOURLY";
  const dailyRate = isHourly
    ? Number(data.employee.hourlyRate ?? 0) * 8
    : Math.round((Number(data.employee.basicSalary) / 26) * 100) / 100;
  const hourlyRate = dailyRate / 8;
  const monthlyRate = Number(data.employee.basicSalary);

  const lateMinutesFromLabel = (label: string): number => {
    const m = label.match(/(\d+) min/);
    return m ? Number(m[1]) : 0;
  };

  const holidayHoursFromLabel = (label: string): string => {
    const m = label.match(/× (\d+\.?\d*) hrs/);
    return m ? m[1] : "";
  };

  const toHours = (amount: string | number): string => {
    const n = Number(amount);
    if (!Number.isFinite(n) || n === 0 || hourlyRate <= 0) return "";
    return (n / hourlyRate).toFixed(2);
  };

  const periodEnd = new Date(data.payrollRun.periodEnd.slice(0, 10) + "T00:00:00");
  const payDate =
    periodEnd.getDate() <= 15
      ? new Date(periodEnd.getFullYear(), periodEnd.getMonth(), 15)
      : new Date(periodEnd.getFullYear(), periodEnd.getMonth() + 1, 0);
  const payDateStr = `${payDate.getMonth() + 1}/${payDate.getDate()}/${String(payDate.getFullYear()).slice(-2)}`;

  const branch = data.payrollRun.branch;

  return (
    <div className="rounded-xl overflow-hidden border border-gray-200 bg-white">
      {/* Header */}
      <div className="border-b border-gray-200 py-4 px-4 text-center">
        <img src="/kaos-logo.svg" alt="KAOS" className="h-9 w-auto mx-auto mb-2" />
        <p className="text-base font-bold text-gray-900">Payslip</p>
        <p className="text-xs font-bold" style={{ color: BRAND }}>KAOS Cafe</p>
        {branch.address && (
          <p className="text-[10px] text-gray-400 mt-1 leading-tight">{branch.address}</p>
        )}
        <p className="text-[10px] text-gray-400 leading-tight">{branch.city}</p>
      </div>

      {/* Employee Info */}
      <div className="px-4 py-3 border-b border-gray-100">
        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
          <div>
            <span className="text-gray-500">Employee name: </span>
            <span className="font-semibold text-gray-800">
              {data.employee.firstName} {data.employee.lastName}
            </span>
          </div>
          <div>
            <span className="text-gray-500">Pay period: </span>
            <span className="font-semibold text-gray-800">
              {fmtShort(data.payrollRun.periodStart)} - {fmtShort(data.payrollRun.periodEnd)}
            </span>
          </div>
          <div>
            <span className="text-gray-500">Employment status: </span>
            <span className="font-semibold" style={{ color: BRAND }}>
              {fmtEmploymentStatus(data.employee.employmentStatus)}
            </span>
          </div>
          <div>
            <span className="text-gray-500">Pay date: </span>
            <span className="font-semibold text-gray-800">{payDateStr}</span>
          </div>
        </div>
        <div className="mt-1.5 text-xs">
          {isHourly ? (
            <>
              <span className="text-gray-500">Daily rate: </span>
              <span className="font-semibold text-gray-800">{formatCurrency(dailyRate)}</span>
            </>
          ) : (
            <>
              <span className="text-gray-500">Monthly rate: </span>
              <span className="font-semibold text-gray-800">{formatCurrency(monthlyRate)}</span>
            </>
          )}
        </div>
        <div className="mt-1.5 text-xs flex gap-4">
          <span><span className="text-gray-500">Actual Worked Hours: </span><span className="font-semibold text-gray-800">{Number(data.totalHoursWorked).toFixed(2)} hrs</span></span>
        </div>
      </div>

      {/* Entitlements */}
      <table className="w-full text-xs">
        <thead>
          <tr style={{ backgroundColor: BRAND }}>
            <th colSpan={3} className="text-left text-white font-semibold py-1.5 px-3 text-[10px] uppercase tracking-wider">
              Entitlements
            </th>
          </tr>
          <tr className="bg-gray-100">
            <th className="text-left py-1.5 px-3 font-medium text-gray-500 text-[10px]">Description</th>
            <th className="text-center py-1.5 px-2 font-medium text-gray-500 text-[10px]">Hours / units</th>
            <th className="text-right py-1.5 px-3 font-medium text-gray-500 text-[10px]">Total</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-t border-gray-100">
            <td className="py-1.5 px-3 text-gray-700">Regular Hours</td>
            <td className="py-1.5 px-2 text-center text-gray-600">{toHours(data.basicPay)}</td>
            <td className="py-1.5 px-3 text-right tabular-nums font-medium text-green-600">
              {formatCurrency(data.basicPay)}
            </td>
          </tr>
          {data.earnings.map((e) => (
            <tr key={e.id} className="border-t border-gray-100">
              <td className="py-1.5 px-3 text-gray-700">{e.label}</td>
              <td className="py-1.5 px-2 text-center text-gray-600">
                {e.type === "OVERTIME" ? toHours(e.amount) : e.type === "HOLIDAY_PAY" ? holidayHoursFromLabel(e.label) : ""}
              </td>
              <td className="py-1.5 px-3 text-right tabular-nums font-medium text-green-600">
                {formatCurrency(e.amount)}
              </td>
            </tr>
          ))}
          <tr className="border-t border-gray-200 bg-gray-50">
            <td className="py-1.5 px-3 font-bold text-gray-800">Total</td>
            <td />
            <td className="py-1.5 px-3 text-right tabular-nums font-bold text-green-700">
              {formatCurrency(data.grossPay)}
            </td>
          </tr>
        </tbody>
      </table>

      {/* Deductions */}
      <table className="w-full text-xs">
        <thead>
          <tr style={{ backgroundColor: BRAND }}>
            <th colSpan={3} className="text-left text-white font-semibold py-1.5 px-3 text-[10px] uppercase tracking-wider">
              Deductions
            </th>
          </tr>
          <tr className="bg-gray-100">
            <th className="text-left py-1.5 px-3 font-medium text-gray-500 text-[10px]">Description</th>
            <th className="text-center py-1.5 px-2 font-medium text-gray-500 text-[10px]">Hours / units</th>
            <th className="text-right py-1.5 px-3 font-medium text-gray-500 text-[10px]">Total</th>
          </tr>
        </thead>
        <tbody>
          {data.deductions.length === 0 ? (
            <tr>
              <td colSpan={3} className="py-3 text-center text-gray-400 italic text-xs">No deductions.</td>
            </tr>
          ) : (
            data.deductions.map((d) => (
              <tr key={d.id} className="border-t border-gray-100">
                <td className="py-1.5 px-3 text-gray-700">{d.label}</td>
                <td className="py-1.5 px-2 text-center text-gray-600">
                  {d.type === "LATE" ? (lateMinutesFromLabel(d.label) / 60).toFixed(2) : ""}
                </td>
                <td className="py-1.5 px-3 text-right tabular-nums font-medium text-red-600">
                  {formatCurrency(d.amount)}
                </td>
              </tr>
            ))
          )}
          <tr className="border-t border-gray-200 bg-gray-50">
            <td className="py-1.5 px-3 font-bold text-gray-800">Total</td>
            <td />
            <td className="py-1.5 px-3 text-right tabular-nums font-bold text-red-600">
              {formatCurrency(data.totalDeductions)}
            </td>
          </tr>
        </tbody>
      </table>

      {/* Net Pay */}
      <div className="flex items-center justify-between px-3 py-2.5 border-t border-gray-200">
        <span className="text-xs text-gray-500">Net pay</span>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-500">Total net pay:</span>
          <span className="text-base font-bold tabular-nums text-green-600">
            {formatCurrency(data.netPay)}
          </span>
        </div>
      </div>
    </div>
  );
}

export default function PayslipViewDialog({ open, onOpenChange, payslipId }: Props) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["payslip", payslipId],
    queryFn: () => getPayslip(payslipId!),
    enabled: open && !!payslipId,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : !data ? (
        <p className="py-10 text-center text-sm text-destructive">
          {extractErrorMessage(error, "Failed to load payslip")}
        </p>
      ) : (
        <div className="max-h-[70vh] overflow-y-auto">
          <PayslipPreview data={data} />
        </div>
      )}

      <DialogFooter className="mt-4">
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          Close
        </Button>
      </DialogFooter>
    </Dialog>
  );
}