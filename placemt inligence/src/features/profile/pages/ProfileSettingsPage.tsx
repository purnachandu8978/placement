import React, { useState, useEffect } from 'react';
import { Save, FileText, Lock, KeyRound, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { Card, CardHeader } from '../../../components/common/Card';
import { Button } from '../../../components/common/Button';
import { Input } from '../../../components/common/Input';
import { Badge } from '../../../components/common/Badge';
import { useAuth } from '../../../context/AuthContext';
import { useStudentData } from '../../../context/StudentDataContext';
import { useToast } from '../../../context/ToastContext';
import { resumeService, type BackendResumeRecord } from '../../../services/resumeService';
import { authService } from '../../../services/authService';

export const ProfileSettingsPage: React.FC = () => {
  const { user, updateProfile } = useAuth();
  const { refreshAll } = useStudentData();
  const { success, error } = useToast();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [college, setCollege] = useState('');
  const [degree, setDegree] = useState('');
  const [branch, setBranch] = useState('');
  const [batch, setBatch] = useState('');
  const [cgpa, setCgpa] = useState('');
  const [backlogs, setBacklogs] = useState('0');
  const [targetRoles, setTargetRoles] = useState('');
  const [locations, setLocations] = useState('');
  const [resumes, setResumes] = useState<BackendResumeRecord[]>([]);
  const [saving, setSaving] = useState(false);

  // Password Management State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordUpdating, setPasswordUpdating] = useState(false);
  const [resetCodeSent, setResetCodeSent] = useState(false);
  const [resetCode, setResetCode] = useState('');
  const [sendingResetCode, setSendingResetCode] = useState(false);

  useEffect(() => {
    if (user) {
      setName(user.name || '');
      setPhone(user.phone || '');
      setCollege(user.college || '');
      setDegree(user.degree || '');
      setBranch(user.branch || '');
      setBatch(user.batch || (user.graduationYear ? String(user.graduationYear) : ''));
      setCgpa(user.cgpa !== null && user.cgpa !== undefined ? String(user.cgpa) : '');
      setBacklogs(String(user.backlogs ?? 0));
      setTargetRoles((user.targetRoles || []).join(', '));
      setLocations((user.preferredLocations || []).join(', '));
    }
  }, [user]);

  useEffect(() => {
    resumeService.getResumes().then(setResumes).catch(() => setResumes([]));
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await updateProfile({
        full_name: name.trim() || undefined,
        phone: phone.trim() || undefined,
        college: college.trim() || undefined,
        degree: degree.trim() || undefined,
        branch: branch.trim() || undefined,
        graduation_year: batch.trim() ? parseInt(batch.trim(), 10) : undefined,
        cgpa: cgpa.trim() ? parseFloat(cgpa.trim()) : undefined,
        backlogs: parseInt(backlogs, 10) || 0,
        target_roles: targetRoles
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        preferred_locations: locations
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      });
      await refreshAll();
      success('Profile saved to MongoDB Atlas!');
    } catch (err: any) {
      error(err?.message || 'Failed to save profile changes.');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword || newPassword.length < 8) {
      error('New password must be at least 8 characters in length.');
      return;
    }
    if (newPassword !== confirmPassword) {
      error('Passwords do not match. Please re-enter.');
      return;
    }
    setPasswordUpdating(true);
    try {
      if (resetCodeSent && resetCode.trim()) {
        const res = await authService.resetPasswordWithCode(user?.email || '', resetCode.trim(), newPassword);
        success(res.message || 'Password reset successfully with verification code!');
        setResetCodeSent(false);
        setResetCode('');
      } else {
        const res = await authService.changePassword(newPassword, currentPassword || undefined);
        success(res.message || 'Password updated successfully!');
      }
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      error(err?.message || 'Failed to update password.');
    } finally {
      setPasswordUpdating(false);
    }
  };

  const handleRequestEmailCode = async () => {
    if (!user?.email) return;
    setSendingResetCode(true);
    try {
      const res = await authService.requestPasswordResetCode(user.email);
      setResetCodeSent(true);
      success(res.message || `Verification code sent to ${user.email}`);
    } catch (err: any) {
      error(err?.message || 'Failed to send verification code.');
    } finally {
      setSendingResetCode(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
          Student Profile & Career Preferences
        </h1>
        <p className="text-xs text-slate-500 font-medium mt-0.5">
          Complete or update your academic credentials stored in MongoDB Atlas (student_profiles).
        </p>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        <Card variant="default">
          <CardHeader title="Personal Information" subtitle="Synced with your Google Sign-In identity" />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Input label="Full Name" value={name} onChange={(e) => setName(e.target.value)} required />
            <Input label="Google Email" type="email" value={user?.email || ''} disabled helperText="Verified via Firebase Google Auth" />
            <Input label="Phone Number" placeholder="+91 ..." value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
        </Card>

        <Card variant="default">
          <CardHeader title="Academic Credentials" subtitle="Leave blank until ready or auto-populate by uploading your resume" />
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            <Input label="College / University" placeholder="e.g. NIT Surathkal" value={college} onChange={(e) => setCollege(e.target.value)} />
            <Input label="Degree" placeholder="e.g. B.Tech" value={degree} onChange={(e) => setDegree(e.target.value)} />
            <Input label="Branch / Major" placeholder="e.g. Computer Science" value={branch} onChange={(e) => setBranch(e.target.value)} />
            <Input label="Graduation Year" placeholder="e.g. 2026" value={batch} onChange={(e) => setBatch(e.target.value)} />
            <Input label="Cumulative CGPA (0 - 10)" placeholder="e.g. 8.5" value={cgpa} onChange={(e) => setCgpa(e.target.value)} />
            <Input label="Active Backlogs" value={backlogs} onChange={(e) => setBacklogs(e.target.value)} />
          </div>
        </Card>

        <Card variant="default">
          <CardHeader title="Career Preferences" subtitle="Used to tailor recommendations and job alerts" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Target Roles"
              placeholder="e.g. Backend Engineer, Full Stack Developer"
              value={targetRoles}
              onChange={(e) => setTargetRoles(e.target.value)}
            />
            <Input
              label="Preferred Locations"
              placeholder="e.g. Bengaluru, Hyderabad, Remote"
              value={locations}
              onChange={(e) => setLocations(e.target.value)}
            />
          </div>
        </Card>

        <Card variant="default">
          <CardHeader title="Uploaded Resume History" subtitle="Documents stored in MongoDB resumes collection" />
          {resumes.length === 0 ? (
            <p className="text-xs text-slate-400 py-4 text-center">
              No resumes uploaded yet. Visit Resume Intelligence to upload your first resume.
            </p>
          ) : (
            <div className="space-y-2.5 text-xs font-medium">
              {resumes.map((r) => (
                <div
                  key={r.id}
                  className="p-3.5 rounded-2xl bg-orange-50/40 border border-orange-100 flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <FileText className="w-4 h-4 text-orange-600" />
                    <div>
                      <span className="font-bold text-slate-900">
                        {r.filename} (v{r.version})
                      </span>
                      <p className="text-[10px] text-slate-500">
                        Uploaded {new Date(r.uploaded_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {r.is_active && <Badge variant="success" size="sm">Active</Badge>}
                    <span className="font-mono font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                      ATS {Math.round(r.ats_score || 0)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <div className="flex justify-end pt-2">
          <Button variant="primary" size="md" type="submit" isLoading={saving} leftIcon={<Save className="w-4 h-4" />}>
            Save Profile Preferences
          </Button>
        </div>
      </form>

      {/* Security & Password Card */}
      <Card variant="default">
        <CardHeader
          title="Account Security & Password"
          subtitle="Update your password or verify via single-use email security code"
        />
        <form onSubmit={handleUpdatePassword} className="space-y-4">
          <div className="p-3.5 rounded-2xl bg-orange-50/50 border border-orange-100 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2.5">
              <ShieldCheck className="w-4 h-4 text-[#FF7A59]" />
              <span className="text-slate-700">
                Registered Email: <strong>{user?.email || 'N/A'}</strong>
              </span>
            </div>
            <button
              type="button"
              disabled={sendingResetCode}
              onClick={handleRequestEmailCode}
              className="text-xs font-semibold text-[#FF7A59] hover:text-[#E86144] hover:underline cursor-pointer disabled:opacity-50"
            >
              {sendingResetCode ? 'Sending Code...' : resetCodeSent ? 'Resend Email Code' : 'Send Reset Code to Email'}
            </button>
          </div>

          {resetCodeSent && (
            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">
                6-Digit Email Verification Code
              </label>
              <input
                type="text"
                required
                maxLength={6}
                value={resetCode}
                onChange={(e) => setResetCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="• • • • • •"
                className="w-full text-center tracking-[0.5em] font-mono text-xl font-bold py-2.5 rounded-2xl bg-[#FFFDFB] border border-orange-100 focus:border-[#FF7A59] focus:ring-2 focus:ring-orange-100 outline-none text-slate-900 transition-all"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                Enter the code sent to your dedicated email address to authorize the password reset.
              </p>
            </div>
          )}

          {!resetCodeSent && user?.authProvider === 'password' && (
            <Input
              label="Current Password"
              type="password"
              placeholder="Enter your current password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="New Password"
              type="password"
              placeholder="Min 8 characters"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
            />
            <Input
              label="Confirm New Password"
              type="password"
              placeholder="Re-enter new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </div>

          <div className="flex justify-end pt-2">
            <Button
              variant="primary"
              size="md"
              type="submit"
              isLoading={passwordUpdating}
              leftIcon={<Lock className="w-4 h-4" />}
            >
              {resetCodeSent ? 'Verify Code & Set Password' : 'Change Password'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
};
