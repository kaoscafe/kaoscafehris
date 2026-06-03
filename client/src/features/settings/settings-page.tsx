import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, Lock, Save, Shield, X } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { PasswordInput } from "@/components/ui/password-input";
import { TimePicker } from "@/components/ui/time-picker";
import { extractErrorMessage } from "@/lib/api";
import {
  bulkUpdateSettings,
  listSettings,
  getRolePermissions,
  saveRolePermissions,
  type Setting,
  type BulkUpdateItem,
  type RolePermissions,
  type PermState,
} from "./settings.api";

const BRAND = "#8C1515";

// ─── Field config ─────────────────────────────────────────────────────────────

type FieldType = "text" | "number" | "password" | "select" | "timepicker";

interface FieldConfig {
  label: string;
  type: FieldType;
  options?: string[];
  fullWidth?: boolean;
  suffix?: string;
}

const FIELD_CONFIG: Record<string, FieldConfig> = {
  "company.name": { label: "Company Name", type: "text", fullWidth: true },
  "company.currency": {
    label: "Currency",
    type: "select",
    options: ["PHP", "USD", "EUR", "GBP", "JPY"],
  },
  "company.payroll_frequency": {
    label: "Payroll Frequency",
    type: "select",
    options: ["Bi-Monthly", "Monthly", "Weekly", "Semi-Weekly"],
  },
  "attendance.late_threshold": { label: "Late Threshold (MINS)", type: "number" },
  "attendance.day_cutoff_hour": { label: "Timesheet Start Time", type: "timepicker" },
  "attendance.require_selfie": {
    label: "Require Selfie",
    type: "select",
    options: ["Yes", "No"],
  },
  "attendance.absent_if_no_clockin": { label: "Absent if No Clock-in After (HRS)", type: "number" },
  "payroll.late_deduction_per_minute": { label: "Late Deduction (₱/min)", type: "number" },
  "payroll.night_diff_rate": { label: "Night Diff Rate (%/hr)", type: "number" },
  "payroll.cutoff_day": {
    label: "Payroll Cut-off Day",
    type: "select",
    options: ["15th & Last Day", "1st & 15th", "Last Day", "1st of Month"],
  },
  "kiosk.pin": { label: "Kiosk PIN", type: "password" },
  "kiosk.auto_logout": { label: "Auto-logout After (SECS)", type: "number" },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function stringifyValue(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return JSON.stringify(v);
}

function parseDraft(original: unknown, raw: string): unknown {
  if (typeof original === "number") {
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
  }
  if (typeof original === "boolean") return raw === "true" || raw === "1";
  return raw;
}

const GROUP_ICON: Record<string, React.ReactNode> = {
  company: (
    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-orange-50">
      <svg className="h-5 w-5 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
      </svg>
    </span>
  ),
  payroll: (
    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-green-50">
      <svg className="h-5 w-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
      </svg>
    </span>
  ),
  attendance: (
    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-yellow-50">
      <svg className="h-5 w-5 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    </span>
  ),
  kiosk: (
    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-50">
      <svg className="h-5 w-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
      </svg>
    </span>
  ),
};

const GROUP_LABEL: Record<string, string> = {
  company: "Company Settings",
  payroll: "Payroll Settings",
  attendance: "Attendance Settings",
  kiosk: "Kiosk Settings",
};

const GROUP_DESC: Record<string, string> = {
  company: "Configure company-wide settings",
  payroll: "Configure payroll computation rules",
  attendance: "Configure attendance tracking behavior",
  kiosk: "Configure the self-service attendance kiosk",
};


// ─── Permission types & role data ─────────────────────────────────────────────

type PermKey = "view" | "create" | "edit" | "delete";

interface ModulePerms {
  view: PermState;
  create: PermState;
  edit: PermState;
  delete: PermState;
}

interface PermModule {
  name: string;
  description: string;
  perms: ModulePerms;
}

interface PermSection {
  label: string;
  modules: PermModule[];
}

type RoleKey = "admin" | "branch_manager" | "employee";

const PERM_KEYS: PermKey[] = ["view", "create", "edit", "delete"];

const ROLE_INFO: Record<RoleKey, { label: string; description: string; dialogDesc: string }> = {
  admin: {
    label: "Admin",
    description: "Full system access",
    dialogDesc: "Full system access — can manage all branches, payroll, employees, and system settings.",
  },
  branch_manager: {
    label: "Branch Manager",
    description: "Branch-level management",
    dialogDesc:
      "Branch-level access — own branch only\nCannot access other branches, payroll computation, or system settings.",
  },
  employee: {
    label: "Employee",
    description: "Self-service portal only",
    dialogDesc: "Employee self-service — portal access only.\nCan view own schedule, request leaves, and check payslips.",
  },
};

const ROLE_SECTIONS: Record<RoleKey, PermSection[]> = {
  admin: [
    {
      label: "People & Branches",
      modules: [
        { name: "Employees", description: "Full access to all employee records", perms: { view: "locked", create: "locked", edit: "locked", delete: "locked" } },
        { name: "Branches", description: "Full access to all branches", perms: { view: "locked", create: "locked", edit: "locked", delete: "locked" } },
      ],
    },
    {
      label: "Operations",
      modules: [
        { name: "Schedule", description: "Full schedule management across all branches", perms: { view: "locked", create: "locked", edit: "locked", delete: "locked" } },
        { name: "Attendance", description: "Full attendance management", perms: { view: "locked", create: "locked", edit: "locked", delete: "locked" } },
        { name: "Leave", description: "Full leave management", perms: { view: "locked", create: "locked", edit: "locked", delete: "locked" } },
      ],
    },
    {
      label: "Finance & Reporting",
      modules: [
        { name: "Payroll", description: "Full payroll management and computation", perms: { view: "locked", create: "locked", edit: "locked", delete: "locked" } },
        { name: "Reports", description: "Full access to all reports", perms: { view: "locked", create: "locked", edit: "locked", delete: "locked" } },
      ],
    },
    {
      label: "System",
      modules: [
        { name: "Settings", description: "Admin / Owner only", perms: { view: "locked", create: "locked", edit: "locked", delete: "locked" } },
      ],
    },
  ],
  branch_manager: [
    {
      label: "People & Branches",
      modules: [
        { name: "Employees", description: "Cannot add, transfer, or remove employees", perms: { view: "on", create: "locked", edit: "locked", delete: "locked" } },
        { name: "Branches", description: "Cannot create or delete branches", perms: { view: "on", create: "locked", edit: "on", delete: "locked" } },
      ],
    },
    {
      label: "Operations",
      modules: [
        { name: "Schedule", description: "Can create and manage shifts for their branch", perms: { view: "on", create: "on", edit: "on", delete: "on" } },
        { name: "Attendance", description: "Can correct attendance entries, cannot delete", perms: { view: "on", create: "on", edit: "on", delete: "locked" } },
        { name: "Leave", description: "Can approve or reject leave requests", perms: { view: "on", create: "on", edit: "on", delete: "locked" } },
      ],
    },
    {
      label: "Finance & Reporting",
      modules: [
        { name: "Payroll", description: "Payroll view only — cannot run or edit payroll", perms: { view: "on", create: "locked", edit: "locked", delete: "locked" } },
        { name: "Reports", description: "Attendance, schedule, and leave reports only", perms: { view: "on", create: "locked", edit: "locked", delete: "locked" } },
      ],
    },
    {
      label: "System",
      modules: [
        { name: "Settings", description: "Admin / Owner only", perms: { view: "locked", create: "locked", edit: "locked", delete: "locked" } },
      ],
    },
  ],
  employee: [
    {
      label: "People & Branches",
      modules: [
        { name: "Employees", description: "No access to other employee records", perms: { view: "locked", create: "locked", edit: "locked", delete: "locked" } },
        { name: "Branches", description: "No access", perms: { view: "locked", create: "locked", edit: "locked", delete: "locked" } },
      ],
    },
    {
      label: "Operations",
      modules: [
        { name: "Schedule", description: "Can view own schedule only", perms: { view: "on", create: "locked", edit: "locked", delete: "locked" } },
        { name: "Attendance", description: "Can view own attendance records", perms: { view: "on", create: "locked", edit: "locked", delete: "locked" } },
        { name: "Leave", description: "Can file and track own leave requests", perms: { view: "on", create: "on", edit: "locked", delete: "locked" } },
      ],
    },
    {
      label: "Finance & Reporting",
      modules: [
        { name: "Payroll", description: "Can view own payslip only", perms: { view: "on", create: "locked", edit: "locked", delete: "locked" } },
        { name: "Reports", description: "No access", perms: { view: "locked", create: "locked", edit: "locked", delete: "locked" } },
      ],
    },
    {
      label: "System",
      modules: [
        { name: "Settings", description: "No access", perms: { view: "locked", create: "locked", edit: "locked", delete: "locked" } },
      ],
    },
  ],
};

// ─── Main page ────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 md:px-8">
      <h1 className="mb-6 text-2xl font-bold text-gray-800">Settings</h1>
      <GeneralTab />
    </div>
  );
}

