import cron from "node-cron";
import prisma from "../config/db.js";
import { sendMail } from "./email.js";
import { getSetting } from "./settings-cache.js";
import { COMPANY_TZ } from "./timezone.js";
import { getScheduledTimes } from "../modules/attendance/attendance.service.js";

// ─── Date helpers ─────────────────────────────────────────────────────────────

function getDateParts(date: Date, tz: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  return {
    year: Number(parts.find((p) => p.type === "year")?.value ?? 0),
    month: Number(parts.find((p) => p.type === "month")?.value ?? 0), // 1-indexed
    day: Number(parts.find((p) => p.type === "day")?.value ?? 0),
  };
}

function isMilestoneDay(
  hired: { year: number; month: number; day: number },
  today: { year: number; month: number; day: number },
  months: number,
): boolean {
  const totalMonths = (today.year - hired.year) * 12 + (today.month - hired.month);
  if (totalMonths !== months) return false;
  // Clamp hired day to the last day of today's month (handles e.g. Jan 31 + 3 months = Apr 30)
  const daysInMonth = new Date(today.year, today.month, 0).getDate();
  return today.day === Math.min(hired.day, daysInMonth);
}

function fmtDate(date: Date, tz: string) {
  return date.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: tz });
}

function fmtBirthday(date: Date, tz: string) {
  return date.toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: tz });
}

function getTomorrow(tz: string) {
  // Use Intl to get today in company TZ, then add 1 day in UTC to avoid DST issues
  const todayParts = getDateParts(new Date(), tz);
  const tomorrowUtc = new Date(Date.UTC(todayParts.year, todayParts.month - 1, todayParts.day + 1));
  return getDateParts(tomorrowUtc, tz);
}

// ─── Email templates ──────────────────────────────────────────────────────────

