import api from "@/lib/api";

export interface Branch {
  id: string;
  name: string;
  address: string;
  city: string;
  phone: string | null;
  branchManager: string | null; // legacy free-text name, set only while no manager account is linked
  managerId: string | null;
  manager: { id: string; firstName: string; lastName: string } | null;
  operatingHours: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  _count?: { employees: number };
}

export interface BranchInput {
  name: string;
  address: string;
  city: string;
  phone?: string;
  managerId?: string | null; // admin only
  operatingHours?: string;
  isActive?: boolean;
}

export interface ListBranchesParams {
  search?: string;
  isActive?: boolean;
}

export async function listBranches(params: ListBranchesParams = {}): Promise<Branch[]> {
  const query: Record<string, string> = {};
  if (params.search) query.search = params.search;
  if (typeof params.isActive === "boolean") query.isActive = String(params.isActive);
  const { data } = await api.get<{ data: Branch[] }>("/branches", { params: query });
  return data.data;
}

export async function createBranch(input: BranchInput): Promise<Branch> {
  const { data } = await api.post<{ data: Branch }>("/branches", input);
  return data.data;
}

export async function updateBranch(id: string, input: Partial<BranchInput>): Promise<Branch> {
  const { data } = await api.put<{ data: Branch }>(`/branches/${id}`, input);
  return data.data;
}

export async function deactivateBranch(id: string): Promise<Branch> {
  const { data } = await api.delete<{ data: Branch }>(`/branches/${id}`);
  return data.data;
}
