import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Upload,
  FileText,
  CheckCircle2,
  AlertTriangle,
  Edit3,
  Plus,
  Trash2,
  Sparkles,
  Download,
  Copy,
  ShieldCheck,
  Clock,
  RefreshCw,
  Cpu,
  Layers,
  Flame,
  ArrowRight,
  Check,
  Info,
  Award,
} from 'lucide-react';
import { Card, CardHeader } from '../../../components/common/Card';
import { Button } from '../../../components/common/Button';
import { Badge, SkillStatusBadge } from '../../../components/common/Badge';
import { Modal } from '../../../components/common/Modal';
import { Input, Textarea } from '../../../components/common/Input';
import { ScoreRing } from '../../../components/common/ScoreRing';
import { ProgressBar } from '../../../components/common/ProgressBar';
import { EmptyState } from '../../../components/common/EmptyState';
import { ClayLoader } from '../../../components/common/ClayLoader';
import { useToast } from '../../../context/ToastContext';
import { useStudentData } from '../../../context/StudentDataContext';
import { resumeService, type BackendResumeRecord } from '../../../services/resumeService';
import { jobService } from '../../../services/jobService';
import type {
  ExtractedResume,
  ResumeAnalysis,
  OptimizedResume,
  SkillCategory,
  JobPosting,
  SemanticSkillClassification,
  ResumeOptimizationSuggestion,
} from '../../../types';

