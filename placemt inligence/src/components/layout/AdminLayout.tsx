import React, { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  UsersRound,
  FileCheck2,
  Cpu,
  Layers,
  HelpCircle,
  FolderKanban,
  FileSpreadsheet,
  CheckCheck,
  Building,
  BarChart4,
  Sliders,
  KeyRound,
  ShieldCheck,
  ShieldAlert,
  Megaphone,
  Compass,
  Award,
  Menu,
  X,
  Search,
  ChevronRight,
  ExternalLink,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export const AdminLayout: React.FC = () => {
  const { user } = useAuth();
  const location = useLocation();
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const navSections = [
    {
      title: 'Overview',
      items: [
        { name: 'Admin Dashboard', path: '/admin/dashboard', icon: LayoutDashboard },
        { name: 'Placement Analytics', path: '/admin/analytics', icon: BarChart4 },
      ],
    },
    {
      title: 'Student Management',
      items: [
        { name: 'Student Directory', path: '/admin/students', icon: Users },
        { name: 'Student Groups', path: '/admin/groups', icon: UsersRound },
        { name: 'Login Audit', path: '/admin/logins', icon: KeyRound },
      ],
    },
    {
      title: 'Academic & Examination',
      items: [
        { name: 'Exam Control Room', path: '/admin/examination-control', icon: ShieldAlert, badge: 'Live Proctored' },
        { name: 'Assessment Center', path: '/admin/assessments', icon: Layers },
        { name: 'Question Bank', path: '/admin/question-bank', icon: HelpCircle },
        { name: 'Assignment Center', path: '/admin/assignments', icon: FolderKanban },
        { name: 'Skill Taxonomy', path: '/admin/skills', icon: Cpu },
        { name: 'Learning Roadmaps', path: '/admin/roadmaps', icon: FileSpreadsheet },
      ],
    },
    {
      title: 'Career & Placement',
      items: [
        { name: 'Job Requisitions', path: '/admin/jobs', icon: Building },
        { name: 'Startup Console', path: '/admin/startups', icon: Compass },
        { name: 'Certificate Templates', path: '/admin/templates', icon: Award },
        { name: 'Resume Management', path: '/admin/resumes', icon: FileCheck2 },
        { name: 'Skill Verifications', path: '/admin/verifications', icon: CheckCheck },
      ],
    },
    {
      title: 'Communication & Platform',
      items: [
        { name: 'Communication Center', path: '/admin/communication', icon: Megaphone },
        { name: 'Platform Settings', path: '/admin/settings', icon: Sliders },
      ],
    },
  ];

  const allItems = navSections.flatMap((s) => s.items);

  const filteredItems = searchQuery.trim()
    ? allItems.filter((i) => i.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : null;

  // Compute current page title for breadcrumb
  const currentItem = allItems.find((i) => i.path === location.pathname);

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gradient-to-br from-[#f0f6ff] via-[#f8fbff] to-[#eff6ff] admin-scroll pb-20 lg:pb-6">
      
      {/* ── MOBILE / TABLET STICKY TOP BAR (visible < lg) ── */}
      <div className="lg:hidden sticky top-16 z-30 bg-white/95 backdrop-blur-md border-b border-blue-100 px-4 py-3 shadow-xs flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white flex items-center justify-center font-bold text-xs shadow-xs">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <p className="font-bold text-slate-900 text-xs truncate">
              {currentItem ? currentItem.name : 'Institutional Admin'}
            </p>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-blue-600">
              {user?.backendRole || 'ADMIN'} • Campus Portal
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setMobileDrawerOpen(true)}
          className="p-2 rounded-xl bg-blue-50 text-blue-700 hover:bg-blue-100 transition flex items-center gap-1.5 text-xs font-bold"
        >
          <Menu className="w-4 h-4" />
          <span>Console</span>
        </button>
      </div>

      {/* ── MOBILE DRAWER OVERLAY ── */}
      {mobileDrawerOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs transition-opacity"
            onClick={() => setMobileDrawerOpen(false)}
          />

          <div className="relative w-4/5 max-w-sm bg-white h-full shadow-2xl flex flex-col p-4 z-10 overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold text-xs">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-slate-900">Admin Console</h3>
                  <p className="text-[10px] text-blue-600 font-semibold">{user?.email}</p>
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

            {/* Quick search input */}
            <div className="relative mb-3">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search administration modules..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl bg-slate-50 border border-slate-200 text-slate-800 focus:outline-hidden focus:border-blue-500"
              />
            </div>

            {/* Nav sections in drawer */}
            <nav className="flex-1 space-y-4">
              {filteredItems ? (
                <div className="space-y-1">
                  <p className="text-[10px] font-mono font-bold uppercase text-slate-400 px-2">Search Results</p>
                  {filteredItems.map((item) => {
                    const Icon = item.icon;
                    return (
                      <NavLink
                        key={item.path}
                        to={item.path}
                        onClick={() => setMobileDrawerOpen(false)}
                        className={({ isActive }) =>
                          `flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold ${
                            isActive ? 'bg-blue-600 text-white' : 'text-slate-700 hover:bg-blue-50'
                          }`
                        }
                      >
                        <Icon className="w-4 h-4 shrink-0" />
                        <span>{item.name}</span>
                      </NavLink>
                    );
                  })}
                </div>
              ) : (
                navSections.map((sec) => (
                  <div key={sec.title} className="space-y-1">
                    <p className="px-2 text-[10px] font-mono font-bold tracking-wider uppercase text-slate-400">
                      {sec.title}
                    </p>
                    <div className="space-y-0.5">
                      {sec.items.map((item) => {
                        const Icon = item.icon;
                        return (
                          <NavLink
                            key={item.path}
                            to={item.path}
                            onClick={() => setMobileDrawerOpen(false)}
                            className={({ isActive }) =>
                              `flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                                isActive ? 'bg-blue-600 text-white' : 'text-slate-700 hover:bg-blue-50'
                              }`
                            }
                          >
                            {({ isActive }) => (
                              <>
                                <div className="flex items-center gap-2">
                                  <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-blue-600'}`} />
                                  <span>{item.name}</span>
                                </div>
                                {item.badge && (
                                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-800">
                                    {item.badge}
                                  </span>
                                )}
                              </>
                            )}
                          </NavLink>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </nav>
          </div>
        </div>
      )}

      {/* ── DESKTOP & SHARED CONTAINER ── */}
      <div className="max-w-[1320px] mx-auto w-full px-4 sm:px-6 py-6 flex flex-col lg:flex-row items-start gap-6">
        
        {/* DESKTOP SIDEBAR RAIL (lg and up) */}
        <aside className="hidden lg:flex flex-col w-64 shrink-0 rounded-3xl bg-white/95 border border-slate-200/90 p-4 gap-4 shadow-[0_14px_34px_rgba(37,99,235,0.06)] sticky top-20 max-h-[calc(100vh-6rem)]">
          
          {/* Admin Identity Header */}
          <div className="p-3.5 rounded-2xl bg-gradient-to-br from-blue-50/80 to-white border border-blue-100 shadow-xs">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white flex items-center justify-center shadow-xs shrink-0">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <p className="font-bold text-slate-900 text-sm truncate">
                  {user?.name || 'Administrator'}
                </p>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-blue-600">
                  {user?.backendRole || 'ADMIN'} • Institutional
                </p>
              </div>
            </div>
          </div>

          {/* Quick Search Input */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Filter modules..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl bg-slate-50 border border-slate-200 text-slate-800 placeholder:text-slate-400 focus:outline-hidden focus:border-blue-500 transition-colors"
            />
          </div>

          {/* Categorized Vertical Nav */}
          <nav className="flex-1 space-y-4 overflow-y-auto pr-0.5 custom-scroll">
            {filteredItems ? (
              <div className="space-y-1">
                <p className="px-3 text-[10px] font-mono font-bold tracking-wider uppercase text-slate-400">
                  Filter Matches ({filteredItems.length})
                </p>
                <div className="space-y-0.5">
                  {filteredItems.map((item) => {
                    const Icon = item.icon;
                    return (
                      <NavLink
                        key={item.path}
                        to={item.path}
                        className={({ isActive }) =>
                          `flex items-center gap-2.5 px-3 py-2 rounded-2xl text-[13px] font-medium transition-all ${
                            isActive
                              ? 'bg-blue-600 text-white shadow-[0_4px_14px_rgba(37,99,235,0.3)] font-semibold'
                              : 'text-slate-600 hover:bg-blue-50/70 hover:text-blue-900'
                          }`
                        }
                      >
                        <Icon className="w-4 h-4 shrink-0" />
                        <span className="truncate">{item.name}</span>
                      </NavLink>
                    );
                  })}
                </div>
              </div>
            ) : (
              navSections.map((sec) => (
                <div key={sec.title} className="space-y-1">
                  <p className="px-3 text-[10px] font-mono font-bold tracking-wider uppercase text-slate-400">
                    {sec.title}
                  </p>
                  <div className="space-y-0.5">
                    {sec.items.map((item) => {
                      const Icon = item.icon;
                      return (
                        <NavLink
                          key={item.path}
                          to={item.path}
                          className={({ isActive }) =>
                            `flex items-center justify-between px-3 py-2 rounded-2xl text-[13px] font-medium transition-all ${
                              isActive
                                ? 'bg-blue-600 text-white shadow-[0_4px_14px_rgba(37,99,235,0.3)] font-semibold'
                                : 'text-slate-600 hover:bg-blue-50/70 hover:text-blue-900'
                            }`
                          }
                        >
                          {({ isActive }) => (
                            <>
                              <div className="flex items-center gap-2.5 min-w-0">
                                <Icon
                                  className={`w-4 h-4 shrink-0 transition-colors ${
                                    isActive ? 'text-white' : 'text-blue-600'
                                  }`}
                                />
                                <span className="truncate">{item.name}</span>
                              </div>
                              {item.badge && (
                                <span
                                  className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${
                                    isActive ? 'bg-white/20 text-white' : 'bg-blue-100 text-blue-700'
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
                  </div>
                </div>
              ))
            )}
          </nav>
        </aside>

        {/* ── MAIN CONTENT OUTLET ── */}
        <main className="flex-1 min-w-0 w-full overflow-x-hidden">
          {/* Institutional Breadcrumb Bar */}
          <div className="mb-4 hidden sm:flex items-center gap-2 text-xs text-slate-500 font-medium">
            <span>Admin Console</span>
            <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-slate-800 font-bold">{currentItem ? currentItem.name : 'Dashboard'}</span>
          </div>

          <Outlet />
        </main>
      </div>

      {/* ── MOBILE BOTTOM NAVIGATION BAR (lg:hidden) ── */}
      <nav
        aria-label="Mobile Admin Navigation"
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-blue-100 shadow-[0_-4px_16px_rgba(0,0,0,0.04)] px-3 py-2 flex items-center justify-around"
      >
        <NavLink
          to="/admin/dashboard"
          className={({ isActive }) =>
            `flex flex-col items-center gap-0.5 min-w-[54px] py-1 text-[10px] font-bold transition-colors ${
              isActive ? 'text-blue-600' : 'text-slate-500 hover:text-slate-900'
            }`
          }
        >
          <LayoutDashboard className="w-5 h-5" />
          <span>Home</span>
        </NavLink>

        <NavLink
          to="/admin/students"
          className={({ isActive }) =>
            `flex flex-col items-center gap-0.5 min-w-[54px] py-1 text-[10px] font-bold transition-colors ${
              isActive ? 'text-blue-600' : 'text-slate-500 hover:text-slate-900'
            }`
          }
        >
          <Users className="w-5 h-5" />
          <span>Students</span>
        </NavLink>

        <NavLink
          to="/admin/examination-control"
          className={({ isActive }) =>
            `flex flex-col items-center gap-0.5 min-w-[54px] py-1 text-[10px] font-bold transition-colors ${
              isActive ? 'text-blue-600' : 'text-slate-500 hover:text-slate-900'
            }`
          }
        >
          <ShieldAlert className="w-5 h-5" />
          <span>Exams</span>
        </NavLink>

        <NavLink
          to="/admin/verifications"
          className={({ isActive }) =>
            `flex flex-col items-center gap-0.5 min-w-[54px] py-1 text-[10px] font-bold transition-colors ${
              isActive ? 'text-blue-600' : 'text-slate-500 hover:text-slate-900'
            }`
          }
        >
          <CheckCheck className="w-5 h-5" />
          <span>Verify</span>
        </NavLink>

        <button
          type="button"
          onClick={() => setMobileDrawerOpen(true)}
          className="flex flex-col items-center gap-0.5 min-w-[54px] py-1 text-[10px] font-bold text-slate-500 hover:text-blue-600 transition-colors"
        >
          <Menu className="w-5 h-5" />
          <span>All</span>
        </button>
      </nav>
    </div>
  );
};
