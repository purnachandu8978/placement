import { apiClient } from './apiClient';
import type { SkillItem } from '../types';

export interface VerifiedCredential {
  id: string;
  skillName: string;
  category: string;
  proficiency: string;
  score: number;
  verifiedDate: string;
  verificationSource: string;
  verificationHash: string;
  evidence?: string;
}

export interface VerificationRequestItem {
  id: string;
  skill_name: string;
  proof_url: string;
  notes?: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewer_note?: string;
  created_at: string;
}

export interface StudentSkillGapsResponse {
  has_skills: boolean;
  total_extracted: number;
  total_verified: number;
  strengths: Array<{ skill: string; category: string; score: number; proficiency: string }>;
  unverified_skills: Array<{ skill: string; category: string; reason: string }>;
  market_gaps: Array<{ skill: string; job_demand_count: number; priority: string }>;
}

export const skillService = {
  async getStudentSkills(): Promise<SkillItem[]> {
    const docs = await apiClient.get<
      Array<{
        skill_name: string;
        category: string;
        source_evidence: string;
        confidence: number;
        assessment_status: string;
        score: number;
        proficiency: string;
      }>
    >('/skills/student');

    return (docs || []).map((d, idx) => ({
      id: `sk-${idx}-${d.skill_name.toLowerCase()}`,
      name: d.skill_name,
      category: (d.category as SkillItem['category']) || 'Programming Languages',
      isVerified: d.assessment_status === 'verified',
      proficiency:
        d.proficiency === 'Expert'
          ? 'Expert'
          : d.proficiency === 'Proficient' || d.assessment_status === 'verified'
            ? 'Advanced'
            : 'Intermediate',
      confidenceScore: Math.round(d.score > 0 ? d.score : (d.confidence || 0) * 100),
      verificationSource: d.assessment_status === 'verified' ? 'Assessment' : undefined,
    }));
  },

  async getSkillGaps(): Promise<StudentSkillGapsResponse> {
    return apiClient.get<StudentSkillGapsResponse>('/skills/gaps');
  },

  async getVerifiedCredentials(): Promise<{
    credentials: VerifiedCredential[];
    requests: VerificationRequestItem[];
    trustScore: number;
    totalVerified: number;
  }> {
    const res = await apiClient.get<{
      verified_skills: Array<{
        id: string;
        skill: string;
        proficiency: string;
        score?: number;
        evidence?: string;
        verification_hash: string;
        verification_date: string;
      }>;
      verification_requests: VerificationRequestItem[];
      total_verified: number;
      trust_score: number;
    }>('/verification');

    const credentials: VerifiedCredential[] = (res.verified_skills || []).map((v) => ({
      id: v.id,
      skillName: v.skill,
      category: 'Verified Competency',
      proficiency: v.proficiency || 'Proficient',
      score: v.score ?? 80,
      verifiedDate: v.verification_date,
      verificationSource: v.evidence || 'Platform Assessment',
      verificationHash: v.verification_hash,
      evidence: v.evidence,
    }));

    return {
      credentials,
      requests: res.verification_requests || [],
      trustScore: res.trust_score ?? 0,
      totalVerified: res.total_verified ?? 0,
    };
  },

  async requestManualVerification(payload: {
    skill_name: string;
    proof_url: string;
    notes?: string;
  }) {
    return apiClient.post('/verification/request', payload);
  },

  async verifyExternalHash(verificationHash: string) {
    return apiClient.get(`/verification/verify/${encodeURIComponent(verificationHash)}`);
  },
};
