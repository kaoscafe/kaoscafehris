import { z } from "zod";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD");

const isoDateTime = z.string().datetime({ offset: true, message: "Must be an ISO datetime" });

export const clockInSchema = z.object({
  employeeId: z.string().uuid(),
  clockIn: isoDateTime.optional(), // defaults to now if omitted
  selfieIn: z.string().url().optional(),
  clockInNote: z.string().max(500).optional(),
  deviceId: z.string().max(80).optional(),
  localRecordId: z.string().max(120).optional(),
});

export const clockOutSchema = z.object({
  clockOut: isoDateTime.optional(),
  selfieOut: z.string().url().optional(),
  clockOutNote: z.string().max(500).optional(),
});

export const manualAdjustSchema = z.object({
  clockIn: isoDateTime.optional(),
  clockOut: isoDateTime.nullable().optional(),
  status: z.enum(["PRESENT", "LATE", "ABSENT", "HALF_DAY", "ON_LEAVE"]).optional(),
  remarks: z.string().max(500).nullable().optional(),
  hoursWorked: z.number().min(0).max(24).nullable().optional(),
  overtimeHours: z.number().min(0).max(24).nullable().optional(),
  lateMinutes: z.number().int().min(0).nullable().optional(),
  undertimeMinutes: z.number().int().min(0).nullable().optional(),
});

export const listAttendanceQuerySchema = z
  .object({
    branchId: z.string().uuid().optional(),
    employeeId: z.string().uuid().optional(),
    date: isoDate.optional(),
    startDate: isoDate.optional(),
    endDate: isoDate.optional(),
    status: z.enum(["PRESENT", "LATE", "ABSENT", "HALF_DAY", "ON_LEAVE"]).optional(),
  })
  .refine(
    (v) => !(v.date && (v.startDate || v.endDate)),
    { message: "Use either `date` or a range (startDate/endDate), not both" }
  );

// Offline sync bulk upsert — client sends its queued records
export const syncRecordSchema = z.object({
  employeeId: z.string().uuid(),
  clockIn: isoDateTime,
  clockOut: isoDateTime.nullable().optional(),
  selfieIn: z.string().url().optional(),
  selfieOut: z.string().url().optional(),
  deviceId: z.string().max(80).optional(),
  localRecordId: z.string().max(120), // required for dedup
});

export const syncBatchSchema = z.object({
  records: z.array(syncRecordSchema).min(1).max(200),
});

export const manualCreateSchema = z.object({
  employeeId: z.string().uuid(),
  clockIn: isoDateTime,
  clockOut: isoDateTime.nullable().optional(),
  remarks: z.string().max(500).nullable().optional(),
  shiftTypeId: z.string().uuid("A shift type must be selected"),
});

export type ClockInInput = z.infer<typeof clockInSchema>;
export type ClockOutInput = z.infer<typeof clockOutSchema>;
export type ManualAdjustInput = z.infer<typeof manualAdjustSchema>;
export type ManualCreateInput = z.infer<typeof manualCreateSchema>;
export type ListAttendanceQuery = z.infer<typeof listAttendanceQuerySchema>;
export type SyncBatchInput = z.infer<typeof syncBatchSchema>;
