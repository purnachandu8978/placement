import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Clock,
  Bookmark,
  Terminal,
  Play,
  Send,
  CheckCircle2,
  XCircle,
  ArrowLeft,
  ArrowRight,
  ShieldCheck,
  AlertTriangle,
  Trophy,
  Award,
  History,
  Lock,
  Cpu,
  RotateCcw,
  Maximize2,
  Minimize2,
  Eye,
  FileCode2,
  Check,
  AlertOctagon,
} from 'lucide-react';
import { Card } from '../../../components/common/Card';
import { Button } from '../../../components/common/Button';
import { Badge } from '../../../components/common/Badge';
import { Modal } from '../../../components/common/Modal';
import { ClayLoader } from '../../../components/common/ClayLoader';
import { useAuth } from '../../../context/AuthContext';
import { useToast } from '../../../context/ToastContext';
import { useStudentData } from '../../../context/StudentDataContext';
import { assessmentService } from '../../../services/assessmentService';
import type {
  Assessment,
  AssessmentSubmission,
  CodeExecutionResponse,
  CodeSubmissionHistoryItem,
  CodingLanguage,
  QuestionCoding,
  QuestionMCQ,
} from '../../../types';

const LANGUAGE_LABELS: Record<CodingLanguage, string> = {
  python: 'Python 3',
  javascript: 'JavaScript (Node)',
  java: 'Java 17',
  cpp: 'C++17',
};

const STATUS_STYLES: Record<string, { label: string; badge: 'success' | 'warning' | 'danger' | 'brand' }> = {
  accepted: { label: 'Accepted', badge: 'success' },
  ok: { label: 'Executed', badge: 'success' },
  wrong_answer: { label: 'Wrong Answer', badge: 'warning' },
  compilation_error: { label: 'Compilation Error', badge: 'danger' },
  runtime_error: { label: 'Runtime Error', badge: 'danger' },
  time_limit_exceeded: { label: 'Time Limit Exceeded', badge: 'danger' },
  memory_limit_exceeded: { label: 'Memory Limit Exceeded', badge: 'danger' },
};

function codeKey(questionId: string, lang: CodingLanguage): string {
  return `${questionId}::${lang}`;
}

