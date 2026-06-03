import prisma from "../config/db.js";

/** Read a single system setting value, falling back to `defaultValue`. */
export async function getSetting<T>(key: string, defaultValue: T): Promise<T> {
  const row = await prisma.systemSetting.findUnique({ where: { key } });
  if (!row) return defaultValue;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return row.value as unknown as T;
  }
}

/**
 * Read the attendance day cutoff hour (0–23). Handles both the legacy number
 * format (stored as 7) and the current "HH:mm" timepicker format ("07:00").
 * Returns 0 (midnight) when the setting is absent or unparseable.
 */
export async function getDayCutoffHour(): Promise<number> {
  const raw = await getSetting<unknown>("attendance.day_cutoff_hour", "00:00");
  if (typeof raw === "number") return Math.max(0, Math.min(23, Math.floor(raw)));
  if (typeof raw === "string") {
    const h = parseInt(raw.split(":")[0] ?? "0", 10);
    return Number.isFinite(h) ? Math.max(0, Math.min(23, h)) : 0;
  }
  return 0;
}
