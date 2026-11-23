import React, { useEffect, useState } from 'react';
import { Shield, Clock, Globe, RefreshCw, KeyRound } from 'lucide-react';
import { adminService, type LoginAuditRow } from '../../../services/adminService';
import { Card } from '../../../components/common/Card';
import { Badge } from '../../../components/common/Badge';
import { Button } from '../../../components/common/Button';
import { ClayLoader } from '../../../components/common/ClayLoader';
import { formatRealDateTime } from '../../../utils/dateUtils';

export const LoginAuditPage: React.FC = () => {
  const [logins, setLogins] = useState<LoginAuditRow[]>([]);
  const [loading, setLoading] = useState(true);

  const loadLogins = async () => {
    setLoading(true);
    try {
      const data = await adminService.getLoginAudit();
      setLogins(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadLogins();
  }, []);

  if (loading) {
    return <ClayLoader label="Loading Authentication Telemetry..." subtext="Reading MongoDB user_logins collection" />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Authentication & Login Audit</h1>
          <p className="text-sm text-slate-500 mt-1">
            Dedicated <code className="text-xs bg-orange-50 px-1.5 py-0.5 rounded">user_logins</code> MongoDB Atlas collection tracking every student Google login and admin password session.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void loadLogins()}>
          <RefreshCw className="w-4 h-4 mr-1.5" />
          Refresh Audit
        </Button>
      </div>

      <Card>
        {logins.length === 0 ? (
          <div className="py-12 text-center text-slate-500 text-sm">
            No login events recorded in MongoDB yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-orange-100 text-xs font-semibold uppercase tracking-wider text-slate-400">
                  <th className="py-3 px-4">User</th>
                  <th className="py-3 px-4">Role</th>
                  <th className="py-3 px-4">Provider</th>
                  <th className="py-3 px-4">IP / Client</th>
                  <th className="py-3 px-4">Signed In</th>
                  <th className="py-3 px-4">Signed Out</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-orange-50 text-sm">
                {logins.map((row) => (
                  <tr key={row.id} className="hover:bg-orange-50/30 transition-colors">
                    <td className="py-3.5 px-4">
                      <p className="font-semibold text-slate-900">{row.display_name || 'User'}</p>
                      <p className="text-xs text-slate-500">{row.email}</p>
                    </td>
                    <td className="py-3.5 px-4">
                      <Badge variant={row.role === 'STUDENT' ? 'cyan' : 'warning'}>
                        <Shield className="w-3 h-3 mr-1 inline" />
                        {row.role}
                      </Badge>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 bg-slate-100 px-2.5 py-1 rounded-full">
                        <KeyRound className="w-3 h-3 text-[#FF7A59]" />
                        {row.auth_provider}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-xs text-slate-500">
                      <div className="flex items-center gap-1">
                        <Globe className="w-3.5 h-3.5 text-slate-400" />
                        <span>{row.ip_address || 'localhost'}</span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-xs text-slate-600">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-emerald-500" />
                        {row.logged_in_at ? formatRealDateTime(row.logged_in_at) : '—'}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-xs text-slate-500">
                      {row.logged_out_at ? formatRealDateTime(row.logged_out_at) : 'Active Session'}
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

