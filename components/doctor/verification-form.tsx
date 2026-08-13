// components/doctor/verification-form.tsx
'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

import api from '@/lib/api';
import { uploadFile } from '@/lib/upload';
import { sanitizeText } from '@/lib/sanitize';
import { useDoctorContext } from '@/context/doctor-context';

import { VerificationGuide } from './verification-guide';
import { AccountOwnerSelect } from './account-owner-select';
import { FileDropUpload } from './file-drop-upload';
import type { VerificationSubmitPayload, StagedFile } from '@/lib/types';

// --- Zod Schema & Validation ---
const iranianNationalIdRegex = /^\d{10}$/;

const validateIranianNationalId = (input: string): boolean => {
  if (!iranianNationalIdRegex.test(input)) return false;
  const check = +input[9];
  const sum = input.split('').slice(0, 9).map((x, i) => +x * (10 - i)).reduce((a, b) => a + b);
  const remainder = sum % 11;
  return (remainder < 2 && check === remainder) || (remainder >= 2 && check === 11 - remainder);
};

const schema = z.object({
  accountOwner: z.enum(['DOCTOR', 'ASSISTANT', 'CLINIC'], { message: 'انتخاب صاحب حساب الزامی است' }),
  fullName: z.string().min(2, 'نام و نام خانوادگی حداقل ۲ کاراکتر است').max(100, 'نام بسیار طولانی است'),
  nationalId: z.string().refine(validateIranianNationalId, { message: 'کد ملی نامعتبر است' }),
  medicalRegistrationNumber: z.string().min(5, 'شماره نظام پزشکی نامعتبر است').max(20, 'شماره نظام پزشکی نامعتبر است'),
  supervisingDoctorName: z.string().optional(),
  clinicName: z.string().optional(),
  documents: z.array(z.any()).min(1, 'بارگذاری حداقل یک مدرک الزامی است'),
}).superRefine((data, ctx) => {
  if (data.accountOwner === 'ASSISTANT' && (!data.supervisingDoctorName || data.supervisingDoctorName.trim().length < 2)) {
    ctx.addIssue({ code: 'custom', path: ['supervisingDoctorName'], message: 'نام پزشک سرپرست الزامی است' });
  }
  if (data.accountOwner === 'CLINIC' && (!data.clinicName || data.clinicName.trim().length < 2)) {
    ctx.addIssue({ code: 'custom', path: ['clinicName'], message: 'نام کلینیک الزامی است' });
  }
});

