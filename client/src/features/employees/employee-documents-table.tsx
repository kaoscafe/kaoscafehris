import { useState, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Loader2, Plus, Trash2, Download, Paperclip, Eye, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { extractErrorMessage } from "@/lib/api";
import { useAuthStore } from "@/features/auth/auth.store";
import {
  listEmployeeDocuments,
  uploadEmployeeDocument,
  deleteEmployeeDocument,
  getDocumentDownloadUrl,
  getDocumentPreviewUrl,
  type EmployeeDocument,
} from "./employee-documents.api";

const BRAND = "#8C1515";

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isPreviewable(mimeType: string): boolean {
  return mimeType.startsWith("image/") || mimeType === "application/pdf";
}

interface Props {
  employeeId: string;
}

export default function EmployeeDocumentsTable({ employeeId }: Props) {
  const qc = useQueryClient();
  const { toast } = useToast();
  // Managers may view, upload, download, and preview documents — only admins may delete.
  const isAdmin = useAuthStore((s) => s.user?.role) === "ADMIN";

  const [showAddRow, setShowAddRow] = useState(false);
  const [docName, setDocName] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [previewDoc, setPreviewDoc] = useState<EmployeeDocument | null>(null);

  const docsQuery = useQuery({
    queryKey: ["employee-documents", employeeId],
    queryFn: () => listEmployeeDocuments(employeeId),
  });

  const documents = docsQuery.data ?? [];

  function resetAddForm() {
    setDocName("");
    setSelectedFile(null);
    setShowAddRow(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const uploadMutation = useMutation({
    mutationFn: () => uploadEmployeeDocument(employeeId, docName, selectedFile!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employee-documents", employeeId] });
      toast("Document uploaded", "success");
      resetAddForm();
    },
    onError: (err) => toast(extractErrorMessage(err), "error"),
  });

  const deleteMutation = useMutation({
    mutationFn: (docId: string) => deleteEmployeeDocument(employeeId, docId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employee-documents", employeeId] });
      toast("Document deleted", "success");
    },
    onError: (err) => toast(extractErrorMessage(err), "error"),
  });

  const isLoading = docsQuery.isLoading;
  const canUpload = docName.trim().length > 0 && selectedFile !== null;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-bold uppercase tracking-widest" style={{ color: BRAND }}>
          Documents
        </h3>
        {!showAddRow && (
          <button
            type="button"
            onClick={() => setShowAddRow(true)}
            className="flex items-center gap-1 text-xs font-medium rounded-md px-2 py-1 border border-gray-200 hover:bg-gray-50 transition-colors"
          >
            <Plus className="h-3 w-3" /> Upload
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-4">
          <Loader2 className="h-4 w-4 animate-spin text-gray-300" />
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="px-3 py-2 text-left font-semibold uppercase tracking-wider text-gray-400">File Name</th>
                <th className="px-3 py-2 text-right font-semibold uppercase tracking-wider text-gray-400">Size</th>
                <th className="px-3 py-2 text-right font-semibold uppercase tracking-wider text-gray-400">Uploaded</th>
                <th className="w-24" />
              </tr>
            </thead>
            <tbody>
              {documents.length === 0 && !showAddRow && (
                <tr>
                  <td colSpan={4} className="py-5 text-center text-xs text-gray-400 italic">
                    No documents yet.
                  </td>
                </tr>
              )}

              {documents.map((doc) => (
                <tr key={doc.id} className="border-b last:border-b-0 hover:bg-gray-50">
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <Paperclip className="h-3 w-3 text-gray-400" />
                      <span className="font-medium text-gray-800">{doc.name}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-gray-500">
                    {formatFileSize(doc.size)}
                  </td>
                  <td className="px-3 py-2.5 text-right text-gray-500">
                    {format(new Date(doc.uploadedAt), "MMM d, yyyy")}
                  </td>
                  <td className="px-2 py-2.5">
                    <div className="flex items-center justify-end gap-1">
                      {isPreviewable(doc.mimeType) && (
                        <button
                          type="button"
                          onClick={() => setPreviewDoc(doc)}
                          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
                          title="Preview"
                        >
                          <Eye className="h-3 w-3" />
                        </button>
                      )}
                      <a
                        href={getDocumentDownloadUrl(employeeId, doc.id)}
                        download
                        className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
                        title="Download"
                      >
                        <Download className="h-3 w-3" />
                      </a>
                      {isAdmin && (
                        <button
                          type="button"
                          onClick={() => deleteMutation.mutate(doc.id)}
                          disabled={deleteMutation.isPending}
                          className="rounded p-1 text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-50"
                          title="Delete"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}

              {/* Inline add row */}
              {showAddRow && (
                <tr className="border-t bg-gray-50/50">
                  <td className="px-2 py-2">
                    <input
                      type="text"
                      placeholder="Document name (e.g. NBI Clearance)"
                      value={docName}
                      onChange={(e) => setDocName(e.target.value)}
                      className="w-full rounded border border-gray-200 bg-white px-2 py-1.5 text-xs focus:outline-none focus:border-red-400"
                      autoFocus
                    />
                  </td>
                  <td className="px-2 py-2 text-right">
                    {selectedFile ? (
                      <span className="text-xs text-gray-500">{formatFileSize(selectedFile.size)}</span>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-2 py-2 text-right">
                    {selectedFile ? (
                      <span className="text-xs text-gray-500 truncate max-w-[80px] inline-block" title={selectedFile.name}>
                        {selectedFile.name}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-2 py-2">
                    <div className="flex items-center justify-end gap-1">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".jpg,.jpeg,.png,.gif,.webp,.bmp,.pdf"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            setSelectedFile(file);
                            if (!docName) setDocName(file.name.replace(/\.[^/.]+$/, ""));
                          }
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="rounded px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 transition-colors"
                      >
                        {selectedFile ? "Change" : "Choose File"}
                      </button>
                      <button
                        type="button"
                        onClick={resetAddForm}
                        className="rounded px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 transition-colors"
                      >
                        Cancel
                      </button>
                      <Button
                        type="button"
                        size="sm"
                        disabled={!canUpload || uploadMutation.isPending}
                        onClick={() => uploadMutation.mutate()}
                        className="h-6 px-2 text-xs"
                      >
                        {uploadMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Upload"}
                      </Button>
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1">JPG, PNG, GIF, WebP, or PDF (max 10 MB)</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Preview modal */}
      {previewDoc && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"
          onClick={() => setPreviewDoc(null)}
        >
          <div
            className="flex flex-col bg-white rounded-xl shadow-2xl overflow-hidden w-full max-w-3xl max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <Paperclip className="h-4 w-4 text-gray-400 shrink-0" />
                <span className="font-semibold text-sm text-gray-800 truncate">{previewDoc.name}</span>
                <span className="text-xs text-gray-400 truncate hidden sm:inline">{previewDoc.originalName}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={getDocumentDownloadUrl(employeeId, previewDoc.id)}
                  download
                  className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 transition-colors"
                >
                  <Download className="h-3.5 w-3.5" /> Download
                </a>
                <button
                  type="button"
                  onClick={() => setPreviewDoc(null)}
                  className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Preview area */}
            <div className="flex-1 overflow-auto flex items-center justify-center bg-gray-50 min-h-0 p-4">
              {previewDoc.mimeType.startsWith("image/") ? (
                <img
                  src={getDocumentPreviewUrl(employeeId, previewDoc.id)}
                  alt={previewDoc.name}
                  className="max-w-full max-h-full object-contain rounded shadow"
                />
              ) : previewDoc.mimeType === "application/pdf" ? (
                <iframe
                  src={getDocumentPreviewUrl(employeeId, previewDoc.id)}
                  title={previewDoc.name}
                  className="w-full rounded"
                  style={{ minHeight: "60vh", height: "70vh" }}
                />
              ) : null}
            </div>

            {/* Footer: size + date */}
            <div className="px-4 py-2 border-t bg-gray-50 shrink-0 flex items-center gap-4 text-xs text-gray-400">
              <span>{formatFileSize(previewDoc.size)}</span>
              <span>Uploaded {format(new Date(previewDoc.uploadedAt), "MMM d, yyyy")}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
