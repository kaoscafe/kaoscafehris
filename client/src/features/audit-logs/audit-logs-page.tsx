import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Eye, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { extractErrorMessage } from "@/lib/api";
import {
  getAuditLogTables,
  listAuditLogs,
  type AuditAction,
  type AuditLog,
  type AuditLogQuery,
} from "./audit-logs.api";

const ACTIONS: AuditAction[] = ["CREATE", "UPDATE", "DELETE"];

function actionBadge(action: AuditAction) {
  switch (action) {
    case "CREATE":
      return <Badge variant="success">Create</Badge>;
    case "UPDATE":
      return <Badge variant="warn">Update</Badge>;
    case "DELETE":
      return <Badge variant="destructive">Delete</Badge>;
  }
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString();
}

export default function AuditLogsPage() {
  const [action, setAction] = useState<"" | AuditAction>("");
  const [tableName, setTableName] = useState<string>("");
  const [recordId, setRecordId] = useState<string>("");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [page, setPage] = useState<number>(1);
  const [selected, setSelected] = useState<AuditLog | null>(null);

  const tablesQuery = useQuery({
    queryKey: ["audit-log-tables"],
    queryFn: getAuditLogTables,
  });

  const params: AuditLogQuery = useMemo(
    () => ({
      action: action || undefined,
      tableName: tableName || undefined,
      recordId: recordId || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      page,
      pageSize: 50,
    }),
    [action, tableName, recordId, startDate, endDate, page]
  );

  const query = useQuery({
    queryKey: ["audit-logs", action, tableName, recordId, startDate, endDate, page],
    queryFn: () => listAuditLogs(params),
    placeholderData: (prev) => prev,
  });

  function resetFilters() {
    setAction("");
    setTableName("");
    setRecordId("");
    setStartDate("");
    setEndDate("");
    setPage(1);
  }

  const totalPages = query.data?.totalPages ?? 1;

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 md:px-8">
      <div>
        <h1 className="font-heading text-3xl font-bold text-gray-900">Audit Logs</h1>
        <p className="text-sm text-muted-foreground">
          Track changes made to records across the system.
        </p>
      </div>

      <div className="grid gap-3 rounded-lg border bg-card p-4 md:grid-cols-3 lg:grid-cols-6">
        <div className="space-y-1.5">
          <Label htmlFor="f-action">Action</Label>
          <Select
            id="f-action"
            value={action}
            onChange={(e) => {
              setAction(e.target.value as "" | AuditAction);
              setPage(1);
            }}
          >
            <option value="">All</option>
            {ACTIONS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="f-table">Table</Label>
          <Select
            id="f-table"
            value={tableName}
            onChange={(e) => {
              setTableName(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All</option>
            {(tablesQuery.data ?? []).map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="f-record">Record ID</Label>
          <Input
            id="f-record"
            placeholder="UUID"
            value={recordId}
            onChange={(e) => setRecordId(e.target.value)}
            onBlur={() => setPage(1)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="f-start">From</Label>
          <Input
            id="f-start"
            type="date"
            value={startDate}
            onChange={(e) => {
              setStartDate(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="f-end">To</Label>
          <Input
            id="f-end"
            type="date"
            value={endDate}
            onChange={(e) => {
              setEndDate(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <div className="flex items-end">
          <Button variant="outline" onClick={resetFilters} className="w-full">
            Reset
          </Button>
        </div>
      </div>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Table</TableHead>
              <TableHead>Record</TableHead>
              <TableHead>User</TableHead>
              <TableHead>IP</TableHead>
              <TableHead className="text-right">Details</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {query.isLoading && (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
                </TableCell>
              </TableRow>
            )}
            {query.isError && (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="py-10 text-center text-destructive"
                >
                  {extractErrorMessage(query.error, "Failed to load audit logs")}
                </TableCell>
              </TableRow>
            )}
            {query.data && query.data.items.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="py-10 text-center text-muted-foreground"
                >
                  No audit log entries match the filters.
                </TableCell>
              </TableRow>
            )}
            {query.data?.items.map((log) => (
              <TableRow key={log.id}>
                <TableCell className="whitespace-nowrap tabular-nums text-xs">
                  {formatTimestamp(log.createdAt)}
                </TableCell>
                <TableCell>{actionBadge(log.action)}</TableCell>
                <TableCell className="font-mono text-xs">{log.tableName}</TableCell>
                <TableCell className="font-mono text-xs">
                  <span title={log.recordId}>
                    {log.recordId.length > 12
                      ? `${log.recordId.slice(0, 8)}…`
                      : log.recordId}
                  </span>
                </TableCell>
                <TableCell className="text-xs">
                  {log.user ? log.user.email : "system"}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {log.ipAddress ?? "—"}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelected(log)}
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-xs text-muted-foreground">
          {query.data
            ? `${query.data.total.toLocaleString()} total · page ${query.data.page} of ${query.data.totalPages}`
            : ""}
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1 || query.isFetching}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            <ChevronLeft className="h-4 w-4" />
            Prev
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages || query.isFetching}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <DetailsDialog log={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function DetailsDialog({
  log,
  onClose,
}: {
  log: AuditLog | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={!!log} onOpenChange={(o) => !o && onClose()}>
      <DialogHeader>
        <DialogTitle>Audit log detail</DialogTitle>
        <DialogDescription>
          {log
            ? `${log.action} on ${log.tableName} at ${formatTimestamp(log.createdAt)}`
            : ""}
        </DialogDescription>
      </DialogHeader>

      {log && (
        <div className="space-y-4 pt-4 text-xs">
          <div className="grid gap-3 sm:grid-cols-2">
            <KeyValue label="Record ID" value={log.recordId} mono />
            <KeyValue
              label="User"
              value={log.user ? `${log.user.email} (${log.user.role})` : "system"}
            />
            <KeyValue label="IP address" value={log.ipAddress ?? "—"} />
            <KeyValue
              label="User agent"
              value={log.userAgent ?? "—"}
              className="truncate"
            />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <JsonBlock label="Old values" value={log.oldValues} />
            <JsonBlock label="New values" value={log.newValues} />
          </div>
        </div>
      )}

      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
      </DialogFooter>
    </Dialog>
  );
}

function KeyValue({
  label,
  value,
  mono,
  className,
}: {
  label: string;
  value: string;
  mono?: boolean;
  className?: string;
}) {
  return (
    <div className="space-y-1">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className={[mono ? "font-mono" : "", className ?? ""].join(" ")}>
        {value}
      </div>
    </div>
  );
}

function JsonBlock({ label, value }: { label: string; value: unknown }) {
  const json =
    value === null || value === undefined
      ? "—"
      : JSON.stringify(value, null, 2);
  return (
    <div className="space-y-1">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <pre className="max-h-64 overflow-auto rounded-md border bg-muted/30 p-2 font-mono text-[11px] leading-relaxed">
        {json}
      </pre>
    </div>
  );
}
