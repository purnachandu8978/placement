import { apiClient } from './apiClient';
import type { JobPosting } from '../types';

export interface BackendJobItem {
  id: string;
  title: string;
  company: string;
  location: string;
  work_mode: 'Remote' | 'Hybrid' | 'Onsite';
  salary?: string;
  package_lpa?: number;
  description: string;
  required_skills: string[];
  preferred_skills?: string[];
  eligibility?: string;
  employment_type?: string;
  source_name?: string;
  source_type?: string;
  source_job_id?: string;
  original_apply_url?: string;
  original_job_url?: string;
  posted_at?: string;
  expires_at?: string;
  match_score: number;
  matched_skills: string[];
  verified_matched_skills: string[];
  resume_skills_matched?: string[];
  missing_skills: string[];
  readiness_status?: string;
  recommendation?: string;
  role_relevance_summary?: string;
  eligibility_concerns?: string[];
  recommended_preparation?: string[];
  formula_breakdown?: Record<string, number>;
  has_applied: boolean;
  is_saved: boolean;
}

export interface JobFilterParams {
  location?: string;
  work_mode?: string;
  search?: string;
  employment_type?: string;
  min_match_score?: number;
  is_saved_only?: boolean;
  has_applied_only?: boolean;
}

export interface JobSource {
  id: string;
  name: string;
  source_type: string;
  endpoint_url?: string;
  board_token?: string;
  sync_interval_minutes: number;
  priority: number;
  status: 'LIVE' | 'NOT_CONFIGURED' | 'DISABLED' | 'FAILED';
  is_active: boolean;
  requires_auth: boolean;
  last_sync_at?: string;
  last_status?: string;
  error_message?: string;
  jobs_imported_count: number;
  created_at?: string;
}

export interface JobSyncRun {
  id: string;
  source_id: string;
  source_name: string;
  status: string;
  jobs_discovered: number;
  jobs_added: number;
  jobs_updated: number;
  jobs_expired: number;
  duplicates_skipped: number;
  duration_seconds: number;
  error_message?: string;
  started_at: string;
  completed_at?: string;
}

export interface JobIngestionStats {
  total_active_jobs: number;
  total_expired_jobs: number;
  sources_count: number;
  live_sources_count: number;
  not_configured_count: number;
  total_applications_recorded: number;
  total_matches_calculated: number;
  last_sync_timestamp?: string;
  last_sync_status?: string;
}

export interface StudentJobPreferences {
  target_job_titles: string[];
  preferred_career_paths: string[];
  skills_of_interest: string[];
  preferred_cities: string[];
  work_modes: string[];
  employment_types: string[];
  fresher_or_experienced: string;
  min_salary_lpa?: number;
  min_stipend_monthly?: number;
  preferred_companies: string[];
  excluded_companies: string[];
  notification_frequency: string;
  alert_score_threshold: number;
  updated_at?: string;
}

export interface JobApplicationTrackerItem {
  id: string;
  job_id: string;
  job_title?: string;
  company?: string;
  match_score?: number;
  status: 'interested' | 'saved' | 'applied' | 'assessment_received' | 'interview' | 'selected' | 'rejected' | 'withdrawn' | 'archived';
  notes?: string;
  interview_date?: string;
  application_method?: string;
  applied_at: string;
  updated_at?: string;
}

export interface WorkerHealthInfo {
  status: string;
  active_workers_count: number;
  active_leases_count: number;
  active_workers: Array<{
    worker_id: string;
    status: string;
    pid: number;
    active_tasks: string[];
    heartbeat_at: string;
    started_at: string;
  }>;
  active_leases: Array<{
    resource: string;
    holder: string;
    acquired_at: string;
    expires_at: string;
  }>;
  last_scheduler_heartbeat?: string;
}


const COMPANY_COLORS = ['#FF7A59', '#E86144', '#D97706', '#2563EB', '#059669', '#7C3AED', '#0284C7', '#4F46E5'];

