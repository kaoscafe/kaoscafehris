import { Routes, Route, Navigate } from "react-router-dom";
import AppShell from "@/components/app-shell";
import PortalShell from "@/components/portal-shell";
import ProtectedRoute from "@/components/protected-route";
import LoginPage from "@/features/auth/login-page";
import DashboardPage from "@/features/dashboard/dashboard-page";
import ReportsPage from "@/features/reports/reports-page";
import BranchesPage from "@/features/branches/branches-page";
import EmployeesPage from "@/features/employees/employees-page";
import SchedulingPage from "@/features/scheduling/scheduling-page";
import AttendancePage from "@/features/attendance/attendance-page";
import LeavePage from "@/features/leave/leave-page";
import PayrollPage from "@/features/payroll/payroll-page";
import PayrollRunDetailPage from "@/features/payroll/payroll-run-detail-page";
import MyPayslipsPage from "@/features/payroll/my-payslips-page";
import ProfilePage from "@/features/portal/profile-page";
import SettingsPage from "@/features/settings/settings-page";
import AuditLogsPage from "@/features/audit-logs/audit-logs-page";
import OvertimePage from "@/features/overtime/overtime-page";
import KioskPage from "@/features/kiosk/kiosk-page";
import HolidaysPage from "@/features/holidays/holidays-page";
import DeductionsPage from "@/features/deductions/deductions-page";

// Portal (employee mobile app)
import PortalHomePage from "@/features/portal/portal-home-page";
import PortalSchedulePage from "@/features/portal/portal-schedule-page";
import PortalAttendancePage from "@/features/portal/portal-attendance-page";
import PortalLeavePage from "@/features/portal/portal-leave-page";
import PortalPayslipsPage from "@/features/portal/portal-payslips-page";
import PortalProfilePage from "@/features/portal/portal-profile-page";
import PortalOvertimePage from "@/features/portal/portal-overtime-page";

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      {/* DTR — standalone, no sidebar, no auth required */}
      <Route path="/dtr" element={<KioskPage />} />

      {/* ── Employee Portal (mobile-first, bottom nav) ── */}
      <Route
        path="/portal"
        element={
          <ProtectedRoute allowed={["EMPLOYEE"]}>
            <PortalShell />
          </ProtectedRoute>
        }
      >
        <Route index element={<PortalHomePage />} />
        <Route path="schedule" element={<PortalSchedulePage />} />
        <Route path="attendance" element={<PortalAttendancePage />} />
        <Route path="leave" element={<PortalLeavePage />} />
        <Route path="payslips" element={<PortalPayslipsPage />} />
        <Route path="overtime" element={<PortalOvertimePage />} />
        <Route path="profile" element={<PortalProfilePage />} />
      </Route>

      {/* ── Admin / Manager App (sidebar) ── */}
      <Route
        element={
          <ProtectedRoute allowed={["ADMIN", "MANAGER"]}>
            <AppShell />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<DashboardPage />} />
        <Route
          path="/branches"
          element={
            <ProtectedRoute allowed={["ADMIN"]}>
              <BranchesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/reports"
          element={
            <ProtectedRoute allowed={["ADMIN", "MANAGER"]}>
              <ReportsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/employees"
          element={
            <ProtectedRoute allowed={["ADMIN", "MANAGER"]}>
              <EmployeesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/scheduling"
          element={
            <ProtectedRoute allowed={["ADMIN", "MANAGER"]}>
              <SchedulingPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/attendance"
          element={
            <ProtectedRoute allowed={["ADMIN", "MANAGER"]}>
              <AttendancePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/leave"
          element={
            <ProtectedRoute allowed={["ADMIN", "MANAGER"]}>
              <LeavePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/payroll"
          element={
            <ProtectedRoute allowed={["ADMIN"]}>
              <PayrollPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/payroll/:runId"
          element={
            <ProtectedRoute allowed={["ADMIN"]}>
              <PayrollRunDetailPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/overtime"
          element={
            <ProtectedRoute allowed={["ADMIN", "MANAGER"]}>
              <OvertimePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/payslips"
          element={
            <ProtectedRoute allowed={["MANAGER"]}>
              <MyPayslipsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile"
          element={
            <ProtectedRoute allowed={["MANAGER"]}>
              <ProfilePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/holidays"
          element={
            <ProtectedRoute allowed={["ADMIN"]}>
              <HolidaysPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/deductions"
          element={
            <ProtectedRoute allowed={["ADMIN"]}>
              <DeductionsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings"
          element={
            <ProtectedRoute allowed={["ADMIN"]}>
              <SettingsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/audit-logs"
          element={
            <ProtectedRoute allowed={["ADMIN"]}>
              <AuditLogsPage />
            </ProtectedRoute>
          }
        />
      </Route>

      {/* Catch-all: redirect to login */}
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
