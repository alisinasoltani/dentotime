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
  specialty?: string;
  verification_status?: VerificationStatus;
}

export interface AuthResponse {
  access: string;
  refresh: string;
  user: User;
}

export interface ChatThread {
  id: string;
  thread_type: 'USER_ADMIN' | 'DOCTOR_ADMIN' | 'DIRECT';
  participant: User | null;
  guest_contact: {
    phone_number: string;
    first_name: string;
    last_name: string;
  } | null;
  assigned_admin: User | null;
  status: 'OPEN' | 'CLOSED' | 'ARCHIVED';
  unread_count: number;
  last_message: string;
  last_message_at: string | null;
  created_at: string;
}

export interface ChatContact extends Omit<User, 'role'> {
  role: UserRole | 'SUPPORT';
  specialty: string;
  is_pinned: boolean;
  can_unpin: boolean;
}

export interface ChatContactDirectory {
  support: ChatContact;
  pinned: ChatContact[];
  results: ChatContact[];
  pin_count: number;
  pin_limit: number;
  can_pin?: boolean;
}

export interface AdminConversationParticipant {
  id: number | null;
  first_name: string;
  last_name: string;
  role: UserRole | "GUEST";
  phone_number?: string;
}

export interface AdminConversationHistoryThread {
  id: string;
  thread_type: ChatThread["thread_type"];
  status: ChatThread["status"];
  created_at: string;
  last_message_at: string | null;
  last_message: string;
  message_count: number;
  participants: AdminConversationParticipant[];
}

export interface AdminConversationHistoryDetail extends AdminConversationHistoryThread {
  messages: ChatMessage[];
}

export interface ChatMessage {
  id: string;
  thread: string;
  sender: ChatMessageSender;
  sender_type: 'USER' | 'DOCTOR' | 'ADMIN' | 'GUEST';
  body: string;
  visibility: 'PARTICIPANTS' | 'ADMINS_ONLY';
  is_internal_note: boolean;
  attachments: ChatAttachment[];
  created_at: string;
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
  documents?: DoctorDocument[];
}

export interface Appointment {
  id: string;
  patient?: {
    id?: string | number;
    first_name?: string;
    last_name?: string;
    phone_number?: string;
    profile_picture?: string | null;
  } | null;
  user?: {
    first_name?: string;
    last_name?: string;
    username?: string;
  };
  date?: string;
  start_at?: string;
  slot?: {
    id?: number;
    doctor?: number | null;
    date?: string;
    start_at?: string;
    end_at?: string;
  };
  contact_phone_number?: string;
  contact_first_name?: string;
  contact_last_name?: string;
  doctor?: {
    id: string | number;
    first_name: string;
    last_name: string;
    display_name: string;
  } | null;
  status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED" | "COMPLETED" | "NO_SHOW";
  attendance_status: "NOT_CONFIRMED" | "ATTENDED" | "DID_NOT_ATTEND";
  attendance_confirmed_at?: string | null;
  reason?: string;
  admin_notes?: string;
  created_at?: string;
  can_cancel?: boolean;
}

export interface DoctorCalendarDay {
  date: string;
  total: number;
  pending: number;
  approved: number;
  cancelled: number;
}

export interface DoctorAvailabilitySlot {
  id: number;
  doctor: number;
  date: string;
  start_at: string;
  end_at: string;
  status: 'AVAILABLE' | 'BOOKED' | 'BLOCKED';
  capacity_index: number;
  generated_by_schedule: boolean;
}

export interface DoctorAvailabilityRule {
  id: number;
  weekday: number;
  start_time: string;
  end_time: string;
  slot_duration_minutes: number;
  starts_on: string;
  ends_on: string;
  is_active: boolean;
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
export interface ChatMessageSender {
  id: string | null;
  role: UserRole | 'GUEST';
  first_name: string;
  last_name: string;
}

export interface MessageCursorPage {
  next: string | null;
  previous: string | null;
  results: ChatMessage[];
}

export interface MessageDeltaPage {
  cursor: string;
  has_more: boolean;
  results: ChatMessage[];
}

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
  id: string | number;
  slug: string;
  first_name: string;
  last_name: string;
  display_name: string;
  profile_picture?: string | null;
  specialty: string;
  clinic_name?: string;
  bio: string;
  experience: string;
  address: string;
  map_url: string;
  services: DentalService[];
  insurances: InsuranceProvider[];
  likes_count: number;
  is_liked?: boolean;
  average_rating: number;
  vote_count: number;
}

export interface Review {
  id: string;
  reviewer_display_name: string;
  rating: number;
  answers: ReviewAnswer[];
  comment: string;
  created_at: string;
  updated_at: string;
}

export interface DentalService {
  id: number;
  slug: string;
  title: string;
  short_title: string;
  description: string;
  icon: string;
  position: number;
}

export interface InsuranceProvider {
  id: number;
  name: string;
  position: number;
}

export interface PublicCatalog {
  services: DentalService[];
  insurances: InsuranceProvider[];
}

export type RatingInputType = "STAR" | "RECOMMENDATION" | "WAIT_TIME";

export interface RatingOption {
  value: number;
  label: string;
}

export interface RatingParameter {
  id: number;
  key: string;
  label: string;
  prompt: string;
  input_type: RatingInputType;
  options: RatingOption[];
  position: number;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
  average?: number | null;
  answer_count?: number;
}

export interface ReviewAnswer {
  parameter_id: number;
  key: string;
  label: string;
  input_type: RatingInputType;
  value: number;
  option_label: string;
}

export interface DoctorRatingSummary {
  average_rating: number;
  vote_count: number;
  recommendation_percentage: number;
  recommendation_count: number;
  average_wait_time: RatingOption | null;
  parameters: RatingParameter[];
}

export type ReviewEligibilityState =
  | "AUTH_REQUIRED"
  | "NO_APPOINTMENT"
  | "UPCOMING_APPOINTMENT"
  | "VISIT_CONFIRMATION_REQUIRED"
  | "ELIGIBLE";

export interface ReviewEligibility {
  state: ReviewEligibilityState;
  qualifying_appointment_id?: string;
  existing_review?: Review | null;
}

export interface DoctorReviewSubmission {
  answers: Array<{ parameter_id: number; value: number }>;
  comment: string;
}

export type DoctorDetail = PublicDoctor & {
  education: string;
  clinical_history: string;
  certifications: string;
};

export type DoctorPublicProfile = Pick<DoctorDetail,
  "specialty" | "bio" | "experience" | "clinic_name" | "address" | "map_url" |
  "education" | "clinical_history" | "certifications"
> & { services: number[]; insurances: number[] };

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
  answers: ReviewAnswer[];
  comment: string;
  created_at: string;
  updated_at: string;
}

export interface RatingVoterPage extends PaginatedResponse<RatingVoter> {
  average_rating: number;
  vote_count: number;
}