const LOGO = `<img src="data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0idXRmLTgiPz4NCjwhLS0gR2VuZXJhdG9yOiBBZG9iZSBJbGx1c3RyYXRvciAyNC4zLjAsIFNWRyBFeHBvcnQgUGx1Zy1JbiAuIFNWRyBWZXJzaW9uOiA2LjAwIEJ1aWxkIDApICAtLT4NCjxzdmcgdmVyc2lvbj0iMS4xIiBpZD0iTGF5ZXJfMSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB4bWxuczp4bGluaz0iaHR0cDovL3d3dy53My5vcmcvMTk5OS94bGluayIgeD0iMHB4IiB5PSIwcHgiDQoJIHZpZXdCb3g9IjAgMCA0MTcgMzcwLjIiIHN0eWxlPSJlbmFibGUtYmFja2dyb3VuZDpuZXcgMCAwIDQxNyAzNzAuMjsiIHhtbDpzcGFjZT0icHJlc2VydmUiPg0KPHN0eWxlIHR5cGU9InRleHQvY3NzIj4NCgkuc3Qwe2ZpbGw6I0ZGRkZGRjt9DQo8L3N0eWxlPg0KPGc+DQoJPHBhdGggY2xhc3M9InN0MCIgZD0iTTE0OS43LDEwMi4zYzEuNy0wLjcsMy40LTEuNSw1LjEtMi4yYzI4LjEtMTIuMyw1Ni4xLTI0LjYsODQuMi0zN2M3LjktMy41LDE1LjgtNywyMy44LTEwLjQNCgkJYzQuOC0yLjEsOS43LDEuNCw5LjQsNi42Yy0wLjIsMi44LTEuNyw0LjYtNC4yLDUuN2MtOC43LDMuOC0xNy40LDcuNi0yNi4yLDExLjVjLTE5LjksOC44LTM5LjksMTcuNS01OS44LDI2LjMNCgkJYy0xNCw2LjItMjgsMTIuMy00MiwxOC40Yy0xLjIsMC41LTEuNSwxLjEtMS42LDIuNGMtMC40LDExLTAuOCwyMi4xLTEuMiwzMy4xYy0wLjUsMTMuOC0xLDI3LjYtMS42LDQxLjMNCgkJYy0wLjIsNi4zLTAuNSwxMi42LTAuOCwxOC45YzAuNCwwLjIsMC41LTAuMSwwLjctMC4yYzIuNS0yLjEsNS00LjMsNy41LTYuNGMwLjYtMC41LDAuOC0xLDAuNi0xLjljLTIuNy0xMC40LTMuNi0yMS0yLjUtMzEuNw0KCQljMi40LTI0LjUsMTIuNi00NS4zLDMwLjgtNjJjMTMtMTEuOSwyOC40LTE5LjQsNDUuNy0yMi42YzE3LjItMy4xLDM0LTEuNCw1MC4zLDVjMS4yLDAuNSwyLjQsMSwzLjYsMS41YzAuNiwwLjMsMSwwLjMsMS41LTAuMg0KCQljNS42LTQuOSwxMS4yLTkuNiwxNi44LTE0LjVjMS4zLTEuMSwyLjUtMi4zLDMuOS0zLjNjMi4yLTEuNCw0LjUtMS42LDYuOC0wLjVjMi4zLDEuMSwzLjUsMy4xLDMuNyw1LjZjMC4xLDEuMS0wLjIsMi4xLTAuOSwzDQoJCWMtMi45LDMuOS01LjksNy42LTguNiwxMS42Yy0xLjcsMi42LTMuNSw1LjEtNS40LDcuNmMtMC40LDAuNi0wLjQsMC44LDAuMiwxLjJjMTYuNCwxMi41LDI3LjUsMjguNiwzMy40LDQ4LjMNCgkJYzEuNCw0LjcsMi41LDkuNSwzLjEsMTQuM2MwLjEsMC40LDAuMSwwLjgsMC4yLDEuM2M0LjEtMS42LDguMS0zLjEsMTIuMS00LjdjMTkuNS03LjYsMzktMTUuMiw1OC41LTIyLjhjNC0xLjUsOCwwLjUsOS4xLDQuNQ0KCQljMC45LDMuMy0wLjgsNi42LTQsNy45Yy00LjgsMS45LTkuNywzLjgtMTQuNSw1LjdjLTE5LDcuNC0zOCwxNC44LTU3LDIyLjJjLTEuMSwwLjQtMi43LDAuNi0zLjIsMS41Yy0wLjYsMC45LTAuMywyLjQtMC40LDMuNw0KCQljLTEsMTQuNC01LDI3LjktMTIsNDAuNGMtOC40LDE0LjktMjAsMjYuNy0zNC44LDM1LjNjLTEuNywxLTMuNSwyLTUuMywyLjhjLTAuOSwwLjQtMS4zLDAuOS0xLjIsMmMwLjMsMTQuMSwwLjYsMjguMywwLjksNDIuNA0KCQljMC4zLDEzLDAuNSwyNiwwLjgsMzljMC4xLDMuNi0yLjIsNi42LTUuNCw3LjVjLTAuNywwLjItMS41LDAuMi0yLjMsMC4yYy00Ny0wLjEtOTQtMC4xLTE0MS0wLjJjLTIuNiwwLTQuOC0wLjctNi40LTIuOA0KCQljLTAuMi0wLjMtMC42LTAuNS0wLjktMC43Yy0yLjEtMS41LTMuMS0zLjUtMy02YzAuNC0xMS44LDAuOS0yMy42LDEuNC0zNS40YzAuNi0xNS4xLDEuMi0zMC4xLDEuOC00NS4yYzAuMy03LjMsMC42LTE0LjYsMC45LTIxLjkNCgkJYzAtMC4yLDAtMC41LDAtMC43Yy0wLjQtMC4yLTAuNiwwLjItMC45LDAuNGMtMTIuNSwxMC43LTI0LjksMjEuNC0zNy40LDMyLjJjLTExLjYsMTAtMjMuMiwxOS45LTM0LjcsMjkuOQ0KCQljLTMuNywzLjItOC42LDIuMS0xMC42LTEuM2MtMS42LTIuOC0xLjEtNi4zLDEuNS04LjVjMy44LTMuMyw3LjctNi42LDExLjYtMTBjMTguMi0xNS42LDM2LjQtMzEuMyw1NC42LTQ2LjkNCgkJYzUuMy00LjUsMTAuNS05LjEsMTUuOC0xMy42YzAuNi0wLjUsMC44LTEsMC44LTEuN2MwLjQtMTIuNCwwLjktMjQuOSwxLjQtMzcuM2MwLjQtOS44LDAuOC0xOS43LDEuMS0yOS41DQoJCWMwLjMtNi41LDAuNS0xMy4xLDAuOC0xOS42YzAtMC4yLDAtMC40LTAuMi0wLjdjLTEsMS41LTEuOSwyLjktMi45LDQuNGMtMTUuMywyMy40LTMwLjYsNDYuNy00NS45LDcwLjENCgkJYy0xMC45LDE2LjYtMjEuOCwzMy4zLTMyLjcsNDkuOWMtNi41LDkuOS0xMywxOS45LTE5LjUsMjkuOGMtMi4xLDMuMi02LjIsNC4xLTkuMywyLjFjLTMuMi0yLjEtNC4xLTYuMS0xLjktOS40DQoJCWMxMC0xNS4yLDE5LjktMzAuNCwyOS45LTQ1LjZjNy41LTExLjQsMTQuOS0yMi44LDIyLjQtMzQuMmMxMC41LTE2LDIxLTMyLDMxLjUtNDhjMTAuNS0xNiwyMS0zMi4xLDMxLjUtNDguMQ0KCQljOS44LTE1LDE5LjYtMjkuOSwyOS40LTQ0LjljOS4yLTE0LjEsMTguNC0yOC4xLDI3LjctNDIuMmMyLjctNC4yLDUuNS04LjQsOC4yLTEyLjZjMS42LTIuNCwzLjktMy40LDYuOC0yLjkNCgkJYzMsMC42LDQuNywyLjUsNS4zLDUuNGMwLjQsMS43LDAsMy40LTEsNC45Yy04LDEyLjMtMTYuMSwyNC41LTI0LjEsMzYuOGMtNy43LDExLjctMTUuNCwyMy41LTIzLjEsMzUuMmMtMi4yLDMuNC00LjUsNi44LTYuNywxMC4zDQoJCUMxNDkuNywxMDIuMiwxNDkuNywxMDIuMywxNDkuNywxMDIuM3ogTTEzNC4xLDM0Ny4xYzAuNywwLDEuMSwwLDEuNiwwYzM1LDAuMSw3MCwwLjEsMTA1LDAuMmM2LjYsMCwxMy4zLDAsMTkuOSwwDQoJCWMwLjksMCwxLjItMC4yLDEuMS0xLjFjLTAuMS0xLjEsMC0yLjEtMC4xLTMuMmMtMC41LTIyLTAuOS00NC0xLjQtNjYuMWMwLTEuNSwwLTEuNS0xLjUtMS4xYy0xMi4yLDMuNS0yNC41LDQuNC0zNy4xLDIuNw0KCQljLTEyLjUtMS43LTI0LjEtNS43LTM0LjktMTIuMWMtMS0wLjYtMS4zLTAuNC0xLjksMC41Yy0xNC4yLDIyLjQtMjguNCw0NC45LTQyLjYsNjcuM0MxMzkuNiwzMzguNSwxMzYuOSwzNDIuNywxMzQuMSwzNDcuMXoNCgkJIE0yMzIuMywyNjZjOS45LDAsMTguMy0xLjQsMjYuNS00LjFjMC43LTAuMiwxLjEtMC41LDEuMS0xLjRjLTAuNC0xNy43LTAuOC0zNS41LTEuMS01My4yYzAtMS4zLDAtMi41LDAuMS0zLjgNCgkJYzAuMy0yLjgsMS45LTQuNyw0LjUtNS44YzE2LjQtNi40LDMyLjgtMTIuOCw0OS4yLTE5LjFjMC44LTAuMywwLjktMC43LDAuOC0xLjRjLTAuMy0yLjgtMC42LTUuNi0xLjItOC4zDQoJCWMtNC4xLTE5LjctMTQtMzUuOS0yOS44LTQ4LjRjLTAuOS0wLjctMS4yLTAuNi0xLjksMC4zYy02LDguNi0xMiwxNy4xLTE4LDI1LjZjLTQsNS42LTguMiwxMS4yLTExLjksMTYuOQ0KCQljLTcuNSwxMS41LTE0LjgsMjMuMi0yMi4xLDM0LjljLTExLjcsMTguNS0yMy41LDM3LTM1LjIsNTUuNWMtMC40LDAuNi0wLjQsMC45LDAuMywxLjRDMjA2LDI2Mi4zLDIxOS4zLDI2NS45LDIzMi4zLDI2NnoNCgkJIE0xMzAuOSwzMjcuMmMwLjEtMC4xLDAuMy0wLjQsMC41LTAuN2M4LjctMTMuOCwxNy41LTI3LjYsMjYuMi00MS4zYzE0LjItMjIuNCwyOC40LTQ0LjgsNDIuNy02Ny4zYzE0LjMtMjIuNiwyOC42LTQ1LjEsNDIuOS02Ny43DQoJCWMzLjQtNS40LDYuOS0xMC45LDEwLjMtMTYuNGMwLjEtMC4yLDAuNi0wLjUsMC4zLTAuN2MtMC4zLTAuMy0wLjYsMC0wLjksMC4zYy0wLjYsMC41LTEuMSwxLTEuNywxLjVjLTkuMSw3LjgtMTguMiwxNS43LTI3LjMsMjMuNQ0KCQljLTE0LjksMTIuOC0yOS44LDI1LjYtNDQuNywzOC41Yy0xNC43LDEyLjYtMjkuNCwyNS4yLTQ0LDM3LjljLTAuNywwLjYtMSwxLjItMSwyLjFjLTAuMSw1LTAuMyw5LjktMC41LDE0LjkNCgkJYy0wLjYsMTQuOS0xLjIsMjkuOC0xLjcsNDQuNmMtMC4zLDcuMy0wLjYsMTQuNi0wLjgsMjJDMTMwLjgsMzIxLjMsMTMwLjksMzI0LjMsMTMwLjksMzI3LjJ6IE0yNjEsMTA4LjhjLTAuMy0wLjItMC41LTAuMi0wLjctMC4zDQoJCWMtMTMuMy00LjctMjctNS43LTQwLjgtMy4xYy0xMS45LDIuMi0yMi44LDctMzIuNSwxNC4zYy0xMS45LDguOS0yMC44LDIwLjItMjYuNSwzMy45Yy02LDE0LjQtNy43LDI5LjMtNS4zLDQ0LjcNCgkJYzAuMSwwLjQtMC4xLDAuOSwwLjMsMWMwLjQsMC4yLDAuNy0wLjQsMS0wLjZjMTAuMi04LjcsMjAuMy0xNy41LDMwLjUtMjYuMmMyMS41LTE4LjUsNDMtMzcsNjQuNi01NS42DQoJCUMyNTQuNiwxMTQuMywyNTcuNywxMTEuNiwyNjEsMTA4Ljh6IE0yNzIuNiwyMzEuOWMwLjEsNy41LDAuMywxNSwwLjQsMjIuNGMwLDAuOSwwLjIsMSwxLDAuNWMxLjYtMS4xLDMuMy0yLDQuOS0zLjINCgkJYzE0LjQtMTAuMSwyNC41LTIzLjUsMzAuMy00MC4xYzItNS44LDMuNC0xMS44LDQtMTcuOWMwLjEtMS4xLTAuMi0wLjktMC45LTAuNmMtMC43LDAuMy0xLjUsMC42LTIuMiwwLjkNCgkJYy0xMi4zLDQuOC0yNC42LDkuNi0zNi45LDE0LjNjLTAuOSwwLjMtMS4xLDAuOC0xLjEsMS43QzI3Mi4zLDIxNy4zLDI3Mi41LDIyNC42LDI3Mi42LDIzMS45eiIvPg0KPC9nPg0KPC9zdmc+" alt="KAOS Café" style="height:36px;margin-bottom:12px;display:block" />`;

