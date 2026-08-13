import { parseISO } from "date-fns";

export type UserRole = 'DOCTOR' | 'ADMIN' | 'USER';

export type VerificationStatus = 'NOT_SUBMITTED' | 'PENDING' | 'REJECTED' | 'APPROVED';

export interface User {
  id: string | number;
  first_name: string;
  last_name: string;
  email?: string;
  phone_number?: string;
  role: UserRole;
  profile_picture?: string | null; // Made optional
  verification_status?: VerificationStatus;
}

export interface AuthResponse {
  access: string;
  refresh: string;
  user: User;
}

export interface ChatThread {
  id: string;
  participant?: User;
  participants?: User[];
  unread_count: number;
  last_message?: string;
}

export interface ChatMessage {
  id: string | number;
  thread: string | number;
  sender: ChatMessageSender;
  body: string; // Changed from `content` to `body` to match your backend/components
  attachments: ChatAttachment[];
  created_at: string;
  is_read?: boolean;
}

export interface DoctorDocument {
  asset_id: string;
  file_name: string;
  file_size: number;
  file_content_type?: string;
  state?: string;
  scan_status?: string;
  download_url?: string;
}

export interface DoctorRequest {
  id: number;
  user: {
    id: string;
    first_name: string;
    last_name: string;
    username: string;
    profile_picture?: string;
  };
  verification_status: "PENDING" | "APPROVED" | "REJECTED";
  submitted_at: string;
  processed_at?: string;
  rejection_note?: string;
  internal_admin_note?: string;
  documents: DoctorDocument[];
}

export interface Appointment {
  id: string;
  user?: {
    first_name?: string;
    last_name?: string;
    username?: string;
  };
  date?: string;
  start_at?: string;
  slot?: {
    date?: string;
    start_at?: string;
  };
  status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
  reason?: string;
  admin_notes?: string;
  created_at?: string;
}

export const getAppointmentDate = (appt: any): Date | null => {
  const dateStr = appt?.start_at || appt?.date || appt?.slot?.start_at || appt?.slot?.date;
  if (!dateStr) return null;
  
  try {
    const d = parseISO(dateStr);
    if (!isNaN(d.getTime())) return d;
    
    const d2 = new Date(dateStr);
    if (!isNaN(d2.getTime())) return d2;
    
    return null;
  } catch (e) {
    return null;
  }
};

// =============================================================================
// lib/types.ts
// Shared TypeScript types for the DentoTime doctor dashboard.
// All API request/response shapes live here — no untyped `any` anywhere.
// =============================================================================

// -----------------------------------------------------------------------------
// Verification (Section 5)
// -----------------------------------------------------------------------------

export type AccountOwner = 'DOCTOR' | 'ASSISTANT' | 'CLINIC';

/** Shape of a single uploaded document as sent to the backend. */
export interface VerificationDocument {
  asset_id: string;
  file_name: string;
  file_size: number;
  file_content_type: string;
}

/** GET /doctors/verification/ response (Section 3.4, 5.8). */
export interface VerificationStatusResponse {
  status: VerificationStatus;
  rejection_note: string | null;
  /** Submitted fields — present after a submission exists. */
  first_name?: string;
  last_name?: string;
  account_owner?: AccountOwner;
  id_number?: string;
  medical_registration_number?: string;
  supervising_doctor_name?: string | null;
  clinic_name?: string | null;
  documents?: VerificationDocument[];
  submitted_at?: string;
  reviewed_at?: string;
}

/** POST /doctors/verification/submit/ payload (Section 5.4.3). */
export interface VerificationSubmitPayload {
  first_name: string;
  last_name: string;
  account_owner: AccountOwner;
  agreed_to_terms: boolean;
  id_number: string;
  medical_registration_number: string;
  supervising_doctor_name: string | null;
  clinic_name: string | null;
  asset_ids: string[];
}

// -----------------------------------------------------------------------------
// Chat (Section 6)
// -----------------------------------------------------------------------------

export interface ChatAttachment {
  asset_id: string;
  file_name: string;
  file_size: number;
  file_content_type?: string;
  state?: string;
  scan_status?: string;
  download_url?: string;
}