export const ResumeIntelligencePage: React.FC = () => {
  const navigate = useNavigate();
  const { success, error, info } = useToast();
  const { resume: contextResume, uploadResumeAndSync, refreshAll } = useStudentData();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [resumeData, setResumeData] = useState<(ExtractedResume & { id?: string; atsScore?: number }) | null>(null);
  const [resumeHistory, setResumeHistory] = useState<BackendResumeRecord[]>([]);
  const [jobsList, setJobsList] = useState<JobPosting[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string>('');
  const [analysis, setAnalysis] = useState<ResumeAnalysis | null>(null);
  const [optimizedResume, setOptimizedResume] = useState<OptimizedResume | null>(null);
  const [loading, setLoading] = useState(true);

  // Phase 3 Semantic & AI Optimization State
  const [semanticSkills, setSemanticSkills] = useState<SemanticSkillClassification | null>(null);
  const [aiOptimizations, setAiOptimizations] = useState<ResumeOptimizationSuggestion[]>([]);
  const [isReprocessing, setIsReprocessing] = useState(false);
  const [isApproving, setIsApproving] = useState<Record<number, boolean>>({});
  const [explainableMatch, setExplainableMatch] = useState<any>(null);

  // Upload state
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dragActive, setDragActive] = useState(false);

  // Paste Raw Text modal
  const [pasteModalOpen, setPasteModalOpen] = useState(false);
  const [pastedText, setPastedText] = useState('');

  // Edit Skill Modal State
  const [editSkillModalOpen, setEditSkillModalOpen] = useState(false);
  const [newSkillName, setNewSkillName] = useState('');
  const [newSkillCategory, setNewSkillCategory] = useState<SkillCategory>('Programming Languages');

  // Edit Candidate Profile Modal
  const [editProfileModalOpen, setEditProfileModalOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editCollege, setEditCollege] = useState('');
  const [editDegree, setEditDegree] = useState('');
  const [editCgpa, setEditCgpa] = useState('');

  const [activeTab, setActiveTab] = useState<'extracted' | 'semantic' | 'ats_analysis' | 'optimizer' | 'raw'>('extracted');

  const loadResumeWorkspace = async (jobOverride?: string) => {
    try {
      const [res, history, jobs] = await Promise.all([
        resumeService.getExtractedResume(),
        resumeService.getResumes().catch(() => []),
        jobService.getJobs().catch(() => []),
      ]);
      setResumeData(res);
      setResumeHistory(history);
      setJobsList(jobs);

      if (res?.semanticSkills) {
        setSemanticSkills(res.semanticSkills);
      } else if (res) {
        resumeService.getSemanticSkills('current').then(setSemanticSkills).catch(() => {});
      }

      if (res?.optimizationSuggestions && res.optimizationSuggestions.length > 0) {
        setAiOptimizations(res.optimizationSuggestions);
      }

      const targetJobId = jobOverride || selectedJobId || jobs[0]?.id || '';
      if (targetJobId && !selectedJobId) {
        setSelectedJobId(targetJobId);
      }

      if (res && res.rawText) {
        const targetJob = jobs.find((j) => j.id === targetJobId) || jobs[0];
        const [anl, opt, matchAi] = await Promise.all([
          resumeService.analyzeAgainstJob(res.rawText, targetJob || {}),
          resumeService.optimizeResume(res.rawText, targetJob),
          resumeService.matchJobAI('current', {
            job_id: targetJob?.id,
            job_title: targetJob?.role,
            job_description: targetJob?.description,
            required_skills: targetJob?.techStack,
          }).catch(() => null),
        ]);
        setAnalysis(anl);
        setOptimizedResume(opt);
        setExplainableMatch(matchAi);

        // If no AI optimization suggestions stored, generate fresh ones
        if (!res.optimizationSuggestions || res.optimizationSuggestions.length === 0) {
          resumeService.optimizeWithAI('current', targetJob?.role).then((aiOpt) => {
            if (aiOpt?.suggestions && aiOpt.suggestions.length > 0) {
              setAiOptimizations(aiOpt.suggestions);
            }
          }).catch(() => {});
        }
      } else {
        setAnalysis(null);
        setOptimizedResume(null);
        setExplainableMatch(null);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadResumeWorkspace();
  }, []);

  useEffect(() => {
    if (contextResume) {
      setResumeData(contextResume);
      if (contextResume.semanticSkills) setSemanticSkills(contextResume.semanticSkills);
      if (contextResume.optimizationSuggestions) setAiOptimizations(contextResume.optimizationSuggestions);
    }
  }, [contextResume]);

  const handleJobSelectionChange = async (jobId: string) => {
    setSelectedJobId(jobId);
    if (!resumeData?.rawText) return;
    const job = jobsList.find((j) => j.id === jobId);
    const [anl, opt, matchAi] = await Promise.all([
      resumeService.analyzeAgainstJob(resumeData.rawText, job || {}),
      resumeService.optimizeResume(resumeData.rawText, job),
      resumeService.matchJobAI('current', {
        job_id: job?.id,
        job_title: job?.role,
        job_description: job?.description,
        required_skills: job?.techStack,
      }).catch(() => null),
    ]);
    setAnalysis(anl);
    setOptimizedResume(opt);
    setExplainableMatch(matchAi);
  };

  const handleFileUpload = async (file: File) => {
    setIsUploading(true);
    setUploadProgress(20);

    const interval = setInterval(() => {
      setUploadProgress((prev) => (prev >= 90 ? 90 : prev + 20));
    }, 150);

    try {
      const updated = await uploadResumeAndSync(file);
      clearInterval(interval);
      setUploadProgress(100);
      setResumeData(updated);
      success(`Parsed ${file.name}! Skills, semantic analysis, roadmap & ATS updated.`);
      await loadResumeWorkspace();
    } catch (err: any) {
      clearInterval(interval);
      error(err?.message || 'Failed to parse uploaded resume.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleReprocessWithAI = async () => {
    setIsReprocessing(true);
    try {
      const updated = await resumeService.reprocessWithAI('current');
      if (updated) {
        setResumeData(updated);
        if (updated.semanticSkills) setSemanticSkills(updated.semanticSkills);
        if (updated.optimizationSuggestions) setAiOptimizations(updated.optimizationSuggestions);
        await refreshAll();
        await loadResumeWorkspace();
        success('Successfully reprocessed resume with Gemini AI!');
      }
    } catch (err: any) {
      error(err?.message || 'Failed to reprocess resume with AI.');
    } finally {
      setIsReprocessing(false);
    }
  };

  const handleApproveBullet = async (index: number) => {
    if (!aiOptimizations[index]) return;
    setIsApproving((prev) => ({ ...prev, [index]: true }));
    const updated = [...aiOptimizations];
    updated[index] = { ...updated[index], student_approved: true };
    setAiOptimizations(updated);

    try {
      await resumeService.approveOptimization('current', updated);
      success(`Approved rewrite for ${updated[index].section}! Saved to active profile.`);
    } catch (err: any) {
      error(err?.message || 'Failed to save approved bullet.');
    } finally {
      setIsApproving((prev) => ({ ...prev, [index]: false }));
    }
  };

  const handlePasteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pastedText.trim()) return;
    const blob = new File([pastedText], 'pasted-resume.txt', { type: 'text/plain' });
    setPasteModalOpen(false);
    setPastedText('');
    await handleFileUpload(blob);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  const handleAddSkill = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSkillName.trim()) return;
    const updated = await resumeService.addExtractedSkill(newSkillName.trim());
    setResumeData(updated);
    await refreshAll();
    success(`Added "${newSkillName.trim()}" to extracted skills.`);
    setNewSkillName('');
    setEditSkillModalOpen(false);
  };

  const handleDeleteSkill = async (skillName: string) => {
    const updated = await resumeService.removeExtractedSkill(skillName);
    setResumeData(updated);
    await refreshAll();
    info(`Removed "${skillName}" from inventory.`);
  };

  const handleDeleteVersion = async (resumeId: string) => {
    await resumeService.deleteResume(resumeId);
    await refreshAll();
    await loadResumeWorkspace();
    info('Removed resume version from storage.');
  };

  const handleDownloadOptimized = () => {
    if (!optimizedResume) return;
    const blob = new Blob([optimizedResume.optimizedText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Optimized_Resume_${(currentJob?.company || 'Target').replace(/\s+/g, '_')}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    success('Downloaded ATS-optimized text draft.');
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    const updated = await resumeService.updateCandidateProfile({
      candidateName: editName,
      college: editCollege,
      degree: editDegree,
      cgpa: Number(editCgpa) || undefined,
    });
    if (updated) setResumeData(updated);
    await refreshAll();
    success('Candidate academic details saved in database.');
    setEditProfileModalOpen(false);
  };

  if (loading) {
    return <ClayLoader label="Loading AI Resume Intelligence..." />;
  }

  const currentJob = jobsList.find((j) => j.id === selectedJobId) || jobsList[0];
  const categories = Array.from(
    new Set((resumeData?.detectedSkills || []).map((s) => s.category))
  );

  const isGeminiAI = resumeData?.extractionMetadata?.method === 'gemini_ai';

  return (
    <div className="space-y-6">
      {/* 1. Header & Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              Resume Intelligence & Semantic Skills
            </h1>
            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
              isGeminiAI
                ? 'bg-purple-100 text-purple-800 border border-purple-200'
                : 'bg-amber-100 text-amber-800 border border-amber-200'
            }`}>
              {isGeminiAI ? <Sparkles className="w-3 h-3 text-purple-600" /> : <Cpu className="w-3 h-3 text-amber-600" />}
              {isGeminiAI ? 'Gemini AI Verified' : 'Deterministic Fallback'}
            </span>
          </div>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Hybrid AI parsing, strict evidence-backed skill extraction, semantic normalization, and explainable job fit.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {resumeData && (
            <Button
              variant="white"
              size="sm"
              leftIcon={<RefreshCw className={`w-3.5 h-3.5 ${isReprocessing ? 'animate-spin text-purple-600' : 'text-slate-600'}`} />}
              onClick={handleReprocessWithAI}
              isLoading={isReprocessing}
            >
              Reprocess with AI
            </Button>
          )}
          <Button
            variant="white"
            size="sm"
            leftIcon={<FileText className="w-4 h-4 text-[#E86144]" />}
            onClick={() => setPasteModalOpen(true)}
          >
            Paste Text
          </Button>
        </div>
      </div>

      {/* 2. Drag & Drop Upload Zone */}
      <div
        className={`clay-card p-6 border-2 border-dashed transition-all duration-200 ${
          dragActive
            ? 'border-orange-400 bg-orange-50/50 scale-[1.01]'
            : 'border-orange-200/90 bg-white hover:border-orange-300'
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
      >
        <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-orange-100 text-orange-600 border border-orange-200 flex items-center justify-center shrink-0 shadow-sm">
              <Upload className="w-7 h-7" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Upload Engineering Resume</h3>
              <p className="text-xs text-slate-600 font-medium mt-0.5">
                Drag and drop PDF, DOCX, or TXT. AI extracts verified skills, projects, and generates tailored roadmaps.
              </p>
              <div className="flex flex-wrap items-center gap-2 mt-2 text-[11px] text-slate-500 font-medium">
                <span className="text-slate-400">Active Document:</span>
                <span className="font-mono text-orange-700 font-bold">
                  {resumeData?.fileName || 'None uploaded yet'}
                </span>
                <span>•</span>
                <span className="font-semibold">
                  Extracted {resumeData?.detectedSkills.length || 0} skills
                </span>
                {resumeData?.extractionMetadata?.latency_ms ? (
                  <>
                    <span>•</span>
                    <span className="font-mono text-purple-700">
                      {resumeData.extractionMetadata.latency_ms}ms latency
                    </span>
                  </>
                ) : null}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.txt"
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  handleFileUpload(e.target.files[0]);
                }
              }}
            />
            <Button
              variant="primary"
              size="sm"
              leftIcon={<Upload className="w-4 h-4" />}
              onClick={() => fileInputRef.current?.click()}
              isLoading={isUploading}
            >
              Browse File
            </Button>
          </div>
        </div>

        {isUploading && (
          <div className="mt-4 pt-3 border-t border-orange-100">
            <div className="flex justify-between text-xs text-slate-600 font-semibold mb-1">
              <span>Extracting evidence, normalizing semantic ontology & updating workspace...</span>
              <span className="font-mono text-orange-600">{uploadProgress}%</span>
            </div>
            <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden border border-slate-200 shadow-inner">
              <div
                className="bg-gradient-to-r from-orange-500 to-amber-400 h-full rounded-full transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Empty State */}
      {!resumeData ? (
        <EmptyState
          title="No resume uploaded yet"
          description="Upload a PDF, DOCX, or TXT resume (or paste plain text above) to experience hybrid Gemini AI analysis, semantic skill breakdown, STAR bullet rewrites, and explainable job matching."
          icon={<Sparkles className="w-8 h-8 text-[#E86144]" />}
          actionText="Select Resume File"
          onAction={() => fileInputRef.current?.click()}
        />
      ) : (
        <>
          {/* Navigation Tabs */}
          <div className="flex flex-wrap gap-2 p-1.5 rounded-2xl bg-white border border-orange-200/80 shadow-xs">
            {[
              { id: 'extracted', label: `Profile & Skills (${resumeData.detectedSkills.length})` },
              { id: 'semantic', label: 'Semantic Skill Intelligence' },
              { id: 'ats_analysis', label: `Explainable Job Match (${analysis?.overallScore || 0}%)` },
              { id: 'optimizer', label: `STAR Optimizer Studio (${aiOptimizations.length})` },
              { id: 'raw', label: 'Raw Document Text' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  activeTab === tab.id
                    ? 'clay-button-peach text-white shadow-sm'
                    : 'text-slate-600 hover:text-orange-600 hover:bg-orange-50/60'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* TAB 1: EXTRACTED PROFILE & EVIDENCE-BACKED SKILLS */}
          {activeTab === 'extracted' && (
            <div className="space-y-6">
              <Card variant="default">
                <CardHeader
                  title="Candidate Academic Credentials"
                  subtitle="Ground truth extracted directly from your resume"
                  action={
                    <Button
                      variant="white"
                      size="sm"
                      leftIcon={<Edit3 className="w-3.5 h-3.5" />}
                      onClick={() => {
                        setEditName(resumeData.candidateName || '');
                        setEditCollege(resumeData.education.college || '');
                        setEditDegree(resumeData.education.degree || '');
                        setEditCgpa(resumeData.education.cgpa ? String(resumeData.education.cgpa) : '');
                        setEditProfileModalOpen(true);
                      }}
                    >
                      Edit Details
                    </Button>
                  }
                />

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-orange-50/40 rounded-2xl border border-orange-100 text-xs font-medium">
                  <div>
                    <span className="text-slate-400">Candidate Name:</span>
                    <p className="text-slate-900 font-bold mt-0.5">{resumeData.candidateName || '—'}</p>
                  </div>
                  <div>
                    <span className="text-slate-400">College / Institution:</span>
                    <p className="text-slate-900 font-bold mt-0.5">{resumeData.education.college || '—'}</p>
                  </div>
                  <div>
                    <span className="text-slate-400">Degree & Branch:</span>
                    <p className="text-slate-900 font-bold mt-0.5">{resumeData.education.degree || '—'}</p>
                  </div>
                  <div>
                    <span className="text-slate-400">CGPA / Grade:</span>
                    <p className="font-mono text-emerald-700 font-bold mt-0.5">
                      {resumeData.education.cgpa ? `${resumeData.education.cgpa} / 10.0` : '—'}
                    </p>
                  </div>
                </div>
              </Card>

              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-slate-900">Evidence-Backed Skill Matrix</h3>
                  <p className="text-xs text-slate-500 font-medium">
                    Every skill is tied to exact quotes from your resume text without hallucination.
                  </p>
                </div>
                <Button
                  variant="white"
                  size="sm"
                  leftIcon={<Plus className="w-4 h-4 text-orange-600" />}
                  onClick={() => setEditSkillModalOpen(true)}
                >
                  Add Skill
                </Button>
              </div>

              <div className="space-y-4">
                {categories.map((cat) => {
                  const skillsInCat = resumeData.detectedSkills.filter((s) => s.category === cat);
                  if (skillsInCat.length === 0) return null;
                  return (
                    <Card key={cat} variant="default" padding="sm">
                      <div className="flex items-center justify-between pb-2 mb-3 border-b border-orange-100">
                        <h4 className="text-xs font-bold text-orange-700 uppercase tracking-wider">{cat}</h4>
                        <span className="text-[11px] font-mono font-bold text-slate-500">{skillsInCat.length} skills</span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {skillsInCat.map((skill) => (
                          <div
                            key={skill.id}
                            className="p-3 rounded-xl bg-white border border-slate-200/90 hover:border-orange-300 shadow-2xs flex flex-col justify-between group transition-all"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <div className="flex items-center gap-1.5">
                                  <span className="text-xs font-bold text-slate-900">{skill.name}</span>
                                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                                    skill.extractionMethod === 'gemini_ai'
                                      ? 'bg-purple-50 text-purple-700 border border-purple-200 font-bold'
                                      : 'bg-slate-100 text-slate-600 font-medium'
                                  }`}>
                                    {skill.extractionMethod === 'gemini_ai' ? 'AI' : 'Regex'}
                                  </span>
                                </div>
                                <span className="text-[10px] text-slate-500 font-medium">{skill.proficiency}</span>
                              </div>

                              <div className="flex items-center gap-1">
                                <SkillStatusBadge
                                  status={skill.isVerified ? 'verified' : skill.confidenceScore > 75 ? 'assessed' : 'extracted'}
                                  score={skill.confidenceScore}
                                />
                                <button
                                  onClick={() => handleDeleteSkill(skill.name)}
                                  className="opacity-60 group-hover:opacity-100 p-1 text-slate-400 hover:text-rose-600 rounded transition-opacity cursor-pointer"
                                  title="Remove skill"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>

                            {skill.sourceEvidence && (
                              <div className="mt-2 pt-2 border-t border-slate-100 text-[10px] text-slate-600 bg-slate-50/70 p-2 rounded-lg font-mono">
                                <span className="text-slate-400 font-sans block text-[9px] uppercase font-bold mb-0.5">Resume Evidence:</span>
                                "{skill.sourceEvidence}"
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </Card>
                  );
                })}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card variant="default">
                  <CardHeader title="Detected Projects" subtitle="Projects parsed from resume text" />
                  {resumeData.detectedProjects.length === 0 ? (
                    <p className="text-xs text-slate-400 py-4">No project blocks identified cleanly in uploaded file.</p>
                  ) : (
                    <div className="space-y-3">
                      {resumeData.detectedProjects.map((p, idx) => (
                        <div key={idx} className="p-3.5 rounded-xl bg-orange-50/40 border border-orange-100">
                          <h4 className="text-xs font-bold text-slate-900">{p.title}</h4>
                          <p className="text-[11px] text-slate-600 mt-1 leading-relaxed font-medium">{p.description}</p>
                          {p.techStack && p.techStack.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mt-2">
                              {p.techStack.map((tech) => (
                                <span key={tech} className="px-2 py-0.5 rounded-md bg-white border border-orange-200 text-[10px] font-mono font-bold text-orange-800">
                                  {tech}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </Card>

                <Card variant="default">
                  <CardHeader title="Detected Certifications" subtitle="Credentials identified" />
                  {resumeData.detectedCertifications.length === 0 ? (
                    <p className="text-xs text-slate-400 py-4">No formal certifications listed in uploaded document.</p>
                  ) : (
                    <div className="space-y-2.5">
                      {resumeData.detectedCertifications.map((cert, idx) => (
                        <div key={idx} className="p-3.5 rounded-xl bg-white border border-slate-200/90 shadow-2xs flex items-center gap-3">
                          <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                          <span className="text-xs text-slate-800 font-semibold">{cert}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              </div>
            </div>
          )}

          {/* TAB 2: SEMANTIC SKILL INTELLIGENCE */}
          {activeTab === 'semantic' && (
            <div className="space-y-6">
              <div className="clay-card-peach p-5 border border-orange-200">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <span className="text-[11px] font-bold text-orange-700 uppercase tracking-wider">Semantic Ontology Engine</span>
                    <h3 className="text-base font-black text-slate-900 mt-0.5">
                      Normalized Skill Categorization & Industry Expectations
                    </h3>
                    <p className="text-xs text-slate-600 font-medium mt-1">
                      Skills are normalized (e.g. ReactJS → React, JS → JavaScript, K8s → Kubernetes) without merging distinct technologies (Java ≠ JavaScript, C ≠ C++).
                    </p>
                  </div>
                  <Badge variant="cyan" size="sm">Ontology Active</Badge>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* 1. Core Skills */}
                <Card variant="default" padding="md">
                  <div className="flex items-center gap-2 pb-2 mb-3 border-b border-slate-100">
                    <Flame className="w-4 h-4 text-orange-600" />
                    <h4 className="text-xs font-bold text-slate-900 uppercase">Core Skills ({semanticSkills?.core_skills.length || 0})</h4>
                  </div>
                  <p className="text-[11px] text-slate-500 mb-3">Primary foundational technologies defining your core engineering identity.</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(semanticSkills?.core_skills || []).map((s) => (
                      <span key={s} className="px-2.5 py-1 rounded-xl bg-orange-50 text-orange-900 border border-orange-200 text-xs font-bold font-mono">
                        {s}
                      </span>
                    ))}
                    {!semanticSkills?.core_skills.length && <span className="text-xs text-slate-400">None detected</span>}
                  </div>
                </Card>

                {/* 2. Supporting Skills */}
                <Card variant="default" padding="md">
                  <div className="flex items-center gap-2 pb-2 mb-3 border-b border-slate-100">
                    <Layers className="w-4 h-4 text-blue-600" />
                    <h4 className="text-xs font-bold text-slate-900 uppercase">Supporting Skills ({semanticSkills?.supporting_skills.length || 0})</h4>
                  </div>
                  <p className="text-[11px] text-slate-500 mb-3">Complementary libraries, styling systems, and tooling.</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(semanticSkills?.supporting_skills || []).map((s) => (
                      <span key={s} className="px-2.5 py-1 rounded-xl bg-blue-50 text-blue-900 border border-blue-200 text-xs font-bold font-mono">
                        {s}
                      </span>
                    ))}
                    {!semanticSkills?.supporting_skills.length && <span className="text-xs text-slate-400">None detected</span>}
                  </div>
                </Card>

                {/* 3. Missing Market Skills */}
                <Card variant="default" padding="md">
                  <div className="flex items-center gap-2 pb-2 mb-3 border-b border-slate-100">
                    <AlertTriangle className="w-4 h-4 text-rose-600" />
                    <h4 className="text-xs font-bold text-slate-900 uppercase">Missing Market Skills ({semanticSkills?.missing_skills.length || 0})</h4>
                  </div>
                  <p className="text-[11px] text-slate-500 mb-3">Expected by recruiters alongside your stack, but absent from your resume.</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(semanticSkills?.missing_skills || []).map((s) => (
                      <span key={s} className="px-2.5 py-1 rounded-xl bg-rose-50 text-rose-900 border border-rose-200 text-xs font-bold font-mono">
                        + {s}
                      </span>
                    ))}
                    {!semanticSkills?.missing_skills.length && <span className="text-xs text-slate-400">None</span>}
                  </div>
                </Card>

                {/* 4. Related Skills */}
                <Card variant="default" padding="md">
                  <div className="flex items-center gap-2 pb-2 mb-3 border-b border-slate-100">
                    <ArrowRight className="w-4 h-4 text-emerald-600" />
                    <h4 className="text-xs font-bold text-slate-900 uppercase">Related Next Skills ({semanticSkills?.related_skills.length || 0})</h4>
                  </div>
                  <p className="text-[11px] text-slate-500 mb-3">Adjacent technologies you can easily transition into based on current knowledge.</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(semanticSkills?.related_skills || []).map((s) => (
                      <span key={s} className="px-2.5 py-1 rounded-xl bg-emerald-50 text-emerald-900 border border-emerald-200 text-xs font-bold font-mono">
                        {s}
                      </span>
                    ))}
                    {!semanticSkills?.related_skills.length && <span className="text-xs text-slate-400">None</span>}
                  </div>
                </Card>

                {/* 5. Outdated Skills */}
                <Card variant="default" padding="md">
                  <div className="flex items-center gap-2 pb-2 mb-3 border-b border-slate-100">
                    <Clock className="w-4 h-4 text-amber-600" />
                    <h4 className="text-xs font-bold text-slate-900 uppercase">Legacy / Outdated Flags ({semanticSkills?.outdated_skills.length || 0})</h4>
                  </div>
                  <p className="text-[11px] text-slate-500 mb-3">Legacy technologies that may detract from modern recruiter appeal.</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(semanticSkills?.outdated_skills || []).map((s) => (
                      <span key={s} className="px-2.5 py-1 rounded-xl bg-amber-50 text-amber-900 border border-amber-200 text-xs font-bold font-mono">
                        {s}
                      </span>
                    ))}
                    {!semanticSkills?.outdated_skills.length && <span className="text-xs text-emerald-600 font-semibold">Zero legacy flags detected</span>}
                  </div>
                </Card>

                {/* 6. Skills to Assess */}
                <Card variant="default" padding="md">
                  <div className="flex items-center gap-2 pb-2 mb-3 border-b border-slate-100">
                    <Award className="w-4 h-4 text-purple-600" />
                    <h4 className="text-xs font-bold text-slate-900 uppercase">Ready For Assessment ({semanticSkills?.skills_requiring_assessment.length || 0})</h4>
                  </div>
                  <p className="text-[11px] text-slate-500 mb-3">Extracted skills connected to approved 5Q / 10Q placement tests.</p>
                  <div className="space-y-1.5">
                    {(semanticSkills?.skills_requiring_assessment || []).slice(0, 4).map((s) => (
                      <div key={s} className="flex items-center justify-between text-xs p-2 rounded-lg bg-purple-50/70 border border-purple-100">
                        <span className="font-bold text-purple-900 font-mono">{s}</span>
                        <Button
                          variant="white"
                          size="sm"
                          onClick={() => navigate('/assessments')}
                        >
                          Take Test
                        </Button>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>
            </div>
          )}

          {/* TAB 3: ATS EVALUATION & EXPLAINABLE JOB MATCH */}
          {activeTab === 'ats_analysis' && (
            <div className="space-y-6">
              {currentJob && (
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-2xl clay-card bg-white border border-orange-200">
                  <div>
                    <span className="text-xs text-slate-500 font-semibold">Target Placement Benchmark:</span>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-sm font-bold text-slate-900">{currentJob.company}</span>
                      <span className="text-xs text-slate-400">—</span>
                      <span className="text-xs text-slate-700 font-medium">{currentJob.role}</span>
                    </div>
                  </div>

                  <select
                    value={selectedJobId}
                    onChange={(e) => handleJobSelectionChange(e.target.value)}
                    className="bg-orange-50/70 border border-orange-200 rounded-xl text-xs text-slate-800 font-bold p-2.5 cursor-pointer shadow-2xs"
                  >
                    {jobsList.map((j) => (
                      <option key={j.id} value={j.id}>
                        {j.company} - {j.role}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Disclaimer Banner */}
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 flex items-start gap-2.5">
                <Info className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
                <p className="leading-relaxed">
                  <strong className="text-slate-800">Third-Party ATS Disclosure:</strong> The estimated ATS score is an internal heuristic simulation and does not guarantee results with proprietary third-party ATS systems (e.g., Workday, Taleo, Greenhouse).
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card variant="default" className="text-center" padding="md">
                  <span className="text-xs text-slate-500 font-semibold">Overall Match Score</span>
                  <ScoreRing score={explainableMatch?.match_score ?? analysis?.overallScore ?? 0} size="md" className="my-2" />
                  <span className="text-[11px] text-slate-500 font-medium">
                    {explainableMatch?.experience_match_level || 'Candidate Benchmark'}
                  </span>
                </Card>
                <Card variant="default" padding="md">
                  <span className="text-xs text-slate-500 font-semibold">Keyword Density</span>
                  <p className="text-2xl font-bold font-mono text-slate-900 mt-2">{analysis?.keywordDensity || 0}%</p>
                  <ProgressBar value={analysis?.keywordDensity || 0} size="sm" variant="brand" className="mt-2" />
                </Card>
                <Card variant="default" padding="md">
                  <span className="text-xs text-slate-500 font-semibold">ATS Structure Cleanliness</span>
                  <p className="text-2xl font-bold font-mono text-slate-900 mt-2">{analysis?.atsCleanlinessScore || 0}%</p>
                  <ProgressBar value={analysis?.atsCleanlinessScore || 0} size="sm" variant="cyan" className="mt-2" />
                </Card>
                <Card variant="default" padding="md">
                  <span className="text-xs text-slate-500 font-semibold">Quantified Impact</span>
                  <p className="text-2xl font-bold font-mono text-slate-900 mt-2">{analysis?.quantifiableMetrics || 0}%</p>
                  <ProgressBar value={analysis?.quantifiableMetrics || 0} size="sm" variant="success" className="mt-2" />
                </Card>
              </div>

              {/* Explainable Matching Breakdown */}
              {explainableMatch && (
                <Card variant="default">
                  <CardHeader
                    title="Explainable Role Fit Evaluation"
                    subtitle={`Transparent breakdown for ${explainableMatch.job_title}`}
                  />
                  <div className="p-4 rounded-xl bg-orange-50/30 border border-orange-100 space-y-3 text-xs">
                    <p className="text-slate-800 leading-relaxed font-medium">
                      {explainableMatch.role_relevance_summary}
                    </p>
                    {explainableMatch.improvement_recommendations && explainableMatch.improvement_recommendations.length > 0 && (
                      <div className="pt-2 border-t border-orange-100">
                        <span className="font-bold text-slate-900 block mb-1">Targeted Recommendations:</span>
                        <ul className="list-disc pl-5 space-y-1 text-slate-600">
                          {explainableMatch.improvement_recommendations.map((rec: string, i: number) => (
                            <li key={i}>{rec}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </Card>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card variant="default">
                  <CardHeader title="Matched Competencies" subtitle="Directly demonstrated on resume" />
                  <div className="flex flex-wrap gap-2">
                    {(explainableMatch?.required_skills_matched || analysis?.matchedKeywords || []).map((kw: string) => (
                      <span key={kw} className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-mono font-bold">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> {kw}
                      </span>
                    ))}
                  </div>
                </Card>

                <Card variant="default">
                  <CardHeader title="Missing Competencies" subtitle="Target role requirements not found in resume" />
                  <div className="flex flex-wrap gap-2">
                    {(explainableMatch?.missing_skills || analysis?.missingSkills || []).map((kw: string) => (
                      <span key={kw} className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-rose-50 text-rose-800 border border-rose-200 text-xs font-mono font-bold">
                        <AlertTriangle className="w-3.5 h-3.5 text-rose-600" /> {kw}
                      </span>
                    ))}
                  </div>
                </Card>
              </div>
            </div>
          )}

          {/* TAB 4: AI STAR OPTIMIZER STUDIO */}
          {activeTab === 'optimizer' && (
            <div className="space-y-6">
              {/* Anti-Fabrication Notice */}
              <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-3">
                <ShieldCheck className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold">Strict Anti-Fabrication Guarantee</h4>
                  <p className="mt-0.5 leading-relaxed">
                    AI optimization rewrites only improve sentence structure, active power verbs, and the STAR framework. No false numbers, metrics, or experiences are fabricated. Candidate review is required before saving edits.
                  </p>
                </div>
              </div>

              {/* Suggestions List */}
              <div className="space-y-4">
                {aiOptimizations.map((item, idx) => (
                  <Card key={idx} variant="default" padding="md">
                    <div className="flex items-center justify-between pb-2 mb-3 border-b border-slate-100">
                      <span className="text-xs font-bold text-orange-700 uppercase">{item.section}</span>
                      <div className="flex items-center gap-2">
                        {item.student_approved ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-bold">
                            <Check className="w-3 h-3 text-emerald-600" /> Approved
                          </span>
                        ) : (
                          <Button
                            variant="primary"
                            size="sm"
                            leftIcon={<Check className="w-3 h-3" />}
                            onClick={() => handleApproveBullet(idx)}
                            isLoading={isApproving[idx]}
                          >
                            Approve & Save
                          </Button>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                      <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-700">
                        <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Original Bullet:</span>
                        <p className="font-mono text-[11px] leading-relaxed">{item.original_bullet}</p>
                      </div>

                      <div className="p-3 rounded-xl bg-emerald-50/50 border border-emerald-200 text-emerald-950">
                        <span className="text-[10px] font-bold text-emerald-600 uppercase block mb-1">STAR Improved Version:</span>
                        <p className="font-mono text-[11px] leading-relaxed font-semibold">{item.improved_bullet}</p>
                      </div>
                    </div>

                    <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                      <div className="text-slate-600">
                        <span className="font-bold text-slate-700">Rationale: </span>
                        {item.improvement_rationale}
                      </div>

                      {item.action_verbs_used && item.action_verbs_used.length > 0 && (
                        <div className="flex items-center gap-1.5">
                          <span className="text-slate-400 font-bold text-[10px]">VERBS:</span>
                          {item.action_verbs_used.map((v) => (
                            <span key={v} className="px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 border border-purple-200 text-[10px] font-mono font-bold">
                              {v}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </Card>
                ))}

                {aiOptimizations.length === 0 && optimizedResume && (
                  <Card variant="default">
                    <CardHeader title="Deterministic ATS Optimizations" />
                    <pre className="p-4 rounded-xl clay-inset text-emerald-800 text-[11px] font-mono overflow-x-auto leading-relaxed border border-emerald-200 max-h-80 bg-emerald-50/30">
                      {optimizedResume.optimizedText}
                    </pre>
                  </Card>
                )}
              </div>
            </div>
          )}

          {/* TAB 5: RAW TEXT */}
          {activeTab === 'raw' && (
            <Card variant="default">
              <CardHeader title="Raw Extracted Document Text" subtitle={resumeData.fileName} />
              <pre className="p-4 rounded-2xl clay-inset text-slate-700 text-xs font-mono overflow-x-auto leading-relaxed border border-slate-200 max-h-[600px] bg-[#fffaf5]">
                {resumeData.rawText}
              </pre>
            </Card>
          )}

          {/* Resume Version History */}
          {resumeHistory.length > 0 && (
            <Card variant="default">
              <CardHeader title="Uploaded Resume Versions" subtitle="Stored securely in Cloud Storage & MongoDB Atlas" />
              <div className="space-y-2.5 text-xs">
                {resumeHistory.map((item) => (
                  <div
                    key={item.id}
                    className={`p-3.5 rounded-2xl border flex items-center justify-between gap-3 ${
                      item.is_active ? 'bg-orange-50/50 border-orange-200' : 'bg-white border-slate-200'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Clock className="w-4 h-4 text-[#E86144] shrink-0" />
                      <div className="min-w-0">
                        <span className="font-bold text-slate-900 truncate block">
                          {item.filename} (v{item.version})
                        </span>
                        <span className="text-[11px] text-slate-500">
                          Uploaded {new Date(item.uploaded_at).toLocaleDateString()} • ATS Score: {item.ats_score}%
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {item.is_active ? (
                        <Badge variant="brand" size="sm">Active</Badge>
                      ) : (
                        <Button
                          variant="white"
                          size="sm"
                          onClick={() => handleDeleteVersion(item.id)}
                        >
                          Delete
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      )}

      {/* MODAL 1: Paste Text */}
      <Modal
        isOpen={pasteModalOpen}
        onClose={() => setPasteModalOpen(false)}
        title="Paste Resume Text"
        subtitle="Paste plain text content from your resume for parsing and skill extraction."
      >
        <form onSubmit={handlePasteSubmit} className="space-y-4">
          <Textarea
            label="Resume Content"
            value={pastedText}
            onChange={(e) => setPastedText(e.target.value)}
            placeholder="Paste your education, skills, projects, and work experience here..."
            rows={10}
            required
          />
          <div className="flex justify-end gap-2">
            <Button variant="white" size="sm" type="button" onClick={() => setPasteModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" type="submit">
              Extract & Personalize
            </Button>
          </div>
        </form>
      </Modal>

      {/* MODAL 2: Add Skill */}
      <Modal
        isOpen={editSkillModalOpen}
        onClose={() => setEditSkillModalOpen(false)}
        title="Add Extracted Skill"
        subtitle="Add a verified technical skill to your inventory."
      >
        <form onSubmit={handleAddSkill} className="space-y-4">
          <Input
            label="Skill Name"
            value={newSkillName}
            onChange={(e) => setNewSkillName(e.target.value)}
            placeholder="e.g. Next.js, PyTorch, Kubernetes"
            required
          />
          <div className="flex justify-end gap-2">
            <Button variant="white" size="sm" type="button" onClick={() => setEditSkillModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" type="submit">
              Add Skill
            </Button>
          </div>
        </form>
      </Modal>

      {/* MODAL 3: Edit Profile */}
      <Modal
        isOpen={editProfileModalOpen}
        onClose={() => setEditProfileModalOpen(false)}
        title="Edit Candidate Academic Profile"
        subtitle="Update your name, college, degree, or CGPA stored in your profile."
      >
        <form onSubmit={handleSaveProfile} className="space-y-4">
          <Input
            label="Full Name"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            required
          />
          <Input
            label="College / Institution"
            value={editCollege}
            onChange={(e) => setEditCollege(e.target.value)}
          />
          <Input
            label="Degree & Branch"
            value={editDegree}
            onChange={(e) => setEditDegree(e.target.value)}
          />
          <Input
            label="CGPA (scale 0 - 10)"
            type="number"
            step="0.01"
            value={editCgpa}
            onChange={(e) => setEditCgpa(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <Button variant="white" size="sm" type="button" onClick={() => setEditProfileModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" type="submit">
              Save Academic Profile
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