function milestone3MonthHtml(employees: { name: string; employeeId: string; position: string; branch: string; dateHired: Date }[], tz: string) {
  const rows = employees.map((e) => `
    <tr style="border-bottom:1px solid #e2e8f0">
      <td style="padding:11px 16px;color:#111827;font-weight:600">${e.name}</td>
      <td style="padding:11px 16px;color:#6b7280">${e.employeeId}</td>
      <td style="padding:11px 16px;color:#6b7280">${e.position}</td>
      <td style="padding:11px 16px;color:#6b7280">${e.branch}</td>
      <td style="padding:11px 16px;color:#6b7280">${fmtDate(e.dateHired, tz)}</td>
    </tr>`).join("");

  return `
    <div style="font-family:'Inter',Arial,sans-serif;color:#1a1a1a;max-width:600px;margin:0 auto">
      <div style="background:linear-gradient(135deg,#B10B0B,#811C12);padding:24px 28px;border-radius:12px 12px 0 0">
        ${LOGO}
        <h2 style="margin:0;color:#fff;font-size:20px;font-weight:700;letter-spacing:-0.3px">3-Month Review Reminder</h2>
        <p style="margin:6px 0 0;color:rgba(255,255,255,0.7);font-size:13px">Regularization evaluation due</p>
      </div>
      <div style="background:#fff;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;padding:28px">
        <p style="margin:0 0 20px;font-size:14px;color:#374151">
          The following employee${employees.length > 1 ? "s have" : " has"} reached their <strong>3-month employment mark</strong> today.
          Please review ${employees.length > 1 ? "their" : "their"} performance and initiate the regularization evaluation process.
        </p>
        <table style="border-collapse:collapse;font-size:14px;width:100%;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden">
          <thead>
            <tr style="border-bottom:1px solid #e2e8f0">
              <th style="padding:11px 16px;text-align:left;color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;background:#f8fafc">Name</th>
              <th style="padding:11px 16px;text-align:left;color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;background:#f8fafc">ID</th>
              <th style="padding:11px 16px;text-align:left;color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;background:#f8fafc">Position</th>
              <th style="padding:11px 16px;text-align:left;color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;background:#f8fafc">Branch</th>
              <th style="padding:11px 16px;text-align:left;color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;background:#f8fafc">Date Hired</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
}

function milestoneYearlyHtml(employees: { name: string; employeeId: string; position: string; branch: string; dateHired: Date; years: number }[], tz: string) {
  const rows = employees.map((e) => `
    <tr style="border-bottom:1px solid #e2e8f0">
      <td style="padding:11px 16px;color:#111827;font-weight:600">${e.name}</td>
      <td style="padding:11px 16px;color:#6b7280">${e.employeeId}</td>
      <td style="padding:11px 16px;color:#6b7280">${e.position}</td>
      <td style="padding:11px 16px;color:#6b7280">${e.branch}</td>
      <td style="padding:11px 16px;color:#6b7280">${fmtDate(e.dateHired, tz)}</td>
      <td style="padding:11px 16px;color:#6b7280">${e.years} ${e.years === 1 ? "year" : "years"}</td>
    </tr>`).join("");

  return `
    <div style="font-family:'Inter',Arial,sans-serif;color:#1a1a1a;max-width:600px;margin:0 auto">
      <div style="background:linear-gradient(135deg,#C17A2A,#8C1515);padding:24px 28px;border-radius:12px 12px 0 0">
        ${LOGO}
        <h2 style="margin:0;color:#fff;font-size:20px;font-weight:700;letter-spacing:-0.3px">Work Anniversary</h2>
        <p style="margin:6px 0 0;color:rgba(255,255,255,0.7);font-size:13px">Employee milestone celebration</p>
      </div>
      <div style="background:#fff;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;padding:28px">
        <p style="margin:0 0 20px;font-size:14px;color:#374151">
          The following employee${employees.length > 1 ? "s have" : " has"} reached a <strong>work anniversary</strong> today.
          Be sure to recognize ${employees.length > 1 ? "their" : "their"} dedication and contributions!
        </p>
        <table style="border-collapse:collapse;font-size:14px;width:100%;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden">
          <thead>
            <tr style="border-bottom:1px solid #e2e8f0">
              <th style="padding:11px 16px;text-align:left;color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;background:#f8fafc">Name</th>
              <th style="padding:11px 16px;text-align:left;color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;background:#f8fafc">ID</th>
              <th style="padding:11px 16px;text-align:left;color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;background:#f8fafc">Position</th>
              <th style="padding:11px 16px;text-align:left;color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;background:#f8fafc">Branch</th>
              <th style="padding:11px 16px;text-align:left;color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;background:#f8fafc">Date Hired</th>
              <th style="padding:11px 16px;text-align:left;color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;background:#f8fafc">Tenure</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
}

