import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import {
  GraduationCap,
  Mail,
  Lock,
  User as UserIcon,
  ArrowLeft,
  AlertCircle,
  CheckCircle2,
  Sparkles,
  KeyRound,
  RotateCcw,
} from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { useToast } from '../../../context/ToastContext';
import { Button } from '../../../components/common/Button';
import { authService } from '../../../services/authService';

export const StudentAuthPage: React.FC = () => {
  const { isAuthenticated, role, loginStudent, registerStudent, loginWithGoogle } = useAuth();
  const { success, error } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const initialMode = searchParams.get('mode') === 'register' ? 'register' : 'login';
  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>(initialMode);

  // Form Fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');

  // Forgot Password Fields
  const [forgotStep, setForgotStep] = useState<'email' | 'reset'>('email');
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [maskedResetEmail, setMaskedResetEmail] = useState('');
  const [resetCodePreview, setResetCodePreview] = useState<string | null>(null);
  const [resetSuccess, setResetSuccess] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [showAccountSwitcher, setShowAccountSwitcher] = useState(false);
  const [switcherEmail, setSwitcherEmail] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    // Firebase Google OAuth requires 'localhost' rather than '127.0.0.1' for authorized domain validation
    if (window.location.hostname === '127.0.0.1') {
      window.location.replace(window.location.href.replace('127.0.0.1', 'localhost'));
      return;
    }

    if (isAuthenticated && role === 'student') {
      navigate('/student/dashboard', { replace: true });
    }
  }, [isAuthenticated, role, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setErrorMsg('Please enter a valid email address.');
      return;
    }

    if (!password || password.length < 8) {
      setErrorMsg('Password must be at least 8 characters in length.');
      return;
    }

    if (mode === 'register') {
      if (!fullName.trim()) {
        setErrorMsg('Please enter your full name.');
        return;
      }
      if (password !== confirmPassword) {
        setErrorMsg('Passwords do not match. Please re-enter.');
        return;
      }

      setSubmitting(true);
      try {
        await registerStudent(cleanEmail, password, fullName.trim());
        success('Account created successfully! Welcome to Placement Intelligence.');
        navigate('/student/dashboard', { replace: true });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Registration failed. An account with this email may already exist.';
        setErrorMsg(msg);
      } finally {
        setSubmitting(false);
      }
    } else {
      setSubmitting(true);
      try {
        await loginStudent(cleanEmail, password);
        success('Welcome back! Signed in to Candidate Dashboard.');
        navigate('/student/dashboard', { replace: true });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Invalid email or password.';
        setErrorMsg(msg);
      } finally {
        setSubmitting(false);
      }
    }
  };

  const handleRequestResetCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setErrorMsg('Please enter a valid registered email address.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await authService.requestPasswordResetCode(cleanEmail);
      setMaskedResetEmail(res.email_masked || cleanEmail);
      setResetCodePreview(res.code_preview || null);
      setForgotStep('reset');
      success(res.message || `Verification code sent to ${cleanEmail}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unable to send reset code. Please check your email and try again.';
      setErrorMsg(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerifyAndResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    const cleanCode = resetCode.trim();
    if (cleanCode.length !== 6 || !/^\d+$/.test(cleanCode)) {
      setErrorMsg('Please enter the 6-digit verification code sent to your email.');
      return;
    }

    if (!newPassword || newPassword.length < 8) {
      setErrorMsg('New password must be at least 8 characters in length.');
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setErrorMsg('New passwords do not match. Please re-enter.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await authService.resetPasswordWithCode(email, cleanCode, newPassword);
      setResetSuccess(true);
      success(res.message || 'Password successfully updated! Please sign in.');
      setPassword(newPassword);
      setTimeout(() => {
        setMode('login');
        setForgotStep('email');
        setResetSuccess(false);
        setResetCode('');
        setNewPassword('');
        setConfirmNewPassword('');
      }, 1800);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to reset password. Please verify the code.';
      setErrorMsg(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleSignIn = async (overrideEmail?: string) => {
    setErrorMsg('');
    setGoogleBusy(true);
    try {
      const targetEmail = (overrideEmail || switcherEmail || '').trim().toLowerCase();
      await loginWithGoogle(targetEmail || undefined);
      success('Welcome to Placement Intelligence!', 'Signed in successfully via Google.');
      navigate('/student/dashboard', { replace: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Google Sign-In failed.';
      setErrorMsg(msg);
      error(msg);
    } finally {
      setGoogleBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#FFF9F6] via-white to-[#FFF2EB] flex flex-col justify-center items-center px-4 py-12">
      <div className="w-full max-w-md">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-900 mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Home
        </Link>

        <div className="bg-white rounded-3xl border border-orange-100 p-8 shadow-[14px_14px_34px_rgba(255,122,89,0.12),-8px_-8px_24px_rgba(255,255,255,0.95)]">
          {mode === 'forgot' ? (
            /* FORGOT PASSWORD WORKFLOW */
            <div>
              <div className="flex items-center gap-3.5 mb-6">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#FF7A59] to-[#E86144] flex items-center justify-center text-white shadow-md">
                  <KeyRound className="w-6 h-6" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-slate-900">
                    {forgotStep === 'email' ? 'Reset Password' : 'Enter Verification Code'}
                  </h1>
                  <p className="text-xs text-slate-500">
                    {forgotStep === 'email'
                      ? 'Code will be sent to your registered email'
                      : 'Create a new secure password'}
                  </p>
                </div>
              </div>

              {resetSuccess ? (
                <div className="p-6 rounded-2xl bg-emerald-50 border border-emerald-200 text-center space-y-3">
                  <div className="w-12 h-12 rounded-full bg-emerald-500 text-white flex items-center justify-center mx-auto shadow-md">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <h3 className="text-base font-bold text-emerald-950">Password Updated Successfully</h3>
                  <p className="text-xs text-emerald-800 leading-relaxed">
                    Your password has been changed. Redirecting to sign in...
                  </p>
                </div>
              ) : (
                <>
                  {errorMsg && (
                    <div className="mb-5 p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-sm flex items-start gap-2.5">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span className="leading-relaxed text-xs">{errorMsg}</span>
                    </div>
                  )}

                  {forgotStep === 'email' ? (
                    /* STEP 1: Enter Email */
                    <form id="candidate_student_recovery_form" name="candidate_student_recovery_form" onSubmit={handleRequestResetCode} className="space-y-4">
                      <input type="hidden" name="portal_scope" value="candidate_student_recovery" />
                      <div>
                        <label htmlFor="candidate_student_recovery_email" className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">
                          Registered Email Address
                        </label>
                        <div className="relative">
                          <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                          <input
                            id="candidate_student_recovery_email"
                            name="candidate_student_recovery_email"
                            type="email"
                            autoComplete="username"
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="student@campus.edu"
                            className="w-full pl-10 pr-4 py-3 rounded-2xl bg-[#FFFDFB] border border-orange-100 focus:border-[#FF7A59] focus:ring-2 focus:ring-orange-100 outline-none text-sm text-slate-800 transition-all"
                          />
                        </div>
                        <p className="text-[11px] text-slate-400 mt-1.5">
                          We will dispatch a single-use 6-digit verification code to this dedicated address.
                        </p>
                      </div>

                      <Button type="submit" disabled={submitting} className="w-full py-3 mt-2 font-bold">
                        {submitting ? 'Sending Verification Code...' : 'Send Verification Code'}
                      </Button>

                      <div className="pt-3 text-center">
                        <button
                          type="button"
                          onClick={() => {
                            setMode('login');
                            setErrorMsg('');
                          }}
                          className="text-xs font-semibold text-slate-500 hover:text-slate-900 cursor-pointer"
                        >
                          ← Back to Sign In
                        </button>
                      </div>
                    </form>
                  ) : (
                    /* STEP 2: Enter Code & New Password */
                    <form id="candidate_student_reset_form" name="candidate_student_reset_form" onSubmit={handleVerifyAndResetPassword} className="space-y-4">
                      <input type="hidden" name="portal_scope" value="candidate_student_password_reset" />
                      <div className="p-3.5 rounded-2xl bg-orange-50/70 border border-orange-100 text-xs text-slate-700 leading-relaxed">
                        A 6-digit verification code was sent to{' '}
                        <span className="font-bold text-slate-900 font-mono">{maskedResetEmail || email}</span>.
                      </div>

                      {resetCodePreview && (
                        <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-center justify-between font-mono">
                          <div className="flex items-center gap-2">
                            <Sparkles className="w-4 h-4 text-amber-600 shrink-0" />
                            <span>Dev Code Preview: <strong>{resetCodePreview}</strong></span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setResetCode(resetCodePreview)}
                            className="text-[11px] underline text-amber-700 font-bold hover:text-amber-900 cursor-pointer"
                          >
                            Auto-Fill
                          </button>
                        </div>
                      )}

                      <div>
                        <label htmlFor="candidate_student_recovery_code" className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">
                          6-Digit Verification Code
                        </label>
                        <input
                          id="candidate_student_recovery_code"
                          name="candidate_student_recovery_code"
                          type="text"
                          inputMode="numeric"
                          autoComplete="one-time-code"
                          required
                          maxLength={6}
                          autoFocus
                          value={resetCode}
                          onChange={(e) => setResetCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                          placeholder="• • • • • •"
                          className="w-full text-center tracking-[0.5em] font-mono text-2xl font-black py-3 rounded-2xl bg-[#FFFDFB] border border-orange-100 focus:border-[#FF7A59] focus:ring-2 focus:ring-orange-100 outline-none text-slate-900 transition-all"
                        />
                      </div>

                      <div>
                        <label htmlFor="candidate_student_reset_new_password" className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">
                          New Password <span className="text-slate-400 font-normal">(min 8 characters)</span>
                        </label>
                        <div className="relative">
                          <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                          <input
                            id="candidate_student_reset_new_password"
                            name="candidate_student_reset_new_password"
                            type="password"
                            autoComplete="new-password"
                            required
                            minLength={8}
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            placeholder="Enter new secure password"
                            className="w-full pl-10 pr-4 py-3 rounded-2xl bg-[#FFFDFB] border border-orange-100 focus:border-[#FF7A59] focus:ring-2 focus:ring-orange-100 outline-none text-sm text-slate-800 transition-all"
                          />
                        </div>
                      </div>

                      <div>
                        <label htmlFor="candidate_student_reset_confirm_password" className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">
                          Confirm New Password
                        </label>
                        <div className="relative">
                          <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                          <input
                            id="candidate_student_reset_confirm_password"
                            name="candidate_student_reset_confirm_password"
                            type="password"
                            autoComplete="new-password"
                            required
                            minLength={8}
                            value={confirmNewPassword}
                            onChange={(e) => setConfirmNewPassword(e.target.value)}
                            placeholder="Confirm new secure password"
                            className="w-full pl-10 pr-4 py-3 rounded-2xl bg-[#FFFDFB] border border-orange-100 focus:border-[#FF7A59] focus:ring-2 focus:ring-orange-100 outline-none text-sm text-slate-800 transition-all"
                          />
                        </div>
                      </div>

                      <Button
                        type="submit"
                        disabled={submitting || resetCode.length !== 6 || newPassword.length < 8}
                        className="w-full py-3 mt-2 font-bold"
                      >
                        {submitting ? 'Setting New Password...' : 'Set New Password & Sign In'}
                      </Button>

                      <div className="pt-2 flex items-center justify-between text-xs">
                        <button
                          type="button"
                          onClick={() => {
                            setForgotStep('email');
                            setResetCode('');
                            setErrorMsg('');
                          }}
                          className="text-slate-500 hover:text-slate-800 cursor-pointer"
                        >
                          ← Change Email
                        </button>

                        <button
                          type="button"
                          disabled={submitting}
                          onClick={(e) => void handleRequestResetCode(e)}
                          className="inline-flex items-center gap-1 font-semibold text-[#FF7A59] hover:text-[#E86144] cursor-pointer"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          Resend Code
                        </button>
                      </div>
                    </form>
                  )}
                </>
              )}
            </div>
          ) : (
            /* STANDARD LOGIN / REGISTER WORKFLOW */
            <>
              {/* Header */}
              <div className="flex items-center gap-3.5 mb-6">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#FF7A59] to-[#E86144] flex items-center justify-center text-white shadow-md">
                  <GraduationCap className="w-6 h-6" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-slate-900">
                    {mode === 'register' ? 'Create Candidate Account' : 'Candidate Portal Sign In'}
                  </h1>
                  <p className="text-xs text-slate-500">Placement Intelligence Verified Talent Network</p>
                </div>
              </div>

              {/* Mode Switch Tabs */}
              <div className="grid grid-cols-2 p-1 bg-orange-50/60 rounded-2xl border border-orange-100/80 mb-6">
                <button
                  type="button"
                  onClick={() => {
                    setMode('login');
                    setErrorMsg('');
                  }}
                  className={`py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                    mode === 'login'
                      ? 'bg-white text-[#E86144] shadow-xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode('register');
                    setErrorMsg('');
                  }}
                  className={`py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                    mode === 'register'
                      ? 'bg-white text-[#E86144] shadow-xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Create Account
                </button>
              </div>

              {errorMsg && (
                <div className="mb-5 p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-sm flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span className="leading-relaxed text-xs">{errorMsg}</span>
                </div>
              )}

              {/* Form */}
              <form id="candidate_student_auth_form" name="candidate_student_auth_form" onSubmit={handleSubmit} className="space-y-4">
                <input type="hidden" name="portal_scope" value="candidate_student_auth" />
                {mode === 'register' && (
                  <div>
                    <label htmlFor="candidate_student_full_name" className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">
                      Full Name
                    </label>
                    <div className="relative">
                      <UserIcon className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        id="candidate_student_full_name"
                        name="candidate_student_full_name"
                        type="text"
                        autoComplete="name"
                        required
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="Arjun Sharma"
                        className="w-full pl-10 pr-4 py-3 rounded-2xl bg-[#FFFDFB] border border-orange-100 focus:border-[#FF7A59] focus:ring-2 focus:ring-orange-100 outline-none text-sm text-slate-800 transition-all"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label htmlFor="candidate_student_email" className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">
                    Email Address (Username)
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      id="candidate_student_email"
                      name="candidate_student_email"
                      type="email"
                      autoComplete="username"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="student@campus.edu"
                      className="w-full pl-10 pr-4 py-3 rounded-2xl bg-[#FFFDFB] border border-orange-100 focus:border-[#FF7A59] focus:ring-2 focus:ring-orange-100 outline-none text-sm text-slate-800 transition-all"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label htmlFor="candidate_student_password" className="block text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      Password {mode === 'register' && <span className="text-slate-400 font-normal">(min 8 characters)</span>}
                    </label>
                    {mode === 'login' && (
                      <button
                        type="button"
                        onClick={() => {
                          setMode('forgot');
                          setForgotStep('email');
                          setErrorMsg('');
                        }}
                        className="text-xs font-semibold text-[#FF7A59] hover:text-[#E86144] hover:underline cursor-pointer"
                      >
                        Forgot Password?
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      id="candidate_student_password"
                      name="candidate_student_password"
                      type="password"
                      autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                      required
                      minLength={8}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full pl-10 pr-4 py-3 rounded-2xl bg-[#FFFDFB] border border-orange-100 focus:border-[#FF7A59] focus:ring-2 focus:ring-orange-100 outline-none text-sm text-slate-800 transition-all"
                    />
                  </div>
                </div>

                {mode === 'register' && (
                  <div>
                    <label htmlFor="candidate_student_confirm_password" className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">
                      Confirm Password
                    </label>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        id="candidate_student_confirm_password"
                        name="candidate_student_confirm_password"
                        type="password"
                        autoComplete="new-password"
                        required
                        minLength={8}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full pl-10 pr-4 py-3 rounded-2xl bg-[#FFFDFB] border border-orange-100 focus:border-[#FF7A59] focus:ring-2 focus:ring-orange-100 outline-none text-sm text-slate-800 transition-all"
                      />
                    </div>
                  </div>
                )}

                <Button type="submit" disabled={submitting || googleBusy} className="w-full py-3 mt-2 font-bold">
                  {submitting
                    ? mode === 'register'
                      ? 'Creating Student Account...'
                      : 'Verifying Credentials...'
                    : mode === 'register'
                    ? 'Create Account & Begin Tour'
                    : 'Sign In to Student Dashboard'}
                </Button>
              </form>

              {/* Social Divider */}
              <div className="relative my-6 text-center">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-100" />
                </div>
                <span className="relative px-3 bg-white text-xs text-slate-400 font-semibold uppercase">
                  Or
                </span>
              </div>

              {/* Google Sign-In */}
              <button
                type="button"
                onClick={() => void handleGoogleSignIn()}
                disabled={googleBusy || submitting}
                className="w-full flex items-center justify-center gap-2.5 px-4 py-3 bg-white hover:bg-orange-50/50 text-slate-700 font-bold text-xs rounded-2xl border border-orange-200/80 shadow-xs hover:shadow transition-all active:scale-98 cursor-pointer disabled:opacity-60"
              >
                <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                <span>{googleBusy ? 'Connecting with Google...' : 'Continue with Google Account'}</span>
              </button>

              {/* Google Account Switcher / Direct Access */}
              <div className="pt-2 text-center">
                <button
                  type="button"
                  onClick={() => setShowAccountSwitcher(!showAccountSwitcher)}
                  className="text-xs font-semibold text-[#FF7A59] hover:text-[#E86144] hover:underline cursor-pointer inline-flex items-center gap-1"
                >
                  {showAccountSwitcher ? 'Hide Account Switcher' : 'Use a specific / different Google Account →'}
                </button>
              </div>

              {showAccountSwitcher && (
                <div className="mt-2 p-3.5 rounded-2xl bg-orange-50/70 border border-orange-200/80 space-y-2.5 transition-all text-left">
                  <div className="text-[11px] font-semibold text-slate-700">
                    Sign in with any designated Google Account:
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="email"
                      value={switcherEmail}
                      onChange={(e) => setSwitcherEmail(e.target.value)}
                      placeholder="e.g. your.personal@gmail.com"
                      className="flex-1 px-3 py-2 text-xs rounded-xl bg-white border border-orange-200 outline-none focus:border-[#FF7A59] text-slate-800"
                    />
                    <button
                      type="button"
                      disabled={googleBusy || !switcherEmail.trim().includes('@')}
                      onClick={() => void handleGoogleSignIn(switcherEmail.trim())}
                      className="px-3 py-2 text-xs font-bold rounded-xl bg-[#FF7A59] hover:bg-[#E86144] text-white disabled:opacity-50 transition-all cursor-pointer whitespace-nowrap shadow-xs"
                    >
                      Sign In
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-500 leading-tight">
                    Specify any Google account email to switch accounts directly and keep candidate profiles strictly isolated.
                  </p>
                </div>
              )}

              {/* Footer note */}
              <div className="mt-6 pt-5 border-t border-slate-100 text-xs text-slate-500 text-center">
                <span>Are you an institutional administrator? </span>
                <Link to="/admin/login" className="text-[#E86144] font-bold hover:underline">
                  Institutional Admin Portal →
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
