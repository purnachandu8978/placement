import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import { ClayLoader } from '../../../components/common/ClayLoader';
import {
  examinationService,
  type ExaminationSession,
  type ExaminationQuestion,
  type SavedAnswer,
  type RunCodeResult,
  type SubmitExamResult,
} from '../../../services/examinationService';
import { ExaminationHeader } from '../components/ExaminationHeader';
import { QuestionPalette } from '../components/QuestionPalette';
import { MCQRenderer } from '../components/MCQRenderer';
import { CodingRenderer } from '../components/CodingRenderer';
import { ViolationModal } from '../components/ViolationModal';
import { ExaminationSubmitModal } from '../components/ExaminationSubmitModal';
import { ExaminationResultView } from '../components/ExaminationResultView';

export const UnifiedExaminationPage: React.FC = () => {
  const { examType, id } = useParams<{ examType: 'assessment' | 'assignment'; id: string }>();
  const navigate = useNavigate();

  // Session & UI state
  const [session, setSession] = useState<ExaminationSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [savedAnswers, setSavedAnswers] = useState<Record<string, SavedAnswer>>({});
  const [visitedIndices, setVisitedIndices] = useState<Set<number>>(new Set([0]));
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isFullscreen, setIsFullscreen] = useState(Boolean(document.fullscreenElement));

  // Security violations state
  const [violationsCount, setViolationsCount] = useState(0);
  const [violationModalOpen, setViolationModalOpen] = useState(false);
  const [violationReason, setViolationReason] = useState('');
  const [isTerminated, setIsTerminated] = useState(false);

  // Coding execution state
  const [customInput, setCustomInput] = useState('');
  const [runResult, setRunResult] = useState<RunCodeResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  // Submission state
  const [submitModalOpen, setSubmitModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionResult, setSubmissionResult] = useState<SubmitExamResult | null>(null);

  // Refs for tracking active state without stale closures
  const sessionRef = useRef<ExaminationSession | null>(null);
  sessionRef.current = session;
  const savedAnswersRef = useRef(savedAnswers);
  savedAnswersRef.current = savedAnswers;
  const examTypeNorm: 'assessment' | 'assignment' = examType === 'assignment' ? 'assignment' : 'assessment';
  const examIdNorm = id || '';

  // 1. Fetch or initialize session
  const loadSession = useCallback(async (retake: boolean = false) => {
    if (!examIdNorm) {
      setError('Invalid examination identifier in route.');
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const data = await examinationService.getSession(examTypeNorm, examIdNorm, retake);

      if (data.session_status === 'already_submitted') {
        setSession(data);
        setSubmissionResult({
          status: data.status || 'completed',
          exam_type: examTypeNorm,
          score: data.score || 0,
          total_earned: data.score || 0,
          max_total: 100,
          passed: (data.score || 0) >= 70,
          evaluation_breakdown: (data as any).evaluation_breakdown || [],
          submitted_at: data.submitted_at || new Date().toISOString(),
        });
        setLoading(false);
        return;
      }

      setSession(data);
      setSavedAnswers(data.saved_answers || {});
      setRemainingSeconds(data.remaining_seconds || data.duration_minutes * 60);
      setViolationsCount(data.violations_count || 0);

      if (data.violations_count >= data.max_violations_allowed + 1) {
        setIsTerminated(true);
        setViolationReason('Maximum security violations exceeded.');
        setViolationModalOpen(true);
      }
    } catch (err: any) {
      const msg = err?.data?.detail || err?.response?.data?.detail || err?.message || 'Failed to initialize examination session.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [examTypeNorm, examIdNorm]);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  // 2. Security Event Logging Hook
  const triggerViolation = useCallback(
    async (eventType: string, details: string) => {
      if (isTerminated || submissionResult) return;

      try {
        const res = await examinationService.logSecurityEvent(examTypeNorm, examIdNorm, {
          event_type: eventType,
          details,
        });

        setViolationsCount(res.violations_count);
        setViolationReason(details);
        setViolationModalOpen(true);

        if (res.is_terminated) {
          setIsTerminated(true);
        }
      } catch (err) {
        console.warn('Security logging error:', err);
      }
    },
    [isTerminated, submissionResult, examTypeNorm, examIdNorm]
  );

  // 3. Countdown Timer
  useEffect(() => {
    if (!session || isTerminated || submissionResult) return;

    const interval = setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          // Auto submit when time expires
          handleFinalSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [session, isTerminated, submissionResult]);

  // 5. Online/Offline Listener
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // 6. Auto-save answers periodically (every 30 seconds)
  useEffect(() => {
    if (!session || isTerminated || submissionResult) return;

    const autoSaveTimer = setInterval(async () => {
      const answersList = Object.values(savedAnswersRef.current);
      if (answersList.length === 0) return;
      try {
        await examinationService.saveProgress(examTypeNorm, examIdNorm, answersList);
      } catch (err) {
        console.warn('Draft auto-save deferred:', err);
      }
    }, 30000);

    return () => clearInterval(autoSaveTimer);
  }, [session, isTerminated, submissionResult, examTypeNorm, examIdNorm]);

  // Cleanup fullscreen on unmount (ensure non-exam pages are NEVER in fullscreen)
  useEffect(() => {
    return () => {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => { });
      }
    };
  }, []);

  // 7. Request Fullscreen Mode
  const requestFullscreen = useCallback(async () => {
    try {
      const elem = document.documentElement;
      if (elem.requestFullscreen) {
        await elem.requestFullscreen();
      }
    } catch (err) {
      console.warn('Fullscreen request note:', err);
    }
  }, []);

  // Return to exam and apologize for fullscreen exit
  const handleAcknowledgeAndReturn = useCallback(async () => {
    try {
      await requestFullscreen();
      setViolationModalOpen(false);
      await examinationService.logSecurityEvent(examTypeNorm, examIdNorm, {
        event_type: 'return_within_grace',
        details: 'Candidate apologized for fullscreen exit, accepted security charter, and resumed fullscreen examination.',
      });
    } catch (err) {
      console.warn('Error acknowledging return:', err);
    }
  }, [requestFullscreen, examTypeNorm, examIdNorm]);

  // Grace period expired (30 seconds outside exam) -> auto-lock and submit
  const handleGraceExpired = useCallback(async () => {
    if (isTerminated || submissionResult) return;
    try {
      await examinationService.logSecurityEvent(examTypeNorm, examIdNorm, {
        event_type: 'grace_period_expired',
        details: 'Return recovery grace period expired (30 seconds outside examination environment).',
      });
      setIsTerminated(true);
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => { });
      }
      await handleFinalSubmit();
    } catch (err) {
      console.warn('Grace expired submission error:', err);
    }
  }, [isTerminated, submissionResult, examTypeNorm, examIdNorm]);

  // Exit to dashboard and release fullscreen
  const handleExitToDashboard = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => { });
    }
    navigate(examTypeNorm === 'assessment' ? '/student/assessments' : '/student/assignments');
  }, [examTypeNorm, navigate]);

  // 8. Browser-Level Security Listeners
  useEffect(() => {
    if (!session || isTerminated || submissionResult) return;

    // Fullscreen change handler
    const handleFullscreenChange = () => {
      const full = Boolean(document.fullscreenElement);
      setIsFullscreen(full);
      if (!full) {
        triggerViolation('fullscreen_exit', 'Exited mandatory examination fullscreen mode.');
      }
    };

    // Tab visibility change
    const handleVisibilityChange = () => {
      if (document.hidden) {
        triggerViolation('tab_switch', 'Examination tab lost active focus (tab switched or minimized).');
      }
    };

    // Window blur
    const handleBlur = () => {
      triggerViolation('window_blur', 'Application window lost focus.');
    };

    // Clipboard prevention
    const handleCopyCutPaste = (e: ClipboardEvent) => {
      e.preventDefault();
      triggerViolation('clipboard_attempt', 'Attempted prohibited clipboard action (copy/paste).');
    };

    // Context menu prevention
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    // Prohibited key combinations (F12, DevTools, Ctrl+C, Ctrl+V, PrintScreen)
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === 'F12' ||
        (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'J' || e.key === 'C')) ||
        (e.ctrlKey && e.key === 'u') ||
        (e.ctrlKey && (e.key === 'c' || e.key === 'v' || e.key === 'p')) ||
        e.key === 'PrintScreen'
      ) {
        e.preventDefault();
        e.stopPropagation();
        triggerViolation('prohibited_key', `Prohibited key shortcut detected (${e.key}).`);
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleBlur);
    document.addEventListener('copy', handleCopyCutPaste);
    document.addEventListener('cut', handleCopyCutPaste);
    document.addEventListener('paste', handleCopyCutPaste);
    document.addEventListener('contextmenu', handleContextMenu);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleBlur);
      document.removeEventListener('copy', handleCopyCutPaste);
      document.removeEventListener('cut', handleCopyCutPaste);
      document.removeEventListener('paste', handleCopyCutPaste);
      document.removeEventListener('contextmenu', handleContextMenu);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [session, isTerminated, submissionResult, triggerViolation]);

  // Current question helpers
  const questions = session?.questions || [];
  const currentQ = questions[currentIndex] as ExaminationQuestion | undefined;
  const currentAnswer = currentQ ? savedAnswers[currentQ.id] : undefined;

  // Answer modification handlers
  const handleOptionSelect = (optionIdx: number) => {
    if (!currentQ) return;
    setSavedAnswers((prev) => ({
      ...prev,
      [currentQ.id]: {
        ...(prev[currentQ.id] || {}),
        question_id: currentQ.id,
        type: 'mcq',
        selected_option: optionIdx,
      },
    }));
  };

  const handleCodeChange = (newCode: string) => {
    if (!currentQ) return;
    setSavedAnswers((prev) => ({
      ...prev,
      [currentQ.id]: {
        ...(prev[currentQ.id] || {}),
        question_id: currentQ.id,
        type: currentQ.type || 'coding',
        code: newCode,
        language: prev[currentQ.id]?.language || 'python',
      },
    }));
  };

  const handleLanguageChange = (newLang: string) => {
    if (!currentQ) return;
    setSavedAnswers((prev) => ({
      ...prev,
      [currentQ.id]: {
        ...(prev[currentQ.id] || {}),
        question_id: currentQ.id,
        language: newLang,
      },
    }));
  };

  const handleClearAnswer = () => {
    if (!currentQ) return;
    setSavedAnswers((prev) => {
      const copy = { ...prev };
      delete copy[currentQ.id];
      return copy;
    });
  };

  const handleToggleMarkForReview = () => {
    if (!currentQ) return;
    setSavedAnswers((prev) => {
      const existing = prev[currentQ.id] || { question_id: currentQ.id };
      return {
        ...prev,
        [currentQ.id]: {
          ...existing,
          is_marked_for_review: !existing.is_marked_for_review,
        },
      };
    });
  };

  const handleResetCode = () => {
    if (!currentQ) return;
    const starter =
      typeof currentQ.starter_code === 'string'
        ? currentQ.starter_code
        : currentQ.starter_code?.[currentAnswer?.language || 'python'] ||
        '# Write your solution code here\n';
    handleCodeChange(starter);
  };

  // Run code against custom stdin
  const handleRunCode = async () => {
    if (!currentQ) return;
    const code = currentAnswer?.code || '';
    const lang = currentAnswer?.language || 'python';

    try {
      setIsRunning(true);
      const res = await examinationService.runCode(examTypeNorm, examIdNorm, {
        question_id: currentQ.id,
        code,
        language: lang,
        custom_input: customInput,
      });
      setRunResult(res);
    } catch (err: any) {
      setRunResult({
        status: 'error',
        stdout: '',
        stderr: err?.message || 'Execution error encountered.',
        time_ms: 0,
        memory_kb: 0,
      });
    } finally {
      setIsRunning(false);
    }
  };

  // Navigation handlers
  const handleSelectQuestion = (idx: number) => {
    setCurrentIndex(idx);
    setVisitedIndices((prev) => new Set([...prev, idx]));
    setRunResult(null);
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      handleSelectQuestion(currentIndex - 1);
    }
  };

  const handleNext = () => {
    if (currentIndex < questions.length - 1) {
      handleSelectQuestion(currentIndex + 1);
    }
  };

  // Final examination submission
  const handleFinalSubmit = async () => {
    try {
      setIsSubmitting(true);
      const answersList = Object.values(savedAnswersRef.current);
      const result = await examinationService.submitExam(examTypeNorm, examIdNorm, {
        answers: answersList,
      });

      setSubmissionResult(result);
      setSubmitModalOpen(false);
      setViolationModalOpen(false);

      // Exit fullscreen immediately upon submission so results are viewed in normal windowed mode
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => { });
      }
    } catch (err: any) {
      alert(err?.message || 'Failed to finalize examination submission.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Retake exam (resets attempt to fresh clean state)
  const handleRetakeExam = async () => {
    try {
      setLoading(true);
      setSubmissionResult(null);
      setError(null);
      const data = await examinationService.getSession(examTypeNorm, examIdNorm, true);
      setSession(data);
      setSavedAnswers(data.saved_answers || {});
      setRemainingSeconds(data.remaining_seconds || data.duration_minutes * 60);
      setViolationsCount(0);
      setIsTerminated(false);
      setVisitedIndices(new Set([0]));
      setCurrentIndex(0);
      void requestFullscreen();
    } catch (err: any) {
      setError(err?.message || 'Could not initialize fresh examination retake.');
    } finally {
      setLoading(false);
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-slate-800">
        <ClayLoader label="Initializing Secure Examination Environment..." />
        <p className="text-xs text-slate-500 font-mono mt-3">Establishing cryptographic session & anti-cheat sandbox...</p>
      </div>
    );
  }

  // Result view after submission (or viewing previous submission)
  if (submissionResult) {
    return (
      <ExaminationResultView
        result={submissionResult}
        title={session?.title || 'Examination Result'}
        skillName={session?.skill || 'Technical Evaluation'}
        examType={examTypeNorm}
        onRetake={handleRetakeExam}
      />
    );
  }

  // Error state
  if (error || !session) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-slate-800 text-center">
        <div className="bg-white border border-slate-200 p-8 rounded-3xl max-w-md w-full shadow-xl space-y-4">
          <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center mx-auto border border-rose-200 font-bold text-lg">
            !
          </div>
          <h2 className="text-lg font-bold text-slate-900">Examination Session Error</h2>
          <p className="text-xs text-slate-600 font-medium leading-relaxed">
            {error || 'Unable to establish secure examination session with the server.'}
          </p>
          <div className="pt-2 flex flex-col gap-2">
            <button
              onClick={() => loadSession(false)}
              className="w-full py-2.5 px-4 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition-all cursor-pointer flex items-center justify-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Retry Connection
            </button>
            <button
              onClick={() => loadSession(true)}
              className="w-full py-2.5 px-4 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-all cursor-pointer"
            >
              Start New Attempt / Retake
            </button>
            <button
              onClick={() =>
                navigate(examTypeNorm === 'assessment' ? '/student/assessments' : '/student/assignments')
              }
              className="w-full py-2 px-4 rounded-xl text-xs font-semibold text-slate-500 hover:text-slate-800 transition-all cursor-pointer"
            >
              Return to Center
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-slate-50 text-slate-800 overflow-hidden select-none fixed inset-0 z-50">
      {/* 1. Unified Examination Header */}
      <ExaminationHeader
        title={session.title}
        skillName={session.skill}
        examType={examTypeNorm}
        currentQuestionIndex={currentIndex}
        totalQuestions={questions.length}
        remainingSeconds={remainingSeconds}
        isOnline={isOnline}
        violationsCount={violationsCount}
        maxViolations={session.max_violations_allowed}
        onSubmitClick={() => setSubmitModalOpen(true)}
        onRequestFullscreen={requestFullscreen}
        isFullscreen={isFullscreen}
      />

      {/* 2. Main Examination Body */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
        {/* Question Area */}
        <div className="flex-1 flex flex-col overflow-hidden bg-slate-50">
          {currentQ ? (
            currentQ.type === 'mcq' ? (
              <MCQRenderer
                question={currentQ}
                selectedOption={currentAnswer?.selected_option}
                onSelectOption={handleOptionSelect}
              />
            ) : (
              <CodingRenderer
                question={currentQ}
                code={currentAnswer?.code ?? (typeof currentQ.starter_code === 'string' ? currentQ.starter_code : currentQ.starter_code?.python ?? '')}
                language={currentAnswer?.language || 'python'}
                supportedLanguages={currentQ.supported_languages || session.supported_languages}
                customInput={customInput}
                runResult={runResult}
                isRunning={isRunning}
                onCodeChange={handleCodeChange}
                onLanguageChange={handleLanguageChange}
                onCustomInputChange={setCustomInput}
                onResetCode={handleResetCode}
                onRunClick={handleRunCode}
              />
            )
          ) : (
            <div className="flex items-center justify-center h-full text-slate-400 text-sm">
              No questions found for this examination.
            </div>
          )}
        </div>

        {/* Question Palette Sidebar */}
        <div className="w-full md:w-64 lg:w-72 shrink-0 h-48 md:h-full border-t md:border-t-0 border-l border-slate-200 bg-white">
          <QuestionPalette
            questions={questions}
            currentIndex={currentIndex}
            savedAnswers={savedAnswers}
            visitedIndices={visitedIndices}
            onSelectQuestion={handleSelectQuestion}
            onPrev={handlePrev}
            onNext={handleNext}
            onToggleMarkForReview={handleToggleMarkForReview}
            onClearAnswer={handleClearAnswer}
          />
        </div>
      </div>

      {/* 2. Strict Lockdown Exit Veil & Security Incident Overlay */}
      <ViolationModal
        isOpen={(!isFullscreen || violationModalOpen || isTerminated) && !submissionResult}
        violationsCount={violationsCount}
        maxViolations={session.max_violations_allowed}
        reason={!isFullscreen ? 'Exited mandatory examination fullscreen mode.' : violationReason}
        isTerminated={isTerminated}
        isFullscreenExit={!isFullscreen}
        gracePeriodSeconds={session.security_policy.grace_period_seconds || 30}
        onReturnToExam={handleAcknowledgeAndReturn}
        onExitToDashboard={handleExitToDashboard}
        onGraceExpired={handleGraceExpired}
      />

      {/* 5. Submission Confirmation Modal */}
      <ExaminationSubmitModal
        isOpen={submitModalOpen}
        questions={questions}
        savedAnswers={savedAnswers}
        remainingSeconds={remainingSeconds}
        isSubmitting={isSubmitting}
        onConfirm={handleFinalSubmit}
        onCancel={() => setSubmitModalOpen(false)}
      />
    </div>
  );
};
