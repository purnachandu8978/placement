import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ChevronDown,
  ArrowRight,
  User,
  Menu,
  X,
  FileText,
  CheckCircle2,
  Code2,
  Compass,
} from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';

export const LandingHeader: React.FC = () => {
  const { isAuthenticated, role } = useAuth();
  const navigate = useNavigate();
  const [platformOpen, setPlatformOpen] = useState(false);
  const [signInOpen, setSignInOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 15);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled ? 'py-2.5 sm:py-3' : 'py-3.5 sm:py-5'
      }`}
    >
      <div className="max-w-[1360px] mx-auto px-4 sm:px-6">
        <div
          className={`flex items-center justify-between px-4 sm:px-6 py-2 rounded-full transition-all duration-300 ${
            scrolled
              ? 'bg-white/95 backdrop-blur-xl border border-[#E8EAF0] shadow-[0_12px_32px_rgba(17,24,39,0.06),0_1px_2px_rgba(0,0,0,0.04)]'
              : 'bg-white/90 backdrop-blur-md border border-slate-200/80 shadow-[0_4px_20px_rgba(17,24,39,0.03)]'
          }`}
        >
          {/* ── LEFT: Logo (Bold Orange PI + Placement Intelligence) ── */}
          <Link to="/" className="flex items-center gap-2.5 group shrink-0">
            <span className="text-2xl sm:text-3xl font-black text-[#F97316] tracking-tighter leading-none group-hover:scale-105 transition-transform">
              PI
            </span>
            <div className="leading-tight">
              <span className="font-extrabold text-slate-900 tracking-tight text-sm sm:text-base block">
                Placement
              </span>
              <span className="font-extrabold text-slate-900 tracking-tight text-xs sm:text-sm block -mt-1 text-slate-700">
                Intelligence
              </span>
            </div>
          </Link>

          {/* ── CENTER: Clean Navigation Links ── */}
          <nav className="hidden md:flex items-center gap-1 sm:gap-2 px-3 py-1">
            <a
              href="#"
              className="relative px-3 py-1 text-xs sm:text-sm font-bold text-slate-900 transition-colors"
            >
              <span>Home</span>
              <span className="absolute bottom-[-2px] left-1/2 -translate-x-1/2 w-5 h-[2px] rounded-full bg-[#F97316]" />
            </a>

            {/* Platform Dropdown */}
            <div
              className="relative"
              onMouseEnter={() => setPlatformOpen(true)}
              onMouseLeave={() => setPlatformOpen(false)}
            >
              <a
                href="#platform-capabilities"
                className="flex items-center gap-1 px-3 py-1 text-xs sm:text-sm font-semibold text-slate-600 hover:text-slate-900 transition-colors"
              >
                <span>Platform</span>
                <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${platformOpen ? 'rotate-180' : ''}`} />
              </a>

              {platformOpen && (
                <div className="absolute top-full left-0 mt-2 w-64 p-2 rounded-2xl bg-white border border-[#E8EAF0] shadow-xl backdrop-blur-xl animate-in fade-in duration-150 z-50">
                  <a
                    href="#platform-capabilities"
                    onClick={() => setPlatformOpen(false)}
                    className="flex items-center gap-2.5 p-2 rounded-xl hover:bg-orange-50 text-slate-700 hover:text-orange-600 transition-colors text-xs font-bold"
                  >
                    <FileText className="w-4 h-4 text-orange-500" />
                    <span>Resume Intelligence</span>
                  </a>
                  <a
                    href="#platform-capabilities"
                    onClick={() => setPlatformOpen(false)}
                    className="flex items-center gap-2.5 p-2 rounded-xl hover:bg-orange-50 text-slate-700 hover:text-orange-600 transition-colors text-xs font-bold"
                  >
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    <span>Skill Verification</span>
                  </a>
                  <a
                    href="#platform-capabilities"
                    onClick={() => setPlatformOpen(false)}
                    className="flex items-center gap-2.5 p-2 rounded-xl hover:bg-orange-50 text-slate-700 hover:text-orange-600 transition-colors text-xs font-bold"
                  >
                    <Code2 className="w-4 h-4 text-blue-500" />
                    <span>Assessment Center</span>
                  </a>
                  <a
                    href="#placement-journey"
                    onClick={() => setPlatformOpen(false)}
                    className="flex items-center gap-2.5 p-2 rounded-xl hover:bg-orange-50 text-slate-700 hover:text-orange-600 transition-colors text-xs font-bold"
                  >
                    <Compass className="w-4 h-4 text-purple-500" />
                    <span>Personalized Roadmap</span>
                  </a>
                </div>
              )}
            </div>

            <a
              href="#college-value"
              className="px-3 py-1 text-xs sm:text-sm font-semibold text-slate-600 hover:text-slate-900 transition-colors"
            >
              For Colleges
            </a>

            <Link
              to="/student/startups"
              className="px-3 py-1 text-xs sm:text-sm font-semibold text-slate-600 hover:text-slate-900 transition-colors"
            >
              Startup Atlas
            </Link>

            <a
              href="#platform-capabilities"
              className="px-3 py-1 text-xs sm:text-sm font-semibold text-slate-600 hover:text-slate-900 transition-colors"
            >
              Blog
            </a>
          </nav>

          {/* ── RIGHT: Minimal Header Buttons (Sign In + Get Started) ── */}
          <div className="flex items-center gap-2 sm:gap-3">
            {isAuthenticated ? (
              <button
                type="button"
                onClick={() => navigate(role === 'admin' ? '/admin/dashboard' : '/student/dashboard')}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#F97316] hover:bg-[#EA580C] text-white font-bold text-xs sm:text-sm shadow-xs transition-all"
              >
                <span>Go to Dashboard</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            ) : (
              <>
                {/* Sign In Dropdown / Trigger */}
                <div
                  className="relative"
                  onMouseEnter={() => setSignInOpen(true)}
                  onMouseLeave={() => setSignInOpen(false)}
                >
                  <button
                    type="button"
                    onClick={() => navigate('/login')}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-white border border-slate-200/90 text-slate-800 hover:bg-slate-50 text-xs sm:text-sm font-bold shadow-2xs transition-all cursor-pointer"
                  >
                    <User className="w-3.5 h-3.5 text-slate-600" />
                    <span>Sign In</span>
                  </button>

                  {signInOpen && (
                    <div className="absolute right-0 top-full mt-2 w-56 p-2 rounded-2xl bg-white border border-[#E8EAF0] shadow-xl backdrop-blur-xl animate-in fade-in duration-150 z-50">
                      <Link
                        to="/login"
                        onClick={() => setSignInOpen(false)}
                        className="flex items-center justify-between px-3 py-2 text-xs font-bold rounded-xl text-slate-800 hover:bg-orange-50 hover:text-orange-600 transition-colors"
                      >
                        <span>Candidate Portal</span>
                        <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                      </Link>
                      <Link
                        to="/admin/login"
                        onClick={() => setSignInOpen(false)}
                        className="flex items-center justify-between px-3 py-2 text-xs font-bold rounded-xl text-slate-800 hover:bg-blue-50 hover:text-blue-600 transition-colors"
                      >
                        <span>Institutional Admin</span>
                        <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                      </Link>
                    </div>
                  )}
                </div>

                {/* Get Started Button */}
                <Link
                  to="/register"
                  className="inline-flex items-center gap-1.5 px-5 py-2 rounded-full bg-[#F97316] hover:bg-[#EA580C] text-white font-bold text-xs sm:text-sm shadow-[0_4px_14px_rgba(249,115,22,0.3)] transition-all"
                >
                  <span>Get Started</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </>
            )}

            {/* Mobile Hamburger Toggle */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 text-slate-700 hover:text-slate-900 transition-colors rounded-lg hover:bg-slate-100"
              aria-label="Toggle navigation"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation Drawer */}
        {mobileMenuOpen && (
          <div className="md:hidden mt-2 p-4 rounded-3xl bg-white/95 backdrop-blur-xl border border-[#E8EAF0] shadow-xl animate-in fade-in duration-200 space-y-2">
            <a
              href="#"
              onClick={() => setMobileMenuOpen(false)}
              className="block px-3.5 py-2 rounded-xl text-xs font-bold text-slate-800 hover:bg-orange-50"
            >
              Home
            </a>
            <a
              href="#platform-capabilities"
              onClick={() => setMobileMenuOpen(false)}
              className="block px-3.5 py-2 rounded-xl text-xs font-bold text-slate-800 hover:bg-orange-50"
            >
              Platform Capabilities
            </a>
            <a
              href="#placement-journey"
              onClick={() => setMobileMenuOpen(false)}
              className="block px-3.5 py-2 rounded-xl text-xs font-bold text-slate-800 hover:bg-orange-50"
            >
              Placement Journey
            </a>
            <a
              href="#college-value"
              onClick={() => setMobileMenuOpen(false)}
              className="block px-3.5 py-2 rounded-xl text-xs font-bold text-slate-800 hover:bg-orange-50"
            >
              For Colleges
            </a>
            <Link
              to="/student/startups"
              onClick={() => setMobileMenuOpen(false)}
              className="block px-3.5 py-2 rounded-xl text-xs font-bold text-slate-800 hover:bg-orange-50"
            >
              Startup Atlas
            </Link>

            <div className="pt-3 border-t border-slate-100 flex flex-col gap-2">
              <Link
                to="/login"
                onClick={() => setMobileMenuOpen(false)}
                className="w-full text-center py-2.5 text-xs font-bold rounded-xl border border-slate-200 text-slate-800 hover:bg-slate-50"
              >
                Sign In (Candidate)
              </Link>
              <Link
                to="/admin/login"
                onClick={() => setMobileMenuOpen(false)}
                className="w-full text-center py-2.5 text-xs font-bold rounded-xl bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100"
              >
                Institutional Admin Access
              </Link>
              <Link
                to="/register"
                onClick={() => setMobileMenuOpen(false)}
                className="w-full text-center py-2.5 text-xs font-bold rounded-xl bg-[#F97316] text-white shadow-xs hover:bg-[#EA580C]"
              >
                Get Started
              </Link>
            </div>
          </div>
        )}
      </div>
    </header>
  );
};
