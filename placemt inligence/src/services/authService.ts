import { apiClient, setAccessToken } from './apiClient';
import type { BackendRole, User } from '../types/auth';

export interface BackendMeResponse {
  firebase_uid: string;
  email: string;
  display_name: string;
  photo_url?: string | null;
  role: BackendRole;
  account_status: string;
  auth_provider?: 'google_firebase' | 'password';
  has_seen_tour?: boolean;
  created_at?: string;
  profile?: {
    full_name?: string;
    phone?: string;
    college?: string;
    degree?: string;
    branch?: string;
    graduation_year?: number | null;
    semester?: number | null;
    cgpa?: number | null;
    backlogs?: number;
    target_roles?: string[];
    preferred_locations?: string[];
    preferred_work_modes?: string[];
    github_url?: string;
    linkedin_url?: string;
    portfolio_url?: string;
  };
}

export interface AdminLoginResponse {
  firebase_uid: string;
  email: string;
  display_name: string;
  photo_url?: string | null;
  role: BackendRole;
  account_status: string;
  token: string;
  is_new_user?: boolean;
  has_seen_tour?: boolean;
  auth_provider?: 'password';
}

export type AdminLoginResult =
  | { mfaRequired: false; user: User }
  | { mfaRequired: true; tempToken: string; emailMasked: string; message: string; otpPreview?: string | null };

export interface StudentAuthResponse {
  firebase_uid: string;
  email: string;
  display_name: string;
  photo_url?: string | null;
  role: BackendRole;
  account_status: string;
  token: string;
  is_new_user?: boolean;
  has_seen_tour?: boolean;
  auth_provider: 'password' | 'google_firebase';
}

export interface AuthResponse {
  user: User;
  token: string;
}

export interface ForgotPasswordResponse {
  success: boolean;
  message: string;
  email_masked?: string;
  code_preview?: string | null;
}

export interface ResetPasswordResponse {
  success: boolean;
  message: string;
}

export interface ChangePasswordResponse {
  success: boolean;
  message: string;
}

function mapMeToUser(data: BackendMeResponse): User {
  const mappedRole = data.role === 'ADMIN' || data.role === 'SUPER_ADMIN' ? 'admin' : 'student';
  const prof = data.profile || {};
  return {
    id: data.firebase_uid,
    name: prof.full_name || data.display_name || data.email.split('@')[0] || 'User',
    email: data.email,
    role: mappedRole,
    backendRole: data.role,
    authProvider: data.auth_provider || (mappedRole === 'admin' ? 'password' : 'google_firebase'),
    hasSeenTour: Boolean(data.has_seen_tour),
    avatar: data.photo_url || '',
    phone: prof.phone || '',
    college: prof.college || '',
    degree: prof.degree || '',
    branch: prof.branch || '',
    batch: prof.graduation_year ? String(prof.graduation_year) : '',
    graduationYear: prof.graduation_year ?? null,
    cgpa: prof.cgpa ?? null,
    backlogs: prof.backlogs ?? 0,
    githubUrl: prof.github_url || '',
    linkedinUrl: prof.linkedin_url || '',
    portfolioUrl: prof.portfolio_url || '',
    targetRoles: prof.target_roles || [],
    preferredLocations: prof.preferred_locations || [],
    preferredWorkModes: prof.preferred_work_modes || [],
    createdAt: data.created_at || new Date().toISOString(),
  };
}

