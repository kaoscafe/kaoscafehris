import prisma from "../../config/db.js";
import { AppError } from "../../middleware/error-handler.js";
import { logAudit } from "../../lib/audit.js";
import { invalidatePermissionCache } from "../../middleware/permission.js";
import type {
  BulkUpdateInput,
  GovTableType,
  ListGovTablesQuery,
  ListSettingsQuery,
  UpdateSettingInput,
  UpsertGovTableInput,
} from "./settings.schema.js";

// Default settings seeded on first read so the UI has something to render.
export const DEFAULT_SETTINGS: ReadonlyArray<{
  key: string;
  value: unknown;
  group: string;
}> = [
  // Company
  { key: "company.name", value: "KAOS Cafe", group: "company" },
  { key: "company.timezone", value: "Asia/Manila (UTC+8)", group: "company" },
  { key: "company.currency", value: "PHP", group: "company" },
  { key: "company.payroll_frequency", value: "Bi-Monthly", group: "company" },
  { key: "company.address", value: "", group: "company" },
  { key: "company.city", value: "", group: "company" },
  { key: "company.phone", value: "", group: "company" },
  { key: "company.email", value: "", group: "company" },
  { key: "company.tin", value: "", group: "company" },
  // Attendance
  { key: "attendance.late_threshold", value: 0, group: "attendance" },
  { key: "attendance.day_cutoff_hour", value: "00:00", group: "attendance" },
  { key: "attendance.overtime_threshold", value: 8, group: "attendance" },
  { key: "attendance.require_selfie", value: "Yes", group: "attendance" },
  { key: "attendance.absent_if_no_clockin", value: 4, group: "attendance" },
  { key: "attendance.half_day_threshold_hours", value: 4, group: "attendance" },
  // Payroll
  { key: "payroll.rest_day_ot_rate", value: 0, group: "payroll" },
  { key: "payroll.night_diff_rate", value: 0, group: "payroll" },
  { key: "payroll.holiday_pay_rate", value: 0, group: "payroll" },
  { key: "payroll.cutoff_day", value: "15th & Last Day", group: "payroll" },
  { key: "payroll.tax_computation", value: "Annualized", group: "payroll" },
  { key: "payroll.working_days_per_month", value: 22, group: "payroll" },
  { key: "payroll.working_hours_per_day", value: 8, group: "payroll" },
  { key: "payroll.overtime_multiplier", value: 1.25, group: "payroll" },
  { key: "payroll.late_deduction_per_minute", value: 0, group: "payroll" },
  // Kiosk
  { key: "kiosk.pin", value: "", group: "kiosk" },
  { key: "kiosk.auto_logout", value: 5, group: "kiosk" },
  { key: "kiosk.camera_resolution", value: "720p (HD)", group: "kiosk" },
  { key: "kiosk.allowed_ips", value: "", group: "kiosk" },
];

function encode(value: unknown): string {
  return JSON.stringify(value ?? null);
}

