// components/doctor/verification-status-rejected.tsx
'use client';

import { AlertCircle } from 'lucide-react';

export function VerificationStatusRejected({
    rejectionNote,
    onAck
}: {
    rejectionNote: string | null;
    onAck: () => void;
}) {
    return (
        <div className="flex h-full flex-col items-center justify-center p-8 text-center">
            <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-red-50">
                <AlertCircle className="h-10 w-10 text-red-500" />
            </div>

            <h2 className="mb-4 max-w-md w-full px-4 text-lg font-medium text-gray-800">
                متاسفانه درخواست شما تایید نشد. علت رد شدن درخواست شما توسط پشتیبانی در ادامه نوشته شده. لطفا ایرادات را برطرف کرده و مجددا درخواست ارسال فرمایید.
            </h2>

            {rejectionNote && (
                <div className="mb-6 max-w-md w-full px-4 rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-gray-700 wrap-break-words">
                    {rejectionNote}
                </div>
            )}

            <button
                onClick={onAck}
                className="rounded-[28px] bg-linear-to-l from-[#2993A3] to-[#75C1C7] px-8 py-3 font-semibold text-white shadow-md hover:opacity-90"
            >
                متوجه شدم
            </button>
        </div>
    );
}