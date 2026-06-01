import { z } from "zod";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD");

const time = z
  .string()
  .regex(/^\d{2}:\d{2}$/, "Time must be HH:MM (24h)");

export const assignEmployeeEntrySchema = z.object({
  employeeId: z.string().uuid(),
  assignedBranchId: z.string().uuid().optional(),
});

export const assignEmployeesSchema = z.object({
  employees: z.array(assignEmployeeEntrySchema).min(1, "Pick at least one employee"),
});

export const createShiftSchema = z
  .object({
    branchId: z.string().uuid(),
    shiftTypeId: z.string().uuid().optional(),
    name: z.string().trim().min(1).max(60),
    date: isoDate,
    startTime: time.optional(),
    endTime: time.optional(),
    status: z.enum(["DRAFT", "PUBLISHED"]).optional(),
    employees: z.array(assignEmployeeEntrySchema).optional().default([]),
  })
  .refine(
    (v) => {
      if (v.shiftTypeId) return true;
      return v.startTime && v.endTime && v.startTime !== v.endTime;
    },
    { message: "Either select a shift type or provide both start and end times", path: ["startTime"] }
  );

export const updateShiftSchema = z.object({
  branchId: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(60).optional(),
  date: isoDate.optional(),
  startTime: time.optional(),
  endTime: time.optional(),
  status: z.enum(["DRAFT", "PUBLISHED"]).optional(),
});

export const listShiftsQuerySchema = z.object({
  branchIds: z.string().optional(), // comma-separated UUIDs
  startDate: isoDate.optional(),
  endDate: isoDate.optional(),
  status: z.enum(["DRAFT", "PUBLISHED"]).optional(),
});

export type CreateShiftInput = z.infer<typeof createShiftSchema>;
export type UpdateShiftInput = z.infer<typeof updateShiftSchema>;
export type AssignEmployeeEntry = z.infer<typeof assignEmployeeEntrySchema>;
export type AssignEmployeesInput = z.infer<typeof assignEmployeesSchema>;
export type ListShiftsQuery = z.infer<typeof listShiftsQuerySchema>;
