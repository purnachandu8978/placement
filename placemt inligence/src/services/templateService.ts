/**
 * Certificate Template Management Service
 * API client for administrative certificate templates, placeholder validation, and lifecycle transitions.
 */

import { apiClient } from './apiClient';

export interface CertificateTemplateItem {
  id: string;
  template_id: string;
  name: string;
  description: string;
  version: number;
  status: 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'PUBLISHED' | 'ARCHIVED';
  is_published: boolean;
  orientation: 'LANDSCAPE' | 'PORTRAIT';
  width_mm: number;
  height_mm: number;
  background_color: string;
  border_color: string;
  primary_color: string;
  accent_color: string;
  font_family: string;
  logo_url?: string;
  institution_name: string;
  signatory_name: string;
  signatory_title: string;
  signatory_department?: string;
  custom_headline: string;
  subtext_template: string;
  show_qr_code: boolean;
  show_serial_number: boolean;
  created_by?: string;
  approved_by?: string;
  published_at?: string;
  created_at: string;
  updated_at: string;
  approval_notes?: string;
}

export interface CreateTemplatePayload {
  name: string;
  description: string;
  orientation?: 'LANDSCAPE' | 'PORTRAIT';
  border_color?: string;
  primary_color?: string;
  accent_color?: string;
  institution_name?: string;
  signatory_name?: string;
  signatory_title?: string;
  custom_headline?: string;
  subtext_template: string;
  show_qr_code?: boolean;
  show_serial_number?: boolean;
}

export const templateService = {
  async getTemplates(status?: string): Promise<CertificateTemplateItem[]> {
    const query = status && status !== 'all' ? `?status=${encodeURIComponent(status)}` : '';
    return apiClient.get<CertificateTemplateItem[]>(`/templates${query}`);
  },

  async getActivePublishedTemplate(): Promise<CertificateTemplateItem> {
    return apiClient.get<CertificateTemplateItem>('/templates/active');
  },

  async getTemplate(id: string): Promise<CertificateTemplateItem> {
    return apiClient.get<CertificateTemplateItem>(`/templates/${id}`);
  },

  async createTemplate(payload: CreateTemplatePayload): Promise<CertificateTemplateItem> {
    return apiClient.post<CertificateTemplateItem>('/templates', payload);
  },

  async submitForApproval(id: string): Promise<CertificateTemplateItem> {
    return apiClient.post<CertificateTemplateItem>(`/templates/${id}/submit`);
  },

  async approveTemplate(id: string, notes?: string): Promise<CertificateTemplateItem> {
    return apiClient.post<CertificateTemplateItem>(`/templates/${id}/approve`, { notes: notes || '' });
  },

  async publishTemplate(id: string): Promise<CertificateTemplateItem> {
    return apiClient.post<CertificateTemplateItem>(`/templates/${id}/publish`);
  },
};
