import React from 'react';
import { Award, CheckCircle2, XCircle, ArrowRight, ShieldCheck, Home } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { SubmitExamResult } from '../../../services/examinationService';

interface ExaminationResultViewProps {
  result: SubmitExamResult;
  title: string;
  skillName: string;
  examType: 'assessment' | 'assignment';
  onRetake?: () => void;
}

export const ExaminationResultView: React.FC<ExaminationResultViewProps> = ({
  result,
  title,
  skillName,
  examType,
  onRetake,
}) => {
  const navigate = useNavigate();
  const isPassed = result.passed ?? (result.score >= 70);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col items-center justify-center p-4 sm:p-6 select-none">
      <div className="max-w-2xl w-full bg-white border border-slate-200 rounded-3xl shadow-xl p-6 sm:p-8 space-y-6 animate-in fade-in zoom-in-95 duration-200">
        {/* Header Icon & Title */}
        <div className="text-center space-y-3">
          <div
            className={`w-16 h-16 rounded-2xl mx-auto flex items-center justify-center shadow-xs border ${
              isPassed
                ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
                : 'bg-amber-50 text-amber-600 border-amber-200'
            }`}
          >
            {isPassed ? <Award className="w-8 h-8" /> : <ShieldCheck className="w-8 h-8" />}
          </div>

          <div>
            <span className="text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
              {examType === 'assessment' ? 'Standardized Assessment Result' : 'Workstation Assignment Result'}
            </span>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 mt-2">
              {title || skillName}
            </h1>
            <p className="text-xs text-slate-500 font-medium mt-1">
              Examination graded by Placement Intelligence Sandbox Engine
            </p>
          </div>
        </div>

        {/* Score & Verdict Card */}
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 flex flex-col sm:flex-row items-center justify-around gap-4 text-center sm:text-left">
          <div className="space-y-1">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Earned Score
            </span>
            <div className="flex items-baseline justify-center sm:justify-start space-x-1">
              <span className="text-4xl sm:text-5xl font-black text-slate-900 tracking-tight">
                {result.score}%
              </span>
            </div>
            <p className="text-xs text-slate-600 font-mono font-medium">
              Marks: {result.total_earned} / {result.max_total}
            </p>
          </div>

          <div className="flex flex-col items-center sm:items-end space-y-1.5">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Verification Status
            </span>
            <div
              className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-xl font-bold text-sm border ${
                isPassed
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                  : 'bg-amber-50 text-amber-900 border-amber-300'
              }`}
            >
              {isPassed ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <XCircle className="w-4 h-4 text-amber-600" />}
              <span>{isPassed ? 'PASSED & VERIFIED' : 'NEEDS PRACTICE'}</span>
            </div>
            <span className="text-[11px] text-slate-500 font-medium">
              {isPassed
                ? 'Score recorded to Student Verified Portfolio'
                : 'Score archived. Retake available for practice'}
            </span>
          </div>
        </div>

        {/* Question Breakdown List */}
        {result.evaluation_breakdown && result.evaluation_breakdown.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Evaluation Breakdown
            </h3>
            <div className="bg-slate-50 rounded-2xl border border-slate-200 divide-y divide-slate-200/80 max-h-48 overflow-y-auto">
              {result.evaluation_breakdown.map((item, idx) => (
                <div key={idx} className="p-3.5 flex items-center justify-between text-xs font-mono">
                  <div className="flex items-center space-x-2">
                    <span className="text-slate-400 font-bold">#{idx + 1}</span>
                    <span className="text-slate-800 uppercase font-semibold">{item.type}</span>
                    {item.total_tests !== undefined && item.total_tests > 0 && (
                      <span className="text-[11px] text-slate-500">
                        ({item.passed_tests}/{item.total_tests} test cases passed)
                      </span>
                    )}
                  </div>
                  <div className="flex items-center space-x-2">
                    <span
                      className={`font-bold ${
                        item.awarded_marks > 0 ? 'text-emerald-700' : 'text-slate-400'
                      }`}
                    >
                      +{item.awarded_marks} / {item.max_marks} marks
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Navigation Action Buttons */}
        <div className="space-y-3 pt-2">
          {onRetake && (
            <button
              onClick={onRetake}
              className="w-full flex items-center justify-center space-x-2 py-3 px-4 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition-all active:scale-98 cursor-pointer"
            >
              <span>Retake Examination (Start Clean Practice Attempt)</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              onClick={() =>
                navigate(examType === 'assessment' ? '/student/assessments' : '/student/assignments')
              }
              className="flex items-center justify-center space-x-2 py-3 px-4 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 transition-all cursor-pointer"
            >
              <span>Return to {examType === 'assessment' ? 'Assessment Center' : 'Assignment Center'}</span>
            </button>

            <button
              onClick={() => navigate('/student/dashboard')}
              className="flex items-center justify-center space-x-2 py-3 px-4 rounded-xl text-xs font-bold bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 transition-all cursor-pointer"
            >
              <Home className="w-3.5 h-3.5 text-slate-500" />
              <span>Back to Dashboard</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
