import React, { useEffect, useState } from 'react';
import {
  UsersRound,
  Plus,
  Search,
  Trash2,
  Send,
  Layers,
  FolderKanban,
  BarChart2,
  RefreshCw,
  CheckCircle2,
  X,
  UserPlus,
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
  type StudentGroupRow,
  type AdminStudentRow,
} from '../../../services/adminService';

export const GroupManagementPage: React.FC = () => {
  const { success, error } = useToast();
  const [groups, setGroups] = useState<StudentGroupRow[]>([]);
  const [allStudents, setAllStudents] = useState<AdminStudentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Modals state
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [notifyModalOpen, setNotifyModalOpen] = useState(false);
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [analyticsModalOpen, setAnalyticsModalOpen] = useState(false);

  const [activeGroup, setActiveGroup] = useState<StudentGroupRow | null>(null);
  const [groupAnalytics, setGroupAnalytics] = useState<any | null>(null);

  // Create form state
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newDept, setNewDept] = useState('');
  const [newBatch, setNewBatch] = useState<string>('');
  const [newTags, setNewTags] = useState('');
  const [selectedStudentUids, setSelectedStudentUids] = useState<string[]>([]);
  const [studentPickerSearch, setStudentPickerSearch] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Notification form state
  const [notifTitle, setNotifTitle] = useState('');
  const [notifMessage, setNotifMessage] = useState('');
  const [notifPriority, setNotifPriority] = useState('normal');

  // Assignment form state
  const [assignType, setAssignType] = useState<'assessment' | 'assignment'>('assessment');
  const [assignTargetId, setAssignTargetId] = useState('');
  const [assignTitle, setAssignTitle] = useState('');
  const [assignDueDate, setAssignDueDate] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      const [groupList, students] = await Promise.all([
        adminService.getGroups(),
        adminService.getStudents(),
      ]);
      setGroups(groupList || []);
      setAllStudents(students || []);
    } catch (err: any) {
      error(err?.message || 'Failed to load student groups.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setSubmitting(true);
    try {
      await adminService.createGroup({
        name: newName.trim(),
        description: newDesc.trim(),
        department: newDept.trim() || undefined,
        batch: newBatch ? parseInt(newBatch, 10) : undefined,
        tags: newTags ? newTags.split(',').map((t) => t.trim()).filter(Boolean) : [],
        student_ids: selectedStudentUids,
      });
      success(`Cohort group "${newName}" created successfully.`);
      setCreateModalOpen(false);
      setNewName('');
      setNewDesc('');
      setNewDept('');
      setNewBatch('');
      setNewTags('');
      setSelectedStudentUids([]);
      await loadData();
    } catch (err: any) {
      error(err?.message || 'Failed to create student group.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteGroup = async (groupId: string, name: string) => {
    if (!window.confirm(`Are you sure you want to delete group "${name}"?`)) return;
    try {
      await adminService.deleteGroup(groupId);
      success(`Group "${name}" deleted.`);
      await loadData();
    } catch (err: any) {
      error(err?.message || 'Failed to delete group.');
    }
  };

  const handleViewDetail = async (groupId: string) => {
    try {
      const detail = await adminService.getGroupDetail(groupId);
      setActiveGroup(detail);
      setDetailModalOpen(true);
    } catch (err: any) {
      error(err?.message || 'Failed to retrieve group details.');
    }
  };

  const handleSendNotification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeGroup || !notifTitle.trim() || !notifMessage.trim()) return;
    setSubmitting(true);
    try {
      const res = await adminService.notifyGroup(activeGroup.id, {
        title: notifTitle.trim(),
        message: notifMessage.trim(),
        priority: notifPriority,
      });
      success(res.message || 'Notification broadcast to group members.');
      setNotifyModalOpen(false);
      setNotifTitle('');
      setNotifMessage('');
    } catch (err: any) {
      error(err?.message || 'Failed to broadcast notification.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAssignToGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeGroup || !assignTargetId.trim()) return;
    setSubmitting(true);
    try {
      if (assignType === 'assessment') {
        const res = await adminService.assignGroupAssessment(
          activeGroup.id,
          assignTargetId.trim(),
          assignTitle.trim() || undefined,
          assignDueDate || undefined
        );
        success(res.message || 'Assessment allocated to group.');
      } else {
        const res = await adminService.assignGroupAssignment(
          activeGroup.id,
          assignTargetId.trim(),
          assignDueDate || undefined
        );
        success(res.message || 'Assignment allocated to group.');
      }
      setAssignModalOpen(false);
      setAssignTargetId('');
      setAssignTitle('');
      setAssignDueDate('');
    } catch (err: any) {
      error(err?.message || 'Failed to allocate to group.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleViewAnalytics = async (group: StudentGroupRow) => {
    setActiveGroup(group);
    try {
      const data = await adminService.getGroupAnalytics(group.id);
      setGroupAnalytics(data);
      setAnalyticsModalOpen(true);
    } catch (err: any) {
      error(err?.message || 'Failed to load group analytics.');
    }
  };

  const toggleStudentSelection = (uid: string) => {
    setSelectedStudentUids((prev) =>
      prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid]
    );
  };

  const filteredGroups = groups.filter((g) => {
    const q = searchQuery.toLowerCase();
    return (
      g.name.toLowerCase().includes(q) ||
      (g.department || '').toLowerCase().includes(q) ||
      (g.tags || []).some((t) => t.toLowerCase().includes(q))
    );
  });

  const pickerStudents = allStudents.filter((s) => {
    const q = studentPickerSearch.toLowerCase();
    return (
      s.display_name.toLowerCase().includes(q) ||
      s.email.toLowerCase().includes(q) ||
      (s.branch || '').toLowerCase().includes(q)
    );
  });

  if (loading) {
    return <ClayLoader label="Loading Student Cohort Groups..." />;
  }

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="clay-card p-6 sm:p-8 bg-white border border-slate-200/80 relative overflow-hidden">
        <div className="absolute -right-24 -top-24 w-72 h-72 bg-blue-100/40 rounded-full blur-3xl pointer-events-none" />

        <div className="relative flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <Badge variant="blue" size="sm" className="mb-2">
              Cohort & Academic Management
            </Badge>
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              Student Groups & Bulk Cohort Center
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 font-medium mt-1">
              Organize students into department batches, specialized training cohorts, and track aggregated readiness metrics.
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
              onClick={() => setCreateModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-sm transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Create New Group</span>
            </button>
          </div>
        </div>
      </div>

      {/* Search & Statistics Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="clay-card p-4 bg-white border border-slate-200/80 sm:col-span-2">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search groups by name, department, or tags..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>
        <div className="clay-card p-4 bg-white border border-slate-200/80 flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500 font-semibold">Total Active Groups</p>
            <p className="text-2xl font-black font-mono text-slate-900 mt-0.5">{groups.length}</p>
          </div>
          <UsersRound className="w-8 h-8 text-blue-600" />
        </div>
      </div>

      {/* Groups Grid */}
      {filteredGroups.length === 0 ? (
        <EmptyState
          title="No Student Groups Found"
          description="Create your first cohort group to assign assessments, assignments, and notifications in bulk."
          icon={<UsersRound className="w-8 h-8 text-blue-600" />}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredGroups.map((grp) => (
            <Card key={grp.id} variant="default" className="flex flex-col justify-between hover:border-blue-300 transition-all">
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm">{grp.name}</h3>
                    {grp.department && (
                      <p className="text-[11px] text-blue-600 font-semibold mt-0.5">
                        {grp.department} {grp.batch ? `• Batch ${grp.batch}` : ''}
                      </p>
                    )}
                  </div>
                  <Badge variant="blue" size="sm">
                    {grp.student_count} Students
                  </Badge>
                </div>

                {grp.description && (
                  <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
                    {grp.description}
                  </p>
                )}

                {grp.tags && grp.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {grp.tags.map((t) => (
                      <span
                        key={t}
                        className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[10px] font-medium"
                      >
                        #{t}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Group Quick Operations */}
              <div className="pt-4 border-t border-slate-100 mt-4 flex items-center justify-between gap-1.5">
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="p-1.5 text-blue-600 hover:bg-blue-50"
                    title="Cohort Analytics"
                    onClick={() => handleViewAnalytics(grp)}
                  >
                    <BarChart2 className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="p-1.5 text-blue-600 hover:bg-blue-50"
                    title="Broadcast Notification"
                    onClick={() => {
                      setActiveGroup(grp);
                      setNotifyModalOpen(true);
                    }}
                  >
                    <Send className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="p-1.5 text-blue-600 hover:bg-blue-50"
                    title="Bulk Allocation"
                    onClick={() => {
                      setActiveGroup(grp);
                      setAssignModalOpen(true);
                    }}
                  >
                    <Layers className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="p-1.5 text-red-500 hover:bg-red-50"
                    title="Delete Group"
                    onClick={() => handleDeleteGroup(grp.id, grp.name)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>

                <button
                  onClick={() => handleViewDetail(grp.id)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors cursor-pointer"
                >
                  Manage
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Modal: Create Group */}
      <Modal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        title="Create Student Cohort Group"
        subtitle="Group students by batch, stream, or placement readiness level"
        size="lg"
      >
        <form onSubmit={handleCreateGroup} className="space-y-4 text-xs font-medium">
          <div>
            <label className="text-slate-700 block mb-1 font-bold">Group Name *</label>
            <input
              type="text"
              required
              placeholder="e.g. 2026 CS Tier-1 Aspirants"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="text-slate-700 block mb-1">Description</label>
            <textarea
              rows={2}
              placeholder="Purpose of this group and target milestones..."
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-slate-700 block mb-1">Department / Branch</label>
              <input
                type="text"
                placeholder="e.g. Computer Science"
                value={newDept}
                onChange={(e) => setNewDept(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="text-slate-700 block mb-1">Graduation Batch Year</label>
              <input
                type="number"
                placeholder="e.g. 2026"
                value={newBatch}
                onChange={(e) => setNewBatch(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="text-slate-700 block mb-1">Tags (comma separated)</label>
            <input
              type="text"
              placeholder="e.g. FullStack, Tier1, Amazon-Drive"
              value={newTags}
              onChange={(e) => setNewTags(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Student Picker */}
          <div className="space-y-2 pt-2 border-t border-slate-100">
            <div className="flex items-center justify-between">
              <label className="text-slate-700 font-bold">
                Select Initial Members ({selectedStudentUids.length} selected)
              </label>
              <span className="text-[11px] text-slate-400">
                {allStudents.length} total students available
              </span>
            </div>
            <input
              type="text"
              placeholder="Filter students by name, email, or branch..."
              value={studentPickerSearch}
              onChange={(e) => setStudentPickerSearch(e.target.value)}
              className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
            />
            <div className="max-h-48 overflow-y-auto space-y-1 p-2 bg-slate-50/60 rounded-xl border border-slate-200">
              {pickerStudents.map((std) => {
                const selected = selectedStudentUids.includes(std.firebase_uid);
                return (
                  <div
                    key={std.firebase_uid}
                    onClick={() => toggleStudentSelection(std.firebase_uid)}
                    className={`flex items-center justify-between p-2 rounded-lg text-xs cursor-pointer transition-colors ${
                      selected ? 'bg-blue-100/70 border border-blue-200' : 'hover:bg-slate-100'
                    }`}
                  >
                    <div>
                      <span className="font-bold text-slate-900 block">{std.display_name}</span>
                      <span className="text-[10px] text-slate-500 font-mono">
                        {std.email} • {std.branch || 'General'}
                      </span>
                    </div>
                    {selected && <CheckCircle2 className="w-4 h-4 text-blue-600" />}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <Button variant="white" size="sm" type="button" onClick={() => setCreateModalOpen(false)}>
              Cancel
            </Button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 transition-colors cursor-pointer"
            >
              {submitting ? 'Creating...' : 'Create Group'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Group Detail & Member Management */}
      {activeGroup && (
        <Modal
          isOpen={detailModalOpen}
          onClose={() => setDetailModalOpen(false)}
          title={`Group: ${activeGroup.name}`}
          subtitle={`${activeGroup.student_count} registered members`}
          size="lg"
        >
          <div className="space-y-4 text-xs font-medium">
            <div className="flex items-center justify-between p-3 bg-blue-50/70 border border-blue-100 rounded-xl">
              <div>
                <p className="font-bold text-slate-900">{activeGroup.department || 'All Departments'}</p>
                <p className="text-[11px] text-slate-500">{activeGroup.description || 'No description provided.'}</p>
              </div>
              <Badge variant="blue" size="md">
                {activeGroup.student_count} Members
              </Badge>
            </div>

            <h4 className="font-bold text-slate-800 text-xs uppercase font-mono tracking-wider">
              Enrolled Students
            </h4>

            {activeGroup.members && activeGroup.members.length > 0 ? (
              <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-xl">
                {activeGroup.members.map((m) => (
                  <div key={m.firebase_uid} className="p-3 flex items-center justify-between hover:bg-slate-50">
                    <div>
                      <span className="font-bold text-slate-900 block">{m.display_name}</span>
                      <span className="text-[11px] text-slate-400 font-mono">{m.email} • {m.branch}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-slate-600 text-[11px]">
                        ATS: <strong className="text-emerald-600">{m.ats_score}%</strong>
                      </span>
                      <span className="text-slate-600 text-[11px]">
                        Readiness: <strong className="text-blue-600">{m.readiness_score}%</strong>
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-500 p-1"
                        title="Remove student from group"
                        onClick={async () => {
                          try {
                            await adminService.modifyGroupMembers(activeGroup.id, 'remove', [m.firebase_uid]);
                            success(`Removed ${m.display_name} from group.`);
                            const refreshed = await adminService.getGroupDetail(activeGroup.id);
                            setActiveGroup(refreshed);
                            await loadData();
                          } catch (err: any) {
                            error(err?.message || 'Failed to remove member.');
                          }
                        }}
                      >
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-slate-400 text-center py-6">No members assigned to this group yet.</p>
            )}

            <div className="flex justify-end pt-2">
              <Button variant="white" size="sm" onClick={() => setDetailModalOpen(false)}>
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal: Broadcast Notification */}
      {activeGroup && (
        <Modal
          isOpen={notifyModalOpen}
          onClose={() => setNotifyModalOpen(false)}
          title={`Broadcast to "${activeGroup.name}"`}
          subtitle={`Deliver direct in-app and push notification to all ${activeGroup.student_count} members`}
          size="md"
        >
          <form onSubmit={handleSendNotification} className="space-y-4 text-xs font-medium">
            <div>
              <label className="text-slate-700 block mb-1 font-bold">Notification Title *</label>
              <input
                type="text"
                required
                placeholder="e.g. Mandatory Placement Drive Preparation Session"
                value={notifTitle}
                onChange={(e) => setNotifTitle(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="text-slate-700 block mb-1 font-bold">Message Content *</label>
              <textarea
                rows={3}
                required
                placeholder="Write message for the cohort..."
                value={notifMessage}
                onChange={(e) => setNotifMessage(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="text-slate-700 block mb-1">Priority</label>
              <select
                value={notifPriority}
                onChange={(e) => setNotifPriority(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-blue-500"
              >
                <option value="normal">Normal</option>
                <option value="urgent">Urgent / High Priority</option>
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <Button variant="white" size="sm" type="button" onClick={() => setNotifyModalOpen(false)}>
                Cancel
              </Button>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 transition-colors cursor-pointer"
              >
                {submitting ? 'Broadcasting...' : 'Broadcast Notification'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal: Bulk Allocation (Assessment / Assignment) */}
      {activeGroup && (
        <Modal
          isOpen={assignModalOpen}
          onClose={() => setAssignModalOpen(false)}
          title={`Bulk Allocation to "${activeGroup.name}"`}
          subtitle="Assign an assessment or assignment to every member of this cohort"
          size="md"
        >
          <form onSubmit={handleAssignToGroup} className="space-y-4 text-xs font-medium">
            <div>
              <label className="text-slate-700 block mb-1 font-bold">Allocation Type</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setAssignType('assessment')}
                  className={`p-2.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                    assignType === 'assessment'
                      ? 'border-blue-600 bg-blue-50 text-blue-700'
                      : 'border-slate-200 bg-white text-slate-600'
                  }`}
                >
                  Assessment Test
                </button>
                <button
                  type="button"
                  onClick={() => setAssignType('assignment')}
                  className={`p-2.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                    assignType === 'assignment'
                      ? 'border-blue-600 bg-blue-50 text-blue-700'
                      : 'border-slate-200 bg-white text-slate-600'
                  }`}
                >
                  Practical Assignment
                </button>
              </div>
            </div>

            <div>
              <label className="text-slate-700 block mb-1 font-bold">
                {assignType === 'assessment' ? 'Assessment ID *' : 'Assignment ID *'}
              </label>
              <input
                type="text"
                required
                placeholder="e.g. python-core-assessment or asgn_001"
                value={assignTargetId}
                onChange={(e) => setAssignTargetId(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-blue-500"
              />
            </div>

            {assignType === 'assessment' && (
              <div>
                <label className="text-slate-700 block mb-1">Assessment Title (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Python Full Stack Screening Test"
                  value={assignTitle}
                  onChange={(e) => setAssignTitle(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-blue-500"
                />
              </div>
            )}

            <div>
              <label className="text-slate-700 block mb-1">Due Date (Optional)</label>
              <input
                type="date"
                value={assignDueDate}
                onChange={(e) => setAssignDueDate(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <Button variant="white" size="sm" type="button" onClick={() => setAssignModalOpen(false)}>
                Cancel
              </Button>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 transition-colors cursor-pointer"
              >
                {submitting ? 'Allocating...' : 'Allocate to Cohort'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal: Group Analytics */}
      {activeGroup && groupAnalytics && (
        <Modal
          isOpen={analyticsModalOpen}
          onClose={() => setAnalyticsModalOpen(false)}
          title={`Analytics: ${groupAnalytics.group_name}`}
          subtitle="Real-time cohort performance telemetry from MongoDB Atlas"
          size="md"
        >
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-blue-50/70 border border-blue-100 rounded-xl">
                <span className="text-[10px] text-slate-500 font-semibold uppercase">Cohort Readiness</span>
                <p className="text-2xl font-black font-mono text-blue-700 mt-1">
                  {groupAnalytics.avg_readiness}%
                </p>
              </div>
              <div className="p-3 bg-emerald-50/70 border border-emerald-100 rounded-xl">
                <span className="text-[10px] text-slate-500 font-semibold uppercase">Avg ATS Score</span>
                <p className="text-2xl font-black font-mono text-emerald-700 mt-1">
                  {groupAnalytics.avg_ats}%
                </p>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                <span className="text-[10px] text-slate-500 font-semibold uppercase">Assessments Taken</span>
                <p className="text-2xl font-black font-mono text-slate-900 mt-1">
                  {groupAnalytics.total_assessments_taken}
                </p>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                <span className="text-[10px] text-slate-500 font-semibold uppercase">Assignments Submitted</span>
                <p className="text-2xl font-black font-mono text-slate-900 mt-1">
                  {groupAnalytics.total_assignments_submitted}
                </p>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button variant="white" size="sm" onClick={() => setAnalyticsModalOpen(false)}>
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
