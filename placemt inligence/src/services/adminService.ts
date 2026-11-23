import { apiClient } from './apiClient';

export interface IntegrationsStatusResponse {
  mongodb: {
    status: string;
    database: string;
    using_mock: boolean;
    uri_configured: boolean;
    uri_masked: string;
    collections: string[];
  };
  mongodb_uri_masked?: string;
  mongodb_db_name?: string;
  firebase: {
    admin_sdk_loaded: boolean;
    live_cert_loaded: boolean;
    project_id_configured: boolean;
    project_id: string;
    mock_dev_fallback: boolean;
    web_config: {
      apiKey: string;
      authDomain: string;
      projectId: string;
      storageBucket: string;
      messagingSenderId: string;
      appId: string;
      configured: boolean;
    };
  };
  firebase_project_id?: string;
}

export interface IntegrationsUpdatePayload {
  mongodb_uri?: string;
  mongodb_db_name?: string;
  firebase_credentials_json?: string;
  firebase_credentials_path?: string;
  firebase_project_id?: string;
  firebase_web_config?: {
    apiKey?: string;
    authDomain?: string;
    projectId?: string;
    storageBucket?: string;
    messagingSenderId?: string;
    appId?: string;
  };
}

export interface AdminDashboardMetrics {
  total_students: number;
  total_admins: number;
  total_resumes: number;
  students_with_resumes: number;
  total_assessments_taken: number;
  total_verified_skills: number;
  total_assignments_submitted: number;
  active_jobs: number;
  total_applications: number;
  total_logins: number;
  pending_verifications: number;
  avg_readiness_score: number;
  avg_ats_score: number;
  top_skills: Array<{ skill: string; students: number; verified: number }>;
  recent_activity: Array<{
    id: string;
    email: string;
    display_name: string;
    role: string;
    auth_provider: string;
    timestamp: string;
  }>;
  student_overview?: {
    total_students: number;
    active_students: number;
    suspended_students: number;
    students_with_resumes: number;
    avg_ats_score: number;
    avg_readiness_score: number;
  };
  academic_overview?: {
    total_assessments_taken: number;
    total_assignments_submitted: number;
    total_verified_skills: number;
    total_questions: number;
    total_assignments: number;
  };
  placement_overview?: {
    active_jobs: number;
    total_applications: number;
    pending_verifications: number;
    live_sources: number;
    automated_discoveries: number;
  };
  platform_health?: {
    mongodb_status: string;
    mongodb_latency_ms: number;
    background_workers: string;
    active_sessions: number;
  };
}

export interface AdminStudentRow {
  firebase_uid: string;
  email: string;
  display_name: string;
  photo_url?: string;
  account_status: string;
  auth_provider: string;
  college: string;
  degree: string;
  branch: string;
  graduation_year?: number | null;
  semester?: number | null;
  cgpa?: number | null;
  backlogs?: number;
  target_roles?: string[];
  groups?: string[];
  has_resume: boolean;
  resume_filename?: string | null;
  ats_score: number;
  extracted_skills_count: number;
  verified_skills_count: number;
  readiness_score: number;
  created_at?: string;
  last_login?: string;
}

export interface Student360Data {
  personal_info: {
    uid: string;
    display_name: string;
    email: string;
    phone: string;
    photo_url?: string;
    account_status: string;
    auth_provider: string;
    created_at: string;
    last_login?: string;
  };
  academic_info: {
    college: string;
    degree: string;
    branch: string;
    graduation_year?: number;
    semester?: number;
    cgpa?: number;
    backlogs?: number;
    target_roles: string[];
    preferred_locations: string[];
    github_url?: string;
    linkedin_url?: string;
    portfolio_url?: string;
  };
  resume_info: {
    has_resume: boolean;
    active_resume?: any;
    all_resumes: any[];
    ats_score: number;
    ats_breakdown: Record<string, any>;
    suggestions: string[];
  };
  assessment_history: any[];
  assignment_history: any[];
  skill_proficiency: any[];
  verified_skills: any[];
  roadmap: any;
  job_matches: any[];
  application_tracking: any[];
  placement_readiness: any;
  notifications_and_activity: {
    notifications: any[];
    logins: any[];
    groups: Array<{ id: string; name: string; department?: string }>;
  };
}

export interface StudentGroupRow {
  id: string;
  name: string;
  description: string;
  department?: string | null;
  batch?: number | null;
  tags: string[];
  student_count: number;
  student_ids: string[];
  created_at: string;
  updated_at?: string;
  members?: Array<{
    firebase_uid: string;
    display_name: string;
    email: string;
    branch: string;
    graduation_year?: number;
    ats_score: number;
    readiness_score: number;
    account_status: string;
  }>;
}

