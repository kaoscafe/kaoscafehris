import { useEffect, useMemo, useState } from "react";
import { format, endOfMonth } from "date-fns";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { extractErrorMessage } from "@/lib/api";
import { listEmployees, updateEmployee } from "@/features/employees/employees.api";
import { listShiftTypes } from "./shift-types.api";

function toHHMM(value: string): string {
  const d = new Date(value);
  const h = d.getUTCHours();
  const m = d.getUTCMinutes();
  const period = h < 12 ? "AM" : "PM";
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}
import { generateShifts } from "./generate-shifts.api";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  branchId: string;
}

export default function EmployeeDefaultShiftsDialog({ open, onOpenChange, branchId }: Props) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>("");
  const [selectedShiftTypeId, setSelectedShiftTypeId] = useState<string>("");

  const employeesQuery = useQuery({
    queryKey: ["employees", { branchId }],
    queryFn: () => listEmployees({ branchId }),
    enabled: open && !!branchId,
    select: (data) => data.filter((e) => e.employmentStatus !== "TERMINATED" && e.position !== "Administrator"),
  });

  const shiftTypesQuery = useQuery({
    queryKey: ["shift-types", branchId],
    queryFn: () => listShiftTypes(branchId),
    enabled: open && !!branchId,
  });

  const mutation = useMutation({
    mutationFn: async () => {
      await updateEmployee(selectedEmployeeId, {
        defaultShiftTypeId: selectedShiftTypeId || null,
      });
      if (selectedShiftTypeId && branchId) {
        const today = new Date();
        await generateShifts({
          branchId,
          startDate: format(today, "yyyy-MM-dd"),
          endDate: format(endOfMonth(today), "yyyy-MM-dd"),
          excludeWeekendsAndHolidays: true,
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({
        predicate: (query) => Array.isArray(query.queryKey) && query.queryKey[0] === "employees",
      });
      qc.invalidateQueries({ queryKey: ["shifts"] });
      toast("Default shift saved and shifts generated", "success");
      setSelectedEmployeeId("");
      setSelectedShiftTypeId("");
    },
    onError: (err) => toast(extractErrorMessage(err), "error"),
  });

  const selectedEmployee = useMemo(() => {
    if (!selectedEmployeeId) return null;
    return employeesQuery.data?.find((e) => e.id === selectedEmployeeId);
  }, [selectedEmployeeId, employeesQuery.data]);

  useEffect(() => {
    if (selectedEmployee) {
      setSelectedShiftTypeId(selectedEmployee.defaultShiftTypeId || "");
    }
  }, [selectedEmployee]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedEmployeeId) {
      toast("Please select an employee", "error");
      return;
    }
    mutation.mutate();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        <DialogTitle>Employee Default Shifts</DialogTitle>
        <DialogDescription>
          Set the default shift for each active employee. This shift will be used when generating shifts automatically.
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={handleSubmit} className="space-y-4 pt-4" noValidate>
        <div className="space-y-2">
          <Label htmlFor="employee-select">Select Employee</Label>
          <Select
            id="employee-select"
            value={selectedEmployeeId}
            onChange={(e) => setSelectedEmployeeId(e.target.value)}
          >
            <option value="">-- Choose employee --</option>
            {employeesQuery.isLoading ? (
              <option disabled>Loading...</option>
            ) : (
              employeesQuery.data?.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.firstName} {emp.lastName} ({emp.employeeId})
                </option>
              ))
            )}
          </Select>
        </div>

        {selectedEmployee && (
          <div className="rounded-lg bg-blue-50 p-3 text-sm text-blue-900">
            <div className="font-medium">{selectedEmployee.firstName} {selectedEmployee.lastName}</div>
            <div className="text-xs mt-1">
              Current default shift: {selectedEmployee.defaultShiftTypeId ? "Set" : "None"}
            </div>
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="shift-select">Default Shift</Label>
          <Select
            id="shift-select"
            value={selectedShiftTypeId}
            onChange={(e) => setSelectedShiftTypeId(e.target.value)}
            disabled={!selectedEmployeeId}
          >
            <option value="">-- No default shift --</option>
            {shiftTypesQuery.data?.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({toHHMM(t.startTime)} - {toHHMM(t.endTime)})
              </option>
            ))}
          </Select>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={mutation.isPending}
          >
            Close
          </Button>
          <Button type="submit" disabled={mutation.isPending || !selectedEmployeeId}>
            {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Save Default Shift
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
