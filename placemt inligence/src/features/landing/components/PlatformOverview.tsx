import React from 'react';
import {
  FileText,
  Code2,
  CheckCircle2,
  BookOpen,
  Compass,
  Award,
  Briefcase,
  Gauge,
  MapPin,
  ArrowRight,
} from 'lucide-react';
import { Link } from 'react-router-dom';

export const PlatformOverview: React.FC = () => {
  const capabilities = [
    {
      id: 'resume',
      title: 'Resume Intelligence',
      subtitle: 'ATS Parsing & Skill Extraction',
      description: 'Upload candidate resumes to extract verified technical skills, project scopes, and academic coursework with zero data loss.',
      icon: FileText,
      tag: 'Zero-Loss Parser',
      color: 'text-orange-600',
      bg: 'bg-orange-50',
      border: 'border-orange-100',
      accent: '#F97316',
      link: '/login',
    },
    {
      id: 'skills',
      title: 'Skill Intelligence',
      subtitle: 'Multi-Level Proficiency Mapping',
      description: 'Categorizes student capabilities across Frontend, Backend, Databases, Cloud & DevOps, and Data Science with transparent scoring.',
      icon: CheckCircle2,
      tag: 'Capability Radar',
      color: 'text-emerald-600',
      bg: 'bg-emerald-50',
      border: 'border-emerald-100',
      accent: '#16A36A',
      link: '/login',
    },
    {
      id: 'assessment',
      title: 'Assessment Center',
      subtitle: 'Proctored Coding Examinations',
      description: 'Conduct secure, timed technical assessments with automated unit test execution, code sandboxing, and proctoring telemetry.',
      icon: Code2,
      tag: 'Multi-Language IDE',
      color: 'text-blue-600',
      bg: 'bg-blue-50',
      border: 'border-blue-100',
      accent: '#2563EB',
      link: '/login',
    },
    {
      id: 'assignment',
      title: 'Assignment Center',
      subtitle: 'Practical Project Verification',
      description: 'Structured assignments and project evaluations designed by faculty to verify end-to-end software engineering capabilities.',
      icon: BookOpen,
      tag: 'Curated Coursework',
      color: 'text-purple-600',
      bg: 'bg-purple-50',
      border: 'border-purple-100',
      accent: '#8B5CF6',
      link: '/login',
    },
    {
      id: 'roadmap',
      title: 'Personalized Roadmap',
      subtitle: 'Adaptive 4-Week Career Sprint',
      description: 'Dynamically synthesizes weekly milestones tailored to address identified skill gaps before recruitment drives begin.',
      icon: Compass,
      tag: 'Targeted Milestones',
      color: 'text-orange-600',
      bg: 'bg-orange-50',
      border: 'border-orange-100',
      accent: '#EA580C',
      link: '/login',
    },
    {
      id: 'portfolio',
      title: 'Verified Portfolio',
      subtitle: 'Cryptographic Credential Proof',
      description: 'Every cleared examination generates a verifiable digital record with unique certificate IDs and shareable URLs.',
      icon: Award,
      tag: 'Tamper-Proof Creds',
      color: 'text-emerald-600',
      bg: 'bg-emerald-50',
      border: 'border-emerald-100',
      accent: '#059669',
      link: '/login',
    },
    {
      id: 'jobs',
      title: 'Job Intelligence',
      subtitle: 'Recruitment Drive Automation',
      description: 'Centralizes campus placement drives, automatically matching eligible students based on verified skills and CGPA criteria.',
      icon: Briefcase,
      tag: 'Drive Management',
      color: 'text-blue-600',
      bg: 'bg-blue-50',
      border: 'border-blue-100',
      accent: '#1D4ED8',
      link: '/login',
    },
    {
      id: 'readiness',
      title: 'Placement Readiness Index',
      subtitle: 'Composite Quantitative Telemetry',
      description: 'A multi-dimensional scoring model weighing resume strength, verified skills, assessment pass rates, and attendance.',
      icon: Gauge,
      tag: 'Real-Time Score',
      color: 'text-amber-600',
      bg: 'bg-amber-50',
      border: 'border-amber-100',
      accent: '#D97706',
      link: '/login',
    },
    {
      id: 'startups',
      title: 'Startup Atlas',
      subtitle: 'India Tech Ecosystem Map',
      description: 'Explore verified tech startups and recruitment partners across major Indian technology hubs with hiring filters.',
      icon: MapPin,
      tag: 'India Geo-Map',
      color: 'text-rose-600',
      bg: 'bg-rose-50',
      border: 'border-rose-100',
      accent: '#E11D48',
      link: '/student/startups',
    },
  ];

  return (
    <section id="platform-capabilities" className="py-20 sm:py-24 bg-white relative overflow-hidden">
      <div className="max-w-[1320px] mx-auto px-4 sm:px-6 relative z-10">
        
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-14 sm:mb-16">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-50 border border-[#E8EAF0] text-[11px] font-bold text-slate-800 uppercase tracking-wider mb-4 shadow-xs">
            Comprehensive Capabilities
          </div>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-black text-[#172235] tracking-tight leading-tight">
            Engineered for Campus Placement Excellence.
          </h2>
          <p className="mt-4 text-sm sm:text-base text-slate-600 leading-relaxed max-w-2xl mx-auto">
            Nine integrated technology modules powering candidate preparation, verifiable capability assessment, and seamless company recruitment drives.
          </p>
        </div>

        {/* 9 Capabilities Grid (3x3 on desktop, 2 cols on tablet, 1 col on mobile) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {capabilities.map((cap) => {
            const Icon = cap.icon;
            return (
              <div
                key={cap.id}
                className="p-6 rounded-3xl bg-white border border-[#E8EAF0] shadow-[0_8px_24px_rgba(17,24,39,0.03)] hover:shadow-[0_16px_36px_rgba(17,24,39,0.07)] hover:border-slate-300 transition-all duration-300 flex flex-col justify-between group"
              >
                <div>
                  {/* Top Bar with Icon & Tag */}
                  <div className="flex items-center justify-between mb-4">
                    <div
                      className={`w-10 h-10 rounded-2xl flex items-center justify-center ${cap.bg} ${cap.border} border shadow-xs group-hover:scale-105 transition-transform`}
                    >
                      <Icon className={`w-5 h-5 ${cap.color}`} />
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-slate-50 text-slate-600 border border-slate-200">
                      {cap.tag}
                    </span>
                  </div>

                  {/* Title & Subtitle */}
                  <h3 className="text-lg font-black text-[#172235] tracking-tight mb-1 group-hover:text-[#F97316] transition-colors">
                    {cap.title}
                  </h3>
                  <p className="text-xs font-semibold text-[#F97316] mb-2.5">
                    {cap.subtitle}
                  </p>

                  {/* Description */}
                  <p className="text-xs text-slate-600 leading-relaxed">
                    {cap.description}
                  </p>
                </div>

                {/* Bottom Action Link */}
                <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between">
                  <Link
                    to={cap.link}
                    className="text-xs font-bold text-slate-800 hover:text-[#F97316] transition-colors flex items-center gap-1 group/btn"
                  >
                    <span>Explore Module</span>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover/btn:translate-x-1 group-hover/btn:text-[#F97316] transition-all" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>

      </div>
    </section>
  );
};
