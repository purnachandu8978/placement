import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import {
  notificationService,
  type NotificationItem,
  type UserNotificationPreferences,
} from '../services/notificationService';
import {
  isPushNotificationSupported,
  getNotificationPermissionState,
  requestPushNotificationPermission,
  setupForegroundMessageHandler,
} from '../services/fcm';

interface NotificationContextType {
  notifications: NotificationItem[];
  unreadCount: number;
  loading: boolean;
  pushSupported: boolean;
  pushPermission: NotificationPermission | 'unsupported';
  preferences: UserNotificationPreferences | null;
  toast: NotificationItem | null;
  dismissToast: () => void;
  refreshNotifications: (category?: string) => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  deleteNotification: (id: string) => Promise<void>;
  clearAll: (onlyRead?: boolean) => Promise<void>;
  requestPushPermission: () => Promise<boolean>;
  updatePreferences: (updated: Partial<UserNotificationPreferences>) => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, user } = useAuth();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);
  const [pushSupported, setPushSupported] = useState<boolean>(false);
  const [pushPermission, setPushPermission] = useState<NotificationPermission | 'unsupported'>('default');
  const [preferences, setPreferences] = useState<UserNotificationPreferences | null>(null);
  const [toast, setToast] = useState<NotificationItem | null>(null);

  // Initialize push support state
  useEffect(() => {
    const supported = isPushNotificationSupported();
    setPushSupported(supported);
    setPushPermission(getNotificationPermissionState());
  }, []);

  const refreshNotifications = useCallback(async (category?: string) => {
    if (!isAuthenticated) return;
    setLoading(true);
    try {
      const res = await notificationService.getNotifications({
        category: category || 'all',
        limit: 50,
      });
      const rawItems = res.items || [];
      const seen = new Set<string>();
      const deduped: NotificationItem[] = [];
      for (const item of rawItems) {
        const key = `${(item.title || '').trim().toLowerCase()}:::${(item.message || '').trim().toLowerCase()}`;
        if (!seen.has(key)) {
          seen.add(key);
          deduped.push(item);
        }
      }
      setNotifications(deduped);
      const trueUnread = res.unread_count !== undefined 
        ? res.unread_count 
        : deduped.filter((n) => !n.is_read).length;
      setUnreadCount(trueUnread);
    } catch (err) {
      console.warn('Failed to refresh notifications:', err);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  const loadPreferences = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const p = await notificationService.getPreferences();
      setPreferences(p);
    } catch {
      // Offline fallback
    }
  }, [isAuthenticated]);

  // Synchronize when authentication state changes
  useEffect(() => {
    if (isAuthenticated) {
      void refreshNotifications();
      void loadPreferences();
    } else {
      setNotifications([]);
      setUnreadCount(0);
      setPreferences(null);
    }
  }, [isAuthenticated, user?.id, refreshNotifications, loadPreferences]);

  useEffect(() => {
    // Foreground FCM listener with strict deduplication
    const unsubscribeFCM = setupForegroundMessageHandler((payload) => {
      const notifId = payload.data?.notification_id || String(Date.now());
      const title = payload.notification?.title || payload.data?.title || '⚡ New Message or Alert';
      const message = payload.notification?.body || payload.data?.body || 'A new message has been posted.';
      const key = `${title.trim().toLowerCase()}:::${message.trim().toLowerCase()}`;

      setNotifications((prev) => {
        const exists = prev.some((n) =>
          n.id === notifId ||
          `${(n.title || '').trim().toLowerCase()}:::${(n.message || '').trim().toLowerCase()}` === key
        );
        if (exists) {
          return prev;
        }

        const newNotif: NotificationItem = {
          id: notifId,
          title,
          message,
          type: payload.data?.type || 'announcement',
          category: payload.data?.category || 'system',
          is_read: false,
          created_at: new Date().toISOString(),
          link: payload.data?.link || '/student/notifications',
          action_url: payload.data?.action_url || payload.data?.link,
          apply_url: payload.data?.apply_url,
          company: payload.data?.company,
          role: payload.data?.role,
          source_name: payload.data?.source_name,
        };
        setToast(newNotif);
        return [newNotif, ...prev];
      });

      // Synchronize exact unread count from backend
      void notificationService.getUnreadCount().then((count) => setUnreadCount(count)).catch(() => {});
    });

    // Active polling interval for real-time messages & alerts (every 15s when authenticated)
    const interval = setInterval(() => {
      if (isAuthenticated) {
        notificationService
          .getUnreadCount()
          .then((count) => {
            setUnreadCount(count);
          })
          .catch(() => {});
      }
    }, 15000);

    return () => {
      unsubscribeFCM();
      clearInterval(interval);
    };
  }, [isAuthenticated]);

  // Auto-dismiss toast after 6 seconds
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => {
      setToast(null);
    }, 6000);
    return () => clearTimeout(timer);
  }, [toast]);

  const dismissToast = () => setToast(null);

  const markAsRead = async (id: string) => {
    try {
      await notificationService.markRead(id);
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (err) {
      console.warn('Failed to mark notification read:', err);
    }
  };

  const markAllAsRead = async () => {
    try {
      await notificationService.markAllRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch (err) {
      console.warn('Failed to mark all notifications read:', err);
    }
  };

  const deleteNotification = async (id: string) => {
    try {
      await notificationService.deleteNotification(id);
      setNotifications((prev) => {
        const item = prev.find((n) => n.id === id);
        if (item && !item.is_read) {
          setUnreadCount((c) => Math.max(0, c - 1));
        }
        return prev.filter((n) => n.id !== id);
      });
    } catch (err) {
      console.warn('Failed to delete notification:', err);
    }
  };

  const clearAll = async (onlyRead: boolean = true) => {
    try {
      await notificationService.clearAll(onlyRead);
      if (onlyRead) {
        setNotifications((prev) => prev.filter((n) => !n.is_read));
      } else {
        setNotifications([]);
        setUnreadCount(0);
      }
    } catch (err) {
      console.warn('Failed to clear notifications:', err);
    }
  };

  const requestPushPermission = async (): Promise<boolean> => {
    const result = await requestPushNotificationPermission();
    setPushPermission(result.permission);
    return result.granted;
  };

  const updatePreferences = async (updated: Partial<UserNotificationPreferences>) => {
    if (!preferences) return;
    const next = { ...preferences, ...updated };
    try {
      const saved = await notificationService.updatePreferences(next);
      setPreferences(saved);
    } catch (err) {
      console.warn('Failed to save notification preferences:', err);
    }
  };

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        loading,
        pushSupported,
        pushPermission,
        preferences,
        toast,
        dismissToast,
        refreshNotifications,
        markAsRead,
        markAllAsRead,
        deleteNotification,
        clearAll,
        requestPushPermission,
        updatePreferences,
      }}
    >
      {children}

      {/* Global Foreground In-App Toast Popup */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 max-w-sm w-full animate-in slide-in-from-bottom-5 duration-300">
          <div className="p-4 rounded-3xl bg-white/95 backdrop-blur-md border border-orange-200/80 shadow-[0_20px_40px_rgba(232,97,68,0.15)] flex items-start gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#FF7A59] to-[#E86144] text-white flex items-center justify-center shrink-0 shadow-xs">
              ⚡
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#E86144]">
                  {toast.category || 'Job Alert'}
                </span>
                <button
                  onClick={dismissToast}
                  className="text-xs text-slate-400 hover:text-slate-600 font-bold p-1 cursor-pointer"
                >
                  ✕
                </button>
              </div>
              <p className="text-xs font-bold text-slate-900 mt-0.5 truncate">{toast.title}</p>
              <p className="text-[11px] text-slate-600 line-clamp-2 mt-0.5 leading-relaxed">{toast.message}</p>
              <div className="mt-2.5 flex items-center gap-2">
                {toast.apply_url ? (
                  <a
                    href={toast.apply_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => {
                      markAsRead(toast.id);
                      dismissToast();
                    }}
                    className="px-3 py-1 rounded-xl bg-[#E86144] hover:bg-[#d45237] text-white text-[11px] font-bold transition-all shadow-xs"
                  >
                    Apply on {toast.source_name || 'Portal'} →
                  </a>
                ) : (
                  <button
                    onClick={() => {
                      markAsRead(toast.id);
                      dismissToast();
                    }}
                    className="px-3 py-1 rounded-xl bg-orange-100 text-[#E86144] hover:bg-orange-200 text-[11px] font-bold transition-all"
                  >
                    View Alert
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
};