export interface AnnouncementRow {
  id: string;
  title: string;
  message: string;
  target_type: 'ALL' | 'DEPARTMENT' | 'BATCH' | 'GROUP' | 'INDIVIDUAL' | string;
  target_filter: Record<string, any>;
  priority: 'normal' | 'urgent';
  recipient_count: number;
  created_by?: string;
  created_at: string;
  expires_at?: string;
}

export interface AdminAccountRow {
  uid: string;
  email: string;
  display_name: string;
  role: string;
  account_status: string;
  auth_provider: string;
  created_at: string;
  last_login?: string;
}

export interface LoginAuditRow {
  id: string;
  firebase_uid: string;
  email: string;
  display_name: string;
  role: string;
  auth_provider: string;
  ip_address?: string;
  user_agent?: string;
  logged_in_at: string;
  logged_out_at?: string | null;
}

export interface AdminResumeRow {
  id: string;
  resume_id?: string;
  user_id: string;
  student_name: string;
  student_email: string;
  filename: string;
  original_filename?: string;
  file_type: string;
  file_size?: number;
  storage_key?: string;
  storage_provider?: string;
  content_type?: string;
  document_hash?: string;
  processing_status?: 'completed' | 'failed' | 'processing';
  processing_error?: string | null;
  version: number;
  is_active: boolean;
  ats_score: number;
  college: string;
  skills: string[];
  uploaded_at: string;
}

export interface VerificationRequest {
  id: string;
  user_id: string;
  student_name: string;
  student_email: string;
  skill_name: string;
  proof_url: string;
  notes?: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewer_note?: string;
  created_at: string;
}

export interface AdminTestCase {
  id?: string;
  label: string;
  input: string;
  expected: string;
  is_hidden: boolean;
  weight?: number;
}

export interface AdminQuestionItem {
  id: string;
  skill_id: string;
  skill_name: string;
  category: string;
  type: 'mcq' | 'simple_coding' | 'hard_coding' | 'short_answer' | string;
  title: string;
  question_text: string;
  problem_statement?: string;
  input_format?: string;
  output_format?: string;
  constraints?: string[];
  points: number;
  difficulty: string;
  estimated_minutes?: number;
  instructions?: string;
  tags?: string[];
  expected_answer?: string;
  rubric?: string;
  admin_feedback?: string;
  partial_credit?: boolean;
  supported_languages?: string[];
  time_limit_ms?: number;
  memory_limit_kb?: number;
  starter_code?: Record<string, string>;
  test_cases?: AdminTestCase[];
  hidden_test_count?: number;
  approval_status?: 'approved' | 'draft' | 'pending_review' | 'archived' | string;
  options?: Array<{ id: string; option_text: string; order_index: number }>;
  correct_answer?: number;
  explanation?: string;
}

export interface AdminCodingSubmissionRow {
  submission_id: string;
  attempt_id: string;
  assessment_id: string;
  skill_name: string;
  user_id: string;
  student_email: string;
  student_name: string;
  question_id: string;
  question_title: string;
  language: string;
  run_type: string;
  status: string;
  passed_test_cases: number;
  total_test_cases: number;
  score_percentage: number;
  earned_points: number;
  max_points: number;
  execution_time_ms: number;
  hidden_summary?: { passed: number; total: number };
  submitted_at: string;
  source_code?: string;
  compile_error?: string;
  runtime_error?: string;
  test_case_results?: Array<{
    id: string;
    label: string;
    is_hidden: boolean;
    passed: boolean;
    status: string;
    execution_time_ms: number;
    input: string;
    expected_output: string;
    actual_output: string;
    stderr?: string;
  }>;
}

