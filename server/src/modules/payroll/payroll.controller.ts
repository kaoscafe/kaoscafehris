import type { Request, Response, NextFunction } from "express";
import { AppError } from "../../middleware/error-handler.js";
import { listPayrollRunsQuerySchema } from "./payroll.schema.js";
import * as payrollService from "./payroll.service.js";
import { payslipToBuffer, runToBuffer } from "./payroll.pdf.js";
import { runToXlsx } from "./payroll.xlsx.js";

type IdParams = { id: string };

export async function listRuns(req: Request, res: Response, next: NextFunction) {
  try {
    const query = listPayrollRunsQuerySchema.parse(req.query);
    const data = await payrollService.listRuns(query);
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function getRunById(
  req: Request<IdParams>,
  res: Response,
  next: NextFunction
) {
  try {
    const data = await payrollService.getRunById(req.params.id);
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function createRun(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await payrollService.createRun(req.body);
    res.status(201).json({ data });
  } catch (err) {
    next(err);
  }
}

export async function processRun(
  req: Request<IdParams>,
  res: Response,
  next: NextFunction
) {
  try {
    const data = await payrollService.processRun(req.params.id);
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function completeRun(
  req: Request<IdParams>,
  res: Response,
  next: NextFunction
) {
  try {
    if (!req.user) throw new AppError(401, "Authentication required");
    const { run, fullyPaidDeductions } = await payrollService.completeRun(req.params.id, req.user.userId);
    res.json({ data: run, fullyPaidDeductions });
  } catch (err) {
    next(err);
  }
}

export async function cancelRun(
  req: Request<IdParams>,
  res: Response,
  next: NextFunction
) {
  try {
    await payrollService.cancelRun(req.params.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function getPayslip(
  req: Request<IdParams>,
  res: Response,
  next: NextFunction
) {
  try {
    const data = await payrollService.getPayslipById(
      req.params.id,
      req.user?.role,
      req.user?.userId
    );
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function adjustPayslip(
  req: Request<IdParams>,
  res: Response,
  next: NextFunction
) {
  try {
    const data = await payrollService.adjustPayslip(req.params.id, req.body);
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

// --- Exports ---------------------------------------------------------------

function periodSlug(start: Date, end: Date): string {
  return `${start.toISOString().slice(0, 10)}_to_${end.toISOString().slice(0, 10)}`;
}

function sanitize(s: string): string {
  return s.replace(/[^a-zA-Z0-9._-]+/g, "-");
}

export async function getPayslipPdf(
  req: Request<IdParams>,
  res: Response,
  next: NextFunction
) {
  try {
    if (!req.user) throw new AppError(401, "Authentication required");
    const payslip = await payrollService.getPayslipForExport(req.params.id, req.user.role);
    payrollService.assertPayslipAccess(
      payslip.employee.userId,
      req.user.userId,
      req.user.role
    );
    // Non-admin callers can only download FINALIZED payslips.
    if (req.user.role !== "ADMIN" && payslip.status !== "FINALIZED") {
      throw new AppError(403, "Payslip is not yet released");
    }

    const pdf = await payslipToBuffer(payslip);
    const fname = sanitize(
      `payslip_${payslip.employee.employeeId}_${periodSlug(
        payslip.payrollRun.periodStart,
        payslip.payrollRun.periodEnd
      )}.pdf`
    );
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${fname}"`);
    res.setHeader("Content-Length", pdf.length.toString());
    res.end(pdf);
  } catch (err) {
    next(err);
  }
}

export async function getRunPdf(
  req: Request<IdParams>,
  res: Response,
  next: NextFunction
) {
  try {
    const run = await payrollService.getRunForExport(req.params.id, req.user?.role);
    const pdf = await runToBuffer(run.payslips);
    const fname = sanitize(
      `payroll_${run.branch.name}_${periodSlug(
        run.periodStart,
        run.periodEnd
      )}.pdf`
    );
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${fname}"`);
    res.setHeader("Content-Length", pdf.length.toString());
    res.end(pdf);
  } catch (err) {
    next(err);
  }
}

export async function getRunXlsx(
  req: Request<IdParams>,
  res: Response,
  next: NextFunction
) {
  try {
    const run = await payrollService.getRunForExport(req.params.id, req.user?.role);
    const xlsx = await runToXlsx(run);
    const fname = sanitize(
      `payroll_${run.branch.name}_${periodSlug(
        run.periodStart,
        run.periodEnd
      )}.xlsx`
    );
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", `attachment; filename="${fname}"`);
    res.setHeader("Content-Length", xlsx.length.toString());
    res.end(xlsx);
  } catch (err) {
    next(err);
  }
}

export async function listMyPayslips(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    if (!req.user) throw new AppError(401, "Authentication required");
    const data = await payrollService.listMyPayslips(req.user.userId);
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function getMyPayslipDetail(
  req: Request<IdParams>,
  res: Response,
  next: NextFunction
) {
  try {
    if (!req.user) throw new AppError(401, "Authentication required");
    const payslip = await payrollService.getPayslipForExport(req.params.id, req.user.role);
    payrollService.assertPayslipAccess(
      payslip.employee.userId,
      req.user.userId,
      req.user.role
    );
    if (req.user.role !== "ADMIN" && payslip.status !== "FINALIZED") {
      throw new AppError(403, "Payslip is not yet released");
    }
    res.json({ data: payslip });
  } catch (err) {
    next(err);
  }
}
