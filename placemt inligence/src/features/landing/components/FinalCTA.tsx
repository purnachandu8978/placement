import React from 'react';
import {
  ArrowRight,
  Sparkles,
  GraduationCap,
  Building2,
  ShieldCheck,
  CheckCircle2,
  BarChart4,
  Users,
} from 'lucide-react';
import { Link } from 'react-router-dom';

export const FinalCTA: React.FC = () => {
  return (
    <section id="college-value" className="py-20 sm:py-24 bg-[#FAFAF9] border-t border-[#E8EAF0] relative overflow-hidden">
      <div className="max-w-[1320px] mx-auto px-4 sm:px-6 relative z-10">
        
        {/* Institutional Value Proposition Grid (Colleges & Recruiters) */}
        <div className="mb-14 sm:mb-16">
          <div className="text-center max-w-3xl mx-auto mb-10">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white border border-[#E8EAF0] text-[11px] font-bold text-blue-600 uppercase tracking-wider mb-3 shadow-xs">
              <Building2 className="w-3.5 h-3.5" />
              Institutional Command Center
            </div>
            <h2 className="text-3xl sm:text-4xl font-black text-[#172235] tracking-tight leading-tight">
              Bring Your Entire Campus Placement Ecosystem Together.
            </h2>
            <p className="mt-3 text-sm sm:text-base text-slate-600 leading-relaxed max-w-2xl mx-auto">
              Empower placement cells with verified student capability records, automated drive scheduling, and institutional cohort telemetry.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-6 rounded-3xl bg-white border border-[#E8EAF0] shadow-xs">
              <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mb-4 border border-blue-100">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <h4 className="text-base font-extrabold text-[#172235] mb-1.5">
                Verifiable Competency Proof
              </h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                Recruiters receive cryptographically verifiable skill proofs backed by proctored test cases, eliminating resume exaggeration.
              </p>
            </div>

            <div className="p-6 rounded-3xl bg-white border border-[#E8EAF0] shadow-xs">
              <div className="w-10 h-10 rounded-2xl bg-orange-50 text-[#F97316] flex items-center justify-center mb-4 border border-orange-100">
                <Users className="w-5 h-5" />
              </div>
              <h4 className="text-base font-extrabold text-[#172235] mb-1.5">
                Automated Drive Eligibility
              </h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                Filter candidate cohorts instantaneously by verified skills, minimum CGPA thresholds, backlogs, and departmental batches.
              </p>
            </div>

            <div className="p-6 rounded-3xl bg-white border border-[#E8EAF0] shadow-xs">
              <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-4 border border-emerald-100">
                <BarChart4 className="w-5 h-5" />
              </div>
              <h4 className="text-base font-extrabold text-[#172235] mb-1.5">
                Real-Time Readiness Telemetry
              </h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                Track readiness bands across departments with actionable intervention alerts before company recruitment drives commence.
              </p>
            </div>
          </div>
        </div>

        {/* Master Dark Call-To-Action Banner */}
        <div className="relative p-8 sm:p-14 rounded-[36px] bg-[#111827] text-white shadow-2xl overflow-hidden border border-slate-800 text-center">
          {/* Subtle Orange Glow Ambient */}
          <div className="absolute top-0 right-1/4 w-96 h-96 rounded-full bg-orange-500/15 blur-[100px] pointer-events-none" />
          <div className="absolute bottom-0 left-1/4 w-96 h-96 rounded-full bg-blue-500/10 blur-[100px] pointer-events-none" />

          <div className="max-w-3xl mx-auto relative z-10 space-y-6">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/15 text-xs font-bold text-orange-400 uppercase tracking-wider shadow-xs">
              <Sparkles className="w-3.5 h-3.5" />
              Elevate Your Placement Outcomes
            </div>

            <h3 className="text-3xl sm:text-4xl md:text-5xl font-black text-white tracking-tight leading-tight">
              Ready to Accelerate Campus Placement Intelligence?
            </h3>

            <p className="text-sm sm:text-base text-slate-300 leading-relaxed max-w-2xl mx-auto">
              Join forward-thinking colleges preparing verified candidates and driving exceptional recruitment outcomes.
            </p>

            <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                to="/register"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-full bg-[#F97316] hover:bg-[#EA580C] text-white font-bold text-sm shadow-[0_10px_25px_rgba(249,115,22,0.3)] transition-all"
              >
                <span>Get Started as Candidate</span>
                <ArrowRight className="w-4 h-4" />
              </Link>

              <Link
                to="/login"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 text-white font-bold text-sm transition-all"
              >
                <GraduationCap className="w-4 h-4 text-orange-400" />
                <span>Student Sign In</span>
              </Link>

              <Link
                to="/admin/login"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3.5 text-xs font-bold text-slate-400 hover:text-white transition-colors"
              >
                <Building2 className="w-4 h-4 text-blue-400" />
                <span>Institutional Admin Portal →</span>
              </Link>
            </div>

            <div className="pt-8 border-t border-slate-800/80 flex flex-wrap items-center justify-center gap-6 text-xs text-slate-400">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                Production MongoDB Atlas Cluster
              </span>
              <span>•</span>
              <span>Verified ATS Resume Intelligence</span>
              <span>•</span>
              <span>Distraction-Free Proctored IDE</span>
            </div>
          </div>
        </div>

      </div>
    </section>
  );
};
