import { apiClient } from './apiClient';

export interface SecurityPolicy {
  enforce_fullscreen: boolean;
  max_violations: number;
  grace_period_seconds: number;
  block_clipboard: boolean;
  block_context_menu: boolean;
  require_seb: boolean;
}

export interface ExaminationQuestion {
  id: string;
  type: 'mcq' | 'coding' | 'simple_coding' | 'hard_coding';
  title: string;
  difficulty?: string;
  points: number;
  question?: string;
  problem_statement?: string;
  options?: string[];
  input_format?: string;
  output_format?: string;
  constraints?: string[];
  sample_inputs?: string[];
  sample_outputs?: string[];
  starter_code?: Record<string, string> | string;
  supported_languages?: string[];
}

export interface SavedAnswer {
  question_id: string;
  type?: string;
  selected_option?: number | null;
  code?: string;
  language?: string;
  is_marked_for_review?: boolean;
}

export interface ExaminationSession {
  session_status: 'active' | 'already_submitted' | 'terminated';
  attempt_id: string;
  exam_type: 'assessment' | 'assignment';
  exam_id: string;
  title: string;
  skill: string;
  duration_minutes: number;
  remaining_seconds: number;
  max_score: number;
  late_submission_policy?: string;
  questions: ExaminationQuestion[];
  saved_answers: Record<string, SavedAnswer>;
  violations_count: number;
  is_malpractice_flagged: boolean;
  max_violations_allowed: number;
  supported_languages: string[];
  security_policy: SecurityPolicy;
  score?: number;
  status?: string;
  submitted_at?: string;
}

export interface RunCodeResult {
  status: string;
  stdout: string;
  stderr: string;
  compile_output?: string;
  time_ms: number;
  memory_kb: number;
}

export interface SecurityEventResponse {
  event_id: string;
  violations_count: number;
  action_taken: string;
  is_terminated: boolean;
  is_qualifying_violation?: boolean;
  warning_message: string;
}

export interface EvaluationItem {
  question_id: string;
  type: string;
  awarded_marks: number;
  max_marks: number;
  is_correct?: boolean;
  passed_tests?: number;
  total_tests?: number;
  error?: string;
}

export interface SubmitExamResult {
  status: string;
  exam_type: string;
  score: number;
  total_earned: number;
  max_total: number;
  passed: boolean;
  evaluation_breakdown: EvaluationItem[];
  submitted_at: string;
}

export interface MonitoringSession {
  attempt_id: string;
  student_id: string;
  student_name: string;
  student_email: string;
  registration_id: string;
  exam_type: string;
  exam_id: string;
  exam_title: string;
  status: string;
  violations_count: number;
  is_malpractice_flagged: boolean;
  remaining_seconds: number;
  start_time: string;
  terminated_at?: string;
  termination_reason?: string;
}

export interface SecurityAuditItem {
  id: string;
  user_id: string;
  student_name: string;
  student_email: string;
  exam_type: string;
  exam_id: string;
  event_type: string;
  details: string;
  violation_count: number;
  action_taken: string;
  server_timestamp: string;
}

export interface MonitoringData {
  active_sessions_count: number;
  malpractice_flagged_count: number;
  terminated_count: number;
  sessions: MonitoringSession[];
  recent_events: SecurityAuditItem[];
}

export const examinationService = {
  async getSession(
    examType: 'assessment' | 'assignment',
    examId: string,
    retake?: boolean
  ): Promise<ExaminationSession> {
    const url = `/examination/session/${examType}/${examId}${retake ? '?retake=true' : ''}`;
    return apiClient.get<ExaminationSession>(url);
  },

  async saveProgress(
    examType: 'assessment' | 'assignment',
    examId: string,
    answers: SavedAnswer[],
    meta?: { github_url?: string; live_url?: string; notes?: string }
  ): Promise<{ message: string; saved_at: string }> {
    return apiClient.post<{ message: string; saved_at: string }>(`/examination/session/${examType}/${examId}/save`, {
      answers,
      github_url: meta?.github_url,
      live_url: meta?.live_url,
      notes: meta?.notes,
    });
  },

  async runCode(
    examType: 'assessment' | 'assignment',
    examId: string,
    payload: { question_id: string; code: string; language: string; custom_input?: string }
  ): Promise<RunCodeResult> {
    return apiClient.post<RunCodeResult>(`/examination/session/${examType}/${examId}/run`, payload);
  },

  async logSecurityEvent(
    examType: 'assessment' | 'assignment',
    examId: string,
    payload: { event_type: string; details?: string; client_timestamp?: string }
  ): Promise<SecurityEventResponse> {
    return apiClient.post<SecurityEventResponse>(
      `/examination/session/${examType}/${examId}/security-event`,
      {
        event_type: payload.event_type,
        details: payload.details || '',
        client_timestamp: payload.client_timestamp || new Date().toISOString(),
      }
    );
  },

  async submitExam(
    examType: 'assessment' | 'assignment',
    examId: string,
    payload: { answers: SavedAnswer[]; github_url?: string; live_url?: string; notes?: string }
  ): Promise<SubmitExamResult> {
    return apiClient.post<SubmitExamResult>(
      `/examination/session/${examType}/${examId}/submit`,
      payload
    );
  },

  getSebConfigUrl(examType: 'assessment' | 'assignment', examId: string): string {
    return `/api/v1/examination/seb-config/${examType}/${examId}`;
  },

  async getAdminMonitoring(): Promise<MonitoringData> {
    return apiClient.get<MonitoringData>('/examination/admin/monitoring');
  },

  async submitAdminDecision(payload: {
    attempt_id: string;
    student_id: string;
    exam_type: string;
    action: 'dismiss_false_positive' | 'authorize_retake' | 'confirm_malpractice' | 'restore_attempt';
    reason: string;
  }): Promise<{ message: string; action_taken: string }> {
    return apiClient.post<{ message: string; action_taken: string }>('/examination/admin/decision', payload);
  },
};
