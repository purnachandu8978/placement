import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Card, CardHeader } from '../../../components/common/Card';
import { Button } from '../../../components/common/Button';
import { Badge } from '../../../components/common/Badge';
import { ScoreRing } from '../../../components/common/ScoreRing';
import { ProgressBar } from '../../../components/common/ProgressBar';
import { ClayLoader } from '../../../components/common/ClayLoader';
import { readinessService } from '../../../services/readinessService';
import { jobService } from '../../../services/jobService';
import type { PlacementReadinessSummary, JobPosting } from '../../../types';

export const PlacementReadinessPage: React.FC = () => {
  const navigate = useNavigate();
  const [readiness, setReadiness] = useState<
    (PlacementReadinessSummary & { rawMetrics?: any; readinessBand?: string }) | null
  >(null);
  const [jobs, setJobs] = useState<JobPosting[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadReadiness() {
      try {
        const [data, jobList] = await Promise.all([
          readinessService.getReadinessSummary(),
          jobService.getJobs().catch(() => []),
        ]);
        setReadiness(data);
        setJobs(jobList.slice(0, 4));
      } finally {
        setLoading(false);
      }
    }
    loadReadiness();
  }, []);

  if (loading) {
    return <ClayLoader label="Computing Placement Readiness Index..." />;
  }

  const overallScore = Math.round(readiness?.overallScore ?? 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            Placement Readiness Intelligence
          </h1>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            5-Pillar composite index calculated strictly from your MongoDB Atlas records.
          </p>
        </div>

        <Badge variant={overallScore >= 75 ? 'success' : 'brand'} size="md" dot>
          {readiness?.readinessBand || readiness?.tierReadiness || 'Foundation'}
        </Badge>
      </div>

      {/* Main Readiness Banner */}
      <div className="clay-card-peach p-6 sm:p-8 border border-orange-200 shadow-md">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-center">
          <div className="flex flex-col items-center justify-center p-4 border-b lg:border-b-0 lg:border-r border-orange-200/80">
            <ScoreRing
              score={overallScore}
              size="xl"
              label="Overall Readiness Score"
              sublabel={readiness?.rawMetrics?.has_resume ? 'Resume Active' : 'Start with Resume Upload'}
              showTier
            />
          </div>

          <div className="lg:col-span-2 space-y-3">
            <div>
              <span className="text-xs font-mono font-bold text-orange-700 uppercase">Current Bracket:</span>
              <h2 className="text-xl font-black text-slate-900 mt-0.5">
                {overallScore === 0
                  ? 'New Profile — 0% Readiness Baseline'
                  : readiness?.tierReadiness}
              </h2>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed font-medium">
                {overallScore === 0
                  ? 'Every metric starts transparently at 0%. Upload your resume, pass skill assessments (75%+), complete practical assignments, and execute your weekly roadmap to grow your readiness score.'
                  : `Calculated from verified skills (${readiness?.rawMetrics?.verified_skills_count ?? 0}), assessments completed (${readiness?.rawMetrics?.assessments_completed ?? 0}), resume ATS quality, assignments (${readiness?.rawMetrics?.assignments_submitted ?? 0}), and roadmap progress.`}
              </p>
            </div>

            {jobs.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-orange-200/80 text-xs font-medium">
                {jobs.map((job) => (
                  <div key={job.id}>
                    <span className="text-slate-500 block text-[11px] truncate">{job.company}:</span>
                    <span
                      className={`font-mono font-bold ${
                        (job.matchScore ?? 0) >= 75
                          ? 'text-emerald-700'
                          : (job.matchScore ?? 0) > 0
                          ? 'text-orange-700'
                          : 'text-slate-400'
                      }`}
                    >
                      {job.matchScore ?? 0}% Match
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 5 Pillars */}
      <Card variant="default">
        <CardHeader title="The 5 Engineering Pillars" subtitle="Live weighted audit from MongoDB collections" />
        <div className="space-y-4">
          {readiness?.metrics.map((metric, idx) => (
            <div key={idx} className="p-4 rounded-2xl bg-orange-50/40 border border-orange-100 text-xs space-y-2">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                <div>
                  <h4 className="text-xs font-bold text-slate-900">{metric.name}</h4>
                  <p className="text-[11px] text-slate-500 font-medium mt-0.5">{metric.details}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[11px] font-mono text-slate-500 font-semibold">Weight: {metric.weight}%</span>
                  <span className="font-mono font-bold text-emerald-700 text-sm">{metric.score}%</span>
                </div>
              </div>
              <ProgressBar value={metric.score} size="sm" variant="brand" />
            </div>
          ))}
        </div>
      </Card>

      {/* Recommended Actions */}
      <Card variant="default">
        <CardHeader title="Next Recommended Actions" subtitle="Direct steps generated by the Readiness Engine" />
        <div className="space-y-3">
          {readiness?.recommendedActions.map((action) => (
            <div
              key={action.id}
              className="p-4 rounded-2xl bg-white border border-slate-200/90 hover:border-orange-300 shadow-2xs flex items-center justify-between gap-4 transition-all"
            >
              <div className="flex items-center gap-3">
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase ${
                    action.urgency === 'high'
                      ? 'bg-rose-50 text-rose-800 border border-rose-200'
                      : 'bg-amber-50 text-amber-800 border border-amber-200'
                  }`}
                >
                  {action.urgency}
                </span>
                <span className="text-xs font-bold text-slate-800">{action.title}</span>
              </div>

              <Button
                variant="white"
                size="sm"
                className="text-xs font-bold text-orange-700 hover:text-orange-800"
                rightIcon={<ArrowRight className="w-3.5 h-3.5" />}
                onClick={() => navigate(action.actionUrl)}
              >
                Open
              </Button>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
};
