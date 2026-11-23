import React, { useState, useEffect } from 'react';
import {
  Briefcase,
  Search,
  Bookmark,
  CheckCircle2,
  ExternalLink,
  ShieldCheck,
  AlertTriangle,
  Sparkles,
  BookOpen,
  Filter,
  Layers,
  RefreshCw,
  Globe,
  Radio,
  Sliders,
  Clock,
  MapPin,
  Calendar,
  X,
  FileText,
  UserCheck,
} from 'lucide-react';
import { Button } from '../../../components/common/Button';
import { Badge } from '../../../components/common/Badge';
import { Input, Textarea } from '../../../components/common/Input';
import { Modal } from '../../../components/common/Modal';
import { ClayLoader } from '../../../components/common/ClayLoader';
import { EmptyState } from '../../../components/common/EmptyState';
import { useToast } from '../../../context/ToastContext';
import { useStudentData } from '../../../context/StudentDataContext';
import {
  jobService,
  type StudentJobPreferences,
  type JobApplicationTrackerItem,
} from '../../../services/jobService';
import type { JobPosting } from '../../../types';

type FeedTabId =
  | 'for_you'
  | 'latest'
  | 'internships'
  | 'full_time'
  | 'high_match'
  | 'remote'
  | 'saved'
  | 'applied';

const FEED_TABS: Array<{ id: FeedTabId; label: string; icon: React.FC<{ className?: string }> }> = [
  { id: 'for_you', label: 'For You', icon: Sparkles },
  { id: 'latest', label: 'Latest Discovered', icon: Clock },
  { id: 'internships', label: 'Internships', icon: Layers },
  { id: 'full_time', label: 'Full-Time', icon: Briefcase },
  { id: 'high_match', label: '75%+ High Match', icon: ShieldCheck },
  { id: 'remote', label: 'Remote Only', icon: Globe },
  { id: 'saved', label: 'Saved', icon: Bookmark },
  { id: 'applied', label: 'Tracked', icon: CheckCircle2 },
];

