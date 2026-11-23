import React, { useEffect, useState, useCallback } from 'react';
import {
  Plus,
  Search,
  CheckCircle2,
  Lock,
  Eye,
  Edit3,
  Trash2,
  Terminal,
  ShieldCheck,
  Clock,
  Cpu,
  FileText,
  Code2,
  ListFilter,
  Check,
  Archive,
} from 'lucide-react';
import { Card } from '../../../components/common/Card';
import { Button } from '../../../components/common/Button';
import { Badge } from '../../../components/common/Badge';
import { Modal } from '../../../components/common/Modal';
import { Input, Textarea } from '../../../components/common/Input';
import { Select } from '../../../components/common/Select';
import { ClayLoader } from '../../../components/common/ClayLoader';
import { useToast } from '../../../context/ToastContext';
import {
  adminService,
  type AdminCodingSubmissionRow,
  type AdminQuestionItem,
  type AdminTestCase,
} from '../../../services/adminService';

const ALL_LANGS = ['python', 'javascript', 'java', 'cpp'] as const;

const EMPTY_CASE: AdminTestCase = {
  label: 'Test Case',
  input: '',
  expected: '',
  is_hidden: false,
  weight: 1.0,
};

export const QuestionBankPage: React.FC = () => {
  const { success, error } = useToast();
  const [activeTab, setActiveTab] = useState<'questions' | 'submissions'>('questions');

  // Question catalog state
  const [loading, setLoading] = useState(true);
  const [questions, setQuestions] = useState<AdminQuestionItem[]>([]);
  const [filterType, setFilterType] = useState<'all' | 'mcq' | 'coding' | 'short_answer'>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Submissions review state
  const [submissions, setSubmissions] = useState<AdminCodingSubmissionRow[]>([]);
  const [subFilterStatus, setSubFilterStatus] = useState('');
  const [subFilterLang, setSubFilterLang] = useState('');
  const [loadingSubs, setLoadingSubs] = useState(false);
  const [selectedSub, setSelectedSub] = useState<AdminCodingSubmissionRow | null>(null);

  // Create / Edit question modal state
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Form State
  const [formTitle, setFormTitle] = useState('');
  const [formType, setFormType] = useState<'mcq' | 'simple_coding' | 'hard_coding' | 'short_answer'>('simple_coding');
  const [formSkillId, setFormSkillId] = useState('python');
  const [formCategory, setFormCategory] = useState('Backend');
  const [formDifficulty, setFormDifficulty] = useState('medium');
  const [formPoints, setFormPoints] = useState(20);
  const [formEstimatedMinutes, setFormEstimatedMinutes] = useState(15);
  const [formInstructions, setFormInstructions] = useState('');
  const [formTags, setFormTags] = useState('algorithms, core-cs');
  const [formPartialCredit, setFormPartialCredit] = useState(true);
  const [formApprovalStatus, setFormApprovalStatus] = useState<'approved' | 'draft' | 'pending_review' | 'archived'>('approved');

  // Problem statement / question text
  const [formStatement, setFormStatement] = useState('');

  // Coding specific
  const [formInputFormat, setFormInputFormat] = useState('Standard input (stdin)');
  const [formOutputFormat, setFormOutputFormat] = useState('Standard output (stdout)');
  const [formConstraints, setFormConstraints] = useState('1 <= N <= 10^5');
  const [formTimeLimitMs, setFormTimeLimitMs] = useState(2000);
  const [formMemoryLimitKb, setFormMemoryLimitKb] = useState(262144);
  const [formLanguages, setFormLanguages] = useState<string[]>([...ALL_LANGS]);
  const [formTestCases, setFormTestCases] = useState<AdminTestCase[]>([
    { label: 'Sample 1', input: '2 3\n', expected: '5', is_hidden: false, weight: 1.0 },
    { label: 'Hidden Edge 1', input: '0 0\n', expected: '0', is_hidden: true, weight: 1.0 },
  ]);

  // MCQ specific
  const [formOptionsText, setFormOptionsText] = useState('Option A\nOption B\nOption C\nOption D');
  const [formCorrectAnswer, setFormCorrectAnswer] = useState(0);
  const [formExplanation, setFormExplanation] = useState('');

  // Short Answer specific
  const [formExpectedAnswer, setFormExpectedAnswer] = useState('');
  const [formRubric, setFormRubric] = useState('Clarity of explanation: 40%\nAccuracy: 40%\nPractical context: 20%');
  const [formAdminFeedback, setFormAdminFeedback] = useState('Look for specific mention of trade-offs and complexity.');

  const loadQuestions = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminService.getQuestions();
      setQuestions(data || []);
    } catch (err: any) {
      error(err?.message || 'Unable to load MongoDB question bank.');
    } finally {
      setLoading(false);
    }
  }, [error]);

  const loadSubmissions = useCallback(async () => {
    setLoadingSubs(true);
    try {
      const data = await adminService.getCodingSubmissions({
        status: subFilterStatus || undefined,
        language: subFilterLang || undefined,
      });
      setSubmissions(data || []);
    } catch (err: any) {
      error(err?.message || 'Unable to load student submissions.');
    } finally {
      setLoadingSubs(false);
    }
  }, [subFilterStatus, subFilterLang, error]);

  useEffect(() => {
    void loadQuestions();
  }, [loadQuestions]);

  useEffect(() => {
    if (activeTab === 'submissions') {
      void loadSubmissions();
    }
  }, [activeTab, loadSubmissions]);

  const openCreateModal = () => {
    setEditingId(null);
    setFormTitle('');
    setFormType('simple_coding');
    setFormSkillId('python');
    setFormCategory('Backend');
    setFormDifficulty('medium');
    setFormPoints(20);
    setFormEstimatedMinutes(15);
    setFormInstructions('');
    setFormTags('core-cs, placement');
    setFormPartialCredit(true);
    setFormApprovalStatus('approved');
    setFormStatement('');
    setFormInputFormat('Standard input (stdin)');
    setFormOutputFormat('Standard output (stdout)');
    setFormConstraints('1 <= N <= 10^5');
    setFormTimeLimitMs(2000);
    setFormMemoryLimitKb(262144);
    setFormLanguages([...ALL_LANGS]);
    setFormTestCases([
      { label: 'Sample 1', input: '', expected: '', is_hidden: false, weight: 1.0 },
      { label: 'Hidden 1', input: '', expected: '', is_hidden: true, weight: 1.0 },
    ]);
    setFormOptionsText('Option A\nOption B\nOption C\nOption D');
    setFormCorrectAnswer(0);
    setFormExplanation('');
    setFormExpectedAnswer('');
    setFormRubric('Technical Accuracy: 50%\nCompleteness: 30%\nClarity: 20%');
    setFormAdminFeedback('');
    setEditorOpen(true);
  };

  const openEditModal = (q: AdminQuestionItem) => {
    setEditingId(q.id);
    setFormTitle(q.title || '');
    setFormType((q.type as any) || 'simple_coding');
    setFormSkillId(q.skill_id || 'python');
    setFormCategory(q.category || 'Technical Skills');
    setFormDifficulty(q.difficulty || 'medium');
    setFormPoints(q.points || 20);
    setFormEstimatedMinutes(q.estimated_minutes || 15);
    setFormInstructions(q.instructions || '');
    setFormTags(q.tags?.join(', ') || '');
    setFormPartialCredit(q.partial_credit ?? true);
    setFormApprovalStatus((q.approval_status as any) || 'approved');
    setFormStatement(q.problem_statement || q.question_text || '');
    setFormInputFormat(q.input_format || 'Standard input (stdin)');
    setFormOutputFormat(q.output_format || 'Standard output (stdout)');
    setFormConstraints(q.constraints?.join('\n') || '');
    setFormTimeLimitMs(q.time_limit_ms || 2000);
    setFormMemoryLimitKb(q.memory_limit_kb || 262144);
    setFormLanguages(q.supported_languages?.length ? q.supported_languages : [...ALL_LANGS]);
    setFormTestCases(
      q.test_cases && q.test_cases.length > 0
        ? q.test_cases.map((tc) => ({
            id: tc.id,
            label: tc.label || 'Case',
            input: tc.input || '',
            expected: tc.expected || '',
            is_hidden: Boolean(tc.is_hidden),
            weight: tc.weight ?? 1.0,
          }))
        : [{ ...EMPTY_CASE }]
    );
    if (q.options && q.options.length > 0) {
      setFormOptionsText(q.options.map((o) => o.option_text).join('\n'));
    }
    setFormCorrectAnswer(q.correct_answer ?? 0);
    setFormExplanation(q.explanation || '');
    setFormExpectedAnswer(q.expected_answer || '');
    setFormRubric(q.rubric || '');
    setFormAdminFeedback(q.admin_feedback || '');
    setEditorOpen(true);
  };

  const handleToggleLang = (lang: string) => {
    setFormLanguages((prev) =>
      prev.includes(lang) ? prev.filter((l) => l !== lang) : [...prev, lang]
    );
  };

  const handleSaveQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim() && !formStatement.trim()) return;
    setSaving(true);
    try {
      const isCoding = formType === 'simple_coding' || formType === 'hard_coding';
      const isShortAnswer = formType === 'short_answer';

      const tagList = formTags
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      const constraintsList = formConstraints
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);

      const payload: Record<string, any> = {
        skill_id: formSkillId.trim().toLowerCase(),
        skill_name: formSkillId.trim(),
        category: formCategory,
        type: formType,
        title: formTitle.trim() || formStatement.trim().slice(0, 80),
        question_text: formStatement.trim() || formTitle.trim(),
        difficulty: formDifficulty,
        points: Number(formPoints) || (formType === 'hard_coding' ? 30 : formType === 'simple_coding' ? 20 : 10),
        estimated_minutes: Number(formEstimatedMinutes) || 15,
        instructions: formInstructions.trim() || null,
        tags: tagList,
        partial_credit: formPartialCredit,
        approval_status: formApprovalStatus,
      };

      if (isCoding) {
        payload.input_format = formInputFormat;
        payload.output_format = formOutputFormat;
        payload.constraints = constraintsList;
        payload.time_limit_ms = Number(formTimeLimitMs) || 2000;
        payload.memory_limit_kb = Number(formMemoryLimitKb) || 262144;
        payload.supported_languages = formLanguages.length ? formLanguages : [...ALL_LANGS];
        payload.test_cases = formTestCases.map((tc, i) => ({
          id: tc.id || `tc-${i + 1}`,
          label: tc.label || (tc.is_hidden ? `Hidden ${i + 1}` : `Sample ${i + 1}`),
          input: tc.input,
          expected: tc.expected,
          is_hidden: tc.is_hidden,
          weight: Number(tc.weight) || 1.0,
        }));
      } else if (isShortAnswer) {
        payload.expected_answer = formExpectedAnswer.trim();
        payload.rubric = formRubric.trim();
        payload.admin_feedback = formAdminFeedback.trim();
      } else {
        // MCQ
        payload.options = formOptionsText
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean);
        payload.correct_answer = Number(formCorrectAnswer) || 0;
        payload.explanation = formExplanation.trim();
      }

      if (editingId) {
        await adminService.updateQuestion(editingId, payload);
        success('Question updated in MongoDB catalog.');
      } else {
        await adminService.createQuestion(payload);
        success('Question created in MongoDB catalog.');
      }
      setEditorOpen(false);
      await loadQuestions();
    } catch (err: any) {
      error(err?.message || 'Unable to save question.');
    } finally {
      setSaving(false);
    }
  };

  const handleApprove = async (qid: string, nextStatus: 'approved' | 'draft' | 'pending_review' | 'archived') => {
    try {
      await adminService.approveQuestion(qid, nextStatus as any);
      success(`Question status updated to ${nextStatus}.`);
      await loadQuestions();
    } catch (err: any) {
      error(err?.message || 'Approval update failed.');
    }
  };

  const handleDelete = async (qid: string) => {
    if (!window.confirm('Delete this question from the Question Bank?')) return;
    try {
      await adminService.deleteQuestion(qid);
      success('Question deleted from catalog.');
      await loadQuestions();
    } catch (err: any) {
      error(err?.message || 'Cannot delete seed questions; archive them instead.');
    }
  };

  const handleInspectSubmission = async (subId: string) => {
    try {
      const detail = await adminService.getCodingSubmissionDetail(subId);
      setSelectedSub(detail);
    } catch (err: any) {
      error(err?.message || 'Unable to load submission execution trace.');
    }
  };

  const filteredQuestions = questions.filter((q) => {
    const isCoding = q.type === 'simple_coding' || q.type === 'hard_coding';
    if (filterType === 'mcq' && q.type !== 'mcq') return false;
    if (filterType === 'coding' && !isCoding) return false;
    if (filterType === 'short_answer' && q.type !== 'short_answer') return false;
    if (filterStatus !== 'all' && (q.approval_status || 'approved') !== filterStatus) return false;
    if (searchQuery) {
      const hay = `${q.title} ${q.skill_name} ${q.category} ${q.question_text}`.toLowerCase();
      if (!hay.includes(searchQuery.toLowerCase())) return false;
    }
    return true;
  });

  if (loading) {
    return <ClayLoader label="Loading MongoDB Question Bank & Sandbox Inspector..." />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            Admin Question Bank & Sandbox Review
          </h1>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Manage reusable MCQs, sandboxed coding challenges with private hidden test cases, and short-answer rubrics.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('questions')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'questions'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            Questions ({questions.length})
          </button>
          <button
            onClick={() => setActiveTab('submissions')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'submissions'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            Submissions Review
          </button>
          {activeTab === 'questions' && (
            <button
              onClick={openCreateModal}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-sm flex items-center gap-1.5 cursor-pointer transition-all"
            >
              <Plus className="w-4 h-4" />
              Add Question
            </button>
          )}
        </div>
      </div>

      {activeTab === 'questions' && (
        <>
          {/* Filters Bar */}
          <div className="clay-card p-4 bg-white border border-slate-200/80 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-slate-500 font-bold">Type:</span>
              {[
                { id: 'all', label: 'All Types' },
                { id: 'mcq', label: 'MCQ' },
                { id: 'coding', label: 'Coding' },
                { id: 'short_answer', label: 'Short Answer' },
              ].map((t) => (
                <button
                  key={t.id}
                  onClick={() => setFilterType(t.id as any)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer transition-all ${
                    filterType === t.id
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'bg-slate-100 text-slate-700 hover:bg-blue-50 hover:text-blue-700'
                  }`}
                >
                  {t.label}
                </button>
              ))}

              <span className="text-xs text-slate-400 font-bold ml-2">Status:</span>
              {[
                { id: 'all', label: 'All' },
                { id: 'approved', label: 'Approved' },
                { id: 'draft', label: 'Draft' },
                { id: 'archived', label: 'Archived' },
              ].map((st) => (
                <button
                  key={st.id}
                  onClick={() => setFilterStatus(st.id)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer transition-all ${
                    filterStatus === st.id
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {st.label}
                </button>
              ))}
            </div>

            <div className="w-full sm:w-64">
              <Input
                placeholder="Search title, statement, skill..."
                leftIcon={<Search className="w-4 h-4 text-blue-600" />}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          {/* Questions Table */}
          <Card variant="default">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left text-slate-700 font-medium">
                <thead className="bg-slate-50 text-slate-600 uppercase font-mono text-[10px] font-bold border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3">Question / Statement</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Skill / Category</th>
                    <th className="px-4 py-3">Difficulty</th>
                    <th className="px-4 py-3">Marks</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredQuestions.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                        No questions found matching your filter criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredQuestions.map((q) => {
                      const isCoding = q.type === 'simple_coding' || q.type === 'hard_coding';
                      const isShortAnswer = q.type === 'short_answer';

                      return (
                        <tr key={q.id} className="hover:bg-blue-50/20 transition-colors">
                          <td className="px-4 py-3 max-w-sm">
                            <div className="font-bold text-slate-900 truncate">{q.title || 'Untitled Question'}</div>
                            <div className="text-[11px] text-slate-500 line-clamp-1">{q.question_text}</div>
                            {isCoding && (
                              <div className="flex items-center gap-2 mt-1 font-mono text-[10px] text-slate-400">
                                <span>{(q.test_cases || []).length} test cases</span>
                                {q.hidden_test_count ? (
                                  <span className="text-amber-600 font-bold flex items-center gap-0.5">
                                    <Lock className="w-2.5 h-2.5" /> {q.hidden_test_count} hidden
                                  </span>
                                ) : null}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <Badge
                              variant={isCoding ? 'brand' : isShortAnswer ? 'warning' : 'primary'}
                              size="sm"
                              className="capitalize"
                            >
                              {q.type.replace('_', ' ')}
                            </Badge>
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-bold text-slate-800">{q.skill_name || q.skill_id}</div>
                            <div className="text-[10px] text-slate-400">{q.category}</div>
                          </td>
                          <td className="px-4 py-3">
                            <Badge
                              variant={
                                q.difficulty === 'hard' || q.difficulty === 'Advanced'
                                  ? 'danger'
                                  : q.difficulty === 'easy' || q.difficulty === 'Beginner'
                                  ? 'success'
                                  : 'warning'
                              }
                              size="sm"
                              className="capitalize"
                            >
                              {q.difficulty}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 font-mono font-bold text-blue-600">{q.points} pts</td>
                          <td className="px-4 py-3">
                            <Badge
                              variant={
                                q.approval_status === 'approved'
                                  ? 'success'
                                  : q.approval_status === 'archived'
                                  ? 'danger'
                                  : 'warning'
                              }
                              size="sm"
                              className="capitalize"
                            >
                              {q.approval_status || 'approved'}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-right space-x-1.5 whitespace-nowrap">
                            <button
                              onClick={() => openEditModal(q)}
                              className="px-2.5 py-1 rounded-lg text-xs font-bold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1 cursor-pointer"
                            >
                              <Edit3 className="w-3 h-3 text-blue-600" />
                              Edit
                            </button>
                            {q.approval_status !== 'approved' && (
                              <button
                                onClick={() => handleApprove(q.id, 'approved')}
                                className="px-2.5 py-1 rounded-lg text-xs font-bold bg-white border border-emerald-200 text-emerald-700 hover:bg-emerald-50 inline-flex items-center gap-1 cursor-pointer"
                              >
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                Approve
                              </button>
                            )}
                            {q.approval_status === 'approved' && (
                              <button
                                onClick={() => handleApprove(q.id, 'archived')}
                                className="px-2 py-1 rounded-lg text-xs font-medium text-slate-500 hover:text-slate-800 hover:bg-slate-100 inline-flex items-center gap-1 cursor-pointer"
                                title="Archive Question"
                              >
                                <Archive className="w-3 h-3" />
                              </button>
                            )}
                            {q.id.startsWith('q-') && (
                              <button
                                onClick={() => handleDelete(q.id)}
                                className="px-2 py-1 rounded-lg text-xs font-medium text-rose-500 hover:text-rose-700 hover:bg-rose-50 inline-flex items-center gap-1 cursor-pointer"
                                title="Delete Question"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      {/* Submissions Review Tab */}
      {activeTab === 'submissions' && (
        <div className="space-y-4">
          <div className="clay-card p-4 bg-white border border-slate-200/80 flex flex-wrap items-center gap-3">
            <Select
              label="Filter Status"
              value={subFilterStatus}
              onChange={(e) => setSubFilterStatus(e.target.value)}
              options={[
                { value: '', label: 'All Verdicts' },
                { value: 'accepted', label: 'Accepted' },
                { value: 'wrong_answer', label: 'Wrong Answer' },
                { value: 'compilation_error', label: 'Compilation Error' },
                { value: 'runtime_error', label: 'Runtime Error' },
                { value: 'time_limit_exceeded', label: 'Timeout (TLE)' },
              ]}
            />
            <Select
              label="Language"
              value={subFilterLang}
              onChange={(e) => setSubFilterLang(e.target.value)}
              options={[
                { value: '', label: 'All Languages' },
                { value: 'python', label: 'Python' },
                { value: 'javascript', label: 'JavaScript' },
                { value: 'java', label: 'Java' },
                { value: 'cpp', label: 'C++' },
              ]}
            />
          </div>

          {loadingSubs ? (
            <ClayLoader label="Loading Student Submissions..." />
          ) : (
            <Card variant="default">
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left text-slate-700 font-medium">
                  <thead className="bg-slate-50 text-slate-600 uppercase font-mono text-[10px] font-bold border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3">Student</th>
                      <th className="px-4 py-3">Problem</th>
                      <th className="px-4 py-3">Language</th>
                      <th className="px-4 py-3">Mode</th>
                      <th className="px-4 py-3">Verdict</th>
                      <th className="px-4 py-3">Passed</th>
                      <th className="px-4 py-3">Score</th>
                      <th className="px-4 py-3 text-right">Inspect</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {submissions.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                          No sandboxed coding submissions recorded yet.
                        </td>
                      </tr>
                    ) : (
                      submissions.map((s) => (
                        <tr key={s.submission_id} className="hover:bg-slate-50">
                          <td className="px-4 py-3">
                            <div className="font-bold text-slate-900">{s.student_name || 'Student'}</div>
                            <div className="text-[10px] text-slate-500">{s.student_email}</div>
                          </td>
                          <td className="px-4 py-3 font-bold max-w-xs truncate">{s.question_title || s.question_id}</td>
                          <td className="px-4 py-3 font-mono uppercase">{s.language}</td>
                          <td className="px-4 py-3 font-mono text-[10px] uppercase">{s.run_type}</td>
                          <td className="px-4 py-3">
                            <Badge variant={s.status === 'accepted' ? 'success' : 'warning'} size="sm">
                              {s.status}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 font-mono">
                            {s.passed_test_cases}/{s.total_test_cases}
                          </td>
                          <td className="px-4 py-3 font-mono font-bold text-blue-600">
                            {s.earned_points}/{s.max_points} pts
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              onClick={() => handleInspectSubmission(s.submission_id)}
                              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1 cursor-pointer"
                            >
                              <Eye className="w-3.5 h-3.5 text-blue-600" />
                              Inspect
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
        </div>
      )}

      {/* Create / Edit Question Modal */}
      <Modal
        isOpen={editorOpen}
        onClose={() => setEditorOpen(false)}
        title={editingId ? 'Edit Question & Specification' : 'Create Question in Bank'}
        subtitle="Configure problem statement, scoring rubric, test cases, and authorization status"
        size="lg"
      >
        <form onSubmit={handleSaveQuestion} className="space-y-4 text-xs font-medium max-h-[75vh] overflow-y-auto pr-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Question Title"
              value={formTitle}
              onChange={(e) => setFormTitle(e.target.value)}
              placeholder="e.g. Distributed Rate Limiter / QuickSort Partition"
              required
            />
            <Input
              label="Skill Slug / Technology"
              value={formSkillId}
              onChange={(e) => setFormSkillId(e.target.value)}
              placeholder="python, react, system-design"
              required
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Select
              label="Question Type"
              value={formType}
              onChange={(e) => setFormType(e.target.value as any)}
              options={[
                { value: 'mcq', label: 'Multiple Choice (MCQ)' },
                { value: 'simple_coding', label: 'Simple Coding' },
                { value: 'hard_coding', label: 'Advanced Coding' },
                { value: 'short_answer', label: 'Short Answer' },
              ]}
            />
            <Select
              label="Difficulty"
              value={formDifficulty}
              onChange={(e) => setFormDifficulty(e.target.value)}
              options={[
                { value: 'easy', label: 'Beginner / Easy' },
                { value: 'medium', label: 'Intermediate / Medium' },
                { value: 'hard', label: 'Advanced / Hard' },
              ]}
            />
            <Input
              label="Marks / Points"
              type="number"
              value={String(formPoints)}
              onChange={(e) => setFormPoints(Number(e.target.value))}
            />
            <Select
              label="Approval Status"
              value={formApprovalStatus}
              onChange={(e) => setFormApprovalStatus(e.target.value as any)}
              options={[
                { value: 'approved', label: 'Approved (Ready)' },
                { value: 'draft', label: 'Draft' },
                { value: 'pending_review', label: 'Pending Review' },
                { value: 'archived', label: 'Archived' },
              ]}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Input
              label="Category"
              value={formCategory}
              onChange={(e) => setFormCategory(e.target.value)}
              placeholder="Backend, Frontend, Core CS"
            />
            <Input
              label="Estimated Time (minutes)"
              type="number"
              value={String(formEstimatedMinutes)}
              onChange={(e) => setFormEstimatedMinutes(Number(e.target.value))}
            />
            <Input
              label="Tags (comma-separated)"
              value={formTags}
              onChange={(e) => setFormTags(e.target.value)}
              placeholder="sorting, arrays, oop"
            />
          </div>

          <Textarea
            label="Question Description / Problem Statement"
            value={formStatement}
            onChange={(e) => setFormStatement(e.target.value)}
            rows={3}
            placeholder="Write clear, comprehensive problem instructions..."
            required
          />

          <Input
            label="Specific Instructions / Candidate Guidelines (Optional)"
            value={formInstructions}
            onChange={(e) => setFormInstructions(e.target.value)}
            placeholder="e.g. Do not use built-in sort functions. O(N log N) required."
          />

          {/* Conditional Sub-forms */}
          {formType === 'mcq' && (
            <div className="space-y-3 p-3 rounded-xl bg-blue-50/40 border border-blue-200/80">
              <span className="text-xs font-bold text-blue-900 block">MCQ Configuration</span>
              <Textarea
                label="Options (one per line, minimum 2)"
                value={formOptionsText}
                onChange={(e) => setFormOptionsText(e.target.value)}
                rows={4}
                placeholder="Option A&#10;Option B&#10;Option C&#10;Option D"
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input
                  label="Correct Answer Index (0 for 1st option, 1 for 2nd...)"
                  type="number"
                  value={String(formCorrectAnswer)}
                  onChange={(e) => setFormCorrectAnswer(Number(e.target.value))}
                />
                <Input
                  label="Answer Explanation (Protected from students until released)"
                  value={formExplanation}
                  onChange={(e) => setFormExplanation(e.target.value)}
                  placeholder="Why this answer is correct..."
                />
              </div>
            </div>
          )}

          {formType === 'short_answer' && (
            <div className="space-y-3 p-3 rounded-xl bg-amber-50/40 border border-amber-200/80">
              <span className="text-xs font-bold text-amber-900 block">Short Answer & Rubric Specification</span>
              <Textarea
                label="Expected Answer / Key Concepts"
                value={formExpectedAnswer}
                onChange={(e) => setFormExpectedAnswer(e.target.value)}
                rows={2}
                placeholder="Key technical points that must be covered in student response..."
              />
              <Textarea
                label="Evaluation Rubric"
                value={formRubric}
                onChange={(e) => setFormRubric(e.target.value)}
                rows={2}
                placeholder="e.g. Conceptual accuracy: 50%, Concrete examples: 30%, Formatting: 20%"
              />
              <Input
                label="Admin Feedback / Grading Notes"
                value={formAdminFeedback}
                onChange={(e) => setFormAdminFeedback(e.target.value)}
                placeholder="Guidance for faculty reviewing this response..."
              />
            </div>
          )}

          {(formType === 'simple_coding' || formType === 'hard_coding') && (
            <div className="space-y-4 p-3 rounded-xl bg-slate-50 border border-slate-200">
              <span className="text-xs font-bold text-slate-800 block">Coding Sandbox Configuration</span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input label="Input Format" value={formInputFormat} onChange={(e) => setFormInputFormat(e.target.value)} />
                <Input label="Output Format" value={formOutputFormat} onChange={(e) => setFormOutputFormat(e.target.value)} />
              </div>

              <Textarea
                label="Constraints (one per line)"
                value={formConstraints}
                onChange={(e) => setFormConstraints(e.target.value)}
                rows={2}
              />

              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Time Limit (ms)"
                  type="number"
                  value={String(formTimeLimitMs)}
                  onChange={(e) => setFormTimeLimitMs(Number(e.target.value))}
                />
                <Input
                  label="Memory Limit (KB)"
                  type="number"
                  value={String(formMemoryLimitKb)}
                  onChange={(e) => setFormMemoryLimitKb(Number(e.target.value))}
                />
              </div>

              <div className="space-y-1.5">
                <span className="text-[11px] font-bold text-slate-700 block">Allowed Languages</span>
                <div className="flex flex-wrap gap-2">
                  {ALL_LANGS.map((lang) => (
                    <label
                      key={lang}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-slate-200 cursor-pointer font-mono uppercase text-[11px]"
                    >
                      <input
                        type="checkbox"
                        checked={formLanguages.includes(lang)}
                        onChange={() => handleToggleLang(lang)}
                      />
                      {lang}
                    </label>
                  ))}
                </div>
              </div>

              {/* Public & Private Test Cases */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-800">
                    Test Cases (Private hidden cases are strictly protected from students)
                  </span>
                  <button
                    type="button"
                    onClick={() => setFormTestCases((prev) => [...prev, { ...EMPTY_CASE, label: `Case ${prev.length + 1}` }])}
                    className="px-2.5 py-1 rounded-lg text-xs font-bold bg-white border border-slate-200 text-blue-600 hover:bg-blue-50 cursor-pointer"
                  >
                    + Add Test Case
                  </button>
                </div>

                {formTestCases.map((tc, idx) => (
                  <div key={idx} className="p-3 rounded-xl bg-white border border-slate-200 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <input
                        value={tc.label}
                        onChange={(e) => {
                          const next = [...formTestCases];
                          next[idx] = { ...next[idx], label: e.target.value };
                          setFormTestCases(next);
                        }}
                        className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-xs font-bold"
                        placeholder="Label"
                      />
                      <label className="inline-flex items-center gap-1.5 text-[11px] font-bold text-blue-800 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={tc.is_hidden}
                          onChange={(e) => {
                            const next = [...formTestCases];
                            next[idx] = { ...next[idx], is_hidden: e.target.checked };
                            setFormTestCases(next);
                          }}
                        />
                        Private Hidden Test Case
                      </label>
                      {formTestCases.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setFormTestCases((prev) => prev.filter((_, i) => i !== idx))}
                          className="text-rose-600 text-[11px] font-bold hover:underline cursor-pointer"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <textarea
                        rows={2}
                        value={tc.input}
                        onChange={(e) => {
                          const next = [...formTestCases];
                          next[idx] = { ...next[idx], input: e.target.value };
                          setFormTestCases(next);
                        }}
                        placeholder="Stdin input..."
                        className="w-full p-2 rounded-lg border border-slate-200 bg-slate-50 font-mono text-[11px]"
                      />
                      <textarea
                        rows={2}
                        value={tc.expected}
                        onChange={(e) => {
                          const next = [...formTestCases];
                          next[idx] = { ...next[idx], expected: e.target.value };
                          setFormTestCases(next);
                        }}
                        placeholder="Expected stdout..."
                        className="w-full p-2 rounded-lg border border-slate-200 bg-slate-50 font-mono text-[11px]"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="pt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setEditorOpen(false)}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-sm cursor-pointer disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Question'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Admin Submission Inspection Modal */}
      <Modal
        isOpen={Boolean(selectedSub)}
        onClose={() => setSelectedSub(null)}
        title={selectedSub ? `Submission ${selectedSub.submission_id}` : ''}
        subtitle={selectedSub ? `${selectedSub.student_name} (${selectedSub.student_email}) — ${selectedSub.language.toUpperCase()}` : ''}
        size="lg"
      >
        {selectedSub && (
          <div className="space-y-4 text-xs max-h-[75vh] overflow-y-auto pr-1">
            <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-blue-50 border border-blue-200 font-mono">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-blue-700" />
                <span className="font-bold text-slate-900">{selectedSub.status}</span>
                <span className="text-slate-500">({selectedSub.passed_test_cases}/{selectedSub.total_test_cases} cases)</span>
              </div>
              <div className="flex items-center gap-3 font-bold">
                <span className="inline-flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {selectedSub.execution_time_ms} ms</span>
                <span className="inline-flex items-center gap-1 text-blue-700"><Cpu className="w-3.5 h-3.5" /> {selectedSub.earned_points}/{selectedSub.max_points} pts</span>
              </div>
            </div>

            {selectedSub.compile_error && (
              <pre className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-[11px] font-mono whitespace-pre-wrap">
                {selectedSub.compile_error}
              </pre>
            )}

            <div>
              <span className="font-bold text-slate-700 block mb-1">Submitted Source Code</span>
              <pre className="p-3 rounded-xl bg-slate-900 text-slate-100 text-[11px] font-mono overflow-x-auto">
                {selectedSub.source_code}
              </pre>
            </div>

            {selectedSub.test_case_results && selectedSub.test_case_results.length > 0 && (
              <div className="space-y-2">
                <span className="font-bold text-slate-700 block">Full Test-Case Execution Trace (Public + Hidden)</span>
                {selectedSub.test_case_results.map((tc) => (
                  <div
                    key={tc.id}
                    className={`p-2.5 rounded-xl border text-[11px] font-mono space-y-1 ${
                      tc.passed ? 'bg-emerald-50/70 border-emerald-200' : 'bg-rose-50/70 border-rose-200'
                    }`}
                  >
                    <div className="flex items-center justify-between font-bold">
                      <span>
                        {tc.label} {tc.is_hidden && '(HIDDEN)'}
                      </span>
                      <span>
                        {tc.status} • {tc.execution_time_ms} ms
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-[10px]">
                      <div>
                        <span className="text-slate-500 block">Input:</span>
                        <pre className="bg-white p-1.5 rounded border whitespace-pre-wrap">{tc.input}</pre>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Expected:</span>
                        <pre className="bg-white p-1.5 rounded border whitespace-pre-wrap">{tc.expected_output}</pre>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Actual:</span>
                        <pre className="bg-white p-1.5 rounded border whitespace-pre-wrap">{tc.actual_output || '(empty)'}</pre>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};
