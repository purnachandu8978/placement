import React, { useState, useEffect, useMemo } from 'react';
import {
  Compass,
  Building2,
  ExternalLink,
  RefreshCw,
  Search,
  Filter,
  ShieldCheck,
  CheckCircle2,
  Users,
  Briefcase,
  TrendingUp,
  MapPin,
  Globe,
  SlidersHorizontal,
  ArrowUpRight,
  Sparkles,
  Plus,
  X,
  PhoneCall,
  Calendar,
  Check,
} from 'lucide-react';
import {
  startupService,
  type StartupItem,
  type StudentJobApplicationRow,
  type StartupOutreachItem,
} from '../../../services/startupService';

export const StartupConsolePage: React.FC = () => {
  const [startups, setStartups] = useState<StartupItem[]>([]);
  const [applications, setApplications] = useState<StudentJobApplicationRow[]>([]);
  const [outreachRecords, setOutreachRecords] = useState<StartupOutreachItem[]>([]);
  const [analytics, setAnalytics] = useState<{
    total_startups: number;
    dpiit_recognized: number;
    actively_hiring: number;
    total_active_jobs: number;
    student_applications: number;
    dpiit_percentage: number;
  } | null>(null);

  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSector, setSelectedSector] = useState('all');
  const [selectedState, setSelectedState] = useState('all');
  const [selectedClassification, setSelectedClassification] = useState('all');
  const [selectedVerification, setSelectedVerification] = useState('all');
  const [selectedHiring, setSelectedHiring] = useState('all');
  const [activeTab, setActiveTab] = useState<'startups' | 'applications' | 'outreach'>('startups');

  // Modals
  const [addStartupModalOpen, setAddStartupModalOpen] = useState(false);
  const [addOutreachModalOpen, setAddOutreachModalOpen] = useState(false);
  const [selectedStartupForOutreach, setSelectedStartupForOutreach] = useState<StartupItem | null>(null);

  // New Startup Form
  const [newCompany, setNewCompany] = useState({
    name: '',
    legal_name: '',
    description: '',
    industry: 'Enterprise Software & Cloud',
    sector: 'SaaS',
    company_classification: 'STARTUP',
    verification_status: 'OFFICIAL_WEBSITE_VERIFIED',
    hq_city: 'Bengaluru',
    hq_state: 'Karnataka',
    lat: 12.9716,
    lng: 77.5946,
    website: '',
    careers_url: '',
    founding_year: 2021,
    dpiit_recognized: true,
    dpiit_registration_number: '',
    funding_stage: 'Seed / Early Stage',
    company_size: '20-50',
    tech_stack: 'Python, React, PostgreSQL',
  });

  // New Outreach Form
  const [newOutreach, setNewOutreach] = useState({
    contact_person: '',
    contact_email: '',
    contact_role: 'Head of Campus Recruitment',
    partnership_stage: 'EXPLORATORY',
    notes: 'Initiated campus placement drive discussion.',
    expected_hires_count: 5,
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [allStartups, stats, myApps, outreachList] = await Promise.all([
        startupService.listStartups(),
        startupService.getAnalytics().catch(() => null),
        startupService.getMyApplications().catch(() => []),
        startupService.getAdminOutreach().catch(() => []),
      ]);
      setStartups(allStartups);
      setAnalytics(stats);
      setApplications(myApps);
      setOutreachRecords(outreachList);
    } catch (err: any) {
      console.error('Failed to load startup console data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    try {
      setSyncing(true);
      setSyncResult(null);
      const res = await startupService.triggerSync();
      setSyncResult(`Successfully synced ${res.synced_startups} startups across India hubs!`);
      await fetchData();
      setTimeout(() => setSyncResult(null), 5000);
    } catch (err: any) {
      setSyncResult('Sync failed. Please check network connectivity.');
      setTimeout(() => setSyncResult(null), 5000);
    } finally {
      setSyncing(false);
    }
  };

  const handleCreateStartupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        ...newCompany,
        tech_stack: newCompany.tech_stack.split(',').map((s) => s.trim()).filter(Boolean),
        lat: Number(newCompany.lat),
        lng: Number(newCompany.lng),
        founding_year: Number(newCompany.founding_year),
      };
      await startupService.createAdminStartup(payload);
      setAddStartupModalOpen(false);
      setSyncResult(`Successfully registered ${newCompany.name} in startup directory!`);
      await fetchData();
      setTimeout(() => setSyncResult(null), 5000);
    } catch (err: any) {
      alert(err.message || 'Error registering startup');
    }
  };

  const handleCreateOutreachSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStartupForOutreach) return;
    try {
      const payload = {
        startup_id: selectedStartupForOutreach.startup_id,
        company_name: selectedStartupForOutreach.name,
        contact_person: newOutreach.contact_person,
        contact_email: newOutreach.contact_email,
        contact_role: newOutreach.contact_role,
        partnership_stage: newOutreach.partnership_stage,
        notes: newOutreach.notes,
        expected_hires_count: Number(newOutreach.expected_hires_count),
      };
      await startupService.createAdminOutreach(payload);
      setAddOutreachModalOpen(false);
      setSyncResult(`Outreach logged for ${selectedStartupForOutreach.name}!`);
      await fetchData();
      setTimeout(() => setSyncResult(null), 5000);
    } catch (err: any) {
      alert(err.message || 'Error recording outreach');
    }
  };

  const availableSectors = useMemo(() => {
    return Array.from(new Set(startups.map((s) => s.sector))).sort();
  }, [startups]);

  const availableStates = useMemo(() => {
    return Array.from(new Set(startups.map((s) => s.hq_state))).sort();
  }, [startups]);

  const filteredStartups = useMemo(() => {
    return startups.filter((s) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = s.name.toLowerCase().includes(q);
        const matchSector = s.sector.toLowerCase().includes(q);
        const matchCity = s.hq_city.toLowerCase().includes(q);
        if (!matchName && !matchSector && !matchCity) return false;
      }
      if (selectedSector !== 'all' && s.sector.toLowerCase() !== selectedSector.toLowerCase()) {
        return false;
      }
      if (selectedState !== 'all' && s.hq_state.toLowerCase() !== selectedState.toLowerCase()) {
        return false;
      }
      if (selectedClassification !== 'all' && s.company_classification !== selectedClassification) {
        return false;
      }
      if (selectedVerification !== 'all' && s.verification_status !== selectedVerification) {
        return false;
      }
      if (selectedHiring !== 'all') {
        if (selectedHiring === 'hiring' && s.open_jobs_count === 0) return false;
        if (selectedHiring === 'dpiit' && !s.dpiit_recognized) return false;
      }
      return true;
    });
  }, [startups, searchQuery, selectedSector, selectedState, selectedClassification, selectedVerification, selectedHiring]);

  return (
    <div className="space-y-6">
      {/* Header with Admin Blue Theme */}
      <div className="p-6 rounded-3xl bg-white border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-xs font-bold uppercase tracking-wider mb-2">
            <Compass className="w-3.5 h-3.5" /> Startup Intelligence Console
          </div>
          <h1 className="text-2xl font-black text-slate-900">
            India Startup Ecosystem &amp; Direct Recruitment Feeds
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Curate verified Indian tech companies, inspect verification statuses, manage university outreach, and track student recruitment interest.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={() => setAddStartupModalOpen(true)}
            className="px-4 py-2.5 rounded-2xl bg-white hover:bg-slate-50 border border-slate-300 text-slate-800 text-xs font-bold transition-all flex items-center gap-2 shadow-xs cursor-pointer"
          >
            <Plus className="w-4 h-4 text-blue-600" />
            <span>Add Company</span>
          </button>
          <button
            onClick={handleSync}
            disabled={syncing}
            className="px-4 py-2.5 rounded-2xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-xs font-bold transition-all flex items-center gap-2 shadow-sm disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Syncing Ecosystem...' : 'Sync Startup Feeds'}
          </button>
        </div>
      </div>

      {/* Sync Notification Banner */}
      {syncResult && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          {syncResult}
        </div>
      )}

      {/* Metric Overview Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-5 rounded-3xl bg-white border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Total Companies</span>
            <Building2 className="w-4 h-4 text-blue-600" />
          </div>
          <p className="text-2xl font-black text-slate-900 mt-2">
            {analytics?.total_startups ?? startups.length}
          </p>
          <span className="text-[11px] text-slate-500 font-medium">Pan-India Curated</span>
        </div>

        <div className="p-5 rounded-3xl bg-white border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">DPIIT Recognized</span>
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-2xl font-black text-blue-600 mt-2">
            {analytics?.dpiit_recognized ?? startups.filter((s) => s.dpiit_recognized).length}
          </p>
          <span className="text-[11px] text-emerald-600 font-bold">
            {analytics?.dpiit_percentage ?? 80}% Recognition Rate
          </span>
        </div>

        <div className="p-5 rounded-3xl bg-white border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Actively Hiring</span>
            <TrendingUp className="w-4 h-4 text-blue-600" />
          </div>
          <p className="text-2xl font-black text-slate-900 mt-2">
            {analytics?.actively_hiring ?? 0}
          </p>
          <span className="text-[11px] text-slate-500 font-medium">Verified Active Portals</span>
        </div>

        <div className="p-5 rounded-3xl bg-white border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Tracked Applications</span>
            <Briefcase className="w-4 h-4 text-indigo-600" />
          </div>
          <p className="text-2xl font-black text-slate-900 mt-2">
            {analytics?.student_applications ?? applications.length}
          </p>
          <span className="text-[11px] text-slate-500 font-medium">Student Engagement</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
        <button
          onClick={() => setActiveTab('startups')}
          className={`px-4 py-2 rounded-2xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'startups'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          Curated Startups ({filteredStartups.length})
        </button>
        <button
          onClick={() => setActiveTab('applications')}
          className={`px-4 py-2 rounded-2xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'applications'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          Student Applications Activity ({applications.length})
        </button>
        <button
          onClick={() => setActiveTab('outreach')}
          className={`px-4 py-2 rounded-2xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'outreach'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          Campus Outreach &amp; MoUs ({outreachRecords.length})
        </button>
      </div>

      {/* Tab 1: Startups Management */}
      {activeTab === 'startups' && (
        <div className="space-y-4">
          {/* Filter Bar */}
          <div className="p-4 rounded-3xl bg-white border border-slate-200 shadow-xs flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search startups by name, sector, or city..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <select
              value={selectedClassification}
              onChange={(e) => setSelectedClassification(e.target.value)}
              className="px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              <option value="all">All Classifications</option>
              <option value="STARTUP">Startup</option>
              <option value="PRODUCT_COMPANY">Product Company</option>
              <option value="ESTABLISHED_TECH">Established Tech</option>
              <option value="EMERGING_VENTURE">Emerging Venture</option>
            </select>

            <select
              value={selectedVerification}
              onChange={(e) => setSelectedVerification(e.target.value)}
              className="px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              <option value="all">All Verifications</option>
              <option value="GOVERNMENT_VERIFIED">Government Verified</option>
              <option value="OFFICIAL_WEBSITE_VERIFIED">Official Website</option>
              <option value="MCA_VERIFIED">MCA Verified</option>
              <option value="INCUBATOR_VERIFIED">Incubator Verified</option>
            </select>

            <select
              value={selectedSector}
              onChange={(e) => setSelectedSector(e.target.value)}
              className="px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              <option value="all">All Sectors</option>
              {availableSectors.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>

            <select
              value={selectedState}
              onChange={(e) => setSelectedState(e.target.value)}
              className="px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              <option value="all">All States</option>
              {availableStates.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          {/* Startups Table */}
          <div className="rounded-3xl bg-white border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                    <th className="py-3 px-4">Entity &amp; Classification</th>
                    <th className="py-3 px-4">Sector &amp; Stage</th>
                    <th className="py-3 px-4">HQ &amp; Coordinates</th>
                    <th className="py-3 px-4">Verification &amp; DPIIT</th>
                    <th className="py-3 px-4">Hiring Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {filteredStartups.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <img src={s.logo_url} alt={s.name} className="w-9 h-9 rounded-xl object-cover border border-slate-200 shrink-0" />
                          <div>
                            <p className="font-extrabold text-slate-900">{s.name}</p>
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-50 text-indigo-700">
                              {(s.company_classification || 'STARTUP').replace('_', ' ')}
                            </span>
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 text-[10px] font-bold block w-fit">
                          {s.sector}
                        </span>
                        <span className="text-[11px] text-slate-500 font-medium block mt-0.5">
                          {s.funding_stage} • {s.company_size}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-slate-700">
                        <div className="flex items-center gap-1 font-semibold">
                          <MapPin className="w-3.5 h-3.5 text-slate-400" />
                          {s.hq_city}, {s.hq_state}
                        </div>
                        <span className="text-[10px] text-slate-400">
                          {s.lat.toFixed(2)}, {s.lng.toFixed(2)}
                        </span>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="space-y-1">
                          <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold inline-flex items-center gap-1">
                            <ShieldCheck className="w-3 h-3 text-emerald-600" />
                            {(s.verification_status || 'VERIFIED').replace('_', ' ')}
                          </span>
                          {s.dpiit_recognized && (
                            <span className="block text-[10px] font-medium text-slate-500">
                              DPIIT: {s.dpiit_registration_number || 'Recognised'}
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        {s.open_jobs_count > 0 ? (
                          <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-bold">
                            {s.open_jobs_count} Open Roles
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-500">Portal Monitored</span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => {
                              setSelectedStartupForOutreach(s);
                              setAddOutreachModalOpen(true);
                            }}
                            className="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-bold transition-colors inline-flex items-center gap-1"
                          >
                            <PhoneCall className="w-3 h-3" />
                            <span>Outreach</span>
                          </button>
                          <a
                            href={s.careers_url || s.website}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold transition-colors inline-flex items-center gap-1"
                          >
                            Careers <ArrowUpRight className="w-3 h-3" />
                          </a>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Applications Oversight */}
      {activeTab === 'applications' && (
        <div className="rounded-3xl bg-white border border-slate-200 shadow-xs p-6 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h3 className="text-base font-black text-slate-900">Student Application Pipeline</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Students tracking direct applications to startups from the placement portal.
              </p>
            </div>
            <span className="px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-bold">
              {applications.length} Records
            </span>
          </div>

          {applications.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-[10px] uppercase font-bold text-slate-400 border-b border-slate-200">
                    <th className="py-3 px-4">Role Title</th>
                    <th className="py-3 px-4">Startup</th>
                    <th className="py-3 px-4">Location</th>
                    <th className="py-3 px-4">Application Date</th>
                    <th className="py-3 px-4">Current Stage</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {applications.map((app) => (
                    <tr key={app.id} className="hover:bg-slate-50/50">
                      <td className="py-3 px-4 font-bold text-slate-900">{app.job_title}</td>
                      <td className="py-3 px-4 text-slate-700 font-semibold">{app.company_name}</td>
                      <td className="py-3 px-4 text-slate-500">{app.location}</td>
                      <td className="py-3 px-4 text-slate-500">
                        {new Date(app.applied_at).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-4">
                        <span className="px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-bold">
                          {app.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <a
                          href={app.apply_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-600 hover:underline font-bold inline-flex items-center gap-1"
                        >
                          Portal Link <ArrowUpRight className="w-3 h-3" />
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="py-12 text-center text-slate-400">
              <Briefcase className="w-10 h-10 mx-auto mb-2 text-slate-300" />
              <p className="text-xs font-semibold">No student startup applications recorded yet.</p>
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Campus Outreach & MoUs */}
      {activeTab === 'outreach' && (
        <div className="rounded-3xl bg-white border border-slate-200 shadow-xs p-6 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h3 className="text-base font-black text-slate-900">University-to-Company Outreach Tracker</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Record corporate relations, campus recruitment MoUs, pooled drive invites, and corporate conversations.
              </p>
            </div>
            <span className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold">
              {outreachRecords.length} Active Engagements
            </span>
          </div>

          {outreachRecords.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-[10px] uppercase font-bold text-slate-400 border-b border-slate-200">
                    <th className="py-3 px-4">Company</th>
                    <th className="py-3 px-4">Contact Person</th>
                    <th className="py-3 px-4">Partnership Stage</th>
                    <th className="py-3 px-4">Expected Hires</th>
                    <th className="py-3 px-4">Notes</th>
                    <th className="py-3 px-4 text-right">Updated</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {outreachRecords.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50/50">
                      <td className="py-3 px-4 font-bold text-slate-900">{r.company_name}</td>
                      <td className="py-3 px-4">
                        <span className="font-semibold text-slate-800 block">{r.contact_person}</span>
                        <span className="text-slate-400 text-[10px]">{r.contact_email || r.contact_role}</span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-bold">
                          {r.partnership_stage}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-bold text-slate-800">
                        {r.expected_hires_count || 0}
                      </td>
                      <td className="py-3 px-4 text-slate-600 max-w-xs truncate">{r.notes}</td>
                      <td className="py-3 px-4 text-slate-400 text-right">
                        {new Date(r.updated_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="py-12 text-center text-slate-400">
              <PhoneCall className="w-10 h-10 mx-auto mb-2 text-slate-300" />
              <p className="text-xs font-semibold">No outreach records logged yet. Click "Outreach" on any startup to log a connection.</p>
            </div>
          )}
        </div>
      )}

      {/* Modal: Add Tech Company */}
      {addStartupModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-xl w-full p-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <h3 className="text-lg font-black text-slate-900">Register Tech Company</h3>
              <button onClick={() => setAddStartupModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateStartupSubmit} className="mt-4 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Company Name</label>
                  <input
                    type="text"
                    required
                    value={newCompany.name}
                    onChange={(e) => setNewCompany({ ...newCompany, name: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-600"
                    placeholder="e.g. Sarvam AI"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Legal Name</label>
                  <input
                    type="text"
                    value={newCompany.legal_name}
                    onChange={(e) => setNewCompany({ ...newCompany, legal_name: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-600"
                    placeholder="e.g. Sarvam AI Private Limited"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Description</label>
                <textarea
                  rows={2}
                  required
                  value={newCompany.description}
                  onChange={(e) => setNewCompany({ ...newCompany, description: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  placeholder="Overview of engineering focus..."
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Classification</label>
                  <select
                    value={newCompany.company_classification}
                    onChange={(e) => setNewCompany({ ...newCompany, company_classification: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  >
                    <option value="STARTUP">Startup (High-Growth)</option>
                    <option value="PRODUCT_COMPANY">Product Company</option>
                    <option value="ESTABLISHED_TECH">Established Tech</option>
                    <option value="EMERGING_VENTURE">Emerging Venture</option>
                  </select>
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Verification Status</label>
                  <select
                    value={newCompany.verification_status}
                    onChange={(e) => setNewCompany({ ...newCompany, verification_status: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  >
                    <option value="GOVERNMENT_VERIFIED">Government Verified</option>
                    <option value="OFFICIAL_WEBSITE_VERIFIED">Official Website</option>
                    <option value="MCA_VERIFIED">MCA Verified</option>
                    <option value="INCUBATOR_VERIFIED">Incubator Verified</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">HQ City</label>
                  <input
                    type="text"
                    required
                    value={newCompany.hq_city}
                    onChange={(e) => setNewCompany({ ...newCompany, hq_city: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">HQ State</label>
                  <input
                    type="text"
                    required
                    value={newCompany.hq_state}
                    onChange={(e) => setNewCompany({ ...newCompany, hq_state: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Website URL</label>
                  <input
                    type="url"
                    required
                    value={newCompany.website}
                    onChange={(e) => setNewCompany({ ...newCompany, website: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Careers URL</label>
                  <input
                    type="url"
                    required
                    value={newCompany.careers_url}
                    onChange={(e) => setNewCompany({ ...newCompany, careers_url: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Tech Stack (comma-separated)</label>
                <input
                  type="text"
                  value={newCompany.tech_stack}
                  onChange={(e) => setNewCompany({ ...newCompany, tech_stack: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div className="pt-3 flex justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setAddStartupModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 font-bold text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-700"
                >
                  Save &amp; Verify
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Add Outreach Record */}
      {addOutreachModalOpen && selectedStartupForOutreach && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-base font-black text-slate-900">Log Campus Outreach</h3>
                <p className="text-xs text-slate-500">{selectedStartupForOutreach.name}</p>
              </div>
              <button onClick={() => setAddOutreachModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateOutreachSubmit} className="mt-4 space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Contact Person</label>
                <input
                  type="text"
                  required
                  value={newOutreach.contact_person}
                  onChange={(e) => setNewOutreach({ ...newOutreach, contact_person: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  placeholder="e.g. Vikram Sharma"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Contact Email</label>
                <input
                  type="email"
                  value={newOutreach.contact_email}
                  onChange={(e) => setNewOutreach({ ...newOutreach, contact_email: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  placeholder="recruiter@company.com"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Partnership Stage</label>
                <select
                  value={newOutreach.partnership_stage}
                  onChange={(e) => setNewOutreach({ ...newOutreach, partnership_stage: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-600"
                >
                  <option value="EXPLORATORY">Exploratory Discussion</option>
                  <option value="DISCUSSING_MOU">Discussing MoU</option>
                  <option value="ACTIVE_RECRUITMENT">Active Recruitment Drive</option>
                  <option value="POOLED_DRIVE">Pooled Campus Drive</option>
                  <option value="DECLINED">Declined</option>
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Expected Hires</label>
                <input
                  type="number"
                  min="0"
                  value={newOutreach.expected_hires_count}
                  onChange={(e) => setNewOutreach({ ...newOutreach, expected_hires_count: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Engagement Notes</label>
                <textarea
                  rows={2}
                  value={newOutreach.notes}
                  onChange={(e) => setNewOutreach({ ...newOutreach, notes: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setAddOutreachModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 font-bold text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-emerald-600 text-white font-bold hover:bg-emerald-700"
                >
                  Log Engagement
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