function milestone6MonthHtml(employees: { name: string; employeeId: string; position: string; branch: string; dateHired: Date }[], tz: string) {
  const rows = employees.map((e) => `
    <tr style="border-bottom:1px solid #e2e8f0">
      <td style="padding:11px 16px;color:#111827;font-weight:600">${e.name}</td>
      <td style="padding:11px 16px;color:#6b7280">${e.employeeId}</td>
      <td style="padding:11px 16px;color:#6b7280">${e.position}</td>
      <td style="padding:11px 16px;color:#6b7280">${e.branch}</td>
      <td style="padding:11px 16px;color:#6b7280">${fmtDate(e.dateHired, tz)}</td>
    </tr>`).join("");

  return `
    <div style="font-family:'Inter',Arial,sans-serif;color:#1a1a1a;max-width:600px;margin:0 auto">
      <div style="background:linear-gradient(135deg,#811C12,#280906);padding:24px 28px;border-radius:12px 12px 0 0">
        ${LOGO}
        <h2 style="margin:0;color:#fff;font-size:20px;font-weight:700;letter-spacing:-0.3px">6-Month Benefits Eligibility</h2>
        <p style="margin:6px 0 0;color:rgba(255,255,255,0.7);font-size:13px">Statutory benefits enrollment due</p>
      </div>
      <div style="background:#fff;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;padding:28px">
        <p style="margin:0 0 20px;font-size:14px;color:#374151">
          The following employee${employees.length > 1 ? "s have" : " has"} reached their <strong>6-month employment mark</strong> today.
          Please process their statutory benefits enrollment (SSS, PhilHealth, Pag-IBIG) if not yet done.
        </p>
        <table style="border-collapse:collapse;font-size:14px;width:100%;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden">
          <thead>
            <tr style="border-bottom:1px solid #e2e8f0">
              <th style="padding:11px 16px;text-align:left;color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;background:#f8fafc">Name</th>
              <th style="padding:11px 16px;text-align:left;color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;background:#f8fafc">ID</th>
              <th style="padding:11px 16px;text-align:left;color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;background:#f8fafc">Position</th>
              <th style="padding:11px 16px;text-align:left;color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;background:#f8fafc">Branch</th>
              <th style="padding:11px 16px;text-align:left;color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;background:#f8fafc">Date Hired</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
}

function birthdayHtml(employees: { name: string; employeeId: string; position: string; branch: string; dateOfBirth: Date }[], tz: string) {
  const rows = employees.map((e) => `
    <tr style="border-bottom:1px solid #e2e8f0">
      <td style="padding:11px 16px;color:#111827;font-weight:600">${e.name}</td>
      <td style="padding:11px 16px;color:#6b7280">${e.employeeId}</td>
      <td style="padding:11px 16px;color:#6b7280">${e.position}</td>
      <td style="padding:11px 16px;color:#6b7280">${e.branch}</td>
      <td style="padding:11px 16px;color:#6b7280">${fmtBirthday(e.dateOfBirth, tz)}</td>
    </tr>`).join("");

  return `
    <div style="font-family:'Inter',Arial,sans-serif;color:#1a1a1a;max-width:600px;margin:0 auto">
      <div style="background:linear-gradient(135deg,#C17A2A,#B10B0B);padding:24px 28px;border-radius:12px 12px 0 0">
        ${LOGO}
        <h2 style="margin:0;color:#fff;font-size:20px;font-weight:700;letter-spacing:-0.3px">Birthday Tomorrow</h2>
        <p style="margin:6px 0 0;color:rgba(255,255,255,0.7);font-size:13px">Don't forget to greet your team!</p>
      </div>
      <div style="background:#fff;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;padding:28px">
        <p style="margin:0 0 20px;font-size:14px;color:#374151">
          The following employee${employees.length > 1 ? "s have" : " has"} a birthday <strong>tomorrow</strong>.
          Take a moment to make ${employees.length > 1 ? "them" : "them"} feel appreciated!
        </p>
        <table style="border-collapse:collapse;font-size:14px;width:100%;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden">
          <thead>
            <tr style="border-bottom:1px solid #e2e8f0">
              <th style="padding:11px 16px;text-align:left;color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;background:#f8fafc">Name</th>
              <th style="padding:11px 16px;text-align:left;color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;background:#f8fafc">ID</th>
              <th style="padding:11px 16px;text-align:left;color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;background:#f8fafc">Position</th>
              <th style="padding:11px 16px;text-align:left;color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;background:#f8fafc">Branch</th>
              <th style="padding:11px 16px;text-align:left;color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;background:#f8fafc">Birthday</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
}

