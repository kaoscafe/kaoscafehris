import PDFDocument from "pdfkit";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { createRequire } from "module";
import type { Prisma } from "@prisma/client";

const _require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SVGtoPDF = _require("svg-to-pdfkit") as (doc: any, svg: string, x: number, y: number, options?: Record<string, unknown>) => void;

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load the logo SVG once at module init; fall back to null if unavailable
const LOGO_SVG = (() => {
  try {
    return readFileSync(join(__dirname, "../../../../client/public/kaos-logo.svg"), "utf-8");
  } catch {
    return null;
  }
})();

type PayslipWithRelations = Prisma.PayslipGetPayload<{
  include: {
    employee: {
      select: {
        id: true;
        employeeId: true;
        firstName: true;
        lastName: true;
        position: true;
        basicSalary: true;
        payType: true;
        hourlyRate: true;
        employmentStatus: true;
        sssNumber: true;
        philhealthNumber: true;
        pagibigNumber: true;
        tinNumber: true;
        branch: { select: { id: true; name: true; city: true; address: true } };
      };
    };
    payrollRun: {
      select: {
        id: true;
        periodStart: true;
        periodEnd: true;
        status: true;
        branch: { select: { id: true; name: true; city: true; address: true } };
      };
    };
    earnings: true;
    deductions: true;
  };
}>;

const BRAND = "#8C1515";
const ENTITLEMENTS = "#16A34A";
const NET_PAY = "#16A34A";

// Helvetica (WinAnsi) cannot render U+20B1 — use "P" prefix.
const PHP = (n: Prisma.Decimal | number | string): string => {
  const v = typeof n === "number" ? n : Number(n);
  const num = Number.isFinite(v) ? v : 0;
  return (
    "P" +
    new Intl.NumberFormat("en-PH", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num)
  );
};

