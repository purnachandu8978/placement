import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ClipboardList,
  CheckCircle2,
  Clock,
  ExternalLink,
  Github,
  Upload,
  AlertCircle,
  FileCode,
  Award,
  ChevronRight,
  ShieldCheck,
  Send,
  Globe,
  RefreshCw,
  Code2,
  Play,
  Save,
  Check,
  HelpCircle,
  Lock,
  ArrowRight,
  ArrowLeft,
  Sparkles,
  Timer,
  AlertTriangle,
} from 'lucide-react';
import { Card } from '../../../components/common/Card';
import { Button } from '../../../components/common/Button';
import { Badge } from '../../../components/common/Badge';
import { Modal } from '../../../components/common/Modal';
import { Input, Textarea } from '../../../components/common/Input';
import { ClayLoader } from '../../../components/common/ClayLoader';
import { EmptyState } from '../../../components/common/EmptyState';
import { useToast } from '../../../context/ToastContext';
import { useStudentData } from '../../../context/StudentDataContext';
import { assignmentService } from '../../../services/assignmentService';
import type { Assignment, AssignmentQuestion, AssignmentAnswerSubmission } from '../../../types';

function formatDeadline(deadline?: string): string {
  if (!deadline) return 'Within 7 Days';
  if (deadline.includes('T')) {
    return deadline.split('T')[0];
  }
  return deadline;
}

function formatRemainingTime(seconds?: number): string {
  if (seconds === undefined || seconds === null) return '';
  if (seconds <= 0) return 'Deadline passed';
  const hours = Math.floor(seconds / 3600);
  const days = Math.floor(hours / 24);
  if (days > 1) return `${days} days left`;
  if (hours > 0) return `${hours} hrs left`;
  const mins = Math.floor((seconds % 3600) / 60);
  return `${mins} mins left`;
}

