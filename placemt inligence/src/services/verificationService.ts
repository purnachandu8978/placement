import { apiClient } from './apiClient';

export interface AssessmentQuestionOut {
  question_id: string;
  text: string;
  type: string;
  options?: string[];
  starter_code?: string;
  language?: string;
  points: number;
}

export interface StartAssessmentResponse {
  attempt_id: string;
  level: string;
  duration_seconds: number;
  remaining_seconds?: number;
  time_limit_minutes: number;
  started_at: string;
  expires_at: string;
  server_time?: string;
  questions: AssessmentQuestionOut[];
  instructions: string;
  passing_threshold_percent: number;
}

export interface SubmitAnswerItem {
  question_id: string;
  selected_option?: number | null;
  code?: string;
  text_answer?: string;
}

export interface SubmitAssessmentResponse {
  attempt_id: string;
  status: string;
  score: number;
  max_score: number;
  percentage: number;
  passed: boolean;
  passing_threshold_percent: number;
  level: string;
  credential_id?: string;
  credential_hash?: string;
  badge_type?: string;
  title?: string;
  feedback: string;
  time_taken_seconds: number;
  certificate_url?: string;
  public_verification_url?: string;
}

export interface StudentCredentialResponse {
  id: string;
  credential_id: string;
  user_id: string;
  student_name: string;
  college: string;
  department?: string;
  level: 'LEVEL_1_BLUE' | 'LEVEL_2_GREEN' | string;
  badge_type: 'BLUE_VERIFIED' | 'GREEN_FULLY_VERIFIED' | string;
  title: string;
  skill: string;
  score: number;
  duration_minutes: number;
  issued_at: string;
  expires_at?: string;
  status: 'ACTIVE' | 'REVOKED' | 'EXPIRED' | string;
  credential_hash: string;
  verification_url: string;
  public_visibility: boolean;
  is_superseded: boolean;
  superseded_by?: string;
  revocation_reason?: string;
}

export interface ItemEvaluationSummary {
  id: string;
  title: string;
  type: 'assignment' | 'assessment';
  skill: string;
  score: number;
  max_score: number;
  percentage: number;
  color: 'GREEN' | 'BLUE' | 'INCOMPLETE';
  status: string;
}

export interface StudentVerificationStatusOverview {
  current_level: 'NOT_VERIFIED' | 'LEVEL_1_BLUE' | 'LEVEL_2_GREEN' | string;
  active_credential?: StudentCredentialResponse | null;
  history: StudentCredentialResponse[];
  level_1_eligible: boolean;
  level_2_eligible: boolean;
  college_name: string;
  trust_score: number;
  certification_percentage: number;
  certification_status: string;
  all_assignments_completed: boolean;
  all_assessments_proven: boolean;
  total_assignments: number;
  completed_assignments: number;
  total_assessments: number;
  passed_assessments: number;
  green_count: number;
  blue_count: number;
  incomplete_count: number;
  assignment_items: ItemEvaluationSummary[];
  assessment_items: ItemEvaluationSummary[];
  eligibility_message: string;
}

export interface PublicCredentialVerificationResponse {
  verified: boolean;
  status: string;
  candidate_name: string;
  college: string;
  level: string;
  badge_type: string;
  title: string;
  skill: string;
  score: number;
  evidence: string;
  credential_id: string;
  verification_hash: string;
  issued_at: string;
  issuing_platform: string;
  cryptographic_algorithm: string;
  revocation_reason?: string;
}

export const verificationService = {
  async getVerificationStatus(): Promise<StudentVerificationStatusOverview> {
    return apiClient.get<StudentVerificationStatusOverview>('/verification/status');
  },

  async startAssessment(
    level: 'LEVEL_1_BLUE' | 'LEVEL_2_GREEN' = 'LEVEL_1_BLUE',
    skillFocus: string = 'Core Web & Software Engineering'
  ): Promise<StartAssessmentResponse> {
    return apiClient.post<StartAssessmentResponse>('/verification/assessment/start', {
      level,
      skill_focus: skillFocus,
    });
  },

  async submitAssessment(
    attemptId: string,
    answers: SubmitAnswerItem[]
  ): Promise<SubmitAssessmentResponse> {
    return apiClient.post<SubmitAssessmentResponse>('/verification/assessment/submit', {
      attempt_id: attemptId,
      answers,
    });
  },

  async getCredential(credentialId: string): Promise<StudentCredentialResponse> {
    return apiClient.get<StudentCredentialResponse>(`/verification/credentials/${encodeURIComponent(credentialId)}`);
  },

  async toggleVisibility(
    credentialId: string,
    publicVisibility: boolean
  ): Promise<{ success: boolean; public_visibility: boolean }> {
    return apiClient.patch<{ success: boolean; public_visibility: boolean }>(
      `/verification/credentials/${encodeURIComponent(credentialId)}/visibility`,
      { public_visibility: publicVisibility }
    );
  },

  getCertificatePdfUrl(credentialId: string): string {
    const backendOrigin = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';
    return `${backendOrigin}/api/v1/verification/credentials/${encodeURIComponent(credentialId)}/pdf`;
  },

  async getPublicVerification(identifier: string): Promise<PublicCredentialVerificationResponse> {
    return apiClient.get<PublicCredentialVerificationResponse>(`/verification/verify/${encodeURIComponent(identifier)}`);
  },
};