// ─── Birthday check ───────────────────────────────────────────────────────────

export async function checkUpcomingBirthdays() {
  try {
    const tz = COMPANY_TZ;
    const tomorrow = getTomorrow(tz);

    const employees = await prisma.employee.findMany({
      where: { employmentStatus: { in: ["FULL_TIME", "PART_TIME", "TRAINEE"] }, dateOfBirth: { not: null } },
      select: {
        employeeId: true, firstName: true, lastName: true,
        position: true, dateOfBirth: true,
        branch: { select: { name: true } },
      },
    });

    const celebrants = employees.filter((e) => {
      if (!e.dateOfBirth) return false;
      const dob = getDateParts(e.dateOfBirth, tz);
      // Feb 29 birthdays: notify on Feb 28 in non-leap years
      const daysInTomorrowMonth = new Date(tomorrow.year, tomorrow.month, 0).getDate();
      const effectiveDay = Math.min(dob.day, daysInTomorrowMonth);
      return dob.month === tomorrow.month && effectiveDay === tomorrow.day;
    });

    if (celebrants.length === 0) return;

    const admins = await prisma.user.findMany({
      where: { role: { in: ["ADMIN", "MANAGER"] }, isActive: true },
      select: { email: true },
    });
    if (admins.length === 0) return;

    const names = celebrants.map((e) => `${e.firstName} ${e.lastName}`).join(", ");
    await sendMail({
      to: admins.map((u) => u.email),
      subject: celebrants.length === 1
        ? `🎂 Birthday Tomorrow: ${names}`
        : `🎂 Birthdays Tomorrow: ${celebrants.length} employees`,
      html: birthdayHtml(celebrants.map((e) => ({
        name: `${e.firstName} ${e.lastName}`,
        employeeId: e.employeeId,
        position: e.position,
        branch: e.branch.name,
        dateOfBirth: e.dateOfBirth!,
      })), tz),
    });
    console.log(`[scheduler] Birthday reminder sent for: ${names}`);
  } catch (err) {
    console.error("[scheduler] Birthday check failed:", err);
  }
}

