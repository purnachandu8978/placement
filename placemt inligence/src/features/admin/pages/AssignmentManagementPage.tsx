import React, { useState, useEffect, useCallback } from 'react';
import {
  FolderKanban,
  CheckCircle2,
  Clock,
  ExternalLink,
  Github,
  Award,
  Edit,
  Eye,
  Plus,
  Trash2,
  Globe,
  RefreshCw,
  UserCheck,
  ShieldCheck,
  Code2,
  Copy,
  Download,
  AlertTriangle,
  BarChart3,
  Users,
  Search,
  Check,
  X,
  ChevronRight,
  ArrowRight,
  ArrowLeft,
  FileText,
  AlertCircle,
  HelpCircle,
  TrendingUp,
} from 'lucide-react';
import { Card } from '../../../components/common/Card';
import { Button } from '../../../components/common/Button';
import { Badge } from '../../../components/common/Badge';
import { Modal } from '../../../components/common/Modal';
import { Input, Textarea } from '../../../components/common/Input';
import { Select } from '../../../components/common/Select';
import { ClayLoader } from '../../../components/common/ClayLoader';
import { EmptyState } from '../../../components/common/EmptyState';
import { useToast } from '../../../context/ToastContext';
import { useAuth } from '../../../context/AuthContext';
import {
  assignmentService,
  type AdminDashboardStats,
  type AdminAssignmentListItem,
  type AssignmentAnalyticsData,
} from '../../../services/assignmentService';
import { adminService, type AdminQuestionItem } from '../../../services/adminService';
import type { Assignment, AdminAssignmentSubmission, AssignmentQuestion } from '../../../types';

function formatDate(dateStr?: string): string {
  if (!dateStr) return 'Recent';
  if (dateStr.includes('T')) return dateStr.split('T')[0];
  return dateStr;
}

