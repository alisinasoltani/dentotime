import api from './api';
import type {
  UploadFileResult,
  UploadPurpose,
  UploadSessionResponse,
} from './types';

interface UploadConstraint {
  allowedTypes: string[];
  allowedExtensions?: string[];
  maxSize: number;
}

export const UPLOAD_CONSTRAINTS: Record<UploadPurpose, UploadConstraint> = {
  profile_picture: {
    allowedTypes: ['image/jpeg', 'image/png', 'image/webp'],
    maxSize: 5 * 1024 * 1024,
  },
  verification_document: {
    allowedTypes: ['image/png', 'image/jpeg', 'application/pdf'],
    maxSize: 25 * 1024 * 1024,
  },
  chat_attachment: {
    allowedTypes: [
      'image/jpeg',
      'image/png',
      'image/webp',
      'application/pdf',
      'application/octet-stream',
      'model/stl',
      'model/obj',
      'model/ply',
      'application/dicom',
      'application/zip',
    ],
    allowedExtensions: ['.stl', '.ply', '.obj', '.dcm', '.dicom', '.zip'],
    maxSize: 1024 * 1024 * 1024,
  },
};

const DEFAULT_PART_SIZE = 16 * 1024 * 1024;
const DB_NAME = 'dentotime-uploads-v1';
const STORE_NAME = 'uploads';
const MAX_RETRIES = 4;

interface HashedPart {
  partNumber: number;
  size: number;
  checksumSha256: string;
}

interface HashResult {
  sha256: string;
  parts: HashedPart[];
}

interface PersistedUpload {
  fingerprint: string;
  sessionId: string;
  clientUploadId: string;
  purpose: UploadPurpose;
  threadId?: string;
  fileName: string;
  fileSize: number;
  lastModified: number;
  sha256: string;
  completedPartNumbers: number[];
  updatedAt: number;
}

function openUploadDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: 'fingerprint' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readUpload(fingerprint: string): Promise<PersistedUpload | null> {
  try {
    const db = await openUploadDatabase();
    return await new Promise((resolve, reject) => {
      const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(fingerprint);
      request.onsuccess = () => resolve((request.result as PersistedUpload | undefined) ?? null);
      request.onerror = () => reject(request.error);
    });
  } catch {
    return null;
  }
}

