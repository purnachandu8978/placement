import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  CheckCircle2,
  ShieldCheck,
  ArrowRight,
  Cpu,
  Upload,
} from 'lucide-react';
import { Card, CardHeader } from '../../../components/common/Card';
import { Button } from '../../../components/common/Button';
import { ProgressBar } from '../../../components/common/ProgressBar';
import { ClayLoader } from '../../../components/common/ClayLoader';
import { EmptyState } from '../../../components/common/EmptyState';
import { skillService, type StudentSkillGapsResponse } from '../../../services/skillService';
import type { SkillItem } from '../../../types';

function slugifySkill(skillName: string): string {
  return skillName
    .toLowerCase()
    .trim()
    .replace(/\+\+/g, 'pp')
    .replace(/#/g, 'sharp')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export const SkillIntelligencePage: React.FC = () => {
  const navigate = useNavigate();
  const [skills, setSkills] = useState<SkillItem[]>([]);
  const [gaps, setGaps] = useState<StudentSkillGapsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const [stSkills, gp] = await Promise.all([
          skillService.getStudentSkills(),
          skillService.getSkillGaps(),
        ]);
        setSkills(stSkills || []);
        setGaps(gp);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  if (loading) {
    return <ClayLoader label="Analyzing Skill Matrix & Gaps..." />;
  }

  const proficiencyLevels: Array<SkillItem['proficiency']> = ['Expert', 'Advanced', 'Intermediate', 'Beginner'];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            Skill Intelligence & Gap Matrix
          </h1>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Live breakdown of your extracted competencies, verified credentials, and employer-demanded skill gaps.
          </p>
        </div>

        <Button
          variant="primary"
          size="sm"
          rightIcon={<ArrowRight className="w-4 h-4" />}
          onClick={() => navigate('/student/assessments')}
        >
          Open Assessment Center
        </Button>
      </div>

      {!gaps?.has_skills && skills.length === 0 ? (
        <EmptyState
          title="No skills detected yet"
          description="Your skill intelligence matrix starts at 0. Upload your resume to automatically extract your core skills and uncover high-priority market gaps."
          icon={<Upload className="w-8 h-8 text-[#E86144]" />}
          actionText="Upload Resume Now"
          onAction={() => navigate('/student/resume')}
        />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card variant="default">
              <CardHeader
                title="Verified Strengths"
                subtitle="Skills validated with 75%+ score or faculty verification"
              />
              {gaps?.strengths.length ? (
                <div className="space-y-2.5">
                  {gaps.strengths.map((str, idx) => (
                    <div
                      key={idx}
                      className="p-3.5 rounded-2xl bg-emerald-50/60 border border-emerald-200 flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        <div>
                          <span className="text-xs text-emerald-950 font-bold">{str.skill}</span>
                          <p className="text-[11px] text-emerald-700">{str.proficiency} • {str.category}</p>
                        </div>
                      </div>
                      <span className="font-mono text-xs font-black text-emerald-700">{Math.round(str.score)}%</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-400 py-4">No verified strengths yet. Complete an assessment to earn verification.</p>
              )}
            </Card>

            <Card variant="default">
              <CardHeader
                title="Unverified Extracted Skills"
                subtitle="Mentioned in resume — take a quick test to verify"
              />
              {gaps?.unverified_skills.length ? (
                <div className="space-y-2.5">
                  {gaps.unverified_skills.map((item, idx) => (
                    <div
                      key={idx}
                      className="p-3.5 rounded-2xl bg-amber-50/60 border border-amber-200 flex items-center justify-between gap-3"
                    >
                      <div className="flex items-start gap-3">
                        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                        <div>
                          <span className="text-xs text-amber-950 font-bold">{item.skill}</span>
                          <p className="text-[11px] text-amber-800">{item.reason}</p>
                        </div>
                      </div>
                      <Button
                        variant="white"
                        size="sm"
                        className="text-[11px] shrink-0"
                        onClick={() => navigate(`/student/assessments/test-${slugifySkill(item.skill)}-5`)}
                      >
                        Verify (5Q)
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-emerald-700 py-4 font-semibold">All extracted skills are verified!</p>
              )}
            </Card>
          </div>

          {gaps && gaps.market_gaps.length > 0 && (
            <Card variant="default">
              <CardHeader
                title="High-Demand Market Gaps"
                subtitle="Skills frequently required across active job postings not yet on your resume"
              />
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {gaps.market_gaps.map((gap) => (
                  <div
                    key={gap.skill}
                    className="clay-card p-5 bg-white border border-orange-200/90 shadow-2xs flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-bold text-slate-900">{gap.skill}</h4>
                        <span className="text-[10px] font-mono text-orange-800 bg-orange-50 px-2 py-0.5 rounded-full border border-orange-200 font-bold">
                          {gap.job_demand_count} Jobs
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 font-medium mt-1">Priority: {gap.priority}</p>
                      <ProgressBar value={Math.min(100, gap.job_demand_count * 25)} size="sm" variant="warning" className="mt-3" />
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-100">
                      <Button
                        variant="white"
                        size="sm"
                        className="w-full text-xs font-bold text-orange-700"
                        onClick={() => navigate(`/student/assessments/test-${slugifySkill(gap.skill)}-5`)}
                      >
                        <Cpu className="w-3.5 h-3.5 mr-1 inline" /> Practice {gap.skill}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <Card variant="default">
            <CardHeader title="Proficiency Breakdown" subtitle="Your extracted & verified skills by level" />
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {proficiencyLevels.map((lvl) => {
                const skillsInLevel = skills.filter((s) => s.proficiency === lvl);
                return (
                  <div key={lvl} className="p-4 rounded-2xl bg-orange-50/40 border border-orange-100">
                    <div className="flex items-center justify-between pb-2 mb-3 border-b border-orange-200/60">
                      <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider">{lvl}</h4>
                      <span className="text-[11px] font-mono text-orange-700 font-bold">{skillsInLevel.length}</span>
                    </div>

                    <div className="space-y-1.5">
                      {skillsInLevel.map((skill) => (
                        <div
                          key={skill.id}
                          className="p-2.5 rounded-xl bg-white border border-slate-200 text-xs flex items-center justify-between shadow-2xs"
                        >
                          <span className="text-slate-800 font-semibold">{skill.name}</span>
                          {skill.isVerified && <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />}
                        </div>
                      ))}
                      {skillsInLevel.length === 0 && (
                        <p className="text-[11px] text-slate-400 italic font-medium">None in this tier</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </>
      )}
    </div>
  );
};