export const AssignmentManagementPage: React.FC = () => {
  const { user } = useAuth();
  const { success, error } = useToast();

  const [activeTab, setActiveTab] = useState<'assignments' | 'submissions'>('assignments');
  const [loading, setLoading] = useState(true);

  // Dashboard Stats
  const [stats, setStats] = useState<AdminDashboardStats | null>(null);

  // Assignments List State
  const [assignments, setAssignments] = useState<AdminAssignmentListItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');

  // Submissions State
  const [submissions, setSubmissions] = useState<AdminAssignmentSubmission[]>([]);

  // Question Bank Cache for Wizard
  const [availableQuestions, setAvailableQuestions] = useState<AdminQuestionItem[]>([]);
  const [questionSearch, setQuestionSearch] = useState('');
  const [questionTypeFilter, setQuestionTypeFilter] = useState('all');

  // 4-Step Assignment Wizard State
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3 | 4>(1);
  const [savingAssignment, setSavingAssignment] = useState(false);

  // Step 1: Details
  const [asgTitle, setAsgTitle] = useState('');
  const [asgDescription, setAsgDescription] = useState('');
  const [asgInstructions, setAsgInstructions] = useState('');
  const [asgCategory, setAsgCategory] = useState('Technical');
  const [asgSkill, setAsgSkill] = useState('Software Engineering');
  const [asgDifficulty, setAsgDifficulty] = useState('Intermediate');
  const [asgDeadline, setAsgDeadline] = useState('');
  const [asgDuration, setAsgDuration] = useState<number | undefined>(undefined);
  const [asgLatePolicy, setAsgLatePolicy] = useState('allow_penalty');
  const [asgLatePenalty, setAsgLatePenalty] = useState(10);
  const [asgDeliverables, setAsgDeliverables] = useState('GitHub Repository URL\nArchitecture Design Notes');

  // Step 2: Selected Questions
  const [selectedQuestions, setSelectedQuestions] = useState<AssignmentQuestion[]>([]);

  // Step 3: Allocation Filters
  const [allocTargetType, setAllocTargetType] = useState('all');
  const [allocDepartments, setAllocDepartments] = useState<string[]>(['Computer Science', 'Information Technology']);
  const [allocBatches, setAllocBatches] = useState<number[]>([2025, 2026]);
  const [allocSkills, setAllocSkills] = useState('Python, React');
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Grade Modal State
  const [gradeModalOpen, setGradeModalOpen] = useState(false);
  const [selectedSub, setSelectedSub] = useState<AdminAssignmentSubmission | null>(null);
  const [subDetail, setSubDetail] = useState<any | null>(null);
  const [gradeScore, setGradeScore] = useState('85');
  const [gradeFeedback, setGradeFeedback] = useState('');
  const [questionGrades, setQuestionGrades] = useState<Record<string, { marks: number; feedback: string }>>({});
  const [grading, setGrading] = useState(false);

  // Analytics Modal State
  const [analyticsModalOpen, setAnalyticsModalOpen] = useState(false);
  const [analyticsData, setAnalyticsData] = useState<AssignmentAnalyticsData | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  // Load Main Data
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [statsData, listData, subsData, qData] = await Promise.all([
        assignmentService.getAdminDashboardStats().catch(() => null),
        assignmentService.getAdminAssignmentsList({
          q: searchQuery || undefined,
          status_filter: statusFilter !== 'all' ? statusFilter : undefined,
          category_filter: categoryFilter !== 'all' ? categoryFilter : undefined,
        }).catch(() => ({ items: [], total: 0, page: 1, limit: 20 })),
        assignmentService.getAdminSubmissions().catch(() => []),
        adminService.getQuestions().catch(() => []),
      ]);

      setStats(statsData);
      setAssignments(listData.items || []);
      setSubmissions(subsData || []);
      setAvailableQuestions(qData || []);
    } catch (err: any) {
      error('Failed to load assignment administration data', err.message || 'Check database connection.');
    } finally {
      setLoading(false);
    }
  }, [searchQuery, statusFilter, categoryFilter, error]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Handle Allocation Preview
  const handleUpdatePreview = useCallback(async () => {
    try {
      setPreviewLoading(true);
      const skillsArr = allocSkills
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      const res = await assignmentService.previewAllocation({
        target_type: allocTargetType,
        departments: allocDepartments,
        batches: allocBatches,
        skills: skillsArr,
      });
      setPreviewCount(res.matched_count);
    } catch (err: any) {
      console.warn('Preview failed:', err);
    } finally {
      setPreviewLoading(false);
    }
  }, [allocTargetType, allocDepartments, allocBatches, allocSkills]);

  useEffect(() => {
    if (wizardOpen && wizardStep === 3) {
      void handleUpdatePreview();
    }
  }, [wizardOpen, wizardStep, handleUpdatePreview]);

  // Open Wizard
  const handleOpenWizard = () => {
    setWizardStep(1);
    setAsgTitle('');
    setAsgDescription('');
    setAsgInstructions('');
    setAsgCategory('Technical');
    setAsgSkill('Software Engineering');
    setAsgDifficulty('Intermediate');
    const defaultDl = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];
    setAsgDeadline(defaultDl);
    setAsgDuration(undefined);
    setAsgLatePolicy('allow_penalty');
    setAsgLatePenalty(10);
    setAsgDeliverables('GitHub Repository URL\nArchitecture Design Notes\nUnit & Benchmark Tests');
    setSelectedQuestions([]);
    setAllocTargetType('all');
    setAllocDepartments(['Computer Science', 'Information Technology']);
    setAllocBatches([2025, 2026]);
    setAllocSkills('Python, React');
    setPreviewCount(null);
    setWizardOpen(true);
  };

  // Toggle Question Selection
  const handleToggleQuestion = (q: AdminQuestionItem) => {
    const exists = selectedQuestions.find((item) => (item.question_id || item.id) === q.id);
    if (exists) {
      setSelectedQuestions((prev) => prev.filter((item) => (item.question_id || item.id) !== q.id));
    } else {
      // Normalize options if they are objects from question bank
      const normalizedOptions: string[] = Array.isArray(q.options)
        ? q.options.map((opt: any) => (typeof opt === 'string' ? opt : (opt?.option_text || opt?.text || opt?.label || String(opt))))
        : [];
      const normalizedConstraints: string[] = Array.isArray(q.constraints)
        ? q.constraints
        : (q.constraints ? [String(q.constraints)] : []);
      const normalizedTags: string[] = Array.isArray(q.tags)
        ? q.tags
        : (q.tags ? String(q.tags).split(',').map((t: string) => t.trim()).filter(Boolean) : []);

      const newQ: AssignmentQuestion = {
        question_id: q.id,
        id: q.id,
        title: q.title,
        question_text: q.question_text || q.title,
        problem_statement: q.problem_statement || q.question_text,
        type: q.type as any,
        points: q.points || 10,
        difficulty: q.difficulty,
        options: normalizedOptions,
        correct_answer: q.correct_answer,
        explanation: q.explanation,
        input_format: q.input_format,
        output_format: q.output_format,
        constraints: normalizedConstraints,
        test_cases: q.test_cases,
        tags: normalizedTags,
        expected_answer: q.expected_answer,
        rubric: q.rubric,
        admin_feedback: q.admin_feedback,
      };
      setSelectedQuestions((prev) => [...prev, newQ]);
    }
  };

  // Reorder Question
  const handleMoveQuestion = (index: number, direction: 'up' | 'down') => {
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= selectedQuestions.length) return;
    const next = [...selectedQuestions];
    const temp = next[index];
    next[index] = next[targetIdx];
    next[targetIdx] = temp;
    setSelectedQuestions(next);
  };

  // Save Assignment (Draft or Published)
  const handleSaveAssignment = async (statusVal: 'published' | 'draft') => {
    if (!asgTitle.trim()) {
      error('Validation Error', 'Assignment title is required.');
      return;
    }

    setSavingAssignment(true);
    try {
      const delivList = asgDeliverables
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);

      const computedMarks = selectedQuestions.reduce((acc, q) => acc + (q.points || 10), 0);
      const totalMarks = computedMarks > 0 ? computedMarks : 100;

      const skillsArr = allocSkills
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      const cleanQuestions = selectedQuestions.map((q) => ({
        ...q,
        options: Array.isArray(q.options)
          ? q.options.map((opt: any) => (typeof opt === 'string' ? opt : (opt?.option_text || opt?.text || opt?.label || String(opt))))
          : [],
        constraints: Array.isArray(q.constraints)
          ? q.constraints
          : (q.constraints ? [String(q.constraints)] : []),
        tags: Array.isArray(q.tags)
          ? q.tags
          : (q.tags ? String(q.tags).split(',').map((t: string) => t.trim()).filter(Boolean) : []),
      }));

      await assignmentService.createAssignment({
        title: asgTitle.trim(),
        description: asgDescription.trim(),
        instructions: asgInstructions.trim() || undefined,
        category: asgCategory,
        skill: asgSkill.trim(),
        difficulty: asgDifficulty,
        total_marks: totalMarks,
        deadline: asgDeadline ? `${asgDeadline}T23:59:59Z` : undefined,
        duration_minutes: asgDuration ? Number(asgDuration) : undefined,
        late_submission_policy: asgLatePolicy,
        late_penalty_percent: Number(asgLatePenalty) || 10,
        deliverables: delivList.length > 0 ? delivList : ['GitHub Repository URL'],
        status: statusVal,
        questions: cleanQuestions,
        allocation: {
          target_type: allocTargetType,
          departments: allocDepartments,
          batches: allocBatches,
          skills: skillsArr,
        },
      });

      success(
        statusVal === 'published'
          ? `Assignment "${asgTitle}" published and allocated to students!`
          : `Assignment "${asgTitle}" saved as draft.`
      );
      setWizardOpen(false);
      await loadData();
    } catch (err: any) {
      error('Creation failed', err.message || 'Could not save assignment.');
    } finally {
      setSavingAssignment(false);
    }
  };

  // Duplicate Assignment
  const handleDuplicate = async (id: string, title: string) => {
    try {
      await assignmentService.duplicateAssignment(id);
      success(`Duplicated "${title}" as a new draft.`);
      await loadData();
    } catch (err: any) {
      error('Duplication failed', err.message || 'Could not duplicate.');
    }
  };

  // Toggle Status
  const handleToggleStatus = async (id: string, currentStatus: string) => {
    const nextStatus = currentStatus === 'published' ? 'draft' : 'published';
    try {
      await assignmentService.updateAssignmentStatus(id, nextStatus as any);
      success(`Status updated to ${nextStatus}.`);
      await loadData();
    } catch (err: any) {
      error('Status update failed', err.message);
    }
  };

  // Delete Assignment
  const handleDelete = async (id: string, title: string) => {
    if (!window.confirm(`Delete assignment "${title}" and all its student allocations?`)) return;
    try {
      await assignmentService.deleteAssignment(id);
      success(`Assignment "${title}" removed.`);
      await loadData();
    } catch (err: any) {
      error('Delete failed', err.message);
    }
  };

  // Open Analytics
  const handleOpenAnalytics = async (id: string) => {
    setAnalyticsModalOpen(true);
    setAnalyticsLoading(true);
    try {
      const data = await assignmentService.getAssignmentAnalytics(id);
      setAnalyticsData(data);
    } catch (err: any) {
      error('Failed to load analytics', err.message);
    } finally {
      setAnalyticsLoading(false);
    }
  };

  // Open Grading Modal
  const handleOpenGrade = async (sub: AdminAssignmentSubmission) => {
    setSelectedSub(sub);
    setGradeScore(String(sub.grade || sub.autoScore || 85));
    setGradeFeedback(sub.feedback || 'Deliverables verified against industry architecture standards.');
    setGradeModalOpen(true);

    try {
      const detail = await assignmentService.getAdminSubmissionDetail(sub.submissionId || sub.id);
      setSubDetail(detail);

      // Pre-fill question grades
      const qg: Record<string, { marks: number; feedback: string }> = {};
      if (detail.answers && Array.isArray(detail.answers)) {
        for (const ans of detail.answers) {
          qg[ans.question_id] = {
            marks: ans.awarded_marks || 0,
            feedback: ans.feedback || '',
          };
        }
      }
      setQuestionGrades(qg);
    } catch (err: any) {
      console.warn('Could not load submission detail:', err);
    }
  };

  // Submit Official Grade
  const handleSaveGrade = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSub) return;

    setGrading(true);
    try {
      const scoreNum = Number(gradeScore) || 85;
      const qScoresList = Object.entries(questionGrades).map(([qid, val]) => ({
        question_id: qid,
        awarded_marks: val.marks,
        feedback: val.feedback,
      }));

      await assignmentService.gradeSubmission(
        selectedSub.submissionId || selectedSub.id,
        scoreNum,
        gradeFeedback,
        qScoresList.length > 0 ? qScoresList : undefined
      );

      success(`Grade (${scoreNum}/100) recorded for ${selectedSub.studentName}.`);
      setGradeModalOpen(false);
      await loadData();
    } catch (err: any) {
      error('Grading failed', err.message || 'Could not record grade.');
    } finally {
      setGrading(false);
    }
  };

  if (loading && !stats) {
    return <ClayLoader label="Loading Assignment Management Dashboard & Review Queue..." />;
  }

  const computedWizardTotalMarks = selectedQuestions.reduce((acc, q) => acc + (q.points || 10), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            Assignment Management & Student Allocation
          </h1>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Create question-driven engineering assignments, allocate to candidate cohorts, inspect performance analytics, and grade submissions.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => void loadData()}
            className="px-3 py-2 rounded-xl text-xs font-bold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
          <button
            onClick={handleOpenWizard}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-sm flex items-center gap-1.5 cursor-pointer transition-all"
          >
            <Plus className="w-4 h-4" />
            Create Assignment Wizard
          </button>
        </div>
      </div>

      {/* KPI Dashboard Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <div className="clay-card p-3.5 bg-white border border-slate-200/80 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Assignments</span>
              <FolderKanban className="w-4 h-4 text-blue-600" />
            </div>
            <div className="text-xl font-black text-slate-900 mt-1">{stats.total_assignments}</div>
            <div className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-1">
              <span className="text-emerald-600 font-bold">{stats.published_assignments} published</span> • {stats.draft_assignments} drafts
            </div>
          </div>

          <div className="clay-card p-3.5 bg-white border border-slate-200/80 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Allocated</span>
              <Users className="w-4 h-4 text-indigo-600" />
            </div>
            <div className="text-xl font-black text-slate-900 mt-1">{stats.total_allocated_students}</div>
            <div className="text-[10px] text-slate-400 mt-0.5">Students across all cohorts</div>
          </div>

          <div className="clay-card p-3.5 bg-white border border-slate-200/80 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Submissions</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="text-xl font-black text-slate-900 mt-1">{stats.submitted_assignments}</div>
            <div className="text-[10px] text-slate-400 mt-0.5">
              <span className="text-emerald-600 font-bold">{stats.completed_evaluations} graded</span>
            </div>
          </div>

          <div className="clay-card p-3.5 bg-white border border-slate-200/80 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Review Queue</span>
              <AlertCircle className="w-4 h-4 text-amber-500" />
            </div>
            <div className="text-xl font-black text-amber-600 mt-1">{stats.evaluations_pending}</div>
            <div className="text-[10px] text-slate-400 mt-0.5 font-bold text-amber-600">Pending faculty review</div>
          </div>

          <div className="clay-card p-3.5 bg-white border border-slate-200/80 shadow-xs col-span-2 sm:col-span-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Overdue</span>
              <AlertTriangle className="w-4 h-4 text-rose-500" />
            </div>
            <div className="text-xl font-black text-rose-600 mt-1">{stats.overdue_assignments}</div>
            <div className="text-[10px] text-slate-400 mt-0.5">Past deadline without submission</div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 p-1.5 rounded-2xl bg-white border border-slate-200/80 shadow-xs">
        <button
          onClick={() => setActiveTab('assignments')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'assignments'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-600 hover:text-blue-600 hover:bg-blue-50/60'
          }`}
        >
          Assignments & Cohort Allocations ({assignments.length})
        </button>
        <button
          onClick={() => setActiveTab('submissions')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'submissions'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-600 hover:text-blue-600 hover:bg-blue-50/60'
          }`}
        >
          Student Submissions Review ({submissions.length})
          {stats && stats.evaluations_pending > 0 && (
            <span className="px-2 py-0.5 rounded-full text-[10px] bg-amber-400 text-slate-900 font-black">
              {stats.evaluations_pending} Pending
            </span>
          )}
        </button>
      </div>

      {/* Tab 1: Assignments Management Table */}
      {activeTab === 'assignments' && (
        <div className="space-y-4">
          {/* Filters Bar */}
          <div className="clay-card p-4 bg-white border border-slate-200/80 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-slate-500 font-bold">Status:</span>
              {[
                { id: 'all', label: 'All' },
                { id: 'published', label: 'Published' },
                { id: 'draft', label: 'Draft' },
                { id: 'archived', label: 'Archived' },
              ].map((st) => (
                <button
                  key={st.id}
                  onClick={() => setStatusFilter(st.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer transition-all ${
                    statusFilter === st.id
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'bg-slate-100 text-slate-700 hover:bg-blue-50 hover:text-blue-700'
                  }`}
                >
                  {st.label}
                </button>
              ))}

              <span className="text-xs text-slate-400 font-bold ml-2">Category:</span>
              {[
                { id: 'all', label: 'All' },
                { id: 'Technical', label: 'Technical' },
                { id: 'Core CS', label: 'Core CS' },
                { id: 'Aptitude', label: 'Aptitude' },
              ].map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setCategoryFilter(cat.id)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer transition-all ${
                    categoryFilter === cat.id
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            <div className="w-full sm:w-64">
              <Input
                placeholder="Search title, skill..."
                leftIcon={<Search className="w-4 h-4 text-blue-600" />}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          {/* Assignments Table */}
          <Card variant="default">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left text-slate-700 font-medium">
                <thead className="bg-slate-50 text-slate-600 uppercase font-mono text-[10px] font-bold border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3">Assignment Details</th>
                    <th className="px-4 py-3">Skill / Category</th>
                    <th className="px-4 py-3">Difficulty</th>
                    <th className="px-4 py-3">Questions & Marks</th>
                    <th className="px-4 py-3">Allocated</th>
                    <th className="px-4 py-3">Submissions</th>
                    <th className="px-4 py-3">Deadline</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {assignments.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-8 text-center text-slate-500">
                        No assignments found. Click "Create Assignment Wizard" to author your first assignment.
                      </td>
                    </tr>
                  ) : (
                    assignments.map((asg) => (
                      <tr key={asg.id} className="hover:bg-blue-50/20 transition-colors">
                        <td className="px-4 py-3 max-w-xs">
                          <div className="font-bold text-slate-900 truncate">{asg.title}</div>
                          <div className="text-[10px] text-slate-400 font-mono">ID: {asg.id.slice(-6)}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-bold text-slate-800">{asg.skill}</div>
                          <div className="text-[10px] text-slate-400">{asg.category}</div>
                        </td>
                        <td className="px-4 py-3">
                          <Badge
                            variant={
                              asg.difficulty === 'Advanced' || asg.difficulty === 'hard'
                                ? 'danger'
                                : asg.difficulty === 'Beginner' || asg.difficulty === 'easy'
                                ? 'success'
                                : 'warning'
                            }
                            size="sm"
                          >
                            {asg.difficulty}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 font-mono">
                          <span className="font-bold text-blue-600">{asg.total_marks} pts</span>
                          <span className="text-slate-400 text-[10px] block">({asg.question_count} questions)</span>
                        </td>
                        <td className="px-4 py-3 font-mono font-bold text-slate-800">
                          {asg.allocated_students_count} students
                        </td>
                        <td className="px-4 py-3 font-mono">
                          <span className="font-bold text-slate-900">{asg.submissions_count}</span>
                          <span className="text-emerald-600 font-bold text-[10px] block">
                            ({asg.evaluated_count} graded)
                          </span>
                        </td>
                        <td className="px-4 py-3 text-[11px] text-slate-600">
                          {formatDate(asg.deadline)}
                        </td>
                        <td className="px-4 py-3">
                          <Badge
                            variant={
                              asg.status === 'published'
                                ? 'success'
                                : asg.status === 'archived'
                                ? 'danger'
                                : 'warning'
                            }
                            size="sm"
                            className="capitalize"
                          >
                            {asg.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-right space-x-1 whitespace-nowrap">
                          <button
                            onClick={() => handleOpenAnalytics(asg.id)}
                            className="px-2 py-1 rounded-lg text-xs font-bold bg-white border border-slate-200 text-blue-600 hover:bg-blue-50 inline-flex items-center gap-1 cursor-pointer"
                            title="Inspect Student Performance Analytics"
                          >
                            <BarChart3 className="w-3 h-3" />
                            Analytics
                          </button>
                          <button
                            onClick={() => handleDuplicate(asg.id, asg.title)}
                            className="px-2 py-1 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100 inline-flex items-center gap-1 cursor-pointer"
                            title="Duplicate Assignment as Draft"
                          >
                            <Copy className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => handleToggleStatus(asg.id, asg.status)}
                            className={`px-2 py-1 rounded-lg text-xs font-bold inline-flex items-center gap-1 cursor-pointer ${
                              asg.status === 'published'
                                ? 'text-amber-700 bg-amber-50 hover:bg-amber-100'
                                : 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100'
                            }`}
                            title={asg.status === 'published' ? 'Unpublish to Draft' : 'Publish to Students'}
                          >
                            {asg.status === 'published' ? 'Unpublish' : 'Publish'}
                          </button>
                          <a
                            href={assignmentService.getExportCsvUrl(asg.id)}
                            download
                            className="px-2 py-1 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100 inline-flex items-center gap-1 cursor-pointer"
                            title="Export Results CSV"
                          >
                            <Download className="w-3 h-3" />
                          </a>
                          <button
                            onClick={() => handleDelete(asg.id, asg.title)}
                            className="px-2 py-1 rounded-lg text-xs font-medium text-rose-500 hover:text-rose-700 hover:bg-rose-50 inline-flex items-center gap-1 cursor-pointer"
                            title="Delete Assignment"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* Tab 2: Student Submissions Review Queue */}
      {activeTab === 'submissions' && (
        <Card variant="default">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left text-slate-700 font-medium">
              <thead className="bg-slate-50 text-slate-600 uppercase font-mono text-[10px] font-bold border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">Student</th>
                  <th className="px-4 py-3">Assignment</th>
                  <th className="px-4 py-3">Skill</th>
                  <th className="px-4 py-3">Deliverables</th>
                  <th className="px-4 py-3">Auto Score</th>
                  <th className="px-4 py-3">Official Grade</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Review Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {submissions.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                      No student submissions recorded yet.
                    </td>
                  </tr>
                ) : (
                  submissions.map((sub) => (
                    <tr key={sub.submissionId || sub.id} className="hover:bg-blue-50/20">
                      <td className="px-4 py-3">
                        <div className="font-bold text-slate-900">{sub.studentName}</div>
                        <div className="text-[10px] text-slate-500">{sub.studentEmail}</div>
                      </td>
                      <td className="px-4 py-3 font-bold max-w-xs truncate">{sub.assignmentTitle}</td>
                      <td className="px-4 py-3">{sub.skill}</td>
                      <td className="px-4 py-3 space-x-1.5 whitespace-nowrap">
                        {sub.githubUrl && (
                          <a
                            href={sub.githubUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] text-blue-600 hover:underline font-mono"
                          >
                            <Github className="w-3 h-3" /> Code
                          </a>
                        )}
                        {sub.liveUrl && (
                          <a
                            href={sub.liveUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] text-emerald-600 hover:underline font-mono"
                          >
                            <ExternalLink className="w-3 h-3" /> Live
                          </a>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono font-bold text-slate-600">{sub.autoScore}%</td>
                      <td className="px-4 py-3 font-mono font-bold text-blue-600">
                        {sub.grade !== undefined && sub.grade !== null ? `${sub.grade} pts` : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={sub.status === 'Graded' ? 'success' : 'warning'} size="sm">
                          {sub.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => handleOpenGrade(sub)}
                          className="px-3 py-1.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-sm inline-flex items-center gap-1.5 cursor-pointer"
                        >
                          <Edit className="w-3 h-3" />
                          {sub.status === 'Graded' ? 'Re-Evaluate' : 'Grade Submission'}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* 4-Step Assignment Creation Wizard Modal */}
      <Modal
        isOpen={wizardOpen}
        onClose={() => setWizardOpen(false)}
        title="Guided Assignment Creation Wizard"
        subtitle={`Step ${wizardStep} of 4: ${
          wizardStep === 1
            ? 'Assignment Details & Policies'
            : wizardStep === 2
            ? 'Question Bank Selection & Marks'
            : wizardStep === 3
            ? 'Cohort & Student Allocation'
            : 'Review & Publish'
        }`}
        size="lg"
      >
        <div className="space-y-4 text-xs font-medium max-h-[75vh] overflow-y-auto pr-1">
          {/* Step Indicators */}
          <div className="grid grid-cols-4 gap-2 border-b border-slate-200 pb-3">
            {[
              { num: 1, label: 'Details' },
              { num: 2, label: 'Questions' },
              { num: 3, label: 'Allocation' },
              { num: 4, label: 'Publish' },
            ].map((st) => (
              <div
                key={st.num}
                className={`p-2 rounded-xl text-center transition-all ${
                  wizardStep === st.num
                    ? 'bg-blue-600 text-white font-bold shadow-xs'
                    : wizardStep > st.num
                    ? 'bg-blue-50 text-blue-700 font-bold'
                    : 'bg-slate-100 text-slate-400'
                }`}
              >
                <div className="text-[10px] font-mono">Step {st.num}</div>
                <div className="text-xs truncate">{st.label}</div>
              </div>
            ))}
          </div>

          {/* Step 1: Details */}
          {wizardStep === 1 && (
            <div className="space-y-3">
              <Input
                label="Assignment Title"
                value={asgTitle}
                onChange={(e) => setAsgTitle(e.target.value)}
                placeholder="e.g. Distributed Cache & System Architecture Deliverable"
                required
              />

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Select
                  label="Category"
                  value={asgCategory}
                  onChange={(e) => setAsgCategory(e.target.value)}
                  options={[
                    { value: 'Technical', label: 'Technical Engineering' },
                    { value: 'Core CS', label: 'Core Computer Science' },
                    { value: 'Systems', label: 'Systems & Architecture' },
                    { value: 'Aptitude', label: 'Quantitative & Aptitude' },
                  ]}
                />
                <Input
                  label="Related Skill"
                  value={asgSkill}
                  onChange={(e) => setAsgSkill(e.target.value)}
                  placeholder="Python, React, System Design"
                  required
                />
                <Select
                  label="Difficulty Level"
                  value={asgDifficulty}
                  onChange={(e) => setAsgDifficulty(e.target.value)}
                  options={[
                    { value: 'Beginner', label: 'Beginner' },
                    { value: 'Intermediate', label: 'Intermediate' },
                    { value: 'Advanced', label: 'Advanced' },
                  ]}
                />
              </div>

              <Textarea
                label="Overview Description"
                value={asgDescription}
                onChange={(e) => setAsgDescription(e.target.value)}
                rows={2}
                placeholder="Brief summary of assignment goals and expectations..."
              />

              <Textarea
                label="Candidate Instructions"
                value={asgInstructions}
                onChange={(e) => setAsgInstructions(e.target.value)}
                rows={2}
                placeholder="Specific submission instructions, coding rules, or environment requirements..."
              />

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Input
                  label="Deadline Date"
                  type="date"
                  value={asgDeadline}
                  onChange={(e) => setAsgDeadline(e.target.value)}
                  required
                />
                <Input
                  label="Duration (minutes, optional)"
                  type="number"
                  value={asgDuration !== undefined ? String(asgDuration) : ''}
                  onChange={(e) => setAsgDuration(e.target.value ? Number(e.target.value) : undefined)}
                  placeholder="Leave blank if untimed"
                />
                <Select
                  label="Late Submission Policy"
                  value={asgLatePolicy}
                  onChange={(e) => setAsgLatePolicy(e.target.value)}
                  options={[
                    { value: 'allow_penalty', label: 'Allow with Penalty' },
                    { value: 'reject', label: 'Strict Reject after Deadline' },
                    { value: 'allow_no_penalty', label: 'Allow without Penalty' },
                  ]}
                />
              </div>

              {asgLatePolicy === 'allow_penalty' && (
                <div className="w-48">
                  <Input
                    label="Late Penalty (%)"
                    type="number"
                    value={String(asgLatePenalty)}
                    onChange={(e) => setAsgLatePenalty(Number(e.target.value))}
                  />
                </div>
              )}

              <Textarea
                label="Deliverable Checklist (one per line)"
                value={asgDeliverables}
                onChange={(e) => setAsgDeliverables(e.target.value)}
                rows={2}
                placeholder="GitHub Repository URL&#10;Architecture Notes"
              />
            </div>
          )}

          {/* Step 2: Add Questions */}
          {wizardStep === 2 && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3 rounded-xl bg-blue-50/50 border border-blue-200">
                <div>
                  <span className="font-bold text-slate-900 block">
                    Selected Questions: {selectedQuestions.length}
                  </span>
                  <span className="text-[11px] text-blue-700 font-bold">
                    Computed Total Marks: {computedWizardTotalMarks} pts
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Select
                    label=""
                    value={questionTypeFilter}
                    onChange={(e) => setQuestionTypeFilter(e.target.value)}
                    options={[
                      { value: 'all', label: 'All Question Types' },
                      { value: 'mcq', label: 'MCQs' },
                      { value: 'coding', label: 'Coding Challenges' },
                      { value: 'short_answer', label: 'Short Answer' },
                    ]}
                  />
                  <Input
                    placeholder="Search bank..."
                    value={questionSearch}
                    onChange={(e) => setQuestionSearch(e.target.value)}
                  />
                </div>
              </div>

              {/* Selected Questions Order List */}
              {selectedQuestions.length > 0 && (
                <div className="space-y-2">
                  <span className="text-xs font-bold text-slate-800 block">
                    Assigned Questions Order & Custom Marks:
                  </span>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {selectedQuestions.map((q, idx) => (
                      <div
                        key={q.question_id || q.id}
                        className="p-2.5 rounded-xl bg-white border border-slate-200 flex items-center justify-between gap-2"
                      >
                        <div className="flex items-center gap-2 max-w-sm truncate">
                          <span className="font-mono font-bold text-blue-600 text-xs">#{idx + 1}</span>
                          <Badge variant="brand" size="sm" className="capitalize">
                            {q.type.replace('_', ' ')}
                          </Badge>
                          <span className="font-bold text-slate-800 truncate">{q.title}</span>
                        </div>

                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] text-slate-400">Marks:</span>
                            <input
                              type="number"
                              value={q.points}
                              onChange={(e) => {
                                const next = [...selectedQuestions];
                                next[idx] = { ...next[idx], points: Number(e.target.value) || 10 };
                                setSelectedQuestions(next);
                              }}
                              className="w-16 px-2 py-1 rounded border border-slate-200 font-mono font-bold text-xs"
                            />
                          </div>

                          <div className="space-x-1">
                            <button
                              type="button"
                              disabled={idx === 0}
                              onClick={() => handleMoveQuestion(idx, 'up')}
                              className="px-1.5 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-xs disabled:opacity-30 cursor-pointer"
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              disabled={idx === selectedQuestions.length - 1}
                              onClick={() => handleMoveQuestion(idx, 'down')}
                              className="px-1.5 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-xs disabled:opacity-30 cursor-pointer"
                            >
                              ↓
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setSelectedQuestions((prev) =>
                                  prev.filter((item) => (item.question_id || item.id) !== (q.question_id || q.id))
                                )
                              }
                              className="px-1.5 py-0.5 rounded bg-rose-50 text-rose-600 hover:bg-rose-100 text-xs cursor-pointer"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Available Question Bank Picker */}
              <div className="space-y-2">
                <span className="text-xs font-bold text-slate-800 block">Pick from Approved Question Bank:</span>
                <div className="max-h-60 overflow-y-auto space-y-1.5 divide-y divide-slate-100 border border-slate-200 rounded-xl p-2 bg-slate-50">
                  {availableQuestions
                    .filter((q) => {
                      const isCoding = q.type === 'simple_coding' || q.type === 'hard_coding';
                      if (questionTypeFilter === 'mcq' && q.type !== 'mcq') return false;
                      if (questionTypeFilter === 'coding' && !isCoding) return false;
                      if (questionTypeFilter === 'short_answer' && q.type !== 'short_answer') return false;
                      if (questionSearch) {
                        const hay = `${q.title} ${q.skill_name} ${q.question_text}`.toLowerCase();
                        if (!hay.includes(questionSearch.toLowerCase())) return false;
                      }
                      return true;
                    })
                    .map((q) => {
                      const isSelected = selectedQuestions.some(
                        (item) => (item.question_id || item.id) === q.id
                      );
                      return (
                        <div
                          key={q.id}
                          className={`p-2 rounded-lg flex items-center justify-between gap-2 transition-all ${
                            isSelected ? 'bg-blue-100/70 border border-blue-300' : 'bg-white hover:bg-slate-100'
                          }`}
                        >
                          <div className="max-w-md">
                            <div className="font-bold text-slate-800 truncate">{q.title}</div>
                            <div className="text-[10px] text-slate-400 line-clamp-1">{q.question_text}</div>
                            <div className="flex items-center gap-2 mt-0.5 text-[10px]">
                              <span className="capitalize text-slate-500 font-bold">{q.type.replace('_', ' ')}</span>
                              <span>•</span>
                              <span className="text-blue-600 font-bold">{q.points} pts</span>
                              <span>•</span>
                              <span className="text-slate-400">{q.skill_name || q.skill_id}</span>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleToggleQuestion(q)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                              isSelected
                                ? 'bg-blue-600 text-white'
                                : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                            }`}
                          >
                            {isSelected ? '✓ Added' : '+ Add'}
                          </button>
                        </div>
                      );
                    })}
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Student Allocation */}
          {wizardStep === 3 && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-blue-50/60 border border-blue-200 space-y-2">
                <span className="text-xs font-bold text-blue-900 block">Target Cohort Allocation</span>
                <p className="text-[11px] text-slate-600">
                  Select which students should receive this assignment. Each allocated student receives an independent tracking record with unique status and deadline.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Select
                  label="Allocation Mode"
                  value={allocTargetType}
                  onChange={(e) => setAllocTargetType(e.target.value)}
                  options={[
                    { value: 'all', label: 'All Registered Students' },
                    { value: 'department', label: 'By Department / Branch' },
                    { value: 'batch', label: 'By Graduation Year / Batch' },
                    { value: 'skill', label: 'Students with Specific Skills' },
                  ]}
                />

                {allocTargetType === 'batch' && (
                  <div>
                    <span className="text-[11px] font-bold text-slate-700 block mb-1">Graduation Batches</span>
                    <div className="flex flex-wrap gap-2">
                      {[2024, 2025, 2026, 2027].map((b) => (
                        <label
                          key={b}
                          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-white border border-slate-200 text-xs font-bold cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={allocBatches.includes(b)}
                            onChange={(e) => {
                              if (e.target.checked) setAllocBatches([...allocBatches, b]);
                              else setAllocBatches(allocBatches.filter((item) => item !== b));
                            }}
                          />
                          Batch {b}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {allocTargetType === 'department' && (
                <div className="space-y-1.5">
                  <span className="text-[11px] font-bold text-slate-700 block">Select Departments / Branches</span>
                  <div className="flex flex-wrap gap-2">
                    {[
                      'Computer Science',
                      'Information Technology',
                      'Electronics & Comm',
                      'Electrical Engineering',
                      'Mechanical Engineering',
                    ].map((dept) => (
                      <label
                        key={dept}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-xs font-bold cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={allocDepartments.includes(dept)}
                          onChange={(e) => {
                            if (e.target.checked) setAllocDepartments([...allocDepartments, dept]);
                            else setAllocDepartments(allocDepartments.filter((item) => item !== dept));
                          }}
                        />
                        {dept}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {allocTargetType === 'skill' && (
                <Input
                  label="Target Skills (comma-separated)"
                  value={allocSkills}
                  onChange={(e) => setAllocSkills(e.target.value)}
                  placeholder="Python, React, AWS, Docker"
                />
              )}

              {/* Preview Candidate Count Box */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
                <div>
                  <span className="font-bold text-slate-800 block text-xs">
                    Live Allocation Target Preview:
                  </span>
                  <span className="text-[11px] text-slate-500">
                    Students matching this criterion in MongoDB
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xl font-black text-blue-600 font-mono">
                    {previewLoading ? '...' : previewCount !== null ? `${previewCount} Students` : 'Ready'}
                  </span>
                  <button
                    type="button"
                    onClick={() => void handleUpdatePreview()}
                    className="p-1.5 rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 cursor-pointer"
                    title="Refresh Preview Count"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Step 4: Review & Publish */}
          {wizardStep === 4 && (
            <div className="space-y-4">
              <div className="clay-card p-4 bg-white border border-slate-200/80 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <div>
                    <h3 className="text-sm font-black text-slate-900">{asgTitle}</h3>
                    <span className="text-[11px] text-slate-500">{asgSkill} • {asgCategory}</span>
                  </div>
                  <Badge variant="brand" size="sm">{asgDifficulty}</Badge>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div>
                    <span className="text-slate-400 block text-[10px]">Total Marks:</span>
                    <span className="font-bold text-blue-600 font-mono">{computedWizardTotalMarks || 100} pts</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Questions:</span>
                    <span className="font-bold text-slate-800">{selectedQuestions.length} Problems</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Deadline:</span>
                    <span className="font-bold text-slate-800">{asgDeadline || 'Within 7 Days'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Target Students:</span>
                    <span className="font-bold text-indigo-600">{previewCount ?? 'All'} Students</span>
                  </div>
                </div>

                {asgDescription && (
                  <div className="text-[11px] text-slate-600 bg-slate-50 p-2.5 rounded-lg">
                    {asgDescription}
                  </div>
                )}
              </div>

              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-[11px] text-amber-800 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <strong>Ready to Publish:</strong> Publishing will immediately create student allocation records and display this assignment in target students' Assignment Centers. Answer keys remain strictly protected.
                </div>
              </div>
            </div>
          )}

          {/* Wizard Footer Navigation */}
          <div className="pt-4 border-t border-slate-200 flex items-center justify-between">
            {wizardStep > 1 ? (
              <button
                type="button"
                onClick={() => setWizardStep((prev) => (prev - 1) as any)}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 flex items-center gap-1.5 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Back
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setWizardOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
            )}

            <div className="flex items-center gap-2">
              {wizardStep < 4 ? (
                <button
                  type="button"
                  onClick={() => {
                    if (wizardStep === 1 && !asgTitle.trim()) {
                      error('Validation Error', 'Title is required before proceeding.');
                      return;
                    }
                    setWizardStep((prev) => (prev + 1) as any);
                  }}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-sm flex items-center gap-1.5 cursor-pointer"
                >
                  Next Step <ArrowRight className="w-3.5 h-3.5" />
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    disabled={savingAssignment}
                    onClick={() => void handleSaveAssignment('draft')}
                    className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-800 cursor-pointer"
                  >
                    Save as Draft
                  </button>
                  <button
                    type="button"
                    disabled={savingAssignment}
                    onClick={() => void handleSaveAssignment('published')}
                    className="px-5 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-sm cursor-pointer disabled:opacity-50"
                  >
                    {savingAssignment ? 'Publishing...' : 'Publish & Allocate Now'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </Modal>

      {/* Assignment Analytics Modal */}
      <Modal
        isOpen={analyticsModalOpen}
        onClose={() => setAnalyticsModalOpen(false)}
        title={analyticsData ? `Analytics: ${analyticsData.title}` : 'Assignment Performance Analytics'}
        subtitle="Cohort completion metrics, question accuracy, and students requiring attention"
        size="lg"
      >
        {analyticsLoading || !analyticsData ? (
          <ClayLoader label="Computing Cohort Performance Metrics..." />
        ) : (
          <div className="space-y-4 text-xs font-medium max-h-[75vh] overflow-y-auto pr-1">
            {/* Top Stat Row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 rounded-xl bg-blue-50 border border-blue-200">
                <span className="text-[10px] text-slate-500 uppercase font-bold block">Submission Rate</span>
                <span className="text-xl font-black text-blue-700 font-mono">
                  {analyticsData.submission_rate}%
                </span>
                <span className="text-[10px] text-slate-400 block">
                  {analyticsData.submitted_count}/{analyticsData.total_allocated} Students
                </span>
              </div>

              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200">
                <span className="text-[10px] text-slate-500 uppercase font-bold block">Average Score</span>
                <span className="text-xl font-black text-emerald-700 font-mono">
                  {analyticsData.average_score} pts
                </span>
                <span className="text-[10px] text-slate-400 block">Across evaluated submissions</span>
              </div>

              <div className="p-3 rounded-xl bg-indigo-50 border border-indigo-200">
                <span className="text-[10px] text-slate-500 uppercase font-bold block">Highest Score</span>
                <span className="text-xl font-black text-indigo-700 font-mono">
                  {analyticsData.highest_score} pts
                </span>
              </div>

              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200">
                <span className="text-[10px] text-slate-500 uppercase font-bold block">Attention Needed</span>
                <span className="text-xl font-black text-rose-700 font-mono">
                  {analyticsData.students_requiring_attention.length}
                </span>
                <span className="text-[10px] text-rose-500 block">Overdue / low score</span>
              </div>
            </div>

            {/* Question-wise Accuracy Breakdown */}
            {analyticsData.question_stats && analyticsData.question_stats.length > 0 && (
              <div className="space-y-2">
                <span className="text-xs font-bold text-slate-800 block">Question-wise Accuracy Breakdown:</span>
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-600 text-[10px] uppercase font-mono font-bold border-b border-slate-200">
                      <tr>
                        <th className="px-3 py-2">Question Title</th>
                        <th className="px-3 py-2">Type</th>
                        <th className="px-3 py-2">Max Pts</th>
                        <th className="px-3 py-2">Avg Earned</th>
                        <th className="px-3 py-2">Accuracy %</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {analyticsData.question_stats.map((qs) => (
                        <tr key={qs.question_id} className="hover:bg-slate-50">
                          <td className="px-3 py-2 font-bold max-w-xs truncate">{qs.title}</td>
                          <td className="px-3 py-2 font-mono uppercase text-[10px]">{qs.type}</td>
                          <td className="px-3 py-2 font-mono">{qs.max_points}</td>
                          <td className="px-3 py-2 font-mono font-bold text-blue-600">{qs.average_earned}</td>
                          <td className="px-3 py-2 font-mono">
                            <span
                              className={`font-bold ${
                                qs.accuracy_percent >= 70
                                  ? 'text-emerald-600'
                                  : qs.accuracy_percent >= 40
                                  ? 'text-amber-600'
                                  : 'text-rose-600'
                              }`}
                            >
                              {qs.accuracy_percent}%
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Students Requiring Attention */}
            {analyticsData.students_requiring_attention.length > 0 && (
              <div className="space-y-2">
                <span className="text-xs font-bold text-rose-800 block">
                  Students Requiring Faculty Attention:
                </span>
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {analyticsData.students_requiring_attention.map((st, i) => (
                    <div
                      key={i}
                      className="p-2.5 rounded-xl bg-rose-50/50 border border-rose-200 flex items-center justify-between gap-2"
                    >
                      <div>
                        <div className="font-bold text-slate-900">{st.student_name}</div>
                        <div className="text-[10px] text-slate-500">{st.student_email} • {st.department}</div>
                      </div>
                      <Badge variant="danger" size="sm">
                        {st.reason}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Comprehensive Student Grading & Review Modal */}
      <Modal
        isOpen={gradeModalOpen}
        onClose={() => setGradeModalOpen(false)}
        title={selectedSub ? `Evaluation: ${selectedSub.studentName}` : 'Grade Submission'}
        subtitle={selectedSub ? `${selectedSub.assignmentTitle} (${selectedSub.studentEmail})` : ''}
        size="lg"
      >
        {selectedSub && (
          <form onSubmit={handleSaveGrade} className="space-y-4 text-xs font-medium max-h-[75vh] overflow-y-auto pr-1">
            {/* Candidate & Deliverables Card */}
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-bold text-slate-900 text-sm">{selectedSub.studentName}</span>
                  <span className="text-slate-400 block text-[10px]">{selectedSub.studentEmail}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="brand" size="sm">{selectedSub.skill}</Badge>
                  <span className="font-mono text-slate-400 text-[10px]">
                    Submitted: {formatDate(selectedSub.submittedAt)}
                  </span>
                </div>
              </div>

              {/* Deliverable links */}
              <div className="flex flex-wrap items-center gap-3 pt-1 font-mono text-[11px]">
                {selectedSub.githubUrl && (
                  <a
                    href={selectedSub.githubUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-blue-600 hover:underline font-bold"
                  >
                    <Github className="w-3.5 h-3.5" /> Open GitHub Repo
                  </a>
                )}
                {selectedSub.liveUrl && (
                  <a
                    href={selectedSub.liveUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-emerald-600 hover:underline font-bold"
                  >
                    <ExternalLink className="w-3.5 h-3.5" /> Open Live Application
                  </a>
                )}
              </div>

              {selectedSub.notes && (
                <div className="text-[11px] text-slate-600 bg-white p-2 rounded-lg border border-slate-200">
                  <span className="font-bold text-slate-800 block mb-0.5">Student Notes:</span>
                  {selectedSub.notes}
                </div>
              )}
            </div>

            {/* Question-by-Question Grading Breakdown */}
            {subDetail && subDetail.answers && subDetail.answers.length > 0 && (
              <div className="space-y-3">
                <span className="text-xs font-bold text-slate-800 block">
                  Question-by-Question Rubric & Evaluation:
                </span>
                {subDetail.answers.map((ans: any, idx: number) => {
                  const qMarks = questionGrades[ans.question_id]?.marks ?? ans.awarded_marks ?? 0;
                  const qFeedback = questionGrades[ans.question_id]?.feedback ?? ans.feedback ?? '';

                  return (
                    <div key={idx} className="p-3 rounded-xl bg-white border border-slate-200 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-800">
                          Q{idx + 1} ({ans.type?.replace('_', ' ')}) — Max {ans.points} pts
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-slate-400">Score:</span>
                          <input
                            type="number"
                            value={qMarks}
                            onChange={(e) => {
                              const val = Number(e.target.value) || 0;
                              setQuestionGrades((prev) => ({
                                ...prev,
                                [ans.question_id]: { marks: val, feedback: qFeedback },
                              }));
                            }}
                            className="w-16 px-2 py-1 rounded border border-slate-200 font-mono font-bold text-xs"
                          />
                        </div>
                      </div>

                      {/* Display Student Answer */}
                      <div className="p-2 rounded bg-slate-50 font-mono text-[11px]">
                        {ans.type === 'mcq' ? (
                          <div>
                            Selected Option Index: <strong>{ans.selected_option}</strong> ({ans.status})
                          </div>
                        ) : ans.type === 'short_answer' ? (
                          <div className="whitespace-pre-wrap font-sans text-xs">
                            <span className="text-slate-400 block text-[10px] font-bold">Student Response:</span>
                            {ans.text_answer || '(Empty)'}
                          </div>
                        ) : (
                          <pre className="overflow-x-auto text-[10px] text-slate-800">
                            {ans.code || '(No code submitted)'}
                          </pre>
                        )}
                      </div>

                      {/* Question Feedback */}
                      <Input
                        label="Question Feedback / Notes"
                        value={qFeedback}
                        onChange={(e) => {
                          const text = e.target.value;
                          setQuestionGrades((prev) => ({
                            ...prev,
                            [ans.question_id]: { marks: qMarks, feedback: text },
                          }));
                        }}
                        placeholder="Add constructive remarks on this answer..."
                      />
                    </div>
                  );
                })}
              </div>
            )}

            {/* Overall Final Score & Evaluation */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <Input
                label="Overall Final Score (0 - 100)"
                type="number"
                value={gradeScore}
                onChange={(e) => setGradeScore(e.target.value)}
                required
              />
              <div className="flex items-end pb-1 text-xs text-slate-500 font-mono">
                Auto Check Benchmark: {selectedSub.autoScore}%
              </div>
            </div>

            <Textarea
              label="Official Faculty Feedback & Rubric Verification Notes"
              value={gradeFeedback}
              onChange={(e) => setGradeFeedback(e.target.value)}
              rows={3}
              placeholder="State architectural strengths, missing unit tests, or commendations..."
              required
            />

            <div className="pt-3 flex justify-end gap-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setGradeModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={grading}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-sm cursor-pointer disabled:opacity-50"
              >
                {grading ? 'Recording Grade...' : 'Release Grade & Notify Student'}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
};