export const JobIntelligencePage: React.FC = () => {
  const { success, info, error } = useToast();
  const { refreshAll } = useStudentData();

  // Core Data State
  const [jobs, setJobs] = useState<JobPosting[]>([]);
  const [applications, setApplications] = useState<JobApplicationTrackerItem[]>([]);
  const [preferences, setPreferences] = useState<StudentJobPreferences | null>(null);

  // Filters & Navigation State
  const [feedTab, setFeedTab] = useState<FeedTabId>('for_you');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedWorkMode, setSelectedWorkMode] = useState<string>('All');
  const [selectedSource, setSelectedSource] = useState<string>('All');
  const [loading, setLoading] = useState(true);
  const [isScraping, setIsScraping] = useState(false);

  // Modals
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedJob, setSelectedJob] = useState<JobPosting | null>(null);

  const [preferencesModalOpen, setPreferencesModalOpen] = useState(false);
  const [savingPrefs, setSavingPrefs] = useState(false);

  // Preferences form state
  const [prefTargetTitles, setPrefTargetTitles] = useState('');
  const [prefCities, setPrefCities] = useState('');
  const [prefWorkModes, setPrefWorkModes] = useState<string[]>(['Remote', 'Hybrid', 'Onsite']);
  const [prefFresherMode, setPrefFresherMode] = useState('all');
  const [prefMinSalary, setPrefMinSalary] = useState('6.0');
  const [prefAlertThreshold, setPrefAlertThreshold] = useState<number>(60);
  const [prefExcludedCompanies, setPrefExcludedCompanies] = useState('');
  const [prefPreferredCompanies, setPrefPreferredCompanies] = useState('');

  // Application tracker modal state
  const [trackerModalOpen, setTrackerModalOpen] = useState(false);
  const [trackerJob, setTrackerJob] = useState<JobPosting | null>(null);
  const [trackerStatus, setTrackerStatus] = useState<string>('applied');
  const [trackerNotes, setTrackerNotes] = useState<string>('');
  const [trackerInterviewDate, setTrackerInterviewDate] = useState<string>('');
  const [savingTracker, setSavingTracker] = useState(false);

  const loadData = async (silent: boolean = false) => {
    if (!silent) setLoading(true);
    try {
      const [jobsData, appsData, prefsData] = await Promise.all([
        jobService.getJobs().catch(() => []),
        jobService.getApplications().catch(() => []),
        jobService.getPreferences().catch(() => null),
      ]);

      setJobs(jobsData || []);
      setApplications(appsData || []);

      if (prefsData) {
        setPreferences(prefsData);
        setPrefTargetTitles((prefsData.target_job_titles || []).join(', '));
        setPrefCities((prefsData.preferred_cities || []).join(', '));
        setPrefWorkModes(prefsData.work_modes || ['Remote', 'Hybrid', 'Onsite']);
        setPrefFresherMode(prefsData.fresher_or_experienced || 'all');
        setPrefMinSalary(prefsData.min_salary_lpa ? String(prefsData.min_salary_lpa) : '6.0');
        setPrefAlertThreshold(prefsData.alert_score_threshold ?? 60);
        setPrefExcludedCompanies((prefsData.excluded_companies || []).join(', '));
        setPrefPreferredCompanies((prefsData.preferred_companies || []).join(', '));
      }
    } catch (err: any) {
      error(err?.message || 'Unable to load job opportunities.');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleScrapeNow = async () => {
    setIsScraping(true);
    try {
      const result = await jobService.triggerLiveScrape();
      await loadData(true);
      await refreshAll();
      const discovered = result.total_discovered ?? 0;
      const added = result.total_added ?? 0;
      success(
        `Scrape completed! Discovered ${discovered} opportunities (${added} new additions) across Internshala, LinkedIn, Indeed & Firecrawl.`
      );
    } catch (err: any) {
      error(err?.message || 'Web scraping cycle encountered an issue.');
    } finally {
      setIsScraping(false);
    }
  };

  const handleToggleSave = async (e: React.MouseEvent, jobId: string) => {
    e.stopPropagation();
    try {
      const res = await jobService.toggleSaveJob(jobId);
      setJobs((prev) => prev.map((j) => (j.id === jobId ? { ...j, isSaved: res.is_saved } : j)));
      if (res.is_saved) {
        success('Job saved to your bookmarks.');
      } else {
        info('Job removed from bookmarks.');
      }
    } catch {
      error('Could not update saved job status.');
    }
  };

  const handleApply = async (job: JobPosting, openUrl: boolean = true) => {
    try {
      await jobService.trackJobClick(job.id, 'apply');
      await jobService.applyToJob(job.id);
      setJobs((prev) =>
        prev.map((j) => (j.id === job.id ? { ...j, isApplied: true, hasApplied: true } : j))
      );
      if (selectedJob && selectedJob.id === job.id) {
        setSelectedJob({ ...selectedJob, isApplied: true, hasApplied: true });
      }
      await refreshAll();
      success(`Application recorded for ${job.company}!`);

      if (openUrl && job.applicationUrl) {
        window.open(job.applicationUrl, '_blank', 'noopener,noreferrer');
      }
    } catch (err: any) {
      error(err?.message || 'Could not record application.');
    }
  };

  const handleViewListing = (e: React.MouseEvent, job: JobPosting) => {
    e.stopPropagation();
    jobService.trackJobClick(job.id, 'view_listing');
    const targetUrl = job.originalJobUrl || job.applicationUrl;
    if (targetUrl) {
      window.open(targetUrl, '_blank', 'noopener,noreferrer');
    } else {
      info('Direct listing URL not available for this role.');
    }
  };

  const handleOpenTracker = (e: React.MouseEvent, job: JobPosting) => {
    e.stopPropagation();
    setTrackerJob(job);
    const existing = applications.find((a) => a.job_id === job.id);
    setTrackerStatus(existing?.status || (job.hasApplied ? 'applied' : 'interested'));
    setTrackerNotes(existing?.notes || '');
    setTrackerInterviewDate(existing?.interview_date || '');
    setTrackerModalOpen(true);
  };

  const handleSaveTracker = async () => {
    if (!trackerJob) return;
    setSavingTracker(true);
    try {
      await jobService.updateApplicationStatus(trackerJob.id, {
        status: trackerStatus,
        notes: trackerNotes.trim() || undefined,
        interview_date: trackerInterviewDate || undefined,
      });

      setJobs((prev) =>
        prev.map((j) =>
          j.id === trackerJob.id ? { ...j, hasApplied: true, isApplied: true } : j
        )
      );

      await loadData(true);
      await refreshAll();
      success(`Updated application stage to '${trackerStatus}'!`);
      setTrackerModalOpen(false);
    } catch (err: any) {
      error(err?.message || 'Failed to update application tracker.');
    } finally {
      setSavingTracker(false);
    }
  };

  const handleSavePreferences = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingPrefs(true);
    try {
      const payload: Partial<StudentJobPreferences> = {
        target_job_titles: prefTargetTitles
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        preferred_cities: prefCities
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        work_modes: prefWorkModes,
        fresher_or_experienced: prefFresherMode,
        min_salary_lpa: parseFloat(prefMinSalary) || 6.0,
        alert_score_threshold: prefAlertThreshold,
        excluded_companies: prefExcludedCompanies
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        preferred_companies: prefPreferredCompanies
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      };

      await jobService.updatePreferences(payload);
      await loadData(true);
      await refreshAll();
      success('Preferences saved! Job match percentages recalculated.');
      setPreferencesModalOpen(false);
    } catch (err: any) {
      error(err?.message || 'Could not update preferences.');
    } finally {
      setSavingPrefs(false);
    }
  };

  const getSourceDisplayName = (job: JobPosting) => {
    const s = (job.sourceName || job.sourceType || '').toLowerCase();
    if (s.includes('internshala')) return 'Internshala';
    if (s.includes('linkedin')) return 'LinkedIn';
    if (s.includes('indeed')) return 'Indeed';
    if (s.includes('firecrawl')) return 'Firecrawl';
    if (s.includes('greenhouse')) return 'Greenhouse';
    if (s.includes('lever')) return 'Lever';
    if (s.includes('remotive')) return 'Remotive';
    return 'Direct';
  };

  const getSourceBadgeStyle = (job: JobPosting) => {
    const s = (job.sourceName || job.sourceType || '').toLowerCase();
    if (s.includes('internshala')) return 'bg-sky-50 text-sky-700 border-sky-200';
    if (s.includes('linkedin')) return 'bg-blue-50 text-blue-700 border-blue-200';
    if (s.includes('indeed')) return 'bg-indigo-50 text-indigo-700 border-indigo-200';
    if (s.includes('firecrawl')) return 'bg-orange-50 text-orange-700 border-orange-200';
    return 'bg-slate-100 text-slate-700 border-slate-200';
  };

  // Tab Filtering & Sorting
  const filtered = jobs.filter((job) => {
    // Feed Tab Filters
    if (feedTab === 'saved' && !job.isSaved) return false;
    if (feedTab === 'applied' && !job.hasApplied) return false;
    if (feedTab === 'remote' && job.workMode?.toLowerCase() !== 'remote') return false;
    if (feedTab === 'high_match' && (job.matchScore ?? 0) < 75) return false;
    if (feedTab === 'internships') {
      const isIntern =
        (job.employmentType || '').toLowerCase().includes('intern') ||
        job.role.toLowerCase().includes('intern') ||
        job.role.toLowerCase().includes('trainee');
      if (!isIntern) return false;
    }
    if (feedTab === 'full_time') {
      const isFull =
        (job.employmentType || '').toLowerCase().includes('full') &&
        !job.role.toLowerCase().includes('intern');
      if (!isFull) return false;
    }

    // Work Mode Filter
    if (selectedWorkMode !== 'All' && job.workMode?.toLowerCase() !== selectedWorkMode.toLowerCase()) {
      return false;
    }

    // Channel Filter
    if (selectedSource !== 'All') {
      const srcName = getSourceDisplayName(job).toLowerCase();
      if (!srcName.includes(selectedSource.toLowerCase())) return false;
    }

    // Search Query Filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchText =
        job.company.toLowerCase().includes(q) ||
        job.role.toLowerCase().includes(q) ||
        job.location.toLowerCase().includes(q) ||
        (job.sourceName || '').toLowerCase().includes(q) ||
        job.techStack.some((t) => t.toLowerCase().includes(q));
      if (!matchText) return false;
    }

    return true;
  });

  // Sort based on Tab
  const sortedJobs = [...filtered].sort((a, b) => {
    if (feedTab === 'latest') {
      const dateA = a.postedDate ? new Date(a.postedDate).getTime() : 0;
      const dateB = b.postedDate ? new Date(b.postedDate).getTime() : 0;
      return dateB - dateA;
    }
    // Default 'for_you' and others sort by matchScore
    return (b.matchScore ?? 0) - (a.matchScore ?? 0);
  });

  // Calculate Summary Counts
  const countHighMatch = jobs.filter((j) => (j.matchScore ?? 0) >= 75).length;
  const countInternships = jobs.filter(
    (j) =>
      (j.employmentType || '').toLowerCase().includes('intern') ||
      j.role.toLowerCase().includes('intern')
  ).length;
  const countRemote = jobs.filter((j) => j.workMode?.toLowerCase() === 'remote').length;
  const countSaved = jobs.filter((j) => j.isSaved).length;
  const countApplied = jobs.filter((j) => j.hasApplied).length;

  if (loading) {
    return <ClayLoader label="Ranking Job Intelligence Matches..." />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              Job Intelligence & Autonomous Matching
            </h1>
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
              <Radio className="w-3 h-3 text-emerald-500 animate-pulse" />
              Live Continuous Engine
            </span>
          </div>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Harvesting from Internshala, LinkedIn, Indeed & Firecrawl AI. Proctored skill assessments strictly outrank unverified resume mentions.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="white"
            size="sm"
            leftIcon={<Sliders className="w-3.5 h-3.5 text-orange-500" />}
            onClick={() => setPreferencesModalOpen(true)}
          >
            Preferences & Alerts
          </Button>

          <Button
            variant="primary"
            size="sm"
            disabled={isScraping}
            leftIcon={<RefreshCw className={`w-3.5 h-3.5 ${isScraping ? 'animate-spin' : ''}`} />}
            onClick={handleScrapeNow}
            className="shadow-xs"
          >
            {isScraping ? 'Scraping Live...' : 'Scrape Web Now'}
          </Button>
        </div>
      </div>

      {/* Dashboard Summary Counters Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="clay-card p-3 bg-white border border-slate-200/90 text-center">
          <p className="text-[10px] uppercase font-bold text-slate-400">Total Harvested</p>
          <p className="text-xl font-black text-slate-900 font-mono mt-0.5">{jobs.length}</p>
        </div>
        <div className="clay-card p-3 bg-white border border-emerald-200 text-center">
          <p className="text-[10px] uppercase font-bold text-emerald-600">High Match (&gt;75%)</p>
          <p className="text-xl font-black text-emerald-700 font-mono mt-0.5">{countHighMatch}</p>
        </div>
        <div className="clay-card p-3 bg-white border border-sky-200 text-center">
          <p className="text-[10px] uppercase font-bold text-sky-600">Internships</p>
          <p className="text-xl font-black text-sky-700 font-mono mt-0.5">{countInternships}</p>
        </div>
        <div className="clay-card p-3 bg-white border border-indigo-200 text-center">
          <p className="text-[10px] uppercase font-bold text-indigo-600">Remote Roles</p>
          <p className="text-xl font-black text-indigo-700 font-mono mt-0.5">{countRemote}</p>
        </div>
        <div className="clay-card p-3 bg-white border border-amber-200 text-center">
          <p className="text-[10px] uppercase font-bold text-amber-600">Saved</p>
          <p className="text-xl font-black text-amber-700 font-mono mt-0.5">{countSaved}</p>
        </div>
        <div className="clay-card p-3 bg-white border border-purple-200 text-center">
          <p className="text-[10px] uppercase font-bold text-purple-600">Tracked</p>
          <p className="text-xl font-black text-purple-700 font-mono mt-0.5">{countApplied}</p>
        </div>
      </div>

      {/* Live Scraping Engine Telemetry Bar */}
      <div className="p-4 rounded-3xl bg-gradient-to-r from-orange-50/70 via-white to-amber-50/60 border border-orange-200/90 shadow-2xs flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-[#FF7A59] to-[#E86144] text-white flex items-center justify-center shrink-0 shadow-xs">
            <Globe className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-900">Continuous Multi-Channel Job Scraper</span>
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
            </div>
            <p className="text-[11px] text-slate-500">
              Active feeds: <strong className="text-slate-700">Internshala</strong> (Internships & SDE),{' '}
              <strong className="text-slate-700">LinkedIn</strong> (Software Engineering),{' '}
              <strong className="text-slate-700">Indeed</strong> & <strong className="text-slate-700">Firecrawl AI</strong>.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono text-slate-600 self-end md:self-auto">
          <span className="px-2.5 py-1 rounded-xl bg-white border border-orange-100 font-bold text-[#E86144]">
            {jobs.length} Opportunities Harvested
          </span>
        </div>
      </div>

      {/* Job Feed Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
        {FEED_TABS.map((tab) => {
          const Icon = tab.icon;
          const active = feedTab === tab.id;
          let count = 0;
          if (tab.id === 'for_you') count = jobs.length;
          else if (tab.id === 'latest') count = jobs.length;
          else if (tab.id === 'internships') count = countInternships;
          else if (tab.id === 'full_time') count = jobs.length - countInternships;
          else if (tab.id === 'high_match') count = countHighMatch;
          else if (tab.id === 'remote') count = countRemote;
          else if (tab.id === 'saved') count = countSaved;
          else if (tab.id === 'applied') count = countApplied;

          return (
            <button
              key={tab.id}
              onClick={() => setFeedTab(tab.id)}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-2xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                active
                  ? 'bg-gradient-to-r from-[#FF7A59] to-[#E86144] text-white shadow-xs scale-102'
                  : 'bg-white text-slate-600 hover:text-slate-900 border border-slate-200/80 hover:border-orange-200'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${active ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'}`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Filter Toolbar */}
      <div className="clay-card p-4 bg-white border border-orange-200/80 space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <Input
              placeholder="Search companies, roles, locations, or skills (e.g. React, Python, Swiggy, Remote)..."
              leftIcon={<Search className="w-4 h-4 text-orange-500" />}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={selectedWorkMode}
              onChange={(e) => setSelectedWorkMode(e.target.value)}
              className="bg-orange-50/60 border border-orange-200 rounded-xl text-xs text-slate-800 font-bold p-2.5 cursor-pointer shadow-2xs"
            >
              <option value="All">All Work Modes</option>
              <option value="Remote">Remote</option>
              <option value="Hybrid">Hybrid</option>
              <option value="Onsite">Onsite</option>
            </select>
          </div>
        </div>

        {/* Source Channel Filter Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-100">
          <span className="text-xs font-bold text-slate-500 mr-2 flex items-center gap-1">
            <Filter className="w-3.5 h-3.5 text-orange-500" /> Channel:
          </span>
          {['All', 'Internshala', 'LinkedIn', 'Indeed', 'Firecrawl', 'Greenhouse', 'Lever'].map((src) => {
            const count =
              src === 'All'
                ? jobs.length
                : jobs.filter((j) => getSourceDisplayName(j).toLowerCase().includes(src.toLowerCase())).length;
            const active = selectedSource === src;
            return (
              <button
                key={src}
                onClick={() => setSelectedSource(src)}
                className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  active
                    ? 'bg-gradient-to-r from-[#FF7A59] to-[#E86144] text-white shadow-xs'
                    : 'bg-orange-50/60 text-slate-600 hover:bg-orange-100 hover:text-slate-900 border border-orange-100/80'
                }`}
              >
                {src} {count > 0 && <span className="text-[10px] opacity-80">({count})</span>}
              </button>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-4 text-[11px] text-slate-500 font-medium pt-2 border-t border-slate-100">
          <span className="font-bold text-slate-700">Skill Competency Legend:</span>
          <span className="flex items-center gap-1 text-emerald-700 font-semibold">
            <ShieldCheck className="w-3.5 h-3.5" /> Verified by Assessment (40% Weight)
          </span>
          <span className="flex items-center gap-1 text-amber-700 font-semibold">
            <BookOpen className="w-3.5 h-3.5" /> Resume Text Mention (25% Weight)
          </span>
          <span className="flex items-center gap-1 text-slate-400 font-semibold">Missing Competency</span>
        </div>
      </div>

      {/* Jobs Grid */}
      {sortedJobs.length === 0 ? (
        <EmptyState
          title="No matching job openings found"
          description="Try triggering 'Scrape Web Now' or adjusting your channel and keyword filters to discover opportunities."
          icon={<Briefcase className="w-8 h-8 text-[#E86144]" />}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {sortedJobs.map((job) => {
            const verifiedSkills = job.verifiedMatchedSkills || [];
            const resumeSkills = job.resumeSkillsMatched || [];
            const missingSkills = job.missingSkills || [];
            const matchScore = job.matchScore ?? 0;
            const sourceDisplay = getSourceDisplayName(job);
            const sourceStyle = getSourceBadgeStyle(job);

            const scoreBadgeColor =
              matchScore >= 75
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : matchScore >= 50
                ? 'bg-amber-50 text-amber-800 border-amber-200'
                : 'bg-slate-50 text-slate-700 border-slate-200';

            const appRecord = applications.find((a) => a.job_id === job.id);

            return (
              <div
                key={job.id}
                className="clay-card p-5 bg-white border border-slate-200/90 hover:border-orange-300 hover:shadow-md cursor-pointer transition-all flex flex-col justify-between"
                onClick={() => {
                  setSelectedJob(job);
                  setDetailModalOpen(true);
                }}
              >
                <div>
                  {/* Top Bar: Company, Initials, Match Badge, Save */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-11 h-11 rounded-2xl font-bold flex items-center justify-center text-white shrink-0 shadow-md text-sm"
                        style={{ backgroundColor: job.companyColor }}
                      >
                        {job.companyInitials}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-sm font-bold text-slate-900">{job.company}</h3>
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${sourceStyle}`}
                          >
                            {sourceDisplay} Scraped
                          </span>
                        </div>
                        <p className="text-xs text-slate-700 font-semibold">{job.role}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-mono font-bold px-2.5 py-0.5 rounded-full border ${scoreBadgeColor}`}>
                        {matchScore}% Match
                      </span>
                      <button
                        onClick={(e) => handleToggleSave(e, job.id)}
                        className="p-1.5 text-slate-400 hover:text-amber-500 rounded-lg hover:bg-orange-50 transition-colors cursor-pointer"
                        title={job.isSaved ? 'Remove Bookmark' : 'Bookmark Job'}
                      >
                        <Bookmark className={`w-4 h-4 ${job.isSaved ? 'text-amber-500 fill-amber-500' : ''}`} />
                      </button>
                    </div>
                  </div>

                  {/* Metadata Row */}
                  <div className="flex flex-wrap items-center gap-2 mt-3 text-[11px] text-slate-500 font-medium">
                    <span className="font-mono text-slate-900 font-bold">
                      {job.salaryLabel || `₹${job.ctcMin}-${job.ctcMax} LPA`}
                    </span>
                    <span>•</span>
                    <span className="flex items-center gap-0.5">
                      <MapPin className="w-3 h-3 text-slate-400" />
                      {job.location}
                    </span>
                    <span>•</span>
                    <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-bold">
                      {job.workMode}
                    </span>
                    {job.employmentType && (
                      <>
                        <span>•</span>
                        <span className="text-slate-600 font-semibold">{job.employmentType}</span>
                      </>
                    )}
                  </div>

                  {/* Description preview */}
                  <p className="text-xs text-slate-600 mt-2.5 line-clamp-2 leading-relaxed font-medium">
                    {job.description}
                  </p>

                  {/* Skills Grid */}
                  <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-slate-100">
                    {verifiedSkills.slice(0, 3).map((tech) => (
                      <span
                        key={tech}
                        className="inline-flex items-center gap-1 text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200"
                        title="Verified by Proctored Assessment"
                      >
                        <ShieldCheck className="w-3 h-3 text-emerald-600" />
                        {tech}
                      </span>
                    ))}
                    {resumeSkills.slice(0, 3).map((tech) => (
                      <span
                        key={tech}
                        className="inline-flex items-center gap-1 text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200"
                        title="Mentioned in Resume Text (Unverified)"
                      >
                        <BookOpen className="w-3 h-3 text-amber-600" />
                        {tech}
                      </span>
                    ))}
                    {missingSkills.slice(0, 2).map((tech) => (
                      <span
                        key={tech}
                        className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-slate-50 text-slate-400 border border-dashed border-slate-200"
                        title="Required by Job, missing from candidate"
                      >
                        +{tech}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Footer Bar */}
                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2 flex-wrap">
                  <div className="text-[11px] font-medium text-slate-400">
                    {job.roleRelevanceSummary ? (
                      <span className="line-clamp-1 max-w-[160px]" title={job.roleRelevanceSummary}>
                        {job.roleRelevanceSummary}
                      </span>
                    ) : (
                      <span>{job.techStack.length} skills required</span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Stage Tracker Button */}
                    <button
                      onClick={(e) => handleOpenTracker(e, job)}
                      className="px-2.5 py-1 rounded-xl bg-orange-50 text-[#E86144] border border-orange-200 text-xs font-bold hover:bg-orange-100 transition-colors cursor-pointer flex items-center gap-1"
                      title="Update application lifecycle stage"
                    >
                      <UserCheck className="w-3 h-3" />
                      {appRecord?.status ? `Stage: ${appRecord.status}` : 'Track Stage'}
                    </button>

                    {job.applicationUrl && (
                      <Button
                        variant="white"
                        size="sm"
                        className="text-xs"
                        leftIcon={<ExternalLink className="w-3 h-3" />}
                        onClick={(e) => handleViewListing(e, job)}
                      >
                        Listing
                      </Button>
                    )}

                    <Button
                      variant="primary"
                      size="sm"
                      className="text-xs"
                      rightIcon={<ExternalLink className="w-3 h-3 ml-0.5" />}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleApply(job, true);
                      }}
                    >
                      {job.applicationUrl ? `Apply on ${sourceDisplay}` : 'Apply'}
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Explainable Match Detail Modal */}
      {selectedJob && (
        <Modal
          isOpen={detailModalOpen}
          onClose={() => setDetailModalOpen(false)}
          title={`${selectedJob.company} — ${selectedJob.role}`}
          subtitle={`Match Score: ${selectedJob.matchScore ?? 0}% | Scraped from ${getSourceDisplayName(selectedJob)} | ${selectedJob.location} (${selectedJob.workMode})`}
          size="lg"
        >
          <div className="space-y-4 text-xs font-medium">
            {/* 5-Formula Breakdown Header */}
            <div className="p-4 rounded-2xl bg-orange-50/50 border border-orange-200">
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-slate-900 text-sm">Explainable Match Breakdown</span>
                <span className="text-xs font-mono font-bold text-orange-700 bg-white px-3 py-1 rounded-full border border-orange-200 shadow-2xs">
                  {selectedJob.matchScore ?? 0}% Fit
                </span>
              </div>
              <p className="text-[11px] text-slate-600 mb-3">
                {selectedJob.roleRelevanceSummary ||
                  'Ground-truth multi-factor match based on your verified credentials and resume analysis.'}
              </p>

              {/* Component Bar */}
              {selectedJob.formulaBreakdown && (
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-2 border-t border-orange-200/60 text-center">
                  <div className="p-2 rounded-xl bg-white border border-emerald-200">
                    <p className="text-[10px] text-slate-500 font-bold uppercase">Verified (40%)</p>
                    <p className="text-sm font-black text-emerald-700 font-mono">
                      {selectedJob.formulaBreakdown.verified_skills_component ?? 0}
                    </p>
                  </div>
                  <div className="p-2 rounded-xl bg-white border border-amber-200">
                    <p className="text-[10px] text-slate-500 font-bold uppercase">Resume (25%)</p>
                    <p className="text-sm font-black text-amber-700 font-mono">
                      {selectedJob.formulaBreakdown.resume_skills_component ?? 0}
                    </p>
                  </div>
                  <div className="p-2 rounded-xl bg-white border border-blue-200">
                    <p className="text-[10px] text-slate-500 font-bold uppercase">Role (15%)</p>
                    <p className="text-sm font-black text-blue-700 font-mono">
                      {selectedJob.formulaBreakdown.role_alignment_component ?? 0}
                    </p>
                  </div>
                  <div className="p-2 rounded-xl bg-white border border-slate-200">
                    <p className="text-[10px] text-slate-500 font-bold uppercase">Location (10%)</p>
                    <p className="text-sm font-black text-slate-700 font-mono">
                      {selectedJob.formulaBreakdown.location_fit_component ?? 0}
                    </p>
                  </div>
                  <div className="p-2 rounded-xl bg-white border border-slate-200">
                    <p className="text-[10px] text-slate-500 font-bold uppercase">Academic (10%)</p>
                    <p className="text-sm font-black text-slate-700 font-mono">
                      {selectedJob.formulaBreakdown.academic_eligibility_component ?? 0}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Direct Web Source Bar */}
            {selectedJob.applicationUrl && (
              <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-bold text-slate-700 block">Original Scraped URL</span>
                  <span className="text-[10px] font-mono text-slate-500 break-all">{selectedJob.applicationUrl}</span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0 text-xs ml-3"
                  rightIcon={<ExternalLink className="w-3.5 h-3.5" />}
                  onClick={() => window.open(selectedJob.applicationUrl, '_blank', 'noopener,noreferrer')}
                >
                  Visit Scraped URL
                </Button>
              </div>
            )}

            {/* Eligibility Warnings */}
            {selectedJob.eligibilityConcerns && selectedJob.eligibilityConcerns.length > 0 && (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">Eligibility Advisory:</p>
                  <ul className="list-disc list-inside mt-0.5 space-y-0.5">
                    {selectedJob.eligibilityConcerns.map((ec, idx) => (
                      <li key={idx}>{ec}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {/* Description */}
            <div>
              <h4 className="font-bold text-slate-900 mb-1">Role Description</h4>
              <p className="text-slate-600 leading-relaxed bg-slate-50 p-3 rounded-xl border border-slate-100 max-h-48 overflow-y-auto">
                {selectedJob.description}
              </p>
            </div>

            {/* Skills Taxonomy */}
            <div className="space-y-2">
              <h4 className="font-bold text-slate-900">Skill Competency Alignment</h4>

              {/* Verified */}
              {(selectedJob.verifiedMatchedSkills || []).length > 0 && (
                <div className="p-2.5 rounded-xl bg-emerald-50/60 border border-emerald-200">
                  <p className="text-[11px] font-bold text-emerald-900 mb-1 flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                    Verified Skills (Proven via Assessments):
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {selectedJob.verifiedMatchedSkills!.map((s) => (
                      <span key={s} className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-mono text-[10px] font-bold">
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Resume Mentioned */}
              {(selectedJob.resumeSkillsMatched || []).length > 0 && (
                <div className="p-2.5 rounded-xl bg-amber-50/60 border border-amber-200">
                  <p className="text-[11px] font-bold text-amber-900 mb-1 flex items-center gap-1">
                    <BookOpen className="w-3.5 h-3.5 text-amber-600" />
                    Resume-Mentioned Skills (Unverified):
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {selectedJob.resumeSkillsMatched!.map((s) => (
                      <span key={s} className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-mono text-[10px] font-bold">
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Missing */}
              {(selectedJob.missingSkills || []).length > 0 && (
                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                  <p className="text-[11px] font-bold text-slate-700 mb-1">
                    Missing Skill Gaps to Address:
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {selectedJob.missingSkills!.map((s) => (
                      <span key={s} className="px-2 py-0.5 rounded bg-slate-200 text-slate-700 font-mono text-[10px] font-bold">
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="pt-4 border-t border-orange-100 flex items-center justify-between">
              <Button variant="ghost" size="sm" onClick={() => setDetailModalOpen(false)}>
                Close
              </Button>

              <div className="flex items-center gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  rightIcon={<ExternalLink className="w-3.5 h-3.5 ml-1" />}
                  onClick={() => handleApply(selectedJob, true)}
                >
                  {selectedJob.hasApplied
                    ? `Open ${getSourceDisplayName(selectedJob)} Page`
                    : `Apply on ${getSourceDisplayName(selectedJob)}`}
                </Button>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* Preferences & Early Alert Filters Modal */}
      <Modal
        isOpen={preferencesModalOpen}
        onClose={() => setPreferencesModalOpen(false)}
        title="Job Preferences & Early Alert Engine"
        subtitle="Configure target job titles, preferred locations, and minimum alert thresholds"
        size="lg"
      >
        <form onSubmit={handleSavePreferences} className="space-y-4 text-xs font-medium">
          <div>
            <label className="block text-xs font-bold text-slate-800 mb-1">
              Target Job Roles &amp; Titles (comma-separated)
            </label>
            <Input
              value={prefTargetTitles}
              onChange={(e) => setPrefTargetTitles(e.target.value)}
              placeholder="e.g. Frontend Developer, Backend Engineer, SDE Intern"
            />
            <p className="text-[11px] text-slate-400 mt-0.5">Used to compute role alignment scoring.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1">
                Preferred Cities (comma-separated)
              </label>
              <Input
                value={prefCities}
                onChange={(e) => setPrefCities(e.target.value)}
                placeholder="e.g. Bengaluru, Hyderabad, Pune, Remote"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1">
                Minimum Target CTC (LPA)
              </label>
              <Input
                type="number"
                step="0.5"
                value={prefMinSalary}
                onChange={(e) => setPrefMinSalary(e.target.value)}
                placeholder="6.0"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1">Experience Focus</label>
              <select
                value={prefFresherMode}
                onChange={(e) => setPrefFresherMode(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 font-bold"
              >
                <option value="all">All Levels (Fresher + Experienced)</option>
                <option value="fresher">Fresher / Internships Priority</option>
                <option value="experienced">Experienced Roles</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1">
                Early Notification Score Threshold: {prefAlertThreshold}%
              </label>
              <input
                type="range"
                min="50"
                max="90"
                step="5"
                value={prefAlertThreshold}
                onChange={(e) => setPrefAlertThreshold(parseInt(e.target.value, 10))}
                className="w-full accent-orange-500 cursor-pointer mt-2"
              />
              <div className="flex justify-between text-[10px] text-slate-400">
                <span>50% (More alerts)</span>
                <span>75% (Recommended)</span>
                <span>90% (Strict)</span>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-800 mb-1">
              Work Modes of Interest
            </label>
            <div className="flex gap-4">
              {['Remote', 'Hybrid', 'Onsite'].map((mode) => (
                <label key={mode} className="flex items-center gap-2 cursor-pointer text-xs text-slate-700">
                  <input
                    type="checkbox"
                    checked={prefWorkModes.includes(mode)}
                    onChange={(e) => {
                      if (e.target.checked) setPrefWorkModes([...prefWorkModes, mode]);
                      else setPrefWorkModes(prefWorkModes.filter((m) => m !== mode));
                    }}
                    className="rounded border-slate-300 text-orange-600 focus:ring-orange-500"
                  />
                  {mode}
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-800 mb-1">
              Excluded Companies (Never alert me about these)
            </label>
            <Input
              value={prefExcludedCompanies}
              onChange={(e) => setPrefExcludedCompanies(e.target.value)}
              placeholder="e.g. UnwantedCorp, LegacyTech"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-800 mb-1">
              Preferred Target Companies (+5% Bonus Match)
            </label>
            <Input
              value={prefPreferredCompanies}
              onChange={(e) => setPrefPreferredCompanies(e.target.value)}
              placeholder="e.g. Google, Microsoft, Swiggy, Flipkart"
            />
          </div>

          <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setPreferencesModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" type="submit" disabled={savingPrefs}>
              {savingPrefs ? 'Recalculating Fits...' : 'Save & Recalculate Matches'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Application Lifecycle Tracker Modal */}
      {trackerJob && (
        <Modal
          isOpen={trackerModalOpen}
          onClose={() => setTrackerModalOpen(false)}
          title={`Application Tracker: ${trackerJob.company}`}
          subtitle={`Manage lifecycle stage and interview notes for ${trackerJob.role}`}
          size="md"
        >
          <div className="space-y-4 text-xs font-medium">
            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1">Current Lifecycle Stage</label>
              <select
                value={trackerStatus}
                onChange={(e) => setTrackerStatus(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 font-bold"
              >
                <option value="interested">Interested (Researching)</option>
                <option value="saved">Bookmarked</option>
                <option value="applied">Applied (Submitted on Site)</option>
                <option value="assessment_received">Online Assessment Received</option>
                <option value="interview">Interview Scheduled</option>
                <option value="selected">Offer Received 🎉</option>
                <option value="rejected">Rejected / Closed</option>
                <option value="withdrawn">Withdrawn</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1">Next Interview / Due Date</label>
              <Input
                type="date"
                value={trackerInterviewDate}
                onChange={(e) => setTrackerInterviewDate(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1">Personal Application Notes</label>
              <Textarea
                rows={3}
                value={trackerNotes}
                onChange={(e) => setTrackerNotes(e.target.value)}
                placeholder="e.g. Recruiter message via LinkedIn; coding assessment due Friday; practiced sliding window and FastAPI."
              />
            </div>

            <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
              <Button variant="ghost" size="sm" onClick={() => setTrackerModalOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" disabled={savingTracker} onClick={handleSaveTracker}>
                {savingTracker ? 'Saving Stage...' : 'Update Application Stage'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