function decode(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

export interface SettingOut {
  key: string;
  value: unknown;
  group: string | null;
  updatedAt: Date;
}

function mapRow(r: {
  key: string;
  value: string;
  group: string | null;
  updatedAt: Date;
}): SettingOut {
  return { key: r.key, value: decode(r.value), group: r.group, updatedAt: r.updatedAt };
}

async function ensureDefaults(): Promise<void> {
  const existing = await prisma.systemSetting.findMany({ select: { key: true } });
  const have = new Set(existing.map((r) => r.key));
  const missing = DEFAULT_SETTINGS.filter((d) => !have.has(d.key));
  if (missing.length === 0) return;
  await prisma.systemSetting.createMany({
    data: missing.map((d) => ({ key: d.key, value: encode(d.value), group: d.group })),
    skipDuplicates: true,
  });
}

export async function listSettings(query: ListSettingsQuery): Promise<SettingOut[]> {
  await ensureDefaults();
  const rows = await prisma.systemSetting.findMany({
    where: query.group ? { group: query.group } : undefined,
    orderBy: [{ group: "asc" }, { key: "asc" }],
  });
  return rows.map(mapRow);
}

export async function updateSetting(
  key: string,
  input: UpdateSettingInput
): Promise<SettingOut> {
  const before = await prisma.systemSetting.findUnique({ where: { key } });
  const row = await prisma.systemSetting.upsert({
    where: { key },
    create: { key, value: encode(input.value), group: input.group ?? null },
    update: {
      value: encode(input.value),
      ...(input.group !== undefined ? { group: input.group } : {}),
    },
  });
  await logAudit({
    action: before ? "UPDATE" : "CREATE",
    tableName: "system_settings",
    recordId: row.id,
    oldValues: before ? mapRow(before) : undefined,
    newValues: mapRow(row),
  });
  return mapRow(row);
}

export async function bulkUpdate(input: BulkUpdateInput): Promise<SettingOut[]> {
  const keys = input.settings.map((s) => s.key);
  const priorRows = await prisma.systemSetting.findMany({
    where: { key: { in: keys } },
  });
  const priorByKey = new Map(priorRows.map((r) => [r.key, r]));

  const results = await prisma.$transaction(
    input.settings.map((s) =>
      prisma.systemSetting.upsert({
        where: { key: s.key },
        create: { key: s.key, value: encode(s.value), group: s.group ?? null },
        update: {
          value: encode(s.value),
          ...(s.group !== undefined ? { group: s.group } : {}),
        },
      })
    )
  );

  for (const row of results) {
    const prior = priorByKey.get(row.key);
    await logAudit({
      action: prior ? "UPDATE" : "CREATE",
      tableName: "system_settings",
      recordId: row.id,
      oldValues: prior ? mapRow(prior) : undefined,
      newValues: mapRow(row),
    });
  }

  return results.map(mapRow);
}

// --- Role permissions ─────────────────────────────────────────────────────

const VALID_ROLES = ["branch_manager", "employee"] as const;
type PermRole = (typeof VALID_ROLES)[number];

export async function getRolePermissions(role: PermRole): Promise<unknown> {
  const key = `permissions.${role}`;
  const row = await prisma.systemSetting.findUnique({ where: { key } });
  if (!row) return null;
  try { return JSON.parse(row.value); } catch { return null; }
}

export async function setRolePermissions(
  role: PermRole,
  perms: unknown
): Promise<void> {
  const key = `permissions.${role}`;
  const row = await prisma.systemSetting.upsert({
    where:  { key },
    create: { key, value: JSON.stringify(perms), group: "permissions" },
    update: { value: JSON.stringify(perms) },
  });
  invalidatePermissionCache();
  await logAudit({
    action: "UPDATE",
    tableName: "system_settings",
    recordId: row.id,
    newValues: perms as Record<string, unknown>,
  });
}

// --- Government contribution tables ---------------------------------------

export interface GovTableOut {
  id: string;
  type: GovTableType;
  rangeFrom: number;
  rangeTo: number;
  employeeShare: number;
  employerShare: number;
  effectiveDate: string;
}

function mapTable(r: {
  id: string;
  type: string;
  rangeFrom: { toString(): string };
  rangeTo: { toString(): string };
  employeeShare: { toString(): string };
  employerShare: { toString(): string };
  effectiveDate: Date;
}): GovTableOut {
  return {
    id: r.id,
    type: r.type as GovTableType,
    rangeFrom: Number(r.rangeFrom),
    rangeTo: Number(r.rangeTo),
    employeeShare: Number(r.employeeShare),
    employerShare: Number(r.employerShare),
    effectiveDate: r.effectiveDate.toISOString().slice(0, 10),
  };
}

export async function listGovTables(
  query: ListGovTablesQuery
): Promise<GovTableOut[]> {
  const rows = await prisma.governmentTable.findMany({
    where: query.type ? { type: query.type } : undefined,
    orderBy: [
      { type: "asc" },
      { effectiveDate: "desc" },
      { rangeFrom: "asc" },
    ],
  });
  return rows.map(mapTable);
}

export async function upsertGovTable(
  input: UpsertGovTableInput
): Promise<GovTableOut> {
  const data = {
    type: input.type,
    rangeFrom: input.rangeFrom,
    rangeTo: input.rangeTo,
    employeeShare: input.employeeShare,
    employerShare: input.employerShare,
    effectiveDate: new Date(`${input.effectiveDate}T00:00:00.000Z`),
  };

  if (input.id) {
    const before = await prisma.governmentTable.findUnique({ where: { id: input.id } });
    if (!before) throw new AppError(404, "Government table entry not found");
    const row = await prisma.governmentTable.update({ where: { id: input.id }, data });
    await logAudit({
      action: "UPDATE",
      tableName: "government_tables",
      recordId: row.id,
      oldValues: mapTable(before),
      newValues: mapTable(row),
    });
    return mapTable(row);
  }

  const row = await prisma.governmentTable.create({ data });
  await logAudit({
    action: "CREATE",
    tableName: "government_tables",
    recordId: row.id,
    newValues: mapTable(row),
  });
  return mapTable(row);
}

export async function deleteGovTable(id: string): Promise<void> {
  const existing = await prisma.governmentTable.findUnique({ where: { id } });
  if (!existing) throw new AppError(404, "Government table entry not found");
  await prisma.governmentTable.delete({ where: { id } });
  await logAudit({
    action: "DELETE",
    tableName: "government_tables",
    recordId: id,
    oldValues: mapTable(existing),
  });
}
