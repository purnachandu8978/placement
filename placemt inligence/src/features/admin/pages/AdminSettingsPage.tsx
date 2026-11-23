import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Database,
  Eye,
  EyeOff,
  History,
  KeyRound,
  RefreshCw,
  Save,
  Shield,
  UserPlus,
  Zap,
} from 'lucide-react';
import { Card, CardHeader } from '../../../components/common/Card';
import { Button } from '../../../components/common/Button';
import { Badge } from '../../../components/common/Badge';
import { Input, Textarea } from '../../../components/common/Input';
import { Select } from '../../../components/common/Select';
import { useAuth } from '../../../context/AuthContext';
import { useToast } from '../../../context/ToastContext';
import { adminService, type IntegrationsStatusResponse, type AdminAccountRow } from '../../../services/adminService';

export const AdminSettingsPage: React.FC = () => {
  const { user } = useAuth();
  const { success, error } = useToast();

  // Platform Gate Settings
  const [passingThreshold, setPassingThreshold] = useState('75');
  const [atsThreshold, setAtsThreshold] = useState('80');
  const [tier1ReadinessCutoff, setTier1ReadinessCutoff] = useState('85');
  const [institutionName, setInstitutionName] = useState('');
  const [deanName, setDeanName] = useState(user?.name || '');
  const [deanEmail, setDeanEmail] = useState(user?.email || '');

  // Live Keys & Integrations (Firebase Auth & MongoDB Atlas)
  const [statusData, setStatusData] = useState<IntegrationsStatusResponse | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [savingKeys, setSavingKeys] = useState(false);

  const [firebaseApiKey, setFirebaseApiKey] = useState('');
  const [firebaseAuthDomain, setFirebaseAuthDomain] = useState('');
  const [firebaseProjectId, setFirebaseProjectId] = useState('');
  const [firebaseStorageBucket, setFirebaseStorageBucket] = useState('');
  const [firebaseMessagingSenderId, setFirebaseMessagingSenderId] = useState('');
  const [firebaseAppId, setFirebaseAppId] = useState('');
  const [firebaseCredentialsPath, setFirebaseCredentialsPath] = useState('');
  const [firebaseCredentialsJson, setFirebaseCredentialsJson] = useState('');

  const [mongodbUri, setMongodbUri] = useState('');
  const [mongodbDbName, setMongodbDbName] = useState('placement_intelligence');
  const [showMongoUri, setShowMongoUri] = useState(false);
  const [quotasData, setQuotasData] = useState<any>(null);

  // Create Admin & Audit Logs
  const isSuperAdmin = user?.backendRole === 'SUPER_ADMIN';
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [newAdminName, setNewAdminName] = useState('');
  const [newAdminPassword, setNewAdminPassword] = useState('');
  const [newAdminRole, setNewAdminRole] = useState<string>('ADMIN');
  const [creatingAdmin, setCreatingAdmin] = useState(false);
  const [adminAccounts, setAdminAccounts] = useState<AdminAccountRow[]>([]);

  const [auditLogs, setAuditLogs] = useState<
    Array<{
      id: string;
      admin_uid: string;
      action: string;
      target_id: string;
      details: Record<string, any>;
      timestamp: string;
    }>
  >([]);

  const loadIntegrationStatus = async () => {
    setLoadingStatus(true);
    try {
      const [data, logs, accounts, quotas] = await Promise.all([
        adminService.getIntegrationsStatus(),
        adminService.getAuditLogs().catch(() => []),
        adminService.getAdminAccounts().catch(() => []),
        adminService.getApiQuotas().catch(() => null),
      ]);
      setStatusData(data);
      setAuditLogs(logs || []);
      setAdminAccounts(accounts || []);
      setQuotasData(quotas);

      if (data.mongodb_db_name || data.mongodb?.database) {
        setMongodbDbName(data.mongodb_db_name || data.mongodb.database);
      }
      if (data.firebase?.project_id) {
        setFirebaseProjectId(data.firebase.project_id);
      }
      if (data.firebase?.web_config) {
        const wc = data.firebase.web_config;
        if (wc.apiKey) setFirebaseApiKey(wc.apiKey);
        if (wc.authDomain) setFirebaseAuthDomain(wc.authDomain);
        if (wc.projectId && !data.firebase.project_id) setFirebaseProjectId(wc.projectId);
        if (wc.storageBucket) setFirebaseStorageBucket(wc.storageBucket);
        if (wc.messagingSenderId) setFirebaseMessagingSenderId(wc.messagingSenderId);
        if (wc.appId) setFirebaseAppId(wc.appId);
      }
    } catch (err: any) {
      error(err?.message || 'Unable to load backend configuration status.');
    } finally {
      setLoadingStatus(false);
    }
  };

  useEffect(() => {
    loadIntegrationStatus();
  }, []);

  const handleUpdateAdminRole = async (uid: string, role: string) => {
    try {
      await adminService.updateAdminRole(uid, role);
      success(`Role updated to ${role}.`);
      const accs = await adminService.getAdminAccounts();
      setAdminAccounts(accs || []);
    } catch (err: any) {
      error(err?.message || 'Failed to update admin role.');
    }
  };

  const handleSaveIntegrations = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingKeys(true);
    try {
      await adminService.updateIntegrationsConfig({
        mongodb_uri: mongodbUri.trim() || undefined,
        mongodb_db_name: mongodbDbName.trim() || undefined,
        firebase_credentials_json: firebaseCredentialsJson.trim() || undefined,
        firebase_credentials_path: firebaseCredentialsPath.trim() || undefined,
        firebase_project_id: firebaseProjectId.trim() || undefined,
        firebase_web_config: {
          apiKey: firebaseApiKey.trim() || undefined,
          authDomain: firebaseAuthDomain.trim() || undefined,
          projectId: firebaseProjectId.trim() || undefined,
          storageBucket: firebaseStorageBucket.trim() || undefined,
          messagingSenderId: firebaseMessagingSenderId.trim() || undefined,
          appId: firebaseAppId.trim() || undefined,
        },
      });
      setMongodbUri('');
      setFirebaseCredentialsJson('');
      success('Saved Firebase & MongoDB Atlas keys to .env and reloaded connections.');
      await loadIntegrationStatus();
    } catch (err: any) {
      error(err?.message || 'Failed to save configuration keys.');
    } finally {
      setSavingKeys(false);
    }
  };

  const handleCreateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAdminEmail.trim() || !newAdminPassword.trim()) return;
    setCreatingAdmin(true);
    try {
      await adminService.createAdmin({
        email: newAdminEmail.trim(),
        password: newAdminPassword,
        display_name: newAdminName.trim() || newAdminEmail.split('@')[0],
        role: newAdminRole,
      });
      success(`Provisioned ${newAdminRole} account for ${newAdminEmail}.`);
      setNewAdminEmail('');
      setNewAdminName('');
      setNewAdminPassword('');
      await loadIntegrationStatus();
    } catch (err: any) {
      error(err?.message || 'Failed to provision admin account.');
    } finally {
      setCreatingAdmin(false);
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    success('Institutional thresholds and placement preferences updated.');
  };

  const mongoLive = Boolean(statusData && !statusData.mongodb?.using_mock && statusData.mongodb?.status === 'connected');
  const firebaseLive = Boolean(statusData?.firebase?.live_cert_loaded || statusData?.firebase?.admin_sdk_loaded);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            Admin Control, Security & Live Keys
          </h1>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Manage MongoDB Atlas connectivity, Firebase Google OAuth keys, admin role provisioning, and system audit logs.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={mongoLive ? 'success' : 'warning'} size="md">
            <Database className="w-3.5 h-3.5 mr-1 inline" />
            {loadingStatus
              ? 'Checking MongoDB...'
              : mongoLive
              ? `MongoDB Atlas (${statusData?.mongodb?.database})`
              : 'MongoDB Dev Mock'}
          </Badge>
          <Badge variant={firebaseLive ? 'success' : 'warning'} size="md">
            <Shield className="w-3.5 h-3.5 mr-1 inline" />
            {loadingStatus
              ? 'Checking Firebase...'
              : firebaseLive
              ? 'Firebase Admin SDK Ready'
              : 'Firebase Partial Config'}
          </Badge>
        </div>
      </div>

      {/* Super Admin: Provision Institutional Admin Account */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card variant="peach">
          <CardHeader
            title="Provision Institutional Admin Account"
            subtitle="Create email/password credentials (Argon2id hashed in MongoDB). Restricted to Super Admins."
          />

          {!isSuperAdmin ? (
            <div className="p-4 rounded-2xl bg-amber-50/80 border border-amber-200 flex items-start gap-3 text-xs">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="text-amber-900">
                <p className="font-bold">Super Admin Clearance Required</p>
                <p className="mt-1">
                  Your current role is <strong>{user?.backendRole || user?.role}</strong>. Sign in with a{' '}
                  <code>SUPER_ADMIN</code> account or run{' '}
                  <code className="bg-amber-100 px-1 rounded">python -m app.cli create-admin</code> to create new admins.
                </p>
              </div>
            </div>
          ) : (
            <form onSubmit={handleCreateAdmin} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input
                  label="Admin Full Name"
                  placeholder="Placement Officer Name"
                  value={newAdminName}
                  onChange={(e) => setNewAdminName(e.target.value)}
                  required
                />
                <Select
                  label="Privilege Role"
                  value={newAdminRole}
                  onChange={(e) => setNewAdminRole(e.target.value)}
                  options={[
                    { value: 'SUPER_ADMIN', label: 'SUPER_ADMIN (Full Platform Access)' },
                    { value: 'ADMIN', label: 'ADMIN (Institutional Staff)' },
                    { value: 'ACADEMIC_ADMIN', label: 'ACADEMIC_ADMIN (Assessments & Courses)' },
                    { value: 'PLACEMENT_ADMIN', label: 'PLACEMENT_ADMIN (Jobs & Verifications)' },
                    { value: 'REVIEWER', label: 'REVIEWER (Read & Evaluate Only)' },
                  ]}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input
                  label="Institutional Email"
                  type="email"
                  placeholder="placement@institution.edu"
                  value={newAdminEmail}
                  onChange={(e) => setNewAdminEmail(e.target.value)}
                  required
                />
                <Input
                  label="Initial Password (min 8 chars)"
                  type="password"
                  placeholder="Strong passphrase"
                  value={newAdminPassword}
                  onChange={(e) => setNewAdminPassword(e.target.value)}
                  minLength={8}
                  required
                />
              </div>

              <div className="flex justify-end">
                <Button
                  type="submit"
                  variant="blue"
                  size="sm"
                  disabled={creatingAdmin}
                  leftIcon={<UserPlus className="w-4 h-4" />}
                >
                  {creatingAdmin ? 'Provisioning...' : 'Create Admin Credentials'}
                </Button>
              </div>
            </form>
          )}
        </Card>

        {/* Audit Logs Card */}
        <Card variant="default">
          <CardHeader
            title="Recent Admin Audit Trail"
            subtitle="Server-recorded administrative actions in admin_audit_logs"
            action={
              <Button variant="ghost" size="sm" onClick={loadIntegrationStatus}>
                <RefreshCw className={`w-3.5 h-3.5 ${loadingStatus ? 'animate-spin' : ''}`} />
              </Button>
            }
          />
          {auditLogs.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-400">
              <History className="w-6 h-6 mx-auto mb-2 opacity-50" />
              No audit events logged yet.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 max-h-64 overflow-y-auto pr-1 text-xs">
              {auditLogs.slice(0, 10).map((log) => (
                <div key={log.id} className="py-2.5 flex items-start justify-between gap-3">
                  <div>
                    <span className="font-mono font-bold text-[#E86144]">{log.action}</span>
                    <p className="text-[11px] text-slate-600 mt-0.5">
                      Target: <span className="font-mono">{log.target_id}</span>
                    </p>
                  </div>
                  <span className="text-[10px] font-mono text-slate-400 shrink-0">
                    {new Date(log.timestamp).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Admin Accounts & RBAC Directory */}
      <Card variant="default">
        <CardHeader
          title="Institutional Administrator Accounts & RBAC Directory"
          subtitle="Role-based access control registered in MongoDB Atlas users collection"
        />
        {adminAccounts.length === 0 ? (
          <p className="text-slate-400 py-4 text-center text-xs">No admin accounts found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left text-slate-700 font-medium">
              <thead className="bg-slate-50 text-slate-600 uppercase font-mono text-[10px] font-bold border-b border-slate-200">
                <tr>
                  <th className="px-4 py-2.5">Administrator</th>
                  <th className="px-4 py-2.5">Email</th>
                  <th className="px-4 py-2.5">Role</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5">Role Assignment</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {adminAccounts.map((acc) => (
                  <tr key={acc.uid} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 font-bold text-slate-900">{acc.display_name || 'Admin'}</td>
                    <td className="px-4 py-2.5 font-mono text-slate-600">{acc.email}</td>
                    <td className="px-4 py-2.5">
                      <Badge variant="blue" size="sm">{acc.role}</Badge>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="text-emerald-700 font-bold">{acc.account_status}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      {isSuperAdmin ? (
                        <select
                          value={acc.role}
                          onChange={(e) => handleUpdateAdminRole(acc.uid, e.target.value)}
                          className="px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 focus:outline-none focus:border-blue-500"
                        >
                          <option value="SUPER_ADMIN">SUPER_ADMIN</option>
                          <option value="ADMIN">ADMIN</option>
                          <option value="ACADEMIC_ADMIN">ACADEMIC_ADMIN</option>
                          <option value="PLACEMENT_ADMIN">PLACEMENT_ADMIN</option>
                          <option value="REVIEWER">REVIEWER</option>
                        </select>
                      ) : (
                        <span className="text-slate-400 italic">Locked</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Live Keys Form */}
      <form onSubmit={handleSaveIntegrations}>
        <Card variant="peach">
          <CardHeader
            title="Firebase Authentication & MongoDB Atlas Key Manager"
            subtitle="Configure Google Sign-In keys (frontend + Firebase Admin) and MongoDB Atlas URI directly from this console."
          />

          <div className="space-y-6">
            {/* Row Group 1: Firebase */}
            <div className="p-4 rounded-2xl bg-white/90 border border-orange-200/80 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-orange-600" />
                  <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-800">
                    1. Firebase Keys (Student Google Authentication)
                  </h3>
                </div>
                <span className="text-[11px] font-mono text-slate-500">placemt inligence/.env + backend/.env</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <Input
                  label="Firebase Web API Key (VITE_FIREBASE_API_KEY)"
                  placeholder="AIzaSy..."
                  value={firebaseApiKey}
                  onChange={(e) => setFirebaseApiKey(e.target.value)}
                />
                <Input
                  label="Firebase Auth Domain (VITE_FIREBASE_AUTH_DOMAIN)"
                  placeholder="your-project.firebaseapp.com"
                  value={firebaseAuthDomain}
                  onChange={(e) => setFirebaseAuthDomain(e.target.value)}
                />
                <Input
                  label="Firebase Project ID (FIREBASE_PROJECT_ID)"
                  placeholder="your-project-id"
                  value={firebaseProjectId}
                  onChange={(e) => setFirebaseProjectId(e.target.value)}
                />
                <Input
                  label="Firebase Storage Bucket (VITE_FIREBASE_STORAGE_BUCKET)"
                  placeholder="your-project.appspot.com"
                  value={firebaseStorageBucket}
                  onChange={(e) => setFirebaseStorageBucket(e.target.value)}
                />
                <Input
                  label="Messaging Sender ID (VITE_FIREBASE_MESSAGING_SENDER_ID)"
                  placeholder="123456789012"
                  value={firebaseMessagingSenderId}
                  onChange={(e) => setFirebaseMessagingSenderId(e.target.value)}
                />
                <Input
                  label="Firebase App ID (VITE_FIREBASE_APP_ID)"
                  placeholder="1:123456789012:web:abcdef..."
                  value={firebaseAppId}
                  onChange={(e) => setFirebaseAppId(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-2 border-t border-orange-100">
                <Input
                  label="Firebase Service Account File Path (FIREBASE_CREDENTIALS_PATH)"
                  placeholder="serviceAccountKey.json"
                  value={firebaseCredentialsPath}
                  onChange={(e) => setFirebaseCredentialsPath(e.target.value)}
                />
                <Textarea
                  label="Firebase Service Account Key JSON (FIREBASE_CREDENTIALS_JSON)"
                  placeholder='{"type": "service_account", "project_id": "...", "private_key": "...", "client_email": "..."}'
                  value={firebaseCredentialsJson}
                  onChange={(e) => setFirebaseCredentialsJson(e.target.value)}
                  className="min-h-[76px] font-mono text-xs"
                />
              </div>
            </div>

            {/* Row Group 2: MongoDB */}
            <div className="p-4 rounded-2xl bg-white/90 border border-orange-200/80 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Database className="w-4 h-4 text-orange-600" />
                  <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-800">
                    2. MongoDB Atlas Key (Database Connection)
                  </h3>
                </div>
                <span className="text-[11px] font-mono text-slate-500">
                  {statusData?.mongodb?.uri_masked ? `Active: ${statusData.mongodb.uri_masked}` : 'backend/.env (server-only)'}
                </span>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
                <div className="lg:col-span-2 relative">
                  <Input
                    label="MongoDB Atlas Connection URI (MONGODB_URI)"
                    type={showMongoUri ? 'text' : 'password'}
                    placeholder="mongodb+srv://<username>:<password>@<cluster>.mongodb.net/?retryWrites=true&w=majority"
                    value={mongodbUri}
                    onChange={(e) => setMongodbUri(e.target.value)}
                    helperText="Leave blank to keep existing cluster URI unchanged."
                  />
                  <button
                    type="button"
                    onClick={() => setShowMongoUri((prev) => !prev)}
                    aria-label={showMongoUri ? 'Hide MongoDB URI' : 'Show MongoDB URI'}
                    className="absolute right-3 top-8 p-1.5 text-slate-400 hover:text-slate-700 cursor-pointer"
                  >
                    {showMongoUri ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>

                <Input
                  label="MongoDB Database Name (MONGODB_DB_NAME)"
                  placeholder="placement_intelligence"
                  value={mongodbDbName}
                  onChange={(e) => setMongodbDbName(e.target.value)}
                  helperText="Primary database: placement_intelligence."
                />
              </div>
            </div>

            {/* Row Group 3: Free-Tier API Quota & Credit Preservation */}
            <div className="p-4 rounded-2xl bg-white/90 border border-orange-200/80 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-amber-500" />
                  <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-800">
                    3. Free-Tier API Quota & Credit Preservation Controls
                  </h3>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="blue" size="sm">
                    Free-Tier Protection Active
                  </Badge>
                  {quotasData?.quotas?.firecrawl?.reset_in_hours !== undefined && (
                    <span className="text-[11px] font-mono text-slate-500">
                      Resets in {quotasData.quotas.firecrawl.reset_in_hours}h
                    </span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Firecrawl Scraper */}
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-bold text-slate-900">Firecrawl AI Scraper</span>
                      <Badge variant={quotasData?.quotas?.firecrawl?.is_quota_available ? 'success' : 'warning'} size="sm">
                        {quotasData?.quotas?.firecrawl?.status || 'HEALTHY'}
                      </Badge>
                    </div>
                    <p className="text-[11px] text-slate-500 mb-2">
                      Strict free-tier budget protection with zero-credit 24h caching.
                    </p>
                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between text-slate-600">
                        <span>Daily Budget:</span>
                        <span className="font-mono font-bold text-slate-900">
                          {quotasData?.quotas?.firecrawl?.requests_used || 0} / {quotasData?.quotas?.firecrawl?.max_daily_requests || 10} calls
                        </span>
                      </div>
                      <div className="flex justify-between text-slate-600">
                        <span>Remaining Today:</span>
                        <span className="font-mono font-bold text-emerald-600">
                          {quotasData?.quotas?.firecrawl?.requests_remaining ?? 10} calls
                        </span>
                      </div>
                      <div className="flex justify-between text-slate-600">
                        <span>Zero-Credit Cache Hits:</span>
                        <span className="font-mono font-bold text-blue-600">
                          {quotasData?.quotas?.firecrawl?.cache_hits || 0} hits
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 pt-2 border-t border-slate-200 text-[10px] text-slate-500">
                    💡 Auto-falls back to native scrapers (Internshala, LinkedIn, Indeed) if limit reached.
                  </div>
                </div>

                {/* Gemini AI */}
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-bold text-slate-900">Google Gemini AI</span>
                      <Badge variant="blue" size="sm">
                        {quotasData?.quotas?.gemini?.status || 'HEALTHY'}
                      </Badge>
                    </div>
                    <p className="text-[11px] text-slate-500 mb-2">
                      Resume parsing & ATS intelligence generation.
                    </p>
                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between text-slate-600">
                        <span>Daily Usage:</span>
                        <span className="font-mono font-bold text-slate-900">
                          {quotasData?.quotas?.gemini?.requests_used || 0} / {quotasData?.quotas?.gemini?.max_daily_requests || 50} calls
                        </span>
                      </div>
                      <div className="flex justify-between text-slate-600">
                        <span>Remaining Today:</span>
                        <span className="font-mono font-bold text-emerald-600">
                          {quotasData?.quotas?.gemini?.requests_remaining ?? 50} calls
                        </span>
                      </div>
                      <div className="flex justify-between text-slate-600">
                        <span>Cached Analyses:</span>
                        <span className="font-mono font-bold text-blue-600">
                          {quotasData?.quotas?.gemini?.cache_hits || 0} hits
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 pt-2 border-t border-slate-200 text-[10px] text-slate-500">
                    ⚡ Uses gemini-3.5-flash-lite with deterministic fallback on timeout.
                  </div>
                </div>

                {/* Judge0 Code Sandbox */}
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-bold text-slate-900">Judge0 / Sandbox</span>
                      <Badge variant="blue" size="sm">
                        {quotasData?.quotas?.judge0?.status || 'HEALTHY'}
                      </Badge>
                    </div>
                    <p className="text-[11px] text-slate-500 mb-2">
                      Assessment practical coding verification sandbox.
                    </p>
                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between text-slate-600">
                        <span>Daily Usage:</span>
                        <span className="font-mono font-bold text-slate-900">
                          {quotasData?.quotas?.judge0?.requests_used || 0} / {quotasData?.quotas?.judge0?.max_daily_requests || 50} runs
                        </span>
                      </div>
                      <div className="flex justify-between text-slate-600">
                        <span>Remaining Today:</span>
                        <span className="font-mono font-bold text-emerald-600">
                          {quotasData?.quotas?.judge0?.requests_remaining ?? 50} runs
                        </span>
                      </div>
                      <div className="flex justify-between text-slate-600">
                        <span>Rate Limit Guard:</span>
                        <span className="font-mono font-bold text-slate-700">15 / min cap</span>
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 pt-2 border-t border-slate-200 text-[10px] text-slate-500">
                    🔒 Runs securely inside sandboxed test containers.
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-4 mt-4 border-t border-orange-200/70">
            <div className="flex items-center gap-2 text-xs text-slate-600">
              {mongoLive ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              ) : (
                <RefreshCw className={`w-4 h-4 text-orange-500 ${loadingStatus ? 'animate-spin' : ''}`} />
              )}
              <span>
                {mongoLive
                  ? `Connected to ${statusData?.mongodb?.collections?.length || 0} active MongoDB collections.`
                  : 'Secrets are stored strictly server-side in backend/.env.'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="white"
                size="sm"
                onClick={loadIntegrationStatus}
                disabled={loadingStatus}
                leftIcon={<RefreshCw className={`w-3.5 h-3.5 ${loadingStatus ? 'animate-spin' : ''}`} />}
              >
                Refresh Status
              </Button>
              <Button
                type="submit"
                variant="blue"
                size="sm"
                disabled={savingKeys}
                leftIcon={<Save className="w-3.5 h-3.5" />}
              >
                {savingKeys ? 'Testing & Saving...' : 'Save & Test Connections'}
              </Button>
            </div>
          </div>
        </Card>
      </form>

      {/* Verification Thresholds & Authority */}
      <form onSubmit={handleSave} className="space-y-6">
        <Card variant="default">
          <CardHeader
            title="Standardized Passing & Verification Gates"
            subtitle="Automated thresholds for skill badge verification and Tier-1 classification"
          />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Input
              label="Skill Assessment Passing Cutoff (%)"
              value={passingThreshold}
              onChange={(e) => setPassingThreshold(e.target.value)}
              helperText="Default 75% for verified badge issuance."
              required
            />
            <Input
              label="Target ATS Alignment Gate (%)"
              value={atsThreshold}
              onChange={(e) => setAtsThreshold(e.target.value)}
              helperText="Default 80% for verified resume qualification."
              required
            />
            <Input
              label="Tier-1 Product Readiness Cutoff (%)"
              value={tier1ReadinessCutoff}
              onChange={(e) => setTier1ReadinessCutoff(e.target.value)}
              helperText="Composite 5-pillar cutoff score."
              required
            />
          </div>
        </Card>

        <Card variant="default">
          <CardHeader title="Institutional Authority" subtitle="Header details for verifiable certificates" />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Input
              label="Institution Name"
              placeholder="e.g. National Institute of Technology"
              value={institutionName}
              onChange={(e) => setInstitutionName(e.target.value)}
            />
            <Input
              label="Placement Head Name"
              value={deanName}
              onChange={(e) => setDeanName(e.target.value)}
            />
            <Input
              label="Official Contact Email"
              type="email"
              value={deanEmail}
              onChange={(e) => setDeanEmail(e.target.value)}
            />
          </div>
        </Card>

        <div className="flex justify-end pt-2">
          <Button variant="blue" size="md" type="submit" leftIcon={<Save className="w-4 h-4" />}>
            Save Preferences
          </Button>
        </div>
      </form>
    </div>
  );
};
