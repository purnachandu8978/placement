import React from 'react';
import { Sparkles, ShieldCheck, Heart } from 'lucide-react';
import { Link } from 'react-router-dom';

export const LandingFooter: React.FC = () => {
  return (
    <footer className="bg-[#FAFAF8] border-t border-[#E8EAF0] pt-16 pb-12 text-slate-600 text-xs">
      <div className="max-w-[1240px] mx-auto px-4 sm:px-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-10 pb-12 border-b border-slate-200/80">
          {/* Brand Info */}
          <div className="lg:col-span-2 space-y-4">
            <Link to="/" className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-[#F97316] to-[#EA580C] text-white flex items-center justify-center shadow-sm">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <span className="font-extrabold text-slate-900 tracking-tight text-base block leading-none">
                  Placement Intelligence
                </span>
                <span className="text-[10px] font-semibold text-[#EA580C] tracking-wide uppercase">
                  Campus Placement Ecosystem
                </span>
              </div>
            </Link>
            <p className="text-xs text-slate-500 leading-relaxed max-w-sm">
              The complete enterprise platform for colleges to prepare candidates, verify technical capabilities through proctored examinations, and drive placement outcomes.
            </p>
            <div className="pt-2 flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 text-[10px] font-bold border border-emerald-200">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                MongoDB Atlas Cluster Live
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 text-[10px] font-bold border border-slate-200">
                <ShieldCheck className="w-3 h-3 text-slate-500" />
                v2.0 Verified
              </span>
            </div>
          </div>

          {/* Column 1: Platform Capabilities */}
          <div className="space-y-3">
            <h5 className="font-bold text-slate-900 text-xs uppercase tracking-wider">
              Platform Modules
            </h5>
            <ul className="space-y-2">
              <li>
                <a href="#platform-overview" className="hover:text-orange-600 transition-colors">
                  Resume Intelligence
                </a>
              </li>
              <li>
                <a href="#verified-skills" className="hover:text-orange-600 transition-colors">
                  Skill Verification Lab
                </a>
              </li>
              <li>
                <a href="#platform-overview" className="hover:text-orange-600 transition-colors">
                  Assessment & IDE Center
                </a>
              </li>
              <li>
                <a href="#how-it-works" className="hover:text-orange-600 transition-colors">
                  Personalized Roadmap
                </a>
              </li>
              <li>
                <a href="#opportunity-intelligence" className="hover:text-orange-600 transition-colors">
                  Job Intelligence
                </a>
              </li>
              <li>
                <a href="#placement-analytics" className="hover:text-orange-600 transition-colors">
                  Placement Telemetry
                </a>
              </li>
            </ul>
          </div>

          {/* Column 2: Candidate Portal */}
          <div className="space-y-3">
            <h5 className="font-bold text-slate-900 text-xs uppercase tracking-wider">
              Candidate Access
            </h5>
            <ul className="space-y-2">
              <li>
                <Link to="/login" className="hover:text-orange-600 transition-colors">
                  Candidate Portal Sign In
                </Link>
              </li>
              <li>
                <Link to="/register" className="hover:text-orange-600 transition-colors">
                  Create Candidate Account
                </Link>
              </li>
              <li>
                <a href="#how-it-works" className="hover:text-orange-600 transition-colors">
                  How Preparation Works
                </a>
              </li>
              <li>
                <a href="#for-students" className="hover:text-orange-600 transition-colors">
                  Candidate Benefits
                </a>
              </li>
              <li>
                <Link to="/login" className="hover:text-orange-600 transition-colors">
                  Digital Career Passport
                </Link>
              </li>
            </ul>
          </div>

          {/* Column 3: Institutional Administration */}
          <div className="space-y-3">
            <h5 className="font-bold text-slate-900 text-xs uppercase tracking-wider">
              College & Admin
            </h5>
            <ul className="space-y-2">
              <li>
                <Link to="/admin/login" className="text-blue-600 hover:text-blue-800 font-bold transition-colors">
                  Institutional Admin Login
                </Link>
              </li>
              <li>
                <a href="#for-colleges" className="hover:text-slate-900 transition-colors">
                  Directorate Console
                </a>
              </li>
              <li>
                <a href="#for-colleges" className="hover:text-slate-900 transition-colors">
                  Examination Control Room
                </a>
              </li>
              <li>
                <a href="#startup-atlas" className="hover:text-slate-900 transition-colors">
                  Startup Atlas Directory
                </a>
              </li>
              <li>
                <a href="#for-colleges" className="hover:text-slate-900 transition-colors">
                  Cohort Verification Queue
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-slate-400 text-[11px]">
          <div>
            © {new Date().getFullYear()} Placement Intelligence. All rights reserved. Enterprise Campus Technology.
          </div>
          <div className="flex items-center gap-4">
            <Link to="/privacy-policy" className="hover:text-orange-600 transition-colors">Privacy Policy</Link>
            <span>•</span>
            <Link to="/terms-of-service" className="hover:text-orange-600 transition-colors">Terms of Service</Link>
            <span>•</span>
            <Link to="/cookie-policy" className="hover:text-orange-600 transition-colors">Cookie Policy</Link>
          </div>
        </div>
      </div>
    </footer>
  );
};
