import { apiClient } from './apiClient';

export type CompanyClassification =
  | 'STARTUP'
  | 'ESTABLISHED_TECH'
  | 'PRODUCT_COMPANY'
  | 'IT_SERVICES'
  | 'EMERGING_VENTURE'
  | 'INCUBATED_VENTURE'
  | 'OTHER';

export type CompanyVerificationStatus =
  | 'GOVERNMENT_VERIFIED'
  | 'MCA_VERIFIED'
  | 'OFFICIAL_WEBSITE_VERIFIED'
  | 'INCUBATOR_VERIFIED'
  | 'INDEPENDENTLY_SOURCED'
  | 'SELF_REPORTED'
  | 'COMMUNITY_SUBMITTED'
  | 'UNDER_REVIEW'
  | 'UNVERIFIED'
  | 'INACTIVE';

export type DpiitStatus = 'RECOGNISED' | 'NOT_RECOGNISED' | 'UNKNOWN' | 'NOT_CHECKED';

export type HiringStatusType =
  | 'OPEN_ROLES_VERIFIED'
  | 'INTERNSHIPS_VERIFIED'
  | 'CAREERS_PAGE_AVAILABLE'
  | 'NO_CURRENT_OPENINGS'
  | 'HIRING_STATUS_UNKNOWN'
  | 'SOURCE_UNAVAILABLE'
  | 'EXPIRED_ROLES'
  | string;

export interface StartupItem {
  id: string;
  startup_id: string;
  name: string;
  legal_name?: string;
  logo_url: string;
  description: string;
  industry: string;
  sector: string;
  sectors?: string[];
  tech_stack?: string[];
  company_classification?: CompanyClassification | string;
  verification_status?: CompanyVerificationStatus | string;
  dpiit_status?: DpiitStatus | string;
  location_precision?: string;
  hq_city: string;
  hq_state: string;
  district?: string;
  lat: number;
  lng: number;
  website: string;
  careers_url: string;
  founding_year?: number;
  dpiit_recognized: boolean;
  dpiit_registration_number?: string;
  funding_stage: string;
  funding_info?: string;
  company_size: string;
  employee_range?: string;
  hiring_status: HiringStatusType;
  internship_available?: boolean;
  fresher_hiring?: boolean;
  college_partner?: boolean;
  data_source: string;
  source_confidence: string;
  source_provenance?: string[];
  discovery_date: string;
  last_verified_at: string;
  is_emerging: boolean;
  open_jobs_count: number;
  is_saved_watchlist?: boolean;
  match_score?: number;
  match_reasons?: string[];
  jobs?: StartupJobItem[];
}

export interface StartupJobItem {
  id: string;
  job_id: string;
  startup_id: string;
  company_name: string;
  company_logo: string;
  title: string;
  location: string;
  city: string;
  state: string;
  work_mode: string;
  employment_type: string;
  experience_level: string;
  required_skills: string[];
  salary: string;
  apply_url: string;
  posting_date: string;
  match_score?: number;
  match_reasons?: string[];
}

export interface StartupMapHub {
  city: string;
  state: string;
  lat: number;
  lng: number;
  startup_count: number;
  hiring_count: number;
  top_sectors: string[];
  sample_startups: Array<{
    name: string;
    logo?: string;
    sector: string;
    hiring: boolean;
  }>;
}

export interface StartupMapDataResponse {
  total_startups: number;
  total_hiring: number;
  hubs: StartupMapHub[];
  state_counts: Record<string, number>;
  sector_counts: Record<string, number>;
}