export function VerificationForm() {
  const { refetchVerificationStatus, refetchUser } = useDoctorContext();
  const [uploadProgress, setUploadProgress] = useState(0);
  
  const { control, register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(schema),
  });

  const accountOwner = watch('accountOwner');

  const onSubmit = async (data: any) => {
    setUploadProgress(0);
    try {
      const totalFiles = data.documents.length;
      let completedFiles = 0;

      // 1. Upload files in parallel
      const uploadPromises = (data.documents as StagedFile[]).map((stagedFile) =>
        uploadFile(stagedFile.file, {
          purpose: 'verification_document',
          fileName: sanitizeText(stagedFile.file.name),
          onProgress: () => {
            // Note: این پیاده‌زیست ساده درصد کلی را نشان نمی‌دهد، اما می‌توان آن را توسعه داد
          }
        }).then(res => {
          completedFiles += 1;
          setUploadProgress(Math.round((completedFiles / totalFiles) * 100));
          return res;
        })
      );

      const uploadedDocs = await Promise.all(uploadPromises);

      // 2. Split full name
      const nameParts = data.fullName.trim().split(/\s+/);
      const firstName = sanitizeText(nameParts[0]);
      const lastName = sanitizeText(nameParts.slice(1).join(' '));

      // 3. Construct Payload
      const payload: VerificationSubmitPayload = {
        first_name: firstName,
        last_name: lastName,
        account_owner: data.accountOwner,
        agreed_to_terms: true,
        id_number: sanitizeText(data.nationalId),
        medical_registration_number: sanitizeText(data.medicalRegistrationNumber),
        supervising_doctor_name: data.accountOwner === 'ASSISTANT' ? sanitizeText(data.supervisingDoctorName) : null,
        clinic_name: data.accountOwner === 'CLINIC' ? sanitizeText(data.clinicName) : null,
        asset_ids: uploadedDocs.map((doc) => doc.asset_id),
      };

      // 4. Single POST request
      await api.post('/doctors/verification/submit/', payload);

      // 5. Refresh context state to trigger UI switch to PENDING
      await Promise.all([refetchVerificationStatus(), refetchUser()]);
      
      toast.success('درخواست شما با موفقیت ارسال شد');

    } catch (err: any) {
      const errorMsg = err.response?.data?.detail || err.message || 'خطا در ارسال درخواست';
      toast.error(errorMsg);
    } finally {
      setUploadProgress(0);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-8">
      <h1 className="text-2xl font-bold text-gray-800">احراز هویت پزشکان</h1>
      <VerificationGuide />

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 rounded-2xl bg-white p-6 shadow-sm border border-gray-100">
        
        {/* Account Owner */}
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">صاحب حساب:</label>
          <AccountOwnerSelect control={control} />
        </div>

        {/* Name & National ID */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">نام و نام خانوادگی</label>
            <input
              {...register('fullName')}
              className="w-full rounded-xl border border-gray-200 px-4 py-2.5 focus:border-[#5FB4FF] focus:outline-none focus:ring-1 focus:ring-[#5FB4FF]"
              placeholder="مثال: سینا موسوی"
            />
            {errors.fullName && <p className="mt-1 text-xs text-red-500">{errors.fullName.message}</p>}
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">کد ملی</label>
            <input
              {...register('nationalId')}
              className="w-full rounded-xl border border-gray-200 px-4 py-2.5 focus:border-[#5FB4FF] focus:outline-none focus:ring-1 focus:ring-[#5FB4FF]"
              placeholder="۱۰ رقم"
            />
            {errors.nationalId && <p className="mt-1 text-xs text-red-500">{errors.nationalId.message}</p>}
          </div>
        </div>

        {/* Medical Reg Number */}
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">شماره نظام پزشکی</label>
          <input
            {...register('medicalRegistrationNumber')}
            className="w-full rounded-xl border border-gray-200 px-4 py-2.5 focus:border-[#5FB4FF] focus:outline-none focus:ring-1 focus:ring-[#5FB4FF]"
            placeholder="شماره پروانه"
          />
          {errors.medicalRegistrationNumber && <p className="mt-1 text-xs text-red-500">{errors.medicalRegistrationNumber.message}</p>}
        </div>

        {/* Conditional Fields */}
        {accountOwner === 'ASSISTANT' && (
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">نام پزشک سرپرست</label>
            <input
              {...register('supervisingDoctorName')}
              className="w-full rounded-xl border border-gray-200 px-4 py-2.5 focus:border-[#5FB4FF] focus:outline-none focus:ring-1 focus:ring-[#5FB4FF]"
            />
            {errors.supervisingDoctorName && <p className="mt-1 text-xs text-red-500">{errors.supervisingDoctorName.message}</p>}
          </div>
        )}
        {accountOwner === 'CLINIC' && (
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">نام کلینیک / مرکز درمانی</label>
            <input
              {...register('clinicName')}
              className="w-full rounded-xl border border-gray-200 px-4 py-2.5 focus:border-[#5FB4FF] focus:outline-none focus:ring-1 focus:ring-[#5FB4FF]"
            />
            {errors.clinicName && <p className="mt-1 text-xs text-red-500">{errors.clinicName.message}</p>}
          </div>
        )}

        {/* Upload & Submit Grid */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div className="flex flex-col justify-end gap-4">
            <div className="text-sm text-gray-600">
              لطفا تصویر واضح از کارت نظام پزشکی خود بارگذاری نمایید. پس از تایید، دسترسی شما به سامانه فعال خواهد شد.
            </div>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex w-full items-center justify-center gap-2 rounded-[28px] bg-linear-to-l from-[#2993A3] to-[#75C1C7] py-3 font-semibold text-white shadow-md transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {uploadProgress > 0 ? `آپلود مدارک (${uploadProgress}%)` : 'در حال ارسال...'}
                </>
              ) : (
                'ارسال درخواست'
              )}
            </button>
          </div>
          
          <FileDropUpload control={control} />
        </div>
      </form>
    </div>
  );
}
