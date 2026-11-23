import React from 'react';
import { Bookmark, ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react';
import type { ExaminationQuestion, SavedAnswer } from '../../../services/examinationService';

export interface QuestionPaletteProps {
  questions: ExaminationQuestion[];
  currentIndex: number;
  savedAnswers: Record<string, SavedAnswer>;
  visitedIndices: Set<number>;
  onSelectQuestion: (index: number) => void;
  onPrev: () => void;
  onNext: () => void;
  onToggleMarkForReview: () => void;
  onClearAnswer: () => void;
}

export const QuestionPalette: React.FC<QuestionPaletteProps> = ({
  questions,
  currentIndex,
  savedAnswers,
  visitedIndices,
  onSelectQuestion,
  onPrev,
  onNext,
  onToggleMarkForReview,
  onClearAnswer,
}) => {
  const currentQ = questions[currentIndex];
  const currentAnswer = currentQ ? savedAnswers[currentQ.id] : undefined;
  const isMarked = currentAnswer?.is_marked_for_review ?? false;

  // Determine question status
  const getQuestionStatus = (q: ExaminationQuestion, index: number) => {
    const ans = savedAnswers[q.id];
    const isAns =
      ans &&
      ((ans.selected_option !== undefined && ans.selected_option !== null) ||
        (ans.code && ans.code.trim().length > 0));

    if (ans?.is_marked_for_review) return 'marked';
    if (isAns) return 'answered';
    if (visitedIndices.has(index)) return 'unanswered';
    return 'not_visited';
  };

  // State tally
  const counts = questions.reduce(
    (acc, q, idx) => {
      const status = getQuestionStatus(q, idx);
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    },
    { answered: 0, unanswered: 0, marked: 0, not_visited: 0 } as Record<string, number>
  );

  return (
    <div className="bg-white border-l border-slate-200 flex flex-col h-full w-full select-none text-slate-800">
      {/* Palette Header */}
      <div className="p-3 border-b border-slate-200 bg-slate-50/80">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">Question Palette</h3>
      </div>

      {/* Palette Legend */}
      <div className="grid grid-cols-2 gap-2 p-3 text-[11px] border-b border-slate-200 bg-white">
        <div className="flex items-center space-x-2">
          <span className="w-5 h-5 rounded bg-emerald-600 text-white font-bold flex items-center justify-center text-[10px] shadow-2xs">
            {counts.answered}
          </span>
          <span className="text-slate-600 font-medium">Answered</span>
        </div>
        <div className="flex items-center space-x-2">
          <span className="w-5 h-5 rounded bg-amber-100 text-amber-800 border border-amber-300 font-bold flex items-center justify-center text-[10px]">
            {counts.unanswered}
          </span>
          <span className="text-slate-600 font-medium">Unanswered</span>
        </div>
        <div className="flex items-center space-x-2">
          <span className="w-5 h-5 rounded bg-purple-600 text-white font-bold flex items-center justify-center text-[10px] shadow-2xs">
            {counts.marked}
          </span>
          <span className="text-slate-600 font-medium">For Review</span>
        </div>
        <div className="flex items-center space-x-2">
          <span className="w-5 h-5 rounded bg-slate-100 text-slate-600 border border-slate-200 font-bold flex items-center justify-center text-[10px]">
            {counts.not_visited}
          </span>
          <span className="text-slate-500 font-medium">Not Visited</span>
        </div>
      </div>

      {/* Question Grid Buttons */}
      <div className="flex-1 overflow-y-auto p-3 bg-slate-50/40">
        <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
          {questions.map((q, idx) => {
            const status = getQuestionStatus(q, idx);
            const isCurrent = idx === currentIndex;

            let bgClass = 'bg-white text-slate-600 border-slate-200 hover:border-slate-400 hover:bg-slate-50';
            if (status === 'answered') {
              bgClass = 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600 font-bold shadow-2xs';
            } else if (status === 'marked') {
              bgClass = 'bg-purple-600 hover:bg-purple-700 text-white border-purple-600 font-bold shadow-2xs';
            } else if (status === 'unanswered') {
              bgClass = 'bg-amber-100 hover:bg-amber-200 text-amber-900 border-amber-300 font-medium';
            }

            const currentRing = isCurrent
              ? 'ring-2 ring-blue-600 ring-offset-2 ring-offset-white font-black scale-105'
              : '';

            return (
              <button
                key={q.id || idx}
                onClick={() => onSelectQuestion(idx)}
                className={`h-9 rounded-lg font-medium text-xs flex items-center justify-center border transition-all cursor-pointer ${bgClass} ${currentRing}`}
                title={`Question ${idx + 1} (${status.replace('_', ' ')})`}
              >
                {idx + 1}
              </button>
            );
          })}
        </div>
      </div>

      {/* Action Controls for Current Question */}
      <div className="p-3 border-t border-slate-200 bg-white space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={onToggleMarkForReview}
            className={`flex items-center justify-center space-x-1.5 py-2 px-2 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
              isMarked
                ? 'bg-purple-50 border-purple-300 text-purple-700 shadow-2xs'
                : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700'
            }`}
          >
            <Bookmark className={`w-3.5 h-3.5 ${isMarked ? 'fill-purple-600 text-purple-600' : 'text-slate-400'}`} />
            <span>{isMarked ? 'Unmark' : 'Review Later'}</span>
          </button>

          <button
            onClick={onClearAnswer}
            className="flex items-center justify-center space-x-1.5 py-2 px-2 rounded-lg text-xs font-semibold bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 transition-all cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
            <span>Clear Answer</span>
          </button>
        </div>

        {/* Previous / Next Navigation */}
        <div className="grid grid-cols-2 gap-2 pt-1">
          <button
            onClick={onPrev}
            disabled={currentIndex === 0}
            className="flex items-center justify-center space-x-1 py-2 px-3 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-700 border border-slate-200 transition-all cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Previous</span>
          </button>

          <button
            onClick={onNext}
            disabled={currentIndex === questions.length - 1}
            className="flex items-center justify-center space-x-1 py-2 px-3 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white shadow-xs transition-all cursor-pointer"
          >
            <span>Next</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
