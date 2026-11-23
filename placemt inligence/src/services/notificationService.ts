import { apiClient } from './apiClient';

export type NotificationCategory = 'all' | 'jobs' | 'learning' | 'account' | 'system';

export interface NotificationItem {
  id: string;
  user_id?: string;
  title: string;
  message: string;
  type?: string;
  category?: string;
  is_read: boolean;
  created_at?: string;
  link?: string;
  action_url?: string;
  job_id?: string;
  company?: string;
  role?: string;
  apply_url?: string;
  source_name?: string;
  metadata?: Record<string, any>;
  delivery_status?: string;
}

export interface NotificationListResponse {
  items: NotificationItem[];
  total: number;
  unread_count: number;
}

export interface UnreadCountResponse {
  unread_count: number;
}

export interface UserNotificationPreferences {
  job_alerts: boolean;
  high_match_alerts: boolean;
  assignment_notifications: boolean;
  assessment_reminders: boolean;
  roadmap_reminders: boolean;
  email_notifications: boolean;
  quiet_hours_enabled: boolean;
  quiet_hours_start: string;
  quiet_hours_end: string;
  notification_frequency: 'immediate' | 'daily_digest' | 'off';
  min_match_threshold: number;
}

export interface AdminAnnouncementRequest {
  title: string;
  message: string;
  category?: string;
  target_role?: string;
  target_branch?: string;
  target_batch?: string;
  action_url?: string;
}

export interface NotificationStatsResponse {
  total_notifications: number;
  unread_notifications: number;
  registered_devices: number;
  active_fcm_tokens: number;
  push_success_count: number;
  push_failure_count: number;
  deliveries_today: number;
}

export const notificationService = {
  /**
   * Fetch user notifications with category and read status filtering.
   */
  async getNotifications(params?: {
    category?: string;
    is_read?: boolean;
    skip?: number;
    limit?: number;
  }): Promise<NotificationListResponse> {
    const q = new URLSearchParams();
    if (params?.category && params.category !== 'all') {
      q.set('category', params.category);
    }
    if (typeof params?.is_read === 'boolean') {
      q.set('is_read', String(params.is_read));
    }
    if (params?.skip !== undefined) q.set('skip', String(params.skip));
    if (params?.limit !== undefined) q.set('limit', String(params.limit));

    const qs = q.toString();
    const endpoint = `/notifications${qs ? `?${qs}` : ''}`;
    const data = await apiClient.get<NotificationListResponse | NotificationItem[]>(endpoint);

    // Backward compatibility if array returned
    if (Array.isArray(data)) {
      return {
        items: data,
        total: data.length,
        unread_count: data.filter((d) => !d.is_read).length,
      };
    }
    return data;
  },

  /**
   * Get unread count for fast badge rendering.
   */
  async getUnreadCount(): Promise<number> {
    try {
      const res = await apiClient.get<UnreadCountResponse>('/notifications/unread-count');
      return res.unread_count ?? 0;
    } catch {
      return 0;
    }
  },

  /**
   * Mark all notifications as read.
   */
  async markAllRead(): Promise<{ updated: number; message?: string }> {
    return apiClient.put<{ updated: number; message?: string }>('/notifications/read-all', {});
  },

  /**
   * Mark a single notification as read.
   */
  async markRead(id: string): Promise<{ message: string }> {
    return apiClient.put<{ message: string }>(`/notifications/${encodeURIComponent(id)}/read`, {});
  },

  /**
   * Delete a single notification.
   */
  async deleteNotification(id: string): Promise<{ message: string }> {
    return apiClient.delete<{ message: string }>(`/notifications/${encodeURIComponent(id)}`);
  },

  /**
   * Clear all or only read notifications.
   */
  async clearAll(onlyRead: boolean = true): Promise<{ deleted_count: number }> {
    return apiClient.delete<{ deleted_count: number }>(`/notifications/clear-all?only_read=${onlyRead}`);
  },

  /**
   * Retrieve current user's notification preferences.
   */
  async getPreferences(): Promise<UserNotificationPreferences> {
    return apiClient.get<UserNotificationPreferences>('/notifications/preferences');
  },

  /**
   * Update current user's notification preferences.
   */
  async updatePreferences(prefs: UserNotificationPreferences): Promise<UserNotificationPreferences> {
    return apiClient.put<UserNotificationPreferences>('/notifications/preferences', prefs);
  },

  /**
   * Register client device token for FCM browser push notifications.
   */
  async registerDeviceToken(token: string, deviceType: string = 'browser'): Promise<{ status: string }> {
    return apiClient.post<{ status: string }>('/notifications/device-token', {
      token,
      device_type: deviceType,
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    });
  },

  /**
   * Unregister client device token on logout.
   */
  async unregisterDeviceToken(token: string): Promise<{ status: string; removed: boolean }> {
    return apiClient.delete<{ status: string; removed: boolean }>(
      `/notifications/device-token?token=${encodeURIComponent(token)}`
    );
  },

  /**
   * Admin: Get notification analytics and FCM token health.
   */
  async getAdminStats(): Promise<NotificationStatsResponse> {
    return apiClient.get<NotificationStatsResponse>('/notifications/admin/stats');
  },

  /**
   * Admin: Send targeted broadcast announcement to students.
   */
  async sendAnnouncement(payload: AdminAnnouncementRequest): Promise<{ status: string; message: string; details: any }> {
    return apiClient.post<{ status: string; message: string; details: any }>(
      '/notifications/admin/announcement',
      payload
    );
  },
};
