// =============================================================================
// lib/upload.ts
// Shared Server upload flow + image crop helper
// =============================================================================

import api from './api';
import type {
  UploadPurpose,
  UploadFileResult,
} from './types';

// -----------------------------------------------------------------------------
// Section 7.2: Per-purpose constraints table
// -----------------------------------------------------------------------------

interface UploadConstraint {
  allowedTypes: string[];
  allowedExtensions?: string[]; // Fallback for 3D files where MIME is often octet-stream
  maxSize: number;
}

export const UPLOAD_CONSTRAINTS: Record<UploadPurpose, UploadConstraint> = {
  profile_picture: {
    allowedTypes: ['image/jpeg', 'image/png', 'image/webp'],
    maxSize: 2 * 1024 * 1024, // 2MB
  },
  verification_document: {
    allowedTypes: ['image/png', 'image/jpeg'],
    maxSize: 10 * 1024 * 1024, // 10MB
  },
  chat_attachment: {
    allowedTypes: [
      'image/jpeg',
      'image/png',
      'image/webp',
      'application/pdf',
      'application/octet-stream', // Often reported for 3D scans
    ],
    allowedExtensions: ['.stl', '.ply', '.obj'], // 3D scan formats
    maxSize: 1024 * 1024 * 1024, // 1GB
  },
};

// -----------------------------------------------------------------------------
// Section 7.1: Magic-byte validation
// -----------------------------------------------------------------------------

async function getSniffedMimeType(file: File | Blob): Promise<string> {
  if (file instanceof File === false) {
    return file.type || 'application/octet-stream';
  }

  const slice = file.slice(0, 32);
  const buffer = await slice.arrayBuffer();
  const bytes = new Uint8Array(buffer);

  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  if (
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) return 'image/webp';
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return 'application/pdf';

  return file.type || 'application/octet-stream';
}

async function validateFile(
  file: File | Blob,
  purpose: UploadPurpose,
  fileName: string
): Promise<string> {
  const constraints = UPLOAD_CONSTRAINTS[purpose];
  
  if (file.size > constraints.maxSize) {
    const maxMB = constraints.maxSize / (1024 * 1024);
    throw new Error(`حجم فایل بیش از حد مجاز است (حداکثر ${maxMB} مگابایت)`);
  }

  const sniffedType = await getSniffedMimeType(file);

  if (sniffedType === 'application/octet-stream' && constraints.allowedExtensions) {
    const ext = fileName.toLowerCase().match(/\.[^.]+$/)?.[0];
    if (ext && constraints.allowedExtensions.includes(ext)) {
      return sniffedType;
    }
    throw new Error('فرمت فایل سه‌بعدی پشتیبانی نمی‌شود');
  }

  if (!constraints.allowedTypes.includes(sniffedType)) {
    throw new Error('فرمت فایل مجاز نیست');
  }

  return sniffedType;
}

// -----------------------------------------------------------------------------
// Section 7.1 & 7.5: Core upload flow (Server Direct Upload)
// -----------------------------------------------------------------------------

export async function uploadFile(
  file: File | Blob,
  opts: {
    purpose: UploadPurpose;
    fileName: string;
    onProgress?: (percent: number) => void;
    signal?: AbortSignal;
  }
): Promise<UploadFileResult> {
  const { purpose, fileName, onProgress, signal } = opts;

  // 1. Validate (Magic bytes + Size + Type)
  let fileContentType: string;
  try {
    fileContentType = await validateFile(file, purpose, fileName);
  } catch (err: any) {
    throw new Error(`اعتبارسنجی فایل ناموفق بود: ${err.message}`);
  }

  // 2. Fix MIME type for special files (like 3D scans) if browser couldn't detect it
  let fileToUpload: File | Blob = file;
  const ext = fileName.toLowerCase().match(/\.[^.]+$/)?.[0];
  
  if (ext === '.stl') fileContentType = 'model/stl';
  else if (ext === '.obj') fileContentType = 'model/obj';
  else if (ext === '.ply') fileContentType = 'model/ply';
  else if (ext === '.dcm' || ext === '.dicom') fileContentType = 'application/dicom';

  // اگر فایل از نوع File است و مرورگر نوع آن را نشناخته بود، یک فایل جدید با نوع اصلاح شده می‌سازیم
  if (file instanceof File && (!file.type || file.type === 'application/octet-stream')) {
    fileToUpload = new File([file], file.name, { type: fileContentType });
  }

  // 3. Upload directly to Backend Server
    // 3. Upload directly to Backend Server
  try {
    const formData = new FormData();
    formData.append('purpose', purpose);
    formData.append('file', fileToUpload, fileName);

    const res = await api.post('/files/upload/', formData, {
      headers: {
        // 🚨 نکته کلیدی: با دادن مقدار undefined، هدر پیش‌فرض application/json حذف شده
        // و مرورگر به صورت خودکار multipart/form-data با boundary صحیح را قرار می‌دهد
        'Content-Type': undefined,
      },
      onUploadProgress: (progressEvent) => {
        if (onProgress && progressEvent.total) {
          const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          onProgress(percent);
        }
      },
      signal: signal,
    });

    return {
      file_url: res.data.file_url,
      file_name: res.data.file_name,
      file_size: res.data.file_size,
      file_key: res.data.file_key,
      file_content_type: fileContentType,
    };
  } catch (err: any) {
    if (err.name === 'CanceledError') {
      throw new Error('آپلود فایل لغو شد');
    }
    throw new Error(err.response?.data?.detail || 'خطا در آپلود فایل به سرور');
  }
}

// -----------------------------------------------------------------------------
// Section 7.4: Image cropping helper
// -----------------------------------------------------------------------------

export const getCroppedImg = (
  imageSrc: string,
  pixelCrop: { x: number; y: number; width: number; height: number }
): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.src = imageSrc;
    image.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("No 2d context"));

      canvas.width = pixelCrop.width;
      canvas.height = pixelCrop.height;

      ctx.drawImage(
        image,
        pixelCrop.x,
        pixelCrop.y,
        pixelCrop.width,
        pixelCrop.height,
        0,
        0,
        pixelCrop.width,
        pixelCrop.height
      );

      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Canvas is empty"));
      }, "image/jpeg");
    };
    image.onerror = (error) => reject(error);
  });
};

// -----------------------------------------------------------------------------
// Profile Picture Wrapper
// -----------------------------------------------------------------------------

export async function uploadProfilePicture(file: Blob, fileName: string) {
  // استفاده از تابع عمومی آپلود با پارامتر profile_picture
  const result = await uploadFile(file, { purpose: 'profile_picture', fileName });

  // آپدیت فیلد profile_picture کاربر در دیتابیس
  await api.patch("/users/me/", {
    profile_picture: result.file_url,
  });

  return result.file_url;
}