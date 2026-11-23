import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ShieldCheck,
  Award,
  CheckCircle2,
  AlertCircle,
  Clock,
  ExternalLink,
  Download,
  Copy,
  QrCode,
  Share2,
  Lock,
  Eye,
  EyeOff,
  RefreshCw,
  Sparkles,
  ChevronRight,
  BookOpen,
  FileCheck,
  Check,
  Building,
  GraduationCap,
  Calendar,
  AlertTriangle,
  FileText,
} from 'lucide-react';
import { Card, CardHeader } from '../../../components/common/Card';
import { Button } from '../../../components/common/Button';
import { parseServerDate, formatTimerSeconds } from '../../../utils/dateUtils';
import { Badge } from '../../../components/common/Badge';
import { Modal } from '../../../components/common/Modal';
import { ClayLoader } from '../../../components/common/ClayLoader';
import { useAuth } from '../../../context/AuthContext';
import { useToast } from '../../../context/ToastContext';
import {
  verificationService,
  type StudentVerificationStatusOverview,
  type StudentCredentialResponse,
  type StartAssessmentResponse,
  type AssessmentQuestionOut,
  type SubmitAssessmentResponse,
} from '../../../services/verificationService';

export const CollegeVerificationPage: React.FC = () => {
  const { user } = useAuth();
  const { success, error, info } = useToast();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<StudentVerificationStatusOverview | null>(null);
  const [activeTab, setActiveTab] = useState<'assignments' | 'assessments'>('assignments');

  // Assessment Modal State
  const [assessmentModalOpen, setAssessmentModalOpen] = useState(false);
  const [startingAssessment, setStartingAssessment] = useState(false);
  const [assessmentSession, setAssessmentSession] = useState<StartAssessmentResponse | null>(null);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, number>>({});
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [submittingAssessment, setSubmittingAssessment] = useState(false);
  const [assessmentResult, setAssessmentResult] = useState<SubmitAssessmentResponse | null>(null);
  const [resultModalOpen, setResultModalOpen] = useState(false);

  // Resume snippet modal
  const [resumeSnippetModalOpen, setResumeSnippetModalOpen] = useState(false);
  const [activeCredentialForModal, setActiveCredentialForModal] = useState<StudentCredentialResponse | null>(null);
  const [togglingVisibility, setTogglingVisibility] = useState(false);

  const loadOverview = useCallback(async () => {
    try {
      setLoading(true);
      const data = await verificationService.getVerificationStatus();
      setOverview(data);
    } catch (err: any) {
      error('Failed to load verification status', err.message);
    } finally {
      setLoading(false);
    }
  }, [error]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  // Synchronized countdown timer for active assessment
  useEffect(() => {
    if (!assessmentModalOpen || !assessmentSession) return;

    let serverRemaining = assessmentSession.remaining_seconds ?? assessmentSession.duration_seconds ?? 300;
    if (assessmentSession.expires_at) {
      const expiry = parseServerDate(assessmentSession.expires_at).getTime();
      const now = Date.now();
      const diff = Math.floor((expiry - now) / 1000);
      if (diff > 0 && diff <= (assessmentSession.duration_seconds || 300) + 60) {
        serverRemaining = diff;
      }
    }
    setRemainingSeconds(serverRemaining);

    const interval = setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          info('Time Limit Expired', 'Assessment time is up. Submitting completed answers.');
          void handleAutoSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [assessmentModalOpen, assessmentSession]);

  const handleStartAssessment = async (level: 'LEVEL_1_BLUE' | 'LEVEL_2_GREEN') => {
    try {
      setStartingAssessment(true);
      const session = await verificationService.startAssessment(
        level,
        level === 'LEVEL_1_BLUE' ? 'Core Web & Software Engineering' : 'Advanced Full-Stack & System Design'
      );
      setAssessmentSession(session);
      setSelectedAnswers({});
      setCurrentQuestionIndex(0);
      const initialRemaining = session.remaining_seconds ?? session.duration_seconds ?? (level === 'LEVEL_1_BLUE' ? 300 : 600);
      setRemainingSeconds(initialRemaining);
      setAssessmentModalOpen(true);
    } catch (err: any) {
      error('Could not start assessment', err.message);
    } finally {
      setStartingAssessment(false);
    }
  };

  const handleSelectOption = (questionId: string, optionIdx: number) => {
    setSelectedAnswers((prev) => ({ ...prev, [questionId]: optionIdx }));
  };

  const handleManualSubmit = async () => {
    if (!assessmentSession) return;
    const answeredCount = Object.keys(selectedAnswers).length;
    const totalCount = assessmentSession.questions.length;

    if (answeredCount < totalCount) {
      if (!window.confirm(`You have answered ${answeredCount} of ${totalCount} questions. Submit now?`)) {
        return;
      }
    }

    await executeSubmission();
  };

  const handleAutoSubmit = async () => {
    if (!assessmentSession || submittingAssessment) return;
    await executeSubmission();
  };

  const executeSubmission = async () => {
    if (!assessmentSession) return;
    setSubmittingAssessment(true);
    try {
      const answersPayload = Object.entries(selectedAnswers).map(([qid, optIdx]) => ({
        question_id: qid,
        selected_option: optIdx,
      }));

      const res = await verificationService.submitAssessment(assessmentSession.attempt_id, answersPayload);
      setAssessmentResult(res);
      setAssessmentModalOpen(false);
      setResultModalOpen(true);

      if (res.passed) {
        success('Verification Granted!', res.feedback);
      } else {
        info('Assessment Completed', res.feedback);
      }

      await loadOverview();
    } catch (err: any) {
      error('Submission failed', err.message);
    } finally {
      setSubmittingAssessment(false);
    }
  };

  const handleDownloadPdf = (credentialId: string) => {
    const url = verificationService.getCertificatePdfUrl(credentialId);
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleCopyLink = (cred: StudentCredentialResponse) => {
    const origin = window.location.origin;
    const fullUrl = `${origin}/verify/${encodeURIComponent(cred.credential_id)}`;
    navigator.clipboard.writeText(fullUrl);
    success('Verification Link Copied', fullUrl);
  };

  const handleToggleVisibility = async (cred: StudentCredentialResponse) => {
    try {
      setTogglingVisibility(true);
      const newVis = !cred.public_visibility;
      await verificationService.toggleVisibility(cred.credential_id, newVis);
      success('Visibility Updated', newVis ? 'Credential is now publicly verifiable.' : 'Credential set to private.');
      await loadOverview();
    } catch (err: any) {
      error('Failed to update visibility', err.message);
    } finally {
      setTogglingVisibility(false);
    }
  };

  const formatTimer = (seconds: number) => {
    return formatTimerSeconds(seconds);
  };

  const activeCred = overview?.active_credential;
  const isGreenActive = activeCred?.badge_type === 'GREEN_FULLY_VERIFIED';
  const isBlueActive = activeCred?.badge_type === 'BLUE_VERIFIED' && !isGreenActive;

  if (loading && !overview) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <ClayLoader label="Loading Digital Credential Center..." subtext="Connecting to MongoDB Atlas Credential Authority" />
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-12">
      {/* 1. Header Banner & Identity Card */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-6 sm:p-8 text-white shadow-xl">
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-3 max-w-2xl">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-white/10 text-orange-400 border border-white/10">
                <ShieldCheck className="w-4 h-4 text-orange-400" /> Digital Credential Authority
              </span>
              {(overview?.certification_percentage ?? 0) === 100 ? (
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> 100% Green Fully Verified Unlocked
                </span>
              ) : (overview?.certification_percentage ?? 0) === 50 ? (
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                  <CheckCircle2 className="w-3.5 h-3.5 text-blue-400" /> 50% Blue College Verified Unlocked
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  <AlertCircle className="w-3.5 h-3.5 text-amber-400" /> Prerequisites Pending (Locked)
                </span>
              )}
            </div>

            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              College-Verified Student Identity & Credentials
            </h1>
            <p className="text-sm text-slate-300 leading-relaxed">
              Official institutional certification endorsed by{' '}
              <strong className="text-white">{overview?.college_name || user?.college || 'your institution'}</strong>.
              Earn permanent cryptographically sealed credentials for elite placement drives.
            </p>
            <p className="text-xs text-orange-300/90 font-medium">
              {overview?.eligibility_message || 'Complete all assignments and prove all assessments to unlock certification.'}
            </p>
          </div>

          <div className="flex flex-col items-center justify-center p-4 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm min-w-[160px]">
            <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Verified Trust Score</span>
            <span className="text-3xl font-black text-orange-400 mt-1">{overview?.trust_score ?? 0}%</span>
            <span className="text-[11px] text-slate-400 mt-1">
              {(overview?.certification_percentage ?? 0) === 100
                ? '★ 100% Fully Verified'
                : (overview?.certification_percentage ?? 0) === 50
                  ? '★ 50% Verified'
                  : 'Prerequisites Pending'}
            </span>
          </div>
        </div>
      </div>

      {/* 2. Prerequisite Performance Audit Matrix (All Assignments & Assessments) */}
      <Card className="border border-slate-200 overflow-hidden shadow-xs">
        <div className="p-6 border-b border-slate-100 bg-slate-50/50">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900">
                  Comprehensive Competency Audit & Performance Matrix
                </h2>
                <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-slate-200 text-slate-700">
                  {(overview?.assignment_items?.length || 0) + (overview?.assessment_items?.length || 0)} Total Items
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5 font-medium">
                Complete all assignments and assessments with <strong>Blue (≥60%)</strong> or <strong>Green (≥80%)</strong>.
                If all items are <strong>Green</strong>, unlock the <strong>100% Fully Verified Credential</strong>.
                If any items are <strong>Blue</strong>, unlock the <strong>50% Verified Credential</strong>.
              </p>
            </div>

            {/* Color summary badges */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                {overview?.green_count ?? 0} Green (≥80%)
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
                <span className="w-2 h-2 rounded-full bg-blue-500" />
                {overview?.blue_count ?? 0} Blue (60–79%)
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold bg-slate-100 text-slate-600 border border-slate-200">
                <span className="w-2 h-2 rounded-full bg-slate-400" />
                {overview?.incomplete_count ?? 0} Pending (&lt;60%)
              </span>
            </div>
          </div>

          {/* Tab Selector */}
          <div className="flex items-center gap-3 mt-5 pt-3 border-t border-slate-200/80">
            <button
              onClick={() => setActiveTab('assignments')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${activeTab === 'assignments'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                }`}
            >
              <FileCheck className="w-3.5 h-3.5" />
              Assignments ({overview?.completed_assignments ?? 0} / {overview?.total_assignments ?? 0} Completed)
            </button>
            <button
              onClick={() => setActiveTab('assessments')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${activeTab === 'assessments'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                }`}
            >
              <GraduationCap className="w-3.5 h-3.5" />
              Skill Assessments ({overview?.passed_assessments ?? 0} / {overview?.total_assessments ?? 0} Proven)
            </button>
          </div>
        </div>

        {/* Tab Content List */}
        <div className="p-6">
          {activeTab === 'assignments' ? (
            overview?.assignment_items && overview.assignment_items.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {overview.assignment_items.map((item) => (
                  <div
                    key={item.id}
                    className="p-4 rounded-2xl bg-white border border-slate-200 hover:border-slate-300 transition-all flex flex-col justify-between gap-3 shadow-2xs"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="text-xs font-bold text-slate-900 leading-snug line-clamp-2">{item.title}</h4>
                        {item.color === 'GREEN' && (
                          <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0 flex items-center gap-1">
                            <Check className="w-3 h-3 text-emerald-600" /> Green (≥80%)
                          </span>
                        )}
                        {item.color === 'BLUE' && (
                          <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 shrink-0 flex items-center gap-1">
                            <Check className="w-3 h-3 text-blue-600" /> Blue (60–79%)
                          </span>
                        )}
                        {item.color === 'INCOMPLETE' && (
                          <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200 shrink-0">
                            Incomplete (&lt;60%)
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                          {item.skill}
                        </span>
                        <span className="text-[11px] text-slate-500 font-mono">
                          Score: <strong>{item.percentage}%</strong> ({item.score}/{item.max_score} pts)
                        </span>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                      <span className="text-[10px] text-slate-400 capitalize">Status: {item.status}</span>
                      {item.color === 'GREEN' ? (
                        <span className="text-[11px] font-bold text-emerald-600 flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" /> 100% Eligible
                        </span>
                      ) : (
                        <Button
                          variant={item.color === 'BLUE' ? 'white' : 'primary'}
                          size="sm"
                          className="text-xs font-bold"
                          onClick={() => navigate(`/exam/assignment/${item.id}/readiness`)}
                        >
                          {item.color === 'BLUE' ? 'Improve to Green (≥80%)' : 'Attempt Assignment'}
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400 py-6 text-center">No assignments configured.</p>
            )
          ) : (
            overview?.assessment_items && overview.assessment_items.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {overview.assessment_items.map((item) => (
                  <div
                    key={item.id}
                    className="p-4 rounded-2xl bg-white border border-slate-200 hover:border-slate-300 transition-all flex flex-col justify-between gap-3 shadow-2xs"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="text-xs font-bold text-slate-900 leading-snug line-clamp-2">{item.title}</h4>
                        {item.color === 'GREEN' && (
                          <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0 flex items-center gap-1">
                            <Check className="w-3 h-3 text-emerald-600" /> Green (≥80%)
                          </span>
                        )}
                        {item.color === 'BLUE' && (
                          <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 shrink-0 flex items-center gap-1">
                            <Check className="w-3 h-3 text-blue-600" /> Blue (60–79%)
                          </span>
                        )}
                        {item.color === 'INCOMPLETE' && (
                          <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200 shrink-0">
                            Incomplete (&lt;60%)
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                          {item.skill}
                        </span>
                        <span className="text-[11px] text-slate-500 font-mono">
                          Score: <strong>{item.percentage}%</strong> ({item.score}/{item.max_score} pts)
                        </span>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                      <span className="text-[10px] text-slate-400 capitalize">Status: {item.status}</span>
                      {item.color === 'GREEN' ? (
                        <span className="text-[11px] font-bold text-emerald-600 flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" /> 100% Eligible
                        </span>
                      ) : (
                        <Button
                          variant={item.color === 'BLUE' ? 'white' : 'primary'}
                          size="sm"
                          className="text-xs font-bold"
                          onClick={() => navigate(`/exam/assessment/${item.id}/readiness`)}
                        >
                          {item.color === 'BLUE' ? 'Improve to Green (≥80%)' : 'Attempt Assessment'}
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400 py-6 text-center">No assessments found.</p>
            )
          )}
        </div>
      </Card>

      {/* 3. Verification Levels (Level 1 Blue 50% vs Level 2 Green 100%) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Level 1: Blue Verified (50% Certification) */}
        <Card
          className={`relative overflow-hidden transition-all border-2 ${isBlueActive ? 'border-blue-500 shadow-md ring-2 ring-blue-100' : 'border-slate-200'
            }`}
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-blue-50 rounded-bl-full -z-0 opacity-60" />
          <div className="relative z-10 p-6 space-y-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-200 text-blue-600 flex items-center justify-center shadow-xs">
                  <ShieldCheck className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-blue-600">Level 1</span>
                    {isBlueActive && <Badge variant="brand" size="sm">Active Badge</Badge>}
                    {(overview?.certification_percentage ?? 0) >= 50 && !isBlueActive && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-700">
                        Unlocked
                      </span>
                    )}
                  </div>
                  <h3 className="text-lg font-bold text-slate-900">Blue College Verified (50% Credential)</h3>
                </div>
              </div>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
                5-Min Test
              </span>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Awarded when <strong>all assignments and assessments are completed</strong> with Blue (≥60%) or Green (≥80%).
              Awards the official <strong>50% College-Verified Credential</strong>.
            </p>

            <ul className="text-xs text-slate-600 space-y-2 pt-1 font-medium">
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />
                <span>Prerequisite: All assignments & assessments completed with Blue or Green</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />
                <span>Certification Assessment: 5 questions in 300s (Passing: 70%)</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />
                <span>Includes verifiable serial number & shareable college credential</span>
              </li>
            </ul>

            {/* Lock / Unlock Banner */}
            {(overview?.certification_percentage ?? 0) < 50 && (
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 flex items-start gap-2.5">
                <Lock className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                <span>
                  <strong>Locked:</strong> You have {overview?.incomplete_count ?? 0} pending/incomplete item(s).
                  Complete all items in the matrix above with Blue or Green to unlock this credential.
                </span>
              </div>
            )}

            <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
              <span className="text-xs text-slate-500 font-medium">5 Questions • 300 Seconds</span>
              <Button
                variant={isBlueActive ? 'secondary' : 'primary'}
                size="sm"
                onClick={() => handleStartAssessment('LEVEL_1_BLUE')}
                disabled={startingAssessment || ((overview?.certification_percentage ?? 0) < 50 && !isBlueActive)}
                className="font-bold text-xs"
              >
                {isBlueActive
                  ? 'Retake 5-Min Test'
                  : (overview?.certification_percentage ?? 0) >= 50
                    ? 'Start 5-Min Assessment'
                    : 'Locked — Complete Prerequisites'}
              </Button>
            </div>
          </div>
        </Card>

        {/* Level 2: Green Fully Verified (100% Certification) */}
        <Card
          className={`relative overflow-hidden transition-all border-2 ${isGreenActive ? 'border-emerald-500 shadow-md ring-2 ring-emerald-100' : 'border-slate-200'
            }`}
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-50 rounded-bl-full -z-0 opacity-60" />
          <div className="relative z-10 p-6 space-y-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center shadow-xs">
                  <Award className="w-6 h-6 text-emerald-600" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-emerald-600">Level 2</span>
                    {isGreenActive && <Badge variant="success" size="sm">Highest Honor</Badge>}
                    {(overview?.certification_percentage ?? 0) === 100 && !isGreenActive && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700">
                        100% Green Unlocked
                      </span>
                    )}
                  </div>
                  <h3 className="text-lg font-bold text-slate-900">Green Fully Verified (100% Credential)</h3>
                </div>
              </div>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                10-Min Comprehensive
              </span>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Available <strong>ONLY IF ALL assignments and assessments are GREEN (≥80%)</strong>.
              Zero Blue or Incomplete items allowed. Awards the prestigious <strong>100% College Fully Verified Credential</strong>.
            </p>

            <ul className="text-xs text-slate-600 space-y-2 pt-1 font-medium">
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Strict Prerequisite: 100% of all assignments & assessments must be GREEN (≥80%)</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>High-resolution PDF certificate with Cryptographic QR & HMAC Assertion</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Highest honor priority placement filter for Tier-1 corporate recruiters</span>
              </li>
            </ul>

            {/* Lock / Upgrade Banner */}
            {(overview?.certification_percentage ?? 0) < 100 && (
              <div className="p-3 rounded-xl bg-amber-50/70 border border-amber-200 text-xs text-amber-900 flex items-start gap-2.5">
                <Lock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>
                  {(overview?.certification_percentage ?? 0) === 50 ? (
                    <>
                      <strong>Upgrade Required:</strong> You have {overview?.blue_count ?? 0} Blue item(s).
                      Retake the Blue items above and score ≥80% on all of them to unlock the 100% Fully Verified Credential!
                    </>
                  ) : (
                    <>
                      <strong>Locked:</strong> Requires 100% Green on all items.
                      Currently pending: {overview?.incomplete_count ?? 0} incomplete and {overview?.blue_count ?? 0} blue item(s).
                    </>
                  )}
                </span>
              </div>
            )}

            <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
              <span className="text-xs text-slate-500 font-medium">8 Questions • 600 Seconds</span>
              <Button
                variant={isGreenActive ? 'secondary' : 'primary'}
                size="sm"
                onClick={() => handleStartAssessment('LEVEL_2_GREEN')}
                disabled={startingAssessment || ((overview?.certification_percentage ?? 0) < 100 && !isGreenActive)}
                className={`font-bold text-xs ${(overview?.certification_percentage ?? 0) === 100 && !isGreenActive
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  : ''
                  }`}
              >
                {isGreenActive
                  ? 'Retake 10-Min Test'
                  : (overview?.certification_percentage ?? 0) === 100
                    ? 'Start 10-Min Assessment'
                    : 'Locked — Requires 100% All-Green'}
              </Button>
            </div>
          </div>
        </Card>
      </div>

      {/* 3. Active Digital Certificate & Credential Showcase */}
      {activeCred && (
        <Card className="overflow-hidden border border-slate-200 shadow-md">
          <CardHeader
            title="Official Digital Credential & Certificate"
            subtitle={`Authenticated under ${overview?.college_name || 'Placement Intelligence Authority'}`}
            action={
              <Badge variant={isGreenActive ? 'success' : 'brand'}>
                {activeCred.title} ({activeCred.score}%)
              </Badge>
            }
          />
          <div className="p-6 space-y-6">
            {/* Visual Certificate Preview Card */}
            <div
              className={`p-6 sm:p-8 rounded-2xl border-4 ${isGreenActive ? 'border-emerald-600 bg-emerald-50/40' : 'border-blue-600 bg-blue-50/40'
                } relative overflow-hidden`}
            >
              <div className="max-w-3xl mx-auto space-y-5 text-center">
                <div className="flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-500">
                  <Building className="w-4 h-4" /> {activeCred.college}
                </div>

                <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                  CERTIFICATE OF VERIFIED COMPETENCY
                </h2>

                <p className="text-xs text-slate-600">This certifies that</p>

                <p className="text-2xl font-bold text-slate-900 underline decoration-amber-500 decoration-2 underline-offset-8">
                  {activeCred.student_name}
                </p>

                <p className="text-xs text-slate-700 max-w-xl mx-auto leading-relaxed">
                  has successfully demonstrated evaluated proficiency in{' '}
                  <strong className="text-slate-900">{activeCred.skill}</strong> with an evaluated score of{' '}
                  <strong className="text-slate-900">{activeCred.score}%</strong>.
                </p>

                {/* Metadata Pills */}
                <div className="flex flex-wrap items-center justify-center gap-4 text-xs font-mono text-slate-600 pt-2">
                  <div className="bg-white/80 px-3 py-1 rounded-lg border border-slate-200">
                    ID: <strong>{activeCred.credential_id}</strong>
                  </div>
                  <div className="bg-white/80 px-3 py-1 rounded-lg border border-slate-200">
                    Level: <strong>{activeCred.badge_type}</strong>
                  </div>
                  <div className="bg-white/80 px-3 py-1 rounded-lg border border-slate-200">
                    Issued: <strong>{activeCred.issued_at.split('T')[0]}</strong>
                  </div>
                </div>
              </div>
            </div>

            {/* Actions Rail */}
            <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
              <div className="flex flex-wrap items-center gap-2.5">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => handleDownloadPdf(activeCred.credential_id)}
                >
                  <Download className="w-4 h-4 mr-1.5" /> Download PDF Certificate
                </Button>

                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => handleCopyLink(activeCred)}
                >
                  <Copy className="w-4 h-4 mr-1.5" /> Copy Verification Link
                </Button>

                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setActiveCredentialForModal(activeCred);
                    setResumeSnippetModalOpen(true);
                  }}
                >
                  <FileText className="w-4 h-4 mr-1.5" /> Add to Resume
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => window.open(`/verify/${activeCred.credential_id}`, '_blank')}
                >
                  <ExternalLink className="w-4 h-4 mr-1.5" /> Preview Public View
                </Button>
              </div>

              {/* Visibility Switch */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 font-medium">Public Verification:</span>
                <button
                  type="button"
                  onClick={() => handleToggleVisibility(activeCred)}
                  disabled={togglingVisibility}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold transition-all border ${activeCred.public_visibility
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                    : 'bg-slate-100 text-slate-600 border-slate-300'
                    }`}
                >
                  {activeCred.public_visibility ? (
                    <>
                      <Eye className="w-3.5 h-3.5 text-emerald-600" /> Public
                    </>
                  ) : (
                    <>
                      <EyeOff className="w-3.5 h-3.5 text-slate-500" /> Private
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* 4. Credential & Assessment History Timeline */}
      {overview && overview.history.length > 0 && (
        <Card>
          <CardHeader
            title="Credential Verification History"
            subtitle="Immutable record of awarded, upgraded, and archived competency certificates"
          />
          <div className="divide-y divide-slate-100">
            {overview.history.map((h) => (
              <div key={h.credential_id} className="p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${h.badge_type === 'GREEN_FULLY_VERIFIED'
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-blue-100 text-blue-700'
                      }`}
                  >
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-slate-900">{h.title}</span>
                      {h.is_superseded && <Badge variant="neutral" size="sm">Superseded by Level 2</Badge>}
                      {!h.is_superseded && h.status === 'ACTIVE' && (
                        <Badge variant="success" size="sm">Active</Badge>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {h.skill} • Evaluated Score: <strong>{h.score}%</strong> • Issued {h.issued_at.split('T')[0]}
                    </p>
                    <p className="text-[11px] font-mono text-slate-400 mt-1">
                      Credential ID: {h.credential_id}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDownloadPdf(h.credential_id)}
                  >
                    <Download className="w-3.5 h-3.5 mr-1" /> PDF
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleCopyLink(h)}
                  >
                    <Copy className="w-3.5 h-3.5 mr-1" /> Copy Link
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* 5. Live Assessment Modal */}
      <Modal
        isOpen={assessmentModalOpen}
        onClose={() => {
          if (window.confirm('Are you sure you want to exit? Your progress will be lost and timer is still running.')) {
            setAssessmentModalOpen(false);
          }
        }}
        title={
          assessmentSession?.level === 'LEVEL_1_BLUE'
            ? 'Level 1: 5-Minute Competency Assessment'
            : 'Level 2: 10-Minute Comprehensive Assessment'
        }
        size="lg"
      >
        {assessmentSession && (
          <div className="space-y-6">
            {/* Countdown Timer Bar */}
            <div className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-900 text-white font-mono text-xs">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-orange-400 animate-pulse" />
                <span>Server-Tracked Timer</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-slate-400">Time Remaining:</span>
                <span
                  className={`text-base font-bold ${remainingSeconds < 60 ? 'text-rose-400 animate-pulse' : 'text-orange-400'
                    }`}
                >
                  {formatTimer(remainingSeconds)}
                </span>
              </div>
            </div>

            {/* Questions Stepper */}
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
                <span>
                  Question {currentQuestionIndex + 1} of {assessmentSession.questions.length}
                </span>
                <span>
                  Passing Threshold: {assessmentSession.passing_threshold_percent}%
                </span>
              </div>

              {/* Current Question */}
              {assessmentSession.questions[currentQuestionIndex] && (
                <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-4">
                  <p className="font-bold text-sm text-slate-900 leading-relaxed">
                    {assessmentSession.questions[currentQuestionIndex].text}
                  </p>

                  {/* Options */}
                  <div className="space-y-2.5 pt-2">
                    {assessmentSession.questions[currentQuestionIndex].options?.map((opt, oIdx) => {
                      const qid = assessmentSession.questions[currentQuestionIndex].question_id;
                      const isSelected = selectedAnswers[qid] === oIdx;

                      return (
                        <button
                          key={oIdx}
                          type="button"
                          onClick={() => handleSelectOption(qid, oIdx)}
                          className={`w-full text-left p-3.5 rounded-xl text-xs font-medium transition-all flex items-start gap-3 border ${isSelected
                            ? 'bg-orange-50/80 border-orange-500 text-orange-950 font-bold shadow-sm'
                            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100/70'
                            }`}
                        >
                          <span
                            className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] shrink-0 ${isSelected
                              ? 'bg-orange-500 text-white font-bold'
                              : 'bg-slate-200 text-slate-600'
                              }`}
                          >
                            {String.fromCharCode(65 + oIdx)}
                          </span>
                          <span className="flex-1 leading-relaxed">{opt}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Controls */}
            <div className="flex items-center justify-between pt-4 border-t border-slate-200">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setCurrentQuestionIndex((prev) => Math.max(0, prev - 1))}
                disabled={currentQuestionIndex === 0}
              >
                Previous
              </Button>

              <div className="flex items-center gap-2">
                {currentQuestionIndex < assessmentSession.questions.length - 1 ? (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => setCurrentQuestionIndex((prev) => prev + 1)}
                  >
                    Next Question
                  </Button>
                ) : (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleManualSubmit}
                    disabled={submittingAssessment}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    {submittingAssessment ? 'Evaluating...' : 'Submit Assessment'}
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* 6. Assessment Result Modal */}
      <Modal
        isOpen={resultModalOpen}
        onClose={() => setResultModalOpen(false)}
        title="Assessment Result & Evaluation"
        size="md"
      >
        {assessmentResult && (
          <div className="space-y-6 text-center py-4">
            <div
              className={`w-16 h-16 rounded-full mx-auto flex items-center justify-center ${assessmentResult.passed ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'
                }`}
            >
              {assessmentResult.passed ? (
                <CheckCircle2 className="w-8 h-8" />
              ) : (
                <AlertCircle className="w-8 h-8" />
              )}
            </div>

            <div className="space-y-2">
              <h3 className="text-xl font-bold text-slate-900">
                {assessmentResult.passed ? 'Assessment Passed!' : 'Threshold Not Met'}
              </h3>
              <p className="text-xs text-slate-600 max-w-sm mx-auto">
                {assessmentResult.feedback}
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 max-w-xs mx-auto grid grid-cols-2 gap-3 text-left text-xs">
              <div>
                <span className="text-slate-500">Your Score:</span>
                <p className="text-base font-bold text-slate-900">{assessmentResult.percentage}%</p>
              </div>
              <div>
                <span className="text-slate-500">Required:</span>
                <p className="text-base font-bold text-slate-900">{assessmentResult.passing_threshold_percent}%</p>
              </div>
            </div>

            {assessmentResult.credential_id && (
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-mono text-emerald-800">
                Awarded Credential ID: <strong>{assessmentResult.credential_id}</strong>
              </div>
            )}

            <div className="pt-2 flex items-center justify-center gap-3">
              <Button
                variant="primary"
                size="sm"
                onClick={() => setResultModalOpen(false)}
              >
                View Credential Center
              </Button>
              {assessmentResult.credential_id && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => handleDownloadPdf(assessmentResult.credential_id!)}
                >
                  <Download className="w-4 h-4 mr-1" /> PDF
                </Button>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* 7. Resume Snippet Modal */}
      <Modal
        isOpen={resumeSnippetModalOpen}
        onClose={() => setResumeSnippetModalOpen(false)}
        title="Add Credential to Resume & LinkedIn"
        size="md"
      >
        {activeCredentialForModal && (
          <div className="space-y-4 py-2">
            <p className="text-xs text-slate-600">
              Copy and paste this standardized institutional citation into your resume's Certifications or Education section:
            </p>

            <div className="p-4 rounded-xl bg-slate-900 text-slate-100 font-mono text-xs space-y-1 relative group">
              <p className="font-bold text-orange-400">
                {activeCredentialForModal.title} — {activeCredentialForModal.skill}
              </p>
              <p>Verification Level: {activeCredentialForModal.level === 'LEVEL_2_GREEN' ? 'Green Fully Verified' : 'Blue Verified'}</p>
              <p>Assessment Score: {activeCredentialForModal.score}%</p>
              <p>Issued By: {activeCredentialForModal.college}</p>
              <p>Credential ID: {activeCredentialForModal.credential_id}</p>
              <p>Verification URL: {window.location.origin}/verify/{activeCredentialForModal.credential_id}</p>
            </div>

            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                const text = `${activeCredentialForModal.title} — ${activeCredentialForModal.skill}\nVerification Level: ${activeCredentialForModal.level}\nAssessment Score: ${activeCredentialForModal.score}%\nIssued By: ${activeCredentialForModal.college}\nCredential ID: ${activeCredentialForModal.credential_id}\nVerification URL: ${window.location.origin}/verify/${activeCredentialForModal.credential_id}`;
                navigator.clipboard.writeText(text);
                success('Copied to Clipboard', 'Resume entry text copied.');
                setResumeSnippetModalOpen(false);
              }}
              className="w-full"
            >
              <Copy className="w-4 h-4 mr-1.5" /> Copy Resume Entry Text
            </Button>
          </div>
        )}
      </Modal>
    </div>
  );
};
