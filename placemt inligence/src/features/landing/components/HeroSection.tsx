import React from 'react';
import {
  GraduationCap,
  ShieldCheck,
  BookOpen,
  Briefcase,
  Trophy,
  FileText,
  Code2,
  ArrowRight,
  User,
  GitFork,
} from 'lucide-react';
import { Link } from 'react-router-dom';

export interface HeroSectionProps {
  onSelectZone?: (zone: any) => void;
}

export const HeroSection: React.FC<HeroSectionProps> = () => {
  return (
    <section className="relative pt-24 pb-12 sm:pt-28 sm:pb-14 md:pt-36 md:pb-16 overflow-hidden bg-white">
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 relative z-10">

        {/* ── TOP HERO GRID: 3-ZONE COMPOSITION ── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-3 xl:gap-6 items-center">

          {/* ── ZONE 1 (LEFT): HEADLINE, BADGE & CTAs ── */}
          <div className="lg:col-span-4 xl:col-span-3 space-y-5 sm:space-y-6 text-left">
            {/* Campus Placement Ecosystem Badge */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#FFF0E4] border border-[#FFE0CE] text-xs font-bold text-slate-800 shadow-2xs">
              <GraduationCap className="w-4 h-4 text-[#F97316]" />
              <span>Campus Placement Ecosystem</span>
            </div>

            {/* Exact Headline */}
            <div className="space-y-1">
              <h1 className="text-3xl sm:text-4xl xl:text-5xl 2xl:text-6xl font-black text-[#111827] tracking-tight leading-[1.08]">
                Build Skills.
                <br />
                Prove Potential.
                <br />
                <span className="text-[#F97316] relative inline-block">
                  Get Placed.
                  {/* Subtle curved underline */}
                  <svg
                    className="w-full h-3 text-[#F97316] absolute -bottom-1 left-0"
                    viewBox="0 0 200 12"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path
                      d="M3 8C55 2, 145 2, 197 8"
                      stroke="currentColor"
                      strokeWidth="3.5"
                      strokeLinecap="round"
                    />
                  </svg>
                </span>
              </h1>
            </div>

            {/* Approved Supporting Description */}
            <p className="text-xs sm:text-sm md:text-base text-slate-600 font-medium leading-relaxed max-w-sm">
              A complete ecosystem for colleges to prepare students, verify skills, manage opportunities and drive placement outcomes.
            </p>

            {/* CTAs: Sign In + Student Login */}
            <div className="pt-1 flex flex-wrap items-center gap-3 sm:gap-3.5">
              <Link
                to="/login"
                className="inline-flex items-center justify-center gap-2 px-5 sm:px-6 py-3 sm:py-3.5 rounded-full bg-white border border-slate-300 text-slate-800 font-bold text-xs sm:text-sm shadow-xs hover:bg-slate-50 hover:border-slate-400 transition-all cursor-pointer"
              >
                <User className="w-4 h-4 text-slate-600" />
                <span>Sign In</span>
              </Link>

              <Link
                to="/login"
                className="inline-flex items-center justify-center gap-2 px-6 sm:px-7 py-3 sm:py-3.5 rounded-full bg-[#F97316] hover:bg-[#EA580C] text-white font-bold text-xs sm:text-sm shadow-[0_10px_25px_rgba(249,115,22,0.3)] transition-all group cursor-pointer"
              >
                <span>Student Login</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </Link>
            </div>
          </div>

          {/* ── ZONE 2 (CENTER): PROMINENT MAX-SIZE HERO ILLUSTRATION WITH STARS ── */}
          <div className="lg:col-span-5 xl:col-span-6 flex items-center justify-center relative my-6 lg:my-0 px-1 sm:px-2">
            <div className="relative w-full flex items-center justify-center lg:-my-10 xl:-my-16 2xl:-my-20">
              
              {/* Star 1: Top-Left (near student's head) */}
              <div className="absolute -top-4 sm:-top-6 left-6 sm:left-12 text-slate-900 pointer-events-none select-none z-10">
                <svg className="w-5 h-5 sm:w-7 sm:h-7 animate-pulse" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M12 2 L14 10 L22 12 L14 14 L12 22 L10 14 L2 12 L10 10 Z" />
                </svg>
              </div>

              {/* Star 2: Top-Right (above orange circle) */}
              <div className="absolute -top-2 sm:-top-4 right-12 sm:right-20 text-slate-900 pointer-events-none select-none z-10">
                <svg className="w-4 h-4 sm:w-6 sm:h-6 animate-pulse" style={{ animationDelay: '0.6s' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M12 2 L14 10 L22 12 L14 14 L12 22 L10 14 L2 12 L10 10 Z" />
                </svg>
              </div>

              {/* Star 3: Right-Middle (accent orange star) */}
              <div className="absolute top-1/3 -right-2 sm:-right-4 text-[#F97316] pointer-events-none select-none z-10">
                <svg className="w-5 h-5 sm:w-6 sm:h-6 animate-pulse" style={{ animationDelay: '1.2s' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M12 2 L14 10 L22 12 L14 14 L12 22 L10 14 L2 12 L10 10 Z" />
                </svg>
              </div>

              {/* Star 4: Left-Middle (beside backpack) */}
              <div className="absolute top-1/2 -left-2 sm:-left-4 text-slate-900 pointer-events-none select-none z-10">
                <svg className="w-4 h-4 sm:w-5 sm:h-5 animate-pulse" style={{ animationDelay: '1.8s' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M12 2 L14 10 L22 12 L14 14 L12 22 L10 14 L2 12 L10 10 Z" />
                </svg>
              </div>

              {/* Star 5: Bottom-Right (near checklist card) */}
              <div className="absolute bottom-12 -right-1 sm:-right-3 text-slate-900 pointer-events-none select-none z-10">
                <svg className="w-4 h-4 sm:w-5 sm:h-5 animate-pulse" style={{ animationDelay: '2.4s' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M12 2 L14 10 L22 12 L14 14 L12 22 L10 14 L2 12 L10 10 Z" />
                </svg>
              </div>

              {/* Star 6: Bottom-Left (near base) */}
              <div className="absolute -bottom-3 left-8 sm:left-14 text-[#F97316] pointer-events-none select-none z-10">
                <svg className="w-4 h-4 animate-pulse" style={{ animationDelay: '3s' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M12 2 L14 10 L22 12 L14 14 L12 22 L10 14 L2 12 L10 10 Z" />
                </svg>
              </div>

              {/* Maximum-Sized Hero Image (WebP with PNG Fallback) */}
              <picture>
                <source srcSet="/assets/images/hero-student-collage.webp" type="image/webp" />
                <img
                  src="/assets/images/hero-student-collage.png"
                  alt="Placement Intelligence — Student Career Readiness Ecosystem"
                  className="w-full h-auto max-w-[380px] sm:max-w-[480px] md:max-w-[560px] lg:max-w-[660px] xl:max-w-[780px] 2xl:max-w-[860px] object-contain object-center drop-shadow-2xl select-none transition-all duration-300 hover:scale-[1.015]"
                  width={1024}
                  height={819}
                  fetchPriority="high"
                  loading="eager"
                  decoding="async"
                />
              </picture>
            </div>
          </div>

          {/* ── ZONE 3 (RIGHT): THE PLACEMENT JOURNEY CARD ── */}
          <div className="lg:col-span-3 xl:col-span-3 flex justify-center lg:justify-end w-full">
            <div className="w-full max-w-[320px] sm:max-w-[300px] bg-white rounded-3xl p-5 shadow-[0_12px_36px_rgba(17,24,39,0.06)] border border-[#E8EAF0] space-y-4">

              {/* Title */}
              <h3 className="font-black text-base text-slate-900 tracking-tight border-b border-slate-100 pb-3">
                The Placement Journey
              </h3>

              {/* Vertical Connected Timeline */}
              <div className="relative pl-6 space-y-4">
                {/* Connecting Vertical Line */}
                <div className="absolute left-[7px] top-2 bottom-3 w-[2px] bg-orange-200" />

                {/* Stage 1: Onboard */}
                <div className="relative flex items-start gap-3">
                  <div className="absolute -left-[23px] top-1.5 w-3 h-3 rounded-full bg-[#F97316] ring-4 ring-white" />
                  <div className="w-8 h-8 rounded-xl bg-[#FFF0E4] text-[#F97316] flex items-center justify-center shrink-0 border border-[#FFE0CE]">
                    <GraduationCap className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 leading-tight">Onboard</h4>
                    <p className="text-[11px] text-slate-500 leading-tight mt-0.5">Create your profile</p>
                  </div>
                </div>

                {/* Stage 2: Verify Skills */}
                <div className="relative flex items-start gap-3">
                  <div className="absolute -left-[23px] top-1.5 w-3 h-3 rounded-full bg-[#F97316] ring-4 ring-white" />
                  <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-100">
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 leading-tight">Verify Skills</h4>
                    <p className="text-[11px] text-slate-500 leading-tight mt-0.5">Through assessments</p>
                  </div>
                </div>

                {/* Stage 3: Prepare */}
                <div className="relative flex items-start gap-3">
                  <div className="absolute -left-[23px] top-1.5 w-3 h-3 rounded-full bg-[#F97316] ring-4 ring-white" />
                  <div className="w-8 h-8 rounded-xl bg-[#FFF0E4] text-[#F97316] flex items-center justify-center shrink-0 border border-[#FFE0CE]">
                    <BookOpen className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 leading-tight">Prepare</h4>
                    <p className="text-[11px] text-slate-500 leading-tight mt-0.5">Assignments &amp; roadmaps</p>
                  </div>
                </div>

                {/* Stage 4: Match */}
                <div className="relative flex items-start gap-3">
                  <div className="absolute -left-[23px] top-1.5 w-3 h-3 rounded-full bg-[#F97316] ring-4 ring-white" />
                  <div className="w-8 h-8 rounded-xl bg-[#FFF0E4] text-[#F97316] flex items-center justify-center shrink-0 border border-[#FFE0CE]">
                    <Briefcase className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 leading-tight">Match</h4>
                    <p className="text-[11px] text-slate-500 leading-tight mt-0.5">Find relevant opportunities</p>
                  </div>
                </div>

                {/* Stage 5: Get Placed */}
                <div className="relative flex items-start gap-3">
                  <div className="absolute -left-[23px] top-1.5 w-3 h-3 rounded-full bg-[#F97316] ring-4 ring-white" />
                  <div className="w-8 h-8 rounded-xl bg-[#FFF0E4] text-[#F97316] flex items-center justify-center shrink-0 border border-[#FFE0CE]">
                    <Trophy className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 leading-tight">Get Placed</h4>
                    <p className="text-[11px] text-slate-500 leading-tight mt-0.5">Coordinate and track outcomes</p>
                  </div>
                </div>

              </div>
            </div>
          </div>

        </div>

        {/* ── BOTTOM CAPABILITY STRIP (5 Core Capability Pillars) ── */}
        <div className="mt-12 sm:mt-16">
          <div className="w-full bg-white rounded-3xl sm:rounded-full border border-slate-200/90 shadow-[0_8px_30px_rgba(17,24,39,0.04)] px-4 py-4 sm:py-5">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 lg:gap-0 lg:divide-x divide-slate-200/80 items-center text-center">

              {/* Pillar 1: Resume Intelligence */}
              <a
                href="#platform-capabilities"
                className="flex flex-col items-center justify-center gap-2 group px-3 py-1 cursor-pointer"
              >
                <div className="w-9 h-9 rounded-xl bg-[#FFF0E4] text-[#F97316] flex items-center justify-center group-hover:scale-110 transition-transform">
                  <FileText className="w-5 h-5" />
                </div>
                <span className="text-xs sm:text-sm font-black text-slate-900 group-hover:text-[#F97316] transition-colors">
                  Resume
                  <br className="hidden sm:inline" /> Intelligence
                </span>
              </a>

              {/* Pillar 2: Skill Verification */}
              <a
                href="#platform-capabilities"
                className="flex flex-col items-center justify-center gap-2 group px-3 py-1 cursor-pointer"
              >
                <div className="w-9 h-9 rounded-xl bg-[#FFF0E4] text-[#F97316] flex items-center justify-center group-hover:scale-110 transition-transform">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <span className="text-xs sm:text-sm font-black text-slate-900 group-hover:text-[#F97316] transition-colors">
                  Skill
                  <br className="hidden sm:inline" /> Verification
                </span>
              </a>

              {/* Pillar 3: Assessments & Assignments */}
              <a
                href="#platform-capabilities"
                className="flex flex-col items-center justify-center gap-2 group px-3 py-1 cursor-pointer"
              >
                <div className="w-9 h-9 rounded-xl bg-[#FFF0E4] text-[#F97316] flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Code2 className="w-5 h-5" />
                </div>
                <span className="text-xs sm:text-sm font-black text-slate-900 group-hover:text-[#F97316] transition-colors">
                  Assessments
                  <br className="hidden sm:inline" /> &amp; Assignments
                </span>
              </a>

              {/* Pillar 4: Personalized Roadmap */}
              <a
                href="#platform-capabilities"
                className="flex flex-col items-center justify-center gap-2 group px-3 py-1 cursor-pointer"
              >
                <div className="w-9 h-9 rounded-xl bg-[#FFF0E4] text-[#F97316] flex items-center justify-center group-hover:scale-110 transition-transform">
                  <GitFork className="w-5 h-5" />
                </div>
                <span className="text-xs sm:text-sm font-black text-slate-900 group-hover:text-[#F97316] transition-colors">
                  Personalized
                  <br className="hidden sm:inline" /> Roadmap
                </span>
              </a>

              {/* Pillar 5: Job Opportunities */}
              <a
                href="#platform-capabilities"
                className="flex flex-col items-center justify-center gap-2 group px-3 py-1 col-span-2 sm:col-span-1 cursor-pointer"
              >
                <div className="w-9 h-9 rounded-xl bg-[#FFF0E4] text-[#F97316] flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Briefcase className="w-5 h-5" />
                </div>
                <span className="text-xs sm:text-sm font-black text-slate-900 group-hover:text-[#F97316] transition-colors">
                  Job
                  <br className="hidden sm:inline" /> Opportunities
                </span>
              </a>

            </div>
          </div>
        </div>

      </div>
    </section>
  );
};
