import * as React from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  className?: string;
}

export function Dialog({ open, onOpenChange, children, className }: DialogProps) {
  React.useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onOpenChange]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <button
        type="button"
        aria-label="Close dialog"
        onClick={() => onOpenChange(false)}
        className="absolute inset-0 h-full w-full cursor-default"
      />
      <div
        role="dialog"
        aria-modal="true"
        className={cn("relative z-10 flex w-full max-w-lg flex-col rounded-lg border bg-card text-card-foreground shadow-xl max-h-[90vh]", className)}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="absolute right-3 top-3 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-gray-100 text-gray-500 ring-offset-background transition-colors hover:bg-gray-200 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          onClick={() => onOpenChange(false)}
          aria-label="Close"
        >
          <X className="h-3.5 w-3.5" />
        </button>
        <div className="overflow-y-auto p-6 min-h-0">
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}

export function DialogHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("flex flex-col space-y-1.5 pr-6", className)} {...props} />
  );
}

export function DialogTitle({
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2
      className={cn("text-lg font-semibold leading-none tracking-tight", className)}
      {...props}
    />
  );
}

export function DialogDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-sm text-muted-foreground", className)} {...props} />;
}

export function DialogFooter({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    />
  );
}