export interface StateDetailResponse {
  state_name: string;
  normalized_name: string;
  total_companies: number;
  actively_hiring: number;
  dpiit_recognized_count: number;
  districts: Array<{ district: string; count: number }>;
  top_sectors: Array<{ sector: string; count: number }>;
  tech_stack_distribution: Array<{ tech: string; count: number }>;
  companies: Array<{
    id: string;
    startup_id: string;
    name: string;
    legal_name?: string;
    logo_url: string;
    industry: string;
    sector: string;
    city: string;
    district?: string;
    company_classification: string;
    verification_status: string;
    dpiit_status: string;
    funding_stage?: string;
    company_size?: string;
    hiring_status: string;
    internship_available: boolean;
    fresher_hiring: boolean;
    open_jobs_count: number;
    tech_stack: string[];
    website: string;
    careers_url: string;
  }>;
}

export interface StudentJobApplicationRow {
  id: string;
  user_id: string;
  job_id: string;
  job_title: string;
  startup_id: string;
  company_name: string;
  company_logo?: string;
  location: string;
  apply_url: string;
  status:
    | 'SAVED'
    | 'APPLYING'
    | 'APPLIED'
    | 'ASSESSMENT'
    | 'INTERVIEW'
    | 'OFFER'
    | 'REJECTED'
    | 'WITHDRAWN'
    | string;
  applied_at: string;
  updated_at: string;
  notes?: string;
}

export interface StartupFilterParams {
  state?: string;
  city?: string;
  district?: string;
  sector?: string;
  classification?: string;
  verification_status?: string;
  dpiit_status?: string;
  tech_stack?: string;
  internship_only?: boolean;
  fresher_only?: boolean;
  hiring_status?: string;
  dpiit_only?: boolean;
  emerging_only?: boolean;
  search?: string;
  limit?: number;
  skip?: number;
}

export interface WatchlistRecord {
  startup_id: string;
  name: string;
  logo_url?: string;
  hq_city: string;
  hq_state: string;
  sector: string;
  company_classification: string;
  verification_status: string;
  express_interest: boolean;
  preferred_role?: string;
  hiring_status: string;
  careers_url: string;
  saved_at: string;
}

