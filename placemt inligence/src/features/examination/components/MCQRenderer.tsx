import React from 'react';
import type { ExaminationQuestion } from '../../../services/examinationService';

interface MCQRendererProps {
  question: ExaminationQuestion;
  selectedOption: number | null | undefined;
  onSelectOption: (optionIndex: number) => void;
}

export const MCQRenderer: React.FC<MCQRendererProps> = ({
  question,
  selectedOption,
  onSelectOption,
}) => {
  const options = question.options || [];
  const questionText = question.question || question.problem_statement || 'No question prompt provided.';

  return (
    <div className="flex-1 overflow-y-auto p-6 md:p-8 bg-slate-50/60 flex flex-col items-center">
      <div className="w-full max-w-4xl bg-white border border-slate-200 rounded-2xl p-6 md:p-8 shadow-xs space-y-6">
        {/* Question Header & Badges */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center space-x-2">
            <span className="text-xs font-bold px-2.5 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200">
              Multiple Choice Question
            </span>
            {question.difficulty && (
              <span
                className={`text-xs font-semibold px-2.5 py-0.5 rounded-md capitalize border ${
                  question.difficulty === 'hard'
                    ? 'bg-rose-50 text-rose-700 border-rose-200'
                    : question.difficulty === 'medium'
                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                    : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                }`}
              >
                {question.difficulty}
              </span>
            )}
          </div>
          <div className="text-xs font-mono font-medium text-slate-500">
            Points: <span className="text-emerald-700 font-bold">+{question.points || 10}</span>
          </div>
        </div>

        {/* Question Prompt */}
        <div className="prose max-w-none">
          <h2 className="text-base sm:text-lg font-semibold text-slate-900 leading-relaxed whitespace-pre-line">
            {questionText}
          </h2>
        </div>

        {/* Options List */}
        <div className="space-y-3 pt-2">
          {options.map((opt, idx) => {
            const isSelected = selectedOption === idx;
            const letter = String.fromCharCode(65 + idx);

            return (
              <button
                key={idx}
                type="button"
                onClick={() => onSelectOption(idx)}
                className={`w-full text-left p-4 rounded-xl border transition-all flex items-start space-x-3.5 cursor-pointer ${
                  isSelected
                    ? 'bg-blue-50/80 border-blue-600 ring-1 ring-blue-600 text-blue-950 shadow-xs'
                    : 'bg-white hover:bg-slate-50/80 border-slate-200 text-slate-800 hover:border-slate-300'
                }`}
              >
                <span
                  className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 transition-colors ${
                    isSelected
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 border border-slate-200'
                  }`}
                >
                  {letter}
                </span>
                <span className="text-sm font-medium pt-0.5 leading-snug flex-1 select-none">
                  {opt}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