export const adminService = {
  async getDashboardMetrics(): Promise<AdminDashboardMetrics> {
    return apiClient.get<AdminDashboardMetrics>('/admin/metrics');
  },

  async getStudents(): Promise<AdminStudentRow[]> {
    return apiClient.get<AdminStudentRow[]>('/admin/students');
  },

  async getLoginAudit(): Promise<LoginAuditRow[]> {
    return apiClient.get<LoginAuditRow[]>('/admin/logins');
  },

  async getResumes(): Promise<AdminResumeRow[]> {
    return apiClient.get<AdminResumeRow[]>('/admin/resumes');
  },

  async reprocessResume(resumeId: string): Promise<any> {
    return apiClient.post(`/admin/resumes/${encodeURIComponent(resumeId)}/reprocess`);
  },

  async getResumeSignedDownloadUrl(resumeId: string): Promise<{ download_url: string; filename: string }> {
    return apiClient.get(`/resumes/${encodeURIComponent(resumeId)}/download-url`);
  },

  async deleteResume(resumeId: string): Promise<any> {
    return apiClient.delete(`/admin/resumes/${encodeURIComponent(resumeId)}`);
  },

  async getStorageStats(): Promise<any> {
    return apiClient.get('/admin/resumes/storage-stats');
  },

  async migrateResumes(dryRun = false, batchSize = 50): Promise<any> {
    return apiClient.post('/admin/resumes/migrate', { dry_run: dryRun, batch_size: batchSize });
  },

  async getVerificationQueue(): Promise<VerificationRequest[]> {
    return apiClient.get<VerificationRequest[]>('/admin/verifications');
  },

  async approveVerification(reqId: string, note = 'Verified by Placement Admin', proficiency = 'Proficient') {
    return apiClient.post(`/admin/verifications/${encodeURIComponent(reqId)}/approve`, {
      reviewer_note: note,
      proficiency,
    });
  },

  async rejectVerification(reqId: string, note = 'Insufficient evidence provided') {
    return apiClient.post(`/admin/verifications/${encodeURIComponent(reqId)}/reject`, {
      reviewer_note: note,
    });
  },

  async createAdmin(payload: { email: string; password: string; display_name: string; role: string }) {
    return apiClient.post('/admin/admins', payload);
  },

  async getAdminAccounts(): Promise<AdminAccountRow[]> {
    return apiClient.get<AdminAccountRow[]>('/admin/admins');
  },

  async updateAdminRole(adminUid: string, role: string): Promise<any> {
    return apiClient.put(`/admin/admins/${encodeURIComponent(adminUid)}/role`, { role });
  },

  async getStudent360(userId: string): Promise<Student360Data> {
    return apiClient.get<Student360Data>(`/admin/students/${encodeURIComponent(userId)}/360`);
  },

  async updateStudentProfile(userId: string, payload: Record<string, any>): Promise<any> {
    return apiClient.put(`/admin/students/${encodeURIComponent(userId)}`, payload);
  },

  async suspendStudent(userId: string): Promise<any> {
    return apiClient.post(`/admin/students/${encodeURIComponent(userId)}/suspend`);
  },

  async activateStudent(userId: string): Promise<any> {
    return apiClient.post(`/admin/students/${encodeURIComponent(userId)}/activate`);
  },

  async sendStudentNotification(userId: string, payload: { title: string; message: string; type?: string; priority?: string }): Promise<any> {
    return apiClient.post(`/admin/students/${encodeURIComponent(userId)}/notify`, payload);
  },

  async getStudentHistory(userId: string): Promise<any[]> {
    return apiClient.get<any[]>(`/admin/students/${encodeURIComponent(userId)}/history`);
  },

  async getGroups(): Promise<StudentGroupRow[]> {
    return apiClient.get<StudentGroupRow[]>('/admin/groups');
  },

  async createGroup(payload: { name: string; description?: string; department?: string; batch?: number; tags?: string[]; student_ids?: string[] }): Promise<{ id: string; message: string }> {
    return apiClient.post('/admin/groups', payload);
  },

  async getGroupDetail(groupId: string): Promise<StudentGroupRow> {
    return apiClient.get<StudentGroupRow>(`/admin/groups/${encodeURIComponent(groupId)}`);
  },

  async updateGroup(groupId: string, payload: Partial<StudentGroupRow>): Promise<any> {
    return apiClient.put(`/admin/groups/${encodeURIComponent(groupId)}`, payload);
  },

  async deleteGroup(groupId: string): Promise<any> {
    return apiClient.delete(`/admin/groups/${encodeURIComponent(groupId)}`);
  },

  async modifyGroupMembers(groupId: string, action: 'add' | 'remove', studentIds: string[]): Promise<any> {
    return apiClient.post(`/admin/groups/${encodeURIComponent(groupId)}/members`, { action, student_ids: studentIds });
  },

  async assignGroupAssessment(groupId: string, assessmentId: string, title?: string, dueDate?: string): Promise<any> {
    return apiClient.post(`/admin/groups/${encodeURIComponent(groupId)}/assign-assessment`, {
      assessment_id: assessmentId,
      title,
      due_date: dueDate,
    });
  },

  async assignGroupAssignment(groupId: string, assignmentId: string, dueDate?: string): Promise<any> {
    return apiClient.post(`/admin/groups/${encodeURIComponent(groupId)}/assign-assignment`, {
      assignment_id: assignmentId,
      due_date: dueDate,
    });
  },

  async notifyGroup(groupId: string, payload: { title: string; message: string; priority?: string }): Promise<any> {
    return apiClient.post(`/admin/groups/${encodeURIComponent(groupId)}/notify`, payload);
  },

  async getGroupAnalytics(groupId: string): Promise<any> {
    return apiClient.get(`/admin/groups/${encodeURIComponent(groupId)}/analytics`);
  },

  async getAnnouncements(): Promise<AnnouncementRow[]> {
    return apiClient.get<AnnouncementRow[]>('/admin/communication/announcements');
  },

  async createAnnouncement(payload: { title: string; message: string; target_type: string; target_filter?: Record<string, any>; priority?: string; expires_at?: string }): Promise<any> {
    return apiClient.post('/admin/communication/announcements', payload);
  },

  async deleteAnnouncement(announcementId: string): Promise<any> {
    return apiClient.delete(`/admin/communication/announcements/${encodeURIComponent(announcementId)}`);
  },

  async getAuditLogs() {
    return apiClient.get<Array<{ id: string; admin_uid: string; action: string; target_id: string; details: Record<string, any>; timestamp: string }>>('/admin/audit-logs');
  },

  async getIntegrationsStatus(): Promise<IntegrationsStatusResponse> {
    return apiClient.get<IntegrationsStatusResponse>('/admin/integrations');
  },

  async updateIntegrationsConfig(payload: IntegrationsUpdatePayload) {
    return apiClient.put('/admin/integrations', payload);
  },

  async getQuestions(type?: string): Promise<AdminQuestionItem[]> {
    const qs = type && type !== 'all' ? `?type=${encodeURIComponent(type)}` : '';
    return apiClient.get<AdminQuestionItem[]>(`/questions${qs}`);
  },

  async createQuestion(payload: Record<string, any>): Promise<AdminQuestionItem> {
    return apiClient.post<AdminQuestionItem>('/questions', payload);
  },

  async updateQuestion(questionId: string, payload: Record<string, any>): Promise<AdminQuestionItem> {
    return apiClient.put<AdminQuestionItem>(`/questions/${encodeURIComponent(questionId)}`, payload);
  },

  async approveQuestion(questionId: string, approvalStatus: 'approved' | 'draft' | 'archived' = 'approved') {
    return apiClient.patch<{ id: string; approval_status: string }>(
      `/questions/${encodeURIComponent(questionId)}/approve`,
      { approval_status: approvalStatus }
    );
  },

  async deleteQuestion(questionId: string) {
    return apiClient.delete<{ deleted: boolean; id: string }>(`/questions/${encodeURIComponent(questionId)}`);
  },

  async getCodingSubmissions(params?: { status?: string; language?: string }): Promise<AdminCodingSubmissionRow[]> {
    const q = new URLSearchParams();
    if (params?.status) q.set('status', params.status);
    if (params?.language) q.set('language', params.language);
    const qs = q.toString() ? `?${q.toString()}` : '';
    return apiClient.get<AdminCodingSubmissionRow[]>(`/admin/submissions${qs}`);
  },

  async getCodingSubmissionDetail(submissionId: string): Promise<AdminCodingSubmissionRow> {
    return apiClient.get<AdminCodingSubmissionRow>(`/admin/submissions/${encodeURIComponent(submissionId)}`);
  },

  async getApiQuotas(): Promise<{
    date: string;
    status: string;
    free_tier_mode: boolean;
    quotas: {
      firecrawl: {
        service: string;
        date: string;
        requests_used: number;
        max_daily_requests: number;
        requests_remaining: number;
        status: string;
        is_quota_available: boolean;
        successful_requests: number;
        failed_requests: number;
        cache_hits: number;
        reset_in_seconds: number;
        reset_in_hours: number;
        last_request_at?: string;
      };
      gemini: {
        service: string;
        date: string;
        requests_used: number;
        max_daily_requests: number;
        requests_remaining: number;
        status: string;
        is_quota_available: boolean;
        successful_requests: number;
        failed_requests: number;
        cache_hits: number;
        reset_in_seconds: number;
        reset_in_hours: number;
        last_request_at?: string;
      };
      judge0: {
        service: string;
        date: string;
        requests_used: number;
        max_daily_requests: number;
        requests_remaining: number;
        status: string;
        is_quota_available: boolean;
        successful_requests: number;
        failed_requests: number;
        cache_hits: number;
        reset_in_seconds: number;
        reset_in_hours: number;
        last_request_at?: string;
      };
    };
  }> {
    return apiClient.get('/admin/quotas');
  },
};
