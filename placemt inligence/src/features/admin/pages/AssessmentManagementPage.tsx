import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layers } from 'lucide-react';
import { Button } from '../../../components/common/Button';
import { Badge } from '../../../components/common/Badge';
import { ClayLoader } from '../../../components/common/ClayLoader';
import { useToast } from '../../../context/ToastContext';
import { apiClient } from '../../../services/apiClient';
import { adminService } from '../../../services/adminService';

interface PublishedAssessmentSummary {
  id: string;
  skill_name: string;
  category: string;
  title: string;
  assessment_size: number;
  duration_minutes: number;
  pass_score_percentage: number;
  question_distribution?: { mcq?: number; simple_coding?: number; hard_coding?: number };
}

export const AssessmentManagementPage: React.FC = () => {
  const navigate = useNavigate();
  const { error } = useToast();
  const [items, setItems] = useState<PublishedAssessmentSummary[]>([]);
  const [totalAttempts, setTotalAttempts] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [assessments, metrics] = await Promise.all([
          apiClient.get<PublishedAssessmentSummary[]>('/assessments'),
          adminService.getDashboardMetrics(),
        ]);
        setItems(assessments || []);
        setTotalAttempts(metrics.total_assessments_taken ?? 0);
      } catch (err: any) {
        error(err?.message || 'Unable to load MongoDB assessment blueprints.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return <ClayLoader label="Loading MongoDB Assessment Catalog..." />;
  }

  const skillsSet = new Set(items.map((i) => i.skill_name));
  const fiveQCount = items.filter((i) => i.assessment_size === 5).length;
  const tenQCount = items.filter((i) => i.assessment_size === 10).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            Assessment Blueprint & Policy Management
          </h1>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Live published 5-question and 10-question proctored skill tests seeded in MongoDB Atlas.
          </p>
        </div>

        <Button variant="white" size="sm" onClick={() => navigate('/admin/question-bank')}>
          View Question Bank
        </Button>
      </div>

      {/* Summary Blueprint Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="clay-card p-6 bg-white border border-orange-100 space-y-4 shadow-sm">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-[10px] font-mono text-[#E86144] uppercase font-bold">Rapid Track</span>
              <h3 className="text-base font-bold text-slate-900 mt-1">5-Question Skill Verification</h3>
            </div>
            <Badge variant="brand" size="sm">{fiveQCount} Published</Badge>
          </div>
          <div className="p-4 bg-orange-50/40 rounded-2xl border border-orange-100 text-xs space-y-2 font-medium">
            <div className="flex justify-between text-slate-500">
              <span>Distribution:</span>
              <span className="text-slate-900 font-bold">3 MCQ, 1 Simple Coding, 1 Hard Coding</span>
            </div>
            <div className="flex justify-between text-slate-500">
              <span>Duration Limit:</span>
              <span className="font-mono text-slate-900 font-bold">30 mins</span>
            </div>
            <div className="flex justify-between text-slate-500">
              <span>Passing Criteria:</span>
              <span className="font-mono text-emerald-700 font-bold">75%</span>
            </div>
            <div className="flex justify-between text-slate-500">
              <span>Distinct Skills Covered:</span>
              <span className="font-mono text-[#E86144] font-bold">{skillsSet.size} Skills</span>
            </div>
          </div>
        </div>

        <div className="clay-card p-6 bg-white border border-orange-100 space-y-4 shadow-sm">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-[10px] font-mono text-[#E86144] uppercase font-bold">Deep Dive Track</span>
              <h3 className="text-base font-bold text-slate-900 mt-1">10-Question Comprehensive Assessment</h3>
            </div>
            <Badge variant="brand" size="sm">{tenQCount} Published</Badge>
          </div>
          <div className="p-4 bg-orange-50/40 rounded-2xl border border-orange-100 text-xs space-y-2 font-medium">
            <div className="flex justify-between text-slate-500">
              <span>Distribution:</span>
              <span className="text-slate-900 font-bold">6 MCQ, 2 Simple Coding, 2 Hard Coding</span>
            </div>
            <div className="flex justify-between text-slate-500">
              <span>Duration Limit:</span>
              <span className="font-mono text-slate-900 font-bold">60 mins</span>
            </div>
            <div className="flex justify-between text-slate-500">
              <span>Passing Criteria:</span>
              <span className="font-mono text-emerald-700 font-bold">75%</span>
            </div>
            <div className="flex justify-between text-slate-500">
              <span>Total Completed Attempts (All Tests):</span>
              <span className="font-mono text-emerald-700 font-bold">{totalAttempts}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Published Catalog List */}
      <div className="clay-card p-5 bg-white border border-orange-100">
        <div className="flex items-center gap-2 mb-4">
          <Layers className="w-4 h-4 text-[#E86144]" />
          <h3 className="text-sm font-bold text-slate-900">
            Published Assessments in MongoDB ({items.length})
          </h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
          {items.map((a) => (
            <div key={a.id} className="p-3.5 rounded-2xl bg-orange-50/40 border border-orange-100 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="font-bold text-slate-900 truncate">{a.title}</div>
                <div className="text-[11px] text-slate-500">
                  {a.skill_name} • {a.duration_minutes} mins • Pass {a.pass_score_percentage}%
                </div>
              </div>
              <Badge variant="neutral" size="sm">{a.assessment_size}Q</Badge>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
