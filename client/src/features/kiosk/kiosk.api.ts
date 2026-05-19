import api from "@/lib/api";

export interface KioskBranch { id: string; name: string; }

export interface KioskEmployee {
  id: string; employeeId: string;
  firstName: string; lastName: string;
  position: string; profilePhoto: string | null;
  branch: KioskBranch;
}

export interface KioskShift {
  id: string; name: string;
  startTime: string; endTime: string; date: string;
  branch: KioskBranch;
}

export interface KioskAttendance {
  id: string; clockIn: string; clockOut: string | null; status: string;
}

export interface KioskStatusData {
  employee: KioskEmployee;
  shift: KioskShift | null;
  attendance: KioskAttendance | null;
  lastClockIn: { date: string; clockIn: string } | null;
  /** ISO timestamp of the scheduled shift end when an open record from a
   *  previous day has already passed its end time (stale unclosed shift). */
  staleShiftEnd: string | null;
}

function h(pin: string) {
  return { "x-kiosk-pin": pin };
}

export async function pingKiosk(): Promise<void> {
  await api.get("/kiosk/ping");
}

export async function validateKioskPin(pin: string): Promise<boolean> {
  try {
    await api.get("/kiosk/validate-pin", { headers: h(pin) });
    return true;
  } catch {
    return false;
  }
}

export async function getKioskStatus(employeeId: string, pin: string): Promise<KioskStatusData> {
  const { data } = await api.get<{ data: KioskStatusData }>(`/kiosk/status/${employeeId}`, { headers: h(pin) });
  return data.data;
}

export async function uploadKioskSelfie(blob: Blob, pin: string): Promise<string> {
  const form = new FormData();
  form.append("selfie", blob, "selfie.jpg");
  const { data } = await api.post<{ url: string }>("/kiosk/upload-selfie", form, {
    headers: { ...h(pin), "Content-Type": "multipart/form-data" },
  });
  return data.url;
}

export async function kioskClockIn(employeeId: string, selfieIn: string | undefined, pin: string, clockInNote?: string): Promise<KioskAttendance> {
  const { data } = await api.post<{ data: KioskAttendance }>(
    "/kiosk/clock-in",
    { employeeId, selfieIn, clockInNote, kioskPin: pin },
    { headers: h(pin) }
  );
  return data.data;
}

export async function kioskClockOut(
  attendanceId: string,
  selfieOut: string | undefined,
  pin: string,
  clockOut?: string,
  clockOutNote?: string,
): Promise<KioskAttendance> {
  const { data } = await api.post<{ data: KioskAttendance }>(
    `/kiosk/clock-out/${attendanceId}`,
    { selfieOut, clockOut, clockOutNote, kioskPin: pin },
    { headers: h(pin) }
  );
  return data.data;
}
