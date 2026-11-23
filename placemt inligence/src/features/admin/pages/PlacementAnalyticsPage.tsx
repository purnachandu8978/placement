import React, { useEffect, useState } from 'react';
import { BarChart3, Users, FileCheck2, ShieldCheck, RefreshCw } from 'lucide-react';
import { Card, CardHeader } from '../../../components/common/Card';
import { Button } from '../../../components/common/Button';
import { Badge } from '../../../components/common/Badge';
import { ClayLoader } from '../../../components/common/ClayLoader';
import { EmptyState } from '../../../components/common/EmptyState';
import { useToast } from '../../../context/ToastContext';
import {
  adminService,
  type AdminDashboardMetrics,
  type AdminStudentRow,
} from '../../../services/adminService';

export const PlacementAnalyticsPage: React.FC = () => {
  const { error } = useToast();
  const [metrics, setMetrics] = useState<AdminDashboardMetrics | null>(null);
  const [students, setStudents] = useState<AdminStudentRow[]>([]);
  const [loading, setLoading] = useState(true);

  const loadAnalytics = async () => {
    setLoading(true);
    try {
      const [m, s] = await Promise.all([
        adminService.getDashboardMetrics(),
        adminService.getStudents(),
      ]);
      setMetrics(m);
      setStudents(s || []);
    } catch (err: any) {
      error(err?.message || 'Unable to fetch placement analytics.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAnalytics();
  }, []);

  if (loading) {
    return <ClayLoader label="Aggregating MongoDB Cohort Analytics..." />;
  }

  // Group real students by branch/college dynamically
  const groupMap = new Map<
    string,
    { name: string; count: number; withResume: number; tier1Ready: number; totalReadiness: number; totalAts: number }
  >();

  for (const st of students) {
    const label = st.branch || st.college || 'Unassigned Profile';
    const cur = groupMap.get(label) || {
      name: label,
      count: 0,
      withResume: 0,
      tier1Ready: 0,
      totalReadiness: 0,
      totalAts: 0,
    };
    cur.count += 1;
    if (st.has_resume) cur.withResume += 1;
    if (st.readiness_score >= 75) cur.tier1Ready += 1;
    cur.totalReadiness += st.readiness_score || 0;
    cur.totalAts += st.ats_score || 0;
    groupMap.set(label, cur);
  }

  const departmentStats = Array.from(groupMap.values()).map((g) => ({
    name: g.name,
    students: g.count,
    tier1ReadyPct: g.count > 0 ? Math.round((g.tier1Ready / g.count) * 100) : 0,
    avgReadiness: g.count > 0 ? Math.round(g.totalReadiness / g.count) : 0,
    avgAts: g.count > 0 ? Math.round(g.totalAts / g.count) : 0,
    resumeCoveragePct: g.count > 0 ? Math.round((g.withResume / g.count) * 100) : 0,
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            Placement Outcome & Cohort Readiness Analytics
          </h1>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Live metrics computed strictly from MongoDB student profiles, parsed resumes, assessments, and verified credentials.
          </p>
        </div>

        <Button variant="white" size="sm" onClick={loadAnalytics} leftIcon={<RefreshCw className="w-3.5 h-3.5" />}>
          Refresh Telemetry
        </Button>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="clay-card p-5 bg-white border border-orange-100">
          <div className="flex items-center justify-between text-xs text-slate-500 font-semibold">
            <span>Registered Students</span>
            <Users className="w-4 h-4 text-[#E86144]" />
          </div>
          <p className="text-3xl font-black font-mono text-slate-900 mt-1">{metrics?.total_students ?? 0}</p>
        </div>

        <div className="clay-card p-5 bg-white border border-orange-100">
          <div className="flex items-center justify-between text-xs text-slate-500 font-semibold">
            <span>Active Resumes Parsed</span>
            <FileCheck2 className="w-4 h-4 text-[#E86144]" />
          </div>
          <p className="text-3xl font-black font-mono text-[#E86144] mt-1">{metrics?.students_with_resumes ?? 0}</p>
        </div>

        <div className="clay-card p-5 bg-white border border-emerald-100">
          <div className="flex items-center justify-between text-xs text-slate-500 font-semibold">
            <span>Verified Credentials Issued</span>
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-3xl font-black font-mono text-emerald-700 mt-1">{metrics?.total_verified_skills ?? 0}</p>
        </div>

        <div className="clay-card p-5 bg-white border border-orange-100">
          <div className="flex items-center justify-between text-xs text-slate-500 font-semibold">
            <span>Avg Cohort Readiness</span>
            <BarChart3 className="w-4 h-4 text-[#E86144]" />
          </div>
          <p className="text-3xl font-black font-mono text-slate-900 mt-1">
            {Math.round(metrics?.avg_readiness_score ?? 0)}%
          </p>
        </div>
      </div>

      {/* Department Audit */}
      <Card variant="default">
        <CardHeader
          title="Branch & Cohort Readiness Breakdown"
          subtitle="Real-time aggregation across student profiles"
          action={
            <Badge variant="brand" size="sm">
              Avg ATS: {Math.round(metrics?.avg_ats_score ?? 0)}%
            </Badge>
          }
        />

        {departmentStats.length === 0 ? (
          <EmptyState
            title="No student cohort data available yet"
            description="Analytics will populate automatically as students sign in via Google and upload their resumes."
            icon={<BarChart3 className="w-8 h-8 text-[#E86144]" />}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left text-slate-700 font-medium">
              <thead className="bg-orange-50/70 text-slate-600 uppercase font-mono text-[10px] font-bold border-b border-orange-100">
                <tr>
                  <th className="px-4 py-3">Branch / Profile Group</th>
                  <th className="px-4 py-3">Students</th>
                  <th className="px-4 py-3">Resume Uploaded %</th>
                  <th className="px-4 py-3">Avg ATS Score</th>
                  <th className="px-4 py-3">Avg Readiness</th>
                  <th className="px-4 py-3">Tier-1 Ready (75%+)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {departmentStats.map((dept, idx) => (
                  <tr key={idx} className="hover:bg-orange-50/30 transition-colors">
                    <td className="px-4 py-3 font-bold text-slate-900">{dept.name}</td>
                    <td className="px-4 py-3 font-mono font-bold text-slate-700">{dept.students}</td>
                    <td className="px-4 py-3 font-mono text-slate-700">{dept.resumeCoveragePct}%</td>
                    <td className="px-4 py-3 font-mono text-[#E86144] font-bold">{dept.avgAts}%</td>
                    <td className="px-4 py-3 font-mono font-bold text-slate-900">{dept.avgReadiness}%</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-24 bg-slate-100 h-2 rounded-full overflow-hidden border border-slate-200 shadow-inner">
                          <div
                            className="bg-emerald-500 h-full rounded-full"
                            style={{ width: `${dept.tier1ReadyPct}%` }}
                          />
                        </div>
                        <span className="font-mono font-bold text-emerald-700">{dept.tier1ReadyPct}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};
