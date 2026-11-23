import React, { useEffect, useState } from 'react';
import {
  FileText,
  Search,
  CheckCircle2,
  RefreshCw,
  Download,
  AlertTriangle,
  HardDrive,
  Cloud,
  Layers,
  RotateCw,
  Eye,
} from 'lucide-react';
import { Card } from '../../../components/common/Card';
import { Button } from '../../../components/common/Button';
import { Badge } from '../../../components/common/Badge';
import { ClayLoader } from '../../../components/common/ClayLoader';
import { EmptyState } from '../../../components/common/EmptyState';
import { useToast } from '../../../context/ToastContext';
import { adminService, type AdminResumeRow } from '../../../services/adminService';
import { API_BASE_URL } from '../../../services/apiClient';

export const ResumeManagementPage: React.FC = () => {
  const { success, error, info } = useToast();
  const [resumes, setResumes] = useState<AdminResumeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [reprocessingId, setReprocessingId] = useState<string | null>(null);
  const [storageStats, setStorageStats] = useState<any>(null);

  const loadResumesAndStats = async () => {
    setLoading(true);
    try {
      const [resumesData, statsData] = await Promise.all([
        adminService.getResumes(),
        adminService.getStorageStats().catch(() => null),
      ]);
      setResumes(resumesData || []);
      setStorageStats(statsData);
    } catch (err: any) {
      error(err?.message || 'Failed to load resumes from MongoDB.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadResumesAndStats();
  }, []);

  const handleViewResume = (r: AdminResumeRow) => {
    const base = API_BASE_URL.replace('/api/v1', '');
    window.open(`${base}/api/v1/admin/resumes/${encodeURIComponent(r.id)}/preview`, '_blank');
  };

  const handleDownloadSigned = async (r: AdminResumeRow) => {
    try {
      info(`Generating secure signed URL for ${r.filename}...`);
      const res = await adminService.getResumeSignedDownloadUrl(r.id);
      if (res?.download_url) {
        const base = API_BASE_URL.replace('/api/v1', '');
        const targetUrl = res.download_url.startsWith('http')
          ? res.download_url
          : `${base}${res.download_url}`;
        window.open(targetUrl, '_blank');
      } else {
        error('Could not generate download URL.');
      }
    } catch (err: any) {
      error(err?.message || 'Failed to generate signed download URL.');
    }
  };

  const handleReprocess = async (resumeId: string) => {
    setReprocessingId(resumeId);
    try {
      const res = await adminService.reprocessResume(resumeId);
      success(res?.message || 'Resume reprocessed successfully from cloud storage.');
      await loadResumesAndStats();
    } catch (err: any) {
      error(err?.message || 'Failed to reprocess resume.');
    } finally {
      setReprocessingId(null);
    }
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes || bytes === 0) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const filtered = resumes.filter((r) => {
    const q = searchQuery.toLowerCase();
    return (
      (r.student_name || '').toLowerCase().includes(q) ||
      (r.student_email || '').toLowerCase().includes(q) ||
      (r.college || '').toLowerCase().includes(q) ||
      (r.filename || '').toLowerCase().includes(q) ||
      (r.storage_provider || '').toLowerCase().includes(q) ||
      (r.skills || []).some((s) => (s || '').toLowerCase().includes(q))
    );
  });

  if (loading) {
    return <ClayLoader label="Loading Cloud Resume Repository & Telemetry..." />;
  }

  const completedCount = resumes.filter((r) => (r.processing_status || 'completed') === 'completed').length;
  const failedCount = resumes.filter((r) => r.processing_status === 'failed').length;

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            Cloud Resume Storage & Document Management
          </h1>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Encrypted object storage repository backed by Cloudflare R2 / AWS S3 with MongoDB Atlas metadata.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="brand" size="md">
            <Cloud className="w-3.5 h-3.5 mr-1 inline" /> {storageStats?.configured_primary_provider || 'Cloudflare R2'}
          </Badge>
          <Button variant="white" size="sm" onClick={loadResumesAndStats} className="gap-1.5">
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </Button>
        </div>
      </div>

      {/* STORAGE STATS TELEMETRY TILES */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <div className="clay-card p-4 bg-white border border-orange-100 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-orange-50 border border-orange-200 flex items-center justify-center shrink-0">
            <Layers className="w-5 h-5 text-[#E86144]" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-mono font-bold text-slate-400 block">Total Documents</span>
            <span className="text-lg font-black text-slate-900">{resumes.length} Resumes</span>
          </div>
        </div>

        <div className="clay-card p-4 bg-white border border-orange-100 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-mono font-bold text-slate-400 block">Successfully Parsed</span>
            <span className="text-lg font-black text-emerald-700">{completedCount} Verified</span>
          </div>
        </div>

        <div className="clay-card p-4 bg-white border border-orange-100 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5 text-rose-600" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-mono font-bold text-slate-400 block">Extraction Failures</span>
            <span className="text-lg font-black text-rose-700">{failedCount} Failed</span>
          </div>
        </div>

        <div className="clay-card p-4 bg-white border border-orange-100 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center shrink-0">
            <HardDrive className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-mono font-bold text-slate-400 block">Storage Footprint</span>
            <span className="text-lg font-black text-slate-900">{storageStats?.total_mb ?? 0} MB</span>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="clay-card p-4 bg-white border border-orange-100 shadow-xs">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by student name, email, college, file name, or storage provider..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-orange-50/40 border border-orange-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#E86144]"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="No uploaded student resumes found"
          description="Uploaded student documents with cryptographic SHA-256 signatures and cloud storage keys will populate here automatically."
          icon={<FileText className="w-8 h-8 text-[#E86144]" />}
        />
      ) : (
        <Card variant="default">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left text-slate-700 font-medium">
              <thead className="bg-orange-50/70 text-slate-600 uppercase font-mono text-[10px] font-bold border-b border-orange-100">
                <tr>
                  <th className="px-4 py-3">Student</th>
                  <th className="px-4 py-3">File / Storage Key</th>
                  <th className="px-4 py-3">Provider</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">ATS Score</th>
                  <th className="px-4 py-3">Size</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((r) => {
                  const isProcessing = reprocessingId === r.id;
                  const isFailed = r.processing_status === 'failed';
                  const prov = (r.storage_provider || 'cloudflare_r2').toUpperCase();

                  return (
                    <tr key={r.id} className="hover:bg-orange-50/30 transition-colors">
                      {/* Student Info */}
                      <td className="px-4 py-3">
                        <div className="font-bold text-slate-900">{r.student_name || 'Student'}</div>
                        <div className="text-[11px] text-slate-400 font-mono">{r.student_email}</div>
                        {r.college && <div className="text-[10px] text-slate-500 mt-0.5">{r.college}</div>}
                      </td>

                      {/* File Details */}
                      <td className="px-4 py-3">
                        <div className="font-mono text-[11px] text-[#E86144] font-bold flex items-center gap-1.5">
                          <FileText className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate max-w-[200px]" title={r.filename}>{r.filename}</span>
                          <span className="text-slate-400 font-normal">v{r.version}</span>
                        </div>
                        {r.document_hash && (
                          <div className="text-[9px] font-mono text-slate-400 truncate max-w-[200px]" title={`SHA-256: ${r.document_hash}`}>
                            SHA: {r.document_hash.substring(0, 14)}...
                          </div>
                        )}
                      </td>

                      {/* Storage Provider */}
                      <td className="px-4 py-3 font-mono">
                        <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-slate-100 text-slate-700 border border-slate-200">
                          {prov}
                        </span>
                      </td>

                      {/* Processing Status */}
                      <td className="px-4 py-3">
                        {isFailed ? (
                          <div className="flex items-center gap-1 text-rose-600 font-bold font-mono text-[10px]" title={r.processing_error || 'Parsing error'}>
                            <AlertTriangle className="w-3 h-3 shrink-0" />
                            <span>FAILED</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 text-emerald-600 font-bold font-mono text-[10px]">
                            <CheckCircle2 className="w-3 h-3 shrink-0" />
                            <span>COMPLETED</span>
                          </div>
                        )}
                      </td>

                      {/* ATS Score */}
                      <td className="px-4 py-3 font-mono">
                        <span
                          className={`font-bold px-2 py-0.5 rounded-md border text-[11px] ${
                            r.ats_score >= 80
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                              : r.ats_score >= 60
                              ? 'bg-orange-50 text-orange-800 border-orange-200'
                              : 'bg-rose-50 text-rose-800 border-rose-200'
                          }`}
                        >
                          {Math.round(r.ats_score)}%
                        </span>
                      </td>

                      {/* File Size */}
                      <td className="px-4 py-3 font-mono text-[11px] text-slate-500">
                        {formatFileSize(r.file_size)}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="blue"
                            size="sm"
                            onClick={() => handleViewResume(r)}
                            className="text-[10px] px-2.5 py-1 gap-1"
                            title="View resume PDF inline in browser"
                          >
                            <Eye className="w-3 h-3 text-white" />
                            View
                          </Button>

                          <Button
                            variant="white"
                            size="sm"
                            onClick={() => handleDownloadSigned(r)}
                            className="text-[10px] px-2 py-1 gap-1"
                            title="Download via secure short-lived signed URL"
                          >
                            <Download className="w-3 h-3 text-[#E86144]" />
                            Signed URL
                          </Button>

                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleReprocess(r.id)}
                            isLoading={isProcessing}
                            className="text-[10px] px-2 py-1 gap-1 text-slate-600 hover:text-slate-900"
                            title="Reprocess document text and skill intelligence from cloud storage"
                          >
                            <RotateCw className="w-3 h-3 text-slate-500" />
                            Reprocess
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
};
