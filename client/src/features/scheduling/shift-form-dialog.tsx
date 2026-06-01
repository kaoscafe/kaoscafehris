import { useEffect, useMemo } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { TimePicker } from "@/components/ui/time-picker";
import { useToast } from "@/components/ui/toast";
import { extractErrorMessage } from "@/lib/api";
import { listBranches } from "@/features/branches/branches.api";
import { listShiftTypes } from "./shift-types.api";
import {
  formatShiftTime,
  updateShift,
  type Shift,
} from "./scheduling.api";

const editSchema = z.object({
  branchId: z.string().uuid("Select a branch"),
  shiftTypeId: z.string().optional(),
  name: z.string().trim().min(1, "Required").max(60),
  date: z.string().min(1, "Required"),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, "HH:MM required"),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, "HH:MM required"),
});

type EditValues = z.infer<typeof editSchema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shift: Shift | null;
}

export default function ShiftFormDialog({ open, onOpenChange, shift }: Props) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const {
    register,
    control,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<EditValues>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      branchId: "",
      shiftTypeId: "",
      name: "",
      date: "",
      startTime: "08:00",
      endTime: "16:00",
    },
  });

  const branchesQuery = useQuery({
    queryKey: ["branches", { active: true }],
    queryFn: () => listBranches({ isActive: true }),
    enabled: open,
  });
  const branches = branchesQuery.data ?? [];

  const shiftTypesQuery = useQuery({
    queryKey: ["shift-types"],
    queryFn: () => listShiftTypes(),
    enabled: open,
  });
  const shiftTypes = shiftTypesQuery.data ?? [];

  const selectedShiftTypeId = watch("shiftTypeId");
  const selectedShiftType = useMemo(
    () => shiftTypes.find((type) => type.id === selectedShiftTypeId),
    [shiftTypes, selectedShiftTypeId]
  );

  useEffect(() => {
    if (!open || !shift) return;
    reset({
      branchId: shift.branchId,
      shiftTypeId: shift.shiftTypeId ?? "",
      name: shift.name,
      date: shift.date.slice(0, 10),
      startTime: formatShiftTime(shift.startTime),
      endTime: formatShiftTime(shift.endTime),
    });
  }, [open, shift, reset]);

  useEffect(() => {
    if (!open || !selectedShiftType) return;
    setValue("name", selectedShiftType.name, { shouldDirty: true });
    setValue("startTime", formatShiftTime(selectedShiftType.startTime), { shouldDirty: true });
    setValue("endTime", formatShiftTime(selectedShiftType.endTime), { shouldDirty: true });
  }, [open, selectedShiftType, setValue]);

  const mutation = useMutation({
    mutationFn: async (values: EditValues) => {
      if (!shift) throw new Error("No shift to update");
      return updateShift(shift.id, {
        branchId: values.branchId,
        name: values.name,
        date: values.date,
        startTime: values.startTime,
        endTime: values.endTime,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shifts"] });
      toast("Shift updated", "success");
      onOpenChange(false);
    },
    onError: (err) => toast(extractErrorMessage(err), "error"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        <DialogTitle>Edit shift</DialogTitle>
        <DialogDescription>
          Update shift details. Use the Assign button to change employee assignments.
        </DialogDescription>
      </DialogHeader>

      <form
        onSubmit={handleSubmit((v) => mutation.mutate(v))}
        className="space-y-4 pt-4"
        noValidate
      >
        <div className="rounded-md border border-border bg-muted/40 px-4 py-3 text-sm text-foreground">
          <div className="grid gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Assigned employee
                </p>
                <p className="text-base font-medium text-foreground">
                  {shift?.assignments.length ? `${shift.assignments[0].employee.firstName} ${shift.assignments[0].employee.lastName}` : "—"}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Current branch
                </p>
                <p>{shift?.branch.name}</p>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Shift name
                </p>
                <p className="text-base font-medium text-foreground">
                  {shift?.name} {shift ? `(${formatShiftTime(shift.startTime)} - ${formatShiftTime(shift.endTime)})` : ""}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Date
                </p>
                <p>{shift?.date.slice(0, 10)}</p>
              </div>
            </div>
          </div>
          {shift?.assignments.length ? (
            <div className="mt-2 text-sm text-foreground">
              <p className="font-medium">Assigned employee</p>
              <div className="mt-1 space-y-1 text-xs text-muted-foreground">
                {shift.assignments.slice(0, 5).map((assignment) => (
                  <div key={assignment.id}>
                    {assignment.employee.firstName} {assignment.employee.lastName}
                  </div>
                ))}
                {shift.assignments.length > 5 && (
                  <div>+{shift.assignments.length - 5} more</div>
                )}
              </div>
            </div>
          ) : (
            <div className="mt-3 text-xs text-muted-foreground">No employees currently assigned.</div>
          )}
        </div>

        <div className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="branchId">Branch</Label>
              <Select id="branchId" {...register("branchId")}>
                <option value="">Select branch…</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </Select>
              {errors.branchId && (
                <p className="text-xs text-destructive">{errors.branchId.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="date">Date</Label>
              <Input id="date" type="date" {...register("date")} />
              {errors.date && (
                <p className="text-xs text-destructive">{errors.date.message}</p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="shiftTypeId">Shift name</Label>
            <Select id="shiftTypeId" {...register("shiftTypeId")}> 
              <option value="">Select shift template…</option>
              {shiftTypes.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name} ({formatShiftTime(type.startTime)} - {formatShiftTime(type.endTime)})
                </option>
              ))}
            </Select>
            {errors.shiftTypeId && (
              <p className="text-xs text-destructive">{errors.shiftTypeId.message}</p>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="startTime">Start time</Label>
              <Controller
                name="startTime"
                control={control}
                render={({ field }) => (
                  <TimePicker id="startTime" value={field.value} onChange={field.onChange} />
                )}
              />
              {errors.startTime && (
                <p className="text-xs text-destructive">{errors.startTime.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="endTime">End time</Label>
              <Controller
                name="endTime"
                control={control}
                render={({ field }) => (
                  <TimePicker id="endTime" value={field.value} onChange={field.onChange} />
                )}
              />
              {errors.endTime && (
                <p className="text-xs text-destructive">{errors.endTime.message}</p>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={mutation.isPending}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Save changes
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
