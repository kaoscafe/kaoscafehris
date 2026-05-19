import api from "@/lib/api";

export type AttendanceStatus = "PRESENT" | "LATE" | "ABSENT" | "HALF_DAY" | "ON_LEAVE";
export type SyncStatus = "PENDING" | "SYNCED" | "FAILED";
export type AttendanceSource = "KIOSK" | "MANUAL" | "AUTO";

export interface AttendanceRecord {
  id: string;
  employeeId: string;
  branchId: string;
  date: string;
  clockIn: string;
  clockOut: string | null;
  status: AttendanceStatus;
  hoursWorked: string | null;
  overtimeHours: string | null;
  lateMinutes: number | null;
  undertimeMinutes: number | null;
  remarks: string | null;
  clockInNote: string | null;
  clockOutNote: string | null;
  selfieIn: string | null;
  selfieOut: string | null;
  deviceId: string | null;
  localRecordId: string | null;
  source: AttendanceSource;
  syncStatus: SyncStatus;
  createdAt: string;
  updatedAt: string;
  employee: {
    id: string;
    employeeId: string;
    firstName: string;
    lastName: string;
    position: string;
  };
  branch: { id: string; name: string };
  hasShift: boolean;
  shiftName: string | null;
}

export interface AdjustAttendanceInput {
  clockIn?: string;
  clockOut?: string | null;
  status?: AttendanceStatus;
  remarks?: string | null;
  hoursWorked?: number | null;
  overtimeHours?: number | null;
  lateMinutes?: number | null;
  undertimeMinutes?: number | null;
}

export interface ManualCreateInput {
  employeeId: string;
  clockIn: string; // ISO datetime
  clockOut?: string | null;
  remarks?: string | null;
  shiftTypeId: string;
}

export interface ListAttendanceParams {
  branchId?: string;
  employeeId?: string;
  date?: string;
  startDate?: string;
  endDate?: string;
  status?: AttendanceStatus;
}

export async function listAttendance(
  params: ListAttendanceParams = {}
): Promise<AttendanceRecord[]> {
  const query: Record<string, string> = {};
  if (params.branchId) query.branchId = params.branchId;
  if (params.employeeId) query.employeeId = params.employeeId;
  if (params.date) query.date = params.date;
  if (params.startDate) query.startDate = params.startDate;
  if (params.endDate) query.endDate = params.endDate;
  if (params.status) query.status = params.status;
  const { data } = await api.get<{ data: AttendanceRecord[] }>("/attendance", {
    params: query,
  });
  return data.data;
}

export async function adjustAttendance(
  id: string,
  input: AdjustAttendanceInput
): Promise<AttendanceRecord> {
  const { data } = await api.put<{ data: AttendanceRecord }>(
    `/attendance/${id}`,
    input
  );
  return data.data;
}

export async function createAttendance(input: ManualCreateInput): Promise<AttendanceRecord> {
  const { data } = await api.post<{ data: AttendanceRecord }>("/attendance/manual", input);
  return data.data;
}

export async function deleteAttendance(id: string): Promise<void> {
  await api.delete(`/attendance/${id}`);
}

export interface AssignedShift {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  overtimeApproved: boolean;
  overtimeRejected: boolean;
}

export async function getAssignedShift(
  employeeId: string,
  date: string
): Promise<AssignedShift | null> {
  const { data } = await api.get<{ data: AssignedShift | null }>("/attendance/assigned-shift", {
    params: { employeeId, date },
  });
  return data.data;
}

export function formatClockTime(iso: string | null, timeZone = "Asia/Manila"): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone,
  });
}
