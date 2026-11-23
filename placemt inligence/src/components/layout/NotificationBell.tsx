import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  Sparkles,
  ExternalLink,
  Check,
  Briefcase,
  BookOpen,
  Megaphone,
  Trash2,
  ChevronRight,
  ShieldAlert,
  Volume2,
} from 'lucide-react';
import { useNotifications } from '../../context/NotificationContext';
import type { NotificationItem } from '../../services/notificationService';
import { formatRelativeTime, formatRealDateTime } from '../../utils/dateUtils';

export const NotificationBell: React.FC = () => {
  const {
    notifications,
    unreadCount,
    pushSupported,
    pushPermission,
    requestPushPermission,
    refreshNotifications,
    markAsRead,
    markAllAsRead,
    deleteNotification,
  } = useNotifications();

  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'messages' | 'jobs' | 'learning' | 'system'>('all');
  const [enablingPush, setEnablingPush] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredNotifications = notifications.filter((notif) => {
    if (activeTab === 'all') return true;
    const cat = (notif.category || '').toLowerCase();
    const type = (notif.type || '').toLowerCase();
    if (activeTab === 'messages') return type.includes('announcement') || type.includes('message') || type.includes('notify') || cat === 'system';
    if (activeTab === 'jobs') return cat === 'jobs' || type.includes('job') || type.includes('application');
    if (activeTab === 'learning') return cat === 'learning' || type.includes('assessment') || type.includes('assignment') || type.includes('roadmap');
    if (activeTab === 'system') return cat === 'system' || cat === 'account' || type.includes('announcement') || type.includes('security');
    return true;
  });

  const handleNotificationClick = async (notif: NotificationItem) => {
    if (!notif.is_read) {
      await markAsRead(notif.id);
    }
    if (notif.apply_url) {
      window.open(notif.apply_url, '_blank', 'noopener,noreferrer');
    } else if (notif.link) {
      setIsOpen(false);
      navigate(notif.link);
    }
  };

  const handleEnablePush = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setEnablingPush(true);
    try {
      await requestPushPermission();
    } finally {
      setEnablingPush(false);
    }
  };

  const getSourceBadge = (notif: NotificationItem) => {
    const s = (notif.source_name || '').toLowerCase();
    const t = (notif.type || '').toLowerCase();

    if (s.includes('internshala')) {
      return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-100 text-sky-800 border border-sky-200">Internshala</span>;
    }
    if (s.includes('linkedin')) {
      return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200">LinkedIn</span>;
    }
    if (s.includes('indeed')) {
      return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">Indeed</span>;
    }
    if (s.includes('firecrawl')) {
      return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-100 text-orange-800 border border-orange-200">Firecrawl AI</span>;
    }
    if (s.includes('lever') || s.includes('greenhouse')) {
      return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">{notif.source_name}</span>;
    }
    if (t.includes('assessment') || t.includes('assignment')) {
      return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-200">Learning</span>;
    }
    if (t.includes('announcement')) {
      return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">Broadcast</span>;
    }
    return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">{notif.category || 'Alert'}</span>;
  };

  const getCategoryIcon = (notif: NotificationItem) => {
    const t = (notif.type || '').toLowerCase();
    const c = (notif.category || '').toLowerCase();
    if (c === 'jobs' || t.includes('job')) return <Briefcase className="w-3.5 h-3.5 text-[#E86144]" />;
    if (c === 'learning' || t.includes('assessment') || t.includes('assignment')) return <BookOpen className="w-3.5 h-3.5 text-purple-600" />;
    if (t.includes('announcement')) return <Megaphone className="w-3.5 h-3.5 text-amber-600" />;
    return <Sparkles className="w-3.5 h-3.5 text-slate-600" />;
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => {
          setIsOpen((prev) => {
            if (!prev) void refreshNotifications();
            return !prev;
          });
        }}
        className="relative p-2 rounded-2xl bg-white border border-orange-100 hover:border-orange-200 text-slate-600 hover:text-slate-900 shadow-2xs transition-all active:scale-95 cursor-pointer"
        aria-label="View messages and notifications"
      >
        <Bell className="w-4 h-4 text-slate-700" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-gradient-to-r from-[#FF7A59] to-[#E86144] text-white text-[10px] font-extrabold flex items-center justify-center shadow-xs">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 top-12 w-80 sm:w-96 max-h-[520px] flex flex-col rounded-3xl bg-white border border-orange-100 shadow-[0_20px_50px_rgba(15,23,42,0.14)] z-50 overflow-hidden animate-in fade-in duration-150">
          {/* Header */}
          <div className="p-4 border-b border-orange-100/80 bg-gradient-to-r from-[#FFFBF8] to-[#FFF5EE] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-xl bg-[#FF7A59]/10 text-[#E86144] flex items-center justify-center">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-bold text-slate-900 leading-tight">Notifications & Alerts</h3>
                <p className="text-[10px] text-slate-500">Live opportunity discovery & updates</p>
              </div>
            </div>
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="text-[11px] font-semibold text-[#E86144] hover:underline flex items-center gap-1 cursor-pointer"
              >
                <Check className="w-3 h-3" />
                Mark all read
              </button>
            )}
          </div>

          {/* Contextual Push Notification Banner */}
          {pushSupported && pushPermission === 'default' && (
            <div className="p-3 bg-gradient-to-r from-orange-500 to-[#E86144] text-white flex items-center justify-between gap-3 shadow-inner">
              <div className="flex items-center gap-2">
                <Volume2 className="w-4 h-4 shrink-0" />
                <div>
                  <p className="text-[11px] font-bold leading-tight">Enable Desktop Job Alerts</p>
                  <p className="text-[9px] text-orange-100">Never miss newly discovered high-match jobs</p>
                </div>
              </div>
              <button
                onClick={handleEnablePush}
                disabled={enablingPush}
                className="px-2.5 py-1 rounded-xl bg-white text-[#E86144] text-[10px] font-extrabold hover:bg-orange-50 transition-all shrink-0 cursor-pointer shadow-xs"
              >
                {enablingPush ? 'Enabling...' : 'Turn On'}
              </button>
            </div>
          )}

          {/* Category Tabs */}
          <div className="flex items-center gap-1 p-2 bg-slate-50/80 border-b border-slate-100 text-[11px] font-semibold">
            {(['all', 'messages', 'jobs', 'learning', 'system'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 py-1 rounded-xl capitalize transition-all cursor-pointer ${
                  activeTab === tab
                    ? 'bg-white text-slate-900 shadow-2xs font-bold'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* List */}
          <div className="overflow-y-auto flex-1 divide-y divide-slate-100 p-2 max-h-[320px]">
            {filteredNotifications.length === 0 ? (
              <div className="py-8 px-4 text-center">
                <Briefcase className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-xs font-semibold text-slate-700">No {activeTab !== 'all' ? activeTab : ''} Notifications</p>
                <p className="text-[11px] text-slate-400 mt-1">Continuous scraper will notify you when new jobs match your profile.</p>
              </div>
            ) : (
              filteredNotifications.map((notif) => (
                <div
                  key={notif.id}
                  onClick={() => handleNotificationClick(notif)}
                  className={`group relative p-3 rounded-2xl transition-all cursor-pointer ${
                    notif.is_read ? 'hover:bg-slate-50/80 opacity-80' : 'bg-orange-50/40 hover:bg-orange-50/80'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <div className="w-4 h-4 rounded-md bg-white flex items-center justify-center border border-slate-200">
                        {getCategoryIcon(notif)}
                      </div>
                      {getSourceBadge(notif)}
                      {!notif.is_read && <span className="w-1.5 h-1.5 rounded-full bg-[#E86144]" />}
                    </div>
                    <div className="flex items-center gap-1">
                      {notif.created_at && (
                        <span
                          className="text-[10px] text-slate-400 shrink-0 font-medium"
                          title={formatRealDateTime(notif.created_at)}
                        >
                          {formatRelativeTime(notif.created_at)}
                        </span>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteNotification(notif.id);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-red-500 rounded-lg hover:bg-white transition-opacity"
                        title="Delete notification"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>

                  <p className="text-xs font-bold text-slate-900 line-clamp-1">{notif.title}</p>
                  <p className="text-[11px] text-slate-600 line-clamp-2 mt-0.5 leading-relaxed">{notif.message}</p>

                  {notif.apply_url && (
                    <div className="mt-2 flex items-center justify-between pt-1 border-t border-slate-100">
                      <span className="text-[10px] font-semibold text-slate-400">Direct Application</span>
                      <span className="text-[11px] font-bold text-[#E86144] hover:underline flex items-center gap-1">
                        Apply Now <ExternalLink className="w-3 h-3" />
                      </span>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Footer - Link to Notification Center */}
          <div className="p-2.5 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
            <button
              onClick={() => {
                setIsOpen(false);
                navigate('/student/notifications');
              }}
              className="w-full py-1.5 px-3 rounded-xl bg-white hover:bg-orange-50 border border-orange-100 text-[11px] font-bold text-slate-700 hover:text-[#E86144] flex items-center justify-center gap-1 transition-all cursor-pointer"
            >
              Open Notification Center <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