export const AssignmentCenterPage: React.FC = () => {
  const navigate = useNavigate();
  const { success, error, info } = useToast();
  const { refreshAll } = useStudentData();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [activeTab, setActiveTab] = useState<'all' | 'action_required' | 'in_review' | 'graded' | 'overdue'>('all');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Workstation Modal State (Taking an Assignment)
  const [workstationOpen, setWorkstationOpen] = useState(false);
  const [activeAssignment, setActiveAssignment] = useState<Assignment | null>(null);
  const [workstationLoading, setWorkstationLoading] = useState(false);
  const [workstationQuestions, setWorkstationQuestions] = useState<AssignmentQuestion[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);

  // Workstation Answers State
  const [studentAnswers, setStudentAnswers] = useState<Record<string, AssignmentAnswerSubmission>>({});
  const [workstationRepo, setWorkstationRepo] = useState('');
  const [workstationLiveUrl, setWorkstationLiveUrl] = useState('');
  const [workstationNotes, setWorkstationNotes] = useState('');
  const [savingProgress, setSavingProgress] = useState(false);
  const [submittingAssignment, setSubmittingAssignment] = useState(false);

  // Result & Feedback Modal State
  const [resultModalOpen, setResultModalOpen] = useState(false);
  const [resultData, setResultData] = useState<any | null>(null);
  const [loadingResult, setLoadingResult] = useState(false);

  const loadAssignments = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const data = await assignmentService.getAssignments();
      setAssignments(data);
    } catch (err: any) {
      const msg = err.message || 'Could not connect to MongoDB Atlas backend.';
      setLoadError(msg);
      error('Failed to load assignments', msg);
    } finally {
      setLoading(false);
    }
  }, [error]);

  useEffect(() => {
    void loadAssignments();
  }, [loadAssignments]);

  // Open Interactive Workstation
  const handleOpenWorkstation = async (asg: Assignment) => {
    setActiveAssignment(asg);
    setWorkstationLoading(true);
    setWorkstationOpen(true);
    setCurrentQuestionIndex(0);

    try {
      const wsData = await assignmentService.getAssignmentWorkstation(asg.id);
      setWorkstationQuestions(wsData.questions || []);

      // Initialize answers from draft if available
      const existingAnswers: Record<string, AssignmentAnswerSubmission> = {};
      if (wsData.draft_submission?.answers && Array.isArray(wsData.draft_submission.answers)) {
        for (const ans of wsData.draft_submission.answers) {
          existingAnswers[ans.question_id] = ans;
        }
      }
      setStudentAnswers(existingAnswers);
      setWorkstationRepo(wsData.draft_submission?.github_url || asg.submission?.repoUrl || '');
      setWorkstationLiveUrl(wsData.draft_submission?.live_url || asg.submission?.deployedUrl || '');
      setWorkstationNotes(wsData.draft_submission?.notes || asg.submission?.notes || '');
    } catch (err: any) {
      error('Workstation error', err.message || 'Could not load assignment workstation.');
      setWorkstationOpen(false);
    } finally {
      setWorkstationLoading(false);
    }
  };

  // Auto-Save Draft Progress
  const handleSaveProgress = async () => {
    if (!activeAssignment) return;
    setSavingProgress(true);
    try {
      const answersPayload = Object.values(studentAnswers);
      await assignmentService.saveProgress(activeAssignment.id, {
        github_url: workstationRepo,
        live_url: workstationLiveUrl,
        notes: workstationNotes,
        answers: answersPayload,
      });
      info('Draft Progress Saved', 'Your current answers and code have been auto-saved to MongoDB Atlas.');
    } catch (err: any) {
      error('Save failed', err.message);
    } finally {
      setSavingProgress(false);
    }
  };

  // Submit Final Assignment Solution
  const handleSubmitAssignment = async () => {
    if (!activeAssignment) return;

    // Check if questions exist but are unanswered
    if (workstationQuestions.length > 0) {
      const answeredCount = Object.keys(studentAnswers).length;
      if (answeredCount < workstationQuestions.length) {
        if (!window.confirm(`You have answered ${answeredCount} of ${workstationQuestions.length} questions. Submit anyway?`)) {
          return;
        }
      }
    }

    setSubmittingAssignment(true);
    try {
      const answersPayload = Object.values(studentAnswers);
      await assignmentService.submitAssignment(activeAssignment.id, {
        repoUrl: workstationRepo,
        deployedUrl: workstationLiveUrl,
        notes: workstationNotes,
        answers: answersPayload,
      });

      success('Assignment submitted successfully! Evaluation and progress updated in MongoDB.');
      setWorkstationOpen(false);
      await loadAssignments();
      await refreshAll();
    } catch (err: any) {
      error('Submission failed', err.message || 'Please verify deadline or network connection.');
    } finally {
      setSubmittingAssignment(false);
    }
  };

  // Open Result Modal
  const handleOpenResult = async (asg: Assignment) => {
    setResultModalOpen(true);
    setLoadingResult(true);
    try {
      const res = await assignmentService.getAssignmentResult(asg.id);
      setResultData(res);
    } catch (err: any) {
      error('Result lookup failed', err.message);
      setResultModalOpen(false);
    } finally {
      setLoadingResult(false);
    }
  };

  if (loading && assignments.length === 0) {
    return <ClayLoader label="Loading Engineering Assignments from MongoDB Atlas..." />;
  }

  // Filter Logic
  const filtered = assignments.filter((a) => {
    if (activeTab === 'action_required') {
      return a.status === 'Not Started' || a.status === 'In Progress' || a.status === 'Pending';
    }
    if (activeTab === 'in_review') {
      return a.status === 'Submitted' || a.status === 'Under Review';
    }
    if (activeTab === 'graded') {
      return a.status === 'Graded' || a.status === 'Evaluated';
    }
    if (activeTab === 'overdue') {
      return a.status === 'Overdue';
    }
    return true;
  });

  const currentQ = workstationQuestions[currentQuestionIndex];
  const currentAnswer = currentQ ? studentAnswers[currentQ.question_id || currentQ.id || ''] : undefined;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">Assignment Center</h1>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Production-grade engineering assignments, sandboxed coding challenges, and faculty-verified rubrics.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <Button variant="ghost" size="sm" onClick={() => void loadAssignments()} className="gap-1.5 text-xs text-slate-600">
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </Button>
          <Badge variant="brand" size="sm">
            Rubric Evaluated
          </Badge>
          <Badge variant="success" size="sm">
            Proof of Work
          </Badge>
        </div>
      </div>

      {/* Filter Tabs (Clay Pill Tabs - Orange Accents) */}
      <div className="flex flex-wrap gap-2 p-1.5 rounded-2xl bg-white border border-orange-200/80 shadow-xs">
        {[
          { key: 'all', label: `All Assignments (${assignments.length})` },
          {
            key: 'action_required',
            label: `Action Required (${
              assignments.filter((a) => a.status === 'Not Started' || a.status === 'In Progress' || a.status === 'Pending').length
            })`,
          },
          {
            key: 'in_review',
            label: `Submitted & In Review (${
              assignments.filter((a) => a.status === 'Submitted' || a.status === 'Under Review').length
            })`,
          },
          {
            key: 'graded',
            label: `Graded & Verified (${
              assignments.filter((a) => a.status === 'Graded' || a.status === 'Evaluated').length
            })`,
          },
          {
            key: 'overdue',
            label: `Overdue (${assignments.filter((a) => a.status === 'Overdue').length})`,
          },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as any)}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === tab.key
                ? 'clay-button-peach text-white shadow-sm'
                : 'text-slate-600 hover:text-orange-600 hover:bg-orange-50/60'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Assignment Cards List */}
      {loadError && assignments.length === 0 ? (
        <div className="clay-card p-8 bg-white border border-rose-200 text-center space-y-4">
          <AlertCircle className="w-8 h-8 text-rose-500 mx-auto" />
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-slate-900">Failed to Connect to MongoDB</h3>
            <p className="text-xs text-slate-500">{loadError}</p>
          </div>
          <Button variant="primary" size="sm" onClick={() => void loadAssignments()} className="gap-1.5 text-xs font-bold">
            <RefreshCw className="w-3.5 h-3.5" />
            Retry Loading Assignments
          </Button>
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<ClipboardList className="w-8 h-8 text-slate-400" />}
          title="No assignments in this view"
          description="You are all caught up! Check back soon for new assigned engineering deliverables."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((assignment) => {
            const hasSubmission = Boolean(assignment.submission);
            const isGraded = assignment.status === 'Graded' || assignment.status === 'Evaluated';
            const isOverdue = assignment.status === 'Overdue';
            const isActionRequired = assignment.status === 'Not Started' || assignment.status === 'In Progress' || assignment.status === 'Pending';

            return (
              <div
                key={assignment.id}
                className="clay-card p-5 bg-white border border-orange-100/80 hover:border-orange-200 transition-all flex flex-col justify-between space-y-4 shadow-xs"
              >
                <div>
                  {/* Card Header */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[10px] text-orange-600 font-bold uppercase tracking-wider">
                          Week {assignment.weekNumber}
                        </span>
                        <span className="text-slate-300">•</span>
                        <span className="text-xs font-bold text-slate-600">{assignment.category}</span>
                      </div>
                      <h3 className="text-base font-black text-slate-900 leading-snug">{assignment.title}</h3>
                    </div>

                    <Badge
                      variant={
                        isGraded
                          ? 'success'
                          : isOverdue
                          ? 'danger'
                          : hasSubmission
                          ? 'warning'
                          : assignment.status === 'In Progress'
                          ? 'brand'
                          : 'neutral'
                      }
                      size="sm"
                    >
                      {assignment.status}
                    </Badge>
                  </div>

                  <p className="text-xs text-slate-600 font-medium mt-2 line-clamp-2">{assignment.description}</p>

                  {/* Metadata Chips */}
                  <div className="flex flex-wrap items-center gap-2 mt-3 text-[11px] font-mono text-slate-500">
                    <div className="flex items-center gap-1 bg-slate-50 px-2 py-1 rounded-lg border border-slate-100">
                      <Clock className="w-3 h-3 text-slate-400" />
                      <span>{formatDeadline(assignment.deadline)}</span>
                    </div>

                    {assignment.remainingSeconds !== undefined && assignment.remainingSeconds > 0 && !hasSubmission && (
                      <div className="flex items-center gap-1 bg-amber-50 px-2 py-1 rounded-lg border border-amber-200 text-amber-700 font-bold">
                        <Timer className="w-3 h-3" />
                        <span>{formatRemainingTime(assignment.remainingSeconds)}</span>
                      </div>
                    )}

                    <div className="flex items-center gap-1 bg-slate-50 px-2 py-1 rounded-lg border border-slate-100">
                      <Award className="w-3 h-3 text-orange-500" />
                      <span>{assignment.totalMarks || 100} Marks</span>
                    </div>

                    {assignment.questionCount !== undefined && assignment.questionCount > 0 && (
                      <div className="flex items-center gap-1 bg-blue-50 px-2 py-1 rounded-lg border border-blue-100 text-blue-700 font-bold">
                        <HelpCircle className="w-3 h-3" />
                        <span>{assignment.questionCount} Questions</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Card Footer Actions */}
                <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                  {isGraded ? (
                    <div className="flex items-center justify-between w-full">
                      <div className="flex items-center gap-1.5 font-mono">
                        <Award className="w-4 h-4 text-emerald-600" />
                        <span className="text-xs font-bold text-slate-900">
                          Score: {assignment.submission?.grade ?? assignment.submission?.autoScore} / {assignment.totalMarks || 100}
                        </span>
                      </div>
                      <button
                        onClick={() => void handleOpenResult(assignment)}
                        className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 cursor-pointer transition-all flex items-center gap-1"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        View Result & Rubric
                      </button>
                    </div>
                  ) : hasSubmission ? (
                    <div className="flex items-center justify-between w-full">
                      <span className="text-[11px] text-amber-700 font-bold flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" /> Under Faculty Review
                      </span>
                      <button
                        onClick={() => void handleOpenWorkstation(assignment)}
                        className="px-3 py-1.5 rounded-xl text-xs font-bold bg-white text-slate-700 hover:bg-slate-50 border border-slate-200 cursor-pointer"
                      >
                        Review Solution
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between w-full">
                      <span className="text-[11px] text-slate-400">
                        {isOverdue ? 'Late submissions subject to policy' : 'Pending completion'}
                      </span>
                      <button
                        onClick={() => navigate(`/exam/assignment/${assignment.id}/readiness`)}
                        className="px-4 py-2 rounded-xl text-xs font-bold clay-button-peach text-white shadow-sm flex items-center gap-1.5 cursor-pointer hover:opacity-95"
                      >
                        {assignment.status === 'In Progress' ? 'Continue Assignment' : 'Start Assignment'}
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Interactive Assignment Workstation Modal */}
      <Modal
        isOpen={workstationOpen}
        onClose={() => setWorkstationOpen(false)}
        title={activeAssignment ? activeAssignment.title : 'Assignment Workstation'}
        subtitle={activeAssignment ? `${activeAssignment.skill} • ${activeAssignment.totalMarks || 100} Marks Total` : ''}
        size="lg"
      >
        {workstationLoading ? (
          <ClayLoader label="Launching Assignment Workstation..." />
        ) : (
          <div className="space-y-4 text-xs font-medium max-h-[75vh] overflow-y-auto pr-1">
            {/* Workstation Top Navigation Tabs */}
            {workstationQuestions.length > 0 && (
              <div className="flex items-center gap-1.5 p-1.5 rounded-xl bg-slate-100 overflow-x-auto">
                {workstationQuestions.map((q, idx) => {
                  const qid = q.question_id || q.id || '';
                  const isAnswered = Boolean(studentAnswers[qid]);
                  const isActive = currentQuestionIndex === idx;

                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setCurrentQuestionIndex(idx)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer flex items-center gap-1 ${
                        isActive
                          ? 'bg-white text-orange-600 shadow-xs'
                          : isAnswered
                          ? 'text-emerald-700 hover:bg-white/50'
                          : 'text-slate-600 hover:bg-white/50'
                      }`}
                    >
                      <span>Q{idx + 1}</span>
                      {isAnswered && <Check className="w-3 h-3 text-emerald-600" />}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Current Question View */}
            {currentQ && (
              <div className="clay-card p-4 bg-white border border-orange-100/80 space-y-3">
                <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2">
                  <div>
                    <span className="text-[10px] text-orange-600 font-bold uppercase tracking-wider block">
                      Question {currentQuestionIndex + 1} of {workstationQuestions.length} ({currentQ.type.replace('_', ' ')})
                    </span>
                    <h3 className="text-sm font-black text-slate-900 mt-0.5">{currentQ.title}</h3>
                  </div>
                  <Badge variant="brand" size="sm">
                    {currentQ.points} Points
                  </Badge>
                </div>

                <div className="text-xs text-slate-700 leading-relaxed font-sans whitespace-pre-wrap">
                  {currentQ.question_text || currentQ.problem_statement}
                </div>

                {currentQ.instructions && (
                  <div className="p-2.5 rounded-lg bg-amber-50/70 border border-amber-200/60 text-[11px] text-amber-800">
                    <strong>Instructions:</strong> {currentQ.instructions}
                  </div>
                )}

                {/* MCQ Question Mode */}
                {currentQ.type === 'mcq' && (
                  <div className="space-y-2 pt-2">
                    <span className="text-xs font-bold text-slate-800 block">Select the Correct Option:</span>
                    <div className="space-y-1.5">
                      {(Array.isArray(currentQ.options) ? currentQ.options : []).map((opt: any, optIdx: number) => {
                        const optText = typeof opt === 'string' ? opt : opt.option_text;
                        const isSelected = currentAnswer?.selected_option === optIdx;

                        return (
                          <label
                            key={optIdx}
                            className={`p-3 rounded-xl border flex items-center gap-3 cursor-pointer transition-all ${
                              isSelected
                                ? 'bg-orange-50 border-orange-300 text-orange-950 font-bold shadow-xs'
                                : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                            }`}
                          >
                            <input
                              type="radio"
                              name={`question-${currentQ.question_id || currentQ.id}`}
                              checked={isSelected}
                              onChange={() => {
                                const qid = currentQ.question_id || currentQ.id || '';
                                setStudentAnswers((prev) => ({
                                  ...prev,
                                  [qid]: {
                                    question_id: qid,
                                    type: 'mcq',
                                    selected_option: optIdx,
                                  },
                                }));
                              }}
                            />
                            <span className="text-xs">{optText}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Short Answer Question Mode */}
                {currentQ.type === 'short_answer' && (
                  <div className="space-y-2 pt-2">
                    <span className="text-xs font-bold text-slate-800 block">Your Written Solution:</span>
                    <textarea
                      rows={5}
                      value={currentAnswer?.text_answer || ''}
                      onChange={(e) => {
                        const qid = currentQ.question_id || currentQ.id || '';
                        setStudentAnswers((prev) => ({
                          ...prev,
                          [qid]: {
                            question_id: qid,
                            type: 'short_answer',
                            text_answer: e.target.value,
                          },
                        }));
                      }}
                      placeholder="Explain your approach, architectural rationale, and complexity analysis..."
                      className="w-full p-3 rounded-xl border border-slate-200 bg-slate-50 text-xs focus:bg-white focus:border-orange-400 outline-none"
                    />
                  </div>
                )}

                {/* Coding Question Mode */}
                {(currentQ.type === 'simple_coding' || currentQ.type === 'hard_coding') && (
                  <div className="space-y-3 pt-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800">Source Code Implementation:</span>
                      <span className="text-[11px] font-mono text-slate-400">Python 3 / Sandbox Execution</span>
                    </div>

                    <textarea
                      rows={8}
                      value={currentAnswer?.code ?? (currentQ.starter_code?.python || '# Write your solution here\n')}
                      onChange={(e) => {
                        const qid = currentQ.question_id || currentQ.id || '';
                        setStudentAnswers((prev) => ({
                          ...prev,
                          [qid]: {
                            question_id: qid,
                            type: currentQ.type,
                            code: e.target.value,
                            language: 'python',
                          },
                        }));
                      }}
                      className="w-full p-3 rounded-xl bg-slate-900 text-slate-100 font-mono text-[11px] outline-none"
                      spellCheck={false}
                    />

                    {/* Sample Public Test Cases */}
                    {currentQ.test_cases && currentQ.test_cases.length > 0 && (
                      <div className="space-y-1.5">
                        <span className="text-[11px] font-bold text-slate-700 block">Sample Test Cases:</span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {currentQ.test_cases.map((tc, tcIdx) => (
                            <div key={tcIdx} className="p-2 rounded bg-slate-100 font-mono text-[10px]">
                              <div className="text-slate-500 font-bold mb-0.5">{tc.label || `Case ${tcIdx + 1}`}</div>
                              <div>Input: <code className="text-slate-800">{tc.input}</code></div>
                              <div>Expected: <code className="text-slate-800">{tc.expected}</code></div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Question Navigation Buttons */}
                <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    disabled={currentQuestionIndex === 0}
                    onClick={() => setCurrentQuestionIndex((prev) => Math.max(0, prev - 1))}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-40 flex items-center gap-1 cursor-pointer"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" /> Previous Question
                  </button>

                  <button
                    type="button"
                    disabled={currentQuestionIndex === workstationQuestions.length - 1}
                    onClick={() => setCurrentQuestionIndex((prev) => Math.min(workstationQuestions.length - 1, prev + 1))}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold bg-orange-50 border border-orange-200 text-orange-700 hover:bg-orange-100 disabled:opacity-40 flex items-center gap-1 cursor-pointer"
                  >
                    Next Question <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* Deliverable Project Links Section */}
            <div className="clay-card p-4 bg-white border border-slate-200 space-y-3">
              <span className="text-xs font-bold text-slate-900 block">
                Deliverable Artifacts & Project Links (Optional for Question Sets)
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input
                  label="GitHub Repository URL"
                  value={workstationRepo}
                  onChange={(e) => setWorkstationRepo(e.target.value)}
                  placeholder="https://github.com/username/project"
                  leftIcon={<Github className="w-4 h-4 text-slate-400" />}
                />
                <Input
                  label="Live Deployed URL"
                  value={workstationLiveUrl}
                  onChange={(e) => setWorkstationLiveUrl(e.target.value)}
                  placeholder="https://my-app.vercel.app"
                  leftIcon={<ExternalLink className="w-4 h-4 text-slate-400" />}
                />
              </div>

              <Textarea
                label="Submission Notes & Architectural Documentation"
                value={workstationNotes}
                onChange={(e) => setWorkstationNotes(e.target.value)}
                rows={2}
                placeholder="Mention test coverage, trade-offs, or setup instructions..."
              />
            </div>

            {/* Workstation Footer Actions */}
            <div className="pt-3 border-t border-slate-200 flex items-center justify-between gap-2">
              <button
                type="button"
                disabled={savingProgress}
                onClick={() => void handleSaveProgress()}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 flex items-center gap-1.5 cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                {savingProgress ? 'Saving...' : 'Save Draft Progress'}
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setWorkstationOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer"
                >
                  Close
                </button>
                <button
                  type="button"
                  disabled={submittingAssignment}
                  onClick={() => void handleSubmitAssignment()}
                  className="px-5 py-2 rounded-xl text-xs font-bold clay-button-peach text-white shadow-sm flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Send className="w-3.5 h-3.5" />
                  {submittingAssignment ? 'Submitting...' : 'Submit Final Solution'}
                </button>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* View Result & Feedback Modal */}
      <Modal
        isOpen={resultModalOpen}
        onClose={() => setResultModalOpen(false)}
        title={resultData ? `Evaluation: ${resultData.assignment_title}` : 'Assignment Result'}
        subtitle="Official faculty grading, rubric breakdown, and answer explanations"
        size="lg"
      >
        {loadingResult || !resultData ? (
          <ClayLoader label="Loading Official Grade & Faculty Feedback..." />
        ) : (
          <div className="space-y-4 text-xs font-medium max-h-[75vh] overflow-y-auto pr-1">
            {/* Score Summary Box */}
            <div className="p-4 rounded-2xl bg-emerald-50/80 border border-emerald-200 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="space-y-1 text-center sm:text-left">
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">Verified Result</span>
                <div className="text-2xl font-black text-slate-900">
                  {resultData.score} / {resultData.max_score} Points
                </div>
                {resultData.is_late && (
                  <span className="text-[11px] text-amber-700 font-bold block">
                    Late submission penalty applied
                  </span>
                )}
              </div>

              <div className="text-center sm:text-right">
                <Badge variant="success" size="md">
                  {Math.round((resultData.score / (resultData.max_score || 100)) * 100)}% Grade
                </Badge>
                <span className="text-[10px] text-slate-500 block mt-1">
                  Evaluated by: {resultData.reviewed_by || 'Faculty Committee'}
                </span>
              </div>
            </div>

            {/* Feedback Box */}
            {resultData.feedback && (
              <div className="p-3.5 rounded-xl bg-white border border-slate-200 space-y-1">
                <span className="text-xs font-bold text-slate-900 block">Faculty Reviewer Feedback:</span>
                <p className="text-xs text-slate-700 leading-relaxed">{resultData.feedback}</p>
              </div>
            )}

            {/* Question-by-Question Solution & Explanations */}
            {resultData.questions && resultData.questions.length > 0 && (
              <div className="space-y-3">
                <span className="text-xs font-bold text-slate-900 block">
                  Question Breakdown & Released Solutions:
                </span>
                {resultData.questions.map((q: any, idx: number) => {
                  const studentAns = (resultData.answers || []).find(
                    (a: any) => a.question_id === (q.question_id || q.id)
                  );

                  return (
                    <div key={idx} className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-900">
                          Q{idx + 1}: {q.title || `Problem ${idx + 1}`} ({q.type})
                        </span>
                        <span className="font-mono font-bold text-blue-600">
                          {studentAns?.awarded_marks ?? '—'} / {q.points || 10} pts
                        </span>
                      </div>

                      <div className="text-[11px] text-slate-600">
                        {q.question_text}
                      </div>

                      {/* Released MCQ Answer */}
                      {q.type === 'mcq' && (
                        <div className="space-y-1 p-2 rounded bg-white border border-slate-200 text-[11px]">
                          <div>
                            Your Answer: <strong>Option {studentAns?.selected_option ?? 'None'}</strong>
                          </div>
                          {q.correct_answer !== undefined && (
                            <div className="text-emerald-700 font-bold">
                              Correct Answer: Option {q.correct_answer}
                            </div>
                          )}
                          {q.explanation && (
                            <div className="text-slate-500 italic mt-1">
                              Explanation: {q.explanation}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Released Short Answer Rubric */}
                      {q.type === 'short_answer' && (
                        <div className="space-y-1 p-2 rounded bg-white border border-slate-200 text-[11px]">
                          <div>
                            Your Answer: <span className="font-sans">{studentAns?.text_answer || '(Empty)'}</span>
                          </div>
                          {q.rubric && (
                            <div className="text-slate-600 font-mono text-[10px] pt-1">
                              <strong>Rubric Points:</strong> {q.rubric}
                            </div>
                          )}
                        </div>
                      )}

                      {studentAns?.feedback && (
                        <div className="text-[11px] text-indigo-700 font-medium">
                          Grader Remark: {studentAns.feedback}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};
