import React, { useEffect, useState } from 'react';
import { AlertTriangle, ShieldAlert, Clock, Lock, Maximize2, LogOut } from 'lucide-react';

interface ViolationModalProps {
  isOpen: boolean;
  violationsCount: number;
  maxViolations: number;
  reason: string;
  isTerminated: boolean;
  isFullscreenExit?: boolean;
  gracePeriodSeconds?: number;
  onReturnToExam: () => void;
  onExitToDashboard?: () => void;
  onGraceExpired?: () => void;
}

export const ViolationModal: React.FC<ViolationModalProps> = ({
  isOpen,
  violationsCount,
  maxViolations,
  reason,
  isTerminated,
  isFullscreenExit = false,
  gracePeriodSeconds = 30,
  onReturnToExam,
  onExitToDashboard,
  onGraceExpired,
}) => {
  const [remainingGrace, setRemainingGrace] = useState(gracePeriodSeconds);

  useEffect(() => {
    if (!isOpen || isTerminated) return;
    setRemainingGrace(gracePeriodSeconds);

    const timer = setInterval(() => {
      setRemainingGrace((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          if (onGraceExpired) {
            onGraceExpired();
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isOpen, isTerminated, gracePeriodSeconds, onGraceExpired]);

  if (!isOpen) return null;

  const isLastWarning = violationsCount >= maxViolations && !isTerminated;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/95 backdrop-blur-md p-4 sm:p-6 animate-in fade-in duration-200 select-none">
      <div className="bg-white border border-slate-200 max-w-lg w-full rounded-3xl shadow-2xl p-6 sm:p-8 text-slate-800 space-y-5">
        {/* Header Icon & Title */}
        <div className="flex items-start space-x-4">
          <div
            className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 border shadow-xs ${isTerminated
              ? 'bg-rose-50 text-rose-600 border-rose-200'
              : isFullscreenExit
                ? 'bg-amber-50 text-amber-600 border-amber-200 animate-pulse'
                : isLastWarning
                  ? 'bg-rose-50 text-rose-600 border-rose-200'
                  : 'bg-blue-50 text-blue-600 border-blue-200'
              }`}
          >
            {isTerminated ? (
              <Lock className="w-7 h-7" />
            ) : isFullscreenExit ? (
              <Maximize2 className="w-7 h-7" />
            ) : isLastWarning ? (
              <ShieldAlert className="w-7 h-7" />
            ) : (
              <AlertTriangle className="w-7 h-7" />
            )}
          </div>

          <div className="space-y-1">
            <span
              className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full inline-block border ${isTerminated
                ? 'bg-rose-100 text-rose-800 border-rose-300'
                : 'bg-amber-100 text-amber-800 border-amber-300'
                }`}
            >
              {isTerminated ? 'Test Terminated' : isFullscreenExit ? 'Fullscreen Exit Mode' : 'Security Alert'}
            </span>
            <h3 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight leading-tight">
              {isTerminated
                ? 'Examination Terminated'
                : isFullscreenExit
                  ? 'Fullscreen Exited — Examination Paused'
                  : isLastWarning
                    ? 'Final Security Warning'
                    : 'Security Policy Alert'}
            </h3>
            <p className="text-xs text-slate-500 font-medium">
              Placement Intelligence Continuous Anti-Malpractice Supervision
            </p>
          </div>
        </div>

        {/* Diagnostic Metadata Box */}
        <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-xs space-y-2.5">
          <div className="flex justify-between items-center font-mono text-[11px]">
            <span className="text-slate-500">Security Incident:</span>
            <span className="text-rose-700 font-bold max-w-xs truncate text-right">{reason}</span>
          </div>
          <div className="flex justify-between items-center font-mono text-[11px]">
            <span className="text-slate-500">Violations Recorded:</span>
            <span
              className={`font-bold ${violationsCount >= maxViolations ? 'text-rose-700' : 'text-amber-700'
                }`}
            >
              {violationsCount} of {maxViolations} permitted warnings
            </span>
          </div>
        </div>

        {/* Body Description */}
        {isTerminated ? (
          <div className="bg-rose-50 border border-rose-200 p-4 rounded-2xl text-rose-900 text-xs space-y-2">
            <p className="font-bold text-rose-800">
              Maximum permitted violations exceeded. Examination attempt permanently locked.
            </p>
            <p className="leading-relaxed text-rose-700">
              In accordance with institutional integrity rules, the exam has concluded. Your responses, audit timestamps, and webcam supervisory feeds have been archived for administrative review.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-xs text-slate-600 leading-relaxed font-normal">
              {isFullscreenExit ? (
                <span>
                  The examination workstation requires <strong>continuous exclusive full-screen mode</strong>. Leaving full-screen or switching windows blocks your view of the questions. To return to your test, please acknowledge the disruption below.
                </span>
              ) : isLastWarning ? (
                <span className="text-rose-700 font-bold">
                  CRITICAL: This is your final warning. Any subsequent window blur, tab switch, or fullscreen exit will immediately terminate and submit your examination.
                </span>
              ) : (
                <span>
                  Proctored examinations mandate strict screen focus. Switching windows, exiting fullscreen, or using external applications is prohibited and monitored.
                </span>
              )}
            </p>

            {/* Grace Recovery Countdown Bar */}
            <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 space-y-2">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-slate-600 font-medium flex items-center space-x-1.5">
                  <Clock className="w-3.5 h-3.5 text-blue-600" />
                  <span>Return Grace Period:</span>
                </span>
                <span className="text-blue-700 font-bold">{remainingGrace}s remaining</span>
              </div>
              <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                <div
                  className="bg-blue-600 h-full transition-all duration-1000 ease-linear rounded-full"
                  style={{ width: `${(remainingGrace / gracePeriodSeconds) * 100}%` }}
                />
              </div>
              <p className="text-[10px] text-slate-400 text-center font-medium">
                Failure to resume before the timer reaches 0 will lock and submit your examination.
              </p>
            </div>
          </div>
        )}

        {/* Modal Actions */}
        <div className="space-y-2.5 pt-1">
          {isTerminated ? (
            <button
              onClick={onExitToDashboard}
              className="w-full py-3 px-4 rounded-xl text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white shadow-xs transition-all cursor-pointer flex items-center justify-center space-x-2"
            >
              <LogOut className="w-4 h-4" />
              <span>Return to Student Dashboard</span>
            </button>
          ) : (
            <>
              <button
                onClick={onReturnToExam}
                className="w-full py-3.5 px-4 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition-all active:scale-98 cursor-pointer flex items-center justify-center space-x-2"
              >
                <Maximize2 className="w-4 h-4" />
                <span>
                  {isFullscreenExit
                    ? 'I Apologize for Leaving Fullscreen — Return to Exam'
                    : 'Acknowledge Warning & Resume Examination'}
                </span>
              </button>

              {onExitToDashboard && (
                <button
                  onClick={() => {
                    if (window.confirm('Are you sure you want to exit and forfeit this examination attempt?')) {
                      onExitToDashboard();
                    }
                  }}
                  className="w-full py-2 px-3 text-center text-[11px] font-semibold text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                >
                  Forfeit and Exit Examination
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