function fmtShort(d: Date): string {
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}/${String(d.getUTCFullYear()).slice(-2)}`;
}

function fmtEmploymentStatus(s: string): string {
  const map: Record<string, string> = {
    TRAINEE: "Trainee",
    FULL_TIME: "Full Time",
    PART_TIME: "Part Time",
    RESERVED: "Reserved",
    TERMINATED: "Terminated",
  };
  return map[s] ?? s;
}

interface TableRow {
  label: string;
  units?: string;
  amount: string;
  amountColor?: string;
}

function drawSection(
  doc: InstanceType<typeof PDFDocument>,
  title: string,
  rows: TableRow[],
  totalAmount: string,
  totalAmountColor: string,
  startY: number,
  margin: number,
  pageW: number
): number {
  const ROW_H = 17;
  const rightX = margin + pageW;
  const descW = 272;
  const hoursW = 105;
  const totalW = pageW - descW - hoursW;
  const hoursX = margin + descW;
  const totalX = hoursX + hoursW;

  let y = startY;

  // Section title row
  doc.rect(margin, y, pageW, ROW_H).fill(BRAND);
  doc
    .font("Helvetica-Bold")
    .fontSize(8.5)
    .fillColor("white")
    .text(title.toUpperCase(), margin + 8, y + 5, { lineBreak: false });
  y += ROW_H;

  // Column header row
  doc.rect(margin, y, pageW, ROW_H).fill("#F0F0F0");
  doc.font("Helvetica").fontSize(7.5).fillColor("#888888");
  doc.text("Description", margin + 8, y + 5, { lineBreak: false });

  const hdrHours = "Hours / units";
  const hdrHoursW = doc.widthOfString(hdrHours);
  doc.text(hdrHours, hoursX + (hoursW - hdrHoursW) / 2, y + 5, { lineBreak: false });

  const hdrTotal = "Total";
  const hdrTotalW = doc.widthOfString(hdrTotal);
  doc.text(hdrTotal, rightX - hdrTotalW - 8, y + 5, { lineBreak: false });

  doc
    .moveTo(hoursX, y)
    .lineTo(hoursX, y + ROW_H)
    .strokeColor("#D0D0D0")
    .lineWidth(0.5)
    .stroke();
  doc.moveTo(totalX, y).lineTo(totalX, y + ROW_H).stroke();
  doc.moveTo(margin, y + ROW_H).lineTo(rightX, y + ROW_H).stroke();
  y += ROW_H;

  // Data rows
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    doc.rect(margin, y, pageW, ROW_H).fill(i % 2 === 0 ? "white" : "#FAFAFA");

    doc
      .font("Helvetica")
      .fontSize(8.5)
      .fillColor("#374151")
      .text(row.label, margin + 8, y + 4, { lineBreak: false });

    if (row.units) {
      const uw = doc.widthOfString(row.units);
      doc
        .font("Helvetica")
        .fontSize(8.5)
        .fillColor("#374151")
        .text(row.units, hoursX + (hoursW - uw) / 2, y + 4, { lineBreak: false });
    }

    const amtColor = row.amountColor ?? BRAND;
    const aw = doc.widthOfString(row.amount);
    doc
      .font("Helvetica")
      .fontSize(8.5)
      .fillColor(amtColor)
      .text(row.amount, rightX - aw - 8, y + 4, { lineBreak: false });

    doc
      .moveTo(hoursX, y)
      .lineTo(hoursX, y + ROW_H)
      .strokeColor("#E5E7EB")
      .lineWidth(0.5)
      .stroke();
    doc.moveTo(totalX, y).lineTo(totalX, y + ROW_H).stroke();
    doc.moveTo(margin, y + ROW_H).lineTo(rightX, y + ROW_H).stroke();
    y += ROW_H;
  }

  // Total row
  doc.rect(margin, y, pageW, ROW_H).fill("#F5F5F5");
  doc
    .font("Helvetica-Bold")
    .fontSize(8.5)
    .fillColor("#111827")
    .text("Total", margin + 8, y + 4, { lineBreak: false });
  const taw = doc.widthOfString(totalAmount);
  doc
    .font("Helvetica-Bold")
    .fontSize(8.5)
    .fillColor(totalAmountColor)
    .text(totalAmount, rightX - taw - 8, y + 4, { lineBreak: false });
  doc
    .moveTo(hoursX, y)
    .lineTo(hoursX, y + ROW_H)
    .strokeColor("#E5E7EB")
    .lineWidth(0.5)
    .stroke();
  doc.moveTo(totalX, y).lineTo(totalX, y + ROW_H).stroke();
  y += ROW_H;

  // Outer border
  doc
    .rect(margin, startY, pageW, y - startY)
    .strokeColor("#CCCCCC")
    .lineWidth(0.5)
    .stroke();

  return y;
}

export function renderPayslip(
  doc: InstanceType<typeof PDFDocument>,
  payslip: PayslipWithRelations
): void {
  const { employee, payrollRun, earnings, deductions } = payslip;
  const margin = doc.page.margins.left;
  const pageW = doc.page.width - margin * 2;
  const rightX = margin + pageW;

  // Branch address (use payrollRun branch as the authoritative source)
  const branch = payrollRun.branch;
  const branchAddress = branch.address ?? "";
  const branchCity = branch.city ?? "";

  // Pay rate helpers
  const isHourly = employee.payType === "HOURLY";
  const hourlyRate = isHourly
    ? Number(employee.hourlyRate ?? 0)
    : Number(employee.basicSalary) / 26 / 8;
  const dailyRate = hourlyRate * 8;
  const monthlyRate = Number(employee.basicSalary);

  const numHours = (amount: Prisma.Decimal | number | string): string => {
    const n = Number(amount);
    if (!Number.isFinite(n) || n === 0 || hourlyRate <= 0) return "";
    return (n / hourlyRate).toFixed(2);
  };

  const payDate = new Date(payrollRun.periodEnd);
  if (payDate.getUTCDate() <= 15) {
    payDate.setUTCDate(15);
  } else {
    payDate.setUTCMonth(payDate.getUTCMonth() + 1, 0);
  }

  let y = margin;

  // ── HEADER BOX ────────────────────────────────────────────────────────────────
  const headerH = 82;
  doc.rect(margin, y, pageW, headerH).strokeColor("#CCCCCC").lineWidth(0.5).stroke();

  // Logo: render SVG if available, otherwise a styled "K" monogram
  const logoSz = 40;
  const logoX = margin + 14;
  const logoY = y + (headerH - logoSz) / 2;

  if (LOGO_SVG) {
    SVGtoPDF(doc, LOGO_SVG, logoX, logoY, { width: logoSz, height: logoSz });
  } else {
    doc.roundedRect(logoX, logoY, logoSz, logoSz, 5).fill(BRAND);
    doc
      .font("Helvetica-Bold")
      .fontSize(22)
      .fillColor("white")
      .text("K", logoX, logoY + 9, { width: logoSz, align: "center", lineBreak: false });
  }

  // Title text (right of logo)
  const titleAreaX = logoX + logoSz + 12;
  const titleAreaW = rightX - titleAreaX;
  doc
    .font("Helvetica-Bold")
    .fontSize(18)
    .fillColor("#111827")
    .text("Payslip", titleAreaX, y + 12, { width: titleAreaW, align: "center", lineBreak: false });
  doc
    .font("Helvetica-Bold")
    .fontSize(10)
    .fillColor(BRAND)
    .text("KAOS Cafe", titleAreaX, y + 36, { width: titleAreaW, align: "center", lineBreak: false });

  // Address inside the header box
  doc.font("Helvetica").fontSize(7.5).fillColor("#6B7280");
  if (branchAddress) {
    doc.text(branchAddress, titleAreaX, y + 50, { width: titleAreaW, align: "center", lineBreak: false });
  }
  if (branchCity) {
    doc.text(branchCity, titleAreaX, y + 60, { width: titleAreaW, align: "center", lineBreak: false });
  }

  y += headerH + 8;

  // Separator
  doc.moveTo(margin, y).lineTo(rightX, y).strokeColor("#E5E7EB").lineWidth(0.5).stroke();
  y += 10;

  // ── EMPLOYEE INFO ─────────────────────────────────────────────────────────────
  const col2X = margin + pageW * 0.5;

  const infoLbl = (text: string, x: number, iy: number) => {
    doc
      .font("Helvetica")
      .fontSize(7.5)
      .fillColor("#6B7280")
      .text(text, x, iy, { lineBreak: false });
  };
  const infoVal = (text: string, x: number, iy: number, color = "#111827") => {
    doc
      .font("Helvetica-Bold")
      .fontSize(8.5)
      .fillColor(color)
      .text(text, x, iy, { lineBreak: false });
  };

  // Row 1: Employee name | Pay period
  infoLbl("Employee name:", margin, y);
  infoVal(`${employee.firstName} ${employee.lastName}`, margin + 82, y);
  infoLbl("Pay period:", col2X, y);
  infoVal(
    `${fmtShort(payrollRun.periodStart)} - ${fmtShort(payrollRun.periodEnd)}`,
    col2X + 57,
    y
  );
  y += 14;

  // Row 2: Employment status | Pay date
  infoLbl("Employment status:", margin, y);
  infoVal(fmtEmploymentStatus(employee.employmentStatus), margin + 96, y, BRAND);
  infoLbl("Pay date:", col2X, y);
  infoVal(fmtShort(payDate), col2X + 53, y);
  y += 14;

  // Row 3: Monthly rate (monthly employees) or Daily rate (hourly employees) | Actual worked hours
  if (isHourly) {
    infoLbl("Daily rate:", margin, y);
    infoVal(PHP(dailyRate), margin + 57, y);
  } else {
    infoLbl("Monthly rate:", margin, y);
    infoVal(PHP(monthlyRate), margin + 70, y);
  }
  infoLbl("Actual worked hours:", col2X, y);
  infoVal(`${Number(payslip.totalHoursWorked).toFixed(2)} hrs`, col2X + 107, y);
  y += 18;

  // Separator
  doc.moveTo(margin, y).lineTo(rightX, y).strokeColor("#E5E7EB").lineWidth(0.5).stroke();
  y += 10;

  // ── ENTITLEMENTS TABLE ────────────────────────────────────────────────────────
  const entRows: TableRow[] = [
    {
      label: "Regular Hours",
      units: numHours(payslip.basicPay),
      amount: PHP(payslip.basicPay),
      amountColor: ENTITLEMENTS,
    },
    ...earnings.map((e) => ({
      label: e.label,
      units:
        e.type === "OVERTIME"
          ? numHours(e.amount)
          : e.type === "HOLIDAY_PAY"
          ? (() => { const m = e.label.match(/× (\d+\.?\d*) hrs/); return m ? m[1] : ""; })()
          : "",
      amount: PHP(e.amount),
      amountColor: ENTITLEMENTS,
    })),
  ];
  y = drawSection(doc, "Entitlements", entRows, PHP(payslip.grossPay), ENTITLEMENTS, y, margin, pageW);
  y += 10;

  // ── DEDUCTIONS TABLE ──────────────────────────────────────────────────────────
  const dedRows: TableRow[] = deductions.map((d) => ({
    label: d.label,
    units: d.type === "LATE" ? (() => { const m = d.label.match(/(\d+) min/); return m ? (Number(m[1]) / 60).toFixed(2) : ""; })() : "",
    amount: PHP(d.amount),
    amountColor: "#DC2626",
  }));
  y = drawSection(
    doc,
    "Deductions",
    dedRows,
    PHP(payslip.totalDeductions),
    "#DC2626",
    y,
    margin,
    pageW
  );
  y += 10;

  // ── NET PAY ───────────────────────────────────────────────────────────────────
  const netH = 24;
  doc.rect(margin, y, pageW, netH).fill("white");
  doc.rect(margin, y, pageW, netH).strokeColor("#CCCCCC").lineWidth(0.5).stroke();

  doc
    .font("Helvetica")
    .fontSize(8.5)
    .fillColor("#6B7280")
    .text("Net pay", margin + 8, y + 8, { lineBreak: false });

  const netAmtStr = PHP(payslip.netPay);
  doc.font("Helvetica-Bold").fontSize(11).fillColor(NET_PAY);
  const netAmtW = doc.widthOfString(netAmtStr);

  const totalNetLabel = "Total net pay:";
  doc.font("Helvetica").fontSize(8.5).fillColor("#374151");
  const totalNetLabelW = doc.widthOfString(totalNetLabel);
  doc.text(totalNetLabel, rightX - netAmtW - totalNetLabelW - 14, y + 8, {
    lineBreak: false,
  });
  doc
    .font("Helvetica-Bold")
    .fontSize(11)
    .fillColor(NET_PAY)
    .text(netAmtStr, rightX - netAmtW - 8, y + 6, { lineBreak: false });

  y += netH + 12;

  // ── FOOTER ────────────────────────────────────────────────────────────────────
  doc
    .font("Helvetica")
    .fontSize(7)
    .fillColor("#9CA3AF")
    .text(
      `Status: ${payslip.status}  ·  Generated: ${new Date().toLocaleString("en-PH")}`,
      margin,
      y,
      { lineBreak: false }
    );
  doc.fillColor("black");
}

export async function payslipToBuffer(
  payslip: PayslipWithRelations
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    renderPayslip(doc, payslip);
    doc.end();
  });
}

export async function runToBuffer(
  payslips: PayslipWithRelations[]
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    payslips.forEach((p, idx) => {
      if (idx > 0) doc.addPage();
      renderPayslip(doc, p);
    });
    doc.end();
  });
}