import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  ShieldCheck,
  Mail,
  Lock,
  ArrowLeft,
  AlertCircle,
  KeyRound,
  RotateCcw,
  CheckCircle2,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { useToast } from '../../../context/ToastContext';
import { Button } from '../../../components/common/Button';
import { authService } from '../../../services/authService';

export const AdminLoginPage: React.FC = () => {
  const { isAuthenticated, role, loginAdmin } = useAuth();
  const { success, error } = useToast();
  const navigate = useNavigate();

  // Step 1: Credentials | forgot_email | forgot_reset
  const [step, setStep] = useState<'credentials' | 'forgot_email' | 'forgot_reset'>('credentials');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Password Recovery fields
  const [maskedEmail, setMaskedEmail] = useState('');
  const [forgotCode, setForgotCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [forgotCodePreview, setForgotCodePreview] = useState<string | null>(null);
  const [forgotSuccess, setForgotSuccess] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (isAuthenticated && role === 'admin') {
      navigate('/admin/dashboard', { replace: true });
    }
  }, [isAuthenticated, role, navigate]);

  const handleCredentialsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!email.trim() || !password) {
      setErrorMsg('Please enter both your institutional administrator email and password.');
      return;
    }

    setSubmitting(true);
    try {
      await loginAdmin(email.trim(), password);
      success('Welcome back!', 'Signed in as Administrator.');
      navigate('/admin/dashboard', { replace: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Invalid administrator credentials.';
      setErrorMsg(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleForgotSendCode = async (e: React.FormEvent | React.MouseEvent) => {
    e.preventDefault();
    setErrorMsg('');
    if (!email.trim() || !email.includes('@')) {
      setErrorMsg('Please enter a valid administrator email address.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await authService.requestPasswordResetCode(email.trim());
      setMaskedEmail((res as any).masked_email || email);
      setForgotCodePreview((res as any).code_preview || null);
      setStep('forgot_reset');
      success('Verification Code Sent', res.message || 'Check your dedicated mailbox.');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to dispatch recovery code.';
      setErrorMsg(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleForgotResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    if (forgotCode.length !== 6) {
      setErrorMsg('Please enter the full 6-digit recovery code.');
      return;
    }
    if (newPassword.length < 8) {
      setErrorMsg('New password must be at least 8 characters in length.');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setErrorMsg('Passwords do not match. Please verify.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await authService.resetPasswordWithCode(email.trim(), forgotCode, newPassword);
      setForgotSuccess(true);
      success(res.message || 'Administrator password successfully updated!');
      setPassword(newPassword);
      setTimeout(() => {
        setStep('credentials');
        setForgotSuccess(false);
        setForgotCode('');
        setNewPassword('');
        setConfirmNewPassword('');
      }, 1800);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update administrator password.';
      setErrorMsg(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#f0f6ff] via-white to-[#eff6ff] flex flex-col justify-center items-center px-4 py-12">
      <div className="w-full max-w-md">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-900 mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Home
        </Link>

        <div className="bg-white rounded-3xl border border-blue-100 p-8 shadow-[14px_14px_34px_rgba(37,99,235,0.1),-8px_-8px_24px_rgba(255,255,255,0.95)]">
          {step === 'credentials' && (
            /* STEP 1: INSTITUTIONAL ADMIN SIGN IN */
            <>
              <div className="flex items-center gap-3.5 mb-6">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white shadow-md">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-slate-900">Placement Admin Portal</h1>
                  <p className="text-xs text-slate-500">Institutional Sign In</p>
                </div>
              </div>

              {errorMsg && (
                <div className="mb-5 p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-sm flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span className="leading-relaxed">{errorMsg}</span>
                </div>
              )}

              <form id="admin_login_form" name="admin_login_form" onSubmit={handleCredentialsSubmit} className="space-y-4">
                <input type="hidden" name="portal_scope" value="institutional_admin_auth" />
                <div>
                  <label htmlFor="admin_institutional_email" className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">
                    Administrator Email
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      id="admin_institutional_email"
                      name="admin_institutional_email"
                      type="email"
                      autoComplete="username"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="admin@placement.edu"
                      className="w-full pl-10 pr-4 py-3 rounded-2xl bg-[#f8fbff] border border-blue-100 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none text-sm text-slate-800 transition-all font-mono"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label htmlFor="admin_institutional_password" className="block text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      Password
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setStep('forgot_email');
                        setErrorMsg('');
                      }}
                      className="text-xs font-semibold text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
                    >
                      Forgot Password?
                    </button>
                  </div>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      id="admin_institutional_password"
                      name="admin_institutional_password"
                      type="password"
                      autoComplete="current-password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter administrator password"
                      className="w-full pl-10 pr-4 py-3 rounded-2xl bg-[#f8fbff] border border-blue-100 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none text-sm text-slate-800 transition-all"
                    />
                  </div>
                </div>

                <Button variant="blue" type="submit" disabled={submitting} className="w-full py-3 mt-2 font-bold">
                  {submitting ? 'Signing in...' : 'Sign In to Admin Console'}
                </Button>
              </form>

              <div className="mt-6 pt-5 border-t border-slate-100 text-xs text-slate-500 space-y-2">
                <p className="font-semibold text-slate-700 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-blue-600" />
                  Direct Institutional Admin Access
                </p>
                <p className="leading-relaxed">
                  Strict role isolation is enforced. Student accounts are prohibited from logging into this portal. Authorized administrators authenticate directly into the Institutional Placement Console.
                </p>
              </div>
            </>
          )}

          {step === 'forgot_email' && (
            /* STEP 2: ADMIN PASSWORD RECOVERY - ENTER EMAIL */
            <>
              <div className="flex items-center gap-3.5 mb-6">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white shadow-md">
                  <KeyRound className="w-6 h-6" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-slate-900">Admin Password Recovery</h1>
                  <p className="text-xs text-slate-500">Secure Single-Use Verification Code</p>
                </div>
              </div>

              {errorMsg && (
                <div className="mb-5 p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-sm flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span className="leading-relaxed">{errorMsg}</span>
                </div>
              )}

              <form onSubmit={handleForgotSendCode} className="space-y-4">
                <div>
                  <label htmlFor="admin_recovery_email" className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">
                    Administrator Email
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      id="admin_recovery_email"
                      name="admin_recovery_email"
                      type="email"
                      autoComplete="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="admin@placement.edu"
                      className="w-full pl-10 pr-4 py-3 rounded-2xl bg-[#f8fbff] border border-blue-100 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none text-sm text-slate-800 transition-all font-mono"
                    />
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1.5">
                    A 6-digit recovery code will be dispatched to your dedicated administrator mailbox.
                  </p>
                </div>

                <Button variant="blue" type="submit" disabled={submitting} className="w-full py-3 mt-2 font-bold">
                  {submitting ? 'Sending Recovery Code...' : 'Send Recovery Code'}
                </Button>

                <div className="pt-3 text-center">
                  <button
                    type="button"
                    onClick={() => {
                      setStep('credentials');
                      setErrorMsg('');
                    }}
                    className="text-xs font-semibold text-slate-500 hover:text-slate-900 cursor-pointer"
                  >
                    ← Back to Admin Login
                  </button>
                </div>
              </form>
            </>
          )}

          {step === 'forgot_reset' && (
            /* STEP 3: ADMIN PASSWORD RECOVERY - CODE & NEW PASSWORD */
            <>
              <div className="flex items-center gap-3.5 mb-6">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white shadow-md">
                  <KeyRound className="w-6 h-6" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-slate-900">Set New Password</h1>
                  <p className="text-xs text-slate-500">Update Administrator Credentials</p>
                </div>
              </div>

              {forgotSuccess ? (
                <div className="p-6 rounded-2xl bg-emerald-50 border border-emerald-200 text-center space-y-3">
                  <div className="w-12 h-12 rounded-full bg-emerald-500 text-white flex items-center justify-center mx-auto shadow-md">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <h3 className="text-base font-bold text-emerald-950">Password Updated Successfully</h3>
                  <p className="text-xs text-emerald-800 leading-relaxed">
                    Administrator credentials updated. Redirecting to login...
                  </p>
                </div>
              ) : (
                <>
                  <div className="mb-4 p-3.5 rounded-2xl bg-blue-50/70 border border-blue-100 text-xs text-slate-700 leading-relaxed">
                    Recovery code sent to <span className="font-bold text-slate-900 font-mono">{maskedEmail || email}</span>.
                  </div>

                  {forgotCodePreview && (
                    <div className="mb-4 p-3 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-center justify-between font-mono">
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-amber-600 shrink-0" />
                        <span>Dev Preview: <strong>{forgotCodePreview}</strong></span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setForgotCode(forgotCodePreview)}
                        className="text-[11px] underline text-amber-700 font-bold hover:text-amber-900 cursor-pointer"
                      >
                        Auto-Fill
                      </button>
                    </div>
                  )}

                  {errorMsg && (
                    <div className="mb-5 p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-sm flex items-start gap-2.5">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span className="leading-relaxed">{errorMsg}</span>
                    </div>
                  )}

                  <form onSubmit={handleForgotResetPassword} className="space-y-4">
                    <div>
                      <label htmlFor="admin_recovery_code" className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">
                        6-Digit Recovery Code
                      </label>
                      <input
                        id="admin_recovery_code"
                        name="admin_recovery_code"
                        type="text"
                        required
                        maxLength={6}
                        autoFocus
                        value={forgotCode}
                        onChange={(e) => setForgotCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        placeholder="• • • • • •"
                        className="w-full text-center tracking-[0.5em] font-mono text-2xl font-black py-3 rounded-2xl bg-[#f8fbff] border border-blue-100 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none text-slate-900 transition-all"
                      />
                    </div>

                    <div>
                      <label htmlFor="admin_new_password" className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">
                        New Administrator Password
                      </label>
                      <div className="relative">
                        <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input
                          id="admin_new_password"
                          name="admin_new_password"
                          type="password"
                          autoComplete="new-password"
                          required
                          minLength={8}
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="Min 8 characters"
                          className="w-full pl-10 pr-4 py-3 rounded-2xl bg-[#f8fbff] border border-blue-100 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none text-sm text-slate-800 transition-all"
                        />
                      </div>
                    </div>

                    <div>
                      <label htmlFor="admin_confirm_password" className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">
                        Confirm New Password
                      </label>
                      <div className="relative">
                        <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input
                          id="admin_confirm_password"
                          name="admin_confirm_password"
                          type="password"
                          autoComplete="new-password"
                          required
                          minLength={8}
                          value={confirmNewPassword}
                          onChange={(e) => setConfirmNewPassword(e.target.value)}
                          placeholder="Re-enter password"
                          className="w-full pl-10 pr-4 py-3 rounded-2xl bg-[#f8fbff] border border-blue-100 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none text-sm text-slate-800 transition-all"
                        />
                      </div>
                    </div>

                    <Button
                      variant="blue"
                      type="submit"
                      disabled={submitting || forgotCode.length !== 6 || newPassword.length < 8}
                      className="w-full py-3 mt-2 font-bold"
                    >
                      {submitting ? 'Updating Password...' : 'Reset Administrator Password'}
                    </Button>

                    <div className="pt-2 flex items-center justify-between text-xs">
                      <button
                        type="button"
                        onClick={() => {
                          setStep('forgot_email');
                          setForgotCode('');
                          setErrorMsg('');
                        }}
                        className="text-slate-500 hover:text-slate-800 cursor-pointer"
                      >
                        ← Change Email
                      </button>

                      <button
                        type="button"
                        disabled={submitting}
                        onClick={(e) => void handleForgotSendCode(e)}
                        className="inline-flex items-center gap-1 font-semibold text-blue-600 hover:text-blue-800 cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        Resend Code
                      </button>
                    </div>
                  </form>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
