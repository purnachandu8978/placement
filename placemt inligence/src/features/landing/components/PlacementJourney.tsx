import React from 'react';
import {
  FileText,
  ShieldCheck,
  Compass,
  Briefcase,
  Trophy,
  ArrowRight,
  Sparkles,
} from 'lucide-react';

export const PlacementJourney: React.FC = () => {
  const stages = [
    {
      num: '01',
      title: 'Discover & Profile',
      tag: 'Zero-Loss ATS Parser',
      description: 'Candidates upload resumes to automatically extract structured technical skills, project scopes, frameworks, and academic benchmarks.',
      icon: FileText,
      accent: '#F97316',
      badgeBg: 'bg-orange-50 text-orange-700 border-orange-200',
    },
    {
      num: '02',
      title: 'Verify Capabilities',
      tag: 'Proctored Assessment',
      description: 'Students validate proficiencies through timed, proctored MCQs and live coding examinations with instant test-case evaluation.',
      icon: ShieldCheck,
      accent: '#16A36A',
      badgeBg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    },
    {
      num: '03',
      title: 'Prepare & Upskill',
      tag: '4-Week Adaptive Sprint',
      description: 'System identifies individual knowledge gaps and synthesizes targeted weekly milestones, coursework assignments, and coding practice.',
      icon: Compass,
      accent: '#2563EB',
      badgeBg: 'bg-blue-50 text-blue-700 border-blue-200',
    },
    {
      num: '04',
      title: 'Match Opportunities',
      tag: 'Campus Drive Matching',
      description: 'Recruitment drives and startup opportunities are automatically filtered by verified skills, minimum CGPA, and batch eligibility.',
      icon: Briefcase,
      accent: '#8B5CF6',
      badgeBg: 'bg-purple-50 text-purple-700 border-purple-200',
    },
    {
      num: '05',
      title: 'Place & Track',
      tag: 'Verified Career Passports',
      description: 'Colleges monitor the entire student cohort pipeline, verifying placement offers and issuing tamper-proof digital credentials.',
      icon: Trophy,
      accent: '#EA580C',
      badgeBg: 'bg-amber-50 text-amber-800 border-amber-200',
    },
  ];

  return (
    <section id="placement-journey" className="py-20 sm:py-24 bg-[#FAFAF9] border-t border-[#E8EAF0] relative overflow-hidden">
      <div className="max-w-[1320px] mx-auto px-4 sm:px-6 relative z-10">
        
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-14 sm:mb-16">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white border border-[#E8EAF0] text-[11px] font-bold text-[#F97316] uppercase tracking-wider mb-4 shadow-xs">
            <Sparkles className="w-3.5 h-3.5 text-[#F97316]" />
            Five Connected Stages
          </div>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-black text-[#172235] tracking-tight leading-tight">
            One Connected Journey. From Student Potential to Placement.
          </h2>
          <p className="mt-4 text-sm sm:text-base text-slate-600 leading-relaxed max-w-2xl mx-auto">
            A continuous, intelligent pipeline connecting candidate preparation, capability verification, and campus recruitment drives.
          </p>
        </div>

        {/* 5 Stages Grid / Responsive Timeline */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 sm:gap-6 relative">
          {stages.map((stage, idx) => {
            const Icon = stage.icon;
            return (
              <div
                key={stage.num}
                className="relative p-5 sm:p-6 rounded-3xl bg-white border border-[#E8EAF0] shadow-[0_8px_24px_rgba(17,24,39,0.03)] hover:shadow-[0_16px_36px_rgba(249,115,22,0.08)] hover:border-orange-200 transition-all duration-300 flex flex-col justify-between group"
              >
                <div>
                  {/* Top Bar with Number and Icon */}
                  <div className="flex items-center justify-between mb-4">
                    <span className="font-mono text-xs font-black text-slate-400 bg-slate-100 px-2.5 py-1 rounded-full">
                      {stage.num}
                    </span>
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center text-white shadow-xs group-hover:scale-105 transition-transform"
                      style={{ backgroundColor: stage.accent }}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                  </div>

                  {/* Stage Tag */}
                  <span className={`inline-block px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border mb-2 ${stage.badgeBg}`}>
                    {stage.tag}
                  </span>

                  {/* Stage Title */}
                  <h3 className="text-base font-extrabold text-[#172235] tracking-tight mb-2 group-hover:text-[#F97316] transition-colors">
                    {stage.title}
                  </h3>

                  {/* Description */}
                  <p className="text-xs text-slate-600 leading-relaxed">
                    {stage.description}
                  </p>
                </div>

                {/* Sub-indicator */}
                <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] font-semibold text-slate-400">
                  <span>Step {idx + 1} of 5</span>
                  {idx < 4 && <ArrowRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-orange-500 group-hover:translate-x-1 transition-all" />}
                </div>
              </div>
            );
          })}
        </div>

      </div>
    </section>
  );
};
