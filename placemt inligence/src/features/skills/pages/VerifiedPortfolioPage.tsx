import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ShieldCheck,
  Copy,
  Award,
  Share2,
  Plus,
  ExternalLink,
} from 'lucide-react';
import { Card, CardHeader } from '../../../components/common/Card';
import { Button } from '../../../components/common/Button';
import { Badge } from '../../../components/common/Badge';
import { Modal } from '../../../components/common/Modal';
import { Input, Textarea } from '../../../components/common/Input';
import { ClayLoader } from '../../../components/common/ClayLoader';
import { EmptyState } from '../../../components/common/EmptyState';
import { useToast } from '../../../context/ToastContext';
import { useAuth } from '../../../context/AuthContext';
import {
  skillService,
  type VerifiedCredential,
  type VerificationRequestItem,
} from '../../../services/skillService';

export const VerifiedPortfolioPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { success, error } = useToast();

  const [credentials, setCredentials] = useState<VerifiedCredential[]>([]);
  const [requests, setRequests] = useState<VerificationRequestItem[]>([]);
  const [trustScore, setTrustScore] = useState(0);
  const [selectedCredential, setSelectedCredential] = useState<VerifiedCredential | null>(null);
  const [certModalOpen, setCertModalOpen] = useState(false);

  // Manual external proof request modal
  const [reqModalOpen, setReqModalOpen] = useState(false);
  const [reqSkill, setReqSkill] = useState('');
  const [reqUrl, setReqUrl] = useState('');
  const [reqNotes, setReqNotes] = useState('');
  const [submittingReq, setSubmittingReq] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadCreds = async () => {
    setLoading(true);
    try {
      const data = await skillService.getVerifiedCredentials();
      setCredentials(data.credentials || []);
      setRequests(data.requests || []);
      setTrustScore(data.trustScore ?? 0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCreds();
  }, []);

  const handleCopyShareLink = () => {
    const firstHash = credentials[0]?.verificationHash;
    const url = firstHash
      ? `${window.location.origin}/verify/${encodeURIComponent(firstHash)}`
      : `${window.location.origin}/student/verified-portfolio`;
    navigator.clipboard.writeText(url);
    success(firstHash ? 'Public credential verification link copied!' : 'Portfolio link copied!');
  };

  const handleSubmitProofRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reqSkill.trim() || !reqUrl.trim()) return;
    setSubmittingReq(true);
    try {
      await skillService.requestManualVerification({
        skill_name: reqSkill.trim(),
        proof_url: reqUrl.trim(),
        notes: reqNotes.trim() || undefined,
      });
      success(`Verification request submitted for ${reqSkill.trim()}.`);
      setReqModalOpen(false);
      setReqSkill('');
      setReqUrl('');
      setReqNotes('');
      await loadCreds();
    } catch (err: any) {
      error(err?.message || 'Failed to submit verification request.');
    } finally {
      setSubmittingReq(false);
    }
  };

  if (loading) {
    return <ClayLoader label="Loading Verified Skills Ledger..." />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            Verified Skills Portfolio
          </h1>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Cryptographically audited proof of engineering competence stored in MongoDB Atlas.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            variant="white"
            size="sm"
            leftIcon={<Plus className="w-3.5 h-3.5 text-[#E86144]" />}
            onClick={() => setReqModalOpen(true)}
          >
            Submit External Proof
          </Button>
          <Button
            variant="primary"
            size="sm"
            leftIcon={<Share2 className="w-3.5 h-3.5" />}
            onClick={handleCopyShareLink}
          >
            Share Portfolio
          </Button>
        </div>
      </div>

      {/* Portfolio Banner */}
      <div className="clay-card-peach p-6 border border-orange-200 shadow-sm">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-white border border-orange-200 text-orange-600 flex items-center justify-center shrink-0 shadow-sm">
              <ShieldCheck className="w-8 h-8" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900">{user?.name || user?.email || 'Student'}</h3>
                <Badge variant={credentials.length > 0 ? 'brand' : 'neutral'} size="sm">
                  {credentials.length > 0 ? 'Audited Profile' : 'Unverified Yet'}
                </Badge>
              </div>
              <p className="text-xs text-slate-600 font-medium mt-0.5">
                {user?.college || 'College details pending'} • {credentials.length} Technical Skill
                {credentials.length === 1 ? '' : 's'} Verified
              </p>
            </div>
          </div>

          <div className="text-right text-xs">
            <span className="text-slate-500 font-medium block text-[11px]">Recruiter Trust Score:</span>
            <span className="font-mono text-3xl font-black text-emerald-700">
              {Math.round(trustScore)} / 100
            </span>
          </div>
        </div>
      </div>

      {/* Credentials Grid or Empty State */}
      {credentials.length === 0 ? (
        <EmptyState
          title="0 Verified Credentials Issued Yet"
          description="Pass a 5-Q or 10-Q technical assessment with 75%+ or submit an external project/certificate proof for Admin verification."
          icon={<Award className="w-8 h-8 text-[#E86144]" />}
          actionText="Take a Skill Assessment"
          onAction={() => navigate('/student/assessments')}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {credentials.map((cred) => (
            <div
              key={cred.id}
              onClick={() => {
                setSelectedCredential(cred);
                setCertModalOpen(true);
              }}
              className="clay-card p-5 bg-white border border-slate-200/90 hover:border-orange-300 hover:shadow-md cursor-pointer transition-all"
            >
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider font-bold">
                    {cred.category}
                  </span>
                  <h3 className="text-base font-bold text-slate-900 mt-0.5">{cred.skillName}</h3>
                </div>
                <Badge variant="success" size="sm">
                  Verified
                </Badge>
              </div>

              <div className="mt-4 p-3.5 rounded-xl bg-orange-50/40 border border-orange-100 text-xs space-y-2 font-medium">
                <div className="flex justify-between text-slate-500">
                  <span>Evaluated Score:</span>
                  <span className="font-mono text-emerald-700 font-bold">{cred.score}%</span>
                </div>
                <div className="flex justify-between text-slate-500">
                  <span>Proficiency Level:</span>
                  <span className="text-slate-800 font-bold">{cred.proficiency}</span>
                </div>
                <div className="flex justify-between text-slate-500">
                  <span>Source:</span>
                  <span className="text-slate-700 truncate max-w-[140px]">{cred.verificationSource}</span>
                </div>
                <div className="flex justify-between text-slate-500">
                  <span>Verified Date:</span>
                  <span className="font-mono text-slate-700">
                    {cred.verifiedDate ? cred.verifiedDate.split('T')[0] : '—'}
                  </span>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] font-mono">
                <span className="text-slate-400 font-semibold">Ledger Hash:</span>
                <span className="text-orange-700 font-bold truncate max-w-[150px]">{cred.verificationHash}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Manual Verification Requests History */}
      {requests.length > 0 && (
        <Card variant="default">
          <CardHeader title="Submitted External Proof Requests" subtitle="Reviewed by institutional Placement Admins" />
          <div className="space-y-2.5 text-xs">
            {requests.map((r) => (
              <div key={r.id} className="p-3.5 rounded-2xl bg-orange-50/40 border border-orange-100 flex items-center justify-between gap-3">
                <div>
                  <span className="font-bold text-slate-900">{r.skill_name}</span>
                  <a
                    href={r.proof_url}
                    target="_blank"
                    rel="noreferrer"
                    className="block text-[11px] font-mono text-[#E86144] hover:underline mt-0.5"
                  >
                    {r.proof_url} <ExternalLink className="w-3 h-3 inline" />
                  </a>
                </div>
                <Badge
                  variant={r.status === 'approved' ? 'success' : r.status === 'rejected' ? 'danger' : 'warning'}
                  size="sm"
                >
                  {r.status}
                </Badge>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Certificate Modal */}
      {selectedCredential && (
        <Modal
          isOpen={certModalOpen}
          onClose={() => setCertModalOpen(false)}
          title="Cryptographic Skill Certificate"
          subtitle={`Verified Credential for ${selectedCredential.skillName}`}
        >
          <div className="clay-card-peach p-6 border border-orange-200 text-center space-y-4">
            <div className="w-16 h-16 mx-auto rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center border-2 border-emerald-300">
              <Award className="w-8 h-8" />
            </div>

            <div>
              <p className="text-xs uppercase font-mono tracking-widest text-orange-700 font-bold">Proof of Competence</p>
              <h2 className="text-xl font-black text-slate-900 mt-1">{selectedCredential.skillName}</h2>
              <p className="text-xs text-slate-600 font-medium mt-1">
                Issued to <strong className="text-slate-900">{user?.name || user?.email}</strong>
                {user?.college ? ` (${user.college})` : ''}
              </p>
            </div>

            <div className="p-3 bg-white rounded-xl border border-orange-200 text-xs font-mono text-left space-y-1">
              <div><span className="text-slate-400">Score:</span> <strong className="text-emerald-700">{selectedCredential.score}%</strong></div>
              <div><span className="text-slate-400">Level:</span> <strong className="text-slate-800">{selectedCredential.proficiency}</strong></div>
              <div><span className="text-slate-400">Date:</span> <strong className="text-slate-800">{selectedCredential.verifiedDate?.split('T')[0]}</strong></div>
              <div className="truncate"><span className="text-slate-400">Hash:</span> <strong className="text-orange-700">{selectedCredential.verificationHash}</strong></div>
            </div>

            <div className="space-y-2 pt-1">
              <a
                href={`/verify/${encodeURIComponent(selectedCredential.verificationHash)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-2 px-3 rounded-xl bg-gradient-to-r from-[#FF7A59] to-[#E86144] hover:from-[#e86144] hover:to-[#d45237] text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-xs cursor-pointer"
              >
                <ExternalLink className="w-3.5 h-3.5" /> Open Public Verification Certificate
              </a>

              <Button
                variant="white"
                size="sm"
                className="w-full"
                leftIcon={<Copy className="w-3.5 h-3.5" />}
                onClick={() => {
                  navigator.clipboard.writeText(selectedCredential.verificationHash);
                  success('Verification hash copied to clipboard!');
                }}
              >
                Copy Cryptographic Hash
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Request Proof Verification Modal */}
      <Modal
        isOpen={reqModalOpen}
        onClose={() => setReqModalOpen(false)}
        title="Request Skill Verification"
        subtitle="Submit a GitHub repository, deployed project, or certificate link for Admin review"
      >
        <form onSubmit={handleSubmitProofRequest} className="space-y-4 text-xs">
          <Input
            label="Skill Name"
            placeholder="e.g. Docker, Kubernetes, React"
            value={reqSkill}
            onChange={(e) => setReqSkill(e.target.value)}
            required
          />
          <Input
            label="Proof URL (GitHub / Certificate Link)"
            type="url"
            placeholder="https://github.com/username/project"
            value={reqUrl}
            onChange={(e) => setReqUrl(e.target.value)}
            required
          />
          <Textarea
            label="Verification Notes"
            placeholder="Describe what reviewers should check..."
            rows={3}
            value={reqNotes}
            onChange={(e) => setReqNotes(e.target.value)}
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" size="sm" type="button" onClick={() => setReqModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" type="submit" isLoading={submittingReq}>
              Submit for Admin Audit
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
