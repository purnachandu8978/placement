import { apiClient } from './apiClient';
import type {
  Assignment,
  AdminAssignmentSubmission,
  AssignmentQuestion,
  AssignmentAnswerSubmission,
  AssignmentStatus,
} from '../types';

export interface BackendAssignmentItem {
  id: string;
  template_key?: string;
  title: string;
  category?: string;
  skill: string;
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced' | string;
  description: string;
  instructions?: string;
  deliverables?: string[];
  requirements?: string[];
  estimated_hours?: number;
  deadline?: string;
  remaining_seconds?: number;
  duration_minutes?: number;
  week_number?: number;
  max_score?: number;
  total_marks?: number;
  late_submission_policy?: string;
  status: string;
  question_count?: number;
  questions?: AssignmentQuestion[];
  submission?: {
    id?: string;
    github_url?: string;
    live_url?: string;
    code_snippet?: string;
    notes?: string;
    answers?: AssignmentAnswerSubmission[];
    score?: number;
    auto_score?: number;
    evaluation?: string;
    status?: string;
    reviewed_by?: string;
    reviewed_at?: string;
    submitted_at?: string;
    is_late?: boolean;
  } | null;
}

export interface AdminDashboardStats {
  total_assignments: number;
  published_assignments: number;
  draft_assignments: number;
  total_allocated_students: number;
  pending_submissions: number;
  submitted_assignments: number;
  overdue_assignments: number;
  evaluations_pending: number;
  completed_evaluations: number;
}

export interface AdminAssignmentListItem {
  id: string;
  title: string;
  category: string;
  skill: string;
  difficulty: string;
  total_marks: number;
  question_count: number;
  allocated_students_count: number;
  submissions_count: number;
  evaluated_count: number;
  deadline?: string;
  status: 'draft' | 'published' | 'scheduled' | 'archived' | string;
  created_at?: string;
}

export interface AllocationPreviewResponse {
  matched_count: number;
  students: Array<{
    uid: string;
    name: string;
    email: string;
    department: string;
    graduation_year?: number;
  }>;
}

export interface AssignmentAnalyticsData {
  assignment_id: string;
  title: string;
  total_allocated: number;
  submitted_count: number;
  evaluated_count: number;
  submission_rate: number;
  average_score: number;
  highest_score: number;
  lowest_score: number;
  question_stats: Array<{
    question_id: string;
    title: string;
    type: string;
    max_points: number;
    average_earned: number;
    accuracy_percent: number;
  }>;
  students_requiring_attention: Array<{
    user_id: string;
    student_name: string;
    student_email: string;
    department: string;
    status: string;
    score?: number;
    reason: string;
  }>;
  allocations: Array<{
    user_id: string;
    student_name: string;
    student_email: string;
    department: string;
    status: string;
    score?: number;
  }>;
}

function normalizeStatus(backendStatus: string): AssignmentStatus {
  switch (backendStatus?.toLowerCase()) {
    case 'evaluated':
    case 'graded':
      return 'Graded';
    case 'submitted':
      return 'Submitted';
    case 'in_progress':
      return 'In Progress';
    case 'not_started':
      return 'Not Started';
    case 'overdue':
      return 'Overdue';
    case 'under_review':
      return 'Under Review';
    default:
      return 'Pending';
  }
}

