import React, { useEffect, useState } from 'react';
import { ShieldCheck, CheckCircle2, XCircle, ExternalLink } from 'lucide-react';
import { Card } from '../../../components/common/Card';
import { Button } from '../../../components/common/Button';
import { Badge } from '../../../components/common/Badge';
import { ClayLoader } from '../../../components/common/ClayLoader';
import { EmptyState } from '../../../components/common/EmptyState';
import { useToast } from '../../../context/ToastContext';
import { adminService, type VerificationRequest } from '../../../services/adminService';

export const SkillVerificationPage: React.FC = () => {
  const { success, error } = useToast();
  const [queue, setQueue] = useState<VerificationRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const loadQueue = async () => {
    setLoading(true);
    try {
      const data = await adminService.getVerificationQueue();
      setQueue(data || []);
    } catch (err: any) {
      error(err?.message || 'Unable to load skill verification queue.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadQueue();
  }, []);

  const handleAction = async (req: VerificationRequest, decision: 'approved' | 'rejected') => {
    try {
      if (decision === 'approved') {
        await adminService.approveVerification(req.id, 'Approved by Placement Admin', 'Proficient');
        success(`Approved ${req.skill_name} credential for ${req.student_name}.`);
      } else {
        await adminService.rejectVerification(req.id, 'Insufficient verifiable project/certificate proof');
        error(`Rejected verification request for ${req.skill_name}.`);
      }
      setQueue((prev) => prev.map((q) => (q.id === req.id ? { ...q, status: decision } : q)));
    } catch (err: any) {
      error(err?.message || 'Action could not be completed.');
    }
  };

  if (loading) {
    return <ClayLoader label="Loading Skill Verification Queue..." />;
  }

  const pendingCount = queue.filter((q) => q.status === 'pending').length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            Skill Verification & Credential Audit Queue
          </h1>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Review student-submitted external proof links to issue cryptographic verification credentials.
          </p>
        </div>

        <Badge variant={pendingCount > 0 ? 'warning' : 'success'} size="md">
          {pendingCount} Pending Audits
        </Badge>
      </div>

      {queue.length === 0 ? (
        <EmptyState
          title="Verification queue is clear"
          description="When students request manual verification with external GitHub/certification links, they will appear here for review."
          icon={<ShieldCheck className="w-8 h-8 text-[#E86144]" />}
        />
      ) : (
        <div className="space-y-4">
          {queue.map((req) => (
            <Card key={req.id} variant="default">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-3 border-b border-orange-100">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-orange-50 border border-orange-200 flex items-center justify-center text-[#E86144] shadow-2xs">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-bold text-slate-900">{req.student_name || req.student_email}</h3>
                      <span className="text-xs text-slate-500 font-medium">({req.student_email})</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="brand" size="sm">
                        {req.skill_name}
                      </Badge>
                      <span className="text-[11px] font-mono text-slate-400">
                        Submitted {new Date(req.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {req.status === 'pending' ? (
                    <>
                      <Button
                        variant="white"
                        size="sm"
                        className="text-xs text-rose-600 border-rose-200 hover:bg-rose-50 font-bold"
                        onClick={() => handleAction(req, 'rejected')}
                      >
                        <XCircle className="w-3.5 h-3.5 mr-1 inline" /> Reject
                      </Button>
                      <Button
                        variant="blue"
                        size="sm"
                        className="text-xs"
                        onClick={() => handleAction(req, 'approved')}
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 mr-1 inline" /> Issue Credential
                      </Button>
                    </>
                  ) : (
                    <Badge variant={req.status === 'approved' ? 'success' : 'danger'} size="md">
                      {req.status === 'approved' ? 'Approved' : 'Rejected'}
                    </Badge>
                  )}
                </div>
              </div>

              <div className="mt-3 p-3 rounded-xl bg-orange-50/40 border border-orange-100 text-xs text-slate-700 font-medium space-y-1.5">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="font-bold text-slate-900">Verification Evidence URL:</span>
                  <a
                    href={req.proof_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-mono text-[#E86144] hover:underline break-all"
                  >
                    {req.proof_url}
                    <ExternalLink className="w-3 h-3 shrink-0" />
                  </a>
                </div>
                {req.notes && (
                  <p className="text-slate-600">
                    <span className="font-bold text-slate-800">Student Notes:</span> {req.notes}
                  </p>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
