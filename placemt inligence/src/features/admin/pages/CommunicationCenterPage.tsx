import React, { useEffect, useState } from 'react';
import {
  Megaphone,
  Send,
  Trash2,
  Users,
  AlertTriangle,
  Clock,
  RefreshCw,
  Plus,
  Filter,
} from 'lucide-react';
import { Card, CardHeader } from '../../../components/common/Card';
import { Button } from '../../../components/common/Button';
import { Badge } from '../../../components/common/Badge';
import { Modal } from '../../../components/common/Modal';
import { ClayLoader } from '../../../components/common/ClayLoader';
import { EmptyState } from '../../../components/common/EmptyState';
import { useToast } from '../../../context/ToastContext';
import {
  adminService,
  type AnnouncementRow,
  type StudentGroupRow,
  type AdminStudentRow,
} from '../../../services/adminService';

export const CommunicationCenterPage: React.FC = () => {
  const { success, error } = useToast();
  const [announcements, setAnnouncements] = useState<AnnouncementRow[]>([]);
  const [groups, setGroups] = useState<StudentGroupRow[]>([]);
  const [students, setStudents] = useState<AdminStudentRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Composer Modal state
  const [composerOpen, setComposerOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [targetType, setTargetType] = useState<'ALL' | 'DEPARTMENT' | 'BATCH' | 'GROUP' | 'INDIVIDUAL'>('ALL');
  const [targetDepartment, setTargetDepartment] = useState('');
  const [targetBatch, setTargetBatch] = useState('');
  const [targetGroupId, setTargetGroupId] = useState('');
  const [targetUserId, setTargetUserId] = useState('');
  const [priority, setPriority] = useState<'normal' | 'urgent'>('normal');
  const [expiresAt, setExpiresAt] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [annList, groupList, studentList] = await Promise.all([
        adminService.getAnnouncements(),
        adminService.getGroups(),
        adminService.getStudents(),
      ]);
      setAnnouncements(annList || []);
      setGroups(groupList || []);
      setStudents(studentList || []);
    } catch (err: any) {
      error(err?.message || 'Failed to load communication telemetry.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !message.trim()) return;

    setSubmitting(true);
    try {
      const filterData: Record<string, any> = {};
      if (targetType === 'DEPARTMENT') filterData.department = targetDepartment.trim();
      if (targetType === 'BATCH') filterData.batch = parseInt(targetBatch, 10);
      if (targetType === 'GROUP') filterData.group_id = targetGroupId;
      if (targetType === 'INDIVIDUAL') filterData.user_id = targetUserId;

      const res = await adminService.createAnnouncement({
        title: title.trim(),
        message: message.trim(),
        target_type: targetType,
        target_filter: filterData,
        priority,
        expires_at: expiresAt || undefined,
      });

      success(res.message || 'Announcement broadcast successfully.');
      setComposerOpen(false);
      setTitle('');
      setMessage('');
      setTargetType('ALL');
      setTargetDepartment('');
      setTargetBatch('');
      setTargetGroupId('');
      setTargetUserId('');
      setPriority('normal');
      setExpiresAt('');
      await loadData();
    } catch (err: any) {
      error(err?.message || 'Failed to broadcast announcement.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteAnnouncement = async (id: string) => {
    if (!window.confirm('Delete this announcement?')) return;
    try {
      await adminService.deleteAnnouncement(id);
      success('Announcement removed from system.');
      await loadData();
    } catch (err: any) {
      error(err?.message || 'Failed to delete announcement.');
    }
  };

  if (loading) {
    return <ClayLoader label="Loading Institutional Communication Hub..." />;
  }

  const totalRecipients = announcements.reduce((acc, a) => acc + (a.recipient_count || 0), 0);
  const urgentCount = announcements.filter((a) => a.priority === 'urgent').length;

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="clay-card p-6 sm:p-8 bg-white border border-slate-200/80 relative overflow-hidden">
        <div className="absolute -right-24 -top-24 w-72 h-72 bg-blue-100/40 rounded-full blur-3xl pointer-events-none" />

        <div className="relative flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <Badge variant="blue" size="sm" className="mb-2">
              Communication & Real-Time Alerts
            </Badge>
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              Institutional Communication & Broadcast Center
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 font-medium mt-1">
              Broadcast official placement announcements, company drive notices, and targeted cohort alerts with FCM push delivery.
            </p>
          </div>

          <div className="flex flex-wrap gap-2.5">
            <Button
              variant="white"
              size="sm"
              onClick={loadData}
              leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
            >
              Refresh
            </Button>
            <button
              onClick={() => setComposerOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-sm transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Compose Announcement</span>
            </button>
          </div>
        </div>
      </div>

      {/* KPI Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="clay-card p-4 bg-white border border-slate-200/80">
          <div className="flex items-center justify-between text-xs text-slate-500 font-semibold">
            <span>Broadcasts Issued</span>
            <Megaphone className="w-4 h-4 text-blue-600" />
          </div>
          <p className="text-2xl font-black font-mono text-slate-900 mt-1">{announcements.length}</p>
        </div>

        <div className="clay-card p-4 bg-white border border-slate-200/80">
          <div className="flex items-center justify-between text-xs text-slate-500 font-semibold">
            <span>Total Recipient Reach</span>
            <Users className="w-4 h-4 text-blue-600" />
          </div>
          <p className="text-2xl font-black font-mono text-blue-600 mt-1">{totalRecipients}</p>
        </div>

        <div className="clay-card p-4 bg-white border border-slate-200/80">
          <div className="flex items-center justify-between text-xs text-slate-500 font-semibold">
            <span>Urgent Dispatches</span>
            <AlertTriangle className="w-4 h-4 text-amber-500" />
          </div>
          <p className="text-2xl font-black font-mono text-amber-600 mt-1">{urgentCount}</p>
        </div>

        <div className="clay-card p-4 bg-white border border-slate-200/80">
          <div className="flex items-center justify-between text-xs text-slate-500 font-semibold">
            <span>Delivery Channels</span>
            <Send className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-xs font-mono font-bold text-slate-700 mt-2">In-App + FCM Push</p>
        </div>
      </div>

      {/* Announcements Table */}
      {announcements.length === 0 ? (
        <EmptyState
          title="No Broadcast Announcements"
          description="Send your first broadcast announcement to reach all students or specific cohorts."
          icon={<Megaphone className="w-8 h-8 text-blue-600" />}
        />
      ) : (
        <Card variant="default">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left text-slate-700 font-medium">
              <thead className="bg-slate-50 text-slate-600 uppercase font-mono text-[10px] font-bold border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">Announcement</th>
                  <th className="px-4 py-3">Target Audience</th>
                  <th className="px-4 py-3">Priority</th>
                  <th className="px-4 py-3">Delivered</th>
                  <th className="px-4 py-3">Broadcast Date</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {announcements.map((ann) => (
                  <tr key={ann.id} className="hover:bg-blue-50/20 transition-colors">
                    <td className="px-4 py-3 max-w-xs">
                      <div className="font-bold text-slate-900">{ann.title}</div>
                      <div className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">{ann.message}</div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="blue" size="sm">
                        {ann.target_type}
                      </Badge>
                      {ann.target_filter && Object.keys(ann.target_filter).length > 0 && (
                        <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                          {JSON.stringify(ann.target_filter)}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {ann.priority === 'urgent' ? (
                        <Badge variant="danger" size="sm">Urgent</Badge>
                      ) : (
                        <Badge variant="neutral" size="sm">Normal</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono font-bold text-slate-900">
                      {ann.recipient_count} students
                    </td>
                    <td className="px-4 py-3 text-slate-500 font-mono text-[11px]">
                      {new Date(ann.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-500 hover:bg-red-50"
                        onClick={() => handleDeleteAnnouncement(ann.id)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Composer Modal */}
      <Modal
        isOpen={composerOpen}
        onClose={() => setComposerOpen(false)}
        title="Compose Official Broadcast Announcement"
        subtitle="Dispatches notifications to student feeds and triggers browser push notifications"
        size="lg"
      >
        <form onSubmit={handleBroadcast} className="space-y-4 text-xs font-medium">
          <div>
            <label className="text-slate-700 block mb-1 font-bold">Announcement Title *</label>
            <input
              type="text"
              required
              placeholder="e.g. Google Software Engineering Campus Drive Announced"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="text-slate-700 block mb-1 font-bold">Message Content *</label>
            <textarea
              rows={4}
              required
              placeholder="Enter complete details, registration deadlines, and eligibility criteria..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-slate-700 block mb-1 font-bold">Target Audience *</label>
              <select
                value={targetType}
                onChange={(e) => setTargetType(e.target.value as any)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-blue-500"
              >
                <option value="ALL">All Registered Students</option>
                <option value="DEPARTMENT">By Department / Branch</option>
                <option value="BATCH">By Graduation Batch Year</option>
                <option value="GROUP">By Cohort Group</option>
                <option value="INDIVIDUAL">Specific Individual Student</option>
              </select>
            </div>

            <div>
              <label className="text-slate-700 block mb-1 font-bold">Notification Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as any)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-blue-500"
              >
                <option value="normal">Normal Priority</option>
                <option value="urgent">Urgent / High Priority (Push Alarm)</option>
              </select>
            </div>
          </div>

          {/* Conditional Target Filter Pickers */}
          {targetType === 'DEPARTMENT' && (
            <div>
              <label className="text-slate-700 block mb-1 font-bold">Department Name *</label>
              <input
                type="text"
                required
                placeholder="e.g. Computer Science"
                value={targetDepartment}
                onChange={(e) => setTargetDepartment(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-blue-500"
              />
            </div>
          )}

          {targetType === 'BATCH' && (
            <div>
              <label className="text-slate-700 block mb-1 font-bold">Graduation Year *</label>
              <input
                type="number"
                required
                placeholder="e.g. 2026"
                value={targetBatch}
                onChange={(e) => setTargetBatch(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-blue-500"
              />
            </div>
          )}

          {targetType === 'GROUP' && (
            <div>
              <label className="text-slate-700 block mb-1 font-bold">Select Cohort Group *</label>
              <select
                required
                value={targetGroupId}
                onChange={(e) => setTargetGroupId(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-blue-500"
              >
                <option value="">-- Choose Group --</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name} ({g.student_count} members)
                  </option>
                ))}
              </select>
            </div>
          )}

          {targetType === 'INDIVIDUAL' && (
            <div>
              <label className="text-slate-700 block mb-1 font-bold">Select Student *</label>
              <select
                required
                value={targetUserId}
                onChange={(e) => setTargetUserId(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-blue-500"
              >
                <option value="">-- Choose Student --</option>
                {students.map((s) => (
                  <option key={s.firebase_uid} value={s.firebase_uid}>
                    {s.display_name} ({s.email})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="text-slate-700 block mb-1">Expiration Date (Optional)</label>
            <input
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <Button variant="white" size="sm" type="button" onClick={() => setComposerOpen(false)}>
              Cancel
            </Button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 transition-colors cursor-pointer"
            >
              {submitting ? 'Broadcasting...' : 'Broadcast Announcement'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