// ─── Milestone check ──────────────────────────────────────────────────────────

export async function checkEmployeeMilestones() {
  try {
    const tz = COMPANY_TZ;
    const today = getDateParts(new Date(), tz);

    const employees = await prisma.employee.findMany({
      where: { employmentStatus: { in: ["FULL_TIME", "PART_TIME", "TRAINEE"] } },
      select: {
        employeeId: true, firstName: true, lastName: true,
        position: true, dateHired: true,
        branch: { select: { name: true } },
      },
    });

    const threeMonth: typeof employees = [];
    const sixMonth: typeof employees = [];
    const yearly: { emp: (typeof employees)[number]; years: number }[] = [];

    for (const emp of employees) {
      const hired = getDateParts(emp.dateHired, tz);
      const totalMonths = (today.year - hired.year) * 12 + (today.month - hired.month);
      if (isMilestoneDay(hired, today, 3)) threeMonth.push(emp);
      if (isMilestoneDay(hired, today, 6)) sixMonth.push(emp);
      if (totalMonths >= 12 && totalMonths % 12 === 0) {
        const daysInMonth = new Date(today.year, today.month, 0).getDate();
        if (today.day === Math.min(hired.day, daysInMonth)) {
          yearly.push({ emp, years: totalMonths / 12 });
        }
      }
    }

    if (threeMonth.length === 0 && sixMonth.length === 0 && yearly.length === 0) return;

    const admins = await prisma.user.findMany({
      where: { role: { in: ["ADMIN", "MANAGER"] }, isActive: true },
      select: { email: true },
    });
    if (admins.length === 0) return;
    const recipients = admins.map((u) => u.email);

    const toRow = (e: (typeof employees)[number]) => ({
      name: `${e.firstName} ${e.lastName}`,
      employeeId: e.employeeId,
      position: e.position,
      branch: e.branch.name,
      dateHired: e.dateHired,
    });

    if (threeMonth.length > 0) {
      const names = threeMonth.map((e) => `${e.firstName} ${e.lastName}`).join(", ");
      await sendMail({
        to: recipients,
        subject: threeMonth.length === 1
          ? `3-Month Review Due: ${names}`
          : `3-Month Review Due: ${threeMonth.length} employees`,
        html: milestone3MonthHtml(threeMonth.map(toRow), tz),
      });
      console.log(`[scheduler] 3-month milestone email sent for: ${names}`);
    }

    if (sixMonth.length > 0) {
      const names = sixMonth.map((e) => `${e.firstName} ${e.lastName}`).join(", ");
      await sendMail({
        to: recipients,
        subject: sixMonth.length === 1
          ? `6-Month Benefits Eligibility: ${names}`
          : `6-Month Benefits Eligibility: ${sixMonth.length} employees`,
        html: milestone6MonthHtml(sixMonth.map(toRow), tz),
      });
      console.log(`[scheduler] 6-month milestone email sent for: ${names}`);
    }

    if (yearly.length > 0) {
      const names = yearly.map((e) => `${e.emp.firstName} ${e.emp.lastName}`).join(", ");
      await sendMail({
        to: recipients,
        subject: yearly.length === 1
          ? `Work Anniversary: ${names} — ${yearly[0].years} ${yearly[0].years === 1 ? "Year" : "Years"}`
          : `Work Anniversaries: ${yearly.length} employees`,
        html: milestoneYearlyHtml(yearly.map((e) => ({
          ...toRow(e.emp),
          years: e.years,
        })), tz),
      });
      console.log(`[scheduler] Work anniversary email sent for: ${names}`);
    }
  } catch (err) {
    console.error("[scheduler] Milestone check failed:", err);
  }
}

