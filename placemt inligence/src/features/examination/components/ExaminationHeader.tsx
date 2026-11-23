import React from 'react';
import { Clock, ShieldAlert, Wifi, WifiOff, CheckCircle2, Maximize2 } from 'lucide-react';
import { formatTimerSeconds } from '../../../utils/dateUtils';

interface ExaminationHeaderProps {
  title: string;
  skillName: string;
  examType: 'assessment' | 'assignment';
  currentQuestionIndex: number;
  totalQuestions: number;
  remainingSeconds: number;
  isOnline: boolean;
  violationsCount: number;
  maxViolations: number;
  onSubmitClick: () => void;
  onRequestFullscreen?: () => void;
  isFullscreen?: boolean;
}

export const ExaminationHeader: React.FC<ExaminationHeaderProps> = ({
  title,
  skillName,
  examType,
  currentQuestionIndex,
  totalQuestions,
  remainingSeconds,
  isOnline,
  violationsCount,
  maxViolations,
  onSubmitClick,
  onRequestFullscreen,
  isFullscreen,
}) => {
  const formatTime = (secs: number) => {
    return formatTimerSeconds(secs);
  };

  const isCriticalTime = remainingSeconds <= 120;
  const isWarningTime = remainingSeconds <= 600 && !isCriticalTime;

  return (
    <header className="bg-white border-b border-slate-200 text-slate-800 px-4 py-2.5 flex items-center justify-between select-none shadow-xs z-30">
      {/* Branding & Exam Meta */}
      <div className="flex items-center space-x-3">
        <div className="flex items-center space-x-2.5">
          <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center font-black text-white text-sm shadow-xs">
            PI
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200">
                {examType === 'assessment' ? 'Standardized Assessment' : 'Workstation Assignment'}
              </span>
              <h1 className="text-sm font-bold text-slate-900 truncate max-w-xs md:max-w-md">
                {title || skillName}
              </h1>
            </div>
            <p className="text-[11px] text-slate-500 font-medium mt-0.5">
              Question <span className="text-blue-600 font-bold">{currentQuestionIndex + 1}</span> of {totalQuestions}
            </p>
          </div>
        </div>
      </div>

      {/* Center: Live Timer & Warnings */}
      <div className="flex items-center space-x-3">
        {/* Violation Warning Pill */}
        {violationsCount > 0 && (
          <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-md bg-amber-50 border border-amber-300 text-amber-800 text-xs font-semibold">
            <ShieldAlert className="w-3.5 h-3.5 text-amber-600" />
            <span>
              Warnings: {violationsCount}/{maxViolations}
            </span>
          </div>
        )}

        {/* Countdown Timer */}
        <div
          className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg border font-mono font-bold text-sm tracking-wide shadow-2xs ${
            isCriticalTime
              ? 'bg-rose-50 border-rose-300 text-rose-700 animate-pulse'
              : isWarningTime
              ? 'bg-amber-50 border-amber-300 text-amber-800'
              : 'bg-slate-50 border-slate-200 text-slate-800'
          }`}
        >
          <Clock className={`w-4 h-4 ${isCriticalTime ? 'text-rose-600' : 'text-slate-500'}`} />
          <span>{formatTime(remainingSeconds)}</span>
        </div>
      </div>

      {/* Right Controls: Connectivity, Fullscreen, Submit */}
      <div className="flex items-center space-x-2.5">
        {/* Connectivity status */}
        <div
          className={`hidden md:flex items-center space-x-1.5 text-xs px-2.5 py-1 rounded-full border ${
            isOnline
              ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
              : 'bg-rose-50 border-rose-300 text-rose-700 animate-pulse'
          }`}
          title={isOnline ? 'Connected to secure examination server' : 'Reconnecting to examination server...'}
        >
          {isOnline ? (
            <>
              <Wifi className="w-3.5 h-3.5 text-emerald-600" />
              <span className="font-medium text-[11px]">Online</span>
            </>
          ) : (
            <>
              <WifiOff className="w-3.5 h-3.5 text-rose-600" />
              <span className="font-medium text-[11px]">Offline</span>
            </>
          )}
        </div>

        {/* Fullscreen Button */}
        {!isFullscreen && onRequestFullscreen && (
          <button
            onClick={onRequestFullscreen}
            className="flex items-center space-x-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 transition-colors cursor-pointer"
            title="Re-enter Fullscreen Mode"
          >
            <Maximize2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Fullscreen</span>
          </button>
        )}

        {/* Submit Examination Button */}
        <button
          onClick={onSubmitClick}
          className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition-all active:scale-98 cursor-pointer"
        >
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>Submit Test</span>
        </button>
      </div>
    </header>
  );
};