async function writeUpload(record: PersistedUpload): Promise<void> {
  try {
    const db = await openUploadDatabase();
    await new Promise<void>((resolve, reject) => {
      const request = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put(record);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch {
    // Upload remains resumable from the server during this browser session.
  }
}

async function deleteUpload(fingerprint: string): Promise<void> {
  try {
    const db = await openUploadDatabase();
    await new Promise<void>((resolve, reject) => {
      const request = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).delete(fingerprint);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch {
    // Stale records are validated against the server before reuse.
  }
}

async function sniffMimeType(file: Blob): Promise<string> {
  const bytes = new Uint8Array(await file.slice(0, 32).arrayBuffer());
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  if (
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) return 'image/webp';
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
    return 'application/pdf';
  }
  return file.type || 'application/octet-stream';
}

async function validateFile(file: Blob, purpose: UploadPurpose, fileName: string): Promise<string> {
  const constraints = UPLOAD_CONSTRAINTS[purpose];
  if (file.size < 1) throw new Error('فایل خالی قابل بارگذاری نیست');
  if (file.size > constraints.maxSize) {
    throw new Error(`حجم فایل بیش از حد مجاز است (حداکثر ${constraints.maxSize / 1024 / 1024} مگابایت)`);
  }
  let mime = await sniffMimeType(file);
  const extension = fileName.toLowerCase().match(/\.[^.]+$/)?.[0];
  if (extension === '.stl') mime = 'model/stl';
  else if (extension === '.obj') mime = 'model/obj';
  else if (extension === '.ply') mime = 'model/ply';
  else if (extension === '.dcm' || extension === '.dicom') mime = 'application/dicom';
  else if (extension === '.zip' && mime === 'application/octet-stream') mime = 'application/zip';

  if (!constraints.allowedTypes.includes(mime)) throw new Error('فرمت فایل مجاز نیست');
  if (mime === 'application/octet-stream' && (!extension || !constraints.allowedExtensions?.includes(extension))) {
    throw new Error('فرمت فایل سه‌بعدی پشتیبانی نمی‌شود');
  }
  return mime;
}

function hashFile(
  file: Blob,
  partSize: number,
  signal?: AbortSignal,
  onProgress?: (loaded: number, total: number) => void,
): Promise<HashResult> {
  return new Promise((resolve, reject) => {
    const worker = new Worker('/workers/sha256.worker.js');
    const abort = () => {
      worker.terminate();
      reject(new DOMException('Aborted', 'AbortError'));
    };
    if (signal?.aborted) return abort();
    signal?.addEventListener('abort', abort, { once: true });
    worker.onmessage = (event: MessageEvent) => {
      if (event.data.type === 'progress') onProgress?.(event.data.loaded, event.data.total);
      if (event.data.type === 'complete') {
        signal?.removeEventListener('abort', abort);
        worker.terminate();
        resolve({ sha256: event.data.sha256, parts: event.data.parts });
      }
      if (event.data.type === 'error') {
        signal?.removeEventListener('abort', abort);
        worker.terminate();
        reject(new Error(event.data.message));
      }
    };
    worker.onerror = (event) => {
      signal?.removeEventListener('abort', abort);
      worker.terminate();
      reject(new Error(event.message || 'Hashing failed'));
    };
    worker.postMessage({ file, partSize });
  });
}

function uploadConcurrency(): number {
  const cores = navigator.hardwareConcurrency || 4;
  if (cores >= 12) return 6;
  if (cores >= 8) return 5;
  return 4;
}

function delay(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(resolve, milliseconds);
    signal?.addEventListener('abort', () => {
      window.clearTimeout(timeout);
      reject(new DOMException('Aborted', 'AbortError'));
    }, { once: true });
  });
}

async function presignPart(uploadId: string, part: HashedPart) {
  const response = await api.post(`/files/uploads/${uploadId}/parts/presign/`, {
    parts: [{ part_number: part.partNumber, checksum_sha256: part.checksumSha256 }],
  });
  return response.data.parts[0] as {
    part_number: number;
    url: string;
    checksum_sha256: string;
  };
}

async function uploadPartWithRetry(
  uploadId: string,
  file: Blob,
  partSize: number,
  part: HashedPart,
  initialUrl: { url: string; checksum_sha256: string } | undefined,
  signal?: AbortSignal,
): Promise<string> {
  let signed = initialUrl;
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
    try {
      if (!signed || attempt > 0) signed = await presignPart(uploadId, part);
      const start = (part.partNumber - 1) * partSize;
      const response = await fetch(signed.url, {
        method: 'PUT',
        body: file.slice(start, start + part.size),
        headers: { 'x-amz-checksum-sha256': signed.checksum_sha256 },
        signal,
      });
      if (!response.ok) throw new Error(`Part upload failed with HTTP ${response.status}`);
      // Some S3-compatible providers accept the upload but do not expose ETag
      // through CORS. The backend reconciles the provider's authoritative ETag
      // during completion, so an empty value is safe and keeps browser uploads
      // compatible with those providers.
      const etag = response.headers.get('etag') || '';
      await api.post(`/files/uploads/${uploadId}/parts/record/`, {
        part_number: part.partNumber,
        size: part.size,
        etag,
        checksum_sha256: part.checksumSha256,
      });
      return etag;
    } catch (error) {
      if (signal?.aborted) throw error;
      lastError = error;
      signed = undefined;
      if (attempt + 1 < MAX_RETRIES) {
        await delay(Math.min(8_000, 500 * (2 ** attempt)) + Math.random() * 300, signal);
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Part upload failed');
}

function resultFromSession(session: UploadSessionResponse): UploadFileResult {
  return {
    asset_id: session.asset_id,
    file_name: session.file_name,
    file_size: session.file_size,
    file_content_type: session.file_content_type,
    state: session.asset_state,
    scan_status: session.scan_status,
  };
}

async function waitForSafetyScan(
  session: UploadSessionResponse,
  signal?: AbortSignal,
  onProgress?: (percent: number) => void,
): Promise<UploadSessionResponse> {
  let current = session;
  let delay = 750;
  const deadline = Date.now() + 10 * 60 * 1000;
  while (current.asset_state !== 'AVAILABLE') {
    if (current.asset_state === 'FAILED' || ['INFECTED', 'FAILED'].includes(current.scan_status)) {
      throw new Error(current.scan_error || 'فایل در بررسی امنیتی رد شد');
    }
    if (Date.now() >= deadline) {
      throw new Error('بررسی امنیتی فایل هنوز تمام نشده است؛ چند دقیقه دیگر دوباره تلاش کنید');
    }
    await new Promise<void>((resolve, reject) => {
      const onAbort = () => {
        window.clearTimeout(timer);
        reject(new DOMException('Aborted', 'AbortError'));
      };
      const timer = window.setTimeout(() => {
        signal?.removeEventListener('abort', onAbort);
        resolve();
      }, delay);
      signal?.addEventListener('abort', onAbort, { once: true });
    });
    const response = await api.get<UploadSessionResponse>(`/files/uploads/${session.upload_id}/`);
    current = response.data;
    onProgress?.(current.asset_state === 'AVAILABLE' ? 100 : 99);
    delay = Math.min(Math.round(delay * 1.5), 5000);
  }
  return current;
}

export async function uploadFile(
  file: File | Blob,
  opts: {
    purpose: UploadPurpose;
    fileName: string;
    threadId?: string;
    onProgress?: (percent: number) => void;
    signal?: AbortSignal;
  },
): Promise<UploadFileResult> {
  const { purpose, fileName, threadId, onProgress, signal } = opts;
  try {
    const contentType = await validateFile(file, purpose, fileName);
    let hashes = await hashFile(file, DEFAULT_PART_SIZE, signal, (loaded, total) => {
      onProgress?.(Math.round((loaded / total) * 10));
    });
    const lastModified = file instanceof File ? file.lastModified : 0;
    const fingerprint = ['v1', purpose, threadId || '-', fileName, file.size, lastModified, hashes.sha256].join(':');
    let persisted = await readUpload(fingerprint);
    let session: UploadSessionResponse | null = null;

    if (persisted) {
      try {
        const response = await api.get<UploadSessionResponse>(`/files/uploads/${persisted.sessionId}/`);
        const candidate = response.data;
        if (
          candidate.sha256 === hashes.sha256 && candidate.file_size === file.size &&
          candidate.file_name === fileName && candidate.purpose === purpose &&
          !['ABORTED', 'EXPIRED', 'FAILED'].includes(candidate.state)
        ) session = candidate;
        else await deleteUpload(fingerprint);
      } catch {
        await deleteUpload(fingerprint);
        persisted = null;
      }
    }

    if (!session) {
      const clientUploadId = persisted?.clientUploadId || crypto.randomUUID();
      const response = await api.post<UploadSessionResponse>('/files/uploads/', {
        client_upload_id: clientUploadId,
        purpose,
        thread_id: threadId,
        file_name: fileName,
        file_size: file.size,
        file_content_type: contentType,
        sha256: hashes.sha256,
      });
      session = response.data;
    }

    if (session.part_size !== DEFAULT_PART_SIZE) {
      hashes = await hashFile(file, session.part_size, signal, (loaded, total) => {
        onProgress?.(Math.round((loaded / total) * 10));
      });
      if (hashes.sha256 !== session.sha256) throw new Error('اثر انگشت فایل با نشست آپلود مطابقت ندارد');
    }
    if (session.state === 'COMPLETED') {
      session = await waitForSafetyScan(session, signal, onProgress);
      await deleteUpload(fingerprint);
      onProgress?.(100);
      return resultFromSession(session);
    }

    const completed = new Set(session.completed_parts.map((part) => part.part_number));
    const completedBytes = session.completed_parts.reduce((total, part) => total + part.size, 0);
    let uploadedBytes = completedBytes;
    const record: PersistedUpload = {
      fingerprint,
      sessionId: session.upload_id,
      clientUploadId: session.client_upload_id,
      purpose,
      threadId,
      fileName,
      fileSize: file.size,
      lastModified,
      sha256: hashes.sha256,
      completedPartNumbers: [...completed],
      updatedAt: Date.now(),
    };
    await writeUpload(record);

    const missing = hashes.parts.filter((part) => !completed.has(part.partNumber));
    const urls = new Map<number, { url: string; checksum_sha256: string }>();
    for (let offset = 0; offset < missing.length; offset += 50) {
      const batch = missing.slice(offset, offset + 50);
      const response = await api.post(`/files/uploads/${session.upload_id}/parts/presign/`, {
        parts: batch.map((part) => ({
          part_number: part.partNumber,
          checksum_sha256: part.checksumSha256,
        })),
      });
      for (const signed of response.data.parts) urls.set(signed.part_number, signed);
    }

    let nextIndex = 0;
    const workers = Array.from({ length: Math.min(uploadConcurrency(), missing.length) }, async () => {
      while (nextIndex < missing.length) {
        const part = missing[nextIndex];
        nextIndex += 1;
        await uploadPartWithRetry(session!.upload_id, file, session!.part_size, part, urls.get(part.partNumber), signal);
        completed.add(part.partNumber);
        uploadedBytes += part.size;
        record.completedPartNumbers = [...completed].sort((a, b) => a - b);
        record.updatedAt = Date.now();
        await writeUpload(record);
        onProgress?.(10 + Math.round((uploadedBytes / file.size) * 90));
      }
    });
    await Promise.all(workers);

    const completedResponse = await api.post<UploadSessionResponse>(
      `/files/uploads/${session.upload_id}/complete/`,
    );
    const safeSession = await waitForSafetyScan(completedResponse.data, signal, onProgress);
    await deleteUpload(fingerprint);
    onProgress?.(100);
    return resultFromSession(safeSession);
  } catch (error) {
    if (signal?.aborted || (error instanceof DOMException && error.name === 'AbortError')) {
      throw new Error('آپلود فایل متوقف شد؛ با انتخاب دوباره همین فایل ادامه پیدا می‌کند');
    }
    const detail = (error as { response?: { data?: { detail?: string | string[] } } }).response?.data?.detail;
    throw new Error(Array.isArray(detail) ? detail.join(' ') : detail || (error as Error).message || 'خطا در آپلود فایل');
  }
}

export const getCroppedImg = (
  imageSrc: string,
  pixelCrop: { x: number; y: number; width: number; height: number },
): Promise<Blob> => new Promise((resolve, reject) => {
  const image = new Image();
  image.src = imageSrc;
  image.onload = () => {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) return reject(new Error('No 2d context'));
    canvas.width = pixelCrop.width;
    canvas.height = pixelCrop.height;
    context.drawImage(
      image,
      pixelCrop.x,
      pixelCrop.y,
      pixelCrop.width,
      pixelCrop.height,
      0,
      0,
      pixelCrop.width,
      pixelCrop.height,
    );
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Canvas is empty')), 'image/jpeg');
  };
  image.onerror = reject;
});

export async function uploadProfilePicture(file: Blob, fileName: string) {
  const result = await uploadFile(file, { purpose: 'profile_picture', fileName });
  await api.patch('/users/me/', { profile_picture_asset_id: result.asset_id });
  return result.asset_id;
}
