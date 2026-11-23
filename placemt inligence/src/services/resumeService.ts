import { apiClient } from './apiClient';
import type { ExtractedResume, ResumeAnalysis, OptimizedResume, SkillItem } from '../types';

export interface BackendResumeRecord {
  id: string;
  user_id: string;
  filename: string;
  file_type: string;
  version: number;
  is_active: boolean;
  uploaded_at: string;
  ats_score: number;
  ats_breakdown?: Record<string, number>;
  metrics?: Record<string, any>;
  suggestions?: string[];
  candidate_name: string;
  email: string;
  phone?: string;
  github_url?: string;
  linkedin_url?: string;
  college?: string;
  degree?: string;
  branch?: string;
  graduation_year?: number | null;
  cgpa?: number | null;
  detected_skills: Array<{
    skill_name: string;
    category?: string;
    source_evidence?: string;
    confidence?: number;
    assessment_status?: string;
    extraction_method?: string;
  }>;
  detected_projects: Array<{
    title: string;
    highlights?: string[];
    technologies?: string[];
  }>;
  detected_certifications: string[];
  extracted_text: string;
  extraction_metadata?: {
    method: string;
    model: string;
    latency_ms?: number;
    tokens_used?: number;
    fallback_used?: boolean;
    error_message?: string | null;
  };
  semantic_skills?: {
    core_skills: string[];
    supporting_skills: string[];
    missing_skills: string[];
    related_skills: string[];
    outdated_skills: string[];
    skills_requiring_assessment: string[];
  };
  optimization_suggestions?: Array<{
    section: string;
    original_bullet: string;
    improved_bullet: string;
    improvement_rationale: string;
    action_verbs_used: string[];
    quantified_metrics_referenced: string[];
    student_approved: boolean;
  }>;
}

function mapCategory(raw?: string): SkillItem['category'] {
  const lower = (raw || '').toLowerCase();
  if (lower.includes('front')) return 'Frameworks & Libraries';
  if (lower.includes('back')) return 'Programming Languages';
  if (lower.includes('data') && !lower.includes('ai')) return 'Databases & Storage';
  if (lower.includes('cloud') || lower.includes('devops')) return 'Cloud & DevOps';
  if (lower.includes('ai') || lower.includes('design')) return 'AI & Data Science';
  return 'Programming Languages';
}

function mapResumeDocToExtracted(doc: BackendResumeRecord): ExtractedResume & {
  id: string;
  atsScore: number;
  suggestions: string[];
  githubUrl?: string;
  linkedinUrl?: string;
  version: number;
} {
  const detectedSkills: SkillItem[] = (doc.detected_skills || []).map((s, idx) => ({
    id: `sk-${idx}-${s.skill_name.toLowerCase()}`,
    name: s.skill_name,
    category: mapCategory(s.category),
    isVerified: s.assessment_status === 'verified',
    proficiency: s.assessment_status === 'verified' ? 'Advanced' : 'Intermediate',
    confidenceScore: Math.round((s.confidence || 0.85) * 100),
    verificationSource: s.assessment_status === 'verified' ? 'Assessment' : undefined,
    requiresImprovement: s.assessment_status !== 'verified',
    sourceEvidence: s.source_evidence,
    extractionMethod: s.extraction_method || 'deterministic_fallback',
  }));

  const detectedProjects = (doc.detected_projects || []).map((p) => ({
    title: p.title,
    description: (p.highlights || []).join(' • ') || 'Project extracted from resume.',
    techStack: p.technologies || [],
    metricsFound: p.highlights || [],
  }));

  return {
    id: doc.id,
    version: doc.version || 1,
    atsScore: doc.ats_score || 0,
    suggestions: doc.suggestions || [],
    githubUrl: doc.github_url || '',
    linkedinUrl: doc.linkedin_url || '',
    rawText: doc.extracted_text || '',
    fileName: doc.filename || 'resume.pdf',
    uploadedAt: doc.uploaded_at || new Date().toISOString(),
    candidateName: doc.candidate_name || '',
    candidateEmail: doc.email || '',
    candidatePhone: doc.phone || '',
    education: {
      college: doc.college || '',
      degree: [doc.degree, doc.branch].filter(Boolean).join(' - '),
      graduationYear: doc.graduation_year ? String(doc.graduation_year) : '',
      cgpa: doc.cgpa ?? 0,
    },
    detectedSkills,
    detectedProjects,
    detectedCertifications: doc.detected_certifications || [],
    isConfirmedByStudent: true,
    extractionMetadata: doc.extraction_metadata,
    semanticSkills: doc.semantic_skills,
    optimizationSuggestions: doc.optimization_suggestions,
  };
}

