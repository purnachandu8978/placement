import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  Award,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  Globe,
  Lock,
  QrCode,
  Share2,
  Shield,
  Sparkles,
  TrendingUp,
  User,
} from 'lucide-react';
import { Card } from '../../../components/common/Card';
import { Button } from '../../../components/common/Button';
import { Badge } from '../../../components/common/Badge';
import { ClayLoader } from '../../../components/common/ClayLoader';
import { passportService, type CareerPassportData } from '../../../services/passportService';
import { formatRealDateTime } from '../../../utils/dateUtils';

export const CareerPassportPage: React.FC = () => {
  const { registrationId } = useParams<{ registrationId?: string }>();
  const isPublicRoute = Boolean(registrationId);

  const [passport, setPassport] = useState<CareerPassportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [updatingVisibility, setUpdatingVisibility] = useState(false);

  const fetchPassport = async () => {
    try {
      setLoading(true);
      setError(null);
      let data: CareerPassportData;
      if (isPublicRoute && registrationId) {
        data = await passportService.getPublicPassport(registrationId);
      } else {
        data = await passportService.getMyPassport();
      }
      setPassport(data);
    } catch (err: any) {
      console.error('Failed to load Career Passport:', err);
      setError(
        err?.response?.data?.detail ||
        'Unable to load Career Passport. The candidate may have configured this passport as private.'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPassport();
  }, [registrationId]);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleToggleVisibility = async () => {
    if (!passport || isPublicRoute) return;
    try {
      setUpdatingVisibility(true);
      const nextVal = !passport.is_public;
      await passportService.updatePassportVisibility(nextVal);
      setPassport((prev) => (prev ? { ...prev, is_public: nextVal } : null));
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Failed to update visibility settings.');
    } finally {
      setUpdatingVisibility(false);
    }
  };

  if (loading) {
    return (
      <div className="py-24 flex items-center justify-center">
        <ClayLoader label="Loading Student Career Passport..." />
      </div>
    );
  }

  if (error || !passport) {
    return (
      <div className="max-w-xl mx-auto py-16 px-4 text-center">
        <Card className="p-8 border-slate-200 shadow-sm bg-white">
          <div className="w-12 h-12 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center mx-auto mb-4">
            <Lock className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">Private Career Passport</h2>
          <p className="text-sm text-slate-600 mb-6">
            {error || 'This student candidate has restricted public access to their career passport.'}
          </p>
          <div className="flex justify-center gap-3">
            <Link to="/">
              <Button variant="secondary">Go to Home</Button>
            </Link>
            {!isPublicRoute && (
              <Button variant="primary" onClick={fetchPassport} className="bg-[#FF7A59] hover:bg-[#E86144] text-white">
                Retry
              </Button>
            )}
          </div>
        </Card>
      </div>
    );
  }

  const shareableUrl = `${window.location.origin}/passport/${passport.registration_id}`;
  const isLevel2 = passport.current_verification_level === 'LEVEL_2_GREEN';
  const isLevel1 = passport.current_verification_level === 'LEVEL_1_BLUE';

  return (
    <div className="space-y-8 max-w-6xl mx-auto pb-16">
      {/* Flagship Passport Banner */}
      <div className="relative rounded-2xl bg-gradient-to-r from-orange-500 via-rose-500 to-amber-500 p-8 text-white shadow-lg overflow-hidden">
        <div className="absolute right-0 top-0 -mt-12 -mr-12 w-64 h-64 rounded-full bg-white/10 blur-2xl pointer-events-none" />

        <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div className="flex items-start gap-4">
            <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur-md border border-white/30 flex items-center justify-center text-white text-2xl font-black shadow-inner">
              {passport.student_name.slice(0, 2).toUpperCase()}
            </div>

            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight text-white">{passport.student_name}</h1>
                {isLevel2 && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500 text-white shadow-sm">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Green Fully Verified ✓
                  </span>
                )}
                {isLevel1 && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-600 text-white shadow-sm">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Blue Verified ✓
                  </span>
                )}
                {!isLevel1 && !isLevel2 && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-white/20 text-white">
                    Unverified Candidate
                  </span>
                )}
              </div>

              <p className="text-sm text-orange-100 mt-1">
                {passport.college} {passport.department ? `• ${passport.department}` : ''}{' '}
                {passport.graduation_year ? `• Class of ${passport.graduation_year}` : ''}
              </p>

              {/* Permanent Student Registration ID Pill */}
              <div className="mt-3 flex items-center gap-2">
                <span className="text-xs uppercase tracking-wider text-orange-100/90 font-medium">Permanent Reg ID:</span>
                <span className="font-mono text-xs font-bold bg-white/20 px-2.5 py-1 rounded-md border border-white/25">
                  {passport.registration_id}
                </span>
                <button
                  onClick={() => handleCopy(passport.registration_id)}
                  className="p-1 rounded bg-white/10 hover:bg-white/20 text-white transition-colors"
                  title="Copy Student Registration ID"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
                {copied && <span className="text-xs text-white font-semibold">Copied!</span>}
              </div>
            </div>
          </div>

          {/* Verification Callout */}
          <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-xl p-4 md:text-right min-w-[200px]">
            <p className="text-xs uppercase tracking-wider text-orange-100">Placement Readiness</p>
            <p className="text-3xl font-extrabold text-white mt-0.5">{passport.readiness_score}%</p>
            <span className="inline-block mt-1 text-xs px-2 py-0.5 rounded bg-white/20 font-medium text-white">
              {passport.readiness_band}
            </span>
          </div>
        </div>
      </div>

      {/* Recruiter Sharing & Discovery Control (For Authenticated Student) */}
      {!isPublicRoute && (
        <Card className="p-6 bg-white border-orange-200 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-start gap-3">
              <span className={`p-2.5 rounded-xl ${passport.is_public ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                {passport.is_public ? <Globe className="w-5 h-5" /> : <Lock className="w-5 h-5" />}
              </span>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {passport.is_public ? 'Career Passport is Publicly Discoverable' : 'Career Passport is Currently Private'}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {passport.is_public
                    ? 'Verified employers and campus recruiters can view your credentials and verified skills via your secure public link.'
                    : 'Only you can view your passport. Toggle on to enable recruiter discovery and direct outreach.'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Button
                variant={passport.is_public ? 'secondary' : 'primary'}
                onClick={handleToggleVisibility}
                disabled={updatingVisibility}
                className={!passport.is_public ? 'bg-[#FF7A59] hover:bg-[#E86144] text-white' : ''}
              >
                {passport.is_public ? 'Set to Private' : 'Make Discoverable'}
              </Button>
            </div>
          </div>

          {passport.is_public && (
            <div className="mt-4 pt-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 overflow-x-auto font-mono text-slate-600 bg-slate-50 px-3 py-2 rounded-lg border border-slate-200">
                <span className="text-slate-400">Shareable URL:</span>
                <span className="text-slate-800">{shareableUrl}</span>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => handleCopy(shareableUrl)}
                className="flex items-center gap-1.5 text-orange-600 hover:text-orange-700"
              >
                <Share2 className="w-3.5 h-3.5" />
                Copy Passport Link
              </Button>
            </div>
          )}
        </Card>
      )}

      {/* Grid of Credentials & Skills */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Official Credentials */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="p-6 bg-white border-slate-200 shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
              <div className="flex items-center gap-2">
                <Award className="w-5 h-5 text-orange-600" />
                <h3 className="text-base font-bold text-slate-900">College-Verified Credentials</h3>
              </div>
              <span className="text-xs text-slate-500 font-medium">
                {passport.credentials.length} Issued Credential{passport.credentials.length === 1 ? '' : 's'}
              </span>
            </div>

            {passport.credentials.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-sm text-slate-500">No college credentials issued yet.</p>
                {!isPublicRoute && (
                  <Link to="/student/verification" className="inline-block mt-3">
                    <Button variant="primary" size="sm" className="bg-[#FF7A59] hover:bg-[#E86144] text-white">
                      Take 5-Min Assessment
                    </Button>
                  </Link>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {passport.credentials.map((cred) => {
                  const isGreen = cred.level === 'LEVEL_2_GREEN';
                  const serial = cred.serial_number || cred.credential_id;

                  return (
                    <div
                      key={cred.credential_id}
                      className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-slate-50 transition-colors flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2 py-0.5 rounded text-[11px] font-bold ${isGreen ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'
                              }`}
                          >
                            {isGreen ? 'Level 2 Green Fully Verified' : 'Level 1 Blue Verified'}
                          </span>
                          <span className="font-mono text-xs text-slate-500 font-semibold">{serial}</span>
                        </div>
                        <h4 className="text-sm font-bold text-slate-900 mt-1">{cred.skill}</h4>
                        <p className="text-xs text-slate-500">
                          Evaluated Score: <span className="font-semibold text-slate-800">{cred.score}%</span> • Issued on{' '}
                          {formatRealDateTime(cred.issued_at)}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <a
                          href={`/api/v1/verification/credentials/${cred.credential_id}/pdf`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <Button variant="secondary" size="sm" className="text-xs flex items-center gap-1.5">
                            <Download className="w-3.5 h-3.5 text-slate-600" />
                            Download PDF
                          </Button>
                        </a>
                        <Link to={`/verify/${serial}`}>
                          <Button variant="secondary" size="sm" className="text-xs flex items-center gap-1.5 text-blue-700">
                            <ExternalLink className="w-3.5 h-3.5" />
                            Verify
                          </Button>
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          {/* Verified Competencies */}
          <Card className="p-6 bg-white border-slate-200 shadow-sm">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-4 mb-4">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              <h3 className="text-base font-bold text-slate-900">Verified Technical Competencies</h3>
            </div>

            {passport.verified_skills.length === 0 ? (
              <p className="text-xs text-slate-500 italic">No evaluated competencies on record yet.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {passport.verified_skills.map((s, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-lg border border-slate-200 bg-white flex items-center justify-between"
                  >
                    <div>
                      <p className="text-xs font-bold text-slate-900">{s.skill}</p>
                      <p className="text-[11px] text-emerald-700 font-semibold">Verified Proctored</p>
                    </div>
                    <span className="text-sm font-bold text-slate-800">{s.score}%</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Right Column: Candidate Profile & Resume Highlights */}
        <div className="space-y-6">
          <Card className="p-6 bg-white border-slate-200 shadow-sm">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3 mb-4">
              <TrendingUp className="w-5 h-5 text-orange-600" />
              <h3 className="text-sm font-bold text-slate-900">Placement Target Roles</h3>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {passport.target_roles.length > 0 ? (
                passport.target_roles.map((role, idx) => (
                  <span
                    key={idx}
                    className="px-2.5 py-1 rounded-md text-xs font-medium bg-orange-50 text-orange-800 border border-orange-200"
                  >
                    {role}
                  </span>
                ))
              ) : (
                <span className="text-xs text-slate-500 italic">Full Stack Developer, Software Engineer</span>
              )}
            </div>

            <div className="mt-6 pt-4 border-t border-slate-100">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Resume Extracted Skills</h4>
              <div className="flex flex-wrap gap-1.5">
                {passport.resume_skills.map((skill, idx) => (
                  <span
                    key={idx}
                    className="px-2 py-0.5 rounded text-[11px] bg-slate-100 text-slate-700 border border-slate-200"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          </Card>

          {/* Cryptographic Trust Statement */}
          <Card className="p-5 bg-gradient-to-br from-slate-900 to-slate-800 text-white shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <Shield className="w-4 h-4 text-emerald-400" />
              <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                Institutional Authenticity
              </h4>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Every credential recorded in this Career Passport is cryptographically signed using HMAC-SHA256 digests and
              server-side proctored assessment logs backed by MongoDB Atlas.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
};
