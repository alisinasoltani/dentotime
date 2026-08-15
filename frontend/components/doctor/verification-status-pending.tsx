// components/doctor/verification-status-pending.tsx
'use client';

import { Clock } from 'lucide-react';
import { SUPPORT_PHONE_NUMBER } from '@/lib/config';

export function VerificationStatusPending() {
    return (
        <div className="flex h-full flex-col items-center justify-center p-8 text-center">
            <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-[#E9F5F9]">
                <Clock className="h-10 w-10 text-[#2993A3]" />
            </div>

            <h2 className="mb-4 max-w-md w-full px-4 text-lg font-medium text-gray-800">
                درخواست احراز هویت شما با موفقیت برای پشتیبانی ارسال شده و در دست بررسی است. این روند ممکن است حداکثر دو روز طول بکشد.
            </h2>

            <p className="max-w-md w-full px-4 text-sm text-gray-500">
                اگر درخواست شما بعد از 2 روز کاری تایید نشد و پیامی مبنی بر رد درخواست خود نمی بینید، با شماره {SUPPORT_PHONE_NUMBER} تماس بگیرید.
            </p>
        </div>
    );
}