import React, { useState, useEffect } from 'react';
import {
  Building,
  Plus,
  Search,
  ExternalLink,
  Trash2,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  Database,
  Layers,
  Activity,
  Play,
  Clock,
  Briefcase,
  Sliders,
  Cpu,
  Server,
  Zap,
  Radio,
  Bell,
  Megaphone,
  Send,
} from 'lucide-react';
import { Button } from '../../../components/common/Button';
import { Badge } from '../../../components/common/Badge';
import { Modal } from '../../../components/common/Modal';
import { Input, Textarea } from '../../../components/common/Input';
import { Select } from '../../../components/common/Select';
import { ClayLoader } from '../../../components/common/ClayLoader';
import { EmptyState } from '../../../components/common/EmptyState';
import { useToast } from '../../../context/ToastContext';
import {
  jobService,
  type JobSource,
  type JobSyncRun,
  type JobIngestionStats,
  type WorkerHealthInfo,
} from '../../../services/jobService';
import {
  notificationService,
  type NotificationStatsResponse,
} from '../../../services/notificationService';
import type { JobPosting } from '../../../types';

export const JobManagementPage: React.FC = () => {
  const { success, info, error } = useToast();
  const [activeTab, setActiveTab] = useState<'drives' | 'sources' | 'history' | 'workers' | 'notifications'>('drives');
  const [loading, setLoading] = useState(true);

  // Data states
  const [jobs, setJobs] = useState<JobPosting[]>([]);
  const [sources, setSources] = useState<JobSource[]>([]);
  const [syncHistory, setSyncHistory] = useState<JobSyncRun[]>([]);
  const [stats, setStats] = useState<JobIngestionStats | null>(null);
  const [workerHealth, setWorkerHealth] = useState<WorkerHealthInfo | null>(null);
  const [notifStats, setNotifStats] = useState<NotificationStatsResponse | null>(null);

  // Modals & Action states
  const [addJobModalOpen, setAddJobModalOpen] = useState(false);
  const [addSourceModalOpen, setAddSourceModalOpen] = useState(false);
  const [syncingAll, setSyncingAll] = useState(false);
  const [syncingSourceId, setSyncingSourceId] = useState<string | null>(null);

  // Broadcast state
  const [announceTitle, setAnnounceTitle] = useState('');
  const [announceMessage, setAnnounceMessage] = useState('');
  const [announceRole, setAnnounceRole] = useState('STUDENT');
  const [announceBranch, setAnnounceBranch] = useState('ALL');
  const [announceBatch, setAnnounceBatch] = useState('ALL');
  const [announceUrl, setAnnounceUrl] = useState('');
  const [sendingBroadcast, setSendingBroadcast] = useState(false);

  // New Placement Drive Form state
  const [company, setCompany] = useState('');
  const [role, setRole] = useState('');
  const [category, setCategory] = useState<any>('Full Stack');
  const [location, setLocation] = useState('Bangalore');
  const [workMode, setWorkMode] = useState<any>('Hybrid');
  const [ctcMin, setCtcMin] = useState('20');
  const [ctcMax, setCtcMax] = useState('30');
  const [minCGPA, setMinCGPA] = useState('7.5');
  const [techStackStr, setTechStackStr] = useState('React, TypeScript, Go, PostgreSQL, Docker');
  const [description, setDescription] = useState('');

  // New Job Source Form state
  const [sourceName, setSourceName] = useState('');
  const [sourceType, setSourceType] = useState<string>('greenhouse');
  const [endpointUrl, setEndpointUrl] = useState('');
  const [boardToken, setBoardToken] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [syncInterval, setSyncInterval] = useState('60');

  const loadAllData = async () => {
    try {
      const [jobsData, sourcesData, historyData, statsData, healthData, notifStatsData] = await Promise.all([
        jobService.getJobs().catch(() => []),
        jobService.getJobSources().catch(() => []),
        jobService.getSyncHistory(20).catch(() => []),
        jobService.getJobIngestionStats().catch(() => null),
        jobService.getWorkerHealth().catch(() => null),
        notificationService.getAdminStats().catch(() => null),
      ]);
      setJobs(jobsData || []);
      setSources(sourcesData || []);
      setSyncHistory(historyData || []);
      setStats(statsData);
      setWorkerHealth(healthData);
      setNotifStats(notifStatsData);
    } catch (err: any) {
      error(err?.message || 'Error loading job discovery data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllData();
  }, []);

  const handleSendBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!announceTitle.trim() || !announceMessage.trim()) {
      error('Announcement title and message are required.');
      return;
    }
    setSendingBroadcast(true);
    try {
      const res = await notificationService.sendAnnouncement({
        title: announceTitle.trim(),
        message: announceMessage.trim(),
        target_role: announceRole,
        target_branch: announceBranch,
        target_batch: announceBatch,
        action_url: announceUrl.trim() || undefined,
      });
      success(`Announcement dispatched to ${res.details?.recipients_count || 0} students!`);
      setAnnounceTitle('');
      setAnnounceMessage('');
      setAnnounceUrl('');
      const updated = await notificationService.getAdminStats().catch(() => null);
      setNotifStats(updated);
    } catch (err: any) {
      error(err?.data?.detail || err.message || 'Failed to dispatch broadcast');
    } finally {
      setSendingBroadcast(false);
    }
  };

  const handleCreateJob = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!company.trim() || !role.trim()) return;

    try {
      await jobService.createJob({
        company,
        role,
        location,
        workMode,
        salary: `${ctcMin || 15} - ${ctcMax || 25} LPA`,
        techStack: techStackStr
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        description:
          description ||
          `${category} engineering role focused on scalable services and production architecture.`,
        eligibility: `CGPA ${minCGPA || '7.0'}+ • 2025/2026 Graduates`,
        original_apply_url: 'https://placements.edu/apply',
      });

      success(`Job opening posted for ${company} (${role})!`);
      setAddJobModalOpen(false);
      await loadAllData();
    } catch (err: any) {
      error(err?.message || 'Could not post placement drive');
    }
  };

  const handleCreateSource = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sourceName.trim()) return;

    try {
      const requiresAuth = sourceType.includes('enterprise');
      await jobService.createJobSource({
        name: sourceName,
        source_type: sourceType,
        endpoint_url: endpointUrl || undefined,
        board_token: boardToken || undefined,
        api_key: apiKey || undefined,
        sync_interval_minutes: parseInt(syncInterval, 10) || 60,
        requires_auth: requiresAuth,
      });

      success(`Authorized source '${sourceName}' created!`);
      setAddSourceModalOpen(false);
      setSourceName('');
      setEndpointUrl('');
      setBoardToken('');
      setApiKey('');
      await loadAllData();
    } catch (err: any) {
      error(err?.message || 'Could not register job source');
    }
  };

  const handleSyncSource = async (sourceId: string) => {
    setSyncingSourceId(sourceId);
    try {
      const res = await jobService.syncSource(sourceId);
      if (res.status === 'SUCCESS') {
        success(`Synced: Discovered ${res.jobs_discovered}, added ${res.jobs_added}, updated ${res.jobs_updated}`);
      } else {
        info(`Sync finished with status: ${res.status}`);
      }
      await loadAllData();
    } catch (err: any) {
      error(err?.message || 'Failed to sync source');
    } finally {
      setSyncingSourceId(null);
    }
  };

  const handleSyncAll = async () => {
    setSyncingAll(true);
    try {
      const res = await jobService.syncAllSources();
      success(res.message || 'Triggered synchronization for all active sources');
      await loadAllData();
    } catch (err: any) {
      error(err?.message || 'Failed to sync all sources');
    } finally {
      setSyncingAll(false);
    }
  };

  const handleToggleSourceActive = async (source: JobSource) => {
    try {
      const nextActive = !source.is_active;
      await jobService.updateJobSource(source.id, { is_active: nextActive });
      setSources((prev) =>
        prev.map((s) => (s.id === source.id ? { ...s, is_active: nextActive } : s))
      );
      success(`Source '${source.name}' ${nextActive ? 'enabled' : 'disabled'}`);
    } catch {
      error('Could not update source status');
    }
  };

  const handleDeleteSource = async (sourceId: string) => {
    if (!confirm('Are you sure you want to remove this job source connector?')) return;
    try {
      await jobService.deleteJobSource(sourceId);
      setSources((prev) => prev.filter((s) => s.id !== sourceId));
      success('Job source removed');
    } catch {
      error('Could not delete job source');
    }
  };

  const handleModerateJob = async (jobId: string, status: string) => {
    try {
      await jobService.moderateJob(jobId, { status, reason: 'Admin moderation action' });
      setJobs((prev) => prev.filter((j) => j.id !== jobId));
      success(`Job posting ${status}`);
    } catch {
      error('Could not moderate job');
    }
  };

  if (loading) {
    return <ClayLoader label="Loading Job Intelligence Console..." />;
  }

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              Admin Job Intelligence & Ingestion Console
            </h1>
            <Badge variant="purple" size="sm">Phase 4</Badge>
          </div>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Automated connector sync, SHA-256 deduplication, compliance verification, and multi-factor student matching.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="white"
            size="sm"
            leftIcon={<RefreshCw className={`w-3.5 h-3.5 ${syncingAll ? 'animate-spin' : ''}`} />}
            disabled={syncingAll}
            onClick={handleSyncAll}
          >
            {syncingAll ? 'Syncing...' : 'Sync All Sources'}
          </Button>

          {activeTab === 'sources' ? (
            <Button
              variant="blue"
              size="sm"
              leftIcon={<Plus className="w-4 h-4" />}
              onClick={() => setAddSourceModalOpen(true)}
            >
              Add Connector
            </Button>
          ) : (
            <Button
              variant="blue"
              size="sm"
              leftIcon={<Plus className="w-4 h-4" />}
              onClick={() => setAddJobModalOpen(true)}
            >
              Post Drive
            </Button>
          )}
        </div>
      </div>

      {/* Ingestion Telemetry Stats Bar */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div className="clay-card p-3 bg-white border border-slate-200">
            <p className="text-[10px] uppercase font-bold text-slate-500">Active Jobs</p>
            <p className="text-lg font-black text-slate-900 font-mono mt-0.5">
              {stats.total_active_jobs}
            </p>
          </div>
          <div className="clay-card p-3 bg-white border border-emerald-200">
            <p className="text-[10px] uppercase font-bold text-emerald-700">Live Connectors</p>
            <p className="text-lg font-black text-emerald-700 font-mono mt-0.5">
              {stats.live_sources_count} / {stats.sources_count}
            </p>
          </div>
          <div className="clay-card p-3 bg-white border border-amber-200">
            <p className="text-[10px] uppercase font-bold text-amber-700">Enterprise Auth Pending</p>
            <p className="text-lg font-black text-amber-700 font-mono mt-0.5">
              {stats.not_configured_count}
            </p>
          </div>
          <div className="clay-card p-3 bg-white border border-blue-200">
            <p className="text-[10px] uppercase font-bold text-blue-700">Total Applications</p>
            <p className="text-lg font-black text-blue-700 font-mono mt-0.5">
              {stats.total_applications_recorded}
            </p>
          </div>
          <div className="clay-card p-3 bg-white border border-slate-200">
            <p className="text-[10px] uppercase font-bold text-slate-500">Profile Matches</p>
            <p className="text-lg font-black text-slate-800 font-mono mt-0.5">
              {stats.total_matches_calculated}
            </p>
          </div>
        </div>
      )}

      

      {/* Tabs Switcher */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <button
          onClick={() => setActiveTab('drives')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'drives'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-blue-50/70 hover:text-blue-900'
          }`}
        >
          <Briefcase className="w-4 h-4" />
          Campus Drives & Jobs ({jobs.length})
        </button>

        <button
          onClick={() => setActiveTab('sources')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'sources'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-blue-50/70 hover:text-blue-900'
          }`}
        >
          <Database className="w-4 h-4" />
          Authorized Job Sources ({sources.length})
        </button>

        <button
          onClick={() => setActiveTab('history')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'history'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-blue-50/70 hover:text-blue-900'
          }`}
        >
          <Activity className="w-4 h-4" />
          Sync History & Runs ({syncHistory.length})
        </button>

        <button
          onClick={() => setActiveTab('workers')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'workers'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-blue-50/70 hover:text-blue-900'
          }`}
        >
          <Cpu className="w-4 h-4" />
          Worker Engine & Leases
        </button>

        <button
          onClick={() => setActiveTab('notifications')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'notifications'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-blue-50/70 hover:text-blue-900'
          }`}
        >
          <Bell className="w-4 h-4" />
          Alerts & FCM Broadcast
        </button>
      </div>

      {/* TAB 1: Campus Drives & Ingested Jobs */}
      {activeTab === 'drives' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {jobs.map((job) => (
              <div
                key={job.id}
                className="clay-card p-5 bg-white border border-slate-200 hover:border-orange-300 shadow-2xs flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-10 h-10 rounded-xl font-bold flex items-center justify-center text-white shrink-0 shadow-md text-sm"
                        style={{ backgroundColor: job.companyColor }}
                      >
                        {job.companyInitials}
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <h3 className="text-sm font-bold text-slate-900">{job.company}</h3>
                          {job.sourceName && (
                            <span className="text-[9px] font-mono px-1 py-0.5 rounded bg-slate-100 text-slate-600">
                              {job.sourceName}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-700 font-semibold">{job.role}</p>
                      </div>
                    </div>
                    <Badge variant="purple" size="sm">Active</Badge>
                  </div>

                  <div className="mt-3.5 p-3 rounded-xl bg-orange-50/40 border border-orange-100 text-xs space-y-1 font-medium">
                    <div className="flex justify-between text-slate-500">
                      <span>Package:</span>
                      <span className="font-mono text-slate-900 font-bold">
                        {job.salaryLabel || `₹${job.ctcMin}-${job.ctcMax} LPA`}
                      </span>
                    </div>
                    <div className="flex justify-between text-slate-500">
                      <span>Location:</span>
                      <span className="text-slate-800">{job.location} ({job.workMode})</span>
                    </div>
                    <div className="flex justify-between text-slate-500">
                      <span>Eligibility:</span>
                      <span className="font-mono text-emerald-700 font-bold">
                        {job.responsibilities[0] || '2025/2026 Batch'}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1 mt-3">
                    {job.techStack.map((tech) => (
                      <span
                        key={tech}
                        className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-white border border-slate-200 text-slate-700 shadow-2xs"
                      >
                        {tech}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-semibold">
                  <span className="text-slate-400 font-medium">
                    {job.applicationUrl ? 'External Link Configured' : 'Internal Campus Drive'}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="white"
                      size="sm"
                      className="text-xs text-red-600 hover:text-red-700"
                      onClick={() => handleModerateJob(job.id, 'archived')}
                    >
                      Archive
                    </Button>
                    {job.applicationUrl && (
                      <Button
                        variant="white"
                        size="sm"
                        className="text-xs"
                        leftIcon={<ExternalLink className="w-3 h-3" />}
                        onClick={() => window.open(job.applicationUrl, '_blank')}
                      >
                        Visit
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      

      {/* TAB 2: Authorized Job Sources & Connectors */}
      {activeTab === 'sources' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {sources.map((s) => {
              const isSyncing = syncingSourceId === s.id;
              let statusBadge = (
                <Badge variant="success" size="sm">LIVE</Badge>
              );
              if (s.status === 'NOT_CONFIGURED') {
                statusBadge = <Badge variant="warning" size="sm">NOT CONFIGURED</Badge>;
              } else if (s.status === 'FAILED') {
                statusBadge = <Badge variant="danger" size="sm">FAILED</Badge>;
              } else if (!s.is_active) {
                statusBadge = <Badge variant="neutral" size="sm">DISABLED</Badge>;
              }

              return (
                <div
                  key={s.id}
                  className="clay-card p-5 bg-white border border-slate-200 hover:border-orange-300 shadow-2xs flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-bold text-slate-900">{s.name}</h3>
                          {statusBadge}
                        </div>
                        <p className="text-xs font-mono text-slate-500 mt-0.5">
                          Type: {s.source_type} • Interval: {s.sync_interval_minutes}m
                        </p>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleToggleSourceActive(s)}
                          className={`px-2 py-0.5 rounded text-[11px] font-bold cursor-pointer ${
                            s.is_active
                              ? 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                              : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                          }`}
                        >
                          {s.is_active ? 'Disable' : 'Enable'}
                        </button>
                        <button
                          onClick={() => handleDeleteSource(s.id)}
                          className="p-1 text-slate-400 hover:text-red-500 rounded cursor-pointer"
                          title="Remove Source"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="mt-3 p-3 rounded-xl bg-slate-50 border border-slate-100 text-xs space-y-1.5 font-medium">
                      {s.board_token && (
                        <p className="text-slate-600">
                          <span className="font-bold">Board / Site Token:</span>{' '}
                          <code className="bg-white px-1.5 py-0.5 rounded border border-slate-200 font-mono text-slate-800">
                            {s.board_token}
                          </code>
                        </p>
                      )}
                      {s.endpoint_url && (
                        <p className="text-slate-600 truncate">
                          <span className="font-bold">Endpoint:</span> {s.endpoint_url}
                        </p>
                      )}
                      <div className="flex items-center justify-between text-slate-500 pt-1 border-t border-slate-200/60">
                        <span>Jobs Discovered:</span>
                        <span className="font-bold font-mono text-slate-900">
                          {s.jobs_imported_count}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-slate-500">
                        <span>Last Sync:</span>
                        <span className="font-mono text-slate-700">
                          {s.last_sync_at ? new Date(s.last_sync_at).toLocaleTimeString() : 'Never'}
                        </span>
                      </div>
                      {s.error_message && (
                        <p className="text-red-600 text-[11px] font-mono pt-1">
                          Error: {s.error_message}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                    <span className="text-[11px] text-slate-400">
                      {s.requires_auth ? 'Requires Authorized Enterprise API' : 'Public Automated Feed'}
                    </span>

                    <Button
                      variant={s.status === 'NOT_CONFIGURED' ? 'white' : 'blue'}
                      size="sm"
                      className="text-xs"
                      leftIcon={<RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} />}
                      disabled={isSyncing}
                      onClick={() => handleSyncSource(s.id)}
                    >
                      {isSyncing ? 'Syncing...' : 'Sync Now'}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      

      {/* TAB 3: Synchronization History & Telemetry Runs */}
      {activeTab === 'history' && (
        <div className="space-y-4">
          <div className="clay-card p-4 bg-white border border-slate-200 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px]">
                  <th className="pb-2">Source Connector</th>
                  <th className="pb-2">Status</th>
                  <th className="pb-2">Discovered</th>
                  <th className="pb-2">Added</th>
                  <th className="pb-2">Updated</th>
                  <th className="pb-2">Duplicates</th>
                  <th className="pb-2">Duration</th>
                  <th className="pb-2">Executed At</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {syncHistory.map((run) => (
                  <tr key={run.id} className="hover:bg-orange-50/30">
                    <td className="py-2.5 font-bold text-slate-900">
                      {run.source_name}
                      {run.error_message && (
                        <p className="text-[10px] text-red-600 font-mono font-normal">
                          {run.error_message}
                        </p>
                      )}
                    </td>
                    <td className="py-2.5">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          run.status === 'SUCCESS'
                            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                            : run.status === 'NOT_CONFIGURED'
                            ? 'bg-amber-50 text-amber-800 border border-amber-200'
                            : 'bg-red-50 text-red-800 border border-red-200'
                        }`}
                      >
                        {run.status}
                      </span>
                    </td>
                    <td className="py-2.5 font-mono text-slate-700">{run.jobs_discovered}</td>
                    <td className="py-2.5 font-mono text-emerald-700 font-bold">+{run.jobs_added}</td>
                    <td className="py-2.5 font-mono text-blue-700">~{run.jobs_updated}</td>
                    <td className="py-2.5 font-mono text-slate-400">{run.duplicates_skipped}</td>
                    <td className="py-2.5 font-mono text-slate-500">{run.duration_seconds.toFixed(2)}s</td>
                    <td className="py-2.5 text-slate-600 font-mono text-[11px]">
                      {new Date(run.started_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      

      {/* TAB 4: Background Worker Engine, Leases & Scheduler Telemetry */}
      {activeTab === 'workers' && (
        <div className="space-y-6">
          {/* Status Header Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div className="clay-card p-4 bg-white border border-slate-200">
              <p className="text-[10px] uppercase font-bold text-slate-500">Worker Engine State</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-base font-black text-slate-900 font-mono">
                  {workerHealth?.status || 'HEALTHY'}
                </span>
              </div>
              <p className="text-[10px] text-slate-400 mt-1">Continuous multi-instance leases active</p>
            </div>

            <div className="clay-card p-4 bg-white border border-emerald-200">
              <p className="text-[10px] uppercase font-bold text-emerald-700">Active Background Workers</p>
              <p className="text-xl font-black text-emerald-700 font-mono mt-1">
                {workerHealth?.active_workers_count ?? 1}
              </p>
              <p className="text-[10px] text-slate-400 mt-1">Heartbeat checked every 60s</p>
            </div>

            <div className="clay-card p-4 bg-white border border-blue-200">
              <p className="text-[10px] uppercase font-bold text-blue-700">Active Distributed Leases</p>
              <p className="text-xl font-black text-blue-700 font-mono mt-1">
                {workerHealth?.active_leases_count ?? 0}
              </p>
              <p className="text-[10px] text-slate-400 mt-1">Mutual exclusion across instances</p>
            </div>

            <div className="clay-card p-4 bg-white border border-orange-200">
              <p className="text-[10px] uppercase font-bold text-orange-700">Scheduler Master Lease</p>
              <p className="text-xs font-mono font-bold text-slate-800 mt-1 truncate" title={workerHealth?.last_scheduler_heartbeat || 'Active'}>
                {workerHealth?.last_scheduler_heartbeat ? new Date(workerHealth.last_scheduler_heartbeat).toLocaleTimeString() : 'Acquired & Running'}
              </p>
              <p className="text-[10px] text-slate-400 mt-1">Zero Redis / Zero Celery durable queue</p>
            </div>
          </div>

          {/* Quick Trigger Bar */}
          <div className="p-4 rounded-2xl bg-gradient-to-r from-orange-50/80 to-white border border-orange-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-[#E86144] text-white flex items-center justify-center shadow-xs">
                <Zap className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-900">Background Worker Controls</p>
                <p className="text-[11px] text-slate-500">Trigger immediate cycles or inspect distributed lease states.</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="white"
                size="sm"
                leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
                onClick={loadAllData}
              >
                Refresh Telemetry
              </Button>
              <Button
                variant="primary"
                size="sm"
                leftIcon={<Play className="w-3.5 h-3.5" />}
                disabled={syncingAll}
                onClick={handleSyncAll}
              >
                {syncingAll ? 'Executing...' : 'Run All Sync Jobs'}
              </Button>
            </div>
          </div>

          {/* Active Workers Table */}
          <div className="clay-card p-5 bg-white border border-slate-200">
            <h3 className="text-xs font-black uppercase text-slate-700 tracking-wider mb-3 flex items-center gap-2">
              <Server className="w-3.5 h-3.5 text-orange-500" /> Registered Worker Processes
            </h3>
            {(!workerHealth?.active_workers || workerHealth.active_workers.length === 0) ? (
              <p className="text-xs text-slate-400 py-3">No separate worker instances reported within last 3 minutes (running inside primary FastAPI lifespan process).</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-400 uppercase text-[10px]">
                      <th className="py-2">Worker ID</th>
                      <th className="py-2">PID</th>
                      <th className="py-2">Status</th>
                      <th className="py-2">Running Tasks</th>
                      <th className="py-2">Last Heartbeat</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {workerHealth.active_workers.map((w) => (
                      <tr key={w.worker_id} className="hover:bg-slate-50/50">
                        <td className="py-2.5 font-mono text-slate-900 font-bold">{w.worker_id}</td>
                        <td className="py-2.5 font-mono text-slate-600">{w.pid}</td>
                        <td className="py-2.5">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                            {w.status}
                          </span>
                        </td>
                        <td className="py-2.5 font-mono text-slate-600">
                          {w.active_tasks.join(', ') || 'scheduler_loop'}
                        </td>
                        <td className="py-2.5 text-slate-500 font-mono text-[11px]">
                          {new Date(w.heartbeat_at).toLocaleTimeString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Active Distributed Leases Table */}
          <div className="clay-card p-5 bg-white border border-slate-200">
            <h3 className="text-xs font-black uppercase text-slate-700 tracking-wider mb-3 flex items-center gap-2">
              <Cpu className="w-3.5 h-3.5 text-blue-500" /> Active MongoDB Distributed Leases
            </h3>
            {(!workerHealth?.active_leases || workerHealth.active_leases.length === 0) ? (
              <p className="text-xs text-slate-400 py-3">No active leases currently held (all synchronizations completed, leases released cleanly).</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-400 uppercase text-[10px]">
                      <th className="py-2">Lease Resource</th>
                      <th className="py-2">Holder Worker ID</th>
                      <th className="py-2">Acquired At</th>
                      <th className="py-2">Expires At</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {workerHealth.active_leases.map((l, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50">
                        <td className="py-2.5 font-mono text-slate-900 font-bold">{l.resource}</td>
                        <td className="py-2.5 font-mono text-slate-600">{l.holder}</td>
                        <td className="py-2.5 text-slate-500 font-mono text-[11px]">
                          {new Date(l.acquired_at).toLocaleTimeString()}
                        </td>
                        <td className="py-2.5 text-slate-500 font-mono text-[11px]">
                          {new Date(l.expires_at).toLocaleTimeString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 5: Real-Time Alerts & FCM Broadcast Controls */}
      {activeTab === 'notifications' && (
        <div className="space-y-6">
          {/* KPI Analytics Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-5 rounded-3xl bg-white border border-orange-100 shadow-2xs">
              <p className="text-[10px] uppercase font-bold text-slate-500">Total Notifications</p>
              <p className="text-2xl font-black text-slate-900 mt-1">{notifStats?.total_notifications ?? 0}</p>
              <p className="text-[10px] text-slate-400 mt-1">Total in-app & job alert dispatches</p>
            </div>
            <div className="p-5 rounded-3xl bg-white border border-orange-100 shadow-2xs">
              <p className="text-[10px] uppercase font-bold text-amber-700">Unread User Alerts</p>
              <p className="text-2xl font-black text-amber-600 mt-1">{notifStats?.unread_notifications ?? 0}</p>
              <p className="text-[10px] text-slate-400 mt-1">Pending student attention</p>
            </div>
            <div className="p-5 rounded-3xl bg-white border border-orange-100 shadow-2xs">
              <p className="text-[10px] uppercase font-bold text-sky-700">Registered Devices & FCM</p>
              <p className="text-2xl font-black text-sky-600 mt-1">{notifStats?.registered_devices ?? 0}</p>
              <p className="text-[10px] text-slate-400 mt-1">Active client browser tokens</p>
            </div>
            <div className="p-5 rounded-3xl bg-white border border-orange-100 shadow-2xs">
              <p className="text-[10px] uppercase font-bold text-emerald-700">Push Deliveries Today</p>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-2xl font-black text-emerald-600">{notifStats?.push_success_count ?? 0}</span>
                <span className="text-xs font-bold text-slate-400">({notifStats?.push_failure_count ?? 0} failed)</span>
              </div>
              <p className="text-[10px] text-slate-400 mt-1">FCM multicast deliveries 24h</p>
            </div>
          </div>

          {/* Broadcast Announcement Form */}
          <div className="p-6 rounded-3xl bg-white border border-orange-100 shadow-2xs space-y-4">
            <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#FF7A59] to-[#E86144] text-white flex items-center justify-center shadow-xs">
                <Megaphone className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Broadcast Official Announcement</h3>
                <p className="text-xs text-slate-500">
                  Send immediate in-app and browser push alerts to targeted student cohorts.
                </p>
              </div>
            </div>

            <form onSubmit={handleSendBroadcast} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Target Role</label>
                  <select
                    value={announceRole}
                    onChange={(e) => setAnnounceRole(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-800"
                  >
                    <option value="STUDENT">Students Only</option>
                    <option value="ALL">All Users</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Target Department</label>
                  <select
                    value={announceBranch}
                    onChange={(e) => setAnnounceBranch(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-800"
                  >
                    <option value="ALL">All Departments</option>
                    <option value="CSE">CSE (Computer Science)</option>
                    <option value="IT">Information Technology</option>
                    <option value="ECE">ECE (Electronics)</option>
                    <option value="ME">Mechanical</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Target Graduation Batch</label>
                  <select
                    value={announceBatch}
                    onChange={(e) => setAnnounceBatch(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-800"
                  >
                    <option value="ALL">All Batches</option>
                    <option value="2025">2025 Batch</option>
                    <option value="2026">2026 Batch</option>
                    <option value="2027">2027 Batch</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Announcement Title *</label>
                <input
                  type="text"
                  placeholder="e.g. ⚡ Google Summer Internship 2025 Registrations Open"
                  value={announceTitle}
                  onChange={(e) => setAnnounceTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-800 focus:outline-none focus:border-[#E86144]"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Message Body *</label>
                <textarea
                  rows={3}
                  placeholder="Provide instructions, eligibility requirements, and deadlines..."
                  value={announceMessage}
                  onChange={(e) => setAnnounceMessage(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-800 focus:outline-none focus:border-[#E86144]"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Action / Deep Link URL (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. /student/jobs or https://careers.google.com/jobs/..."
                  value={announceUrl}
                  onChange={(e) => setAnnounceUrl(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-800 focus:outline-none focus:border-[#E86144]"
                />
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={sendingBroadcast}
                  className="px-6 py-2.5 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md transition-all flex items-center gap-2 cursor-pointer"
                >
                  <Send className="w-4 h-4" />
                  {sendingBroadcast ? 'Dispatching Multicast...' : 'Broadcast Announcement Now'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}


      {/* MODAL: Post Placement Drive */}
      <Modal
        isOpen={addJobModalOpen}
        onClose={() => setAddJobModalOpen(false)}
        title="Post Corporate Placement Drive"
        subtitle="Configure company details, CTC package, and mandatory tech stack requirements"
        size="lg"
      >
        <form onSubmit={handleCreateJob} className="space-y-4 text-xs font-medium">
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Company Name"
              placeholder="e.g. Razorpay, CRED, Google"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              required
            />
            <Input
              label="Job Role"
              placeholder="e.g. SDE 1 - Distributed Systems"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Select
              label="Category"
              value={category}
              onChange={(e) => setCategory(e.target.value as any)}
              options={[
                { value: 'Full Stack', label: 'Full Stack' },
                { value: 'Backend', label: 'Backend' },
                { value: 'Frontend', label: 'Frontend' },
                { value: 'Cloud/DevOps', label: 'Cloud/DevOps' },
                { value: 'Data Science', label: 'Data Science' },
              ]}
            />
            <Input
              label="Location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
            <Select
              label="Work Mode"
              value={workMode}
              onChange={(e) => setWorkMode(e.target.value as any)}
              options={[
                { value: 'Hybrid', label: 'Hybrid' },
                { value: 'Remote', label: 'Remote' },
                { value: 'Onsite', label: 'Onsite' },
              ]}
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Input
              label="CTC Min (LPA)"
              type="number"
              value={ctcMin}
              onChange={(e) => setCtcMin(e.target.value)}
              required
            />
            <Input
              label="CTC Max (LPA)"
              type="number"
              value={ctcMax}
              onChange={(e) => setCtcMax(e.target.value)}
              required
            />
            <Input
              label="Minimum CGPA Gate"
              value={minCGPA}
              onChange={(e) => setMinCGPA(e.target.value)}
              required
            />
          </div>

          <Input
            label="Mandatory Tech Stack (comma separated)"
            value={techStackStr}
            onChange={(e) => setTechStackStr(e.target.value)}
            required
          />

          <Textarea
            label="Role Overview & Hiring Description"
            placeholder="Details about responsibilities, team, and selection rounds..."
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />

          <div className="pt-3 flex justify-end gap-2">
            <Button variant="ghost" size="sm" type="button" onClick={() => setAddJobModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="blue" size="sm" type="submit">
              Publish Placement Drive
            </Button>
          </div>
        </form>
      </Modal>

      {/* MODAL: Add Job Source Connector */}
      <Modal
        isOpen={addSourceModalOpen}
        onClose={() => setAddSourceModalOpen(false)}
        title="Register Authorized Job Connector"
        subtitle="Add a compliant job board feed, Greenhouse/Lever site, or authorized RSS source"
        size="lg"
      >
        <form onSubmit={handleCreateSource} className="space-y-4 text-xs font-medium">
          <Input
            label="Connector Name"
            placeholder="e.g. Greenhouse: Stripe, Lever: Postman"
            value={sourceName}
            onChange={(e) => setSourceName(e.target.value)}
            required
          />

          <div className="grid grid-cols-2 gap-3">
            <Select
              label="Connector Type"
              value={sourceType}
              onChange={(e) => setSourceType(e.target.value)}
              options={[
                { value: 'greenhouse', label: 'Greenhouse Public Board' },
                { value: 'lever', label: 'Lever Public Postings' },
                { value: 'remotive', label: 'Remotive Developer API' },
                { value: 'rss', label: 'Authorized RSS/XML Feed' },
                { value: 'linkedin_enterprise', label: 'LinkedIn Enterprise (Partner API)' },
                { value: 'indeed_enterprise', label: 'Indeed Enterprise (Authorized API)' },
                { value: 'internshala_enterprise', label: 'Internshala (Partner API)' },
              ]}
            />
            <Input
              label="Sync Interval (Minutes)"
              type="number"
              value={syncInterval}
              onChange={(e) => setSyncInterval(e.target.value)}
            />
          </div>

          {(sourceType === 'greenhouse' || sourceType === 'lever') && (
            <Input
              label="Board Token / Site Identifier"
              placeholder="e.g. stripe, figma, or lever site slug"
              value={boardToken}
              onChange={(e) => setBoardToken(e.target.value)}
              required
            />
          )}

          {(sourceType === 'rss' || sourceType === 'remotive') && (
            <Input
              label="Feed / API Endpoint URL"
              placeholder="e.g. https://remotive.com/api/remote-jobs?category=software-dev"
              value={endpointUrl}
              onChange={(e) => setEndpointUrl(e.target.value)}
            />
          )}

          {sourceType.includes('enterprise') && (
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 space-y-2">
              <p className="font-bold flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-amber-600" />
                Compliance Notice: Authorized API Access Only
              </p>
              <p className="text-[11px] leading-relaxed">
                We strictly adhere to Terms of Service. Enterprise connectors require registered partner API keys. Scraping, bypassing CAPTCHAs, or unauthorized extraction is strictly forbidden.
              </p>
              <Input
                label="Enterprise API Key / Access Token"
                type="password"
                placeholder="Enter authorized partner client token..."
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
            </div>
          )}

          <div className="pt-3 flex justify-end gap-2">
            <Button variant="ghost" size="sm" type="button" onClick={() => setAddSourceModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="blue" size="sm" type="submit">
              Register Connector
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
