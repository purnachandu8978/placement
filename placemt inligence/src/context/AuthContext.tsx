import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { User, UserRole, AuthState } from '../types/auth';
import { authService, type AdminLoginResult } from '../services/authService';
import { setAccessToken } from '../services/apiClient';
import {
  auth,
  signInWithGoogle,
  signOutFromFirebase,
  subscribeFirebaseTokenSync,
} from '../services/firebase';

interface AuthContextValue extends AuthState {
  isTourOpen: boolean;
  openTour: () => void;
  completeTour: () => Promise<void>;
  loginWithGoogle: (preferredEmail?: string) => Promise<User>;
  registerStudent: (email: string, password: string, fullName: string) => Promise<User>;
  loginStudent: (email: string, password: string) => Promise<User>;
  loginAdmin: (email: string, password: string) => Promise<AdminLoginResult>;
  verifyAdminOtp: (tempToken: string, code: string) => Promise<User>;
  resendAdminOtp: (tempToken: string) => Promise<{ status: string; emailMasked: string; message: string; otpPreview?: string | null }>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<User | null>;
  updateProfile: (data: Parameters<typeof authService.updateProfile>[0]) => Promise<User>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<AuthState>({
    user: null,
    role: 'guest',
    isAuthenticated: false,
    isLoading: true,
    error: null,
  });
  const [isTourOpen, setIsTourOpen] = useState(false);

  const restoreSession = useCallback(async () => {
    try {
      if (auth && 'authStateReady' in auth && typeof auth.authStateReady === 'function') {
        await auth.authStateReady();
        if (auth.currentUser) {
          const token = await auth.currentUser.getIdToken();
          setAccessToken(token);
        }
      }
      const me = await authService.getMe();
      const role: UserRole = me.role === 'admin' ? 'admin' : 'student';
      setState({
        user: me,
        role,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      });
      if (role === 'student' && me.hasSeenTour === false) {
        setIsTourOpen(true);
      }
    } catch {
      setAccessToken(null);
      setState({
        user: null,
        role: 'guest',
        isAuthenticated: false,
        isLoading: false,
        error: null,
      });
    }
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeFirebaseTokenSync();
    void restoreSession();
    return () => unsubscribe();
  }, [restoreSession]);

  const loginWithGoogle = useCallback(async (preferredEmail?: string): Promise<User> => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));
    try {
      const signedIn = await signInWithGoogle(preferredEmail);
      let me: User = signedIn;
      try {
        me = await authService.getMe();
      } catch {
        // Fallback to direct backend auth payload if /me races
      }
      const role: UserRole = me.role === 'admin' ? 'admin' : 'student';
      setState({
        user: me,
        role,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      });
      if (role === 'student' && !me.hasSeenTour) {
        setIsTourOpen(true);
      }
      return me;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Google Sign-In failed. Please try again.';
      setState((prev) => ({ ...prev, isLoading: false, error: message }));
      throw err instanceof Error ? err : new Error(message);
    }
  }, []);

  const registerStudent = useCallback(
    async (email: string, password: string, fullName: string): Promise<User> => {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));
      try {
        const studentUser = await authService.studentRegister(email, password, fullName);
        setState({
          user: studentUser,
          role: 'student',
          isAuthenticated: true,
          isLoading: false,
          error: null,
        });
        setIsTourOpen(true);
        return studentUser;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Registration failed. Please check your details.';
        setState((prev) => ({ ...prev, isLoading: false, error: message }));
        throw err instanceof Error ? err : new Error(message);
      }
    },
    []
  );

  const loginStudent = useCallback(async (email: string, password: string): Promise<User> => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));
    try {
      const studentUser = await authService.studentLogin(email, password);
      let me = studentUser;
      try {
        me = await authService.getMe();
      } catch {
        // fallback
      }
      setState({
        user: me,
        role: 'student',
        isAuthenticated: true,
        isLoading: false,
        error: null,
      });
      if (!me.hasSeenTour) {
        setIsTourOpen(true);
      }
      return me;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Invalid student email or password.';
      setState((prev) => ({ ...prev, isLoading: false, error: message }));
      throw err instanceof Error ? err : new Error(message);
    }
  }, []);

  const loginAdmin = useCallback(async (email: string, password: string): Promise<AdminLoginResult> => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));
    try {
      const res = await authService.adminLogin(email, password);
      if ('user' in res) {
        setState({
          user: res.user,
          role: 'admin',
          isAuthenticated: true,
          isLoading: false,
          error: null,
        });
        setIsTourOpen(false);
        return res;
      }
      setState((prev) => ({ ...prev, isLoading: false, error: null }));
      return res;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Invalid administrator email or password.';
      setState((prev) => ({ ...prev, isLoading: false, error: message }));
      throw err instanceof Error ? err : new Error(message);
    }
  }, []);

  const verifyAdminOtp = useCallback(async (tempToken: string, code: string): Promise<User> => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));
    try {
      const adminUser = await authService.adminVerifyOtp(tempToken, code);
      setState({
        user: adminUser,
        role: 'admin',
        isAuthenticated: true,
        isLoading: false,
        error: null,
      });
      setIsTourOpen(false);
      return adminUser;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Invalid or expired verification code.';
      setState((prev) => ({ ...prev, isLoading: false, error: message }));
      throw err instanceof Error ? err : new Error(message);
    }
  }, []);

  const resendAdminOtp = useCallback(
    async (tempToken: string) => {
      try {
        return await authService.adminResendOtp(tempToken);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to resend verification code.';
        throw err instanceof Error ? err : new Error(message);
      }
    },
    []
  );

  const refreshUser = useCallback(async (): Promise<User | null> => {
    try {
      const me = await authService.getMe();
      const role: UserRole = me.role === 'admin' ? 'admin' : 'student';
      setState({
        user: me,
        role,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      });
      return me;
    } catch {
      return null;
    }
  }, []);

  const updateProfile = useCallback(async (data: Parameters<typeof authService.updateProfile>[0]): Promise<User> => {
    const updated = await authService.updateProfile(data);
    setState((prev) => ({
      ...prev,
      user: updated,
    }));
    return updated;
  }, []);

  const completeTour = useCallback(async () => {
    setIsTourOpen(false);
    setState((prev) => ({
      ...prev,
      user: prev.user ? { ...prev.user, hasSeenTour: true } : null,
    }));
    try {
      await authService.markTourComplete();
    } catch {
      // Non-blocking persistence error
    }
  }, []);

  const openTour = useCallback(() => {
    setIsTourOpen(true);
  }, []);

  const logout = useCallback(async () => {
    setIsTourOpen(false);
    await signOutFromFirebase();
    await authService.logout();
    setState({
      user: null,
      role: 'guest',
      isAuthenticated: false,
      isLoading: false,
      error: null,
    });
  }, []);

  const clearError = useCallback(() => {
    setState((prev) => ({ ...prev, error: null }));
  }, []);

  return (
    <AuthContext.Provider
      value={{
        ...state,
        isTourOpen,
        openTour,
        completeTour,
        loginWithGoogle,
        registerStudent,
        loginStudent,
        loginAdmin,
        verifyAdminOtp,
        resendAdminOtp,
        logout,
        refreshUser,
        updateProfile,
        clearError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
};
