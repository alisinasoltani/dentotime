"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FileText, Download } from "lucide-react";
import { DoctorDocument } from "@/lib/types";
import { PrivateDownloadButton } from "@/components/private-download-button";

interface DocsModalProps {
  isOpen: boolean;
  onClose: () => void;
  documents: DoctorDocument[];
  doctorName: string;
}

export default function DocumentsModal({ isOpen, onClose, documents, doctorName }: DocsModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-[calc(100vw-20px)] md:max-w-lg">
        <DialogHeader>
          <DialogTitle>مدارک {doctorName}</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-3 py-4 max-h-[60vh] overflow-y-auto">
          {documents.length === 0 ? (
            <p className="text-center text-gray-400 py-8">مدارکی آپلود نشده است.</p>
          ) : (
            documents.map((doc, idx) => (
              <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
                <div className="flex items-center gap-3">
                  <FileText className="h-6 w-6 text-[#2993A3]" />
                  <span className="text-sm font-medium text-gray-700 truncate max-w-50">
                    {doc.file_name || `مدارک ${idx + 1}`}
                  </span>
                </div>
                {doc.state === "AVAILABLE" ? <PrivateDownloadButton assetId={doc.asset_id} className="inline-flex h-9 items-center justify-center rounded-md px-3 text-sm text-[#2993A3] hover:bg-[#E9F5F9]">
                    <Download className="h-4 w-4 ml-1" />
                    دانلود
                </PrivateDownloadButton> : <span className="text-xs text-gray-500">در حال بررسی امنیتی</span>}
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