// ─── Absent check ─────────────────────────────────────────────────────────────

export async function checkAbsentEmployees() {
  try {
    const tz = COMPANY_TZ;
    const today = getDateParts(new Date(), tz);
    const todayUTC = new Date(Date.UTC(today.year, today.month - 1, today.day));
    const yesterdayUTC = new Date(todayUTC.getTime() - 24 * 60 * 60 * 1000);
    const thresholdHours = await getSetting<number>("attendance.absent_if_no_clockin", 4);
    const now = new Date();

    const allShifts = await prisma.shift.findMany({
      where: {
        date: { in: [yesterdayUTC, todayUTC] },
        status: "PUBLISHED",
      },
      include: {
        assignments: {
          include: {
            employee: { select: { branchId: true, payType: true, employmentStatus: true } },
          },
        },
      },
    });

    // Only process today's shifts plus yesterday's overnight shifts.
    // This avoids re-marking past regular shifts if the server was down.
    const shifts = allShifts.filter((s) => {
      if (s.date.getTime() === todayUTC.getTime()) return true;
      const startMins = s.startTime.getUTCHours() * 60 + s.startTime.getUTCMinutes();
      const endMins = s.endTime.getUTCHours() * 60 + s.endTime.getUTCMinutes();
      return endMins < startMins; // overnight shift from yesterday
    });

    if (shifts.length === 0) return;

    // Collect all assigned employee IDs for bulk attendance lookup.
    const allEmployeeIds = new Set<string>();
    for (const shift of shifts) {
      for (const a of shift.assignments) {
        allEmployeeIds.add(a.employeeId);
      }
    }

    // Fetch existing attendance records for all relevant employees across both dates.
    const existingRecords = await prisma.attendance.findMany({
      where: {
        employeeId: { in: [...allEmployeeIds] },
        date: { in: [yesterdayUTC, todayUTC] },
      },
      select: { employeeId: true, date: true },
    });

    // Build a set of "employeeId:dateKey" strings for O(1) lookup.
    const recordKeys = new Set(
      existingRecords.map((r) => `${r.employeeId}:${r.date.toISOString().slice(0, 10)}`),
    );

    // Fetch approved leaves for all relevant employees covering the date range.
    const approvedLeaves = await prisma.leaveRequest.findMany({
      where: {
        employeeId: { in: [...allEmployeeIds] },
        status: "APPROVED",
        startDate: { lte: todayUTC },
        endDate: { gte: yesterdayUTC },
      },
      select: { employeeId: true, startDate: true, endDate: true },
    });

    // Build a set of "employeeId:dateKey" for dates covered by approved leaves.
    const leaveDateKeys = new Set<string>();
    for (const leave of approvedLeaves) {
      const start = new Date(leave.startDate);
      const end = new Date(leave.endDate);
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        leaveDateKeys.add(`${leave.employeeId}:${d.toISOString().slice(0, 10)}`);
      }
    }

    const processed = new Set<string>();
    let created = 0;

    for (const shift of shifts) {
      const { scheduledStart } = getScheduledTimes(shift.date, shift, tz);
      const cutoff = new Date(scheduledStart.getTime() + thresholdHours * 60 * 60 * 1000);

      if (now < cutoff) continue;

      const dateKey = shift.date.toISOString().slice(0, 10);

      for (const assignment of shift.assignments) {
        const eid = assignment.employeeId;
        const processedKey = `${eid}:${dateKey}`;

        if (assignment.employee.employmentStatus === "TERMINATED") continue;
        if (assignment.employee.payType !== "HOURLY") continue;
        if (processed.has(processedKey)) continue;
        if (recordKeys.has(`${eid}:${dateKey}`)) continue;

        const branchId = assignment.assignedBranchId ?? assignment.employee.branchId;
        const onLeave = leaveDateKeys.has(`${eid}:${dateKey}`);

        // clockIn is set to midnight PHT (00:00 local) so the UI displays 12:00 AM.
        // shift.date is midnight UTC; the ISO date string always equals the local date
        // since Asia/Manila is UTC+8 (ahead of UTC, never behind).
        const shiftDateStr = shift.date.toISOString().slice(0, 10);
        const midnightPht = new Date(`${shiftDateStr}T00:00:00.000+08:00`);

        await prisma.attendance.create({
          data: {
            employeeId: eid,
            branchId,
            date: shift.date,
            clockIn: midnightPht,
            status: onLeave ? "ON_LEAVE" : "ABSENT",
            source: "AUTO",
            syncStatus: "SYNCED",
          },
        });

        processed.add(processedKey);
        created++;
        console.log(`[scheduler] Auto-marked ${onLeave ? "on-leave" : "absent"}: ${eid} (shift: ${shift.name}, date: ${dateKey})`);
      }
    }

    if (created > 0) {
      console.log(`[scheduler] Auto-marked ${created} employee(s) absent`);
    }
  } catch (err) {
    console.error("[scheduler] Absent check failed:", err);
  }
}

// ─── Start scheduler ──────────────────────────────────────────────────────────

export async function startScheduler() {
  const tz = COMPANY_TZ;
  cron.schedule("0 8 * * *", async () => {
    await checkEmployeeMilestones();
    await checkUpcomingBirthdays();
  }, { timezone: tz });
  console.log(`[scheduler] Daily checks scheduled — 08:00 ${tz} (milestones + birthdays)`);

  cron.schedule("0 * * * *", async () => {
    await checkAbsentEmployees();
  }, { timezone: tz });
  console.log(`[scheduler] Hourly absent check scheduled — ${tz}`);
}
