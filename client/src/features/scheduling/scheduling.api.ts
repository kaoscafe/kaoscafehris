import api from "@/lib/api";

export type ShiftStatus = "DRAFT" | "PUBLISHED";

export interface ShiftAssignmentEmployee {
  id: string;
  employeeId: string;
  firstName: string;
  lastName: string;
  position: string;
}

export interface ShiftAssignment {
  id: string;
  shiftId: string;
  employeeId: string;
  assignedBranchId: string | null;
  assignedBranch: { id: string; name: string } | null;
  createdAt: string;
  employee: ShiftAssignmentEmployee;
}

export interface Shift {
  id: string;
  branchId: string;
  shiftTypeId?: string;
  name: string;
  date: string;
  startTime: string;
  endTime: string;
  status: ShiftStatus;
  createdAt: string;
  updatedAt: string;
  branch: { id: string; name: string };
  shiftType?: { id: string; name: string };
  assignments: ShiftAssignment[];
}

export interface ShiftCreateInput {
  branchId: string;
  shiftTypeId?: string;
  name: string;
  date: string;
  startTime?: string;
  endTime?: string;
  status?: ShiftStatus;
  employees?: AssignEmployeeEntry[];
}

export interface ShiftUpdateInput {
  branchId?: string;
  name?: string;
  date?: string;
  startTime?: string;
  endTime?: string;
  status?: ShiftStatus;
}

export interface ListShiftsParams {
  branchIds?: string[];
  startDate?: string;
  endDate?: string;
  status?: ShiftStatus;
}

function toClock(dt: string): string {
  const d = new Date(dt);
  const h = d.getUTCHours();
  const m = d.getUTCMinutes();
  const period = h < 12 ? "AM" : "PM";
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

function toDate(dt: string): string {
  return dt.slice(0, 10);
}

export function formatShiftTime(dt: string): string {
  return toClock(dt);
}

export function formatShiftDate(dt: string): string {
  return toDate(dt);
}

export async function listShifts(params: ListShiftsParams = {}): Promise<Shift[]> {
  const query: Record<string, string> = {};
  if (params.branchIds && params.branchIds.length > 0) query.branchIds = params.branchIds.join(",");
  if (params.startDate) query.startDate = params.startDate;
  if (params.endDate) query.endDate = params.endDate;
  if (params.status) query.status = params.status;
  const { data } = await api.get<{ data: Shift[] }>("/scheduling/shifts", {
    params: query,
  });
  return data.data;
}

export async function getShift(id: string): Promise<Shift> {
  const { data } = await api.get<{ data: Shift }>(`/scheduling/shifts/${id}`);
  return data.data;
}

export async function createShift(input: ShiftCreateInput): Promise<Shift> {
  const { data } = await api.post<{ data: Shift }>("/scheduling/shifts", input);
  return data.data;
}

export async function updateShift(
  id: string,
  input: ShiftUpdateInput
): Promise<Shift> {
  const { data } = await api.put<{ data: Shift }>(
    `/scheduling/shifts/${id}`,
    input
  );
  return data.data;
}

export async function deleteShift(id: string): Promise<void> {
  await api.delete(`/scheduling/shifts/${id}`);
}

export interface AssignEmployeeEntry {
  employeeId: string;
  assignedBranchId?: string;
}

export async function assignEmployees(
  shiftId: string,
  employees: AssignEmployeeEntry[]
): Promise<Shift> {
  const { data } = await api.post<{ data: Shift }>(
    `/scheduling/shifts/${shiftId}/assignments`,
    { employees }
  );
  return data.data;
}

export async function unassignEmployee(
  shiftId: string,
  employeeId: string
): Promise<Shift> {
  const { data } = await api.delete<{ data: Shift }>(
    `/scheduling/shifts/${shiftId}/assignments/${employeeId}`
  );
  return data.data;
}

export async function publishShift(id: string): Promise<Shift> {
  const { data } = await api.patch<{ data: Shift }>(
    `/scheduling/shifts/${id}/publish`
  );
  return data.data;
}