function mapJob(item: BackendJobItem, idx: number): JobPosting {
  const initials = (item.company || 'CO')
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || '')
    .join('');

  const lpa = item.package_lpa || 15;
  return {
    id: item.id,
    company: item.company,
    companyInitials: initials || 'CO',
    companyColor: COMPANY_COLORS[idx % COMPANY_COLORS.length],
    role: item.title,
    category: 'Engineering',
    location: item.location || 'Remote',
    workMode: item.work_mode || 'Remote',
    ctcMin: Math.max(8, Math.round(lpa - 2)),
    ctcMax: Math.round(lpa + 3),
    salaryLabel: item.salary,
    experienceLevel: 'Fresher / 0-2 Yrs',
    eligibleBatches: ['2025', '2026'],
    eligibleDegrees: ['B.Tech', 'B.E.', 'M.Tech', 'MCA'],
    minCGPA: 6.5,
    maxBacklogs: 0,
    techStack: item.required_skills || [],
    description: item.description || '',
    responsibilities: [item.eligibility || 'Collaborate on scalable engineering systems.'],
    interviewRounds: ['Resume Screen', 'Technical Assessment', 'Engineering Interviews'],
    postedDate: item.posted_at,
    applicationUrl: item.original_apply_url,
    isSaved: Boolean(item.is_saved),
    isApplied: Boolean(item.has_applied),
    hasApplied: Boolean(item.has_applied),
    matchScore: Math.round(item.match_score ?? 0),
    matchedSkills: item.matched_skills || [],
    verifiedMatchedSkills: item.verified_matched_skills || [],
    resumeSkillsMatched: item.resume_skills_matched || [],
    missingSkills: item.missing_skills || [],
    preferredSkills: item.preferred_skills || [],
    recommendation: item.recommendation || '',
    roleRelevanceSummary: item.role_relevance_summary || '',
    eligibilityConcerns: item.eligibility_concerns || [],
    recommendedPreparation: item.recommended_preparation || [],
    formulaBreakdown: item.formula_breakdown || {},
    sourceName: item.source_name || 'Direct Posting',
    sourceType: item.source_type,
    originalJobUrl: item.original_job_url,
    employmentType: item.employment_type || 'Full-time',
    readinessStatus: item.readiness_status,
  };
}