export interface StartupOutreachItem {
  id: string;
  outreach_id: string;
  startup_id: string;
  company_name: string;
  contact_person: string;
  contact_email?: string;
  contact_role?: string;
  partnership_stage: string;
  notes?: string;
  target_branches?: string[];
  expected_hires_count?: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export const startupService = {
  async listStartups(params?: StartupFilterParams): Promise<StartupItem[]> {
    const q = new URLSearchParams();
    if (params?.state && params.state !== 'all') q.set('state', params.state);
    if (params?.city && params.city !== 'all') q.set('city', params.city);
    if (params?.district && params.district !== 'all') q.set('district', params.district);
    if (params?.sector && params.sector !== 'all') q.set('sector', params.sector);
    if (params?.classification && params.classification !== 'all') q.set('classification', params.classification);
    if (params?.verification_status && params.verification_status !== 'all') q.set('verification_status', params.verification_status);
    if (params?.dpiit_status && params.dpiit_status !== 'all') q.set('dpiit_status', params.dpiit_status);
    if (params?.tech_stack && params.tech_stack !== 'all') q.set('tech_stack', params.tech_stack);
    if (params?.internship_only) q.set('internship_only', 'true');
    if (params?.fresher_only) q.set('fresher_only', 'true');
    if (params?.hiring_status && params.hiring_status !== 'all') q.set('hiring_status', params.hiring_status);
    if (params?.dpiit_only) q.set('dpiit_only', 'true');
    if (params?.emerging_only) q.set('emerging_only', 'true');
    if (params?.search) q.set('search', params.search);
    if (params?.limit) q.set('limit', String(params.limit));
    if (params?.skip) q.set('skip', String(params.skip));

    const qs = q.toString() ? `?${q.toString()}` : '';
    return apiClient.get<StartupItem[]>(`/startups${qs}`);
  },

  async getMapData(): Promise<StartupMapDataResponse> {
    return apiClient.get<StartupMapDataResponse>('/startups/map-data');
  },

  async getStateDetail(stateName: string): Promise<StateDetailResponse> {
    return apiClient.get<StateDetailResponse>(`/startups/states/${encodeURIComponent(stateName)}`);
  },

  async getRecommendations(): Promise<StartupItem[]> {
    return apiClient.get<StartupItem[]>('/startups/recommendations');
  },

  async getJobs(params?: {
    city?: string;
    state?: string;
    work_mode?: string;
    employment_type?: string;
    experience_level?: string;
    search?: string;
  }): Promise<StartupJobItem[]> {
    const q = new URLSearchParams();
    if (params?.city && params.city !== 'all') q.set('city', params.city);
    if (params?.state && params.state !== 'all') q.set('state', params.state);
    if (params?.work_mode && params.work_mode !== 'all') q.set('work_mode', params.work_mode);
    if (params?.employment_type && params.employment_type !== 'all') q.set('employment_type', params.employment_type);
    if (params?.experience_level && params.experience_level !== 'all') q.set('experience_level', params.experience_level);
    if (params?.search) q.set('search', params.search);

    const qs = q.toString() ? `?${q.toString()}` : '';
    return apiClient.get<StartupJobItem[]>(`/startups/jobs${qs}`);
  },

  async getStartupDetail(startupId: string): Promise<StartupItem> {
    return apiClient.get<StartupItem>(`/startups/${encodeURIComponent(startupId)}`);
  },

  async toggleWatchlist(
    startupId: string,
    expressInterest: boolean = false,
    preferredRole?: string
  ): Promise<{ startup_id: string; is_saved: boolean; express_interest: boolean; message: string }> {
    return apiClient.post('/startups/watchlist/toggle', {
      startup_id: startupId,
      express_interest: expressInterest,
      preferred_role: preferredRole,
    });
  },

  async getMyWatchlist(): Promise<WatchlistRecord[]> {
    return apiClient.get<WatchlistRecord[]>('/startups/watchlist/my');
  },

  async applyToJob(jobId: string, notes?: string): Promise<{ success: boolean; apply_url: string; status: string }> {
    return apiClient.post<{ success: boolean; apply_url: string; status: string }>(
      `/startups/jobs/${encodeURIComponent(jobId)}/apply`,
      { notes }
    );
  },

  async getMyApplications(): Promise<StudentJobApplicationRow[]> {
    return apiClient.get<StudentJobApplicationRow[]>('/startups/applications/my');
  },

  async updateApplicationStatus(
    applicationId: string,
    status: string,
    notes?: string
  ): Promise<{ success: boolean; status: string }> {
    return apiClient.patch<{ success: boolean; status: string }>(
      `/startups/applications/${encodeURIComponent(applicationId)}/status`,
      { status, notes }
    );
  },

  async triggerSync(): Promise<{ success: boolean; synced_startups: number; timestamp: string }> {
    return apiClient.post<{ success: boolean; synced_startups: number; timestamp: string }>('/startups/sync', {});
  },

  async getAnalytics(): Promise<{
    total_startups: number;
    dpiit_recognized: number;
    actively_hiring: number;
    total_active_jobs: number;
    student_applications: number;
    total_watchlists?: number;
    dpiit_percentage: number;
  }> {
    return apiClient.get('/startups/analytics');
  },

  async getAdminOutreach(startupId?: string): Promise<StartupOutreachItem[]> {
    const q = startupId ? `?startup_id=${encodeURIComponent(startupId)}` : '';
    return apiClient.get<StartupOutreachItem[]>(`/startups/admin/outreach${q}`);
  },

  async createAdminOutreach(payload: Partial<StartupOutreachItem>): Promise<StartupOutreachItem> {
    return apiClient.post<StartupOutreachItem>('/startups/admin/outreach', payload);
  },

  async createAdminStartup(payload: any): Promise<StartupItem> {
    return apiClient.post<StartupItem>('/startups/admin/create', payload);
  },

  async updateAdminStartup(startupId: string, payload: any): Promise<StartupItem> {
    return apiClient.put<StartupItem>(`/startups/admin/${encodeURIComponent(startupId)}`, payload);
  },
};
