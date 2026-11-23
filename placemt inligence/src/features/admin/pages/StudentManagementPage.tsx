import React, { useEffect, useState } from 'react';
import {
  Users,
  Search,
  ShieldCheck,
  FileText,
  RefreshCw,
  Filter,
  CheckCircle2,
  XCircle,
  Eye,
  Edit,
  Send,
  UserCheck,
  UserX,
  UsersRound,
  GraduationCap,
  Briefcase,
  Layers,
  FolderKanban,
  FileSpreadsheet,
  Award,
  Bell,
  Clock,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
} from 'lucide-react';
import { Card } from '../../../components/common/Card';
import { Button } from '../../../components/common/Button';
import { Badge } from '../../../components/common/Badge';
import { Modal } from '../../../components/common/Modal';
import { ClayLoader } from '../../../components/common/ClayLoader';
import { EmptyState } from '../../../components/common/EmptyState';
import { ProgressBar } from '../../../components/common/ProgressBar';
import { useToast } from '../../../context/ToastContext';
import {
  adminService,
  type AdminStudentRow,
  type Student360Data,
  type StudentGroupRow,
} from '../../../services/adminService';

export const StudentManagementPage: React.FC = () => {
  const { success, error } = useToast();
  const [students, setStudents] = useState<AdminStudentRow[]>([]);
  const [groups, setGroups] = useState<StudentGroupRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [batchFilter, setBatchFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [readinessFilter, setReadinessFilter] = useState('');
  const [resumeFilter, setResumeFilter] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'readiness' | 'ats' | 'date'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 12;

  // Bulk Selection
  const [selectedUids, setSelectedUids] = useState<string[]>([]);

  // 360° Profile Drawer
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [loading360, setLoading360] = useState(false);
  const [student360, setStudent360] = useState<Student360Data | null>(null);
  const [activeTab, setActiveTab] = useState<string>('personal');

  // Admin Action Modals
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [notifyModalOpen, setNotifyModalOpen] = useState(false);
  const [assignGroupModalOpen, setAssignGroupModalOpen] = useState(false);
  const [auditHistory, setAuditHistory] = useState<any[]>([]);

  // Edit form state
  const [editFullName, setEditFullName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editCollege, setEditCollege] = useState('');
  const [editDegree, setEditDegree] = useState('');
  const [editBranch, setEditBranch] = useState('');
  const [editGraduationYear, setEditGraduationYear] = useState<string>('');
  const [editSemester, setEditSemester] = useState<string>('');
  const [editCgpa, setEditCgpa] = useState<string>('');
  const [editBacklogs, setEditBacklogs] = useState<string>('');
  const [editSaving, setEditSaving] = useState(false);

  // Direct Notify form state
  const [notifTitle, setNotifTitle] = useState('');
  const [notifMessage, setNotifMessage] = useState('');
  const [notifPriority, setNotifPriority] = useState('normal');
  const [notifSending, setNotifSending] = useState(false);

  // Group add state
  const [selectedGroupId, setSelectedGroupId] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      const [data, groupList] = await Promise.all([
        adminService.getStudents(),
        adminService.getGroups(),
      ]);
      setStudents(data || []);
      setGroups(groupList || []);
    } catch (err: any) {
      error(err?.message || 'Unable to load student directory.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const openStudent360 = async (uid: string) => {
    setDrawerOpen(true);
    setLoading360(true);
    setActiveTab('personal');
    try {
      const [dossier, history] = await Promise.all([
        adminService.getStudent360(uid),
        adminService.getStudentHistory(uid).catch(() => []),
      ]);
      setStudent360(dossier);
      setAuditHistory(history || []);

      // Populate edit fields
      setEditFullName(dossier.personal_info.display_name || '');
      setEditPhone(dossier.personal_info.phone || '');
      setEditCollege(dossier.academic_info.college || '');
      setEditDegree(dossier.academic_info.degree || '');
      setEditBranch(dossier.academic_info.branch || '');
      setEditGraduationYear(dossier.academic_info.graduation_year ? String(dossier.academic_info.graduation_year) : '');
      setEditSemester(dossier.academic_info.semester ? String(dossier.academic_info.semester) : '');
      setEditCgpa(dossier.academic_info.cgpa ? String(dossier.academic_info.cgpa) : '');
      setEditBacklogs(dossier.academic_info.backlogs ? String(dossier.academic_info.backlogs) : '0');
    } catch (err: any) {
      error(err?.message || 'Failed to load Student 360° dossier.');
      setDrawerOpen(false);
    } finally {
      setLoading360(false);
    }
  };

  const handleToggleSuspend = async (uid: string, currentStatus: string) => {
    try {
      if (currentStatus === 'suspended') {
        await adminService.activateStudent(uid);
        success('Student account reactivated.');
      } else {
        await adminService.suspendStudent(uid);
        success('Student account suspended.');
      }
      await loadData();
      if (student360 && student360.personal_info.uid === uid) {
        setStudent360((prev) =>
          prev
            ? {
                ...prev,
                personal_info: {
                  ...prev.personal_info,
                  account_status: currentStatus === 'suspended' ? 'active' : 'suspended',
                },
              }
            : null
        );
      }
    } catch (err: any) {
      error(err?.message || 'Failed to update account status.');
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!student360) return;
    setEditSaving(true);
    try {
      await adminService.updateStudentProfile(student360.personal_info.uid, {
        full_name: editFullName.trim(),
        phone: editPhone.trim(),
        college: editCollege.trim(),
        degree: editDegree.trim(),
        branch: editBranch.trim(),
        graduation_year: editGraduationYear ? parseInt(editGraduationYear, 10) : undefined,
        semester: editSemester ? parseInt(editSemester, 10) : undefined,
        cgpa: editCgpa ? parseFloat(editCgpa) : undefined,
        backlogs: editBacklogs ? parseInt(editBacklogs, 10) : 0,
      });
      success('Student profile updated successfully.');
      setEditModalOpen(false);
      await openStudent360(student360.personal_info.uid);
      await loadData();
    } catch (err: any) {
      error(err?.message || 'Failed to update profile.');
    } finally {
      setEditSaving(false);
    }
  };

  const handleSendDirectNotification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!student360 || !notifTitle.trim() || !notifMessage.trim()) return;
    setNotifSending(true);
    try {
      await adminService.sendStudentNotification(student360.personal_info.uid, {
        title: notifTitle.trim(),
        message: notifMessage.trim(),
        priority: notifPriority,
      });
      success('Direct alert sent to student.');
      setNotifyModalOpen(false);
      setNotifTitle('');
      setNotifMessage('');
      await openStudent360(student360.personal_info.uid);
    } catch (err: any) {
      error(err?.message || 'Failed to dispatch notification.');
    } finally {
      setNotifSending(false);
    }
  };

  const handleAssignToGroup = async () => {
    if (!student360 || !selectedGroupId) return;
    try {
      await adminService.modifyGroupMembers(selectedGroupId, 'add', [student360.personal_info.uid]);
      success('Student added to cohort group.');
      setAssignGroupModalOpen(false);
      setSelectedGroupId('');
      await openStudent360(student360.personal_info.uid);
      await loadData();
    } catch (err: any) {
      error(err?.message || 'Failed to assign group.');
    }
  };

  // Bulk Actions
  const handleBulkSuspend = async () => {
    if (!selectedUids.length) return;
    if (!window.confirm(`Suspend ${selectedUids.length} selected accounts?`)) return;
    try {
      for (const uid of selectedUids) {
        await adminService.suspendStudent(uid);
      }
      success(`Suspended ${selectedUids.length} student accounts.`);
      setSelectedUids([]);
      await loadData();
    } catch (err: any) {
      error(err?.message || 'Bulk suspension failed.');
    }
  };

  const handleBulkActivate = async () => {
    if (!selectedUids.length) return;
    try {
      for (const uid of selectedUids) {
        await adminService.activateStudent(uid);
      }
      success(`Activated ${selectedUids.length} student accounts.`);
      setSelectedUids([]);
      await loadData();
    } catch (err: any) {
      error(err?.message || 'Bulk activation failed.');
    }
  };

  // Filter & Sort logic
  const filtered = students.filter((s) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      s.display_name.toLowerCase().includes(q) ||
      s.email.toLowerCase().includes(q) ||
      (s.college || '').toLowerCase().includes(q) ||
      (s.branch || '').toLowerCase().includes(q);

    const matchesDept = !deptFilter || (s.branch || '').toLowerCase().includes(deptFilter.toLowerCase());
    const matchesBatch = !batchFilter || String(s.graduation_year) === batchFilter;
    const matchesStatus = !statusFilter || s.account_status === statusFilter;

    let matchesReadiness = true;
    if (readinessFilter === 'high') matchesReadiness = s.readiness_score >= 75;
    else if (readinessFilter === 'mid') matchesReadiness = s.readiness_score >= 50 && s.readiness_score < 75;
    else if (readinessFilter === 'low') matchesReadiness = s.readiness_score < 50;

    let matchesResume = true;
    if (resumeFilter === 'yes') matchesResume = s.has_resume;
    else if (resumeFilter === 'no') matchesResume = !s.has_resume;

    return matchesSearch && matchesDept && matchesBatch && matchesStatus && matchesReadiness && matchesResume;
  });

  filtered.sort((a, b) => {
    let comp = 0;
    if (sortBy === 'name') comp = a.display_name.localeCompare(b.display_name);
    else if (sortBy === 'readiness') comp = a.readiness_score - b.readiness_score;
    else if (sortBy === 'ats') comp = a.ats_score - b.ats_score;
    else comp = (a.created_at || '').localeCompare(b.created_at || '');
    return sortOrder === 'desc' ? -comp : comp;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const toggleSelectAll = () => {
    if (selectedUids.length === paginated.length) {
      setSelectedUids([]);
    } else {
      setSelectedUids(paginated.map((s) => s.firebase_uid));
    }
  };

  const toggleUid = (uid: string) => {
    setSelectedUids((prev) => (prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid]));
  };

  // Distinct departments and batches for filter dropdowns
  const distinctDepts = Array.from(new Set(students.map((s) => s.branch).filter(Boolean)));
  const distinctBatches = Array.from(
    new Set(students.map((s) => (s.graduation_year ? String(s.graduation_year) : '')).filter(Boolean))
  );

  if (loading) {
    return <ClayLoader label="Loading Student Directory & 360° Intelligence..." />;
  }

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="clay-card p-6 sm:p-8 bg-white border border-slate-200/80 relative overflow-hidden">
        <div className="absolute -right-24 -top-24 w-72 h-72 bg-blue-100/40 rounded-full blur-3xl pointer-events-none" />

        <div className="relative flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <Badge variant="blue" size="sm" className="mb-2">
              Student Control & Directory
            </Badge>
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              Student Accounts & 360° Dossier Directory
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 font-medium mt-1">
              Deep profile intelligence, verified credentials, assessment track records, placement readiness scores, and account lifecycle controls.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Badge variant="blue" size="md">
              <Users className="w-3.5 h-3.5 mr-1 inline" /> {filtered.length} Students
            </Badge>
            <Button variant="white" size="sm" onClick={loadData}>
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="clay-card p-4 bg-white border border-slate-200/80 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div className="sm:col-span-2 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by student name, email, college, branch..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500"
            />
          </div>

          <select
            value={deptFilter}
            onChange={(e) => {
              setDeptFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 focus:outline-none focus:border-blue-500"
          >
            <option value="">All Departments</option>
            {distinctDepts.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>

          <select
            value={batchFilter}
            onChange={(e) => {
              setBatchFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 focus:outline-none focus:border-blue-500"
          >
            <option value="">All Batches</option>
            {distinctBatches.map((b) => (
              <option key={b} value={b}>
                Batch {b}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 focus:outline-none focus:border-blue-500"
          >
            <option value="">Status: All</option>
            <option value="active">Active Accounts</option>
            <option value="suspended">Suspended Accounts</option>
          </select>

          <select
            value={readinessFilter}
            onChange={(e) => {
              setReadinessFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 focus:outline-none focus:border-blue-500"
          >
            <option value="">Readiness: All</option>
            <option value="high">Tier-1 Ready (≥75%)</option>
            <option value="mid">Developing (50-74%)</option>
            <option value="low">Early Stage (&lt;50%)</option>
          </select>

          <select
            value={resumeFilter}
            onChange={(e) => {
              setResumeFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 focus:outline-none focus:border-blue-500"
          >
            <option value="">Resume: All</option>
            <option value="yes">Uploaded</option>
            <option value="no">Pending Upload</option>
          </select>

          <div className="flex items-center gap-1">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="flex-1 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 focus:outline-none focus:border-blue-500"
            >
              <option value="date">Sort: Date</option>
              <option value="name">Sort: Name</option>
              <option value="readiness">Sort: Readiness</option>
              <option value="ats">Sort: ATS Score</option>
            </select>
            <Button
              variant="white"
              size="sm"
              onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
              className="px-2"
              title="Toggle sort direction"
            >
              {sortOrder === 'asc' ? '↑' : '↓'}
            </Button>
          </div>
        </div>
      </div>

      {/* Bulk Action Bar */}
      {selectedUids.length > 0 && (
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-2xl flex items-center justify-between text-xs font-semibold animate-in fade-in">
          <span className="text-blue-900">
            {selectedUids.length} student{selectedUids.length === 1 ? '' : 's'} selected
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={handleBulkActivate}
              className="px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 cursor-pointer"
            >
              Activate Selected
            </button>
            <button
              onClick={handleBulkSuspend}
              className="px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-red-600 hover:bg-red-700 cursor-pointer"
            >
              Suspend Selected
            </button>
            <Button variant="ghost" size="sm" onClick={() => setSelectedUids([])}>
              Deselect All
            </Button>
          </div>
        </div>
      )}

      {/* Table */}
      {filtered.length === 0 ? (
        <EmptyState
          title="No Students Matched"
          description="Adjust search queries or filters to find registered student records."
          icon={<Users className="w-8 h-8 text-blue-600" />}
        />
      ) : (
        <Card variant="default">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left text-slate-700 font-medium">
              <thead className="bg-slate-50 text-slate-600 uppercase font-mono text-[10px] font-bold border-b border-slate-200">
                <tr>
                  <th className="px-3 py-3 w-8 text-center">
                    <input
                      type="checkbox"
                      checked={paginated.length > 0 && selectedUids.length === paginated.length}
                      onChange={toggleSelectAll}
                      className="rounded text-blue-600 cursor-pointer"
                    />
                  </th>
                  <th className="px-4 py-3">Student Identity</th>
                  <th className="px-4 py-3">College & Department</th>
                  <th className="px-4 py-3">Resume / ATS</th>
                  <th className="px-4 py-3">Verified Skills</th>
                  <th className="px-4 py-3">Readiness</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginated.map((std) => (
                  <tr
                    key={std.firebase_uid}
                    className="hover:bg-blue-50/20 transition-colors"
                  >
                    <td className="px-3 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={selectedUids.includes(std.firebase_uid)}
                        onChange={() => toggleUid(std.firebase_uid)}
                        className="rounded text-blue-600 cursor-pointer"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-bold text-slate-900">{std.display_name || 'Student'}</div>
                      <div className="text-[11px] font-mono text-slate-400">{std.email}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-slate-800">{std.college || 'Profile pending'}</div>
                      <div className="text-[11px] text-slate-400">
                        {[std.degree, std.branch].filter(Boolean).join(' • ') || '—'}
                        {std.graduation_year ? ` ('${String(std.graduation_year).slice(-2)})` : ''}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {std.has_resume ? (
                        <span className="inline-flex items-center gap-1 font-mono font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                          <FileText className="w-3 h-3" /> {Math.round(std.ats_score)}%
                        </span>
                      ) : (
                        <Badge variant="neutral" size="sm">
                          Pending
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">
                      <span className="font-bold text-emerald-700">{std.verified_skills_count}</span>
                      <span className="text-slate-400"> / {std.extracted_skills_count}</span>
                    </td>
                    <td className="px-4 py-3 font-mono font-bold text-blue-600">
                      {Math.round(std.readiness_score)}%
                    </td>
                    <td className="px-4 py-3">
                      {std.account_status === 'suspended' ? (
                        <Badge variant="danger" size="sm">Suspended</Badge>
                      ) : (
                        <Badge variant="emerald" size="sm">Active</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => openStudent360(std.firebase_uid)}
                          className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors cursor-pointer"
                        >
                          Inspect 360°
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          <div className="p-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 font-medium">
            <span>
              Showing {(currentPage - 1) * pageSize + 1} to{' '}
              {Math.min(currentPage * pageSize, filtered.length)} of {filtered.length} students
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="white"
                size="sm"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </Button>
              <span className="font-mono font-bold text-slate-800">
                {currentPage} / {totalPages}
              </span>
              <Button
                variant="white"
                size="sm"
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Complete 12-Section Student 360° Profile Drawer / Modal */}
      <Modal
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={student360?.personal_info.display_name || 'Student 360° Profile'}
        subtitle={student360?.academic_info.college || 'Comprehensive Institutional Dossier'}
        size="xl"
      >
        {loading360 ? (
          <ClayLoader label="Loading Student 360° Intelligence Dossier..." />
        ) : !student360 ? (
          <p className="text-slate-400 py-6 text-center text-xs">Failed to load dossier.</p>
        ) : (
          <div className="space-y-4 text-xs font-medium">
            {/* Top Bar: Profile Summary & Action Buttons */}
            <div className="p-4 bg-gradient-to-r from-blue-50/70 to-slate-50 rounded-2xl border border-blue-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-black text-slate-900">
                    {student360.personal_info.display_name}
                  </h3>
                  <Badge
                    variant={student360.personal_info.account_status === 'active' ? 'emerald' : 'danger'}
                    size="sm"
                  >
                    {student360.personal_info.account_status}
                  </Badge>
                </div>
                <p className="text-slate-500 font-mono text-[11px] mt-0.5">
                  {student360.personal_info.email} • UID: {student360.personal_info.uid}
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="white"
                  size="sm"
                  leftIcon={<Edit className="w-3.5 h-3.5 text-blue-600" />}
                  onClick={() => setEditModalOpen(true)}
                >
                  Edit Profile
                </Button>
                <Button
                  variant="white"
                  size="sm"
                  leftIcon={<Send className="w-3.5 h-3.5 text-blue-600" />}
                  onClick={() => setNotifyModalOpen(true)}
                >
                  Direct Alert
                </Button>
                <Button
                  variant="white"
                  size="sm"
                  leftIcon={<UsersRound className="w-3.5 h-3.5 text-blue-600" />}
                  onClick={() => setAssignGroupModalOpen(true)}
                >
                  Add to Group
                </Button>
                <button
                  onClick={() =>
                    handleToggleSuspend(
                      student360.personal_info.uid,
                      student360.personal_info.account_status
                    )
                  }
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold text-white transition-colors cursor-pointer ${
                    student360.personal_info.account_status === 'suspended'
                      ? 'bg-emerald-600 hover:bg-emerald-700'
                      : 'bg-red-600 hover:bg-red-700'
                  }`}
                >
                  {student360.personal_info.account_status === 'suspended' ? 'Reactivate' : 'Suspend'}
                </button>
              </div>
            </div>

            {/* 12 Tabs Navigation */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 border-b border-slate-200">
              {[
                { id: 'personal', label: '1. Personal' },
                { id: 'academic', label: '2. Academic' },
                { id: 'resume', label: '3. Resume ATS' },
                { id: 'assessments', label: '4. Assessments' },
                { id: 'assignments', label: '5. Assignments' },
                { id: 'skills', label: '6. Skills' },
                { id: 'verified', label: '7. Verified Badges' },
                { id: 'roadmap', label: '8. Roadmap' },
                { id: 'jobs', label: '9. Job Matches' },
                { id: 'applications', label: '10. Applications' },
                { id: 'readiness', label: '11. Readiness Breakdown' },
                { id: 'activity', label: '12. Audit & Activity' },
              ].map((t) => (
                <button
                  key={t.id}
                  onClick={() => setActiveTab(t.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                    activeTab === t.id
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Tab 1: Personal Information */}
            {activeTab === 'personal' && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-4 bg-slate-50/70 rounded-2xl border border-slate-200">
                <div>
                  <span className="text-[10px] text-slate-400 font-mono block">Display Name</span>
                  <span className="font-bold text-slate-900">{student360.personal_info.display_name}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-mono block">Email</span>
                  <span className="font-mono text-slate-800 break-all">{student360.personal_info.email}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-mono block">Phone Number</span>
                  <span className="font-bold text-slate-900">{student360.personal_info.phone || '—'}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-mono block">Authentication Provider</span>
                  <span className="font-bold text-slate-900">{student360.personal_info.auth_provider}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-mono block">Account Created</span>
                  <span className="font-mono text-slate-700">
                    {student360.personal_info.created_at ? new Date(student360.personal_info.created_at).toLocaleString() : '—'}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-mono block">Last Session Login</span>
                  <span className="font-mono text-slate-700">
                    {student360.personal_info.last_login ? new Date(student360.personal_info.last_login).toLocaleString() : 'Never'}
                  </span>
                </div>
              </div>
            )}

            {/* Tab 2: Academic Information */}
            {activeTab === 'academic' && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 bg-slate-50/70 rounded-2xl border border-slate-200">
                  <div>
                    <span className="text-[10px] text-slate-400 font-mono block">College / University</span>
                    <span className="font-bold text-slate-900">{student360.academic_info.college || '—'}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-mono block">Degree & Branch</span>
                    <span className="font-bold text-slate-900">
                      {[student360.academic_info.degree, student360.academic_info.branch].filter(Boolean).join(' • ') || '—'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-mono block">Graduation Batch</span>
                    <span className="font-bold text-slate-900">{student360.academic_info.graduation_year || '—'}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-mono block">CGPA / Backlogs</span>
                    <span className="font-mono font-bold text-emerald-700">
                      {student360.academic_info.cgpa ? `${student360.academic_info.cgpa} / 10` : '—'} ({student360.academic_info.backlogs || 0} backlogs)
                    </span>
                  </div>
                </div>

                <div className="p-4 bg-slate-50/70 rounded-2xl border border-slate-200 space-y-2">
                  <span className="text-[10px] text-slate-400 font-mono block uppercase font-bold">Target Roles</span>
                  <div className="flex flex-wrap gap-1.5">
                    {student360.academic_info.target_roles.length > 0 ? (
                      student360.academic_info.target_roles.map((r) => (
                        <Badge key={r} variant="blue" size="sm">
                          {r}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-slate-400 italic">No target roles specified</span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Tab 3: Resume Intelligence */}
            {activeTab === 'resume' && (
              <div className="space-y-3">
                <div className="p-4 bg-slate-50/70 rounded-2xl border border-slate-200 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-slate-400 font-mono block">Active Resume Document</span>
                    <span className="font-bold text-slate-900 text-sm">
                      {student360.resume_info.active_resume?.filename || 'No resume uploaded yet'}
                    </span>
                    {student360.resume_info.active_resume?.uploaded_at && (
                      <span className="text-[11px] text-slate-400 block font-mono">
                        Uploaded: {new Date(student360.resume_info.active_resume.uploaded_at).toLocaleString()}
                      </span>
                    )}
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-slate-400 font-mono block">ATS Compliance</span>
                    <span className="text-2xl font-black font-mono text-emerald-700">
                      {student360.resume_info.ats_score}%
                    </span>
                  </div>
                </div>

                {student360.resume_info.suggestions && student360.resume_info.suggestions.length > 0 && (
                  <div className="p-4 bg-amber-50/60 rounded-2xl border border-amber-200 space-y-2">
                    <span className="font-bold text-amber-900 block">AI Resume Improvement Feedback</span>
                    <ul className="list-disc pl-4 space-y-1 text-slate-700 text-[11px]">
                      {student360.resume_info.suggestions.map((s, idx) => (
                        <li key={idx}>{s}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Tab 4: Assessments */}
            {activeTab === 'assessments' && (
              <div className="space-y-2">
                {student360.assessment_history.length === 0 ? (
                  <p className="text-slate-400 text-center py-6">No assessment attempts recorded.</p>
                ) : (
                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-2xl overflow-hidden">
                    {student360.assessment_history.map((att, idx) => (
                      <div key={idx} className="p-3 flex items-center justify-between hover:bg-slate-50">
                        <div>
                          <span className="font-bold text-slate-900 block">{att.skill_name || att.test_id}</span>
                          <span className="text-[11px] text-slate-400 font-mono">
                            {att.completed_at ? new Date(att.completed_at).toLocaleDateString() : 'In Progress'}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="font-mono font-bold text-blue-600 text-sm">
                            {Math.round(att.score || 0)}%
                          </span>
                          <span className="text-[10px] text-slate-400 block">
                            {att.status === 'completed' ? 'Passed' : att.status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Tab 5: Assignments */}
            {activeTab === 'assignments' && (
              <div className="space-y-2">
                {student360.assignment_history.length === 0 ? (
                  <p className="text-slate-400 text-center py-6">No assignment submissions recorded.</p>
                ) : (
                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-2xl overflow-hidden">
                    {student360.assignment_history.map((asgn, idx) => (
                      <div key={idx} className="p-3 flex items-center justify-between hover:bg-slate-50">
                        <div>
                          <span className="font-bold text-slate-900 block">{asgn.assignment_id || 'Assignment'}</span>
                          <span className="text-[11px] text-slate-400 font-mono">
                            Verdict: <strong className="text-emerald-700">{asgn.verdict || 'Submitted'}</strong>
                          </span>
                        </div>
                        <div className="text-right font-mono">
                          <span className="font-bold text-slate-900">
                            {asgn.earned_points || 0} / {asgn.total_points || 100} pts
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Tab 6: Skills Taxonomy */}
            {activeTab === 'skills' && (
              <div className="space-y-2">
                {student360.skill_proficiency.length === 0 ? (
                  <p className="text-slate-400 text-center py-6">No skills extracted yet.</p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {student360.skill_proficiency.map((sk, idx) => (
                      <div key={idx} className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl">
                        <span className="font-bold text-slate-900 block">{sk.skill_name}</span>
                        <div className="flex items-center justify-between mt-1 text-[10px]">
                          <span className="text-slate-400">{sk.category || 'Technical'}</span>
                          <span className="text-blue-600 font-mono font-bold">
                            {sk.assessment_status || 'unverified'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Tab 7: Verified Skills */}
            {activeTab === 'verified' && (
              <div className="space-y-2">
                {student360.verified_skills.length === 0 ? (
                  <p className="text-slate-400 text-center py-6">No verified badges issued yet.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {student360.verified_skills.map((vs, idx) => (
                      <div key={idx} className="p-3 bg-emerald-50/60 border border-emerald-200 rounded-2xl">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-emerald-900 text-sm flex items-center gap-1.5">
                            <Award className="w-4 h-4 text-emerald-600" />
                            {vs.skill || vs.skill_name}
                          </span>
                          <Badge variant="emerald" size="sm">Verified</Badge>
                        </div>
                        <p className="text-[10px] text-slate-500 font-mono mt-1 break-all">
                          Hash: {vs.verification_hash || 'ver_verified'}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Tab 8: Roadmap */}
            {activeTab === 'roadmap' && (
              <div className="p-4 bg-slate-50/70 rounded-2xl border border-slate-200">
                {student360.roadmap && student360.roadmap.milestones ? (
                  <div className="space-y-3">
                    <span className="font-bold text-slate-900 block">Personalized Learning Roadmap</span>
                    <div className="space-y-2">
                      {student360.roadmap.milestones.map((m: any, idx: number) => (
                        <div key={idx} className="p-3 bg-white border border-slate-200 rounded-xl">
                          <span className="font-bold text-slate-800 block">{m.title || `Milestone ${idx + 1}`}</span>
                          <p className="text-slate-500 text-[11px] mt-0.5">{m.description}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-slate-400 text-center py-6">No learning roadmap generated yet.</p>
                )}
              </div>
            )}

            {/* Tab 9: Job Matches */}
            {activeTab === 'jobs' && (
              <div className="space-y-2">
                {student360.job_matches.length === 0 ? (
                  <p className="text-slate-400 text-center py-6">No job matches computed yet.</p>
                ) : (
                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-2xl overflow-hidden">
                    {student360.job_matches.map((jm, idx) => (
                      <div key={idx} className="p-3 flex items-center justify-between hover:bg-slate-50">
                        <div>
                          <span className="font-bold text-slate-900 block">{jm.job_title || 'Position'}</span>
                          <span className="text-[11px] text-slate-400">{jm.company_name}</span>
                        </div>
                        <div className="text-right">
                          <span className="font-mono font-bold text-emerald-700 text-sm">
                            {Math.round(jm.overall_match_score || 0)}%
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Tab 10: Applications */}
            {activeTab === 'applications' && (
              <div className="space-y-2">
                {student360.application_tracking.length === 0 ? (
                  <p className="text-slate-400 text-center py-6">No job applications submitted yet.</p>
                ) : (
                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-2xl overflow-hidden">
                    {student360.application_tracking.map((ap, idx) => (
                      <div key={idx} className="p-3 flex items-center justify-between hover:bg-slate-50">
                        <div>
                          <span className="font-bold text-slate-900 block">{ap.job_title || 'Application'}</span>
                          <span className="text-[11px] text-slate-400 font-mono">
                            Applied: {ap.applied_at ? new Date(ap.applied_at).toLocaleDateString() : 'Recent'}
                          </span>
                        </div>
                        <Badge variant="blue" size="sm">{ap.status || 'Submitted'}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Tab 11: Readiness Breakdown */}
            {activeTab === 'readiness' && (
              <div className="p-4 bg-slate-50/70 rounded-2xl border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900">Overall Placement Readiness</span>
                  <span className="text-2xl font-black font-mono text-blue-700">
                    {Math.round(student360.placement_readiness?.overall_score || 0)}%
                  </span>
                </div>
                <ProgressBar
                  value={Math.round(student360.placement_readiness?.overall_score || 0)}
                  size="md"
                  variant="brand"
                />
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 text-center">
                  <div className="p-2 bg-white rounded-xl border border-slate-200">
                    <span className="text-[10px] text-slate-400 block font-mono">Coding</span>
                    <span className="font-bold text-slate-800">
                      {Math.round(student360.placement_readiness?.coding_readiness || 0)}%
                    </span>
                  </div>
                  <div className="p-2 bg-white rounded-xl border border-slate-200">
                    <span className="text-[10px] text-slate-400 block font-mono">Technical</span>
                    <span className="font-bold text-slate-800">
                      {Math.round(student360.placement_readiness?.technical_readiness || 0)}%
                    </span>
                  </div>
                  <div className="p-2 bg-white rounded-xl border border-slate-200">
                    <span className="text-[10px] text-slate-400 block font-mono">Soft Skills</span>
                    <span className="font-bold text-slate-800">
                      {Math.round(student360.placement_readiness?.soft_skills_readiness || 0)}%
                    </span>
                  </div>
                  <div className="p-2 bg-white rounded-xl border border-slate-200">
                    <span className="text-[10px] text-slate-400 block font-mono">Resume ATS</span>
                    <span className="font-bold text-slate-800">
                      {Math.round(student360.placement_readiness?.resume_readiness || 0)}%
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Tab 12: Activity & Audit Trail */}
            {activeTab === 'activity' && (
              <div className="space-y-4">
                <div>
                  <h4 className="font-bold text-slate-900 mb-2">Admin Actions Audit Trail</h4>
                  {auditHistory.length === 0 ? (
                    <p className="text-slate-400 text-center py-4">No administrative actions logged on this student.</p>
                  ) : (
                    <div className="space-y-1.5 max-h-48 overflow-y-auto">
                      {auditHistory.map((ah) => (
                        <div key={ah.id} className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[11px]">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-slate-800 uppercase font-mono">{ah.action}</span>
                            <span className="text-slate-400 font-mono">
                              {new Date(ah.timestamp).toLocaleString()}
                            </span>
                          </div>
                          <span className="text-slate-500 font-mono">by {ah.admin_uid}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <h4 className="font-bold text-slate-900 mb-2">Enrolled Groups</h4>
                  <div className="flex flex-wrap gap-2">
                    {student360.notifications_and_activity.groups.length > 0 ? (
                      student360.notifications_and_activity.groups.map((g) => (
                        <Badge key={g.id} variant="blue" size="sm">
                          {g.name}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-slate-400 italic">Not assigned to any cohort group</span>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="flex justify-end pt-2 border-t border-slate-100">
              <Button variant="white" size="sm" onClick={() => setDrawerOpen(false)}>
                Close Dossier
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal: Edit Student Profile */}
      <Modal
        isOpen={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        title="Edit Student Profile & Academics"
        subtitle="Changes are recorded into the immutable administrative audit log"
        size="md"
      >
        <form onSubmit={handleSaveProfile} className="space-y-3 text-xs font-medium">
          <div>
            <label className="text-slate-700 block mb-1 font-bold">Full Name</label>
            <input
              type="text"
              value={editFullName}
              onChange={(e) => setEditFullName(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-slate-700 block mb-1">Phone Number</label>
              <input
                type="text"
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="text-slate-700 block mb-1">College</label>
              <input
                type="text"
                value={editCollege}
                onChange={(e) => setEditCollege(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-slate-700 block mb-1">Degree</label>
              <input
                type="text"
                value={editDegree}
                onChange={(e) => setEditDegree(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="text-slate-700 block mb-1">Branch / Department</label>
              <input
                type="text"
                value={editBranch}
                onChange={(e) => setEditBranch(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-slate-700 block mb-1">Grad Year</label>
              <input
                type="number"
                value={editGraduationYear}
                onChange={(e) => setEditGraduationYear(e.target.value)}
                className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="text-slate-700 block mb-1">CGPA (/10)</label>
              <input
                type="number"
                step="0.01"
                value={editCgpa}
                onChange={(e) => setEditCgpa(e.target.value)}
                className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="text-slate-700 block mb-1">Backlogs</label>
              <input
                type="number"
                value={editBacklogs}
                onChange={(e) => setEditBacklogs(e.target.value)}
                className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <Button variant="white" size="sm" type="button" onClick={() => setEditModalOpen(false)}>
              Cancel
            </Button>
            <button
              type="submit"
              disabled={editSaving}
              className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 transition-colors cursor-pointer"
            >
              {editSaving ? 'Saving...' : 'Save Profile'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Direct Alert / Notification */}
      <Modal
        isOpen={notifyModalOpen}
        onClose={() => setNotifyModalOpen(false)}
        title="Send Direct In-App Notification"
        subtitle={`Dispatch high-priority message directly to ${student360?.personal_info.display_name}`}
        size="md"
      >
        <form onSubmit={handleSendDirectNotification} className="space-y-4 text-xs font-medium">
          <div>
            <label className="text-slate-700 block mb-1 font-bold">Alert Title *</label>
            <input
              type="text"
              required
              placeholder="e.g. Action Required: Update Resume for Campus Drive"
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
              placeholder="Enter message text..."
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
              <option value="urgent">Urgent</option>
            </select>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <Button variant="white" size="sm" type="button" onClick={() => setNotifyModalOpen(false)}>
              Cancel
            </Button>
            <button
              type="submit"
              disabled={notifSending}
              className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 transition-colors cursor-pointer"
            >
              {notifSending ? 'Sending...' : 'Send Alert'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Add to Group */}
      <Modal
        isOpen={assignGroupModalOpen}
        onClose={() => setAssignGroupModalOpen(false)}
        title="Assign Student to Cohort Group"
        subtitle={`Add ${student360?.personal_info.display_name} to a group`}
        size="sm"
      >
        <div className="space-y-4 text-xs font-medium">
          <div>
            <label className="text-slate-700 block mb-1 font-bold">Choose Cohort Group</label>
            <select
              value={selectedGroupId}
              onChange={(e) => setSelectedGroupId(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-blue-500"
            >
              <option value="">-- Select Group --</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name} ({g.department || 'All'} - {g.student_count} members)
                </option>
              ))}
            </select>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <Button variant="white" size="sm" onClick={() => setAssignGroupModalOpen(false)}>
              Cancel
            </Button>
            <button
              onClick={handleAssignToGroup}
              disabled={!selectedGroupId}
              className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 transition-colors cursor-pointer"
            >
              Assign to Group
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
