import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Camera, Download, Eye, FileText, KeyRound, Loader2,
  Paperclip, Pencil, Plus, Trash2,
} from "lucide-react";
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
import { useToast } from "@/components/ui/toast";
import { extractErrorMessage } from "@/lib/api";
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

const profileSchema = z.object({
  phone: z.string().trim().max(30).optional(),
  address: z.string().trim().max(255).optional(),
  city: z.string().trim().max(100).optional(),
  province: z.string().trim().max(100).optional(),
  zipCode: z.string().trim().max(20).optional(),
  emergencyName: z.string().trim().max(120).optional(),
  emergencyPhone: z.string().trim().max(30).optional(),
  emergencyRelation: z.string().trim().max(60).optional(),
});

type ProfileValues = z.infer<typeof profileSchema>;

// ─── Document helpers ─────────────────────────────────────────────────────────

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isPreviewable(mimeType: string) {
  return mimeType.startsWith("image/") || mimeType === "application/pdf";
}

// ─── Upload Document Sheet ─────────────────────────────────────────────────────

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
    <Dialog open onOpenChange={onClose}>
      <DialogHeader>
        <DialogTitle>Upload Document</DialogTitle>
        <DialogDescription>Add a file to your profile.</DialogDescription>
      </DialogHeader>
      <div className="space-y-4 pt-2">
        <div className="space-y-1.5">
          <Label htmlFor="doc-name">Document Name</Label>
          <Input
            id="doc-name"
            value={docName}
            onChange={(e) => setDocName(e.target.value)}
            placeholder="e.g. NBI Clearance, Resume"
            autoFocus
          />
        </div>
        <div className="space-y-1.5">
          <Label>File</Label>
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
            className="w-full flex items-center gap-3 rounded-lg border-2 border-dashed border-gray-200 bg-gray-50 px-4 py-4 text-sm text-gray-500 hover:border-gray-300 transition-colors"
          >
            <Paperclip className="h-4 w-4 text-muted-foreground" />
            {selectedFile ? (
              <div className="text-left min-w-0">
                <p className="font-medium text-gray-800 truncate">{selectedFile.name}</p>
                <p className="text-xs text-gray-400">{formatFileSize(selectedFile.size)}</p>
              </div>
            ) : (
              <span>Choose a file</span>
            )}
          </button>
          <p className="text-xs text-gray-400">JPG, PNG, GIF, WebP, or PDF (max 10 MB)</p>
        </div>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="button" disabled={!canUpload || mut.isPending} onClick={() => mut.mutate()}>
          {mut.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Upload
        </Button>
      </DialogFooter>
    </Dialog>
  );
}

// ─── Document Preview Sheet ────────────────────────────────────────────────────

function DocumentPreviewSheet({ doc, onClose }: { doc: MyDocument; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogHeader>
        <DialogTitle className="truncate">{doc.name}</DialogTitle>
        <DialogDescription className="truncate">{doc.originalName}</DialogDescription>
      </DialogHeader>
      <div className="flex-1 overflow-auto flex items-center justify-center min-h-[40vh] bg-gray-50 rounded-lg">
        {doc.mimeType.startsWith("image/") ? (
          <img
            src={getMyDocumentPreviewUrl(doc.id)}
            alt={doc.name}
            className="max-w-full max-h-[60vh] object-contain"
          />
        ) : (
          <iframe
            src={getMyDocumentPreviewUrl(doc.id)}
            title={doc.name}
            className="w-full rounded"
            style={{ height: "60vh" }}
          />
        )}
      </div>
      <div className="text-xs text-muted-foreground flex gap-4 pt-2">
        <span>{formatFileSize(doc.size)}</span>
        <span>Uploaded {format(new Date(doc.uploadedAt), "MMM d, yyyy")}</span>
      </div>
      <DialogFooter>
        <a
          href={getMyDocumentDownloadUrl(doc.id)}
          download
          className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium border border-gray-200 hover:bg-gray-50"
        >
          <Download className="h-4 w-4" />
          Download
        </a>
        <Button type="button" variant="outline" onClick={onClose}>Close</Button>
      </DialogFooter>
    </Dialog>
  );
}

