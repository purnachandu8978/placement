import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ShieldCheck,
  ShieldAlert,
  CheckCircle2,
  Copy,
  Check,
  Calendar,
  Building2,
  Award,
  ExternalLink,
  Lock,
  ArrowRight,
  Sparkles,
  FileCheck2,
} from 'lucide-react';
import { apiClient } from '../../../services/apiClient';

interface VerificationData {
  verified: boolean;
  status: string;
  candidate_name: string;
  college: string;
  level?: string;
  badge_type?: string;
  title?: string;
  skill: string;
  proficiency?: string;
  score: number;
  evidence: string;
  credential_id?: string;
  verification_hash: string;
  issued_at: string;
  issuing_platform: string;
  cryptographic_algorithm?: string;
  revocation_reason?: string;
}

export const PublicSkillVerificationPage: React.FC = () => {
  const { hash } = useParams<{ hash: string }>();
  const [data, setData] = useState<VerificationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedHash, setCopiedHash] = useState(false);
  const [copiedId, setCopiedId] = useState(false);

  useEffect(() => {
    if (!hash) {
      setError('No credential verification identifier was provided in the request URL.');
      setLoading(false);
      return;
    }

    const fetchVerification = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await apiClient.get<VerificationData>(`/verification/verify/${encodeURIComponent(hash)}`);
        setData(res);
      } catch (err: any) {
        setError(
          err?.data?.detail ||
            err?.message ||
            'Credential verification record not found. The credential ID or hash may be invalid, expired, or revoked.'
        );
      } finally {
        setLoading(false);
      }
    };

    fetchVerification();
  }, [hash]);

  const handleCopyHash = () => {
    if (data?.verification_hash) {
      navigator.clipboard.writeText(data.verification_hash);
      setCopiedHash(true);
      setTimeout(() => setCopiedHash(false), 2500);
    }
  };

  const handleCopyId = () => {
    if (data?.credential_id) {
      navigator.clipboard.writeText(data.credential_id);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2500);
    }
  };

  const isGreen = data?.badge_type === 'GREEN_FULLY_VERIFIED' || data?.level === 'LEVEL_2_GREEN';
  const isBlue = data?.badge_type === 'BLUE_VERIFIED' || data?.level === 'LEVEL_1_BLUE' || (!isGreen && data?.verified);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#FFFBF8] via-[#FAF7F3] to-[#FFF5EE] py-12 px-4 sm:px-6 lg:px-8 flex flex-col justify-between">
      <div className="max-w-3xl mx-auto w-full">
        {/* Header Branding */}
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-2 mb-3 group">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#FF7A59] to-[#E86144] flex items-center justify-center text-white font-black text-xl shadow-md group-hover:scale-105 transition-transform">
              P
            </div>
            <span className="text-lg font-black tracking-tight text-slate-900">
              Placement <span className="text-[#E86144]">Intelligence</span>
            </span>
          </Link>
          <p className="text-xs font-bold uppercase tracking-widest text-[#E86144]">
            Official Credential Verification Service
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Tamper-proof, cryptographically signed college certifications issued via automated competency assessments.
          </p>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="p-12 text-center rounded-3xl bg-white/90 backdrop-blur-md border border-orange-100 shadow-[0_20px_50px_rgba(232,97,68,0.08)]">
            <div className="w-12 h-12 rounded-full border-4 border-orange-200 border-t-[#E86144] animate-spin mx-auto mb-4" />
            <h3 className="text-sm font-bold text-slate-800">Verifying Credential on Placement Intelligence Network...</h3>
            <p className="text-xs text-slate-400 mt-1 font-mono break-all">{hash}</p>
          </div>
        )}

        {/* Error / Invalid State */}
        {!loading && error && (
          <div className="p-8 rounded-3xl bg-white border border-red-200 shadow-[0_20px_50px_rgba(239,68,68,0.08)] text-center space-y-4">
            <div className="w-16 h-16 rounded-3xl bg-red-100 text-red-600 flex items-center justify-center mx-auto shadow-xs">
              <ShieldAlert className="w-8 h-8" />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-900">Credential Verification Failed</h2>
              <p className="text-xs text-slate-600 mt-1 max-w-md mx-auto leading-relaxed">{error}</p>
            </div>

            <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 text-left font-mono text-[11px] text-slate-600 break-all">
              <span className="text-slate-400 font-bold block mb-1">Queried Identifier:</span>
              {hash}
            </div>

            <div className="pt-2">
              <Link
                to="/"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-all shadow-xs"
              >
                Return to Placement Intelligence <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        )}

        {/* Verified Certificate Card */}
        {!loading && data && (
          <div
            className={`relative p-6 sm:p-10 rounded-3xl bg-white border-2 shadow-xl overflow-hidden space-y-6 ${
              isGreen
                ? 'border-emerald-300 shadow-[0_25px_60px_rgba(16,185,129,0.12)]'
                : 'border-blue-300 shadow-[0_25px_60px_rgba(37,99,235,0.12)]'
            }`}
          >
            {/* Watermark Trust Stamp */}
            <div className="absolute top-4 right-4 sm:top-8 sm:right-8 opacity-10 pointer-events-none select-none">
              <ShieldCheck className={`w-48 h-48 ${isGreen ? 'text-emerald-600' : 'text-blue-600'}`} />
            </div>

            {/* Top Verified Ribbon */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-6 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div
                  className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-xs ${
                    isGreen ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'
                  }`}
                >
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    {isGreen ? (
                      <span className="px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-black tracking-wider uppercase border border-emerald-300">
                        Green Fully Verified ✓
                      </span>
                    ) : (
                      <span className="px-3 py-1 rounded-full bg-blue-100 text-blue-800 text-xs font-black tracking-wider uppercase border border-blue-300">
                        Blue Verified ✓
                      </span>
                    )}
                    <span className="text-xs font-bold text-slate-400">• Status: {data.status}</span>
                  </div>
                  <h2 className="text-base font-extrabold text-slate-900 mt-1">
                    {data.title || (isGreen ? 'College Fully Verified Credential' : 'College Verified Credential')}
                  </h2>
                </div>
              </div>

              <div
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-2xl border self-end sm:self-auto ${
                  isGreen
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : 'bg-blue-50 border-blue-200 text-blue-800'
                }`}
              >
                <CheckCircle2 className={`w-4 h-4 ${isGreen ? 'text-emerald-600' : 'text-blue-600'}`} />
                <span className="text-xs font-extrabold">100% Cryptographically Verified</span>
              </div>
            </div>

            {/* Credential ID Banner */}
            {data.credential_id && (
              <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <FileCheck2 className="w-4 h-4 text-slate-400" />
                  <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">Credential ID:</span>
                  <span className="font-mono text-xs font-bold text-slate-900">{data.credential_id}</span>
                </div>
                <button
                  onClick={handleCopyId}
                  className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 text-xs font-bold text-slate-700 flex items-center gap-1 transition-all cursor-pointer"
                  title="Copy credential ID"
                >
                  {copiedId ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" /> Copied
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-slate-400" /> Copy ID
                    </>
                  )}
                </button>
              </div>
            )}

            {/* Credential Core Details */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-2">
              <div>
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block mb-1">
                  Verified Candidate
                </span>
                <p className="text-lg font-black text-slate-900">{data.candidate_name}</p>
                <p className="text-xs text-slate-500 flex items-center gap-1.5 mt-1">
                  <Building2 className="w-3.5 h-3.5 text-slate-400" />
                  {data.college || 'Accredited Institution'}
                </p>
              </div>

              <div>
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block mb-1">
                  Certified Skill Domain
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-black text-slate-900">{data.skill}</span>
                  {data.proficiency && (
                    <span className="px-2 py-0.5 rounded-lg bg-orange-100 text-[#E86144] text-xs font-bold">
                      {data.proficiency}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 flex items-center gap-1 mt-1">
                  <Award className="w-3.5 h-3.5 text-amber-500" /> Assessment Score: <strong>{data.score}%</strong>
                </p>
              </div>
            </div>

            {/* Assessment Evidence & Evaluation Notes */}
            <div className="p-4 rounded-2xl bg-slate-50/80 border border-slate-200/80 space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                <Sparkles className="w-3.5 h-3.5 text-[#E86144]" /> Verification Evidence & Institutional Audit
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">{data.evidence}</p>
            </div>

            {/* Technical Verification Details */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 text-xs border-t border-slate-100">
              <div>
                <span className="text-[10px] font-bold text-slate-400 block uppercase">Issue Date</span>
                <span className="font-bold text-slate-800 flex items-center gap-1 mt-0.5">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  {data.issued_at
                    ? new Date(data.issued_at).toLocaleDateString([], {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })
                    : 'Verified Record'}
                </span>
              </div>

              <div>
                <span className="text-[10px] font-bold text-slate-400 block uppercase">Issuing Authority</span>
                <span className="font-bold text-slate-800 flex items-center gap-1 mt-0.5">
                  <Lock className="w-3.5 h-3.5 text-slate-400" />
                  {data.issuing_platform}
                </span>
              </div>
            </div>

            {/* Cryptographic Hash Bar */}
            <div className="p-3.5 rounded-2xl bg-slate-900 text-white flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-inner">
              <div className="min-w-0 flex-1">
                <span className="text-[9px] font-extrabold uppercase tracking-wider text-slate-400 block mb-0.5">
                  Immutable Cryptographic Hash ({data.cryptographic_algorithm || 'SHA-256'})
                </span>
                <p className="font-mono text-[11px] text-emerald-400 break-all select-all">{data.verification_hash}</p>
              </div>

              <button
                onClick={handleCopyHash}
                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-white transition-all flex items-center gap-1.5 shrink-0 self-end sm:self-auto cursor-pointer"
                title="Copy hash to clipboard"
              >
                {copiedHash ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" /> Copied!
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-slate-300" /> Copy Hash
                  </>
                )}
              </button>
            </div>

            {/* Privacy Notice */}
            <p className="text-[11px] text-slate-400 text-center leading-normal">
              🔒 In compliance with student data protection standards, personal contact details (such as private
              email, phone number, and candidate UID) are strictly omitted from public verification records.
            </p>
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="text-center text-xs text-slate-400 mt-12">
        © {new Date().getFullYear()} Placement Intelligence Digital Credential Authority. All rights reserved.
      </footer>
    </div>
  );
};
