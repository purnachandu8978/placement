import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CheckSquare,
  Clock,
  Trophy,
  CheckCircle2,
  AlertCircle,
  Play,
  History,
  ShieldCheck,
  ChevronRight,
  Terminal,
  HelpCircle,
  Search,
  Sparkles,
} from 'lucide-react';
import { Card, CardHeader } from '../../../components/common/Card';
import { Button } from '../../../components/common/Button';
import { Badge, SkillStatusBadge } from '../../../components/common/Badge';
import { ScoreRing } from '../../../components/common/ScoreRing';
import { Input } from '../../../components/common/Input';
import { ClayLoader } from '../../../components/common/ClayLoader';
import { assessmentService, type SkillAssessmentMeta } from '../../../services/assessmentService';
import type { AssessmentSubmission } from '../../../types';

export const AssessmentCenterPage: React.FC = () => {
  const navigate = useNavigate();
  const [skillAssessments, setSkillAssessments] = useState<SkillAssessmentMeta[]>([]);
  const [submissions, setSubmissions] = useState<AssessmentSubmission[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const [metaList, subs] = await Promise.all([
          assessmentService.getSkillAssessmentsList(),
          assessmentService.getSubmissions(),
        ]);
        setSkillAssessments(metaList);
        setSubmissions(subs);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  if (loading) {
    return <ClayLoader label="Loading Assessment Suite..." />;
  }

  const filtered = skillAssessments.filter((s) =>
    s.skillName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            Technical Assessment Center
          </h1>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Strict standardized test suite: 5-Question (3 MCQ + 1 Simple + 1 Hard) & 10-Question (6 MCQ + 2 Simple + 2 Hard).
          </p>
        </div>

        <div className="w-full sm:w-64">
          <Input
            placeholder="Search extracted skills..."
            leftIcon={<Search className="w-4 h-4 text-orange-500" />}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Rules Notice (Peach Claymorphic Banner) */}
      <div className="clay-card-peach p-5 border border-orange-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-xl bg-orange-500 text-white shadow-md shadow-orange-500/20 shrink-0">
            <CheckSquare className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-slate-900">Enterprise Verification Criteria</h3>
            <p className="text-[11px] text-slate-600 mt-0.5 leading-relaxed font-medium">
              Scoring <strong>75% or higher</strong> automatically issues a cryptographically verified credential in your portfolio and upgrades your ATS match score for tier-1 job listings.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono font-bold text-orange-700 bg-white px-3 py-1.5 rounded-xl border border-orange-200 shadow-2xs shrink-0">
          <span>Passing Score:</span>
          <strong className="text-emerald-700 font-black">75%</strong>
        </div>
      </div>

      {/* Skills Assessment Table / Card Grid */}
      {filtered.length === 0 ? (
        <div className="clay-card p-8 sm:p-10 bg-white border-2 border-dashed border-orange-200 text-center space-y-3">
          <p className="text-sm font-bold text-slate-900">
            No Skill Assessments Unlocked Yet
          </p>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Upload your resume in Resume Intelligence so we can automatically unlock proctored 5-question and 10-question assessments for your detected technical skills.
          </p>
          <Button variant="primary" size="sm" onClick={() => navigate('/student/resume')}>
            Upload Resume to Unlock Assessments
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((item) => (
            <div key={item.skillName} className="clay-card p-5 bg-white border border-slate-200/90 hover:border-orange-300 flex flex-col justify-between transition-all">
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-base font-bold text-slate-900">{item.skillName}</h3>
                    <p className="text-[11px] text-slate-500 font-medium">{item.category}</p>
                  </div>
                  <Badge
                    variant={item.isVerified ? 'success' : item.hasAttempted ? 'warning' : 'neutral'}
                    size="sm"
                    dot={item.hasAttempted}
                  >
                    {item.isVerified
                      ? `Verified (${item.previousScore}%)`
                      : item.hasAttempted
                      ? `Attempted (${item.previousScore}%)`
                      : 'Ready to Test'}
                  </Badge>
                </div>

                <div className="mt-4 p-3.5 rounded-xl bg-orange-50/40 border border-orange-100 text-xs space-y-1.5 font-medium">
                  <div className="flex justify-between text-slate-500">
                    <span>Proficiency:</span>
                    <span className="text-slate-800 font-bold">{item.currentProficiency}</span>
                  </div>
                  <div className="flex justify-between text-slate-500">
                    <span>Best Score:</span>
                    <span className="font-mono text-emerald-700 font-bold">
                      {item.previousScore !== undefined ? `${item.previousScore}%` : 'Not attempted'}
                    </span>
                  </div>
                  {item.lastAttemptedDate && (
                    <div className="flex justify-between text-slate-500">
                      <span>Last Attempted:</span>
                      <span className="font-mono text-slate-700 font-bold">{item.lastAttemptedDate}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-5 pt-3 border-t border-slate-100 space-y-2">
                <div className="text-[10px] text-slate-500 font-mono font-bold flex justify-between">
                  <span>Select Assessment Blueprint:</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="white"
                    size="sm"
                    className="text-xs font-bold"
                    onClick={() => navigate(`/exam/assessment/${item.fiveQuestionTestId}/readiness`)}
                  >
                    5-Q Test (30m)
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    className="text-xs font-bold"
                    onClick={() => navigate(`/exam/assessment/${item.tenQuestionTestId}/readiness`)}
                  >
                    10-Q Test (60m)
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Assessment History Section */}
      <Card variant="default">
        <CardHeader
          title="Past Assessment Attempts"
          subtitle="Audit log of completed skill evaluations"
        />

        {submissions.length === 0 ? (
          <p className="text-xs text-slate-400 py-6 text-center">
            No completed assessments recorded yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left text-slate-700 font-medium">
              <thead className="bg-orange-50/60 text-slate-600 uppercase font-mono text-[10px] font-bold border-b border-orange-100">
                <tr>
                  <th className="px-4 py-3">Assessment ID</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Score</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Verification Badge</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {submissions.map((sub) => (
                  <tr key={sub.id} className="hover:bg-orange-50/40 transition-colors">
                    <td className="px-4 py-3 font-bold text-slate-900">{sub.assessmentId}</td>
                    <td className="px-4 py-3 text-slate-500 font-mono">
                      {sub.submittedAt ? (sub.submittedAt.includes('T') ? sub.submittedAt.split('T')[0] : sub.submittedAt) : 'Recent'}
                    </td>
                    <td className="px-4 py-3 font-mono font-bold text-emerald-700">{sub.score}%</td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-0.5 rounded-full border text-[10px] font-bold ${
                          sub.passed
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                            : 'bg-amber-50 text-amber-800 border-amber-200'
                        }`}
                      >
                        {sub.passed ? 'Passed' : 'Not Passed'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 text-orange-700 font-mono font-bold text-[11px]">
                        <ShieldCheck className="w-3.5 h-3.5 text-orange-600" />
                        {sub.verifiedSkillsEarned.length > 0 ? sub.verifiedSkillsEarned.join(', ') : '—'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};