// ─── General tab ──────────────────────────────────────────────────────────────

function GeneralTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ["settings"], queryFn: () => listSettings() });
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [configRole, setConfigRole] = useState<RoleKey | null>(null);

  useEffect(() => {
    if (!query.data) return;
    setDrafts(
      Object.fromEntries((query.data as Setting[]).map((s) => [s.key, stringifyValue(s.value)]))
    );
  }, [query.data]);

  const grouped = useMemo((): Map<string, Setting[]> => {
    const map = new Map<string, Setting[]>();
    for (const s of (query.data ?? []) as Setting[]) {
      if (!FIELD_CONFIG[s.key]) continue;
      const g = s.group ?? "other";
      map.set(g, [...(map.get(g) ?? []), s]);
    }
    return map;
  }, [query.data]);

  const saveMut = useMutation({
    mutationFn: (items: BulkUpdateItem[]) => bulkUpdateSettings(items),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings"] });
      toast("Settings saved", "success");
    },
    onError: (err) => toast(extractErrorMessage(err), "error"),
  });

  function handleSave() {
    if (!query.data) return;
    const items: BulkUpdateItem[] = [];
    for (const s of query.data as Setting[]) {
      if (!FIELD_CONFIG[s.key]) continue;
      const raw = drafts[s.key] ?? "";
      const parsed = parseDraft(s.value, raw);
      if (JSON.stringify(s.value) !== JSON.stringify(parsed)) {
        items.push({ key: s.key, value: parsed, group: s.group ?? undefined });
      }
    }
    if (!items.length) { toast("No changes to save", "info"); return; }
    saveMut.mutate(items);
  }

  function renderField(s: Setting) {
    const cfg = FIELD_CONFIG[s.key];
    if (!cfg) return null;
    const val = drafts[s.key] ?? "";
    const base = "w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-primary focus:outline-none";

    if (cfg.type === "select" && cfg.options) {
      return (
        <select
          className={base + " bg-white"}
          value={val}
          onChange={(e) => setDrafts((d) => ({ ...d, [s.key]: e.target.value }))}
        >
          {cfg.options.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      );
    }

    if (cfg.type === "timepicker") {
      return (
        <TimePicker
          value={val}
          onChange={(v) => setDrafts((d) => ({ ...d, [s.key]: v }))}
        />
      );
    }

    if (cfg.suffix) {
      return (
        <div className="relative">
          <input
            type={cfg.type === "number" ? "number" : "text"}
            step={cfg.type === "number" ? "0.01" : undefined}
            className={base + " pr-8"}
            value={val}
            onChange={(e) => setDrafts((d) => ({ ...d, [s.key]: e.target.value }))}
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 pointer-events-none">
            {cfg.suffix}
          </span>
        </div>
      );
    }

    if (cfg.type === "password") {
      return (
        <PasswordInput
          className={base}
          value={val}
          onChange={(e) => setDrafts((d) => ({ ...d, [s.key]: e.target.value }))}
        />
      );
    }

    return (
      <input
        type={cfg.type === "number" ? "number" : "text"}
        className={base}
        value={val}
        onChange={(e) => setDrafts((d) => ({ ...d, [s.key]: e.target.value }))}
      />
    );
  }

  function renderGroup(group: string) {
    const items = grouped.get(group);
    if (!items?.length) return null;

    return (
      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-3">
          {GROUP_ICON[group] ?? <span className="h-9 w-9 rounded-full bg-gray-100" />}
          <div>
            <h2 className="font-semibold text-gray-800">{GROUP_LABEL[group] ?? group}</h2>
            <p className="text-xs text-gray-400">{GROUP_DESC[group] ?? ""}</p>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {items.map((s) => {
            const cfg = FIELD_CONFIG[s.key];
            if (!cfg) return null;
            return (
              <div key={s.key} className={cfg.fullWidth ? "sm:col-span-2 space-y-1.5" : "space-y-1.5"}>
                <label className="block text-xs font-medium uppercase tracking-wide text-gray-500">
                  {cfg.label}
                </label>
                {renderField(s)}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (query.isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-gray-300" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-red-50">
            <Shield className="h-5 w-5 text-red-500" />
          </span>
          <div>
            <h2 className="font-semibold text-gray-800">Roles &amp; Permissions</h2>
            <p className="text-xs text-gray-400">Manage user roles and access permissions</p>
          </div>
        </div>
        <div className="space-y-2">
          {(["branch_manager", "employee"] as RoleKey[]).map((role) => (
            <div
              key={role}
              className="flex items-center justify-between rounded-lg border border-gray-100 px-4 py-3"
            >
              <div>
                <p className="text-sm font-medium text-gray-700">{ROLE_INFO[role].label}</p>
                <p className="text-xs text-gray-400">{ROLE_INFO[role].description}</p>
              </div>
              <button
                type="button"
                onClick={() => setConfigRole(role)}
                className="rounded-lg border border-gray-200 px-4 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Configure
              </button>
            </div>
          ))}
        </div>
      </div>

      {renderGroup("company")}
      {renderGroup("attendance")}
      {renderGroup("payroll")}
      {renderGroup("kiosk")}

      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saveMut.isPending}
          className="flex items-center gap-2 rounded-lg px-6 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:shadow-md"
          style={{ backgroundColor: BRAND }}
        >
          {saveMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save Changes
        </button>
      </div>

      {configRole && (
        <RoleConfigDialog
          role={configRole}
          onClose={() => setConfigRole(null)}
        />
      )}
    </div>
  );
}

// ─── Role Config Dialog ───────────────────────────────────────────────────────

interface RoleConfigDialogProps {
  role: RoleKey;
  onClose: () => void;
}

function RoleConfigDialog({ role, onClose }: RoleConfigDialogProps) {
  const { toast } = useToast();

  const [sections, setSections] = useState<PermSection[]>(() =>
    ROLE_SECTIONS[role].map((sec) => ({
      ...sec,
      modules: sec.modules.map((m) => ({ ...m, perms: { ...m.perms } })),
    }))
  );

  // Load saved permissions and overlay them onto the defaults
  const savedQuery = useQuery({
    queryKey: ["role-permissions", role],
    queryFn: () => getRolePermissions(role),
  });

  useEffect(() => {
    const saved = savedQuery.data as RolePermissions | null | undefined;
    if (!saved) return;
    setSections(
      ROLE_SECTIONS[role].map((sec) => ({
        ...sec,
        modules: sec.modules.map((mod) => {
          const moduleKey = mod.name.toLowerCase() as keyof RolePermissions;
          const savedModule = saved[moduleKey];
          if (!savedModule) return { ...mod, perms: { ...mod.perms } };
          const mergedPerms = { ...mod.perms } as Record<PermKey, PermState>;
          for (const k of ["view", "create", "edit", "delete"] as PermKey[]) {
            if (mergedPerms[k] !== "locked" && savedModule[k] !== undefined) {
              mergedPerms[k] = savedModule[k] as PermState;
            }
          }
          return { ...mod, perms: mergedPerms };
        }),
      }))
    );
  }, [savedQuery.data, role]);

  const saveMut = useMutation({
    mutationFn: (perms: RolePermissions) => saveRolePermissions(role, perms),
    onSuccess: () => {
      toast("Role permissions saved", "success");
      onClose();
    },
    onError: (err) => toast(extractErrorMessage(err), "error"),
  });

  function toggle(si: number, mi: number, perm: PermKey) {
    setSections((prev) =>
      prev.map((sec, s) =>
        s !== si
          ? sec
          : {
              ...sec,
              modules: sec.modules.map((mod, m) =>
                m !== mi
                  ? mod
                  : { ...mod, perms: { ...mod.perms, [perm]: mod.perms[perm] === "on" ? "off" : "on" } }
              ),
            }
      )
    );
  }

  function handleSave() {
    const perms: RolePermissions = {};
    for (const sec of sections) {
      for (const mod of sec.modules) {
        const key = mod.name.toLowerCase() as keyof RolePermissions;
        perms[key] = {} as Record<PermKey, PermState>;
        for (const k of ["view", "create", "edit", "delete"] as PermKey[]) {
          (perms[key] as Record<PermKey, PermState>)[k] = mod.perms[k];
        }
      }
    }
    saveMut.mutate(perms);
  }

  return createPortal(
    <div className="fixed inset-0 z-40 flex">
      {/* Backdrop */}
      <div className="flex-1 bg-black/30" onClick={onClose} />

      {/* Slide panel */}
      <div
        role="dialog"
        aria-modal="true"
        className="bg-white w-full max-w-md h-full shadow-2xl flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-5 border-b border-gray-100">
          <div>
            <h2 className="text-xl font-bold text-gray-900">
              Configure Role: {ROLE_INFO[role].label}
            </h2>
            <p className="text-sm text-gray-500 mt-0.5 whitespace-pre-line">
              {ROLE_INFO[role].dialogDesc}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors ml-4 mt-0.5 flex-none"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-5 px-6 py-3 border-b border-gray-100 text-xs text-gray-500 bg-gray-50">
          <span className="flex items-center gap-1.5">
            <span
              className="flex h-[18px] w-[18px] items-center justify-center rounded"
              style={{ backgroundColor: BRAND }}
            >
              <Check className="h-3 w-3 text-white" />
            </span>
            Allowed
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-[18px] w-[18px] rounded bg-gray-700" />
            Not allowed
          </span>
          <span className="flex items-center gap-1.5">
            <Lock className="h-3.5 w-3.5 text-gray-400" />
            Locked — Admin only
          </span>
        </div>

        {/* Scrollable permission matrix */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          {sections.map((section, si) => (
            <div key={section.label}>
              <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-gray-400">
                {section.label}
              </p>
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="pb-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-400 pr-4">
                      Module
                    </th>
                    {PERM_KEYS.map((k) => (
                      <th
                        key={k}
                        className="pb-2 text-center text-xs font-semibold uppercase tracking-wide text-gray-400 w-14"
                      >
                        {k}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {section.modules.map((mod, mi) => (
                    <tr key={mod.name} className="border-b border-gray-50 last:border-0">
                      <td className="py-3 pr-4">
                        <p className="text-sm font-medium text-gray-800">{mod.name}</p>
                        <p className="text-xs text-gray-400">{mod.description}</p>
                      </td>
                      {PERM_KEYS.map((k) => {
                        const state = mod.perms[k];
                        return (
                          <td key={k} className="py-3 text-center">
                            <span className="inline-flex justify-center">
                              {state === "locked" ? (
                                <Lock className="h-4 w-4 text-gray-300" />
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => toggle(si, mi, k)}
                                  className="flex h-[18px] w-[18px] items-center justify-center rounded transition-colors"
                                  style={{ backgroundColor: state === "on" ? BRAND : "#374151" }}
                                >
                                  {state === "on" && <Check className="h-3 w-3 text-white" />}
                                </button>
                              )}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 border-t border-gray-100 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={saveMut.isPending}
            className="rounded-lg border border-gray-200 px-5 py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saveMut.isPending || savedQuery.isLoading}
            className="flex items-center gap-2 rounded-lg px-5 py-2 text-sm font-medium text-white transition-colors disabled:opacity-60"
            style={{ backgroundColor: BRAND }}
          >
            {saveMut.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Save Changes
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

