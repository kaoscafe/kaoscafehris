import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Building2, Calendar, Camera, CreditCard,
  Download, Eye, FileText, KeyRound, Loader2, LogOut,
  Mail, MapPin, Paperclip, Phone, Plus, Trash2, User, X,
} from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { PasswordInput } from "@/components/ui/password-input";
import { extractErrorMessage } from "@/lib/api";
import { useLogout } from "@/features/auth/use-login";
import {
  changePassword,
  deleteMyDocument,
  getMyDocumentDownloadUrl,
  getMyDocumentPreviewUrl,
  getProfile,
  listMyDocuments,
  updateProfile,
  uploadMyDocument,
  uploadProfilePhoto,
  type MyDocument,
  type UpdateProfileInput,
} from "./portal.api";

const BRAND = "#8C1515";

const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

function fmtDate(iso: string) {
  const d = new Date(iso.slice(0, 10) + "T00:00:00");
  return `${MONTH_NAMES[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

// ─── Edit Profile Form ───────────────────────────────────────────────────────

const profileSchema = z.object({
  email: z.string().trim().email("Invalid email address").min(1, "Required"),
  phone: z.string().trim().max(30).optional(),
  address: z.string().trim().max(255).optional(),
});
type ProfileValues = z.infer<typeof profileSchema>;

function EditProfileSheet({
  initialValues,
  onClose,
}: {
  initialValues: ProfileValues;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { register, handleSubmit } = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: initialValues,
  });

  const mut = useMutation({
    mutationFn: (v: ProfileValues) => updateProfile(v as UpdateProfileInput),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["portal-profile"] });
      toast("Profile updated", "success");
      onClose();
    },
    onError: (err) => toast(extractErrorMessage(err), "error"),
  });

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-white">
      <div className="flex items-center justify-between px-5 pt-14 pb-5" style={{ backgroundColor: BRAND }}>
        <h2 className="text-xl font-bold text-white">Edit Profile</h2>
        <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-white">
          <X className="h-5 w-5" />
        </button>
      </div>

      <form
        onSubmit={handleSubmit((v) => mut.mutate(v))}
        className="flex flex-col flex-1"
        noValidate
      >
        <div className="flex-1 overflow-y-auto px-5 py-6 space-y-4" style={{ backgroundColor: "#FAF0F0" }}>
          {[
            { label: "Email Address", name: "email" as const, placeholder: "email@example.com" },
            { label: "Phone Number", name: "phone" as const, placeholder: "+63 XXX XXX XXXX" },
            { label: "Address", name: "address" as const, placeholder: "Street address" },
          ].map(({ label, name, placeholder }) => (
            <div key={name} className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">{label}</label>
              <input
                {...register(name)}
                placeholder={placeholder}
                className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700"
              />
            </div>
          ))}
        </div>

        <div className="px-5 pb-8 pt-3 bg-white border-t border-gray-100">
          <button
            type="submit"
            disabled={mut.isPending}
            className="w-full rounded-full py-3.5 text-sm font-semibold text-white"
            style={{ backgroundColor: BRAND }}
          >
            {mut.isPending ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : "Save Changes"}
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── Change Password Sheet ───────────────────────────────────────────────────

function ChangePasswordSheet({ onClose }: { onClose: () => void }) {
  const { toast } = useToast();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const mut = useMutation({
    mutationFn: () => changePassword({ currentPassword, newPassword }),
    onSuccess: () => {
      toast("Password changed successfully", "success");
      onClose();
    },
    onError: (err) => toast(extractErrorMessage(err), "error"),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!currentPassword) { toast("Enter your current password", "error"); return; }
    if (newPassword.length < 6) { toast("New password must be at least 6 characters", "error"); return; }
    if (newPassword !== confirmPassword) { toast("Passwords do not match", "error"); return; }
    mut.mutate();
  }

  const inputClass = "w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700";

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-white">
      <div className="flex items-center justify-between px-5 pt-14 pb-5" style={{ backgroundColor: BRAND }}>
        <h2 className="text-xl font-bold text-white">Change Password</h2>
        <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-white">
          <X className="h-5 w-5" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col flex-1">
        <div className="flex-1 overflow-y-auto px-5 py-6 space-y-4" style={{ backgroundColor: "#FAF0F0" }}>
          {[
            { label: "Current Password", value: currentPassword, setter: setCurrentPassword },
            { label: "New Password", value: newPassword, setter: setNewPassword },
            { label: "Confirm New Password", value: confirmPassword, setter: setConfirmPassword },
          ].map(({ label, value, setter }) => (
            <div key={label} className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">{label}</label>
              <PasswordInput
                value={value}
                onChange={(e) => setter(e.target.value)}
                className={inputClass}
                autoComplete="new-password"
              />
            </div>
          ))}
        </div>

        <div className="px-5 pb-8 pt-3 bg-white border-t border-gray-100">
          <button
            type="submit"
            disabled={mut.isPending}
            className="w-full rounded-full py-3.5 text-sm font-semibold text-white"
            style={{ backgroundColor: BRAND }}
          >
            {mut.isPending ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : "Update Password"}
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── Info Row ────────────────────────────────────────────────────────────────

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="flex items-start gap-3 py-1.5">
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: "#FAF0F0" }}>
        <Icon className="h-4 w-4" style={{ color: "#999" }} />
      </div>
      <div>
        <p className="text-xs text-gray-400">{label}</p>
        <p className="text-sm font-medium text-gray-800">{value || "—"}</p>
      </div>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isPreviewable(mimeType: string) {
  return mimeType.startsWith("image/") || mimeType === "application/pdf";
}

// ─── Upload Document Sheet ───────────────────────────────────────────────────

function UploadDocumentSheet({ onClose }: { onClose: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [docName, setDocName] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const mut = useMutation({
    mutationFn: () => uploadMyDocument(docName.trim(), selectedFile!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-documents"] });
      toast("Document uploaded", "success");
      onClose();
    },
    onError: (err) => toast(extractErrorMessage(err), "error"),
  });

  const canUpload = docName.trim().length > 0 && selectedFile !== null;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-white">
      <div className="flex items-center justify-between px-5 pt-14 pb-5" style={{ backgroundColor: BRAND }}>
        <h2 className="text-xl font-bold text-white">Upload Document</h2>
        <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-white">
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex flex-col flex-1 overflow-y-auto px-5 py-6 space-y-4" style={{ backgroundColor: "#FAF0F0" }}>
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-gray-700">Document Name</label>
          <input
            type="text"
            value={docName}
            onChange={(e) => setDocName(e.target.value)}
            placeholder="e.g. NBI Clearance, Resume"
            className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700 focus:outline-none"
            autoFocus
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-gray-700">File</label>
          <input
            ref={fileInputRef}
            type="file"
            accept=".jpg,.jpeg,.png,.gif,.webp,.bmp,.pdf"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                setSelectedFile(file);
                if (!docName.trim()) setDocName(file.name.replace(/\.[^/.]+$/, ""));
              }
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-full flex items-center gap-3 rounded-2xl border-2 border-dashed border-gray-200 bg-white px-4 py-4 text-sm text-gray-500 hover:border-gray-300 transition-colors"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: "#FAF0F0" }}>
              <Paperclip className="h-4 w-4" style={{ color: BRAND }} />
            </div>
            {selectedFile ? (
              <div className="text-left min-w-0">
                <p className="font-medium text-gray-800 truncate">{selectedFile.name}</p>
                <p className="text-xs text-gray-400">{formatFileSize(selectedFile.size)}</p>
              </div>
            ) : (
              <span>Tap to choose a file</span>
            )}
          </button>
          <p className="text-xs text-gray-400">JPG, PNG, GIF, WebP, or PDF (max 10 MB)</p>
        </div>
      </div>

      <div className="px-5 pb-8 pt-3 bg-white border-t border-gray-100">
        <button
          type="button"
          disabled={!canUpload || mut.isPending}
          onClick={() => mut.mutate()}
          className="w-full rounded-full py-3.5 text-sm font-semibold text-white disabled:opacity-50"
          style={{ backgroundColor: BRAND }}
        >
          {mut.isPending ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : "Upload Document"}
        </button>
      </div>
    </div>
  );
}

// ─── Document Preview Sheet ──────────────────────────────────────────────────

function DocumentPreviewSheet({ doc, onClose }: { doc: MyDocument; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[110] flex flex-col bg-black">
      <div className="flex items-center justify-between px-5 pt-14 pb-4 bg-black/80">
        <div className="min-w-0">
          <p className="font-semibold text-white truncate">{doc.name}</p>
          <p className="text-xs text-white/50 truncate">{doc.originalName}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-3">
          <a
            href={getMyDocumentDownloadUrl(doc.id)}
            download
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white"
          >
            <Download className="h-4 w-4" />
          </a>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto flex items-center justify-center p-4 min-h-0">
        {doc.mimeType.startsWith("image/") ? (
          <img
            src={getMyDocumentPreviewUrl(doc.id)}
            alt={doc.name}
            className="max-w-full max-h-full object-contain rounded"
          />
        ) : (
          <iframe
            src={getMyDocumentPreviewUrl(doc.id)}
            title={doc.name}
            className="w-full rounded bg-white"
            style={{ height: "80vh" }}
          />
        )}
      </div>

      <div className="px-5 py-3 bg-black/80 text-xs text-white/40 flex gap-4">
        <span>{formatFileSize(doc.size)}</span>
        <span>Uploaded {format(new Date(doc.uploadedAt), "MMM d, yyyy")}</span>
      </div>
    </div>
  );
}

// ─── My Documents Card ───────────────────────────────────────────────────────

function MyDocumentsCard() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<MyDocument | null>(null);

  const docsQuery = useQuery({
    queryKey: ["my-documents"],
    queryFn: listMyDocuments,
  });

  const deleteMut = useMutation({
    mutationFn: (docId: string) => deleteMyDocument(docId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-documents"] });
      toast("Document deleted", "success");
    },
    onError: (err) => toast(extractErrorMessage(err), "error"),
  });

  const docs = docsQuery.data ?? [];

  return (
    <>
      <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-800">My Documents</h2>
          <button
            type="button"
            onClick={() => setUploadOpen(true)}
            className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-white"
            style={{ backgroundColor: BRAND }}
          >
            <Plus className="h-3 w-3" /> Upload
          </button>
        </div>

        {docsQuery.isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-gray-300" />
          </div>
        ) : docs.length === 0 ? (
          <div className="flex flex-col items-center py-8 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl mb-3" style={{ backgroundColor: "#FAF0F0" }}>
              <FileText className="h-6 w-6" style={{ color: BRAND }} />
            </div>
            <p className="text-sm text-gray-500">No documents uploaded yet</p>
            <p className="text-xs text-gray-400 mt-1">Upload your clearances, IDs, or certificates</p>
          </div>
        ) : (
          <div className="space-y-2">
            {docs.map((doc) => (
              <div
                key={doc.id}
                className="flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50 px-3 py-3"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: "#FAF0F0" }}>
                  <Paperclip className="h-4 w-4" style={{ color: BRAND }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{doc.name}</p>
                  <p className="text-xs text-gray-400">{formatFileSize(doc.size)} · {format(new Date(doc.uploadedAt), "MMM d, yyyy")}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {isPreviewable(doc.mimeType) && (
                    <button
                      type="button"
                      onClick={() => setPreviewDoc(doc)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-200 transition-colors"
                    >
                      <Eye className="h-4 w-4" />
                    </button>
                  )}
                  <a
                    href={getMyDocumentDownloadUrl(doc.id)}
                    download
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-200 transition-colors"
                  >
                    <Download className="h-4 w-4" />
                  </a>
                  <button
                    type="button"
                    onClick={() => deleteMut.mutate(doc.id)}
                    disabled={deleteMut.isPending}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-red-400 hover:bg-red-50 transition-colors disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {uploadOpen && <UploadDocumentSheet onClose={() => setUploadOpen(false)} />}
      {previewDoc && <DocumentPreviewSheet doc={previewDoc} onClose={() => setPreviewDoc(null)} />}
    </>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function PortalProfilePage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [changePwOpen, setChangePwOpen] = useState(false);
  const logoutMut = useLogout();
  const navigate = useNavigate();

  const query = useQuery({ queryKey: ["portal-profile"], queryFn: getProfile });

  const photoMut = useMutation({
    mutationFn: (file: File) => uploadProfilePhoto(file),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["portal-profile"] });
      toast("Photo updated", "success");
    },
    onError: (err) => toast(extractErrorMessage(err), "error"),
  });

  if (query.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center" style={{ backgroundColor: "#FAF0F0" }}>
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  const profile = query.data;
  const emp = profile?.employee;
  const fullName = emp ? `${emp.firstName} ${emp.middleName ? emp.middleName[0] + ". " : ""}${emp.lastName}` : profile?.email ?? "";
  const initials = emp
    ? `${emp.firstName[0]}${emp.lastName[0]}`.toUpperCase()
    : (profile?.email?.[0] ?? "U").toUpperCase();

  const address = [emp?.address, emp?.city, emp?.province, emp?.zipCode].filter(Boolean).join(", ");

  return (
    <div style={{ backgroundColor: "#FAF0F0" }}>
      {/* Header with photo */}
      <div className="rounded-b-[28px] px-6 pt-14 pb-8 text-center" style={{ backgroundColor: BRAND }}>
        <div className="flex justify-end mb-2">
          <img src="/kaos-logo.svg" alt="KAOS" className="h-8 w-auto brightness-0 invert opacity-60" />
        </div>

        {/* Avatar */}
        <div className="relative inline-block mb-3">
          {emp?.profilePhoto ? (
            <img
              src={emp.profilePhoto}
              alt={fullName}
              className="h-20 w-20 rounded-full object-cover border-2 border-white/30"
            />
          ) : (
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-white/20 text-2xl font-bold text-white">
              {initials}
            </div>
          )}
          <button
            type="button"
            disabled={photoMut.isPending}
            onClick={() => photoInputRef.current?.click()}
            className="absolute bottom-0 right-0 flex h-7 w-7 items-center justify-center rounded-full bg-white shadow-md"
          >
            {photoMut.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" style={{ color: BRAND }} />
            ) : (
              <Camera className="h-3.5 w-3.5" style={{ color: BRAND }} />
            )}
          </button>
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) photoMut.mutate(file);
            }}
          />
        </div>

        <p className="text-white font-bold text-lg">{fullName}</p>
        <p className="text-white/70 text-sm">{emp?.position ?? profile?.role}</p>
      </div>

      <div className="px-4 pt-5 pb-24 space-y-4">
        {/* Personal Information */}
        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-800">Personal Information</h2>
            <button
              onClick={() => setEditOpen(true)}
              className="text-sm font-medium"
              style={{ color: BRAND }}
            >
              Edit
            </button>
          </div>

          <InfoRow icon={Mail} label="Email" value={profile?.email} />
          <InfoRow icon={Phone} label="Phone" value={emp?.phone} />
          <InfoRow icon={Calendar} label="Birthdate" value={emp?.dateOfBirth ? fmtDate(emp.dateOfBirth) : null} />
          <InfoRow icon={MapPin} label="Address" value={address || null} />
        </div>

        {/* Employment Details */}
        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
          <h2 className="font-semibold text-gray-800 mb-3">Employment Details</h2>

          <InfoRow icon={User} label="Role" value={emp?.position} />
          <InfoRow icon={Building2} label="Branch" value={emp?.branch?.name} />
          <InfoRow icon={CreditCard} label="Employee ID" value={emp?.employeeId} />
          <InfoRow icon={Calendar} label="Join Date" value={emp?.dateHired ? fmtDate(emp.dateHired) : null} />
        </div>

        {/* My Documents */}
        <MyDocumentsCard />

        {/* Change Password */}
        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: "#FAF0F0" }}>
                <KeyRound className="h-4 w-4" style={{ color: "#999" }} />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-800">Password</p>
                <p className="text-xs text-gray-400">Update your account password</p>
              </div>
            </div>
            <button
              onClick={() => setChangePwOpen(true)}
              className="text-sm font-medium"
              style={{ color: BRAND }}
            >
              Change
            </button>
          </div>
        </div>

        {/* Logout */}
        <button
          onClick={() => {
            logoutMut.mutate(undefined, {
              onSettled: () => navigate("/login", { replace: true }),
            });
          }}
          disabled={logoutMut.isPending}
          className="w-full flex items-center justify-center gap-2 rounded-full py-4 text-sm font-semibold text-white"
          style={{ backgroundColor: BRAND }}
        >
          {logoutMut.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <LogOut className="h-4 w-4" />
              Logout
            </>
          )}
        </button>
      </div>

      {changePwOpen && (
        <ChangePasswordSheet onClose={() => setChangePwOpen(false)} />
      )}

      {editOpen && emp && (
        <EditProfileSheet
          initialValues={{
            email: profile?.email ?? "",
            phone: emp.phone ?? "",
            address: emp.address ?? "",
          }}
          onClose={() => setEditOpen(false)}
        />
      )}
    </div>
  );
}