export const authService = {
  async studentRegister(email: string, password: string, fullName: string): Promise<User> {
    const res = await apiClient.post<StudentAuthResponse>('/auth/register', {
      email: email.trim().toLowerCase(),
      password,
      full_name: fullName.trim(),
    });
    setAccessToken(res.token);
    return {
      id: res.firebase_uid,
      name: res.display_name || fullName || res.email,
      email: res.email,
      role: 'student',
      backendRole: res.role,
      authProvider: 'password',
      hasSeenTour: false,
      avatar: res.photo_url || '',
      createdAt: new Date().toISOString(),
    };
  },

  async studentLogin(email: string, password: string): Promise<User> {
    const res = await apiClient.post<StudentAuthResponse>('/auth/login', {
      email: email.trim().toLowerCase(),
      password,
    });
    setAccessToken(res.token);
    return {
      id: res.firebase_uid,
      name: res.display_name || res.email,
      email: res.email,
      role: 'student',
      backendRole: res.role,
      authProvider: 'password',
      hasSeenTour: Boolean(res.has_seen_tour),
      avatar: res.photo_url || '',
      createdAt: new Date().toISOString(),
    };
  },

  async adminLogin(email: string, password: string): Promise<AdminLoginResult> {
    const res = await apiClient.post<AdminLoginResponse>('/auth/admin/login', {
      email: email.trim().toLowerCase(),
      password,
    });
    setAccessToken(res.token);
    return {
      mfaRequired: false,
      user: {
        id: res.firebase_uid,
        name: res.display_name || res.email,
        email: res.email,
        role: 'admin',
        backendRole: res.role,
        authProvider: 'password',
        hasSeenTour: true,
        avatar: res.photo_url || '',
        createdAt: new Date().toISOString(),
      },
    };
  },

  async adminVerifyOtp(tempToken: string, code: string): Promise<User> {
    const res = await apiClient.post<AdminLoginResponse>('/auth/admin/verify-otp', {
      temp_token: tempToken,
      code: code.trim(),
    });
    setAccessToken(res.token);
    return {
      id: res.firebase_uid,
      name: res.display_name || res.email,
      email: res.email,
      role: 'admin',
      backendRole: res.role,
      authProvider: 'password',
      hasSeenTour: true,
      avatar: res.photo_url || '',
      createdAt: new Date().toISOString(),
    };
  },

  async adminResendOtp(tempToken: string): Promise<{ status: string; emailMasked: string; message: string; otpPreview?: string | null }> {
    const res = await apiClient.post<{
      status: string;
      email_masked: string;
      message: string;
      otp_preview?: string | null;
    }>('/auth/admin/resend-otp', {
      temp_token: tempToken,
    });
    return {
      status: res.status,
      emailMasked: res.email_masked,
      message: res.message,
      otpPreview: res.otp_preview,
    };
  },

  async getMe(): Promise<User> {
    const me = await apiClient.get<BackendMeResponse>('/auth/me');
    return mapMeToUser(me);
  },

  async markTourComplete(): Promise<void> {
    await apiClient.post('/auth/tour-complete', {});
  },

  async updateProfile(updates: {
    full_name?: string;
    phone?: string;
    college?: string;
    degree?: string;
    branch?: string;
    graduation_year?: number | null;
    cgpa?: number | null;
    backlogs?: number;
    target_roles?: string[];
    preferred_locations?: string[];
    preferred_work_modes?: string[];
    github_url?: string;
    linkedin_url?: string;
    portfolio_url?: string;
  }): Promise<User> {
    await apiClient.put('/students/me', updates);
    return this.getMe();
  },

  async requestPasswordResetCode(email: string): Promise<ForgotPasswordResponse> {
    return apiClient.post<ForgotPasswordResponse>('/auth/forgot-password/send-code', {
      email: email.trim().toLowerCase(),
    });
  },

  async resetPasswordWithCode(email: string, code: string, newPassword: string): Promise<ResetPasswordResponse> {
    return apiClient.post<ResetPasswordResponse>('/auth/forgot-password/verify-and-reset', {
      email: email.trim().toLowerCase(),
      code: code.trim(),
      new_password: newPassword,
    });
  },

  async changePassword(newPassword: string, currentPassword?: string): Promise<ChangePasswordResponse> {
    return apiClient.post<ChangePasswordResponse>('/auth/change-password', {
      current_password: currentPassword || undefined,
      new_password: newPassword,
    });
  },

  async logout(): Promise<void> {
    try {
      await apiClient.post('/auth/logout', {});
    } catch {
      // Ignore network errors during logout
    }
    setAccessToken(null);
  },
};
