import api from "@/lib/api";

export type ProfileEarningType = "BONUS" | "ALLOWANCE" | "OTHER";

export const PROFILE_ONE_TIME_EARNING_TYPES: { value: ProfileEarningType; label: string }[] = [
  { value: "ALLOWANCE", label: "Allowance" },
  { value: "BONUS", label: "Bonus" },
  { value: "OTHER", label: "Other" },
];

export interface EmployeeOneTimeEarning {
  id: string;
  employeeId: string;
  type: ProfileEarningType;
  label: string;
  amount: string;
  payrollRunId: string | null;
  effectiveDate: string;
  createdAt: string;
  updatedAt: string;
}

export interface AddEmployeeOneTimeEarningInput {
  type: ProfileEarningType;
  label: string;
  amount: number;
  effectiveDate: string;
}

export async function listEmployeeOneTimeEarnings(
  employeeId: string
): Promise<EmployeeOneTimeEarning[]> {
  const { data } = await api.get<{ data: EmployeeOneTimeEarning[] }>(
    `/employees/${employeeId}/one-time-earnings`
  );
  return data.data;
}

export async function addEmployeeOneTimeEarning(
  employeeId: string,
  input: AddEmployeeOneTimeEarningInput
): Promise<EmployeeOneTimeEarning> {
  const { data } = await api.post<{ data: EmployeeOneTimeEarning }>(
    `/employees/${employeeId}/one-time-earnings`,
    input
  );
  return data.data;
}

export async function removeEmployeeOneTimeEarning(
  employeeId: string,
  oteId: string
): Promise<void> {
  await api.delete(`/employees/${employeeId}/one-time-earnings/${oteId}`);
}
