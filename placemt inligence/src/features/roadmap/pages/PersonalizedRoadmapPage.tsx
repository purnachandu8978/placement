import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Map,
  CheckCircle2,
  Clock,
  BookOpen,
  ExternalLink,
  RefreshCw,
  Sparkles,
  Target,
  ChevronRight,
  Zap,
} from 'lucide-react';
import { Card, CardHeader } from '../../../components/common/Card';
import { Button } from '../../../components/common/Button';
import { Badge } from '../../../components/common/Badge';
import { ProgressBar } from '../../../components/common/ProgressBar';
import { ClayLoader } from '../../../components/common/ClayLoader';
import { EmptyState } from '../../../components/common/EmptyState';
import { useToast } from '../../../context/ToastContext';
import { useStudentData } from '../../../context/StudentDataContext';
import { roadmapService } from '../../../services/roadmapService';
import type { PersonalizedRoadmap } from '../../../types';

const TARGET_ROLE_OPTIONS = [
  'Full Stack Software Engineer',
  'Backend Software Engineer',
  'Machine Learning / AI Engineer',
  'Cloud & DevOps Architect',
  'Frontend Engineer',
  'Data Engineer',
  'Mobile Applications Engineer',
];

export const PersonalizedRoadmapPage: React.FC = () => {
  const navigate = useNavigate();
  const { success, error } = useToast();
  const { refreshAll } = useStudentData();
  const [roadmap, setRoadmap] = useState<(PersonalizedRoadmap & { hasRoadmap?: boolean; skillFocus?: string[] }) | null>(null);
  const [activeWeekNumber, setActiveWeekNumber] = useState<number>(1);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [targetRoleInput, setTargetRoleInput] = useState<string>('');
  const [showRoleSelector, setShowRoleSelector] = useState(false);

  useEffect(() => {
    async function loadRoadmap() {
      try {
        const data = await roadmapService.getRoadmap();
        setRoadmap(data);
        if (data?.targetRole) {
          setTargetRoleInput(data.targetRole);
        }
      } finally {
        setLoading(false);
      }
    }
    loadRoadmap();
  }, []);

  const handleToggleTask = async (taskId: string) => {
    try {
      const updated = await roadmapService.toggleTaskCompletion(taskId);
      setRoadmap(updated);
      await refreshAll();
      success('Task progress synced with MongoDB.');
    } catch (err: any) {
      error(err?.message || 'Unable to update task.');
    }
  };

  const handleGenerate = async (selectedRole?: string) => {
    const roleToUse = (selectedRole || targetRoleInput || roadmap?.targetRole || 'Software Engineer').trim();
    setGenerating(true);
    try {
      const data = await roadmapService.generateRoadmap(roleToUse);
      setRoadmap(data);
      if (data?.targetRole) {
        setTargetRoleInput(data.targetRole);
      }
      setShowRoleSelector(false);
      await refreshAll();
      success(`Generated Gemini AI 4-week roadmap tailored for "${roleToUse}"!`);
    } catch (err: any) {
      error(err?.message || 'Could not generate roadmap.');
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return <ClayLoader label="Loading Personalized 4-Week Roadmap..." />;
  }

  const hasRoadmap = Boolean(roadmap?.hasRoadmap && roadmap?.weeks && roadmap.weeks.length > 0);
  const activeWeek = roadmap?.weeks.find((w) => w.weekNumber === activeWeekNumber) || roadmap?.weeks[0];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            Personalized 4-Week Study Roadmap
          </h1>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            {hasRoadmap
              ? `Tailored around ${roadmap?.targetRole || 'your resume profile'}`
              : 'Auto-generated in MongoDB Atlas from your uploaded resume'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {hasRoadmap && (
            <Button
              variant="white"
              size="sm"
              onClick={() => setShowRoleSelector(!showRoleSelector)}
              leftIcon={<Target className="w-3.5 h-3.5 text-orange-600" />}
            >
              {showRoleSelector ? 'Hide Role Selector' : 'Change Target Role'}
            </Button>
          )}
          {hasRoadmap && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => handleGenerate()}
              isLoading={generating}
              leftIcon={<Sparkles className="w-3.5 h-3.5 text-white" />}
            >
              Regenerate with Gemini AI
            </Button>
          )}
          <Button variant="white" size="sm" onClick={() => navigate('/student/assignments')}>
            Assignment Center
          </Button>
        </div>
      </div>

      {/* Target Role Selector Card */}
      {showRoleSelector && hasRoadmap && (
        <Card variant="default" className="border-orange-300 bg-orange-50/40">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Target className="w-4 h-4 text-[#E86144]" />
                <h3 className="text-xs font-bold text-slate-900">Select Target Role to Achieve</h3>
              </div>
              <span className="text-[10px] font-mono text-orange-700 bg-white px-2.5 py-0.5 rounded-full font-bold border border-orange-200 inline-flex items-center gap-1 shadow-2xs">
                <Sparkles className="w-3 h-3 text-orange-500" /> Powered by Google Gemini AI
              </span>
            </div>
            <p className="text-xs text-slate-600 font-medium">
              Choose the role you want to achieve. Gemini AI analyzes your uploaded resume skills, project history, and high-priority market gaps to build a customized 4-week preparation plan.
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              {TARGET_ROLE_OPTIONS.map((role) => (
                <button
                  key={role}
                  onClick={() => {
                    setTargetRoleInput(role);
                    handleGenerate(role);
                  }}
                  disabled={generating}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    targetRoleInput === role
                      ? 'bg-orange-500 text-white shadow-sm'
                      : 'bg-white text-slate-700 border border-slate-200 hover:border-orange-300 hover:bg-orange-50'
                  }`}
                >
                  {role}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 pt-2 border-t border-orange-100">
              <input
                type="text"
                placeholder="Or enter custom role (e.g. Distributed Systems Engineer)..."
                value={targetRoleInput}
                onChange={(e) => setTargetRoleInput(e.target.value)}
                className="flex-1 px-3 py-1.5 text-xs rounded-xl border border-slate-200 bg-white font-medium focus:outline-none focus:border-orange-400"
              />
              <Button
                variant="primary"
                size="sm"
                onClick={() => handleGenerate()}
                isLoading={generating}
                leftIcon={<Sparkles className="w-3.5 h-3.5" />}
              >
                Generate for Role
              </Button>
            </div>
          </div>
        </Card>
      )}

      {!hasRoadmap ? (
        <EmptyState
          title="No Personalized Roadmap Generated Yet"
          description="Your study plan starts at 0% cleanly. Upload your resume first so our engine tailors weeks 1-4 directly to your tech stack and target roles."
          icon={<Map className="w-8 h-8 text-[#E86144]" />}
          actionText="Upload Resume Now"
          onAction={() => navigate('/student/resume')}
        />
      ) : (
        <>
          {/* Progress Banner */}
          <div className="clay-card-peach p-6 border border-orange-200 shadow-sm">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-bold text-slate-900">{roadmap?.targetRole || 'Overall Progression'}</span>
                  <Badge variant="brand" size="sm">4-Week Track</Badge>
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-orange-100 text-orange-800 text-[10px] font-bold border border-orange-200">
                    <Sparkles className="w-3 h-3 text-orange-600" /> Gemini AI Personalized
                  </span>
                  {(roadmap?.skillFocus || []).slice(0, 4).map((s) => (
                    <Badge key={s} variant="brand" size="sm">{s}</Badge>
                  ))}
                </div>
                <p className="text-xs text-slate-600 font-medium mt-1">
                  Completed {roadmap?.completedTasks} of {roadmap?.totalTasks} engineering tasks
                </p>
              </div>

              <div className="text-right">
                <span className="text-3xl font-black font-mono text-orange-600">
                  {roadmap?.progressPercentage ?? 0}%
                </span>
              </div>
            </div>

            <ProgressBar value={roadmap?.progressPercentage || 0} variant="brand" size="md" />
          </div>

          {/* Week Tabs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {roadmap?.weeks.map((week) => {
              const isSelected = week.weekNumber === activeWeekNumber;
              const completedCount = week.tasks.filter((t) => t.isCompleted).length;

              return (
                <button
                  key={week.weekNumber}
                  onClick={() => setActiveWeekNumber(week.weekNumber)}
                  className={`p-4 rounded-2xl border text-left transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-gradient-to-r from-orange-50 to-amber-50/80 border-2 border-orange-400 shadow-md shadow-orange-500/10'
                      : 'bg-white border-slate-200 hover:border-orange-200 hover:bg-orange-50/30'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-mono font-bold text-orange-600">Week {week.weekNumber}</span>
                    <span className="font-mono text-[10px] font-bold text-slate-500">
                      {completedCount}/{week.tasks.length}
                    </span>
                  </div>
                  <h4 className="text-xs font-bold text-slate-900 mt-1.5 truncate">{week.theme}</h4>
                </button>
              );
            })}
          </div>

          {/* Active Week Content */}
          {activeWeek && (
            <div className="space-y-6">
              <Card variant="default">
                <div className="pb-3 border-b border-orange-100">
                  <span className="text-xs font-mono font-bold text-orange-600 uppercase">
                    Week {activeWeek.weekNumber} Milestone
                  </span>
                  <h2 className="text-base font-bold text-slate-900 mt-0.5">{activeWeek.title}</h2>
                  <p className="text-xs text-slate-600 font-medium mt-1">{activeWeek.description}</p>
                </div>

                <div className="mt-4 space-y-3">
                  {activeWeek.tasks.map((task) => (
                    <div
                      key={task.id}
                      className={`p-4 rounded-2xl border transition-all ${
                        task.isCompleted
                          ? 'bg-slate-50/80 border-slate-200 opacity-85'
                          : 'bg-white border-slate-200 hover:border-orange-300 shadow-2xs'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3">
                          <button
                            onClick={() => handleToggleTask(task.id)}
                            className={`w-5 h-5 rounded-lg border mt-0.5 flex items-center justify-center transition-colors cursor-pointer shrink-0 ${
                              task.isCompleted
                                ? 'bg-emerald-500 border-emerald-500 text-white'
                                : 'border-slate-300 hover:border-orange-400 bg-white'
                            }`}
                          >
                            {task.isCompleted && <CheckCircle2 className="w-3.5 h-3.5" />}
                          </button>

                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-mono font-bold text-slate-500">Module {task.dayNumber}</span>
                              <h4 className={`text-xs font-bold ${task.isCompleted ? 'text-slate-400 line-through' : 'text-slate-900'}`}>
                                {task.title}
                              </h4>
                              <span className="text-[10px] font-mono font-bold text-orange-700 bg-orange-50 px-2 py-0.5 rounded-md border border-orange-200 capitalize">
                                {task.type}
                              </span>
                            </div>
                            <p className="text-xs text-slate-600 font-medium mt-1 leading-relaxed">{task.description}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-slate-500 shrink-0">
                          <Clock className="w-3.5 h-3.5" />
                          <span>{task.estimatedMinutes}m</span>
                        </div>
                      </div>

                      {task.resourceLinks.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap items-center gap-2">
                          <span className="text-[10px] font-mono font-bold text-slate-400 uppercase">Resources:</span>
                          {task.resourceLinks.map((res, idx) => (
                            <a
                              key={idx}
                              href={res.url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-orange-50/60 hover:bg-orange-100/80 text-[11px] text-orange-800 font-bold border border-orange-200"
                            >
                              <BookOpen className="w-3 h-3 text-orange-600" />
                              <span>{res.title}</span>
                              <ExternalLink className="w-2.5 h-2.5 text-slate-400" />
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          )}
        </>
      )}
    </div>
  );
};
