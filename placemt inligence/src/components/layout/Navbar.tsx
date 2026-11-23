import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import {
  Sparkles,
  LogOut,
  ShieldCheck,
  LayoutDashboard,
  ChevronDown,
  Lock,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Button } from '../common/Button';
import { NotificationBell } from './NotificationBell';
import { LandingHeader } from '../../features/landing/components/LandingHeader';

export const Navbar: React.FC = () => {
  const { user, role, isAuthenticated, loginWithGoogle, logout } = useAuth();
  const { success, error, info } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);

  const isLanding = location.pathname === '/';

  if (isLanding) {
    return <LandingHeader />;
  }

  const handleGoogleSignIn = async () => {
    setGoogleBusy(true);
    try {
      await loginWithGoogle();
      success('Signed in with Google successfully!');
      navigate('/student/dashboard');
    } catch (err: unknown) {
      error('Google Sign-In failed', err instanceof Error ? err.message : 'Unable to authenticate with Google.');
    } finally {
      setGoogleBusy(false);
    }
  };

  const handleLogout = async () => {
    setDropdownOpen(false);
    await logout();
    info('Signed out safely.');
    navigate('/');
  };

  const initials = (user?.name || user?.email || 'U')
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('');

  return (
    <header className="sticky top-0 z-40 w-full bg-white/90 backdrop-blur-xl border-b border-orange-100/80 shadow-[0_6px_24px_rgba(255,122,89,0.06)]">
      <div className="max-w-[1128px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        {/* Brand */}
        <Link to="/" className="flex items-center gap-2.5 group">
          <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-[#FF7A59] to-[#E86144] text-white flex items-center justify-center shadow-[4px_4px_12px_rgba(255,122,89,0.28)] group-hover:scale-105 transition-transform">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <span className="font-extrabold text-slate-900 tracking-tight text-base block leading-none">
              Placement Intelligence
            </span>
            <span className="text-[11px] font-medium text-[#E86144] tracking-wide">
              Verified Talent Engine
            </span>
          </div>
        </Link>

        {/* Landing Nav Links */}
        {isLanding && (
          <nav className="hidden md:flex items-center gap-5 text-sm font-medium text-slate-600">
            <a href="#how-it-works" className="hover:text-[#E86144] transition-colors">
              How It Works
            </a>
          </nav>
        )}

        {/* Right Controls */}
        <div className="flex items-center gap-2.5">
          {!isAuthenticated ? (
            <>
              <Link
                to="/login"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-700 hover:text-slate-900 hover:bg-orange-50/70 border border-orange-200/80 transition-all shadow-2xs"
              >
                Sign In / Register
              </Link>
              <Link
                to="/admin/login"
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-blue-700 hover:text-blue-900 hover:bg-blue-50/70 border border-blue-200/80 transition-all shadow-2xs"
              >
                <Lock className="w-3.5 h-3.5 text-blue-600" />
                Admin Portal
              </Link>
              <Button
                size="sm"
                onClick={() => void handleGoogleSignIn()}
                disabled={googleBusy}
                className="shadow-[6px_6px_14px_rgba(255,122,89,0.25)] text-xs"
              >
                {googleBusy ? 'Signing In...' : 'Google Sign-In'}
              </Button>
            </>
          ) : (
            <div className="relative flex items-center gap-2.5">
              {role === 'admin' ? (
                <div className="flex items-center gap-2">
                  <Link to="/admin/dashboard">
                    <Button variant="outline" size="sm" className="hover:border-blue-400 hover:text-blue-700">
                      <ShieldCheck className="w-4 h-4 mr-1.5 text-blue-600" />
                      Admin Console
                    </Button>
                  </Link>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Link to="/student/dashboard">
                    <Button variant="outline" size="sm">
                      <LayoutDashboard className="w-4 h-4 mr-1.5 text-[#FF7A59]" />
                      Dashboard
                    </Button>
                  </Link>
                </div>
              )}

              <NotificationBell />

              <button
                onClick={() => setDropdownOpen((o) => !o)}
                className="flex items-center gap-2 pl-1.5 pr-3 py-1 rounded-2xl bg-[#FFFDFB] border border-orange-100 shadow-sm hover:border-orange-200 transition-all cursor-pointer"
              >
                {user?.avatar ? (
                  <img
                    src={user.avatar}
                    alt={user.name}
                    className="w-8 h-8 rounded-xl object-cover border border-orange-100"
                  />
                ) : (
                  <div className={`w-8 h-8 rounded-xl text-white text-xs font-bold flex items-center justify-center ${role === 'admin'
                      ? 'bg-gradient-to-br from-blue-600 to-indigo-600'
                      : 'bg-gradient-to-br from-[#FF7A59] to-[#E86144]'
                    }`}>
                    {initials}
                  </div>
                )}
                <div className="hidden sm:block text-left">
                  <p className="text-xs font-bold text-slate-900 leading-tight max-w-[140px] truncate">
                    {user?.name || user?.email}
                  </p>
                  <p className={`text-[10px] font-semibold uppercase tracking-wider ${role === 'admin' ? 'text-blue-600' : 'text-[#E86144]'
                    }`}>
                    {role === 'admin' ? user?.backendRole || 'ADMIN' : 'STUDENT'}
                  </p>
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              </button>

              {dropdownOpen && (
                <div className="absolute right-0 top-12 w-56 rounded-2xl bg-white border border-orange-100 shadow-[0_18px_40px_rgba(15,23,42,0.12)] p-2 z-50">
                  <div className="px-3 py-2 border-b border-slate-100 mb-1">
                    <p className="text-xs font-bold text-slate-800 truncate">{user?.name}</p>
                    <p className="text-[11px] text-slate-500 truncate">{user?.email}</p>
                  </div>
                  {role === 'student' && (
                    <>
                      <Link
                        to="/student/verification"
                        onClick={() => setDropdownOpen(false)}
                        className="block px-3 py-2 rounded-xl text-xs font-semibold text-blue-700 hover:bg-blue-50"
                      >
                        🏅 College Verification
                      </Link>
                      <Link
                        to="/student/passport"
                        onClick={() => setDropdownOpen(false)}
                        className="block px-3 py-2 rounded-xl text-xs font-semibold text-orange-600 hover:bg-orange-50"
                      >
                        🛡️ Career Passport
                      </Link>
                      <Link
                        to="/student/startups"
                        onClick={() => setDropdownOpen(false)}
                        className="block px-3 py-2 rounded-xl text-xs font-semibold text-[#E86144] hover:bg-orange-50"
                      >
                        🧭 India Startup & Tech Atlas
                      </Link>
                      <Link
                        to="/student/profile"
                        onClick={() => setDropdownOpen(false)}
                        className="block px-3 py-2 rounded-xl text-xs font-medium text-slate-700 hover:bg-orange-50 hover:text-[#E86144]"
                      >
                        Profile & Preferences
                      </Link>
                    </>
                  )}
                  {role === 'admin' && (
                    <>
                      <Link
                        to="/admin/startups"
                        onClick={() => setDropdownOpen(false)}
                        className="block px-3 py-2 rounded-xl text-xs font-semibold text-blue-700 hover:bg-blue-50"
                      >
                        🧭 Startup Intelligence Console
                      </Link>
                      <Link
                        to="/admin/templates"
                        onClick={() => setDropdownOpen(false)}
                        className="block px-3 py-2 rounded-xl text-xs font-semibold text-blue-700 hover:bg-blue-50"
                      >
                        📜 Certificate Template Management
                      </Link>
                    </>
                  )}
                  <button
                    onClick={() => void handleLogout()}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-rose-600 hover:bg-rose-50 transition-colors mt-0.5"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    Sign Out
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
