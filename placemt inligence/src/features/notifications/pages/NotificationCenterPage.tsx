import React, { useState, useEffect } from 'react';
import {
  Bell,
  Sparkles,
  ExternalLink,
  Check,
  CheckCheck,
  Trash2,
  Sliders,
  Clock,
  Volume2,
  VolumeX,
  Search,
  Briefcase,
  BookOpen,
  Megaphone,
  ShieldCheck,
  Info,
  Calendar,
  Filter,
  RefreshCw,
} from 'lucide-react';
import { useNotifications } from '../../../context/NotificationContext';
import type { NotificationItem, UserNotificationPreferences } from '../../../services/notificationService';
import { formatRealDateTime, formatRelativeTime } from '../../../utils/dateUtils';

export const NotificationCenterPage: React.FC = () => {
  const {
    notifications,
    unreadCount,
    loading,
    pushSupported,
    pushPermission,
    preferences,
    refreshNotifications,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    clearAll,
    requestPushPermission,
    updatePreferences,
  } = useNotifications();

  const [activeTab, setActiveTab] = useState<'inbox' | 'preferences'>('inbox');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [showUnreadOnly, setShowUnreadOnly] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [savingPrefs, setSavingPrefs] = useState<boolean>(false);
  const [prefSaveNotice, setPrefSaveNotice] = useState<string | null>(null);

  // Local draft preferences
  const [draftPrefs, setDraftPrefs] = useState<UserNotificationPreferences>(
    preferences || {
      job_alerts: true,
      high_match_alerts: true,
      assignment_notifications: true,
      assessment_reminders: true,
      roadmap_reminders: true,
      email_notifications: false,
      quiet_hours_enabled: false,
      quiet_hours_start: '22:00',
      quiet_hours_end: '08:00',
      notification_frequency: 'immediate',
      min_match_threshold: 60,
    }
  );

  React.useEffect(() => {
    if (preferences) {
      setDraftPrefs(preferences);
    }
  }, [preferences]);

  // Always refresh notifications and messages on page load
  useEffect(() => {
    void refreshNotifications();
  }, [refreshNotifications]);

  // Filter notifications
  const filteredNotifications = notifications.filter((notif) => {
    if (showUnreadOnly && notif.is_read) return false;

    if (selectedCategory !== 'all') {
      const cat = (notif.category || '').toLowerCase();
      const type = (notif.type || '').toLowerCase();
      if (selectedCategory === 'messages' && !(type.includes('announcement') || type.includes('message') || type.includes('notify') || cat === 'system')) {
        return false;
      }
      if (selectedCategory === 'jobs' && !(cat === 'jobs' || type.includes('job') || type.includes('application'))) {
        return false;
      }
      if (selectedCategory === 'learning' && !(cat === 'learning' || type.includes('assessment') || type.includes('assignment') || type.includes('roadmap'))) {
        return false;
      }
      if (selectedCategory === 'system' && !(cat === 'system' || cat === 'account' || type.includes('announcement'))) {
        return false;
      }
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = (notif.title || '').toLowerCase().includes(q);
      const matchMessage = (notif.message || '').toLowerCase().includes(q);
      const matchCompany = (notif.company || '').toLowerCase().includes(q);
      if (!matchTitle && !matchMessage && !matchCompany) return false;
    }

    return true;
  });

  const handleSavePreferences = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingPrefs(true);
    setPrefSaveNotice(null);
    try {
      await updatePreferences(draftPrefs);
      setPrefSaveNotice('Notification preferences successfully saved.');
      setTimeout(() => setPrefSaveNotice(null), 3000);
    } catch {
      setPrefSaveNotice('Could not save preferences. Please retry.');
    } finally {
      setSavingPrefs(false);
    }
  };

  const getSourceBadge = (notif: NotificationItem) => {
    const s = (notif.source_name || '').toLowerCase();
    const t = (notif.type || '').toLowerCase();

    if (s.includes('internshala')) {
      return <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-sky-100 text-sky-800 border border-sky-200">Internshala</span>;
    }
    if (s.includes('linkedin')) {
      return <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800 border border-blue-200">LinkedIn</span>;
    }
    if (s.includes('indeed')) {
      return <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">Indeed</span>;
    }
    if (s.includes('firecrawl')) {
      return <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-orange-100 text-orange-800 border border-orange-200">Firecrawl AI</span>;
    }
    if (s.includes('lever') || s.includes('greenhouse')) {
      return <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">{notif.source_name}</span>;
    }
    if (t.includes('assessment') || t.includes('assignment')) {
      return <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-100 text-purple-800 border border-purple-200">Learning</span>;
    }
    if (t.includes('announcement')) {
      return <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">Official Broadcast</span>;
    }
    return <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200">{notif.category || 'Notification'}</span>;
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      {/* Header card */}
      <div className="p-6 md:p-8 rounded-3xl bg-gradient-to-r from-white via-[#FFF9F6] to-[#FFF3ED] border border-orange-100 shadow-[0_20px_45px_rgba(232,97,68,0.06)] flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#FF7A59] to-[#E86144] text-white flex items-center justify-center shadow-md">
            <Bell className="w-7 h-7" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl md:text-2xl font-black text-slate-900">Notification Center</h1>
              {unreadCount > 0 && (
                <span className="px-2.5 py-0.5 rounded-full bg-[#E86144] text-white text-xs font-extrabold shadow-2xs">
                  {unreadCount} unread
                </span>
              )}
            </div>
            <p className="text-xs md:text-sm text-slate-600 mt-1">
              Autonomous job opportunity discoveries, learning reminders, and real-time alerts.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end md:self-auto flex-wrap">
          <button
            onClick={() => void refreshNotifications()}
            disabled={loading}
            className="px-3 py-2 rounded-2xl text-xs font-bold bg-white text-slate-700 hover:bg-orange-50 border border-orange-100 flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs"
            title="Refresh messages and alerts"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-[#E86144] ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
          <button
            onClick={() => setActiveTab('inbox')}
            className={`px-4 py-2 rounded-2xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'inbox'
                ? 'bg-[#E86144] text-white shadow-xs'
                : 'bg-white text-slate-700 hover:bg-orange-50 border border-orange-100'
            }`}
          >
            Inbox ({notifications.length})
          </button>
          <button
            onClick={() => setActiveTab('preferences')}
            className={`px-4 py-2 rounded-2xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'preferences'
                ? 'bg-[#E86144] text-white shadow-xs'
                : 'bg-white text-slate-700 hover:bg-orange-50 border border-orange-100'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" /> Preferences
          </button>
        </div>
      </div>

      {/* Main Tab Content */}
      {activeTab === 'inbox' && (
        <div className="space-y-4">
          {/* Controls Bar */}
          <div className="p-4 rounded-3xl bg-white border border-orange-100 shadow-2xs flex flex-col md:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2 w-full md:w-auto">
              {/* Search */}
              <div className="relative flex-1 md:w-64">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Search alerts or companies..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-slate-200 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#E86144]"
                />
              </div>

              {/* Category selector */}
              <div className="flex items-center gap-1 bg-slate-50 p-1 rounded-xl border border-slate-200 text-xs">
                {(['all', 'messages', 'jobs', 'learning', 'system'] as const).map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-3 py-1 rounded-lg capitalize font-bold transition-all cursor-pointer ${
                      selectedCategory === cat ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    {cat === 'messages' ? 'Announcements & Messages' : cat}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2 self-end md:self-auto flex-wrap">
              <button
                onClick={() => setShowUnreadOnly((prev) => !prev)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                  showUnreadOnly
                    ? 'bg-orange-100 text-[#E86144] border-orange-300'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                {showUnreadOnly ? '✓ Unread Only' : 'Show All'}
              </button>

              {unreadCount > 0 && (
                <button
                  onClick={markAllAsRead}
                  className="px-3 py-1.5 rounded-xl text-xs font-bold bg-white text-slate-700 hover:text-[#E86144] border border-orange-100 hover:bg-orange-50 transition-all flex items-center gap-1 cursor-pointer"
                >
                  <CheckCheck className="w-3.5 h-3.5 text-[#E86144]" /> Mark all read
                </button>
              )}

              <button
                onClick={() => clearAll(true)}
                className="px-3 py-1.5 rounded-xl text-xs font-bold bg-white text-slate-600 hover:text-red-600 border border-slate-200 hover:border-red-200 hover:bg-red-50 transition-all flex items-center gap-1 cursor-pointer"
                title="Clear read notifications"
              >
                <Trash2 className="w-3.5 h-3.5" /> Clear read
              </button>
            </div>
          </div>

          {/* Notifications List */}
          <div className="space-y-3">
            {filteredNotifications.length === 0 ? (
              <div className="p-12 text-center rounded-3xl bg-white border border-dashed border-orange-200">
                <Briefcase className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <h3 className="text-base font-bold text-slate-800">No notifications found</h3>
                <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                  {showUnreadOnly
                    ? "You've read all your recent notifications! Switch to 'Show All' to view history."
                    : 'Your automated job discovery engine will notify you when new opportunities match your profile.'}
                </p>
              </div>
            ) : (
              filteredNotifications.map((notif) => (
                <div
                  key={notif.id}
                  className={`p-5 rounded-3xl border transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                    notif.is_read
                      ? 'bg-white border-slate-100 opacity-90 hover:opacity-100'
                      : 'bg-gradient-to-r from-orange-50/50 via-white to-white border-orange-200 shadow-2xs'
                  }`}
                >
                  <div className="flex items-start gap-3.5 flex-1 min-w-0">
                    <div
                      className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${
                        notif.is_read ? 'bg-slate-100 text-slate-500' : 'bg-orange-100 text-[#E86144]'
                      }`}
                    >
                      <Sparkles className="w-5 h-5" />
                    </div>

                    <div className="space-y-1 flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {getSourceBadge(notif)}
                        {!notif.is_read && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-[#E86144] text-white">
                            NEW
                          </span>
                        )}
                        {notif.created_at && (
                          <span className="text-xs text-slate-400 flex items-center gap-1.5" title={formatRealDateTime(notif.created_at)}>
                            <Clock className="w-3 h-3 text-slate-400" />
                            <span>{formatRealDateTime(notif.created_at)}</span>
                            <span className="text-[11px] text-[#E86144] font-medium">({formatRelativeTime(notif.created_at)})</span>
                          </span>
                        )}
                      </div>

                      <h4 className="text-sm font-bold text-slate-900 leading-snug">{notif.title}</h4>
                      <p className="text-xs text-slate-600 leading-relaxed">{notif.message}</p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0 self-end md:self-auto">
                    {notif.apply_url && (
                      <a
                        href={notif.apply_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => markAsRead(notif.id)}
                        className="px-3.5 py-1.5 rounded-xl bg-[#E86144] hover:bg-[#d45237] text-white text-xs font-bold transition-all flex items-center gap-1 shadow-xs cursor-pointer"
                      >
                        Apply on {notif.source_name || 'Portal'} <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}

                    {!notif.is_read && (
                      <button
                        onClick={() => markAsRead(notif.id)}
                        className="p-2 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
                        title="Mark as read"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                    )}

                    <button
                      onClick={() => deleteNotification(notif.id)}
                      className="p-2 rounded-xl text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Preferences Tab Content */}
      {activeTab === 'preferences' && (
        <form onSubmit={handleSavePreferences} className="space-y-6">
          {prefSaveNotice && (
            <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-600" />
              {prefSaveNotice}
            </div>
          )}

          {/* Browser Push Status Card */}
          <div className="p-6 rounded-3xl bg-white border border-orange-100 shadow-2xs space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-orange-400 to-[#E86144] text-white flex items-center justify-center">
                  <Volume2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Browser & Desktop Push Notifications</h3>
                  <p className="text-xs text-slate-500">
                    Receive background alerts when the application tab is minimized or closed.
                  </p>
                </div>
              </div>

              <div>
                {pushPermission === 'granted' ? (
                  <span className="px-3 py-1 rounded-xl bg-emerald-100 text-emerald-800 border border-emerald-200 text-xs font-bold flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5" /> Push Enabled
                  </span>
                ) : pushPermission === 'denied' ? (
                  <span className="px-3 py-1 rounded-xl bg-red-100 text-red-800 border border-red-200 text-xs font-bold">
                    Blocked in Browser
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={requestPushPermission}
                    className="px-4 py-2 rounded-xl bg-[#E86144] hover:bg-[#d45237] text-white text-xs font-bold transition-all shadow-xs cursor-pointer"
                  >
                    Enable Browser Push
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Granular Notification Channels */}
          <div className="p-6 rounded-3xl bg-white border border-orange-100 shadow-2xs space-y-5">
            <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider text-[#E86144]">
              Opportunity & Learning Alert Channels
            </h3>

            <div className="divide-y divide-slate-100">
              {/* Job Alerts */}
              <div className="py-4 flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-bold text-slate-900">Discovered Job Opportunities</p>
                  <p className="text-[11px] text-slate-500">
                    Notify when scrapers discover jobs from LinkedIn, Internshala, Indeed, Lever & Greenhouse.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={draftPrefs.job_alerts}
                    onChange={(e) => setDraftPrefs({ ...draftPrefs, job_alerts: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#E86144]"></div>
                </label>
              </div>

              {/* High-Match Job Alerts */}
              <div className="py-4 flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-bold text-slate-900">High-Relevance Matches Only</p>
                  <p className="text-[11px] text-slate-500">
                    Filter alerts so you are only pinged for opportunities meeting your minimum match threshold.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={draftPrefs.high_match_alerts}
                    onChange={(e) => setDraftPrefs({ ...draftPrefs, high_match_alerts: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#E86144]"></div>
                </label>
              </div>

              {/* Match Score Threshold Slider */}
              <div className="py-4 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-900">Minimum Match Score Threshold</span>
                  <span className="font-extrabold text-[#E86144]">{draftPrefs.min_match_threshold}% Match</span>
                </div>
                <input
                  type="range"
                  min="40"
                  max="95"
                  step="5"
                  value={draftPrefs.min_match_threshold}
                  onChange={(e) => setDraftPrefs({ ...draftPrefs, min_match_threshold: Number(e.target.value) })}
                  className="w-full accent-[#E86144] cursor-pointer"
                />
                <p className="text-[10px] text-slate-400">
                  Jobs with lower relevance than {draftPrefs.min_match_threshold}% will stay in your explore feed
                  without triggering push buzzers.
                </p>
              </div>

              {/* Assessments & Reminders */}
              <div className="py-4 flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-bold text-slate-900">Skill Assessments & Deadlines</p>
                  <p className="text-[11px] text-slate-500">
                    Reminders for scheduled coding tests and skill verification assessments.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={draftPrefs.assessment_reminders}
                    onChange={(e) => setDraftPrefs({ ...draftPrefs, assessment_reminders: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#E86144]"></div>
                </label>
              </div>

              {/* Assignments */}
              <div className="py-4 flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-bold text-slate-900">Assignments & Evaluation Results</p>
                  <p className="text-[11px] text-slate-500">
                    Notifies when faculty publishes new assignments or completes grading.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={draftPrefs.assignment_notifications}
                    onChange={(e) => setDraftPrefs({ ...draftPrefs, assignment_notifications: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#E86144]"></div>
                </label>
              </div>
            </div>
          </div>

          {/* Quiet Hours Configuration */}
          <div className="p-6 rounded-3xl bg-white border border-orange-100 shadow-2xs space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-slate-100 text-slate-700 flex items-center justify-center">
                  <VolumeX className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Quiet Hours Suppression</h3>
                  <p className="text-xs text-slate-500">
                    Automatically suppress device push notifications during rest hours.
                  </p>
                </div>
              </div>

              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={draftPrefs.quiet_hours_enabled}
                  onChange={(e) => setDraftPrefs({ ...draftPrefs, quiet_hours_enabled: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#E86144]"></div>
              </label>
            </div>

            {draftPrefs.quiet_hours_enabled && (
              <div className="pt-3 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Quiet Hours Start</label>
                  <input
                    type="time"
                    value={draftPrefs.quiet_hours_start}
                    onChange={(e) => setDraftPrefs({ ...draftPrefs, quiet_hours_start: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-800"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Quiet Hours End</label>
                  <input
                    type="time"
                    value={draftPrefs.quiet_hours_end}
                    onChange={(e) => setDraftPrefs({ ...draftPrefs, quiet_hours_end: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-800"
                  />
                </div>
                <p className="text-[11px] text-slate-400 sm:col-span-2">
                  Notifications received during quiet hours are saved to your in-app inbox without triggering audible
                  or desktop buzzers.
                </p>
              </div>
            )}
          </div>

          {/* Delivery Frequency */}
          <div className="p-6 rounded-3xl bg-white border border-orange-100 shadow-2xs space-y-3">
            <h3 className="text-sm font-bold text-slate-900">Notification Frequency</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                { id: 'immediate', label: '⚡ Immediate', desc: 'Real-time alerts as soon as discovered' },
                { id: 'daily_digest', label: '📅 Daily Digest', desc: 'Single summary at the end of day' },
                { id: 'off', label: '🔕 In-App Only', desc: 'Silent in-app inbox without push notifications' },
              ].map((opt) => (
                <div
                  key={opt.id}
                  onClick={() => setDraftPrefs({ ...draftPrefs, notification_frequency: opt.id as any })}
                  className={`p-3.5 rounded-2xl border cursor-pointer transition-all ${
                    draftPrefs.notification_frequency === opt.id
                      ? 'border-[#E86144] bg-orange-50/50 shadow-2xs'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <p className="text-xs font-bold text-slate-900">{opt.label}</p>
                  <p className="text-[11px] text-slate-500 mt-1 leading-normal">{opt.desc}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={savingPrefs}
              className="px-6 py-2.5 rounded-2xl bg-gradient-to-r from-[#FF7A59] to-[#E86144] hover:from-[#e86144] hover:to-[#d45237] text-white text-xs font-bold shadow-md transition-all cursor-pointer"
            >
              {savingPrefs ? 'Saving Preferences...' : 'Save All Preferences'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
