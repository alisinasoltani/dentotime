"use client";

import { useState, type ReactNode } from "react";
import { toast } from "sonner";

import { openPrivateAsset } from "@/lib/download";
import { cn } from "@/lib/utils";

interface PrivateDownloadButtonProps {
  assetId: string;
  children: ReactNode;
  className?: string;
}

export function PrivateDownloadButton({ assetId, children, className }: PrivateDownloadButtonProps) {
  const [loading, setLoading] = useState(false);

  return (
    <button
      type="button"
      disabled={loading}
      className={cn("disabled:cursor-wait disabled:opacity-60", className)}
      onClick={async () => {
        setLoading(true);
        try {
          await openPrivateAsset(assetId);
        } catch {
          toast.error("دریافت امن فایل ممکن نشد");
        } finally {
          setLoading(false);
        }
      }}
    >
      {loading ? "در حال آماده‌سازی…" : children}
    </button>
  );
}
