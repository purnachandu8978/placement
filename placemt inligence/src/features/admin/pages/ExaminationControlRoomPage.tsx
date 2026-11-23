import React, { useEffect, useState, useCallback } from 'react';
import {
  ShieldAlert,
  Users,
  AlertTriangle,
  Lock,
  RefreshCw,
  CheckCircle,
  RotateCcw,
  CheckCircle2,
  XCircle,
  Clock,
  ExternalLink,
  Camera,
  Mic,
} from 'lucide-react';
import {
  examinationService,
  type MonitoringData,
  type MonitoringSession,
  type SecurityAuditItem,
} from '../../../services/examinationService';

export const ExaminationControlRoomPage: React.FC = () => {
  const [data, setData] = useState<MonitoringData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSession, setSelectedSession] = useState<MonitoringSession | null>(null);
  const [decisionModalOpen, setDecisionModalOpen] = useState(false);
  const [decisionAction, setDecisionAction] = useState<
    'dismiss_false_positive' | 'authorize_retake' | 'confirm_malpractice' | 'restore_attempt'
  >('dismiss_false_positive');
  const [decisionReason, setDecisionReason] = useState('');
  const [isSubmittingDecision, setIsSubmittingDecision] = useState(false);

  const fetchTelemetry = useCallback(async () => {
    try {
      const res = await examinationService.getAdminMonitoring();
      setData(res);
      setError(null);
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'Failed to fetch monitoring telemetry.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTelemetry();
    const interval = setInterval(fetchTelemetry, 10000); // 10s telemetry polling
    return () => clearInterval(interval);
  }, [fetchTelemetry]);

  const handleOpenDecision = (
    session: MonitoringSession,
    action: 'dismiss_false_positive' | 'authorize_retake' | 'confirm_malpractice' | 'restore_attempt'
  ) => {
    setSelectedSession(session);
    setDecisionAction(action);
    setDecisionReason('');
    setDecisionModalOpen(true);
  };

  const handleSubmitDecision = async () => {
    if (!selectedSession) return;
    if (!decisionReason.trim()) {
      alert('Please provide an administrative reason for this decision.');
      return;
    }

    try {
      setIsSubmittingDecision(true);
      await examinationService.submitAdminDecision({
        attempt_id: selectedSession.attempt_id,
        student_id: selectedSession.student_id,
        exam_type: selectedSession.exam_type,
        action: decisionAction,
        reason: decisionReason,
      });

      alert(`Administrative action '${decisionAction.replace('_', ' ')}' successfully executed.`);
      setDecisionModalOpen(false);
      fetchTelemetry();
    } catch (err: any) {
      alert(err?.response?.data?.detail || err?.message || 'Failed to record administrative decision.');
    } finally {
      setIsSubmittingDecision(false);
    }
  };

  const formatRemaining = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}m ${s}s`;
  };

  return (
    <div className="space-y-6 select-none p-4 sm:p-6 text-slate-800">
      {/* Page Title & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="px-2.5 py-0.5 rounded-md bg-rose-50 text-rose-700 border border-rose-200 text-xs font-bold">
              Live Proctored Room
            </span>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              Examination Malpractice & Proctoring Control Room
            </h1>
          </div>
          <p className="text-xs text-slate-500 font-medium mt-1">
            Real-time candidate telemetry, AI supervisor events, and administrative intervention console
          </p>
        </div>

        <button
          onClick={fetchTelemetry}
          disabled={loading}
          className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-xs font-bold text-slate-700 shadow-2xs transition-all self-start sm:self-auto cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Telemetry</span>
        </button>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 p-5 rounded-3xl shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Active In-Progress Exams</span>
            <div className="text-2xl sm:text-3xl font-black text-slate-900 mt-1">
              {data?.active_sessions_count || 0}
            </div>
            <span className="text-[11px] text-emerald-700 font-medium">Live test runners connected</span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center">
            <Users className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 p-5 rounded-3xl shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Flagged for Stricter Monitoring</span>
            <div className="text-2xl sm:text-3xl font-black text-amber-700 mt-1">
              {data?.malpractice_flagged_count || 0}
            </div>
            <span className="text-[11px] text-amber-800 font-medium">Candidates with &gt;= 2 violations</span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 border border-amber-200 flex items-center justify-center">
            <AlertTriangle className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 p-5 rounded-3xl shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Locked / Terminated Attempts</span>
            <div className="text-2xl sm:text-3xl font-black text-rose-700 mt-1">
              {data?.terminated_count || 0}
            </div>
            <span className="text-[11px] text-rose-800 font-medium">4th violation threshold breached</span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 border border-rose-200 flex items-center justify-center">
            <Lock className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Active Examination Sessions Table */}
      <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-xs">
        <div className="p-4 sm:p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50/60">
          <div className="flex items-center space-x-2">
            <ShieldAlert className="w-4 h-4 text-blue-600" />
            <h2 className="text-sm font-bold text-slate-900">Active Examination Candidates</h2>
          </div>
          <span className="text-xs text-slate-500 font-mono font-medium">
            {data?.sessions.length || 0} candidates monitored
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 uppercase font-mono text-[10px] font-bold border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">Candidate Dossier</th>
                <th className="py-3 px-4">Examination Track</th>
                <th className="py-3 px-4">Session Status</th>
                <th className="py-3 px-4">Security Violations</th>
                <th className="py-3 px-4">Time Left</th>
                <th className="py-3 px-4 text-right">Administrative Intervention</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data?.sessions && data.sessions.length > 0 ? (
                data.sessions.map((sess) => (
                  <tr key={sess.attempt_id} className="hover:bg-slate-50/70 transition-colors">
                    {/* Student Info */}
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-slate-900">{sess.student_name}</div>
                      <div className="text-slate-500 text-[11px] font-mono">{sess.student_email}</div>
                      <div className="text-blue-700 text-[10px] font-mono font-semibold">{sess.registration_id}</div>
                    </td>

                    {/* Examination Title */}
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-slate-800 truncate max-w-xs">
                        {sess.exam_title}
                      </div>
                      <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                        {sess.exam_type}
                      </span>
                    </td>

                    {/* Status */}
                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full font-bold text-[11px] border ${
                          sess.status === 'terminated'
                            ? 'bg-rose-50 text-rose-800 border-rose-300'
                            : sess.status === 'completed'
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                            : 'bg-blue-50 text-blue-800 border-blue-300'
                        }`}
                      >
                        {sess.status === 'terminated' ? (
                          <Lock className="w-3 h-3 text-rose-600" />
                        ) : sess.status === 'completed' ? (
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        ) : (
                          <Clock className="w-3 h-3 text-blue-600" />
                        )}
                        <span className="capitalize">{sess.status.replace('_', ' ')}</span>
                      </span>
                    </td>

                    {/* Violations Count */}
                    <td className="py-3.5 px-4 font-mono">
                      <span
                        className={`inline-block px-2.5 py-0.5 rounded-md font-bold text-xs ${
                          sess.violations_count >= 4
                            ? 'bg-rose-600 text-white animate-pulse'
                            : sess.violations_count >= 2
                            ? 'bg-amber-600 text-white'
                            : sess.violations_count === 1
                            ? 'bg-amber-50 text-amber-900 border border-amber-300 font-semibold'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {sess.violations_count} / 3 warnings
                      </span>
                    </td>

                    {/* Remaining Time */}
                    <td className="py-3.5 px-4 font-mono text-slate-700 font-semibold">
                      {sess.status === 'in_progress' ? formatRemaining(sess.remaining_seconds) : '—'}
                    </td>

                    {/* Actions */}
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end space-x-1.5">
                        {sess.violations_count > 0 && (
                          <button
                            onClick={() => handleOpenDecision(sess, 'dismiss_false_positive')}
                            className="px-2.5 py-1 rounded-lg bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-[11px] font-bold shadow-2xs transition-colors cursor-pointer"
                            title="Dismiss false positive warning"
                          >
                            Dismiss
                          </button>
                        )}

                        {sess.status === 'terminated' && (
                          <button
                            onClick={() => handleOpenDecision(sess, 'restore_attempt')}
                            className="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 text-[11px] font-bold shadow-2xs transition-colors cursor-pointer"
                            title="Unlock and restore student attempt"
                          >
                            Restore
                          </button>
                        )}

                        <button
                          onClick={() => handleOpenDecision(sess, 'authorize_retake')}
                          className="px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-300 text-[11px] font-bold shadow-2xs transition-colors cursor-pointer"
                          title="Authorize clean retake attempt"
                        >
                          Retake
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    No active examination sessions running at this time.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Security Audit Log Stream */}
      <div className="bg-white border border-slate-200 rounded-3xl p-5 space-y-3 shadow-xs">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
          Recent Security Violation Audit Log (Last 100 Events)
        </h3>
        <div className="bg-slate-50 rounded-2xl border border-slate-200 divide-y divide-slate-200/80 max-h-56 overflow-y-auto font-mono text-xs">
          {data?.recent_events && data.recent_events.length > 0 ? (
            data.recent_events.map((ev) => (
              <div key={ev.id} className="p-3 flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <span className="text-slate-400 font-medium">
                    {new Date(ev.server_timestamp).toLocaleTimeString()}
                  </span>
                  <span className="text-slate-900 font-bold">{ev.student_name}</span>
                  <span className="text-rose-700 font-bold uppercase">[{ev.event_type}]</span>
                  <span className="text-slate-600 text-[11px]">{ev.details}</span>
                </div>
                <div className="text-[11px] text-slate-500 font-medium">
                  Violation #{ev.violation_count} ({ev.action_taken})
                </div>
              </div>
            ))
          ) : (
            <div className="p-4 text-center text-slate-400 font-sans">No security incidents logged.</div>
          )}
        </div>
      </div>

      {/* Administrative Decision Modal */}
      {decisionModalOpen && selectedSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white border border-slate-200 max-w-md w-full rounded-3xl shadow-2xl p-6 text-slate-800 select-none space-y-4">
            <h3 className="text-base font-bold text-slate-900">Record Administrative Examination Decision</h3>
            <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 text-xs font-mono space-y-1">
              <div>Candidate: <strong className="text-slate-900">{selectedSession.student_name}</strong> ({selectedSession.registration_id})</div>
              <div>Examination: <strong className="text-slate-900">{selectedSession.exam_title}</strong></div>
              <div>Action: <span className="text-blue-700 font-bold uppercase">{decisionAction.replace('_', ' ')}</span></div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">
                Administrative Justification / Official Note:
              </label>
              <textarea
                value={decisionReason}
                onChange={(e) => setDecisionReason(e.target.value)}
                placeholder="State the official rationale (e.g., student verified network reconnection via proctor hotline, authorized clean reset)..."
                rows={3}
                className="w-full bg-white border border-slate-200 text-slate-900 p-2.5 rounded-xl text-xs focus:outline-none focus:border-blue-500 resize-none font-sans shadow-2xs"
              />
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                onClick={() => setDecisionModalOpen(false)}
                disabled={isSubmittingDecision}
                className="py-2 px-3.5 rounded-xl text-xs font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitDecision}
                disabled={isSubmittingDecision}
                className="py-2 px-4 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition-all cursor-pointer"
              >
                {isSubmittingDecision ? 'Submitting...' : 'Confirm Decision'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
