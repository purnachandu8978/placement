import React, { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import {
  LayoutDashboard,
  FileText,
  CheckSquare,
  Sparkles,
  Map,
  ClipboardList,
  ShieldCheck,
  Briefcase,
  Gauge,
  UserCheck,
  Compass,
  Bell,
  Award,
  RefreshCw,
  Menu,
  X,
  ChevronRight,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useStudentData } from '../../context/StudentDataContext';
import { useNotifications } from '../../context/NotificationContext';
import { FirstTimeTourModal } from '../onboarding/FirstTimeTourModal';

export const StudentLayout: React.FC = () => {
  const { user, openTour } = useAuth();
  const { readiness, resume, isSyncing, refreshAll } = useStudentData();
  const { unreadCount } = useNotifications();
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  const atsBadge = resume && readiness ? `ATS ${Math.round(readiness.breakdown.resume_ats_score)}%` : 'Upload';
  const verifiedCount = readiness ? readiness.metrics.verified_skills_count : 0;
  const bandLabel = readiness ? readiness.readiness_band : 'Not Started';

  const navItems = [
    { name: 'Dashboard', path: '/student/dashboard', icon: LayoutDashboard },
    { name: 'Messages & Alerts', path: '/student/notifications', icon: Bell, badge: unreadCount > 0 ? `${unreadCount} New` : undefined },
    { name: 'Resume Intelligence', path: '/student/resume', icon: FileText, badge: atsBadge },
    { name: 'Assessment Center', path: '/student/assessments', icon: CheckSquare, badge: '5/10Q' },
    { name: 'Skill Intelligence', path: '/student/skills', icon: Sparkles },
    { name: 'Personalized Roadmap', path: '/student/roadmap', icon: Map, badge: '4-Week' },
    { name: 'Assignment Center', path: '/student/assignments', icon: ClipboardList },
    { name: 'Verified Portfolio', path: '/student/verified-portfolio', icon: ShieldCheck, badge: `${verifiedCount} Verified` },
    { name: 'College Verification', path: '/student/verification', icon: Award, badge: 'Verified' },
    { name: 'Career Passport', path: '/student/passport', icon: ShieldCheck, badge: 'Passport' },
    { name: 'Job Intelligence', path: '/student/jobs', icon: Briefcase },
    { name: 'Explore Startups', path: '/student/startups', icon: Compass, badge: 'India Map' },
    { name: 'Placement Readiness', path: '/student/readiness', icon: Gauge, badge: bandLabel },
    { name: 'Profile & Settings', path: '/student/profile', icon: UserCheck },
  ];

  const initials = (user?.name || user?.email || 'S')
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('');

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gradient-to-br from-[#FFFBF8] via-[#FAF7F3] to-[#FFF5EE] pb-20 lg:pb-6">
      <FirstTimeTourModal />

      {/* ── MOBILE / TABLET STICKY TOP RAIL (visible < lg) ── */}
      <div className="lg:hidden sticky top-16 z-30 bg-white/95 backdrop-blur-md border-b border-orange-100 px-4 py-3 shadow-xs flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          {user?.avatar ? (
            <img
              src={user.avatar}
              alt={user.name}
              className="w-8 h-8 rounded-xl object-cover border border-orange-200"
            />
          ) : (
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#F97316] to-[#EA580C] text-white font-bold text-xs flex items-center justify-center shadow-xs">
              {initials}
            </div>
          )}
          <div className="min-w-0">
            <p className="font-bold text-slate-900 text-xs truncate">{user?.name || 'Student Portal'}</p>
            <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
              <span className={`w-1.5 h-1.5 rounded-full ${isSyncing ? 'bg-amber-400 animate-ping' : 'bg-emerald-500'}`} />
              <span>Readiness: <strong className="text-orange-600 font-bold">{Math.round(readiness?.overall_score ?? 0)}%</strong></span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void refreshAll()}
            title="Sync Live MongoDB"
            className="p-2 rounded-xl text-slate-500 hover:text-orange-600 hover:bg-orange-50 transition"
          >
            <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin text-orange-600' : ''}`} />
          </button>

          <button
            type="button"
            onClick={() => setMobileDrawerOpen(true)}
            className="p-2 rounded-xl bg-orange-50 text-orange-700 hover:bg-orange-100 transition flex items-center gap-1 text-xs font-bold"
          >
            <Menu className="w-4 h-4" />
            <span className="hidden sm:inline">Menu</span>
          </button>
        </div>
      </div>

      {/* ── MOBILE DRAWER OVERLAY ── */}
      {mobileDrawerOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs transition-opacity"
            onClick={() => setMobileDrawerOpen(false)}
          />

          {/* Drawer Content */}
          <div className="relative w-4/5 max-w-sm bg-white h-full shadow-2xl flex flex-col p-4 z-10 overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-orange-500 text-white flex items-center justify-center font-bold text-xs">
                  PI
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-slate-900">Student Navigation</h3>
                  <p className="text-[10px] text-slate-500">{user?.email}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMobileDrawerOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-800 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Nav list inside drawer */}
            <nav className="flex-1 space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    onClick={() => setMobileDrawerOpen(false)}
                    className={({ isActive }) =>
                      `flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                        isActive
                          ? 'bg-[#F97316] text-white shadow-xs'
                          : 'text-slate-700 hover:bg-orange-50/70 hover:text-orange-600'
                      }`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-orange-500'}`} />
                          <span className="truncate">{item.name}</span>
                        </div>
                        {item.badge && (
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                              isActive
                                ? 'bg-white/25 text-white'
                                : 'bg-orange-100 text-orange-700'
                            }`}
                          >
                            {item.badge}
                          </span>
                        )}
                      </>
                    )}
                  </NavLink>
                );
              })}
            </nav>

            {/* Guided Tour Trigger inside drawer */}
            <div className="pt-3 border-t border-slate-100 mt-3">
              <button
                type="button"
                onClick={() => {
                  setMobileDrawerOpen(false);
                  openTour();
                }}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-orange-50 text-orange-700 border border-orange-200 text-xs font-bold"
              >
                <Compass className="w-4 h-4" />
                <span>Launch Guided Tour</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── DESKTOP & SHARED CONTAINER ── */}
      <div className="max-w-[1320px] mx-auto w-full px-4 sm:px-6 py-6 flex flex-col lg:flex-row items-start gap-6">
        
        {/* DESKTOP SIDEBAR RAIL (lg and up) */}
        <aside className="hidden lg:flex flex-col w-64 shrink-0 rounded-3xl bg-white/95 border border-orange-100/90 p-4 gap-5 shadow-[0_14px_34px_rgba(255,122,89,0.07)] sticky top-20 max-h-[calc(100vh-6rem)]">
          {/* Profile Summary Card */}
          <div className="p-3.5 rounded-2xl bg-gradient-to-br from-[#FFF7F3] to-white border border-orange-100 shadow-[6px_6px_16px_rgba(255,122,89,0.08),-4px_-4px_12px_rgba(255,255,255,0.9)]">
            <div className="flex items-center gap-3">
              {user?.avatar ? (
                <img
                  src={user.avatar}
                  alt={user.name}
                  className="w-10 h-10 rounded-2xl object-cover border border-orange-200"
                />
              ) : (
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#F97316] to-[#EA580C] text-white font-bold flex items-center justify-center shadow-xs">
                  {initials}
                </div>
              )}
              <div className="min-w-0">
                <p className="font-bold text-slate-900 text-sm truncate">{user?.name || 'Student'}</p>
                <p className="text-[11px] text-slate-500 truncate">
                  {user?.college ? user.college : 'Complete your profile'}
                </p>
              </div>
            </div>

            <div className="mt-3 pt-2.5 border-t border-orange-100/80 flex items-center justify-between text-xs">
              <span className="text-slate-500 font-medium">Readiness Index</span>
              <span className="font-bold text-[#EA580C]">
                {Math.round(readiness?.overall_score ?? 0)}%
              </span>
            </div>

            <div className="mt-2 pt-2 border-t border-orange-100/60 flex items-center justify-between text-[11px]">
              <span className="inline-flex items-center gap-1.5 text-slate-500 font-medium">
                <span className={`w-2 h-2 rounded-full ${isSyncing ? 'bg-amber-400 animate-ping' : 'bg-emerald-500'}`} />
                {isSyncing ? 'Syncing DB...' : 'MongoDB Live'}
              </span>
              <button
                type="button"
                onClick={() => void refreshAll()}
                title="Sync live data with MongoDB"
                className="p-1 rounded-lg hover:bg-orange-100/80 text-slate-500 hover:text-orange-700 transition cursor-pointer"
              >
                <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin text-orange-600' : ''}`} />
              </button>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="flex-1 space-y-1 overflow-y-auto pr-0.5 custom-scroll">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={({ isActive }) =>
                    `flex items-center justify-between px-3 py-2 rounded-2xl text-[13px] font-medium transition-all ${
                      isActive
                        ? 'bg-gradient-to-r from-[#F97316] to-[#EA580C] text-white shadow-[0_4px_14px_rgba(249,115,22,0.28)]'
                        : 'text-slate-600 hover:bg-orange-50/70 hover:text-slate-900'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-[#F97316]'}`} />
                        <span className="truncate">{item.name}</span>
                      </div>
                      {item.badge && (
                        <span
                          className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${
                            isActive
                              ? 'bg-white/25 text-white'
                              : 'bg-orange-50 text-[#EA580C] border border-orange-100'
                          }`}
                        >
                          {item.badge}
                        </span>
                      )}
                    </>
                  )}
                </NavLink>
              );
            })}
          </nav>

          {/* Guided Tour Trigger */}
          <button
            type="button"
            onClick={openTour}
            className="flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-2xl bg-[#FFF6F1] hover:bg-orange-100/70 border border-orange-200/80 text-xs font-bold text-[#EA580C] transition-colors cursor-pointer"
          >
            <Compass className="w-4 h-4" />
            <span>Launch Guided Tour</span>
          </button>
        </aside>

        {/* ── CENTER / MAIN CONTENT OUTLET ── */}
        <main className="flex-1 min-w-0 w-full overflow-x-hidden">
          <Outlet />
        </main>
      </div>

      {/* ── MOBILE BOTTOM NAVIGATION BAR (lg:hidden) ── */}
      <nav
        aria-label="Mobile Navigation"
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-orange-100 shadow-[0_-4px_16px_rgba(0,0,0,0.04)] px-3 py-2 flex items-center justify-around"
      >
        <NavLink
          to="/student/dashboard"
          className={({ isActive }) =>
            `flex flex-col items-center gap-0.5 min-w-[54px] py-1 text-[10px] font-bold transition-colors ${
              isActive ? 'text-[#F97316]' : 'text-slate-500 hover:text-slate-900'
            }`
          }
        >
          <LayoutDashboard className="w-5 h-5" />
          <span>Home</span>
        </NavLink>

        <NavLink
          to="/student/assessments"
          className={({ isActive }) =>
            `flex flex-col items-center gap-0.5 min-w-[54px] py-1 text-[10px] font-bold transition-colors ${
              isActive ? 'text-[#F97316]' : 'text-slate-500 hover:text-slate-900'
            }`
          }
        >
          <CheckSquare className="w-5 h-5" />
          <span>Tests</span>
        </NavLink>

        <NavLink
          to="/student/skills"
          className={({ isActive }) =>
            `flex flex-col items-center gap-0.5 min-w-[54px] py-1 text-[10px] font-bold transition-colors ${
              isActive ? 'text-[#F97316]' : 'text-slate-500 hover:text-slate-900'
            }`
          }
        >
          <Sparkles className="w-5 h-5" />
          <span>Skills</span>
        </NavLink>

        <NavLink
          to="/student/roadmap"
          className={({ isActive }) =>
            `flex flex-col items-center gap-0.5 min-w-[54px] py-1 text-[10px] font-bold transition-colors ${
              isActive ? 'text-[#F97316]' : 'text-slate-500 hover:text-slate-900'
            }`
          }
        >
          <Map className="w-5 h-5" />
          <span>Roadmap</span>
        </NavLink>

        <button
          type="button"
          onClick={() => setMobileDrawerOpen(true)}
          className="flex flex-col items-center gap-0.5 min-w-[54px] py-1 text-[10px] font-bold text-slate-500 hover:text-orange-600 transition-colors"
        >
          <Menu className="w-5 h-5" />
          <span>Modules</span>
        </button>
      </nav>
    </div>
  );
};
