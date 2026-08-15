"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  doctorName: string;
}

export default function DeactivateDoctorModal({ isOpen, onClose, onConfirm, doctorName }: Props) {
  const [reason, setReason] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  const handleConfirm = async () => {
    setIsProcessing(true);
    await onConfirm(reason);
    setReason("");
    setIsProcessing(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-[calc(100vw-20px)] md:max-w-md">
        <DialogHeader>
          <DialogTitle>آیا مطمئنید؟</DialogTitle>
          <p className="text-sm text-gray-500">حساب کاربری <span className="font-bold">{doctorName}</span> حذف (غیرفعال) خواهد شد.</p>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="deactivate_reason">دلیل حذف حساب (برای ثبت در سیستم)</Label>
            <Textarea
              id="deactivate_reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="دلیل غیرفعال شدن حساب این پزشک را توضیح دهید..."
              className="min-h-[100px] bg-gray-50 border-gray-200"
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
            {isProcessing ? "در حال حذف..." : "بله، حذف شود"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}