function mapAssignment(item: BackendAssignmentItem, idx: number): Assignment {
  const mappedStatus = normalizeStatus(item.status);

  const requirements =
    item.requirements && item.requirements.length > 0
      ? item.requirements
      : item.deliverables && item.deliverables.length > 0
      ? item.deliverables
      : ['GitHub Repository URL', 'Architecture Design Notes', 'Verification Benchmark Tests'];

  const deliverablesStr =
    item.deliverables && item.deliverables.length > 0
      ? item.deliverables.join(', ')
      : requirements.join(', ');

  const deadline = item.deadline || new Date(Date.now() + 7 * 86400000).toISOString();

  return {
    id: item.id,
    weekNumber: item.week_number || (idx % 4) + 1,
    title: item.title,
    category: item.category || item.skill || 'Technical',
    skill: item.skill || item.category || 'Software Engineering',
    difficulty: item.difficulty || 'Intermediate',
    description: item.description,
    instructions: item.instructions,
    requirements,
    deliverables: deliverablesStr,
    deadline,
    remainingSeconds: item.remaining_seconds,
    durationMinutes: item.duration_minutes,
    totalMarks: item.total_marks || item.max_score || 100,
    maxScore: item.max_score || item.total_marks || 100,
    lateSubmissionPolicy: item.late_submission_policy || 'allow_penalty',
    questionCount: item.question_count ?? (item.questions ? item.questions.length : 0),
    questions: item.questions,
    rubric: [
      { criteria: 'Technical Correctness & Execution', weightage: 50 },
      { criteria: 'Architecture & Code Quality', weightage: 30 },
      { criteria: 'Documentation & Benchmark Evidence', weightage: 20 },
    ],
    status: mappedStatus,
    submission: item.submission
      ? {
          id: item.submission.id || `sub-${item.id}`,
          submittedAt: item.submission.submitted_at || new Date().toISOString(),
          repoUrl: item.submission.github_url,
          deployedUrl: item.submission.live_url || undefined,
          codeSnippet: item.submission.code_snippet,
          notes: item.submission.notes,
          answers: item.submission.answers,
          grade: item.submission.score,
          autoScore: item.submission.auto_score ?? item.submission.score,
          feedback: item.submission.evaluation,
          reviewedBy: item.submission.reviewed_by,
          reviewedAt: item.submission.reviewed_at,
          canResubmit: true,
          status: item.submission.status,
          isLate: item.submission.is_late,
        }
      : undefined,
  };
}

