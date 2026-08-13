"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

interface RejectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (rejection_note: string, internal_note: string) => void;
  doctorName: string;
}

export default function RejectModal({ isOpen, onClose, onConfirm, doctorName }: RejectModalProps) {
  const [rejectionNote, setRejectionNote] = useState("");
  const [internalNote, setInternalNote] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  const handleConfirm = async () => {
    setIsProcessing(true);
    await onConfirm(rejectionNote, internalNote);
    setRejectionNote("");
    setInternalNote("");
    setIsProcessing(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>آیا مطمئنید؟</DialogTitle>
          <p className="text-sm text-gray-500">درخواست <span className="font-bold">{doctorName}</span> رد خواهد شد.</p>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="internal_note">یادداشت برای سایر ادمین‌ها</Label>
            <Textarea
              id="internal_note"
              value={internalNote}
              onChange={(e) => setInternalNote(e.target.value)}
              placeholder="دلیل رد شدن را برای تیم توضیح دهید..."
              className="min-h-[80px] bg-gray-50 border-gray-200"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="rejection_note">یادداشت برای پزشک</Label>
            <Textarea
              id="rejection_note"
              value={rejectionNote}
              onChange={(e) => setRejectionNote(e.target.value)}
              placeholder="پیام خود را به پزشک بنویسید..."
              className="min-h-[80px] bg-gray-50 border-gray-200"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isProcessing}>
            منصرف شدم
          </Button>
          <Button 
            onClick={handleConfirm} 
            disabled={isProcessing}
            className="bg-red-500 hover:bg-red-600 text-white"
          >
            {isProcessing ? "در حال ثبت..." : "بله، رد شود"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}