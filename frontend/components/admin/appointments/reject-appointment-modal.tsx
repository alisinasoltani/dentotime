"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (notes: string) => void;
  patientName: string;
}

export default function RejectAppointmentModal({ isOpen, onClose, onConfirm, patientName }: Props) {
  const [userNote, setUserNote] = useState("");
  const [adminNote, setAdminNote] = useState("");

  const handleConfirm = async () => {
    const combinedNote = `یادداشت کاربر: ${userNote} | یادداشت ادمین: ${adminNote}`;
    await onConfirm(combinedNote);
    setUserNote("");
    setAdminNote("");
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-[calc(100vw-20px)] md:max-w-md">
        <DialogHeader>
          <DialogTitle>آیا مطمئنید؟</DialogTitle>
          <p className="text-sm text-gray-500">نوبت <span className="font-bold">{patientName}</span> رد خواهد شد.</p>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="admin_note_appt">یادداشت برای سایر ادمین‌ها</Label>
            <Textarea
              id="admin_note_appt"
              value={adminNote}
              onChange={(e) => setAdminNote(e.target.value)}
              className="min-h-[80px] bg-gray-50 border-gray-200"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="user_note_appt">یادداشت برای کاربر</Label>
            <Textarea
              id="user_note_appt"
              value={userNote}
              onChange={(e) => setUserNote(e.target.value)}
              className="min-h-[80px] bg-gray-50 border-gray-200"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>منصرف شدم</Button>
          <Button onClick={handleConfirm} className="bg-red-500 hover:bg-red-600 text-white">
            بله، رد شود
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}