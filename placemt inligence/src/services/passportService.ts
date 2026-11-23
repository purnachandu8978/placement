/**
 * Student Career Passport Service
 * Verified portfolio passport for recruiter discovery and student career advancement.
 */

import { apiClient } from './apiClient';

export interface VerifiedSkillItem {
  skill: string;
  score: number;
}

export interface PassportCredentialItem {
  credential_id: string;
  serial_number?: string;
  level: string;
  badge_type: string;
  title: string;
  skill: string;
  score: number;
  issued_at: string;
  verification_url: string;
}

export interface CareerPassportData {
  registration_id: string;
  student_name: string;
  college: string;
  department?: string;
  degree?: string;
  graduation_year?: number;
  readiness_score: number;
  readiness_band: string;
  current_verification_level: string;
  highest_badge?: string;
  credentials: PassportCredentialItem[];
  verified_skills: VerifiedSkillItem[];
  resume_skills: string[];
  target_roles: string[];
  preferred_locations: string[];
  is_public: boolean;
  passport_url: string;
  updated_at: string;
}

export const passportService = {
  async getMyPassport(): Promise<CareerPassportData> {
    return apiClient.get<CareerPassportData>('/passport/my');
  },

  async updatePassportVisibility(is_public: boolean): Promise<{ success: boolean; is_public: boolean; passport_url: string }> {
    return apiClient.patch<{ success: boolean; is_public: boolean; passport_url: string }>('/passport/visibility', { is_public });
  },

  async getPublicPassport(registrationId: string): Promise<CareerPassportData> {
    return apiClient.get<CareerPassportData>(`/passport/${registrationId}`);
  },
};
