export type UserRole = 'student' | 'admin' | 'guest';
export type BackendRole = 'STUDENT' | 'ADMIN' | 'SUPER_ADMIN';

export interface User {
  id: string;
  name: string;
  email: string;
  role?: UserRole;
  backendRole?: BackendRole;
  authProvider?: 'google_firebase' | 'password';
  hasSeenTour?: boolean;
  isNewUser?: boolean;
  avatar: string;
  college?: string;
  degree?: string;
  branch?: string;
  batch?: string;
  graduationYear?: number | null;
  cgpa?: number | null;
  backlogs?: number;
  phone?: string;
  githubUrl?: string;
  linkedinUrl?: string;
  portfolioUrl?: string;
  targetRoles?: string[];
  preferredLocations?: string[];
  preferredWorkModes?: string[];
  createdAt: string;
}

export interface AuthState {
  user: User | null;
  role: UserRole;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}

export interface LoginCredentials {
  email: string;
  password: string;
  rememberMe?: boolean;
}

export interface RegisterData {
  name: string;
  email: string;
  password?: string;
  college: string;
  degree: string;
  batch: string;
  cgpa: number;
}
