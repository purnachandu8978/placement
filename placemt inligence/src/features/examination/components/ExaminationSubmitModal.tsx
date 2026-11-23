import React from 'react';
import { AlertCircle, CheckCircle, Clock, X } from 'lucide-react';
import type { ExaminationQuestion, SavedAnswer } from '../../../services/examinationService';

interface ExaminationSubmitModalProps {
  isOpen: boolean;
  questions: ExaminationQuestion[];
  savedAnswers: Record<string, SavedAnswer>;
  remainingSeconds: number;
  isSubmitting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ExaminationSubmitModal: React.FC<ExaminationSubmitModalProps> = ({
  isOpen,
  questions,
  savedAnswers,
  remainingSeconds,
  isSubmitting,
  onConfirm,
  onCancel,
}) => {
  if (!isOpen) return null;

  const total = questions.length;
  let answeredCount = 0;
  let markedCount = 0;

  questions.forEach((q) => {
    const ans = savedAnswers[q.id];
    const isAns =
      ans &&
      ((ans.selected_option !== undefined && ans.selected_option !== null) ||
        (ans.code && ans.code.trim().length > 0));

    if (isAns) answeredCount++;
    if (ans?.is_marked_for_review) markedCount++;
  });

  const unansweredCount = total - answeredCount;

  const formatTime = (secs: number) => {
    const safe = Math.max(0, secs);
    const h = Math.floor(safe / 3600);
    const m = Math.floor((safe % 3600) / 60);
    const s = safe % 60;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    return `${m}m ${s}s`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="bg-white border border-slate-200 max-w-md w-full rounded-3xl shadow-2xl p-6 text-slate-800 select-none">
        {/* Header */}
        <div className="flex items-center justify-between pb-3.5 border-b border-slate-100">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center">
              <CheckCircle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Submit Examination</h3>
              <p className="text-xs text-slate-500 font-medium">Review summary before finalizing your attempt</p>
            </div>
          </div>
          <button
            onClick={onCancel}
            disabled={isSubmitting}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tally Stats Grid */}
        <div className="grid grid-cols-3 gap-2.5 my-5">
          <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200 text-center">
            <span className="text-emerald-700 text-2xl font-black block">{answeredCount}</span>
            <span className="text-[11px] text-slate-600 font-semibold">Answered</span>
          </div>
          <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200 text-center">
            <span className="text-amber-700 text-2xl font-black block">{unansweredCount}</span>
            <span className="text-[11px] text-slate-600 font-semibold">Unanswered</span>
          </div>
          <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200 text-center">
            <span className="text-purple-700 text-2xl font-black block">{markedCount}</span>
            <span className="text-[11px] text-slate-600 font-semibold">For Review</span>
          </div>
        </div>

        {/* Time Remaining & Warning */}
        <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 space-y-2 mb-6 text-xs text-slate-700">
          <div className="flex items-center justify-between font-mono">
            <span className="text-slate-600 font-medium flex items-center space-x-1.5">
              <Clock className="w-3.5 h-3.5 text-blue-600" />
              <span>Time Remaining:</span>
            </span>
            <span className="text-blue-700 font-bold">{formatTime(remainingSeconds)}</span>
          </div>

          {unansweredCount > 0 && (
            <div className="flex items-start space-x-2 text-amber-800 pt-2 border-t border-slate-200">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span className="leading-relaxed">
                You have <strong>{unansweredCount} unanswered</strong> questions. Are you sure you wish to submit now?
              </span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center space-x-3">
          <button
            onClick={onCancel}
            disabled={isSubmitting}
            className="flex-1 py-2.5 px-4 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 transition-all cursor-pointer"
          >
            Continue Exam
          </button>
          <button
            onClick={onConfirm}
            disabled={isSubmitting}
            className="flex-1 py-2.5 px-4 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white shadow-xs transition-all active:scale-98 flex items-center justify-center space-x-1.5 cursor-pointer"
          >
            {isSubmitting ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Grading Attempt...</span>
              </>
            ) : (
              <span>Confirm & Submit</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