export const assignmentService = {
  // --------------------------------------------------------------------------
  // Student APIs
  // --------------------------------------------------------------------------
  async getAssignments(): Promise<Assignment[]> {
    const docs = await apiClient.get<BackendAssignmentItem[]>('/assignments');
    return (docs || []).map(mapAssignment);
  },

  async getAssignmentById(id: string): Promise<Assignment | undefined> {
    const all = await this.getAssignments();
    return all.find((a) => a.id === id);
  },

  async getAssignmentWorkstation(id: string): Promise<{
    id: string;
    title: string;
    description: string;
    instructions?: string;
    category: string;
    skill: string;
    difficulty: string;
    total_marks: number;
    duration_minutes?: number;
    deadline?: string;
    late_submission_policy?: string;
    deliverables: string[];
    questions: AssignmentQuestion[];
    draft_submission?: {
      github_url?: string;
      live_url?: string;
      code_snippet?: string;
      notes?: string;
      answers?: AssignmentAnswerSubmission[];
      status?: string;
    } | null;
  }> {
    return apiClient.get(`/assignments/${encodeURIComponent(id)}/take`);
  },

  async saveProgress(
    id: string,
    payload: {
      github_url?: string;
      live_url?: string;
      code_snippet?: string;
      notes?: string;
      answers?: AssignmentAnswerSubmission[];
    }
  ): Promise<any> {
    return apiClient.post(`/assignments/${encodeURIComponent(id)}/progress`, payload);
  },

  async submitAssignment(
    id: string,
    submissionData: {
      repoUrl?: string;
      deployedUrl?: string;
      codeSnippet?: string;
      notes?: string;
      answers?: AssignmentAnswerSubmission[];
    }
  ): Promise<Assignment> {
    await apiClient.post(`/assignments/${encodeURIComponent(id)}/submit`, {
      github_url: submissionData.repoUrl?.trim() || '',
      live_url: submissionData.deployedUrl?.trim() || null,
      code_snippet: submissionData.codeSnippet?.trim() || '',
      notes: submissionData.notes?.trim() || '',
      answers: submissionData.answers || [],
    });
    const updated = await this.getAssignmentById(id);
    if (!updated) {
      throw new Error('Submitted assignment could not be refreshed.');
    }
    return updated;
  },

  async getAssignmentResult(id: string): Promise<any> {
    return apiClient.get(`/assignments/${encodeURIComponent(id)}/result`);
  },

  // --------------------------------------------------------------------------
  // Administrator APIs
  // --------------------------------------------------------------------------
  async getAdminDashboardStats(): Promise<AdminDashboardStats> {
    return apiClient.get<AdminDashboardStats>('/assignments/admin/dashboard-stats');
  },

  async getAdminAssignmentsList(params?: {
    q?: string;
    status_filter?: string;
    category_filter?: string;
    page?: number;
    limit?: number;
  }): Promise<{ items: AdminAssignmentListItem[]; total: number; page: number; limit: number }> {
    const qs = new URLSearchParams();
    if (params?.q) qs.set('q', params.q);
    if (params?.status_filter) qs.set('status_filter', params.status_filter);
    if (params?.category_filter) qs.set('category_filter', params.category_filter);
    if (params?.page) qs.set('page', String(params.page));
    if (params?.limit) qs.set('limit', String(params.limit));
    const url = `/assignments/admin/list${qs.toString() ? '?' + qs.toString() : ''}`;
    return apiClient.get(url);
  },

  async previewAllocation(payload: {
    target_type: string;
    departments?: string[];
    batches?: number[];
    skills?: string[];
    student_uids?: string[];
  }): Promise<AllocationPreviewResponse> {
    return apiClient.post('/assignments/admin/allocation-preview', payload);
  },

  async createAssignment(data: {
    title: string;
    description: string;
    instructions?: string;
    category: string;
    skill: string;
    difficulty: string;
    total_marks?: number;
    start_time?: string;
    deadline?: string;
    duration_minutes?: number;
    late_submission_policy?: string;
    late_penalty_percent?: number;
    deliverables: string[];
    due_in_days?: number;
    week_number?: number;
    status?: string;
    questions?: AssignmentQuestion[];
    allocation?: {
      target_type: string;
      departments?: string[];
      batches?: number[];
      skills?: string[];
      student_uids?: string[];
    };
  }): Promise<any> {
    return apiClient.post('/assignments', data);
  },

  async updateAssignment(
    id: string,
    data: Partial<{
      title: string;
      description: string;
      instructions?: string;
      category: string;
      skill: string;
      difficulty: string;
      total_marks?: number;
      deadline?: string;
      duration_minutes?: number;
      late_submission_policy?: string;
      status?: string;
      questions?: AssignmentQuestion[];
      deliverables?: string[];
    }>
  ): Promise<any> {
    return apiClient.put(`/assignments/${encodeURIComponent(id)}`, data);
  },

  async deleteAssignment(id: string): Promise<void> {
    await apiClient.delete(`/assignments/${encodeURIComponent(id)}`);
  },

  async duplicateAssignment(id: string): Promise<{ id: string }> {
    return apiClient.post(`/assignments/admin/${encodeURIComponent(id)}/duplicate`, {});
  },

  async updateAssignmentStatus(
    id: string,
    status: 'draft' | 'published' | 'scheduled' | 'archived'
  ): Promise<{ status: string }> {
    return apiClient.patch(`/assignments/admin/${encodeURIComponent(id)}/status`, { status });
  },

  async allocateAssignment(
    id: string,
    allocation: {
      target_type: string;
      departments?: string[];
      batches?: number[];
      skills?: string[];
      student_uids?: string[];
    }
  ): Promise<{ allocated_count: number }> {
    return apiClient.post(`/assignments/admin/${encodeURIComponent(id)}/allocate`, allocation);
  },

  async getAssignmentAnalytics(id: string): Promise<AssignmentAnalyticsData> {
    return apiClient.get(`/assignments/admin/${encodeURIComponent(id)}/analytics`);
  },

  async getAdminSubmissions(): Promise<AdminAssignmentSubmission[]> {
    const data = await apiClient.get<AdminAssignmentSubmission[]>('/assignments/admin/submissions');
    return data || [];
  },

  async getAdminSubmissionDetail(submissionId: string): Promise<any> {
    return apiClient.get(`/assignments/admin/submissions/${encodeURIComponent(submissionId)}`);
  },

  async gradeSubmission(
    submissionId: string,
    score?: number,
    feedback?: string,
    questionScores?: Array<{ question_id: string; awarded_marks: number; feedback?: string }>
  ): Promise<any> {
    return apiClient.post(`/assignments/admin/submissions/${encodeURIComponent(submissionId)}/grade`, {
      score,
      feedback: feedback || '',
      question_scores: questionScores || [],
      release_result: true,
    });
  },

  getExportCsvUrl(assignmentId: string): string {
    return `/api/v1/assignments/admin/${encodeURIComponent(assignmentId)}/export-csv`;
  },
};