export const AssessmentTakePage: React.FC = () => {
  const { id, testId } = useParams<{ id?: string; testId?: string }>();
  const assessmentId = testId || id;
  const navigate = useNavigate();
  const { user } = useAuth();
  const { success, error } = useToast();
  const { refreshAll } = useStudentData();

  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [initStep, setInitStep] = useState('Authenticating session with MongoDB Atlas...');
  const [initStepIndex, setInitStepIndex] = useState(1);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [hasStarted, setHasStarted] = useState(false);

  // Proctoring & Fullscreen state
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [violations, setViolations] = useState(0);
  const [violationModalOpen, setViolationModalOpen] = useState(false);
  const [violationMessage, setViolationMessage] = useState('');

  const [currentIndex, setCurrentIndex] = useState(0);
  const [secondsRemaining, setSecondsRemaining] = useState(1800);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [markedForReview, setMarkedForReview] = useState<Record<string, boolean>>({});
  const [questionLangs, setQuestionLangs] = useState<Record<string, CodingLanguage>>({});
  const [codeBuffers, setCodeBuffers] = useState<Record<string, string>>({});
  const [submittedCodingIds, setSubmittedCodingIds] = useState<Set<string>>(new Set());

  // Split-console tab: 'cases' (sample cases) | 'custom' | 'result'
  const [consoleTab, setConsoleTab] = useState<'cases' | 'custom' | 'result'>('cases');
  const [selectedCaseIdx, setSelectedCaseIdx] = useState(0);
  const [customInput, setCustomInput] = useState('');
  const [execResultByQ, setExecResultByQ] = useState<Record<string, CodeExecutionResponse>>({});
  const [historyByQ, setHistoryByQ] = useState<Record<string, CodeSubmissionHistoryItem[]>>({});
  const [showHistory, setShowHistory] = useState(false);
  const [runningSample, setRunningSample] = useState(false);
  const [submittingCode, setSubmittingCode] = useState(false);

  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submissionResult, setSubmissionResult] = useState<AssessmentSubmission | null>(null);

  const editorRef = useRef<HTMLTextAreaElement>(null);

  // Fullscreen Helpers
  const requestFullScreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
        setIsFullscreen(true);
      }
    } catch {
      // Handled via user button
    }
  };

  const exitFullScreen = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch {
      // Ignored
    }
  };

  // Anti-Cheat Proctoring Listeners
  useEffect(() => {
    if (!hasStarted || submissionResult) return;

    const handleFullscreenChange = () => {
      const isNowFullscreen = !!document.fullscreenElement;
      setIsFullscreen(isNowFullscreen);
      if (!isNowFullscreen && hasStarted && !submissionResult) {
        setViolations((v) => {
          const next = v + 1;
          setViolationMessage(`Fullscreen exited! Proctoring requires full screen to ensure academic integrity. (Violation ${next}/3)`);
          setViolationModalOpen(true);
          return next;
        });
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden && hasStarted && !submissionResult) {
        setViolations((v) => {
          const next = v + 1;
          setViolationMessage(`Tab switch or window minimizing detected! Navigating away from the proctored test is strictly recorded. (Violation ${next}/3)`);
          setViolationModalOpen(true);
          return next;
        });
      }
    };

    const handleWindowBlur = () => {
      if (hasStarted && !submissionResult && !document.fullscreenElement) {
        setViolations((v) => {
          const next = v + 1;
          setViolationMessage(`Window focus lost! Please keep your attention strictly inside the assessment window. (Violation ${next}/3)`);
          setViolationModalOpen(true);
          return next;
        });
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      // Block DevTools shortcuts: F12, Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+U, Ctrl+Shift+C
      if (
        e.key === 'F12' ||
        (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'i' || e.key === 'J' || e.key === 'j' || e.key === 'C' || e.key === 'c')) ||
        (e.ctrlKey && (e.key === 'u' || e.key === 'U'))
      ) {
        e.preventDefault();
        return false;
      }
    };

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleWindowBlur);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('contextmenu', handleContextMenu);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleWindowBlur);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('contextmenu', handleContextMenu);
    };
  }, [hasStarted, submissionResult]);

  useEffect(() => {
    async function init() {
      if (!assessmentId) {
        setLoading(false);
        return;
      }
      setLoading(true);
      setLoadError(null);
      setInitStep('Connecting to MongoDB Atlas & authenticating session...');
      setInitStepIndex(1);

      try {
        setInitStep('Loading assessment blueprint from MongoDB Atlas...');
        setInitStepIndex(2);

        let started: { attemptId: string; assessment: Assessment } | null = null;
        try {
          started = await assessmentService.startAttempt(assessmentId);
        } catch (attemptErr: any) {
          console.warn('Attempt start notice, falling back to direct assessment fetch:', attemptErr);
          try {
            const fallbackAsmt = await assessmentService.getAssessmentById(assessmentId);
            started = { attemptId: `live-fallback-${Date.now()}`, assessment: fallbackAsmt };
          } catch (fbErr: any) {
            throw new Error(
              attemptErr?.message || fbErr?.message || 'Unable to connect to MongoDB Atlas backend.'
            );
          }
        }

        setInitStep('Synchronizing sandboxed code execution workspace...');
        setInitStepIndex(3);

        setAttemptId(started.attemptId);
        setAssessment(started.assessment);
        setSecondsRemaining((started.assessment.durationMinutes || 30) * 60);

        const initialBuffers: Record<string, string> = {};
        const initialLangs: Record<string, CodingLanguage> = {};
        for (const q of started.assessment.questions) {
          if (q.type === 'coding') {
            const allowed = (q.supportedLanguages && q.supportedLanguages.length > 0
              ? q.supportedLanguages
              : ['python', 'javascript', 'java', 'cpp']) as CodingLanguage[];
            initialLangs[q.id] = allowed[0] || 'python';
            for (const lang of ['python', 'javascript', 'java', 'cpp'] as CodingLanguage[]) {
              initialBuffers[codeKey(q.id, lang)] = q.starterCode?.[lang] || '';
            }
          }
        }
        setQuestionLangs(initialLangs);
        setCodeBuffers(initialBuffers);
      } catch (err: any) {
        const msg = err?.message || 'Unable to load assessment from MongoDB Atlas.';
        setLoadError(msg);
        error(msg);
      } finally {
        setLoading(false);
      }
    }
    void init();
  }, [assessmentId, retryCount]);

  const handleStartExam = async () => {
    await requestFullScreen();
    setHasStarted(true);
  };

  const handleFinalSubmit = useCallback(async () => {
    if (!assessment || submitting) return;
    setSubmitting(true);
    try {
      const mergedAnswers = { ...answers };
      for (const q of assessment.questions) {
        if (q.type === 'coding') {
          const lang = questionLangs[q.id] || 'python';
          const buf = codeBuffers[codeKey(q.id, lang)];
          const starter = q.starterCode?.[lang] || '';
          if (buf && buf.trim() && buf.trim() !== starter.trim()) {
            mergedAnswers[q.id] = buf;
          }
        }
      }
      const res = await assessmentService.submitAssessment(
        assessment.id,
        mergedAnswers,
        user?.id || 'me',
        attemptId || undefined,
        questionLangs,
        submittedCodingIds
      );
      setSubmissionResult(res);
      setConfirmModalOpen(false);
      await refreshAll();
      void exitFullScreen();
      if (res.passed) {
        success(`Congratulations! Scored ${res.score}% — Skill verified in MongoDB!`);
      } else {
        success(`Assessment graded: ${res.score}%. Review feedback and retry to earn verification.`);
      }
    } catch (err: any) {
      error(err?.message || 'Assessment submission failed.');
    } finally {
      setSubmitting(false);
    }
  }, [assessment, submitting, answers, questionLangs, codeBuffers, submittedCodingIds, user?.id, attemptId, refreshAll, success, error]);

  useEffect(() => {
    if (!hasStarted || submissionResult || secondsRemaining <= 0) return;
    const timer = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          void handleFinalSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [hasStarted, submissionResult, secondsRemaining, handleFinalSubmit]);

  const loadQuestionHistory = useCallback(
    async (questionId: string) => {
      if (!attemptId) return;
      try {
        const items = await assessmentService.getAttemptCodeSubmissions(attemptId, questionId);
        setHistoryByQ((prev) => ({ ...prev, [questionId]: items }));
      } catch {
        // Non-fatal history refresh
      }
    },
    [attemptId]
  );

  const handleSelectMCQ = (questionId: string, optionIdx: number) => {
    setAnswers((prev) => ({ ...prev, [questionId]: optionIdx }));
    if (attemptId) {
      assessmentService.saveMcqAnswer(attemptId, questionId, optionIdx).catch(() => {});
    }
  };

  const handleCodeChange = (questionId: string, lang: CodingLanguage, val: string) => {
    setCodeBuffers((prev) => ({ ...prev, [codeKey(questionId, lang)]: val }));
    setAnswers((prev) => ({ ...prev, [questionId]: val }));
  };

  const handleLanguageChange = (questionId: string, lang: CodingLanguage) => {
    setQuestionLangs((prev) => ({ ...prev, [questionId]: lang }));
  };

  const handleResetStarter = (q: QuestionCoding, lang: CodingLanguage) => {
    const starter = q.starterCode?.[lang] || '';
    setCodeBuffers((prev) => ({ ...prev, [codeKey(q.id, lang)]: starter }));
  };

  const handleRunSamples = async (q: QuestionCoding) => {
    if (!attemptId) return;
    const lang = questionLangs[q.id] || 'python';
    const code = codeBuffers[codeKey(q.id, lang)] || '';
    setRunningSample(true);
    try {
      const customArg = consoleTab === 'custom' ? customInput : undefined;
      const res = await assessmentService.runSampleCode(attemptId, q.id, code, lang, customArg);
      setExecResultByQ((prev) => ({ ...prev, [q.id]: res }));
      setConsoleTab('result');
      await loadQuestionHistory(q.id);
    } catch (err: any) {
      error(err?.message || 'Sample execution failed.');
    } finally {
      setRunningSample(false);
    }
  };

  const handleSubmitSolution = async (q: QuestionCoding) => {
    if (!attemptId) return;
    const lang = questionLangs[q.id] || 'python';
    const code = codeBuffers[codeKey(q.id, lang)] || '';
    setSubmittingCode(true);
    try {
      const res = await assessmentService.runCodeSubmission(attemptId, q.id, code, lang);
      setExecResultByQ((prev) => ({ ...prev, [q.id]: res }));
      setAnswers((prev) => ({ ...prev, [q.id]: code }));
      setSubmittedCodingIds((prev) => {
        const next = new Set(prev);
        next.add(q.id);
        return next;
      });
      setConsoleTab('result');
      await loadQuestionHistory(q.id);
      if (res.status === 'accepted') {
        success(`All ${res.total_test_cases} tests passed (${res.earned_points}/${res.max_points} pts)!`);
      } else {
        success(
          `Evaluated: ${res.passed_test_cases}/${res.total_test_cases} passed (${res.earned_points}/${res.max_points} pts).`
        );
      }
    } catch (err: any) {
      error(err?.message || 'Solution evaluation failed.');
    } finally {
      setSubmittingCode(false);
    }
  };

  const handleEditorKeyDown = (
    e: React.KeyboardEvent<HTMLTextAreaElement>,
    questionId: string,
    lang: CodingLanguage
  ) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const target = e.currentTarget;
      const start = target.selectionStart;
      const end = target.selectionEnd;
      const value = target.value;
      const updated = value.substring(0, start) + '    ' + value.substring(end);
      handleCodeChange(questionId, lang, updated);
      requestAnimationFrame(() => {
        target.selectionStart = target.selectionEnd = start + 4;
      });
    }
  };

  const toggleMarkForReview = (questionId: string) => {
    setMarkedForReview((prev) => ({ ...prev, [questionId]: !prev[questionId] }));
  };

  const skillLabel = assessmentId
    ? assessmentId
        .replace(/^test-/, '')
        .replace(/-(5|10)$/, '')
        .replace(/-/g, ' ')
        .toUpperCase()
    : 'Technical';

  if (loading) {
    return (
      <div className="max-w-lg mx-auto py-16 px-4 space-y-6 text-center">
        <ClayLoader
          label={`Initializing ${skillLabel} Proctored Assessment...`}
          subtext={initStep}
        />
        <div className="flex items-center justify-center gap-2 text-[11px] font-mono font-bold text-slate-500 pt-2">
          <span
            className={`px-3 py-1 rounded-xl border transition-all ${
              initStepIndex >= 1
                ? 'bg-orange-500 text-white border-orange-500 shadow-2xs'
                : 'bg-slate-50 text-slate-400 border-slate-200'
            }`}
          >
            1. MongoDB Atlas
          </span>
          <span className="text-slate-300">→</span>
          <span
            className={`px-3 py-1 rounded-xl border transition-all ${
              initStepIndex >= 2
                ? 'bg-orange-500 text-white border-orange-500 shadow-2xs'
                : 'bg-slate-50 text-slate-400 border-slate-200'
            }`}
          >
            2. Test Blueprint
          </span>
          <span className="text-slate-300">→</span>
          <span
            className={`px-3 py-1 rounded-xl border transition-all ${
              initStepIndex >= 3
                ? 'bg-orange-500 text-white border-orange-500 shadow-2xs'
                : 'bg-slate-50 text-slate-400 border-slate-200'
            }`}
          >
            3. Sandbox Runner
          </span>
        </div>
      </div>
    );
  }

  if (loadError || !assessment) {
    return (
      <div className="max-w-md mx-auto py-12 px-4">
        <div className="clay-card p-8 bg-white border border-rose-200 text-center space-y-4 shadow-sm">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h2 className="text-base font-black text-slate-900">
              Unable to Load {skillLabel} Assessment
            </h2>
            <p className="text-xs text-slate-600 font-medium leading-relaxed">
              {loadError || 'The assessment blueprint could not be synchronized from MongoDB Atlas.'}
            </p>
          </div>

          <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-2">
            <Button
              variant="primary"
              size="sm"
              onClick={() => setRetryCount((c) => c + 1)}
              className="w-full sm:w-auto text-xs font-bold gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Retry Connection
            </Button>
            <Button
              variant="white"
              size="sm"
              onClick={() => navigate('/student/assessments')}
              className="w-full sm:w-auto text-xs"
            >
              Back to Assessment Center
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // RESULTS SCREEN
  if (submissionResult) {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="clay-card-peach p-8 border border-orange-200 text-center space-y-4">
          <div
            className={`w-16 h-16 mx-auto rounded-2xl flex items-center justify-center border-2 ${
              submissionResult.passed
                ? 'bg-emerald-100 text-emerald-700 border-emerald-300'
                : 'bg-amber-100 text-amber-700 border-amber-300'
            }`}
          >
            {submissionResult.passed ? <Trophy className="w-8 h-8" /> : <Award className="w-8 h-8" />}
          </div>

          <Badge variant={submissionResult.passed ? 'success' : 'warning'} size="md">
            {submissionResult.passed ? 'PASSED & VERIFIED' : 'BELOW 75% PASSING GATE'}
          </Badge>

          <h1 className="text-2xl sm:text-3xl font-black text-slate-900">{assessment.title}</h1>
          <div className="text-5xl font-black font-mono text-[#E86144]">
            {Math.round(submissionResult.score)}%
          </div>
          <p className="text-xs text-slate-700 font-medium max-w-lg mx-auto leading-relaxed">
            {submissionResult.feedback}
          </p>

          {submissionResult.verifiedSkillsEarned.length > 0 && (
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-emerald-200 text-xs font-bold text-emerald-800 shadow-2xs">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              Verified Credential Earned: {submissionResult.verifiedSkillsEarned.join(', ')}
            </div>
          )}

          {submissionResult.questionBreakdown && submissionResult.questionBreakdown.length > 0 && (
            <div className="text-left bg-white/95 rounded-2xl border border-orange-200 p-4 space-y-2 mt-4">
              <div className="flex items-center justify-between text-xs font-bold text-slate-800 pb-2 border-b border-orange-100">
                <span>Question-Level Grading Breakdown</span>
                <span className="font-mono text-[#E86144]">
                  {submissionResult.earnedPoints ?? 0} / {submissionResult.totalPoints ?? 100} pts
                </span>
              </div>
              <div className="space-y-1.5">
                {submissionResult.questionBreakdown.map((qb, idx) => {
                  const isPass = qb.status === 'accepted' || (qb.earned_points > 0 && qb.earned_points === qb.max_points);
                  return (
                    <div key={qb.question_id || idx} className="flex items-center justify-between text-[11px] font-mono bg-orange-50/40 px-3 py-2 rounded-xl">
                      <div className="flex items-center gap-2 truncate pr-3">
                        <span className="font-bold text-slate-800">{idx + 1}. {qb.title || qb.type.toUpperCase()}</span>
                        {isPass ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        ) : (
                          <XCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                        )}
                      </div>
                      <span className="text-slate-600 font-bold shrink-0">
                        {qb.earned_points} / {qb.max_points} pts
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="pt-4 flex justify-center gap-3">
            <Button variant="primary" size="sm" onClick={() => navigate('/student/assessments')}>
              Return to Assessment Center
            </Button>
            <Button variant="white" size="sm" onClick={() => navigate('/student/dashboard')}>
              Go to Dashboard
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // INTRO BRIEFING & PROCTORED FULLSCREEN ONBOARDING
  if (!hasStarted) {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <Card variant="peach" className="space-y-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Badge variant="brand" size="sm">
                {assessment.questionCount}-Question Proctored Assessment
              </Badge>
              <h1 className="text-2xl font-black text-slate-900 mt-2">{assessment.title}</h1>
              <p className="text-xs text-slate-600 mt-1">{assessment.description}</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 p-4 bg-white rounded-2xl border border-orange-200 text-xs text-center">
            <div>
              <span className="text-slate-400 block text-[11px]">Duration</span>
              <span className="font-mono font-bold text-slate-900">{assessment.durationMinutes} mins</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[11px]">Passing Gate</span>
              <span className="font-mono font-bold text-emerald-700">{assessment.passingPercentage}%</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[11px]">Evaluation Mode</span>
              <span className="font-mono font-bold text-[#E86144]">Proctored Live Judge</span>
            </div>
          </div>

          {/* Strict Examination Rules */}
          <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-950 space-y-2">
            <div className="flex items-center gap-2 font-bold text-amber-900">
              <ShieldCheck className="w-4 h-4 text-amber-600" />
              <span>Academic Integrity & Strict Proctoring Rules:</span>
            </div>
            <ul className="space-y-1 list-disc list-inside text-[11px] text-amber-900 font-medium">
              <li><strong>Fullscreen Enforced:</strong> The assessment runs strictly in Fullscreen mode. Exiting fullscreen will be flagged.</li>
              <li><strong>No Text Copying:</strong> Copying, cutting, right-clicking, and text selection are disabled across problem statements.</li>
              <li><strong>Tab Switching Monitored:</strong> Navigating away from the assessment or minimizing the window logs a violation (maximum 3 violations allowed).</li>
              <li><strong>Live Out-of-Process Execution:</strong> Real-time code execution with sample testcase feedback and private hidden verification cases.</li>
            </ul>
          </div>

          <div className="flex justify-between items-center pt-3 border-t border-orange-200/70">
            <Button variant="white" size="sm" onClick={() => navigate('/student/assessments')}>
              Cancel
            </Button>
            <Button variant="primary" size="md" onClick={() => void handleStartExam()} className="gap-2">
              <Maximize2 className="w-4 h-4" />
              Enter Fullscreen & Begin Assessment
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  const currentQ = assessment.questions[currentIndex];
  const minutes = Math.floor(secondsRemaining / 60);
  const seconds = secondsRemaining % 60;
  const isTimeCritical = secondsRemaining < 300;

  return (
    <div
      className="space-y-3"
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* TOP PROCTORING HEADER BAR */}
      <div className="clay-card p-3 bg-white border border-orange-200 flex flex-wrap items-center justify-between gap-3 shadow-xs">
        <div className="flex items-center gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xs sm:text-sm font-black text-slate-900 truncate max-w-sm sm:max-w-md">
                {assessment.title}
              </h2>
              <span className="font-mono text-[10px] font-bold text-orange-700 bg-orange-50 px-2 py-0.5 rounded border border-orange-200">
                Q{currentIndex + 1} of {assessment.questions.length}
              </span>
            </div>
            <div className="flex items-center gap-2 text-[10px] text-slate-500 font-medium mt-0.5">
              <span className="capitalize">{currentQ.type.replace('_', ' ')} Question</span>
              <span>•</span>
              <span>Pass Gate: {assessment.passingPercentage}%</span>
            </div>
          </div>
        </div>

        {/* Center: Proctoring Status & Timer */}
        <div className="flex items-center gap-3">
          {/* Proctoring Status Pill */}
          <div className="flex items-center gap-2 text-[10px] font-mono font-bold px-2.5 py-1 rounded-xl bg-slate-50 border border-slate-200">
            <span className={`w-2 h-2 rounded-full ${isFullscreen ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
            <span>{isFullscreen ? 'Fullscreen Active' : 'Fullscreen Inactive'}</span>
            {violations > 0 && (
              <span className="text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200">
                Violations: {violations}/3
              </span>
            )}
          </div>

          {/* Countdown Clock */}
          <div
            className={`flex items-center gap-1.5 px-3 py-1 rounded-xl border font-mono text-xs font-bold shadow-2xs ${
              isTimeCritical
                ? 'bg-rose-50 border-rose-300 text-rose-700 animate-pulse'
                : 'bg-orange-50 border-orange-200 text-orange-700'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>
              {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
            </span>
          </div>

          {/* Fullscreen Toggle */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => (isFullscreen ? void exitFullScreen() : void requestFullScreen())}
            className="p-1.5 text-slate-600 hover:text-orange-600"
            title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </Button>

          {/* Finish & Submit Test Button */}
          <Button variant="primary" size="sm" onClick={() => setConfirmModalOpen(true)} className="text-xs font-bold">
            Submit Test
          </Button>
        </div>
      </div>

      {/* QUESTION NAVIGATION RAIL */}
      <div className="flex items-center gap-2 overflow-x-auto p-2 rounded-2xl bg-white border border-orange-200/80 shadow-2xs">
        <span className="text-[10px] font-mono text-slate-500 font-bold px-2 uppercase shrink-0">Questions:</span>
        {assessment.questions.map((q, idx) => {
          const isAnswered = answers[q.id] !== undefined;
          const isCurrent = idx === currentIndex;
          const isMarked = markedForReview[q.id];

          return (
            <button
              key={q.id}
              onClick={() => {
                setCurrentIndex(idx);
                setSelectedCaseIdx(0);
                setConsoleTab('cases');
              }}
              className={`w-8 h-8 rounded-xl text-xs font-mono font-bold flex items-center justify-center transition-all cursor-pointer relative ${
                isCurrent
                  ? 'clay-button-peach text-white shadow-sm'
                  : isAnswered
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-300'
                  : 'bg-slate-50 text-slate-600 border border-slate-200 hover:border-orange-300'
              }`}
            >
              {idx + 1}
              {isMarked && <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-amber-500" />}
            </button>
          );
        })}
      </div>

      {/* MCQ QUESTION WORKSPACE */}
      {currentQ.type === 'mcq' && (
        <Card variant="default" className="min-h-[460px] flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-orange-100">
              <div className="flex items-center gap-2">
                <Badge variant="brand" size="sm">Multiple Choice Question</Badge>
                <span className="text-xs text-slate-500 font-mono font-semibold">Skill: {currentQ.category}</span>
              </div>

              <Button
                variant="ghost"
                size="sm"
                leftIcon={
                  <Bookmark
                    className={`w-3.5 h-3.5 ${markedForReview[currentQ.id] ? 'text-amber-500 fill-amber-500' : ''}`}
                  />
                }
                onClick={() => toggleMarkForReview(currentQ.id)}
                className="text-xs font-bold text-slate-600"
              >
                {markedForReview[currentQ.id] ? 'Marked for Review' : 'Mark for Review'}
              </Button>
            </div>

            <div
              className="space-y-4 py-2 select-none"
              onCopy={(e) => {
                e.preventDefault();
                error('Proctoring restriction', 'Copying question text is strictly disabled.');
              }}
            >
              <h3 className="text-sm font-bold text-slate-900 leading-relaxed">
                {(currentQ as QuestionMCQ).question}
              </h3>

              <div className="space-y-2.5 pt-2">
                {(currentQ as QuestionMCQ).options.map((opt, optIdx) => {
                  const isSelected = answers[currentQ.id] === optIdx;
                  return (
                    <button
                      key={optIdx}
                      onClick={() => handleSelectMCQ(currentQ.id, optIdx)}
                      className={`w-full text-left p-4 rounded-2xl border text-xs transition-all flex items-start gap-3 cursor-pointer ${
                        isSelected
                          ? 'bg-orange-50/80 border-orange-400 text-orange-950 shadow-sm'
                          : 'bg-white border-slate-200/90 text-slate-700 hover:bg-orange-50/40 hover:border-orange-200'
                      }`}
                    >
                      <span
                        className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 font-mono text-[10px] mt-0.5 font-bold ${
                          isSelected
                            ? 'bg-orange-500 border-orange-500 text-white'
                            : 'border-slate-300 bg-white text-slate-500'
                        }`}
                      >
                        {String.fromCharCode(65 + optIdx)}
                      </span>
                      <span className="leading-relaxed font-semibold">{opt}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-orange-100">
            <Button
              variant="white"
              size="sm"
              disabled={currentIndex === 0}
              onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
            >
              <ArrowLeft className="w-3.5 h-3.5 mr-1" />
              Previous
            </Button>

            <Button
              variant="primary"
              size="sm"
              onClick={() => setCurrentIndex((prev) => Math.min(assessment.questions.length - 1, prev + 1))}
            >
              Next Question
              <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          </div>
        </Card>
      )}

      {/* CODING QUESTION WORKSPACE: SPLIT-SCREEN 2-COLUMN IDE */}
      {currentQ.type === 'coding' && (() => {
        const cq = currentQ as QuestionCoding;
        const allowedLangs = (
          cq.supportedLanguages && cq.supportedLanguages.length > 0
            ? cq.supportedLanguages
            : ['python', 'javascript', 'java', 'cpp']
        ) as CodingLanguage[];
        const activeLang = questionLangs[cq.id] || allowedLangs[0] || 'python';
        const currentCode = codeBuffers[codeKey(cq.id, activeLang)] ?? cq.starterCode?.[activeLang] ?? '';
        const latestExec = execResultByQ[cq.id];
        const qHistory = historyByQ[cq.id] || [];
        const publicCases = (cq.testCases || []).filter((tc) => !tc.isHidden);

        return (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 h-[calc(100vh-170px)] min-h-[620px]">
            {/* LEFT COLUMN: PROBLEM SPECIFICATIONS & SAMPLE TEST CASES */}
            <div className="flex flex-col h-full bg-white rounded-2xl border border-orange-200/80 shadow-xs overflow-hidden">
              {/* Problem Header */}
              <div className="p-4 border-b border-orange-100 flex items-center justify-between gap-3 bg-orange-50/30">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm font-black text-slate-900">{cq.title}</h3>
                  {cq.difficulty && (
                    <Badge variant={cq.difficulty === 'hard' ? 'danger' : 'brand'} size="sm">
                      {cq.difficulty.toUpperCase()}
                    </Badge>
                  )}
                  <Badge variant="purple" size="sm">{cq.points ?? 20} pts</Badge>
                </div>

                <div className="flex items-center gap-2 text-[10px] font-mono font-bold text-slate-600 bg-white px-2.5 py-1 rounded-xl border border-orange-200 shrink-0">
                  <Cpu className="w-3.5 h-3.5 text-[#E86144]" />
                  <span>{cq.timeLimitMs ?? 2000} ms • {Math.round((cq.memoryLimitKb ?? 262144) / 1024)} MB</span>
                </div>
              </div>

              {/* Scrollable Problem Content */}
              <div
                className="flex-1 overflow-y-auto p-4 space-y-4 select-none text-xs text-slate-700"
                onCopy={(e) => {
                  e.preventDefault();
                  error('Proctoring restriction', 'Copying question specifications is strictly prohibited.');
                }}
              >
                {/* Problem Description */}
                <div>
                  <h4 className="text-[11px] font-mono uppercase font-bold text-slate-900 mb-1.5">Description</h4>
                  <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-line font-medium">
                    {cq.problemStatement}
                  </p>
                </div>

                {/* Input Format & Output Format */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  <div className="p-3 bg-orange-50/40 rounded-xl border border-orange-100 space-y-1">
                    <span className="text-[10px] uppercase font-mono font-bold text-orange-700">Input Format</span>
                    <pre className="text-[11px] text-slate-700 whitespace-pre-wrap font-mono leading-relaxed">
                      {cq.inputFormat || 'Standard Input (stdin)'}
                    </pre>
                  </div>
                  <div className="p-3 bg-orange-50/40 rounded-xl border border-orange-100 space-y-1">
                    <span className="text-[10px] uppercase font-mono font-bold text-orange-700">Output Format</span>
                    <pre className="text-[11px] text-slate-700 whitespace-pre-wrap font-mono leading-relaxed">
                      {cq.outputFormat || 'Standard Output (stdout)'}
                    </pre>
                  </div>
                </div>

                {/* Constraints */}
                {cq.constraints && cq.constraints.length > 0 && (
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 space-y-1 font-medium">
                    <span className="text-[10px] uppercase font-mono font-bold text-slate-600">Constraints</span>
                    <ul className="list-disc list-inside text-slate-600 space-y-0.5 text-[11px] font-mono">
                      {cq.constraints.map((c, i) => (
                        <li key={i}>{c}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Sample Test Cases (LeetCode / HackerRank Style) */}
                <div className="space-y-3 pt-1">
                  <h4 className="text-[11px] font-mono uppercase font-bold text-slate-900 flex items-center justify-between">
                    <span>Sample Test Cases</span>
                    <span className="text-slate-400 font-normal">({publicCases.length} Public Cases)</span>
                  </h4>

                  {publicCases.map((tc, idx) => (
                    <div key={tc.id || idx} className="rounded-xl border border-slate-200 bg-slate-50 overflow-hidden font-mono text-[11px]">
                      <div className="px-3 py-1.5 bg-slate-100 border-b border-slate-200 text-slate-700 font-bold flex items-center justify-between">
                        <span>{tc.label || `Sample Case ${idx + 1}`}</span>
                      </div>
                      <div className="p-3 space-y-2">
                        <div>
                          <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Sample Input:</span>
                          <pre className="p-2 bg-white rounded-lg border border-slate-200 text-slate-800 whitespace-pre-wrap">
                            {tc.input}
                          </pre>
                        </div>
                        <div>
                          <span className="text-[10px] uppercase font-bold text-emerald-600 block mb-0.5">Expected Output:</span>
                          <pre className="p-2 bg-white rounded-lg border border-emerald-200 text-emerald-800 font-bold whitespace-pre-wrap">
                            {tc.expectedOutput || (tc as any).expected}
                          </pre>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Left Panel Footer: Question Selector & Bookmark */}
              <div className="p-3 border-t border-orange-100 bg-white flex items-center justify-between text-xs font-medium">
                <Button
                  variant="ghost"
                  size="sm"
                  leftIcon={
                    <Bookmark
                      className={`w-3.5 h-3.5 ${markedForReview[cq.id] ? 'text-amber-500 fill-amber-500' : ''}`}
                    />
                  }
                  onClick={() => toggleMarkForReview(cq.id)}
                  className="text-xs font-bold text-slate-600"
                >
                  {markedForReview[cq.id] ? 'Marked for Review' : 'Mark for Review'}
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  leftIcon={<History className="w-3.5 h-3.5 text-purple-600" />}
                  onClick={async () => {
                    await loadQuestionHistory(cq.id);
                    setShowHistory(true);
                  }}
                  className="text-xs font-bold text-purple-700"
                >
                  Submissions ({qHistory.length})
                </Button>
              </div>
            </div>

            {/* RIGHT COLUMN: CODE EDITOR & EXECUTION CONSOLE */}
            <div className="flex flex-col h-full bg-slate-900 rounded-2xl border border-slate-800 shadow-md overflow-hidden">
              {/* Code Editor Header */}
              <div className="p-2.5 bg-slate-950 border-b border-slate-800 flex items-center justify-between gap-2">
                {/* Language Selector */}
                <div className="flex items-center gap-1.5">
                  <FileCode2 className="w-4 h-4 text-orange-400" />
                  <div className="flex items-center gap-1 bg-slate-900 p-0.5 rounded-lg border border-slate-800">
                    {allowedLangs.map((lang) => (
                      <button
                        key={lang}
                        type="button"
                        onClick={() => handleLanguageChange(cq.id, lang)}
                        className={`px-2.5 py-1 rounded text-[11px] font-mono transition-all cursor-pointer font-bold ${
                          activeLang === lang
                            ? 'bg-orange-500 text-white shadow-2xs'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {LANGUAGE_LABELS[lang] || lang}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleResetStarter(cq, activeLang)}
                    className="text-[11px] text-slate-400 hover:text-slate-100 p-1.5"
                    title="Reset to starter code template"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>

              {/* Code Editor Textarea */}
              <div className="flex-1 relative flex overflow-hidden bg-slate-950">
                <textarea
                  ref={editorRef}
                  value={currentCode}
                  onChange={(e) => handleCodeChange(cq.id, activeLang, e.target.value)}
                  onKeyDown={(e) => handleEditorKeyDown(e, cq.id, activeLang)}
                  spellCheck={false}
                  className="flex-1 w-full p-4 bg-transparent text-slate-100 font-mono text-xs leading-relaxed resize-none focus:outline-hidden selection:bg-orange-500/30 overflow-auto"
                  placeholder={`// Implement your ${activeLang} solution here...`}
                />
              </div>

              {/* BOTTOM EXECUTION & TESTCASE CONSOLE */}
              <div className="h-[210px] bg-slate-900 border-t border-slate-800 flex flex-col">
                {/* Console Tabs */}
                <div className="flex items-center justify-between px-3 pt-2 border-b border-slate-800 bg-slate-900">
                  <div className="flex items-center gap-1 text-[11px] font-mono font-bold">
                    <button
                      onClick={() => setConsoleTab('cases')}
                      className={`px-3 py-1 rounded-t-lg transition-colors cursor-pointer ${
                        consoleTab === 'cases'
                          ? 'bg-slate-800 text-orange-400 border-t-2 border-orange-500'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Sample Cases ({publicCases.length})
                    </button>
                    <button
                      onClick={() => setConsoleTab('custom')}
                      className={`px-3 py-1 rounded-t-lg transition-colors cursor-pointer ${
                        consoleTab === 'custom'
                          ? 'bg-slate-800 text-orange-400 border-t-2 border-orange-500'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Custom Stdin
                    </button>
                    <button
                      onClick={() => setConsoleTab('result')}
                      className={`px-3 py-1 rounded-t-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
                        consoleTab === 'result'
                          ? 'bg-slate-800 text-orange-400 border-t-2 border-orange-500'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <span>Execution Result</span>
                      {latestExec && (
                        <span className={`w-2 h-2 rounded-full ${latestExec.status === 'accepted' ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                      )}
                    </button>
                  </div>

                  {latestExec && (
                    <div className="text-[10px] font-mono text-slate-400">
                      Runtime: {latestExec.execution_time_ms ? `${latestExec.execution_time_ms.toFixed(0)}ms` : '—'}
                    </div>
                  )}
                </div>

                {/* Console Body */}
                <div className="flex-1 overflow-y-auto p-3 text-xs font-mono">
                  {/* Tab 1: Sample Cases & Expected Output */}
                  {consoleTab === 'cases' && (
                    <div className="space-y-2 h-full flex flex-col">
                      <div className="flex items-center gap-1.5">
                        {publicCases.map((tc, idx) => (
                          <button
                            key={idx}
                            onClick={() => setSelectedCaseIdx(idx)}
                            className={`px-2.5 py-0.5 rounded text-[10px] font-bold cursor-pointer ${
                              selectedCaseIdx === idx
                                ? 'bg-orange-500 text-white'
                                : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            Case {idx + 1}
                          </button>
                        ))}
                      </div>

                      {publicCases[selectedCaseIdx] && (
                        <div className="grid grid-cols-2 gap-2 text-[11px] pt-1 flex-1">
                          <div className="space-y-1">
                            <span className="text-[10px] text-slate-400 uppercase block font-bold">Input:</span>
                            <pre className="p-2 bg-slate-950 rounded border border-slate-800 text-slate-200 whitespace-pre-wrap overflow-auto max-h-[100px]">
                              {publicCases[selectedCaseIdx].input}
                            </pre>
                          </div>
                          <div className="space-y-1">
                            <span className="text-[10px] text-emerald-400 uppercase block font-bold">Expected Output:</span>
                            <pre className="p-2 bg-slate-950 rounded border border-emerald-900/60 text-emerald-300 font-bold whitespace-pre-wrap overflow-auto max-h-[100px]">
                              {publicCases[selectedCaseIdx].expectedOutput || (publicCases[selectedCaseIdx] as any).expected}
                            </pre>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Tab 2: Custom Stdin */}
                  {consoleTab === 'custom' && (
                    <div className="h-full flex flex-col space-y-1">
                      <span className="text-[10px] text-slate-400 uppercase font-bold">Custom Standard Input:</span>
                      <textarea
                        value={customInput}
                        onChange={(e) => setCustomInput(e.target.value)}
                        placeholder="Paste or type test input for stdin..."
                        className="flex-1 w-full p-2 bg-slate-950 text-slate-200 rounded border border-slate-800 text-[11px] font-mono focus:outline-hidden"
                      />
                    </div>
                  )}

                  {/* Tab 3: Execution Result & Output Diff */}
                  {consoleTab === 'result' && (
                    <div className="space-y-2">
                      {!latestExec ? (
                        <div className="text-slate-500 text-[11px] text-center pt-8">
                          Click "Run Code" to test against sample cases, or "Submit Code" to evaluate all hidden cases.
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between pb-1 border-b border-slate-800">
                            <div className="flex items-center gap-2">
                              <Badge
                                variant={STATUS_STYLES[latestExec.status]?.badge || 'brand'}
                                size="sm"
                              >
                                {STATUS_STYLES[latestExec.status]?.label || latestExec.status.toUpperCase()}
                              </Badge>
                              <span className="text-[11px] text-slate-300 font-bold">
                                {latestExec.passed_test_cases} / {latestExec.total_test_cases} tests passed
                              </span>
                            </div>
                            <span className="text-orange-400 font-bold text-[11px]">
                              Points: {latestExec.earned_points} / {latestExec.max_points}
                            </span>
                          </div>

                          {/* Compilation or Runtime Error Display */}
                          {(latestExec.compile_error || latestExec.runtime_error) && (
                            <div className="p-2.5 rounded bg-rose-950/60 border border-rose-800 text-rose-200 text-[10px] whitespace-pre-wrap font-mono">
                              {latestExec.compile_error || latestExec.runtime_error}
                            </div>
                          )}

                          {/* Results cards */}
                          <div className="space-y-1.5">
                            {latestExec.public_results.map((pr, pIdx) => {
                              const isPass = pr.passed || pr.status === 'ok';
                              return (
                                <div key={pr.id || pIdx} className="p-2 rounded bg-slate-950 border border-slate-800 text-[11px] space-y-1">
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-1.5">
                                      {isPass ? (
                                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                                      ) : (
                                        <XCircle className="w-3.5 h-3.5 text-rose-400" />
                                      )}
                                      <span className="font-bold text-slate-200">{pr.label || `Case ${pIdx + 1}`}</span>
                                    </div>
                                    <span className="text-slate-500 text-[10px]">{pr.execution_time_ms.toFixed(1)} ms</span>
                                  </div>

                                  <div className="grid grid-cols-2 gap-2 pt-1 text-[10px]">
                                    <div>
                                      <span className="text-slate-400 block font-bold">Your Output:</span>
                                      <pre className={`p-1.5 rounded ${isPass ? 'text-slate-200' : 'text-rose-300 bg-rose-950/40'} whitespace-pre-wrap`}>
                                        {pr.actual_output || '(Empty)'}
                                      </pre>
                                    </div>
                                    <div>
                                      <span className="text-emerald-400 block font-bold">Expected Output:</span>
                                      <pre className="p-1.5 rounded text-emerald-300 whitespace-pre-wrap">
                                        {pr.expected_output || '—'}
                                      </pre>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* ACTION FOOTER BAR */}
              <div className="p-3 bg-slate-950 border-t border-slate-800 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Button
                    variant="white"
                    size="sm"
                    disabled={currentIndex === 0}
                    onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
                    className="text-xs"
                  >
                    <ArrowLeft className="w-3.5 h-3.5 mr-1" />
                    Previous
                  </Button>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="white"
                    size="sm"
                    onClick={() => void handleRunSamples(cq)}
                    isLoading={runningSample}
                    disabled={submittingCode}
                    className="text-xs font-bold gap-1.5 bg-slate-800 text-slate-200 border-slate-700 hover:bg-slate-700"
                  >
                    <Play className="w-3.5 h-3.5 text-emerald-400 fill-emerald-400" />
                    Run Code
                  </Button>

                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => void handleSubmitSolution(cq)}
                    isLoading={submittingCode}
                    disabled={runningSample}
                    className="text-xs font-bold gap-1.5"
                  >
                    <Send className="w-3.5 h-3.5" />
                    Submit Code
                  </Button>

                  <Button
                    variant="white"
                    size="sm"
                    disabled={currentIndex === assessment.questions.length - 1}
                    onClick={() => setCurrentIndex((prev) => Math.min(assessment.questions.length - 1, prev + 1))}
                    className="text-xs"
                  >
                    Next
                    <ArrowRight className="w-3.5 h-3.5 ml-1" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* CONFIRM TEST SUBMISSION MODAL */}
      <Modal
        isOpen={confirmModalOpen}
        onClose={() => setConfirmModalOpen(false)}
        title="Finalize & Submit Assessment?"
        subtitle="Once submitted, code runs against all private hidden test cases."
      >
        <div className="space-y-4 text-xs font-medium">
          <div className="p-3 bg-orange-50 rounded-xl border border-orange-200 text-slate-700 space-y-1">
            <div className="flex justify-between">
              <span>Total Questions:</span>
              <strong className="font-mono text-slate-900">{assessment.questions.length}</strong>
            </div>
            <div className="flex justify-between">
              <span>Answered:</span>
              <strong className="font-mono text-emerald-700">{Object.keys(answers).length}</strong>
            </div>
            <div className="flex justify-between">
              <span>Unanswered:</span>
              <strong className="font-mono text-rose-700">
                {assessment.questions.length - Object.keys(answers).length}
              </strong>
            </div>
            <div className="flex justify-between">
              <span>Proctoring Violations Logged:</span>
              <strong className="font-mono text-slate-900">{violations}</strong>
            </div>
          </div>

          <p className="text-slate-600">
            Are you sure you want to finalize your exam? Your score will update your placement readiness profile.
          </p>

          <div className="pt-2 flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setConfirmModalOpen(false)}>
              Back to Assessment
            </Button>
            <Button variant="primary" size="sm" onClick={() => void handleFinalSubmit()} isLoading={submitting}>
              Confirm Final Submission
            </Button>
          </div>
        </div>
      </Modal>

      {/* PROCTORING VIOLATION WARNING MODAL */}
      <Modal
        isOpen={violationModalOpen}
        onClose={() => {
          setViolationModalOpen(false);
          void requestFullScreen();
        }}
        title="⚠️ Strict Proctoring Alert"
      >
        <div className="space-y-4 text-xs font-medium text-slate-700">
          <div className="p-4 rounded-xl bg-rose-50 border border-rose-300 text-rose-950 flex items-start gap-3">
            <AlertOctagon className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <strong className="block font-bold">Academic Integrity Violation Warning</strong>
              <p>{violationMessage}</p>
            </div>
          </div>

          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-slate-600 text-[11px] font-mono">
            <div>Current Violations: <strong className="text-rose-600 font-bold">{violations} / 3</strong></div>
            <div className="mt-1 text-slate-500">Notice: Repeatedly exiting fullscreen or switching tabs will be logged to the examination committee.</div>
          </div>

          <div className="pt-2 flex justify-end">
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                setViolationModalOpen(false);
                void requestFullScreen();
              }}
              className="gap-1.5"
            >
              <Maximize2 className="w-3.5 h-3.5" />
              Re-enter Fullscreen & Continue Test
            </Button>
          </div>
        </div>
      </Modal>

      {/* QUESTION SUBMISSION HISTORY MODAL */}
      <Modal
        isOpen={showHistory}
        onClose={() => setShowHistory(false)}
        title="Question Code Submissions"
        subtitle="Review your previous execution attempts for this question."
        size="lg"
      >
        <div className="space-y-3 text-xs">
          {historyByQ[currentQ.id]?.length === 0 ? (
            <p className="text-slate-500 text-center py-6">No previous submissions for this question yet.</p>
          ) : (
            (historyByQ[currentQ.id] || []).map((h) => (
              <div key={h.submission_id} className="p-3 rounded-xl border border-slate-200 bg-slate-50 space-y-2 font-mono text-[11px]">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant={STATUS_STYLES[h.status]?.badge || 'brand'} size="sm">
                      {STATUS_STYLES[h.status]?.label || h.status.toUpperCase()}
                    </Badge>
                    <span className="font-bold text-slate-800">{h.language.toUpperCase()}</span>
                    <span className="text-slate-500">
                      ({h.passed_test_cases}/{h.total_test_cases} passed)
                    </span>
                  </div>
                  <span className="text-slate-400 text-[10px]">
                    {h.submitted_at?.split('T')[1]?.split('.')[0] || 'Recent'}
                  </span>
                </div>
                <pre className="p-2.5 rounded bg-slate-900 text-slate-200 text-[10px] overflow-x-auto whitespace-pre-wrap max-h-32">
                  {h.source_code}
                </pre>
              </div>
            ))
          )}
        </div>
      </Modal>
    </div>
  );
};