// ─── My Documents Card ─────────────────────────────────────────────────────────

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
      <div className="rounded-lg border bg-card p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold">Documents</h2>
            <p className="text-sm text-muted-foreground">Clearances, IDs, certificates, and other files.</p>
          </div>
          <Button size="sm" onClick={() => setUploadOpen(true)}>
            <Plus className="h-4 w-4" />
            Upload
          </Button>
        </div>

        {docsQuery.isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : docs.length === 0 ? (
          <div className="flex flex-col items-center py-8 text-center">
            <FileText className="h-8 w-8 text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">No documents uploaded yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {docs.map((doc) => (
              <div
                key={doc.id}
                className="flex items-center gap-3 rounded-lg border px-4 py-3"
              >
                <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{doc.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatFileSize(doc.size)} · {format(new Date(doc.uploadedAt), "MMM d, yyyy")}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {isPreviewable(doc.mimeType) && (
                    <button
                      type="button"
                      onClick={() => setPreviewDoc(doc)}
                      className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-gray-100 transition-colors"
                    >
                      <Eye className="h-4 w-4" />
                    </button>
                  )}
                  <a
                    href={getMyDocumentDownloadUrl(doc.id)}
                    download
                    className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-gray-100 transition-colors"
                  >
                    <Download className="h-4 w-4" />
                  </a>
                  <button
                    type="button"
                    onClick={() => deleteMut.mutate(doc.id)}
                    disabled={deleteMut.isPending}
                    className="flex h-8 w-8 items-center justify-center rounded-md text-red-400 hover:bg-red-50 transition-colors disabled:opacity-50"
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

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [pwOpen, setPwOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const query = useQuery({ queryKey: ["portal-profile"], queryFn: getProfile });

  const photoMut = useMutation({
    mutationFn: (file: File) => uploadProfilePhoto(file),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["portal-profile"] });
      toast("Photo updated", "success");
      if (photoInputRef.current) photoInputRef.current.value = "";
    },
    onError: (err) => toast(extractErrorMessage(err), "error"),
  });

  if (query.isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!query.data) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10 text-center">
        <p className="text-destructive">
          {extractErrorMessage(query.error, "Failed to load profile")}
        </p>
      </div>
    );
  }

  const profile = query.data;
  const emp = profile.employee;

  const initials = emp
    ? `${emp.firstName[0]}${emp.lastName[0]}`.toUpperCase()
    : profile.email[0].toUpperCase();

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8 md:px-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Profile</h1>
          <p className="text-sm text-muted-foreground">
            Manage your personal details and account settings.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setEditOpen(true)}>
            <Pencil className="h-4 w-4" />
            Edit Profile
          </Button>
          <Button variant="outline" onClick={() => setPwOpen(true)}>
            <KeyRound className="h-4 w-4" />
            Change Password
          </Button>
        </div>
      </div>

      {/* Profile summary card */}
      <div className="rounded-lg border bg-card p-6">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
          {/* Avatar with upload overlay */}
          <div className="shrink-0">
            <div className="group relative h-20 w-20">
              {emp?.profilePhoto ? (
                <img
                  src={emp.profilePhoto}
                  alt={initials}
                  className="h-20 w-20 rounded-full object-cover"
                />
              ) : (
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-muted text-xl font-semibold text-muted-foreground">
                  {initials}
                </div>
              )}
              <button
                type="button"
                disabled={photoMut.isPending}
                onClick={() => photoInputRef.current?.click()}
                className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 transition-opacity group-hover:opacity-100 disabled:cursor-not-allowed"
                title="Change photo"
              >
                {photoMut.isPending ? (
                  <Loader2 className="h-5 w-5 animate-spin text-white" />
                ) : (
                  <Camera className="h-5 w-5 text-white" />
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
            <p className="mt-1.5 text-center text-xs text-muted-foreground">
              Click to change
            </p>
          </div>

          {/* Info grid */}
          <div className="flex-1 grid gap-4 md:grid-cols-2">
            <div>
              <div className="text-xs font-medium text-muted-foreground">Name</div>
              <div className="text-base font-semibold">
                {emp ? `${emp.firstName} ${emp.lastName}` : "—"}
              </div>
            </div>
            <div>
              <div className="text-xs font-medium text-muted-foreground">Employee ID</div>
              <div className="text-base">{emp?.employeeId ?? "—"}</div>
            </div>
            <div>
              <div className="text-xs font-medium text-muted-foreground">Email</div>
              <div className="text-base">{profile.email}</div>
            </div>
            <div>
              <div className="text-xs font-medium text-muted-foreground">Role</div>
              <div className="text-base">{profile.role}</div>
            </div>
            <div>
              <div className="text-xs font-medium text-muted-foreground">Position</div>
              <div className="text-base">{emp?.position ?? "—"}</div>
            </div>
            <div>
              <div className="text-xs font-medium text-muted-foreground">Branch</div>
              <div className="text-base">{emp?.branch?.name ?? "—"}</div>
            </div>
            <div>
              <div className="text-xs font-medium text-muted-foreground">Date Hired</div>
              <div className="text-base">{emp?.dateHired?.slice(0, 10) ?? "—"}</div>
            </div>
            <div>
              <div className="text-xs font-medium text-muted-foreground">Status</div>
              <div className="text-base">{emp?.employmentStatus ?? "—"}</div>
            </div>
            {emp?.phone && (
              <div>
                <div className="text-xs font-medium text-muted-foreground">Phone</div>
                <div className="text-base">{emp.phone}</div>
              </div>
            )}
            {(emp?.address || emp?.city) && (
              <div className="md:col-span-2">
                <div className="text-xs font-medium text-muted-foreground">Address</div>
                <div className="text-base">
                  {[emp.address, emp.city, emp.province, emp.zipCode].filter(Boolean).join(", ")}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <MyDocumentsCard />

      <EditProfileDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        profile={profile}
      />
      <ChangePasswordDialog open={pwOpen} onOpenChange={setPwOpen} />
    </div>
  );
}

// ── Edit Profile Dialog ───────────────────────────────────────────────────────

type ProfileData = NonNullable<Awaited<ReturnType<typeof getProfile>>>;

function EditProfileDialog({
  open,
  onOpenChange,
  profile,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  profile: ProfileData;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const emp = profile.employee;

  const { register, handleSubmit, reset } = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      phone: emp?.phone ?? "",
      address: emp?.address ?? "",
      city: emp?.city ?? "",
      province: emp?.province ?? "",
      zipCode: emp?.zipCode ?? "",
      emergencyName: emp?.emergencyName ?? "",
      emergencyPhone: emp?.emergencyPhone ?? "",
      emergencyRelation: emp?.emergencyRelation ?? "",
    },
  });

  useEffect(() => {
    if (open) {
      reset({
        phone: emp?.phone ?? "",
        address: emp?.address ?? "",
        city: emp?.city ?? "",
        province: emp?.province ?? "",
        zipCode: emp?.zipCode ?? "",
        emergencyName: emp?.emergencyName ?? "",
        emergencyPhone: emp?.emergencyPhone ?? "",
        emergencyRelation: emp?.emergencyRelation ?? "",
      });
    }
  }, [open, emp, reset]);

  const mut = useMutation({
    mutationFn: (values: ProfileValues) => updateProfile(values as UpdateProfileInput),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["portal-profile"] });
      toast("Profile updated successfully", "success");
      onOpenChange(false);
    },
    onError: (err) => toast(extractErrorMessage(err), "error"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        <DialogTitle>Edit Profile</DialogTitle>
        <DialogDescription>
          Update your personal details below.
        </DialogDescription>
      </DialogHeader>

      {!emp && (
        <p className="text-sm text-muted-foreground pb-2">
          No employee profile is linked to this account. Contact details cannot be edited.
        </p>
      )}

      <form onSubmit={handleSubmit((v) => mut.mutate(v))} className="space-y-4 pt-2" noValidate>
        {emp && (
          <>
            <div className="border-t pt-4">
              <p className="text-sm font-medium text-muted-foreground mb-3">Contact Information</p>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="ep-phone">Phone</Label>
                  <Input id="ep-phone" {...register("phone")} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ep-address">Address</Label>
                  <Input id="ep-address" {...register("address")} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ep-city">City</Label>
                  <Input id="ep-city" {...register("city")} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ep-province">Province</Label>
                  <Input id="ep-province" {...register("province")} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ep-zip">ZIP Code</Label>
                  <Input id="ep-zip" {...register("zipCode")} />
                </div>
              </div>
            </div>

            <div className="border-t pt-4">
              <p className="text-sm font-medium text-muted-foreground mb-3">Emergency Contact</p>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="ep-ename">Contact Name</Label>
                  <Input id="ep-ename" {...register("emergencyName")} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ep-ephone">Contact Phone</Label>
                  <Input id="ep-ephone" {...register("emergencyPhone")} />
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <Label htmlFor="ep-erel">Relationship</Label>
                  <Input id="ep-erel" {...register("emergencyRelation")} />
                </div>
              </div>
            </div>
          </>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={mut.isPending}>
            Close
          </Button>
          <Button type="submit" disabled={mut.isPending || !emp}>
            {mut.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Save Changes
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}

const pwSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .max(128),
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  })
  .refine((v) => v.currentPassword !== v.newPassword, {
    message: "New password must differ from current password",
    path: ["newPassword"],
  });

type PwValues = z.infer<typeof pwSchema>;

function ChangePasswordDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<PwValues>({
    resolver: zodResolver(pwSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  });

  useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  const mut = useMutation({
    mutationFn: (v: PwValues) =>
      changePassword({
        currentPassword: v.currentPassword,
        newPassword: v.newPassword,
      }),
    onSuccess: () => {
      toast("Password changed", "success");
      onOpenChange(false);
    },
    onError: (err) => toast(extractErrorMessage(err), "error"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        <DialogTitle>Change password</DialogTitle>
        <DialogDescription>
          You'll stay logged in on this device after changing your password.
        </DialogDescription>
      </DialogHeader>

      <form
        onSubmit={handleSubmit((v) => mut.mutate(v))}
        className="space-y-4 pt-4"
        noValidate
      >
        <div className="space-y-2">
          <Label htmlFor="currentPassword">Current password</Label>
          <Input
            id="currentPassword"
            type="password"
            autoComplete="current-password"
            {...register("currentPassword")}
          />
          {errors.currentPassword && (
            <p className="text-xs text-destructive">
              {errors.currentPassword.message}
            </p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="newPassword">New password</Label>
          <Input
            id="newPassword"
            type="password"
            autoComplete="new-password"
            {...register("newPassword")}
          />
          {errors.newPassword && (
            <p className="text-xs text-destructive">
              {errors.newPassword.message}
            </p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirmPassword">Confirm new password</Label>
          <Input
            id="confirmPassword"
            type="password"
            autoComplete="new-password"
            {...register("confirmPassword")}
          />
          {errors.confirmPassword && (
            <p className="text-xs text-destructive">
              {errors.confirmPassword.message}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={mut.isPending}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={mut.isPending}>
            {mut.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Change password
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