/** Sender can be an expanded object OR a bare id — handle both defensively (Section 6.3). */
export type ChatMessageSender =
  | {
      id: string | number;
      role: UserRole;
      first_name?: string;
      last_name?: string;
      phone_number?: string;
      profile_picture?: string | null;
    }
  | string
  | number;

// -----------------------------------------------------------------------------
// File Upload (Section 7)
// -----------------------------------------------------------------------------

export type UploadPurpose = 'profile_picture' | 'verification_document' | 'chat_attachment';

/** POST /files/presign/ request body (Section 7.1 step 2). */
export interface PresignRequest {
  client_upload_id: string;
  purpose: UploadPurpose;
  file_name: string;
  file_size: number;
  file_content_type: string;
  sha256: string;
  thread_id?: string;
}

export interface CompletedUploadPart {
  part_number: number;
  size: number;
  etag: string;
  checksum_sha256: string;
}

/** Resumable upload-session response. */
export interface UploadSessionResponse {
  upload_id: string;
  client_upload_id: string;
  asset_id: string;
  purpose: UploadPurpose;
  file_name: string;
  file_size: number;
  file_content_type: string;
  sha256: string;
  part_size: number;
  expected_part_count: number;
  state: 'CREATED' | 'UPLOADING' | 'COMPLETING' | 'COMPLETED' | 'ABORTING' | 'ABORTED' | 'EXPIRED' | 'FAILED';
  asset_state: 'PENDING' | 'UPLOADING' | 'QUARANTINED' | 'AVAILABLE' | 'FAILED' | 'DELETED';
  scan_status: 'PENDING' | 'SCANNING' | 'CLEAN' | 'INFECTED' | 'FAILED';
  scan_error?: string;
  expires_at: string;
  completed_parts: CompletedUploadPart[];
}

/** Return type of the shared `uploadFile()` helper (Section 7.1). */
export interface UploadFileResult {
  asset_id: string;
  file_name: string;
  file_size: number;
  file_content_type: string;
  state: UploadSessionResponse['asset_state'];
  scan_status: UploadSessionResponse['scan_status'];
}

/** A file staged in the verification dropzone, awaiting submit-time upload (Section 7.3). */
export interface StagedFile {
  /** Client-generated unique id for React keying + per-file retry. */
  id: string;
  file: File;
  /** Object URL for image thumbnail preview; null for non-images. */
  previewUrl: string | null;
  status: 'valid' | 'invalid' | 'uploading' | 'uploaded' | 'error';
  errorMessage?: string;
  uploadProgress?: number;
  uploadResult?: UploadFileResult;
  /** The sniffed (magic-byte-verified) MIME type, set during validation. */
  sniffedContentType?: string;
}

// -----------------------------------------------------------------------------
// API Error (Section 9.2)
// -----------------------------------------------------------------------------

/**
 * Django REST Framework error shape.
 * Field-level validation: `{ "field_name": ["msg1", "msg2"], ... }`
 * Generic / auth error: `{ "detail": "..." }`
 */
export interface ApiErrorResponse {
  detail?: string;
  non_field_errors?: string[];
  [key: string]: unknown;
}

export interface PublicDoctor {
  id: string;
  first_name: string;
  last_name: string;
  display_name?: string;
  profile_picture?: string | null;
  specialty?: string;
  clinic_name?: string;
  likes_count: number;
  is_liked?: boolean;
  average_rating: number;
  vote_count: number;
}

export interface Review {
  id: string;
  reviewer_display_name: string;
  rating: number;
  comment: string;
  created_at: string;
  updated_at: string;
}

export interface DoctorDetail extends PublicDoctor {
  bio?: string;
}

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface RatingVoter {
  id: string;
  voter: {
    id: string | number;
    first_name: string;
    last_name: string;
  };
  rating: number;
  comment: string;
  created_at: string;
  updated_at: string;
}

export interface RatingVoterPage extends PaginatedResponse<RatingVoter> {
  average_rating: number;
  vote_count: number;
}