export const jobService = {
  async getJobs(filters?: JobFilterParams): Promise<JobPosting[]> {
    const params = new URLSearchParams();
    if (filters?.location) params.append('location', filters.location);
    if (filters?.work_mode) params.append('work_mode', filters.work_mode);
    if (filters?.search) params.append('search', filters.search);
    if (filters?.employment_type) params.append('employment_type', filters.employment_type);
    if (filters?.min_match_score !== undefined) params.append('min_match_score', String(filters.min_match_score));
    if (filters?.is_saved_only) params.append('is_saved_only', 'true');
    if (filters?.has_applied_only) params.append('has_applied_only', 'true');

    const queryStr = params.toString() ? `?${params.toString()}` : '';
    const items = await apiClient.get<BackendJobItem[]>(`/jobs${queryStr}`);
    return (items || []).map(mapJob);
  },

  async toggleSaveJob(jobId: string): Promise<{ job_id: string; is_saved: boolean }> {
    return apiClient.post<{ job_id: string; is_saved: boolean }>(`/jobs/${encodeURIComponent(jobId)}/save`, {});
  },

  async applyToJob(jobId: string): Promise<{ message: string; job_id: string; match_score: number }> {
    return apiClient.post(`/jobs/${encodeURIComponent(jobId)}/apply`, {});
  },

  async trackJobClick(jobId: string, clickType: 'apply' | 'view_listing' = 'apply'): Promise<any> {
    try {
      return await apiClient.post(`/jobs/${encodeURIComponent(jobId)}/track-click`, { click_type: clickType });
    } catch {
      // Non-blocking telemetry
      return null;
    }
  },

  async getJobApplicationUrl(jobId: string): Promise<{
    job_id: string;
    title: string;
    company: string;
    is_closed: boolean;
    has_apply_url: boolean;
    application_url: string | null;
    listing_url: string | null;
    action_label: string;
  }> {
    return apiClient.get(`/jobs/${encodeURIComponent(jobId)}/application-url`);
  },

  async getJobMatchAnalysis(jobId: string) {
    return apiClient.get(`/job-matches/${encodeURIComponent(jobId)}`);
  },

  async getMyApplications() {
    return apiClient.get('/jobs/applications/me');
  },

  async createJob(payload: {
    title?: string;
    role?: string;
    company: string;
    location?: string;
    work_mode?: string;
    workMode?: string;
    salary?: string;
    description: string;
    required_skills?: string[];
    preferred_skills?: string[];
    techStack?: string[];
    eligibility?: string;
    employment_type?: string;
    original_apply_url?: string;
    original_job_url?: string;
  }) {
    return apiClient.post('/jobs', {
      title: payload.title || payload.role || 'Software Engineer',
      company: payload.company,
      location: payload.location || 'Remote',
      work_mode: payload.work_mode || payload.workMode || 'Hybrid',
      salary: payload.salary || '12 - 18 LPA',
      description: payload.description,
      required_skills: payload.required_skills || payload.techStack || [],
      preferred_skills: payload.preferred_skills || [],
      eligibility: payload.eligibility || '2025/2026 Graduates',
      employment_type: payload.employment_type || 'Full-time',
      original_apply_url: payload.original_apply_url || 'https://placements.edu/apply',
      original_job_url: payload.original_job_url || payload.original_apply_url,
    });
  },

  // Admin Job Discovery & Sources Methods
  async getJobSources(): Promise<JobSource[]> {
    return apiClient.get<JobSource[]>('/admin/jobs/sources');
  },

  async createJobSource(payload: {
    name: string;
    source_type: string;
    endpoint_url?: string;
    board_token?: string;
    api_key?: string;
    sync_interval_minutes?: number;
    priority?: number;
    is_active?: boolean;
    requires_auth?: boolean;
  }): Promise<JobSource> {
    return apiClient.post<JobSource>('/admin/jobs/sources', payload);
  },

  async updateJobSource(sourceId: string, payload: Partial<JobSource>): Promise<JobSource> {
    return apiClient.put<JobSource>(`/admin/jobs/sources/${encodeURIComponent(sourceId)}`, payload);
  },

  async deleteJobSource(sourceId: string): Promise<{ message: string; source_id: string }> {
    return apiClient.delete<{ message: string; source_id: string }>(`/admin/jobs/sources/${encodeURIComponent(sourceId)}`);
  },

  async syncSource(sourceId: string): Promise<any> {
    return apiClient.post(`/admin/jobs/sources/${encodeURIComponent(sourceId)}/sync`, {});
  },

  async syncAllSources(): Promise<any> {
    return apiClient.post('/admin/jobs/sync-all', {});
  },

  async getSyncHistory(limit: number = 30): Promise<JobSyncRun[]> {
    return apiClient.get<JobSyncRun[]>(`/admin/jobs/sync-history?limit=${limit}`);
  },

  async getJobIngestionStats(): Promise<JobIngestionStats> {
    return apiClient.get<JobIngestionStats>('/admin/jobs/stats');
  },

  async moderateJob(jobId: string, payload: { status: string; reason?: string }): Promise<any> {
    return apiClient.put(`/admin/jobs/${encodeURIComponent(jobId)}/moderation`, payload);
  },

  async triggerLiveScrape(): Promise<{ success: boolean; total_discovered: number; total_added: number; sources_synced: number }> {
    return apiClient.post('/jobs/scrape-now', {});
  },

  async getPreferences(): Promise<StudentJobPreferences> {
    return apiClient.get<StudentJobPreferences>('/jobs/preferences');
  },

  async updatePreferences(payload: Partial<StudentJobPreferences>): Promise<StudentJobPreferences> {
    return apiClient.put<StudentJobPreferences>('/jobs/preferences', payload);
  },

  async getApplications(): Promise<JobApplicationTrackerItem[]> {
    return apiClient.get<JobApplicationTrackerItem[]>('/jobs/applications');
  },

  async updateApplicationStatus(jobId: string, payload: {
    status: string;
    notes?: string;
    interview_date?: string;
    application_method?: string;
  }): Promise<{ message: string; job_id: string; status: string; notes?: string }> {
    return apiClient.post(`/jobs/${encodeURIComponent(jobId)}/application-status`, payload);
  },

  async getWorkerHealth(): Promise<WorkerHealthInfo> {
    return apiClient.get<WorkerHealthInfo>('/admin/jobs/worker-health');
  },
};
