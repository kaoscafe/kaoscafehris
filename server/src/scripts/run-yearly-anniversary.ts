import prisma from "../config/db.js";
import { sendMail } from "../lib/email.js";
import { COMPANY_TZ } from "../lib/timezone.js";

function getDateParts(date: Date, tz: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  return {
    year: Number(parts.find((p) => p.type === "year")?.value ?? 0),
    month: Number(parts.find((p) => p.type === "month")?.value ?? 0),
    day: Number(parts.find((p) => p.type === "day")?.value ?? 0),
  };
}

function fmtDate(date: Date, tz: string) {
  return date.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: tz });
}

function milestoneYearlyHtml(employees: { name: string; employeeId: string; position: string; branch: string; dateHired: Date; years: number }[], tz: string) {
  const rows = employees.map((e) => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #e6e0f0"><strong>${e.name}</strong></td>
      <td style="padding:8px 12px;border-bottom:1px solid #e6e0f0;color:#666">${e.employeeId}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e6e0f0;color:#666">${e.position}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e6e0f0;color:#666">${e.branch}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e6e0f0;color:#666">${fmtDate(e.dateHired, tz)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e6e0f0;color:#666">${e.years} ${e.years === 1 ? "year" : "years"}</td>
    </tr>`).join("");

  return `
    <div style="font-family:'Inter',sans-serif;color:#1a1a1a;max-width:640px">
      <div style="background:linear-gradient(135deg,#3730a3,#4f46e5);padding:24px 28px;border-radius:12px 12px 0 0">
        <img src="https://xn--kaoscaf-hya.com/kaos-logo.svg" alt="KAOS Café" style="height:36px;filter:brightness(0) invert(1);margin-bottom:12px;display:block" />
        <h2 style="margin:0;color:#fff;font-size:20px;font-weight:700">Work Anniversary</h2>
        <p style="margin:6px 0 0;color:rgba(255,255,255,0.75);font-size:13px">Employee milestone celebration</p>
      </div>
      <div style="background:#fff;padding:24px 28px;border:1px solid #e6e0f0;border-top:none;border-radius:0 0 12px 12px">
        <p style="margin:0 0 16px;font-size:14px">
          The following employee${employees.length > 1 ? "s have" : " has"} reached a <strong>work anniversary</strong> today.
          Be sure to recognize ${employees.length > 1 ? "their" : "their"} dedication and contributions!
        </p>
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <thead>
            <tr style="background:#f5f3ff">
              <th style="padding:8px 12px;text-align:left;color:#3730a3;font-size:11px;text-transform:uppercase;letter-spacing:0.5px">Name</th>
              <th style="padding:8px 12px;text-align:left;color:#3730a3;font-size:11px;text-transform:uppercase;letter-spacing:0.5px">ID</th>
              <th style="padding:8px 12px;text-align:left;color:#3730a3;font-size:11px;text-transform:uppercase;letter-spacing:0.5px">Position</th>
              <th style="padding:8px 12px;text-align:left;color:#3730a3;font-size:11px;text-transform:uppercase;letter-spacing:0.5px">Branch</th>
              <th style="padding:8px 12px;text-align:left;color:#3730a3;font-size:11px;text-transform:uppercase;letter-spacing:0.5px">Date Hired</th>
              <th style="padding:8px 12px;text-align:left;color:#3730a3;font-size:11px;text-transform:uppercase;letter-spacing:0.5px">Tenure</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        <p style="margin:20px 0 0;font-size:13px;color:#666">
          Log in to the <a href="https://xn--kaoscaf-hya.com" style="color:#4f46e5">KAOS HRIS</a> to view employee details.
        </p>
      </div>
    </div>`;
}

async function run() {
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

  const yearly: { emp: (typeof employees)[number]; years: number }[] = [];

  for (const emp of employees) {
    const hired = getDateParts(emp.dateHired, tz);
    const totalMonths = (today.year - hired.year) * 12 + (today.month - hired.month);
    if (totalMonths >= 12 && totalMonths % 12 === 0) {
      const daysInMonth = new Date(today.year, today.month, 0).getDate();
      if (today.day === Math.min(hired.day, daysInMonth)) {
        yearly.push({ emp, years: totalMonths / 12 });
      }
    }
  }

  console.log(`Found ${yearly.length} employee(s) with a work anniversary today.`);

  if (yearly.length === 0) {
    console.log("Nothing to send.");
    return;
  }

  const admins = await prisma.user.findMany({
    where: { role: { in: ["ADMIN", "MANAGER"] }, isActive: true },
    select: { email: true },
  });
  if (admins.length === 0) {
    console.log("No active admin/manager users to notify.");
    return;
  }
  const recipients = admins.map((u) => u.email);

  const names = yearly.map((e) => `${e.emp.firstName} ${e.emp.lastName}`).join(", ");
  await sendMail({
    to: recipients,
    subject: yearly.length === 1
      ? `Work Anniversary: ${names} — ${yearly[0].years} ${yearly[0].years === 1 ? "Year" : "Years"}`
      : `Work Anniversaries: ${yearly.length} employees`,
    html: milestoneYearlyHtml(yearly.map((e) => ({
      name: `${e.emp.firstName} ${e.emp.lastName}`,
      employeeId: e.emp.employeeId,
      position: e.emp.position,
      branch: e.emp.branch.name,
      dateHired: e.emp.dateHired,
      years: e.years,
    })), tz),
  });

  console.log(`Work anniversary email sent for: ${names}`);
}

run()
  .then(() => { console.log("Done."); process.exit(0); })
  .catch((err) => { console.error(err); process.exit(1); });
