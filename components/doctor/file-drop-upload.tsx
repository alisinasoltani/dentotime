// components/doctor/file-drop-upload.tsx
'use client';

import { useEffect, useRef } from 'react';
import { Controller } from 'react-hook-form';
import { UploadCloud, X, FileText } from 'lucide-react';
import { UPLOAD_CONSTRAINTS } from '@/lib/upload'; // <-- FIXED IMPORT
import { MAX_VERIFICATION_DOCUMENTS } from '@/lib/config'; // <-- FIXED IMPORT
import { sanitizeText } from '@/lib/sanitize';
import type { StagedFile } from '@/lib/types';

export function FileDropUpload({ control }: { control: any }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const previewUrls = useRef(new Set<string>());

  useEffect(() => {
    const urls = previewUrls.current;
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
      urls.clear();
    };
  }, []);

  const validateAndStage = (files: FileList, currentFiles: StagedFile[], append: (files: StagedFile[]) => void) => {
    const newFiles: StagedFile[] = [];
    const errors: string[] = [];

    Array.from(files).forEach((file) => {
      if (currentFiles.length + newFiles.length >= MAX_VERIFICATION_DOCUMENTS) {
        errors.push(`حداکثر ${MAX_VERIFICATION_DOCUMENTS} فایل مجاز است`);
        return;
      }

      if (!UPLOAD_CONSTRAINTS.verification_document.allowedTypes.includes(file.type)) {
        errors.push(`${file.name}: فرمت مجاز نیست (فقط png/jpg)`);
        return;
      }

      if (file.size > UPLOAD_CONSTRAINTS.verification_document.maxSize) {
        errors.push(`${file.name}: حجم فایل بیش از ۱۰ مگابایت است`);
        return;
      }

      const previewUrl = file.type.startsWith('image/') ? URL.createObjectURL(file) : null;
      if (previewUrl) previewUrls.current.add(previewUrl);
      newFiles.push({
        id: `${file.name}-${file.size}-${Date.now()}`,
        file,
        previewUrl,
        status: 'valid',
      });
    });

    if (newFiles.length > 0) append(newFiles);
    if (errors.length > 0) alert(errors.join('\n')); // Replace with sonner toast in actual app
  };

  return (
    <Controller
      control={control}
      name="documents"
      defaultValue={[]}
      render={({ field, fieldState: { error } }) => {
        const append = (files: StagedFile[]) => field.onChange([...field.value, ...files]);
        const remove = (id: string) => {
          const removed = field.value.find((file: StagedFile) => file.id === id);
          if (removed?.previewUrl) {
            URL.revokeObjectURL(removed.previewUrl);
            previewUrls.current.delete(removed.previewUrl);
          }
          field.onChange(field.value.filter((file: StagedFile) => file.id !== id));
        };

        return (
          <div>
            <div
              onClick={() => inputRef.current?.click()}
              onDrop={(e) => {
                e.preventDefault();
                validateAndStage(e.dataTransfer.files, field.value, append);
              }}
              onDragOver={(e) => e.preventDefault()}
              className="flex flex-col items-center justify-center gap-2 cursor-pointer rounded-[40px] bg-[#E9F5F9] py-10 text-center transition-colors hover:bg-[#dfeef3]"
            >
              <UploadCloud className="h-8 w-8 text-[#2993A3]" />
              <p className="text-sm font-medium text-[#2993A3]">
                تصویر کارت نظام پزشکی را اینجا بکشید یا کلیک کنید
              </p>
              <p className="text-xs text-gray-500">حداکثر ۵ فایل، هر فایل حداکثر ۱۰ مگابایت</p>
              <input
                ref={inputRef}
                type="file"
                multiple
                hidden
                accept="image/png,image/jpeg"
                onChange={(e) => e.target.files && validateAndStage(e.target.files, field.value, append)}
              />
            </div>

            {field.value.length > 0 && (
              <div className="mt-4 space-y-2">
                {field.value.map((file: StagedFile) => (
                  <div key={file.id} className="flex items-center gap-3 rounded-xl border border-gray-100 bg-white p-2">
                    <div className="h-10 w-10 overflow-hidden rounded-lg bg-gray-100 flex items-center justify-center">
                      {file.previewUrl ? (
                        <img src={file.previewUrl} alt={file.file.name} className="h-full w-full object-cover" />
                      ) : (
                        <FileText className="h-5 w-5 text-gray-400" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{sanitizeText(file.file.name)}</p>
                      <p className="text-xs text-gray-500">{(file.file.size / 1024 / 1024).toFixed(2)} MB</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => remove(file.id)}
                      className="p-1 text-gray-400 hover:text-red-500"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {error && <p className="mt-2 text-xs text-red-500">{error.message}</p>}
          </div>
        );
      }}
    />
  );
}
