"use client";

import { useState, useCallback } from "react";
import Cropper from "react-easy-crop";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { getCroppedImg } from "@/lib/upload";

interface CropModalProps {
  imageSrc: string | null;
  open: boolean;
  onClose: () => void;
  onCropComplete: (croppedImageBlob: Blob) => void;
}

export default function CropImageModal({ imageSrc, open, onClose, onCropComplete }: CropModalProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<any>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const onCropCompleteHandler = useCallback((croppedArea: any, croppedAreaPx: any) => {
    setCroppedAreaPixels(croppedAreaPx);
  }, []);

  const handleApprove = async () => {
    setIsProcessing(true);
    try {
      if (imageSrc && croppedAreaPixels) {
        const croppedBlob = await getCroppedImg(imageSrc, croppedAreaPixels);
        onCropComplete(croppedBlob);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-[500px]">
        <DialogHeader>
          <DialogTitle>برش تصویر پروفایل</DialogTitle>
        </DialogHeader>
        
        <div className="relative w-full h-[300px] bg-gray-900 rounded-lg overflow-hidden">
          {imageSrc && (
            <Cropper
              image={imageSrc}
              crop={crop}
              zoom={zoom}
              aspect={1 / 1} // مربع
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropCompleteHandler}
            />
          )}
        </div>

        <div className="flex items-center gap-4 py-2">
          <span className="text-sm text-gray-500">زوم:</span>
          <Slider
            value={[zoom]}
            min={1}
            max={3}
            step={0.1}
            onValueChange={(val) => setZoom(val[0])}
            className="flex-1"
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isProcessing}>
            انصراف
          </Button>
          <Button onClick={handleApprove} disabled={isProcessing} className="bg-[#2993A3] hover:bg-[#1f7b89]">
            {isProcessing ? "در حال پردازش..." : "تایید تصویر"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}