import api from "@/lib/api";

export interface PortalBranch {
  id: string;
  name: string;
  city?: string;
}

export interface PortalEmployee {
  id: string;
  employeeId: string;
  firstName: string;
  lastName: string;
  middleName: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  civilStatus: string | null;
  nationality: string | null;
  profilePhoto: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  province: string | null;
  zipCode: string | null;
  emergencyName: string | null;
  emergencyPhone: string | null;
  emergencyRelation: string | null;
  position: string;
  employmentStatus: "FULL_TIME" | "PART_TIME" | "TRAINEE" | "RESERVED" | "TERMINATED";
  dateHired: string;
  basicSalary: string;
  sssNumber: string | null;
  philhealthNumber: string | null;
  pagibigNumber: string | null;
  tinNumber: string | null;
  branch: PortalBranch;
}

export interface PortalProfile {
  id: string;
  email: string;
  role: "ADMIN" | "MANAGER" | "EMPLOYEE";
  isActive: boolean;
  lastLogin: string | null;
  createdAt: string;
  employee: PortalEmployee | null;
}

export interface UpdateProfileInput {
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  province?: string;
  zipCode?: string;
  emergencyName?: string;
  emergencyPhone?: string;
  emergencyRelation?: string;
}

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

export interface PortalShift {
  assignmentId: string;
  shiftId: string;
  name: string;
  date: string;
  startTime: string;
  endTime: string;
  branch: PortalBranch;
}

export interface PortalAttendance {
  id: string;
  date: string;
  clockIn: string;
  clockOut: string | null;
  status: "PRESENT" | "LATE" | "ABSENT" | "HALF_DAY" | "ON_LEAVE";
  hoursWorked: string | null;
  overtimeHours: string | null;
  lateMinutes: number | null;
  undertimeMinutes: number | null;
  remarks: string | null;
  source: "KIOSK" | "MANUAL" | "AUTO";
  branch: PortalBranch;
}

export interface DateRange {
  startDate?: string;
  endDate?: string;
}

export async function getProfile(): Promise<PortalProfile> {
  const { data } = await api.get<{ data: PortalProfile }>("/portal/profile");
  return data.data;
}

export async function updateProfile(
  input: UpdateProfileInput
): Promise<PortalProfile> {
  const { data } = await api.put<{ data: PortalProfile }>(
    "/portal/profile",
    input
  );
  return data.data;
}

export async function changePassword(input: ChangePasswordInput): Promise<void> {
  await api.put("/portal/password", input);
}

export async function uploadProfilePhoto(file: File): Promise<PortalProfile> {
  const form = new FormData();
  form.append("photo", file);
  const { data } = await api.post<{ data: PortalProfile }>("/portal/profile/photo", form);
  return data.data;
}

export async function getMySchedule(
  range: DateRange = {}
): Promise<PortalShift[]> {
  const params: Record<string, string> = {};
  if (range.startDate) params.startDate = range.startDate;
  if (range.endDate) params.endDate = range.endDate;
  const { data } = await api.get<{ data: PortalShift[] }>("/portal/schedule", {
    params,
  });
  return data.data;
}

export async function getMyAttendance(
  range: DateRange = {}
): Promise<PortalAttendance[]> {
  const params: Record<string, string> = {};
  if (range.startDate) params.startDate = range.startDate;
  if (range.endDate) params.endDate = range.endDate;
  const { data } = await api.get<{ data: PortalAttendance[] }>(
    "/portal/attendance",
    { params }
  );
  return data.data;
}

export interface OvertimeRequest {
  id: string;
  date: string;
  startTime: string | null;
  endTime: string | null;
  reason: string;
  otHours: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  reviewNotes: string | null;
  createdAt: string;
  employee: {
    id: string;
    employeeId: string;
    firstName: string;
    lastName: string;
    position: string;
  };
}

export async function getMyOvertimeRequests(): Promise<OvertimeRequest[]> {
  const { data } = await api.get<{ data: OvertimeRequest[] }>("/overtime");
  return data.data;
}

export async function createOvertimeRequest(input: {
  date: string;
  startTime?: string;
  endTime?: string;
  reason: string;
  otHours?: number;
}): Promise<OvertimeRequest> {
  const { data } = await api.post<{ data: OvertimeRequest }>("/overtime", input);
  return data.data;
}

export interface PortalLeaveBalance {
  id: string;
  leaveType: string;
  year: number;
  totalDays: string;
  usedDays: string;
  remainingDays: string;
}

export async function getMyLeaveBalances(year?: number): Promise<PortalLeaveBalance[]> {
  const params: Record<string, string> = {};
  if (year) params.year = String(year);
  const { data } = await api.get<{ data: PortalLeaveBalance[] }>("/leave/balances", { params });
  return data.data;
}

export async function getMyPayslipDetail(id: string) {
  const { data } = await api.get<{ data: import("@/features/payroll/payroll.api").PayslipDetail }>(
    `/payroll/my-payslips/${id}`
  );
  return data.data;
}

/** Format a @db.Time ISO (date portion is always 1970-01-01) as 12-hour time. */
export function formatTime(iso: string): string {
  const d = new Date(iso);
  const h = d.getUTCHours();
  const m = d.getUTCMinutes();
  const period = h < 12 ? "AM" : "PM";
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

/** Format an ISO datetime as 12-hour time in the given timezone. */
export function formatLocalTime(iso: string, tz: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: tz,
  });
}

// --- My Documents -----------------------------------------------------------

export interface MyDocument {
  id: string;
  employeeId: string;
  name: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
}

export async function uploadMyDocument(name: string, file: File): Promise<MyDocument> {
  const form = new FormData();
  form.append("file", file);
  form.append("name", name);
  const { data } = await api.post<{ data: MyDocument }>("/portal/documents", form);
  return data.data;
}
