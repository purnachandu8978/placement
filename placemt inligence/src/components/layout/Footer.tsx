import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Brain, ShieldCheck, Heart, Github, Twitter, Linkedin, Sparkles } from 'lucide-react';
import { LandingFooter } from '../../features/landing/components/LandingFooter';

export const Footer: React.FC = () => {
  const location = useLocation();

  if (location.pathname === '/') {
    return <LandingFooter />;
  }
  return (
    <footer className="w-full bg-white/90 border-t border-orange-100 text-slate-600 text-xs shadow-xs mt-10">
      <div className="max-w-[1128px] mx-auto px-4 sm:px-6 py-10">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Brand Col */}
          <div className="space-y-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-orange-500 to-amber-400 flex items-center justify-center text-white shadow-sm shadow-orange-500/20">
                <Brain className="w-4 h-4" />
              </div>
              <span className="font-extrabold text-slate-900 text-sm">Placement Intelligence</span>
            </div>
            <p className="text-slate-500 text-xs leading-relaxed font-medium">
              Transforming college engineering candidates into job-ready professionals through AI skill extraction, rigorous coding assessments, verified portfolios, and personalized learning roadmaps.
            </p>
            <div className="flex items-center gap-2 text-[11px] text-orange-600 font-mono font-semibold bg-orange-50 px-2.5 py-1 rounded-full border border-orange-200/60 w-fit">
              <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
              All Systems Operational • MongoDB Atlas & Firebase
            </div>
          </div>

          {/* Student Workflows */}
          <div>
            <h4 className="text-slate-900 font-bold text-xs uppercase tracking-wider mb-3">Student Modules</h4>
            <ul className="space-y-2">
              <li>
                <Link to="/student/dashboard" className="text-slate-500 hover:text-orange-600 font-medium transition-colors">
                  Readiness Dashboard
                </Link>
              </li>
              <li>
                <Link to="/student/resume" className="text-slate-500 hover:text-orange-600 font-medium transition-colors">
                  Resume Intelligence & ATS
                </Link>
              </li>
              <li>
                <Link to="/student/assessments" className="text-slate-500 hover:text-orange-600 font-medium transition-colors">
                  Technical Assessment Center
                </Link>
              </li>
              <li>
                <Link to="/student/roadmap" className="text-slate-500 hover:text-orange-600 font-medium transition-colors">
                  Personalized 4-Week Roadmap
                </Link>
              </li>
              <li>
                <Link to="/student/verified-portfolio" className="text-slate-500 hover:text-orange-600 font-medium transition-colors">
                  Verified Skills Ledger
                </Link>
              </li>
              <li>
                <Link to="/student/jobs" className="text-slate-500 hover:text-orange-600 font-medium transition-colors">
                  Target Job Recommendations
                </Link>
              </li>
            </ul>
          </div>

          {/* Admin Workflows */}
          <div>
            <h4 className="text-slate-900 font-bold text-xs uppercase tracking-wider mb-3">Campus Placement Cell</h4>
            <ul className="space-y-2">
              <li>
                <Link to="/admin/dashboard" className="text-slate-500 hover:text-blue-600 font-medium transition-colors">
                  Placement Cell Dashboard
                </Link>
              </li>
              <li>
                <Link to="/admin/students" className="text-slate-500 hover:text-blue-600 font-medium transition-colors">
                  Student Cohort Management
                </Link>
              </li>
              <li>
                <Link to="/admin/question-bank" className="text-slate-500 hover:text-blue-600 font-medium transition-colors">
                  5/10 Question Test Bank
                </Link>
              </li>
              <li>
                <Link to="/admin/verifications" className="text-slate-500 hover:text-blue-600 font-medium transition-colors">
                  Skill Verification Queue
                </Link>
              </li>
              <li>
                <Link to="/admin/analytics" className="text-slate-500 hover:text-blue-600 font-medium transition-colors">
                  Department Placement Analytics
                </Link>
              </li>
            </ul>
          </div>

          {/* Architecture & Compliance */}
          <div>
            <h4 className="text-slate-900 font-bold text-xs uppercase tracking-wider mb-3">Enterprise Architecture</h4>
            <p className="text-slate-500 text-xs leading-relaxed mb-3 font-medium">
              Built on React 19, TypeScript, and Vite. Implements clean decoupled API service interfaces ready for backend microservices integration.
            </p>
            <div className="p-3 rounded-xl clay-card bg-orange-50/50 border border-orange-200/70 text-[11px] text-slate-700">
              <span className="font-bold text-orange-600 flex items-center gap-1.5 mb-1">
                <Sparkles className="w-3.5 h-3.5" /> Strict Question Policy
              </span>
              <span>5Q (3 MCQ, 1 Easy, 1 Hard) & 10Q (6 MCQ, 2 Easy, 2 Hard)</span>
            </div>
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-orange-100 flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px] text-slate-400 font-medium">
          <p>© 2026 Placement Intelligence Enterprise SaaS. All rights reserved.</p>
          <div className="flex items-center gap-4">
            <Link to="/terms-of-service" className="hover:text-orange-600 transition-colors">Security & Terms</Link>
            <span>•</span>
            <Link to="/cookie-policy" className="hover:text-orange-600 transition-colors">Cookie Policy</Link>
            <span>•</span>
            <Link to="/privacy-policy" className="hover:text-orange-600 transition-colors">Privacy Policy (DPDPA)</Link>
          </div>
        </div>
      </div>
    </footer>
  );
};
