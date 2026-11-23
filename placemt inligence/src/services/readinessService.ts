import { apiClient } from './apiClient';
import type { PlacementReadinessSummary } from '../types';

export interface BackendReadinessResponse {
  user_id: string;
  overall_score: number;
  readiness_band: string;
  breakdown: {
    resume_ats_score: number;
    skill_verification_score: number;
    assessment_score: number;
    assignment_score: number;
    roadmap_progress_score: number;
  };
  profile_completion: number;
  metrics: {
    has_resume: boolean;
    extracted_skills_count: number;
    verified_skills_count: number;
    assessments_completed: number;
    assignments_submitted: number;
    roadmap_progress: number;
    top_job_match: number;
    applications_submitted: number;
  };
  next_actions: string[];
}

export const readinessService = {
  async getRawReadiness(): Promise<BackendReadinessResponse> {
    return apiClient.get<BackendReadinessResponse>('/readiness');
  },

  async getReadinessSummary(): Promise<PlacementReadinessSummary & { rawMetrics: BackendReadinessResponse['metrics']; readinessBand: string; profileCompletion: number }> {
    const data = await apiClient.get<BackendReadinessResponse>('/readiness');
    const b = data.breakdown;

    const statusFor = (score: number): 'Ready' | 'In Progress' | 'Attention Needed' => {
      if (score >= 75) return 'Ready';
      if (score > 0) return 'In Progress';
      return 'Attention Needed';
    };

    const tierReadiness: PlacementReadinessSummary['tierReadiness'] =
      data.overall_score >= 80
        ? 'Tier-1 Product Ready'
        : data.overall_score >= 45
        ? 'Mid-Tier Ready'
        : 'Foundation Building';

    const metrics = [
      {
        name: 'Verified Skill Coverage',
        score: Math.round(b.skill_verification_score),
        weight: 25,
        status: statusFor(b.skill_verification_score),
        details: `${data.metrics.verified_skills_count} of ${data.metrics.extracted_skills_count} detected skills verified`,
      },
      {
        name: 'Coding & Technical Tests',
        score: Math.round(b.assessment_score),
        weight: 25,
        status: statusFor(b.assessment_score),
        details: `${data.metrics.assessments_completed} timed assessments completed`,
      },
      {
        name: 'Resume & ATS Signal',
        score: Math.round(b.resume_ats_score),
        weight: 20,
        status: statusFor(b.resume_ats_score),
        details: data.metrics.has_resume ? 'Active resume parsed & scored' : 'No resume uploaded yet',
      },
      {
        name: 'Practical Assignments',
        score: Math.round(b.assignment_score),
        weight: 15,
        status: statusFor(b.assignment_score),
        details: `${data.metrics.assignments_submitted} practical deliverables submitted`,
      },
      {
        name: 'Roadmap Execution',
        score: Math.round(b.roadmap_progress_score),
        weight: 15,
        status: statusFor(b.roadmap_progress_score),
        details: `${Math.round(data.metrics.roadmap_progress)}% of personalized 4-week tasks completed`,
      },
    ];

    return {
      overallScore: Math.round(data.overall_score),
      tierReadiness,
      readinessBand: data.readiness_band,
      profileCompletion: data.profile_completion,
      rawMetrics: data.metrics,
      pillarScores: {
        technicalProficiency: Math.round(b.skill_verification_score),
        codingAssessments: Math.round(b.assessment_score),
        practicalAssignments: Math.round(b.assignment_score),
        verifiedSkills: Math.round(b.skill_verification_score),
        resumeQuality: Math.round(b.resume_ats_score),
      },
      metrics,
      strengths: metrics.filter((m) => m.score >= 70).map((m) => `${m.name} (${m.score}%)`),
      weaknesses: metrics.filter((m) => m.score < 50).map((m) => `${m.name}: ${m.details}`),
      recommendedActions: (data.next_actions || []).map((action, idx) => ({
        id: `act-${idx}`,
        title: action,
        type: action.toLowerCase().includes('resume')
          ? 'resume'
          : action.toLowerCase().includes('assignment')
          ? 'assignment'
          : action.toLowerCase().includes('roadmap')
          ? 'roadmap'
          : 'assessment',
        urgency: idx === 0 ? 'high' : 'medium',
        actionUrl: action.toLowerCase().includes('resume')
          ? '/student/resume'
          : action.toLowerCase().includes('assignment')
          ? '/student/assignments'
          : action.toLowerCase().includes('roadmap')
          ? '/student/roadmap'
          : '/student/assessments',
      })),
    };
  },
};