export const resumeService = {
  async getExtractedResume(): Promise<(ExtractedResume & { id?: string; atsScore?: number; suggestions?: string[]; version?: number }) | null> {
    const res = await apiClient.get<{ has_resume: boolean; resume: BackendResumeRecord | null }>('/resumes/current');
    if (!res?.has_resume || !res.resume) {
      return null;
    }
    return mapResumeDocToExtracted(res.resume);
  },

  async getResumes(): Promise<BackendResumeRecord[]> {
    return apiClient.get<BackendResumeRecord[]>('/resumes');
  },

  async parseResumeFile(file: File): Promise<ExtractedResume> {
    const formData = new FormData();
    formData.append('file', file);
    await apiClient.upload('/resumes/upload', formData);
    const current = await this.getExtractedResume();
    if (!current) {
      throw new Error('Resume parsed but active record could not be loaded.');
    }
    return current;
  },

  async parseResumeText(rawText: string, fileName = 'pasted-resume.txt'): Promise<ExtractedResume> {
    const textBlob = new File([rawText], fileName.endsWith('.txt') ? fileName : `${fileName}.txt`, {
      type: 'text/plain',
    });
    return this.parseResumeFile(textBlob);
  },

  async addExtractedSkill(skillName: string): Promise<ExtractedResume | null> {
    await apiClient.post('/skills/student', { skill_name: skillName, category: 'Technical Skills' });
    return this.getExtractedResume();
  },

  async removeExtractedSkill(skillName: string): Promise<ExtractedResume | null> {
    await apiClient.delete(`/skills/student/${encodeURIComponent(skillName)}`);
    return this.getExtractedResume();
  },

  async updateCandidateProfile(updates: Partial<{
    candidateName: string;
    candidateEmail: string;
    candidatePhone: string;
    college: string;
    degree: string;
    graduationYear: string;
    cgpa: number;
  }>): Promise<ExtractedResume | null> {
    await apiClient.put('/students/me', {
      full_name: updates.candidateName,
      phone: updates.candidatePhone,
      college: updates.college,
      degree: updates.degree,
      graduation_year: updates.graduationYear ? parseInt(updates.graduationYear, 10) : undefined,
      cgpa: updates.cgpa,
    });
    return this.getExtractedResume();
  },

  async deleteResume(resumeId: string): Promise<void> {
    await apiClient.delete(`/resumes/${resumeId}`);
  },

  async analyzeAgainstJob(
    resumeTextOrId: string,
    job: { id?: string; role?: string; description?: string; techStack?: string[] }
  ): Promise<ResumeAnalysis> {
    const res = await apiClient.post<{
      ats_score: number;
      overall_match_score: number;
      keyword_match_percentage: number;
      matched_keywords: string[];
      missing_keywords: string[];
      strength_areas: string[];
      recommendations: string[];
      metrics?: { quantified_impacts?: number };
    }>('/resumes/current/analyze', {
      job_id: job?.id,
      job_title: job?.role,
      job_description: job?.description,
      required_skills: job?.techStack,
    });

    return {
      id: `an-${Date.now()}`,
      resumeId: 'current',
      jobId: job?.id || 'general',
      overallScore: Math.round(res.overall_match_score ?? res.ats_score ?? 0),
      keywordDensity: Math.round(res.keyword_match_percentage ?? 0),
      hardSkillsOverlap: Math.round(res.keyword_match_percentage ?? 0),
      quantifiableMetrics: Math.min(100, (res.metrics?.quantified_impacts ?? 0) * 25),
      atsCleanlinessScore: Math.round(res.ats_score ?? 0),
      strengths: res.strength_areas || [],
      matchedKeywords: res.matched_keywords || [],
      weaknesses: (res.recommendations || []).map((rec) => ({
        title: 'Optimization Opportunity',
        description: rec,
        severity: 'moderate' as const,
      })),
      missingSkills: res.missing_keywords || [],
      timestamp: new Date().toISOString(),
    };
  },

  async getDownloadSignedUrl(resumeId: string = 'current'): Promise<{ download_url: string; filename: string }> {
    return apiClient.get(`/resumes/${encodeURIComponent(resumeId)}/download-url`);
  },

  async optimizeResume(
    resumeText: string,
    job?: { id?: string; role?: string; description?: string; techStack?: string[] }
  ): Promise<OptimizedResume> {
    const res = await apiClient.post<{
      current_ats_score: number;
      projected_ats_score: number;
      suggested_summary: string;
      missing_keywords_to_add: string[];
      bullet_upgrades: Array<{ section: string; before: string; after: string }>;
      action_checklist: string[];
    }>('/resumes/current/optimize', {
      job_id: job?.id,
      job_title: job?.role,
      job_description: job?.description,
      required_skills: job?.techStack,
    });

    return {
      originalText: resumeText,
      optimizedText: `${res.suggested_summary}\n\n${res.bullet_upgrades.map((b) => `• [${b.section}] ${b.after}`).join('\n')}`,
      changes: (res.bullet_upgrades || []).map((b) => ({
        original: b.before,
        optimized: b.after,
        reason: `${b.section} — Stronger measurable impact`,
        type: 'star_rewrite' as const,
      })),
      projectedScore: Math.round(res.projected_ats_score ?? 0),
      targetScore: 95,
    };
  },

  async reprocessWithAI(resumeId: string = 'current'): Promise<ExtractedResume | null> {
    const res = await apiClient.post<{ message: string; resume: BackendResumeRecord; extraction_metadata?: any }>(
      `/resumes/${encodeURIComponent(resumeId)}/reprocess-ai`
    );
    if (!res?.resume) return null;
    return mapResumeDocToExtracted(res.resume);
  },

  async optimizeWithAI(
    resumeId: string = 'current',
    targetRole?: string
  ): Promise<{
    method: string;
    target_role: string;
    suggestions: Array<{
      section: string;
      original_bullet: string;
      improved_bullet: string;
      improvement_rationale: string;
      action_verbs_used: string[];
      quantified_metrics_referenced: string[];
      student_approved: boolean;
    }>;
    disclaimer: string;
  }> {
    return apiClient.post(`/resumes/${encodeURIComponent(resumeId)}/optimize-ai`, {
      job_title: targetRole,
    });
  },

  async approveOptimization(
    resumeId: string = 'current',
    approvedBullets: any[]
  ): Promise<{ message: string; approved_bullets: any[] }> {
    return apiClient.post(`/resumes/${encodeURIComponent(resumeId)}/approve-optimization`, {
      approved_bullets: approvedBullets,
    });
  },

  async matchJobAI(
    resumeId: string = 'current',
    payload: {
      job_id?: string;
      job_title?: string;
      job_description?: string;
      required_skills?: string[];
    }
  ): Promise<{
    job_title: string;
    match_score: number;
    required_skills_matched: string[];
    preferred_skills_matched: string[];
    missing_skills: string[];
    experience_match_level: string;
    education_match: boolean;
    role_relevance_summary: string;
    improvement_recommendations: string[];
    explainable_breakdown?: Record<string, any>;
    method?: string;
    latency_ms?: number;
  }> {
    return apiClient.post(`/resumes/${encodeURIComponent(resumeId)}/match-job-ai`, payload);
  },

  async getSemanticSkills(resumeId: string = 'current'): Promise<{
    core_skills: string[];
    supporting_skills: string[];
    missing_skills: string[];
    related_skills: string[];
    outdated_skills: string[];
    skills_requiring_assessment: string[];
  }> {
    return apiClient.get(`/resumes/${encodeURIComponent(resumeId)}/semantic-skills`);
  },
};
