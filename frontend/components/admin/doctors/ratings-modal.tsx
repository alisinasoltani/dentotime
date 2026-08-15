"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RatingsPanel } from "@/components/ratings/ratings-panel";

export function RatingsModal({ doctorId, doctorName, onClose }: { doctorId: number | null; doctorName: string; onClose: () => void }) {
  return (
    <Dialog open={doctorId !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>امتیازهای {doctorName}</DialogTitle></DialogHeader>
        {doctorId !== null && <RatingsPanel endpoint={`/admin/doctors/${doctorId}/ratings/`} />}
      </DialogContent>
    </Dialog>
  );
}
